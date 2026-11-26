// Fully synthesized sound effects and ambience (no audio files needed).
class Sfx {
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.55;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 1.5;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.amb = null;
  }
  get ok() { return !!this.ctx && this.ctx.state !== 'closed'; }
  tone(freq, dur, type = 'sine', vol = 0.2, slide = null, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol = 0.3, f0 = 1000, f1 = 1000, type = 'bandpass', delay = 0, q = 1) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  swing(heavy) { this.noise(heavy ? 0.28 : 0.17, 0.22, 600, heavy ? 2200 : 4200, 'bandpass', 0, 1.5); }
  hit(crit) { this.noise(0.12, 0.5, 1800, 200, 'lowpass'); this.tone(140, 0.12, 'square', 0.12, 50); if (crit) this.tone(1200, 0.18, 'triangle', 0.12, 2200); }
  hurt() { this.tone(260, 0.22, 'sawtooth', 0.16, 80); this.noise(0.15, 0.25, 900, 200, 'lowpass'); }
  enemyDie() { this.noise(0.45, 0.3, 900, 80, 'lowpass'); this.tone(180, 0.35, 'triangle', 0.1, 50); }
  coin() { this.tone(1568, 0.07, 'square', 0.05); this.tone(2093, 0.14, 'square', 0.05, null, 0.06); }
  loot(r) {
    const base = [440, 523, 587, 659, 784][r] || 440;
    const n = 2 + r;
    for (let i = 0; i < n; i++) this.tone(base * Math.pow(1.26, i), 0.25 + r * 0.05, 'triangle', 0.08 + r * 0.02, null, i * 0.07);
    if (r >= 3) this.tone(base / 2, 1.2, 'sine', 0.15, base, 0);
  }
  slam() { this.noise(0.7, 0.7, 500, 40, 'lowpass'); this.tone(80, 0.6, 'sine', 0.5, 28); }
  dash() { this.noise(0.25, 0.22, 3000, 500, 'bandpass', 0, 0.8); }
  jump() { this.noise(0.12, 0.08, 400, 900, 'bandpass'); }
  portal() { this.tone(180, 1.3, 'sine', 0.2, 900); this.tone(270, 1.3, 'sine', 0.12, 1300, 0.1); this.noise(1.2, 0.18, 300, 3000, 'bandpass'); }
  levelUp() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.14, null, i * 0.09)); }
  bell() { [196, 392, 494, 784, 1175].forEach((f, i) => this.tone(f, 3.5 - i * 0.4, 'sine', 0.22 / (i + 1))); }
  build() { this.noise(0.18, 0.4, 600, 120, 'lowpass'); this.tone(120, 0.15, 'square', 0.1, 70); this.tone(240, 0.1, 'square', 0.05, null, 0.08); }
  buy() { this.coin(); this.tone(880, 0.3, 'triangle', 0.1, null, 0.12); }
  potion() { [600, 800, 1000].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.1, f * 1.3, i * 0.06)); }
  bolt() { this.tone(900, 0.25, 'sawtooth', 0.05, 300); }
  arrow() { this.noise(0.1, 0.12, 3000, 6000, 'highpass'); }
  boss() { this.tone(55, 2.5, 'sawtooth', 0.18, 40); this.noise(2, 0.15, 200, 60, 'lowpass'); }
  victory() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.12, null, i * 0.12)); }
  horn() { this.tone(110, 1.6, 'sawtooth', 0.12, 104); this.tone(165, 1.6, 'sawtooth', 0.08, 156); }

  ambience(kind) {
    if (!this.ok) return;
    const c = this.ctx;
    if (this.amb) { const old = this.amb; old.g.gain.setTargetAtTime(0, c.currentTime, 0.6); setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }), 3000); }
    const presets = { town: [[110, 0.02], [164.8, 0.015], [220, 0.008]], night: [[73.4, 0.03], [110, 0.02], [155.6, 0.012]], dungeon: [[55, 0.04], [82.4, 0.02], [58, 0.02]], dark: [[49, 0.04], [69.3, 0.03], [98, 0.02], [51, 0.02]] };
    const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'town' ? 900 : 500; f.connect(g);
    const nodes = [];
    for (const [freq, vol] of presets[kind] || presets.town) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = (Math.random() - 0.5) * 14;
      const og = c.createGain(); og.gain.value = vol;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.1;
      const lg = c.createGain(); lg.gain.value = vol * 0.6; lfo.connect(lg); lg.connect(og.gain);
      o.connect(og); og.connect(f); o.start(); lfo.start(); nodes.push(o, lfo);
    }
    // wind / air
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = kind === 'dungeon' ? 300 : 700; nf.Q.value = 0.6;
    const ng = c.createGain(); ng.gain.value = kind === 'dungeon' ? 0.03 : 0.025;
    n.connect(nf); nf.connect(ng); ng.connect(g); n.start(); nodes.push(n);
    g.gain.setTargetAtTime(1, c.currentTime, 1.2);
    this.amb = { g, nodes, kind };
  }
}

export const sfx = new Sfx();
