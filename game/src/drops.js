import * as THREE from 'three';
import { heightAt, HALF } from './terrain.js';

// Supply drops: glowing crates that drift down from the sky every few minutes.
// High ground drops are rare (gold) and carry better loot. They expire after a while.
const LIFETIME = 360;
const FALL_TIME = 25;
const LOOT = {
  common: [['arrow', 10, 20, 1], ['hide', 5, 10, 1], ['ingot', 3, 6, 0.8], ['cooked', 3, 6, 0.8], ['seed', 2, 4, 0.5],
    ['hidearmor', 1, 1, 0.2], ['saddle', 1, 1, 0.15], ['flint', 10, 20, 0.6]],
  rare: [['ingot', 10, 20, 1], ['arrow', 20, 40, 1], ['cooked', 8, 12, 0.8], ['metalarmor', 1, 1, 0.3], ['sword', 1, 1, 0.25],
    ['metalpick', 1, 1, 0.25], ['trophy', 1, 1, 0.18], ['saddle', 1, 2, 0.4]],
};
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export class SupplyDrops {
  constructor(game) {
    this.game = game;
    this.drops = [];
    this.timer = 90;
  }

  bearing(from, to) {
    const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI + 360) % 360;
    return DIRS[Math.round(deg / 45) % 8];
  }

  spawn(at, tier, fall = FALL_TIME, life = LIFETIME) {
    const g = this.game;
    let pos = at;
    if (!pos) {
      for (let i = 0; i < 80 && !pos; i++) {
        const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 270;
        const x = g.player.pos.x + Math.cos(a) * d, z = g.player.pos.z + Math.sin(a) * d;
        if (Math.abs(x) > HALF * 0.85 || Math.abs(z) > HALF * 0.85) continue;
        const h = heightAt(x, z);
        if (h > 3) pos = new THREE.Vector3(x, h, z);
      }
      if (!pos) return null;
    }
    tier = tier || (pos.y > 30 ? 'rare' : 'common');
    const color = tier === 'rare' ? 0xffc23a : 0x5ab0ff;
    const grp = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.8 });
    const trim = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), wood); box.position.y = 0.55; box.castShadow = true; grp.add(box);
    for (const y of [0.1, 1.0]) { const band = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.12, 1.46), trim); band.position.y = y; grp.add(band); }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), trim); gem.position.y = 1.5; grp.add(gem);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: tier === 'rare' ? 0xd8a040 : 0x8ab8d8, side: THREE.DoubleSide, roughness: 0.9 }));
    canopy.position.y = 4.2; grp.add(canopy);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 140, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 70; grp.add(beam);
    g.scene.add(grp);
    const drop = { pos: pos.clone(), tier, fall, life, grp, gem, canopy };
    this.drops.push(drop);
    this.place(drop);
    return drop;
  }

  place(d) {
    const k = Math.max(0, d.fall / FALL_TIME);
    d.grp.position.set(d.pos.x, d.pos.y + k * 120, d.pos.z);
    d.canopy.visible = d.fall > 0;
  }

  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 240 + Math.random() * 180;
      if (this.drops.length < 2) {
        const d = this.spawn();
        if (d) {
          g.ui.notify(`${d.tier === 'rare' ? 'A rare' : 'A'} supply drop is falling to the ${this.bearing(g.player.pos, d.pos)} (📦 on your map)`, 'quest');
          g.audio.tone({ f0: 660, f1: 990, dur: 0.6, vol: 0.15, type: 'triangle', verb: 0.6 });
        }
      }
    }
    const t = performance.now() / 1000;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (d.fall > 0) { d.fall = Math.max(0, d.fall - dt); this.place(d); if (d.fall === 0) g.audio.tone({ f0: 90, f1: 50, dur: 0.4, vol: 0.4, type: 'triangle' }); }
      d.gem.rotation.y = t * 1.5; d.gem.position.y = 1.5 + Math.sin(t * 2) * 0.12;
      d.grp.rotation.y = d.fall > 0 ? Math.sin(t * 0.8) * 0.2 : d.grp.rotation.y;
      if (d.life <= 0) { g.scene.remove(d.grp); this.drops.splice(i, 1); }
    }
  }

  near(pos) { return this.drops.find((d) => d.fall <= 0 && Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z) < 3 && Math.abs(d.pos.y - pos.y) < 3); }

  open(d) {
    const g = this.game;
    const got = [];
    for (const [id, lo, hi, chance] of LOOT[d.tier]) {
      if (Math.random() > chance) continue;
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      g.give(id, n, true); got.push(`${n}× ${id}`);
    }
    g.ui.banner(d.tier === 'rare' ? 'RARE SUPPLY DROP' : 'SUPPLY DROP', got.length ? 'Loot collected' : 'It was empty…');
    for (const s of got) g.ui.notify(`+ ${s}`, 'loot');
    g.audio.craft();
    g.player.addXP(d.tier === 'rare' ? 40 : 15, g.xpHooks);
    g.stats.drops = (g.stats.drops || 0) + 1;
    g.scene.remove(d.grp);
    this.drops.splice(this.drops.indexOf(d), 1);
    g.saves.markDirty();
  }

  serialize() {
    const r = (v) => Math.round(v * 100) / 100;
    return { timer: Math.round(this.timer), drops: this.drops.map((d) => ({ pos: [r(d.pos.x), r(d.pos.y), r(d.pos.z)], tier: d.tier, life: Math.round(d.life) })) };
  }

  load(s) {
    if (!s) return;
    this.timer = s.timer ?? this.timer;
    for (const d of s.drops || []) this.spawn(new THREE.Vector3().fromArray(d.pos), d.tier, 0, d.life);
  }
}
