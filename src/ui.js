// DOM overlay: title screen, loading bar, help, crosshair, tooltip, radio log,
// subtitles, the tutorial checklist card, the target arrow and screen fades.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.title = $('title');
    this.bar = $('loadbar');
    this.start = $('start');
    this.quick = $('quick');
    this.help = $('help');
    this.cross = $('crosshair');
    this.tip = $('tooltip');
    this.log = $('comms');
    this.lock = $('lockhint');
    this.sub = $('subtitle');
    this.card = $('checklist');
    this.arrowEl = $('arrow');
    this.fadeEl = $('fade');
    this.skipEl = $('skiphint');
    this.lines = [];
    this.subUntil = 0;
    this.title.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/ui/keyart.webp)`;
  }

  progress(p) {
    this.bar.style.width = `${Math.round(p * 100)}%`;
  }

  ready(onMission, onFree) {
    this.title.classList.add('loaded');
    this.start.disabled = false;
    this.quick.disabled = false;
    this.start.textContent = 'Mission starten';
    this.start.addEventListener('click', onMission, { once: true });
    this.quick.addEventListener('click', onFree, { once: true });
  }

  error(e) {
    this.start.textContent = 'Fehler beim Laden';
    this.title.querySelector('.mission p').textContent = String(e?.message || e);
  }

  hideTitle() {
    this.title.classList.add('hidden');
    document.body.classList.add('playing');
  }

  toggleHelp() {
    this.help.classList.toggle('show');
  }

  lockHint(show) {
    this.lock.classList.toggle('show', show);
  }

  skipHint(show) {
    this.skipEl.classList.toggle('show', show);
  }

  /** fade to black (1) or back (0) over dur seconds */
  fade(to, dur) {
    this.fadeEl.style.transition = `opacity ${dur}s ease`;
    this.fadeEl.style.opacity = String(to);
  }

  hover(label, locked) {
    this.cross.classList.toggle('active', !!label);
    this.cross.classList.toggle('hidden', !locked);
    if (label) {
      this.tip.textContent = label;
      this.tip.classList.add('show');
    } else this.tip.classList.remove('show');
  }

  subtitle(text, seconds) {
    this.sub.innerHTML = '';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = 'AUSBILDER';
    this.sub.append(who, document.createTextNode(text));
    this.sub.classList.add('show');
    this.subUntil = performance.now() + seconds * 1000;
  }

  /** steps: tutorial steps, current: index; null hides the card */
  checklist(steps, current) {
    if (!steps) {
      this.card.classList.remove('show');
      return;
    }
    this.card.classList.add('show');
    const list = this.card.querySelector('ol');
    list.innerHTML = '';
    steps.forEach((s, i) => {
      if (s.id === 'intro' || s.id === 'end') return;
      const li = document.createElement('li');
      li.className = i < current ? (i >= current - 2 ? 'done recent' : 'done') : i === current ? 'now' : '';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = s.title;
      li.appendChild(t);
      if (i === current) {
        const d = document.createElement('div');
        d.className = 'd';
        d.textContent = s.text;
        li.appendChild(d);
      }
      list.appendChild(li);
    });
    const now = list.querySelector('.now');
    now?.scrollIntoView?.({ block: 'nearest' });
    this.card.querySelector('.state').textContent = current >= steps.length - 1 ? 'ABGESCHLOSSEN' : `${Math.max(0, current)} / ${steps.length - 2}`;
  }

  /** angle (radians, screen space) of the direction to look, or null */
  arrow(angle) {
    if (angle == null) {
      this.arrowEl.classList.remove('show');
      return;
    }
    const r = Math.min(innerWidth, innerHeight) * 0.36;
    const x = innerWidth / 2 + Math.cos(angle) * r;
    const y = innerHeight / 2 - Math.sin(angle) * r;
    this.arrowEl.style.transform = `translate(${x}px, ${y}px) rotate(${-angle}rad)`;
    this.arrowEl.classList.add('show');
  }

  comms(text) {
    const el = document.createElement('div');
    el.className = 'line';
    el.textContent = text;
    this.log.appendChild(el);
    this.lines.push({ el, t: performance.now() });
    while (this.lines.length > 4) this.lines.shift().el.remove();
  }

  update() {
    const now = performance.now();
    for (const l of this.lines) if (now - l.t > 9000) l.el.classList.add('fade');
    if (this.subUntil && now > this.subUntil) {
      this.sub.classList.remove('show');
      this.subUntil = 0;
    }
  }
}
