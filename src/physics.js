// Real-world scale: 1 world unit = 1 micrometre (µm).
// All sizes below are real anatomical values. Only *time* is dilated
// (see vessel.timeScale) so that flow speeds stay readable on screen.

export const SIZES = {
  ship: 2.5, // µm, diameter of the ship = a blood platelet (2–3 µm)
  platelet: 2.5,
  rbcDiameter: 7.8, // erythrocyte
  rbcMaxThickness: 2.6,
  virion: 0.1, // e.g. influenza / SARS-CoV-2 ≈ 80–120 nm
  guidewire: 356, // 0.014" coronary guidewire
  stentStrut: 80,
};

// Vessel presets. radius in µm, vmaxReal in µm/s (centre-line velocity).
export const VESSELS = {
  coronary: {
    key: 'coronary',
    radius: 1500, // LAD lumen ≈ 3 mm
    vmaxReal: 300_000, // ≈ 30 cm/s
    timeScale: 1000,
    heartRate: 72,
    pulsatility: 0.45,
    diastolicPeak: true, // coronary flow peaks in diastole
    fogDensity: 0.0048,
  },
  arteriole: {
    key: 'arteriole',
    radius: 50, // forearm muscle arteriole, Ø 100 µm
    vmaxReal: 5_000, // ≈ 5 mm/s
    timeScale: 100,
    heartRate: 72,
    pulsatility: 0.2,
    diastolicPeak: false,
    fogDensity: 0.011,
  },
  mca: {
    key: 'mca',
    radius: 1500, // middle cerebral artery M1, Ø 3 mm
    vmaxReal: 800_000, // ≈ 60 cm/s mean → 0.8 m/s centre line
    timeScale: 2500,
    heartRate: 72,
    pulsatility: 0.3,
    diastolicPeak: false,
    fogDensity: 0.0026,
  },
  venule: {
    key: 'venule',
    radius: 20, // post-capillary venule, Ø 40 µm
    vmaxReal: 1_000, // ≈ 1 mm/s
    timeScale: 120,
    heartRate: 72,
    pulsatility: 0.08,
    diastolicPeak: false,
    fogDensity: 0.02,
  },
  vein: {
    key: 'vein',
    radius: 3000, // popliteal vein, Ø 6 mm
    vmaxReal: 150_000, // ≈ 15 cm/s
    timeScale: 1000,
    heartRate: 72,
    pulsatility: 0.15,
    diastolicPeak: false,
    fogDensity: 0.0042,
  },
};

/** Hagen–Poiseuille parabolic profile: v(r) = vmax · (1 − (r/R)²). */
export function poiseuille(r, R, vmax) {
  const q = Math.min(1, Math.abs(r) / R);
  return vmax * (1 - q * q);
}

/**
 * Pulsatile multiplier for the heartbeat at time t (seconds, game time).
 * Returns a factor around 1. Coronary flow is highest in diastole.
 */
export function pulseFactor(t, vessel) {
  const period = 60 / vessel.heartRate;
  const phase = (t % period) / period; // 0..1, systole ≈ first 35 %
  const systole = phase < 0.35;
  let wave;
  if (systole) wave = Math.sin((phase / 0.35) * Math.PI);
  else wave = Math.sin(((phase - 0.35) / 0.65) * Math.PI) * 0.6;
  if (vessel.diastolicPeak) wave = systole ? wave * 0.4 : wave * 1.6;
  return 1 + vessel.pulsatility * (wave - 0.45);
}

/** Heartbeat phase helper (0..1) — used by audio + HUD. */
export function beatPhase(t, heartRate) {
  const period = 60 / heartRate;
  return (t % period) / period;
}

/** Game-time centre-line speed in µm per (game) second. */
export function vmaxGame(vessel) {
  return vessel.vmaxReal / vessel.timeScale;
}

/** Real-world flow speed in m/s for HUD display. */
export function toRealMetersPerSecond(gameSpeed, vessel) {
  return (gameSpeed * vessel.timeScale) / 1e6;
}

/**
 * Evans–Fung biconcave erythrocyte profile (half thickness at radius r).
 * R0 = 3.91 µm, coefficients from Evans & Fung (1972).
 */
export function rbcHalfThickness(r, R0 = 3.91) {
  const p = Math.min(1, Math.abs(r) / R0);
  const C0 = 0.207161;
  const C2 = 2.002558;
  const C4 = -1.122762;
  return 0.5 * R0 * Math.sqrt(Math.max(0, 1 - p * p)) * (C0 + C2 * p * p + C4 * p ** 4);
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Small deterministic PRNG so puzzles are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
