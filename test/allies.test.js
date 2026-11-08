import { describe, it, expect } from 'vitest';
import { createWingman, formationPoint, setOrder, stepWingman, damageWingman, wingmanHitChance } from '../src/logic/allies.js';
import { chooseTarget, createEnemy, stepEnemy } from '../src/logic/combat.js';

describe('wingmen', () => {
  it('formation slots are placed relative to the leader heading', () => {
    const p = formationPoint({ x: 0, z: 0, heading: 0 }, [-20, 15]);
    expect(p[0]).toBeCloseTo(-20);
    expect(p[1]).toBeCloseTo(15); // behind = +z when facing -z
    const q = formationPoint({ x: 0, z: 0, heading: Math.PI / 2 }, [0, 10]); // facing -x
    expect(q[0]).toBeCloseTo(10);
  });

  it('follows the leader into formation', () => {
    const w = createWingman('H2', 50, 50, 0, [-20, 15]);
    const leader = { x: 0, z: -100, heading: 0, speed: 0 };
    for (let t = 0; t < 60; t += 0.1) stepWingman(w, 0.1, { leader, enemies: [] });
    const p = formationPoint(leader, w.slot);
    expect(Math.hypot(w.x - p[0], w.z - p[1])).toBeLessThan(10);
  });

  it('holds position when ordered', () => {
    const w = createWingman('H2', 0, 0, 0, [-20, 15]);
    setOrder(w, 'hold');
    const leader = { x: 0, z: -400, heading: 0, speed: 8 };
    for (let t = 0; t < 20; t += 0.1) stepWingman(w, 0.1, { leader, enemies: [] });
    expect(Math.hypot(w.x, w.z)).toBeLessThan(8);
  });

  it('engages enemies in range with bursts and missiles', () => {
    const w = createWingman('H2', 0, 0, 0, [0, 0]);
    setOrder(w, 'hold');
    const enemies = [{ id: 5, x: 0, z: -400, dead: false }];
    let shots = 0;
    let missiles = 0;
    for (let t = 0; t < 30; t += 0.05) {
      for (const e of stepWingman(w, 0.05, { leader: { x: 0, z: 0, heading: 0, speed: 0 }, enemies })) {
        if (e.kind === 'shot') shots++;
        else missiles++;
      }
    }
    expect(shots).toBeGreaterThan(20);
    expect(missiles).toBeGreaterThan(0);
    expect(wingmanHitChance(200)).toBeGreaterThan(wingmanHitChance(600));
  });

  it('can be destroyed', () => {
    const w = createWingman('H3', 0, 0, 0, [0, 0]);
    expect(damageWingman(w, 100)).toBe(false);
    expect(damageWingman(w, 100)).toBe(true);
    expect(stepWingman(w, 1, { leader: { x: 0, z: 0, heading: 0, speed: 0 }, enemies: [] })).toHaveLength(0);
  });
});

describe('enemy target choice', () => {
  it('picks the nearest mech and sticks to it for a while', () => {
    const e = createEnemy('tank', 0, -500, 0, [0, 0]);
    const player = { x: 0, z: 0, isPlayer: true };
    const wing = { x: 0, z: -300 };
    expect(chooseTarget(e, [player, wing], 0.1, () => 0)).toBe(wing);
    wing.z = 0;
    expect(chooseTarget(e, [player, wing], 0.1, () => 0)).toBe(wing); // sticky
    wing.dead = true;
    expect(chooseTarget(e, [player, wing], 0.1, () => 0)).toBe(player);
  });

  it('static depot targets never move or fire', () => {
    const d = createEnemy('depot', 10, 10, 0, [10, 10]);
    expect(stepEnemy(d, 1, { player: { x: 0, z: 0 } })).toHaveLength(0);
    expect(d.x).toBe(10);
  });

  it('a short detection range keeps a hidden vehicle quiet', () => {
    const e = createEnemy('tank', 0, -400, 0, [0, -400]);
    e.engage = 280;
    stepEnemy(e, 0.1, { player: { x: 0, z: 0 } });
    expect(e.state).toBe('advance');
    stepEnemy(e, 0.1, { player: { x: 0, z: -150 } });
    expect(e.state).toBe('engage');
  });
});

describe('cover', () => {
  it('a vehicle without line of sight leaves its spot to find a new firing position', () => {
    const e = createEnemy('tank', 0, -300, 0, [0, -300]);
    stepEnemy(e, 0.1, { player: { x: 0, z: 0 } });
    expect(e.state).toBe('engage');
    e.noLos = true;
    for (let t = 0; t < 5; t += 0.1) stepEnemy(e, 0.1, { player: { x: 0, z: 0 } });
    expect(Math.hypot(e.x, e.z + 300)).toBeGreaterThan(5);
  });
});
