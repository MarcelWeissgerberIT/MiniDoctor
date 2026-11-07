import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Box-projects UVs from the geometry's local position, picking the plane by the
 * dominant normal axis. `scale` is the size in metres one texture repeat covers,
 * so every surface gets the same texel density and vertical faces keep the
 * rust streaks running downwards.
 */
export function projectUV(geo, scale = 1, ox = 0, oy = 0) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) {
      u = z * Math.sign(nor.getX(i) || 1);
      v = y;
    } else if (ny >= nz) {
      u = x;
      v = z;
    } else {
      u = -x * Math.sign(nor.getZ(i) || 1);
      v = y;
    }
    uv[i * 2] = u / scale + ox;
    uv[i * 2 + 1] = v / scale + oy;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function rbox(w, h, d, r = 0.012, scale = 0.8, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
  return projectUV(g, scale, Math.random(), Math.random());
}

export function cyl(rt, rb, h, seg = 16, scale = 0.5, open = false) {
  return projectUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), scale, Math.random(), Math.random());
}

/** Rounded rectangle path (used for window openings and bezels). */
export function roundRectPath(path, x0, y0, x1, y1, r) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

/** Flat plate with holes, extruded towards +Z by `depth`, with a small bevel. */
export function plateWithHoles(outer, holes, depth, scale = 0.8, bevel = 0.008) {
  const shape = new THREE.Shape();
  roundRectPath(shape, outer[0], outer[1], outer[2], outer[3], outer[4] ?? 0.02);
  for (const h of holes) shape.holes.push(roundRectPath(new THREE.Path(), h[0], h[1], h[2], h[3], h[4] ?? 0.03));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.computeVertexNormals();
  return projectUV(g, scale, Math.random(), Math.random());
}

/** Tube along points, for hydraulic lines and cable looms. */
export function tube(points, radius, scale = 0.3, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, radial, false);
  // UV: u along the tube, v around
  const uv = g.attributes.uv;
  const len = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / scale, (uv.getY(i) * radius * 6.28) / scale);
  return g;
}

/**
 * Collects static meshes and merges them per material at the end, so the whole
 * cockpit shell costs one draw call per material.
 */
export class StaticBatcher {
  constructor(root) {
    this.root = root;
    this.byMat = new Map();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  /** frame: an Object3D (with up-to-date matrixWorld) the local transform is relative to */
  add(geo, mat, p = [0, 0, 0], r = [0, 0, 0], frame = null, s = 1) {
    this._e.set(r[0], r[1], r[2]);
    this._q.setFromEuler(this._e);
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    this._m.compose(new THREE.Vector3(...p), this._q, sc);
    if (frame) {
      frame.updateMatrixWorld(true);
      this._m.premultiply(frame.matrixWorld);
    }
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(this._m);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
  }

  finalize({ cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, list] of this.byMat) {
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      meshes.push(mesh);
      list.forEach((g) => g.dispose());
    }
    this.byMat.clear();
    return meshes;
  }
}

/** Seeded RNG so the battlefield looks the same every time. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalises a loaded model: centred on X/Z, standing on y = 0, scaled to a size. */
export function fitModel(obj, { height, width, length, rotY = 0 } = {}) {
  obj.rotation.y = rotY;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (height) s = height / size.y;
  else if (width) s = width / size.x;
  else if (length) s = length / size.z;
  const wrap = new THREE.Group();
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.y -= box.min.y;
  obj.position.z -= c.z;
  wrap.add(obj);
  wrap.scale.setScalar(s);
  return wrap;
}
