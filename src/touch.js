// On-screen controls for tablets and phones. They only feed the same inputs the keyboard
// and mouse do (virtual keys, trigger, throttle target, turn axis), so the game logic
// does not know the difference. Shown automatically on touch devices.

const html = `
  <div class="t-left">
    <div class="t-throttle" data-ctl="throttle">
      <div class="t-track"><div class="t-zero"></div><div class="t-fill"></div><div class="t-knob"></div></div>
      <div class="t-val">0%</div>
      <div class="t-lbl">SCHUB</div>
    </div>
    <div class="t-col">
      <div class="t-steer" data-ctl="steer"><div class="t-steer-knob"></div><span>◀ DREHEN ▶</span></div>
      <button class="t-btn t-stop" data-key="KeyX" data-tap="stop">STOPP</button>
    </div>
  </div>
  <div class="t-right">
    <button class="t-btn t-small" data-key="Tab" data-tap="1">ZIEL</button>
    <button class="t-btn t-small" data-key="KeyF" data-tap="1">RAKETE</button>
    <button class="t-btn t-mg" data-hold="KeyE">MG</button>
    <button class="t-btn t-fire" data-fire="1">FEUER</button>
    <button class="t-btn t-small t-zoom" data-zoom="1">ZOOM</button>
  </div>
  <div class="t-util">
    <button class="t-btn t-u" data-key="KeyP" data-tap="1">❚❚</button>
    <button class="t-btn t-u" data-key="KeyQ" data-tap="1">DROHNE</button>
    <button class="t-btn t-u" data-key="KeyM" data-tap="1">KARTE</button>
    <button class="t-btn t-u" data-lance="1">LANZE</button>
    <div class="t-lance">
      <button class="t-btn t-u" data-key="KeyB" data-tap="1">FOLGEN</button>
      <button class="t-btn t-u" data-key="KeyV" data-tap="1">HALTEN</button>
      <button class="t-btn t-u" data-key="KeyT" data-tap="1">ANGRIFF</button>
    </div>
  </div>
`;

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export class TouchControls {
  constructor(game, input) {
    this.g = game;
    this.input = input;
    this.on = false;
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = html;
    document.body.appendChild(el);
    this.el = el;
    this.fill = el.querySelector('.t-fill');
    this.knob = el.querySelector('.t-knob');
    this.val = el.querySelector('.t-val');
    this.steerKnob = el.querySelector('.t-steer-knob');
    this.lance = el.querySelector('.t-lance');
    this.fireBtn = el.querySelector('.t-fire');
    this.mgBtn = el.querySelector('.t-mg');
    this.bind();
  }

  setEnabled(on) {
    this.on = on;
    document.body.classList.toggle('touchmode', on);
    if (!on) this.release();
  }

  release() {
    const I = this.input;
    I.lmb = false;
    I.rmb = false;
    I.keys.delete('KeyE');
    I.turnAxis = 0;
  }

  bind() {
    const I = this.input;
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    // every control swallows its touches: they must not turn the head too
    this.el.addEventListener('touchstart', (e) => e.target.closest('button, [data-ctl]') && e.stopPropagation(), { passive: true });

    // throttle lever: drag up and down, the mech follows to the set value
    const thr = this.el.querySelector('.t-throttle .t-track');
    const setThr = (t) => {
      const r = thr.getBoundingClientRect();
      const y = Math.min(1, Math.max(0, (r.bottom - t.clientY) / r.height));
      // the scale runs from -30 % (bottom) to +100 % (top)
      let v = -0.3 + y * 1.3;
      if (Math.abs(v) < 0.05) v = 0; // notch at zero
      I.throttleTarget = v;
    };
    this.track(thr, setThr, () => {});

    // steering pad: left/right offset, springs back
    const steer = this.el.querySelector('.t-steer');
    const setSteer = (t) => {
      const r = steer.getBoundingClientRect();
      const x = ((t.clientX - r.left) / r.width) * 2 - 1;
      I.turnAxis = Math.max(-1, Math.min(1, x * 1.3));
    };
    this.track(steer, setSteer, () => (I.turnAxis = 0));

    for (const b of this.el.querySelectorAll('button')) {
      // taps: a key press for one frame
      if (b.dataset.tap) {
        b.addEventListener('touchstart', (e) => {
          stop(e);
          b.classList.add('down');
          I.pressed.add(b.dataset.key);
          if (b.dataset.tap === 'stop') I.throttleTarget = 0;
          if (['KeyB', 'KeyV', 'KeyT'].includes(b.dataset.key)) this.lance.classList.remove('open');
        });
        b.addEventListener('touchend', (e) => {
          stop(e);
          b.classList.remove('down');
        });
      }
      // held: the key is down while the finger is
      if (b.dataset.hold) {
        b.addEventListener('touchstart', (e) => {
          stop(e);
          b.classList.add('down');
          I.keys.add(b.dataset.hold);
        });
        const up = (e) => {
          stop(e);
          b.classList.remove('down');
          I.keys.delete(b.dataset.hold);
        };
        b.addEventListener('touchend', up);
        b.addEventListener('touchcancel', up);
      }
      if (b.dataset.fire || b.dataset.zoom) {
        const k = b.dataset.fire ? 'lmb' : 'rmb';
        b.addEventListener('touchstart', (e) => {
          stop(e);
          b.classList.add('down');
          I[k] = true;
        });
        const up = (e) => {
          stop(e);
          b.classList.remove('down');
          I[k] = false;
        };
        b.addEventListener('touchend', up);
        b.addEventListener('touchcancel', up);
      }
      if (b.dataset.lance) {
        b.addEventListener('touchstart', (e) => {
          stop(e);
          this.lance.classList.toggle('open');
        });
      }
    }
  }

  /** follow one finger on an element (its own identifier, so others can look around) */
  track(el, move, end) {
    let id = null;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      id = t.identifier;
      move(t);
    });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) if (t.identifier === id) move(t);
    });
    const up = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) id = null;
      if (id === null) end();
    };
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
  }

  /** per frame: what the controls show and where they are needed */
  update() {
    if (!this.on) return;
    const g = this.g;
    const show = g.state === 'cockpit' && !g.paused && !g.inResult && !g.dead;
    const front = g.view === 'front' || g.external;
    this.el.classList.toggle('show', show);
    this.el.classList.toggle('panel', show && !front);
    if (!show) return;
    const t = g.mech.throttle;
    const y = ((t + 0.3) / 1.3) * 100;
    this.knob.style.bottom = `calc(${y}% - 14px)`;
    const z = (0.3 / 1.3) * 100;
    this.fill.style.bottom = `${Math.min(y, z)}%`;
    this.fill.style.height = `${Math.abs(y - z)}%`;
    this.fill.classList.toggle('rev', t < 0);
    this.val.textContent = `${t > 0 ? '+' : ''}${Math.round(t * 100)}%`;
    this.steerKnob.style.left = `${50 + (this.input.turnAxis || 0) * 40}%`;
    const w = g.arsenal.w;
    const live = g.weaponLive || {};
    this.fireBtn.classList.toggle('off', !live.gun);
    this.fireBtn.dataset.n = live.gun ? w.gun.ammo : 'SICHER';
    this.mgBtn.classList.toggle('off', !live.mg);
  }
}
