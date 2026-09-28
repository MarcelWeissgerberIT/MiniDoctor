// Cockpit overlay (keyed OpenArt image) + live dashboard displays.
// Display rectangles are measured in pixels on the 2752×1536 source image,
// so the canvases sit exactly on the painted screens of the dashboard.

const IMG_W = 2752;
const IMG_H = 1536;
export const COCKPIT_ASPECT = IMG_W / IMG_H;

const RECTS = {
  main: [1287, 1267, 123, 63],
  s1: [1425, 1267, 69, 23],
  s2: [1426, 1298, 68, 23],
  s3: [1426, 1330, 69, 24],
  right: [1522, 1286, 132, 68],
};
const LAMPS = [
  [1107, 1332], // 0 autopilot
  [1167, 1284], // 1 anchor
  [1224, 1284], // 2 tool active
  [1165, 1332], // 3 sound
  [1222, 1332], // 4 warning
];
const LAMP_R = 17;
// Control grips (separate animated layers, see tools/process-assets.mjs).
// pivot = the mounting socket in the console.
const GRIPS = {
  left: { rect: [400, 1330, 470, 206], pivot: [696, 1417] },
  right: { rect: [1885, 1330, 470, 206], pivot: [2064, 1417] },
};
const LEDS = [
  [1310, 1347],
  [1347, 1347],
  [1386, 1347],
];

function pct(x, w) {
  return `${(x / w) * 100}%`;
}

export class Cockpit {
  constructor(root) {
    this.root = root;
    this.frame = document.createElement('div');
    this.frame.className = 'cockpit-frame';
    root.appendChild(this.frame);
    const img = document.createElement('img');
    img.src = 'assets/cockpit.webp';
    img.alt = '';
    img.className = 'cockpit-img';
    this.frame.appendChild(img);

    this.canvases = {};
    for (const [k, [x, y, w, h]] of Object.entries(RECTS)) {
      const c = document.createElement('canvas');
      c.className = 'dash-screen';
      Object.assign(c.style, { left: pct(x, IMG_W), top: pct(y, IMG_H), width: pct(w, IMG_W), height: pct(h, IMG_H) });
      this.frame.appendChild(c);
      this.canvases[k] = c;
    }
    this.buttonHandlers = {};
    this.lamps = LAMPS.map(([x, y], i) => {
      const d = document.createElement('div');
      d.className = 'dash-lamp';
      d.dataset.i = i;
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        d.classList.add('pressed');
        this.buttonHandlers.press?.(i);
      });
      const up = () => d.classList.remove('pressed');
      d.addEventListener('pointerup', up);
      d.addEventListener('pointerleave', up);
      const lab = document.createElement('div');
      lab.className = 'dash-label';
      Object.assign(lab.style, { left: pct(x - 40, IMG_W), top: pct(y + LAMP_R + 1, IMG_H), width: pct(80, IMG_W) });
      this.frame.appendChild(lab);
      d.label = lab;
      Object.assign(d.style, {
        left: pct(x - LAMP_R, IMG_W),
        top: pct(y - LAMP_R, IMG_H),
        width: pct(LAMP_R * 2, IMG_W),
        height: pct(LAMP_R * 2, IMG_H),
      });
      this.frame.appendChild(d);
      return d;
    });
    this.leds = LEDS.map(([x, y]) => {
      const d = document.createElement('div');
      d.className = 'dash-led';
      Object.assign(d.style, { left: pct(x - 11, IMG_W), top: pct(y - 7, IMG_H), width: pct(22, IMG_W), height: pct(14, IMG_H) });
      this.frame.appendChild(d);
      return d;
    });
    // Control sticks: drag with mouse/touch (forward, back, left, right)
    this.sticks = {};
    for (const [name, g] of Object.entries(GRIPS)) {
      const [x, y, w, h] = g.rect;
      const d = document.createElement('div');
      d.className = 'grip';
      Object.assign(d.style, { left: pct(x, IMG_W), top: pct(y, IMG_H), width: pct(w, IMG_W), height: pct(h, IMG_H) });
      const im = document.createElement('img');
      im.src = `assets/grip_${name}.webp`;
      im.alt = '';
      im.draggable = false;
      im.style.transformOrigin = `${((g.pivot[0] - x) / w) * 100}% ${((g.pivot[1] - y) / h) * 100}%`;
      d.appendChild(im);
      this.frame.appendChild(d);
      const st = { el: d, img: im, drag: null, x: 0, y: 0, vx: 0, vy: 0, auto: { x: 0, y: 0 } };
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        d.setPointerCapture(e.pointerId);
        st.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 };
        d.classList.add('held');
      });
      d.addEventListener('pointermove', (e) => {
        if (!st.drag || e.pointerId !== st.drag.id) return;
        const range = d.getBoundingClientRect().width * 0.35;
        st.drag.x = Math.max(-1, Math.min(1, (e.clientX - st.drag.x0) / range));
        st.drag.y = Math.max(-1, Math.min(1, -(e.clientY - st.drag.y0) / range));
      });
      const end = (e) => {
        if (!st.drag || e.pointerId !== st.drag.id) return;
        st.drag = null;
        d.classList.remove('held');
      };
      d.addEventListener('pointerup', end);
      d.addEventListener('pointercancel', end);
      this.sticks[name] = st;
    }

    // overhead console: flip switches
    this.switches = [];
    const SW_Y = 30;
    for (let i = 0; i < 4; i++) {
      const x = 1180 + i * 105;
      const d = document.createElement('div');
      d.className = 'flip';
      Object.assign(d.style, { left: pct(x, IMG_W), top: pct(SW_Y, IMG_H), width: pct(80, IMG_W), height: pct(105, IMG_H) });
      d.innerHTML = '<div class="flip-plate"><div class="flip-lever"></div></div><div class="flip-led"></div><div class="flip-label"></div>';
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.buttonHandlers.flip?.(i);
      });
      this.frame.appendChild(d);
      this.switches.push(d);
    }
    // top-right panel: sonar
    this.sonar = document.createElement('canvas');
    this.sonar.className = 'sonar';
    Object.assign(this.sonar.style, { left: pct(2282, IMG_W), top: pct(35, IMG_H), width: pct(400, IMG_W), height: pct(200, IMG_H) });
    this.frame.appendChild(this.sonar);
    this.sonarPing = 0;
    // interior lighting (boot-up, alarm) above the cockpit image, below the HUD
    this.light = document.createElement('div');
    this.light.className = 'cockpit-light';
    this.frame.appendChild(this.light);

    // HUD layer lives inside the frame so it always lines up with the canopy
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.frame.appendChild(this.hud);

    this.ecg = new Float32Array(120);
    this.ecgPos = 0;
    this.layout();
    addEventListener('resize', () => this.layout());
  }

  layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    let w = vw;
    let h = vw / COCKPIT_ASPECT;
    if (h < vh) {
      h = vh;
      w = vh * COCKPIT_ASPECT;
    }
    Object.assign(this.frame.style, { width: `${w}px`, height: `${h}px`, left: `${(vw - w) / 2}px`, top: `${(vh - h) / 2}px` });
    this.scale = w / IMG_W;
    for (const [k, c] of Object.entries(this.canvases)) {
      const [, , rw, rh] = RECTS[k];
      const dpr = Math.min(3, devicePixelRatio || 1);
      c.width = Math.max(32, Math.round(rw * this.scale * dpr * 2));
      c.height = Math.max(16, Math.round(rh * this.scale * dpr * 2));
    }
  }

  /**
   * Animate the sticks. `auto` = deflection caused by keyboard/mouse so the
   * grips move along; a dragged grip overrides it. Returns the pilot's
   * drag input per stick (−1..1, y = forward).
   */
  updateSticks(dt, auto, comfort) {
    const out = {};
    for (const [name, st] of Object.entries(this.sticks)) {
      const target = st.drag ?? auto[name] ?? { x: 0, y: 0 };
      // critically damped spring → smooth, slight overshoot-free motion
      const k = st.drag ? 30 : 14;
      st.x += (target.x - st.x) * (1 - Math.exp(-dt * k));
      st.y += (target.y - st.y) * (1 - Math.exp(-dt * k));
      const tilt = comfort ? 0.8 : 1;
      st.img.style.transform =
        `perspective(700px) rotateX(${(-st.y * 16 * tilt).toFixed(2)}deg) ` +
        `rotate(${(st.x * 14 * tilt).toFixed(2)}deg) translateY(${(-st.y * 3).toFixed(2)}%)`;
      out[name] = st.drag ? { x: st.drag.x, y: st.drag.y } : { x: 0, y: 0 };
    }
    return out;
  }

  setLabels(labels) {
    this.lamps.forEach((l, i) => (l.label.textContent = labels[i] ?? ''));
  }
  setSwitches(states, labels) {
    this.switches.forEach((d, i) => {
      d.classList.toggle('on', !!states[i]);
      d.querySelector('.flip-label').textContent = labels[i];
    });
  }
  /** interior lights: boot-up flicker when a mission starts */
  boot() {
    this.light.classList.remove('booting');
    void this.light.offsetWidth;
    this.light.classList.add('booting');
    this.frame.querySelectorAll('.dash-screen, .sonar, .comm').forEach((el, i) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = `screenOn .5s ${0.6 + i * 0.18}s both`;
    });
  }
  alarm(on) {
    this.light.classList.toggle('alarm', !!on);
  }
  shake(comfort) {
    if (comfort) return;
    this.frame.classList.remove('shake');
    void this.frame.offsetWidth;
    this.frame.classList.add('shake');
  }
  ping() {
    this.sonarPing = 1;
  }

  /** radar-style top view around the ship; targets in metres-free relative coords */
  drawSonar(dt, targets = [], range = 200) {
    const c = this.sonar;
    const W = (c.width = 400);
    const H = (c.height = 200);
    const g = c.getContext('2d');
    this.sweep = ((this.sweep ?? 0) + dt * 2.2) % (Math.PI * 2);
    this.sonarPing = Math.max(0, this.sonarPing - dt * 0.6);
    g.fillStyle = '#051418';
    g.fillRect(0, 0, W, H);
    const cx = H / 2 + 10;
    const cy = H / 2;
    const R = H / 2 - 12;
    g.strokeStyle = 'rgba(127,243,255,0.25)';
    g.lineWidth = 1.5;
    for (const f of [0.33, 0.66, 1]) {
      g.beginPath();
      g.arc(cx, cy, R * f, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - R, cy);
    g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R);
    g.lineTo(cx, cy + R);
    g.stroke();
    // sweep wedge
    const grd = g.createConicGradient ? g.createConicGradient(this.sweep - 0.6, cx, cy) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(127,243,255,0)');
      grd.addColorStop(0.09, 'rgba(127,243,255,0.35)');
      grd.addColorStop(0.1, 'rgba(127,243,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
    }
    // ping ring
    if (this.sonarPing > 0) {
      g.strokeStyle = `rgba(255,210,127,${this.sonarPing})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, R * (1 - this.sonarPing), 0, Math.PI * 2);
      g.stroke();
    }
    // targets (x = right, z = ahead)
    for (const tg of targets) {
      const d = Math.hypot(tg.x, tg.z);
      if (d > range) continue;
      const px = cx + (tg.x / range) * R;
      const py = cy - (tg.z / range) * R;
      const a = Math.atan2(px - cx, -(py - cy));
      const since = (((this.sweep - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const glow = Math.max(0.25, 1 - since / 3) + this.sonarPing;
      g.fillStyle = tg.color ?? `rgba(255,210,127,${Math.min(1, glow)})`;
      g.globalAlpha = Math.min(1, glow);
      g.beginPath();
      g.arc(px, py, tg.size ?? 5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(cx, cy - 7);
    g.lineTo(cx - 5, cy + 5);
    g.lineTo(cx + 5, cy + 5);
    g.fill();
    g.fillStyle = 'rgba(127,243,255,0.8)';
    g.font = '18px ui-monospace, monospace';
    g.textAlign = 'left';
    g.fillText('SONAR', H + 30, 40);
    g.fillText(`${range} µm`, H + 30, 70);
    g.fillStyle = 'rgba(255,210,127,0.9)';
    g.fillText(`${targets.filter((x) => Math.hypot(x.x, x.z) <= range).length} ◦`, H + 30, 100);
  }

  show(v) {
    this.frame.style.display = v ? 'block' : 'none';
  }

  /**
   * Draw live values. `s` = {
   *   bpm, beat (0..1 phase), condition, flowReal (m/s), timeScale,
   *   wallDist (µm), dist (µm), R, shipX, shipY, target {x,y,label}|null,
   *   autopilot, anchored, toolActive, sound, warning, scanning
   * }
   */
  draw(s, dt) {
    this.drawMain(s, dt);
    this.drawSmall(this.canvases.s1, s.labels.flow, fmtFlow(s.flowReal), '#7ff3ff');
    this.drawSmall(this.canvases.s2, s.labels.wall, s.wallText ?? fmtLen(s.wallDist), s.wallDist < 30 ? '#ffd27f' : '#7ff3ff');
    this.drawSmall(this.canvases.s3, s.labels.dist, s.distText ?? fmtLen(s.dist), '#7ff3ff');
    this.drawMap(s);
    const set = (el, on, cls = 'on') => el.classList.toggle(cls, !!on);
    set(this.lamps[0], s.autopilot);
    set(this.lamps[1], s.anchored);
    set(this.lamps[2], s.toolActive);
    set(this.lamps[3], s.sound);
    set(this.lamps[4], s.radio, 'radio');
    set(this.leds[0], s.beat < 0.12);
    set(this.leds[1], s.scanning);
    set(this.leds[2], s.warning, 'warn');
  }

  drawMain(s, dt) {
    const c = this.canvases.main;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    // ECG from beat phase (P-QRS-T shape)
    const p = s.beat;
    let v = 0;
    if (s.condition <= 0) v = 0;
    else if (p < 0.08) v = Math.sin((p / 0.08) * Math.PI) * 0.12;
    else if (p < 0.12) v = 0;
    else if (p < 0.14) v = -0.15;
    else if (p < 0.17) v = 1;
    else if (p < 0.2) v = -0.3;
    else if (p < 0.35) v = 0;
    else if (p < 0.5) v = Math.sin(((p - 0.35) / 0.15) * Math.PI) * 0.25;
    this.ecgAcc = (this.ecgAcc ?? 0) + dt * 60;
    while (this.ecgAcc >= 1) {
      this.ecg[this.ecgPos] = v;
      this.ecgPos = (this.ecgPos + 1) % this.ecg.length;
      this.ecgAcc -= 1;
    }
    g.fillStyle = '#051418';
    g.fillRect(0, 0, W, H);
    const col = s.condition > 50 ? '#56f59a' : s.condition > 25 ? '#ffd27f' : '#ff6b6b';
    g.strokeStyle = col;
    g.lineWidth = Math.max(1, H / 40);
    g.beginPath();
    const n = this.ecg.length;
    for (let i = 0; i < n; i++) {
      const val = this.ecg[(this.ecgPos + i) % n];
      const x = (i / (n - 1)) * W * 0.62;
      const y = H * 0.62 - val * H * 0.4;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.fillStyle = col;
    g.font = `bold ${Math.round(H * 0.34)}px ui-monospace, monospace`;
    g.textAlign = 'right';
    g.fillText(String(Math.round(s.bpm)), W * 0.97, H * 0.4);
    g.font = `${Math.round(H * 0.16)}px ui-monospace, monospace`;
    g.fillText('BPM', W * 0.97, H * 0.58);
    g.fillText(`${Math.round(s.condition)}%`, W * 0.97, H * 0.88);
  }

  drawSmall(c, label, value, color) {
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#051418';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(127,243,255,0.55)';
    g.font = `${Math.round(H * 0.34)}px ui-monospace, monospace`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, W * 0.05, H * 0.52);
    g.fillStyle = color;
    g.font = `bold ${Math.round(H * 0.5)}px ui-monospace, monospace`;
    g.textAlign = 'right';
    g.fillText(value, W * 0.96, H * 0.55);
  }

  /** Cross-section of the vessel: ship position + target. */
  drawMap(s) {
    const c = this.canvases.right;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#051418';
    g.fillRect(0, 0, W, H);
    const cx = H * 0.52;
    const cy = H / 2;
    const rr = H * 0.42;
    g.strokeStyle = 'rgba(127,243,255,0.6)';
    g.lineWidth = Math.max(1, H / 50);
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
    // Poiseuille rings (flow speed)
    g.strokeStyle = 'rgba(127,243,255,0.15)';
    for (const f of [0.33, 0.66]) {
      g.beginPath();
      g.arc(cx, cy, rr * f, 0, Math.PI * 2);
      g.stroke();
    }
    if (s.target) {
      const tx = cx + (s.target.x / s.R) * rr;
      const ty = cy - (s.target.y / s.R) * rr;
      g.strokeStyle = '#ffd27f';
      g.beginPath();
      g.arc(tx, ty, H * 0.07, 0, Math.PI * 2);
      g.stroke();
    }
    const sx = cx + (s.shipX / s.R) * rr;
    const sy = cy - (s.shipY / s.R) * rr;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(sx, sy, H * 0.045, 0, Math.PI * 2);
    g.fill();
    // text column
    g.fillStyle = 'rgba(127,243,255,0.8)';
    g.font = `${Math.round(H * 0.15)}px ui-monospace, monospace`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(s.diamText ?? `Ø ${fmtLen(s.R * 2)}`, W * 0.55, H * 0.12);
    g.fillText(`1:${s.timeScale}`, W * 0.55, H * 0.4);
    g.fillStyle = s.autopilot ? '#56f59a' : 'rgba(127,243,255,0.5)';
    g.fillText(s.autopilot ? 'AUTO' : 'MAN', W * 0.55, H * 0.68);
  }
}

export function fmtLen(um) {
  const a = Math.abs(um);
  if (a >= 1000) return `${(um / 1000).toFixed(a >= 10000 ? 1 : 2)} mm`;
  if (a >= 10) return `${Math.round(um)} µm`;
  return `${um.toFixed(1)} µm`;
}
export function fmtFlow(ms) {
  if (ms >= 0.01) return `${ms.toFixed(2)} m/s`;
  return `${(ms * 1000).toFixed(2)} mm/s`;
}
