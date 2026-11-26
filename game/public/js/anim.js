// Keyframed animation clips + a small blending state machine for humanoid rigs.
// Clips are authored as sparse keyframes over named joint channels; the Animator blends a synced
// locomotion layer (idle / run / sprint) with crossfaded action states and an additive hit layer.

// channel -> [joint, property, axis]; values are offsets from the rest pose (except where noted)
const CH = {
  hy: ['hips', 'position', 'y'], hry: ['hips', 'rotation', 'y'],
  sx: ['spine', 'rotation', 'x'], sy: ['spine', 'rotation', 'y'], sz: ['spine', 'rotation', 'z'],
  hx: ['head', 'rotation', 'x'], hdy: ['head', 'rotation', 'y'],
  alx: ['armL', 'rotation', 'x'], alz: ['armL', 'rotation', 'z'], arx: ['armR', 'rotation', 'x'], arz: ['armR', 'rotation', 'z'],
  flx: ['foreL', 'rotation', 'x'], frx: ['foreR', 'rotation', 'x'],
  llx: ['legL', 'rotation', 'x'], lrx: ['legR', 'rotation', 'x'], llz: ['legL', 'rotation', 'z'], lrz: ['legR', 'rotation', 'z'],
  slx: ['shinL', 'rotation', 'x'], srx: ['shinR', 'rotation', 'x'],
  bx: ['body', 'rotation', 'x'], by: ['body', 'position', 'y'], bz: ['body', 'position', 'z'],
};
const KEYS = Object.keys(CH);
const REST = { alz: -0.08, arz: 0.08, flx: -0.25, frx: -0.25 };
const UPPER = new Set(['sx', 'sy', 'sz', 'hx', 'hdy', 'alx', 'alz', 'arx', 'arz', 'flx', 'frx']);
const neutral = () => { const p = {}; for (const k of KEYS) p[k] = REST[k] || 0; return p; };

const smooth = (t) => t * t * (3 - 2 * t);
class Clip {
  constructor(name, dur, keys, { loop = false, ease = smooth } = {}) {
    this.name = name; this.dur = dur; this.loop = loop; this.ease = ease;
    // fill every channel on every key (missing -> rest) so sampling is a plain lerp
    this.keys = keys.map(([t, v]) => { const p = neutral(); Object.assign(p, v); return [t, p]; });
    if (loop && this.keys.at(-1)[0] < 1) this.keys.push([1, this.keys[0][1]]);
  }
  /** sample at normalized phase 0..1 into out */
  sample(ph, out) {
    const K = this.keys;
    ph = this.loop ? ((ph % 1) + 1) % 1 : Math.max(0, Math.min(1, ph));
    let i = 0; while (i < K.length - 2 && K[i + 1][0] <= ph) i++;
    const [t0, a] = K[i], [t1, b] = K[Math.min(i + 1, K.length - 1)];
    const k = t1 > t0 ? this.ease(Math.max(0, Math.min(1, (ph - t0) / (t1 - t0)))) : 0;
    for (const c of KEYS) out[c] = a[c] + (b[c] - a[c]) * k;
    return out;
  }
}

// ---- authored clips ----
const runKeys = (A, lean, arm, fore, bob) => [
  [0, { llx: A, lrx: -A, slx: 0.15, srx: 0.95 * A / 0.8, alx: -arm, arx: arm, flx: fore, frx: fore, hy: bob * 0.3, hry: 0.12, sx: lean, sy: -0.12 }],
  [0.25, { llx: 0, lrx: 0.1, slx: 1.15, srx: 0.25, alx: 0, arx: 0, flx: fore, frx: fore, hy: bob, sx: lean + 0.02 }],
  [0.5, { llx: -A, lrx: A, slx: 0.95 * A / 0.8, srx: 0.15, alx: arm, arx: -arm, flx: fore, frx: fore, hy: bob * 0.3, hry: -0.12, sx: lean, sy: 0.12 }],
  [0.75, { llx: 0.1, lrx: 0, slx: 0.25, srx: 1.15, alx: 0, arx: 0, flx: fore, frx: fore, hy: bob, sx: lean + 0.02 }],
];
const ATK = [
  { B: { arx: -2.5, arz: -0.5, sy: 0.7, sx: -0.1, frx: -0.6, alx: 0.4 }, C: { arx: 0.5, arz: 0.5, sy: -0.7, sx: 0.25, frx: 0, alx: -0.3, llx: -0.45, lrx: 0.35, slx: 0.5, hy: -0.05 } },
  { B: { arx: -1.5, arz: 1.3, sy: -1.0, frx: -0.3, alx: -0.5 }, C: { arx: -1.4, arz: -0.9, sy: 1.1, sx: 0.15, frx: 0, alx: 0.4, lrx: -0.4, llx: 0.3, srx: 0.5, hy: -0.04 } },
  { B: { arx: -3.1, sy: 0.1, sx: -0.35, frx: -0.4, alx: -3.0, hy: 0.04 }, C: { arx: -0.1, sx: 0.55, frx: 0, alx: -0.2, llx: -0.6, lrx: 0.5, slx: 0.7, srx: 0.6, hy: -0.12 } },
];
function rollKeys() {
  const out = [];
  for (let i = 0; i <= 8; i++) {
    const r = i / 8, e = r < 0.5 ? 2 * r * r : 1 - Math.pow(-2 * r + 2, 2) / 2, th = e * Math.PI * 2, h = 0.6;
    out.push([r, { bx: th, by: h - h * Math.cos(th) - Math.sin(Math.PI * r) * 0.25, bz: -h * Math.sin(th), llx: -1.4, lrx: -1.4, slx: 2, srx: 2, alx: -0.6, arx: -0.6 }]);
  }
  return out;
}
const linear = (t) => t;
export const CLIPS = {
  idle: new Clip('idle', 3.2, [
    [0, { sx: 0.02, alz: -0.1, arz: 0.1 }],
    [0.5, { hy: -0.018, sx: 0.055, hx: 0.03, alz: -0.15, arz: 0.15, alx: 0.04, arx: 0.04 }],
  ], { loop: true }),
  run: new Clip('run', 0.62, runKeys(0.8, 0.12, 0.6, -0.35, 0.07), { loop: true, ease: linear }),
  sprint: new Clip('sprint', 0.62, runKeys(1.15, 0.38, 1.0, -1.35, 0.1), { loop: true, ease: linear }),
  atk0: new Clip('atk0', 1, [[0, {}], [0.35, ATK[0].B], [0.55, ATK[0].C], [1, {}]]),
  atk1: new Clip('atk1', 1, [[0, {}], [0.35, ATK[1].B], [0.55, ATK[1].C], [1, {}]]),
  atk2: new Clip('atk2', 1, [[0, {}], [0.35, ATK[2].B], [0.55, ATK[2].C], [1, {}]]),
  slam: new Clip('slam', 1, [[0, {}], [0.45, { arx: -3.2, alx: -3.2, sx: -0.3, hy: 0.06, frx: -0.3, flx: -0.3 }], [0.57, { arx: -0.2, alx: -0.2, sx: 0.55, hy: -0.14, llx: -0.6, lrx: 0.5, slx: 0.9, srx: 0.8 }], [0.8, { sx: 0.35, hy: -0.1, llx: -0.5, lrx: 0.4, slx: 0.7, srx: 0.6 }], [1, {}]]),
  roll: new Clip('roll', 1, rollKeys(), { ease: linear }),
  death: new Clip('death', 1, [[0, {}], [0.22, { sx: -0.45, hx: -0.3, alx: -0.9, arx: -0.9, alz: -0.5, arz: 0.5, hy: -0.05 }], [0.6, { bx: -1.45, sx: -0.2, alx: -1.6, arx: -1.4, llx: -0.6, slx: 0.9, alz: -0.9, arz: 0.9 }], [1, { bx: -1.5, by: -0.32, sx: -0.05, alx: -2.4, arx: -2.2, alz: -1.3, arz: 1.3, llx: -0.2, slx: 0.3, hx: 0.25 }]]),
  hit: new Clip('hit', 1, [[0, { sx: 0, hx: 0, alz: 0, arz: 0, flx: 0, frx: 0 }], [0.3, { sx: -0.38, hx: -0.25, alx: -0.35, arx: -0.35, hy: -0.04, alz: -0.2, arz: 0.2, flx: 0, frx: 0 }], [1, { alz: 0, arz: 0, flx: 0, frx: 0 }]]),
  air: new Clip('air', 1, [[0, { llx: -0.6, lrx: 0.3, slx: 1.0, srx: 0.5, alx: -0.5, arx: -0.3, alz: -0.45, arz: 0.45, sx: 0.08 }]]),
  block: new Clip('block', 1, [[0, { alx: -1.35, alz: 0.85, flx: -1.2, sx: 0.18, llx: -0.25, lrx: 0.3, slx: 0.35, srx: 0.3, hy: -0.06 }]]),
  cast: new Clip('cast', 1, [[0, { arx: -1.6, alx: -1.6, flx: -0.2, frx: -0.2, sx: -0.05 }]]),
  channel: new Clip('channel', 1, [[0, { arx: -1.55, arz: 1.2, alx: -1.55, alz: -1.2, sx: 0.1 }]]),
  dash: new Clip('dash', 1, [[0, { sx: 0.55, alx: 0.9, arx: 0.9, llx: 0.5, lrx: -0.7, slx: 0.4, srx: 0.9 }]]),
  mount: new Clip('mount', 0.9, [[0, { llx: -1.3, lrx: -1.3, slx: 1.4, srx: 1.4, llz: -0.35, lrz: 0.35, sx: 0.08, alx: -0.55, arx: -0.55, flx: -0.7, frx: -0.7 }], [0.5, { llx: -1.3, lrx: -1.3, slx: 1.4, srx: 1.4, llz: -0.35, lrz: 0.35, sx: 0.16, alx: -0.65, arx: -0.65, flx: -0.6, frx: -0.6, hy: -0.03 }]], { loop: true }),
  wave: new Clip('wave', 0.6, [[0, { arx: -2.9, arz: 0.3, frx: -0.4 }], [0.5, { arx: -2.9, arz: 0.78, frx: -0.4 }]], { loop: true }),
  cheer: new Clip('cheer', 0.9, [[0, { arx: -2.9, alx: -2.9, arz: 0.4, alz: -0.4 }], [0.5, { arx: -3.0, alx: -3.0, arz: 0.5, alz: -0.5, hy: 0.22, llx: -0.3, lrx: -0.3, slx: 0.6, srx: 0.6 }]], { loop: true }),
  dance: new Clip('dance', 1.0, [[0, { hry: 0.5, sy: -0.7, arx: -0.3, alx: -2.7, hy: 0.0 }], [0.25, { hry: 0, sy: 0, arx: -1.5, alx: -1.5, hy: 0.1, llx: -0.4, slx: 0.8 }], [0.5, { hry: -0.5, sy: 0.7, arx: -2.7, alx: -0.3 }], [0.75, { hry: 0, sy: 0, arx: -1.5, alx: -1.5, hy: 0.1, lrx: -0.4, srx: 0.8 }]], { loop: true }),
  bow: new Clip('bow', 1, [[0, { sx: 0.95, arx: 0.4, alx: -0.6, alz: 0.6, hx: 0.2 }]]),
  laugh: new Clip('laugh', 0.3, [[0, { sx: -0.25, arx: -0.4, alx: -0.4, arz: 0.9, alz: -0.9 }], [0.5, { sx: -0.15, arx: -0.45, alx: -0.45, arz: 0.95, alz: -0.95, hy: -0.02 }]], { loop: true }),
  point: new Clip('point', 1, [[0, { arx: -1.6, frx: 0, sy: -0.15 }]]),
  taunt: new Clip('taunt', 0.8, [[0, { arx: -1.2, alx: -0.4, sx: -0.15 }], [0.5, { arx: -0.8, alx: -0.4, sx: -0.2, frx: -1.2 }]], { loop: true }),
};
const LOOPED = new Set(['mount', 'wave', 'cheer', 'dance', 'laugh', 'taunt']);

const tmpA = neutral(), tmpB = neutral(), tmpC = neutral();
const mix = (out, a, b, w) => { for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * w; return out; };

export class Animator {
  constructor() {
    this.phase = 0; this.lt = null; this.t = 0;
    this.action = null; this.actionT = 0;
    this.fromPose = neutral(); this.fade = 1; this.fadeDur = 0.12;
    this.out = neutral(); this.loco = neutral(); this.act = neutral();
    this.sprintW = 0; this.runW = 0; this.hitW = 0;
    this.state = 'idle';
  }
  /** pick the action state from the animation inputs; returns [name, phase|null, weight, upperOnly] */
  pick(s) {
    if (s.dead > 0) return ['death', s.dead, 1, false];
    if (s.roll > 0) return ['roll', s.roll, 1, false];
    if (s.slam >= 0) return ['slam', s.slam, 1, false];
    if (s.atk >= 0) return ['atk' + ((s.combo || 0) % 3), s.atk, 1, s.move > 0.25];
    if (s.dash) return ['dash', 0, 1, false];
    if (s.channel) return ['channel', 0, 1, s.move > 0.25];
    if (s.block) return ['block', 0, 1, s.move > 0.25];
    if (s.cast > 0) return ['cast', 0, s.cast, true];
    if (s.mount) return ['mount', null, 1, false];
    if (s.air) return ['air', 0, 1, false];
    if (s.emote && CLIPS[s.emote]) return [s.emote, LOOPED.has(s.emote) ? null : 0, 1, false];
    return [null, 0, 0, false];
  }
  update(rig, s) {
    const dt = this.lt == null ? 0 : Math.max(0, Math.min(0.1, s.t - this.lt)); this.lt = s.t; this.t += dt;
    const mv = Math.min(1.4, s.move || 0);
    // locomotion layer: idle <-> run <-> sprint, all sharing one synced cycle phase
    this.runW += (Math.min(1, mv) - this.runW) * Math.min(1, dt * 10);
    this.sprintW += ((s.sprint ? 1 : 0) - this.sprintW) * Math.min(1, dt * 5);
    const rate = (0.55 + 0.75 * Math.min(1, mv)) * (1 + 0.15 * this.sprintW);
    this.phase += (dt / CLIPS.run.dur) * rate;
    CLIPS.idle.sample(this.t / CLIPS.idle.dur, tmpA);
    CLIPS.run.sample(this.phase, tmpB);
    if (this.sprintW > 0.01) { CLIPS.sprint.sample(this.phase, tmpC); mix(tmpB, tmpB, tmpC, this.sprintW); }
    mix(this.loco, tmpA, tmpB, smooth(Math.min(1, this.runW)));
    // action layer with crossfades on state change
    const [name, ph, w, upper] = this.pick(s);
    if (name !== this.action) {
      Object.assign(this.fromPose, this.out);
      this.fade = 0; this.fadeDur = name && name.startsWith('atk') ? 0.06 : name === 'death' ? 0.15 : 0.12;
      this.action = name; this.actionT = 0;
    }
    this.actionT += dt;
    let target = this.loco;
    if (name) {
      const C = CLIPS[name];
      C.sample(ph == null ? this.actionT / C.dur : ph, this.act);
      if (upper) for (const k of KEYS) if (!UPPER.has(k)) this.act[k] = this.loco[k];
      target = w < 1 ? mix(tmpC, this.loco, this.act, w) : this.act;
    }
    this.fade = Math.min(1, this.fade + dt / this.fadeDur);
    mix(this.out, this.fromPose, target, smooth(this.fade));
    // additive hit reaction
    this.hitW = Math.max(s.hurt || 0, this.hitW - dt * 4);
    if (this.hitW > 0.01 && !(s.dead > 0)) { CLIPS.hit.sample(1 - this.hitW, tmpA); for (const k of KEYS) this.out[k] += (tmpA[k] - (REST[k] || 0)) * Math.min(1, this.hitW * 1.5); }
    this.state = name || (this.sprintW > 0.5 ? 'sprint' : this.runW > 0.3 ? 'run' : 'idle');
    this.apply(rig);
    return this.out;
  }
  apply(rig) {
    const P = rig.P, o = this.out;
    for (const k of KEYS) {
      const [j, prop, ax] = CH[k];
      const node = j === 'body' ? rig.body : P[j];
      if (!node) continue;
      if (j === 'hips' && prop === 'position') node.position.y = 0.9 + o[k];
      else node[prop][ax] = o[k];
    }
  }
}
