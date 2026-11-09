// WebAudio mixer: generated ambience loops (made seamless at runtime),
// footsteps, servos, start-up and a few synthesised cockpit sounds.

const RADIO_CURVE = (() => {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.3) / Math.tanh(1.3);
  }
  return c;
})();

/** Instructor on the radio: band-limited, slightly overdriven, with squelch clicks and subtitles. */
export class Radio {
  constructor(sound, ui) {
    this.sound = sound;
    this.ui = ui;
    this.current = null;
  }

  say(key, text) {
    const s = this.sound;
    const buf = s.buf?.[key];
    const dur = buf ? buf.duration : Math.max(2.5, text.length * 0.065);
    this.ui.subtitle(text, dur + 0.6);
    if (!s.ctx || !buf) return dur;
    const c = s.ctx;
    if (this.current) {
      try {
        this.current.stop();
      } catch {}
    }
    const t = c.currentTime + 0.12;
    const src = c.createBufferSource();
    src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    const shaper = c.createWaveShaper();
    shaper.curve = RADIO_CURVE;
    const g = c.createGain();
    g.gain.value = 1.15;
    src.connect(hp).connect(lp).connect(shaper).connect(g).connect(s.voiceGain || s.master);
    // the raw voice also feeds an analyser: the portrait on the radio display moves its lips to it
    if (!s.voiceAnalyser) {
      s.voiceAnalyser = c.createAnalyser();
      s.voiceAnalyser.fftSize = 1024;
      s.voiceAnalyser.smoothingTimeConstant = 0.1;
      const sink = c.createGain();
      sink.gain.value = 0;
      s.voiceAnalyser.connect(sink).connect(c.destination);
    }
    src.connect(s.voiceAnalyser);
    src.start(t);
    this.current = src;
    this.squelch(t - 0.1);
    this.squelch(t + dur + 0.02);
    // faint hiss under the voice
    const hiss = c.createBufferSource();
    hiss.buffer = s.noise;
    const hf = c.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 2400;
    const hg = c.createGain();
    hg.gain.value = 0.01;
    hiss.connect(hf).connect(hg).connect(s.master);
    hiss.start(t, Math.random());
    hiss.stop(t + dur);
    return dur;
  }

  squelch(t) {
    const c = this.sound.ctx;
    const s = c.createBufferSource();
    s.buffer = this.sound.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    s.connect(f).connect(g).connect(this.sound.master);
    s.start(t, Math.random());
    s.stop(t + 0.1);
  }
}

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
    this.voiceGain = c.createGain();
    this.voiceGain.connect(this.master);
    for (const [k, ab] of Object.entries(this.raw)) {
      try {
        this.buf[k] = await c.decodeAudioData(ab.slice(0));
      } catch (e) {
        console.warn('decode', k, e);
      }
    }
    for (const k of ['cockpit_hum', 'battle_far', 'base_ambience']) if (this.buf[k]) this.buf[k] = this.seamless(this.buf[k], 2.5);
    if (this.buf.walk_gravel) this.buf.walk_gravel = this.seamless(this.buf.walk_gravel, 0.5);
    if (this.buf.drone_loop) this.buf.drone_loop = this.seamless(this.buf.drone_loop, 0.8);
    // the loops of the worlds and the new kit
    for (const k of ['amb_jungle', 'amb_desert', 'rain_loop', 'sandstorm_loop']) if (this.buf[k]) this.buf[k] = this.seamless(this.buf[k], 2);
    for (const k of ['flamer', 'heli_loop']) if (this.buf[k]) this.buf[k] = this.seamless(this.buf[k], 0.6);
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

  one(name, gain = 1, rate = 1, dest = this.master, delay = 0, pan = 0) {
    if (!this.ctx || !this.buf[name]) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name];
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    let node = s.connect(g);
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(dest || this.master);
    s.start(this.ctx.currentTime + delay);
  }

  /** loops that run for the whole game; their levels are driven by update() */
  startAmbience() {
    if (!this.ctx || this.hum) return;
    this.hum = this.loop('cockpit_hum', 0.0);
    this.battle = this.loop('battle_far', 0.0, this.outside);
    this.servoL = this.loop('servoLoop', 0.0);
    this.base = this.loop('base_ambience', 0.0);
    this.walk = this.loop('walk_gravel', 0.0);
    // the world's own sound: rainforest or desert wind (muffled in the cabin like the battle)
    if (this.worldLoop && this.buf[this.worldLoop]) this.world = this.loop(this.worldLoop, 0.0, this.outside);
    // APU: spool-up clip, then loop its steady tail (see apuRun)
    this.apu = { gain: this.ctx.createGain(), src: null, on: false };
    this.apu.gain.gain.value = 0;
    this.apu.gain.connect(this.master);
    this.levels = { hum: 0, battle: 0, base: 0, walk: 0 };
  }

  /** radio lines that are not loaded with the game (the campaign's): fetched on demand */
  async loadVoices(keys) {
    const base = import.meta.env.BASE_URL + 'assets/voice/';
    await Promise.all(
      keys
        .filter((k) => !this.buf[k] && !this.raw[k])
        .map(async (k) => {
          try {
            const r = await fetch(base + k + '.mp3');
            if (!r.ok) return;
            const ab = await r.arrayBuffer();
            if (this.ctx) this.buf[k] = await this.ctx.decodeAudioData(ab);
            else this.raw[k] = ab; // decoded by init()
          } catch (e) {
            console.warn('voice missing', k);
          }
        }),
    );
  }

  /** rain drumming on the canopy or the sandstorm howling outside; null fades it out */
  setWeather(kind) {
    if (!this.ctx) return;
    const name = kind === 'rain' ? 'rain_loop' : kind === 'sandstorm' ? 'sandstorm_loop' : null;
    if ((this.weatherLoop?.name ?? null) === name) return;
    const old = this.weatherLoop;
    if (old) {
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      setTimeout(() => {
        try {
          old.src.stop();
        } catch {}
      }, 2500);
    }
    this.weatherLoop = null;
    if (!name || !this.buf[name]) return;
    const l = this.loop(name, 0);
    l.name = name;
    l.gain.gain.setTargetAtTime(kind === 'rain' ? 0.5 : 0.6, this.ctx.currentTime, 1.2);
    this.weatherLoop = l;
  }

  /** inside: 0 = standing outside, 1 = in the cockpit with the hatch closed */
  setMix({ hum = 0, battle = 0.85, base = 0, walk = 0 }) {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime;
    this.hum.gain.gain.setTargetAtTime(hum, t, 0.6);
    this.battle?.gain.gain.setTargetAtTime(battle, t, 0.6);
    this.world?.gain.gain.setTargetAtTime(0.35 + base * 0.4 + battle * 0.25, t, 0.8);
    this.base?.gain.gain.setTargetAtTime(base, t, 0.6);
    this.walk?.gain.gain.setTargetAtTime(walk, t, 0.12);
    this.outside.frequency.setTargetAtTime(base > 0.2 ? 9000 : 1400, t, 0.4);
  }

  /** APU on/off: plays the spool-up and then loops the steady part of the clip */
  apuRun(on) {
    if (!this.apu || !this.buf.apu_start || on === this.apu.on) return;
    const t = this.ctx.currentTime;
    if (on) {
      try {
        this.apu.src?.stop(t + 1.5);
      } catch {}
      const b = this.buf.apu_start;
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.loopStart = Math.max(0, b.duration - 3.5);
      s.loopEnd = b.duration - 0.3;
      s.connect(this.apu.gain);
      s.start();
      this.apu.src = s;
    }
    this.apu.on = on;
    this.apu.gain.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 0.05 : 1.2);
  }

  startup() {
    this.one('startup', 0.9);
  }

  /** foot: +1 right, -1 left -> panned to that side */
  footstep(strength, foot = 0) {
    // an 18 t, 5 m machine: a bit higher pitched than a giant
    this.one('footstep', 0.35 + strength * 0.45, 1.05 + Math.random() * 0.12, undefined, 0, foot * 0.35);
    this.thump(70 + Math.random() * 12, 0.35 * strength, 0.25);
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

  /** a spent case hits the ground (size 1 = 30 mm, smaller = MG) */
  tink(size = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + 0.01;
    const big = size > 0.5;
    for (const [f, g] of [
      [big ? 2300 : 4200, 0.045],
      [big ? 3650 : 6300, 0.025],
    ]) {
      const o = c.createOscillator();
      o.frequency.value = f * (0.94 + Math.random() * 0.12);
      const gn = c.createGain();
      gn.gain.setValueAtTime(g * (big ? 1 : 0.5), t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.22 : 0.12));
      o.connect(gn).connect(this.master);
      o.start(t);
      o.stop(t + 0.25);
    }
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
    this.hum?.src.playbackRate.setTargetAtTime(0.85 + (state.reactor ?? 0.35) * 0.45 + Math.abs(state.speed) * 0.006, t, 0.3);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
}
