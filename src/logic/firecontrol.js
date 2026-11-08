// The mech's fire-control computer: which target to take, where to aim at a moving one,
// how the trigger fires the cannon. Pure logic, no three.js.

export const FIRE_CONTROL = {
  autoTarget: false, // the computer designates targets by itself
  priority: 'threat', // threat | nearest | tank
  gunMode: 'auto', // single | burst | auto (trigger held = continuous)
  gunAim: 'manual', // manual | lead (show the lead mark) | auto (the barrel lays itself)
  missileProfile: 'auto', // direct | auto (top attack without sight) | top
  salvo: 1, // missiles per press
  burst: 3, // rounds in a burst
};

export const PRIORITIES = { threat: 'BEDROHUNG', nearest: 'NÄCHSTES', tank: 'PANZER' };
export const GUN_MODES = { single: 'EINZEL', burst: 'FEUERSTOSS', auto: 'DAUER' };
export const GUN_AIMS = { manual: 'AUS', lead: 'VORHALT', auto: 'AUTO' };
export const PROFILES = { direct: 'DIREKT', auto: 'AUTO', top: 'STEIL' };

/**
 * Best target for the computer. list: known vehicles with { id, type, dist, aiming,
 * visible, marked, stale }. Only what can be engaged: seen or marked, not a lost track.
 */
export function pickTarget(list, priority = 'threat') {
  const ok = list.filter((t) => !t.stale && (t.visible || t.marked) && t.type !== 'depot');
  const pool = ok.length ? ok : list.filter((t) => !t.stale && (t.visible || t.marked));
  if (!pool.length) return null;
  const score = (t) => {
    let s = t.dist;
    if (priority === 'threat') {
      if (t.aiming) s -= 5000; // whoever has a gun laid on us comes first
      if (t.type === 'tank') s -= 300; // the big gun matters more than the APC's
    } else if (priority === 'tank') {
      if (t.type === 'tank') s -= 5000;
    }
    return s;
  };
  return pool.reduce((a, b) => (score(b) < score(a) ? b : a));
}

/**
 * Where to aim so a round of speed v meets a target moving with (vx, vz): solve the
 * flight time iteratively (straight-flying rounds). Returns {x, y, z, t}.
 */
export function leadPoint(from, target, vel, speed) {
  let t = 0;
  let x = target.x;
  let y = target.y;
  let z = target.z;
  for (let i = 0; i < 4; i++) {
    t = Math.hypot(x - from.x, y - from.y, z - from.z) / speed;
    x = target.x + (vel.x || 0) * t;
    y = target.y + (vel.y || 0) * t;
    z = target.z + (vel.z || 0) * t;
  }
  return { x, y, z, t };
}

/**
 * Trigger logic for the cannon. st: { held, burstLeft } carried between frames.
 * Returns how many rounds the gun is allowed to want this frame (0 or 1); the gun's own
 * rate of fire still limits it, call shot() when one actually left.
 */
export function triggerWants(st, held, mode, burst = FIRE_CONTROL.burst) {
  const pressed = held && !st.held;
  st.held = held;
  if (pressed) st.burstLeft = mode === 'single' ? 1 : mode === 'burst' ? burst : 0;
  if (mode === 'auto') return held ? 1 : 0;
  return st.burstLeft > 0 ? 1 : 0;
}

export function triggerShot(st) {
  if (st.burstLeft > 0) st.burstLeft--;
}
