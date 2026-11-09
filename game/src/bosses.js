import * as THREE from 'three';
import { heightAt, VOLCANO, LAVA_Y, WATER_LEVEL, HALF } from './terrain.js';
import { BOSS_TYRANT } from './creatures.js';
import { lavaMaterial } from './volcano.js';
import { ITEMS } from './items.js';

// Four bosses, each summoned at its own shrine with an offering and each dropping a unique
// crafting reward. The Primal Tyrant's altar is built by the game; the others are built here.
export const BOSSES = {
  tyrant: { ...BOSS_TYRANT, title: 'THE PRIMAL TYRANT', cost: { trophy: 3 }, reward: [['fang', 1], ['ingot', 25], ['trophy', 2]], rewardText: 'Its fang forges the Primal Blade', color: 0xff3a1a },
  magmaroth: {
    kind: 'magmaroth', species: 'cinderback', name: 'Magmaroth, the Molten King', title: 'MAGMAROTH, THE MOLTEN KING',
    hp: 20000, dmg: 62, scale: 2.7, minions: ['cinderback', 2, 35], phases: [0.6, 0.3], abilities: ['stomp', 'eruption'], arena: 90, leash: 80,
    cost: { obsidian: 15, trophy: 1 }, reward: [['core', 1], ['obsidian', 20], ['ingot', 20]], rewardText: 'Its Molten Core forges Magmaplate Armor', color: 0xff7a1a,
  },
  deepmother: {
    kind: 'deepmother', species: 'deepjaw', name: 'The Deep Mother', title: 'THE DEEP MOTHER',
    hp: 18000, dmg: 48, scale: 3.2, minions: ['deepjaw', 2, 35], phases: [0.5], abilities: ['whirlpool'], arena: 90,
    cost: { meat: 20, trophy: 1 }, reward: [['pearl', 1], ['ingot', 20], ['hide', 20]], rewardText: 'Its Abyssal Pearl forges the Tidecaller Trident', color: 0x3ac8ff,
  },
  hollowqueen: {
    kind: 'hollowqueen', species: 'duskraptor', name: 'The Hollow Queen', title: 'THE HOLLOW QUEEN',
    hp: 12000, dmg: 38, scale: 2.5, minions: ['duskraptor', 3, 30], phases: [0.75, 0.5, 0.25], abilities: ['shriek', 'pounce'], arena: 60, leash: 40,
    cost: { crystal: 20 }, reward: [['eye', 1], ['crystal', 20], ['ingot', 15]], rewardText: 'Her eye forges the Huntress Bow', color: 0x9a6aff,
  },
};

const costText = (cost) => Object.entries(cost).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(' + ');

export class Bosses {
  constructor(game) {
    this.game = game;
    this.active = {};     // kind -> creature
    this.hazards = [];
    this.shrines = [];
    this.lavaMat = lavaMaterial(game.shared);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 32);
    this.poolGeo = new THREE.CircleGeometry(1, 24);
  }

  // Called once the world, altar and caves exist.
  build() {
    const g = this.game;
    this.shrines.push({ kind: 'tyrant', pos: g.altar.pos.clone(), spawn: g.altar.pos.clone().add(new THREE.Vector3(0, 0, -16)) });
    // Magmaroth: an obsidian obelisk on the volcano rim
    let best = null;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, x = VOLCANO.x + Math.cos(a) * (VOLCANO.crater + 14), z = VOLCANO.z + Math.sin(a) * (VOLCANO.crater + 14);
      const h = heightAt(x, z);
      if (!best || (a > Math.PI * 0.5 && a < Math.PI * 1.5 && h > best.h - 4)) best = { x, z, h, a };
    }
    const mPos = new THREE.Vector3(best.x, best.h, best.z);
    const mSpawn = new THREE.Vector3(VOLCANO.x + Math.cos(best.a + Math.PI) * (VOLCANO.crater + 16), 0, VOLCANO.z + Math.sin(best.a + Math.PI) * (VOLCANO.crater + 16));
    mSpawn.y = heightAt(mSpawn.x, mSpawn.z);
    this.shrines.push({ kind: 'magmaroth', pos: mPos, spawn: mSpawn });
    // Deep Mother: a tide shrine on the western shore, the boss rises offshore
    let shore = null;
    for (let z = -150; z <= 150 && !shore; z += 10) {
      for (let x = -HALF; x < -100; x += 2) { const h = heightAt(x, z); if (h > 1.2 && h < 4) { shore = { x, z }; break; } }
    }
    shore = shore || { x: -380, z: 0 };
    const tPos = new THREE.Vector3(shore.x, heightAt(shore.x, shore.z), shore.z);
    let tSpawn = null;
    for (let d = 30; d < 160 && !tSpawn; d += 5) { const x = shore.x - d; if (heightAt(x, shore.z) < -9) tSpawn = new THREE.Vector3(x, -4, shore.z); }
    tSpawn = tSpawn || new THREE.Vector3(shore.x - 80, -4, shore.z);
    this.shrines.push({ kind: 'deepmother', pos: tPos, spawn: tSpawn });
    // Hollow Queen: a crystal throne in the Glimmer Grotto, she waits in the cache chamber
    const grotto = g.caves.list.find((c) => c.theme === 'crystal');
    const ch = grotto.chambers[4] || grotto.chambers[grotto.chambers.length - 2];
    const qPos = new THREE.Vector3(ch.x, grotto.floor(ch.x, ch.z), ch.z);
    const cc = grotto.cacheChamber;
    this.shrines.push({ kind: 'hollowqueen', pos: qPos, spawn: new THREE.Vector3(cc.x + 3, grotto.floor(cc.x + 3, cc.z), cc.z), cave: grotto });
    for (const s of this.shrines) if (s.kind !== 'tyrant') this.buildShrine(s);
  }

  buildShrine(s) {
    const g = this.game, def = BOSSES[s.kind];
    const grp = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: s.kind === 'magmaroth' ? 0x1a1620 : s.kind === 'deepmother' ? 0x4a5a5e : 0x2a3038, roughness: 0.4, metalness: 0.2, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.8, 6), stone); base.position.y = 0.3; grp.add(base);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 5), stone); pillar.position.y = 2.2; grp.add(pillar);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.6, roughness: 0.3 }));
    gem.position.y = 4.3; grp.add(gem);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2 + (i % 2), 5), stone);
      st.position.set(Math.cos(a) * 3.2, 0.8, Math.sin(a) * 3.2); grp.add(st);
    }
    grp.position.copy(s.pos);
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.scene.add(grp);
    g.world.colliders.add({ x: s.pos.x, z: s.pos.z, r: 1.6 });
    s.gem = gem;
  }

  shrineNear(pos) { return this.shrines.find((s) => s.pos.distanceTo(pos) < 5); }

  prompt(s) {
    const def = BOSSES[s.kind];
    if (this.active[s.kind] && this.active[s.kind].alive) return `${def.name} is awake!`;
    const have = Object.entries(def.cost).map(([id, n]) => `${Math.min(this.game.inv.count(id), n)}/${n} ${ITEMS[id].name}`).join(' · ');
    return `<kbd>E</kbd> Summon ${def.name} — offer ${have}`;
  }

  summon(s) {
    const g = this.game, def = BOSSES[s.kind];
    if (this.active[s.kind] && this.active[s.kind].alive) { g.ui.notify(`${def.name} is already here!`, 'warn'); return; }
    if (!g.inv.has(def.cost)) { g.ui.notify(`The shrine demands ${costText(def.cost)}`, 'warn'); return; }
    g.inv.pay(def.cost);
    g.stats.bossSummons = (g.stats.bossSummons || 0) + 1;
    const c = g.creatures.spawnBoss(s.spawn.clone(), def);
    if (s.cave) { c.cave = s.cave; c.homeR = 10; }
    if (c.def.swimmer) { c.pos.copy(s.spawn); c.home = s.spawn.clone(); }
    this.active[s.kind] = c;
    if (s.kind === 'tyrant') g.boss = c;
    g.shake = 1.2;
    g.ui.banner(`${def.title} AWAKENS`, 'Survive. Strike. Endure.');
    g.audio.thunder?.(1); setTimeout(() => g.playRoar(c), 600);
    g.saves.markDirty();
  }

  defeated(c) {
    const g = this.game, def = BOSSES[c.bossKind] || BOSSES.tyrant;
    delete this.active[def.kind];
    const st = g.stats.bossesDefeated || (g.stats.bossesDefeated = {});
    st[def.kind] = (st[def.kind] || 0) + 1;
    if (def.kind === 'tyrant') g.stats.bossKills = (g.stats.bossKills || 0) + 1;
    for (const [id, n] of def.reward) g.give(id, n);
    g.ui.banner(`${def.title} HAS FALLEN`, def.rewardText);
    g.audio.tamed();
    g.player.addXP(400, g.xpHooks);
    if (Object.keys(BOSSES).every((k) => st[k])) setTimeout(() => g.ui.banner('CHAMPION OF THE ISLE', 'Every great beast of the island has fallen to you'), 5000);
    g.saves.markDirty();
  }

  // the closest living boss (for the health bar and music)
  nearest(pos, range) {
    let best = null, bd = range;
    for (const c of Object.values(this.active)) { if (!c.alive) continue; const d = c.pos.distanceTo(pos); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // ---- ability effects (hooked from the creature manager) ----
  eruption(c) {
    const g = this.game, p = g.player;
    g.ui.notify('The ground splits — move!', 'warn');
    for (let i = 0; i < 4; i++) {
      const pos = i === 0 ? p.pos.clone() : p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18));
      pos.y = heightAt(pos.x, pos.z) + 0.15;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(pos); ring.scale.setScalar(0.3);
      g.scene.add(ring);
      this.hazards.push({ type: 'eruption', pos, r: 3.6, t: 1.5 + i * 0.15, ring, life: 6 });
    }
  }

  whirlpool(c) {
    const g = this.game;
    const ring = new THREE.Mesh(new THREE.RingGeometry(4, 22, 40, 1), new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c.pos.x, WATER_LEVEL + 0.3, c.pos.z);
    g.scene.add(ring);
    this.hazards.push({ type: 'whirlpool', boss: c, ring, life: 5 });
    g.ui.notify('The Deep Mother churns a whirlpool!', 'warn');
  }

  shriek(c) {
    const g = this.game;
    this.shriekT = 3;
    g.ui.notify('The Hollow Queen shrieks — your light falters!', 'warn');
    g.audio.roar(3, 0, 0, 'roar');
  }

  update(dt) {
    const g = this.game, p = g.player;
    for (const s of this.shrines) if (s.gem) { s.gem.rotation.y += dt; s.gem.position.y = 4.3 + Math.sin(g.shared.uTime.value * 2 + s.pos.x) * 0.15; }
    for (const [k, c] of Object.entries(this.active)) if (!c.alive || !g.creatures.list.includes(c)) delete this.active[k];
    if (this.shriekT > 0) {
      this.shriekT -= dt;
      g.caves.torch.intensity *= 0.25;
      document.getElementById('shriek').style.opacity = Math.min(0.85, this.shriekT * 0.5);
    } else document.getElementById('shriek').style.opacity = 0;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      if (h.type === 'eruption') {
        if (h.t > 0) {
          h.t -= dt;
          h.ring.scale.setScalar(h.r * (1 - Math.max(0, h.t) / 1.8));
          if (h.t <= 0) {
            // burst: damage and leave a burning pool
            g.scene.remove(h.ring);
            h.pool = new THREE.Mesh(this.poolGeo, this.lavaMat); h.pool.rotation.x = -Math.PI / 2; h.pool.position.copy(h.pos); h.pool.scale.setScalar(h.r);
            g.scene.add(h.pool);
            g.shake = Math.max(g.shake || 0, 0.5);
            if (p.pos.distanceTo(h.pos) < h.r + 0.5) this.burn(35);
          }
        } else if (p.pos.distanceTo(h.pos) < h.r && Math.abs(p.pos.y - h.pos.y) < 2) this.burn(20 * dt, true);
        if (h.life <= 0) { if (h.pool) g.scene.remove(h.pool); else g.scene.remove(h.ring); this.hazards.splice(i, 1); }
      } else if (h.type === 'whirlpool') {
        h.ring.rotation.z += dt * 2;
        const inWater = p.pos.y < WATER_LEVEL + 0.4 && heightAt(p.pos.x, p.pos.z) < -0.8;
        const target = p.mount || null;
        const d = Math.hypot(h.boss.pos.x - p.pos.x, h.boss.pos.z - p.pos.z);
        if (inWater && d < 45 && d > 3) {
          const k = 7 * dt / d;
          if (target) { target.pos.x += (h.boss.pos.x - p.pos.x) * k; target.pos.z += (h.boss.pos.z - p.pos.z) * k; }
          else { p.pos.x += (h.boss.pos.x - p.pos.x) * k; p.pos.z += (h.boss.pos.z - p.pos.z) * k; }
        }
        if (h.life <= 0) { g.scene.remove(h.ring); this.hazards.splice(i, 1); }
      }
    }
  }

  burn(dmg, silent) {
    const g = this.game, p = g.player;
    if (p.mount) { if (!p.mount.def.fireproof) g.creatures.damage(p.mount, dmg, 0, null); return; }
    const fp = p.armor && ITEMS[p.armor.id].fireproof ? ITEMS[p.armor.id].fireproof : 0;
    p.damage(dmg * (1 - fp));
    p.hurtT = Math.max(p.hurtT, 0.35);
    if (!silent) g.audio.hurt();
    if (!p.alive) g.die(null);
  }

  serialize() { return Object.keys(this.active); }

  // a fight in progress resets on reload: refund the offerings
  refund(kinds) { for (const k of kinds || []) { const def = BOSSES[k]; if (def) for (const [id, n] of Object.entries(def.cost)) this.game.inv.add(id, n); } }
}
