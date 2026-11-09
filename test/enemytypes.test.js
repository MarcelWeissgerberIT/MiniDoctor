import { describe, it, expect } from 'vitest';
import { createEnemy, stepEnemy, stepTruck, artilleryImpact, ENEMY_TYPES } from '../src/logic/combat.js';

const player = (x, z) => ({ x, z, speed: 0, vx: 0, vz: 0 });

describe('new enemy types', () => {
  it('a bunker never moves or turns, but lays its gun and fires', () => {
    const e = createEnemy('bunker', 0, 0, 0.3, [0, 0]);
    let fired = 0;
    for (let i = 0; i < 400; i++) fired += stepEnemy(e, 1 / 20, { player: player(150, -300), rand: () => 0.5 }).filter((f) => f.kind === 'fire').length;
    expect(e.x).toBe(0);
    expect(e.z).toBe(0);
    expect(e.heading).toBeCloseTo(0.3);
    expect(fired).toBeGreaterThan(3);
  });

  it('artillery reaches far, without moving', () => {
    const e = createEnemy('artillery', 0, 0, 0, [0, 0]);
    let fired = 0;
    for (let i = 0; i < 600; i++) fired += stepEnemy(e, 1 / 20, { player: player(0, -1800), rand: () => 0.5 }).length;
    expect(fired).toBeGreaterThan(0);
    expect(e.x).toBe(0);
    expect(ENEMY_TYPES.artillery.indirect).toBe(true);
  });

  it('artillery corrects: later salvos land closer', () => {
    let r = 0;
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const spread = (salvo) => {
      let s = 0;
      for (let i = 0; i < 300; i++) {
        const p = artilleryImpact({ x: 0, z: 0 }, salvo, rand);
        s += Math.hypot(p.x, p.z);
      }
      return s / 300;
    };
    expect(spread(0)).toBeGreaterThan(spread(4) * 2);
  });

  it('a truck drives its route and escapes at the end', () => {
    const e = createEnemy('truck', 0, 0, 0, [0, 0]);
    e.path = [
      [0, -100],
      [100, -200],
    ];
    let escaped = false;
    for (let i = 0; i < 2000 && !escaped; i++) escaped = stepEnemy(e, 1 / 20, { player: null }).some((f) => f.kind === 'escaped');
    expect(escaped).toBe(true);
    expect(Math.hypot(e.x - 100, e.z + 200)).toBeLessThan(15);
  });

  it('a hit truck speeds up', () => {
    const e = createEnemy('truck', 0, 0, 0, [0, 0]);
    e.path = [[0, -2000]];
    for (let i = 0; i < 200; i++) stepTruck(e, 1 / 20);
    const v0 = e.speed;
    e.hp -= 5;
    for (let i = 0; i < 200; i++) stepTruck(e, 1 / 20);
    expect(e.speed).toBeGreaterThan(v0 * 1.2);
  });
});
