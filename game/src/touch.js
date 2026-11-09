// Touch controls: floating left joystick, swipe-to-look on the rest of the screen,
// and an action-button cluster. Drives the same input object as keyboard/mouse.
export const IS_TOUCH = (() => {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches;
  } catch (e) { return false; }
})();

const LOOK_SENS = 1.7;   // multiplier on the desktop mouse sensitivity (per CSS pixel)
const JOY_R = 52;        // joystick travel radius in px

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.toggles = { sprint: false, crouch: false };
    this.hold = { jump: false, attack: false };
    this.joyId = null; this.lookId = null;
    this.joy = { x: 0, y: 0 };
    game.input.joy = this.joy;
    document.body.classList.add('touch');

    const layer = document.createElement('div');
    layer.id = 'touch-layer';
    layer.innerHTML = `
      <div id="joy-base"><div id="joy-knob"></div></div>
      <div id="touch-actions">
        <button class="tbtn big" data-act="attack" aria-label="Attack">⚔<small>Hit</small></button>
        <button class="tbtn" data-act="use" aria-label="Use">✋<small>Use</small></button>
        <button class="tbtn" data-act="jump" aria-label="Jump">⤒<small>Jump</small></button>
        <button class="tbtn toggle" data-act="sprint" aria-label="Sprint">»<small>Run</small></button>
        <button class="tbtn toggle" data-act="crouch" aria-label="Crouch">⤓<small>Sneak</small></button>
      </div>
      <div id="touch-top">
        <button class="tbtn sm" data-act="inv" aria-label="Inventory and crafting">🎒</button>
        <button class="tbtn sm" data-act="follow" aria-label="Tame follow or stay">🐾</button>
        <button class="tbtn sm" data-act="rotate" aria-label="Rotate building piece">⟳</button>
        <button class="tbtn sm" data-act="map" aria-label="World map">🗺️</button>
        <button class="tbtn sm" data-act="roster" aria-label="Your tames">🦖</button>
        <button class="tbtn sm" data-act="zoom" aria-label="Mount camera zoom">🔭</button>
      </div>`;
    document.getElementById('hud').appendChild(layer);
    this.layer = layer;
    this.base = layer.querySelector('#joy-base');
    this.knob = layer.querySelector('#joy-knob');

    // Look + joystick on the bare layer
    layer.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    layer.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    layer.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
    layer.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });

    // Buttons
    for (const b of layer.querySelectorAll('.tbtn')) {
      const act = b.dataset.act;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('down');
        this.press(act, b);
        // a button also lets you look by dragging from it (thumb-friendly attack + aim)
        if ((act === 'attack' || act === 'jump') && this.lookId === null) {
          const t = e.changedTouches[0]; this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY;
        }
      }, { passive: false });
      const up = (e) => {
        e.preventDefault(); e.stopPropagation();
        b.classList.remove('down');
        if (act === 'attack') this.hold.attack = false;
        if (act === 'jump') this.hold.jump = false;
        for (const t of e.changedTouches) if (t.identifier === this.lookId) this.lookId = null;
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); this.onMove(e); }, { passive: false });
    }

    // Stop the page from scrolling, zooming or bouncing while playing.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (!game.ui.open && e.target.closest && !e.target.closest('#title')) e.preventDefault(); }, { passive: false });
  }

  press(act, b) {
    const g = this.game;
    switch (act) {
      case 'attack': this.hold.attack = true; break;
      case 'jump': this.hold.jump = true; break;
      case 'use': g.interact(); break;
      case 'sprint': this.toggles.sprint = !this.toggles.sprint; if (this.toggles.sprint) this.toggles.crouch = false; break;
      case 'crouch': this.toggles.crouch = !this.toggles.crouch; if (this.toggles.crouch) this.toggles.sprint = false; break;
      case 'inv': g.toggleInventory(); break;
      case 'follow': g.toggleFollow(); break;
      case 'rotate': g.building.rotate(); break;
      case 'map': g.map.toggle(); break;
      case 'roster': g.roster.toggle(); break;
      case 'zoom': g.player.camDist = g.player.camDist > 10 ? 7 : 13; break;
    }
    this.syncToggles();
  }

  syncToggles() {
    for (const k of ['sprint', 'crouch']) this.layer.querySelector(`[data-act="${k}"]`).classList.toggle('on', this.toggles[k]);
  }

  onStart(e) {
    e.preventDefault();
    if (!this.game.started || this.game.ui.open) return;
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.42 && this.joyId === null) {
        this.joyId = t.identifier;
        this.jx = t.clientX; this.jy = t.clientY;
        this.base.style.left = `${t.clientX}px`; this.base.style.top = `${t.clientY}px`;
        this.base.classList.add('active');
        this.knob.style.transform = 'translate(-50%,-50%)';
      } else if (this.lookId === null) {
        this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY;
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        let dx = t.clientX - this.jx, dy = t.clientY - this.jy;
        const d = Math.hypot(dx, dy);
        if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
        this.joy.x = dx / JOY_R; this.joy.y = -dy / JOY_R;
        // small dead zone
        if (Math.hypot(this.joy.x, this.joy.y) < 0.12) { this.joy.x = 0; this.joy.y = 0; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === this.lookId) {
        this.game.input.mx += (t.clientX - this.lx) * LOOK_SENS;
        this.game.input.my += (t.clientY - this.ly) * LOOK_SENS;
        this.lx = t.clientX; this.ly = t.clientY;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this.joyId = null; this.joy.x = 0; this.joy.y = 0;
        this.base.classList.remove('active');
      }
      if (t.identifier === this.lookId) this.lookId = null;
    }
  }

  // Called every frame before the simulation reads input.
  apply() {
    const g = this.game, k = g.input.keys;
    g.locked = !g.ui.open && !g.map.open && !g.roster.open;
    if (g.ui.open || g.map.open || g.roster.open || !g.started) { this.joy.x = this.joy.y = 0; this.hold.attack = false; }
    k.ShiftLeft = this.toggles.sprint && this.joy.y > 0.3;
    k.KeyC = this.toggles.crouch;
    k.Space = this.hold.jump;
    g.input.mouseDown = this.hold.attack;
    this.layer.querySelector('[data-act="rotate"]').hidden = !(g.placement);
    this.layer.querySelector('[data-act="zoom"]').hidden = !g.player.mount;
  }
}
