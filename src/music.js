// Adaptive soundtrack, synthesized live with Web Audio (no audio files).
// Layers fade in and out with "intensity": 0 = calm (title, camp, between
// waves), ~0.5–0.8 = combat (scales with enemy count), 1 = boss.

/**
 * Each place has its own key, chords and tempo (two bars per chord).
 *   ruins – D minor, i–VI–III–VII; keep – A minor, slower and higher;
 *   forge – E phrygian, driving; camp – F major, gentle.
 */
const THEMES = {
  ruins: { bpm: 96, lift: 0, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]] },
  keep: { bpm: 84, lift: 12, chords: [[57, 60, 64], [50, 53, 57], [53, 57, 60], [52, 56, 59]] },
  forge: { bpm: 108, lift: 0, chords: [[52, 55, 59], [53, 57, 60], [55, 59, 62], [53, 57, 60]] },
  camp: { bpm: 80, lift: 0, chords: [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]] },
};
const THEME_BY_ARENA = ['ruins', 'keep', 'forge'];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.intensity = 0;
    this.target = 0;
    this.boss = false;
    this.started = false;
    this.step = 0;
    this.setTheme('camp');
  }

  /** Switch key, chords and tempo (an arena index or a theme name). Takes effect at the next bar. */
  setTheme(which) {
    const name = typeof which === 'number' ? THEME_BY_ARENA[which % THEME_BY_ARENA.length] : which;
    const th = THEMES[name] || THEMES.ruins;
    this.theme = name;
    this.chords = th.chords;
    this.lift = th.lift;
    this.stepDur = 60 / th.bpm / 2; // eighth notes
    if (this.delay) this.delay.delayTime.setTargetAtTime(this.stepDur * 3, this.sfx.ctx.currentTime, 0.5);
  }

  /** Call after the audio context exists (first click). */
  start() {
    if (this.started || !this.sfx.ctx) return;
    const c = this.sfx.ctx;
    this.started = true;
    this.bus = c.createGain();
    this.bus.gain.value = 0.32;
    this.bus.connect(this.sfx.master);
    const layer = (v = 0) => {
      const g = c.createGain();
      g.gain.value = v;
      g.connect(this.bus);
      return g;
    };
    this.layers = { pad: layer(0.5), arp: layer(0), drums: layer(0), bass: layer(0), brass: layer(0) };
    // A soft echo for the arp and brass, so the dungeon feels big.
    this.delay = c.createDelay(2);
    this.delay.delayTime.value = this.stepDur * 3;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const wet = c.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.bus);
    this.layers.arp.connect(this.delay);
    this.layers.brass.connect(this.delay);
    this.buildPad();
    this.nextTime = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  buildPad() {
    const c = this.sfx.ctx;
    this.padFilter = c.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 500;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.layers.pad);
    this.padVoices = [0, 1, 2].map(() => {
      const voices = [-7, 7].map((detune) => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = detune;
        const g = c.createGain();
        g.gain.value = 0.05;
        o.connect(g).connect(this.padFilter);
        o.start();
        return o;
      });
      return voices;
    });
    // Slow filter sweep keeps the drone alive.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 220;
    lfo.connect(lg).connect(this.padFilter.frequency);
    lfo.start();
  }

  setIntensity(v, boss = false) {
    this.target = Math.max(0, Math.min(1, v));
    this.boss = boss;
  }

  schedule() {
    const c = this.sfx.ctx;
    if (!c || c.state !== 'running') return;
    // Ease intensity and layer levels.
    this.intensity += (this.target - this.intensity) * 0.04;
    const I = this.intensity;
    const t0 = c.currentTime;
    const set = (g, v) => g.gain.setTargetAtTime(this.sfx.muted ? 0 : v, t0, 0.4);
    set(this.layers.pad, 0.5 - I * 0.15);
    set(this.layers.arp, 0.18 + I * 0.25);
    set(this.layers.drums, I > 0.25 ? Math.min(1, (I - 0.25) * 1.8) : 0);
    set(this.layers.bass, I > 0.45 ? Math.min(0.8, (I - 0.45) * 2) : 0);
    set(this.layers.brass, this.boss ? 0.5 : 0);
    this.padFilter.frequency.setTargetAtTime(500 + I * 900, t0, 0.6);

    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur * (this.boss ? 0.86 : 1); // the boss pushes the tempo
      this.step++;
    }
  }

  playStep(step, t) {
    const bar = Math.floor(step / 8);
    const chord = this.chords[Math.floor(bar / 2) % this.chords.length];
    const s = step % 8;
    // Chord change: retune the pad.
    if (s === 0 && bar % 2 === 0) {
      this.padVoices.forEach((voices, i) => voices.forEach((o) => o.frequency.setTargetAtTime(midi(chord[i] - 12), t, 0.3)));
      if (this.boss) this.brass(chord, t);
    }
    // Arp: sparse when calm, every eighth in combat.
    const I = this.intensity;
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    if (I > 0.3 || s % 2 === 0) {
      if (Math.random() < 0.55 + I * 0.45) this.pluck(midi(chord[pattern[s]] + 12 + this.lift + (s >= 4 && I > 0.6 ? 12 : 0)), t);
    }
    // Drums: taiko on 1 and the "and" of 3, snare on 2 and 4, extra hits when intense.
    if (I > 0.25) {
      if (s === 0 || s === 5 || (I > 0.7 && s === 7)) this.taiko(t, s === 0 ? 1 : 0.7);
      if (s === 2 || s === 6) this.snare(t);
      if (this.boss && s % 2 === 1) this.taiko(t, 0.45);
    }
    // Bass on eighths.
    if (I > 0.45) this.bass(midi(chord[0] - 24), t, s % 4 === 0 ? 1 : 0.6);
  }

  pluck(freq, t) {
    const c = this.sfx.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.layers.arp);
    o.start(t);
    o.stop(t + 0.55);
  }

  taiko(t, vel) {
    const c = this.sfx.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.layers.drums);
    o.start(t);
    o.stop(t + 0.55);
    this.noiseHit(t, 0.12 * vel, 0.08, 'lowpass', 900);
  }

  snare(t) {
    this.noiseHit(t, 0.14, 0.13, 'bandpass', 1800);
  }

  noiseHit(t, vol, dur, type, freq) {
    const c = this.sfx.ctx;
    const src = c.createBufferSource();
    src.buffer = this.sfx.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.layers.drums);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  bass(freq, t, vel) {
    const c = this.sfx.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(150, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(f).connect(g).connect(this.layers.bass);
    o.start(t);
    o.stop(t + 0.3);
  }

  brass(chord, t) {
    const c = this.sfx.ctx;
    for (const n of chord) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
      f.frequency.exponentialRampToValueAtTime(500, t + 1.2);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(f).connect(g).connect(this.layers.brass);
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  /** Short rising (win) or falling (loss) phrase over the current music. */
  stinger(win) {
    if (!this.started || this.sfx.muted) return;
    const c = this.sfx.ctx;
    const notes = win ? [62, 65, 69, 74] : [62, 58, 55, 50];
    notes.forEach((n, i) => {
      const t = c.currentTime + i * 0.13;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n + 12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.75);
    });
  }
}
