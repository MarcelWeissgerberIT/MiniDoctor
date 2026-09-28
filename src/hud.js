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
    if (this.panel.style.display !== 'none') return;
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
    if (this.panel.style.display !== 'none') return false;
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
