import { describe, it, expect } from 'vitest';
import { createSystems, stepSystems, coldSwitches, SYS } from '../src/logic/systems.js';

const run = (s, sw, seconds) => {
  const ev = [];
  for (let t = 0; t < seconds; t += 0.05) ev.push(...stepSystems(s, sw, 0.05));
  return ev;
};

/** flips one switch and returns the events of the next tick */
const flip = (s, sw, key, value) => {
  sw[key] = value;
  return stepSystems(s, sw, 0.05);
};

describe('cold and dark start-up', () => {
  it('starts with everything dead and the legs locked', () => {
    const s = createSystems();
    const sw = coldSwitches();
    run(s, sw, 2);
    expect(s.battBus).toBe(false);
    expect(s.mainBus).toBe(false);
    expect(s.reactorState).toBe('off');
    expect(s.legsLocked).toBe(true);
    expect(s.canWalk).toBe(false);
    expect(s.warnings).toHaveLength(0);
  });

  it('runs through the full checklist in order', () => {
    const s = createSystems();
    const sw = coldSwitches();
    flip(s, sw, 'batt', true);
    expect(s.battBus).toBe(true);
    flip(s, sw, 'apu', true);
    const apu = run(s, sw, SYS.apuSpool + 0.5);
    expect(apu).toContain('apuReady');
    flip(s, sw, 'gen1', true);
    expect(s.mainBus).toBe(true);
    flip(s, sw, 'gen2', true);
    flip(s, sw, 'hydp', true);
    run(s, sw, 4);
    expect(s.hyd).toBeGreaterThan(SYS.hydMin);
    flip(s, sw, 'pump', true);
    expect(flip(s, sw, 'reactor', true)).toContain('reactorIgnite');
    expect(run(s, sw, SYS.ignition + 0.5)).toContain('reactorRunning');
    // APU off: the reactor keeps the generators running
    flip(s, sw, 'apu', false);
    run(s, sw, 6);
    expect(s.mainBus).toBe(true);
    flip(s, sw, 'stab', true);
    expect(run(s, sw, SYS.gyroAlign + 0.5)).toContain('gyroAligned');
    expect(flip(s, sw, 'legLock', false)).toContain('legsReleased');
    expect(s.canWalk).toBe(true);
  });
});

describe('interlocks', () => {
  it('generators give no power without APU or reactor', () => {
    const s = createSystems();
    const sw = coldSwitches();
    flip(s, sw, 'batt', true);
    flip(s, sw, 'gen1', true);
    expect(s.mainBus).toBe(false);
  });

  it('APU does nothing without the battery', () => {
    const s = createSystems();
    const sw = coldSwitches();
    flip(s, sw, 'apu', true);
    run(s, sw, SYS.apuSpool + 1);
    expect(s.apuRpm).toBe(0);
  });

  it('reactor refuses to start without coolant flow', () => {
    const s = createSystems();
    const sw = coldSwitches();
    Object.assign(sw, { batt: true, apu: true });
    run(s, sw, SYS.apuSpool + 0.5);
    Object.assign(sw, { gen1: true, hydp: true });
    run(s, sw, 4);
    expect(flip(s, sw, 'reactor', true)).toContain('reactorFail');
    expect(s.reactorState).toBe('off');
  });

  it('leg lock cannot be released before the reactor runs', () => {
    const s = createSystems();
    const sw = coldSwitches();
    expect(flip(s, sw, 'legLock', false)).toContain('legDenied');
    expect(s.legsLocked).toBe(true);
  });

  it('losing coolant while running overheats and scrams the reactor', () => {
    const s = createSystems(true);
    const sw = { ...coldSwitches(), batt: true, gen1: true, gen2: true, hydp: true, pump: true, reactor: true, stab: true, legLock: false };
    s.prev = { ...sw };
    sw.pump = false;
    stepSystems(s, sw, 0.05);
    expect(s.warnings).toContain('COOLANT FLOW LOW');
    const ev = run(s, sw, 120);
    expect(ev).toContain('scram');
    expect(s.reactorState).toBe('off');
  });

  it('a hot (quick start) machine can walk right away', () => {
    const s = createSystems(true);
    const sw = { ...coldSwitches(), batt: true, gen1: true, gen2: true, hydp: true, pump: true, reactor: true, stab: true, legLock: false };
    s.prev = { ...sw };
    stepSystems(s, sw, 0.05);
    expect(s.canWalk).toBe(true);
    expect(s.warnings).toHaveLength(0);
  });
});
