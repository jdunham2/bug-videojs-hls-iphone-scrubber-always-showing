// Player settings, kept per viewer in browser storage (a convenience; defaults apply when absent).
const KEY = 'iotp-settings';
export const DEFAULTS = { volume: 70, music: 50, sens: 1, invert: false, smooth: null, bob: true, shake: true, fov: 72, shadows: true, grass: true, minimap: true, fps: false };

export function loadSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { ...DEFAULTS }; }
}

export class Settings {
  constructor(game) {
    this.game = game;
    this.v = loadSettings();
    this.el = document.getElementById('settings');
    this.form = document.getElementById('settings-form');
    this.open = false;
    this.fpsEl = document.getElementById('fps');
    this.frames = 0; this.fpsT = 0;
    this.form.addEventListener('input', () => this.read());
    this.form.addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('settings-close').addEventListener('click', () => this.toggle(false));
    document.getElementById('settings-reset').addEventListener('click', () => { this.v = { ...DEFAULTS }; this.fill(); this.apply(); this.store(); });
    document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(true); }));
    this.fill();
    this.apply();
  }

  fill() {
    const f = this.form.elements;
    f.volume.value = this.v.volume; f.music.value = this.v.music; f.sens.value = this.v.sens; f.fov.value = this.v.fov;
    f.invert.checked = this.v.invert; f.smooth.checked = this.smoothOn(); f.bob.checked = this.v.bob; f.shake.checked = this.v.shake; f.shadows.checked = this.v.shadows; f.grass.checked = this.v.grass;
    f.minimap.checked = this.v.minimap; f.fps.checked = this.v.fps;
    this.labels();
  }

  labels() {
    document.getElementById('lbl-volume').textContent = `${this.v.volume}%`;
    document.getElementById('lbl-music').textContent = `${this.v.music}%`;
    document.getElementById('lbl-sens').textContent = `${Number(this.v.sens).toFixed(1)}×`;
    document.getElementById('lbl-fov').textContent = `${this.v.fov}°`;
  }

  read() {
    const f = this.form.elements;
    this.v = {
      volume: +f.volume.value, music: +f.music.value, sens: +f.sens.value, fov: +f.fov.value, invert: f.invert.checked,
      smooth: f.smooth.checked, bob: f.bob.checked, shake: f.shake.checked,
      shadows: f.shadows.checked, grass: f.grass.checked, minimap: f.minimap.checked, fps: f.fps.checked,
    };
    this.labels();
    this.apply();
    this.store();
  }

  // smoothing defaults on for touch screens (uneven swipe events), off for mice (no added latency)
  smoothOn() { return this.v.smooth === null || this.v.smooth === undefined ? document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches : this.v.smooth; }

  store() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) { /* storage blocked */ } }

  apply() {
    const g = this.game, v = this.v;
    g.input.sens = v.sens;
    g.input.invert = v.invert;
    g.input.smooth = this.smoothOn();
    g.input.bob = v.bob;
    g.camera.fov = v.fov; g.camera.updateProjectionMatrix();
    if (g.env.sun.castShadow !== v.shadows) g.env.sun.castShadow = v.shadows;
    if (g.world.grass) g.world.grass.visible = v.grass;
    document.getElementById('minimap').hidden = !v.minimap;
    this.fpsEl.hidden = !v.fps;
    g.audio.setVolume?.(v.volume / 100);
    g.music?.setVolume(v.music / 100);
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('show', this.open);
    const g = this.game;
    if (!g.started) return;
    g.input.keys = {};
    if (this.open) { if (g.noLock) g.locked = false; }
    else if (!g.paused) g.lock();
  }

  tick(dt) {
    if (!this.v.fps) return;
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fpsEl.textContent = `${Math.round(this.frames / this.fpsT)} FPS`; this.frames = 0; this.fpsT = 0; }
  }
}
