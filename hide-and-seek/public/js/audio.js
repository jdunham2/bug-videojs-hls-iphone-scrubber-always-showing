// Tiny synthesised sound kit — no audio files needed.
export class Sfx {
  constructor() { this.ctx = null; }
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.nbuf = this.ctx.createBuffer(1, len, len);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise(dur, vol, freq, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.nbuf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  step(loud) { this.noise(0.09, loud ? 0.22 : 0.08, loud ? 420 : 260, 1.2); }
  coin() { this.tone(988, 0.08, { type: 'square', vol: 0.12 }); this.tone(1319, 0.25, { type: 'square', vol: 0.12, delay: 0.08 }); }
  ping(v = 1) { this.tone(660, 0.35, { type: 'triangle', vol: 0.18 * v, slide: 300 }); }
  heart() { this.tone(58, 0.16, { vol: 0.5, slide: -20 }); this.tone(50, 0.18, { vol: 0.35, slide: -15, delay: 0.19 }); }
  horn() { this.tone(196, 0.9, { type: 'sawtooth', vol: 0.14 }); this.tone(294, 0.9, { type: 'sawtooth', vol: 0.1 }); }
  caught() { this.tone(440, 0.5, { type: 'sawtooth', vol: 0.2, slide: -330 }); this.noise(0.3, 0.3, 900); }
  freed() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.09 })); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.12, delay: i * 0.12 })); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.2, delay: i * 0.16 })); }
  stun() { this.noise(0.4, 0.4, 300); this.tone(140, 0.4, { type: 'square', vol: 0.15, slide: -80 }); }
  swing() { this.noise(0.15, 0.2, 1400, 0.6); }
  thud() { this.noise(0.25, 0.4, 180); }
  taunt() { [700, 900, 700, 1000].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.12, delay: i * 0.1 })); }
  click() { this.tone(520, 0.05, { type: 'square', vol: 0.08 }); }
}
