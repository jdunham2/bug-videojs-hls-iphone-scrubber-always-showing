// Touch controls for phones and tablets, and the choice of how you play:
//
//   Touch screen  twin sticks: the left one walks; touch the right side to draw,
//                 drag to aim, lift to shoot. Big buttons roll, fire the Arrow
//                 Volley, use gadgets and pause. Light aim assist.
//   Touchpad      click once to start drawing, click again to shoot (no holding
//                 the pad down); a two-finger tap rolls.
//   Mouse         hold to draw, release to shoot.
//   Auto          touch controls appear when you touch the screen, and go away
//                 when you use the keyboard or mouse.

import { settings, saveSettingsNow } from './settings.js';

export const CONTROL_MODES = [
  ['auto', 'Auto'],
  ['touch', 'Touch screen'],
  ['touchpad', 'Touchpad'],
  ['mouse', 'Mouse'],
];

const STICK_R = 58; // px the knob can travel from the stick's center
const AIM_DEADZONE = 16; // px of drag before a drag counts as aiming

const phoneLike = () => {
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
};

export const hasTouchScreen = () => (navigator.maxTouchPoints || 0) > 0;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.lastWasTouch = phoneLike();
    this.move = null; // { id, ox, oy, x, y }
    this.aim = null; // { id, ox, oy, x, y, dragged }
    this.build();
    this.input.touch = this;
    this.input.touchpadMode = () => settings.controls === 'touchpad';

    // Auto mode follows whatever you last used.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.lastWasTouch) {
          this.lastWasTouch = true;
          this.refresh();
        } else if (e.pointerType === 'mouse' && this.lastWasTouch && settings.controls === 'auto') {
          this.lastWasTouch = false;
          this.refresh();
        }
      },
      true,
    );
    window.addEventListener('keydown', (e) => {
      if (this.lastWasTouch && settings.controls === 'auto' && /^(Key[WASDQ]|Arrow|Space|Digit)/.test(e.code)) {
        this.lastWasTouch = false;
        this.refresh();
      }
    });
    window.addEventListener('resize', () => this.refresh());
    window.__touch = this;
    this.refresh();
  }

  /** Is the on-screen touch layout showing? */
  get active() {
    const m = settings.controls || 'auto';
    return m === 'touch' || (m === 'auto' && this.lastWasTouch);
  }

  get mode() {
    return this.active ? 'touch' : settings.controls === 'touchpad' ? 'touchpad' : 'mouse';
  }

  setMode(mode) {
    settings.controls = mode;
    if (mode === 'touch') this.lastWasTouch = true;
    if (mode === 'mouse' || mode === 'touchpad') this.lastWasTouch = false;
    saveSettingsNow();
    this.refresh();
  }

  /** Sync body classes (CSS shows/hides hints and buttons) after any change. */
  refresh() {
    const on = this.active;
    document.body.classList.toggle('touch', on);
    document.body.classList.toggle('touchpad', !on && settings.controls === 'touchpad');
    document.body.classList.toggle('portrait', on && innerHeight > innerWidth);
    if (!on) this.releaseAll();
    if (this.wasActive !== on) {
      this.wasActive = on;
      this.game.onControlsChanged?.();
    }
  }

  build() {
    const el = document.createElement('div');
    el.id = 'touch';
    el.innerHTML = `
      <div class="tc-zone"></div>
      <div class="tc-stick tc-move-stick"><div class="tc-knob"></div></div>
      <div class="tc-stick tc-aim-stick"><div class="tc-knob"><i></i></div></div>
      <div class="tc-ghost tc-ghost-move">Move</div>
      <div class="tc-ghost tc-ghost-aim">Hold to draw<br>drag to aim</div>
      <button class="tc-btn tc-dodge" data-key="Space" aria-label="Roll"><span>ROLL</span></button>
      <button class="tc-btn tc-volley" data-key="KeyQ" aria-label="Arrow Volley"><i class="tc-fill"></i><span>VOLLEY</span></button>
      <button class="tc-btn tc-pause" data-key="KeyP" aria-label="Pause"><span>❚❚</span></button>
      <div class="tc-rotate">Turn your phone sideways for the best view</div>`;
    // Behind the HUD and every panel: insert right after the 3D view.
    const app = document.getElementById('app');
    app.after(el);
    this.el = el;
    this.zone = el.querySelector('.tc-zone');
    this.moveStick = el.querySelector('.tc-move-stick');
    this.aimStick = el.querySelector('.tc-aim-stick');
    this.volley = el.querySelector('.tc-volley');
    this.dodge = el.querySelector('.tc-dodge');

    const z = this.zone;
    z.addEventListener('pointerdown', (e) => this.down(e));
    z.addEventListener('pointermove', (e) => this.moveEv(e));
    z.addEventListener('pointerup', (e) => this.up(e));
    z.addEventListener('pointercancel', (e) => this.up(e));
    z.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const b of el.querySelectorAll('.tc-btn')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.press(b.dataset.key);
        b.classList.add('down');
        setTimeout(() => b.classList.remove('down'), 140);
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // The gadget slots in the HUD double as buttons.
    for (const n of [1, 2]) {
      document.getElementById(`gadget${n}`)?.addEventListener('pointerdown', (e) => {
        if (!this.active) return;
        e.preventDefault();
        e.stopPropagation();
        this.press(`Digit${n}`);
      });
    }
    // Tap the gear card to equip what you just found.
    document.getElementById('gear-card')?.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      e.stopPropagation();
      this.press('KeyE');
    });
  }

  press(code) {
    this.input.pressed.add(code);
    this.game.sfx?.unlock?.();
  }

  // ---------------------------------------------------------------- sticks

  down(e) {
    if (!this.active) return;
    e.preventDefault();
    this.game.sfx?.unlock?.();
    const left = e.clientX < innerWidth * 0.42;
    try {
      this.zone.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
    if (left && !this.move) {
      this.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      this.place(this.moveStick, this.move);
      this.moveStick.classList.add('on');
      this.el.classList.add('used-move');
    } else if (!left && !this.aim) {
      this.aim = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, dragged: false };
      this.place(this.aimStick, this.aim);
      this.aimStick.classList.add('on');
      this.el.classList.add('used-aim');
      // Start drawing the bow.
      const m = this.input.mouse;
      m.down = true;
      m.clicked = true;
    }
  }

  moveEv(e) {
    const s = this.move?.id === e.pointerId ? this.move : this.aim?.id === e.pointerId ? this.aim : null;
    if (!s) return;
    e.preventDefault();
    s.x = e.clientX;
    s.y = e.clientY;
    if (s === this.aim && Math.hypot(s.x - s.ox, s.y - s.oy) > AIM_DEADZONE) s.dragged = true;
    this.place(s === this.move ? this.moveStick : this.aimStick, s);
  }

  up(e) {
    if (this.move?.id === e.pointerId) {
      this.move = null;
      this.moveStick.classList.remove('on');
    }
    if (this.aim?.id === e.pointerId) {
      this.aim = null;
      this.aimStick.classList.remove('on');
      this.input.mouse.down = false; // lift to shoot
    }
  }

  releaseAll() {
    if (this.aim) this.input.mouse.down = false;
    this.move = this.aim = null;
    this.moveStick?.classList.remove('on');
    this.aimStick?.classList.remove('on');
  }

  /** Put a stick's base where the finger landed and its knob under the finger. */
  place(stick, s) {
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx *= STICK_R / d;
      dy *= STICK_R / d;
    }
    stick.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
    stick.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
    if (stick === this.aimStick) stick.firstElementChild.firstElementChild.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
  }

  /** Left stick, screen space (x right, y up), length 0..1. */
  moveAxis() {
    const s = this.move;
    if (!s) return null;
    let x = (s.x - s.ox) / STICK_R;
    let y = -(s.y - s.oy) / STICK_R;
    const len = Math.hypot(x, y);
    if (len < 0.15) return { x: 0, y: 0 };
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Right stick: null while not drawing, { dir: null } for a tap (aim assist), else { dir: {x, y} }. */
  aimState() {
    const s = this.aim;
    if (!s) return null;
    if (!s.dragged) return { dir: null };
    const x = s.x - s.ox;
    const y = -(s.y - s.oy);
    const len = Math.hypot(x, y) || 1;
    return { dir: { x: x / len, y: y / len } };
  }

  /** Per-frame HUD bits: the Volley button fills with the meter, roll dims without charges. */
  update() {
    const g = this.game;
    const st = g.state === 'camp' && g.camp.openKind ? 'menu' : g.state;
    if (st !== this.lastState) {
      this.lastState = st;
      this.el.dataset.state = st;
      if (st !== 'playing' && st !== 'camp') this.releaseAll();
    }
    if (!this.active) return;
    const meter = Math.max(0, Math.min(100, g.ultimate?.meter || 0));
    if (meter !== this.lastMeter) {
      this.lastMeter = meter;
      this.volley.style.setProperty('--fill', `${meter}%`);
      this.volley.classList.toggle('ready', meter >= 100);
    }
    const ready = (g.player?.charges ?? 1) >= 1;
    if (ready !== this.lastDodge) {
      this.lastDodge = ready;
      this.dodge.classList.toggle('empty', !ready);
    }
  }
}
