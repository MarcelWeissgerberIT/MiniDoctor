// All sound is synthesised with WebAudio (no audio files needed).
export class Audio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(this.ctx.destination);
    // flow noise: brown noise → lowpass
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.flowFilter = this.ctx.createBiquadFilter();
    this.flowFilter.type = 'lowpass';
    this.flowFilter.frequency.value = 300;
    this.flowGain = this.ctx.createGain();
    this.flowGain.gain.value = 0;
    src.connect(this.flowFilter).connect(this.flowGain).connect(this.master);
    src.start();
  }
  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }
  /** flow 0..1 */
  setFlow(f) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.flowGain.gain.setTargetAtTime(0.05 + f * 0.25, t, 0.2);
    this.flowFilter.frequency.setTargetAtTime(180 + f * 500, t, 0.2);
  }
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  heartbeat() {
    this.tone(55, 0.16, 'sine', 0.5, -20);
    setTimeout(() => this.tone(48, 0.14, 'sine', 0.35, -15), 170);
  }
  sfx(name) {
    switch (name) {
      case 'shoot':
        return this.tone(900, 0.08, 'triangle', 0.08, -500);
      case 'pop':
        return this.tone(400, 0.12, 'square', 0.06, 300);
      case 'laser':
        return this.tone(1400, 0.5, 'sawtooth', 0.05, -900);
      case 'cut':
        return this.tone(2500, 0.12, 'triangle', 0.06, -2000);
      case 'anchor':
        this.tone(160, 0.15, 'square', 0.1, -60);
        return setTimeout(() => this.tone(120, 0.2, 'sine', 0.2), 120);
      case 'scan':
        return this.tone(700, 0.25, 'sine', 0.08, 500);
      case 'ok':
        this.tone(660, 0.12, 'sine', 0.12);
        return setTimeout(() => this.tone(990, 0.18, 'sine', 0.12), 110);
      case 'bad':
        this.tone(220, 0.25, 'sawtooth', 0.1, -80);
        return setTimeout(() => this.tone(160, 0.35, 'sawtooth', 0.1, -60), 200);
      case 'spray':
        return this.tone(3000, 0.4, 'sawtooth', 0.02, -2500);
      case 'tool':
        return this.tone(520, 0.07, 'sine', 0.08, 120);
      case 'alarm':
        return this.tone(880, 0.3, 'square', 0.06);
    }
  }
}
