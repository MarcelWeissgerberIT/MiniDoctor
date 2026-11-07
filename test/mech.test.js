import { describe, it, expect } from 'vitest';
import { createMechState, stepMech, walkBob, wrapAngle, MECH, kmh } from '../src/logic/mech.js';

const run = (s, input, seconds, colliders = []) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...stepMech(s, input, 1 / 60, colliders));
  return events;
};

describe('mech throttle and speed', () => {
  it('throttle is clamped between reverse limit and full', () => {
    const s = createMechState();
    run(s, { throttle: 1 }, 5);
    expect(s.throttle).toBe(1);
    run(s, { throttle: -1 }, 10);
    expect(s.throttle).toBeCloseTo(MECH.minThrottle);
  });

  it('accelerates slowly to max speed (heavy machine)', () => {
    const s = createMechState();
    s.throttle = 1;
    run(s, {}, 1);
    expect(s.speed).toBeGreaterThan(1);
    expect(s.speed).toBeLessThan(MECH.maxForward * 0.5);
    run(s, {}, 10);
    expect(s.speed).toBeCloseTo(MECH.maxForward);
    expect(kmh(s.speed)).toBeCloseTo(39.6);
  });

  it('stop puts the throttle to zero and the mech brakes', () => {
    const s = createMechState();
    s.throttle = 1;
    s.speed = MECH.maxForward;
    stepMech(s, { stop: true }, 1 / 60);
    expect(s.throttle).toBe(0);
    run(s, {}, 6);
    expect(s.speed).toBe(0);
  });

  it('walks forward along -Z at heading 0', () => {
    const s = createMechState();
    s.throttle = 0.5;
    run(s, {}, 5);
    expect(s.z).toBeLessThan(-5);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });

  it('reverses with negative throttle', () => {
    const s = createMechState();
    run(s, { throttle: -1 }, 6);
    expect(s.speed).toBeLessThan(0);
    expect(s.z).toBeGreaterThan(0);
  });
});

describe('turning', () => {
  it('turns left with positive input and wraps the heading', () => {
    const s = createMechState();
    run(s, { turn: 1 }, 2);
    expect(s.heading).toBeGreaterThan(0.3);
    run(s, { turn: 1 }, 30);
    expect(s.heading).toBeLessThanOrEqual(Math.PI);
    expect(s.heading).toBeGreaterThanOrEqual(-Math.PI);
  });

  it('wrapAngle keeps angles in [-PI, PI)', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('footsteps', () => {
  it('fires one footstep per step length and alternates the feet', () => {
    const s = createMechState();
    s.throttle = 1;
    s.speed = MECH.maxForward;
    const events = run(s, {}, 4);
    const expected = s.odometer / MECH.stepLength;
    expect(events.length).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(events.length).toBeLessThanOrEqual(Math.ceil(expected) + 1);
    for (let i = 1; i < events.length; i++) expect(events[i].foot).toBe(-events[i - 1].foot);
  });

  it('no footsteps when standing still', () => {
    const s = createMechState();
    expect(run(s, {}, 3)).toHaveLength(0);
  });

  it('walk bob is zero at rest and bounded while walking', () => {
    const s = createMechState();
    expect(walkBob(s).y).toBe(0);
    s.speed = MECH.maxForward;
    s.stepPhase = 0.5;
    const b = walkBob(s);
    expect(b.y).toBeGreaterThan(0.1);
    expect(b.y).toBeLessThan(0.35);
  });
});

describe('collisions', () => {
  it('cannot walk through an obstacle', () => {
    const s = createMechState();
    s.throttle = 1;
    const wall = { x: 0, z: -40, r: 6 };
    run(s, {}, 15, [wall]);
    const d = Math.hypot(s.x - wall.x, s.z - wall.z);
    expect(d).toBeGreaterThanOrEqual(wall.r + MECH.radius - 1e-6);
  });

  it('stays inside the battlefield bounds', () => {
    const s = createMechState(0, -890);
    s.throttle = 1;
    s.speed = MECH.maxForward;
    for (let t = 0; t < 5; t += 1 / 60) stepMech(s, {}, 1 / 60, [], 900);
    expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(900 + 1e-6);
  });
});
