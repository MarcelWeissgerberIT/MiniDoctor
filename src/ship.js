import { clamp, SIZES } from './physics.js';

/** Keyboard + mouse state. Pointer lock is used for looking around. */
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.down = false;
    this.clicked = false;
    this.released = false;
    this.wheel = 0;
    this.pressed = new Set();
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // browsers can report a huge jump right after the pointer gets locked
      if (this.skipMoves > 0) return void this.skipMoves--;
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.locked && this.wantLock) el.requestPointerLock?.();
      this.down = true;
      this.clicked = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (this.down) this.released = true;
      this.down = false;
    });
    el.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      this.skipMoves = 2;
    });
    this.wantLock = true;
  }
  axis(neg, pos) {
    const n = neg.some((k) => this.keys.has(k)) ? 1 : 0;
    const p = pos.some((k) => this.keys.has(k)) ? 1 : 0;
    return p - n;
  }
  endFrame() {
    this.mdx = this.mdy = 0;
    this.clicked = this.released = false;
    this.wheel = 0;
    this.pressed.clear();
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

/**
 * The ship has NO propulsion. It is carried by the plasma at the local
 * Poiseuille speed. Small flow flaps let it drift sideways (like a
 * platelet being pushed towards the wall), a GP-Ib anchor lets it
 * stick to damaged endothelium.
 */
export class Ship {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.dist = 0;
    this.speed = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.anchored = false;
    this.controlsEnabled = false;
    this.autopilot = true;
    this.yawLimit = 1.2;
    this.pitchLimit = 0.8;
    // cockpit control sticks, each axis −1..1 (x = right, y = forward)
    this.stick = { lx: 0, ly: 0, rx: 0, ry: 0 };
  }

  get r() {
    return Math.hypot(this.x, this.y);
  }
  wallDistance(R) {
    return R - this.r - SIZES.ship / 2;
  }

  update(dt, input, world, t, mission, opts) {
    const vessel = world.vessel;
    const R = vessel.radius;
    const flowMod = mission?.flowMod?.(this) ?? 1;
    const v = this.anchored ? 0 : world.flowAt(this.x, this.y, t, flowMod);
    this.speed = v;
    this.dist += v * dt;

    // Look (limited, never roll — keeps the horizon stable)
    const sens = opts.comfort ? 0.0014 : 0.0022;
    if (this.controlsEnabled && input.locked) {
      this.yaw = clamp(this.yaw - input.mdx * sens, -this.yawLimit, this.yawLimit);
      this.pitch = clamp(this.pitch - input.mdy * sens, -this.pitchLimit, this.pitchLimit);
    }
    // right stick: look (push forward = nose down, like an aircraft)
    if (this.controlsEnabled) {
      const rate = opts.comfort ? 0.7 : 1.1; // rad/s
      this.yaw = clamp(this.yaw - this.stick.rx * rate * dt, -this.yawLimit, this.yawLimit);
      this.pitch = clamp(this.pitch - this.stick.ry * rate * dt, -this.pitchLimit, this.pitchLimit);
    }

    // Flow flaps: max lateral drift depends on vessel size.
    const latMax = mission?.lateralSpeed ?? Math.max(2.5, R * 0.028);
    let ax = 0;
    let ay = 0;
    // left stick + WASD: flow flaps (forward = drift up, back = down)
    const sx = clamp(input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) + this.stick.lx, -1, 1);
    const sy = clamp(input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) + this.stick.ly, -1, 1);
    const manual = this.controlsEnabled && (Math.abs(sx) > 0.05 || Math.abs(sy) > 0.05);
    if (manual) {
      // steer relative to where the pilot looks (yaw only)
      const c = Math.cos(this.yaw);
      ax = sx * (Math.abs(c) < 0.3 ? Math.sign(c || 1) * 0.3 : c);
      ay = sy;
    } else if (this.autopilot && !this.anchored) {
      const tgt = mission?.autopilotTarget?.(this);
      if (tgt) {
        const dx = tgt.x - this.x;
        const dy = tgt.y - this.y;
        const d = Math.hypot(dx, dy);
        const k = clamp(d / (latMax * 1.5), 0, 1);
        if (d > 0.01) {
          ax = (dx / d) * k;
          ay = (dy / d) * k;
        }
      }
    }
    const tvx = ax * latMax;
    const tvy = ay * latMax;
    const smooth = 1 - Math.exp(-dt * 3);
    this.vx += (tvx - this.vx) * smooth;
    this.vy += (tvy - this.vy) * smooth;
    if (this.anchored) this.vx = this.vy = 0;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Margination: RBCs gently push platelet-sized bodies towards the wall.
    if (!this.anchored && this.r > 0.01) {
      const m = 0.004 * latMax * dt;
      this.x += (this.x / this.r) * m;
      this.y += (this.y / this.r) * m;
    }
    // Stay inside the vessel.
    const maxR = R - SIZES.ship / 2 - 0.3;
    if (this.r > maxR) {
      const s = maxR / this.r;
      this.x *= s;
      this.y *= s;
    }
    mission?.constrain?.(this);
  }

  applyCamera(camera, t, comfort) {
    camera.position.set(this.x, this.y, 0);
    // tiny sway with the heartbeat; disabled in comfort mode
    const sway = comfort || this.anchored ? 0 : Math.sin(t * 7.5) * 0.004;
    camera.rotation.set(this.pitch + sway, this.yaw, 0);
  }
}
