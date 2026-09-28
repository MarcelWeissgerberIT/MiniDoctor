// Radio link to the (fictional) interventional radiologist who watches the
// procedure on the angiography monitors. Shown on the cockpit's top-left panel.
import { t, getLang } from './i18n.js';

const SCREEN = [70, 35, 400, 200]; // on the 2752×1536 cockpit image

export class Comm {
  constructor(cockpit, audio) {
    const frame = cockpit.frame;
    this.audio = audio;
    this.voice = true;
    this.el = document.createElement('div');
    this.el.className = 'comm';
    this.el.innerHTML = `
      <img class="comm-still" src="assets/doctor.webp" alt="">
      <video class="comm-talk" muted loop playsinline preload="auto"><source src="assets/doctor_talk.webm" type="video/webm"><source src="assets/doctor_talk.mp4" type="video/mp4"></video>
      <div class="comm-noise"></div>
      <div class="comm-top"><span class="comm-rec"></span><span class="comm-name"></span><span class="comm-bars"><i></i><i></i><i></i><i></i></span></div>`;
    frame.appendChild(this.el);
    this.sub = document.createElement('div');
    this.sub.className = 'comm-sub';
    frame.appendChild(this.sub);
    // keep screen + subtitles fully visible on any aspect ratio
    cockpit.addSafe(this.el, SCREEN, 'left', null, 'comm');
    cockpit.addSafe(this.sub, [0, 35, 0, 200], 'after', 'comm');
    this.video = this.el.querySelector('video');
    // without the talking loop the still portrait stays visible
    this.video.querySelector('source:last-child').addEventListener('error', () => this.el.classList.add('novideo'));
    this.queue = [];
    this.current = null;
    this.cooldown = new Map();
    this.idle = 0;
    this.el.querySelector('.comm-name').textContent = t('dr_name');
  }

  show(v) {
    this.el.style.display = v ? '' : 'none';
    this.sub.style.display = v ? '' : 'none';
  }

  /**
   * Queue a line. key = i18n key (or {text}); opts.priority: 2 = interrupts,
   * 1 = normal, 0 = only if idle; opts.cooldown in seconds per key.
   */
  say(key, vars, opts = {}) {
    const now = performance.now() / 1000;
    const cd = opts.cooldown ?? 20;
    if (typeof key === 'string' && (this.cooldown.get(key) ?? -1e9) > now - cd) return;
    if (typeof key === 'string') this.cooldown.set(key, now);
    const text = typeof key === 'string' ? t(key, vars) : key.text;
    const pr = opts.priority ?? 1;
    if (pr === 0 && (this.current || this.queue.length)) return;
    if (pr === 2) {
      this.queue = [];
      if (this.current) this.finish(true);
    }
    if (this.queue.length > 2) this.queue.shift();
    this.queue.push({ text });
  }

  start(item) {
    this.current = { ...item, shown: 0, t: 0, hold: 0 };
    this.el.classList.add('live');
    this.sub.classList.add('live');
    this.sub.innerHTML = `<b>${t('dr_short')}:</b> <span></span>`;
    this.audio.sfx('radio_on');
    this.video.currentTime = 0;
    this.video.play().catch(() => {});
    this.speaking = false;
    if (this.voice && this.audio.enabled && 'speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(item.text);
        const lang = getLang() === 'de' ? 'de' : 'en';
        u.lang = lang === 'de' ? 'de-DE' : 'en-US';
        const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang));
        if (v) u.voice = v;
        u.rate = 1.05;
        u.pitch = 1.05;
        u.volume = 0.9;
        u.onend = () => (this.speaking = false);
        this.speaking = true;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch {
        this.speaking = false;
      }
    }
  }

  finish(cut = false) {
    if (!this.current) return;
    if (cut && 'speechSynthesis' in window) speechSynthesis.cancel();
    this.current = null;
    this.video.pause();
    this.el.classList.remove('live');
    this.audio.sfx('radio_off');
    this.idle = 0;
  }

  update(dt) {
    if (!this.current && this.queue.length) this.start(this.queue.shift());
    const c = this.current;
    if (c) {
      c.t += dt;
      // typewriter subtitles
      const n = Math.min(c.text.length, Math.floor(c.t * 38));
      if (n !== c.shown) {
        c.shown = n;
        this.sub.querySelector('span').textContent = c.text.slice(0, n);
      }
      const typed = n >= c.text.length;
      if (typed && !this.speaking) c.hold += dt;
      if (c.hold > 2.2) this.finish();
    } else {
      this.idle += dt;
      if (this.idle > 6) this.sub.classList.remove('live');
    }
  }
}
