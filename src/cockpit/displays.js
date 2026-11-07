import * as THREE from 'three';

const FONT = "'DejaVu Sans Mono','Consolas','Courier New',monospace";
const G = '#7dff8a';
const GD = 'rgba(125,255,138,0.35)';
const AMBER = '#ffb347';
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
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5;
  vec2 uv = 0.5 + c * (1.0 + dot(c,c) * 0.12);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  vec3 col = vec3(0.004, 0.012, 0.006);
  if (useFeed > 0.5) {
    vec3 f = texture2D(feed, uv).rgb;
    float l = dot(f, vec3(0.299, 0.587, 0.114));
    l = pow(max(l * 1.4, 0.0), mix(0.8, 0.55, nv)) * mix(0.95, 1.7, nv);
    l += (hash(uv * 400.0 + time) - 0.5) * mix(0.03, 0.12, nv);
    col += mix(vec3(0.32, 0.9, 0.42), vec3(0.25, 1.0, 0.3), nv) * l * 0.9;
  }
  vec4 o = texture2D(map, uv);
  col = mix(col, o.rgb * 1.6, o.a);
  // phosphor scan lines, shadow mask, flicker, roll bar
  col *= 0.9 + 0.1 * sin(uv.y * 384.0 * 3.14159);
  col *= 0.96 + 0.04 * sin(time * 50.0);
  col *= 0.92 + 0.08 * smoothstep(0.0, 0.08, abs(fract(uv.y * 0.6 - time * 0.11) - 0.5));
  col *= smoothstep(0.78, 0.38, length(c * vec2(1.0, 1.2)));
  // boot: line expands vertically
  float b = clamp(boot, 0.0, 1.0);
  float open = smoothstep(0.0, 0.5, b);
  col *= step(abs(c.y), 0.5 * open + 0.004) * (1.0 + (1.0 - smoothstep(0.4, 1.0, b)) * 3.0);
  gl_FragColor = vec4(col * power * 1.35, 1.0);
}`;

/** One CRT multifunction display: canvas overlay + optional live camera feed. */
export class MFD {
  constructor(width, height, { feed = null } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.uniforms = {
      map: { value: this.tex },
      feed: { value: feed ? feed.texture : null },
      useFeed: { value: feed ? 1 : 0 },
      nv: { value: 0 },
      time: { value: 0 },
      power: { value: 0 },
      boot: { value: 0 },
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
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (clearAlpha < 1) g.clearRect(0, 0, 512, 384);
    else {
      g.fillStyle = '#010401';
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
  g.shadowBlur = 6;
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
  text(g, title, 20, 28, { size: 20, weight: 'bold' });
  if (right) text(g, right, 492, 28, { size: 16, align: 'right' });
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
  const parts = [
    ['HEAD', s.parts.head],
    ['TORSO', s.parts.torso],
    ['L.ARM', s.parts.larm],
    ['R.ARM', s.parts.rarm],
    ['L.LEG', s.parts.lleg],
    ['R.LEG', s.parts.rleg],
  ];
  const col = (v) => (v > 0.7 ? G : v > 0.4 ? AMBER : RED);
  parts.forEach(([n, v], i) => {
    text(g, n.padEnd(6), 24, 70 + i * 30, { size: 19 });
    text(g, String(Math.round(v * 100)).padStart(3) + '%', 180, 70 + i * 30, { size: 19, color: col(v), align: 'right' });
  });
  // wireframe mech silhouette
  const cx = 360;
  const cy = 170;
  g.lineWidth = 3;
  const part = (v, fn) => {
    g.strokeStyle = col(v);
    g.shadowColor = col(v);
    g.shadowBlur = 8;
    g.beginPath();
    fn();
    g.stroke();
    g.shadowBlur = 0;
  };
  part(s.parts.head, () => g.rect(cx - 18, cy - 92, 36, 26));
  part(s.parts.torso, () => {
    g.moveTo(cx - 48, cy - 62);
    g.lineTo(cx + 48, cy - 62);
    g.lineTo(cx + 36, cy + 10);
    g.lineTo(cx - 36, cy + 10);
    g.closePath();
  });
  part(s.parts.larm, () => {
    g.rect(cx - 82, cy - 60, 26, 62);
    g.rect(cx - 86, cy + 6, 22, 44);
  });
  part(s.parts.rarm, () => {
    g.rect(cx + 56, cy - 60, 26, 62);
    g.moveTo(cx + 69, cy + 2);
    g.lineTo(cx + 69, cy + 66);
  });
  part(s.parts.lleg, () => {
    g.moveTo(cx - 20, cy + 10);
    g.lineTo(cx - 34, cy + 64);
    g.lineTo(cx - 24, cy + 118);
    g.moveTo(cx - 44, cy + 122);
    g.lineTo(cx - 6, cy + 122);
  });
  part(s.parts.rleg, () => {
    g.moveTo(cx + 20, cy + 10);
    g.lineTo(cx + 34, cy + 64);
    g.lineTo(cx + 24, cy + 118);
    g.moveTo(cx + 6, cy + 122);
    g.lineTo(cx + 44, cy + 122);
  });
  // systems
  g.strokeStyle = GD;
  g.beginPath();
  g.moveTo(10, 252);
  g.lineTo(502, 252);
  g.stroke();
  text(g, 'REACTOR', 24, 272, { size: 17 });
  bar(g, 120, 262, 150, 20, s.reactor, s.reactor > 0.9 ? AMBER : G);
  text(g, 'HEAT', 290, 272, { size: 17 });
  bar(g, 346, 262, 146, 20, s.heat, s.heat > 0.75 ? RED : s.heat > 0.55 ? AMBER : G);
  text(g, 'COOLANT', 24, 304, { size: 17 });
  bar(g, 120, 294, 150, 20, s.coolant);
  text(g, 'HYD', 290, 304, { size: 17 });
  bar(g, 346, 294, 146, 20, s.hyd);
  text(g, s.message, 24, 345, { size: 17, color: s.messageColor || G });
  mfd.end();
}

/* -------------------------------------------------------------- camera */

export function drawCamera(mfd, s) {
  const g = mfd.begin(0);
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
  text(g, `RNG ${s.range ? String(Math.round(s.range)).padStart(4, '0') + ' m' : '----'}`, 30, 358, { size: 19 });
  text(g, s.nv ? 'NV' : 'OPT', 256, 358, { size: 19, align: 'center', color: s.nv ? AMBER : G });
  text(g, `ZOOM x${s.zoom}`, 482, 358, { size: 19, align: 'right' });
  if (s.contact) text(g, s.contact, 256, 78, { size: 17, align: 'center', color: AMBER });
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
  }
  g.beginPath();
  g.moveTo(cx - R, cy);
  g.lineTo(cx + R, cy);
  g.moveTo(cx, cy - R);
  g.lineTo(cx, cy + R);
  g.stroke();
  // field of view wedge of the pilot's head
  g.fillStyle = 'rgba(125,255,138,0.08)';
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, R, -Math.PI / 2 - s.look - 0.6, -Math.PI / 2 - s.look + 0.6);
  g.closePath();
  g.fill();
  // sweep
  const sw = (s.time * 1.6) % (Math.PI * 2);
  const grd = g.createConicGradient ? g.createConicGradient(sw - Math.PI / 2 - 0.9, cx, cy) : null;
  if (grd) {
    grd.addColorStop(0, 'rgba(125,255,138,0)');
    grd.addColorStop(0.14, 'rgba(125,255,138,0.28)');
    grd.addColorStop(0.141, 'rgba(125,255,138,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
  }
  // contacts (heading-up)
  const cos = Math.cos(s.heading);
  const sin = Math.sin(s.heading);
  for (const c of s.contacts) {
    const dx = c.x - s.x;
    const dz = c.z - s.z;
    // rotate into mech frame: forward (-Z) is up on the scope
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    const d = Math.hypot(rx, rz);
    if (d > s.range) continue;
    const px = cx + (rx / s.range) * R;
    const py = cy + (rz / s.range) * R;
    // fade with time since sweep passed
    const ang = (Math.atan2(rx, -rz) + Math.PI * 2) % (Math.PI * 2);
    const since = (sw - ang + Math.PI * 4) % (Math.PI * 2);
    const a = Math.max(0.25, 1 - since / 5);
    if (c.type === 'hostile') {
      g.fillStyle = `rgba(255,74,58,${a})`;
      g.beginPath();
      g.moveTo(px, py - 7);
      g.lineTo(px + 6, py + 5);
      g.lineTo(px - 6, py + 5);
      g.closePath();
      g.fill();
    } else if (c.type === 'fire') {
      g.fillStyle = `rgba(255,179,71,${a})`;
      g.fillRect(px - 3, py - 3, 6, 6);
    } else {
      g.fillStyle = `rgba(125,255,138,${a * 0.7})`;
      g.fillRect(px - 2.5, py - 2.5, 5, 5);
    }
  }
  // own mech
  g.fillStyle = G;
  g.beginPath();
  g.moveTo(cx, cy - 9);
  g.lineTo(cx + 7, cy + 7);
  g.lineTo(cx, cy + 3);
  g.lineTo(cx - 7, cy + 7);
  g.closePath();
  g.fill();
  // legend
  const lx = 360;
  text(g, '■ STRUCT', lx, 80, { size: 16 });
  text(g, '■ FIRE', lx, 106, { size: 16, color: AMBER });
  text(g, '▲ HOSTILE', lx, 132, { size: 16, color: RED });
  text(g, `HDG ${String(Math.round(((-s.heading * 180) / Math.PI + 3600) % 360)).padStart(3, '0')}`, lx, 190, { size: 18 });
  text(g, `SPD ${String(Math.round(Math.abs(s.speed) * 3.6)).padStart(3)} km/h`, lx, 218, { size: 18 });
  text(g, `THR ${String(Math.round(s.throttle * 100)).padStart(4)} %`, lx, 246, { size: 18 });
  text(g, `GRID ${s.grid}`, lx, 274, { size: 18 });
  text(g, `HOSTILES ${s.hostiles}`, lx, 330, { size: 18, color: s.hostiles ? RED : G });
  mfd.end();
}
