// Weapons, damage and enemy behaviour of BattleBot. Pure logic (no three.js) so
// it can be unit tested. Units: metres, seconds, radians; heading 0 = -Z.

export const GUN = {
  rpm: 300, // 30 mm autocannon, 5 rounds/s
  ammo: 240,
  speed: 1100, // m/s muzzle velocity
  heatPerShot: 0.06,
  cool: 0.16, // heat units per second
  resume: 0.35, // overheated gun is usable again below this
  damage: 12,
  yawLimit: (70 * Math.PI) / 180, // slaved to the pilot's helmet within these limits
  pitchUp: (30 * Math.PI) / 180,
  pitchDown: (25 * Math.PI) / 180,
  spread: 0.0018, // rad dispersion
};

// coaxial 7.62 mm machine gun on the cannon housing: fast, light, for soft targets
export const MG = {
  rpm: 900,
  ammo: 1500,
  speed: 850,
  damage: 1.6,
  spread: 0.0045,
  tracerEvery: 3, // every third round glows
};

export const MISSILE = {
  count: 12,
  lockTime: 1.2,
  lockCone: (3.5 * Math.PI) / 180,
  lockRange: 1600,
  reload: 1.0, // s between launches
  damage: 70,
  splash: 22,
  splashRadius: 9,
  speed0: 60,
  speedMax: 280,
  accel: 260,
  turn: 1.8, // rad/s
  life: 9,
};

export const ENEMY_TYPES = {
  tank: { hp: 100, speed: 7, engage: 560, reload: [6, 9], shellSpeed: 900, damage: [10, 17], burst: 1, radius: 3.4, height: 2.6 },
  // static supply depot targets (fuel, generators, ammunition)
  depot: { hp: 70, speed: 0, engage: 0, reload: [1e9, 1e9], shellSpeed: 0, damage: [0, 0], burst: 0, radius: 2.6, height: 2.2, static: true },
  apc: { hp: 60, speed: 9, engage: 420, reload: [4, 6], shellSpeed: 1000, damage: [3, 6], burst: 3, radius: 3.0, height: 2.4 },
};

export const PARTS = ['head', 'torso', 'larm', 'rarm', 'lleg', 'rleg'];
export const PART_NAMES = { head: 'HEAD', torso: 'TORSO', larm: 'L.ARM', rarm: 'R.ARM', lleg: 'L.LEG', rleg: 'R.LEG' };

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------------------------------------------------------------- weapons */

export function createWeapons() {
  return {
    gun: { ammo: GUN.ammo, heat: 0, overheated: false, cooldown: 0, shots: 0, hits: 0 },
    mg: { ammo: MG.ammo, cooldown: 0, shots: 0, hits: 0 },
    missiles: { count: MISSILE.count, cooldown: 0, lockT: 0, target: null, locked: false, fired: 0, hits: 0 },
  };
}

/** sw: switch snapshot; returns which weapons are live */
export function weaponState(sw, mainBus) {
  const master = !!(sw.wpnArm && mainBus);
  return { master, gun: master && !!sw.gun, missile: master && !!sw.missile, mg: master && !!sw.mg };
}

export function stepWeapons(w, dt) {
  const g = w.gun;
  g.heat = Math.max(0, g.heat - GUN.cool * dt);
  if (g.overheated && g.heat < GUN.resume) g.overheated = false;
  g.cooldown = Math.max(0, g.cooldown - dt);
  if (w.mg) w.mg.cooldown = Math.max(0, w.mg.cooldown - dt);
  w.missiles.cooldown = Math.max(0, w.missiles.cooldown - dt);
}

/** is a look direction (relative to the torso) inside the gun's traverse? */
export function gunInLimits(relYaw, pitch) {
  return Math.abs(wrap(relYaw)) <= GUN.yawLimit && pitch <= GUN.pitchUp && pitch >= -GUN.pitchDown;
}

/** tries to fire one round; returns true when a round leaves the barrel */
export function fireGun(w, live) {
  const g = w.gun;
  if (!live || g.overheated || g.cooldown > 0 || g.ammo <= 0) return false;
  g.ammo--;
  g.shots++;
  g.cooldown = 60 / GUN.rpm;
  g.heat += GUN.heatPerShot;
  if (g.heat >= 1) {
    g.heat = 1;
    g.overheated = true;
  }
  return true;
}

/** one MG round; returns true when it fires (every MG.tracerEvery-th is a tracer) */
export function fireMG(w, live) {
  const m = w.mg;
  if (!live || m.cooldown > 0 || m.ammo <= 0) return false;
  m.ammo--;
  m.shots++;
  m.cooldown = 60 / MG.rpm;
  return true;
}

/**
 * Lock-on: keep a target close to the boresight for MISSILE.lockTime.
 * candidates: [{ id, angle (rad off boresight), dist }]
 */
export function stepLock(w, candidates, dt, live) {
  const m = w.missiles;
  if (!live || m.count <= 0) {
    m.lockT = 0;
    m.target = null;
    m.locked = false;
    return;
  }
  let best = null;
  for (const c of candidates) {
    if (c.dist > MISSILE.lockRange || c.angle > MISSILE.lockCone) continue;
    if (!best || c.angle < best.angle) best = c;
  }
  if (!best) {
    m.lockT = Math.max(0, m.lockT - dt * 2);
    if (m.lockT === 0) m.target = null;
    m.locked = false;
    return;
  }
  if (m.target !== best.id) {
    m.target = best.id;
    m.lockT = 0;
  }
  m.lockT = Math.min(MISSILE.lockTime, m.lockT + dt);
  m.locked = m.lockT >= MISSILE.lockTime;
}

export function fireMissile(w, live) {
  const m = w.missiles;
  if (!live || m.count <= 0 || m.cooldown > 0) return null;
  m.count--;
  m.fired++;
  m.cooldown = MISSILE.reload;
  return { target: m.locked ? m.target : null };
}

/** steer a velocity direction towards a target with a limited turn rate (2D+height) */
export function steer(dir, toTarget, maxTurn) {
  // dir, toTarget: [x,y,z] unit vectors; rotate dir towards toTarget by at most maxTurn
  const dot = clamp(dir[0] * toTarget[0] + dir[1] * toTarget[1] + dir[2] * toTarget[2], -1, 1);
  const ang = Math.acos(dot);
  if (ang <= maxTurn || ang < 1e-6) return [...toTarget];
  // spherical interpolation by exactly maxTurn
  const s = Math.sin(ang);
  const a = Math.sin(ang - maxTurn) / s;
  const b = Math.sin(maxTurn) / s;
  return [dir[0] * a + toTarget[0] * b, dir[1] * a + toTarget[1] * b, dir[2] * a + toTarget[2] * b];
}

/** does the segment p0->p1 pass within r of centre c? returns the fraction along it or -1 */
export function segmentHitsSphere(p0, p1, c, r) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const f = [p0[0] - c[0], p0[1] - c[1], p0[2] - c[2]];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (a < 1e-12) return Math.hypot(...f) <= r ? 0 : -1;
  const b = 2 * (f[0] * d[0] + f[1] * d[1] + f[2] * d[2]);
  const cc = f[0] * f[0] + f[1] * f[1] + f[2] * f[2] - r * r;
  if (cc <= 0) return 0;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/* ----------------------------------------------------------------- damage */

export function createParts() {
  const p = {};
  for (const k of PARTS) p[k] = 1;
  return p;
}

/** a shell hits the mech: pick a part and take damage (rand: () => 0..1) */
export function applyHit(parts, damage, rand = Math.random) {
  const r = rand();
  const part = r < 0.1 ? 'head' : r < 0.5 ? 'torso' : r < 0.6 ? 'larm' : r < 0.7 ? 'rarm' : r < 0.85 ? 'lleg' : 'rleg';
  parts[part] = Math.max(0, parts[part] - damage / 100);
  return part;
}

export function mechDestroyed(parts) {
  return parts.torso <= 0 || parts.head <= 0;
}

/** chance an enemy shell hits: worse at range and against a moving target */
export function hitChance(dist, targetSpeed) {
  const base = clamp(0.78 - dist / 1300, 0.12, 0.72);
  return base * (1 - Math.min(0.6, Math.abs(targetSpeed) / 12));
}

/* ----------------------------------------------------------------- enemies */

let nextId = 1;
export function createEnemy(type, x, z, heading, goal) {
  const t = ENEMY_TYPES[type];
  return {
    id: nextId++,
    type,
    x,
    z,
    heading,
    goal, // [x, z] rally point
    hp: t.hp,
    state: 'advance', // advance | engage | dead
    reload: t.reload[0] + Math.random() * (t.reload[1] - t.reload[0]),
    burstLeft: 0,
    speed: 0,
  };
}

/**
 * ctx: { player: {x, z, speed}, colliders: [{x,z,r}], rand }
 * returns events: [{ kind: 'fire', id }]
 */
export function stepEnemy(e, dt, ctx) {
  const ev = [];
  if (e.state === 'dead' || !ctx.player) return ev;
  const T = ENEMY_TYPES[e.type];
  if (T.static) return ev;
  const engage = e.engage ?? T.engage;
  const px = ctx.player.x;
  const pz = ctx.player.z;
  const dist = Math.hypot(px - e.x, pz - e.z);
  if (e.state === 'advance' && dist <= engage) e.state = 'engage';
  if (e.state === 'engage' && dist > engage * 1.35) e.state = 'advance';

  // where to drive: the rally point while advancing, slowly closing in while engaging
  let tx = e.goal[0];
  let tz = e.goal[1];
  let want = T.speed;
  if (e.state === 'engage') {
    tx = px;
    tz = pz;
    want = dist > engage * 0.7 ? T.speed * 0.35 : 0;
  } else if (Math.hypot(tx - e.x, tz - e.z) < 15) {
    tx = px;
    tz = pz;
  }
  // no line of sight to the target: drive round the obstacle to a new firing position
  if (e.state === 'engage' && e.noLos) {
    want = T.speed * 0.6;
    e.flank ??= Math.random() < 0.5 ? -0.7 : 0.7;
  }
  let desired = Math.atan2(-(tx - e.x), -(tz - e.z)) + (e.state === 'engage' && e.noLos ? e.flank : 0);
  // keep clear of obstacles ahead
  for (const c of ctx.colliders || []) {
    const dx = c.x - e.x;
    const dz = c.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > c.r + 16) continue;
    const ahead = -Math.sin(e.heading) * dx + -Math.cos(e.heading) * dz;
    if (ahead <= 0) continue;
    const side = Math.cos(e.heading) * dx - Math.sin(e.heading) * dz; // + = obstacle on the right
    desired += side > 0 ? 0.8 : -0.8;
  }
  const turn = clamp(wrap(desired - e.heading), -0.5 * dt, 0.5 * dt);
  e.heading = wrap(e.heading + turn);
  e.speed += clamp(want - e.speed, -3 * dt, 2 * dt);
  e.x += -Math.sin(e.heading) * e.speed * dt;
  e.z += -Math.cos(e.heading) * e.speed * dt;

  // gunnery
  if (e.state === 'engage') {
    e.reload -= dt;
    const facing = Math.abs(wrap(Math.atan2(-(px - e.x), -(pz - e.z)) - e.heading)) < 0.35;
    if (e.reload <= 0 && facing) {
      ev.push({ kind: 'fire', id: e.id, dist });
      e.burstLeft = T.burst - 1;
      e.reload = e.burstLeft > 0 ? 0.25 : T.reload[0] + (ctx.rand || Math.random)() * (T.reload[1] - T.reload[0]);
    } else if (e.burstLeft > 0 && e.reload <= 0) {
      e.burstLeft--;
      ev.push({ kind: 'fire', id: e.id, dist });
      e.reload = e.burstLeft > 0 ? 0.25 : T.reload[0] + (ctx.rand || Math.random)() * (T.reload[1] - T.reload[0]);
    }
  }
  return ev;
}

export function damageEnemy(e, dmg) {
  if (e.state === 'dead') return false;
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.hp = 0;
    e.state = 'dead';
    e.speed = 0;
    return true;
  }
  return false;
}

/**
 * Which of our mechs an enemy vehicle shoots at: the nearest one (the player counts a
 * little closer, it is the obvious threat), kept for a while so the gunner does not
 * swap targets every frame. targets: [{ x, z, dead, isPlayer }]
 */
export function chooseTarget(e, targets, dt, rand = Math.random) {
  e.retarget = (e.retarget ?? 0) - dt;
  if (e.target && !e.target.dead && e.retarget > 0) return e.target;
  let best = null;
  let bd = Infinity;
  for (const t of targets) {
    if (t.dead) continue;
    const d = Math.hypot(t.x - e.x, t.z - e.z) * (t.isPlayer ? 0.85 : 1);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  e.target = best;
  e.retarget = 8 + rand() * 6;
  return best;
}
