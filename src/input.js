// Keyboard + mouse with pointer lock. Mouse movement is accumulated and
// consumed once per frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.frameHits = new Set();
    this.dx = 0;
    this.dy = 0;
    this.mouse = { x: 0, y: 0 };
    this.clicked = false;
    this.locked = false;
    this.lockTime = 0;
    this.enabled = false;
    this.cursorMode = false; // panel focus views: free cursor, clicks press controls
    this.rmb = false; // right mouse button held (zoom)
    this.rmbClicked = false;
    this.lmb = false; // left button held with a captured mouse (trigger)
    this.wheel = 0;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = false;
    });
    canvas.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
      // browsers sometimes report a huge jump right after the pointer gets locked
      if (this.locked && performance.now() - this.lockTime > 120) {
        this.dx += Math.max(-250, Math.min(250, e.movementX));
        this.dy += Math.max(-250, Math.min(250, e.movementY));
      } else if (!this.locked && this.drag && !this.drag.noLook) {
        // fallback where pointer lock is not allowed (e.g. embedded pages): drag to look
        this.dx += e.movementX * 1.4;
        this.dy += e.movementY * 1.4;
        this.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      } else if (this.drag?.noLook) this.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        if (this.rmbDown && performance.now() - this.rmbDown < 250) this.rmbClicked = true;
        this.rmb = false;
        this.rmbDown = 0;
        return;
      }
      if (e.button === 0) this.lmb = false;
      if (e.button !== 0 || !this.drag) return;
      // a click without dragging presses the control under the mouse
      if (!this.locked && this.drag.moved < 6) this.clicked = true;
      this.drag = null;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 2) {
        this.rmb = true;
        this.rmbDown = performance.now();
        return;
      }
      if (e.button !== 0) return;
      if (this.cursorMode) {
        // focus view: the cursor stays free; a click presses what is under it
        this.drag = { moved: 0, noLook: true };
        return;
      }
      if (!this.locked) {
        this.drag = { moved: 0 };
        this.lock();
      } else {
        this.clicked = true;
        this.lmb = true;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.lockTime = performance.now();
      this.onLockChange?.(this.locked);
    });
    // touch: drag to look
    let last = null;
    canvas.addEventListener('touchstart', (e) => (last = e.touches[0]), { passive: true });
    canvas.addEventListener(
      'touchmove',
      (e) => {
        const t = e.touches[0];
        if (last) {
          this.dx += (t.clientX - last.clientX) * 2;
          this.dy += (t.clientY - last.clientY) * 2;
        }
        last = t;
      },
      { passive: true },
    );
    canvas.addEventListener('touchend', () => (last = null));
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      p?.catch?.(() => this.canvas.requestPointerLock?.());
    } catch {
      this.canvas.requestPointerLock?.();
    }
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** true in the frame after the key went down */
  hit(code) {
    return this.frameHits.has(code);
  }

  consume() {
    const r = { dx: this.dx, dy: this.dy, clicked: this.clicked, rmbClicked: this.rmbClicked, wheel: this.wheel };
    this.dx = this.dy = 0;
    this.wheel = 0;
    this.clicked = false;
    this.rmbClicked = false;
    this.frameHits = this.pressed;
    this.pressed = new Set();
    return r;
  }
}
