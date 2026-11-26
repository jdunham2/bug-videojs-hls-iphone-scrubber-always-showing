// Letterboxed camera cinematics: the Emberhold intro flyover and boss introductions.
import * as THREE from 'three';
import { G } from './state.js';
import { buildEnemy, animateRig } from './models.js';

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
    this.enter(shots[0]);
  }
  enter(s) {
    s.onStart?.();
    if (s.herald && !this.prop) { this.prop = buildEnemy('herald'); const S = G.zone.R.summit; this.prop.root.position.set(S.x, G.zone.groundHeight(S.x, S.z) + 3, S.z - 3); G.zone.scene.add(this.prop.root); }
    if (!s.herald && this.prop) this.dropProp();
  }
  dropProp() { if (this.prop) { this.prop.root.parent?.remove(this.prop.root); this.prop = null; } }
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
    this.shots = null; G.cinematic = false; this.dropProp();
    document.body.classList.remove('cine');
    $('letterbox').classList.remove('on');
    $('cineTitle').classList.remove('show'); $('cineSub').classList.remove('show');
    const cb = this.onEnd; this.onEnd = null; cb?.();
  }
  update(dt) {
    if (!this.shots) return false;
    const s = this.shots[this.i];
    this.t += dt;
    if (this.prop) { this.prop.root.position.y += Math.sin(this.t * 2) * dt * 0.4; animateRig(this.prop, { t: this.t, move: 0, cast: 0.6 + Math.sin(this.t * 3) * 0.3 }); this.prop.root.rotation.y = Math.atan2(this.camera.position.x - this.prop.root.position.x, this.camera.position.z - this.prop.root.position.z); }
    const k = easeIO(Math.min(1, this.t / s.dur));
    const from = typeof s.from === 'function' ? s.from() : s.from, to = typeof s.to === 'function' ? s.to() : s.to;
    const lf = typeof s.lookFrom === 'function' ? s.lookFrom() : s.lookFrom, lt = typeof s.lookTo === 'function' ? s.lookTo() : (s.lookTo || lf);
    this.camera.position.lerpVectors(from, to, k);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(lf, lt, k));
    if (this.t >= s.dur) {
      this.i++; this.t = 0;
      if (this.i >= this.shots.length) { this.stop(); return false; }
      this.caption(this.shots[this.i]);
      this.enter(this.shots[this.i]);
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

// Act II story cutscenes, made from camera shots plus captioned dialogue.
export function storyShots(kind, zone, player) {
  const R = zone.R, H = (x, z) => zone.groundHeight(x, z);
  const camp = V(R.camp.x, H(R.camp.x, R.camp.z), R.camp.z), sum = V(R.summit.x, H(R.summit.x, R.summit.z), R.summit.z);
  const back = { from: () => player.pos.clone().add(V(0, 10, 12)), to: () => player.pos.clone().add(V(0, 5, 9)), lookFrom: () => player.pos.clone().add(V(0, 1.6, 0)), dur: 1.8 };
  const flash = (s) => ({ ...s, onStart: () => { zone.flash = 1; G.audio.slam(); } });
  if (kind === 'intro') {
    const ilsa = camp.clone().add(V(1.2, 1.6, 0.6));
    return [
      { from: camp.clone().add(V(4.5, 2.2, 5)), to: camp.clone().add(V(2.6, 1.9, 3.4)), lookFrom: ilsa, dur: 3.6, sub: '“So you’re the one who felled the Colossus.” — Scout Ilsa' },
      { from: camp.clone().add(V(0, 9, 4)), to: sum.clone().add(V(10, 16, 34)), lookFrom: camp.clone().add(V(0, 4, -10)), lookTo: sum.clone().add(V(0, 12, 0)), dur: 4.4, title: 'ACT II', sub: 'The Storm Crown' },
      flash({ from: sum.clone().add(V(18, 7, 16)), to: sum.clone().add(V(-16, 10, 16)), lookFrom: sum.clone().add(V(0, 20, 0)), lookTo: sum.clone().add(V(0, 24, 0)), dur: 4, sub: '“Something on that summit wears a crown made of lightning.” — Scout Ilsa' }),
      back,
    ];
  }
  if (kind === 'herald') {
    return [
      flash({ from: sum.clone().add(V(20, 2.5, 4)), to: sum.clone().add(V(12, 4, 12)), lookFrom: sum.clone().add(V(0, 6, 0)), lookTo: sum.clone().add(V(0, 8, 0)), dur: 4, title: 'THE STORM HERALD', sub: '“Little embers… you climb so far, only to be snuffed out.”', boss: true, herald: true }),
      flash({ from: sum.clone().add(V(0, 42, 8)), to: sum.clone().add(V(0, 30, 3)), lookFrom: sum.clone(), dur: 3.6, sub: '“Hear that? It’s waiting for us on the summit. We end this — together.” — Scout Ilsa', herald: true }),
      back,
    ];
  }
  return [ // outro
    { from: sum.clone().add(V(14, 4, 14)), to: sum.clone().add(V(-6, 9, 18)), lookFrom: sum.clone().add(V(0, 2, 0)), lookTo: sum.clone().add(V(0, 14, 0)), dur: 4.2, sub: '“The storms are breaking. I can see the stars from the summit.” — Scout Ilsa' },
    { from: sum.clone().add(V(0, 20, 30)), to: sum.clone().add(V(0, 60, 60)), lookFrom: sum.clone().add(V(0, 20, 0)), lookTo: sum.clone().add(V(0, 50, -40)), dur: 4.4, title: 'ACT II COMPLETE', sub: 'Emberhold will sing of this' },
    back,
  ];
}
