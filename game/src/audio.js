// Fully procedural audio — no asset files. Ambient ocean/wind/birds + SFX + creature calls.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);

    // reverb-ish send
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.25;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    let b = 0; for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; nd[i] = b * 3.5; }
    this.brown = nb;
    const wb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const wd = wb.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wb;

    // ocean: brown noise with slow swell LFO
    this.ocean = this.loopNoise(this.brown, 'lowpass', 500, 0.0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lg = ctx.createGain(); lg.gain.value = 0.12;
    lfo.connect(lg); lg.connect(this.ocean.gain.gain); lfo.start();
    // wind
    this.wind = this.loopNoise(this.white, 'bandpass', 700, 0.03);
    this.wind.filter.Q.value = 0.6;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.05;
    const lg2 = ctx.createGain(); lg2.gain.value = 300;
    lfo2.connect(lg2); lg2.connect(this.wind.filter.frequency); lfo2.start();
    // night crickets
    this.cricket = ctx.createGain(); this.cricket.gain.value = 0; this.cricket.connect(this.master);
    const co = ctx.createOscillator(); co.frequency.value = 4400; co.type = 'triangle';
    const am = ctx.createOscillator(); am.frequency.value = 28; const amg = ctx.createGain(); amg.gain.value = 0.5;
    const cg = ctx.createGain(); cg.gain.value = 0.5; am.connect(amg); amg.connect(cg.gain);
    co.connect(cg); cg.connect(this.cricket); co.start(); am.start();
    this.birdCd = 2;
  }

  loopNoise(buf, type, freq, vol) {
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = this.ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = freq;
    const gain = this.ctx.createGain(); gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(this.master); src.start();
    return { src, filter, gain };
  }

  // shoreDist: distance-ish to ocean; night 0..1; inWater bool
  ambience(dt, { shore, night, height, underwater }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ocean.gain.gain.setTargetAtTime(Math.max(0.03, 0.3 - shore * 0.004) * (underwater ? 0.3 : 1), t, 0.5);
    this.wind.gain.gain.setTargetAtTime(0.025 + Math.max(0, height) * 0.0012, t, 0.5);
    this.cricket.gain.setTargetAtTime(night * 0.012, t, 1);
    this.birdCd -= dt;
    if (this.birdCd <= 0) { this.birdCd = 3 + Math.random() * 8; if (night < 0.5) this.bird(); }
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  out(vol = 1, pan = 0, verb = 0.2) {
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
    if (verb) { const s = this.ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verb); }
    return g;
  }

  bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.04, Math.random() * 2 - 1, 0.5);
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      const st = t + i * 0.13;
      osc.frequency.setValueAtTime(base, st);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), st + 0.08);
      this.env(g, st, 0.01, 1, 0.09);
      osc.connect(g); g.connect(o); osc.start(st); osc.stop(st + 0.15);
    }
  }

  noiseHit({ freq = 800, q = 1, dur = 0.15, vol = 0.4, type = 'bandpass', pan = 0, verb = 0.15 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.white;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, 0.005, 1, dur);
    src.connect(f); f.connect(g); g.connect(this.out(vol, pan, verb));
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
  }

  tone({ f0 = 200, f1 = 100, dur = 0.2, vol = 0.3, type = 'sine', pan = 0, verb = 0.1 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.005, 1, dur);
    o.connect(g); g.connect(this.out(vol, pan, verb)); o.start(t); o.stop(t + dur + 0.05);
  }

  chop() { this.noiseHit({ freq: 600, q: 3, dur: 0.12, vol: 0.5 }); this.tone({ f0: 180, f1: 90, dur: 0.12, vol: 0.4, type: 'triangle' }); }
  mine() { this.noiseHit({ freq: 2500, q: 6, dur: 0.1, vol: 0.4 }); this.tone({ f0: 900, f1: 600, dur: 0.08, vol: 0.15, type: 'square' }); }
  rustle() { this.noiseHit({ freq: 3000, q: 0.5, dur: 0.25, vol: 0.25, type: 'highpass' }); }
  whoosh() { this.noiseHit({ freq: 1200, q: 0.7, dur: 0.18, vol: 0.12 }); }
  flesh() { this.noiseHit({ freq: 400, q: 1.5, dur: 0.15, vol: 0.5 }); this.tone({ f0: 120, f1: 60, dur: 0.15, vol: 0.4 }); }
  hurt() { this.tone({ f0: 300, f1: 140, dur: 0.25, vol: 0.25, type: 'sawtooth' }); this.noiseHit({ freq: 300, dur: 0.2, vol: 0.4 }); }
  pickup() { this.tone({ f0: 660, f1: 990, dur: 0.08, vol: 0.12, type: 'triangle', verb: 0 }); }
  craft() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone({ f0: f, f1: f, dur: 0.15, vol: 0.12, type: 'triangle' }), i * 70)); }
  build() { this.tone({ f0: 140, f1: 70, dur: 0.25, vol: 0.5, type: 'triangle' }); this.noiseHit({ freq: 500, dur: 0.2, vol: 0.4 }); }
  bowShot() { this.tone({ f0: 220, f1: 80, dur: 0.15, vol: 0.3, type: 'triangle' }); this.noiseHit({ freq: 2000, q: 1, dur: 0.12, vol: 0.2 }); }
  step(water) { this.noiseHit({ freq: water ? 900 : 350, q: 0.8, dur: 0.07, vol: water ? 0.12 : 0.07, type: water ? 'bandpass' : 'lowpass', verb: 0 }); }
  eat() { for (let i = 0; i < 3; i++) setTimeout(() => this.noiseHit({ freq: 1500, q: 2, dur: 0.05, vol: 0.2 }), i * 90); }
  tamed() { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.tone({ f0: f, f1: f, dur: 0.4, vol: 0.12, type: 'triangle', verb: 0.6 }), i * 120)); }
  splash() { this.noiseHit({ freq: 800, q: 0.5, dur: 0.4, vol: 0.3, type: 'lowpass' }); }

  // creature vocalisation: formant-ish growl scaled by size
  roar(size = 1, dist = 0, pan = 0, kind = 'roar') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = Math.max(0, 0.6 * (1 - dist / 140)) * Math.min(1.4, 0.4 + size * 0.3);
    if (vol <= 0.01) return;
    const dur = kind === 'chirp' ? 0.25 : 0.6 + size * 0.35;
    const base = kind === 'chirp' ? 900 / size : 260 / Math.sqrt(size);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.linearRampToValueAtTime(base, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 18 + Math.random() * 10;
    const vg = ctx.createGain(); vg.gain.value = base * 0.08; vib.connect(vg); vg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500 / Math.sqrt(size) + 200; f1.Q.value = 2;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1800 / Math.sqrt(size) + 400;
    const g = ctx.createGain(); this.env(g, t, 0.05, 1, dur);
    const n = ctx.createBufferSource(); n.buffer = this.white;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400 / size + 200; nf.Q.value = 1;
    const ng = ctx.createGain(); this.env(ng, t, 0.05, 0.6, dur);
    o.connect(f1); f1.connect(f2); f2.connect(g);
    n.connect(nf); nf.connect(ng);
    const out = this.out(vol, pan, 0.45);
    g.connect(out); ng.connect(out);
    o.start(t); vib.start(t); n.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  }
}
