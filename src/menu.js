// Settings, achievements and the pause menu: what a store release expects from a game.
// Everything is kept in localStorage; achievement ids are stable so they can be mapped
// onto Steam achievements later (see docs/STEAM.md).

const SETTINGS_KEY = 'battlebot-settings';
const ACH_KEY = 'battlebot-achievements';

export const DEFAULT_SETTINGS = {
  quality: 'high', // low | medium | high
  fov: 70,
  sens: 1,
  invertY: false,
  volume: 0.9,
  voice: 1,
  subtitles: true,
  bob: 1, // head and cabin motion (lower against motion sickness)
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export const ACHIEVEMENTS = [
  { id: 'coldstart', name: 'Kalt & dunkel', desc: 'Den Reaktor aus dem kalten Zustand zünden.' },
  { id: 'training', name: 'Grundausbildung', desc: 'Mission 1 abschließen.' },
  { id: 'win_m2', name: 'Feuertaufe', desc: 'Mission 2 gewinnen.' },
  { id: 'win_m3', name: 'Schulter an Schulter', desc: 'Mission 3 gewinnen.' },
  { id: 'win_m4', name: 'Kein Nachschub', desc: 'Mission 4 gewinnen.' },
  { id: 'win_m5', name: 'Unsichtbar', desc: 'Mission 5 gewinnen.' },
  { id: 'rear', name: 'Heckschuss', desc: 'Einen Panzer mit einem Treffer ins Heck zerstören.' },
  { id: 'top', name: 'Von oben', desc: 'Einen Panzer im Steilangriff zerstören.' },
  { id: 'drone', name: 'Fliegendes Auge', desc: '10 Ziele mit der Drohne markieren.', goal: 10, counter: 'marks' },
  { id: 'fire', name: 'Brandmeister', desc: 'Einen echten Brand an Bord löschen.' },
  { id: 'untouched', name: 'Unberührt', desc: 'Eine Kampfmission ohne einen einzigen Treffer gewinnen.' },
  { id: 'lance', name: 'Niemand bleibt zurück', desc: 'Mit Lanze gewinnen, ohne einen Flügelmann zu verlieren.' },
  { id: 'dodge', name: 'Ausweichkünstler', desc: '25 Granaten knapp an sich vorbeipfeifen lassen.', goal: 25, counter: 'whizz' },
  { id: 'ace', name: 'Ass', desc: '25 Abschüsse insgesamt.', goal: 25, counter: 'kills' },
];

export class Achievements {
  constructor(toast) {
    this.toast = toast;
    try {
      this.data = JSON.parse(localStorage.getItem(ACH_KEY) || '{}');
    } catch {
      this.data = {};
    }
    this.data.unlocked ??= {};
    this.data.counters ??= {};
  }

  save() {
    try {
      localStorage.setItem(ACH_KEY, JSON.stringify(this.data));
    } catch {}
  }

  has(id) {
    return !!this.data.unlocked[id];
  }

  unlock(id) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || this.has(id)) return false;
    this.data.unlocked[id] = Date.now();
    this.save();
    this.toast?.(a);
    // a desktop build hands this on to Steamworks (window.steam is set by the wrapper)
    window.steam?.activateAchievement?.(id);
    return true;
  }

  /** a running total (kills, drone marks, near misses); unlocks what it reaches */
  count(counter, n = 1) {
    const c = this.data.counters;
    c[counter] = (c[counter] || 0) + n;
    this.save();
    for (const a of ACHIEVEMENTS) if (a.counter === counter && c[counter] >= a.goal) this.unlock(a.id);
  }

  list() {
    return ACHIEVEMENTS.map((a) => ({ ...a, done: this.has(a.id), progress: a.counter ? Math.min(a.goal, this.data.counters[a.counter] || 0) : null }));
  }
}

/** the overlay: pause buttons, settings form and achievement list in one box */
export class Menu {
  constructor({ settings, achievements, onChange, onResume, onRestart, onQuit, onHelp }) {
    this.settings = settings;
    this.ach = achievements;
    this.cb = { onChange, onResume, onRestart, onQuit, onHelp };
    const el = document.createElement('section');
    el.id = 'menu';
    el.innerHTML = `<div class="box"><div class="mtabs"></div><div class="mbody"></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.tabs = el.querySelector('.mtabs');
    this.body = el.querySelector('.mbody');
    this.open = false;
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  show(page = 'pause', { inGame = true, canRestart = false } = {}) {
    this.inGame = inGame;
    this.canRestart = canRestart;
    this.open = true;
    this.el.classList.add('show');
    this.page(page);
  }

  hide() {
    this.open = false;
    this.el.classList.remove('show');
  }

  page(p) {
    this.current = p;
    const tabs = [
      ...(this.inGame ? [['pause', 'PAUSE']] : []),
      ['settings', 'EINSTELLUNGEN'],
      ['ach', 'ERFOLGE'],
    ];
    this.tabs.innerHTML = '';
    for (const [id, label] of tabs) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = id === p ? 'on' : '';
      b.onclick = () => this.page(id);
      this.tabs.appendChild(b);
    }
    if (!this.inGame) {
      const x = document.createElement('button');
      x.textContent = '✕';
      x.className = 'close';
      x.onclick = () => this.hide();
      this.tabs.appendChild(x);
    }
    this.body.innerHTML = '';
    if (p === 'pause') this.drawPause();
    if (p === 'settings') this.drawSettings();
    if (p === 'ach') this.drawAch();
  }

  button(label, fn, cls = '') {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.onclick = fn;
    this.body.appendChild(b);
    return b;
  }

  drawPause() {
    const h = document.createElement('h2');
    h.textContent = 'Pause';
    this.body.appendChild(h);
    this.button('Fortsetzen', () => this.cb.onResume(), 'primary');
    this.button('Einstellungen', () => this.page('settings'));
    this.button('Erfolge', () => this.page('ach'));
    this.button('Steuerung', () => this.cb.onHelp());
    if (this.canRestart) this.button('Mission neu starten', () => this.cb.onRestart());
    this.button('Hauptmenü', () => this.cb.onQuit());
  }

  drawSettings() {
    const s = this.settings;
    const form = document.createElement('div');
    form.className = 'settings';
    const row = (label, input, out) => {
      const r = document.createElement('label');
      const t = document.createElement('span');
      t.textContent = label;
      r.append(t, input);
      if (out) r.append(out);
      form.appendChild(r);
    };
    const changed = () => {
      saveSettings(s);
      this.cb.onChange(s);
    };
    const range = (label, key, min, max, step, fmt) => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = min;
      i.max = max;
      i.step = step;
      i.value = s[key];
      const o = document.createElement('output');
      o.textContent = fmt(s[key]);
      i.oninput = () => {
        s[key] = +i.value;
        o.textContent = fmt(s[key]);
        changed();
      };
      row(label, i, o);
    };
    const check = (label, key) => {
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.checked = s[key];
      i.onchange = () => {
        s[key] = i.checked;
        changed();
      };
      row(label, i);
    };
    const sel = document.createElement('select');
    for (const [v, t] of [
      ['low', 'Niedrig (schnell)'],
      ['medium', 'Mittel'],
      ['high', 'Hoch'],
    ]) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      sel.appendChild(o);
    }
    sel.value = s.quality;
    sel.onchange = () => {
      s.quality = sel.value;
      changed();
    };
    row('Grafikqualität', sel);
    range('Sichtfeld', 'fov', 55, 95, 1, (v) => `${v}°`);
    range('Mausempfindlichkeit', 'sens', 0.3, 2.5, 0.05, (v) => `${v.toFixed(2)}×`);
    check('Maus Y invertieren', 'invertY');
    range('Kopf- und Kabinenbewegung', 'bob', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`);
    range('Lautstärke', 'volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`);
    range('Funk / Stimmen', 'voice', 0, 1.5, 0.05, (v) => `${Math.round(v * 100)} %`);
    check('Untertitel', 'subtitles');
    this.body.appendChild(form);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Wenig Kopfbewegung hilft gegen Reiseübelkeit. Alles wird sofort übernommen und gespeichert.';
    this.body.appendChild(note);
  }

  drawAch() {
    const list = this.ach.list();
    const h = document.createElement('h2');
    h.textContent = `Erfolge ${list.filter((a) => a.done).length} / ${list.length}`;
    this.body.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'achlist';
    for (const a of list) {
      const li = document.createElement('li');
      li.className = a.done ? 'done' : '';
      li.innerHTML = `<b></b><span></span><i></i>`;
      li.querySelector('b').textContent = `${a.done ? '★' : '☆'} ${a.name}`;
      li.querySelector('span').textContent = a.desc;
      li.querySelector('i').textContent = a.progress != null && !a.done ? `${a.progress} / ${a.goal}` : '';
      ul.appendChild(li);
    }
    this.body.appendChild(ul);
  }
}
