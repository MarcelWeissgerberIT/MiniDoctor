// Helmet-mounted display: a screen-space overlay that stays readable wherever the
// pilot looks. Throttle and speed are always shown; with the weapons armed it adds
// the gun pipper, the missile seeker, target boxes, weapon status and hit cues.

const G = '#a6ffb8';
const W = '#effff2';
const DIM = 'rgba(166,255,184,0.45)';
const AMBER = '#ffc15e';
const RED = '#ff5a48';
const FONT = "'JetBrains Mono','DejaVu Sans Mono','Consolas',monospace";

export class HMD {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.hits = [];
    this.notes = [];
    this.armor = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(innerWidth * this.ratio);
    this.canvas.height = Math.round(innerHeight * this.ratio);
  }

  /** a hit from a direction relative to where the pilot looks (rad, + = right) */
  hitFrom(angle) {
    this.hits.push({ angle, t: 0 });
  }

  /** lead mark (where to aim at a moving target) and the barrel laid by the computer */
  drawFireControl(s) {
    const g = this.g;
    if (s.lead) {
      const { x, y } = s.lead;
      g.strokeStyle = AMBER;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y - 9);
      g.lineTo(x + 9, y);
      g.lineTo(x, y + 9);
      g.lineTo(x - 9, y);
      g.closePath();
      g.stroke();
      g.fillStyle = AMBER;
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
      this.text('VORHALT', x, y + 20, { size: 11, color: AMBER, align: 'center', weight: 'normal' });
    }
    if (s.gunCross) {
      const { x, y } = s.gunCross;
      g.strokeStyle = G;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 11, 0, Math.PI * 2);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        g.moveTo(x + dx * 7, y + dy * 7);
        g.lineTo(x + dx * 17, y + dy * 17);
      }
      g.stroke();
      this.text('ROHR AUTO', x, y + 26, { size: 11, color: G, align: 'center' });
    }
  }

  /** where our round struck the armour (next to the pipper) */
  armorHit(text, color) {
    this.armor = { text, color, t: 0 };
  }

  /** short line of text in the middle of the visor */
  notify(text, color = W, seconds = 2.5) {
    this.notes.unshift({ text, color, until: performance.now() + seconds * 1000 });
    this.notes.length = Math.min(this.notes.length, 3);
  }

  text(s, x, y, { size = 16, color = G, align = 'left', weight = 'bold' } = {}) {
    const g = this.g;
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.strokeText(s, x, y);
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  draw(dt, s) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s.visible) return;
    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const W_ = innerWidth;
    const H = innerHeight;
    g.globalAlpha = 0.35 + 0.65 * s.power;
    // corner panels shrink on small screens (phones)
    const k = Math.max(0.55, Math.min(1, W_ / 1100, H / 620));
    g.save();
    g.scale(k, k);
    const w = W_ / k;
    const h = H / k;
    // in the panel views the corner boxes would cover the displays
    if (s.panels === false) {
      g.restore();
      this.drawHits(dt, W_, H);
      this.drawNotes(s, W_, H);
      g.globalAlpha = 1;
      return;
    }
    // with touch controls the lever and the fire buttons sit in the corners instead
    if (!s.touch) this.drawThrottle(s, 26, h - 130);
    if (s.weapons && !s.touch) this.drawWeapons(s, w - 26, h - 60);
    const py = s.touch ? h - 360 : h - (s.weapons ? 230 : 100);
    if (s.parts) this.drawParts(s.parts, w - 26, py);
    if (s.failed?.length) s.failed.forEach((f, i) => this.text(`✕ ${f}`, w - 26, py - 130 - i * 18, { size: 13, color: RED, align: 'right' }));
    if (s.allies) this.drawLance(s.allies, 26, s.touch ? h - 470 : h - 400);
    g.restore();
    if (s.allies) this.drawAllyMarkers(s.allies);
    if (s.weapons) this.drawSight(s, W_ / 2, H / 2);
    this.drawFireControl(s);
    if (this.armor) {
      this.armor.t += dt;
      if (this.armor.t > 1.3) this.armor = null;
      else {
        g.globalAlpha = (0.35 + 0.65 * s.power) * Math.min(1, (1.3 - this.armor.t) * 3);
        this.text(this.armor.text, W_ / 2 + 38, H / 2 - 34, { size: 13, color: this.armor.color });
        g.globalAlpha = 0.35 + 0.65 * s.power;
      }
    }
    if (s.targets) this.drawTargets(s, W_, H);
    this.drawHits(dt, W_, H);
    this.drawNotes(s, W_, H);
    g.globalAlpha = 1;
  }

  /** lance panel: one line per wingman with health and current order */
  drawLance(allies, x, y) {
    const g = this.g;
    const ORDER = { follow: 'FOLGEN', hold: 'HALTEN', attack: 'ANGRIFF' };
    g.fillStyle = 'rgba(0,12,6,0.38)';
    g.fillRect(x - 10, y - 26, 178, 22 + allies.length * 30);
    this.text('LANZE  B·V·T', x, y - 14, { size: 12, color: DIM });
    allies.forEach((a, i) => {
      const yy = y + 8 + i * 30;
      const col = a.dead ? RED : a.hp > 0.6 ? G : a.hp > 0.3 ? AMBER : RED;
      this.text(a.name.replace('HAMMER ', 'H'), x, yy, { size: 15, color: col });
      if (a.dead) {
        this.text('AUSGEFALLEN', x + 40, yy, { size: 12, color: RED });
        return;
      }
      g.strokeStyle = DIM;
      g.lineWidth = 1.5;
      g.strokeRect(x + 40, yy - 6, 54, 10);
      g.fillStyle = col;
      g.fillRect(x + 42, yy - 4, 50 * a.hp, 6);
      this.text(ORDER[a.order] || '', x + 102, yy, { size: 12, color: G });
    });
  }

  /** friendly mechs: green chevrons with the call sign, so nobody shoots them */
  drawAllyMarkers(allies) {
    const g = this.g;
    for (const a of allies) {
      if (!a.onScreen || a.dead) continue;
      g.strokeStyle = '#7dffb0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(a.x - 9, a.y - 8);
      g.lineTo(a.x, a.y);
      g.lineTo(a.x + 9, a.y - 8);
      g.stroke();
      this.text(`${a.name.replace('HAMMER ', 'H')} ${Math.round(a.dist)}`, a.x, a.y - 18, { size: 11, color: '#7dffb0', align: 'center', weight: 'normal' });
    }
  }

  drawThrottle(s, x, y) {
    const g = this.g;
    const h = 150;
    const top = y - h;
    const yOf = (v) => y - ((v + 0.3) / 1.3) * h;
    // backing for contrast against a bright sky
    g.fillStyle = 'rgba(0,12,6,0.38)';
    g.fillRect(x - 10, top - 34, 178, h + 50);
    this.text('SCHUB', x, top - 18, { size: 13, color: DIM });
    // tape
    g.strokeStyle = G;
    g.lineWidth = 2;
    g.strokeRect(x, top, 18, h);
    for (const v of [-0.3, 0, 0.25, 0.5, 0.75, 1]) {
      const yy = yOf(v);
      g.beginPath();
      g.moveTo(x + 18, yy);
      g.lineTo(x + (v === 0 ? 30 : 25), yy);
      g.stroke();
    }
    const t = s.throttle;
    g.fillStyle = t >= 0 ? G : AMBER;
    const y0 = yOf(0);
    const y1 = yOf(t);
    g.fillRect(x + 3, Math.min(y0, y1), 12, Math.abs(y1 - y0));
    // actual speed caret on the same scale
    const sv = Math.max(-0.3, Math.min(1, s.speed / s.maxSpeed));
    const ys = yOf(sv);
    g.fillStyle = W;
    g.beginPath();
    g.moveTo(x - 2, ys);
    g.lineTo(x - 10, ys - 6);
    g.lineTo(x - 10, ys + 6);
    g.closePath();
    g.fill();
    // numbers
    const pct = Math.round(t * 100);
    this.text(`${pct > 0 ? '+' : ''}${pct}%`, x + 40, top + 22, { size: 28, color: t < 0 ? AMBER : W });
    this.text(`${Math.round(Math.abs(s.speed) * 3.6)} km/h`, x + 40, top + 60, { size: 20, color: W });
    let mode = 'STOP';
    let col = DIM;
    if (s.legsLocked) {
      mode = 'BEINE GESPERRT';
      col = AMBER;
    } else if (!s.canWalk) {
      mode = 'KEIN ANTRIEB';
      col = AMBER;
    } else if (t > 0.01) {
      mode = 'VORWÄRTS';
      col = G;
    } else if (t < -0.01) {
      mode = 'RÜCKWÄRTS';
      col = AMBER;
    }
    this.text(mode, x + 40, top + 92, { size: 14, color: col });
    this.text('W/S  X=0', x + 40, top + 118, { size: 12, color: DIM, weight: 'normal' });
  }

  drawWeapons(s, x, y) {
    const g = this.g;
    const w = s.weapons;
    g.fillStyle = 'rgba(0,12,6,0.38)';
    g.fillRect(x - 210, y - 150, 220, 160);
    if (!w.master) {
      this.text('WAFFEN GESICHERT', x, y - 130, { size: 15, color: AMBER, align: 'right' });
      this.text('Overhead (2): WEAPONS ARM', x, y - 108, { size: 12, color: DIM, align: 'right', weight: 'normal' });
      return;
    }
    // gun
    this.text(w.gunName || 'KANONE 30mm', x - 200, y - 130, { size: 14, color: w.gun ? G : DIM });
    this.text(String(w.ammo), x, y - 130, { size: 20, color: w.ammo < 40 ? AMBER : W, align: 'right' });
    g.strokeStyle = DIM;
    g.lineWidth = 2;
    g.strokeRect(x - 200, y - 112, 200, 12);
    g.fillStyle = w.overheated ? RED : w.heat > 0.7 ? AMBER : G;
    g.fillRect(x - 198, y - 110, 196 * w.heat, 8);
    if (w.overheated) this.text('ÜBERHITZT', x - 100, y - 92, { size: 13, color: RED, align: 'center' });
    else if (!w.gun) this.text(w.gunDamaged ? 'ARM ZERSTÖRT' : 'MAIN GUN AUS', x - 100, y - 92, { size: 13, color: AMBER, align: 'center' });
    else if (!w.inLimits) this.text('AUSSER SCHWENKBEREICH', x - 100, y - 92, { size: 12, color: AMBER, align: 'center' });
    // missiles
    this.text('RAKETEN', x - 200, y - 64, { size: 14, color: w.missile ? G : DIM });
    this.text(String(w.missiles), x, y - 64, { size: 20, color: w.missiles ? W : AMBER, align: 'right' });
    let lock = w.missile ? (w.unguided ? 'ZIELPUNKT' : 'SUCHE') : 'MISSILE AUS';
    let col = w.missile ? DIM : AMBER;
    if (w.locked) {
      lock = 'LOCK  ·  F';
      col = RED;
    } else if (w.lockT > 0) {
      lock = `AUFSCHALT. ${Math.round(w.lockT * 100)}%`;
      col = AMBER;
    }
    this.text(lock, x - 200, y - 40, { size: 14, color: col });
    this.text(`${w.mgName || 'MG'} ${w.mg ? (w.flamer ? `${Math.ceil(w.mgAmmo)} s` : w.mgAmmo) : 'AUS'}`, x, y - 40, { size: 13, color: w.mg ? G : DIM, align: 'right' });
    this.text(`LMB ${w.gunName?.startsWith('GATLING') ? 'Gatling' : w.gunName?.startsWith('RAIL') ? 'Railgun' : 'Kanone'} · E ${w.flamer ? 'Flammen' : 'MG'} · F Rakete`, x - 200, y - 14, { size: 12, color: DIM, weight: 'normal' });
  }

  drawParts(p, x, y) {
    const g = this.g;
    const col = (v) => (v > 0.7 ? G : v > 0.4 ? AMBER : RED);
    const cx = x - 40;
    const cy = y - 60;
    g.lineWidth = 2;
    const box = (v, bx, by, bw, bh) => {
      g.strokeStyle = col(v);
      g.fillStyle = v <= 0 ? 'rgba(255,90,72,0.5)' : 'rgba(0,0,0,0)';
      g.fillRect(bx, by, bw, bh);
      g.strokeRect(bx, by, bw, bh);
    };
    box(p.head, cx - 8, cy - 46, 16, 12);
    box(p.torso, cx - 18, cy - 32, 36, 30);
    box(p.larm, cx - 30, cy - 30, 10, 28);
    box(p.rarm, cx + 20, cy - 30, 10, 28);
    box(p.lleg, cx - 16, cy + 1, 12, 34);
    box(p.rleg, cx + 4, cy + 1, 12, 34);
    const worst = Math.min(p.head, p.torso);
    this.text(`${Math.round(worst * 100)}%`, cx - 40, cy - 10, { size: 15, color: col(worst), align: 'right' });
  }

  drawSight(s, cx, cy) {
    const g = this.g;
    const w = s.weapons;
    if (!w.master) return;
    g.lineWidth = 2;
    // missile seeker cone
    if (w.missile && w.coneR) {
      g.strokeStyle = w.locked ? RED : DIM;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.arc(cx, cy, w.coneR, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (!w.gun) return;
    g.strokeStyle = w.overheated ? RED : w.inLimits ? G : AMBER;
    if (!w.inLimits) {
      g.beginPath();
      g.moveTo(cx - 10, cy - 10);
      g.lineTo(cx + 10, cy + 10);
      g.moveTo(cx + 10, cy - 10);
      g.lineTo(cx - 10, cy + 10);
      g.stroke();
      return;
    }
    g.beginPath();
    g.arc(cx, cy, 16, 0, Math.PI * 2);
    g.stroke();
    // heat eats the pipper ring
    if (w.heat > 0) {
      g.strokeStyle = w.overheated ? RED : AMBER;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, 21, -Math.PI / 2, -Math.PI / 2 + w.heat * Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
    }
    g.fillStyle = g.strokeStyle = w.overheated ? RED : G;
    g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
    ]) {
      g.beginPath();
      g.moveTo(cx + dx * 22, cy + dy * 22);
      g.lineTo(cx + dx * 32, cy + dy * 32);
      g.stroke();
    }
    if (s.aimRange) this.text(`${Math.round(s.aimRange)}`, cx + 26, cy + 24, { size: 12, color: DIM, weight: 'normal' });
  }

  drawTargets(s, W_, H) {
    const g = this.g;
    for (const t of s.targets) {
      const locking = t.lock > 0;
      const color = t.stale ? DIM : t.locked ? RED : locking ? AMBER : RED;
      if (t.onScreen) {
        const r = Math.max(12, Math.min(60, t.r));
        g.strokeStyle = color;
        g.lineWidth = t.locked ? 3 : 2;
        const k = r * 0.45;
        g.beginPath();
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          g.moveTo(t.x + sx * r, t.y + sy * (r - k));
          g.lineTo(t.x + sx * r, t.y + sy * r);
          g.lineTo(t.x + sx * (r - k), t.y + sy * r);
        }
        g.stroke();
        if (locking && !t.locked) {
          // diamond closes in while the seeker works
          const d = r + 6 + (1 - t.lock) * 30;
          g.beginPath();
          g.moveTo(t.x, t.y - d);
          g.lineTo(t.x + d, t.y);
          g.lineTo(t.x, t.y + d);
          g.lineTo(t.x - d, t.y);
          g.closePath();
          g.stroke();
        }
        if (t.droneMarked) {
          g.fillStyle = '#9fe8ff';
          g.beginPath();
          g.arc(t.x + r + 6, t.y - r - 6, 4, 0, Math.PI * 2);
          g.fill();
        }
        if (t.locked) this.text('LOCK', t.x, t.y - r - 12, { size: 14, color: RED, align: 'center' });
        else if (t.designated) this.text('ZUGEWIESEN', t.x, t.y - r - 12, { size: 12, color: AMBER, align: 'center' });
        else if (t.marked) this.text('MARKIERT', t.x, t.y - r - 12, { size: 12, color: G, align: 'center' });
        this.text(`${t.label} ${Math.round(t.dist)}`, t.x, t.y + r + 12, { size: 12, color, align: 'center' });
        // second line: which side it shows us and its condition; its gun on us flashes
        if (t.face) this.text(`${t.face}${t.hp < 1 ? ' ' + Math.round(t.hp * 100) + '%' : ''}`, t.x, t.y + r + 26, { size: 11, color: DIM, align: 'center', weight: 'normal' });
        if (t.aiming && Math.floor(performance.now() / 250) % 2 === 0) {
          g.strokeStyle = RED;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(t.x, t.y, r + 8, 0, Math.PI * 2);
          g.stroke();
        }
      } else {
        // off-screen: a pointer at the edge of the visor
        const rx = W_ * 0.42;
        const ry = H * 0.4;
        const px = W_ / 2 + Math.cos(t.edge) * rx;
        const py = H / 2 - Math.sin(t.edge) * ry;
        g.save();
        g.translate(px, py);
        g.rotate(-t.edge);
        g.fillStyle = t.aiming && Math.floor(performance.now() / 250) % 2 === 0 ? AMBER : RED;
        g.beginPath();
        g.moveTo(12, 0);
        g.lineTo(-6, -8);
        g.lineTo(-6, 8);
        g.closePath();
        g.fill();
        g.restore();
        this.text(`${Math.round(t.dist)}`, px - Math.cos(t.edge) * 22, py + Math.sin(t.edge) * 22, { size: 11, color: RED, align: 'center', weight: 'normal' });
      }
    }
  }

  drawHits(dt, W_, H) {
    const g = this.g;
    const R = Math.min(W_, H) * 0.3;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      if (h.t > 1.8) {
        this.hits.splice(i, 1);
        continue;
      }
      const a = 1 - h.t / 1.8;
      g.strokeStyle = `rgba(255,70,50,${a})`;
      g.lineWidth = 8;
      // angle 0 = ahead = up on screen
      const ang = -Math.PI / 2 + h.angle;
      g.beginPath();
      g.arc(W_ / 2, H / 2, R, ang - 0.35, ang + 0.35);
      g.stroke();
    }
  }

  drawNotes(s, W_, H) {
    const now = performance.now();
    this.notes = this.notes.filter((n) => n.until > now);
    // in the panel views the notes move to the top edge, clear of the displays
    const ny = s.panels === false ? 16 : H * 0.28;
    const ns = s.panels === false ? 14 : 18;
    this.notes.forEach((n, i) => this.text(n.text, W_ / 2, ny + i * (ns + 6), { size: ns, color: n.color, align: 'center' }));
    if (s.fire) {
      const on = Math.floor(now / 350) % 2 === 0;
      if (on) this.text('FEUER AN BORD', W_ / 2, H * 0.16, { size: 26, color: RED, align: 'center' });
      this.text('FIRE SUPPR · Mittelkonsole (Taste 5)', W_ / 2, H * 0.16 + 28, { size: 14, color: AMBER, align: 'center' });
    }
  }
}
