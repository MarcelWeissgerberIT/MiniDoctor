import * as THREE from 'three';
import { GUN } from '../logic/combat.js';

// the right arm cannon, seen from the cockpit in the lower right of the canopy
// (pivot relative to the pilot's eye in the mech body frame, -Z forward)
const PIVOT = new THREE.Vector3(1.5, -0.5, -0.9);
const BARREL = 2.0;
const SERVO = 2.6; // rad/s the arm can swing

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Visible weapon arm: 30 mm barrel with cooling jacket and muzzle brake, a coaxial MG,
 * both following the helmet within their traverse, recoiling on every shot and
 * glowing with heat. Spent cases fly out of the ejection port and bounce on the ground.
 */
export class GunRig {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.root = new THREE.Group();
    this.yawNode = new THREE.Group();
    this.pitchNode = new THREE.Group();
    this.slide = new THREE.Group(); // recoils
    this.mgSlide = new THREE.Group();
    this.root.add(this.yawNode);
    this.yawNode.add(this.pitchNode);
    this.pitchNode.add(this.slide, this.mgSlide);
    this.world.scene.add(this.root);

    const metal = new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.8, roughness: 0.4, envMapIntensity: 0.9 });
    this.barrelMat = new THREE.MeshStandardMaterial({ color: 0x3c4043, metalness: 0.85, roughness: 0.33, emissive: 0x000000 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f21, metalness: 0.6, roughness: 0.55 });
    const cyl = (r0, r1, len, mat, z, y = 0, x = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 18).rotateX(Math.PI / 2), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };
    // housing on the arm (mostly hidden below the canopy)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.9), metal);
    housing.position.set(0, 0, 0.1);
    this.pitchNode.add(housing);
    const feed = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.5), dark);
    feed.position.set(-0.26, 0.04, 0.25);
    this.pitchNode.add(feed);
    // barrel group
    this.slide.add(cyl(0.075, 0.075, BARREL, this.barrelMat, -BARREL / 2 - 0.3));
    this.slide.add(cyl(0.11, 0.11, 0.75, dark, -0.75));
    for (let i = 0; i < 6; i++) this.slide.add(cyl(0.118, 0.118, 0.03, metal, -0.45 - i * 0.12));
    this.slide.add(cyl(0.12, 0.11, 0.24, metal, -BARREL - 0.22));
    for (const s of [-1, 1]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), dark);
      slot.position.set(s * 0.11, 0, -BARREL - 0.2);
      this.slide.add(slot);
    }
    // coaxial MG above the cannon
    this.mgSlide.add(cyl(0.024, 0.024, 1.2, metal, -0.85, 0.22, -0.05));
    this.mgSlide.add(cyl(0.04, 0.04, 0.12, dark, -1.45, 0.22, -0.05));
    const mgBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), metal);
    mgBody.position.set(-0.05, 0.22, -0.05);
    this.mgSlide.add(mgBody);

    // the stock 30 mm and MG parts, swapped out when the hangar fits something else
    this.stockGun = [...this.slide.children];
    this.stockMg = [...this.mgSlide.children];
    this.mats = { metal, dark, cyl };
    this.spin = null;

    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.recoilV = 0;
    this.mgRecoil = 0;

    // spent cases: big 30 mm brass and small MG cases
    const brass = new THREE.MeshStandardMaterial({ color: 0xb58a3a, metalness: 1, roughness: 0.32 });
    this.cases = [
      { mesh: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 10), brass, 90), list: [], size: 1 },
      { mesh: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6), brass, 220), list: [], size: 0.3 },
    ];
    for (const c of this.cases) {
      c.mesh.frustumCulled = false;
      c.mesh.count = 0;
      c.mesh.castShadow = true;
      this.world.scene.add(c.mesh);
    }
    this.tinks = 0;
  }

  /**
   * The fitted weapons on the arm: gun look from the hangar (40 mm jacket and brake,
   * gatling barrel cluster, railgun rails) and the secondary (heavy MG, flamethrower).
   */
  setLook(gun = {}, mg = {}) {
    const { metal, dark, cyl } = this.mats;
    for (const o of [this.gunExtra, this.mgExtra]) o?.removeFromParent();
    const look = gun.look || {};
    const custom = look.gatling || look.rail;
    for (const o of this.stockGun) o.visible = !custom;
    this.spin = null;
    const g = (this.gunExtra = new THREE.Group());
    if (look.gatling) {
      const spin = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spin.add(cyl(0.034, 0.034, BARREL, this.barrelMat, -BARREL / 2 - 0.3, Math.sin(a) * 0.085, Math.cos(a) * 0.085));
      }
      for (const z of [-0.5, -1.3, -BARREL - 0.2]) spin.add(cyl(0.14, 0.14, 0.06, dark, z));
      g.add(spin, cyl(0.16, 0.16, 0.5, dark, -0.35));
      this.spin = spin;
    } else if (look.rail) {
      const coil = new THREE.MeshStandardMaterial({ color: 0x0c2a33, metalness: 0.6, roughness: 0.4, emissive: new THREE.Color(0.05, 0.55, 0.85), emissiveIntensity: 0.9 });
      for (const s of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, BARREL + 0.3), this.barrelMat);
        r.position.set(s * 0.09, 0, -BARREL / 2 - 0.35);
        g.add(r);
      }
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.05), coil);
        c.position.z = -0.45 - i * 0.32;
        g.add(c);
      }
      this.railCoil = coil;
    } else if (gun.id === 'ac40') {
      g.add(cyl(0.12, 0.12, 1.3, dark, -1.0), cyl(0.18, 0.165, 0.34, metal, -BARREL - 0.3));
      for (const s of [-1, 1]) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.14), dark);
        slot.position.set(s * 0.17, 0, -BARREL - 0.3);
        g.add(slot);
      }
    }
    this.slide.add(g);
    // the secondary
    const flamer = !!mg.flamer;
    for (const o of this.stockMg) o.visible = !flamer && mg.id !== 'hmg127';
    const m = (this.mgExtra = new THREE.Group());
    if (flamer) {
      m.add(cyl(0.05, 0.065, 0.9, metal, -0.7, 0.22, -0.05), cyl(0.08, 0.08, 0.5, dark, -0.05, 0.22, -0.05));
      this.pilot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3) }));
      this.pilot.position.set(-0.05, 0.22, -1.2);
      m.add(this.pilot);
    } else if (mg.id === 'hmg127') {
      m.add(cyl(0.038, 0.038, 1.3, metal, -0.9, 0.22, -0.05), cyl(0.065, 0.065, 0.16, dark, -1.5, 0.22, -0.05));
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.56), metal);
      body.position.set(-0.05, 0.22, -0.05);
      m.add(body);
    }
    this.mgSlide.add(m);
  }

  reset() {
    for (const c of this.cases) {
      c.list.length = 0;
      c.mesh.count = 0;
    }
  }

  set visible(v) {
    this.root.visible = v;
  }

  /** world position and direction of the cannon / MG muzzle */
  muzzle(out, mg = false) {
    return (mg ? this.mgSlide : this.slide).localToWorld(out.set(mg ? -0.05 : 0, mg ? 0.22 : 0, mg ? -1.52 : -BARREL - 0.34));
  }

  forward(out) {
    this.pitchNode.getWorldQuaternion(_q);
    return out.set(0, 0, -1).applyQuaternion(_q);
  }

  /** a round left the barrel: recoil and a case out of the port */
  fired(mg = false) {
    if (mg) this.mgRecoil = 0.05;
    else {
      this.recoil = 0.24;
      this.recoilV = 0;
    }
    const port = this.pitchNode.localToWorld(_v.set(mg ? 0.06 : 0.22, mg ? 0.22 : 0.08, mg ? -0.05 : -0.05));
    const right = _w.set(1, 0, 0).applyQuaternion(this.pitchNode.getWorldQuaternion(_q));
    const pool = this.cases[mg ? 1 : 0];
    if (pool.list.length >= pool.mesh.instanceMatrix.count) pool.list.shift();
    const sp = mg ? 3 : 4.2;
    pool.list.push({
      p: port.clone(),
      v: right.clone().multiplyScalar(sp + Math.random() * 1.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 2 + Math.random() * 1.6, -0.6 - Math.random())),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      rest: 0,
      bounced: false,
    });
  }

  /**
   * ctx: { mechObj, aim: world point the helmet looks at, heat 0..1, show }
   * returns the gun's own traverse check (true when it can point at the aim)
   */
  update(dt, ctx) {
    const mo = ctx.mechObj;
    this.root.visible = ctx.show;
    this.root.position.copy(mo.localToWorld(_v.copy(PIVOT)));
    this.root.quaternion.copy(mo.quaternion);
    this.root.updateMatrixWorld(true);
    // aim in the arm's frame, swing towards it at servo speed, within the traverse
    _qi.copy(mo.quaternion).invert();
    const d = _w.copy(ctx.aim).sub(this.root.position).applyQuaternion(_qi);
    const wantYaw = Math.atan2(-d.x, -d.z);
    const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const yawT = THREE.MathUtils.clamp(wantYaw, -GUN.yawLimit, GUN.yawLimit);
    const pitchT = THREE.MathUtils.clamp(wantPitch, -GUN.pitchDown, GUN.pitchUp);
    this.yaw += THREE.MathUtils.clamp(yawT - this.yaw, -SERVO * dt, SERVO * dt);
    this.pitch += THREE.MathUtils.clamp(pitchT - this.pitch, -SERVO * dt, SERVO * dt);
    this.yawNode.rotation.y = this.yaw;
    this.pitchNode.rotation.x = this.pitch;
    // recoil: the barrel slams back and the buffer pushes it forward again
    this.recoilV += (-180 * this.recoil - 16 * this.recoilV) * dt;
    this.recoil = Math.max(0, this.recoil + this.recoilV * dt);
    this.slide.position.z = this.recoil;
    this.mgRecoil = Math.max(0, this.mgRecoil - dt * 1.5);
    this.mgSlide.position.z = this.mgRecoil;
    // the gatling cluster spins up while the trigger is held
    if (this.spin) {
      this.spinV = THREE.MathUtils.lerp(this.spinV ?? 0, ctx.firing ? 45 : 0, Math.min(1, dt * (ctx.firing ? 6 : 1.5)));
      this.spin.rotation.z += this.spinV * dt;
    }
    if (this.pilot) this.pilot.scale.setScalar(0.8 + Math.random() * 0.5);
    // a hot barrel glows from the muzzle end
    const h = Math.max(0, (ctx.heat - 0.35) / 0.65);
    this.barrelMat.emissive.setRGB(1.6 * h * h, 0.35 * h * h * h, 0);
    this.root.updateMatrixWorld(true);
    this.updateCases(dt);
    // on target when the barrel points where the pilot looks (within a few degrees)
    return Math.abs(wantYaw - this.yaw) < 0.08 && Math.abs(wantPitch - this.pitch) < 0.08;
  }

  updateCases(dt) {
    for (const c of this.cases) {
      let n = 0;
      for (let i = c.list.length - 1; i >= 0; i--) {
        const k = c.list[i];
        if (k.rest > 6) {
          c.list.splice(i, 1);
          continue;
        }
        const g = this.world.heightAt(k.p.x, k.p.z) + 0.02;
        if (k.p.y > g + 0.01 || k.v.y > 0.1) {
          k.v.y -= 9.81 * dt;
          k.p.addScaledVector(k.v, dt);
          k.r.x += k.spin.x * dt;
          k.r.y += k.spin.y * dt;
          k.r.z += k.spin.z * dt;
          if (k.p.y < g) {
            // bounce on the dirt with a clink
            k.p.y = g;
            k.v.y = -k.v.y * 0.32;
            k.v.x *= 0.5;
            k.v.z *= 0.5;
            k.spin.multiplyScalar(0.5);
            if (!k.bounced && this.tinks < 6) {
              this.tinks++;
              this.g.sound.tink?.(c.size);
            }
            k.bounced = true;
          }
        } else {
          k.rest += dt;
          k.r.x = Math.PI / 2; // lying on its side
        }
        _e.copy(k.r);
        _q.setFromEuler(_e);
        _m.compose(k.p, _q, _s.set(1, 1, 1));
        c.mesh.setMatrixAt(n++, _m);
      }
      c.mesh.count = n;
      c.mesh.instanceMatrix.needsUpdate = true;
    }
    this.tinks = Math.max(0, this.tinks - dt * 12);
  }
}
