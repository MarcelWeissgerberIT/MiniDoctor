import * as THREE from 'three';
import { rng, rbox, StaticBatcher, projectUV } from '../geom.js';
import { Effects } from './effects.js';

/* ------------------------------------------------------------------ noise */

const R = rng(1337);
const PERM = new Uint8Array(512);
{
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y) {
  const a = (h & 7) * 0.785398;
  return Math.cos(a) * x + Math.sin(a) * y;
}
export function noise2(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  const a = PERM[X] + Y;
  const b = PERM[X + 1] + Y;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(grad(PERM[a], x, y), grad(PERM[b], x - 1, y), u),
    THREE.MathUtils.lerp(grad(PERM[a + 1], x, y - 1), grad(PERM[b + 1], x - 1, y - 1), u),
    v,
  );
}
const fbm = (x, y, o = 4) => {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < o; i++) {
    s += noise2(x, y) * a;
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s;
};

/* ------------------------------------------------------------------ world */

export const WORLD = { size: 2400, segments: 300, bounds: 820 };

export class World {
  constructor(assets) {
    this.assets = assets;
    this.m = assets.materials;
    this.scene = new THREE.Scene();
    const meta = assets.skyMeta;
    this.haze = new THREE.Color().setRGB(...meta.haze, THREE.SRGBColorSpace);
    this.skyTop = new THREE.Color().setRGB(...meta.top, THREE.SRGBColorSpace);
    this.scene.fog = new THREE.FogExp2(this.haze.clone(), 0.0017);
    this.scene.background = this.haze.clone();
    this.colliders = [];
    this.contacts = [];
    this.fires = [];
    this.craters = this.makeCraters();
    this.buildSky();
    this.buildTerrain();
    this.buildLights();
    this.buildProps();
    this.effects = new Effects(this, assets);
    for (const f of this.fires) this.effects.addFire(f);
  }

  /* ------------------------------------------------------------- terrain */

  makeCraters() {
    const r = rng(42);
    const list = [];
    for (let i = 0; i < 260; i++) {
      const d = 40 + Math.sqrt(r()) * 1000;
      const a = r() * Math.PI * 2;
      list.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 5 + r() * r() * 16, depth: 1 + r() * 2.5 });
    }
    // a few right in front of the start position so the ground reads as battlefield
    list.push({ x: 18, z: -70, r: 9, depth: 2.2 }, { x: -30, z: -120, r: 13, depth: 3 }, { x: 40, z: -160, r: 7, depth: 1.8 });
    return list;
  }

  heightAt(x, z) {
    const d = Math.hypot(x, z);
    let h = fbm(x * 0.0035, z * 0.0035) * 14 + fbm(x * 0.02 + 5, z * 0.02) * 1.6;
    h *= THREE.MathUtils.smoothstep(d, 20, 160) * 0.85 + 0.15;
    for (const c of this.craters) {
      const dx = x - c.x;
      const dz = z - c.z;
      const q = (dx * dx + dz * dz) / (c.r * c.r);
      if (q > 2.3) continue;
      if (q < 1) h -= c.depth * (1 - q) * (1 - q * 0.3);
      // raised rim
      h += c.depth * 0.35 * Math.exp(-((Math.sqrt(q) - 1.05) ** 2) * 18);
    }
    // sink the far edge a little so it hides under the haze
    h -= THREE.MathUtils.smoothstep(d, 900, 1200) * 6;
    return h;
  }

  scorchAt(x, z) {
    let s = 0;
    for (const c of this.craters) {
      const q = ((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r * 2.2);
      if (q < 1) s = Math.max(s, 1 - q);
    }
    return s;
  }

  buildTerrain() {
    const { size, segments } = WORLD;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      uv.setXY(i, x / 7, z / 7);
      const sc = this.scorchAt(x, z);
      const v = 1 - sc * 0.55 + (noise2(x * 0.05, z * 0.05) * 0.12);
      col[i * 3] = v;
      col[i * 3 + 1] = v * (1 - sc * 0.05);
      col[i * 3 + 2] = v * (1 - sc * 0.08);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = this.m.ground.clone();
    mat.vertexColors = true;
    mat.normalScale.set(1.6, 1.6);
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // break up the tiling: blend with a rotated, rescaled sample and add macro variation
        vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.63 + 0.37;
        vec4 alt = texture2D(map, ruv);
        float mask = smoothstep(0.35, 0.65, texture2D(map, vMapUv * 0.031 + 0.11).g);
        diffuseColor.rgb = mix(diffuseColor.rgb, alt.rgb, mask * 0.85);
        float macroA = texture2D(map, vMapUv * 0.047 + 0.17).g;
        float macroB = texture2D(map, vMapUv * 0.0083 + 0.41).r;
        diffuseColor.rgb *= mix(0.62, 1.3, macroA) * mix(0.75, 1.2, macroB);`,
      );
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // far apron so the horizon never shows an edge
    const far = new THREE.Mesh(new THREE.RingGeometry(1150, 7000, 64, 1), mat);
    far.rotation.x = -Math.PI / 2;
    far.position.y = -6.5;
    const fuv = far.geometry.attributes.uv;
    const fpos = far.geometry.attributes.position;
    const fcol = new Float32Array(fpos.count * 3).fill(0.85);
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 7, fpos.getY(i) / 7);
    far.geometry.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    this.scene.add(far);
  }

  /* ----------------------------------------------------------------- sky */

  buildSky() {
    const meta = this.assets.skyMeta;
    const Rr = 3000;
    const h = (Rr * 2 * Math.PI * meta.height) / meta.width;
    const below = h * (1 - meta.horizon);
    this.sky = new THREE.Group();
    this.skyUniforms = {
      top: { value: this.skyTop },
      flash: { value: 0 },
      flashDir: { value: new THREE.Vector3(1, 0, 0) },
      flashColor: { value: new THREE.Color(1.0, 0.62, 0.3) },
      exposure: { value: 1.0 },
    };
    const vert = `
      varying vec2 vUv; varying vec3 vDir;
      void main(){ vUv = uv; vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
    const frag = `
      uniform sampler2D map; uniform vec3 top; uniform float flash; uniform vec3 flashDir; uniform vec3 flashColor; uniform float exposure;
      varying vec2 vUv; varying vec3 vDir;
      void main(){
        vec3 c = texture2D(map, vec2(1.0 - vUv.x, vUv.y)).rgb;
        c = mix(c, top, smoothstep(0.88, 1.0, vUv.y));
        float f = pow(max(dot(normalize(vDir.xz), normalize(flashDir.xz)), 0.0), 10.0);
        c += flashColor * flash * f * (1.0 - smoothstep(0.35, 0.8, vUv.y)) * 1.2;
        gl_FragColor = vec4(c * exposure, 1.0);
      }`;
    for (let k = 0; k < 2; k++) {
      const geo = new THREE.CylinderGeometry(Rr, Rr, h, 96, 1, true, k * Math.PI, Math.PI);
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.skyUniforms, map: { value: this.assets.pano[k] } },
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = h / 2 - below;
      mesh.renderOrder = -10;
      mesh.frustumCulled = false;
      this.sky.add(mesh);
    }
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3400, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.skyTop, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.renderOrder = -11;
    dome.frustumCulled = false;
    this.sky.add(dome);
    this.scene.add(this.sky);
  }

  /** Image-based lighting from the battlefield panorama. */
  makeEnvironment(renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky = this.sky.clone(true);
    sky.position.set(0, 0, 0);
    envScene.add(sky);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2800, 32),
      new THREE.MeshBasicMaterial({ color: 0x241d17, side: THREE.DoubleSide }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -40;
    envScene.add(ground);
    const rt = pm.fromScene(envScene, 0.02, 1, 5000);
    pm.dispose();
    return rt.texture;
  }

  /* -------------------------------------------------------------- lights */

  buildLights() {
    this.hemi = new THREE.HemisphereLight(this.skyTop, 0x3a2e24, 1.3);
    this.scene.add(this.hemi);
    // diffuse sun behind the overcast, slightly warm from the fires
    this.sun = new THREE.DirectionalLight(0xffe2c4, 1.1);
    this.sun.position.set(-400, 600, -300);
    this.scene.add(this.sun);
    this.flashLight = new THREE.DirectionalLight(0xff9a50, 0);
    this.scene.add(this.flashLight, this.flashLight.target);
  }

  /* --------------------------------------------------------------- props */

  /**
   * Instanced copies of a Meshy model. Instances are grouped into clusters
   * (one InstancedMesh each) so whole clusters outside the view get culled.
   */
  instanced(name, perCluster = 24) {
    const src = this.assets.models[name];
    if (!src) return null;
    let mesh = null;
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (o.isMesh && !mesh) mesh = o;
    });
    // meshopt/quantised attributes are normalised ints: expand to float before baking the node transform
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(mesh.geometry.attributes)) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      geo.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    }
    geo.setIndex(mesh.geometry.index);
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const c = bb.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -bb.min.y, -c.z);
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3());
    const mat = mesh.material.clone();
    mat.envMapIntensity = 0.8;
    const clusters = new Map();
    const cluster = (key) => {
      if (!clusters.has(key)) {
        const im = new THREE.InstancedMesh(geo, mat, perCluster);
        im.castShadow = true;
        im.receiveShadow = true;
        im.count = 0;
        this.scene.add(im);
        clusters.set(key, im);
      }
      return clusters.get(key);
    };
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    return {
      size,
      add: (x, z, rotY, scale, sink = 0, tilt = 0, group = 0) => {
        const im = cluster(group);
        if (im.count >= perCluster) return;
        const y = this.heightAt(x, z) - sink * scale;
        q.setFromEuler(new THREE.Euler(tilt * (R() - 0.5), rotY, tilt * (R() - 0.5)));
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
        im.setMatrixAt(im.count++, m4);
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      },
    };
  }

  buildProps() {
    const r = rng(7);
    const free = (x, z, rad) =>
      Math.hypot(x, z) > 45 + rad && this.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + rad + 6);
    const spot = (minD, maxD, rad, tries = 40) => {
      for (let t = 0; t < tries; t++) {
        const d = minD + r() * (maxD - minD);
        const a = r() * Math.PI * 2;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (free(x, z, rad)) return [x, z];
      }
      return null;
    };

    // Meshy ruins
    const ruins = this.instanced('ruin', 1);
    if (ruins) {
      const fixed = [
        [-60, -210],
        [85, -300],
        [-150, -380],
      ];
      for (let i = 0; i < 22; i++) {
        const p = i < fixed.length ? fixed[i] : spot(140, 780, 18);
        if (!p) continue;
        const height = 26 + r() * 20;
        const s = height / ruins.size.y;
        ruins.add(p[0], p[1], r() * Math.PI * 2, s, 0.03, 0, i);
        const rad = Math.max(ruins.size.x, ruins.size.z) * s * 0.42;
        this.colliders.push({ x: p[0], z: p[1], r: rad });
        this.contacts.push({ x: p[0], z: p[1], type: 'struct' });
        if (r() < 0.3) this.fires.push({ x: p[0] + (r() - 0.5) * rad, z: p[1] + (r() - 0.5) * rad, scale: 5 + r() * 4, smoke: 1.2 });
      }
    }

    // burnt-out tanks
    const tanks = this.instanced('tank', 1);
    if (tanks) {
      const fixed = [
        [-22, -95],
        [34, -150],
      ];
      for (let i = 0; i < 11; i++) {
        const p = i < fixed.length ? fixed[i] : spot(70, 700, 8);
        if (!p) continue;
        const s = 10.2 / Math.max(tanks.size.x, tanks.size.z);
        tanks.add(p[0], p[1], r() * Math.PI * 2, s, 0.05, 0.12, i);
        this.colliders.push({ x: p[0], z: p[1], r: 4.8 });
        this.contacts.push({ x: p[0], z: p[1], type: 'struct' });
        if (i < 2 || r() < 0.45) this.fires.push({ x: p[0], z: p[1], scale: 3 + r() * 2.5, smoke: 1, y: 2.0 });
      }
    }

    // anti-tank hedgehog lines
    const hog = this.instanced('hedgehog', 16);
    if (hog) {
      const s = 1.9 / hog.size.y;
      const lines = [
        [-120, -60, 0.3, 14],
        [60, -240, -0.5, 16],
        [-260, -300, 1.2, 12],
        [200, 120, 0.8, 14],
        [-200, 220, -0.2, 14],
        [320, -420, 0.1, 12],
      ];
      for (const [li, [x0, z0, ang, n]] of lines.entries()) {
        for (let i = 0; i < n; i++) {
          const x = x0 + Math.cos(ang) * i * 7 + (r() - 0.5) * 2.5;
          const z = z0 + Math.sin(ang) * i * 7 + (r() - 0.5) * 2.5;
          if (Math.hypot(x, z) < 40) continue;
          hog.add(x, z, r() * Math.PI, s * (0.9 + r() * 0.2), 0.05, 0.2, li);
          this.colliders.push({ x, z, r: 1.4 });
        }
      }
    }

    this.buildConcreteRuins(r, spot);
    this.buildRubble(r);
    this.buildTrees(r);

    // simulated hostile radar contacts far away (no models yet: they hide in the haze)
    this.hostiles = [];
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      const d = 600 + r() * 300;
      this.hostiles.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, type: 'hostile', a, d, w: (r() - 0.5) * 0.02 });
    }
    this.contacts.push(...this.hostiles);
    for (const f of this.fires) this.contacts.push({ x: f.x, z: f.z, type: 'fire' });
  }

  /** Shells of concrete apartment blocks: walls with window holes and broken tops. */
  buildConcreteRuins(r, spot) {
    const b = new StaticBatcher(this.scene);
    const wallGeo = (w, h, floors) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      // broken top edge
      const n = 9;
      for (let i = n; i >= 0; i--) {
        const x = (w * i) / n;
        const y = h * (0.55 + 0.45 * r()) - (i === 0 || i === n ? 0 : r() * 3);
        shape.lineTo(x, Math.max(2.5, y));
      }
      shape.lineTo(0, 0);
      const fh = h / floors;
      for (let f = 0; f < floors; f++) {
        for (let k = 0; k < Math.floor(w / 4); k++) {
          if (r() < 0.25) continue;
          const x0 = 1 + k * 4;
          const y0 = f * fh + fh * 0.3;
          if (y0 + fh * 0.45 > h * 0.5) continue;
          const hole = new THREE.Path();
          hole.moveTo(x0, y0);
          hole.lineTo(x0 + 1.8, y0);
          hole.lineTo(x0 + 1.8, y0 + fh * 0.45);
          hole.lineTo(x0, y0 + fh * 0.45);
          hole.lineTo(x0, y0);
          shape.holes.push(hole);
        }
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
      g.translate(-w / 2, 0, 0);
      return projectUV(g, 3.2, r(), r());
    };
    for (let i = 0; i < 26; i++) {
      const p = spot(110, 800, 16);
      if (!p) continue;
      const [x, z] = p;
      const rot = r() * Math.PI * 2;
      const w = 14 + Math.floor(r() * 4) * 4;
      const h = 12 + r() * 16;
      const floors = Math.round(h / 3);
      const y = this.heightAt(x, z) - 0.5;
      const frame = new THREE.Object3D();
      frame.position.set(x, y, z);
      frame.rotation.y = rot;
      frame.updateMatrixWorld(true);
      b.add(wallGeo(w, h, floors), this.m.concrete, [0, 0, -w * 0.3], [0, 0, 0], frame);
      if (r() < 0.7) b.add(wallGeo(w * 0.6, h * 0.8, floors), this.m.concrete, [-w / 2, 0, 0], [0, Math.PI / 2, 0], frame);
      if (r() < 0.5) b.add(wallGeo(w * 0.5, h * 0.6, floors), this.m.concrete, [w / 2, 0, 0.2 * w], [0, -Math.PI / 2, 0], frame);
      // collapsed slab
      b.add(rbox(w * 0.7, 0.35, w * 0.4, 0.05, 3.2), this.m.concrete, [0, 1.5, 0], [0.35 * (r() - 0.5), 0, 0.3], frame);
      this.colliders.push({ x, z, r: w * 0.5 });
      this.contacts.push({ x, z, type: 'struct' });
      if (r() < 0.25) this.fires.push({ x, z, scale: 4 + r() * 3, smoke: 1 });
    }
    b.finalize();
  }

  buildRubble(r) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    projectUV(geo, 1.2);
    const rubbleMat = this.m.concrete.clone();
    rubbleMat.color.set(0x8f8a84);
    const im = new THREE.InstancedMesh(geo, rubbleMat, 700);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) {
      let x, z;
      if (i < 350) {
        const c = this.colliders[Math.floor(r() * this.colliders.length)];
        const a = r() * Math.PI * 2;
        const d = c.r * (0.8 + r() * 0.9);
        x = c.x + Math.cos(a) * d;
        z = c.z + Math.sin(a) * d;
      } else {
        const a = r() * Math.PI * 2;
        const d = 20 + r() * 500;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
      }
      const s = 0.2 + r() * r() * 1.6;
      m4.compose(
        new THREE.Vector3(x, this.heightAt(x, z) - s * 0.3, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
        new THREE.Vector3(s * (0.8 + r()), s * (0.4 + r() * 0.5), s * (0.8 + r())),
      );
      im.setMatrixAt(i, m4);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    this.scene.add(im);
  }

  buildTrees(r) {
    const geo = new THREE.CylinderGeometry(0.12, 0.3, 1, 7, 1);
    geo.translate(0, 0.5, 0);
    projectUV(geo, 1.0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.95, map: this.assets.tex.concrete.c });
    const im = new THREE.InstancedMesh(geo, mat, 60);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) {
      const a = r() * Math.PI * 2;
      const d = 60 + r() * 700;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = 3 + r() * 7;
      m4.compose(
        new THREE.Vector3(x, this.heightAt(x, z) - 0.3, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5)),
        new THREE.Vector3(1 + r(), h, 1 + r()),
      );
      im.setMatrixAt(i, m4);
    }
    this.scene.add(im);
  }

  /* -------------------------------------------------------------- update */

  update(dt, time, camPos) {
    this.sky.position.set(camPos.x, camPos.y, camPos.z);
    // hostiles drift around on the radar
    for (const h of this.hostiles) {
      h.a += h.w * dt;
      h.x = Math.cos(h.a) * h.d;
      h.z = Math.sin(h.a) * h.d;
    }
    this.effects.update(dt, time, camPos);
  }
}
