// Tiny synthesized sound kit (Web Audio). No asset files needed for the prototype.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.drawNode = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  get ok() {
    return this.ctx && !this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.drawStop();
    return this.muted;
  }

  env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, vol, 0.005, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, vol, type = 'lowpass', freq = 1000, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    this.env(g, t, vol, 0.003, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  drawStart(drawTime) {
    if (!this.ok) return;
    this.drawStop();
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(150, t + drawTime);
    f.type = 'lowpass';
    f.frequency.value = 500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + drawTime);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    this.drawNode = { o, g };
  }

  drawStop() {
    if (!this.drawNode || !this.ctx) return;
    const { o, g } = this.drawNode;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.01);
    o.stop(t + 0.06);
    this.drawNode = null;
  }

  perfectReady() {
    this.tone('sine', 1320, 1320, 0.16, 0.16);
    this.tone('sine', 1980, 1980, 0.22, 0.1, 0.04);
  }
  release(charge, perfect) {
    this.tone('triangle', 200 + 220 * charge, 80, 0.12, 0.25);
    this.noise(0.07 + 0.07 * charge, 0.22, 'highpass', 2500);
    if (perfect) this.tone('square', 880, 1760, 0.12, 0.05);
  }
  hit(perfect) {
    this.tone('sine', 160, 50, 0.12, 0.4);
    this.noise(0.06, 0.3, 'lowpass', 1800);
    if (perfect) {
      this.tone('sawtooth', 700, 200, 0.15, 0.1);
      this.noise(0.15, 0.22, 'bandpass', 4000);
    }
  }
  thunk() {
    this.noise(0.05, 0.15, 'bandpass', 900);
  }
  kill() {
    this.noise(0.25, 0.3, 'lowpass', 900);
    this.tone('square', 220, 55, 0.25, 0.08);
  }
  stagger() {
    this.tone('square', 520, 260, 0.1, 0.08);
  }
  windup() {
    this.tone('sawtooth', 70, 120, 0.3, 0.05);
  }
  lunge() {
    this.noise(0.15, 0.14, 'bandpass', 600);
  }
  hurt() {
    this.tone('sawtooth', 300, 80, 0.25, 0.22);
    this.noise(0.2, 0.3, 'lowpass', 700);
  }
  dodge() {
    this.noise(0.18, 0.2, 'bandpass', 1400);
    this.tone('sine', 300, 140, 0.15, 0.06);
  }
  perfectDodge() {
    this.tone('sine', 520, 1560, 0.35, 0.14);
    this.tone('triangle', 1040, 2080, 0.4, 0.06, 0.05);
    this.noise(0.3, 0.12, 'highpass', 5000);
  }
  zap() {
    this.noise(0.12, 0.2, 'highpass', 3000);
    this.tone('square', 1800, 300, 0.14, 0.06);
  }
  freeze() {
    this.tone('sine', 1800, 2600, 0.2, 0.1);
    this.noise(0.25, 0.15, 'highpass', 6000);
  }
  megaReady() {
    this.tone('sawtooth', 110, 220, 0.25, 0.08);
    this.tone('sine', 440, 880, 0.3, 0.1, 0.05);
  }
  megaRelease() {
    this.tone('sine', 90, 30, 0.45, 0.4);
    this.noise(0.3, 0.3, 'lowpass', 1200);
  }
  pick() {
    this.tone('triangle', 523, 523, 0.12, 0.12);
    this.tone('triangle', 659, 659, 0.12, 0.12, 0.08);
    this.tone('triangle', 784, 784, 0.12, 0.12, 0.16);
    this.tone('triangle', 1047, 1047, 0.35, 0.12, 0.24);
  }
  wave() {
    this.tone('triangle', 392, 392, 0.15, 0.13);
    this.tone('triangle', 523, 523, 0.15, 0.13, 0.12);
    this.tone('triangle', 659, 659, 0.3, 0.13, 0.24);
  }
  cleared() {
    this.tone('sine', 523, 523, 0.12, 0.12);
    this.tone('sine', 784, 784, 0.3, 0.12, 0.1);
  }
  gameOver() {
    this.tone('triangle', 330, 110, 0.9, 0.2);
  }
}
