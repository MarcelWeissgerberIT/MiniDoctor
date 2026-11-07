// How the 5 m walker moves its torso (= the cockpit) while it walks, and how the
// pilot's head and loose things inside react to it. Pure maths, no three.js.
//
// Frames: body/cockpit frame with +x right, +y up, -z forward.
// Angles: roll + = right side up (leaning left), pitch + = nose up.

import { MECH, clamp, stepLength } from './mech.js';

export const GAIT = {
  roll: 0.075, // rad weight shift onto the stance leg (slow walk)
  sway: 0.065, // m sideways over the stance foot
  lift: 0.1, // m vault over the stance leg (slow walk), a bit more when running
  dip: 0.035, // m sag right after heel strike
  nod: 0.024, // rad nose-down at heel strike
  twist: 0.02, // rad torso twist
  stab: 0.72, // how much of the cabin roll the pilot's head cancels (vestibular reflex)
};

/**
 * Target torso pose for the current gait phase. stepPhase 0 = heel strike of the
 * foot that just landed (the stance foot is -s.foot, because s.foot names the next one).
 */
export function gaitPose(s) {
  const sp = Math.abs(s.speed);
  const move = clamp((sp + Math.abs(s.turn) * 3) / 1.6, 0, 1);
  const run = clamp(sp / MECH.maxForward, 0, 1);
  const ph = s.stepPhase;
  const stance = -s.foot;
  const arc = Math.sin(Math.PI * ph);
  const strike = Math.exp(-ph * 6);
  // an inverted-pendulum walk cannot fall faster than gravity: cap the vault by the step rate
  const rate = Math.max(0.5, sp / stepLength(sp));
  const maxLift = (0.45 * 9.81) / (Math.PI * rate) ** 2;
  const lift = Math.min(GAIT.lift * (1 + 0.25 * run), maxLift);
  return {
    roll: -stance * GAIT.roll * (1 - 0.35 * run) * move * arc,
    x: stance * GAIT.sway * (1 - 0.6 * run) * move * arc,
    y: (lift * arc - GAIT.dip * (1 + 1.2 * run) * strike) * move,
    pitch: (-GAIT.nod * (1 + 1.4 * run) * strike + 0.006 * run * arc) * move,
    yaw: stance * GAIT.twist * move * Math.cos(Math.PI * ph),
  };
}

/** damped spring towards a target (semi-implicit Euler) */
function spring(st, target, w, zeta, dt) {
  const a = w * w * (target - st.v) - 2 * zeta * w * st.d;
  st.d += a * dt;
  st.v += st.d * dt;
  return st.v;
}

export class BodyDynamics {
  constructor() {
    this.ch = {};
    for (const k of ['roll', 'pitch', 'x', 'yaw', 'slopeP', 'slopeR', 'y']) this.ch[k] = { v: 0, d: 0 };
    this.prev = { y: 0, x: 0, vy: 0, vx: 0, speed: 0 };
    this.head = { p: [0, 0, 0], v: [0, 0, 0], roll: 0, pitch: 0, yaw: 0 };
    this.tags = { ax: 0, vx: 0, az: 0, vz: 0 };
    this.acc = [0, 0, 0];
    this.pose = { y: 0, x: 0, roll: 0, pitch: 0, yaw: 0 };
  }

  /**
   * s: mech state, slope: { pitch, roll } of the ground under the feet,
   * stab: gyro stabiliser on (damps the sway)
   */
  update(dt, s, slope = { pitch: 0, roll: 0 }, stab = true) {
    if (dt <= 0) return this.pose;
    const g = gaitPose(s);
    const k = stab ? 0.7 : 1;
    const run = clamp(Math.abs(s.speed) / MECH.maxForward, 0, 1);
    // lean into turns, pitch with acceleration (legs brake the body, the torso keeps going)
    const accel = (s.speed - this.prev.speed) / dt;
    const turnLean = clamp(s.speed * s.turn * 0.012, -0.05, 0.05);
    const accelPitch = clamp(-accel * 0.006, -0.03, 0.03);
    const p = this.pose;
    p.roll = spring(this.ch.roll, (g.roll + turnLean) * k, 8.5, 0.45, dt);
    p.pitch = spring(this.ch.pitch, g.pitch * k + accelPitch, 9, 0.4, dt);
    p.x = spring(this.ch.x, g.x * k, 8.5, 0.45, dt);
    p.yaw = spring(this.ch.yaw, g.yaw * k, 10, 0.4, dt);
    p.y = g.y * (stab ? 0.8 : 1);
    // the ground: craters and slopes tilt the whole machine
    p.pitch += spring(this.ch.slopeP, slope.pitch * 0.7, 4, 0.7, dt);
    p.roll += spring(this.ch.slopeR, slope.roll * 0.7, 4, 0.7, dt);

    // acceleration of the cabin in its own frame (from a smoothed height so the
    // heel-strike cusp does not produce one-sided spikes)
    const ySm = spring(this.ch.y, p.y, 24, 0.7, dt);
    const vy = (ySm - this.prev.y) / dt;
    const vx = (p.x - this.prev.x) / dt;
    // slightly low-passed: the legs' hydraulics soak up the sharpest spikes
    const a = this.acc;
    const f = 1 - Math.exp(-dt / 0.025);
    a[0] += (clamp((vx - this.prev.vx) / dt - s.speed * s.turn, -16, 16) - a[0]) * f;
    a[1] += (clamp((vy - this.prev.vy) / dt, -30, 30) - a[1]) * f;
    a[2] += (clamp(-accel, -16, 16) - a[2]) * f;
    this.prev.y = ySm;
    this.prev.x = p.x;
    this.prev.vy = vy;
    this.prev.vx = vx;
    this.prev.speed = s.speed;

    // the pilot's head on a stiff neck: lags behind accelerations
    const h = this.head;
    // strapped in and bracing: the head takes about half of the cabin's acceleration
    const K = 85;
    const C = stab ? 13 : 10;
    for (let i = 0; i < 3; i++) {
      h.v[i] += (-K * h.p[i] - C * h.v[i] - 0.9 * a[i]) * dt;
      h.p[i] = clamp(h.p[i] + h.v[i] * dt, -0.09, 0.09);
    }
    // ...and partly keeps itself level while the cabin rolls around it
    const r = 1 - Math.exp(-dt * 7);
    h.roll += (-GAIT.stab * p.roll - h.roll) * r;
    h.pitch += (-0.6 * p.pitch - h.pitch) * r;
    h.yaw += (-0.6 * p.yaw - h.yaw) * r;

    // dog tags hanging on a chain: a free pendulum in the cabin frame
    const L = 0.12;
    const G = 9.81;
    const gx = -G * Math.sin(p.roll) - a[0];
    // the chain mostly feels sideways and fore-aft pushes; vertical bounces only jiggle it
    this.ayTags = (this.ayTags ?? 0) + (a[1] - (this.ayTags ?? 0)) * (1 - Math.exp(-dt / 0.06));
    const gy = -G * Math.cos(p.roll) * Math.cos(p.pitch) - 0.15 * this.ayTags;
    const gz = G * Math.sin(p.pitch) - a[2];
    const t = this.tags;
    t.vx += ((gx * Math.cos(t.ax) + gy * Math.sin(t.ax)) / L - 3 * t.vx) * dt;
    t.vz += ((gz * Math.cos(t.az) + gy * Math.sin(t.az)) / L - 3 * t.vz) * dt;
    t.ax = clamp(t.ax + t.vx * dt, -1.1, 1.1);
    t.az = clamp(t.az + t.vz * dt, -1.1, 1.1);
    this.run = run;
    return p;
  }
}
