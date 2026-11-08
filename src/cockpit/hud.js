import * as THREE from 'three';

const FONT = "'JetBrains Mono','DejaVu Sans Mono','Consolas',monospace";
const C = '#86ffc4'; // holo green-cyan
const DIM = 'rgba(134,255,196,0.45)';
const WARN = '#ffd25a';
const RED = '#ff6a50';
const DEG = Math.PI / 180;

const _d = new THREE.Vector3();

/**
 * Holographic visor HUD: thin glowing vector symbology projected straight onto the
 * canopy glass (no combiner, no frame). Symbols that point outside (heading ticks,
 * horizon, waypoint) are placed where the line of sight from the pilot's eye
 * crosses the glass, so they sit on the landscape.
 *
 * win: the canopy opening in front-frame coordinates, tilt: canopy lean,
 * origin: front frame position in the cockpit, z: offset of the projection layer.
 */
export class HUD {
  constructor(win, { tilt, origin, z }) {
    this.win = win;
    this.ax = new THREE.Vector3(1, 0, 0);
    this.ay = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    this.az = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
    this.origin = new THREE.Vector3(...origin);
    this.p0 = this.origin.clone().addScaledVector(this.az, z);
    this.w = win.x1 - win.x0;
    this.h = win.y1 - win.y0;
    this.canvas = document.createElement('canvas');
    this.W = 2048;
    this.H = Math.round((2048 * this.h) / this.w);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(1.5, 1.5, 1.5),
      opacity: 0,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.mat);
    this.mesh.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z);
    this.mesh.renderOrder = 10;
    this.level = 0;
    this.on = false;
    this.frame = 0;
    this.bore = this.project(_d.set(0, 0, -1));
  }

  /** canvas pixel where a direction from the eye (cockpit frame) meets the glass */
  project(d) {
    const den = d.dot(this.az);
    if (den > -1e-4) return null;
    const t = this.p0.dot(this.az) / den;
    const rel = new THREE.Vector3(d.x * t, d.y * t, d.z * t).sub(this.origin);
    return { x: ((rel.x - this.win.x0) / this.w) * this.W, y: ((this.win.y1 - rel.dot(this.ay)) / this.h) * this.H };
  }

  /** world direction -> canvas, through the cabin's current attitude (q: world -> cabin) */
  projectWorld(dx, dy, dz, q) {
    return this.project(_d.set(dx, dy, dz).applyQuaternion(q));
  }

  text(s, x, y, size = 30, color = C, align = 'center') {
    const g = this.g;
    g.font = `bold ${size}px ${FONT}`;
    g.textAlign = align;
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  /**
   * s: heading, speed, maxSpeed, throttle, look, stab, nv, lights, warning, waypoint,
   * time, q (world -> cabin quaternion), weapons
   */
  update(dt, s) {
    const target = this.on ? 1 : 0;
    this.level += (target - this.level) * Math.min(1, dt * 4);
    this.mat.opacity = this.level * (0.92 + Math.random() * 0.05);
    if (this.level < 0.01) return;
    // redraw at half rate: the canvas is big
    if (this.frame++ % 2) return;
    const g = this.g;
    const { W, H } = this;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = C;
    g.fillStyle = C;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.shadowColor = C;
    g.shadowBlur = 8;
    g.textBaseline = 'middle';
    const b = this.bore;
    const q = s.q;

    this.drawCompass(s, q);
    this.drawHorizon(s, q);
    this.drawReticle(b);
    this.drawArcs(s, b);
    this.drawWaypoint(s, q);
    this.drawStatus(s, b);
    this.tex.needsUpdate = true;
  }

  /** heading band along the top of the canopy, ticks placed on the real directions */
  drawCompass(s, q) {
    const g = this.g;
    const y = 175; // below the display pod at the top of the screen
    const deg = ((-s.heading / DEG) % 360) + 360;
    const base = Math.round(deg / 5) * 5;
    for (let k = -60; k <= 60; k += 5) {
      const a = base + k;
      const rel = (a - deg) * DEG; // + = to the right
      if (Math.abs(rel) > 0.95) continue;
      const hdg = -a * DEG;
      const p = this.projectWorld(-Math.sin(hdg), 0, -Math.cos(hdg), q);
      if (!p || p.x < 60 || p.x > this.W - 60) continue;
      const major = ((a % 15) + 15) % 15 === 0;
      g.beginPath();
      g.moveTo(p.x, y);
      g.lineTo(p.x, y + (major ? 26 : 13));
      g.stroke();
      if (major) {
        const n = ((a % 360) + 360) % 360;
        this.text({ 0: 'N', 90: 'O', 180: 'S', 270: 'W' }[n] ?? String(n).padStart(3, '0'), p.x, y + 54, 32);
      }
    }
    // own heading box and the direction the pilot looks
    const c = this.project(_d.set(0, 0, -1));
    g.beginPath();
    g.moveTo(c.x - 9, y - 18);
    g.lineTo(c.x, y - 4);
    g.lineTo(c.x + 9, y - 18);
    g.stroke();
    g.strokeRect(c.x - 54, y - 56, 108, 40);
    this.text(String(Math.round(deg % 360)).padStart(3, '0'), c.x, y - 36, 32);
    const lk = this.project(_d.set(-Math.sin(s.look), 0, -Math.cos(s.look)));
    if (lk && Math.abs(s.look) > 0.05) {
      g.fillStyle = DIM;
      g.beginPath();
      g.moveTo(lk.x, y + 30);
      g.lineTo(lk.x - 8, y + 44);
      g.lineTo(lk.x + 8, y + 44);
      g.closePath();
      g.fill();
      g.fillStyle = C;
    }
  }

  /** artificial horizon: rolls and pitches with the walking cabin */
  drawHorizon(s, q) {
    const g = this.g;
    for (const side of [-1, 1]) {
      const a1 = s.heading + side * 14 * DEG;
      const a2 = s.heading + side * 30 * DEG;
      const p1 = this.projectWorld(-Math.sin(a1), 0, -Math.cos(a1), q);
      const p2 = this.projectWorld(-Math.sin(a2), 0, -Math.cos(a2), q);
      if (!p1 || !p2) continue;
      g.beginPath();
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.stroke();
      // little drop tick at the inner end
      g.beginPath();
      g.moveTo(p1.x, p1.y);
      g.lineTo(p1.x, p1.y + 14);
      g.stroke();
    }
  }

  drawReticle(b) {
    const g = this.g;
    g.beginPath();
    g.arc(b.x, b.y, 26, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      g.moveTo(b.x + dx * 36, b.y + dy * 36);
      g.lineTo(b.x + dx * 60, b.y + dy * 60);
    }
    g.stroke();
    g.beginPath();
    g.arc(b.x, b.y, 3, 0, Math.PI * 2);
    g.fill();
  }

  /** throttle (left) and speed (right) as arcs around the reticle */
  drawArcs(s, b) {
    const g = this.g;
    // everything stays inside the centre pane (the canopy struts would cut it)
    const R = 205;
    // arc spans: left 150..210 deg, right -30..30 deg (canvas angles, y down)
    const arc = (from, to, width, color) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.arc(b.x, b.y, R, from, to, from > to);
      g.stroke();
    };
    const L0 = (145 * Math.PI) / 180; // bottom of the throttle scale (-30 %)
    const L1 = (215 * Math.PI) / 180; // top (+100 %)
    const lAng = (v) => L0 + ((v + 0.3) / 1.3) * (L1 - L0);
    arc(L0, L1, 2, DIM);
    arc(lAng(0), lAng(s.throttle), 9, s.throttle < 0 ? WARN : C);
    // ticks at -30, 0, 50, 100 %
    g.strokeStyle = C;
    g.lineWidth = 2.5;
    for (const v of [-0.3, 0, 0.5, 1]) {
      const a = lAng(v);
      g.beginPath();
      g.moveTo(b.x + Math.cos(a) * (R - 10), b.y + Math.sin(a) * (R - 10));
      g.lineTo(b.x + Math.cos(a) * (R + (v === 0 ? 22 : 12)), b.y + Math.sin(a) * (R + (v === 0 ? 22 : 12)));
      g.stroke();
    }
    const pct = Math.round(s.throttle * 100);
    const ex = Math.cos((35 * Math.PI) / 180) * R;
    const ey = Math.sin((35 * Math.PI) / 180) * R;
    this.text(`${pct > 0 ? '+' : ''}${pct}%`, b.x - ex, b.y - ey - 34, 44, s.throttle < 0 ? WARN : C);
    this.text('SCHUB', b.x - ex, b.y + ey + 30, 26, DIM);

    const R0 = (35 * Math.PI) / 180; // 0 km/h
    const R1 = (-35 * Math.PI) / 180; // max
    const sv = Math.max(0, Math.min(1, Math.abs(s.speed) / s.maxSpeed));
    arc(R0, R1, 2, DIM);
    if (sv > 0.005) arc(R0, R0 + sv * (R1 - R0), 9, s.speed < -0.1 ? WARN : C);
    this.text(String(Math.round(Math.abs(s.speed) * 3.6)), b.x + ex, b.y - ey - 34, 44, C);
    this.text(s.speed < -0.1 ? 'KM/H R' : 'KM/H', b.x + ex, b.y + ey + 30, 26, DIM);
  }

  drawWaypoint(s, q) {
    if (!s.waypoint) return;
    const g = this.g;
    const wp = s.waypoint;
    const a = wp.bearing;
    const p = this.projectWorld(-Math.sin(a), -0.01, -Math.cos(a), q);
    const inside = p && p.x > 70 && p.x < this.W - 70;
    const x = inside ? p.x : Math.sin(a - s.heading) > 0 ? 80 : this.W - 80;
    const y = inside ? Math.min(this.H - 120, Math.max(150, p.y)) : 170;
    g.strokeStyle = '#e4fff0';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x, y - 16);
    g.lineTo(x + 16, y);
    g.lineTo(x, y + 16);
    g.lineTo(x - 16, y);
    g.closePath();
    g.stroke();
    if (!inside) {
      const dir = Math.sin(a - s.heading) > 0 ? -1 : 1;
      g.beginPath();
      g.moveTo(x + dir * 26, y - 10);
      g.lineTo(x + dir * 40, y);
      g.lineTo(x + dir * 26, y + 10);
      g.stroke();
    }
    this.text(`${wp.label} ${Math.round(wp.dist)} m`, x, y + 40, 28, '#e4fff0');
    g.strokeStyle = C;
  }

  /** status (left) and weapons (right) above the arcs, warnings over the reticle */
  drawStatus(s, b) {
    const y = Math.max(170, b.y - 262);
    const flags = [s.stab ? 'STAB' : 'STAB AUS', s.nv ? 'NV' : '', s.lights ? '' : 'DUNKEL'].filter(Boolean);
    this.text(flags.join('   '), b.x, y - 38, 24, DIM);
    const w = s.weapons;
    if (!w || !w.master) this.text('WAFFEN SICHER', b.x, y, 28, DIM);
    else {
      const heat = Math.round(w.heat * 5);
      const bars = '▮'.repeat(heat) + '▯'.repeat(5 - heat);
      this.text(`KAN ${w.ammo} ${bars}   RAK ${w.missiles}${w.locked ? ' LOCK' : ''}`, b.x, y, 28, w.overheated ? RED : w.locked ? RED : C);
    }
    if (s.warning && Math.floor(s.time * 3) % 2 === 0) this.text(s.warning, b.x, b.y - 150, 44, WARN);
  }
}
