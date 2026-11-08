// Allied mechs (the player's lance): orders, formation, movement and gunnery.
// Pure logic, no three.js. Heading 0 = -Z, positive = turning left.

export const WINGMAN = {
  hp: 160,
  maxSpeed: 8.5,
  accel: 2.6,
  turnRate: 0.75,
  range: 560, // opens fire inside this distance
  burst: 5,
  burstGap: 0.2,
  reload: [2.2, 3.6],
  missileReload: [12, 18],
  damage: 6, // per autocannon round that hits
  missileDamage: 45,
  holdRadius: 6,
};

export const ORDERS = { follow: 'FOLGEN', hold: 'HALTEN', attack: 'ANGRIFF' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createWingman(name, x, z, heading, slot) {
  return {
    name,
    x,
    z,
    heading,
    speed: 0,
    turn: 0,
    slot, // [right, back] offset in the leader's frame, metres
    order: 'follow',
    hold: [x, z],
    hp: WINGMAN.hp,
    dead: false,
    target: null, // enemy id
    reload: 1 + Math.random() * 2,
    burstLeft: 0,
    missileT: 6 + Math.random() * 6,
  };
}

/** world position of a formation slot behind/next to the leader */
export function formationPoint(leader, slot) {
  const fx = -Math.sin(leader.heading);
  const fz = -Math.cos(leader.heading);
  // right vector of a heading: (cos h, 0, -sin h)
  const rx = Math.cos(leader.heading);
  const rz = -Math.sin(leader.heading);
  return [leader.x + rx * slot[0] - fx * slot[1], leader.z + rz * slot[0] - fz * slot[1]];
}

export function setOrder(w, order, leader, targetId = null) {
  if (w.dead) return;
  w.order = order;
  if (order === 'hold') w.hold = [w.x, w.z];
  if (order === 'attack') w.target = targetId;
}

/**
 * ctx: { leader: {x, z, heading, speed}, enemies: [{id, x, z, dead}], colliders, rand }
 * returns events: [{ kind: 'shot' | 'missile', target: id }]
 */
export function stepWingman(w, dt, ctx) {
  const ev = [];
  if (w.dead) return ev;
  const rand = ctx.rand || Math.random;
  const alive = ctx.enemies.filter((e) => !e.dead);
  // target: the ordered one, otherwise the nearest within range
  let tgt = w.order === 'attack' ? alive.find((e) => e.id === w.target) : null;
  if (w.order === 'attack' && !tgt) w.order = 'follow';
  if (!tgt) {
    let bd = WINGMAN.range;
    for (const e of alive) {
      const d = Math.hypot(e.x - w.x, e.z - w.z);
      if (d < bd) {
        bd = d;
        tgt = e;
      }
    }
    w.target = tgt ? tgt.id : null;
  }
  const tdist = tgt ? Math.hypot(tgt.x - w.x, tgt.z - w.z) : Infinity;

  // where to go
  let goal;
  if (w.order === 'hold') goal = w.hold;
  else if (w.order === 'attack' && tgt && tdist > 380) {
    // close in to a firing position
    const k = (tdist - 360) / tdist;
    goal = [w.x + (tgt.x - w.x) * k, w.z + (tgt.z - w.z) * k];
  } else if (w.order === 'attack') goal = [w.x, w.z];
  else goal = formationPoint(ctx.leader, w.slot);
  const gdx = goal[0] - w.x;
  const gdz = goal[1] - w.z;
  const gd = Math.hypot(gdx, gdz);

  // steering: walk towards the goal; standing still, turn to face the target
  let desired = w.heading;
  let want = 0;
  if (gd > WINGMAN.holdRadius) {
    desired = Math.atan2(-gdx, -gdz);
    want = clamp(gd * 0.35, 1.5, WINGMAN.maxSpeed);
    if (w.order === 'follow' && gd < 20) want = clamp(Math.abs(ctx.leader.speed) + gd * 0.2, 0, WINGMAN.maxSpeed);
  } else if (tgt) desired = Math.atan2(-(tgt.x - w.x), -(tgt.z - w.z));
  else if (w.order === 'follow') desired = ctx.leader.heading;
  for (const c of ctx.colliders || []) {
    const dx = c.x - w.x;
    const dz = c.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d > c.r + 9 || want < 0.5) continue;
    const ahead = -Math.sin(w.heading) * dx + -Math.cos(w.heading) * dz;
    if (ahead <= 0) continue;
    const side = Math.cos(w.heading) * dx - Math.sin(w.heading) * dz;
    desired += side > 0 ? 0.9 : -0.9;
  }
  const dh = clamp(wrap(desired - w.heading), -WINGMAN.turnRate * dt, WINGMAN.turnRate * dt);
  w.heading = wrap(w.heading + dh);
  w.turn = dh / Math.max(dt, 1e-6) / WINGMAN.turnRate;
  // slow down while turning hard
  const aligned = Math.cos(wrap(desired - w.heading));
  const target = want * Math.max(0, aligned);
  w.speed += clamp(target - w.speed, -WINGMAN.accel * 1.6 * dt, WINGMAN.accel * dt);
  w.x += -Math.sin(w.heading) * w.speed * dt;
  w.z += -Math.cos(w.heading) * w.speed * dt;

  // gunnery: the arm cannon traverses about 70 deg either side
  w.reload -= dt;
  w.missileT -= dt;
  if (tgt && tdist < WINGMAN.range) {
    const off = Math.abs(wrap(Math.atan2(-(tgt.x - w.x), -(tgt.z - w.z)) - w.heading));
    if (off < 1.2) {
      if (w.burstLeft > 0 && w.reload <= 0) {
        w.burstLeft--;
        w.reload = w.burstLeft > 0 ? WINGMAN.burstGap : WINGMAN.reload[0] + rand() * (WINGMAN.reload[1] - WINGMAN.reload[0]);
        ev.push({ kind: 'shot', target: tgt.id, dist: tdist });
      } else if (w.burstLeft === 0 && w.reload <= 0) w.burstLeft = WINGMAN.burst;
      if (w.missileT <= 0) {
        w.missileT = WINGMAN.missileReload[0] + rand() * (WINGMAN.missileReload[1] - WINGMAN.missileReload[0]);
        ev.push({ kind: 'missile', target: tgt.id, dist: tdist });
      }
    }
  }
  return ev;
}

/** chance a wingman's round hits a vehicle at this range */
export function wingmanHitChance(dist) {
  return clamp(0.78 - dist / 1500, 0.2, 0.72);
}

/** returns true when this hit destroyed the wingman */
export function damageWingman(w, dmg) {
  if (w.dead) return false;
  w.hp = Math.max(0, w.hp - dmg);
  if (w.hp === 0) {
    w.dead = true;
    w.speed = 0;
    return true;
  }
  return false;
}
