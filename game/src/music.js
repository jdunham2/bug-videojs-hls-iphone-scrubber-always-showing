// Procedural adaptive score. Three layers mixed by game state:
//  - pads + sparse melody (major by day, minor at night)
//  - danger: drums and a driving bass when something is hunting you
//  - boss: heavier drums and brass-like stabs
const ROOT = 146.83; // D3
const PROG_DAY = [[0, 4, 7, 11], [7, 11, 14, 18], [9, 12, 16, 19], [5, 9, 12, 16]];
const PROG_NIGHT = [[0, 3, 7, 10], [-2, 2, 5, 9], [3, 7, 10, 14], [-4, 0, 3, 7]];
const PENTA_DAY = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const PENTA_NIGHT = [0, 3, 5, 7, 10, 12, 15, 17, 19];
const hz = (semi, oct = 0) => ROOT * Math.pow(2, semi / 12 + oct);
const BPM = 96, STEP = 60 / BPM / 4; // 16th notes

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.5;
    this.night = 0; this.danger = 0; this.boss = 0;
    this.targetDanger = 0; this.targetBoss = 0;
    this.started = false;
  }

  start() {
    const a = this.audio;
    if (this.started || !a.ctx) return;
    this.started = true;
    const ctx = this.ctx = a.ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = this.volume * 0.55;
    this.bus.connect(a.master);
    // shared echo for melody
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 6;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.35;
    this.delay.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.bus);
    this.padBus = ctx.createGain(); this.padBus.gain.value = 0.9; this.padBus.connect(this.bus);
    this.padBus.connect(a.verb);
    this.dangerBus = ctx.createGain(); this.dangerBus.gain.value = 0; this.dangerBus.connect(this.bus);
    this.bossBus = ctx.createGain(); this.bossBus.gain.value = 0; this.bossBus.connect(this.bus);
    this.next = ctx.currentTime + 0.2;
    this.step = 0; this.chord = 0;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  setVolume(v) { this.volume = v; if (this.bus) this.bus.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.2); }

  // called every frame from the game
  update(dt, { night, danger, boss }) {
    this.night = night; this.targetDanger = danger; this.targetBoss = boss;
    const k = Math.min(1, dt * (danger > this.danger ? 1.2 : 0.25));
    this.danger += (this.targetDanger - this.danger) * k;
    this.boss += (this.targetBoss - this.boss) * Math.min(1, dt * 0.8);
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.dangerBus.gain.setTargetAtTime(Math.max(this.danger, this.boss * 0.8) * 0.9, t, 0.3);
    this.bossBus.gain.setTargetAtTime(this.boss * 0.8, t, 0.3);
    this.padBus.gain.setTargetAtTime(0.9 - Math.max(this.danger, this.boss) * 0.45, t, 0.5);
  }

  schedule() {
    const ctx = this.ctx;
    while (this.next < ctx.currentTime + 0.25) {
      const s = this.step % 128; // 8 bars of 16ths
      const tm = this.next;
      const night = this.night > 0.5;
      if (s % 32 === 0) { this.chord = (this.chord + 1) % 4; this.pad(tm, night); }
      // melody: sparse, more by day, never during heavy combat
      if (s % 4 === 0 && Math.random() < (night ? 0.12 : 0.22) * (1 - this.danger)) this.pluck(tm, night);
      if (this.danger > 0.02 || this.boss > 0.02) this.drums(tm, s);
      if (this.boss > 0.02 && s % 16 === 0) this.stab(tm, night);
      this.next += STEP; this.step++;
    }
  }

  env(g, t, a, peak, hold, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  pad(t, night) {
    const ctx = this.ctx;
    const notes = (night ? PROG_NIGHT : PROG_DAY)[this.chord];
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = night ? 650 : 1300; f.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, t, 2.5, 0.08, STEP * 32 - 2.5, 3.5);
    f.connect(g); g.connect(this.padBus);
    for (const n of notes) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = hz(n, night ? -1 : 0); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + STEP * 32 + 4);
    }
    // soft bass note
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = hz(notes[0], -1);
    const bg = ctx.createGain(); this.env(bg, t, 1.5, 0.12, STEP * 32 - 1.5, 2.5);
    b.connect(bg); bg.connect(this.padBus); b.start(t); b.stop(t + STEP * 32 + 3);
  }

  pluck(t, night) {
    const ctx = this.ctx;
    const scale = night ? PENTA_NIGHT : PENTA_DAY;
    const n = scale[Math.floor(Math.random() * scale.length)];
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(n, 1);
    const g = ctx.createGain(); this.env(g, t, 0.005, 0.07, 0, 1.4);
    o.connect(g); g.connect(this.bus); g.connect(this.delay);
    o.start(t); o.stop(t + 1.6);
  }

  drums(t, s) {
    const ctx = this.ctx, a = this.audio;
    const out = this.boss > 0.3 ? this.bossBus : this.dangerBus;
    const kick = s % 8 === 0 || (s % 16 === 10) || (this.boss > 0.3 && s % 4 === 0);
    if (kick) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      const g = ctx.createGain(); this.env(g, t, 0.003, 0.9, 0, 0.3);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
    }
    if (s % 8 === 4) { // tom / snare-ish
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.18);
      const g = ctx.createGain(); this.env(g, t, 0.003, 0.4, 0, 0.22);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
      const n = ctx.createBufferSource(); n.buffer = a.white;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
      const ng = ctx.createGain(); this.env(ng, t, 0.002, 0.25, 0, 0.12);
      n.connect(f); f.connect(ng); ng.connect(out); n.start(t, Math.random()); n.stop(t + 0.2);
    }
    if (s % 2 === 0) { // hats
      const n = ctx.createBufferSource(); n.buffer = a.white;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain(); this.env(g, t, 0.001, s % 4 === 0 ? 0.08 : 0.04, 0, 0.04);
      n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random()); n.stop(t + 0.08);
    }
    if (s % 2 === 0) { // driving bass ostinato
      const pat = [0, 0, 12, 0, 7, 0, 10, 0];
      const notes = (this.night > 0.5 ? PROG_NIGHT : PROG_DAY)[this.chord];
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(notes[0] + pat[(s / 2) % 8], -2);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 4;
      const g = ctx.createGain(); this.env(g, t, 0.005, 0.18, STEP * 0.8, 0.08);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + STEP * 2);
    }
  }

  stab(t, night) {
    const ctx = this.ctx;
    const notes = (night ? PROG_NIGHT : PROG_DAY)[this.chord];
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    const g = ctx.createGain(); this.env(g, t, 0.02, 0.12, 0.15, 0.5);
    f.connect(g); g.connect(this.bossBus);
    for (const n of notes.slice(0, 3)) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n, -1); o.connect(f); o.start(t); o.stop(t + 0.9); }
  }
}
