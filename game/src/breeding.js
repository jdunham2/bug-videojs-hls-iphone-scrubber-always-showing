import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Breeding: two adult tames of one species, both set to Stay within 8 m, mate over a minute
// and lay an egg. Eggs incubate while warm (near a lit fire/forge, or on a hot day) and hatch
// a tamed baby that grows to adult size over ten minutes and inherits a level bonus.
const MATE_TIME = 60;
const MATE_COOLDOWN = 480;
const HATCH_TIME = 120;
const GROW_TIME = 600;

export class Breeding {
  constructor(game) {
    this.game = game;
    this.eggs = [];
    this.pairs = new Map(); // "idA-idB" -> progress seconds
    this.scanT = 0;
    this.eggGeo = new THREE.SphereGeometry(0.32, 14, 10);
  }

  canMate(c) {
    return c.tamed && c.alive && !c.baby && !c.follow && !c.riddenBy && !c.def.swimmer && c.state !== 'ko' && (c.mateCd || 0) <= 0;
  }

  update(dt) {
    const g = this.game;
    for (const c of g.creatures.list) if (c.mateCd > 0) c.mateCd -= dt;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1;
      const ready = g.creatures.list.filter((c) => this.canMate(c));
      const seen = new Set();
      for (let i = 0; i < ready.length; i++) for (let j = i + 1; j < ready.length; j++) {
        const a = ready[i], b = ready[j];
        if (a.species !== b.species || a.pos.distanceTo(b.pos) > 8) continue;
        const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
        if (seen.has(a.id) || seen.has(b.id)) continue;
        seen.add(a.id); seen.add(b.id);
        const prev = this.pairs.get(key) || 0;
        if (prev === 0) g.ui.notify(`${a.name} and ${b.name} are courting… (keep them on Stay)`, 'quest');
        const now = prev + 1;
        a.mating = b.mating = now / MATE_TIME;
        if (now >= MATE_TIME) { this.pairs.delete(key); this.layEgg(a, b); }
        else this.pairs.set(key, now);
      }
      // forget pairs that broke up
      for (const key of [...this.pairs.keys()]) {
        const [ia, ib] = key.split('-').map(Number);
        if (!seen.has(ia) || !seen.has(ib)) this.pairs.delete(key);
      }
      for (const c of g.creatures.list) if (!seen.has(c.id)) c.mating = 0;
    }

    // eggs
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      const warm = this.isWarm(e.pos);
      e.warm = warm;
      if (warm) e.hatch = Math.min(1, e.hatch + dt / HATCH_TIME);
      const t = performance.now() / 1000;
      e.mesh.rotation.z = e.hatch > 0.85 ? Math.sin(t * 18) * 0.15 : 0;
      e.mesh.material.emissive.setRGB(warm ? 0.25 : 0, warm ? 0.12 : 0, 0);
      if (e.hatch >= 1) { this.hatch(e); this.eggs.splice(i, 1); }
    }

    // babies grow
    for (const c of g.creatures.list) {
      if (!c.baby) continue;
      c.growth = Math.min(1, c.growth + dt / GROW_TIME);
      this.applyGrowth(c);
      if (c.growth >= 1) {
        c.baby = false;
        if (c.name.startsWith('Baby ')) c.name = c.name.slice(5);
        g.ui.notify(`${c.name} is fully grown!`, 'quest');
        g.saves.markDirty();
      }
    }
  }

  isWarm(pos) {
    const g = this.game;
    for (const f of g.building.fires) if (f.lit && f.pos.distanceTo(pos) < 8) return true;
    return g.env.daylight > 0.8 && pos.y < 20 && !g.weather.raining;
  }

  layEgg(a, b) {
    const g = this.game;
    a.mateCd = b.mateCd = MATE_COOLDOWN;
    const pos = a.pos.clone().lerp(b.pos, 0.5);
    pos.y = heightAt(pos.x, pos.z);
    const level = Math.max(a.level, b.level) + 1 + Math.floor(Math.random() * 4);
    this.addEgg(a.species, level, pos, 0);
    g.ui.notify(`${a.name} and ${b.name} laid a ${a.def.name} egg! Keep it warm next to a lit campfire.`, 'quest');
    g.audio.tamed();
    g.saves.markDirty();
  }

  addEgg(species, level, pos, hatch) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7, emissive: 0x000000 });
    const mesh = new THREE.Mesh(this.eggGeo, mat);
    mesh.scale.set(1, 1.3, 1);
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.38, 0));
    mesh.castShadow = true;
    // speckles
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshStandardMaterial({ color: 0x6a5a3a }));
      const a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 0.4;
      s.position.set(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3);
      mesh.add(s);
    }
    this.game.scene.add(mesh);
    const egg = { species, level, pos: pos.clone(), hatch, mesh };
    this.eggs.push(egg);
    return egg;
  }

  eggNear(pos) { return this.eggs.find((e) => e.pos.distanceTo(pos) < 2.5); }

  hatch(e) {
    const g = this.game;
    g.scene.remove(e.mesh);
    const c = g.creatures.spawn(e.species, e.pos.clone(), e.level);
    c.flying = false; c.pos.y = heightAt(c.pos.x, c.pos.z);
    c.tamed = true; c.state = 'tamed'; c.follow = true;
    c.name = `Baby ${g.randomTameName ? g.randomTameName() : c.def.name}`;
    c.baby = true; c.growth = 0; c.adultScale = c.scale;
    this.applyGrowth(c);
    const st = g.stats.speciesTames || (g.stats.speciesTames = {}); st[c.species] = (st[c.species] || 0) + 1;
    g.stats.hatched = (g.stats.hatched || 0) + 1;
    g.ui.banner('AN EGG HATCHED!', `${c.def.name} · Lv ${c.level} — it will grow up over the next ten minutes`);
    g.audio.tamed();
    g.saves.markDirty();
  }

  applyGrowth(c) {
    const f = 0.35 + 0.65 * c.growth;
    c.scale = c.adultScale * f;
    c.obj.scale.setScalar(c.scale);
    const full = c.fullHp || (c.fullHp = c.maxHp);
    const hpFrac = c.hp / c.maxHp;
    c.maxHp = Math.round(full * (0.3 + 0.7 * c.growth));
    c.hp = Math.max(1, hpFrac * c.maxHp);
  }

  serialize() {
    const r = (v) => Math.round(v * 100) / 100;
    return this.eggs.map((e) => ({ species: e.species, level: e.level, pos: [r(e.pos.x), r(e.pos.y), r(e.pos.z)], hatch: r(e.hatch) }));
  }

  load(list) {
    for (const e of list || []) this.addEgg(e.species, e.level, new THREE.Vector3().fromArray(e.pos), e.hatch || 0);
  }
}
