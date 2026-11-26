// Keyboard / mouse input with pointer lock and per-frame "just pressed" tracking.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.clicked = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.mouseX = 0; this.mouseY = 0;
    this.typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
    addEventListener('keydown', (e) => {
      if (this.typing()) return;
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (this.wantLock && !this.locked && e.button === 0) { canvas.requestPointerLock?.(); this.swallow = true; return; }
      this.buttons.add(e.button); this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => { this.buttons.delete(e.button); if (e.button === 0) this.swallow = false; });
    addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    this.wantLock = false;
  }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouse(b) { return this.buttons.has(b) && !this.swallow; }
  click(b) { return this.clicked.has(b) && !this.swallow; }
  unlock() { if (this.locked) document.exitPointerLock?.(); }
  endFrame() { this.pressed.clear(); this.clicked.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
