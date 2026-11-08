import { describe, it, expect } from 'vitest';
import {
  GUN,
  MISSILE,
  createWeapons,
  weaponState,
  stepWeapons,
  fireGun,
  fireMG,
  MG,
  gunInLimits,
  stepLock,
  fireMissile,
  steer,
  segmentHitsSphere,
  createParts,
  applyHit,
  mechDestroyed,
  hitChance,
  createEnemy,
  stepEnemy,
  damageEnemy,
} from '../src/logic/combat.js';

describe('weapons', () => {
  it('needs master arm, the weapon switch and main power', () => {
    expect(weaponState({ wpnArm: true, gun: true, missile: false }, true)).toEqual({ master: true, gun: true, missile: false, mg: false });
    expect(weaponState({ wpnArm: false, gun: true, missile: true }, true).gun).toBe(false);
    expect(weaponState({ wpnArm: true, gun: true, missile: true }, false).gun).toBe(false);
    expect(weaponState({ wpnArm: true, mg: true }, true).mg).toBe(true);
  });

  it('the MG fires much faster than the cannon and never overheats it', () => {
    const w = createWeapons();
    let shots = 0;
    for (let t = 0; t < 1; t += 1 / 120) {
      stepWeapons(w, 1 / 120);
      if (fireMG(w, true)) shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(MG.rpm / 60 - 1);
    expect(w.mg.ammo).toBe(MG.ammo - shots);
    expect(w.gun.heat).toBe(0);
    expect(fireMG(w, false)).toBe(false);
  });

  it('fires at the cyclic rate and uses ammo', () => {
    const w = createWeapons();
    let shots = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      stepWeapons(w, 1 / 60);
      if (fireGun(w, true)) shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(GUN.rpm / 60 - 1);
    expect(shots).toBeLessThanOrEqual(GUN.rpm / 60 + 1);
    expect(w.gun.ammo).toBe(GUN.ammo - shots);
  });

  it('overheats under sustained fire and recovers after cooling', () => {
    const w = createWeapons();
    for (let t = 0; t < 10 && !w.gun.overheated; t += 1 / 60) {
      stepWeapons(w, 1 / 60);
      fireGun(w, true);
    }
    expect(w.gun.overheated).toBe(true);
    expect(fireGun(w, true)).toBe(false);
    for (let t = 0; t < 6; t += 1 / 60) stepWeapons(w, 1 / 60);
    expect(w.gun.overheated).toBe(false);
  });

  it('the gun only follows the helmet within its traverse', () => {
    expect(gunInLimits(0.5, 0)).toBe(true);
    expect(gunInLimits(1.6, 0)).toBe(false);
    expect(gunInLimits(0, -0.8)).toBe(false);
  });

  it('locks a target held in the cone and loses it when it leaves', () => {
    const w = createWeapons();
    for (let t = 0; t < MISSILE.lockTime + 0.1; t += 1 / 60) stepLock(w, [{ id: 7, angle: 0.01, dist: 600 }], 1 / 60, true);
    expect(w.missiles.locked).toBe(true);
    expect(fireMissile(w, true)).toEqual({ target: 7 });
    expect(w.missiles.count).toBe(MISSILE.count - 1);
    stepLock(w, [], 1 / 60, true);
    expect(w.missiles.locked).toBe(false);
  });

  it('missiles fire unguided without a lock and respect the reload', () => {
    const w = createWeapons();
    expect(fireMissile(w, true)).toEqual({ target: null });
    expect(fireMissile(w, true)).toBe(null);
  });

  it('steering turns at most the allowed rate', () => {
    const out = steer([0, 0, -1], [1, 0, 0], 0.1);
    expect(Math.acos(-out[2])).toBeCloseTo(0.1, 2);
  });

  it('segment/sphere hits', () => {
    expect(segmentHitsSphere([0, 0, 0], [0, 0, -100], [0, 0, -50], 2)).toBeCloseTo(0.48, 2);
    expect(segmentHitsSphere([0, 0, 0], [0, 0, -100], [10, 0, -50], 2)).toBe(-1);
  });
});

describe('damage', () => {
  it('distributes hits over the parts and detects destruction', () => {
    const p = createParts();
    let i = 0;
    const seq = [0.3, 0.3, 0.3];
    applyHit(p, 40, () => seq[i++]);
    expect(p.torso).toBeCloseTo(0.6);
    applyHit(p, 40, () => seq[i++]);
    applyHit(p, 40, () => seq[i++]);
    expect(mechDestroyed(p)).toBe(true);
  });

  it('moving makes you harder to hit, range too', () => {
    expect(hitChance(400, 9)).toBeLessThan(hitChance(400, 0));
    expect(hitChance(900, 0)).toBeLessThan(hitChance(300, 0));
  });
});

describe('enemies', () => {
  it('advance, stop at engagement range and open fire', () => {
    const e = createEnemy('tank', 0, -1200, 0, [0, -300]);
    const player = { x: 0, z: 0, speed: 0 };
    let fired = 0;
    for (let t = 0; t < 400 && fired === 0; t += 0.1) fired += stepEnemy(e, 0.1, { player, colliders: [] }).length;
    expect(e.state).toBe('engage');
    expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(600);
    expect(fired).toBeGreaterThan(0);
  });

  it('dies when its hit points run out', () => {
    const e = createEnemy('apc', 0, 0, 0, [0, 0]);
    expect(damageEnemy(e, 30)).toBe(false);
    expect(damageEnemy(e, 40)).toBe(true);
    expect(e.state).toBe('dead');
    expect(stepEnemy(e, 1, { player: { x: 0, z: 0 } })).toHaveLength(0);
  });
});
