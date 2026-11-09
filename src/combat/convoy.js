import * as THREE from 'three';
import { fitModel } from '../geom.js';

const HP = 60;
const SPEED = 7; // m/s on the road
const _v = new THREE.Vector3();

/**
 * Our supply trucks for an escort: they drive a route as long as the mech stays close to
 * the column, the enemy shoots at them like at us, and the mission counts who gets through.
 */
export class Convoy {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.trucks = [];
    const src = game.assets.models.truck;
    this.template = src ? fitModel(src.clone(true), { length: 9, rotY: -Math.PI / 2 }) : null;
    this.template?.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.color.setRGB(0.78, 0.86, 0.72); // our olive with a friendly tint
        o.castShadow = true;
      }
    });
  }

  /** path: [[x, z], ...] from the start; n trucks one behind the other */
  spawn(path, n = 3) {
    this.clear();
    this.path = path;
    const [x0, z0] = path[0];
    const [x1, z1] = path[1];
    const h = Math.atan2(-(x1 - x0), -(z1 - z0));
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.sin(h) * i * 16;
      const z = z0 + Math.cos(h) * i * 16;
      const obj = this.template ? this.template.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(3, 3, 9), new THREE.MeshStandardMaterial({ color: 0x55603f }));
      obj.traverse((o) => o.isMesh && (o.material = o.material.clone()));
      this.world.scene.add(obj);
      const t = { i, x, z, heading: h, speed: 0, hp: HP, dead: false, arrived: false, pi: 1, obj, contact: { x, z, type: 'ally' } };
      this.world.contacts.push(t.contact);
      t.proxy = this.proxy(t);
      this.trucks.push(t);
      this.place(t);
    }
  }

  clear() {
    for (const t of this.trucks) {
      this.world.scene.remove(t.obj);
      if (t.fire) this.world.effects.removeFire(t.fire);
      const k = this.world.contacts.indexOf(t.contact);
      if (k >= 0) this.world.contacts.splice(k, 1);
    }
    this.trucks = [];
  }

  /** what the enemy aims at (the same shape as our mechs) */
  proxy(t) {
    return {
      isPlayer: false,
      truck: true,
      get x() {
        return t.x;
      },
      get z() {
        return t.z;
      },
      get speed() {
        return t.speed;
      },
      get dead() {
        return t.dead || t.arrived;
      },
      get vx() {
        return -Math.sin(t.heading) * t.speed;
      },
      get vz() {
        return -Math.cos(t.heading) * t.speed;
      },
      center: (out) => out.set(t.x, this.world.heightAt(t.x, t.z) + 1.5, t.z),
      onHit: (s) => this.damage(t, s.dmg),
    };
  }

  targets() {
    return this.trucks.map((t) => t.proxy);
  }

  get alive() {
    return this.trucks.filter((t) => !t.dead).length;
  }

  get arrived() {
    return this.trucks.filter((t) => t.arrived).length;
  }

  /** how far the lead truck is along the route, 0..1 */
  get progress() {
    const lead = this.trucks.find((t) => !t.dead && !t.arrived) ?? this.trucks[0];
    return lead ? Math.min(1, (lead.pi - 1) / Math.max(1, this.path.length - 1)) : 1;
  }

  damage(t, dmg) {
    if (t.dead || t.arrived) return;
    t.hp -= dmg;
    this.g.onConvoyHit?.(t);
    if (t.hp > 0) return;
    t.dead = true;
    t.speed = 0;
    const y = this.world.heightAt(t.x, t.z);
    this.world.effects.explosion(t.x, y + 1.5, t.z, 9);
    t.fire = this.world.effects.addFire({ x: t.x, z: t.z, y: 1.5, scale: 3, smoke: 1 });
    this.g.explosionSound(_v.set(t.x, y, t.z), 1);
    t.obj.traverse((o) => o.isMesh && o.material.color.multiplyScalar(0.16));
    t.contact.type = 'fire';
    this.g.onConvoyLost?.(t);
  }

  /** the column moves while the escort is close; each truck keeps its distance */
  update(dt) {
    const m = this.g.mech;
    const live = this.trucks.filter((t) => !t.dead && !t.arrived);
    const lead = live[0];
    const close = lead && live.some((t) => Math.hypot(t.x - m.x, t.z - m.z) < 170);
    this.waiting = !!lead && !close;
    for (const t of this.trucks) {
      if (t.dead || t.arrived) continue;
      const ahead = live[live.indexOf(t) - 1];
      const gap = ahead ? Math.hypot(ahead.x - t.x, ahead.z - t.z) : 1e9;
      const go = close && gap > 18;
      const [tx, tz] = this.path[Math.min(t.pi, this.path.length - 1)];
      if (Math.hypot(tx - t.x, tz - t.z) < 10) {
        t.pi++;
        if (t.pi >= this.path.length) {
          t.arrived = true;
          t.speed = 0;
          this.g.onConvoyArrived?.(t);
          continue;
        }
      }
      const want = Math.atan2(-(tx - t.x), -(tz - t.z));
      const err = Math.atan2(Math.sin(want - t.heading), Math.cos(want - t.heading));
      t.heading += Math.max(-0.6 * dt, Math.min(0.6 * dt, err));
      t.speed += Math.max(-5 * dt, Math.min(2.5 * dt, (go ? SPEED : 0) - t.speed));
      t.x += -Math.sin(t.heading) * t.speed * dt;
      t.z += -Math.cos(t.heading) * t.speed * dt;
      this.place(t);
    }
  }

  place(t) {
    const y = this.world.heightAt(t.x, t.z);
    t.obj.position.set(t.x, y, t.z);
    t.obj.rotation.set(0, t.heading, t.dead ? 0.08 : 0);
    t.contact.x = t.x;
    t.contact.z = t.z;
  }
}
