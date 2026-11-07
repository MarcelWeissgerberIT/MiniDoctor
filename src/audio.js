// WebAudio mixer: generated ambience loops (made seamless at runtime),
// footsteps, servos, start-up and a few synthesised cockpit sounds.

export class Sound {
  constructor(buffers) {
    this.raw = buffers;
    this.ctx = null;
    this.buf = {};
    this.muted = false;
  }

  async init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    // the cockpit muffles everything outside
    this.outside = c.createBiquadFilter();
    this.outside.type = 'lowpass';
    this.outside.frequency.value = 1400;
    this.outsideGain = c.createGain();
    this.outsideGain.gain.value = 0.9;
    this.outside.connect(this.outsideGain).connect(this.master);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    for (const [k, ab] of Object.entries(this.raw)) {
      try {
        this.buf[k] = await c.decodeAudioData(ab.slice(0));
      } catch (e) {
        console.warn('decode', k, e);
      }
    }
    for (const k of ['cockpit_hum', 'battle_far']) if (this.buf[k]) this.buf[k] = this.seamless(this.buf[k], 2.5);
    if (this.buf.servo) this.buf.servoLoop = this.seamless(this.buf.servo, 0.6);
    this.noise = this.makeNoise(2);
    if (c.state === 'suspended') await c.resume();
  }

  /** Crossfades the tail into the head so the buffer loops without a click. */
  seamless(b, xf) {
    const n = Math.min(Math.floor(xf * b.sampleRate), Math.floor(b.length / 3));
    const out = this.ctx.createBuffer(b.numberOfChannels, b.length - n, b.sampleRate);
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const src = b.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src.subarray(0, b.length - n));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        dst[i] = src[i] * Math.sqrt(t) + src[b.length - n + i] * Math.sqrt(1 - t);
      }
    }
    return out;
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  loop(name, gain, dest = this.master) {
    if (!this.ctx || !this.buf[name]) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name];
    s.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(dest);
    s.start();
    return { src: s, gain: g };
  }

  one(name, gain = 1, rate = 1, dest = this.master, delay = 0) {
    if (!this.ctx || !this.buf[name]) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name];
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(dest);
    s.start(this.ctx.currentTime + delay);
  }

  startAmbience() {
    if (!this.ctx || this.hum) return;
    this.hum = this.loop('cockpit_hum', 0.0);
    this.battle = this.loop('battle_far', 0.0, this.outside);
    this.servoL = this.loop('servoLoop', 0.0);
    const t = this.ctx.currentTime;
    this.hum?.gain.gain.linearRampToValueAtTime(0.55, t + 3);
    this.battle?.gain.gain.linearRampToValueAtTime(0.85, t + 4);
  }

  startup() {
    this.one('startup', 0.9);
  }

  footstep(strength) {
    this.one('footstep', 0.45 + strength * 0.55, 0.88 + Math.random() * 0.12);
    // sub-bass thump through the frame
    this.thump(55 + Math.random() * 10, 0.5 * strength, 0.35);
  }

  thump(freq, gain, dur, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** distant artillery: low-passed noise burst + sub thump, delayed by the speed of sound */
  boom(distance, strength) {
    if (!this.ctx) return;
    const c = this.ctx;
    const delay = Math.min(5, distance / 343);
    const t = c.currentTime + delay;
    const vol = Math.min(1, (strength * 260) / (distance + 60));
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(distance < 600 ? 500 : 220, t);
    f.frequency.exponentialRampToValueAtTime(60, t + 2.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 1.4, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    s.connect(f).connect(g).connect(this.outside);
    s.start(t);
    s.stop(t + 2.8);
    this.thump(38, vol * 0.9, 1.2, delay);
  }

  click(kind = 'toggle') {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'toggle' ? 2600 : 1500;
    f.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'toggle' ? 0.035 : 0.06));
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + 0.08);
    if (kind === 'toggle') this.thump(900, 0.06, 0.03);
  }

  beep(freq = 1200, dur = 0.12, gain = 0.12, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  alarm() {
    for (let i = 0; i < 3; i++) {
      this.beep(880, 0.16, 0.09, i * 0.36);
      this.beep(660, 0.16, 0.09, i * 0.36 + 0.18);
    }
  }

  update(state) {
    if (!this.ctx || !this.servoL) return;
    const t = this.ctx.currentTime;
    const servo = Math.min(1, Math.abs(state.turn) * 2.2 + state.lookRate * 0.25);
    this.servoL.gain.gain.setTargetAtTime(servo * 0.35, t, 0.08);
    this.servoL.src.playbackRate.setTargetAtTime(0.85 + servo * 0.3, t, 0.1);
    this.hum?.src.playbackRate.setTargetAtTime(1 + Math.abs(state.speed) * 0.006, t, 0.3);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
}
