// Letterboxed camera cinematics: the Emberhold intro flyover and boss introductions.
import * as THREE from 'three';
import { G } from './state.js';

const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const $ = (id) => document.getElementById(id);

export class Cinematic {
  constructor(camera) {
    this.camera = camera; this.shots = null; this.i = 0; this.t = 0;
    addEventListener('keydown', (e) => { if (this.shots && this.skippable && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) this.stop(); });
    $('letterbox').addEventListener('click', () => { if (this.shots && this.skippable) this.stop(); });
  }
  get active() { return !!this.shots; }
  play(shots, { skippable = true, onEnd } = {}) {
    this.shots = shots; this.i = 0; this.t = 0; this.skippable = skippable; this.onEnd = onEnd;
    G.cinematic = true;
    document.body.classList.add('cine');
    $('letterbox').classList.add('on');
    $('skipHint').style.display = skippable ? '' : 'none';
    this.caption(shots[0]);
  }
  caption(s) {
    const t = $('cineTitle'), sub = $('cineSub');
    t.textContent = s.title || ''; sub.textContent = s.sub || '';
    t.className = 'cine-title' + (s.boss ? ' boss' : '');
    t.classList.remove('show'); sub.classList.remove('show'); void t.offsetWidth;
    if (s.title) t.classList.add('show');
    if (s.sub) sub.classList.add('show');
  }
  stop() {
    if (!this.shots) return;
    this.shots = null; G.cinematic = false;
    document.body.classList.remove('cine');
    $('letterbox').classList.remove('on');
    $('cineTitle').classList.remove('show'); $('cineSub').classList.remove('show');
    const cb = this.onEnd; this.onEnd = null; cb?.();
  }
  update(dt) {
    if (!this.shots) return false;
    const s = this.shots[this.i];
    this.t += dt;
    const k = easeIO(Math.min(1, this.t / s.dur));
    const from = typeof s.from === 'function' ? s.from() : s.from, to = typeof s.to === 'function' ? s.to() : s.to;
    const lf = typeof s.lookFrom === 'function' ? s.lookFrom() : s.lookFrom, lt = typeof s.lookTo === 'function' ? s.lookTo() : (s.lookTo || lf);
    this.camera.position.lerpVectors(from, to, k);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(lf, lt, k));
    if (this.t >= s.dur) {
      this.i++; this.t = 0;
      if (this.i >= this.shots.length) { this.stop(); return false; }
      this.caption(this.shots[this.i]);
    }
    return true;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function introShots(player, camRig) {
  return [
    { from: V(88, 34, 76), to: V(62, 24, 50), lookFrom: V(0, 4, 0), dur: 4.2, title: 'EMBERFALL', sub: 'The last city stands against the dark' },
    { from: V(66, 14, 22), to: V(54, 10, -14), lookFrom: V(0, 6, 0), lookTo: V(0, 5, 0), dur: 3.6, title: 'Emberhold', sub: 'Guard the Ember Heart through the long night' },
    { from: V(-12, 9, -6), to: V(12, 9, -6), lookFrom: V(-23, 5, -25), lookTo: V(23, 5, -25), dur: 3.6, sub: 'Delve below. Trade with the dark. Grow stronger.' },
    { from: () => player.pos.clone().add(V(0, 14, 16)), to: () => camRig.camera.userData.rest || player.pos.clone().add(V(0, 5, 9)), lookFrom: () => player.pos.clone().add(V(0, 1.6, 0)), dur: 2.4 },
  ];
}

export function bossShots(boss, name, sub) {
  const a = Math.random() * Math.PI * 2;
  const c = () => boss.pos.clone();
  const h = boss.height;
  return [
    { from: () => c().add(V(Math.sin(a) * h * 2.2, h * 0.35, Math.cos(a) * h * 2.2)), to: () => c().add(V(Math.sin(a + 0.8) * h * 1.5, h * 0.75, Math.cos(a + 0.8) * h * 1.5)), lookFrom: () => c().add(V(0, h * 0.7, 0)), dur: 2.6, title: name, sub, boss: true },
  ];
}
