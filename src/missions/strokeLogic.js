import { mulberry32 } from '../physics.js';

// Mechanical thrombectomy with a stent retriever in the middle cerebral artery.
// "Time is brain": ~1.9 million neurons die per minute of ischaemia.
export const NEURONS_PER_MIN = 1.9e6;
// one game second stands for 30 s of real procedure time
export const REAL_SECONDS_PER_GAME_SECOND = 30;

// Common retriever sizes (diameter × length, mm)
export const RETRIEVERS = [
  { d: 3, l: 20 },
  { d: 4, l: 20 },
  { d: 4, l: 40 },
  { d: 6, l: 30 },
];

export function createStrokeCase(seed = Date.now()) {
  const rnd = mulberry32(seed);
  return {
    clotLength: Math.round((6 + rnd() * 10) * 10) / 10, // 6–16 mm
    vesselDiameter: Math.round((2.4 + rnd() * 0.8) * 10) / 10, // M1: 2.4–3.2 mm
    sticky: 0.4 + rnd() * 0.5, // fibrin-rich clots cling harder
  };
}

/** Retriever must be ≥ vessel diameter and cover the clot with ≥ 5 mm to spare. */
export function retrieverScore(r, c) {
  let s = 1;
  if (r.d < c.vesselDiameter) s -= 0.5; // does not grip the wall → clot slips
  if (r.d > c.vesselDiameter * 2.2) s -= 0.2; // oversized: more wall stress
  if (r.l < c.clotLength) s -= 0.5; // clot sticks out
  else if (r.l < c.clotLength + 5) s -= 0.2;
  return Math.max(0, s);
}

/** Deployment: offset (mm) of the retriever's distal end beyond the clot end. Ideal 2–6 mm. */
export function deployScore(offsetMm) {
  if (offsetMm < 0) return Math.max(0, 0.5 + offsetMm * 0.15); // lands inside the clot
  if (offsetMm <= 6) return 1;
  return Math.max(0.3, 1 - (offsetMm - 6) * 0.1); // too far into small branches
}

/** Waiting for the struts to embed into the clot. */
export function integrationScore(beats) {
  return Math.min(1, beats / 3);
}

export const PULL = { low: 0.35, high: 0.8, tear: 0.95 };

/** Clot friction along the way out (sticky spots). */
export function friction(progress, sticky) {
  const bump = (c, w) => Math.exp(-(((progress - c) / w) ** 2));
  return 0.55 + sticky * (bump(0.3, 0.08) + 0.8 * bump(0.72, 0.06));
}

export function createPull() {
  return { progress: 0, stress: 0, fragments: 0, force: 0, time: 0 };
}

/**
 * Advance the pull by dt. p = pull input 0..1. Returns true when the clot is out.
 * Too much force tears pieces off (distal emboli); too little barely moves it.
 */
export function stepPull(st, p, dt, sticky, integration = 1) {
  st.time += dt;
  st.force = p * (0.6 + friction(st.progress, sticky));
  const inBand = st.force >= PULL.low && st.force <= PULL.high;
  const rate = p <= 0.02 ? 0 : inBand ? 0.11 : st.force < PULL.low ? 0.03 : 0.13;
  st.progress = Math.min(1, st.progress + rate * dt);
  // poorly integrated struts slip more easily
  const tearAt = PULL.tear - (1 - integration) * 0.2;
  if (st.force > tearAt) st.stress += (st.force - tearAt) * dt * 6;
  else st.stress = Math.max(0, st.stress - dt * 0.5);
  let tore = false;
  if (st.stress >= 1) {
    st.stress = 0;
    st.fragments++;
    tore = true;
  }
  return { done: st.progress >= 1, tore, inBand };
}

export function neuronsLost(gameSeconds) {
  return (gameSeconds * REAL_SECONDS_PER_GAME_SECOND * NEURONS_PER_MIN) / 60;
}

/** TICI reperfusion grade (0 … 3). */
export function tici(removed, fragments) {
  if (!removed) return '0';
  if (fragments === 0) return '3';
  if (fragments === 1) return '2b';
  return '2a';
}

export function strokeOutcome({ rScore, dScore, iScore, pull, removed, seconds }) {
  const lost = neuronsLost(seconds);
  const grade = tici(removed, pull.fragments);
  let damage = Math.min(35, Math.round(lost / 4e6)); // every ~2 real minutes costs 1 point
  damage += pull.fragments * 12;
  if (!removed) damage += 35;
  damage += Math.round(10 * (1 - (rScore + dScore) / 2));
  const quality = Math.max(0, Math.min(1, (rScore * 0.2 + dScore * 0.2 + iScore * 0.2 + (removed ? 0.4 : 0)) - pull.fragments * 0.15));
  return { damage, quality, grade, lost };
}
