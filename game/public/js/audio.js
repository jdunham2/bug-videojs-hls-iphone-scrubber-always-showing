// Fully synthesized sound effects + a procedural adaptive music system (WebAudio, no files).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Music themes: root (MIDI), scale, chord progression (scale degrees), tempo, and which layers play.
const THEMES = {
  town: { bpm: 84, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 5, 4], layers: { pad: 0.05, arp: 0.035, bass: 0.05, kick: 0.05, hat: 0.012, bell: 0.02 }, arp: [0, 2, 4, 2, 4, 6, 4, 2] },
  dungeon: { bpm: 68, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], layers: { pad: 0.055, pluck: 0.05, bass: 0.06, heart: 0.09, drone: 0.03 } },
  night: { bpm: 118, root: 40, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6], layers: { ostinato: 0.06, tom: 0.12, kick: 0.11, snare: 0.05, brass: 0.045, pad: 0.03 } },
  dark: { bpm: 60, root: 49, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 6], layers: { choir: 0.05, bell: 0.03, drone: 0.045, heart: 0.05 } },
  boss: { bpm: 142, root: 38, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 4], layers: { ostinato: 0.07, kick: 0.13, snare: 0.07, tom: 0.1, brass: 0.06, hat: 0.02 } },
};

class Sequencer {
  constructor(audio, theme, bus) {
    this.a = audio; this.T = THEMES[theme]; this.name = theme; this.bus = bus;
    this.step = 0; this.next = audio.ctx.currentTime + 0.1; this.alive = true;
  }
  chordAt(bar) {
    const T = this.T, deg = T.prog[bar % T.prog.length];
    return [0, 2, 4].map((k) => { const i = deg + k; return T.root + T.scale[i % 7] + 12 * Math.floor(i / 7); });
  }
  schedule(until) {
    const T = this.T, spb = 60 / T.bpm / 4; // 16th note
    while (this.next < until) {
      const s = this.step, t = this.next, bar = Math.floor(s / 16), b = s % 16, L = T.layers, ch = this.chordAt(bar);
      const A = this.a, out = this.bus;
      if (L.pad && b === 0) A.pad(ch.map((n) => NOTE(n + 12)), spb * 16, L.pad, t, out);
      if (L.choir && b === 0) A.choir(ch.map((n) => NOTE(n + 12)), spb * 16, L.choir, t, out);
      if (L.drone && b === 0 && bar % 2 === 0) A.drone(NOTE(T.root - 12), spb * 32, L.drone, t, out);
      if (L.bass && (b === 0 || b === 10)) A.bass(NOTE(ch[0] - 12), spb * (b === 0 ? 8 : 4), L.bass, t, out);
      if (L.ostinato && b % 2 === 0) A.bass(NOTE(ch[(b / 2) % 4 === 3 ? 2 : 0] - 12 + (b % 8 === 4 ? 12 : 0)), spb * 1.6, L.ostinato, t, out, 1400);
      if (L.arp && b % 2 === 0) { const deg = T.arp[(b / 2) % T.arp.length] + T.prog[bar % T.prog.length]; A.pluck(NOTE(T.root + 24 + T.scale[deg % 7] + 12 * Math.floor(deg / 7)), spb * 3, L.arp, t, out); }
      if (L.pluck && Math.random() < (b % 4 === 0 ? 0.45 : 0.08)) A.pluck(NOTE(ch[Math.floor(Math.random() * 3)] + 24), spb * 6, L.pluck, t, out);
      if (L.bell && b === 8 && Math.random() < 0.6) A.bell(NOTE(ch[2] + 24), 2.5, L.bell, t, out);
      if (L.brass && (b === 0 || (b === 6 && bar % 2 === 1))) A.brass(ch.map((n) => NOTE(n)), spb * 3, L.brass, t, out);
      if (L.kick && (b === 0 || b === 8 || (T.bpm > 100 && b === 11))) A.kick(L.kick, t, out);
      if (L.snare && (b === 4 || b === 12)) A.snare(L.snare, t, out);
      if (L.hat && b % 2 === 1) A.hat(L.hat, t, out);
      if (L.tom && (b === 14 || b === 15 || (bar % 4 === 3 && b >= 12))) A.tom(L.tom, t, out, b);
      if (L.heart && (b === 0 || b === 3)) A.kick(L.heart * (b === 0 ? 1 : 0.6), t, out, 70);
      this.step++; this.next += spb;
    }
  }
}

class Sfx {
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this._vol?.master ?? 0.8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this._vol?.sfx ?? 0.85; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this._vol?.music ?? 0.55; this.musicBus.connect(this.master);
    // shared reverb for music
    const len = c.sampleRate * 2.5, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
    this.verb = c.createConvolver(); this.verb.buffer = ir;
    const vg = c.createGain(); vg.gain.value = 0.35; this.verb.connect(vg); vg.connect(this.musicBus);
    const nlen = c.sampleRate * 1.5;
    this.noiseBuf = c.createBuffer(1, nlen, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) d[i] = Math.random() * 2 - 1;
    this.seqs = [];
    setInterval(() => { if (!this.ok) return; const until = c.currentTime + 0.15; for (const s of this.seqs) if (s.alive) s.schedule(until); }, 40);
  }
  get ok() { return !!this.ctx && this.ctx.state !== 'closed'; }
  setVolumes(v) {
    this._vol = v;
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05); this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05); this.musicBus.gain.setTargetAtTime(v.music, t, 0.05);
  }

  // ---- music ----
  music(theme) {
    if (!this.ok || this.curTheme === theme) return;
    this.curTheme = theme;
    const c = this.ctx, t = c.currentTime;
    for (const s of this.seqs) { s.bus.gain.setTargetAtTime(0, t, 0.8); const ss = s; setTimeout(() => { ss.alive = false; ss.bus.disconnect(); this.seqs = this.seqs.filter((x) => x !== ss); }, 4000); }
    if (!THEMES[theme]) return;
    const bus = c.createGain(); bus.gain.value = 0; bus.connect(this.musicBus); bus.connect(this.verb);
    bus.gain.setTargetAtTime(1, t + 0.3, 1.0);
    this.seqs.push(new Sequencer(this, theme, bus));
  }
  env(g, t, a, peak, dur, rel = 0.3) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(a, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
  }
  osc(type, f, t, dur, g, detune = 0) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(g); o.start(t); o.stop(t + dur + 0.6); return o; }
  pad(freqs, dur, vol, t, out) {
    const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.connect(g); g.connect(out);
    this.env(g, t, dur * 0.3, vol, dur, dur * 0.25);
    for (const fr of freqs) { this.osc('sawtooth', fr, t, dur, f, -9); this.osc('sawtooth', fr, t, dur, f, 9); }
  }
  choir(freqs, dur, vol, t, out) {
    const c = this.ctx, g = c.createGain(); g.connect(out);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650; f1.Q.value = 4; f1.connect(g);
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 5; f2.connect(g);
    this.env(g, t, dur * 0.35, vol * 3, dur, dur * 0.3);
    for (const fr of freqs) for (const det of [-12, 0, 12]) { this.osc('sawtooth', fr, t, dur, f1, det); this.osc('sawtooth', fr, t, dur, f2, det + 5); }
  }
  drone(f, dur, vol, t, out) { const g = this.ctx.createGain(); g.connect(out); this.env(g, t, dur * 0.3, vol, dur, dur * 0.3); this.osc('sine', f, t, dur, g); this.osc('triangle', f * 1.5, t, dur, g, 4); }
  bass(f, dur, vol, t, out, cut = 500) {
    const c = this.ctx, g = c.createGain(), fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut, t); fl.frequency.exponentialRampToValueAtTime(cut * 0.4, t + dur); fl.connect(g); g.connect(out);
    this.env(g, t, 0.01, vol, dur, 0.08); this.osc('sawtooth', f, t, dur, fl); this.osc('square', f / 2, t, dur, fl);
  }
  pluck(f, dur, vol, t, out) { const g = this.ctx.createGain(); g.connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); this.osc('triangle', f, t, dur, g); this.osc('sine', f * 2, t, dur * 0.5, g); }
  bell(f, dur, vol, t, out) { const g = this.ctx.createGain(); g.connect(out); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); for (const [m, k] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) { const gg = this.ctx.createGain(); gg.gain.value = k; gg.connect(g); this.osc('sine', f * m, t, dur, gg); } }
  brass(freqs, dur, vol, t, out) {
    const c = this.ctx, g = c.createGain(), fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(2600, t + 0.08); fl.frequency.exponentialRampToValueAtTime(900, t + dur); fl.connect(g); g.connect(out);
    this.env(g, t, 0.03, vol, dur, 0.12); for (const fr of freqs) { this.osc('sawtooth', fr, t, dur, fl, -6); this.osc('sawtooth', fr, t, dur, fl, 6); }
  }
  kick(vol, t, out, f0 = 130) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35); }
  tom(vol, t, out, b) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = 180 - (b % 4) * 22; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.25); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4); }
  snare(vol, t, out) { this.noiseAt(0.18, vol, 1800, 900, 'bandpass', t, out); const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 190; g.gain.setValueAtTime(vol * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15); }
  hat(vol, t, out) { this.noiseAt(0.05, vol, 8000, 9000, 'highpass', t, out); }
  noiseAt(dur, vol, f0, f1, type, t, out, q = 1) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---- sfx ----
  tone(freq, dur, type = 'sine', vol = 0.2, slide = null, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol = 0.3, f0 = 1000, f1 = 1000, type = 'bandpass', delay = 0, q = 1) { if (this.ok) this.noiseAt(dur, vol, f0, f1, type, this.ctx.currentTime + delay, this.sfxBus, q); }
  swing(heavy) { this.noise(heavy ? 0.28 : 0.17, 0.22, 600, heavy ? 2200 : 4200, 'bandpass', 0, 1.5); }
  hit(crit) { this.noise(0.12, 0.5, 1800, 200, 'lowpass'); this.tone(140, 0.12, 'square', 0.12, 50); if (crit) this.tone(1200, 0.18, 'triangle', 0.12, 2200); }
  hurt() { this.tone(260, 0.22, 'sawtooth', 0.16, 80); this.noise(0.15, 0.25, 900, 200, 'lowpass'); }
  enemyDie() { this.noise(0.45, 0.3, 900, 80, 'lowpass'); this.tone(180, 0.35, 'triangle', 0.1, 50); }
  coin() { this.tone(1568, 0.07, 'square', 0.05); this.tone(2093, 0.14, 'square', 0.05, null, 0.06); }
  loot(r) {
    const base = [440, 523, 587, 659, 784][r] || 440;
    for (let i = 0; i < 2 + r; i++) this.tone(base * Math.pow(1.26, i), 0.25 + r * 0.05, 'triangle', 0.08 + r * 0.02, null, i * 0.07);
    if (r >= 3) this.tone(base / 2, 1.2, 'sine', 0.15, base, 0);
  }
  slam() { this.noise(0.7, 0.7, 500, 40, 'lowpass'); this.tone(80, 0.6, 'sine', 0.5, 28); }
  dash() { this.noise(0.3, 0.22, 2500, 400, 'bandpass', 0, 0.8); }
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
  roar() { this.tone(90, 1.6, 'sawtooth', 0.25, 50); this.tone(135, 1.4, 'sawtooth', 0.15, 70, 0.05); this.noise(1.6, 0.35, 900, 150, 'bandpass', 0, 2); }
  victory() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.12, null, i * 0.12)); }
  horn() { this.tone(110, 1.6, 'sawtooth', 0.12, 104); this.tone(165, 1.6, 'sawtooth', 0.08, 156); }
  block(perfect) { this.tone(perfect ? 1400 : 700, 0.25, 'square', 0.12, perfect ? 2400 : 400); this.noise(0.12, 0.4, 3000, 800, 'bandpass'); }
  perfect() { this.tone(1800, 0.6, 'sine', 0.15, 600); this.tone(2400, 0.5, 'sine', 0.1, 900, 0.05); this.noise(0.6, 0.2, 6000, 500, 'bandpass'); }
  fire() { this.noise(0.5, 0.35, 1200, 200, 'lowpass'); this.tone(220, 0.3, 'sawtooth', 0.06, 90); }
  explode() { this.noise(0.8, 0.6, 1500, 60, 'lowpass'); this.tone(70, 0.6, 'sine', 0.4, 30); }
  zap() { for (let i = 0; i < 4; i++) this.noise(0.08, 0.3, 5000, 1500, 'bandpass', i * 0.05, 3); this.tone(1200, 0.3, 'square', 0.06, 200); }
  blink() { this.tone(1600, 0.2, 'sine', 0.15, 200); this.noise(0.2, 0.2, 5000, 1000, 'bandpass'); }
  whirl() { this.noise(0.9, 0.25, 500, 2500, 'bandpass', 0, 2); }
  summon() { [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.1, f * 1.5, i * 0.08)); }
  lever(ok) { this.noise(0.2, 0.4, 400, 200, 'lowpass'); this.tone(ok ? 660 : 180, 0.4, ok ? 'triangle' : 'sawtooth', 0.12, ok ? 990 : 90, 0.1); }
  gate() { this.noise(2, 0.4, 200, 60, 'lowpass'); this.tone(60, 2, 'sawtooth', 0.15, 40); }
  shrine() { [523, 784, 1046, 1568].forEach((f, i) => this.tone(f, 1.2, 'sine', 0.1, null, i * 0.1)); }
  goblin() { [900, 1200, 800, 1300, 700].forEach((f, i) => this.tone(f, 0.1, 'square', 0.05, f * 0.8, i * 0.08)); }
  web() { this.noise(0.4, 0.2, 2000, 600, 'bandpass', 0, 4); }
  style(rank) { this.tone(400 + rank * 180, 0.35, 'triangle', 0.12, 800 + rank * 300); }
  pop() { this.tone(900, 0.12, 'sine', 0.1, 1400); }
  click() { this.tone(1200, 0.04, 'square', 0.04); }
}

export const sfx = new Sfx();
