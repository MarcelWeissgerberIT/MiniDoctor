import { describe, it, expect } from 'vitest';
import { createMechState, stepMech, MECH } from '../src/logic/mech.js';
import { gaitPose, BodyDynamics } from '../src/logic/gait.js';

const walk = (s, body, seconds, input = {}, onTick) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    const ev = stepMech(s, input, 1 / 60);
    const p = body.update(1 / 60, s, undefined, false);
    onTick?.(p, ev);
  }
};

describe('gait pose', () => {
  it('is neutral when standing', () => {
    const s = createMechState();
    const p = gaitPose(s);
    for (const v of Object.values(p)) expect(Math.abs(v)).toBeLessThan(1e-9);
  });

  it('shifts the weight onto the stance leg: rolls and sways to that side', () => {
    const s = createMechState();
    s.speed = 3;
    s.stepPhase = 0.5;
    s.foot = -1; // next foot is the left one, so the right leg is the stance leg
    const p = gaitPose(s);
    expect(p.x).toBeGreaterThan(0.05); // over the right foot
    expect(p.roll).toBeLessThan(-0.02); // right side down
    s.foot = 1;
    const q = gaitPose(s);
    expect(q.x).toBeLessThan(-0.05);
    expect(q.roll).toBeGreaterThan(0.02);
  });

  it('sags and nods right after heel strike, rises mid-stance', () => {
    const s = createMechState();
    s.speed = 3;
    s.stepPhase = 0.0;
    const strike = gaitPose(s);
    s.stepPhase = 0.5;
    const mid = gaitPose(s);
    expect(strike.y).toBeLessThan(0);
    expect(strike.pitch).toBeLessThan(0);
    expect(mid.y).toBeGreaterThan(0.05);
  });
});

describe('body dynamics', () => {
  it('rocks left and right while walking (felt inside)', () => {
    const s = createMechState();
    s.throttle = 0.4;
    const body = new BodyDynamics();
    let minRoll = 0;
    let maxRoll = 0;
    walk(s, body, 8, {}, (p) => {
      minRoll = Math.min(minRoll, p.roll);
      maxRoll = Math.max(maxRoll, p.roll);
    });
    expect(maxRoll).toBeGreaterThan(0.02);
    expect(minRoll).toBeLessThan(-0.02);
  });

  it('keeps swaying for a moment after stopping, then settles', () => {
    const s = createMechState();
    s.throttle = 0.5;
    const body = new BodyDynamics();
    walk(s, body, 6);
    s.throttle = 0;
    walk(s, body, 10, { stop: true });
    expect(Math.abs(body.pose.roll)).toBeLessThan(0.004);
    expect(Math.abs(body.pose.x)).toBeLessThan(0.01);
  });

  it('the head lags behind the cabin and the dog tags swing', () => {
    const s = createMechState();
    s.throttle = 1;
    const body = new BodyDynamics();
    let headMax = 0;
    let tagsMax = 0;
    walk(s, body, 6, {}, () => {
      headMax = Math.max(headMax, Math.abs(body.head.p[1]));
      tagsMax = Math.max(tagsMax, Math.abs(body.tags.ax));
    });
    expect(headMax).toBeGreaterThan(0.003);
    expect(headMax).toBeLessThanOrEqual(0.09);
    expect(tagsMax).toBeGreaterThan(0.05);
    expect(tagsMax).toBeLessThan(1.0);
  });

  it('the stabiliser damps the sway', () => {
    const run = (stab) => {
      const s = createMechState();
      s.throttle = 0.4;
      const body = new BodyDynamics();
      let m = 0;
      for (let t = 0; t < 8; t += 1 / 60) {
        stepMech(s, {}, 1 / 60);
        m = Math.max(m, Math.abs(body.update(1 / 60, s, undefined, stab).roll));
      }
      return m;
    };
    expect(run(true)).toBeLessThan(run(false));
  });
});
