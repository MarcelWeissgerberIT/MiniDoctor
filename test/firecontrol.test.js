import { describe, it, expect } from 'vitest';
import { pickTarget, leadPoint, triggerWants, triggerShot } from '../src/logic/firecontrol.js';

const T = (id, o) => ({ id, type: 'tank', dist: 300, aiming: false, visible: true, marked: false, stale: false, ...o });

describe('fire control', () => {
  it('takes the vehicle that aims at us first, else the nearest', () => {
    const list = [T(1, { dist: 200, type: 'apc' }), T(2, { dist: 500, aiming: true }), T(3, { dist: 350 })];
    expect(pickTarget(list, 'threat').id).toBe(2);
    expect(pickTarget(list, 'nearest').id).toBe(1);
    expect(pickTarget(list, 'tank').id).toBe(3);
  });

  it('ignores lost tracks and what nobody sees', () => {
    const list = [T(1, { stale: true, dist: 50 }), T(2, { visible: false, dist: 60 }), T(3, { visible: false, marked: true, dist: 400 })];
    expect(pickTarget(list).id).toBe(3);
    expect(pickTarget([T(1, { stale: true })])).toBe(null);
  });

  it('leads a crossing target by the flight time', () => {
    const p = leadPoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1100 }, { x: 10, z: 0 }, 1100);
    expect(p.t).toBeCloseTo(1, 1);
    expect(p.x).toBeCloseTo(10, 0);
  });

  it('single, burst and continuous fire', () => {
    const st = { held: false, burstLeft: 0 };
    // single: one round per press however long it is held
    let n = 0;
    for (let i = 0; i < 10; i++) if (triggerWants(st, true, 'single')) (triggerShot(st), n++);
    expect(n).toBe(1);
    triggerWants(st, false, 'single');
    // burst: three rounds even if the press is short
    n = 0;
    for (let i = 0; i < 10; i++) if (triggerWants(st, i < 1, 'burst', 3)) (triggerShot(st), n++);
    expect(n).toBe(3);
    // continuous while held
    n = 0;
    for (let i = 0; i < 10; i++) if (triggerWants(st, true, 'auto')) n++;
    expect(n).toBe(10);
  });
});
