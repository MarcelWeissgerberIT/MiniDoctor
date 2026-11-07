// Pure walking/driving logic of the mech. No three.js in here so it can be unit tested.
//
// Units: metres, seconds, radians. Heading 0 looks along -Z, positive heading turns left
// (counter-clockwise seen from above), like a three.js rotation around +Y.

export const MECH = {
  eyeHeight: 10.5, // pilot eye above the ground
  maxForward: 15, // m/s  (54 km/h)
  maxReverse: 4.5, // m/s
  accel: 2.6, // m/s^2  (a 70 t machine does not sprint off)
  brake: 4.0, // m/s^2
  throttleRate: 0.55, // throttle units per second while W/S is held
  minThrottle: -0.3,
  turnRate: 0.42, // rad/s at standstill
  turnRateMoving: 0.3, // rad/s at full speed
  stepLength: 4.2, // metres per footstep
  radius: 3.2, // collision radius of the feet/legs
};

export function createMechState(x = 0, z = 0, heading = 0) {
  return {
    x,
    z,
    heading,
    throttle: 0,
    speed: 0,
    turn: 0, // current angular velocity (rad/s)
    stepPhase: 0, // 0..1 within the current step
    steps: 0, // total footsteps taken
    foot: 1, // +1 right foot, -1 left foot (the foot that lands next)
    odometer: 0,
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function approach(v, target, rate) {
  if (v < target) return Math.min(target, v + rate);
  return Math.max(target, v - rate);
}

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Advances the mech by dt.
 * input: { throttle: -1|0|1, turn: -1..1 (positive = left), stop: bool }
 * colliders: [{ x, z, r }]
 * Returns the list of footstep events of this tick: [{ foot, strength }]
 */
export function stepMech(s, input, dt, colliders = [], bounds = 900) {
  const events = [];
  if (input.stop) s.throttle = 0;
  s.throttle = clamp(s.throttle + (input.throttle || 0) * MECH.throttleRate * dt, MECH.minThrottle, 1);
  // a little dead zone around zero so the lever can be parked
  if (!input.throttle && Math.abs(s.throttle) < 0.03) s.throttle = 0;

  const target = s.throttle >= 0 ? s.throttle * MECH.maxForward : (s.throttle / -MECH.minThrottle) * MECH.maxReverse;
  const braking = Math.sign(target) !== Math.sign(s.speed) || Math.abs(target) < Math.abs(s.speed);
  s.speed = approach(s.speed, target, (braking ? MECH.brake : MECH.accel) * dt);

  const speedFrac = Math.min(1, Math.abs(s.speed) / MECH.maxForward);
  const maxTurn = MECH.turnRate + (MECH.turnRateMoving - MECH.turnRate) * speedFrac;
  s.turn = approach(s.turn, clamp(input.turn || 0, -1, 1) * maxTurn, 1.6 * dt);
  s.heading = wrapAngle(s.heading + s.turn * dt);

  // forward is -Z rotated by heading
  const fx = -Math.sin(s.heading);
  const fz = -Math.cos(s.heading);
  const dist = s.speed * dt;
  let nx = s.x + fx * dist;
  let nz = s.z + fz * dist;

  // push out of colliders
  for (const c of colliders) {
    const dx = nx - c.x;
    const dz = nz - c.z;
    const min = c.r + MECH.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 0.0001;
      nx = c.x + (dx / d) * min;
      nz = c.z + (dz / d) * min;
      s.speed *= 0.6;
    }
  }
  const r = Math.hypot(nx, nz);
  if (r > bounds) {
    nx *= bounds / r;
    nz *= bounds / r;
  }
  s.odometer += Math.hypot(nx - s.x, nz - s.z);
  s.x = nx;
  s.z = nz;

  // legs keep walking while turning on the spot
  const stride = Math.abs(dist) + Math.abs(s.turn) * dt * 2.2;
  if (stride > 0) {
    s.stepPhase += stride / MECH.stepLength;
    while (s.stepPhase >= 1) {
      s.stepPhase -= 1;
      s.steps++;
      events.push({ foot: s.foot, strength: clamp(0.35 + speedFrac * 0.65, 0, 1) });
      s.foot = -s.foot;
    }
  } else {
    // settle the legs when standing
    s.stepPhase = approach(s.stepPhase, 0, dt * 0.5);
  }
  return events;
}

/** Vertical body motion of the walk cycle: highest mid-stride, drops at foot impact. */
export function walkBob(s) {
  const moving = Math.min(1, (Math.abs(s.speed) + Math.abs(s.turn) * 4) / 3);
  const lift = Math.sin(Math.PI * s.stepPhase);
  const sway = s.foot * Math.sin(Math.PI * s.stepPhase); // lean towards the stance leg
  return { y: lift * 0.32 * moving, x: sway * 0.16 * moving, roll: -sway * 0.012 * moving, pitch: lift * 0.006 * moving };
}

export const kmh = (ms) => ms * 3.6;
