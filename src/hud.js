import * as THREE from 'three';
import { t } from './i18n.js';
import { TOOL_ORDER } from './tools.js';

const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
};

/** Heads-up display inside the canopy + target markers. */
export class Hud {
  constructor(cockpit, world) {
    this.world = world;
    const h = cockpit.hud;
    this.root = h;
    this.objective = el('div', 'hud-panel hud-objective', h);
    this.stats = el('div', 'hud-panel hud-stats', h);
    this.toastEl = el('div', 'hud-toast', h);
    this.crosshair = el('div', 'hud-crosshair', h);
    this.center = el('div', 'hud-center', h);
    this.panel = el('div', 'hud-modal', h);
    this.panel.style.display = 'none';
    this.bar = el('div', 'hud-bar', h);
    this.toolbar = el('div', 'hud-toolbar', h);
    this.apBtn = el('button', 'hud-ap', h);
    this.apBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    this.toolBtns = {};
    for (const [i, k] of TOOL_ORDER.entries()) {
      const b = el('button', 'tool-btn', this.toolbar);
      b.dataset.tool = k;
      const icon = k === 'tpa' ? '<span class="tpa-icon">tPA</span>' : `<img src="assets/tool_${k}.webp" alt="">`;
      b.innerHTML = `${icon}<span class="tool-key">${i + 1}</span>`;
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      this.toolBtns[k] = b;
    }
    this.toolName = el('div', 'tool-name', this.toolbar);
    // journey overlay: body map with route + station card
    this.jr = el('div', 'journey', h);
    this.jr.innerHTML = `<div class="jr-map"><img src="assets/bodymap.webp" alt=""><canvas></canvas></div>
      <div class="jr-card"><div class="jr-kicker"></div><div class="jr-name"></div><div class="jr-fact"></div><div class="jr-meta"></div></div>
      <div class="jr-hint"></div>`;
    this.jr.style.display = 'none';
    this.locEl = el('div', 'loc-map', h);
    this.locEl.innerHTML = '<img src="assets/bodymap.webp" alt=""><canvas></canvas><div class="loc-label"></div>';
    this.locEl.style.display = 'none';
    this.help = el('div', 'hud-panel hud-help', h);
    this.help.style.display = 'none';
    // markers canvas covers the whole viewport
    this.markers = el('canvas', 'hud-markers', document.body);
    this.mctx = this.markers.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
    this.toastT = 0;
    this._v = new THREE.Vector3();
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.markers.width = innerWidth * dpr;
    this.markers.height = innerHeight * dpr;
    this.dpr = dpr;
  }
  show(v) {
    this.root.style.display = v ? 'block' : 'none';
    this.markers.style.display = v ? 'block' : 'none';
  }
  showJourney(route, points, texts) {
    this.jrRoute = route;
    this.jrPts = route.map((st) => points[st.map]);
    this.jr.style.display = 'block';
    this.jr.querySelector('.jr-kicker').textContent = texts.kicker;
    this.jr.querySelector('.jr-hint').textContent = texts.hint;
    for (const e of [this.objective, this.stats, this.toolbar, this.crosshair, this.apBtn, this.locEl]) e.style.visibility = 'hidden';
  }
  hideJourney() {
    this.jr.style.display = 'none';
    for (const e of [this.objective, this.stats, this.toolbar, this.crosshair, this.apBtn, this.locEl]) e.style.visibility = '';
  }
  updateJourney(index, frac, name, fact, meta, changed) {
    if (changed) {
      const card = this.jr.querySelector('.jr-card');
      card.classList.remove('pop');
      void card.offsetWidth;
      card.classList.add('pop');
      this.jr.querySelector('.jr-name').textContent = name;
      this.jr.querySelector('.jr-fact').textContent = fact;
    }
    this.jr.querySelector('.jr-meta').textContent = meta;
    const c = this.jr.querySelector('canvas');
    const img = this.jr.querySelector('img');
    const W = (c.width = img.clientWidth * 2 || 200);
    const H = (c.height = img.clientHeight * 2 || 360);
    const g = c.getContext('2d');
    const P = this.jrPts.map(([x, y]) => [x * W, y * H]);
    // position: between this station's landmark and the next one
    const a = P[index];
    const b = P[Math.min(P.length - 1, index + 1)];
    const cur = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
    const line = (from, to, style, w) => {
      g.strokeStyle = style;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(...from);
      for (const p of to) g.lineTo(...p);
      g.stroke();
    };
    g.lineJoin = 'round';
    line(P[0], P.slice(1), 'rgba(255,210,127,0.35)', 3);
    line(P[0], [...P.slice(1, index + 1), cur], 'rgba(255,210,127,0.95)', 4);
    // blinking "you are here" marker with an expanding pulse ring
    const now = performance.now() / 1000;
    const blink = 0.55 + 0.45 * Math.sin(now * 7);
    const ring = (now * 1.2) % 1;
    g.strokeStyle = `rgba(127,243,255,${(1 - ring) * 0.9})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cur[0], cur[1], 8 + ring * 34, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `rgba(255,255,255,${blink})`;
    g.shadowColor = '#7ff3ff';
    g.shadowBlur = 18;
    g.beginPath();
    g.arc(cur[0], cur[1], 8, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.font = `bold ${Math.round(W * 0.055)}px system-ui, sans-serif`;
    g.textAlign = cur[0] > W * 0.55 ? 'right' : 'left';
    g.fillStyle = `rgba(127,243,255,${0.6 + 0.4 * blink})`;
    g.fillText(this.hereText ?? '', cur[0] + (cur[0] > W * 0.55 ? -16 : 16), cur[1] + 5);
    // destination blinks red
    const end = P[P.length - 1];
    g.strokeStyle = `rgba(255,107,107,${0.4 + 0.6 * Math.abs(Math.sin(now * 3))})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(end[0], end[1], 11, 0, Math.PI * 2);
    g.stroke();
  }

  /** Small body map during a mission: where in the body the ship is. */
  showLocation(point, label) {
    this.loc = { point, label };
    this.locEl.style.display = point ? 'block' : 'none';
    this.locEl.querySelector('.loc-label').textContent = label ?? '';
  }
  drawLocation() {
    if (!this.loc?.point || this.locEl.style.display === 'none') return;
    const c = this.locEl.querySelector('canvas');
    const img = this.locEl.querySelector('img');
    const W = (c.width = img.clientWidth * 2 || 100);
    const H = (c.height = img.clientHeight * 2 || 180);
    const g = c.getContext('2d');
    const [x, y] = [this.loc.point[0] * W, this.loc.point[1] * H];
    const now = performance.now() / 1000;
    const ring = (now * 1.1) % 1;
    g.strokeStyle = `rgba(255,210,127,${(1 - ring) * 0.9})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, 5 + ring * 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `rgba(255,230,160,${0.55 + 0.45 * Math.sin(now * 7)})`;
    g.shadowColor = '#ffd27f';
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }

  toggleHelp(html) {
    const show = this.help.style.display === 'none';
    this.help.innerHTML = html;
    this.help.style.display = show ? 'block' : 'none';
  }
  hideHelp() {
    this.help.style.display = 'none';
  }
  setObjective(html) {
    this.objective.innerHTML = html;
  }
  setStats(html) {
    this.stats.innerHTML = html;
  }
  setCenter(html) {
    this.center.innerHTML = html ?? '';
  }
  setBar(html) {
    this.bar.innerHTML = html ?? '';
    this.bar.style.display = html ? 'block' : 'none';
  }
  toast(msg, kind = 'info', dur = 3) {
    this.toastEl.textContent = msg;
    this.toastEl.className = `hud-toast show ${kind}`;
    this.toastT = dur;
  }
  openPanel(html) {
    this.panel.innerHTML = html;
    this.panel.style.display = 'block';
    this.panel.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.stopPropagation()));
    return this.panel;
  }
  closePanel() {
    this.panel.style.display = 'none';
    this.panel.innerHTML = '';
  }
  setTools(available, current, onPick) {
    for (const [k, b] of Object.entries(this.toolBtns)) {
      b.style.display = available.includes(k) ? '' : 'none';
      b.classList.toggle('active', k === current);
      b.onclick = () => onPick(k);
    }
    this.toolName.textContent = current ? t(`tool_${current}`) : '';
  }
  setAutopilot(on, enabled, onToggle) {
    this.apBtn.textContent = `${t('autopilot')}: ${on ? t('on') : t('off')} [P] · ${t('helpKey')}`;
    this.apBtn.classList.toggle('on', on);
    this.apBtn.style.display = enabled ? '' : 'none';
    this.apBtn.onclick = onToggle;
  }
  update(dt) {
    this.drawLocation();
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
  }
  clearMarkers() {
    this.mctx.clearRect(0, 0, this.markers.width, this.markers.height);
  }
  /** Arrow near the crosshair pointing towards a world-space point. */
  pointer(pos, color = '#ffd27f') {
    if (this.panel.style.display !== 'none' || this.help.style.display !== 'none') return;
    const v = this._v.copy(pos).project(this.world.camera);
    const behind = v.z > 1;
    let x = v.x;
    let y = v.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    if (!behind && Math.hypot(x, y) < 0.12) return;
    const a = Math.atan2(-y, x);
    const g = this.mctx;
    const d = this.dpr;
    const cx = (innerWidth / 2) * d;
    const cy = (innerHeight / 2) * d;
    const r = 70 * d;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    g.save();
    g.translate(px, py);
    g.rotate(a);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(14 * d, 0);
    g.lineTo(-6 * d, -9 * d);
    g.lineTo(-2 * d, 0);
    g.lineTo(-6 * d, 9 * d);
    g.closePath();
    g.fill();
    g.restore();
  }

  /** Draw a bracket around a world-space point. */
  marker(pos, { size = 18, color = '#7ff3ff', label = '', progress = -1 } = {}) {
    if (this.panel.style.display !== 'none' || this.help.style.display !== 'none') return false;
    const v = this._v.copy(pos).project(this.world.camera);
    if (v.z > 1) return false;
    const g = this.mctx;
    const d = this.dpr;
    const x = (v.x * 0.5 + 0.5) * innerWidth * d;
    const y = (-v.y * 0.5 + 0.5) * innerHeight * d;
    const s = size * d;
    g.strokeStyle = color;
    g.lineWidth = 1.5 * d;
    const c = s * 0.4;
    g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.moveTo(x + sx * s, y + sy * s - sy * c);
      g.lineTo(x + sx * s, y + sy * s);
      g.lineTo(x + sx * s - sx * c, y + sy * s);
    }
    g.stroke();
    if (progress >= 0) {
      g.beginPath();
      g.arc(x, y, s * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      g.stroke();
    }
    if (label) {
      g.fillStyle = color;
      g.font = `${11 * d}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(label, x, y + s + 13 * d);
    }
    return true;
  }
}
