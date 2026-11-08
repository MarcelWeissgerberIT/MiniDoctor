// Radio video link: when someone talks on the radio, their face appears on the left
// display (instructor from the command bunker, wingmen from their cockpits).
const BASE = import.meta.env.BASE_URL + 'assets/';

export const SPEAKERS = {
  instructor: { name: 'AUSBILDER', channel: 'KANAL 1 · KOMMANDO' },
  h2: { name: 'HAMMER 2', channel: 'KANAL 2 · LANZE' },
  h3: { name: 'HAMMER 3', channel: 'KANAL 2 · LANZE' },
};

/** which face goes with a radio line */
export function speakerOf(key) {
  if (key.startsWith('w2_')) return 'h2';
  if (key.startsWith('w3_')) return 'h3';
  return 'instructor';
}

export class Comms {
  constructor() {
    this.faces = {};
    for (const id of Object.keys(SPEAKERS)) {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      for (const [ext, type] of [
        ['webm', 'video/webm'],
        ['mp4', 'video/mp4'],
      ]) {
        const s = document.createElement('source');
        s.src = `${BASE}video/face_${id}.${ext}`;
        s.type = type;
        video.appendChild(s);
      }
      const still = new Image();
      still.src = `${BASE}faces/${id}.webp`;
      this.faces[id] = { video, still };
    }
    this.who = null;
    this.until = 0;
    this.since = 0;
  }

  /** someone starts talking for `seconds` (time: game clock) */
  start(who, seconds, time) {
    const f = this.faces[who];
    if (!f) return;
    if (this.who && this.who !== who) this.faces[this.who].video.pause();
    if (this.who !== who || time > this.until) {
      this.since = time;
      try {
        f.video.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
    }
    this.who = who;
    this.until = time + seconds + 0.6;
    f.video.play()?.catch?.(() => {});
  }

  /** current link state for the display, or null when the channel is quiet */
  state(time) {
    if (!this.who) return null;
    if (time > this.until) {
      this.faces[this.who].video.pause();
      this.who = null;
      return null;
    }
    const f = this.faces[this.who];
    const video = f.video.readyState >= 2 ? f.video : null;
    return { who: this.who, ...SPEAKERS[this.who], video, still: f.still, age: time - this.since, left: this.until - time };
  }
}
