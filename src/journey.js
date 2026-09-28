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
  carotid: { kind: 'artery', r: 8, len: 100, d: '5 mm', v: 0.5, map: 'carotid' },
  willis: { kind: 'artery', r: 6, len: 60, d: '4 mm', v: 0.5, map: 'brain' },
  mca: { kind: 'artery', r: 5, len: 70, d: '3 mm', v: 0.6, map: 'mca' },
};

const ROUTES = {
  virus: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pvenule'],
  stent: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'lca'],
  diag: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'aortadesc', 'celiac', 'gastric'],
  clot: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'aortadesc', 'iliac', 'femoral', 'capleg', 'popvein'],
  stroke: ['arm', 'svc', 'ra', 'rv', 'pa', 'lungcap', 'pv', 'la', 'lv', 'aorta', 'carotid', 'willis', 'mca'],
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
  carotid: [0.485, 0.17],
  brain: [0.5, 0.105],
  mca: [0.535, 0.1],
};

// where each mission takes place (for the blinking location marker)
export const MISSION_SITE = { diag: 'stomach', stent: 'coronary', virus: 'lung', clot: 'popliteal', stroke: 'mca' };

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

    this.heartMeshes = [];
    this.labels = [];
    // soft fill light so walls read clearly (the headlight alone is too narrow)
    this.group.add(new THREE.HemisphereLight(0xffe2d8, 0x5a2020, 1.5));
    this.buildTube();
    this.buildValves();
    this.buildHeartDetail();
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
          const tile = st.kind === 'heart' ? 14 : 20;
          uv.push(s / tile, (j / radial) * Math.max(2, Math.round((r * 6.28) / tile)));
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
      const heart = st.kind === 'heart';
      const wallTex = tex(heart ? 'tex_endocardium' : 'tex_endothelium', 1, 1);
      // the texture also glows faintly so the wall stays readable in the dark
      const m = new THREE.MeshStandardMaterial({
        map: wallTex,
        emissiveMap: wallTex,
        color: heart ? 0xf0d0d0 : col,
        emissive: heart ? 0xb05050 : venous ? 0x7a4450 : 0x9a4a42,
        emissiveIntensity: heart ? 1.0 : 0.8,
        roughness: 0.8,
        side: THREE.BackSide,
        transparent: st.kind === 'lung' || st.kind === 'cap',
        opacity: st.kind === 'lung' ? 0.45 : st.kind === 'cap' ? 0.7 : 1,
        depthWrite: !(st.kind === 'lung' || st.kind === 'cap'),
      });
      const mesh = new THREE.Mesh(g, m);
      this.group.add(mesh);
      if (heart) {
        // remember rest shape + ring centres so the chamber can contract
        const base = Float32Array.from(pos);
        const centers = new Float32Array(pos.length);
        for (let i = i0; i <= i1; i++) {
          const c = this.curve.getPointAt(this.u((i / rings) * this.total));
          for (let j = 0; j <= radial; j++) centers.set([c.x, c.y, c.z], ((i - i0) * (radial + 1) + j) * 3);
        }
        this.heartMeshes.push({ mesh, base, centers, st });
      }
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
      // fibrous valve ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.8, r * 0.04), 10, 64), new THREE.MeshStandardMaterial({ color: 0xf2e2d2, roughness: 0.5 }));
      root.add(ring);
      this.labels.push({ pos: f.p.clone(), key: 'v_' + st.valve.key });
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
      // tricuspid and mitral valves are held by chordae; semilunar valves are not
      const chordae = st.valve.key === 'tricuspid' || st.valve.key === 'mitral';
      this.valves.push({ s, root, cusps, open: 0, r, chordae, next: this.stations[this.stations.indexOf(st) + 1] });
    }
  }

  /** Trabeculae, papillary muscles with chordae tendineae, chamber lights, coronary ostia. */
  buildHeartDetail() {
    const muscle = new THREE.MeshStandardMaterial({ map: tex('tex_endocardium', 3, 1), color: 0xd89090, roughness: 0.6, emissive: 0x220606 });
    for (const st of this.stations) {
      if (st.kind !== 'heart') continue;
      const mid = this.frameAt(st.s0 + st.len / 2);
      const light = new THREE.PointLight(0xffd8c8, 28, 95, 1.4);
      light.position.copy(mid.p);
      this.group.add(light);
      // trabeculae carneae: muscle ridges along the wall
      for (let k = 0; k < 16; k++) {
        const a0 = Math.random() * Math.PI * 2;
        const pts = [];
        const sA = st.s0 + 4 + Math.random() * st.len * 0.3;
        const sB = Math.min(st.s1 - 6, sA + st.len * (0.35 + Math.random() * 0.4));
        for (let i = 0; i <= 4; i++) {
          const ss = sA + ((sB - sA) * i) / 4;
          const f = this.frameAt(ss);
          const a = a0 + Math.sin(i * 1.3 + k) * 0.25;
          const rr = this.radiusAt(ss) * (0.86 + Math.sin(i * 2.1 + k) * 0.03);
          pts.push(f.p.clone().addScaledVector(f.side, Math.cos(a) * rr).addScaledVector(f.up, Math.sin(a) * rr));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.8 + Math.random() * 1.1, 6), muscle);
        this.group.add(tube);
        if (k === 0) this.labels.push({ pos: pts[2], key: 's_trab' });
      }
      // papillary muscles in the ventricles (anchor the chordae)
      if (st.key === 'rv' || st.key === 'lv') {
        st.papTips = [];
        const n = st.key === 'rv' ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.6;
          const fb = this.frameAt(st.s0 + st.len * 0.62);
          const ft = this.frameAt(st.s0 + st.len * 0.38);
          const rb = this.radiusAt(st.s0 + st.len * 0.62) * 0.9;
          const rt = this.radiusAt(st.s0 + st.len * 0.38) * 0.55;
          const base = fb.p.clone().addScaledVector(fb.side, Math.cos(a) * rb).addScaledVector(fb.up, Math.sin(a) * rb);
          const tip = ft.p.clone().addScaledVector(ft.side, Math.cos(a) * rt).addScaledVector(ft.up, Math.sin(a) * rt);
          const len = base.distanceTo(tip);
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 4.5, len, 14), muscle);
          cone.position.copy(base).lerp(tip, 0.5);
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize());
          this.group.add(cone);
          st.papTips.push(tip);
          if (k === 0) this.labels.push({ pos: tip.clone(), key: 's_papillary' });
        }
      }
    }
    // chordae tendineae: thin strings from the valve leaflets to the papillary muscles
    const cm = new THREE.LineBasicMaterial({ color: 0xfff2e8, transparent: true, opacity: 0.85 });
    for (const vl of this.valves) {
      if (!vl.chordae || !vl.next?.papTips) continue;
      const n = vl.cusps.length * 3;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      vl.lines = new THREE.LineSegments(g, cm);
      vl.lines.frustumCulled = false;
      this.group.add(vl.lines);
      this.labels.push({ pos: vl.root.position.clone().lerp(vl.next.papTips[0], 0.5), key: 's_chordae' });
    }
    // the two coronary ostia just above the aortic valve
    const ao = this.stations.find((x) => x.key === 'aorta');
    if (ao) {
      const hole = new THREE.MeshBasicMaterial({ color: 0x1a0404, side: THREE.DoubleSide });
      for (const a of [0.9, 2.6]) {
        const ss = ao.s0 + 10;
        const f = this.frameAt(ss);
        const rr = this.radiusAt(ss) * 0.97;
        const pos = f.p.clone().addScaledVector(f.side, Math.cos(a) * rr).addScaledVector(f.up, Math.sin(a) * rr);
        const m = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), hole);
        m.position.copy(pos);
        m.lookAt(f.p);
        this.group.add(m);
        if (a < 1) this.labels.push({ pos, key: 's_coronary_ostium' });
      }
    }
  }

  updateChordae() {
    const tmp = new THREE.Vector3();
    for (const vl of this.valves) {
      if (!vl.lines) continue;
      vl.root.updateMatrixWorld(true);
      const arr = vl.lines.geometry.attributes.position.array;
      let i = 0;
      vl.cusps.forEach((arm, k) => {
        const w = (Math.PI * vl.r) / vl.cusps.length;
        for (const [x, y] of [[-0.45 * w, -0.72 * vl.r], [0, -vl.r], [0.45 * w, -0.72 * vl.r]]) {
          tmp.set(x, y, 0);
          arm.localToWorld(tmp);
          const tip = vl.next.papTips[k % vl.next.papTips.length];
          arr.set([tmp.x, tmp.y, tmp.z, tip.x, tip.y, tip.z], i);
          i += 6;
        }
      });
      vl.lines.geometry.attributes.position.needsUpdate = true;
    }
  }

  /** Heart chambers squeeze with the beat: atria first, then ventricles. */
  beatWalls(beat) {
    const amp = this.comfort ? 0.025 : 0.06;
    for (const h of this.heartMeshes) {
      const atrium = h.st.key === 'ra' || h.st.key === 'la';
      const c = atrium ? (beat < 0.15 ? Math.sin((beat / 0.15) * Math.PI) : 0) : beat > 0.15 && beat < 0.45 ? Math.sin(((beat - 0.15) / 0.3) * Math.PI) : 0;
      const k = 1 - amp * c;
      const p = h.mesh.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i++) p[i] = h.centers[i] + (h.base[i] - h.centers[i]) * k;
      h.mesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  /** Labelled structures near the camera (for HUD markers). */
  visibleLabels(maxDist = 70) {
    const cam = this.world.camera.position;
    return this.labels.filter((l) => {
      const d = l.pos.distanceTo(cam);
      return d > 5 && d < maxDist;
    });
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
    const N = 150;
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
    const prevS = this.s;
    this.s = Math.min(this.total, this.s + v * dt);
    // sound events: passing a valve
    const events = [];
    for (const vl of this.valves) if (prevS < vl.s && this.s >= vl.s) events.push('valve');
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

    const rNowFog = this.radiusAt(this.s);
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
    scene.fog.near = 12;
    scene.fog.far = Math.max(190, rNowFog * 7);
    scene.background = fogC;
    this.oxy = oxy;

    this.beatWalls(beat);

    // valves: open as we approach, close behind us (and flutter with the beat)
    for (const vl of this.valves) {
      const d = vl.s - this.s;
      const want = d < 30 && d > -8 ? 1 : 0;
      vl.open += (want - vl.open) * Math.min(1, dt * 3);
      const flutter = this.comfort ? 0 : Math.sin(this.time * 9) * 0.03;
      for (const c of vl.cusps) c.rotation.x = -(0.15 + vl.open * 1.25) + flutter;
    }
    this.updateChordae();

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
    return { station: st, index: i, changed, progress: this.s / this.total, events, radius: rNow, oxy };
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
