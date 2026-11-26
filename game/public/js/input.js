// Input: rebindable keyboard actions, mouse with pointer lock, and gamepad support.
export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dodge: 'ShiftLeft',
  skill1: 'Digit1', skill2: 'Digit2', skill3: 'Digit3', skill4: 'Digit4', potion: 'KeyR', interact: 'KeyE',
  lockon: 'KeyV', emote: 'KeyT', mount: 'KeyM', quests: 'KeyJ', social: 'KeyO', inventory: 'KeyI', talents: 'KeyK', build: 'KeyB', chat: 'Enter', help: 'KeyH', upgrade: 'KeyU',
};
export const ACTION_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', jump: 'Jump', dodge: 'Dodge roll',
  skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3', skill4: 'Skill 4', potion: 'Drink potion', interact: 'Interact',
  lockon: 'Lock-on target', emote: 'Emote wheel (hold)', mount: 'Summon mount', quests: 'Quest log', social: 'Social (friends, guild, bounties)', inventory: 'Inventory', talents: 'Talents', build: 'Build mode', chat: 'Chat', help: 'Help', upgrade: 'Upgrade structure',
};
// gamepad (standard mapping) -> action
const PAD = { 0: 'jump', 1: 'dodge', 2: 'attack', 3: 'interact', 4: 'skill1', 5: 'skill2', 6: 'skill3', 7: 'skill4', 8: 'inventory', 9: 'menu', 10: 'emote', 11: 'lockon', 12: 'potion', 13: 'talents', 14: 'build' };

export const keyName = (code) => (code || '').replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'RShift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space').replace('Arrow', '');

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set(); this.released = new Set();
    this.buttons = new Set(); this.clicked = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false; this.mouseX = 0; this.mouseY = 0;
    this.bindings = { ...DEFAULT_BINDINGS };
    this.sens = 1; this.invertY = false;
    this.pad = { connected: false, moveX: 0, moveY: 0, down: new Set(), pressed: new Set(), prev: new Set() };
    this.touch = { moveX: 0, moveY: 0, down: new Set(), pressed: new Set() };
    this.capture = null; // key-rebind capture callback
    this.typing = () => document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb(e.code); return; }
      if (this.typing()) return;
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (this.wantLock && !this.locked && !this.lockFailed && e.button === 0) {
        this.swallow = true;
        try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => { this.lockFailed = true; this.swallow = false; }); } catch (err) { this.lockFailed = true; this.swallow = false; }
        return;
      }
      this.buttons.add(e.button); this.clicked.add(e.button);
      if (e.button === 1) e.preventDefault();
    });
    addEventListener('mouseup', (e) => { this.buttons.delete(e.button); if (e.button === 0) this.swallow = false; });
    addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.locked || (this.lockFailed && this.buttons.has(2))) { this.dx += e.movementX * this.sens; this.dy += e.movementY * this.sens * (this.invertY ? -1 : 1); }
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; this.swallow = false; });
    addEventListener('gamepadconnected', () => { this.pad.connected = true; this.onPad?.(true); });
    addEventListener('gamepaddisconnected', () => { this.pad.connected = false; this.onPad?.(false); });
    this.wantLock = false;
  }
  // raw keys
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouse(b) { return this.buttons.has(b) && !this.swallow; }
  click(b) { return this.clicked.has(b) && !this.swallow; }
  // actions (keyboard binding OR gamepad)
  act(name) { return this.keys.has(this.bindings[name]) || (name === 'dodge' && this.keys.has('ShiftRight')) || this.pad.down.has(name) || this.touch.down.has(name); }
  actHit(name) { return this.pressed.has(this.bindings[name]) || (name === 'dodge' && this.pressed.has('ShiftRight')) || this.pad.pressed.has(name) || this.touch.pressed.has(name); }
  actUp(name) { return this.released.has(this.bindings[name]) || (this.pad.prev.has(name) && !this.pad.down.has(name)); }
  attackHeld() { return this.mouse(0) || this.pad.down.has('attack') || this.touch.down.has('attack'); }
  moveAxes() {
    let x = 0, y = 0;
    if (this.act('forward') || this.down('ArrowUp')) y += 1;
    if (this.act('back') || this.down('ArrowDown')) y -= 1;
    if (this.act('right') || this.down('ArrowRight')) x += 1;
    if (this.act('left') || this.down('ArrowLeft')) x -= 1;
    x += this.pad.moveX + this.touch.moveX; y += this.pad.moveY + this.touch.moveY;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
  pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((g) => g && g.connected);
    const pad = this.pad;
    pad.prev = new Set(pad.down); pad.down.clear(); pad.pressed.clear(); pad.moveX = pad.moveY = 0;
    if (!gp) return;
    pad.connected = true;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    pad.moveX = dz(gp.axes[0] || 0); pad.moveY = -dz(gp.axes[1] || 0);
    this.dx += dz(gp.axes[2] || 0) * 900 * dt * this.sens;
    this.dy += dz(gp.axes[3] || 0) * 600 * dt * this.sens * (this.invertY ? -1 : 1);
    gp.buttons.forEach((b, i) => { const a = PAD[i]; if (a && (b.pressed || b.value > 0.5)) pad.down.add(a); });
    for (const a of pad.down) if (!pad.prev.has(a)) pad.pressed.add(a);
  }
  unlock() { if (this.locked) document.exitPointerLock?.(); }
  endFrame() { this.touch.pressed.clear(); this.pressed.clear(); this.released.clear(); this.clicked.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
