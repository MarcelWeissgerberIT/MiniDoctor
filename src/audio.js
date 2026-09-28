// Sound: music + ambience beds come from OpenArt generations (audio tracks
// extracted to .m4a, see tools/process-audio.mjs); short event effects are
// synthesised with WebAudio so they stay exactly in sync with the game.

const TRACKS = ['music_venous', 'music_arterial', 'amb_heart', 'amb_lung'];
const FORMATS = ['ogg', 'm4a']; // Opus first, AAC as fallback

/** Loops a decoded buffer with overlapping crossfades (AI music rarely loops cleanly). */
class LoopLayer {
  constructor(ctx, out, buffer, fade = 3) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.fade = Math.min(fade, buffer.duration / 4);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    this.voices = [];
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.schedule(this.ctx.currentTime + 0.05, true);
  }
  schedule(at, first = false) {
    if (!this.running) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    const g = this.ctx.createGain();
    const d = this.buffer.duration;
    const f = this.fade;
    g.gain.setValueAtTime(first ? 1 : 0, at);
    if (!first) g.gain.linearRampToValueAtTime(1, at + f);
    g.gain.setValueAtTime(1, at + d - f);
    g.gain.linearRampToValueAtTime(0, at + d);
    src.connect(g).connect(this.gain);
    src.start(at);
    src.stop(at + d + 0.05);
    this.voices.push(src);
    src.onended = () => (this.voices = this.voices.filter((v) => v !== src));
    // next copy starts while this one fades out
    const next = at + d - f;
    this.timer = setTimeout(() => this.schedule(next), Math.max(0, (next - this.ctx.currentTime - 0.5) * 1000));
  }
  level(v, time = 1.5) {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, time / 3);
  }
  stop(time = 2) {
    this.level(0, time);
    setTimeout(() => {
      if (this.gain.gain.value > 0.01) return; // was restarted meanwhile
      this.running = false;
      clearTimeout(this.timer);
      for (const v of this.voices) {
        try {
          v.stop();
        } catch {}
      }
      this.voices = [];
    }, time * 1000 + 300);
  }
}

export class Audio {
  constructor() {
    this.enabled = true;
    this.musicOn = true;
    this.ctx = null;
    this.buffers = {};
    this.layers = {};
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
    this.master.gain.value = this.enabled ? 0.7 : 0;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
    this.musicBus.connect(this.master);
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.7;
    this.ambBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    // flow noise: brown noise → lowpass (pitch follows vessel width + speed)
    this.noiseBuf = this.makeNoise(2, true);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.flowFilter = this.ctx.createBiquadFilter();
    this.flowFilter.type = 'lowpass';
    this.flowFilter.frequency.value = 300;
    this.flowFilter.Q.value = 0.7;
    this.flowGain = this.ctx.createGain();
    this.flowGain.gain.value = 0;
    src.connect(this.flowFilter).connect(this.flowGain).connect(this.sfxBus);
    src.start();
    this.load();
  }

  makeNoise(seconds, brown) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  async load() {
    await Promise.all(
      TRACKS.map(async (k) => {
        for (const ext of FORMATS) {
          try {
            const res = await fetch(`assets/audio/${k}.${ext}`);
            if (!res.ok) continue;
            this.buffers[k] = await this.ctx.decodeAudioData(await res.arrayBuffer());
            return;
          } catch {
            // undecodable in this browser → try the next format
          }
        }
        // no format worked → the game simply plays without this track
      }),
    );
    // apply whatever was requested while loading
    if (this.wanted) this.setScene(this.wanted);
  }

  layer(name, out) {
    if (!this.layers[name] && this.buffers[name]) this.layers[name] = new LoopLayer(this.ctx, out, this.buffers[name]);
    return this.layers[name];
  }

  /**
   * Scene mix: { music: 'venous'|'arterial'|null, heart: 0..1, lung: 0..1 }.
   * Crossfades music themes and ambience beds.
   */
  setScene(scene) {
    this.wanted = { ...scene };
    if (!this.ctx) return;
    for (const theme of ['venous', 'arterial']) {
      const l = this.layer(`music_${theme}`, this.musicBus);
      if (!l) continue;
      if (scene.music === theme) {
        l.start();
        l.level(scene.musicLevel ?? 1, 3);
      } else if (l.running) l.stop(3);
    }
    for (const [k, v] of [
      ['amb_heart', scene.heart ?? 0],
      ['amb_lung', scene.lung ?? 0],
    ]) {
      const l = this.layer(k, this.ambBus);
      if (!l) continue;
      if (v > 0.01) {
        l.start();
        l.level(v, 1.5);
      } else if (l.running) l.stop(2);
    }
  }
  stopScene() {
    this.setScene({ music: null, heart: 0, lung: 0 });
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(v) {
    this.musicOn = v;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v ? 0.55 : 0, this.ctx.currentTime, 0.2);
  }

  /** flow 0..1; narrow 0..1 (1 = capillary) raises the pitch → whistling squeeze */
  setFlow(f, narrow = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.flowGain.gain.setTargetAtTime(0.05 + f * 0.25 + narrow * 0.08, t, 0.2);
    this.flowFilter.frequency.setTargetAtTime(180 + f * 500 + narrow * 1400, t, 0.3);
    this.flowFilter.Q.setTargetAtTime(0.7 + narrow * 6, t, 0.3);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** filtered noise burst (whooshes, valve slaps, air) */
  noise(dur, { from = 400, to = 2000, q = 1, vol = 0.2, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseWhite ?? (this.noiseWhite = this.makeNoise(2, false));
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  heartbeat(vol = 1) {
    this.tone(55, 0.16, 'sine', 0.5 * vol, -20);
    this.tone(48, 0.14, 'sine', 0.35 * vol, -15, 0.17);
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
        return this.tone(120, 0.2, 'sine', 0.2, 0, 0.12);
      case 'scan':
        return this.tone(700, 0.25, 'sine', 0.08, 500);
      case 'ok':
        this.tone(660, 0.12, 'sine', 0.12);
        return this.tone(990, 0.18, 'sine', 0.12, 0, 0.11);
      case 'bad':
        this.tone(220, 0.25, 'sawtooth', 0.1, -80);
        return this.tone(160, 0.35, 'sawtooth', 0.1, -60, 0.2);
      case 'spray':
        return this.noise(0.45, { from: 5000, to: 2500, q: 0.8, vol: 0.12, type: 'highpass' });
      case 'tool':
        return this.tone(520, 0.07, 'sine', 0.08, 120);
      case 'alarm':
        return this.tone(880, 0.3, 'square', 0.06);
      // --- journey ---
      case 'station': // soft two-note bell
        this.tone(784, 0.9, 'sine', 0.07);
        this.tone(1568, 0.6, 'sine', 0.025);
        return this.tone(1175, 1.1, 'sine', 0.06, 0, 0.14);
      case 'valve': // leaflets slap shut behind us + rush of blood
        this.noise(0.5, { from: 300, to: 1800, q: 0.9, vol: 0.28 });
        this.tone(90, 0.18, 'sine', 0.35, -40, 0.28);
        return this.noise(0.12, { from: 900, to: 400, q: 2, vol: 0.18, delay: 0.28 });
      case 'surge': // pulse wave in an artery
        return this.noise(0.35, { from: 200, to: 900, q: 0.7, vol: 0.09, type: 'lowpass' });
      case 'swish': // a red cell passing close by
        return this.noise(0.25, { from: 600 + Math.random() * 600, to: 250, q: 3, vol: 0.05 });
      case 'oxygen': // gas exchange sparkle
        for (let i = 0; i < 5; i++) this.tone(1800 + Math.random() * 1400, 0.25, 'sine', 0.025, 300, i * 0.07);
        return;
      case 'arrive': // arrival chord
        this.tone(392, 1.6, 'triangle', 0.06);
        this.tone(494, 1.6, 'triangle', 0.05, 0, 0.12);
        this.tone(587, 1.8, 'triangle', 0.05, 0, 0.24);
        return this.tone(784, 2, 'sine', 0.05, 0, 0.36);
    }
  }
}
