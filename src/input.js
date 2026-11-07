const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'];

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, ndcX: 0, ndcY: 0, down: false, clicked: false, rightClicked: false };

    window.addEventListener('keydown', (e) => {
      // Only a text box keeps keys to itself. A slider, checkbox, dropdown or
      // button that still has focus (say, after closing Settings) must not swallow
      // WASD, or the hero stops walking while the mouse still works.
      const t = e.target;
      if (t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'search')) return;
      if (t instanceof HTMLElement && t !== document.body && GAME_KEYS.includes(e.code)) t.blur();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.ndcX = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / innerHeight) * 2 + 1;
    });
    // Only the canvas starts a draw, so clicking the tuning panel never fires.
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) this.mouse.rightClicked = true;
      if (e.button !== 0) return;
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
  }

  /**
   * Gamepad (standard mapping): left stick move, right stick aim, RT draw,
   * A/B dodge, Y Arrow Volley, LT/LB gadgets 1/2, X use, Start pause. Call once per frame.
   */
  poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const gp = pads.find((p) => p && p.connected);
    if (!gp) {
      this.pad = null;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const prev = this.padPrev || [];
    const edge = (i) => btn(i) && !prev[i];
    const rx = dz(gp.axes[2] || 0);
    const ry = dz(gp.axes[3] || 0);
    this.pad = {
      move: { x: dz(gp.axes[0] || 0), y: -dz(gp.axes[1] || 0) },
      aim: rx || ry ? { x: rx, y: -ry } : null,
    };
    if (edge(0) || edge(1)) this.pressed.add('Space');
    if (edge(3)) this.pressed.add('KeyQ');
    if (edge(6)) this.pressed.add('Digit1');
    if (edge(4)) this.pressed.add('Digit2');
    if (edge(2)) this.pressed.add('KeyE');
    if (edge(9)) this.pressed.add('KeyP');
    const draw = btn(7) || (gp.buttons[7]?.value || 0) > 0.3 || btn(5);
    if (draw) {
      if (!this.mouse.down) this.mouse.clicked = true;
      this.mouse.down = true;
      this.padDrawing = true;
    } else if (this.padDrawing) {
      this.mouse.down = false;
      this.padDrawing = false;
    }
    this.padPrev = gp.buttons.map((b) => b.pressed);
  }

  /** Movement in screen space: x = right, y = up. Normalized (analog on a gamepad). */
  axis() {
    const m = this.pad?.move;
    if (m && (m.x || m.y)) {
      const len = Math.hypot(m.x, m.y);
      return len > 1 ? { x: m.x / len, y: m.y / len } : m;
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /** Dodge: Space, Shift or right mouse button. */
  dodgePressed() {
    return this.pressed.has('Space') || this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || this.mouse.rightClicked;
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
  }
}
