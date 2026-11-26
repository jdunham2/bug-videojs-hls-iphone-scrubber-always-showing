// Attract-mode trailer for the title screen (~90 s): a montage across Emberhold, the crypts, the night siege,
// Stormspire, the Sunken Citadel and the Dark World, staged with procedural heroes and monsters and title cards.
import * as THREE from 'three';
import { G } from './state.js';
import { buildHero, buildEnemy, animateRig, animateDrake } from './models.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CLS = ['warden', 'emberblade', 'hexcaller', 'ranger'], COL = ['#e8a33d', '#d84a3a', '#8a5aff', '#3a9a6a'];

export class Trailer {
  constructor(ctx) { this.ctx = ctx; this.active = false; this.props = []; this.t = 0; }
  place(zone, rig, x, z, ry = 0, s = 1) { rig.root.position.set(x, zone.groundHeight(x, z), z); rig.root.rotation.y = ry; rig.root.scale.setScalar(s); zone.scene.add(rig.root); this.props.push({ rig, zone, ph: Math.random() * 6 }); return rig; }
  clear() { for (const p of this.props) p.rig.root.parent?.remove(p.rig.root); this.props = []; }
  enter(zone, setup) { return () => { this.clear(); this.zone = zone(); this.ctx.setActiveZone(this.zone); this.night = 0; setup?.(this.zone); }; }
  segments() {
    const c = this.ctx, H = (z, x, y) => V(x, y, z); // helper kept for readability below
    const town = () => c.town, region = (k) => () => c.region(k), dark = () => c.dark(), crypt = () => c.dungeon();
    return [
      // 1. Emberhold at dawn
      { onStart: this.enter(town, () => { c.town.setNight?.(0); }), from: V(90, 40, 80), to: V(55, 22, 45), lookFrom: V(0, 4, 0), dur: 6, title: 'EMBERFALL', sub: 'The last city stands against the dark' },
      { from: V(50, 12, 10), to: V(30, 7, -20), lookFrom: V(0, 6, 0), lookTo: V(0, 8, 0), dur: 6, sub: 'Guard the Ember Heart' },
      // 2. four heroes on the plaza
      { onStart: this.enter(town, (z) => CLS.forEach((k, i) => this.place(z, buildHero(COL[i], k), -4.5 + i * 3, 9, Math.PI, 1).pose = k)), from: V(-6, 2.4, 3.5), to: V(6, 2.4, 3.5), lookFrom: V(-4, 1.6, 9), lookTo: V(5, 1.6, 9), dur: 6, title: 'Four heroes', sub: 'Warden · Emberblade · Hexcaller · Stormcaller Ranger' },
      { from: V(0, 1.6, 4.5), to: V(0, 3.5, 2), lookFrom: V(0, 1.4, 9), dur: 5, sub: 'One last city' },
      // 3. the crypts
      { onStart: this.enter(crypt, (z) => { const s = z.spawn; this.place(z, buildEnemy('boss'), s.x, s.z - 9, 0, 1).atk = true; for (let i = 0; i < 6; i++) this.place(z, buildEnemy(i % 2 ? 'skeleton' : 'cultist'), s.x - 4 + (i % 3) * 4, s.z - 4 - Math.floor(i / 3) * 2.5, 0).walk = true; this.place(z, buildHero(COL[0], 'warden'), s.x, s.z + 1, Math.PI).atk = true; }), from: () => c.dungeon().spawn && V(c.dungeon().spawn.x + 6, 3, c.dungeon().spawn.z + 4), to: () => V(c.dungeon().spawn.x - 4, 4.5, c.dungeon().spawn.z + 3), lookFrom: () => V(c.dungeon().spawn.x, 2, c.dungeon().spawn.z - 6), dur: 7, title: 'Delve the crypts', sub: 'Procedural dungeons · elite packs · lever puzzles · bosses' },
      { from: () => V(c.dungeon().spawn.x, 2.2, c.dungeon().spawn.z - 3), to: () => V(c.dungeon().spawn.x + 2, 3.5, c.dungeon().spawn.z - 4.5), lookFrom: () => V(c.dungeon().spawn.x, 3.5, c.dungeon().spawn.z - 9), dur: 5, sub: 'The Bone Tyrant awakens', boss: true, fx: 'burst' },
      // 4. the night siege
      { onStart: this.enter(town, (z) => { this.night = 1; for (let i = 0; i < 14; i++) { const a = -0.5 + (i / 14) * 1, r = 40 + (i % 3) * 3; this.place(z, buildEnemy(['skeleton', 'brute', 'imp'][i % 3]), Math.sin(a) * r, Math.cos(a) * r, Math.PI + a).walk = true; } }), from: V(0, 18, 20), to: V(0, 12, 34), lookFrom: V(0, 2, 44), dur: 7, title: 'Defend the city at night', sub: 'Build walls and towers · flow-field hordes · siege ogres', fx: 'fire' },
      { from: V(8, 4, 30), to: V(-8, 5, 32), lookFrom: V(0, 2, 42), dur: 5, sub: 'Hold the line until dawn', fx: 'fire' },
      // 5. Stormspire
      { onStart: this.enter(region('peaks'), (z) => { const S = z.R.summit; this.place(z, buildEnemy('herald'), S.x, S.z - 4, 0).float = true; this.place(z, buildHero(COL[3], 'ranger'), S.x, S.z + 6, Math.PI).atk = true; c.weather('snow'); }), from: () => V(c.region('peaks').R.summit.x + 20, 14, c.region('peaks').R.summit.z + 22), to: () => V(c.region('peaks').R.summit.x + 6, 6, c.region('peaks').R.summit.z + 12), lookFrom: () => V(c.region('peaks').R.summit.x, 5, c.region('peaks').R.summit.z - 3), dur: 7, title: 'Break the Storm Crown', sub: 'Act II · the Storm Herald and its bound Drake', fx: 'lightning' },
      // 6. the Sunken Citadel
      { onStart: this.enter(region('citadel'), (z) => { const T = z.R.throne; this.place(z, buildEnemy('kingreborn'), T.x, T.z - 4, 0).float = true; for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; this.place(z, buildEnemy('sigil'), T.x + Math.cos(a) * 9, T.z - 4 + Math.sin(a) * 9); } this.place(z, buildEnemy('corvin'), T.x - 2, T.z + 6, Math.PI).atk = true; c.weather('clear'); }), from: () => V(c.region('citadel').R.throne.x - 22, 12, c.region('citadel').R.throne.z + 18), to: () => V(c.region('citadel').R.throne.x - 6, 6, c.region('citadel').R.throne.z + 12), lookFrom: () => V(c.region('citadel').R.throne.x, 4, c.region('citadel').R.throne.z - 4), dur: 8, title: 'Face the Hollow King', sub: 'Act III · a drowned city that breathes with the tide' },
      // 7. the Dark World
      { onStart: this.enter(dark, (z) => { this.place(z, buildEnemy('hollowking'), 0, -40, 0); for (let i = 0; i < 5; i++) this.place(z, buildEnemy('wraith'), -8 + i * 4, -26, 0).float = true; }), from: V(20, 10, 10), to: V(-14, 8, -6), lookFrom: V(0, 4, -30), dur: 7, title: 'Trade with the dark', sub: 'Rifts · Nightmare tiers · weekly trials · legendary crafting', fx: 'wisps' },
      // 8. title
      { onStart: this.enter(town, () => {}), from: V(0, 60, 70), to: V(0, 90, 110), lookFrom: V(0, 4, 0), lookTo: V(0, 0, 0), dur: 7, title: 'EMBERFALL', sub: 'Gather your party · play free in your browser' },
    ];
  }
  play(onEnd) {
    this.active = true; this.onEnd = onEnd; document.body.classList.add('trailer'); G.audio.music?.('boss');
    const shots = this.segments();
    this.ctx.cine.play(shots, { skippable: true, onEnd: () => this.stop() });
  }
  stop() {
    if (!this.active) return; this.active = false; this.clear(); document.body.classList.remove('trailer');
    this.ctx.cine.active && this.ctx.cine.stop(); this.ctx.weather('clear'); this.ctx.setActiveZone(this.ctx.town); this.ctx.town.setNight?.(0);
    const cb = this.onEnd; this.onEnd = null; cb?.();
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.night !== undefined && this.zone === this.ctx.town) { G.nightF += ((this.night || 0) - G.nightF) * Math.min(1, dt * 2); this.ctx.town.setNight?.(G.nightF); }
    for (const p of this.props) {
      const r = p.rig, t = this.t + p.ph;
      if (r.kind === 'static') { if (r.P.cry) r.P.cry.rotation.y = t; continue; }
      if (r.kind === 'drake') { animateDrake(r, { t, move: 0.5 }); continue; }
      const atk = p.atk ? ((t * 0.8) % 1.6 < 1 ? (t * 0.8) % 1.6 : -1) : -1;
      if (p.walk) { r.root.position.x -= Math.sin(r.root.rotation.y + Math.PI) * dt * 1.8; r.root.position.z -= Math.cos(r.root.rotation.y + Math.PI) * dt * 1.8; r.root.position.y = p.zone.groundHeight(r.root.position.x, r.root.position.z); }
      if (p.float) r.root.position.y = p.zone.groundHeight(r.root.position.x, r.root.position.z) + 1 + Math.sin(t * 1.5) * 0.3;
      animateRig(r, { t, move: p.walk ? 0.7 : 0, atk, combo: Math.floor(t) % 3, cast: p.float ? 0.6 + Math.sin(t * 2) * 0.3 : 0, emote: p.pose && !p.atk ? ['cheer', 'point', 'taunt', 'bow'][CLS.indexOf(p.pose)] : null, emoteT: t });
    }
    const s = this.ctx.cine.shots?.[this.ctx.cine.i], fx = s?.fx, zone = this.zone;
    if (fx && zone && Math.random() < dt * 30) {
      const cam = this.ctx.camera.position, a = Math.random() * 6.28, d = 6 + Math.random() * 14, x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d, y = zone.groundHeight(x, z);
      if (fx === 'fire') G.fx.emit({ pos: V(x, y + 0.5, z), count: 3, speed: 2, color: '#ffc060', color2: '#ff2000', size: 0.6, life: 0.8, up: 1.5 });
      if (fx === 'wisps') G.fx.emit({ pos: V(x, y + 1 + Math.random() * 3, z), count: 1, speed: 0.4, color: '#c86bff', color2: '#3a0a5a', size: 0.25, life: 2 });
      if (fx === 'burst' && Math.random() < 0.1) G.fx.emit({ pos: V(x, y + 1, z), count: 30, speed: 6, color: '#ffe0a0', color2: '#ff4000', size: 0.4, life: 0.7 });
      if (fx === 'lightning' && Math.random() < 0.05) { zone.flash = 1; G.audio.slam?.(); }
    }
    zone?.update(dt, G.time, this.ctx.camera.position.clone().setY(0));
  }
}
