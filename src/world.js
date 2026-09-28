import * as THREE from 'three';
import { poiseuille, rbcHalfThickness, SIZES, vmaxGame, pulseFactor } from './physics.js';

const loader = new THREE.TextureLoader();
const texCache = new Map();
export function tex(name, repeatX = 1, repeatY = 1) {
  let base = texCache.get(name);
  if (!base) {
    base = loader.load(`assets/${name}.webp`);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.anisotropy = 4;
    texCache.set(name, base);
  }
  const t = base.clone();
  t.repeat.set(repeatX, repeatY);
  return t;
}

/** Biconcave erythrocyte built from the Evans–Fung profile (µm). */
function rbcGeometry() {
  const R0 = SIZES.rbcDiameter / 2;
  const pts = [];
  const N = 18;
  for (let k = 0; k <= N; k++) {
    const r = R0 * Math.sin((k / N) * (Math.PI / 2));
    pts.push(new THREE.Vector2(Math.max(0.001, r), rbcHalfThickness(r, R0)));
  }
  for (let k = N; k >= 0; k--) {
    const r = R0 * Math.sin((k / N) * (Math.PI / 2));
    pts.push(new THREE.Vector2(Math.max(0.001, r), -rbcHalfThickness(r, R0)));
  }
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
}

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.01, 4000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Lighting: it is dark inside the body — the ship brings its own light.
    this.ambient = new THREE.HemisphereLight(0xffe0d0, 0x6a2020, 1.1);
    this.scene.add(this.ambient);
    this.headlight = new THREE.SpotLight(0xf2f6ff, 60, 0, Math.PI / 4.5, 0.6, 1.2);
    this.headlight.position.set(0, 0, 0);
    this.headlight.target.position.set(0, 0, -1);
    this.camera.add(this.headlight, this.headlight.target);
    this.fill = new THREE.PointLight(0xffe0d8, 2, 0, 1.5);
    this.camera.add(this.fill);

    this.rbcGeo = rbcGeometry();
    this.rbcMat = new THREE.MeshStandardMaterial({
      map: tex('tex_rbc'),
      color: 0xe0584c,
      roughness: 0.4,
      metalness: 0,
      emissive: 0x3a0505,
    });
    this.plateletGeo = new THREE.SphereGeometry(1, 16, 10);
    this.plateletGeo.scale(SIZES.platelet / 2, 0.45, SIZES.platelet / 2);
    this.plateletMat = new THREE.MeshStandardMaterial({ color: 0xe8d8c8, roughness: 0.6 });

    this.flowDist = 0;
    this.extraUpdaters = new Set();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Build a vessel. Removes the previous one. */
  setVessel(vessel, opts = {}) {
    this.clearVessel();
    this.vessel = vessel;
    const R = vessel.radius;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const fogColor = new THREE.Color(opts.fogColor ?? 0x8a3a2c);
    this.scene.fog = new THREE.FogExp2(fogColor, vessel.fogDensity);
    this.scene.background = fogColor;

    // Endothelium: tile ~150 µm covers roughly a dozen endothelial cells.
    const tile = 150;
    const L = Math.min(2400, Math.max(600, 30 / vessel.fogDensity));
    this.wallLen = L;
    const circ = 2 * Math.PI * R;
    const radial = R < 100 ? 48 : 160;
    const wallGeo = new THREE.CylinderGeometry(R, R, L, radial, 1, true);
    wallGeo.rotateX(-Math.PI / 2);
    // Swap UVs so the elongated endothelial cells run along the flow (u = axial).
    const uv = wallGeo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      const u = uv.getX(k);
      uv.setXY(k, uv.getY(k), u);
    }
    this.wallTex = tex('tex_endothelium', L / tile, Math.max(1, Math.round(circ / tile)));
    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      emissiveMap: this.wallTex,
      emissive: 0x8a4440,
      emissiveIntensity: 0.6,
      fog: false, // the wall stays readable as a tunnel for orientation
      side: THREE.BackSide,
      roughness: 0.85,
      color: 0xffc8c0,
    });
    this.wall = new THREE.Mesh(wallGeo, this.wallMat);
    this.group.add(this.wall);
    this.wallTile = tile;

    // Blood cells around the ship (density visually reduced for readability).
    const count = opts.rbcCount ?? (R < 100 ? 40 : 260);
    this.cellBox = {
      lat: Math.min(R, opts.cellLat ?? 90),
      front: Math.min(L / 2, opts.cellFront ?? 260),
      back: 40,
    };
    this.rbc = new THREE.InstancedMesh(this.rbcGeo, this.rbcMat, count);
    this.rbc.frustumCulled = false;
    this.group.add(this.rbc);
    this.cells = [];
    for (let k = 0; k < count; k++) this.cells.push(this.spawnCell({}, true, 0, 0));

    const pc = Math.max(4, Math.round(count / 12));
    this.plt = new THREE.InstancedMesh(this.plateletGeo, this.plateletMat, pc);
    this.plt.frustumCulled = false;
    this.group.add(this.plt);
    this.platelets = [];
    for (let k = 0; k < pc; k++) this.platelets.push(this.spawnCell({}, true, 0, 0));
    this.dummy = new THREE.Object3D();
  }

  clearVessel() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== this.rbcGeo && o.geometry !== this.plateletGeo) o.geometry.dispose();
    });
    this.group = null;
  }

  spawnCell(c, anywhere, sx, sy) {
    const R = this.vessel.radius;
    const box = this.cellBox;
    const margin = SIZES.rbcDiameter / 2 + 0.5;
    for (let tries = 0; tries < 20; tries++) {
      c.x = sx + (Math.random() * 2 - 1) * box.lat;
      c.y = sy + (Math.random() * 2 - 1) * box.lat;
      if (Math.hypot(c.x, c.y) < R - margin) break;
    }
    if (Math.hypot(c.x, c.y) >= R - margin) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * (R - margin);
      c.x = Math.cos(a) * rr;
      c.y = Math.sin(a) * rr;
    }
    c.z = anywhere ? -box.front + Math.random() * (box.front + box.back) : -box.front;
    c.rx = Math.random() * Math.PI;
    c.ry = Math.random() * Math.PI;
    c.spin = (Math.random() - 0.5) * 0.6;
    return c;
  }

  /** Axial speed of the plasma at lateral position (x, y). */
  flowAt(x, y, t, mod = 1) {
    const v = this.vessel;
    return poiseuille(Math.hypot(x, y), v.radius, vmaxGame(v)) * pulseFactor(t, v) * mod;
  }

  update(dt, ship, t, flowMod = 1) {
    if (!this.vessel) return;
    const vs = ship.speed;
    // Wall scroll = distance travelled
    this.wallTex.offset.x = (ship.dist / this.wallTile) % 1;
    this.wall.position.set(0, 0, 0);
    const box = this.cellBox;
    const upd = (list, mesh, scale) => {
      for (let k = 0; k < list.length; k++) {
        const c = list[k];
        const vc = this.flowAt(c.x, c.y, t, flowMod);
        c.z -= (vc - vs) * dt;
        c.rx += c.spin * dt;
        // keep cells out of the cockpit
        const dx = c.x - ship.x;
        const dy = c.y - ship.y;
        const d2 = dx * dx + dy * dy + c.z * c.z;
        if (d2 < 100) {
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const push = (10 - Math.sqrt(d2)) * 6 * dt;
          c.x += (dx / d) * push;
          c.y += (dy / d) * push;
        }
        if (c.z < -box.front) this.spawnCell(c, false, ship.x, ship.y), (c.z = box.back);
        else if (c.z > box.back) this.spawnCell(c, false, ship.x, ship.y), (c.z = -box.front);
        else if (Math.abs(dx) > box.lat * 1.2 || Math.abs(dy) > box.lat * 1.2) {
          const z = c.z;
          this.spawnCell(c, false, ship.x, ship.y);
          c.z = z < -20 ? -box.front : z;
        }
        this.dummy.position.set(c.x, c.y, c.z);
        this.dummy.rotation.set(c.rx, c.ry, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(k, this.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    upd(this.cells, this.rbc, 1);
    upd(this.platelets, this.plt, 1);
    for (const fn of this.extraUpdaters) fn(dt, ship, t);
  }

  render(toolScene) {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (toolScene) {
      this.renderer.clearDepth();
      this.renderer.render(toolScene, this.camera);
    }
  }

  /** z coordinate (camera space along the vessel) of an absolute axial distance. */
  zOf(absDist, ship) {
    return -(absDist - ship.dist);
  }
}
