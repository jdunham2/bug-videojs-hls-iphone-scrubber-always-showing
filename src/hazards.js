// Arena hazards and boons: things in the world that help or hurt.
//   Explosive barrel  – one arrow blows it up; hurts everything nearby (you too) and chains.
//   Spike trap        – rattles, then springs on anyone standing on it, enemies included.
//   Fresh spring      – stand in the water to heal (limited per wave).
//   War drum          – shoot it: the beat speeds up your movement and draw for a few seconds.
//   Ballista          – shoot it to load it; it fires heavy bolts at nearby enemies for a while.
//   Ice patch (Keep)  – slippery footing, slows enemies.
//   Lava vent (Forge) – erupts in flame on a timer.

import * as THREE from 'three';
import { spawnProp, disposeTree } from './models.js';
import { pillars, ARENA_HALF } from './world.js';
import { buffs } from './skills.js';

const rand = (a, b) => a + Math.random() * (b - a);
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function glowDisc(color, r, opacity = 0.4) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(plane, mat);
  m.scale.setScalar(r * 2);
  m.position.y = 0.04;
  m.renderOrder = 1;
  return m;
}

/** What each arena brings (counts per type). */
const SETS = [
  { barrel: 3, spikes: 2, spring: 1, drum: 1, ballista: 1 },
  { barrel: 2, spikes: 2, spring: 1, drum: 1, ballista: 1, ice: 4 },
  { barrel: 5, spikes: 1, spring: 1, drum: 1, ballista: 1, vent: 4 },
  { barrel: 2, spikes: 4, spring: 2, drum: 1 }, // Whispering Marsh: sunken spike traps, fresh springs
  { barrel: 3, spikes: 2, spring: 1, drum: 2, ballista: 1 }, // Autumn Hollow
  { barrel: 7, spikes: 2, spring: 1, ballista: 1 }, // Deepdelve Mines: powder everywhere
  { barrel: 5, spikes: 1, spring: 1, drum: 2, ballista: 2 }, // Stormwatch Harbor
  { barrel: 2, spikes: 3, spring: 1, drum: 1, ballista: 1, vent: 3 }, // Sunscorch Canyon: hot vents
  { barrel: 4, spikes: 1, spring: 1, ballista: 1, vent: 7 }, // Emberfall Caldera
  { barrel: 2, spikes: 4, spring: 2, drum: 1, ballista: 1 }, // Verdant Temple: old traps in the steps
  { barrel: 6, spikes: 1, spring: 1, drum: 1, ballista: 2 }, // Shipwreck Cove: powder from the wreck
  { barrel: 2, spikes: 3, spring: 3, drum: 1 }, // Glowcap Grove
  { barrel: 3, spikes: 2, spring: 2, drum: 1, ballista: 1, vent: 2 }, // Sandsea Oasis
  { barrel: 5, spikes: 1, spring: 1, ballista: 1, vent: 6 }, // Clockwork Foundry: steam vents
  { barrel: 3, spikes: 2, spring: 1, drum: 2, ballista: 1, ice: 3 }, // Misty Highlands: frosty stones
  { barrel: 2, spikes: 1, spring: 1, ballista: 1, ice: 7 }, // Glacier Lake: slick ice everywhere
  { barrel: 2, spikes: 4, spring: 2, drum: 1 }, // Whisperpine Woods: hunters' traps
  { barrel: 4, spikes: 2, spring: 1, drum: 2, ballista: 2 }, // Field of Banners
  { barrel: 3, spikes: 3, spring: 2, ballista: 1, vent: 2 }, // Glimmer Caverns
  { barrel: 6, spikes: 1, spring: 1, ballista: 1, vent: 5 }, // Ironhold: forge vents and powder
  { barrel: 5, spikes: 2, spring: 1, drum: 2, ballista: 2 }, // Redcliff Fort
];

export class Hazards {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.list = [];
  }

  /** Targets arrows can hit (barrels, drums and ballistas behave like enemies for arrow collision). */
  get targets() {
    return this.list.filter((h) => h.hittable && !h.removed);
  }

  /** Lay out a fresh set of hazards for an arena. */
  setup(arenaIndex) {
    this.clear();
    const set = SETS[arenaIndex % SETS.length];
    this.taken = [];
    for (const [type, n] of Object.entries(set)) {
      for (let i = 0; i < n; i++) {
        const spot = this.findSpot(type === 'ice' || type === 'vent' ? 2.5 : 3);
        if (spot) this.add(type, spot);
      }
    }
  }

  /** Each new wave restocks barrels and refills springs. */
  restock(arenaIndex) {
    const set = SETS[arenaIndex % SETS.length];
    const count = (t) => this.list.filter((h) => h.type === t && !h.removed).length;
    for (const t of ['barrel']) {
      for (let i = count(t); i < set[t]; i++) {
        const spot = this.findSpot(3);
        if (spot) this.add(t, spot);
      }
    }
    for (const h of this.list) if (h.type === 'spring') h.charge = 45;
  }

  findSpot(spacing) {
    const P = this.game.player.pos;
    for (let k = 0; k < 60; k++) {
      const x = rand(-ARENA_HALF + 2.5, ARENA_HALF - 2.5);
      const z = rand(-ARENA_HALF + 2.5, ARENA_HALF - 2.5);
      if (Math.hypot(x, z) < 3.5) continue; // keep the centre clear
      if (Math.hypot(x - P.x, z - P.z) < 3) continue;
      if (pillars.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 1.5)) continue;
      if ((this.taken || []).some((t) => Math.hypot(x - t.x, z - t.z) < spacing)) continue;
      const spot = { x, z };
      (this.taken ||= []).push(spot);
      return spot;
    }
    return null;
  }

  add(type, { x, z }) {
    const h = { type, pos: new THREE.Vector3(x, 0, z), t: rand(0, 2), removed: false };
    const group = new THREE.Group();
    group.position.copy(h.pos);
    this.root.add(group);
    h.group = h.rig = group;
    const model = (id, size) => {
      const p = spawnProp(id, size);
      if (p) group.add(p);
      return p;
    };
    if (type === 'barrel') {
      h.model = model('powderBarrel', 1.1) || group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 10), new THREE.MeshStandardMaterial({ color: 0xaa2a1a })));
      h.hittable = true;
      h.radius = 0.5;
      h.collider = { x, z, r: 0.5, h: 1.1, hazardSpot: true };
      pillars.push(h.collider);
    } else if (type === 'spikes') {
      h.model = model('spikeTrap', 0.5);
      if (h.model) h.model.position.y = -0.32;
      h.glow = glowDisc(new THREE.Color(3, 0.4, 0.2), 1.2, 0);
      group.add(h.glow);
      h.phase = 'idle';
      h.t = rand(1, 3);
    } else if (type === 'spring') {
      model('springWell', 1.1);
      h.glow = glowDisc(new THREE.Color(0.9, 1.6, 2.2), 2.2, 0.25);
      group.add(h.glow);
      h.charge = 45;
      pillars.push({ x, z, r: 0.7, h: 0.9, hazardSpot: true });
    } else if (type === 'drum') {
      h.model = model('warDrum', 1.3);
      h.hittable = true;
      h.radius = 0.6;
      h.cool = 0;
      pillars.push({ x, z, r: 0.6, h: 1.3, hazardSpot: true });
    } else if (type === 'ballista') {
      h.model = model('ballista', 1.8);
      h.hittable = true;
      h.radius = 0.7;
      h.active = 0;
      h.cool = 0;
      pillars.push({ x, z, r: 0.7, h: 1.4, hazardSpot: true });
    } else if (type === 'ice') {
      h.glow = glowDisc(new THREE.Color(1.2, 1.8, 2.4), 2.0, 0.35);
      group.add(h.glow);
      h.radius = 2.0;
    } else if (type === 'vent') {
      h.glow = glowDisc(new THREE.Color(3, 0.9, 0.2), 1.4, 0.15);
      group.add(h.glow);
      h.phase = 'idle';
      h.t = rand(2, 5);
    }
    // Arrow-collision interface (shared with enemies).
    h.isHittable = () => !h.removed && h.hittable && !(h.active > 0 || h.cool > 0);
    h.hit = () => {
      if (h.type === 'barrel') this.explode(h);
      if (h.type === 'ballista') this.loadBallista(h);
      if (h.type === 'drum') this.beatDrum(h);
      return null; // not an enemy: no damage numbers or kill credit
    };
    this.list.push(h);
    return h;
  }

  explode(h) {
    if (h.removed) return;
    h.removed = true;
    h.group.visible = false;
    const i = pillars.indexOf(h.collider);
    if (i >= 0) pillars.splice(i, 1);
    const G = this.game;
    const pos = h.pos;
    const R = 3.6;
    G.explosion(pos, R, 75, 22);
    G.sfx.bossSlam();
    G.decals.spawn(pos, 'scorch', 4.5, 20);
    G.zoomKick = Math.min(0.12, G.zoomKick + 0.07);
    // Chain reaction.
    for (const o of this.list) {
      if (o !== h && o.type === 'barrel' && !o.removed && o.pos.distanceTo(pos) < R) setTimeout(() => this.explode(o), 140);
    }
  }

  loadBallista(h) {
    h.active = 8;
    h.zap = 0.4;
    this.game.sfx.sample('thunkWood', { vol: 0.7, rate: 0.6, pan: this.game.panAt(h.pos) });
    this.game.numbers.spawn(h.pos.clone().setY(2.6), 'BALLISTA LOADED', 'callout');
  }

  /** A hit on the war drum: one big beat that quickens your step and draw. */
  beatDrum(h) {
    const G = this.game;
    h.cool = 14;
    buffs.haste = 6;
    G.numbers.spawn(G.player.pos.clone().setY(2.4), 'HASTE!', 'callout gold');
    G.sfx.sample('boom', { vol: 0.8, rate: 0.7, jitter: 0, pan: G.panAt(h.pos) });
    G.sfx.sample('thunkWood', { vol: 0.6, rate: 0.5, jitter: 0, pan: G.panAt(h.pos) });
    G.shake.add(0.2);
    if (h.model) h.punch = 1;
  }

  update(dt) {
    const G = this.game;
    const P = G.player;
    buffs.haste = Math.max(0, buffs.haste - dt);
    buffs.slippery = false;
    for (const h of this.list) {
      if (h.removed) continue;
      h.t -= dt;
      const pd = Math.hypot(P.pos.x - h.pos.x, P.pos.z - h.pos.z);
      switch (h.type) {
        case 'spikes':
          this.updateSpikes(h, dt, pd);
          break;
        case 'spring': {
          const on = pd < 2.0 && h.charge > 0 && P.hp < G.maxHp() && !P.dead;
          h.glow.material.opacity = h.charge > 0 ? 0.3 + (on ? 0.25 : 0) + 0.08 * Math.sin(G.elapsed * 3) : 0.06;
          if (on) {
            const heal = Math.min(9 * dt, h.charge, G.maxHp() - P.hp);
            P.hp += heal;
            h.charge -= heal;
            h.healShown = (h.healShown || 0) + heal;
            if (h.healShown >= 5) {
              G.numbers.spawn(P.pos.clone().setY(2.2), `+${Math.round(h.healShown)}`, 'heal');
              h.healShown = 0;
            }
            if (Math.random() < dt * 20) G.particles.spawn(P.pos.clone().setY(0.2), { count: 1, color: [1.2, 1.8, 2.4], speed: 0.8, up: 1.5, life: 0.5, size: 0.05, gravity: 6 });
          }
          break;
        }
        case 'drum':
          h.cool = Math.max(0, h.cool - dt);
          if (h.model) {
            h.punch = (h.punch || 0) * Math.exp(-8 * dt);
            h.model.scale.setScalar(1 + 0.12 * h.punch);
          }
          break;
        case 'ballista':
          h.cool = Math.max(0, h.cool - dt);
          if (h.active > 0) {
            h.active -= dt;
            h.zap -= dt;
            const target = G.enemies.filter((e) => e.isHittable() && e.pos.distanceTo(h.pos) < 11).sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0];
            if (target && h.model) {
              // Swing round to the target, then loose a bolt.
              const want = Math.atan2(target.pos.x - h.pos.x, target.pos.z - h.pos.z);
              let d = want - h.model.rotation.y;
              d = Math.atan2(Math.sin(d), Math.cos(d));
              h.model.rotation.y += d * (1 - Math.exp(-10 * dt));
            }
            if (h.zap <= 0 && target) {
              h.zap = 0.8;
              const dir = new THREE.Vector3().subVectors(target.pos, h.pos).setY(0).normalize();
              const origin = h.pos.clone().setY(1.1).addScaledVector(dir, 0.9);
              G.arrows.spawn(origin, dir, 42, 26, 1, false, { mega: false, extra: true });
              G.sfx.sample('thunkWood', { vol: 0.5, rate: 1.3, pan: G.panAt(h.pos) });
              G.sfx.sample('whoosh', { vol: 0.4, rate: 0.9, pan: G.panAt(h.pos) });
            }
            if (h.active <= 0) h.cool = 10;
          }
          break;
        case 'ice':
          if (pd < h.radius) buffs.slippery = true;
          for (const e of G.enemies) {
            if (e.state === 'dying' || e.isBoss) continue;
            if (Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) < h.radius && e.slowT <= 0.1) {
              e.slowT = 0.2;
              e.slowAmt = Math.max(e.slowAmt, 0.3);
            }
          }
          break;
        case 'vent':
          this.updateVent(h, dt, pd);
          break;
      }
    }
  }

  updateSpikes(h, dt, pd) {
    const G = this.game;
    if (h.phase === 'idle' && h.t <= 0) {
      h.phase = 'warn';
      h.t = 0.75;
    } else if (h.phase === 'warn') {
      h.glow.material.opacity = 0.25 + 0.35 * Math.abs(Math.sin(h.t * 20));
      if (h.model) h.model.position.y = -0.32 + 0.06 * (1 - h.t / 0.75);
      if (h.t <= 0) {
        h.phase = 'up';
        h.t = 0.6;
        h.hitIds = new Set();
        G.sfx.sample('clang', { vol: 0.35, rate: 1.4, pan: G.panAt(h.pos) });
      }
    } else if (h.phase === 'up') {
      h.glow.material.opacity = 0.15;
      if (h.model) h.model.position.y = Math.min(0, h.model.position.y + dt * 6);
      if (pd < 1.1 && !h.hitIds.has('player')) {
        h.hitIds.add('player');
        const res = G.player.takeDamage(15, new THREE.Vector3(G.player.pos.x - h.pos.x, 0, G.player.pos.z - h.pos.z).normalize(), G);
        if (res === true) G.onPlayerHit({ lungeDir: new THREE.Vector3(0, 0, 1) }, 15);
      }
      for (const e of G.enemies) {
        if (!e.isHittable() || h.hitIds.has(e) || Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) > 1.1 + e.radius * 0.5) continue;
        h.hitIds.add(e);
        const res = e.hit(28, new THREE.Vector3(0, 0, 1), 0.3, false);
        G.numbers.spawn(e.pos.clone().setY(2), 28, 'normal');
        if (res === 'kill') G.onKill(e);
      }
      if (h.t <= 0) {
        h.phase = 'idle';
        h.t = rand(2.5, 4.5);
      }
    } else {
      h.glow.material.opacity = 0;
      if (h.model) h.model.position.y = Math.max(-0.32, h.model.position.y - dt * 1.5);
    }
  }

  updateVent(h, dt, pd) {
    const G = this.game;
    if (h.phase === 'idle') {
      h.glow.material.opacity = 0.12 + 0.05 * Math.sin(G.elapsed * 2 + h.pos.x);
      if (Math.random() < dt * 3) G.particles.spawn(h.pos.clone().setY(0.1), { count: 1, color: [3, 0.9, 0.2], speed: 0.3, up: 1.2, life: 0.5, size: 0.05, gravity: -1 });
      if (h.t <= 0) {
        h.phase = 'warn';
        h.t = 0.9;
      }
    } else if (h.phase === 'warn') {
      h.glow.material.opacity = 0.3 + 0.4 * Math.abs(Math.sin(h.t * 16));
      if (Math.random() < dt * 30) G.particles.spawn(h.pos.clone().setY(0.1), { count: 1, color: [3, 1.2, 0.3], speed: 0.8, up: 2, life: 0.4, size: 0.06 });
      if (h.t <= 0) {
        h.phase = 'erupt';
        h.t = 0.5;
        G.sfx.sample('boom', { vol: 0.5, rate: 1.3, pan: G.panAt(h.pos) });
        G.particles.spawn(h.pos.clone().setY(0.3), { count: 40, color: [3, 1.1, 0.2], speed: 2, up: 9, life: 0.8, size: 0.14, gravity: 5, dir: new THREE.Vector3(0, 1, 0), spread: 0.35 });
        if (pd < 1.6) {
          const res = G.player.takeDamage(14, new THREE.Vector3(G.player.pos.x - h.pos.x, 0, G.player.pos.z - h.pos.z).normalize(), G);
          if (res === true) G.onPlayerHit({ lungeDir: new THREE.Vector3(0, 0, 1) }, 14);
        }
        for (const e of G.enemies) {
          if (!e.isHittable() || Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) > 1.6 + e.radius) continue;
          const res = e.hit(30, new THREE.Vector3(0, 0, 1), 0.3, false);
          G.numbers.spawn(e.pos.clone().setY(2), 30, 'burn');
          if (res === 'kill') G.onKill(e);
          else e.applyBurn?.(6, 3);
        }
      }
    } else {
      h.glow.material.opacity = 0.6;
      if (h.t <= 0) {
        h.phase = 'idle';
        h.t = rand(3.5, 6);
      }
    }
  }

  clear() {
    for (let i = pillars.length - 1; i >= 0; i--) if (pillars[i].hazardSpot) pillars.splice(i, 1);
    disposeTree(this.root);
    this.root.clear();
    this.list = [];
    this.taken = [];
  }
}
