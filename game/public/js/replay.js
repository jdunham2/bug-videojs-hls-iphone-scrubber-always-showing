// Rift Trial replay viewer: rebuilds the trial dungeon from its seed and plays back the recorded frames
// (heroes + enemies at 5 Hz, interpolated) with a chase camera and a scrubbable timeline.
import * as THREE from 'three';
import { G } from './state.js';
import { EnemyView, RemoteView } from './entities.js';
import { TRIAL_K } from '../shared/endgame.js';

const $ = (id) => document.getElementById(id);
const fmt = (ms) => { const s = Math.max(0, ms / 1000); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

export class ReplayViewer {
  constructor(ctx) { this.ctx = ctx; this.r = null; } // ctx: { renderer, camera, DungeonZone, setActiveZone, clearEntities, town, player }
  get active() { return !!this.r; }
  start(R) {
    const c = this.ctx;
    c.clearEntities();
    const zone = new c.DungeonZone(c.renderer, R.seed, R.level, false, { k: TRIAL_K, mods: R.mods, p: 0, elapsed: 0, limit: 420 });
    zone.key = 'replay'; G.zoneKey = 'replay'; c.setActiveZone(zone);
    if (c.player()) c.player().root.visible = false;
    this.r = { R, zone, t: 0, speed: 1, playing: true, enemies: new Map(), heroes: new Map(), dur: R.frames.at(-1)[0], orbit: 0, follow: 0 };
    this.hud();
  }
  hud() {
    let el = $('replayHud');
    if (!el) { el = document.createElement('div'); el.id = 'replayHud'; document.body.appendChild(el); }
    const R = this.r.R;
    el.innerHTML = `<div class="rp-top">▶ REPLAY · Weekly Rift Trial · ${R.names.map((n) => n.replace(/[<>&]/g, '')).join(', ')} · ${fmt(R.time * 1000)}</div>
      <div class="rp-bar"><button class="btn small" id="rpPlay">❚❚</button><div class="rp-track" id="rpTrack"><i id="rpFill"></i></div><span id="rpTime"></span>
      <button class="btn small" id="rpSpeed">1×</button><button class="btn small" id="rpCam">Follow: ${Object.values(R.players)[0]?.name.replace(/[<>&]/g, '') || ''}</button><button class="btn small" id="rpExit">Exit ✕</button></div>`;
    el.hidden = false; document.body.classList.add('replaying');
    $('rpPlay').onclick = () => { this.r.playing = !this.r.playing; $('rpPlay').textContent = this.r.playing ? '❚❚' : '▶'; };
    $('rpSpeed').onclick = () => { const s = [1, 2, 4, 0.5]; this.r.speed = s[(s.indexOf(this.r.speed) + 1) % s.length]; $('rpSpeed').textContent = this.r.speed + '×'; };
    $('rpCam').onclick = () => { const ids = Object.keys(this.r.R.players); this.r.follow = (this.r.follow + 1) % ids.length; $('rpCam').textContent = `Follow: ${this.r.R.players[ids[this.r.follow]].name}`; };
    $('rpExit').onclick = () => this.stop();
    $('rpTrack').onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); this.seek(((e.clientX - b.left) / b.width) * this.r.dur); };
    G.uiOpen = true; G.input.unlock();
  }
  seek(t) { const r = this.r; r.t = Math.max(0, Math.min(r.dur, t)); for (const v of r.enemies.values()) v.dispose(); r.enemies.clear(); }
  stop() {
    const r = this.r; if (!r) return;
    for (const v of r.enemies.values()) v.dispose(); for (const v of r.heroes.values()) v.dispose();
    this.r = null; $('replayHud').hidden = true; G.uiOpen = false; document.body.classList.remove('replaying');
    const c = this.ctx; c.setActiveZone(c.town); G.zoneKey = 'town'; r.zone.dispose?.();
    if (c.player()) { c.player().root.visible = true; c.snap(); }
  }
  update(dt, input) {
    const r = this.r; if (!r) return;
    if (input.hit('Escape')) return this.stop();
    if (input.hit('Space')) $('rpPlay').click();
    if (input.hit('ArrowRight')) this.seek(r.t + 10000);
    if (input.hit('ArrowLeft')) this.seek(r.t - 10000);
    if (r.playing) r.t = Math.min(r.dur, r.t + dt * 1000 * r.speed);
    const F = r.R.frames; let i = 0, lo = 0, hi = F.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (F[m][0] <= r.t) { i = m; lo = m + 1; } else hi = m - 1; }
    const a = F[i], b = F[Math.min(F.length - 1, i + 1)], k = b[0] > a[0] ? (r.t - a[0]) / (b[0] - a[0]) : 0;
    const lerp = (rowsA, rowsB, xi) => { const m = new Map(rowsB.map((x) => [x[0], x])); return rowsA.map((x) => { const y = m.get(x[0]) || x; return { row: x, x: (x[xi] + (y[xi] - x[xi]) * k) / 10, z: (x[xi + 1] + (y[xi + 1] - x[xi + 1]) * k) / 10 }; }); };
    // heroes
    for (const h of lerp(a[1], b[1], 1)) {
      const P = r.R.players[h.row[0]] || {}, y = r.zone.groundHeight(h.x, h.z);
      const p = { id: h.row[0], name: P.name || 'Hero', color: P.color || '#e8a33d', cls: P.cls || 'warden', gear: P.gear || {}, x: h.x, y, z: h.z, ry: h.row[3] / 100, anim: h.row[4], hp: h.row[5], maxHp: 100, level: P.level || '', dead: !!h.row[6] };
      let v = r.heroes.get(p.id); if (!v) { v = new RemoteView(p); r.heroes.set(p.id, v); } else v.apply(p);
      v.update(dt * r.speed, this.ctx.camera);
    }
    // enemies
    const seen = new Set();
    for (const e of lerp(a[2], b[2], 2)) {
      const row = e.row, id = row[0]; seen.add(id);
      const arr = [id, r.R.types[row[1]], e.x, e.z, row[4] / 100, row[5], 100, r.R.level, 0, row[6] ? 0 : -1];
      let v = r.enemies.get(id); if (!v) { v = new EnemyView(arr); r.enemies.set(id, v); } else if (!v.dead) v.apply(arr);
    }
    for (const [id, v] of r.enemies) { if (!seen.has(id) && !v.dead) v.die(); if (!v.update(dt * r.speed, r.zone, this.ctx.camera)) { v.dispose(); r.enemies.delete(id); } }
    // chase camera on the followed hero, slowly orbiting
    const ids = Object.keys(r.R.players), fv = r.heroes.get(+ids[r.follow]) || [...r.heroes.values()][0];
    if (fv) {
      r.orbit += dt * 0.15;
      const cam = this.ctx.camera, target = fv.pos.clone().setY(fv.pos.y + 1.5);
      const want = target.clone().add(new THREE.Vector3(Math.sin(r.orbit) * 9, 8, Math.cos(r.orbit) * 9));
      cam.position.lerp(want, 1 - Math.exp(-4 * dt)); cam.lookAt(target);
    }
    r.zone.update(dt, G.time, fv ? fv.pos : this.ctx.camera.position);
    $('rpFill').style.width = (r.t / r.dur) * 100 + '%'; $('rpTime').textContent = `${fmt(r.t)} / ${fmt(r.dur)}`;
  }
}
