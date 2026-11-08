import { describe, it, expect } from 'vitest';
import { DRONE, createDrone, launchDrone, recallDrone, retaskDrone, stepDrone, inSensor, airborne } from '../src/logic/drone.js';

const ground = () => 0;
const run = (d, ctx, secs, dt = 0.1) => {
  const ev = [];
  for (let t = 0; t < secs; t += dt) ev.push(...stepDrone(d, dt, ctx));
  return ev;
};

describe('recon drone', () => {
  it('takes off, flies out, circles the goal and comes home', () => {
    const d = createDrone();
    const home = { x: 0, y: 5, z: 0 };
    const ctx = { home, ground };
    expect(launchDrone(d, [0, -600], home)).toBe(true);
    let ev = run(d, ctx, 4);
    expect(ev).toContain('airborne');
    ev = run(d, ctx, 30);
    expect(ev).toContain('arrived');
    expect(d.state).toBe('orbit');
    expect(Math.hypot(d.x, d.z + 600)).toBeCloseTo(DRONE.orbitR, -1);
    expect(d.y).toBeGreaterThan(DRONE.alt - 5);
    expect(inSensor(d, 0, -600)).toBe(true);
    expect(recallDrone(d)).toBe(true);
    ev = run(d, ctx, 60);
    expect(ev).toContain('docked');
    expect(d.state).toBe('docked');
    expect(airborne(d)).toBe(false);
  });

  it('returns by itself on a low battery and recharges on the dock', () => {
    const d = createDrone();
    const home = { x: 0, y: 5, z: 0 };
    launchDrone(d, [300, 0], home);
    const ev = run(d, { home, ground }, DRONE.flight);
    expect(ev).toContain('lowBattery');
    expect(ev).toContain('docked');
    const b = d.battery;
    run(d, { home, ground }, 10);
    expect(d.battery).toBeGreaterThan(b);
    // a flat battery will not take off
    d.battery = 0.1;
    expect(launchDrone(d, [100, 0], home)).toBe(false);
  });

  it('limits the range and can be sent elsewhere', () => {
    const d = createDrone();
    const home = { x: 0, y: 5, z: 0 };
    launchDrone(d, [0, -5000], home);
    expect(Math.hypot(...d.goal)).toBeCloseTo(DRONE.maxRange, 0);
    run(d, { home, ground }, 5);
    expect(retaskDrone(d, [200, 0], home)).toBe(true);
    expect(d.goal).toEqual([200, 0]);
  });

  it('follows the mech home while it walks', () => {
    const d = createDrone();
    const home = { x: 0, y: 5, z: 0 };
    launchDrone(d, [0, -300], home);
    run(d, { home, ground }, 20);
    recallDrone(d);
    for (let t = 0; t < 60 && d.state !== 'docked'; t += 0.1) {
      home.x += 0.6; // 6 m/s
      stepDrone(d, 0.1, { home, ground });
    }
    expect(d.state).toBe('docked');
    expect(d.x).toBeCloseTo(home.x, 1);
  });
});
