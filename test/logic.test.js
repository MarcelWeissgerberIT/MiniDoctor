import { describe, it, expect } from 'vitest';
import { poiseuille, pulseFactor, VESSELS, rbcHalfThickness, SIZES, vmaxGame } from '../src/physics.js';
import * as S from '../src/missions/stentLogic.js';
import * as C from '../src/missions/clotLogic.js';
import { splitCluster, hits } from '../src/missions/virusLogic.js';
import { STRINGS } from '../src/i18n.js';

describe('physics', () => {
  it('poiseuille profile', () => {
    expect(poiseuille(0, 10, 5)).toBe(5);
    expect(poiseuille(10, 10, 5)).toBe(0);
    expect(poiseuille(5, 10, 4)).toBeCloseTo(3);
  });
  it('pulse stays positive and around 1', () => {
    for (const v of Object.values(VESSELS))
      for (let t = 0; t < 2; t += 0.01) {
        const f = pulseFactor(t, v);
        expect(f).toBeGreaterThan(0.5);
        expect(f).toBeLessThan(1.8);
      }
  });
  it('erythrocyte shape is biconcave and realistic', () => {
    const centre = 2 * rbcHalfThickness(0);
    let max = 0;
    for (let r = 0; r < 3.91; r += 0.01) max = Math.max(max, 2 * rbcHalfThickness(r));
    expect(centre).toBeLessThan(1.1);
    expect(max).toBeGreaterThan(2.2);
    expect(max).toBeLessThan(3);
    expect(max).toBeGreaterThan(centre * 2);
  });
  it('ship is platelet sized, RBC ~3x ship', () => {
    expect(SIZES.ship).toBeGreaterThanOrEqual(2);
    expect(SIZES.ship).toBeLessThanOrEqual(3);
    expect(SIZES.rbcDiameter / SIZES.ship).toBeGreaterThan(2.5);
  });
  it('game speeds are readable', () => {
    for (const v of Object.values(VESSELS)) {
      expect(vmaxGame(v)).toBeGreaterThan(5);
      expect(vmaxGame(v)).toBeLessThan(400);
    }
  });
});

describe('stent', () => {
  it('scores length and diameter', () => {
    expect(S.lengthScore(18, 14.2)).toBe(1);
    expect(S.lengthScore(15, 14.2)).toBe(0.6);
    expect(S.lengthScore(12, 14.2)).toBe(0);
    expect(S.diameterScore(3.0, 3.0)).toBe(1);
    expect(S.diameterScore(4.0, 3.0)).toBe(0);
  });
  it('inflation windows', () => {
    expect(S.inflationResult(14, 3, 3)).toEqual({ score: 1, dissection: false });
    expect(S.inflationResult(21, 3, 3).dissection).toBe(true);
    expect(S.inflationResult(17, 0, 3).dissection).toBe(true);
  });
  it('perfect run has no damage', () => {
    const o = S.stentOutcome({ lScore: 1, dScore: 1, pScore: 1, inflation: { score: 1 }, missedAnchors: 0 });
    expect(o.damage).toBe(0);
  });
});

describe('clot', () => {
  it('is solvable without emboli using a centre-out strategy', () => {
    for (let seed = 1; seed < 30; seed++) {
      const clot = C.createClot(seed);
      let guard = 0;
      while (!C.clotFinished(clot) && guard++ < 100) {
        // pick the live cell closest to centre, prefer laser on dense cells
        let best = null;
        const c = (clot.n - 1) / 2;
        for (let j = 0; j < clot.n; j++)
          for (let i = 0; i < clot.n; i++) {
            const cell = clot.cells[j][i];
            if (!cell || cell.hp <= 0) continue;
            const d = Math.hypot(i - c, j - c);
            if (!best || d < best.d) best = { i, j, d, hp: cell.hp };
          }
        const tool = best.hp >= 3 && clot.laserLeft > 0 ? 'laser' : clot.tpaLeft > 0 ? 'tpa' : 'laser';
        C.applyTool(clot, tool, best.i, best.j);
      }
      const o = C.clotOutcome(clot);
      expect(o.reached).toBe(true);
      expect(clot.emboli).toBe(0);
    }
  });
  it('detached big fragment becomes embolus', () => {
    const clot = C.createClot(3);
    // carve a ring that isolates the centre 3x3 block
    for (let j = 0; j < clot.n; j++)
      for (let i = 0; i < clot.n; i++) {
        const c = clot.cells[j][i];
        if (!c) continue;
        const ring = Math.max(Math.abs(i - 4), Math.abs(j - 4)) === 2;
        c.hp = ring ? 1 : 3;
      }
    clot.tpaLeft = 99;
    clot.laserLeft = 99;
    for (let j = 0; j < clot.n; j++)
      for (let i = 0; i < clot.n; i++) if (Math.max(Math.abs(i - 4), Math.abs(j - 4)) === 2) C.applyTool(clot, 'laser', i, j);
    expect(clot.emboli).toBeGreaterThanOrEqual(1);
  });
});

describe('virus', () => {
  it('splits like asteroids', () => {
    const kids = splitCluster({ level: 3, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    expect(kids).toHaveLength(2);
    expect(kids[0].level).toBe(2);
    expect(splitCluster({ level: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })).toHaveLength(0);
    expect(hits({ x: 0, y: 0, z: 0 }, { level: 3, x: 0.5, y: 0, z: 0 })).toBe(true);
  });
});

describe('i18n', () => {
  it('de and en have the same keys', () => {
    expect(Object.keys(STRINGS.de).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });
});

import * as D from '../src/missions/diagLogic.js';
describe('diagnosis', () => {
  it('every disease is identifiable from each sample type set', () => {
    for (const dis of D.DISEASES) {
      const f = D.SAMPLE_TYPES.map((t) => D.findingFor(t, dis));
      const ev = D.evidence(f);
      const best = Object.entries(ev).sort((a, b) => b[1] - a[1])[0][0];
      expect(best).toBe(dis);
    }
  });
  it('wrong diagnosis hurts', () => {
    expect(D.diagnosisOutcome('virus', 'dvt', 5).damage).toBeGreaterThan(0);
    expect(D.diagnosisOutcome('dvt', 'dvt', 5).correct).toBe(true);
  });
});
