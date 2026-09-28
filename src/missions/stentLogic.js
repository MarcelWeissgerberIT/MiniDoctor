import { mulberry32 } from '../physics.js';

// Real coronary stent catalogue (mm).
export const STENT_LENGTHS = [8, 12, 15, 18, 23, 28, 33];
export const STENT_DIAMETERS = [2.25, 2.5, 2.75, 3.0, 3.5, 4.0];

export function createStentCase(seed = Date.now()) {
  const rnd = mulberry32(seed);
  const lesionLength = Math.round((10 + rnd() * 10) * 10) / 10; // 10–20 mm
  const refDiameter = [2.75, 3.0, 3.5][Math.floor(rnd() * 3)];
  const calcNodes = 3; // calcified spots that should be scored before inflation
  return { lesionLength, refDiameter, calcNodes, stenosis: 0.6 + rnd() * 0.25 };
}

/** Stent must cover the lesion with ≥ 1 mm healthy margin on each side. */
export function lengthScore(chosen, lesion) {
  const needed = lesion + 2;
  if (chosen < lesion) return 0; // geographic miss
  if (chosen < needed) return 0.6;
  if (chosen <= needed + 6) return 1;
  return 0.7; // too long: more metal, higher restenosis risk
}

/** Stent diameter should match the reference vessel diameter 1:1. */
export function diameterScore(chosen, ref) {
  const d = Math.abs(chosen - ref);
  if (d < 0.01) return 1;
  if (d <= 0.25) return 0.8;
  if (d <= 0.5) return 0.4;
  return 0;
}

/** Positioning: offset (mm) of stent centre vs lesion centre. */
export function positionScore(offsetMm, stentLength, lesionLength) {
  const slack = Math.max(0.5, (stentLength - lesionLength) / 2);
  return Math.max(0, 1 - Math.abs(offsetMm) / (slack + 1.5));
}

/**
 * Balloon inflation. Nominal 12–16 atm. Unscored calcium shrinks the
 * safe window (calcified plaque resists and may crack the vessel).
 */
export function inflationResult(atm, scoredNodes, totalNodes) {
  const unscored = totalNodes - scoredNodes;
  const ruptureAt = 20 - unscored * 1.2;
  if (atm >= ruptureAt) return { score: 0, dissection: true };
  const underexpandBelow = 12 + unscored * 0.8;
  if (atm >= underexpandBelow && atm <= 16) return { score: 1, dissection: false };
  if (atm > 16) return { score: 0.6, dissection: false };
  if (atm >= underexpandBelow - 2) return { score: 0.65, dissection: false };
  if (atm >= 8) return { score: 0.3, dissection: false };
  return { score: 0.1, dissection: false };
}

export function stentOutcome({ lScore, dScore, pScore, inflation, missedAnchors }) {
  const quality = lScore * 0.25 + dScore * 0.2 + pScore * 0.25 + inflation.score * 0.3;
  let damage = Math.round(55 * (1 - quality)) + missedAnchors * 10;
  if (inflation.dissection) damage += 45;
  return { quality, damage };
}
