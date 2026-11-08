import * as THREE from 'three';
import { rbox, cyl } from '../geom.js';

const FONT = "'Barlow Condensed','DejaVu Sans Condensed','Arial Narrow',Arial,sans-serif";

/** Small stencil label texture (white paint on transparent). */
export function labelTexture(text, { w = 256, h = 64, size = 34, color = '#e9e4d4', bg = null, weight = 'bold' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const fs = lines.length > 1 ? size * 0.82 : size;
  g.font = `${weight} ${fs}px ${FONT}`;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.05, w - 8));
  // paint wear
  const img = g.getImageData(0, 0, w, h);
  for (let i = 3; i < img.data.length; i += 4) if (Math.random() < 0.08) img.data[i] *= 0.4;
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const labelGeo = new THREE.PlaneGeometry(1, 1);
/** Label plane, softly back-lit like real panel lighting. */
/** every back-lit label; the cockpit dims them with the electrical power */
export const LABEL_MATERIALS = [];

export function makeLabel(text, width, height = width * 0.25, opts = {}) {
  const tex = labelTexture(text, opts);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.25,
    roughness: 0.7,
    emissive: 0xffd2a6,
    emissiveMap: tex,
    emissiveIntensity: opts.glow ?? 0.18,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  mat.userData.glow = opts.glow ?? 1;
  LABEL_MATERIALS.push(mat);
  const m = new THREE.Mesh(labelGeo, mat);
  m.scale.set(width, height, 1);
  return m;
}

/* ------------------------------------------------------------------ gauge */

function gaugeFace({ title, unit, min, max, major, minor, red }) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#1b1c1a');
  grd.addColorStop(1, '#0b0b0a');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;
  const a0 = (-225 * Math.PI) / 180;
  const span = (270 * Math.PI) / 180;
  const ang = (v) => a0 + ((v - min) / (max - min)) * span;
  if (red) {
    g.strokeStyle = '#ff2a10';
    g.lineWidth = 22;
    g.beginPath();
    g.arc(cx, cy, S * 0.4, ang(red), ang(max));
    g.stroke();
  }
  g.strokeStyle = '#ff8a2a';
  for (let v = min; v <= max + 1e-6; v += minor) {
    const isMajor = Math.abs(((v - min) / major) % 1) < 1e-6 || Math.abs(((v - min) / major) % 1) > 1 - 1e-6;
    const a = ang(v);
    const r1 = S * 0.44;
    const r0 = isMajor ? S * 0.36 : S * 0.405;
    g.lineWidth = isMajor ? 7 : 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
    if (isMajor) {
      g.fillStyle = '#ffb36a';
      g.font = `bold 44px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(Math.round(v)), cx + Math.cos(a) * S * 0.27, cy + Math.sin(a) * S * 0.27);
    }
  }
  g.fillStyle = '#ff9a45';
  g.font = `bold 40px ${FONT}`;
  g.textAlign = 'center';
  g.fillText(title, cx, cy + S * 0.2);
  g.font = `32px ${FONT}`;
  g.fillText(unit, cx, cy + S * 0.29);
  // grime
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},40,${Math.random() * 0.03})`;
    const r = Math.random() * 6;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, r, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Gauge {
  constructor(mat, opts) {
    this.opts = opts;
    this.group = new THREE.Group();
    const r = opts.r ?? 0.062;
    const bezel = new THREE.Mesh(cyl(r + 0.012, r + 0.014, 0.022, 32, 0.2), mat.consoleMetal);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.z = 0.004;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(r, 48),
      new THREE.MeshStandardMaterial({
        map: gaugeFace(opts),
        color: 0x777777,
        roughness: 0.8,
        emissive: 0xffffff,
        emissiveMap: null,
        emissiveIntensity: 0,
      }),
    );
    face.material.emissiveMap = face.material.map;
    face.position.z = 0.0155;
    this.face = face;
    this.needle = new THREE.Group();
    const n = new THREE.Mesh(
      new THREE.BoxGeometry(0.0035, r * 0.82, 0.0015),
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.4, roughness: 0.4 }),
    );
    n.position.y = r * 0.35;
    const hub = new THREE.Mesh(cyl(0.008, 0.008, 0.006, 12), mat.blackPaint);
    hub.rotation.x = Math.PI / 2;
    this.needle.add(n, hub);
    this.needle.position.z = 0.019;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(r + 0.002, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.05,
        roughness: 0.05,
        metalness: 0,
        envMapIntensity: 0.12,
        depthWrite: false,
      }),
    );
    glass.position.z = 0.023;
    this.group.add(bezel, face, this.needle, glass);
    this.value = opts.min;
    this.shown = opts.min;
    this.vel = 0;
    this.jitter = 0;
  }

  set(v) {
    this.value = v;
  }

  kick(a) {
    this.vel += (Math.random() - 0.5) * a * (this.opts.max - this.opts.min);
  }

  setLight(i) {
    this.face.material.emissiveIntensity = i;
  }

  update(dt) {
    const { min, max } = this.opts;
    // damped spring needle
    const k = 60;
    const d = 9;
    const acc = (this.value - this.shown) * k - this.vel * d;
    this.vel += acc * dt;
    this.shown += this.vel * dt;
    const t = THREE.MathUtils.clamp((this.shown - min) / (max - min), -0.02, 1.02);
    this.needle.rotation.z = -((-225 + 90) * Math.PI) / 180 - t * ((270 * Math.PI) / 180);
  }
}

/* ----------------------------------------------------------------- switch */

let leverGeo, tipGeo, nutGeo;
export class ToggleSwitch {
  constructor(mat, { label, on = false, action, labelBelow = true, guard = false }) {
    leverGeo ??= cyl(0.0042, 0.0055, 0.036, 10, 0.1);
    tipGeo ??= new THREE.SphereGeometry(0.0068, 14, 10);
    nutGeo ??= cyl(0.013, 0.013, 0.009, 6, 0.1);
    this.group = new THREE.Group();
    this.on = on;
    this.action = action;
    this.label = label;
    const nut = new THREE.Mesh(nutGeo, mat.steel);
    nut.rotation.x = Math.PI / 2;
    nut.position.z = 0.004;
    this.lever = new THREE.Group();
    const stem = new THREE.Mesh(leverGeo, mat.steel);
    stem.position.y = 0.018;
    const tip = new THREE.Mesh(tipGeo, mat.chrome || mat.steel);
    tip.position.y = 0.036;
    this.lever.add(stem, tip);
    this.lever.position.z = 0.008;
    this.lever.rotation.x = Math.PI / 2;
    this.group.add(nut, this.lever);
    // invisible, larger hit box
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.05), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.z = 0.02;
    this.hit.userData.control = this;
    this.group.add(this.hit);
    if (guard) {
      this.guard = new THREE.Group();
      const cover = new THREE.Mesh(rbox(0.034, 0.05, 0.034, 0.004, 0.1), mat.redPaint);
      cover.position.set(0, 0.025, 0.017);
      this.guard.add(cover);
      this.guard.position.y = -0.024;
      this.group.add(this.guard);
      const base = new THREE.Mesh(rbox(0.04, 0.056, 0.006, 0.002, 0.1), mat.blackPaint);
      base.position.z = 0.002;
      this.group.add(base);
      this.guardOpen = 0;
    }
    if (label) {
      const l = makeLabel(label, 0.088, 0.032, { size: 40, h: 96 });
      l.position.set(0, labelBelow ? -0.046 : 0.046, 0.001);
      this.group.add(l);
      if (!guard) {
        const on = makeLabel('ON', 0.03, 0.012, { size: 50, w: 128, h: 52, glow: 0.45 });
        on.position.set(0, 0.03, 0.001);
        this.group.add(on);
      }
    }
    this.angle = this.on ? 0.5 : -0.5;
  }

  toggle(silent) {
    this.on = !this.on;
    if (this.action) this.action(this.on, silent);
  }

  set(on) {
    this.on = on;
  }

  update(dt, hovered) {
    const target = this.on ? 0.5 : -0.5;
    this.angle += (target - this.angle) * Math.min(1, dt * 30);
    this.lever.rotation.x = Math.PI / 2 - this.angle;
    if (this.guard) {
      const open = this.on || hovered ? 1 : 0;
      this.guardOpen += (open - this.guardOpen) * Math.min(1, dt * 12);
      this.guard.rotation.x = this.guardOpen * 1.9;
    }
  }
}

/* ------------------------------------------------------------ lamp button */

export class LampButton {
  constructor(mat, { text, color = '#ffb020', w = 0.1, h = 0.05, action = null, blink = false }) {
    this.group = new THREE.Group();
    this.action = action;
    this.label = text.replace('\n', ' ');
    this.blink = blink;
    const housing = new THREE.Mesh(rbox(w + 0.012, h + 0.012, 0.02, 0.004, 0.1), mat.blackPaint);
    housing.position.z = 0.006;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = Math.round((256 * h) / w);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    const grd = g.createRadialGradient(c.width / 2, c.height / 2, 5, c.width / 2, c.height / 2, c.width * 0.6);
    grd.addColorStop(0, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15,8,0,0.92)';
    g.font = `bold ${Math.round(c.height * 0.36)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((l, i) =>
      g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * c.height * 0.36, c.width - 10),
    );
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.25,
      color: 0x555555,
    });
    this.cap = new THREE.Mesh(rbox(w, h, 0.012, 0.003, 0.1), this.mat);
    // put the texture on the front face only: simple plane on top of the cap
    this.cap.material = mat.blackPaint;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92), this.mat);
    face.position.z = 0.0062;
    this.cap.add(face);
    this.cap.position.z = 0.017;
    this.group.add(housing, this.cap);
    this.cap.userData.control = this;
    this.level = 0;
    this.on = false;
    this.press = 0;
  }

  toggle() {
    this.press = 1;
    if (this.action) this.action();
  }

  update(dt, hovered, time, power = 1) {
    const lit = this.on ? (this.blink ? (Math.sin(time * 9) > -0.2 ? 1 : 0.25) : 1) : 0;
    const target = (lit * 0.3 + 0.025) * power + (hovered ? 0.15 : 0);
    this.level += (target - this.level) * Math.min(1, dt * 25);
    this.mat.emissiveIntensity = this.level;
    this.press = Math.max(0, this.press - dt * 6);
    this.cap.position.z = 0.017 - this.press * 0.005;
  }
}

/* ------------------------------------------------------------- alarm lamp */

export class AlarmLamp {
  constructor(mat) {
    this.group = new THREE.Group();
    this.bulbMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      emissive: 0xff1a0a,
      emissiveIntensity: 0.05,
      roughness: 0.2,
      transparent: true,
      opacity: 0.92,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.bulbMat);
    bulb.rotation.x = Math.PI / 2;
    const base = new THREE.Mesh(cyl(0.045, 0.048, 0.02, 20, 0.1), mat.blackPaint);
    base.rotation.x = Math.PI / 2;
    this.group.add(base, bulb);
    // wire cage
    const wire = new THREE.TorusGeometry(0.04, 0.0018, 6, 24, Math.PI);
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(wire, mat.steel);
      w.rotation.set(0, Math.PI / 2, (i * Math.PI) / 4);
      w.rotation.order = 'ZYX';
      this.group.add(w);
    }
    this.light = new THREE.PointLight(0xff2010, 0, 2.2, 1.6);
    this.light.position.z = 0.08;
    this.group.add(this.light);
    this.active = false;
  }

  update(dt, time) {
    const on = this.active && Math.sin(time * 7) > 0;
    const target = on ? 1 : 0;
    this.lvl = (this.lvl ?? 0) + (target - (this.lvl ?? 0)) * Math.min(1, dt * 30);
    this.bulbMat.emissiveIntensity = 0.05 + this.lvl * 6;
    this.light.intensity = this.lvl * 1.3;
  }
}

/* ------------------------------------------------------- 7-segment readout */

const SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '', _: 'd', A: 'abcefg', b: 'cdefg', C: 'adef', d: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg',
  L: 'def', n: 'ceg', o: 'cdeg', P: 'abefg', r: 'eg', S: 'acdfg', t: 'defg', U: 'bcdef',
};

/** Orange glowing seven-segment readout with a small caption (like the boarding film's dash). */
export class SegDisplay {
  constructor(mat, { w, h, digits = 4, label = '' }) {
    this.digits = digits;
    this.label = label;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 60 * digits + 24;
    this.canvas.height = 132;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(1.5, 1.5, 1.5) });
    this.group = new THREE.Group();
    const bezel = new THREE.Mesh(rbox(w + 0.016, h + 0.016, 0.014, 0.004, 0.2), mat.consoleMetal);
    bezel.position.z = 0.003;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    screen.position.z = 0.0105;
    this.group.add(bezel, screen);
    this.text = '';
    this.next = '';
    this.power = -1;
  }

  set(text) {
    this.next = String(text);
  }

  update(power) {
    const p = Math.round(power * 20) / 20;
    if (this.next === this.text && p === this.power) return;
    this.text = this.next;
    this.power = p;
    this.draw();
  }

  draw() {
    const { g } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const p = this.power;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0603';
    g.fillRect(0, 0, W, H);
    g.font = `700 22px 'JetBrains Mono', monospace`;
    g.textBaseline = 'top';
    g.fillStyle = `rgba(255,140,60,${0.25 + 0.55 * p})`;
    g.fillText(this.label, 12, 6);
    const str = this.text.padStart(this.digits).slice(-this.digits);
    for (let i = 0; i < this.digits; i++) this.digit(16 + i * 60, 36, str[i], p);
    this.tex.needsUpdate = true;
  }

  digit(x, y, ch, p) {
    const g = this.g;
    const w = 40;
    const h = 84;
    const t = 9;
    const half = h / 2;
    const bars = {
      a: [x + t * 0.7, y, w - 1.4 * t, t],
      d: [x + t * 0.7, y + h - t, w - 1.4 * t, t],
      g: [x + t * 0.7, y + half - t / 2, w - 1.4 * t, t],
      f: [x, y + t * 0.7, t, half - t * 1.2],
      b: [x + w - t, y + t * 0.7, t, half - t * 1.2],
      e: [x, y + half + t * 0.5, t, half - t * 1.2],
      c: [x + w - t, y + half + t * 0.5, t, half - t * 1.2],
    };
    const lit = SEGS[ch] ?? '';
    g.save();
    // classic forward slant of segment displays
    g.transform(1, 0, -0.1, 1, (y + h) * 0.1, 0);
    for (const [k, r] of Object.entries(bars)) {
      const on = lit.includes(k) && p > 0;
      g.fillStyle = on ? `rgba(255,${110 + 30 * p},28,${0.35 + 0.65 * p})` : 'rgba(255,90,20,0.07)';
      g.shadowColor = '#ff5a00';
      g.shadowBlur = on ? 10 * p : 0;
      g.fillRect(...r);
    }
    g.restore();
  }
}
