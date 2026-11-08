import * as THREE from 'three';
import { stepLength } from '../logic/mech.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _k = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const find = (root, re) => {
  let hit = null;
  root.traverse((o) => {
    if (!hit && o.isBone && re.test(o.name)) hit = o;
  });
  return hit;
};

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * A heavy, deliberate mech walk without canned animation: two-bone IK keeps the stance
 * foot planted on the ground while the body moves over it, and the swing foot travels
 * on an arc to its next footfall, in step with the simulated gait (stepPhase / foot of
 * the mech state, the same steps the cockpit feels and hears). The hips sink when the
 * stride needs the reach, the torso twists a little against the legs.
 *
 * model: the (skinned) model holding the bones; holder: the object that is moved and
 * turned in the world (its origin on the ground between the feet).
 */
export class MechWalker {
  constructor(model, holder) {
    this.holder = holder;
    this.hips = find(model, /hips/i);
    this.spine = find(model, /^spine$/i) || find(model, /spine/i);
    this.ok = !!this.hips;
    this.legs = [];
    if (!this.ok) return;
    holder.updateMatrixWorld(true);
    const bind = new Map();
    model.traverse((o) => o.isBone && bind.set(o, o.quaternion.clone()));
    this.bind = bind;
    this.hipsBind = this.hips.position.clone();
    for (const [side, re] of [
      [-1, 'Left'],
      [1, 'Right'],
    ]) {
      const up = find(model, new RegExp(`^${re}UpLeg$`, 'i'));
      const knee = find(model, new RegExp(`^${re}Leg$`, 'i'));
      const foot = find(model, new RegExp(`^${re}Foot$`, 'i'));
      if (!up || !knee || !foot) {
        this.ok = false;
        return;
      }
      const A = up.getWorldPosition(new THREE.Vector3());
      const B = knee.getWorldPosition(new THREE.Vector3());
      const C = foot.getWorldPosition(new THREE.Vector3());
      // where the ankle sits in the holder's frame when standing (left/right, height)
      const local = holder.worldToLocal(C.clone());
      const hipLocal = holder.worldToLocal(A.clone());
      this.legs.push({
        side,
        up,
        knee,
        foot,
        l1: A.distanceTo(B),
        l2: B.distanceTo(C),
        lat: local.x,
        fwd: hipLocal.z * 0.5 + local.z * 0.5,
        ankle: local.y,
        planted: null,
        from: new THREE.Vector3(),
        target: new THREE.Vector3(),
      });
    }
    this.lastFoot = null;
    this.prog = 0;
    this.crouch = 0.05;
    this.move = 0;
  }

  /** forget where the feet stood (after a jump in position or when shown again) */
  reset() {
    for (const leg of this.legs) leg.planted = null;
    this.lastFoot = null;
    this.prog = 0;
    this.fresh = true;
  }

  /** nominal ankle position of a leg under the body, in the world */
  nominal(leg, out, fwdExtra = 0) {
    out.set(leg.lat, 0, leg.fwd - fwdExtra);
    this.holder.localToWorld(out);
    return out;
  }

  /**
   * s: { stepPhase 0..1, foot (+1 right lands next, -1 left), speed, turn }
   * ground(x, z): terrain height; dt for the smoothing
   */
  update(dt, s, ground) {
    if (!this.ok) return;
    const h = this.holder;
    // back to the standing pose, then solve
    for (const [b, q] of this.bind) b.quaternion.copy(q);
    this.hips.position.copy(this.hipsBind);
    h.updateMatrixWorld(true);

    const sp = Math.abs(s.speed);
    const moving = sp > 0.25 || Math.abs(s.turn) > 0.05;
    this.move += ((moving ? 1 : 0) - this.move) * Math.min(1, dt * 3);
    const L = sp > 0.25 ? stepLength(sp) : 0.8;
    const dir = s.speed < -0.1 ? -1 : 1;
    const swingSide = s.foot; // the foot that lands next is in the air
    // a footfall: the foot that was swinging is planted where it landed
    if (this.lastFoot !== null && s.foot !== this.lastFoot) {
      for (const leg of this.legs) {
        if (leg.side === this.lastFoot) leg.planted = leg.target.clone();
        if (leg.side === s.foot) leg.from.copy(leg.planted ?? this.nominal(leg, new THREE.Vector3()));
      }
      this.prog = 0;
    }
    this.lastFoot = s.foot;
    // progress of the swing only runs forward (the simulation settles it back when stopping)
    this.prog = moving ? Math.max(this.prog, s.stepPhase) : Math.min(1, this.prog + dt * 1.5);
    const p = this.prog;
    const lift = 0.5 * this.move;

    for (const leg of this.legs) {
      leg.planted ??= this.nominal(leg, new THREE.Vector3());
      // a stale lift-off point (first frame, teleport, long time hidden) starts under the body
      this.nominal(leg, _p);
      if (this.fresh || leg.from.distanceTo(_p) > L * 2 + 2) leg.from.copy(leg.planted.distanceTo(_p) > L * 2 + 2 ? _p : leg.planted);
      if (leg.side === swingSide && (moving || p < 1)) {
        // the next footfall: under the body when it gets there, half a step ahead
        const ahead = moving ? dir * ((1 - p) * L + L * 0.5) * this.move : 0;
        this.nominal(leg, leg.target, ahead);
        const k = smooth(Math.min(1, p));
        _t.lerpVectors(leg.from, leg.target, k);
        _t.y = ground(_t.x, _t.z) + leg.ankle + Math.sin(Math.PI * Math.min(1, p)) * lift;
        leg.goal = _t.clone();
      } else {
        // stance: stays where it stands (re-planted if the body has run away from it)
        this.nominal(leg, _p);
        if (leg.planted.distanceTo(_p) > L * 1.6 + 1) leg.planted.copy(_p);
        leg.goal = leg.planted.clone();
        leg.goal.y = ground(leg.goal.x, leg.goal.z) + leg.ankle;
        leg.target.copy(leg.planted);
      }
    }

    this.fresh = false;
    // sink the hips so the legs reach the ends of the stride (a steady crouch for the
    // speed: the gait itself already bobs the body); also when a foot stands on lower ground
    let need = 0.05;
    for (const leg of this.legs) {
      leg.up.getWorldPosition(_a);
      const reach = (leg.l1 + leg.l2) * 0.97;
      const H = _a.y - (ground(_a.x, _a.z) + leg.ankle);
      const half = this.move * L * 0.55;
      need = Math.max(need, H - Math.sqrt(Math.max(0, reach * reach - half * half)));
      const dh = Math.hypot(leg.goal.x - _a.x, leg.goal.z - _a.z);
      need = Math.max(need, _a.y - leg.goal.y - Math.sqrt(Math.max(0, reach * reach - dh * dh)));
    }
    need = Math.min(need, 1.1);
    // sink fast, rise slowly
    this.crouch += (need - this.crouch) * Math.min(1, dt * (need > this.crouch ? 25 : 4));
    this.hips.getWorldPosition(_p);
    _p.y -= this.crouch;
    this.hips.parent.worldToLocal(_p);
    this.hips.position.copy(_p);
    // the torso twists a little against the stepping legs
    if (this.spine) {
      const tw = -swingSide * 0.05 * this.move * Math.cos(Math.PI * p);
      this.spine.getWorldQuaternion(_q2);
      _q.setFromAxisAngle(UP, tw);
      this.spine.parent.getWorldQuaternion(_qp).invert();
      this.spine.quaternion.copy(_qp.multiply(_q.multiply(_q2)));
    }
    h.updateMatrixWorld(true);

    // two-bone IK per leg, knees forward and slightly out
    const fwd = _d.set(0, 0, -1).transformDirection(h.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(h.matrixWorld);
    for (const leg of this.legs) {
      const footQ = leg.foot.getWorldQuaternion(new THREE.Quaternion());
      leg.up.getWorldPosition(_a);
      leg.knee.getWorldPosition(_b);
      const T = leg.goal;
      _t.subVectors(T, _a);
      const dist = Math.min(Math.max(_t.length(), 0.05), leg.l1 + leg.l2 - 0.002);
      _t.normalize();
      const pole = fwd.clone().addScaledVector(right, leg.side * 0.25);
      pole.addScaledVector(_t, -pole.dot(_t)).normalize();
      const a = (leg.l1 * leg.l1 - leg.l2 * leg.l2 + dist * dist) / (2 * dist);
      const hh = Math.sqrt(Math.max(0, leg.l1 * leg.l1 - a * a));
      _k.copy(_a).addScaledVector(_t, a).addScaledVector(pole, hh);
      // thigh: from the current knee direction to the solved one
      this.aim(leg.up, _a, _b, _k);
      leg.up.updateMatrixWorld(true);
      // shin: from the current ankle direction to the target
      leg.knee.getWorldPosition(_b);
      leg.foot.getWorldPosition(_c);
      _p.copy(_b).addScaledVector(_t.subVectors(T, _b).normalize(), leg.l2);
      this.aim(leg.knee, _b, _c, _p);
      leg.knee.updateMatrixWorld(true);
      // the foot keeps the standing orientation (flat on the ground)
      leg.knee.getWorldQuaternion(_qp).invert();
      leg.foot.quaternion.copy(_qp.multiply(footQ));
      leg.foot.updateMatrixWorld(true);
    }
  }

  /** rotate bone (at pivot) so that the point 'from' moves onto the ray towards 'to' */
  aim(bone, pivot, from, to) {
    const v1 = from.clone().sub(pivot).normalize();
    const v2 = to.clone().sub(pivot).normalize();
    _q.setFromUnitVectors(v1, v2);
    bone.getWorldQuaternion(_q2);
    bone.parent.getWorldQuaternion(_qp).invert();
    bone.quaternion.copy(_qp.multiply(_q.multiply(_q2)));
  }
}
