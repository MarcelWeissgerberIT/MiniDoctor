// DOM overlay: title screen, loading bar, help, crosshair, tooltip, radio log.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.title = $('title');
    this.bar = $('loadbar');
    this.start = $('start');
    this.help = $('help');
    this.cross = $('crosshair');
    this.tip = $('tooltip');
    this.log = $('comms');
    this.lock = $('lockhint');
    this.lines = [];
    this.title.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/ui/keyart.webp)`;
  }

  progress(p) {
    this.bar.style.width = `${Math.round(p * 100)}%`;
  }

  ready(onStart) {
    this.title.classList.add('loaded');
    this.start.disabled = false;
    this.start.textContent = 'Einsteigen';
    this.start.addEventListener('click', onStart, { once: true });
  }

  error(e) {
    this.start.textContent = 'Fehler beim Laden';
    this.title.querySelector('.sub').textContent = String(e?.message || e);
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

  hover(label, locked) {
    this.cross.classList.toggle('active', !!label);
    this.cross.classList.toggle('hidden', !locked);
    if (label) {
      this.tip.textContent = label;
      this.tip.classList.add('show');
    } else this.tip.classList.remove('show');
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
  }
}
