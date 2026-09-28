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
    this.lamps = LAMPS.map(([x, y]) => {
      const d = document.createElement('div');
      d.className = 'dash-lamp';
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
    this.drawSmall(this.canvases.s2, s.labels.wall, fmtLen(s.wallDist), s.wallDist < 30 ? '#ffd27f' : '#7ff3ff');
    this.drawSmall(this.canvases.s3, s.labels.dist, fmtLen(s.dist), '#7ff3ff');
    this.drawMap(s);
    const set = (el, on, cls = 'on') => el.classList.toggle(cls, !!on);
    set(this.lamps[0], s.autopilot);
    set(this.lamps[1], s.anchored);
    set(this.lamps[2], s.toolActive);
    set(this.lamps[3], s.sound);
    set(this.lamps[4], s.warning, 'warn');
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
    g.fillText(`Ø ${fmtLen(s.R * 2)}`, W * 0.55, H * 0.12);
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
