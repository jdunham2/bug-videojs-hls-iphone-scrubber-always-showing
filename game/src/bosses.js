import * as THREE from 'three';
import { heightAt, VOLCANO, LAVA_Y, WATER_LEVEL, HALF, SWAMP, swampAt, frostAt, slopeAt } from './terrain.js';
import { BOSS_TYRANT } from './creatures.js';
import { lavaMaterial } from './volcano.js';
import { ITEMS } from './items.js';

// Four bosses, each summoned at its own shrine with an offering and each dropping a unique
// crafting reward. The Primal Tyrant's altar is built by the game; the others are built here.
export const BOSSES = {
  tyrant: { ...BOSS_TYRANT, title: 'THE PRIMAL TYRANT', cost: { trophy: 3 }, reward: [['fang', 1], ['ingot', 25], ['trophy', 2], ['sigil', 1]], rewardText: 'Its fang forges the Primal Blade', color: 0xff3a1a },
  magmaroth: {
    kind: 'magmaroth', species: 'cinderback', name: 'Magmaroth, the Molten King', title: 'MAGMAROTH, THE MOLTEN KING',
    hp: 20000, dmg: 62, scale: 2.7, minions: ['cinderback', 2, 35], phases: [0.6, 0.3], abilities: ['stomp', 'eruption'], arena: 90, leash: 80,
    cost: { obsidian: 15, trophy: 1 }, reward: [['core', 1], ['obsidian', 20], ['ingot', 20], ['sigil', 1]], rewardText: 'Its Molten Core forges Magmaplate Armor', color: 0xff7a1a,
  },
  deepmother: {
    kind: 'deepmother', species: 'deepjaw', name: 'The Deep Mother', title: 'THE DEEP MOTHER',
    hp: 18000, dmg: 48, scale: 3.2, minions: ['deepjaw', 2, 35], phases: [0.5], abilities: ['whirlpool'], arena: 90,
    cost: { meat: 20, trophy: 1 }, reward: [['pearl', 1], ['ingot', 20], ['hide', 20], ['sigil', 1]], rewardText: 'Its Abyssal Pearl forges the Tidecaller Trident', color: 0x3ac8ff,
  },
  hollowqueen: {
    kind: 'hollowqueen', species: 'duskraptor', name: 'The Hollow Queen', title: 'THE HOLLOW QUEEN',
    hp: 12000, dmg: 38, scale: 2.5, minions: ['duskraptor', 3, 30], phases: [0.75, 0.5, 0.25], abilities: ['shriek', 'pounce'], arena: 60, leash: 40,
    cost: { crystal: 20 }, reward: [['eye', 1], ['crystal', 20], ['ingot', 15], ['sigil', 1]], rewardText: 'Her eye forges the Huntress Bow', color: 0x9a6aff,
  },
  rimefang: {
    kind: 'rimefang', species: 'rimeclaw', name: 'Rimefang, the Frozen Alpha', title: 'RIMEFANG, THE FROZEN ALPHA',
    hp: 15000, dmg: 44, scale: 3.3, minions: ['rimeclaw', 3, 35], phases: [0.66, 0.33], abilities: ['icespikes', 'blizzard', 'pounce'], arena: 80, leash: 60,
    cost: { pelt: 15, trophy: 1 }, reward: [['frostheart', 1], ['pelt', 15], ['ingot', 15], ['sigil', 1]], rewardText: 'Its Frost Heart forges the Frostbrand Sword', color: 0x9ae0ff,
  },
  mirelord: {
    kind: 'mirelord', species: 'bogmaw', name: 'Mirelord, the Swamp King', title: 'MIRELORD, THE SWAMP KING',
    hp: 17000, dmg: 50, scale: 3.0, minions: ['bogmaw', 2, 35], phases: [0.6, 0.3], abilities: ['poison', 'submerge'], arena: 80, leash: 60,
    cost: { herb: 20, trophy: 1 }, reward: [['miretooth', 1], ['herb', 15], ['ingot', 15], ['sigil', 1]], rewardText: 'Its tooth makes Mirehide Armor, which heals you', color: 0x7ad84a,
  },
  stormwing: {
    kind: 'stormwing', species: 'thunderwing', name: 'Stormwing, the Tempest', title: 'STORMWING, THE TEMPEST',
    hp: 16000, dmg: 46, scale: 2.6, minions: ['thunderwing', 2, 35], phases: [0.6, 0.3], abilities: ['lightning', 'gust'], arena: 110, leash: 100,
    cost: { hide: 20, trophy: 2 }, reward: [['stormfeather', 1], ['hide', 20], ['ingot', 15], ['sigil', 1]], rewardText: 'Its Storm Feather makes Skyward Wings — glide instead of falling', color: 0xd8e8ff,
  },
  broodmother: {
    kind: 'broodmother', species: 'frillspitter', name: 'The Broodmother', title: 'THE BROODMOTHER',
    hp: 14000, dmg: 40, scale: 4.2, minions: ['frillspitter', 3, 30], phases: [0.66, 0.33], abilities: ['spitvolley', 'pounce'], arena: 70, leash: 50,
    cost: { meat: 15, trophy: 1 }, reward: [['venomgland', 1], ['meat', 15], ['ingot', 15], ['sigil', 1]], rewardText: 'Her venom gland forges the Venom Blade', color: 0xc8e83a,
  },
  gravefang: {
    kind: 'gravefang', species: 'gorgonax', name: 'Gravefang, the Undying', title: 'GRAVEFANG, THE UNDYING', tint: 0xe8e0d0,
    hp: 15000, dmg: 58, scale: 2.0, minions: ['nightstalker', 2, 35], phases: [0.5], abilities: ['stomp', 'shadow'], arena: 90, leash: 70, revive: true, nightOnly: true,
    cost: { meat: 10, hide: 10, trophy: 1 }, reward: [['boneheart', 1], ['ingot', 20], ['trophy', 1], ['sigil', 1]], rewardText: 'Its Bone Heart forges the Bonecrusher', color: 0xd8d0ff,
  },
  rootwarden: {
    kind: 'rootwarden', species: 'scythehand', name: 'The Rootwarden', title: 'THE ROOTWARDEN', tint: 0x9ac87a,
    hp: 16000, dmg: 48, scale: 2.3, minions: ['dashbeak', 4, 30], phases: [0.66, 0.33], abilities: ['roots', 'pounce'], arena: 60, leash: 40,
    cost: { wood: 60, herb: 10 }, reward: [['heartwood', 1], ['wood', 50], ['ingot', 15], ['sigil', 1]], rewardText: 'Its Heartwood makes the Harvester Axe', color: 0x8ad86a,
  },
  devourer: {
    kind: 'devourer', species: 'sandmaw', name: 'The Dune Devourer', title: 'THE DUNE DEVOURER',
    hp: 15000, dmg: 52, scale: 3.0, minions: ['sandmaw', 3, 32], phases: [0.66, 0.33], abilities: ['submerge', 'quake'], arena: 80, leash: 60,
    cost: { hide: 15, stone: 40, trophy: 1 }, reward: [['devourertooth', 1], ['hide', 15], ['ingot', 15], ['sigil', 1]], rewardText: 'Its tooth forges the Quakehammer', color: 0xe8c87a,
  },
  howlingking: {
    kind: 'howlingking', species: 'howler', name: 'The Howling King', title: 'THE HOWLING KING',
    hp: 13000, dmg: 42, scale: 2.6, minions: ['howler', 3, 32], phases: [0.66, 0.33], abilities: ['howl', 'pounce'], arena: 80, leash: 60,
    cost: { meat: 15, pelt: 5, trophy: 1 }, reward: [['kinghorn', 1], ['pelt', 10], ['ingot', 15], ['sigil', 1]], rewardText: 'Its horn becomes the Packleader Horn', color: 0xb8b8c8,
  },
  titan: {
    kind: 'titan', species: 'thunderneck', name: 'The Ancient Titan', title: 'THE ANCIENT TITAN',
    hp: 45000, dmg: 90, scale: 1.9, minions: ['talonrunner', 4, 40], minionsList: [['talonrunner', 4, 40], ['cinderback', 2, 40], ['gorgonax', 1, 45]], phases: [0.75, 0.5, 0.25],
    abilities: ['stomp', 'quake', 'eruption'], arena: 120, leash: 90,
    cost: { sigil: 6 }, reward: [['titanheart', 1], ['ingot', 50], ['trophy', 5]], rewardText: 'Its heart forges Primeval Armor, the finest on the island', color: 0xffe08a,
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
    // Rimefang: an ice spire on Frostpeak
    const spot = (cx, cz, rad, ok) => {
      let best = null;
      for (let i = 0; i < 600; i++) {
        const x = cx + (Math.random() - 0.5) * rad * 2, z = cz + (Math.random() - 0.5) * rad * 2, h = heightAt(x, z);
        if (!ok(x, z, h)) continue;
        const sl = slopeAt(x, z);
        if (!best || sl < best.sl) best = { x, z, h, sl };
      }
      return best ? new THREE.Vector3(best.x, best.h, best.z) : new THREE.Vector3(cx, heightAt(cx, cz), cz);
    };
    const away = (p, d) => { for (let a = 0; a < 6.28; a += 0.4) { const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; const h = heightAt(x, z); if (Math.abs(h - p.y) < 6) return new THREE.Vector3(x, h, z); } return p.clone(); };
    const rPos = spot(-120, -170, 90, (x, z, h) => frostAt(x, z) > 0.75);
    this.shrines.push({ kind: 'rimefang', pos: rPos, spawn: away(rPos, 16) });
    // Mirelord: a mossy totem in the heart of the swamp
    const sPos = spot(SWAMP.x, SWAMP.z, 60, (x, z, h) => swampAt(x, z) > 0.8 && h > 0.4 && h < 2);
    this.shrines.push({ kind: 'mirelord', pos: sPos, spawn: away(sPos, 16) });
    // The Ancient Titan: a great monolith on the shore of Crescent Lake
    const lPos = spot(120, 30, 90, (x, z, h) => h > 2 && h < 6 && Math.hypot(x - 120, z - 30) > 40 && Math.hypot(x - 120, z - 30) < 80);
    this.shrines.push({ kind: 'titan', pos: lPos, spawn: away(lPos, 26) });
    // Stormwing: a storm spire on the north-eastern heights
    const wPos = spot(110, -170, 90, (x, z, h) => h > 30 && frostAt(x, z) < 0.4 && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > 150);
    this.shrines.push({ kind: 'stormwing', pos: wPos, spawn: wPos.clone().add(new THREE.Vector3(0, 30, -20)) });
    // Broodmother: a venom-stained totem in the western woods
    const bPos = spot(-230, 70, 70, (x, z, h) => h > 8 && h < 24 && swampAt(x, z) < 0.3);
    this.shrines.push({ kind: 'broodmother', pos: bPos, spawn: away(bPos, 15) });
    // Gravefang: a bone cairn on the central plains (night only)
    const gPos = spot(-40, 120, 80, (x, z, h) => h > 5 && h < 20 && swampAt(x, z) < 0.2);
    this.shrines.push({ kind: 'gravefang', pos: gPos, spawn: away(gPos, 18) });
    // Rootwarden: a root-wrapped stone deep in Rootway Hollow
    const hollow = g.caves.list.find((c) => c.theme === 'moss');
    const hch = hollow.chambers[4] || hollow.chambers[hollow.chambers.length - 2];
    const hcc = hollow.cacheChamber;
    this.shrines.push({ kind: 'rootwarden', pos: new THREE.Vector3(hch.x, hollow.floor(hch.x, hch.z), hch.z), spawn: new THREE.Vector3(hcc.x - 3, hollow.floor(hcc.x - 3, hcc.z), hcc.z), cave: hollow });
    // Dune Devourer: a driftwood totem on the eastern beaches
    const dPos = spot(300, 150, 90, (x, z, h) => h > 1.2 && h < 4 && swampAt(x, z) < 0.2 && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > 170);
    this.shrines.push({ kind: 'devourer', pos: dPos, spawn: away(dPos, 15) });
    // Howling King: a standing stone on the northern grasslands
    const hPos = spot(30, -40, 90, (x, z, h) => h > 8 && h < 24 && frostAt(x, z) < 0.3 && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > 170);
    this.shrines.push({ kind: 'howlingking', pos: hPos, spawn: away(hPos, 16) });
    for (const s of this.shrines) if (s.kind !== 'tyrant') this.buildShrine(s);
  }

  buildShrine(s) {
    const g = this.game, def = BOSSES[s.kind];
    const grp = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: { magmaroth: 0x1a1620, deepmother: 0x4a5a5e, rimefang: 0xc8d8e8, mirelord: 0x3a4a2a, titan: 0x8a7a5a, stormwing: 0x5a6070, broodmother: 0x3a4a2a, gravefang: 0xd8d0c0, rootwarden: 0x4a3a24, devourer: 0x8a6a4a, howlingking: 0x5a5a62 }[s.kind] || 0x2a3038, roughness: 0.4, metalness: 0.2, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.8, 6), stone); base.position.y = 0.3; grp.add(base);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 5), stone); pillar.position.y = 2.2; grp.add(pillar);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.6, roughness: 0.3 }));
    gem.position.y = 4.3; grp.add(gem);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2 + (i % 2), 5), stone);
      st.position.set(Math.cos(a) * 3.2, 0.8, Math.sin(a) * 3.2); grp.add(st);
    }
    if (s.kind === 'titan') grp.scale.setScalar(1.8);
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
    if (def.nightOnly && this.game.env.daylight > 0.3) return `${def.name} sleeps until nightfall — return after dark`;
    const have = Object.entries(def.cost).map(([id, n]) => `${Math.min(this.game.inv.count(id), n)}/${n} ${ITEMS[id].name}`).join(' · ');
    return `<kbd>E</kbd> Summon ${def.name} — offer ${have}`;
  }

  summon(s) {
    const g = this.game, def = BOSSES[s.kind];
    if (this.active[s.kind] && this.active[s.kind].alive) { g.ui.notify(`${def.name} is already here!`, 'warn'); return; }
    if (def.nightOnly && g.env.daylight > 0.3) { g.ui.notify(`${def.name} only answers in the dead of night`, 'warn'); return; }
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
  eruption(c, style = 'fire') {
    const g = this.game, p = g.player;
    g.ui.notify({ fire: 'The ground splits — move!', ice: 'Ice spikes surge from the ground!', poison: 'Toxic bog gas bubbles up!', lightning: 'The air crackles — lightning is coming!', roots: 'Roots writhe beneath you — move!' }[style], 'warn');
    const color = { fire: 0xff5a1a, ice: 0x9ae0ff, poison: 0x7ad84a, lightning: 0xfff2a0, roots: 0x8a6a2a }[style];
    for (let i = 0; i < (style === 'poison' ? 3 : 4); i++) {
      const pos = i === 0 ? p.pos.clone() : p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18));
      pos.y = heightAt(pos.x, pos.z) + 0.15;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(pos); ring.scale.setScalar(0.3);
      g.scene.add(ring);
      this.hazards.push({ type: 'eruption', style, pos, r: style === 'poison' ? 4.8 : 3.6, t: (style === 'poison' ? 0.8 : 1.5) + i * 0.15, ring, life: style === 'poison' ? 8 : 6 });
    }
  }

  poolMat(style) {
    if (style === 'fire') return this.lavaMat;
    if (style === 'roots') return this._rootMat || (this._rootMat = new THREE.MeshStandardMaterial({ color: 0x5a4024, roughness: 0.9, transparent: true, opacity: 0.85 }));
    this._mats = this._mats || {};
    return this._mats[style] || (this._mats[style] = new THREE.MeshStandardMaterial(style === 'ice'
      ? { color: 0xd8f0ff, emissive: 0x5aa8d8, emissiveIntensity: 0.5, roughness: 0.15, transparent: true, opacity: 0.85 }
      : { color: 0x5aa82a, emissive: 0x3a8a1a, emissiveIntensity: 0.8, roughness: 0.9, transparent: true, opacity: 0.6, depthWrite: false }));
  }

  // damage that armor reduces (ice, poison, quakes)
  hit(dmg, silent) {
    const g = this.game, p = g.player;
    if (p.mount) { g.creatures.damage(p.mount, dmg, 0, null); return; }
    const a = p.armor ? ITEMS[p.armor.id].armor || 0 : 0;
    p.damage(dmg * (1 - a * 0.6));
    p.hurtT = Math.max(p.hurtT, silent ? 0.2 : 0.4);
    if (!silent) g.audio.hurt();
    if (!p.alive) g.die(null);
  }

  // a jagged bolt from the sky, plus a flash
  bolt(pos) {
    const g = this.game;
    const pts = []; let x = pos.x, z = pos.z;
    for (let y = pos.y + 90; y > pos.y; y -= 9) { pts.push(new THREE.Vector3(x, y, z)); x += (Math.random() - 0.5) * 4; z += (Math.random() - 0.5) * 4; }
    pts.push(pos.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xfff8d0, fog: false }));
    g.scene.add(line);
    setTimeout(() => { g.scene.remove(line); line.geometry.dispose(); }, 180);
    g.weather.flash = 1;
    g.audio.thunder?.(0.95);
    g.shake = Math.max(g.shake || 0, 0.4);
  }

  shadow(c, d) {
    const g = this.game;
    this.shriekT = 2.5;
    g.ui.notify('A wave of grave-cold shadow rolls out!', 'warn');
    g.audio.roar(3, 0, 0, 'roar');
    if (d < 22) this.hit(26 * (1 - d / 26));
    for (const t of g.creatures.list) if (t.tamed && t.alive && t.pos.distanceTo(c.pos) < 22) g.creatures.damage(t, 40, 0, c);
  }

  revive(c) {
    const g = this.game;
    g.ui.banner(`${c.name.toUpperCase()} RISES AGAIN`, 'It will not stay down so easily');
    g.shake = 1.2; g.audio.thunder?.(1);
    c.cd.shadow = 0;
  }

  gust(c, d) {
    const g = this.game, p = g.player;
    g.ui.notify('A howling gust blasts you back!', 'warn');
    g.audio.noiseHit({ freq: 400, q: 0.3, dur: 1.2, vol: 0.6, type: 'lowpass' });
    const away = new THREE.Vector3().subVectors(p.pos, c.pos).setY(0).normalize();
    if (p.mount) { p.mount.pos.addScaledVector(away, 12); if (p.mount.flying) p.mount.vy = (p.mount.vy || 0) - 6; }
    else { p.vel.addScaledVector(away, 16); p.vel.y += 5; }
    this.hit(10, true);
  }

  blizzard(c) {
    this.blizzardT = 6;
    this.game.ui.notify('Rimefang summons a blizzard — find warmth!', 'warn');
    this.game.audio.thunder?.(0.4);
  }

  quake(c, d) {
    const g = this.game, p = g.player;
    g.shake = 1.6;
    g.audio.thunder?.(1);
    g.ui.notify(`${c.name} shakes the ground!`, 'warn');
    if (d < 40 && p.alive) {
      this.hit(45 * (1 - d / 42));
      if (!p.mount) { const away = new THREE.Vector3().subVectors(p.pos, c.pos).setY(0).normalize().multiplyScalar(18); p.vel.add(away); p.vel.y += 7; }
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
    if (this.blizzardT > 0) { this.blizzardT -= dt; document.getElementById('blizzard').style.opacity = Math.min(0.75, this.blizzardT * 0.4); }
    else document.getElementById('blizzard').style.opacity = 0;
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
            h.pool = new THREE.Mesh(this.poolGeo, this.poolMat(h.style)); h.pool.rotation.x = -Math.PI / 2; h.pool.position.copy(h.pos); h.pool.scale.setScalar(h.r);
            g.scene.add(h.pool);
            if (h.style === 'ice') {
              // spikes are children of the (rotated, r-scaled) pool: local +z points up
              this.spikeGeo = this.spikeGeo || new THREE.ConeGeometry(0.1, 0.7, 5).rotateX(Math.PI / 2).translate(0, 0, 0.35);
              for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const sp = new THREE.Mesh(this.spikeGeo, this.poolMat('ice')); sp.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0); h.pool.add(sp); }
            }
            g.shake = Math.max(g.shake || 0, 0.5);
            if (h.style === 'lightning') { this.bolt(h.pos); h.life = Math.min(h.life, 0.4); }
            if (p.pos.distanceTo(h.pos) < h.r + 0.5) { if (h.style === 'fire') this.burn(35); else if (h.style === 'ice') { this.hit(28); p.slowT = 3; } else if (h.style === 'lightning') this.hit(34); else if (h.style === 'roots') { this.hit(20); p.rootT = 2.2; g.ui.notify('Roots pin you in place!', 'warn'); } }
          }
        } else if (h.style !== 'lightning' && h.style !== 'roots' && p.pos.distanceTo(h.pos) < h.r && Math.abs(p.pos.y - h.pos.y) < 2) {
          if (h.style === 'fire') this.burn(20 * dt, true);
          else if (h.style === 'ice') { this.hit(6 * dt, true); p.slowT = Math.max(p.slowT || 0, 0.5); }
          else { this.hit(14 * dt, true); p.poisonT = 0.5; }
        }
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
