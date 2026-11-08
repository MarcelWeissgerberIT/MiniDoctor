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
    this.W = Math.round(this.w * 1250);
    this.H = Math.round(this.h * 1250);
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
    this.drawLadder(s, q);
    this.drawReticle(b);
    this.drawBank(s, b);
    this.drawArcs(s, b);
    this.drawWaypoint(s, q);
    g.shadowBlur = 4;
    this.drawThreats(s, b);
    this.drawNav(s);
    this.drawSystems(s);
    this.drawTarget(s);
    this.drawWeapons(s);
    this.drawMission(s);
    this.drawStatus(s, b);
    g.shadowBlur = 8;
    this.tex.needsUpdate = true;
  }

  /** a block of lines; each line [text, color] (or a string) */
  block(x, y, lines, align = 'left', size = 28) {
    let yy = y;
    for (const l of lines) {
      if (l == null) continue;
      const [t, c, sz] = typeof l === 'string' ? [l, C] : l;
      this.text(t, x, yy, sz || size, c || C, align);
      yy += (sz || size) * 1.22;
    }
  }

  /** pitch ladder: +-5 deg lines in the walking direction, they pitch and roll with the cabin */
  drawLadder(s, q) {
    const g = this.g;
    g.lineWidth = 2.5;
    for (const p of [-5, 5]) {
      const cp = Math.cos(p * DEG);
      const sp = Math.sin(p * DEG);
      for (const side of [-1, 1]) {
        const a1 = s.heading + side * 3.2 * DEG;
        const a2 = s.heading + side * 6.5 * DEG;
        const p1 = this.projectWorld(-Math.sin(a1) * cp, sp, -Math.cos(a1) * cp, q);
        const p2 = this.projectWorld(-Math.sin(a2) * cp, sp, -Math.cos(a2) * cp, q);
        if (!p1 || !p2) continue;
        g.strokeStyle = DIM;
        if (p < 0) g.setLineDash([10, 8]);
        g.beginPath();
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        // end tick towards the horizon
        g.lineTo(p2.x, p2.y + (p > 0 ? 12 : -12));
        g.stroke();
        g.setLineDash([]);
      }
    }
    g.strokeStyle = C;
    g.lineWidth = 3;
  }

  /** bank scale under the reticle: the cabin's roll as the legs carry it */
  drawBank(s, b) {
    const g = this.g;
    const R = 165;
    const k = 3; // 1 deg of roll = 3 deg on the scale
    g.strokeStyle = DIM;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(b.x, b.y, R, Math.PI / 2 - 0.55, Math.PI / 2 + 0.55);
    g.stroke();
    for (const r of [-10, -5, 0, 5, 10]) {
      const a = Math.PI / 2 + r * DEG * k;
      const l = r === 0 ? 18 : 10;
      g.beginPath();
      g.moveTo(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R);
      g.lineTo(b.x + Math.cos(a) * (R + l), b.y + Math.sin(a) * (R + l));
      g.stroke();
    }
    const roll = Math.max(-12, Math.min(12, (s.roll || 0) / DEG));
    const a = Math.PI / 2 - roll * DEG * k;
    const px = b.x + Math.cos(a) * (R - 6);
    const py = b.y + Math.sin(a) * (R - 6);
    g.fillStyle = C;
    g.beginPath();
    g.moveTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4);
    g.lineTo(px - Math.cos(a) * 14 + Math.sin(a) * 8, py - Math.sin(a) * 14 - Math.cos(a) * 8);
    g.lineTo(px - Math.cos(a) * 14 - Math.sin(a) * 8, py - Math.sin(a) * 14 + Math.cos(a) * 8);
    g.closePath();
    g.fill();
    g.strokeStyle = C;
    g.lineWidth = 3;
  }

  /** threat ring: every known vehicle as a tick at its bearing; red when its gun is on us */
  drawThreats(s, b) {
    const it = s.intel;
    if (!it) return;
    const g = this.g;
    const R = 250;
    g.fillStyle = DIM;
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      g.beginPath();
      g.arc(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const t of it.list) {
      const a = -Math.PI / 2 - t.rel;
      const near = t.dist < 300 ? 1.4 : t.dist < 600 ? 1.15 : 0.9;
      const col = t.aiming ? RED : t === it.primary ? WARN : DIM;
      const x = b.x + Math.cos(a) * R;
      const y = b.y + Math.sin(a) * R;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 18 * near, y + Math.sin(a) * 18 * near);
      g.lineTo(x - Math.sin(a) * 9 * near, y + Math.cos(a) * 9 * near);
      g.lineTo(x + Math.sin(a) * 9 * near, y - Math.cos(a) * 9 * near);
      g.closePath();
      g.fill();
    }
    // laser warning receiver and shells on the way
    if (it.threats.length && Math.floor(s.time * 4) % 2 === 0) {
      const clocks = [...new Set(it.threats.map((t) => t.clock))].join(' · ');
      this.text(`ANGEPEILT  ${clocks} UHR`, b.x, b.y - 205, 36, RED);
    }
    if (it.incoming) this.text(`GRANATE ×${it.incoming}`, b.x, b.y + 210, 32, RED);
  }

  /** navigation block (upper left) */
  drawNav(s) {
    const deg = (a) => String(Math.round(((-a / DEG) % 360) + 360) % 360).padStart(3, '0');
    const lk = Math.round(s.look / DEG);
    const lp = Math.round((s.lookPitch || 0) / DEG);
    const wp = s.waypoint;
    const eta = wp?.eta != null ? `${Math.floor(wp.eta / 60)}:${String(Math.floor(wp.eta % 60)).padStart(2, '0')}` : '--:--';
    const slope = Math.round((s.slope || 0) / DEG);
    this.block(70, 190, [
      ['NAV', DIM, 24],
      `KURS   ${deg(s.heading)}°`,
      `BLICK  ${lk === 0 ? 'MITTE' : (lk > 0 ? 'L' : 'R') + String(Math.abs(lk)).padStart(3) + '°'} ${lp >= 0 ? '+' : '-'}${Math.abs(lp)}°`,
      wp ? `${wp.label.padEnd(5)}  ${String(Math.round(wp.dist)).padStart(4)} m ${deg(wp.bearing)}°` : ['KEINE WEGMARKE', DIM],
      wp ? `ETA    ${eta}` : null,
      `GELÄNDE ${String(Math.round(s.alt || 0)).padStart(3)} m ${slope >= 0 ? '↗' : '↘'}${Math.abs(slope)}°`,
      s.range ? `LASER  ${String(Math.round(s.range)).padStart(4, '0')} m` : ['LASER  ----', DIM],
    ]);
  }

  /** mech condition (lower left) */
  drawSystems(s) {
    const y = s.systems;
    if (!y) return;
    const pct = (v) => String(Math.round(v * 100)).padStart(3) + '%';
    const bars = (v, n = 6) => '▰'.repeat(Math.round(v * n)) + '▱'.repeat(n - Math.round(v * n));
    const col = (v) => (v > 0.7 ? C : v > 0.4 ? WARN : RED);
    const lines = [
      ['SYS', DIM, 24],
      [`STRUKTUR ${pct(y.integrity)} ${bars(y.integrity)}`, col(y.integrity)],
      [`REAKTOR  ${pct(y.reactor)}  HITZE ${pct(y.heat)}`, y.heat > 0.75 ? RED : y.heat > 0.6 ? WARN : C],
      [`HYDR. ${String(Math.round(y.hyd * 3500)).padStart(4)} PSI`, y.hyd < 0.4 ? RED : C],
    ];
    if (y.fire) lines.push([`FEUER AN BORD · LÖSCH ${y.bottles}`, RED]);
    if (y.failed.length) lines.push([`AUSFALL ${y.failed.slice(0, 3).join(' ')}`, RED]);
    else lines.push(['ALLE SYSTEME OK', DIM]);
    this.block(70, 600, lines);
  }

  /** the primary target (upper right) */
  drawTarget(s) {
    const it = s.intel;
    if (!it) return;
    const x = this.W - 70;
    const t = it.primary;
    if (!t) {
      this.block(x, 190, [['ZIEL', DIM, 24], ['KEIN KONTAKT', DIM]], 'right');
      return;
    }
    const deg = String(Math.round(((-t.brg / DEG) % 360) + 360) % 360).padStart(3, '0');
    const fac = { FRONT: '×0.5', SEITE: '×1.0', HECK: '×1.6' }[t.face] || '';
    const hp = Math.round(t.hp * 100);
    const n = Math.round(t.hp * 6);
    this.block(
      x,
      190,
      [
        [`ZIEL ${it.list.indexOf(t) + 1}/${it.list.length}${s.fc?.autoTarget ? ' · AUTO' : ''}`, s.fc?.autoTarget ? C : DIM, 24],
        [`${t.label} · ${t.name}`, t.aiming ? RED : WARN],
        `${String(Math.round(t.dist)).padStart(4)} m  ${deg}°  ${t.clock} UHR`,
        t.face ? [`ZEIGT ${t.face} ${fac}`, t.face === 'HECK' ? C : t.face === 'FRONT' ? WARN : C] : null,
        t.stale ? ['LETZTE POSITION', WARN] : `${t.state} ${Math.round(t.kmh)} km/h`,
        [`${'▰'.repeat(n)}${'▱'.repeat(6 - n)} ${hp}%`, hp < 40 ? C : WARN],
        t.aiming ? ['RICHTET AUF DICH', RED] : t.marked ? ['MARKIERT', C] : null,
      ],
      'right',
    );
  }

  /** weapons (lower right) */
  drawWeapons(s) {
    const w = s.weapons;
    if (!w) return;
    const x = this.W - 70;
    if (!w.master) {
      this.block(x, 600, [['WAFFEN', DIM, 24], ['GESICHERT', DIM]], 'right');
      return;
    }
    const heat = Math.round(w.heat * 6);
    const lk = Math.round((w.lockT || 0) * 4);
    const yaw = Math.round((w.gunYaw || 0) / DEG);
    const pit = Math.round((w.gunPitch || 0) / DEG);
    this.block(
      x,
      600,
      [
        ['WAFFEN', DIM, 24],
        [w.gunDead ? 'KANONE AUSGEFALLEN' : `KAN ${String(w.ammo).padStart(3)} ${'▮'.repeat(heat)}${'▯'.repeat(6 - heat)}`, w.gunDead || w.overheated ? RED : w.gun ? C : DIM],
        [`MG  ${String(w.mgAmmo).padStart(4)}`, w.mg ? C : DIM],
        s.fc ? [`${{ single: 'EINZEL', burst: 'STOSS', auto: 'DAUER' }[s.fc.gunMode]} · ${{ manual: 'FREI', lead: 'VORHALT', auto: 'ROHR AUTO' }[s.fc.gunAim]}`, s.gunAuto ? C : DIM, 24] : null,
        [
          w.blocked ? 'RAK BLOCKIERT' : `RAK ${String(w.missiles).padStart(2)} ${w.locked ? 'LOCK' : lk ? '▰'.repeat(lk) + '▱'.repeat(4 - lk) : 'SUCHE'}${s.fc ? ` ${{ direct: 'DIR', auto: '', top: 'STEIL' }[s.fc.missileProfile]}${s.fc.salvo > 1 ? '×' + s.fc.salvo : ''}` : ''}`,
          w.blocked ? RED : w.locked ? RED : w.missile ? C : DIM,
        ],
        w.inLimits ? `ROHR ${yaw === 0 ? 'MITTE' : (yaw > 0 ? 'L' : 'R') + Math.abs(yaw) + '°'} ${pit >= 0 ? '+' : '-'}${Math.abs(pit)}°` : ['AUSSER SCHWENKBEREICH', WARN],
        w.range ? `ENTF ${String(Math.round(w.range)).padStart(4, '0')} m` : null,
      ],
      'right',
    );
  }

  /** objective, progress, kills and mission time along the bottom */
  drawMission(s) {
    const m = s.mission;
    if (!m) return;
    const parts = [m.step ? `AUFTRAG ${m.step}` : 'AUFTRAG', m.objective, m.total != null ? `ABSCHÜSSE ${m.kills}/${m.total}` : null, m.time].filter(Boolean);
    this.text(parts.join('  ·  '), this.W / 2, this.H - 32, 26, C);
  }

  /** heading band along the top of the canopy, ticks placed on the real directions */
  drawCompass(s, q) {
    const g = this.g;
    const y = 60;
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
    const y = inside ? Math.min(this.H - 120, Math.max(150, p.y)) : 470;
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

  /** mode flags under the compass, blinking warnings over the reticle */
  drawStatus(s, b) {
    const flags = [s.stab ? 'STAB' : 'STAB AUS', s.nv ? 'NV' : '', s.lights ? '' : 'DUNKEL'].filter(Boolean);
    this.text(flags.join('   '), b.x, 150, 24, DIM);
    if (s.warning && Math.floor(s.time * 3) % 2 === 0) this.text(s.warning, b.x, b.y - 150, 44, WARN);
  }
}
