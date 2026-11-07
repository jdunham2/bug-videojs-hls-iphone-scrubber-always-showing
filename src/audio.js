// Sound: recorded CC0 samples (Kenney.nl, see public/audio/LICENSE-kenney.txt)
// layered with a little Web Audio synthesis. If samples can't load, the synth
// versions still play, so the game is never silent.
//
// Samples come from window.__EMBEDDED_AUDIO = { manifest, files: { path: base64 } }
// when baked into a sandboxed page, otherwise from public/audio/manifest.json.

export const audioStatus = { state: 'idle', loaded: 0, total: 0, error: '' };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.drawNode = null;
    this.bank = {};
  }

  /** Create the audio graph and start decoding samples. Safe to call before any click. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      audioStatus.state = 'unsupported';
      return;
    }
    this.ctx = new AC();
    // A gentle compressor glues layered hits together and stops clipping.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.comp);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = 0.85;
    this.voiceBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
  }

  /** Call from a click/keypress: browsers only allow audio to start after one. */
  unlock() {
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  async loadSamples() {
    audioStatus.state = 'loading';
    try {
      const embedded = window.__EMBEDDED_AUDIO;
      const manifest = embedded ? embedded.manifest : await (await fetch('audio/manifest.json', { cache: 'no-cache' })).json();
      const jobs = [];
      for (const [name, files] of Object.entries(manifest)) {
        for (const file of files) {
          audioStatus.total++;
          jobs.push(
            this.decode(embedded ? embedded.files[file] : file, !!embedded)
              .then((buf) => {
                (this.bank[name] ||= []).push(buf);
                audioStatus.loaded++;
              })
              .catch((e) => {
                audioStatus.error = `${file}: ${e?.message || e}`;
              }),
          );
        }
      }
      await Promise.all(jobs);
      audioStatus.state = audioStatus.loaded ? 'ready' : 'failed';
    } catch (e) {
      audioStatus.state = 'failed';
      audioStatus.error = String(e?.message || e);
    }
  }

  async decode(src, isBase64) {
    let data;
    if (isBase64) {
      const bin = atob(src);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      data = bytes.buffer;
    } else {
      data = await (await fetch(src)).arrayBuffer();
    }
    // Promise form isn't in older Safari; wrap the callback form.
    return new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject));
  }

  get ok() {
    return this.ctx && !this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.drawStop();
    return this.muted;
  }

  /**
   * Play a random variant of a sample. Returns false if it isn't loaded,
   * so callers can fall back to a synth sound.
   * opts: { vol, rate, jitter (random pitch ±), pan (-1..1), delay, voice }
   */
  sample(name, opts = {}) {
    if (!this.ok) return false;
    const list = this.bank[name];
    if (!list?.length) return false;
    const { vol = 1, rate = 1, jitter = 0.06, pan = 0, delay = 0, voice = false } = opts;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = c.createGain();
    g.gain.value = vol;
    let node = src.connect(g);
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(voice ? this.voiceBus : this.sfxBus);
    src.start(c.currentTime + delay);
    return true;
  }

  // ------------------------------------------------------------ synth helpers

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
    o.connect(g).connect(this.sfxBus);
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
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ game sounds

  drawStart(drawTime) {
    if (!this.ok) return;
    this.drawStop();
    // A small wooden click as the arrow is nocked, then a soft leather-and-fibre
    // stretch (low filtered noise, nothing pitched) that thickens with the draw.
    this.sample('thunkWood', { vol: 0.07, rate: 2.4, jitter: 0.08 });
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.4;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + drawTime);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + drawTime);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    this.drawNode = { o: src, g };
  }

  /** Band-passed noise whose centre sweeps from `f0` to `f1` Hz: an airy "fwip". */
  sweep(vol, dur, f0, f1, pan = 0, q = 0.9) {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, vol, 0.004, dur);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    src.connect(f).connect(g);
    (p ? g.connect(p) : g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
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
    if (!this.sample('ding', { vol: 0.7, rate: 1.25, jitter: 0 })) {
      this.tone('sine', 1320, 1320, 0.16, 0.16);
    }
    this.tone('sine', 1980, 1980, 0.18, 0.05, 0.03);
  }

  release(charge, perfect, pan = 0) {
    if (!this.ok) return;
    // A bow shot is a dull string slap and a rush of air, not a note:
    //   slap: a very short low noise burst; body: a quick sub thump;
    //   air: a fast downward noise sweep, louder and longer with a full draw.
    this.noise(0.03, 0.22 + 0.2 * charge, 'lowpass', 900 + 500 * charge);
    this.tone('sine', 120 + 30 * charge, 45, 0.07, 0.18 + 0.12 * charge);
    this.sweep(0.1 + 0.08 * charge, 0.14 + 0.08 * charge, 4200, 700, pan);
    this.sample('whoosh', { vol: 0.12 + 0.22 * charge, rate: 1.7, pan });
    if (perfect) this.sample('ding', { vol: 0.3, rate: 1.8, jitter: 0, pan });
  }

  hit(perfect, pan = 0) {
    const ok = this.sample(perfect ? 'hitHeavy' : 'hit', { vol: perfect ? 1 : 0.8, pan });
    if (!ok) {
      this.tone('sine', 160, 50, 0.12, 0.4);
      this.noise(0.06, 0.3, 'lowpass', 1800);
    } else {
      this.tone('sine', 140, 45, 0.1, 0.2); // a touch of sub for weight
    }
    if (perfect) this.noise(0.12, 0.15, 'bandpass', 4000);
  }

  thunk(pan = 0) {
    if (!this.sample('thunkWood', { vol: 0.45, pan })) this.noise(0.05, 0.15, 'bandpass', 900);
  }

  arrowGround(pan = 0) {
    this.sample('thunkGround', { vol: 0.18, rate: 1.3, pan });
  }

  kill(pan = 0) {
    if (!this.sample('hitHeavy', { vol: 0.9, rate: 0.75, pan })) {
      this.noise(0.25, 0.3, 'lowpass', 900);
    }
    this.tone('square', 200, 50, 0.22, 0.05);
  }

  stagger(pan = 0) {
    if (!this.sample('clang', { vol: 0.6, pan })) this.tone('square', 520, 260, 0.1, 0.08);
  }

  windup(pan = 0) {
    this.tone('sawtooth', 70, 120, 0.3, 0.05);
    this.sample('whoosh', { vol: 0.15, rate: 0.6, pan });
  }

  lunge(pan = 0) {
    if (!this.sample('whoosh', { vol: 0.4, rate: 0.75, pan })) this.noise(0.15, 0.14, 'bandpass', 600);
  }

  slam(pan = 0) {
    this.sample('slam', { vol: 0.45, rate: 0.85, pan });
  }

  hurt() {
    if (!this.sample('hitHeavy', { vol: 1, rate: 0.65 })) this.noise(0.2, 0.3, 'lowpass', 700);
    this.tone('sawtooth', 300, 80, 0.25, 0.15);
  }

  dodge() {
    if (!this.sample('whoosh', { vol: 0.5, rate: 1.1 })) {
      this.noise(0.18, 0.2, 'bandpass', 1400);
    }
    this.sample('step', { vol: 0.3, rate: 0.9, delay: 0.18 });
  }

  perfectDodge() {
    this.tone('sine', 520, 1560, 0.35, 0.12);
    this.sample('ding', { vol: 0.6, rate: 1.6, jitter: 0 });
    this.noise(0.3, 0.1, 'highpass', 5000);
  }

  step(pan = 0, heavy = false) {
    this.sample('step', { vol: heavy ? 0.22 : 0.16, rate: heavy ? 0.7 : 1.05, jitter: 0.1, pan });
  }

  zap(pan = 0) {
    if (!this.sample('zap', { vol: 0.5, pan })) this.tone('square', 1800, 300, 0.14, 0.06);
    this.noise(0.12, 0.15, 'highpass', 3000);
  }

  freeze(pan = 0) {
    if (!this.sample('freeze', { vol: 0.6, rate: 1.2, pan })) this.tone('sine', 1800, 2600, 0.2, 0.1);
  }

  megaReady() {
    this.tone('sawtooth', 110, 220, 0.25, 0.06);
    this.sample('ding', { vol: 0.5, rate: 0.8, jitter: 0 });
  }

  megaRelease() {
    this.sample('boom', { vol: 0.9, rate: 0.8 });
    this.tone('sine', 90, 30, 0.45, 0.35);
  }

  ultimateCast() {
    this.sample('bell', { vol: 0.7, rate: 1.3, jitter: 0 });
    this.sample('ding', { vol: 0.6, rate: 0.7, jitter: 0, delay: 0.05 });
    this.sample('boom', { vol: 0.5, rate: 0.7, jitter: 0, delay: 0.5 });
    this.tone('sine', 300, 1400, 0.6, 0.1);
    this.noise(0.8, 0.12, 'highpass', 3000, 0.3);
  }

  ultimateReady() {
    this.sample('ding', { vol: 0.5, rate: 1.0, jitter: 0 });
    this.sample('ding', { vol: 0.4, rate: 1.5, jitter: 0, delay: 0.12 });
  }

  bossRoar() {
    this.tone('sawtooth', 70, 38, 1.2, 0.12);
    this.tone('square', 52, 30, 1.1, 0.06, 0.05);
    this.noise(1.0, 0.18, 'lowpass', 500);
    this.sample('boom', { vol: 0.6, rate: 0.45, jitter: 0 });
  }

  bossSlam() {
    this.sample('slam', { vol: 1, rate: 0.6 });
    this.sample('boom', { vol: 0.8, rate: 0.55 });
    this.tone('sine', 70, 24, 0.6, 0.45);
  }

  uiHover() {
    this.sample('uiSelect', { vol: 0.35, jitter: 0.02 });
  }

  pick() {
    if (!this.sample('uiConfirm', { vol: 0.6, jitter: 0 })) {
      this.tone('triangle', 523, 523, 0.12, 0.12);
      this.tone('triangle', 784, 784, 0.25, 0.12, 0.1);
    }
  }

  reroll() {
    this.sample('uiSwitch', { vol: 0.5, jitter: 0 });
  }

  wave(n) {
    if (!this.sample('bell', { vol: 0.55, rate: 0.9, jitter: 0 })) {
      this.tone('triangle', 392, 392, 0.15, 0.13);
      this.tone('triangle', 659, 659, 0.3, 0.13, 0.2);
    }
    if (n === 1) this.sample('vFight', { vol: 0.9, jitter: 0, delay: 0.35, voice: true });
  }

  cleared(flawless) {
    if (!this.sample('jingleClear', { vol: 0.6, jitter: 0 })) {
      this.tone('sine', 523, 523, 0.12, 0.12);
      this.tone('sine', 784, 784, 0.3, 0.12, 0.1);
    }
    if (flawless) this.sample('vFlawless', { vol: 0.9, jitter: 0, delay: 0.5, voice: true });
  }

  runStart() {
    this.sample('vPrepare', { vol: 0.9, jitter: 0, voice: true });
  }

  combo() {
    this.sample('vCombo', { vol: 0.85, jitter: 0, voice: true });
  }

  multiKill() {
    this.sample('vMultiKill', { vol: 0.85, jitter: 0, voice: true });
  }

  gameOver() {
    if (!this.sample('jingleOver', { vol: 0.6, jitter: 0 })) this.tone('triangle', 330, 110, 0.9, 0.2);
    this.sample('vGameOver', { vol: 0.9, jitter: 0, delay: 0.6, voice: true });
  }
}
