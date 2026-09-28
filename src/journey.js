import * as THREE from 'three';
import { tex } from './world.js';
import { t } from './i18n.js';

// Animated transit from the injection site to the mission site, through the
// real circulation: arm vein → vena cava → right heart → lungs → left heart →
// aorta → target. Shown as a compressed-scale "overview ride" (time-lapse);
// the HUD names each station with its real diameter and flow speed.

// kind: vein | artery | heart | lung | cap ; r = visual radius ; len = path length
// d = real diameter, v = typical real flow speed (m/s) ; map = landmark on the body map
const S = {
  arm: { kind: 'vein', r: 7, len: 80, d: '5 mm', v: 0.1, map: 'arm' },
  svc: { kind: 'vein', r: 13, len: 100, d: '2 cm', v: 0.15, map: 'svc' },
  ra: { kind: 'heart', r: 34, len: 64, d: '4 cm', v: 0.3, map: 'heart', valve: { at: 'end', cusps: 3, key: 'tricuspid' } },
  rv: { kind: 'heart', r: 38, len: 64, d: '5 cm', v: 0.6, map: 'heart', valve: { at: 'end', cusps: 3, key: 'pulmvalve' } },
  pa: { kind: 'artery', r: 13, len: 80, d: '2,5 cm', v: 0.7, venousBlood: true, map: 'lung' },
  lungcap: { kind: 'lung', r: 4.5, len: 110, d: '8 µm', v: 0.001, map: 'lung', oxygenate: true },
  pvenule: { kind: 'vein', r: 6, len: 50, d: '40 µm', v: 0.002, arterialBlood: true, map: 'lung' },
  pv: { kind: 'vein', r: 10, len: 70, d: '1,5 cm', v: 0.3, arterialBlood: true, map: 'heart' },
  la: { kind: 'heart', r: 30, len: 56, d: '4 cm', v: 0.3, map: 'heart', arterialBlood: true, valve: { at: 'end', cusps: 2, key: 'mitral' } },
  lv: { kind: 'heart', r: 36, len: 64, d: '5 cm', v: 1.0, map: 'heart', arterialBlood: true, valve: { at: 'end', cusps: 3, key: 'aorticvalve' } },
  aorta: { kind: 'artery', r: 16, len: 60, d: '3 cm', v: 1.0, map: 'aorta' },
  lca: { kind: 'artery', r: 6, len: 90, d: '4 mm', v: 0.3, map: 'coronary' },
  aortadesc: { kind: 'artery', r: 14, len: 100, d: '2,5 cm', v: 0.8, map: 'aortadesc' },
  celiac: { kind: 'artery', r: 7, len: 60, d: '7 mm', v: 0.6, map: 'celiac' },
  gastric: { kind: 'artery', r: 4, len: 70, d: '3 mm', v: 0.3, map: 'stomach' },
  iliac: { kind: 'artery', r: 9, len: 70, d: '1 cm', v: 0.6, map: 'iliac' },
  femoral: { kind: 'artery', r: 7, len: 90, d: '8 mm', v: 0.5, map: 'femoral' },
  capleg: { kind: 'cap', r: 3, len: 60, d: '8 µm', v: 0.001, map: 'calf' },
  popvein: { kind: 'vein', r: 9, len: 60, d: '6 mm', v: 0.1, map: 'popliteal', venousAfter: true },
};

const ROUTES = {
  virus: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pvenule'],
  stent: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'lca'],
  diag: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'aortadesc', 'celiac', 'gastric'],
  clot: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'aortadesc', 'iliac', 'femoral', 'capleg', 'popvein'],
};

// landmarks on the body map image (normalised 0..1), see public/assets/bodymap.webp
export const MAP_POINTS = {
  arm: [0.28, 0.4],
  svc: [0.485, 0.245],
  heart: [0.5, 0.285],
  lung: [0.4, 0.28],
  aorta: [0.51, 0.25],
  coronary: [0.535, 0.295],
  aortadesc: [0.5, 0.36],
  celiac: [0.5, 0.395],
  stomach: [0.535, 0.365],
  iliac: [0.465, 0.475],
  femoral: [0.435, 0.58],
  calf: [0.42, 0.76],
  popliteal: [0.42, 0.69],
};

const VENOUS = { fog: new THREE.Color(0x3e1216), rbc: new THREE.Color(0x7a1a2a), wall: new THREE.Color(0xb88890) };
const ARTERIAL = { fog: new THREE.Color(0x7a261e), rbc: new THREE.Color(0xd8352a), wall: new THREE.Color(0xffc8c0) };
const HEART = { fog: new THREE.Color(0x5a1a1a), wall: new THREE.Color(0xc07070) };

export function routeFor(missionId) {
  return ROUTES[missionId].map((k) => ({ key: k, ...S[k] }));
}

export class Journey {
  constructor(world, missionId, opts = {}) {
    this.world = world;
    this.comfort = !!opts.comfort;
    this.stations = routeFor(missionId);
    this.group = new THREE.Group();
    this.savedLight = [world.headlight.intensity, world.fill.intensity];
    world.clearVessel();
    world.scene.add(this.group);

    // cumulative lengths
    let s = 0;
    for (const st of this.stations) {
      st.s0 = s;
      s += st.len;
      st.s1 = s;
    }
    this.total = s;

    // gently curving centre line (no sharp turns → comfortable)
    const pts = [];
    const step = 20;
    for (let d = 0; d <= this.total + step; d += step) {
      pts.push(new THREE.Vector3(Math.sin(d * 0.011) * 28 + Math.sin(d * 0.0041) * 40, Math.sin(d * 0.007 + 1) * 18, -d));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.curveLen = this.curve.getLength();

    this.buildTube();
    this.buildValves();
    this.buildAlveoli();
    this.buildCells();

    this.s = 0;
    this.speed = 22; // units/s (time-lapse)
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.stationIndex = -1;
    this.done = false;
    this.time = 0;
  }

  /** radius at arc position s, smoothly blended between stations */
  radiusAt(s) {
    const i = this.stationAt(s);
    const st = this.stations[i];
    const blend = 14;
    let r = st.r;
    const next = this.stations[i + 1];
    if (next && s > st.s1 - blend) {
      const k = (s - (st.s1 - blend)) / blend;
      const e = k * k * (3 - 2 * k);
      r = st.r + (next.r - st.r) * e;
    }
    return r;
  }
  stationAt(s) {
    for (let i = 0; i < this.stations.length; i++) if (s < this.stations[i].s1) return i;
    return this.stations.length - 1;
  }
  u(s) {
    return Math.min(1, Math.max(0, s / this.curveLen));
  }

  buildTube() {
    const rings = Math.ceil(this.total / 1.5);
    const radial = 48;
    const frames = this.curve.computeFrenetFrames(rings, false);
    // build one mesh per station so each can have its own material
    for (const st of this.stations) {
      const i0 = Math.floor((st.s0 / this.total) * rings);
      const i1 = Math.min(rings, Math.ceil((st.s1 / this.total) * rings) + 1);
      const pos = [];
      const uv = [];
      const idx = [];
      for (let i = i0; i <= i1; i++) {
        const s = (i / rings) * this.total;
        const c = this.curve.getPointAt(this.u(s));
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const r = this.radiusAt(s);
        for (let j = 0; j <= radial; j++) {
          const a = (j / radial) * Math.PI * 2;
          const wob = st.kind === 'heart' ? 1 + 0.08 * Math.sin(a * 5 + s * 0.2) : 1; // trabeculae-like bumps
          const x = c.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r * wob;
          const y = c.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r * wob;
          const z = c.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r * wob;
          pos.push(x, y, z);
          uv.push(s / 20, (j / radial) * Math.max(2, Math.round((r * 6.28) / 20)));
        }
      }
      const n = i1 - i0;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < radial; j++) {
          const a = i * (radial + 1) + j;
          const b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const venous = st.kind === 'vein' && !st.arterialBlood;
      const col = st.kind === 'heart' ? HEART.wall : venous ? VENOUS.wall : ARTERIAL.wall;
      const m = new THREE.MeshStandardMaterial({
        map: tex('tex_endothelium', 1, 1),
        color: col,
        roughness: 0.8,
        side: THREE.BackSide,
        transparent: st.kind === 'lung' || st.kind === 'cap',
        opacity: st.kind === 'lung' ? 0.45 : st.kind === 'cap' ? 0.7 : 1,
        depthWrite: !(st.kind === 'lung' || st.kind === 'cap'),
      });
      const mesh = new THREE.Mesh(g, m);
      this.group.add(mesh);
    }
  }

  frameAt(s) {
    const u = this.u(s);
    const p = this.curve.getPointAt(u);
    const tan = this.curve.getTangentAt(u);
    // stable side vectors (no roll): use world up
    const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();
    return { p, tan, side, up };
  }

  buildValves() {
    this.valves = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0xf0c8c0, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    for (const st of this.stations) {
      if (!st.valve) continue;
      const s = st.s1 - 2;
      const f = this.frameAt(s);
      const r = this.radiusAt(s) * 0.98;
      const root = new THREE.Group();
      root.position.copy(f.p);
      root.lookAt(f.p.clone().add(f.tan));
      this.group.add(root);
      const cusps = [];
      for (let k = 0; k < st.valve.cusps; k++) {
        const hinge = new THREE.Group();
        hinge.rotation.z = (k / st.valve.cusps) * Math.PI * 2;
        root.add(hinge);
        const arm = new THREE.Group();
        arm.position.y = r;
        hinge.add(arm);
        // curved leaflet from the wall towards the centre
        const w = (Math.PI * r) / st.valve.cusps;
        const shape = new THREE.Shape();
        shape.moveTo(-w, 0);
        shape.quadraticCurveTo(-w * 0.3, -r * 0.6, 0, -r);
        shape.quadraticCurveTo(w * 0.3, -r * 0.6, w, 0);
        shape.lineTo(-w, 0);
        const leaf = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), mat);
        arm.add(leaf);
        cusps.push(arm);
      }
      this.valves.push({ s, root, cusps, open: 0 });
    }
  }

  buildAlveoli() {
    const lung = this.stations.find((st) => st.kind === 'lung');
    if (!lung) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, roughness: 0.3, transparent: true, opacity: 0.35, emissive: 0x223355 });
    const geo = new THREE.SphereGeometry(1, 20, 14);
    for (let k = 0; k < 70; k++) {
      const s = lung.s0 + Math.random() * lung.len;
      const f = this.frameAt(s);
      const a = Math.random() * Math.PI * 2;
      const r = lung.r + 3 + Math.random() * 10;
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(3 + Math.random() * 5);
      m.position.copy(f.p).addScaledVector(f.side, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r);
      this.group.add(m);
    }
    // a soft cool light inside the lung section (air)
    const lf = this.frameAt(lung.s0 + lung.len / 2);
    const light = new THREE.PointLight(0xcfe4ff, 30, 120, 1.5);
    light.position.copy(lf.p);
    this.group.add(light);
  }

  buildCells() {
    const N = 260;
    const mat = new THREE.MeshStandardMaterial({ map: tex('tex_rbc'), roughness: 0.45, color: 0xffffff });
    this.cells = new THREE.InstancedMesh(this.world.rbcGeo, mat, N);
    this.cells.frustumCulled = false;
    this.cells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.group.add(this.cells);
    this.cellData = [];
    for (let k = 0; k < N; k++) this.cellData.push(this.spawnCell({}, true));
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
  }
  spawnCell(c, anywhere) {
    c.ds = anywhere ? -20 + Math.random() * 110 : 90 + Math.random() * 20; // offset ahead of camera
    c.a = Math.random() * Math.PI * 2;
    c.rf = Math.sqrt(Math.random()) * 0.85;
    c.rx = Math.random() * 3;
    c.ry = Math.random() * 3;
    c.spin = (Math.random() - 0.5) * 1.5;
    c.oxy = 0;
    return c;
  }

  update(dt, input, beat) {
    this.time += dt;
    const st = this.stations[this.stationAt(this.s)];
    // pulsatile flow: surges with each heartbeat (gentler in comfort mode)
    const pulse = st.kind === 'artery' || st.kind === 'heart' ? Math.max(0, Math.sin(beat * Math.PI * 2)) : 0;
    const boost = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') ? 3 : 1;
    const v = this.speed * (1 + (this.comfort ? 0.15 : 0.45) * pulse) * boost * (st.kind === 'lung' || st.kind === 'cap' ? 0.6 : 1);
    this.s = Math.min(this.total, this.s + v * dt);
    if (this.s >= this.total - 0.5) this.done = true;

    // camera on the centre line, looking ahead; free look with the mouse
    const f = this.frameAt(this.s);
    const ahead = this.frameAt(Math.min(this.total, this.s + 12)).p;
    const cam = this.world.camera;
    cam.position.copy(f.p);
    cam.up.set(0, 1, 0);
    cam.lookAt(ahead);
    if (input.locked) {
      this.lookYaw = Math.max(-0.7, Math.min(0.7, this.lookYaw - input.mdx * 0.002));
      this.lookPitch = Math.max(-0.5, Math.min(0.5, this.lookPitch - input.mdy * 0.002));
    } else {
      this.lookYaw *= 1 - Math.min(1, dt * 1.5);
      this.lookPitch *= 1 - Math.min(1, dt * 1.5);
    }
    cam.rotateY(this.lookYaw);
    cam.rotateX(this.lookPitch);
    cam.updateMatrixWorld();

    // fog/background follow the blood: dark venous → bright arterial after the lungs
    const lungIdx = this.stations.findIndex((x) => x.kind === 'lung');
    const i = this.stationAt(this.s);
    let oxy = lungIdx < 0 ? 0 : i > lungIdx ? 1 : i === lungIdx ? (this.s - st.s0) / st.len : 0;
    if (st.venousAfter) oxy = 0.2;
    const fogC = VENOUS.fog.clone().lerp(ARTERIAL.fog, oxy);
    if (st.kind === 'heart') fogC.lerp(HEART.fog, 0.35);
    if (st.kind === 'lung') fogC.lerp(new THREE.Color(0x6a3a44), 0.4);
    const scene = this.world.scene;
    if (!scene.fog || !scene.fog.isFog) scene.fog = new THREE.Fog(fogC, 10, 160);
    scene.fog.color.copy(fogC);
    scene.fog.near = 6;
    scene.fog.far = st.kind === 'heart' ? 110 : 150;
    scene.background = fogC;
    this.oxy = oxy;

    // valves: open as we approach, close behind us (and flutter with the beat)
    for (const vl of this.valves) {
      const d = vl.s - this.s;
      const want = d < 30 && d > -8 ? 1 : 0;
      vl.open += (want - vl.open) * Math.min(1, dt * 3);
      const flutter = this.comfort ? 0 : Math.sin(this.time * 9) * 0.03;
      for (const c of vl.cusps) c.rotation.x = -(0.15 + vl.open * 1.25) + flutter;
    }

    // blood cells travel with us (slightly faster in the centre)
    const cd = this.cellData;
    for (let k = 0; k < cd.length; k++) {
      const c = cd[k];
      c.ds += (0.25 - c.rf * c.rf * 0.5) * v * dt * 0.5 - v * dt * 0.08;
      c.rx += c.spin * dt;
      if (c.ds < -20) this.spawnCell(c, false);
      if (c.ds > 115) (c.ds = -18), (c.a = Math.random() * Math.PI * 2);
      const cs = Math.min(this.total, Math.max(0, this.s + c.ds));
      const cf = this.frameAt(cs);
      const r = this.radiusAt(cs) * c.rf;
      this.dummy.position.copy(cf.p).addScaledVector(cf.side, Math.cos(c.a) * r).addScaledVector(cf.up, Math.sin(c.a) * r);
      this.dummy.rotation.set(c.rx, c.ry, 0);
      const small = this.stations[this.stationAt(cs)];
      this.dummy.scale.setScalar(Math.min(0.4, (this.radiusAt(cs) * 0.3) / 7.8));
      this.dummy.updateMatrix();
      this.cells.setMatrixAt(k, this.dummy.matrix);
      // colour: oxygen-poor (dark) until the lung capillaries, bright after
      const li = this.stations.indexOf(small);
      let o = lungIdx < 0 ? 0 : li > lungIdx ? 1 : li === lungIdx ? (cs - small.s0) / small.len : 0;
      if (small.venousAfter) o = 0.25;
      this.col.copy(VENOUS.rbc).lerp(ARTERIAL.rbc, o);
      this.cells.setColorAt(k, this.col);
    }
    this.cells.instanceMatrix.needsUpdate = true;
    this.cells.instanceColor.needsUpdate = true;

    // the ship's headlight must not blow out narrow vessels
    const rNow = this.radiusAt(this.s);
    this.world.headlight.intensity = 3 + rNow * 0.9;
    this.world.fill.intensity = 0.15 + rNow * 0.02;

    const changed = i !== this.stationIndex;
    this.stationIndex = i;
    return { station: st, index: i, changed, progress: this.s / this.total };
  }

  dispose() {
    this.world.headlight.intensity = this.savedLight[0];
    this.world.fill.intensity = this.savedLight[1];
    this.world.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== this.world.rbcGeo) o.geometry.dispose();
    });
  }
}

export function stationName(st) {
  return t(`j_${st.key}_n`);
}
export function stationFact(st) {
  return t(`j_${st.key}_f`);
}
