import * as THREE from 'three';

const FONT = "'JetBrains Mono','DejaVu Sans Mono','Consolas',monospace";
// orange glass displays, matching the back-lit instruments
const G = '#ffa040';
const W = '#ffe6c8';
const GD = 'rgba(255,160,64,0.4)';
const AMBER = '#ffe04a';
const RED = '#ff4a3a';

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform sampler2D feed;
uniform float useFeed;
uniform float nv;
uniform float time;
uniform float power;
uniform float boot;
uniform float jolt;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5;
  vec2 uv = vUv;
  // flat glass display; a hard jolt or a hit makes the picture tear for a moment
  uv.y += jolt * 0.006 * sin(time * 90.0);
  uv.x += jolt * 0.015 * step(0.94, fract(uv.y * 7.0 + time * 13.0)) * sin(time * 140.0);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  vec3 col = vec3(0.012, 0.006, 0.003);
  if (useFeed > 0.5) {
    vec3 f = texture2D(feed, uv).rgb;
    float l = dot(f, vec3(0.299, 0.587, 0.114));
    l = pow(max(l * 1.4, 0.0), mix(0.8, 0.55, nv)) * mix(0.95, 1.7, nv);
    l += (hash(uv * 400.0 + time) - 0.5) * mix(0.03, 0.12, nv);
    // day: warm monochrome like the instruments, night vision: classic green
    col += mix(vec3(1.0, 0.62, 0.3), vec3(0.25, 1.0, 0.3), nv) * l * 0.9;
  }
  vec4 o = texture2D(map, uv);
  col = mix(col, o.rgb, o.a);
  // a faint backlight falloff towards the corners, nothing that blurs the symbols
  col *= mix(0.86, 1.0, smoothstep(0.75, 0.35, length(c * vec2(1.0, 1.2))));
  // boot: line expands vertically
  float b = clamp(boot, 0.0, 1.0);
  float open = smoothstep(0.0, 0.5, b);
  col *= step(abs(c.y), 0.5 * open + 0.004) * (1.0 + (1.0 - smoothstep(0.4, 1.0, b)) * 3.0);
  gl_FragColor = vec4(col * power * 0.95, 1.0);
}`;

/** One CRT multifunction display: canvas overlay + optional live camera feed. */
export class MFD {
  constructor(width, height, { feed = null } = {}) {
    // drawn in 512 x 384 units on a double-resolution canvas so the symbols stay sharp
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.uniforms = {
      map: { value: this.tex },
      feed: { value: feed ? feed.texture : null },
      useFeed: { value: feed ? 1 : 0 },
      nv: { value: 0 },
      time: { value: 0 },
      power: { value: 0 },
      boot: { value: 0 },
      jolt: { value: 0 },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag }),
    );
    this.on = false;
    this.bootT = 0;
  }

  update(dt, time) {
    this.uniforms.time.value = time;
    if (this.on) this.bootT = Math.min(1.5, this.bootT + dt);
    else this.bootT = Math.max(0, this.bootT - dt * 3);
    this.uniforms.boot.value = this.bootT;
    this.uniforms.power.value = this.bootT > 0 ? 1 : 0;
  }

  begin(clearAlpha = 1) {
    const g = this.ctx;
    g.setTransform(2, 0, 0, 2, 0, 0);
    if (clearAlpha < 1) g.clearRect(0, 0, 512, 384);
    else {
      g.fillStyle = '#0a0503';
      g.fillRect(0, 0, 512, 384);
    }
    g.lineJoin = 'round';
    return g;
  }

  end() {
    this.tex.needsUpdate = true;
  }
}

function text(g, s, x, y, { size = 20, color = G, align = 'left', weight = 'normal' } = {}) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 2;
  g.fillText(s, x, y);
  g.shadowBlur = 0;
}

function frame(g, title, right) {
  g.strokeStyle = GD;
  g.lineWidth = 2;
  g.strokeRect(10, 10, 492, 364);
  g.beginPath();
  g.moveTo(10, 44);
  g.lineTo(502, 44);
  g.stroke();
  text(g, title, 20, 28, { size: 21, weight: 'bold', color: W });
  if (right) text(g, right, 492, 28, { size: 19, align: 'right' });
}

const bar = (g, x, y, w, h, v, color = G) => {
  g.strokeStyle = GD;
  g.lineWidth = 2;
  g.strokeRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x + 3, y + 3, (w - 6) * Math.max(0, Math.min(1, v)), h - 6);
};

const BOOT = [
  'BB-07 MECH OS  v4.2.11',
  'ROM CHECKSUM ......... OK',
  'REACTOR LINK ......... OK',
  'HYDRAULICS  3000 PSI . OK',
  'GYRO STAB ............ OK',
  'OPTICS / IR .......... OK',
  'DATALINK ...... DEGRADED',
  'ALL SYSTEMS NOMINAL',
];

export function drawBoot(mfd, t) {
  const g = mfd.begin();
  const n = Math.floor(t * 9);
  BOOT.slice(0, n).forEach((l, i) =>
    text(g, l, 26, 40 + i * 34, { size: 19, color: l.includes('DEGRADED') ? AMBER : G }),
  );
  if (Math.floor(t * 4) % 2 === 0) text(g, '_', 26, 40 + Math.min(n, BOOT.length) * 34, { size: 19 });
  mfd.end();
}

/* -------------------------------------------------------------- status */

export function drawStatus(mfd, s) {
  const g = mfd.begin();
  frame(g, 'MECH STATUS', s.time);
  const col = (v) => (v > 0.7 ? G : v > 0.4 ? AMBER : RED);
  // structure per part: name, bar, percent
  const parts = [
    ['KOPF', 'head'],
    ['TORSO', 'torso'],
    ['L.ARM', 'larm'],
    ['R.ARM', 'rarm'],
    ['L.BEIN', 'lleg'],
    ['R.BEIN', 'rleg'],
  ];
  parts.forEach(([n, k], i) => {
    const v = s.parts[k];
    const y = 62 + i * 25;
    text(g, n, 18, y, { size: 18, weight: 'bold' });
    bar(g, 96, y - 8, 86, 16, v, col(v));
    text(g, String(Math.round(v * 100)).padStart(3) + '%', 246, y, { size: 18, color: col(v), align: 'right', weight: 'bold' });
  });
  // wireframe mech silhouette (smaller, right)
  const cx = 384;
  const cy = 118;
  const k = 0.62;
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
  g.lineWidth = 4;
  const part = (v, fn) => {
    g.strokeStyle = col(v);
    g.fillStyle = v <= 0 ? 'rgba(255,74,58,0.35)' : 'rgba(0,0,0,0)';
    g.beginPath();
    fn();
    g.fill();
    g.stroke();
  };
  part(s.parts.head, () => g.rect(-18, -92, 36, 26));
  part(s.parts.torso, () => {
    g.moveTo(-48, -62);
    g.lineTo(48, -62);
    g.lineTo(36, 10);
    g.lineTo(-36, 10);
    g.closePath();
  });
  part(s.parts.larm, () => g.rect(-84, -60, 28, 100));
  part(s.parts.rarm, () => g.rect(56, -60, 28, 100));
  part(s.parts.lleg, () => g.rect(-38, 16, 26, 108));
  part(s.parts.rleg, () => g.rect(12, 16, 26, 108));
  g.restore();
  text(g, 'FRONT ×0.8  HECK ×1.35', 384, 216, { size: 13, align: 'center', color: GD });

  g.strokeStyle = GD;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(10, 228);
  g.lineTo(502, 228);
  g.stroke();
  // power and fluids: label, bar, value
  const heatC = Math.round(80 + s.heat * 520);
  const rows = [
    ['REAKT', s.reactor, `${Math.round(s.reactor * 100)}%`, s.reactor > 0.9 ? AMBER : G],
    ['HITZE', s.heat, `${heatC}°C`, s.heat > 0.75 ? RED : s.heat > 0.55 ? AMBER : G],
    ['KÜHL', s.failed?.includes('KÜHLUNG') ? 0.2 : s.coolantFlow ? s.coolant : 0, s.failed?.includes('KÜHLUNG') ? 'LECK' : s.coolantFlow ? `${Math.round(s.coolant * 140)} l/m` : 'AUS', s.failed?.includes('KÜHLUNG') ? RED : G],
    ['HYDR', s.hyd, `${Math.round(s.hyd * 3500)} psi`, s.hyd < 0.4 ? RED : G],
    ['GYRO', s.failed?.includes('GYRO') ? 0 : s.gyro, s.failed?.includes('GYRO') ? 'DEFEKT' : `${Math.round(s.gyro * 100)}%`, s.failed?.includes('GYRO') ? RED : G],
    ['BATT', s.battBus ? 1 : 0, s.battBus ? (s.mainBus ? '28.1 V' : '24.3 V') : 'AUS', s.battBus ? G : GD],
  ];
  rows.forEach(([n, v, val, c], i) => {
    const x = i % 2 ? 268 : 16;
    const y = 246 + Math.floor(i / 2) * 25;
    text(g, n, x, y, { size: 16, weight: 'bold' });
    bar(g, x + 58, y - 8, 70, 16, v, c);
    text(g, val, x + 226, y, { size: 16, color: c, align: 'right', weight: 'bold' });
  });
  g.strokeStyle = GD;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(256, 236);
  g.lineTo(256, 308);
  g.stroke();
  // systems matrix
  const sys = [
    ['OPT', 'OPTIK'],
    ['SEN', 'SENSOREN'],
    ['GYR', 'GYRO'],
    ['KÜH', 'KÜHLUNG'],
    ['RAK', 'RAKETENWERFER'],
    ['HYD', 'HYDRAULIK'],
  ];
  sys.forEach(([n, k], i) => {
    const bad = s.failed?.includes(k);
    const x = 16 + i * 81;
    g.strokeStyle = bad ? RED : GD;
    g.fillStyle = bad ? 'rgba(255,74,58,0.35)' : 'rgba(0,0,0,0)';
    g.fillRect(x, 318, 74, 22);
    g.strokeRect(x, 318, 74, 22);
    text(g, `${n} ${bad ? '✕' : 'OK'}`, x + 37, 329, { size: 14, align: 'center', color: bad ? RED : G, weight: 'bold' });
  });
  text(g, s.message, 18, 358, { size: 17, color: s.messageColor || W, weight: 'bold' });
  text(g, `LÖSCH ${s.bottles ?? 3}`, 494, 358, { size: 15, align: 'right', color: (s.bottles ?? 3) ? G : RED });
  mfd.end();
}

/* -------------------------------------------------------------- camera */

export function drawCamera(mfd, s) {
  const g = mfd.begin(0);
  if (s.failed) {
    // a dead camera: snow and a fault message
    g.fillStyle = '#0a0503';
    g.fillRect(0, 0, 512, 384);
    for (let i = 0; i < 900; i++) {
      const v = Math.random();
      g.fillStyle = `rgba(255,${150 + v * 90},${80 + v * 60},${0.15 + v * 0.35})`;
      g.fillRect(Math.random() * 512, Math.random() * 384, 2 + Math.random() * 6, 2);
    }
    g.fillStyle = 'rgba(10,5,3,0.8)';
    g.fillRect(96, 160, 320, 64);
    text(g, 'OPTIK AUSGEFALLEN', 256, 182, { size: 22, align: 'center', color: RED, weight: 'bold' });
    text(g, 'KEIN BILD · ZOOM GESPERRT', 256, 208, { size: 15, align: 'center', color: AMBER });
    mfd.end();
    return;
  }
  // heading tape
  g.strokeStyle = G;
  g.lineWidth = 2;
  const deg = ((-s.heading * 180) / Math.PI + 3600) % 360;
  for (let d = -40; d <= 40; d += 5) {
    const a = Math.round(deg / 5) * 5 + d;
    const x = 256 + (a - deg) * 6;
    if (x < 70 || x > 442) continue;
    const major = ((a % 30) + 30) % 30 === 0;
    g.beginPath();
    g.moveTo(x, 18);
    g.lineTo(x, major ? 34 : 26);
    g.stroke();
    if (major) {
      const n = ((a % 360) + 360) % 360;
      const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n] ?? String(n / 10).padStart(2, '0');
      text(g, lbl, x, 46, { size: 16, align: 'center' });
    }
  }
  g.beginPath();
  g.moveTo(256, 10);
  g.lineTo(250, 2);
  g.lineTo(262, 2);
  g.closePath();
  g.fillStyle = G;
  g.fill();
  // reticle
  g.lineWidth = 2;
  g.strokeStyle = G;
  g.beginPath();
  g.moveTo(216, 192);
  g.lineTo(246, 192);
  g.moveTo(266, 192);
  g.lineTo(296, 192);
  g.moveTo(256, 152);
  g.lineTo(256, 182);
  g.moveTo(256, 202);
  g.lineTo(256, 232);
  g.stroke();
  g.strokeRect(226, 162, 60, 60);
  // corners
  const k = 24;
  g.beginPath();
  for (const [x, y, sx, sy] of [
    [24, 70, 1, 1],
    [488, 70, -1, 1],
    [24, 330, 1, -1],
    [488, 330, -1, -1],
  ]) {
    g.moveTo(x, y + sy * k);
    g.lineTo(x, y);
    g.lineTo(x + sx * k, y);
  }
  g.stroke();
  // target boxes on the picture: tracked vehicles
  for (const b of s.boxes || []) {
    const r = Math.max(9, Math.min(60, b.r));
    g.strokeStyle = b.aiming ? RED : b.primary ? AMBER : G;
    g.lineWidth = b.primary ? 3 : 2;
    const q = r * 0.4;
    g.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      g.moveTo(b.x + sx * r, b.y + sy * (r - q));
      g.lineTo(b.x + sx * r, b.y + sy * r);
      g.lineTo(b.x + sx * (r - q), b.y + sy * r);
    }
    g.stroke();
    text(g, `${b.label} ${Math.round(b.dist)}`, b.x, b.y - r - 10, { size: 14, align: 'center', color: g.strokeStyle, weight: 'bold' });
  }
  // camera attitude (upper left) and contact count (upper right)
  text(g, `AZ ${String(Math.round(((-s.heading * 180) / Math.PI + 3600) % 360)).padStart(3, '0')}  EL ${(s.el ?? -1.5).toFixed(1)}`, 34, 308, { size: 15, color: G });
  text(g, 'FOV 13°  STAB', 34, 326, { size: 15, color: G });
  if (s.count != null) {
    text(g, `ZIELE ${s.count}`, 476, 84, { size: 15, align: 'right', color: s.count ? AMBER : G });
    if (s.threats) text(g, `BEDROHT ${s.threats}`, 476, 102, { size: 15, align: 'right', color: RED, weight: 'bold' });
  }
  // target data (lower right)
  const t = s.target;
  if (t) {
    g.fillStyle = 'rgba(10,5,3,0.55)';
    g.fillRect(300, 246, 196, 86);
    text(g, `${t.label} · ${t.name}`, 488, 260, { size: 14, align: 'right', color: t.aiming ? RED : AMBER, weight: 'bold' });
    text(g, `${String(Math.round(t.dist)).padStart(4, '0')} m  ${t.clock} UHR`, 488, 279, { size: 15, align: 'right', color: W });
    text(g, `${t.face ? t.face + ' · ' : ''}${t.state}`, 488, 298, { size: 14, align: 'right', color: G });
    const n = Math.round(t.hp * 8);
    text(g, `${'▰'.repeat(n)}${'▱'.repeat(8 - n)} ${Math.round(t.hp * 100)}%`, 488, 317, { size: 14, align: 'right', color: G });
  }
  text(g, `RNG ${s.range ? String(Math.round(s.range)).padStart(4, '0') + ' m' : '----'}`, 26, 356, { size: 22, weight: 'bold', color: W });
  text(g, s.nv ? 'NV' : 'OPT', 256, 356, { size: 22, align: 'center', color: s.nv ? AMBER : G, weight: 'bold' });
  text(g, `x${s.zoom}`, 486, 356, { size: 22, align: 'right', weight: 'bold' });
  if (s.contact) text(g, s.contact, 256, 78, { size: 20, align: 'center', color: s.contactColor || AMBER, weight: 'bold' });
  mfd.end();
}

/* ------------------------------------------------------------- tactical */

export function drawTactical(mfd, s) {
  const g = mfd.begin();
  frame(g, 'TACTICAL', `${s.range} m`);
  const cx = 186;
  const cy = 214;
  const R = 150;
  g.strokeStyle = GD;
  g.lineWidth = 1.5;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2);
    g.stroke();
    if (i < 3) text(g, String(Math.round((s.range * i) / 3)), cx + ((R * i) / 3) * 0.72 + 3, cy - ((R * i) / 3) * 0.72 - 6, { size: 11, color: GD });
  }
  g.beginPath();
  g.moveTo(cx - R, cy);
  g.lineTo(cx + R, cy);
  g.moveTo(cx, cy - R);
  g.lineTo(cx, cy + R);
  g.stroke();
  // field of view wedge of the pilot's head
  g.fillStyle = 'rgba(255,160,64,0.08)';
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, R, -Math.PI / 2 - s.look - 0.6, -Math.PI / 2 - s.look + 0.6);
  g.closePath();
  g.fill();
  // sweep
  const sw = (s.time * 1.6) % (Math.PI * 2);
  const grd = g.createConicGradient ? g.createConicGradient(sw - Math.PI / 2 - 0.9, cx, cy) : null;
  if (grd) {
    grd.addColorStop(0, 'rgba(255,160,64,0)');
    grd.addColorStop(0.14, 'rgba(255,160,64,0.28)');
    grd.addColorStop(0.141, 'rgba(255,160,64,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
  }
  // heading-up: rotate world offsets into the mech frame (forward -Z is up)
  const cos = Math.cos(s.heading);
  const sin = Math.sin(s.heading);
  const toScope = (x, z) => {
    const dx = x - s.x;
    const dz = z - s.z;
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    return { px: cx + (rx / s.range) * R, py: cy + (rz / s.range) * R, d: Math.hypot(rx, rz), rx, rz };
  };
  const dirOf = (a) => {
    const wx = -Math.sin(a);
    const wz = -Math.cos(a);
    return [wx * cos - wz * sin, wx * sin + wz * cos];
  };
  // north on the outer ring
  text(g, 'N', cx + Math.sin(s.heading) * (R - 12), cy - Math.cos(s.heading) * (R - 12), { size: 15, align: 'center', color: W, weight: 'bold' });
  // smoke screens
  for (const sm of s.smoke || []) {
    const p = toScope(sm.x, sm.z);
    if (p.d > s.range) continue;
    g.fillStyle = 'rgba(255,230,200,0.22)';
    g.beginPath();
    g.arc(p.px, p.py, Math.max(4, (sm.r / s.range) * R), 0, Math.PI * 2);
    g.fill();
  }
  // route to the active waypoint
  if (s.wp) {
    const p = toScope(s.wp.x, s.wp.z);
    const k = p.d > s.range ? s.range / p.d : 1;
    const ex = cx + (p.px - cx) * k;
    const ey = cy + (p.py - cy) * k;
    g.strokeStyle = W;
    g.setLineDash([5, 5]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(ex, ey);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ex, ey - 8);
    g.lineTo(ex + 8, ey);
    g.lineTo(ex, ey + 8);
    g.lineTo(ex - 8, ey);
    g.closePath();
    g.stroke();
    text(g, s.wp.label, ex + 10, ey - 10, { size: 12, color: W });
  }
  for (const c of s.contacts) {
    if (c.hidden || c.type === 'wp') continue;
    if (s.enemies && c.enemy) continue; // drawn with their data below
    if (s.allies && c.lance) continue;
    const p = toScope(c.x, c.z);
    if (p.d > s.range) continue;
    // fade with time since sweep passed
    const ang = (Math.atan2(p.rx, -p.rz) + Math.PI * 2) % (Math.PI * 2);
    const since = (sw - ang + Math.PI * 4) % (Math.PI * 2);
    const a = Math.max(0.25, 1 - since / 5);
    if (c.type === 'hostile') {
      g.fillStyle = `rgba(255,74,58,${a})`;
      g.beginPath();
      g.moveTo(p.px, p.py - 7);
      g.lineTo(p.px + 6, p.py + 5);
      g.lineTo(p.px - 6, p.py + 5);
      g.closePath();
      g.fill();
    } else if (c.type === 'ally') {
      g.fillStyle = '#9fe8ff';
      g.beginPath();
      g.arc(p.px, p.py, 5, 0, Math.PI * 2);
      g.fill();
    } else if (c.type === 'fire') {
      g.fillStyle = `rgba(255,179,71,${a})`;
      g.fillRect(p.px - 3, p.py - 3, 6, 6);
    } else {
      g.fillStyle = `rgba(255,160,64,${a * 0.6})`;
      g.fillRect(p.px - 2.5, p.py - 2.5, 5, 5);
    }
  }
  // the lance: chevrons with call signs
  for (const w of s.allies || []) {
    const p = toScope(w.x, w.z);
    if (p.d > s.range) continue;
    const [fx, fy] = dirOf(w.heading);
    g.fillStyle = w.dead ? GD : '#9fe8ff';
    g.beginPath();
    g.moveTo(p.px + fx * 9, p.py + fy * 9);
    g.lineTo(p.px - fy * 6 - fx * 5, p.py + fx * 6 - fy * 5);
    g.lineTo(p.px + fy * 6 - fx * 5, p.py - fx * 6 - fy * 5);
    g.closePath();
    g.fill();
    text(g, w.call, p.px + 9, p.py + 10, { size: 12, color: '#9fe8ff' });
  }
  // known vehicles: diamond, gun line, label
  (s.enemies || []).forEach((t, i) => {
    const p = toScope(t.x, t.z);
    if (p.d > s.range) return;
    const col = t.aiming ? RED : t.primary ? AMBER : 'rgba(255,74,58,0.85)';
    g.fillStyle = col;
    g.strokeStyle = col;
    g.beginPath();
    g.moveTo(p.px, p.py - 7);
    g.lineTo(p.px + 7, p.py);
    g.lineTo(p.px, p.py + 7);
    g.lineTo(p.px - 7, p.py);
    g.closePath();
    if (t.type === 'depot') g.stroke();
    else g.fill();
    if (t.type !== 'depot') {
      const [gx, gy] = dirOf(t.gun);
      g.lineWidth = t.aiming ? 3 : 1.5;
      g.beginPath();
      g.moveTo(p.px, p.py);
      g.lineTo(p.px + gx * (t.aiming ? 22 : 14), p.py + gy * (t.aiming ? 22 : 14));
      g.stroke();
    }
    // only the primary and the closest get a label: a cluster would be unreadable
    if (i === 0 || t.primary) text(g, `${t.label} ${Math.round(t.dist)}`, p.px + 9, p.py - 9, { size: 12, color: col });
  });
  // own mech
  g.fillStyle = G;
  g.beginPath();
  g.moveTo(cx, cy - 9);
  g.lineTo(cx + 7, cy + 7);
  g.lineTo(cx, cy + 3);
  g.lineTo(cx - 7, cy + 7);
  g.closePath();
  g.fill();
  // data column
  const lx = 348;
  const rows = [
    [`HDG ${String(Math.round(((-s.heading * 180) / Math.PI + 3600) % 360)).padStart(3, '0')}`, W, 16, 'bold'],
    [`SPD ${String(Math.round(Math.abs(s.speed) * 3.6)).padStart(3)} km/h`, W, 15, 'bold'],
    [`THR ${String(Math.round(s.throttle * 100)).padStart(4)}%`, W, 15, 'bold'],
    [s.grid, G, 14],
    null,
    s.wp ? [`${s.wp.label} ${Math.round(s.wp.dist)} m`, W, 16, 'bold'] : ['KEINE WEGMARKE', GD, 15],
    s.wp ? [`ETA ${s.wp.eta != null ? `${Math.floor(s.wp.eta / 60)}:${String(Math.floor(s.wp.eta % 60)).padStart(2, '0')}` : '--:--'}`, G, 15] : null,
    null,
    [`FEIND ${s.hostiles}`, s.hostiles ? RED : G, 16, 'bold'],
    s.nearest ? [`${s.nearest.label} ${Math.round(s.nearest.dist)} m ${s.nearest.clock}h`, RED, 15] : null,
    s.threats ? [`BEDROHT ${s.threats}`, RED, 16, 'bold'] : null,
    s.allies?.length ? [`${s.allies.map((w) => `${w.call} ${w.dead ? '✕' : Math.round(w.hp * 100) + '%'}`).join(' ')}`, '#9fe8ff', 14] : null,
    s.kills != null ? [`ABSCH ${s.kills}/${s.total}`, G, 15] : null,
    s.sensorsDown ? ['SENSOR DEFEKT', RED, 15, 'bold'] : null,
  ];
  let y = 66;
  for (const r of rows) {
    if (!r) {
      y += 8;
      continue;
    }
    text(g, r[0], lx, y, { size: r[2], color: r[1], weight: r[3] || 'normal' });
    y += r[2] + 5;
  }
  mfd.end();
}

/* ---------------------------------------------------------------- comms */

/** video link: the speaker's face, channel, live mark, level meter, a little static */
export function drawComms(mfd, c, time) {
  const g = mfd.begin();
  const src = c.video || (c.still?.complete && c.still.naturalWidth ? c.still : null);
  // the link builds up: a short burst of static, then the picture
  const tune = Math.min(1, c.age / 0.35);
  if (src) {
    g.save();
    g.globalAlpha = tune;
    if (!c.video) {
      // still image while the clip loads: breathe a little
      const k = 1.02 + Math.sin(time * 1.3) * 0.01;
      g.translate(256, 192);
      g.scale(k, k);
      g.translate(-256, -192);
    }
    g.drawImage(src, 0, 0, 512, 384);
    g.restore();
  }
  // static lines and grain
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) g.fillRect(0, Math.random() * 384, 512, 1 + Math.random() * 2);
  if (tune < 1) {
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,${160 + Math.random() * 90},${80 + Math.random() * 80},${(1 - tune) * 0.6})`;
      g.fillRect(Math.random() * 512, Math.random() * 384, 4 + Math.random() * 30, 2);
    }
  }
  // edges darker, like a cheap camera
  const vg = g.createRadialGradient(256, 192, 140, 256, 192, 330);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, 512, 384);
  // header and footer bars
  g.fillStyle = 'rgba(10,5,2,0.7)';
  g.fillRect(0, 0, 512, 40);
  g.fillRect(0, 344, 512, 40);
  text(g, c.channel, 14, 20, { size: 17, color: G });
  if (Math.floor(time * 2) % 2 === 0) {
    g.fillStyle = RED;
    g.beginPath();
    g.arc(436, 20, 6, 0, Math.PI * 2);
    g.fill();
  }
  text(g, 'LIVE', 498, 20, { size: 17, color: RED, align: 'right', weight: 'bold' });
  text(g, c.name, 14, 364, { size: 22, color: W, weight: 'bold' });
  // voice level meter
  for (let i = 0; i < 14; i++) {
    const h = 4 + Math.abs(Math.sin(time * 11 + i * 1.7) * Math.sin(time * 5.3 + i)) * 22;
    g.fillStyle = i > 10 ? AMBER : G;
    g.fillRect(330 + i * 12, 364 - h / 2, 8, h);
  }
  mfd.end();
}
