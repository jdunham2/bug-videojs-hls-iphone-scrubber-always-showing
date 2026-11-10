import * as THREE from 'three';
import { heightAt, slopeAt, VOLCANO, SWAMP, swampAt, frostAt, volcanicAt } from './terrain.js';

// Ancient Artifacts: eight relics on glowing pedestals in the island's hardest places.
// Each is sealed while its alpha guardians live; claiming one grants a permanent power.
export const ARTIFACTS = {
  might:   { name: 'Artifact of Might', icon: '🗡️', color: 0xff5a3a, bonus: '+15% damage with weapons', where: 'Deep in the Ember Depths', guards: ['cinderback', 1, 'duskraptor', 1] },
  swift:   { name: 'Artifact of the Swift', icon: '💨', color: 0x6af0ff, bonus: '+12% movement speed', where: 'Deep in the Glimmer Grotto', guards: ['echoscreecher', 2] },
  vigor:   { name: 'Artifact of Vigor', icon: '❤️', color: 0x7aff6a, bonus: '+40 maximum health', where: 'Deep in Rootway Hollow', guards: ['duskraptor', 1, 'echoscreecher', 1] },
  flame:   { name: 'Artifact of the Flame', icon: '🔥', color: 0xff9a2a, bonus: 'Immune to heat; burns hurt half as much', where: 'On the rim of Ashfang Volcano', guards: ['emberwing', 2] },
  frost:   { name: 'Artifact of the Frost', icon: '❄️', color: 0xbfe6ff, bonus: 'Immune to cold', where: 'On the summit of Frostpeak', guards: ['rimeclaw', 2] },
  beasts:  { name: 'Artifact of the Beasts', icon: '🐾', color: 0xc8ff5a, bonus: 'Taming is 30% faster', where: 'In the heart of Murkmire Swamp', guards: ['bogmaw', 2] },
  tide:    { name: 'Artifact of the Tide', icon: '🌊', color: 0x3a9aff, bonus: 'Never drown; swimming costs no stamina', where: 'On the sea floor off the southern coast', guards: ['voltfin', 2] },
  harvest: { name: 'Artifact of the Harvest', icon: '🌾', color: 0xffd84a, bonus: '+25% resources from gathering', where: 'On the northern highlands', guards: ['howler', 2] },
};
export const ARTIFACT_IDS = Object.keys(ARTIFACTS);

export class Artifacts {
  constructor(game) {
    this.game = game;
    this.have = new Set();
    this.sites = [];
    this.gemGeo = new THREE.OctahedronGeometry(0.45);
    this.beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 60, 8, 1, true); this.beamGeo.translate(0, 30, 0);
  }

  // Called after caves and boss shrines exist.
  build() {
    const g = this.game;
    const spot = (cx, cz, rad, ok) => {
      let best = null;
      for (let i = 0; i < 800; i++) {
        const x = cx + (Math.random() - 0.5) * rad * 2, z = cz + (Math.random() - 0.5) * rad * 2, h = heightAt(x, z);
        if (!ok(x, z, h)) continue;
        const sl = slopeAt(x, z);
        if (!best || sl < best.sl) best = { x, z, h, sl };
      }
      return best ? new THREE.Vector3(best.x, best.h, best.z) : null;
    };
    const inCave = (theme) => {
      const c = g.caves.list.find((k) => k.theme === theme);
      const ch = c.chambers[3] || c.chambers[c.chambers.length - 2];
      const x = ch.x - ch.r * 0.35, z = ch.z - ch.r * 0.35;
      return { pos: new THREE.Vector3(x, c.floor(x, z), z), cave: c };
    };
    const place = {
      might: () => inCave('lava'),
      swift: () => inCave('crystal'),
      vigor: () => inCave('moss'),
      flame: () => {
        // the rim, on the side facing away from Magmaroth's obelisk
        const m = g.bosses.shrines.find((s) => s.kind === 'magmaroth');
        const a0 = m ? Math.atan2(m.pos.z - VOLCANO.z, m.pos.x - VOLCANO.x) + Math.PI : 0;
        let best = null;
        for (let i = -6; i <= 6; i++) {
          const a = a0 + i * 0.12, x = VOLCANO.x + Math.cos(a) * (VOLCANO.crater + 12), z = VOLCANO.z + Math.sin(a) * (VOLCANO.crater + 12);
          const h = heightAt(x, z);
          if (!best || h > best.y) best = new THREE.Vector3(x, h, z);
        }
        return { pos: best };
      },
      frost: () => {
        let best = null;
        for (let i = 0; i < 900; i++) {
          const x = -120 + (Math.random() - 0.5) * 220, z = -170 + (Math.random() - 0.5) * 220, h = heightAt(x, z);
          if (frostAt(x, z) < 0.8 || slopeAt(x, z) > 0.25) continue;
          if (!best || h > best.y) best = new THREE.Vector3(x, h, z);
        }
        return { pos: best };
      },
      beasts: () => ({ pos: spot(SWAMP.x, SWAMP.z, 50, (x, z, h) => swampAt(x, z) > 0.85 && h > 0.5 && h < 2.5) }),
      tide: () => {
        for (let x = -60; x <= 60; x += 6) {
          for (let z = 200; z < 440; z += 3) { const h = heightAt(x, z); if (h < -6 && h > -9) return { pos: new THREE.Vector3(x, h, z) }; }
        }
        return { pos: spot(0, 380, 120, (x, z, h) => h < -5 && h > -9) };
      },
      harvest: () => ({ pos: spot(-60, -150, 110, (x, z, h) => h > 28 && frostAt(x, z) < 0.3 && volcanicAt(x, z) < 0.2) }),
    };
    for (const id of ARTIFACT_IDS) {
      const r = place[id]();
      let pos = r.pos;
      if (!pos) { const a = ARTIFACT_IDS.indexOf(id); pos = new THREE.Vector3(Math.cos(a) * 120, 0, Math.sin(a) * 120); pos.y = heightAt(pos.x, pos.z); }
      this.sites.push(this.buildSite(id, pos, r.cave));
    }
  }

  buildSite(id, pos, cave) {
    const g = this.game, def = ARTIFACTS[id];
    const grp = new THREE.Group();
    const stone = this.stoneMat || (this.stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.6, metalness: 0.15, flatShading: true }));
    const gold = this.goldMat || (this.goldMat = new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.35, metalness: 0.8 }));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.5, 8), stone); base.position.y = 0.2; grp.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.2, 8), stone); col.position.y = 1.05; grp.add(col);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.22, 8), gold); top.position.y = 1.75; grp.add(top);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6 + (i % 2) * 0.5, 0.35), stone);
      st.position.set(Math.cos(a) * 2.2, 0.7, Math.sin(a) * 2.2); st.rotation.y = a; grp.add(st);
    }
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const gem = new THREE.Mesh(this.gemGeo, new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.8, roughness: 0.25, metalness: 0.3 }));
    gem.position.y = 2.5; grp.add(gem);
    const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 2.5; beam.visible = !cave; grp.add(beam);
    grp.position.copy(pos);
    g.scene.add(grp);
    if (!cave && pos.y > 0) {
      g.world.colliders.add({ x: pos.x, z: pos.z, r: 1.2 });
      // clear a glade around the pedestal so the light can be seen
      for (const n of [...g.world.nodesNear(pos.x, pos.z, 8)]) {
        if (!n.alive) continue;
        n.alive = false; n.respawn = Infinity;
        n.mesh.setMatrixAt(n.index, g.world.zero); n.mesh.instanceMatrix.needsUpdate = true;
        if (n.collider) g.world.colliders.remove(n.collider);
      }
    }
    return { id, pos, cave, grp, gem, beam, guards: null };
  }

  has(id) { return this.have.has(id); }
  get count() { return this.have.size; }
  get all() { return this.have.size >= ARTIFACT_IDS.length; }

  near(pos) { return this.sites.find((s) => !this.have.has(s.id) && Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) < 3.4 && Math.abs(s.pos.y + 1.5 - pos.y) < 4.5); }

  guardsAlive(s) { return s.guards ? s.guards.filter((c) => c.alive && !c.tamed && this.game.creatures.list.includes(c)) : []; }

  prompt(s) {
    const def = ARTIFACTS[s.id], n = this.guardsAlive(s).length;
    return n ? `${def.icon} ${def.name} — sealed while ${n} guardian${n === 1 ? '' : 's'} live${n === 1 ? 's' : ''}` : `<kbd>E</kbd> Claim the ${def.name} (${def.bonus})`;
  }

  claim(s) {
    const g = this.game, def = ARTIFACTS[s.id];
    const n = this.guardsAlive(s).length;
    if (n) { g.ui.notify(`The ${def.name} is sealed. Defeat its ${n} guardian${n === 1 ? '' : 's'} first!`, 'warn'); return; }
    this.have.add(s.id);
    this.apply(s.id, true);
    s.gem.visible = false; s.beam.visible = false;
    g.player.addXP(150, g.xpHooks);
    g.ui.banner(def.name.toUpperCase(), `${def.bonus} · ${this.count}/${ARTIFACT_IDS.length} artifacts`);
    g.audio.tamed();
    g.audio.tone({ f0: 520, f1: 1560, dur: 1.2, vol: 0.18, type: 'sine', verb: 0.6 });
    if (this.all) {
      g.player.maxStam += 50; g.player.stam = g.player.maxStam; g.player.hp = g.player.maxHp;
      setTimeout(() => g.ui.banner('PRIMAL ASCENDANT', 'All eight artifacts are yours: +50 stamina and +25% experience'), 3500);
    }
    g.saves.markDirty();
  }

  // Permanent effects. `fresh` = the moment of claiming (one-time stat gains).
  apply(id, fresh) {
    const p = this.game.player;
    if (id === 'vigor' && fresh) { p.maxHp += 40; p.hp = Math.min(p.maxHp, p.hp + 40); }
    if (id === 'swift') p.speedMult = 1.12;
    if (id === 'tide') p.noDrown = true;
  }

  dmgMult() { return this.has('might') ? 1.15 : 1; }
  tameMult() { return this.has('beasts') ? 1.3 : 1; }
  gatherMult() { return this.has('harvest') ? 1.25 : 1; }
  xpMult() { return this.all ? 1.25 : 1; }

  update(dt) {
    const g = this.game, p = g.player, t = performance.now() / 1000;
    for (const s of this.sites) {
      if (this.have.has(s.id)) continue;
      const d = s.pos.distanceTo(p.pos);
      if (d < 120) { s.gem.rotation.y = t * 1.2; s.gem.position.y = 2.5 + Math.sin(t * 2) * 0.15; }
      // guardians wake when you first come close
      if (!s.guards && d < 45 && p.alive) this.spawnGuards(s);
    }
  }

  spawnGuards(s) {
    const g = this.game, list = ARTIFACTS[s.id].guards;
    s.guards = [];
    for (let i = 0; i < list.length; i += 2) {
      for (let k = 0; k < list[i + 1]; k++) {
        const a = Math.random() * Math.PI * 2, r = s.cave ? 4 : 8;
        const pos = new THREE.Vector3(s.pos.x + Math.cos(a) * r, 0, s.pos.z + Math.sin(a) * r);
        pos.y = s.id === 'tide' ? s.pos.y + 2 : heightAt(pos.x, pos.z);
        const c = g.creatures.spawn(list[i], pos);
        g.creatures.makeAlpha(c);
        c.guardian = true;
        c.home = s.pos.clone(); c.homeR = s.cave ? 5 : 12;
        if (s.cave) c.cave = s.cave;
        s.guards.push(c);
      }
    }
    g.ui.notify(`${ARTIFACTS[s.id].icon} Guardians rise to protect the ${ARTIFACTS[s.id].name}!`, 'warn');
  }

  serialize() { return [...this.have]; }
  load(arr) {
    for (const id of arr || []) {
      if (!ARTIFACTS[id]) continue;
      this.have.add(id);
      this.apply(id, false);
      const s = this.sites.find((x) => x.id === id);
      if (s) { s.gem.visible = false; s.beam.visible = false; }
    }
  }
}
