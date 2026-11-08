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
    this.viewsEl = $('views');
    this.arrowLabel = $('arrowlabel');
    this.title.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/ui/keyart.webp)`;
  }

  progress(p) {
    this.bar.style.width = `${Math.round(p * 100)}%`;
  }

  /** mission catalogue on the title screen; progress: { id: { done, best } } */
  ready(missions, progress, onStart, onFree) {
    this.title.classList.add('loaded');
    this.start.disabled = false;
    this.quick.disabled = false;
    const list = this.title.querySelector('.missions');
    const desc = this.title.querySelector('.mdesc');
    const want = +(new URLSearchParams(location.search).get('mission') || 1);
    let pick = missions.find((m) => m.num === want) || missions[0];
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const select = (m) => {
      pick = m;
      list.querySelectorAll('li').forEach((li) => li.classList.toggle('sel', li.dataset.id === m.id));
      desc.textContent = m.desc;
      this.start.textContent = `Mission ${m.num} starten`;
    };
    list.innerHTML = '';
    for (const m of missions) {
      const li = document.createElement('li');
      li.dataset.id = m.id;
      const done = progress[m.id]?.done;
      li.innerHTML = `<span class="num">${m.num}</span><span class="info"><span class="mtag"></span><span class="mname"></span></span><span class="meta"></span>`;
      li.querySelector('.mtag').textContent = m.tag;
      li.querySelector('.mname').textContent = m.name;
      const meta = li.querySelector('.meta');
      meta.textContent = `${'★'.repeat(m.diff)}${'☆'.repeat(3 - m.diff)}${m.lance ? ` · Lanze ${m.lance + 1}` : ''}`;
      if (done) {
        const b = document.createElement('span');
        b.className = 'done';
        b.textContent = progress[m.id].best ? `✓ ${fmt(progress[m.id].best)}` : '✓';
        meta.appendChild(b);
      }
      li.addEventListener('click', () => select(m));
      li.addEventListener('dblclick', () => this.start.click());
      list.appendChild(li);
    }
    select(pick);
    this.start.addEventListener('click', () => onStart(pick), { once: true });
    this.quick.addEventListener('click', onFree, { once: true });
  }

  /** end of a fight: title, stats, retry / menu */
  result({ win, rows, tag, sub }, onRetry, onMenu) {
    const el = $('result');
    el.classList.toggle('win', win);
    el.classList.toggle('lose', !win);
    el.querySelector('.rtag').textContent = tag || '';
    el.querySelector('h2').textContent = win ? 'MISSION ERFÜLLT' : 'MECH ZERSTÖRT';
    el.querySelector('.rsub').textContent = sub || (win ? 'Ziel erreicht.' : 'BB-07 ist ausgefallen. Mission fehlgeschlagen.');
    const t = el.querySelector('table');
    t.innerHTML = '';
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      const b = document.createElement('td');
      a.textContent = k;
      b.textContent = v;
      tr.append(a, b);
      t.appendChild(tr);
    }
    $('retry').onclick = onRetry;
    $('menu').onclick = onMenu;
    el.classList.add('show');
    this.checklist(null);
  }

  hideResult() {
    $('result').classList.remove('show');
    $('dmg').className = '';
    this.fade(0, 0.6);
  }

  /** cabin smoke from a fire (0..1) */
  smoke(level) {
    const el = $('smoke');
    const v = String(Math.round(level * 100) / 100);
    if (el.style.opacity !== v) el.style.opacity = v;
  }

  /** the extinguisher fogs the cabin for a moment */
  extinguish() {
    const el = $('foam');
    el.classList.remove('burst');
    void el.offsetWidth;
    el.classList.add('burst');
  }

  /** red flash at the edges on a hit; dead = stays red */
  damageFlash(dead) {
    const el = $('dmg');
    el.className = '';
    void el.offsetWidth;
    el.className = dead ? 'dead' : 'hit';
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

  /** label: control under the crosshair/cursor; center: crosshair mode; mouse: cursor position (NDC) */
  hover(label, center, mouse) {
    this.cross.classList.toggle('active', !!label);
    this.cross.classList.toggle('hidden', !center);
    document.body.classList.toggle('hovering', !!label && !center);
    if (label) {
      this.tip.textContent = label;
      this.tip.classList.add('show');
      if (!center && mouse) {
        this.tip.style.left = `${((mouse.x + 1) / 2) * innerWidth}px`;
        this.tip.style.top = `${((1 - mouse.y) / 2) * innerHeight + 26}px`;
      } else {
        this.tip.style.left = '';
        this.tip.style.top = '';
      }
    } else this.tip.classList.remove('show');
  }

  showVideo(show) {
    document.getElementById('videolayer').classList.toggle('show', show);
  }

  /** bar with the panel focus views */
  showViews(show, onPick) {
    this.viewsEl.classList.toggle('show', show);
    if (onPick && !this.viewsBound) {
      this.viewsBound = true;
      this.viewsEl.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          onPick(b.dataset.view);
        }),
      );
    }
  }

  setView(name) {
    this.viewsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    document.body.classList.toggle('focusview', name !== 'front');
  }

  /** highlight the view button the tutorial wants */
  viewHint(name) {
    this.viewsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('hint', b.dataset.view === name));
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
  checklist(steps, current, title) {
    if (!steps) {
      this.card.classList.remove('show');
      return;
    }
    if (title) this.card.querySelector('header span').textContent = title;
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
  arrow(angle, label = null) {
    this.arrowLabel.textContent = label || '';
    this.arrowLabel.classList.toggle('show', !!label && angle != null);
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
