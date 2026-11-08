// Radio video link: when someone talks on the radio, their face appears on the left
// display (instructor from the command bunker, wingmen from their cockpits).
// The lips follow the voice that is actually playing: an analyser on the radio voice
// gives loudness and brightness every frame, and those pick a mouth shape (closed,
// half open, open, rounded). Blinks and a little head motion keep the face alive.
const BASE = import.meta.env.BASE_URL + 'assets/';

export const SPEAKERS = {
  instructor: { name: 'AUSBILDER', channel: 'KANAL 1 · KOMMANDO' },
  h2: { name: 'HAMMER 2', channel: 'KANAL 2 · LANZE' },
  h3: { name: 'HAMMER 3', channel: 'KANAL 2 · LANZE' },
};

const SHAPES = ['closed', 'half', 'open', 'round'];

/** which face goes with a radio line */
export function speakerOf(key) {
  if (key.startsWith('w2_')) return 'h2';
  if (key.startsWith('w3_')) return 'h3';
  return 'instructor';
}

const img = (src) => {
  const i = new Image();
  i.src = src;
  return i;
};
const ready = (i) => i && i.complete && i.naturalWidth > 0;

export class Comms {
  constructor() {
    this.faces = {};
    for (const id of Object.keys(SPEAKERS)) {
      const f = { shapes: {}, eyes: img(`${BASE}faces/${id}_eyes.webp`), still: img(`${BASE}faces/${id}.webp`) };
      // mouth shapes are transparent overlays on the still (the rest of the face never changes)
      for (const s of SHAPES) if (s !== 'closed') f.shapes[s] = img(`${BASE}faces/${id}_${s}.webp`);
      this.faces[id] = f;
    }
    this.who = null;
    this.until = 0;
    this.since = 0;
    this.shape = 'closed';
    this.hold = 0;
    this.level = 0;
    this.peak = 0.008;
    this.brightAvg = 0.62;
    this.blinkAt = 3;
    this.nod = 0;
    this.buf = null;
    this.spec = null;
  }

  /** someone starts talking for `seconds` (time: game clock) */
  start(who, seconds, time) {
    if (!this.faces[who]) return;
    if (this.who !== who || time > this.until) {
      this.since = time;
      this.peak = 0.008;
    }
    this.who = who;
    this.until = time + seconds + 0.6;
  }

  /**
   * Lip sync from the analyser on the radio voice: loudness opens the mouth, a dark
   * sound (o, u) rounds it, a bright one (a, e, i) spreads it. Called every frame.
   */
  listen(analyser, dt) {
    let level = 0;
    let bright = 0.5;
    if (analyser) {
      const n = analyser.fftSize;
      this.buf ??= new Float32Array(n);
      this.spec ??= new Uint8Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += this.buf[i] * this.buf[i];
      level = Math.sqrt(sum / n);
      analyser.getByteFrequencyData(this.spec);
      const hz = analyser.context.sampleRate / analyser.fftSize;
      let lo = 0;
      let hi = 0;
      for (let i = Math.floor(250 / hz); i < Math.floor(1000 / hz); i++) lo += this.spec[i];
      for (let i = Math.floor(1200 / hz); i < Math.floor(3500 / hz); i++) hi += this.spec[i];
      bright = hi / (lo + hi + 1);
    }
    this.bright = bright;
    // loudness relative to this speaker's recent peaks (lines are mastered differently)
    this.peak = Math.max(this.peak * Math.exp(-dt * 0.4), level, 0.006);
    const v = level / this.peak;
    // fast attack, slower release: lips snap open and close a little softer
    this.level += (v - this.level) * Math.min(1, dt * (v > this.level ? 30 : 14));
    const was = this.level;
    // a nod on a stressed syllable
    if (v > 0.85 && this.lastV < 0.6) this.nod = 1;
    this.lastV = v;
    this.nod = Math.max(0, this.nod - dt * 4);
    // dark against this voice's usual colour = rounded lips (o, u); bright = spread (a, e)
    if (this.level > 0.5) this.brightAvg += (bright - this.brightAvg) * Math.min(1, dt * 1.5);
    let want = 'closed';
    if (was > 0.62) want = bright < this.brightAvg - 0.1 ? 'round' : 'open';
    else if (was > 0.25) want = bright < this.brightAvg - 0.14 ? 'round' : 'half';
    // hold a shape at least two frames so it does not flicker
    this.hold -= dt;
    if (want !== this.shape && this.hold <= 0) {
      this.shape = want;
      this.hold = 0.05;
    }
  }

  /** current link state for the display, or null when the channel is quiet */
  state(time) {
    if (!this.who) return null;
    if (time > this.until) {
      this.who = null;
      return null;
    }
    const f = this.faces[this.who];
    // blink every few seconds
    if (time > this.blinkAt + 0.14) this.blinkAt = time + 2.2 + Math.random() * 3.8;
    const blink = time > this.blinkAt && time < this.blinkAt + 0.14;
    const mouth = f.shapes[this.shape];
    return {
      who: this.who,
      ...SPEAKERS[this.who],
      face: ready(f.still) ? f.still : null,
      mouth: ready(mouth) ? mouth : null,
      eyes: blink && ready(f.eyes) ? f.eyes : null,
      nod: this.nod,
      talk: this.level,
      age: time - this.since,
      left: this.until - time,
    };
  }
}
