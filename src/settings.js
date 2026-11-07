// Player settings: volume, graphics quality, screen shake, damage numbers.
// Saved in localStorage (guarded) and applied live.

const KEY = 'draw-release.settings.v1';

export const settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.9,
  quality: 'auto', // auto | high | medium | low
  shake: 1,
  damageNumbers: true,
  compatVersion: 2,
  compat: 0, // 0 normal, 1 no post-processing, 2 also no shadows (set by the black-screen guard)
};

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Build 55's guard could leave a compatibility level behind; start fresh once.
    if (saved.compatVersion !== 2) {
      saved.compat = 0;
      saved.compatVersion = 2;
    }
    Object.assign(settings, saved);
  } catch {
    /* defaults */
  }
}

export const saveSettingsNow = () => saveSettings();

function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** Push the current settings into the renderer, post-processing and audio. */
export function applySettings(game) {
  const s = settings;
  const sfx = game.sfx;
  if (sfx.master) sfx.master.gain.value = s.master;
  if (sfx.sfxBus) sfx.sfxBus.gain.value = 0.9 * s.sfx;
  if (sfx.voiceBus) sfx.voiceBus.gain.value = 0.85 * s.sfx;
  if (game.music.bus) game.music.bus.gain.value = 0.32 * s.music;
  const r = game.renderer;
  // Auto starts at medium and steps down if frames are slow (see Game.autoQuality).
  const q = s.quality === 'auto' ? game.perf?.level || 'medium' : s.quality;
  r.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : q === 'medium' ? Math.min(window.devicePixelRatio, 1.25) : 1);
  // Shadows stay on at every level (low just uses a small, cheap shadow map).
  // Switching shadows off mid-game needs every shader rebuilt; without that many
  // GPUs draw the whole scene black.
  const wantShadows = (s.compat || 0) < 2;
  if (r.shadowMap.enabled !== wantShadows) {
    r.shadowMap.enabled = wantShadows;
    for (const scene of [game.scene, game.camp?.scene]) {
      scene?.traverse((o) => {
        for (const m of [].concat(o.material || [])) m.needsUpdate = true;
      });
    }
  }
  const shadowSize = q === 'high' ? 2048 : q === 'medium' ? 1024 : 512;
  for (const light of [game.world?.sun, game.camp?.moon]) {
    if (light && light.shadow.mapSize.x !== shadowSize) {
      light.shadow.mapSize.set(shadowSize, shadowSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }
  game.ao.enabled = q === 'high';
  game.bloom.enabled = q !== 'low';
  game.onResize();
  document.body.classList.toggle('no-numbers', !s.damageNumbers);
}

/** Settings panel (gear button / O key). */
export class SettingsPanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('settings');
    this.btn = document.getElementById('settings-btn');
    this.btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.el.addEventListener('input', (e) => this.onInput(e));
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-close]')) this.toggle(false);
      const d = e.target.closest('[data-diag]');
      if (d) {
        const text = this.game.diagnosticReport();
        const done = () => (d.textContent = 'Copied!');
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => this.showDiag(text));
        else this.showDiag(text);
      }
    });
  }

  /** Fallback when the clipboard is blocked: show the report to select by hand. */
  showDiag(text) {
    let pre = this.el.querySelector('pre.diag');
    if (!pre) {
      pre = document.createElement('pre');
      pre.className = 'diag';
      this.el.querySelector('.diag-row').after(pre);
    }
    pre.textContent = text;
  }

  toggle(show = !this.open) {
    this.open = show;
    if (!show) document.activeElement?.blur?.(); // hand the keyboard back to the game
    if (show) this.render();
    this.el.classList.toggle('show', show);
    // Pause gameplay while the panel is open.
    if (show && this.game.state === 'playing') this.game.setPaused(true);
  }

  render() {
    const s = settings;
    const slider = (key, label) =>
      `<label class="row"><span>${label}</span><input type="range" id="set-${key}" data-k="${key}" min="0" max="1" step="0.05" value="${s[key]}"><b>${Math.round(s[key] * 100)}%</b></label>`;
    this.el.innerHTML = `
      <h2>Settings</h2>
      ${slider('master', 'Master volume')}
      ${slider('music', 'Music')}
      ${slider('sfx', 'Sound effects')}
      ${slider('shake', 'Screen shake')}
      <label class="row"><span>Graphics</span>
        <select id="set-quality" data-k="quality">
          ${['auto', 'high', 'medium', 'low'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
        </select><b></b></label>
      <label class="row"><span>Compatibility</span>
        <select id="set-compat" data-k="compat">
          ${[['0', 'Normal'], ['1', 'Simple (no effects)'], ['2', 'Safe (no shadows)']].map(([v, l]) => `<option value="${v}" ${String(s.compat || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select><b></b></label>
      <label class="row"><span>Damage numbers</span><input type="checkbox" id="set-damageNumbers" data-k="damageNumbers" ${s.damageNumbers ? 'checked' : ''}><b></b></label>
      <div class="row diag-row"><button data-diag>Copy diagnostics</button><span class="diag-note">Something wrong? Copy this and paste it to the developer.</span></div>
      <p class="hint">Gamepad: left stick move · right stick aim · RT draw · A/B dodge · Y Arrow Volley · LT/LB gadgets · X use · Start pause</p>
      <button data-close>Done</button>`;
  }

  onInput(e) {
    const k = e.target.dataset.k;
    if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    if (k === 'compat') v = Number(v);
    settings[k] = v;
    const b = e.target.parentElement.querySelector('b');
    if (b && e.target.type === 'range') b.textContent = `${Math.round(v * 100)}%`;
    saveSettings();
    applySettings(this.game);
  }
}
