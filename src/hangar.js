import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fitModel } from './geom.js';
import { MECH } from './logic/mech.js';
import { PARTS, SLOTS, PAYLOAD, sanitize, validate, effects, ratings, nextUnlock, fmtT, defaultLoadout } from './logic/loadout.js';
import { Livery, drawEmblem } from './world/livery.js';

const KEY = 'battlebot-loadout';
const BASE = import.meta.env.BASE_URL + 'assets/';

export function loadLoadout(won) {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null') || defaultLoadout(), won);
  } catch {
    return defaultLoadout();
  }
}

export function saveLoadout(l) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {}
}

const LOCK = (n) => `GESPERRT · ${n} ${n === 1 ? 'SIEG' : 'SIEGE'}`;

/**
 * The hangar: BB-07 on a turntable in the maintenance bay, parts to fit on the left,
 * the choices on the right, ratings and payload below. Opened from the title screen.
 */
export class Hangar {
  constructor({ assets, renderer, won, onClose }) {
    this.assets = assets;
    this.renderer = renderer;
    this.won = won;
    this.onClose = onClose;
    this.loadout = loadLoadout(won);
    this.slot = 'gun';
    this.yaw = -0.6;
    this.pitch = 0.12;
    this.dist = 13;
    this.auto = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
    this.buildScene();
    this.buildUI();
    this.refresh();
  }

  buildScene() {
    const s = this.scene;
    new THREE.TextureLoader().load(BASE + 'ui/hangar.webp', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      s.background = t;
      this.bgAspect = t.image.width / t.image.height;
    });
    s.background = new THREE.Color(0x0c0f12);
    s.environment = this.envFrom();
    s.environmentIntensity = 0.5;
    // the bay: a turntable with a hazard ring, under a work light
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 64), new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.7, roughness: 0.45 }));
    ring.position.y = -0.125;
    ring.receiveShadow = true;
    s.add(ring);
    const stripe = new THREE.Mesh(new THREE.RingGeometry(3.85, 4.1, 64), new THREE.MeshStandardMaterial({ color: 0xd8a51c, roughness: 0.6, emissive: 0x2a1c00 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.y = 0.006;
    s.add(stripe);
    this.turntable = new THREE.Group();
    s.add(this.turntable);
    const key = new THREE.SpotLight(0xdfe8ff, 260, 40, 0.55, 0.5, 1.4);
    key.position.set(2, 14, 4);
    key.target.position.set(0, 2, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffd2a0, 0.9);
    rim.position.set(-6, 5, -8);
    s.add(rim);
    s.add(new THREE.HemisphereLight(0x8fa6c0, 0x1a1712, 0.9));
    const fill = new THREE.PointLight(0xffc78a, 10, 20);
    const back = new THREE.DirectionalLight(0xbcd0ff, 1.1);
    back.position.set(4, 6, -9);
    s.add(back);
    fill.position.set(-5, 2, 5);
    s.add(fill);
    // the mech
    const src = this.assets.models.mech_rigged;
    if (src) {
      const body = fitModel(cloneSkinned(src), { height: MECH.height, rotY: Math.PI });
      body.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.frustumCulled = false;
        }
      });
      this.turntable.add(body);
      this.turntable.updateMatrixWorld(true);
      this.livery = new Livery(body);
      body.traverse((o) => {
        if (o.isMesh) {
          o.material.envMapIntensity = 0.6;
          o.material.metalness = 0.55;
        }
      });
    }
  }

  /** a simple studio environment so the metal reads */
  envFrom() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x2b3138);
    const l1 = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4.2, 4.6) }));
    l1.position.set(0, 6, 0);
    l1.rotation.x = Math.PI / 2;
    const l2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.9) }));
    l2.position.set(-6, 1, 3);
    l2.rotation.y = Math.PI / 2;
    sc.add(l1, l2);
    const t = pm.fromScene(sc, 0.04).texture;
    pm.dispose();
    return t;
  }

  /* ------------------------------------------------------------------ UI */

  buildUI() {
    const el = document.createElement('section');
    el.id = 'hangar';
    el.innerHTML = `
      <header>
        <div class="hg-title"><small>HANGAR · KONFIGURATION</small><b>BATTLEBOT <span class="hg-cs"></span></b></div>
        <div class="hg-tons"><small>NUTZLAST</small><div class="hg-bar"><i></i></div><b></b></div>
        <button class="hg-x" title="Zurück">✕</button>
      </header>
      <nav class="hg-slots"></nav>
      <aside class="hg-opts"><h3></h3><div class="hg-list"></div></aside>
      <footer>
        <div class="hg-rate"></div>
        <div class="hg-msg"></div>
        <div class="hg-btns">
          <button class="hg-reset secondary">Werkszustand</button>
          <button class="hg-ok">Übernehmen</button>
        </div>
      </footer>
      <div class="hg-hint">Ziehen = drehen · Mausrad = Zoom</div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('.hg-x').onclick = () => this.close(false);
    el.querySelector('.hg-ok').onclick = () => this.close(true);
    el.querySelector('.hg-reset').onclick = () => {
      this.loadout = { ...defaultLoadout(), callsign: this.loadout.callsign };
      this.refresh();
    };
    // turning the mech: drag anywhere outside the panels
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('nav, aside, footer, header, button, input')) return;
      drag = { x: e.clientX, y: e.clientY };
      this.auto = false;
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.008;
      this.pitch = Math.max(-0.05, Math.min(0.6, this.pitch + (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('pointerup', () => (drag = null));
    el.addEventListener(
      'wheel',
      (e) => {
        if (e.target.closest('nav, aside, footer')) return;
        this.dist = Math.max(7, Math.min(20, this.dist + Math.sign(e.deltaY) * 0.8));
      },
      { passive: true },
    );
  }

  open() {
    this.won = this.won ?? 0;
    this.el.classList.add('show');
    this.auto = true;
    this.refresh();
  }

  close(save) {
    if (save) {
      const v = validate(this.loadout, this.won);
      if (!v.ok) return this.flash(v.errors[0]);
      saveLoadout(this.loadout);
    } else this.loadout = loadLoadout(this.won);
    this.el.classList.remove('show');
    this.onClose?.(save ? this.loadout : null);
  }

  flash(msg) {
    const m = this.el.querySelector('.hg-msg');
    m.textContent = msg;
    m.classList.remove('blink');
    void m.offsetWidth;
    m.classList.add('blink');
  }

  /** pick a part (or a callsign) and show it on the mech */
  pick(slot, id) {
    const p = PARTS[slot][id];
    if (!p || this.won < p.unlock) return this.flash(`${p?.name ?? id}: ${LOCK(p?.unlock ?? 0)}`);
    this.loadout = { ...this.loadout, [slot]: id };
    this.refresh();
  }

  refresh() {
    const l = this.loadout;
    const el = this.el;
    const v = validate(l, this.won);
    const e = effects(l);
    el.querySelector('.hg-cs').textContent = l.callsign;
    // payload
    const frac = v.tons / PAYLOAD;
    el.querySelector('.hg-bar i').style.width = `${Math.min(100, frac * 100)}%`;
    el.querySelector('.hg-bar').classList.toggle('over', v.tons > PAYLOAD);
    el.querySelector('.hg-tons b').textContent = `${fmtT(v.tons)} / ${PAYLOAD} t`;
    // slots
    const nav = el.querySelector('.hg-slots');
    nav.innerHTML = '';
    for (const [slot, label] of SLOTS) {
      const b = document.createElement('button');
      b.className = `hg-slot${slot === this.slot ? ' on' : ''}`;
      b.innerHTML = '<small></small><b></b><span></span>';
      b.querySelector('small').textContent = label;
      b.querySelector('b').textContent = PARTS[slot][l[slot]].name;
      const t = PARTS[slot][l[slot]].t;
      b.querySelector('span').textContent = t ? `${fmtT(t)} t` : '';
      b.onclick = () => {
        this.slot = slot;
        this.refresh();
      };
      nav.appendChild(b);
    }
    // options
    const opts = el.querySelector('.hg-list');
    el.querySelector('.hg-opts h3').textContent = SLOTS.find(([s]) => s === this.slot)[1];
    opts.innerHTML = '';
    if (this.slot === 'emblem') {
      const row = document.createElement('label');
      row.className = 'hg-callsign';
      row.innerHTML = '<small>KENNUNG (BIS 6 ZEICHEN)</small><input maxlength="6" spellcheck="false" />';
      const inp = row.querySelector('input');
      inp.value = l.callsign;
      inp.addEventListener('input', () => {
        this.loadout = sanitize({ ...this.loadout, callsign: inp.value }, this.won);
        el.querySelector('.hg-cs').textContent = this.loadout.callsign;
        this.livery?.apply(effects(this.loadout));
      });
      opts.appendChild(row);
    }
    for (const [id, p] of Object.entries(PARTS[this.slot])) {
      const locked = this.won < p.unlock;
      const c = document.createElement('button');
      c.className = `hg-card${l[this.slot] === id ? ' on' : ''}${locked ? ' locked' : ''}`;
      c.innerHTML = '<div class="hg-sw"></div><div class="hg-txt"><b></b><p></p></div><span class="hg-t"></span>';
      c.querySelector('b').textContent = p.name;
      c.querySelector('p').textContent = locked ? `${LOCK(p.unlock)} · ${p.desc}` : p.desc;
      c.querySelector('.hg-t').textContent = p.t ? `${fmtT(p.t)} t` : '';
      const sw = c.querySelector('.hg-sw');
      if (this.slot === 'paint') {
        const st = p.stats;
        const col = (a) => `rgb(${a.map((x) => Math.round(x * 255)).join(',')})`;
        sw.style.background = st.camo ? `linear-gradient(135deg, ${col(st.base)} 0 40%, ${col(st.camo[0])} 40% 70%, ${col(st.camo[1])} 70%)` : col(st.base);
      } else if (this.slot === 'emblem' && p.stats.shape) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        drawEmblem(cv.getContext('2d'), p.stats.shape, 64);
        sw.appendChild(cv);
      } else sw.textContent = locked ? '🔒' : p.short;
      c.onclick = () => this.pick(this.slot, id);
      opts.appendChild(c);
    }
    // ratings
    const r = ratings(l);
    const rate = el.querySelector('.hg-rate');
    rate.innerHTML = '';
    for (const [k, label, val] of [
      ['fire', 'FEUERKRAFT', r.fire],
      ['protect', 'SCHUTZ', r.protect],
      ['speed', 'TEMPO', r.speed],
      ['reach', 'REICHWEITE', r.reach],
    ]) {
      const d = document.createElement('div');
      d.className = 'hg-r';
      d.innerHTML = `<small>${label}</small><div class="hg-bar"><i style="width:${Math.round(val * 100)}%"></i></div>`;
      d.dataset.k = k;
      rate.appendChild(d);
    }
    const sp = Math.round(32 * e.speed);
    const info = document.createElement('div');
    info.className = 'hg-r hg-facts';
    info.textContent = `${sp} km/h · PANZERUNG ×${e.armor.toFixed(2).replace('.', ',')} · ${e.gun.short} · ${e.missile.short}`;
    rate.appendChild(info);
    const nu = nextUnlock(this.won);
    el.querySelector('.hg-msg').textContent = v.ok ? (nu ? `Nächste Freischaltung nach ${nu.unlock} ${nu.unlock === 1 ? 'Sieg' : 'Siegen'}: ${nu.name}` : 'Alle Teile freigeschaltet') : v.errors[0];
    el.querySelector('.hg-msg').classList.toggle('err', !v.ok);
    el.querySelector('.hg-ok').disabled = !v.ok;
    this.livery?.apply(e, { spots: false });
  }

  /* -------------------------------------------------------------- render */

  update(dt) {
    if (this.auto) this.yaw += dt * 0.18;
    const target = new THREE.Vector3(0, 2.7, 0);
    // the panels cover the sides: keep the mech in the free middle
    const c = this.camera;
    c.aspect = innerWidth / innerHeight;
    c.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, target.y + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    c.lookAt(target);
    c.updateProjectionMatrix();
    // the backdrop fills the screen without stretching
    const bg = this.scene.background;
    if (bg?.isTexture && this.bgAspect) {
      const a = c.aspect / this.bgAspect;
      bg.repeat.set(a < 1 ? a : 1, a < 1 ? 1 : 1 / a);
      bg.offset.set((1 - bg.repeat.x) / 2, (1 - bg.repeat.y) / 2);
    }
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
