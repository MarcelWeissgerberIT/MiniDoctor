import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Ship tools. Rendered in their own scene on top of the world (depth cleared),
// attached to the camera so they sit in the lower part of the canopy.
// Every tool has: deploy/retract animation, idle motion and an action animation.

export const TOOL_ORDER = ['laser', 'scalpel', 'antibody', 'anchor', 'scanner', 'tpa'];
export const TOOL_KEYS = { Digit1: 'laser', Digit2: 'scalpel', Digit3: 'antibody', Digit4: 'anchor', Digit5: 'scanner', Digit6: 'tpa' };

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const MAT = {
  hull: new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.35, metalness: 0.1 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.4 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd9dee6, roughness: 0.15, metalness: 1 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x0a3a44, emissive: 0x39e0ff, emissiveIntensity: 1.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x99e8ff, transparent: true, opacity: 0.35, roughness: 0.05 }),
};

function glowSprite(color = 0x7ff3ff, size = 0.1) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: t, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

function cyl(r1, r2, h, mat, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  return m;
}

// ---------- tool models (units: µm, the ship itself is 2.5 µm) ----------

function buildLaser() {
  const g = new THREE.Group();
  const body = cyl(0.045, 0.055, 0.34, MAT.graphite);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const sleeve = cyl(0.06, 0.06, 0.12, MAT.hull);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.08;
  g.add(sleeve);
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 24), MAT.glow.clone());
    r.position.z = -0.05 - k * 0.05;
    g.add(r);
    rings.push(r);
  }
  const nozzle = cyl(0.012, 0.04, 0.08, MAT.steel);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.z = -0.21;
  g.add(nozzle);
  const tip = glowSprite(0x9ffcff, 0.06);
  tip.position.z = -0.26;
  g.add(tip);
  // beam (unit length along -z, scaled at runtime)
  const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 8, 1, true);
  beamGeo.translate(0, -0.5, 0);
  beamGeo.rotateX(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.z = -0.26;
  g.add(beam);
  const impact = glowSprite(0xbff8ff, 0.5);
  impact.visible = false;
  g.add(impact);
  g.userData = { rings, tip, beam, impact };
  return g;
}

function buildScalpel() {
  const g = new THREE.Group();
  const arm = cyl(0.025, 0.03, 0.3, MAT.hull);
  arm.rotation.x = Math.PI / 2;
  g.add(arm);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), MAT.graphite);
  joint.position.z = -0.15;
  g.add(joint);
  const pivot = new THREE.Group();
  pivot.position.z = -0.15;
  g.add(pivot);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.02, -0.02);
  shape.quadraticCurveTo(0.03, -0.18, -0.005, -0.26);
  shape.quadraticCurveTo(-0.02, -0.12, -0.012, 0);
  shape.lineTo(0, 0);
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }),
    MAT.steel,
  );
  blade.rotation.x = Math.PI / 2;
  blade.position.z = -0.02;
  pivot.add(blade);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.22), MAT.glow.clone());
  edge.position.set(0.018, 0, -0.14);
  pivot.add(edge);
  const trail = glowSprite(0xdffcff, 0.25);
  trail.material.opacity = 0;
  trail.position.z = -0.3;
  g.add(trail);
  g.userData = { pivot, edge, trail };
  return g;
}

function buildAntibody() {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), MAT.hull);
  g.add(housing);
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.08, 6, 12), MAT.glass);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 0.06, 0.02);
  g.add(tank);
  const fluid = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.07, 6, 12), MAT.glow.clone());
  fluid.rotation.z = Math.PI / 2;
  fluid.position.copy(tank.position);
  g.add(fluid);
  const drum = new THREE.Group();
  drum.position.z = -0.12;
  g.add(drum);
  for (let k = 0; k < 3; k++) {
    const b = cyl(0.014, 0.014, 0.16, MAT.graphite, 10);
    b.rotation.x = Math.PI / 2;
    const a = (k / 3) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.025, Math.sin(a) * 0.025, -0.06);
    drum.add(b);
  }
  const flash = glowSprite(0x9ffcff, 0.12);
  flash.position.z = -0.32;
  flash.material.opacity = 0;
  g.add(flash);
  g.userData = { drum, flash, fluid };
  return g;
}

function buildAnchor() {
  const g = new THREE.Group();
  const base = cyl(0.05, 0.06, 0.1, MAT.graphite);
  base.rotation.x = Math.PI / 2;
  g.add(base);
  const piston = cyl(0.022, 0.022, 0.25, MAT.steel);
  piston.rotation.x = Math.PI / 2;
  piston.position.z = -0.1;
  g.add(piston);
  const head = new THREE.Group();
  head.position.z = -0.2;
  g.add(head);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), MAT.hull);
  head.add(hub);
  const fingers = [];
  for (let k = 0; k < 3; k++) {
    const hinge = new THREE.Group();
    hinge.rotation.z = (k / 3) * Math.PI * 2;
    head.add(hinge);
    const arm = new THREE.Group();
    arm.position.y = 0.035;
    hinge.add(arm);
    const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.1), MAT.hull);
    seg1.position.z = -0.05;
    arm.add(seg1);
    const tipPad = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), MAT.glow.clone());
    tipPad.position.z = -0.1;
    arm.add(tipPad);
    fingers.push(arm);
  }
  g.userData = { head, piston, fingers };
  return g;
}

function buildScanner() {
  const g = new THREE.Group();
  const mast = cyl(0.02, 0.025, 0.2, MAT.graphite);
  mast.position.y = -0.05;
  g.add(mast);
  const turret = new THREE.Group();
  turret.position.y = 0.06;
  g.add(turret);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), MAT.hull);
  dish.rotation.x = Math.PI / 2;
  dish.material.side = THREE.DoubleSide;
  turret.add(dish);
  const feed = cyl(0.006, 0.006, 0.08, MAT.steel, 6);
  feed.rotation.x = Math.PI / 2;
  feed.position.z = -0.05;
  turret.add(feed);
  const emitter = glowSprite(0x7ff3ff, 0.05);
  emitter.position.z = -0.09;
  turret.add(emitter);
  const fanGeo = new THREE.ConeGeometry(0.6, 3, 24, 1, true);
  fanGeo.translate(0, -1.5, 0);
  fanGeo.rotateX(Math.PI / 2);
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x5fe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.position.z = -0.09;
  turret.add(fan);
  g.userData = { turret, fan, emitter };
  return g;
}

function buildTpa() {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.14, 8, 16), MAT.glass);
  tank.rotation.x = Math.PI / 2;
  g.add(tank);
  const fluid = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.12, 8, 16), new THREE.MeshStandardMaterial({ color: 0x331a44, emissive: 0xc070ff, emissiveIntensity: 0.9 }));
  fluid.rotation.x = Math.PI / 2;
  g.add(fluid);
  const nozzle = cyl(0.01, 0.03, 0.1, MAT.steel);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.z = -0.16;
  g.add(nozzle);
  // spray particles
  const N = 60;
  const pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd9a0ff, size: 0.018, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  g.add(pts);
  const seeds = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, s: Math.random(), l: Math.random() }));
  g.userData = { fluid, pts, seeds };
  return g;
}

const BUILDERS = { laser: buildLaser, scalpel: buildScalpel, antibody: buildAntibody, anchor: buildAnchor, scanner: buildScanner, tpa: buildTpa };

// resting pose in camera space
const REST = new THREE.Vector3(0.34, -0.2, -0.95);
const HIDDEN = new THREE.Vector3(0.4, -0.62, -0.85);
const TOOL_SCALE = 0.8;

export class ToolRig {
  constructor(camera, renderer) {
    this.scene = new THREE.Scene();
    if (renderer) {
      // soft studio reflections so the metal parts read as metal
      const pm = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.8;
    }
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x553333, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(0.5, 1, 0.6);
    this.scene.add(key);
    this.camera = camera;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.tools = {};
    for (const k of TOOL_ORDER) {
      const g = BUILDERS[k]();
      g.visible = false;
      g.scale.setScalar(TOOL_SCALE);
      g.position.copy(HIDDEN);
      this.root.add(g);
      this.tools[k] = { group: g, deploy: 0, action: 0, actionDur: 0.5, holding: false };
    }
    this.current = null;
    this.target = null;
    this.available = new Set(TOOL_ORDER);
    this.aimPoint = new THREE.Vector3(0, 0, -30); // camera space
    this.anchorState = 0; // 0 retracted, 1 gripping
    this.anchorGoal = 0;
    this._t = 0;
  }

  setAvailable(list) {
    this.available = new Set(list);
    if (this.current && !this.available.has(this.current)) this.select(list[0] ?? null);
  }

  select(name) {
    if (name && !this.available.has(name)) return false;
    if (name === this.target) return true;
    this.target = name;
    return true;
  }

  cycle(dir) {
    const list = TOOL_ORDER.filter((k) => this.available.has(k));
    if (!list.length) return;
    let i = list.indexOf(this.target ?? list[0]);
    i = (i + dir + list.length) % list.length;
    this.select(list[i]);
  }

  /** Trigger the action animation of the current tool. */
  fire(opts = {}) {
    const tl = this.tools[this.target] ?? this.tools[this.current];
    if (!tl) return false;
    tl.action = 0.0001;
    tl.actionDur = opts.duration ?? { laser: 0.7, scalpel: 0.45, antibody: 0.22, anchor: 0.6, scanner: 1.2, tpa: 0.9 }[this.target];
    return true;
  }
  /** For hold-type actions (scanner, laser burn) */
  setHolding(v) {
    const tl = this.tools[this.target];
    for (const k of TOOL_ORDER) this.tools[k].holding = false;
    if (tl) tl.holding = v;
  }
  setAnchor(on) {
    this.anchorGoal = on ? 1 : 0;
  }

  /** aim point given in world space → converted to camera space */
  aimAtWorld(v3) {
    this.aimPoint.copy(v3);
    this.camera.worldToLocal(this.aimPoint);
    // tools can only swivel ~30° away from the ship's nose
    const len = Math.max(0.5, this.aimPoint.length());
    const dir = this.aimPoint.clone().normalize();
    const fwd = new THREE.Vector3(0, 0, -1);
    const ang = dir.angleTo(fwd);
    const max = 0.5;
    if (ang > max) dir.lerpVectors(fwd, dir, max / ang).normalize();
    this.aimPoint.copy(dir.multiplyScalar(len));
  }
  aimForward(dist = 30) {
    this.aimPoint.set(0, 0, -dist);
  }

  update(dt) {
    this._t += dt;
    this.root.position.copy(this.camera.position);
    this.root.quaternion.copy(this.camera.quaternion);

    // swap: retract current fully before deploying the next
    if (this.current !== this.target) {
      const cur = this.tools[this.current];
      if (cur) {
        cur.deploy = Math.max(0, cur.deploy - dt * 3.5);
        if (cur.deploy <= 0) {
          cur.group.visible = false;
          this.current = this.target;
        }
      } else this.current = this.target;
    } else if (this.current) {
      const cur = this.tools[this.current];
      cur.deploy = Math.min(1, cur.deploy + dt * 2.6);
    }

    const aimDir = this.aimPoint.clone().normalize();
    for (const k of TOOL_ORDER) {
      const tl = this.tools[k];
      const g = tl.group;
      if (tl.deploy <= 0 && k !== this.current) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const d = ease(tl.deploy);
      g.position.lerpVectors(HIDDEN, REST, d);
      // idle float (very small, calm)
      g.position.y += Math.sin(this._t * 1.6 + k.length) * 0.004 * d;
      // point toward the aim point (smoothly)
      const look = new THREE.Matrix4().lookAt(g.position, this.aimPoint, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((1 - d) * 1.2, 0, (1 - d) * -0.6));
      q.multiply(tilt);
      g.quaternion.slerp(q, 1 - Math.exp(-dt * 10));

      if (tl.action > 0) {
        tl.action += dt / tl.actionDur;
        if (tl.action >= 1) tl.action = 0;
      }
      this.animate(k, tl, dt, aimDir);
    }
    // anchor overlay (anchor claw is always shown when gripping)
    this.anchorState += (this.anchorGoal - this.anchorState) * (1 - Math.exp(-dt * 5));
  }

  animate(k, tl, dt, aimDir) {
    const u = tl.group.userData;
    const a = tl.action; // 0 = idle, (0,1) = running
    const t = this._t;
    switch (k) {
      case 'laser': {
        const on = a > 0 || tl.holding;
        u.rings.forEach((r, i) => {
          r.material.emissiveIntensity = on ? 2 + Math.sin(t * 40 + i) * 1.2 : 0.8 + Math.sin(t * 3 + i * 1.3) * 0.4;
          r.rotation.z += dt * (on ? 12 : 1);
        });
        const aimLen = this.aimPoint.length();
        const env = on ? Math.sin(Math.min(1, a || 0.5) * Math.PI) : 0;
        u.beam.material.opacity = on ? 0.55 + Math.random() * 0.35 : 0;
        u.beam.scale.set(1 + env * 2, 1 + env * 2, Math.max(0.01, aimLen));
        u.tip.scale.setScalar(on ? 0.1 + Math.random() * 0.05 : 0.05);
        u.impact.visible = on;
        if (on) {
          // impact sprite at the aim point, expressed in tool-local space
          const p = this.aimPoint.clone();
          tl.group.worldToLocal(tl.group.localToWorld(new THREE.Vector3()).set(0, 0, 0));
          u.impact.position.set(0, 0, -0.26 - aimLen * 0.98);
          u.impact.scale.setScalar(0.6 + Math.random() * 0.4 + aimLen * 0.02);
        }
        tl.group.position.z += on ? 0.006 * Math.sin(t * 60) : 0;
        break;
      }
      case 'scalpel': {
        // slash: wind up, fast cut, recover
        let ang = Math.sin(t * 1.3) * 0.05;
        if (a > 0) {
          if (a < 0.25) ang = -0.9 * easeInOut(a / 0.25);
          else if (a < 0.5) ang = -0.9 + 2.0 * ease((a - 0.25) / 0.25);
          else ang = 1.1 * (1 - easeInOut((a - 0.5) / 0.5));
        }
        u.pivot.rotation.y = ang;
        u.pivot.rotation.x = a > 0 ? -Math.sin(a * Math.PI) * 0.4 : 0;
        u.trail.material.opacity = a > 0.25 && a < 0.6 ? 0.8 : Math.max(0, u.trail.material.opacity - dt * 4);
        u.edge.material.emissiveIntensity = 1 + (a > 0 ? 3 : Math.sin(t * 2) * 0.5);
        break;
      }
      case 'antibody': {
        u.drum.rotation.z += dt * (a > 0 ? 30 : 1.2);
        const recoil = a > 0 ? Math.sin(a * Math.PI) * 0.05 : 0;
        tl.group.translateZ(recoil);
        u.flash.material.opacity = a > 0 && a < 0.5 ? 1 - a * 2 : 0;
        u.flash.scale.setScalar(0.1 + (a > 0 ? a * 0.2 : 0));
        u.fluid.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.3;
        break;
      }
      case 'anchor': {
        // action: shoot forward, close fingers; anchorState: stay extended & gripping
        const grip = Math.max(this.anchorState, a > 0 ? Math.sin(a * Math.PI) : 0);
        u.head.position.z = -0.2 - grip * 0.35;
        u.piston.scale.set(1, 1 + grip * 1.4, 1);
        u.piston.position.z = -0.1 - grip * 0.18;
        const open = a > 0 && a < 0.5 ? 1 : 1 - grip;
        u.fingers.forEach((f, i) => {
          f.rotation.x = -0.2 + open * 0.8 + Math.sin(t * 2 + i) * 0.03;
        });
        break;
      }
      case 'scanner': {
        const on = a > 0 || tl.holding;
        u.turret.rotation.z += dt * (on ? 6 : 0.6);
        u.fan.material.opacity = on ? 0.25 + Math.sin(t * 20) * 0.1 : Math.max(0, u.fan.material.opacity - dt * 2);
        const len = this.aimPoint.length();
        u.fan.scale.set(0.4 + Math.sin(t * 5) * 0.1, 0.4 + Math.sin(t * 5) * 0.1, Math.max(0.1, len / 3));
        u.emitter.scale.setScalar(on ? 0.08 + Math.random() * 0.03 : 0.04);
        break;
      }
      case 'tpa': {
        const on = a > 0 || tl.holding;
        const arr = u.pts.geometry.attributes.position.array;
        u.seeds.forEach((s, i) => {
          if (on) s.l = (s.l + dt * (1.2 + s.s)) % 1;
          const L = on ? s.l : 0;
          const rad = L * 0.12 * (0.5 + s.s);
          arr[i * 3] = Math.cos(s.a) * rad;
          arr[i * 3 + 1] = Math.sin(s.a) * rad;
          arr[i * 3 + 2] = -0.21 - L * 0.9;
        });
        u.pts.geometry.attributes.position.needsUpdate = true;
        u.pts.material.opacity = on ? 0.9 : 0;
        u.fluid.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.3;
        break;
      }
    }
  }
}
