import * as THREE from 'three';

// What the hangar fits shows on the mech: paint and camouflage (a shader on the model's own
// texture), callsign and emblem, and the parts hung on the rig's bones: lamps, missile box,
// gun barrels, kit. Shared by the hangar, the parked mech in the base, and the outside view.

const PAINT_HEAD = /* glsl */ `
uniform vec3 paintBase;
uniform vec3 paintC1;
uniform vec3 paintC2;
uniform float paintCamo;
uniform float paintFreq;
varying vec3 vPaintPos;
float pHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pHash(i), pHash(i + vec3(1,0,0)), f.x), mix(pHash(i + vec3(0,1,0)), pHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pHash(i + vec3(0,0,1)), pHash(i + vec3(1,0,1)), f.x), mix(pHash(i + vec3(0,1,1)), pHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

/** a repainted copy of a model material; change the colours later through userData.paint */
export function paintMaterial(src, freq = 1) {
  const m = src.clone();
  m.color = new THREE.Color(1, 1, 1);
  const u = {
    paintBase: { value: new THREE.Color(0.62, 0.64, 0.66) },
    paintC1: { value: new THREE.Color(0.4, 0.42, 0.44) },
    paintC2: { value: new THREE.Color(0.16, 0.17, 0.18) },
    paintCamo: { value: 0 },
    paintFreq: { value: freq },
  };
  m.userData.paint = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  vPaintPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${PAINT_HEAD}`).replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      // the factory texture keeps its dirt and panel lines; the colour comes from the paint
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 paint = paintBase;
      if (paintCamo > 0.5) {
        vec3 q = vPaintPos * paintFreq;
        float n = pNoise(q) * 0.6 + pNoise(q * 2.3 + 7.1) * 0.3 + pNoise(q * 5.1 + 3.3) * 0.1;
        paint = n > 0.58 ? paintC2 : n > 0.44 ? paintC1 : paintBase;
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, clamp(vec3(lum) * paint * 2.1, 0.0, 1.0), 0.88);`,
    );
  };
  m.customProgramCacheKey = () => 'battlebot-paint';
  return m;
}

export function setPaint(mat, paint) {
  const u = mat.userData.paint;
  if (!u) return;
  u.paintBase.value.setRGB(...paint.base, THREE.SRGBColorSpace);
  if (paint.camo) {
    u.paintC1.value.setRGB(...paint.camo[0], THREE.SRGBColorSpace);
    u.paintC2.value.setRGB(...paint.camo[1], THREE.SRGBColorSpace);
  }
  u.paintCamo.value = paint.camo ? 1 : 0;
}

/* ------------------------------------------------------------- emblems */

/** emblem and callsign painted on a canvas (white/yellow stencil look) */
export function drawEmblem(g, shape, s = 256) {
  g.clearRect(0, 0, s, s);
  g.save();
  g.translate(s / 2, s / 2);
  g.fillStyle = shape === 'bolt' ? '#ffd23a' : '#efe9dc';
  g.strokeStyle = g.fillStyle;
  g.lineJoin = 'round';
  const k = s / 256;
  g.scale(k, k);
  if (shape === 'star') {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 44 : 110;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (shape === 'bolt') {
    g.beginPath();
    [[30, -118], [-62, 12], [-6, 12], [-36, 118], [66, -22], [10, -22], [44, -118]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  } else if (shape === 'skull') {
    g.beginPath();
    g.ellipse(0, -18, 78, 74, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-46, 30, 92, 50);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(-30, -16, 22, 26, 0, 0, Math.PI * 2);
    g.ellipse(30, -16, 22, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(0, 14);
    g.lineTo(-12, 34);
    g.lineTo(12, 34);
    g.fill();
    for (const x of [-30, -10, 10, 30]) g.fillRect(x - 4, 52, 8, 30);
  } else if (shape === 'chevron') {
    g.lineWidth = 26;
    for (const y of [-70, -10, 50]) {
      g.beginPath();
      g.moveTo(-90, y);
      g.lineTo(0, y + 54);
      g.lineTo(90, y);
      g.stroke();
    }
  } else if (shape === 'wolf') {
    // a stylised wolf head: ears, brow, muzzle
    g.beginPath();
    [[-86, -110], [-40, -46], [40, -46], [86, -110], [96, -10], [56, 40], [22, 112], [-22, 112], [-56, 40], [-96, -10]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    [[-58, -2], [-18, 6], [-30, 22]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.beginPath();
    [[58, -2], [18, 6], [30, 22]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }
  g.restore();
}

function stencilTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------------------------------------------------- attachments */

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * A mech model with paint, markings and fitted parts. body: the fitted (skinned) model,
 * as returned by fitModel. Call apply(effects) whenever the loadout changes.
 */
export class Livery {
  constructor(body) {
    this.body = body;
    this.mats = [];
    this.bones = {};
    body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.geometry.computeBoundingBox();
        const h = o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y || 1;
        o.material = paintMaterial(o.material, (h / 5) * 1.1); // ~0.9 m camouflage patches
        this.mats.push(o.material);
      }
    });
    this.parts = new THREE.Group();
    this.lamps = [];
    this.spots = [];
    this.metal = new THREE.MeshStandardMaterial({ color: 0x3c4044, metalness: 0.75, roughness: 0.42 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, metalness: 0.5, roughness: 0.6 });
    this.attached = [];
  }

  /** world position of a bone in the bind pose */
  bonePos(name, out = new THREE.Vector3()) {
    const b = this.bones[name];
    if (!b) return out.set(0, 0, 0);
    b.updateWorldMatrix(true, false);
    return b.getWorldPosition(out);
  }

  /**
   * hang an object on a bone: placed at a point given in the mech's own frame
   * (metres, x right, y up, z back) and turned like the mech, then kept on the bone
   */
  attach(boneName, obj, pos, rot = [0, 0, 0]) {
    const bone = this.bones[boneName];
    const root = this.body;
    root.updateWorldMatrix(true, true);
    // the mech frame: the fitted model's parent (holder) gives the world placement
    const holder = root.parent || root;
    const world = new THREE.Vector3(...pos);
    holder.localToWorld(world);
    obj.position.copy(world);
    obj.quaternion.setFromEuler(new THREE.Euler(...rot)).premultiply(holder.getWorldQuaternion(_q));
    if (bone) {
      bone.updateWorldMatrix(true, false);
      bone.attach(obj); // keeps the world placement, follows the bone from now on
    } else holder.attach(obj);
    this.attached.push(obj);
    return obj;
  }

  clearParts() {
    for (const o of this.attached) o.removeFromParent();
    this.attached = [];
    this.lamps = [];
    this.spots = [];
  }

  /** e: loadout effects (see logic/loadout.js); spots: real spotlights for the lamps */
  apply(e, { spots = false } = {}) {
    for (const m of this.mats) setPaint(m, e.paint);
    this.clearParts();
    const P = this.anchor || (this.anchor = this.measure());
    const F = P.fwd; // +1: the model looks along +z of its holder
    const face = [0, F > 0 ? Math.PI : 0, 0]; // turns a part's -z (its front) to the mech's front
    const cyl = (r0, r1, len, mat, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2), mat);
    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    // --- main gun: the arm carries the 30 mm; the others are fitted over its muzzle
    const look = e.gun.look || {};
    this.gatling = null;
    if (e.gun.id !== 'ac30') {
      const gun = new THREE.Group();
      if (look.gatling) {
        const spin = new THREE.Group();
        for (let i = 0; i < 6; i++) {
          const b = cyl(0.03, 0.03, 0.9, this.metal, 8);
          const a = (i / 6) * Math.PI * 2;
          b.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075, -0.45);
          spin.add(b);
        }
        spin.add(cyl(0.125, 0.125, 0.06, this.dark).translateZ(-0.12));
        spin.add(cyl(0.125, 0.125, 0.06, this.dark).translateZ(-0.86));
        gun.add(spin, cyl(0.15, 0.15, 0.3, this.dark).translateZ(0.12));
        this.gatling = spin;
      } else if (look.rail) {
        const coilMat = new THREE.MeshStandardMaterial({ color: 0x0c2a33, metalness: 0.6, roughness: 0.4, emissive: new THREE.Color(0.05, 0.55, 0.85), emissiveIntensity: 0.8 });
        for (const s of [-1, 1]) {
          const r = box(0.05, 0.13, 1.5, this.metal);
          r.position.set(s * 0.1, 0, -0.45);
          gun.add(r);
        }
        for (let i = 0; i < 5; i++) gun.add(box(0.26, 0.2, 0.05, coilMat).translateZ(0.15 - i * 0.28));
      } else {
        // 40 mm: a heavy jacket and a big muzzle brake
        gun.add(cyl(0.12, 0.12, 0.55, this.dark).translateZ(0.1));
        gun.add(cyl(0.085, 0.085, 0.5, this.metal).translateZ(-0.38));
        const brake = cyl(0.15, 0.14, 0.26, this.metal);
        brake.position.z = -0.7;
        gun.add(brake);
        for (const s of [-1, 1]) gun.add(box(0.06, 0.08, 0.12, this.dark).translateX(s * 0.15).translateZ(-0.7));
      }
      this.attach('RightHand', gun, P.muzzle, face);
    }
    // --- secondary weapon on top of the gun arm
    const sec = new THREE.Group();
    if (e.mg.flamer) {
      sec.add(cyl(0.05, 0.065, 0.55, this.metal).translateZ(-0.28));
      sec.add(box(0.16, 0.16, 0.34, this.dark).translateZ(0.08));
      const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3) }));
      pilot.position.z = -0.58;
      sec.add(pilot);
      this.pilotFlame = pilot;
    } else {
      const r = e.mg.id === 'hmg127' ? 0.04 : 0.024;
      sec.add(cyl(r, r, e.mg.id === 'hmg127' ? 0.95 : 0.7, this.metal, 8).translateZ(-0.4));
      sec.add(box(0.12, 0.12, 0.26, this.dark));
      if (e.mg.id === 'hmg127') sec.add(cyl(r * 1.8, r * 1.8, 0.12, this.dark, 8).translateZ(-0.86));
    }
    this.attach('RightHand', sec, P.mg, face);
    // --- missiles: the launcher on the left arm gets the face of the fitted system
    const ms = e.missile.id;
    const pod = new THREE.Group();
    const W = P.podW;
    const H = P.podH;
    pod.add(box(W, H, 0.05, this.metal));
    if (ms === 'none') {
      for (const y of [-0.3, 0, 0.3]) pod.add(box(W * 0.9, 0.03, 0.03, this.dark).translateY(y * H).translateZ(-0.03));
    } else {
      const [cols, rows] = ms === 'rw24' ? [6, 4] : ms === 'sl6' ? [3, 2] : [4, 3];
      const r = Math.min(W / cols, H / rows) * (ms === 'sl6' ? 0.36 : 0.32);
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const t = cyl(r, r, 0.07, this.dark, 12);
          t.position.set((i - (cols - 1) / 2) * (W / cols), (j - (rows - 1) / 2) * (H / rows), -0.03);
          pod.add(t);
          const tip = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 10), ms === 'sl6' ? this.warhead ?? (this.warhead = new THREE.MeshStandardMaterial({ color: 0x7a1d14, roughness: 0.5 })) : this.dark);
          tip.position.set(t.position.x, t.position.y, -0.068);
          tip.rotation.y = Math.PI;
          pod.add(tip);
        }
    }
    this.attach('LeftHand', pod, P.pod, face);
    // --- lamps either side of the visor
    const L = e.lights;
    if (L.id && L.id !== 'none') {
      for (const s of [-1, 1]) {
        const lamp = new THREE.Group();
        lamp.add(cyl(0.085, 0.07, 0.14, this.dark));
        const lensMat = new THREE.MeshBasicMaterial({ color: L.visible === false ? new THREE.Color(0.25, 0.05, 0.05) : new THREE.Color(...L.color) });
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), lensMat);
        lens.position.z = -0.071;
        lens.rotation.y = Math.PI;
        lamp.add(lens);
        if (L.id === 'led') {
          lamp.scale.set(1.5, 0.8, 1);
        }
        this.attach('Spine02', lamp, [P.lamp[0] * s, P.lamp[1], P.lamp[2]], face);
        this.lamps.push({ lamp, lensMat, side: s });
        if (spots && L.visible !== false) {
          const sp = new THREE.SpotLight(new THREE.Color(...L.color), 0, L.range * 1.4, L.angle, 0.45, 1.2);
          sp.userData.full = L.intensity;
          sp.position.set(0, 0, -0.1);
          const tgt = new THREE.Object3D();
          tgt.position.set(0, -1.2, -10);
          lamp.add(sp, tgt);
          sp.target = tgt;
          this.spots.push(sp);
        }
      }
    }
    // --- kit on the torso
    if (e.smoke) {
      for (const s of [-1, 1]) {
        const rack = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const t = cyl(0.05, 0.05, 0.24, this.dark, 8);
          t.position.set((i - 1) * 0.12, 0, 0);
          t.rotation.x = 0.7;
          rack.add(t);
        }
        this.attach('Spine02', rack, [P.smoke[0] * s, P.smoke[1], P.smoke[2]], face);
      }
    }
    if (e.ecm < 1) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.dark);
      const mast = cyl(0.012, 0.012, 0.6, this.metal, 6);
      mast.rotation.x = 0;
      mast.geometry.rotateX(-Math.PI / 2);
      mast.position.y = 0.4;
      dome.add(mast);
      this.attach('Spine02', dome, P.back, face);
    }
    if (e.front < 1) {
      for (const s of [-1, 1]) this.attach('Spine02', box(0.46, 0.4, 0.06, this.metal), [P.plate[0] * s, P.plate[1], P.plate[2]], [-0.2 * F, face[1] + s * 0.18, 0]);
    }
    if (e.droneFlight > 1) this.attach('Spine02', box(0.42, 0.24, 0.26, this.dark), [P.back[0] + 0.4, P.back[1] - 0.1, P.back[2]], face);
    // --- callsign on both flanks, emblem on the launcher arm
    const cs = stencilTexture((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = `bold ${h * 0.72}px 'Barlow Condensed', 'DejaVu Sans', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#efe9dc';
      g.fillText(e.callsign || '', w / 2, h / 2 + 4);
    }, 512, 128);
    const csMat = new THREE.MeshStandardMaterial({ map: cs, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), csMat);
      this.attach('Spine02', label, [P.flank * s, P.callsignY, P.callsignZ], [0, (s * Math.PI) / 2, 0]);
    }
    if (e.emblem) {
      const em = stencilTexture((g, w) => drawEmblem(g, e.emblem, w));
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: em, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      this.attach('LeftHand', plane, P.emblem, [0, Math.PI / 2, 0]);
    }
  }

  /**
   * where the parts go, in the holder's frame, found on the model itself: rays from the
   * front, the sides and above hit the hull where a part should sit
   */
  measure() {
    const holder = this.body.parent || this.body;
    holder.updateWorldMatrix(true, true);
    const local = (name) => holder.worldToLocal(this.bonePos(name, new THREE.Vector3()));
    const head = local('Head');
    const hf = local('headfront');
    const fwd = hf.z >= head.z ? 1 : -1;
    const meshes = [];
    this.body.traverse((o) => o.isMesh && meshes.push(o));
    const ray = new THREE.Raycaster();
    // first hull point from a direction (holder frame), or null
    const hit = (from, dir) => {
      const o = holder.localToWorld(new THREE.Vector3(...from));
      const d = new THREE.Vector3(...dir).transformDirection(holder.matrixWorld);
      ray.set(o, d);
      const h = ray.intersectObjects(meshes, false)[0];
      return h ? holder.worldToLocal(h.point.clone()) : null;
    };
    const front = (x, y) => hit([x, y, fwd * 8], [0, 0, -fwd]);
    const hand = local('RightHand');
    const lh = local('LeftHand');
    const chest = local('Spine02');
    // the 30 mm muzzle: the furthest hull point in front of the right hand
    let muzzle = null;
    for (const dy of [0, 0.08, -0.08, 0.16, -0.16])
      for (const dx of [0, 0.08, -0.08]) {
        const p = front(hand.x + dx, hand.y + dy);
        if (p && (!muzzle || p.z * fwd > muzzle.z * fwd) && Math.abs(p.z - hand.z) < 3) muzzle = p;
      }
    muzzle ??= new THREE.Vector3(hand.x, hand.y, hand.z + fwd * 1.2);
    // the launcher face on the left arm: the frontmost flat patch around the hand
    const pts = [];
    for (let i = -10; i <= 10; i++)
      for (let j = -10; j <= 10; j++) {
        const p = front(lh.x + i * 0.07, lh.y + j * 0.07);
        if (p && Math.abs(p.z - lh.z) < 2.5) pts.push(p);
      }
    const most = pts.reduce((m, p) => Math.max(m, p.z * fwd), -1e9);
    const facePts = pts.filter((p) => p.z * fwd > most - 0.1);
    const fx = facePts.map((p) => p.x);
    const fy = facePts.map((p) => p.y);
    const podW = facePts.length ? Math.max(...fx) - Math.min(...fx) + 0.07 : 0.7;
    const podH = facePts.length ? Math.max(...fy) - Math.min(...fy) + 0.07 : 0.5;
    const podC = facePts.length ? new THREE.Vector3((Math.max(...fx) + Math.min(...fx)) / 2, (Math.max(...fy) + Math.min(...fy)) / 2, most * fwd) : new THREE.Vector3(lh.x, lh.y, lh.z + fwd * 0.8);
    // the visor: lamps sit either side of it on the chest
    const lampY = chest.y + 0.45;
    const lampP = front(0.5, lampY) ?? new THREE.Vector3(0.5, lampY, chest.z + fwd * 0.8);
    const plateP = front(0.32, chest.y - 0.2) ?? new THREE.Vector3(0.32, chest.y - 0.2, chest.z + fwd * 0.8);
    // flanks for the callsign, the top for the kit
    const side = hit([4, chest.y + 0.2, chest.z], [-1, 0, 0]);
    const top = hit([0.55, 8, chest.z], [0, -1, 0]);
    const backTop = hit([0, 8, chest.z - fwd * 0.5], [0, -1, 0]);
    const lhSide = hit([lh.x + 3, lh.y, lh.z + fwd * 0.2], [-1, 0, 0]);
    return {
      fwd,
      muzzle: [muzzle.x, muzzle.y, muzzle.z + fwd * 0.02],
      mg: [hand.x + 0.05, hand.y + 0.3, hand.z + fwd * 0.4],
      pod: [podC.x, podC.y, podC.z + fwd * 0.03],
      podW,
      podH,
      lamp: [lampP.x, lampP.y, lampP.z + fwd * 0.05],
      plate: [plateP.x, plateP.y, plateP.z + fwd * 0.05],
      smoke: [top ? top.x : 0.55, (top ? top.y : chest.y + 0.8) + 0.08, chest.z - fwd * 0.1],
      back: [0, (backTop ? backTop.y : chest.y + 0.9) + 0.02, chest.z - fwd * 0.5],
      flank: (side ? side.x : 1) + 0.02,
      callsignY: chest.y + 0.2,
      callsignZ: chest.z,
      emblem: [(lhSide ? lhSide.x : lh.x + 0.4) + 0.02, lh.y, lh.z + fwd * 0.2],
    };
  }

  /** per frame in the game: lamp switch, gatling spin */
  update(dt, { lightsOn = false, firing = false } = {}) {
    for (const sp of this.spots) sp.intensity = lightsOn ? sp.userData.full ?? 0 : 0;
    for (const l of this.lamps) l.lensMat.color.multiplyScalar(1);
    if (this.gatling) this.gatling.rotation.z += dt * (firing ? 40 : 0);
  }
}
