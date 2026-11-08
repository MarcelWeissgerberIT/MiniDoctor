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
