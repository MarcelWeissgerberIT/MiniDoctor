// Reconnaissance drone carried on the mech's back: launch, fly to a point, circle it while
// its sensor marks every vehicle it can see, come home on its own and recharge.
// Pure logic, no three.js. Heading 0 = -Z, positive = turning left.

export const DRONE = {
  speed: 26, // m/s cruise
  climb: 8, // m/s up or down
  alt: 70, // m above the ground while searching
  orbitR: 110, // m radius of the search circle
  orbitSpeed: 18, // m/s along the circle
  flight: 95, // s on a full battery
  recharge: 40, // s from empty to full on the dock
  minLaunch: 0.35, // battery needed to take off
  returnAt: 0.22, // battery level that sends it home
  sensor: 320, // m horizontal sensor reach from the drone
  markTime: 30, // s a mark stays after the drone last saw the vehicle
  maxRange: 1500, // m furthest goal from the mech
  escortR: 70, // m circle around the mech when escorting
  aheadDist: 380, // m in front of the mech when scouting ahead
  manualSpeed: 30, // m/s top speed under the pilot's hand
  turnRate: 1.2, // rad/s
  minAlt: 12,
  maxAlt: 160,
};

// what the drone does once it is up: circle a point, stay over the mech, scout ahead
// of it, or fly under the pilot's hand
export const DRONE_MODES = { orbit: 'KREISEN', escort: 'BEGLEITEN', ahead: 'VORAUS', manual: 'MANUELL' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createDrone() {
  return { state: 'docked', mode: 'orbit', x: 0, y: 0, z: 0, heading: 0, speed: 0, battery: 1, goal: null, orbitA: 0, t: 0, marks: 0 };
}

/** switch what the drone does; an airborne drone takes it up at once */
export function setDroneMode(d, mode) {
  if (!DRONE_MODES[mode]) return false;
  d.mode = mode;
  if (d.state === 'transit' || d.state === 'orbit' || d.state === 'manual') d.state = mode === 'manual' ? 'manual' : 'transit';
  return true;
}

export const airborne = (d) => d.state !== 'docked' && d.state !== 'lost';

/** take off towards a goal [x, z]; false when it cannot (no charge, already up, lost) */
export function launchDrone(d, goal, home) {
  if (d.state !== 'docked' || d.battery < DRONE.minLaunch) return false;
  const dx = goal[0] - home.x;
  const dz = goal[1] - home.z;
  const l = Math.hypot(dx, dz);
  const k = l > DRONE.maxRange ? DRONE.maxRange / l : 1;
  d.goal = [home.x + dx * k, home.z + dz * k];
  d.state = 'launch';
  d.t = 0;
  return true;
}

/** send an airborne drone to a new point */
export function retaskDrone(d, goal, home) {
  if (!airborne(d) || d.state === 'land') return false;
  const dx = goal[0] - home.x;
  const dz = goal[1] - home.z;
  const l = Math.hypot(dx, dz);
  const k = l > DRONE.maxRange ? DRONE.maxRange / l : 1;
  d.goal = [home.x + dx * k, home.z + dz * k];
  if (d.state === 'orbit' || d.state === 'return') d.state = 'transit';
  return true;
}

export function recallDrone(d) {
  if (d.state === 'manual') {
    d.state = 'return';
    return true;
  }
  if (!airborne(d) || d.state === 'land' || d.state === 'return') return false;
  d.state = 'return';
  return true;
}

/**
 * ctx: { home: {x, y, z} dock position on the mech, ground(x, z) -> height,
 *        heading: the mech's, control: { fwd, turn, climb } -1..1 in manual mode }
 * returns events: 'airborne', 'arrived', 'lowBattery', 'docked', 'crashed'
 */
export function stepDrone(d, dt, ctx) {
  const ev = [];
  const { home, ground } = ctx;
  // the moving goals: over the mech, or a stretch ahead of it
  if (d.mode === 'escort' && (d.state === 'transit' || d.state === 'orbit')) d.goal = [home.x, home.z];
  if (d.mode === 'ahead' && (d.state === 'transit' || d.state === 'orbit')) {
    const h = ctx.heading ?? 0;
    d.goal = [home.x - Math.sin(h) * DRONE.aheadDist, home.z - Math.cos(h) * DRONE.aheadDist];
  }
  const R = d.mode === 'escort' ? DRONE.escortR : DRONE.orbitR;
  if (d.state === 'docked') {
    d.x = home.x;
    d.y = home.y;
    d.z = home.z;
    d.battery = Math.min(1, d.battery + dt / DRONE.recharge);
    return ev;
  }
  if (d.state === 'lost') return ev;
  d.t += dt;
  d.battery = Math.max(0, d.battery - dt / DRONE.flight);
  if (d.battery <= 0) {
    d.state = 'lost';
    ev.push('crashed');
    return ev;
  }
  if (d.battery < DRONE.returnAt && (d.state === 'transit' || d.state === 'orbit' || d.state === 'manual')) {
    d.state = 'return';
    ev.push('lowBattery');
  }
  const toward = (tx, tz, speed) => {
    const dx = tx - d.x;
    const dz = tz - d.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.01) {
      const s = Math.min(l, speed * dt);
      d.x += (dx / l) * s;
      d.z += (dz / l) * s;
      d.heading = Math.atan2(-dx, -dz);
    }
    return l;
  };
  const climbTo = (ty) => {
    d.y += clamp(ty - d.y, -DRONE.climb * dt, DRONE.climb * dt);
  };
  const cruise = () => ground(d.x, d.z) + DRONE.alt;
  if (d.state === 'launch') {
    // straight up off the back, then away
    climbTo(home.y + 18);
    d.x = home.x;
    d.z = home.z;
    if (d.y >= home.y + 17.5) {
      d.state = d.mode === 'manual' ? 'manual' : 'transit';
      d.goal ??= [home.x, home.z];
      ev.push('airborne');
    }
  } else if (d.state === 'manual') {
    // under the pilot's hand: speed, turn and climb, kept between the floor and the ceiling
    const c = ctx.control || {};
    d.heading += (c.turn || 0) * DRONE.turnRate * dt;
    const want = (c.fwd || 0) * DRONE.manualSpeed;
    d.speed += Math.max(-12 * dt, Math.min(12 * dt, want - d.speed));
    d.x -= Math.sin(d.heading) * d.speed * dt;
    d.z -= Math.cos(d.heading) * d.speed * dt;
    const g = ground(d.x, d.z);
    d.y = clamp(d.y + (c.climb || 0) * DRONE.climb * 1.5 * dt, g + DRONE.minAlt, g + DRONE.maxAlt);
    // it will not fly out of radio range
    const far = Math.hypot(d.x - home.x, d.z - home.z);
    if (far > DRONE.maxRange) {
      d.x = home.x + ((d.x - home.x) / far) * DRONE.maxRange;
      d.z = home.z + ((d.z - home.z) / far) * DRONE.maxRange;
    }
  } else if (d.state === 'transit') {
    const l = toward(d.goal[0], d.goal[1], DRONE.speed);
    climbTo(cruise());
    if (l < R) {
      d.state = 'orbit';
      d.orbitA = Math.atan2(d.z - d.goal[1], d.x - d.goal[0]);
      ev.push('arrived');
    }
  } else if (d.state === 'orbit') {
    d.orbitA += (DRONE.orbitSpeed / R) * dt;
    const tx = d.goal[0] + Math.cos(d.orbitA) * R;
    const tz = d.goal[1] + Math.sin(d.orbitA) * R;
    // a moving circle (escort, ahead) needs more speed to keep up
    toward(tx, tz, DRONE.speed * (d.mode === 'orbit' ? 1 : 1.4));
    if (Math.hypot(d.x - tx, d.z - tz) > R * 1.5) d.state = 'transit';
    climbTo(cruise());
  } else if (d.state === 'return') {
    const l = toward(home.x, home.z, DRONE.speed * 1.1);
    // stay high until close, then come down onto the back
    climbTo(l > 70 ? cruise() : home.y + 6 + l * 0.4);
    if (l < 3 && d.y < home.y + 9) d.state = 'land';
  } else if (d.state === 'land') {
    toward(home.x, home.z, 8);
    climbTo(home.y);
    if (Math.abs(d.y - home.y) < 0.15 && Math.hypot(d.x - home.x, d.z - home.z) < 0.5) {
      d.state = 'docked';
      d.goal = null;
      ev.push('docked');
    }
  }
  return ev;
}

/** what the drone's sensor sees: horizontal reach plus a clear line (checked by the caller) */
export function inSensor(d, x, z) {
  return airborne(d) && d.state !== 'launch' && Math.hypot(x - d.x, z - d.z) < DRONE.sensor;
}
