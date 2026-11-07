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
};

export function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    /* defaults */
  }
}

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
  r.shadowMap.enabled = q !== 'low';
  const shadowSize = q === 'high' ? 2048 : 1024;
  for (const light of [game.world?.sun]) {
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
    });
  }

  toggle(show = !this.open) {
    this.open = show;
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
      <label class="row"><span>Damage numbers</span><input type="checkbox" id="set-damageNumbers" data-k="damageNumbers" ${s.damageNumbers ? 'checked' : ''}><b></b></label>
      <p class="hint">Gamepad: left stick move · right stick aim · RT draw · A/B dodge · Y Arrow Volley · LT/LB gadgets · X use · Start pause</p>
      <button data-close>Done</button>`;
  }

  onInput(e) {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    settings[k] = v;
    const b = e.target.parentElement.querySelector('b');
    if (b && e.target.type === 'range') b.textContent = `${Math.round(v * 100)}%`;
    saveSettings();
    applySettings(this.game);
  }
}
