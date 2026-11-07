const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, ndcX: 0, ndcY: 0, down: false, clicked: false, rightClicked: false };

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
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

  /** Movement in screen space: x = right, y = up. Normalized. */
  axis() {
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
