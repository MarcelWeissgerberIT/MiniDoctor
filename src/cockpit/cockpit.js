import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { rbox, cyl, plateWithHoles, tube, StaticBatcher, fitModel, projectUV } from '../geom.js';
import { Gauge, ToggleSwitch, LampButton, AlarmLamp, SegDisplay, makeLabel, LABEL_MATERIALS } from './instruments.js';
import { MFD } from './displays.js';
import { COMPUTER_UNITS, pageFeedRect } from './computer.js';
import { HUD } from './hud.js';

// Cockpit coordinates: metres, pilot eye at the origin, looking down -Z.
export const C = { floor: -1.25, ceil: 0.8, wallX: 1.08, back: 0.97 };
// wrap-around canopy (like the boarding film): a wide front screen and two angled side
// screens. fx: half width of the front frame, b*: where the side screens meet the walls
const CANOPY = { z: -0.97, fx: 0.64, bx: 1.06, bz: -0.56 };
const WIN = { x0: -0.628, x1: 0.628, y0: -0.35, y1: 0.55 }; // screen opening (front frame coords)
// the canopy HUD only needs the middle band of the screen
const HUD_WIN = { x0: WIN.x0, x1: WIN.x1, y0: -0.26, y1: 0.42 };
// curved dash: low, flat facets tangent to a circle around the pilot, leaning back
const DASH = { r: 0.8, y: -0.5, tilt: -0.5, angles: [-62, -34, 0, 34, 62], y0: -0.22, y1: 0.16, outerY0: -0.06 };
const LEAN = Math.sin(-DASH.tilt); // how much further away the facet gets per metre up

/**
 * The cockpit lives in its own scene that is rendered after the world with a
 * cleared depth buffer, so the tiny near plane does not cost the battlefield
 * any depth precision.
 */
export class Cockpit {
  constructor(assets, feedTarget, droneTarget) {
    this.assets = assets;
    // the cockpit restyles the shared materials for itself (the world keeps the rugged ones):
    // a modern cabin in satin gunmetal with thin trims and amber LED accents
    this.m = Object.create(assets.materials);
    this.modernize(assets);
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.controls = []; // everything with update()
    this.hitTargets = []; // meshes the crosshair can press
    this.gauges = {};
    this.switches = {};
    this.lamps = {};
    this.power = 0; // 0..1 cockpit electrical power (startup sequence)
    this.lightsOn = false;
    this.batt = false;
    this.main = false;
    this.batch = new StaticBatcher(this.root);
    this.m.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 1, roughness: 0.18 });

    RectAreaLightUniformsLib.init();
    this.frame = (p, r) => {
      const o = new THREE.Object3D();
      o.position.set(...p);
      o.rotation.set(...r);
      this.root.add(o);
      o.updateMatrixWorld(true);
      return o;
    };

    this.buildShell();
    this.buildHatch();
    this.buildFront();
    this.buildDash(feedTarget);
    this.buildOverhead();
    this.buildConsoles();
    this.buildComputer(droneTarget);
    this.buildWipers();
    this.buildPlumbing();
    this.buildProps();
    this.buildDecals();
    this.buildLights();
    this.buildDust();
    this.buildMarker();
    this.buildTags();
    this.buildDamage();
    this.batch.finalize();
  }

  /** clean, modern cabin materials instead of the rusty armour of the outside */
  modernize(assets) {
    const m = this.m;
    const n = assets.tex.console.n;
    const satin = (color, roughness, metalness, normal = 0.22) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, normalMap: n, normalScale: new THREE.Vector2(normal, normal), envMapIntensity: 0.75 });
    m.armor = satin(0x30353a, 0.5, 0.5); // walls, ceiling, hatch
    m.console = satin(0x0b0c0d, 0.8, 0.15, 0.3); // dash deck and console tops: matte black, no hot spots
    m.armorDark = satin(0x1b1e21, 0.45, 0.55); // pillars, canopy frames, console bodies
    m.rivets = satin(0x23272b, 0.6, 0.5, 0.12); // ribs and frames
    m.pipe = m.armorDark;
    m.consoleMetal = satin(0x0f1012, 0.45, 0.3, 0.08); // display and gauge bezels: black satin
    m.panel = satin(0x131517, 0.55, 0.3, 0.12); // instrument panels: near black, labels are back-lit
    m.trim = new THREE.MeshStandardMaterial({ color: 0xa9afb5, metalness: 1, roughness: 0.28 });
    // thin amber LED strips where the old hazard tape was
    m.led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
    m.hazard = m.led;
    const floor = assets.materials.floor.clone();
    floor.color = new THREE.Color(0x5c6166);
    m.floor = floor;
  }

  /* --------------------------------------------------------------- shell */

  buildShell() {
    const { m, batch } = this;
    // floor (diamond plate) and a darker sub-floor ring
    batch.add(rbox(2.3, 0.06, 2.2, 0.01, 0.55), m.floor, [0, C.floor - 0.03, 0]);
    // ceiling with structural ribs
    batch.add(rbox(2.3, 0.06, 2.12, 0.01, 1.1), m.rivets, [0, C.ceil + 0.03, -0.05]);
    for (const z of [-0.55, -0.1, 0.35, 0.8]) batch.add(rbox(2.16, 0.08, 0.07, 0.01, 0.6), m.rivets, [0, C.ceil - 0.035, z]);
    // longitudinal ceiling beams
    for (const x of [-0.7, 0.7]) batch.add(rbox(0.08, 0.07, 1.8, 0.01, 0.6), m.rivets, [x, C.ceil - 0.06, 0.06]);
    // back wall with the crew hatch opening (the door itself is dynamic, see buildHatch)
    const backWall = plateWithHoles([-1.15, C.floor - 0.05, 1.15, C.ceil + 0.05, 0.01], [[-0.37, -1.01, 0.37, 0.38, 0.03]], 0.06, 0.9, 0.006);
    batch.add(backWall, m.armorDark, [0, 0, C.back + 0.06], [0, Math.PI, 0]);
    const hatch = [
      [0, 0.42, 0.9, 0.08],
      [0, -1.05, 0.9, 0.08],
      [-0.41, -0.32, 0.08, 1.4],
      [0.41, -0.32, 0.08, 1.4],
    ];
    for (const [x, y, w, h] of hatch) batch.add(rbox(w, h, 0.05, 0.012, 0.5), m.rivets, [x, y, C.back - 0.02]);
    // hatch hazard stripes
    batch.add(rbox(0.9, 0.05, 0.012, 0.004, 0.25), m.hazard, [0, 0.49, C.back - 0.05]);

    // side walls (the front corners are glazed, see buildFront)
    const wallLen = C.back + 0.03 - CANOPY.bz;
    for (const sx of [-1, 1]) batch.add(rbox(0.06, C.ceil - C.floor + 0.06, wallLen, 0.01, 0.9), m.armor, [sx * (C.wallX + 0.03), (C.ceil + C.floor) / 2, CANOPY.bz + wallLen / 2]);
    // reinforcement plates on the walls
    for (const sx of [-1, 1]) {
      batch.add(rbox(0.035, 0.5, 0.9, 0.01, 1.0), m.rivets, [sx * (C.wallX - 0.018), 0.45, 0.4]);
      batch.add(rbox(0.035, 0.34, 1.4, 0.01, 1.0), m.rivets, [sx * (C.wallX - 0.018), -1.05, 0.2]);
      // vertical frames (ribs)
      for (const z of [-0.25, 0.3, 0.85]) batch.add(rbox(0.07, 2.05, 0.07, 0.012, 0.6), m.rivets, [sx * (C.wallX - 0.04), -0.22, z]);
    }
    // knee well / lower front
    batch.add(rbox(2.2, 0.9, 0.06, 0.01, 0.9), m.armorDark, [0, -0.85, -1.08]);
  }

  /** Crew hatch in the back wall, hinged on the left; opens outwards. */
  buildHatch() {
    const { m } = this;
    this.hatch = new THREE.Group();
    this.hatch.position.set(-0.37, -0.315, C.back + 0.02);
    const door = new THREE.Group();
    door.position.x = 0.37;
    const plate = new THREE.Mesh(rbox(0.76, 1.41, 0.07, 0.012, 0.9), m.armor);
    const inner = new THREE.Mesh(rbox(0.62, 1.2, 0.02, 0.008, 0.6), m.rivets);
    inner.position.z = -0.04;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 28), m.steel);
    wheel.position.set(0, 0.02, -0.09);
    const hub = new THREE.Mesh(cyl(0.025, 0.025, 0.06, 12), m.steel);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 0.02, -0.065);
    door.add(plate, inner, wheel, hub);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(cyl(0.008, 0.008, 0.22, 6), m.steel);
      spoke.position.set(0, 0.02, -0.09);
      spoke.rotation.z = (i * Math.PI) / 3;
      door.add(spoke);
    }
    // locking bolts on the right edge
    for (const y of [-0.5, 0, 0.5]) {
      const bolt = new THREE.Mesh(rbox(0.08, 0.04, 0.03, 0.006, 0.1), m.steel);
      bolt.position.set(0.36, y, -0.05);
      door.add(bolt);
    }
    door.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.wheel = wheel;
    this.hatch.add(door);
    this.root.add(this.hatch);
    this.hatchOpen = 0;
  }

  /** 0 = closed, 1 = fully open (swung outwards) */
  setHatch(v) {
    this.hatchOpen = v;
    this.hatch.rotation.y = -v * 1.75;
    this.wheel.rotation.z = Math.min(1, v * 4) * 2.4;
    if (this.hatchLight) {
      this.hatchLight.intensity = v * 14;
      this.hatchLight.visible = v > 0.01;
    }
  }

  /* --------------------------------------------------------------- front */

  buildFront() {
    const { m, batch } = this;
    const wy = (WIN.y0 + WIN.y1) / 2;
    const wh = WIN.y1 - WIN.y0;
    const fx = CANOPY.fx;
    // front screen
    const front = this.frame([0, 0, CANOPY.z], [0, 0, 0]);
    this.front = front;
    const plate = plateWithHoles([-fx - 0.01, -0.52, fx + 0.01, 0.92, 0.01], [[WIN.x0, WIN.y0, WIN.x1, WIN.y1, 0.02]], 0.04, 0.9, 0.004);
    batch.add(plate, m.armorDark, [0, 0, -0.06], [0, 0, 0], front);
    this.screenFrame(front, WIN.x0, WIN.x1, -0.012);
    this.addGlass(WIN.x1 - WIN.x0 - 0.01, wh - 0.01, [0, wy, -0.04], [0, 0, 0], 1, front);
    this.paneRects = [{ frame: front, x: 0, y: wy, z: -0.035, w: WIN.x1 - WIN.x0 - 0.01, h: wh - 0.01 }];
    // holographic HUD projected onto the front screen
    this.hud = new HUD(HUD_WIN, { tilt: 0, origin: [0, 0, CANOPY.z], z: -0.03 });
    front.add(this.hud.mesh);

    // angled side screens from the front screen back to the side walls
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * fx, 0, CANOPY.z);
      const b = new THREE.Vector3(sx * CANOPY.bx, 0, CANOPY.bz);
      const start = sx < 0 ? b : a;
      const dir = (sx < 0 ? a : b).clone().sub(start);
      const len = dir.length();
      dir.normalize();
      // local +x runs left to right along the screen, local +z points into the cabin
      const side = this.frame([start.x, 0, start.z], [0, Math.atan2(-dir.z, dir.x), 0]);
      const sp = plateWithHoles([0, C.floor - 0.03, len, C.ceil + 0.03, 0.01], [[0.016, WIN.y0, len - 0.016, WIN.y1, 0.02]], 0.04, 0.9, 0.004);
      batch.add(sp, m.armorDark, [0, 0, -0.06], [0, 0, 0], side);
      this.screenFrame(side, 0.016, len - 0.016, -0.012);
      this.addGlass(len - 0.035, wh - 0.01, [len / 2, wy, -0.04], [0, 0, 0], 1, side);
      this.paneRects.push({ frame: side, x: len / 2, y: wy, z: -0.035, w: len - 0.035, h: wh - 0.01 });
      // slim pillars at both joints
      for (const p of [a, b]) batch.add(rbox(0.032, C.ceil - C.floor, 0.032, 0.01, 0.6), m.armorDark, [p.x, (C.ceil + C.floor) / 2, p.z + 0.006], [0, Math.PI / 4, 0]);
    }

    // brow above the front screen with an LED line, and a display pod hanging from it
    batch.add(rbox(1.34, 0.05, 0.12, 0.015, 0.5), m.armorDark, [0, WIN.y1 + 0.1, 0.05], [-0.3, 0, 0], front);
    batch.add(rbox(1.2, 0.006, 0.01, 0.002, 0.25), m.led, [0, WIN.y1 + 0.072, 0.108], [-0.3, 0, 0], front);
    batch.add(rbox(0.05, 0.1, 0.03, 0.008, 0.4), m.armorDark, [0, WIN.y1 - 0.03, 0.03], [0, 0, 0], front);
    batch.add(rbox(0.38, 0.075, 0.06, 0.012, 0.4), m.armorDark, [0, WIN.y1 - 0.1, 0.05], [0, 0, 0], front);
    this.segs = {};
    const pod = [
      ['clock', 'ZEIT', 4, -0.125],
      ['podHdg', 'KURS', 3, 0.0],
      ['range', 'ENTF', 4, 0.125],
    ];
    for (const [key, label, digits, x] of pod) {
      const d = new SegDisplay(m, { w: 0.105, h: 0.052, digits, label });
      d.group.position.set(x, WIN.y1 - 0.1, 0.081);
      front.add(d.group);
      this.segs[key] = d;
    }
  }

  /** slim trim around a screen opening (frame coordinates) */
  screenFrame(frame, x0, x1, z) {
    const { m, batch } = this;
    const fw = 0.016;
    const wy = (WIN.y0 + WIN.y1) / 2;
    const wh = WIN.y1 - WIN.y0;
    batch.add(rbox(x1 - x0 + 2 * fw, fw, 0.02, 0.006, 0.4), m.rivets, [(x0 + x1) / 2, WIN.y1 + fw / 2, z], [0, 0, 0], frame);
    batch.add(rbox(x1 - x0 + 2 * fw, fw, 0.02, 0.006, 0.4), m.rivets, [(x0 + x1) / 2, WIN.y0 - fw / 2, z], [0, 0, 0], frame);
    batch.add(rbox(fw, wh, 0.02, 0.006, 0.4), m.rivets, [x0 - fw / 2, wy, z], [0, 0, 0], frame);
    batch.add(rbox(fw, wh, 0.02, 0.006, 0.4), m.rivets, [x1 + fw / 2, wy, z], [0, 0, 0], frame);
  }

  addGlass(w, h, p, r, grimeScale = 1, frame = null) {
    const tex = this.assets.fx.glass_grime;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9aa39a,
      alphaMap: tex,
      transparent: true,
      opacity: 0.6,
      roughness: 0.2,
      metalness: 0,
      depthWrite: false,
      envMapIntensity: 0.6,
    });
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    const ox = Math.random();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * grimeScale * 0.9 + ox, uv.getY(i) * h * grimeScale * 0.9);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...p);
    mesh.rotation.set(...r);
    mesh.renderOrder = 5;
    (frame || this.root).add(mesh);
    this.glass ??= [];
    this.glass.push(mesh);
    return mesh;
  }

  /* ---------------------------------------------------------------- dash */

  buildDash(feedTarget) {
    const { m, batch } = this;
    const D = DASH.angles.map((d) => (d * Math.PI) / 180);
    const f = D.map((theta, i) => {
      const o = new THREE.Object3D();
      o.rotation.order = 'YXZ';
      o.position.set(DASH.r * Math.sin(theta), DASH.y, -DASH.r * Math.cos(theta));
      o.rotation.set(DASH.tilt, -theta, 0);
      this.root.add(o);
      o.updateMatrixWorld(true);
      // half-angles to the neighbours; the outer wings end at a fixed width
      const tl = i > 0 ? Math.tan((theta - D[i - 1]) / 2) : null;
      const tr = i < D.length - 1 ? Math.tan((D[i + 1] - theta) / 2) : null;
      const outer = i === 0 || i === D.length - 1;
      const dist = (y) => DASH.r + LEAN * y;
      return {
        o,
        y0: outer ? DASH.outerY0 : DASH.y0,
        y1: DASH.y1,
        L: (y) => (tl != null ? dist(y) * tl : (0.22 * dist(y)) / DASH.r),
        R: (y) => (tr != null ? dist(y) * tr : (0.22 * dist(y)) / DASH.r),
      };
    });
    this.dash = f[2].o;

    // facet bodies (trapezoids, so neighbouring facets meet along their whole edge),
    // LED lines on top and a matte deck from each top edge out to the canopy
    for (const k of f) {
      const sh = new THREE.Shape();
      sh.moveTo(-k.L(k.y0), k.y0);
      sh.lineTo(k.R(k.y0), k.y0);
      sh.lineTo(k.R(k.y1), k.y1);
      sh.lineTo(-k.L(k.y1), k.y1);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
      geo.translate(0, 0, -0.066);
      batch.add(projectUV(geo, 0.7), m.panel, [0, 0, 0], [0, 0, 0], k.o);
      const top = k.y1;
      batch.add(rbox(k.L(top) + k.R(top) - 0.03, 0.006, 0.008, 0.002, 0.2), m.led, [(k.R(top) - k.L(top)) / 2, top - 0.006, 0.002], [0, 0, 0], k.o);
      this.deck(k.o.localToWorld(new THREE.Vector3(-k.L(top) - 0.006, top + 0.006, -0.07)), k.o.localToWorld(new THREE.Vector3(k.R(top) + 0.006, top + 0.006, -0.07)));
    }

    // three MFDs: status (left), camera (centre), tactical (right)
    const my = 0.03;
    this.mfd = {};
    const mfdOn = [
      ['status', f[1]],
      ['camera', f[2]],
      ['tactical', f[3]],
    ];
    for (const [kind, k] of mfdOn) {
      const x = (k.R(my) - k.L(my)) / 2;
      batch.add(rbox(0.33, 0.25, 0.026, 0.012, 0.4), m.consoleMetal, [x, my, 0.008], [0, 0, 0], k.o);
      const mfd = new MFD(0.3, 0.225, { feed: kind === 'camera' ? feedTarget : null });
      mfd.mesh.position.set(x, my, 0.0225);
      k.o.add(mfd.mesh);
      this.mfd[kind] = mfd;
    }

    // round orange instruments: a cluster on the left wing, two more on the right wing,
    // small ones under the status display
    const gauge = (key, k, x, y, r, opts) => {
      const g = new Gauge(m, { ...opts, r });
      g.group.position.set(x, y, 0);
      k.o.add(g.group);
      this.gauges[key] = g;
      this.controls.push(g);
    };
    gauge('reactor', f[0], -0.13, 0.105, 0.042, { title: 'REACTOR', unit: '%', min: 0, max: 100, major: 20, minor: 5, red: 90 });
    gauge('hyd', f[0], 0.0, 0.105, 0.042, { title: 'HYD', unit: 'MPa', min: 0, max: 30, major: 5, minor: 1, red: 26 });
    gauge('core', f[0], 0.13, 0.105, 0.042, { title: 'CORE', unit: '%', min: 0, max: 100, major: 25, minor: 5, red: 80 });
    gauge('coolant', f[0], -0.14, 0.0, 0.028, { title: 'COOL', unit: '%', min: 0, max: 100, major: 25, minor: 5 });
    gauge('apu', f[0], -0.047, 0.0, 0.028, { title: 'APU', unit: '%', min: 0, max: 100, major: 25, minor: 5 });
    gauge('gyro', f[0], 0.047, 0.0, 0.028, { title: 'GYRO', unit: '%', min: 0, max: 100, major: 25, minor: 5 });
    gauge('amp', f[0], 0.14, 0.0, 0.028, { title: 'BUS', unit: 'A', min: 0, max: 400, major: 100, minor: 25 });
    gauge('temp', f[4], -0.075, 0.105, 0.042, { title: 'TEMP', unit: '°C', min: 0, max: 400, major: 100, minor: 25, red: 320 });
    gauge('speed', f[4], 0.075, 0.105, 0.042, { title: 'SPEED', unit: 'km/h', min: 0, max: 60, major: 10, minor: 2 });

    // orange segment readouts on the right
    const seg = (key, k, x, y, label, digits) => {
      const d = new SegDisplay(m, { w: 0.12, h: 0.05, digits, label });
      d.group.position.set(x, y, 0);
      k.o.add(d.group);
      this.segs[key] = d;
    };
    seg('hdg', f[4], -0.075, 0.0, 'KURS', 3);
    seg('ammo', f[4], 0.075, 0.0, 'MUNITION', 3);
    const xt = (f[3].R(-0.16) - f[3].L(-0.16)) / 2;
    seg('thr', f[3], xt - 0.08, -0.16, 'SCHUB %', 4);
    seg('spd', f[3], xt + 0.08, -0.16, 'KM/H', 3);

    // annunciators and guarded switches under the camera display
    const c = f[2].o;
    const xa = (f[1].R(-0.16) - f[1].L(-0.16)) / 2;
    const ann = [
      ['heat', 'HEAT\nHIGH', '#ff9a1f', xa - 0.105],
      ['armor', 'ARMOR\nDMG', '#ff9a1f', xa],
      ['lock', 'MASTER\nCAUTION', '#ff3b2a', xa + 0.105],
    ];
    for (const [key, txt, col, x] of ann) {
      const lb = new LampButton(m, { text: txt, color: col, w: 0.095, h: 0.045, blink: key === 'lock' });
      lb.group.position.set(x, -0.16, 0);
      f[1].o.add(lb.group);
      this.lamps[key] = lb;
      this.controls.push(lb);
      this.hitTargets.push(lb.cap);
    }
    this.lamps.lock.action = () => this.onAction?.('caution');
    this.lamps.lock.label = 'MASTER CAUTION quittieren';
    const guarded = [
      ['firesup', 'FIRE\nSUPPR', -0.18],
      ['coolant', 'COOLANT\nBYPASS', -0.06],
      ['reactor', 'REACTOR\nSTART', 0.06],
      ['stab', 'STAB\nASSIST', 0.18],
    ];
    for (const [key, label, x] of guarded) {
      const sw = new ToggleSwitch(m, { label, guard: true });
      sw.group.position.set(x, -0.165, 0);
      c.add(sw.group);
      this.switches[key] = sw;
      this.controls.push(sw);
      this.hitTargets.push(sw.hit);
    }

    // lower dash panel with a toggle row (optics, NV, ...)
    const low = this.frame([0, -0.88, -0.68], [-0.18, 0, 0]);
    batch.add(rbox(1.0, 0.27, 0.06, 0.015, 0.7), m.panel, [0, 0, -0.03], [0, 0, 0], low);
    batch.add(rbox(0.96, 0.006, 0.01, 0.002, 0.22), m.led, [0, 0.133, 0.0], [0, 0, 0], low);
    const toggles = [
      ['optics', 'OPTICS', -0.399, false],
      ['ir', 'IR', -0.285, false],
      ['nv', 'NV', -0.171, false],
      ['lights', 'CABIN\nLIGHT', -0.057, false],
      ['hud', 'HUD', 0.057, false],
      ['radar', 'RADAR\nRANGE', 0.171, false],
      ['wiper', 'WIPER', 0.285, false],
      ['legLock', 'LEG\nLOCK', 0.399, true],
    ];
    for (const [key, label, x, on] of toggles) {
      const sw = new ToggleSwitch(m, { label, on });
      sw.group.position.set(x, 0.03, 0);
      low.add(sw.group);
      this.switches[key] = sw;
      this.controls.push(sw);
      this.hitTargets.push(sw.hit);
    }

    // pedals
    for (const sx of [-1, 1]) {
      batch.add(rbox(0.14, 0.03, 0.26, 0.006, 0.3), m.floor, [sx * 0.2, C.floor + 0.12, -0.72], [0.45, 0, 0]);
      batch.add(cyl(0.015, 0.015, 0.2, 8), m.steel, [sx * 0.2, C.floor + 0.08, -0.82], [0.9, 0, 0]);
    }

  }

  /** matte deck from a dash top edge (p1 -> p2) out to the canopy, so there is no gap to look into */
  deck(p1, p2) {
    const fx = CANOPY.fx - 0.01;
    const outline = [
      [-C.wallX, 0.3],
      [-C.wallX, CANOPY.bz + 0.01],
      [-fx, CANOPY.z - 0.005],
      [fx, CANOPY.z - 0.005],
      [C.wallX, CANOPY.bz + 0.01],
      [C.wallX, 0.3],
    ];
    const out = (p) => {
      // ray from the pilot's axis through p, first hit on the canopy outline
      const ux = p.x;
      const uz = p.z;
      let best = null;
      for (let i = 0; i < outline.length - 1; i++) {
        const [ax, az] = outline[i];
        const [bx, bz] = outline[i + 1];
        const ex = bx - ax;
        const ez = bz - az;
        const den = ux * ez - uz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * ez - az * ex) / den;
        const s = (ax * uz - az * ux) / den;
        if (t > 1 && s >= -1e-6 && s <= 1 + 1e-6 && (!best || t < best)) best = t;
      }
      return new THREE.Vector3(p.x * (best ?? 1.2), p.y, p.z * (best ?? 1.2));
    };
    const q1 = out(p1);
    const q2 = out(p2);
    const geo = new THREE.BufferGeometry();
    const v = [p1, p2, q2, p1, q2, q1].flatMap((p) => [p.x, p.y, p.z]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    geo.computeVertexNormals();
    // facing up
    if (geo.attributes.normal.getY(0) < 0) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute([p1, q2, p2, p1, q1, q2].flatMap((p) => [p.x, p.y, p.z]), 3));
      geo.computeVertexNormals();
    }
    this.batch.add(geo, this.m.console);
  }

  /* ------------------------------------------------------------ overhead */

  buildOverhead() {
    const { m, batch } = this;
    const oh = this.frame([0, 0.6, -0.62], [0.78, 0, 0]);
    batch.add(rbox(1.22, 0.34, 0.07, 0.015, 0.6), m.panel, [0, 0, -0.035], [0, 0, 0], oh);
    batch.add(rbox(1.22, 0.014, 0.03, 0.004, 0.22), m.hazard, [0, -0.17, 0.0], [0, 0, 0], oh);
    const defs = [
      ['wpnArm', 'WEAPONS\nARM', -0.48, true],
      ['gun', 'MAIN\nGUN', -0.34],
      ['missile', 'MISSILE', -0.24],
      ['mg', 'MG', -0.14],
      ['aux', 'AUX', -0.04],
      ['pump', 'COOLANT\nPUMP', 0.08],
      ['hydp', 'HYD\nPRESS', 0.18],
      ['ecm', 'ECM', 0.28],
    ];
    for (const [key, label, x, guard] of defs) {
      const sw = new ToggleSwitch(m, { label, guard: !!guard });
      sw.group.position.set(x, 0.03, 0);
      oh.add(sw.group);
      this.switches[key] = sw;
      this.controls.push(sw);
      this.hitTargets.push(sw.hit);
    }
    // circuit breaker row and rotary selectors
    for (let i = 0; i < 14; i++) batch.add(cyl(0.007, 0.007, 0.016, 8, 0.1), m.blackPaint, [-0.5 + i * 0.05, -0.085, 0.008], [Math.PI / 2, 0, 0], oh);
    for (let i = 0; i < 14; i++) batch.add(rbox(0.012, 0.004, 0.003, 0.001, 0.05), m.steel, [-0.5 + i * 0.05, -0.11, 0.001], [0, 0, 0], oh);
    for (const x of [-0.3, -0.18]) {
      batch.add(cyl(0.024, 0.026, 0.02, 20, 0.1), m.rubber, [x, -0.04 + 0.16, 0.01], [Math.PI / 2, 0, 0], oh);
      batch.add(rbox(0.006, 0.03, 0.006, 0.002, 0.05), m.steel, [x, -0.04 + 0.16, 0.021], [0, 0, 0.6], oh);
    }
    this.alarm = new AlarmLamp(m);
    this.alarm.group.position.set(0.47, 0.02, 0.0);
    oh.add(this.alarm.group);
    this.controls.push({ update: (dt, h, t) => this.alarm.update(dt, t) });
    // amber status lamps
    for (const [i, key] of ['pwrA', 'pwrB'].entries()) {
      const lb = new LampButton(m, { text: i ? 'GEN 2' : 'GEN 1', color: '#ffb020', w: 0.06, h: 0.03 });
      lb.group.position.set(0.37, 0.06 - i * 0.05, 0);
      oh.add(lb.group);
      this.lamps[key] = lb;
      this.controls.push(lb);
    }
  }

  /* ------------------------------------------------------------ consoles */

  buildConsoles() {
    const { m, batch } = this;
    for (const sx of [-1, 1]) {
      const x = sx * 0.8;
      batch.add(rbox(0.56, 0.66, 1.0, 0.02, 0.8), m.armorDark, [x, -0.92, -0.1]);
      batch.add(rbox(0.58, 0.03, 1.02, 0.01, 0.6), m.console, [x, -0.585, -0.1]);
      // edge trim with an LED line
      batch.add(rbox(0.03, 0.04, 1.02, 0.008, 0.3), m.trim, [sx * 0.52, -0.585, -0.1]);
      batch.add(rbox(0.006, 0.006, 0.96, 0.002, 0.2), m.led, [sx * 0.505, -0.6, -0.1]);
      // vent slots on the inner face
      for (let k = 0; k < 6; k++) batch.add(rbox(0.004, 0.014, 0.22, 0.002, 0.1), m.blackPaint, [sx * 0.519, -0.72 - k * 0.03, 0.12]);
    }
    // small switch panel on the left console
    // side panels lie on the consoles, tilted up towards the pilot
    const sidePanel = (pos, normal) => {
      const o = new THREE.Object3D();
      o.position.set(...pos);
      o.lookAt(pos[0] + normal[0], pos[1] + normal[1], pos[2] + normal[2]);
      this.root.add(o);
      o.updateMatrixWorld(true);
      return o;
    };
    // pedestals so the tilted panels sit above the console tops
    batch.add(rbox(0.07, 0.15, 0.3, 0.01, 0.3), m.consoleMetal, [-0.94, -0.5, 0.06]);
    batch.add(rbox(0.07, 0.14, 0.22, 0.01, 0.3), m.consoleMetal, [0.99, -0.505, 0.1]);
    const lp = sidePanel([-0.8, -0.47, 0.06], [0.5, 0.85, -0.12]);
    batch.add(rbox(0.44, 0.29, 0.03, 0.008, 0.3), m.panel, [0, 0, -0.016], [0, 0, 0], lp);
    batch.add(rbox(0.45, 0.012, 0.02, 0.004, 0.2), m.hazard, [0, 0.15, -0.004], [0, 0, 0], lp);
    const elec = [
      ['batt', 'BATT', true],
      ['apu', 'APU'],
      ['gen1', 'GEN 1'],
      ['gen2', 'GEN 2'],
    ];
    for (const [i, [key, label, guard]] of elec.entries()) {
      const sw = new ToggleSwitch(m, { label, guard: !!guard });
      sw.group.position.set(-0.135 + i * 0.09, -0.01, 0);
      lp.add(sw.group);
      this.switches[key] = sw;
      this.controls.push(sw);
      this.hitTargets.push(sw.hit);
    }
    const apuLamp = new LampButton(m, { text: 'APU\nREADY', color: '#4dff6a', w: 0.07, h: 0.035 });
    apuLamp.group.position.set(0.0, 0.085, 0);
    lp.add(apuLamp.group);
    this.lamps.apu = apuLamp;
    this.controls.push(apuLamp);
    const battLamp = new LampButton(m, { text: 'BATT\nON', color: '#ffb020', w: 0.07, h: 0.035 });
    battLamp.group.position.set(-0.12, 0.085, 0);
    lp.add(battLamp.group);
    this.lamps.batt = battLamp;
    this.controls.push(battLamp);
    const elecLabel = makeLabel('ELECTRICAL', 0.16, 0.025, { size: 34, h: 64, w: 512 });
    elecLabel.position.set(0.125, 0.095, 0.001);
    lp.add(elecLabel);
    // keypad on the right console
    const rp = sidePanel([0.86, -0.48, 0.1], [-0.5, 0.85, -0.12]);
    batch.add(rbox(0.26, 0.22, 0.03, 0.008, 0.3), m.panel, [0, 0, -0.016], [0, 0, 0], rp);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) batch.add(rbox(0.045, 0.034, 0.014, 0.004, 0.1), m.rubber, [-0.055 + c * 0.055, 0.06 - r * 0.042, 0.006], [0, 0, 0], rp);
  }

  /* ------------------------------------------------------- board computer */

  /** widescreen terminal on an arm off the right wall, above the keypad, turned to the pilot */
  buildComputer(droneTarget) {
    const { m, batch } = this;
    const c = new THREE.Vector3(0.88, -0.18, -0.12);
    const o = new THREE.Object3D();
    o.position.copy(c);
    o.lookAt(0, -0.02, 0);
    this.root.add(o);
    o.updateMatrixWorld(true);
    const w = 0.48;
    const h = 0.27;
    batch.add(rbox(w + 0.04, h + 0.05, 0.035, 0.014, 0.4), m.consoleMetal, [0, -0.008, -0.02], [0, 0, 0], o);
    batch.add(rbox(w - 0.02, 0.005, 0.008, 0.002, 0.2), m.led, [0, -h / 2 - 0.022, 0.0], [0, 0, 0], o);
    // the arm: a hub on the back and a strut into the wall
    batch.add(cyl(0.03, 0.03, 0.05, 12), m.steel, [0, 0, -0.06], [Math.PI / 2, 0, 0], o);
    const back = o.localToWorld(new THREE.Vector3(0, 0, -0.08));
    batch.add(tube([[back.x, back.y, back.z], [back.x + 0.06, back.y - 0.02, back.z + 0.02], [C.wallX - 0.02, back.y - 0.04, back.z + 0.06]], 0.016, 0.3), m.steel);
    batch.add(rbox(0.03, 0.14, 0.14, 0.008, 0.3), m.armorDark, [C.wallX - 0.02, back.y - 0.04, back.z + 0.06]);
    const label = makeLabel('BORDCOMPUTER · TASTE 7', 0.2, 0.022, { size: 30, h: 64, w: 640 });
    label.position.set(-w / 2 + 0.11, h / 2 + 0.008, 0.0);
    o.add(label);
    const mfd = new MFD(w, h, { feed: droneTarget, units: COMPUTER_UNITS, feedRect: pageFeedRect() });
    mfd.mesh.position.set(0, 0, 0.0);
    mfd.uniforms.useFeed.value = 0;
    o.add(mfd.mesh);
    this.mfd.computer = mfd;
  }

  /* ------------------------------------------------------------- wipers */

  /**
   * Grime on the outside of the front and the two side screens (mud from near hits, dust,
   * ash) and wipers that clear what their blades sweep: two parallel ones on the front,
   * one on each side screen, all on one switch. Pane coordinates: the screen's own frame,
   * x from the middle of the glass.
   */
  buildWipers() {
    const { m } = this;
    const gh = WIN.y1 - WIN.y0 - 0.01;
    const wy = (WIN.y0 + WIN.y1) / 2;
    const PY = WIN.y0 - 0.045;
    const [frontRect, leftRect, rightRect] = this.paneRects;
    const setups = [
      ['front', frontRect, [-0.31, 0.31], 0.16, 0.74],
      ['left', leftRect, [0], 0.08, 0.58],
      ['right', rightRect, [0], 0.08, 0.58],
    ];
    this.panes = {};
    const allArms = [];
    for (const [name, rect, pivots, R0, R1] of setups) {
      const { frame, x: cx, w: gw } = rect;
      frame.updateMatrixWorld(true);
      const cv = document.createElement('canvas');
      cv.width = Math.round((gw / gh) * 366);
      cv.height = 366;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), mat);
      plane.position.set(cx, wy, -0.044);
      plane.renderOrder = 4;
      frame.add(plane);
      // a coarse copy of how dirty each part is, for the logic (the canvas is only looks)
      const GX = Math.max(8, Math.round(gw * 26));
      const GY = 23;
      // what reaches past the screen's side edges is hidden behind the body: two clip
      // planes across the frame's x axis, in world space
      const o = new THREE.Vector3().setFromMatrixPosition(frame.matrixWorld);
      const ex = new THREE.Vector3(1, 0, 0).transformDirection(frame.matrixWorld);
      const half = gw / 2 + 0.012;
      const clip = [new THREE.Plane(ex.clone().negate(), ex.dot(o) + cx + half), new THREE.Plane(ex.clone(), -ex.dot(o) - (cx - half))];
      const armMat = m.blackPaint.clone();
      const bladeMat = m.rubber.clone();
      armMat.clippingPlanes = clip;
      bladeMat.clippingPlanes = clip;
      const arms = [];
      for (const [i, px] of pivots.entries()) {
        const pivot = new THREE.Object3D();
        pivot.position.set(cx + px, PY, -0.052 - i * 0.005);
        frame.add(pivot);
        const arm = new THREE.Mesh(rbox(R1 + 0.02, 0.016, 0.01, 0.004, 0.1), armMat);
        arm.position.set((R1 + 0.02) / 2 - 0.01, 0, -0.006);
        pivot.add(arm);
        const blade = new THREE.Mesh(rbox(R1 - R0, 0.026, 0.014, 0.005, 0.1), bladeMat);
        blade.position.set((R0 + R1) / 2, 0, 0.002);
        pivot.add(blade);
        const hub = new THREE.Mesh(cyl(0.018, 0.018, 0.02, 10), m.steel);
        hub.rotation.x = Math.PI / 2;
        hub.position.z = -0.006;
        pivot.add(hub);
        const a = { pivot, px, py: PY, pane: name };
        arms.push(a);
        allArms.push(a);
      }
      this.panes[name] = { name, cv, g: cv.getContext('2d'), tex, mat, gw, gh, wy, grid: new Float32Array(GX * GY), GX, GY, dirty: false, arms, R0, R1 };
    }
    this.grime = this.panes.front;
    this.wiper = { arms: allArms, A: Math.PI - 0.12, park: 0.03, t: 0, angle: 0.03, period: 1.7 };
    for (const a of allArms) a.pivot.rotation.z = this.wiper.park;
  }

  /** pane point (x from the middle of the glass, y in frame units) to canvas pixels */
  grimePx(G, x, y) {
    return [((x + G.gw / 2) / G.gw) * G.cv.width, ((G.wy + G.gh / 2 - y) / G.gh) * G.cv.height];
  }

  /** add to a pane's logic grid around a canvas point */
  grimeAdd(G, cx, cy, r, v) {
    const sx = G.cv.width / G.GX;
    const sy = G.cv.height / G.GY;
    for (let j = Math.max(0, Math.floor((cy - r) / sy)); j <= Math.min(G.GY - 1, Math.floor((cy + r) / sy)); j++)
      for (let i = Math.max(0, Math.floor((cx - r) / sx)); i <= Math.min(G.GX - 1, Math.floor((cx + r) / sx)); i++) G.grid[j * G.GX + i] = Math.min(1, G.grid[j * G.GX + i] + v);
  }

  /**
   * Mud from a near hit on one screen ('front', 'left', 'right'). amount 0..1; side -1..1
   * shifts it towards the left or right end of that screen (where the blast came from).
   */
  splatter(amount, side = 0, pane = 'front') {
    const G = this.panes[pane];
    if (!G) return;
    const g = G.g;
    const W0 = G.cv.width;
    const H0 = G.cv.height;
    const rnd = Math.random;
    const area = W0 / 512; // the narrow side screens take fewer splashes
    const n = Math.round((2 + amount * 9) * Math.max(0.45, area));
    for (let k = 0; k < n; k++) {
      const cx = Math.max(0, Math.min(W0, W0 * (0.5 + side * 0.25 + (rnd() - 0.5) * 1.1)));
      const cy = H0 * Math.pow(rnd(), 0.7); // more from below
      const R = 5 + rnd() * (8 + amount * 20);
      const c = `${Math.round(72 + rnd() * 26)},${Math.round(62 + rnd() * 20)},${Math.round(46 + rnd() * 14)}`;
      // a soft core of mud, slightly squashed
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      grd.addColorStop(0, `rgba(${c},0.78)`);
      grd.addColorStop(0.55, `rgba(${c},0.55)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(cx, cy, R, R * (0.65 + rnd() * 0.35), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
      // droplets thrown outwards, stretched along their flight
      const m = Math.round(6 + rnd() * (8 + amount * 18));
      for (let q = 0; q < m; q++) {
        const a = rnd() * Math.PI * 2;
        const d = R * (0.7 + rnd() * 2.4);
        const r = 0.6 + rnd() * R * 0.07;
        g.fillStyle = `rgba(${c},${0.35 + rnd() * 0.4})`;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (1.1 + rnd() * 0.8), r, a, 0, Math.PI * 2);
        g.fill();
      }
      // a run down the glass
      if (rnd() < 0.35) {
        g.fillStyle = `rgba(${c},0.32)`;
        g.fillRect(cx - R * 0.07, cy, R * 0.14, R * (1 + rnd() * 2.5));
      }
      this.grimeAdd(G, cx, cy, R * 1.6, 0.55);
    }
    // fine grit
    for (let k = 0; k < (30 + amount * 140) * area; k++) {
      g.fillStyle = `rgba(80,70,54,${0.3 + rnd() * 0.4})`;
      g.fillRect(rnd() * W0, rnd() * H0, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    G.dirty = true;
  }

  /** dust and ash settling evenly on every screen (amount per call, small) */
  dustGlass(amount) {
    for (const G of Object.values(this.panes)) {
      const g = G.g;
      g.fillStyle = `rgba(150,140,122,${Math.min(0.2, amount * 0.5)})`;
      g.fillRect(0, 0, G.cv.width, G.cv.height);
      g.fillStyle = 'rgba(96,88,74,0.35)';
      for (let k = 0; k < amount * 900 * (G.cv.width / 512); k++) g.fillRect(Math.random() * G.cv.width, Math.random() * G.cv.height, 1.5, 1.5);
      for (let i = 0; i < G.grid.length; i++) G.grid[i] = Math.min(1, G.grid[i] + amount * 0.5);
      G.dirty = true;
    }
  }

  /** rain: clear drops beading on every screen; they blur the view like dirt */
  rainGlass(amount) {
    for (const G of Object.values(this.panes)) {
      const g = G.g;
      const n = Math.round(amount * 600 * (G.cv.width / 512));
      for (let k = 0; k < n; k++) {
        const x = Math.random() * G.cv.width;
        const y = Math.random() * G.cv.height;
        const r = 1.5 + Math.random() * 3.5;
        const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        grd.addColorStop(0, 'rgba(225,232,240,0.38)');
        grd.addColorStop(0.7, 'rgba(120,135,150,0.24)');
        grd.addColorStop(1, 'rgba(60,70,80,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        this.grimeAdd(G, x, y, r, 0.04);
      }
      G.dirty = true;
    }
  }

  /** how dirty a screen is, 0..1 (the middle counts double: that is where one looks) */
  grimeLevel(pane = 'front') {
    const G = this.panes[pane];
    let s = 0;
    let n = 0;
    for (let j = 0; j < G.GY; j++)
      for (let i = 0; i < G.GX; i++) {
        const w = j > G.GY * 0.3 && j < G.GY * 0.85 && i > G.GX * 0.2 && i < G.GX * 0.8 ? 2 : 1;
        s += G.grid[j * G.GX + i] * w;
        n += w;
      }
    return s / n;
  }

  /** clear a pane's canvas and grid where a blade swept from angle a0 to a1 */
  wipeSector(arm, a0, a1) {
    const G = this.panes[arm.pane];
    const g = G.g;
    const { R0, R1 } = G;
    const lo = Math.min(a0, a1) - 0.01;
    const hi = Math.max(a0, a1) + 0.01;
    const pts = [];
    const steps = Math.max(2, Math.ceil((hi - lo) / 0.05));
    for (let k = 0; k <= steps; k++) {
      const a = lo + ((hi - lo) * k) / steps;
      pts.push(this.grimePx(G, arm.px + Math.cos(a) * R1, arm.py + Math.sin(a) * R1));
    }
    for (let k = steps; k >= 0; k--) {
      const a = lo + ((hi - lo) * k) / steps;
      pts.push(this.grimePx(G, arm.px + Math.cos(a) * R0, arm.py + Math.sin(a) * R0));
    }
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.restore();
    // the grid: cells whose centre lies in the swept ring sector
    for (let j = 0; j < G.GY; j++)
      for (let i = 0; i < G.GX; i++) {
        const x = ((i + 0.5) / G.GX) * G.gw - G.gw / 2 - arm.px;
        const y = G.wy + G.gh / 2 - ((j + 0.5) / G.GY) * G.gh - arm.py;
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        if (r >= R0 && r <= R1 && a >= lo && a <= hi) G.grid[j * G.GX + i] *= 0.1;
      }
    G.dirty = true;
  }

  /** run the wipers: on = switch on; returns true when a new stroke starts (for the sound) */
  updateWipers(dt, on) {
    const W = this.wiper;
    let stroke = false;
    if (on || W.t > 0) {
      if (W.t === 0) stroke = true;
      W.t += dt / W.period;
      if (W.t >= 1) {
        W.t = on ? W.t - 1 : 0;
        if (on) stroke = true;
      }
    }
    const prev = W.angle;
    W.angle = W.park + (W.A - W.park) * (1 - Math.cos(W.t * Math.PI * 2)) * 0.5;
    if (Math.abs(W.angle - prev) > 1e-4) {
      for (const a of W.arms) {
        a.pivot.rotation.z = W.angle;
        this.wipeSector(a, prev, W.angle);
      }
    }
    for (const G of Object.values(this.panes)) {
      if (G.dirty) {
        G.tex.needsUpdate = true;
        G.dirty = false;
      }
    }
    return stroke;
  }

  /* ------------------------------------------------------------ plumbing */

  buildPlumbing() {
    const { m, batch } = this;
    // ceiling light lines over the pilot
    for (const x of [-0.62, 0.62]) batch.add(rbox(0.01, 0.006, 1.5, 0.002, 0.2), m.led, [x, C.ceil - 0.098, 0.06]);
    // grab handles
    for (const sx of [-1, 1]) {
      batch.add(
        tube([[sx * (C.wallX - 0.06), 0.42, -0.4], [sx * (C.wallX - 0.13), 0.44, -0.3], [sx * (C.wallX - 0.13), 0.44, -0.05], [sx * (C.wallX - 0.06), 0.42, 0.05]], 0.012, 0.2),
        m.trim,
      );
    }
    // junction box on the right wall with breakers
    batch.add(rbox(0.06, 0.3, 0.36, 0.012, 0.4), m.armorDark, [C.wallX - 0.06, 0.25, 0.2]);
    for (let i = 0; i < 6; i++) batch.add(rbox(0.016, 0.03, 0.03, 0.003, 0.1), m.blackPaint, [C.wallX - 0.1, 0.3 - (i % 2) * 0.08, 0.08 + Math.floor(i / 2) * 0.1]);
  }

  /* --------------------------------------------------------------- props */

  buildProps() {
    const mdl = this.assets.models;
    const place = (name, opts, p, ry = 0) => {
      if (!mdl[name]) return null;
      const o = fitModel(mdl[name].clone(true), opts);
      o.position.set(...p);
      o.rotation.y = ry;
      this.root.add(o);
      return o;
    };
    // orientations were checked against renders of the Meshy models: their front faces +Z
    this.seat = place('seat', { height: 1.34 }, [0, C.floor, 0.24], Math.PI);
    this.throttleModel = place('throttle', { height: 0.24 }, [0, 0, 0], 0);
    this.stickModel = place('stick', { height: 0.3 }, [0, 0, 0], 0);
    place('extinguisher', { height: 0.5 }, [C.wallX - 0.11, -0.52, 0.66], -Math.PI / 2);

    // throttle and stick pivots so they can move with the inputs
    this.throttle = new THREE.Group();
    this.throttle.position.set(-0.7, -0.57, -0.12);
    this.root.add(this.throttle);
    if (this.throttleModel) {
      this.throttleModel.rotation.y = Math.PI;
      this.throttle.add(this.throttleModel);
    }
    this.stick = new THREE.Group();
    this.stick.position.set(0.7, -0.57, -0.1);
    this.root.add(this.stick);
    if (this.stickModel) {
      this.stickModel.rotation.y = Math.PI * 0.95;
      this.stick.add(this.stickModel);
    }
  }

  buildDecals() {
    const { m } = this;
    const asp = this.assets.decalAspect || {};
    const put = (name, w, p, r) => {
      const h = w / (asp[name] || 2);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.decal[name]);
      mesh.position.set(...p);
      mesh.rotation.set(...r);
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    put('nameplate', 0.26, [-C.wallX + 0.004, 0.32, 0.05], [0, Math.PI / 2, 0]);
    put('danger', 0.22, [C.wallX - 0.037, 0.56, 0.2], [0, -Math.PI / 2, 0]);
    put('radiation', 0.22, [0.62, 0.15, C.back - 0.004], [0, Math.PI, 0]);
    put('hydraulic', 0.2, [-C.wallX + 0.004, -0.32, -0.3], [0, Math.PI / 2, 0]);
    put('nostep', 0.16, [-0.72, -0.568, 0.32], [-Math.PI / 2, 0, 0]);
    put('eject', 0.14, [0, -0.73, -0.674], [-0.18, 0, 0]);
    
    // overhead panel labels
    const oh = new THREE.Object3D();
    oh.position.set(0, 0.6, -0.62);
    oh.rotation.set(0.78, 0, 0);
    this.root.add(oh);
    const rc = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16 / (asp.reactor || 2)), m.decal.reactor);
    rc.position.set(0.12, 0.12, 0.001);
    oh.add(rc);
    const wa = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12 / (asp.weapons || 2)), m.decal.weapons);
    wa.position.set(-0.41, 0.12, 0.001);
    oh.add(wa);
  }

  /* -------------------------------------------------------------- lights */

  buildLights() {
    // very low ambient so nothing is pitch black
    this.ambient = new THREE.HemisphereLight(0x8a8f96, 0x2a221a, 0.2);
    this.scene.add(this.ambient);

    // daylight through the open crew hatch (boarding)
    this.hatchLight = new THREE.SpotLight(0xd8dbe2, 0, 6, 0.8, 0.9, 1.2);
    this.hatchLight.position.set(0, 0.5, C.back + 1.8);
    this.hatchLight.target.position.set(0, -0.7, -0.4);
    this.hatchLight.castShadow = true;
    this.hatchLight.shadow.mapSize.set(1024, 1024);
    this.hatchLight.shadow.bias = -0.0005;
    this.hatchLight.shadow.normalBias = 0.02;
    this.hatchLight.visible = false;
    this.scene.add(this.hatchLight, this.hatchLight.target);

    // small flood lamps over the overhead panel and both side panels (main power + cabin light)
    // (placed so their hot spots do not mirror into the pilot's eye on the glossy parts)
    this.panelLights = [
      [0, 0.47, -0.36, 0.6],
      [-0.66, -0.25, 0.12, 0.75],
      [0.66, -0.25, 0.0, 0.75],
      [0, -0.27, -0.64, 0.75],
    ].map(([x, y, z, range]) => {
      const p = [x, y, z];
      const l = new THREE.PointLight(0xf6f3ec, 0, range, 1.6);
      l.position.set(...p);
      this.scene.add(l);
      return l;
    });

    // red emergency light (battery bus only)
    this.emergency = new THREE.PointLight(0xff2a14, 0, 2.6, 1.6);
    this.emergency.position.set(0.0, C.ceil - 0.12, -0.2);
    this.scene.add(this.emergency);

    // daylight through the visor: a soft shadow-casting spot outside the window
    this.windowLight = new THREE.SpotLight(0xd4d6de, 9, 7, 0.75, 1, 1.2);
    this.windowLight.position.set(0, 1.4, -3.0);
    this.windowLight.target.position.set(0, -0.9, 0.3);
    this.windowLight.castShadow = true;
    this.windowLight.shadow.mapSize.set(1024, 1024);
    this.windowLight.shadow.bias = -0.0004;
    this.windowLight.shadow.normalBias = 0.02;
    this.windowLight.shadow.radius = 4;
    this.windowLight.shadow.camera.near = 1.2;
    this.windowLight.shadow.camera.far = 6;
    this.scene.add(this.windowLight, this.windowLight.target);

    // soft fill from the whole window area
    this.windowFill = new THREE.RectAreaLight(0xc8ccd4, 1.6, 1.25, 0.9);
    this.windowFill.position.set(0, 0.1, -0.96);
    this.windowFill.lookAt(0, -0.3, 0);
    this.scene.add(this.windowFill);

    // warm dome light behind the pilot
    this.dome = new THREE.SpotLight(0xf2ecdf, 6, 3.2, 1.25, 0.85, 1.4);
    this.dome.position.set(0, C.ceil - 0.05, 0.45);
    this.dome.target.position.set(0, -0.8, -0.6);
    this.dome.castShadow = true;
    this.dome.shadow.mapSize.set(1024, 1024);
    this.dome.shadow.bias = -0.0005;
    this.dome.shadow.normalBias = 0.02;
    this.dome.shadow.radius = 3;
    this.scene.add(this.dome, this.dome.target);
    const domeLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffc070, emissiveIntensity: 2.5 }),
    );
    domeLamp.rotation.x = Math.PI;
    domeLamp.position.set(0, C.ceil - 0.005, 0.45);
    this.domeLampMat = domeLamp.material;
    this.root.add(domeLamp);

    // green spill of the displays onto the panel
    this.screenGlow = new THREE.PointLight(0x5dff7a, 0, 0.9, 2);
    this.screenGlow.position.set(0, -0.3, -0.55);
    this.scene.add(this.screenGlow);
    // red floor/footwell night lighting
    this.footLight = new THREE.PointLight(0xff3020, 0, 1.6, 2);
    this.footLight.position.set(0, -1.0, -0.55);
    this.scene.add(this.footLight);
  }

  /** dust motes hanging in the cabin air, catching the window and dome light */
  buildDust() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    this.dustVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2.0;
      pos[i * 3 + 1] = C.floor + 0.2 + Math.random() * 1.8;
      pos[i * 3 + 2] = -0.95 + Math.random() * 1.85;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    this.dustMat = new THREE.PointsMaterial({
      size: 0.0035,
      map: new THREE.CanvasTexture(c),
      color: 0xcfc6b4,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
  }

  /**
   * Tutorial highlight: a soft amber frame lying flat on the panel around the control
   * to use next (depth-tested, so it never floats in front of other parts).
   */
  buildMarker() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 320;
    const g = c.getContext('2d');
    const frame = (lw, alpha, blur) => {
      g.save();
      g.strokeStyle = `rgba(255,190,80,${alpha})`;
      g.lineWidth = lw;
      g.shadowColor = 'rgba(255,170,40,1)';
      g.shadowBlur = blur;
      const r = 26;
      const x0 = 22;
      const y0 = 22;
      const x1 = 256 - 22;
      const y1 = 320 - 22;
      g.beginPath();
      g.moveTo(x0 + r, y0);
      g.arcTo(x1, y0, x1, y1, r);
      g.arcTo(x1, y1, x0, y1, r);
      g.arcTo(x0, y1, x0, y0, r);
      g.arcTo(x0, y0, x1, y0, r);
      g.closePath();
      g.stroke();
      g.restore();
    };
    frame(10, 0.35, 24);
    frame(4, 1, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.markerMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(1.6, 1.3, 1.0),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.markerMat);
    this.marker.renderOrder = 12;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  /** ctl: a ToggleSwitch or LampButton (or null) */
  setMarker(ctl, cam, time) {
    if (!ctl) {
      this.marker.visible = false;
      return;
    }
    const grp = ctl.group;
    grp.updateMatrixWorld(true);
    const isSwitch = !!ctl.hit;
    // frame the switch and its label; a lamp button is framed as a whole
    const off = new THREE.Vector3(0, isSwitch ? -0.012 : 0, 0.012);
    this.marker.position.copy(off.applyMatrix4(grp.matrixWorld));
    grp.getWorldQuaternion(this.marker.quaternion);
    if (isSwitch) this.marker.scale.set(0.085, 0.105, 1);
    else this.marker.scale.set(0.15, 0.085, 1);
    this.markerMat.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(time * 4));
    this.marker.visible = true;
  }

  /** dog tags on a ball chain, hanging from the visor rail: they show every sway */
  buildTags() {
    const m = this.m;
    const L = 0.12;
    this.tags = new THREE.Group();
    this.tags.position.set(-0.43, 0.355, -0.8);
    const hook = new THREE.Mesh(rbox(0.016, 0.03, 0.016, 0.004, 0.05), m.steel);
    hook.position.y = 0.012;
    this.root.add(hook);
    hook.position.add(this.tags.position);
    // ball chain: tiny beads
    const bead = new THREE.SphereGeometry(0.0022, 6, 4);
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(bead, m.steel);
      b.position.y = -(i / 25) * L;
      this.tags.add(b);
    }
    this.tagPair = new THREE.Group();
    this.tagPair.position.y = -L;
    const tagMat = new THREE.MeshStandardMaterial({ color: 0x9a9890, metalness: 1, roughness: 0.35 });
    for (const [i, off] of [
      [0, -0.006],
      [1, 0.006],
    ]) {
      const tag = new THREE.Mesh(rbox(0.028, 0.05, 0.0016, 0.006, 0.05), tagMat);
      tag.position.set(off, -0.024 - i * 0.004, i * 0.002);
      tag.rotation.z = (i ? -1 : 1) * 0.08;
      tag.castShadow = true;
      this.tagPair.add(tag);
    }
    this.tags.add(this.tagPair);
    this.root.add(this.tags);
    this.tagSpin = 0;
  }

  setTags(t, dt) {
    if (!this.tags) return;
    this.tags.rotation.set(-t.az, 0, t.ax);
    // the pair twists a little on the chain
    this.tagSpin += (t.vx * 0.6 - this.tagSpin) * Math.min(1, dt * 2);
    this.tagPair.rotation.y = Math.sin(this.tagSpin) * 0.9;
  }

  /* -------------------------------------------------------------- damage */

  /** visor cracks, sparks and the glow of a cabin fire */
  buildDamage() {
    this.cracks = (this.paneRects || []).map((r) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe6edf0, alphaMap: this.assets.fx.crack, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(r.w, 0.75), r.h), mat);
      mesh.position.set(r.x, r.y, r.z);
      mesh.renderOrder = 6;
      mesh.visible = false;
      r.frame.add(mesh);
      return mesh;
    });
    const n = 120;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparkMat = new THREE.PointsMaterial({
      size: 0.012,
      map: this.dustMat.map,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPts = new THREE.Points(geo, this.sparkMat);
    this.sparkPts.frustumCulled = false;
    this.root.add(this.sparkPts);
    this.sparkList = [];
    this.fireLight = new THREE.PointLight(0xff6a20, 0, 2.2, 1.6);
    this.fireLight.position.set(0.3, -0.95, -0.35);
    this.scene.add(this.fireLight);
    this.muzzleLight = new THREE.PointLight(0xffb070, 0, 4, 1.4);
    this.muzzleLight.position.set(0.9, -0.3, -1.3);
    this.scene.add(this.muzzleLight);
    this.fireLevel = 0;
    this.flash = 0;
  }

  sparks(p, count = 30) {
    for (let i = 0; i < count; i++) {
      if (this.sparkList.length >= 120) this.sparkList.shift();
      this.sparkList.push({
        p: new THREE.Vector3(...p),
        v: new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 2.4),
        age: 0,
        life: 0.4 + Math.random() * 0.7,
      });
    }
  }

  /** a shell hits the mech: lights dip, sparks fly, the visor may crack */
  hit(strength, part) {
    this.jolt(1 + strength);
    if (this.main) this.power *= 0.3;
    const spots = [
      [-0.62, -0.28, -0.72],
      [0.62, -0.28, -0.72],
      [0, 0.52, -0.5],
      [-0.95, 0.15, -0.25],
      [0.95, 0.15, -0.25],
      [0.4, -0.75, -0.6],
    ];
    this.sparks(spots[Math.floor(Math.random() * spots.length)], 24 + Math.round(strength * 30));
    if (part === 'head' || Math.random() < 0.18) this.crack();
  }

  crack() {
    const c = this.cracks[Math.floor(Math.random() * this.cracks.length)];
    if (!c) return;
    if (!c.visible) {
      c.visible = true;
      c.rotation.z = Math.random() * Math.PI * 2;
      c.scale.setScalar(1 + Math.random() * 0.3);
    }
    c.material.opacity = Math.min(0.9, c.material.opacity + 0.45);
  }

  clearDamage() {
    for (const c of this.cracks) {
      c.visible = false;
      c.material.opacity = 0;
    }
    this.sparkList.length = 0;
    this.fireLevel = 0;
  }

  /** the own gun lights up the right side of the cabin */
  gunFlash() {
    this.flash = 1;
  }

  updateDamage(dt, time) {
    const pos = this.sparkPts.geometry.attributes.position;
    const col = this.sparkPts.geometry.attributes.color;
    let n = 0;
    for (let i = this.sparkList.length - 1; i >= 0; i--) {
      const s = this.sparkList[i];
      s.age += dt;
      if (s.age > s.life) {
        this.sparkList.splice(i, 1);
        continue;
      }
      s.v.y -= 6 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < C.floor + 0.02) {
        s.p.y = C.floor + 0.02;
        s.v.y *= -0.3;
      }
      const k = 1 - s.age / s.life;
      pos.setXYZ(n, s.p.x, s.p.y, s.p.z);
      col.setXYZ(n, 3 * k, 1.5 * k, 0.5 * k);
      n++;
    }
    this.sparkPts.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.fireLight.intensity = this.fireLevel * (2.5 + 1.2 * Math.sin(time * 17) * Math.sin(time * 7.3));
    this.flash = Math.max(0, this.flash - dt * 22);
    this.muzzleLight.intensity = this.flash * 8;
  }

  /** a footstep shakes dust loose */
  jolt(strength) {
    for (const k in this.mfd) this.mfd[k].uniforms.jolt.value = Math.max(this.mfd[k].uniforms.jolt.value, strength);
    this.flickerJolt = Math.max(this.flickerJolt ?? 0, strength);
    const v = this.dustVel;
    for (let i = 0; i < v.length; i += 3) {
      v[i] += (Math.random() - 0.5) * 0.08 * strength;
      v[i + 1] += (Math.random() - 0.3) * 0.12 * strength;
      v[i + 2] += (Math.random() - 0.5) * 0.08 * strength;
    }
  }

  updateDust(dt, time) {
    const p = this.dust.geometry.attributes.position;
    const v = this.dustVel;
    for (let i = 0; i < p.count; i++) {
      const k = i * 3;
      v[k] *= 1 - dt * 0.8;
      v[k + 1] = v[k + 1] * (1 - dt * 0.8) - dt * 0.002;
      v[k + 2] *= 1 - dt * 0.8;
      let x = p.getX(i) + (v[k] + Math.sin(time * 0.3 + i) * 0.004) * dt;
      let y = p.getY(i) + (v[k + 1] + Math.cos(time * 0.23 + i * 1.7) * 0.003) * dt;
      let z = p.getZ(i) + (v[k + 2] + Math.sin(time * 0.17 + i * 0.7) * 0.004) * dt;
      if (y < C.floor + 0.05) y = C.ceil - 0.1;
      if (y > C.ceil) y = C.floor + 0.1;
      x = Math.max(-1.0, Math.min(1.0, x));
      z = Math.max(-0.95, Math.min(0.9, z));
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    this.dustMat.opacity = 0.25 + 0.35 * (this.windowLight.intensity / 9);
  }

  /* -------------------------------------------------------------- update */

  /** state: mech/pilot state used to drive the instruments */
  /**
   * batt: battery bus alive, main: main bus alive, lights: cabin light switch.
   * The main bus fades in with a few flickers like a real bus coming online.
   */
  setElectrics(batt, main, lights) {
    this.batt = batt;
    this.main = main;
    this.lightsOn = lights;
  }

  update(dt, time, s, hovered) {
    const target = this.main ? 1 : 0;
    if (target > this.power) {
      this.power = Math.min(1, this.power + dt * 1.6);
      if (this.power < 0.8 && Math.random() < 0.25) this.power *= 0.4; // flicker while coming up
    } else this.power = Math.max(0, this.power - dt * 3);
    const p = this.power;
    const lampPower = Math.max(this.batt ? 0.7 : 0, p);
    for (const c of this.controls) c.update(dt, hovered === c, time, lampPower);
    for (const k in this.mfd) this.mfd[k].update(dt, time);
    this.updateDust(dt, time);
    this.updateDamage(dt, time);

    // lights follow the buses and switches
    this.flickerJolt = Math.max(0, (this.flickerJolt ?? 0) - dt * 5);
    for (const k in this.mfd) this.mfd[k].uniforms.jolt.value = Math.max(0, this.mfd[k].uniforms.jolt.value - dt * 4);
    const flicker =
      0.92 + 0.08 * Math.sin(time * 37) * Math.sin(time * 11.3) + (Math.random() < 0.004 ? -0.5 : 0) - (Math.random() < this.flickerJolt * 0.5 ? 0.35 * this.flickerJolt : 0);
    const domeOn = this.lightsOn ? 1 : 0;
    this.dome.intensity = 6 * p * domeOn * flicker;
    this.domeLampMat.emissiveIntensity = 2.5 * p * domeOn * flicker;
    const screens = Object.values(this.mfd).some((m) => m.on) ? 1 : 0;
    this.screenGlow.intensity = 0.35 * p * screens;
    this.footLight.intensity = (this.lightsOn ? 0.15 : 0.6) * p;
    const emergency = this.batt && p < 0.5 ? 1 : 0;
    this.emergencyLevel = (this.emergencyLevel ?? 0) + (emergency - (this.emergencyLevel ?? 0)) * Math.min(1, dt * 6);
    this.emergency.intensity = this.emergencyLevel * (1.3 + 0.1 * Math.sin(time * 3));
    const glow = Math.max(p, this.batt ? 0.25 : 0);
    for (const g of Object.values(this.gauges)) g.setLight(1.25 * glow + this.emergencyLevel * 0.05);
    for (const d of Object.values(this.segs)) d.update(p);
    // back-lit labels: bright on main power, dim on battery
    const back = Math.max(p * 0.75, this.batt ? 0.22 : 0);
    for (const mat of LABEL_MATERIALS) mat.emissiveIntensity = back * mat.userData.glow;
    for (const l of this.panelLights) l.intensity = (this.lightsOn ? 0.55 : 0.25) * p;
    const led = this.batt ? 0.35 + 0.65 * p : 0;
    this.m.led.color.setRGB(1.05 * led, 0.5 * led, 0.17 * led);

    // stick and throttle follow the controls
    if (this.throttle) this.throttle.rotation.x = -s.throttle * 0.45;
    if (this.stick) {
      this.stick.rotation.z = THREE.MathUtils.lerp(this.stick.rotation.z, -s.turnInput * 0.22, Math.min(1, dt * 10));
      this.stick.rotation.x = THREE.MathUtils.lerp(this.stick.rotation.x, -s.lookPitchRate * 0.02, Math.min(1, dt * 10));
    }
  }

  /** daylight through the window: brightness from the sky in front plus flashes */
  setDaylight(level, flash, flashColor) {
    this.windowLight.intensity = 9 * level + flash * 30;
    this.windowFill.intensity = 1.6 * level + flash * 6;
    this.windowLight.color.setRGB(0.83, 0.84, 0.87).lerp(flashColor, Math.min(1, flash));
    this.windowFill.color.copy(this.windowLight.color);
  }
}
