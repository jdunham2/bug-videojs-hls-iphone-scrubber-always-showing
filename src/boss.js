// Gorvak the Ogre Warlord: a boss every 5th wave with telegraphed slams,
// shockwaves, hammer swings and charges, a second phase, and a poise meter
// that perfect shots break.

import * as THREE from 'three';
import { config } from './config.js';
import { resolveCircle, pillars, ARENA_HALF } from './world.js';
import { Grunt } from './enemy.js';
import { PLAYER_RADIUS } from './player.js';
import { outfits, loadTexture, models } from './models.js';

const tmp = new THREE.Vector3();

export const BOSS_NAME = 'Gorvak the Ogre Warlord';
/** Gorvak changes with each arena: a new name and a retextured skin (same rig). */
/** One boss per dungeon (by arena theme): name, look and signature ranged attack. */
export const BOSS_FORMS = [
  { name: 'Gorvak the Ogre Warlord', sub: 'Warlord of the Ruins', outfit: null, barrage: 'rock' },
  { name: 'Gorvak of the North', sub: 'Back from the frozen wastes', outfit: 'warlordNorth', barrage: 'icicle' },
  { name: 'Gorvak the Forgemaster', sub: 'Clad in fresh-forged steel', outfit: 'warlordForge', barrage: 'pot' },
  { name: 'Brogg the Bog-Lord', sub: 'King of the drowned reeds', outfit: null, tint: 0x9ab080, barrage: 'rock' },
  { name: 'Thorne the Huntmaster', sub: 'Master of the autumn hunt', outfit: null, tint: 0xd8a070, barrage: 'stalactite' },
  { name: 'Grimbold Deepdelve', sub: 'Foreman of the deep tunnels', outfit: 'warlordForge', tint: 0xb0a090, barrage: 'stalactite' },
  { name: 'Captain Saltjaw', sub: 'Terror of the grey coast', model: 'corsair', outfit: null, barrage: 'pot' },
  { name: 'Khazrak the Sand-King', sub: 'Lord of the sunscorched cliffs', outfit: null, tint: 0xe8c890, barrage: 'rock' },
  { name: 'Gorvak Reforged', sub: 'Back for one last fight', outfit: 'warlordForge', tint: 0xff9a80, barrage: 'pot' },
  { name: 'Ukko the Temple Brute', sub: 'Guardian of the overgrown steps', outfit: null, tint: 0x9ab878, barrage: 'stalactite' },
  { name: 'Captain Blackhook', sub: 'Scourge of the sunken cove', model: 'corsair', outfit: null, barrage: 'cannonball' },
  { name: 'Grubnak the Sporeback', sub: 'Lord of the glowing grove', outfit: null, tint: 0x9a8ac0, barrage: 'rock' },
  { name: 'Vulgra the Dune-Breaker', sub: 'Warlord of the oasis road', outfit: null, tint: 0xe8c088, barrage: 'rock' },
  { name: 'Ironjaw the Machinist', sub: 'Master of the clockwork foundry', outfit: 'warlordForge', tint: 0xc8b090, barrage: 'cannonball' },
  { name: 'Old Brannoc', sub: 'Keeper of the misty pass', outfit: 'warlordNorth', tint: 0xd0dcea, barrage: 'stalactite' },
];

/** Ground warning shapes that fill up as an attack charges. */
class Telegraph {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 0.35, 0.2),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.fillMat = this.mat.clone();
    this.outline = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.fill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMat);
    this.outline.renderOrder = this.fill.renderOrder = 2;
    this.outline.visible = this.fill.visible = false;
    scene.add(this.outline, this.fill);
  }

  /** shape: { type: 'circle', r } | { type: 'cone', r, angle } | { type: 'rect', w, len } */
  show(shape, pos, yaw) {
    this.shape = shape;
    this.outline.geometry.dispose();
    this.fill.geometry.dispose();
    if (shape.type === 'circle') {
      this.outline.geometry = new THREE.RingGeometry(shape.r * 0.94, shape.r, 48).rotateX(-Math.PI / 2);
      this.fill.geometry = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    } else if (shape.type === 'cone') {
      const g = new THREE.RingGeometry(shape.r * 0.94, shape.r, 32, 1, Math.PI / 2 - shape.angle / 2, shape.angle).rotateX(-Math.PI / 2);
      this.outline.geometry = g;
      this.fill.geometry = new THREE.CircleGeometry(1, 32, Math.PI / 2 - shape.angle / 2, shape.angle).rotateX(-Math.PI / 2);
    } else {
      this.outline.geometry = new THREE.PlaneGeometry(shape.w, shape.len).rotateX(-Math.PI / 2).translate(0, 0, shape.len / 2);
      this.fill.geometry = new THREE.PlaneGeometry(shape.w, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    }
    // Rect geometry extends along +Z; the cone sector is built pointing -Z, so it turns half a circle more.
    for (const m of [this.outline, this.fill]) {
      m.position.set(pos.x, 0.06, pos.z);
      m.rotation.set(0, yaw + (shape.type === 'cone' ? Math.PI : 0), 0);
      m.visible = true;
    }
    this.progress(0);
  }

  progress(p) {
    const s = this.shape;
    this.mat.opacity = (s.type === 'rect' ? 0.12 : 0.5) + (s.type === 'rect' ? 0.08 : 0.4) * Math.sin(performance.now() * 0.02);
    this.fillMat.opacity = 0.12 + 0.35 * p;
    if (s.type === 'rect') this.fill.scale.set(1, 1, Math.max(0.01, s.len * p));
    else this.fill.scale.setScalar(Math.max(0.01, s.r * p));
  }

  hide() {
    this.outline.visible = this.fill.visible = false;
  }

  dispose() {
    this.outline.removeFromParent();
    this.fill.removeFromParent();
  }
}

/** Expanding shockwave ring the player has to roll through or outrun. */
class Shockwave {
  constructor(game, pos, maxR, damage, delay = 0) {
    this.game = game;
    this.pos = pos.clone();
    this.maxR = maxR;
    this.damage = damage;
    this.r = 0.5;
    this.delay = delay;
    this.hit = false;
    this.mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.6, 1.2, 0.5),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), this.mat);
    this.mesh.position.set(pos.x, 0.08, pos.z);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
  }

  update(dt) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    this.mesh.visible = true;
    const prev = this.r;
    this.r += dt * 9;
    this.mesh.scale.setScalar(this.r);
    this.mat.opacity = 0.9 * (1 - this.r / this.maxR);
    const P = this.game.player;
    const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (!this.hit && d >= prev - 0.4 && d <= this.r + 0.2) {
      this.hit = true;
      const dir = tmp.set(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z).normalize().clone();
      const res = P.takeDamage(this.damage, dir, this.game);
      if (res === true) this.game.onPlayerHit({ lungeDir: dir }, this.damage);
      else if (res === 'dodged') this.game.onPerfectDodge(null);
    }
    if (Math.random() < dt * 60) {
      const a = Math.random() * Math.PI * 2;
      this.game.particles.spawn(new THREE.Vector3(this.pos.x + Math.cos(a) * this.r, 0.15, this.pos.z + Math.sin(a) * this.r), {
        count: 1,
        color: 0x8a7458,
        speed: 1.5,
        up: 1.5,
        life: 0.5,
        size: 0.2,
        gravity: 3,
      });
    }
    if (this.r >= this.maxR) {
      this.mesh.removeFromParent();
      this.mat.dispose();
      return false;
    }
    return true;
  }
}

/**
 * A boss's signature ranged move, one per form: the Ruins warlord hurls
 * boulders, Gorvak of the North brings icicles down from above, and the
 * Forgemaster lobs pots of burning oil that leave fire on the ground.
 * Every impact is telegraphed by a ring that fills as it falls.
 */
const BARRAGE = {
  rock: { kind: 'rock', count: [3, 5], flight: 0.95, stagger: 0.22, r: 1.7, spread: 4.5, from: 'boss' },
  icicle: { kind: 'icicle', count: [6, 9], flight: 1.15, stagger: 0.12, r: 1.3, spread: 7, from: 'sky' },
  pot: { kind: 'pot', count: [2, 3], flight: 1.0, stagger: 0.3, r: 2.2, spread: 3.5, from: 'boss' },
  // Rocks shaken loose from overhead by his stomp.
  stalactite: { kind: 'stalactite', count: [5, 8], flight: 1.1, stagger: 0.14, r: 1.4, spread: 6.5, from: 'sky' },
  // Iron shot fired in an arc: big, heavy impacts.
  cannonball: { kind: 'cannonball', count: [4, 6], flight: 1.05, stagger: 0.28, r: 1.9, spread: 5.5, from: 'boss' },
};

class Barrage {
  constructor(game, boss, player) {
    this.game = game;
    this.boss = boss;
    const def = (this.def = BARRAGE[boss.form.barrage] || BARRAGE.rock);
    const n = def.count[boss.phase === 2 ? 1 : 0];
    this.items = [];
    this.fires = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = i === 0 ? 0 : def.spread * (0.45 + Math.random() * 0.55);
      const lead = i === 0 ? player.vel.clone().multiplyScalar(0.5) : new THREE.Vector3();
      const at = new THREE.Vector3(player.pos.x + Math.cos(a) * d + lead.x, 0, player.pos.z + Math.sin(a) * d + lead.z);
      const lim = ARENA_HALF - 1.5;
      at.x = Math.max(-lim, Math.min(lim, at.x));
      at.z = Math.max(-lim, Math.min(lim, at.z));
      this.items.push(this.makeItem(at, -i * def.stagger));
    }
  }

  makeItem(at, t) {
    const def = this.def;
    const S = this.game.scene;
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 0.2), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(def.r * 0.9, def.r, 40).rotateX(-Math.PI / 2), ringMat);
    const fillMat = ringMat.clone();
    fillMat.opacity = 0.3;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(def.r, 40).rotateX(-Math.PI / 2), fillMat);
    ring.position.set(at.x, 0.07, at.z);
    fill.position.set(at.x, 0.065, at.z);
    ring.renderOrder = fill.renderOrder = 3;
    let geo;
    let mat;
    if (def.kind === 'rock') {
      geo = new THREE.IcosahedronGeometry(0.55, 0);
      mat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1, flatShading: true });
    } else if (def.kind === 'cannonball') {
      geo = new THREE.SphereGeometry(0.42, 14, 10);
      mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.7 });
    } else if (def.kind === 'stalactite') {
      geo = new THREE.ConeGeometry(0.4, 1.4, 6).rotateX(Math.PI);
      mat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1, flatShading: true });
    } else if (def.kind === 'icicle') {
      geo = new THREE.ConeGeometry(0.28, 1.8, 6).rotateX(Math.PI);
      mat = new THREE.MeshStandardMaterial({ color: 0xbfe4ff, roughness: 0.2, metalness: 0.1, emissive: 0x2a5a8a, emissiveIntensity: 0.6 });
    } else {
      geo = new THREE.SphereGeometry(0.38, 12, 10);
      mat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6, emissive: 0xff6a20, emissiveIntensity: 0.5 });
    }
    const proj = new THREE.Mesh(geo, mat);
    proj.castShadow = true;
    proj.visible = false;
    S.add(ring, fill, proj);
    const from = def.from === 'sky' ? new THREE.Vector3(at.x, 15, at.z) : this.boss.pos.clone().setY(3.4);
    return { at, t, ring, fill, proj, from, landed: false, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) };
  }

  /** Returns false once everything has landed and burned out. */
  update(dt) {
    const def = this.def;
    const G = this.game;
    for (const it of this.items) {
      if (it.landed) continue;
      it.t += dt;
      const p = Math.max(0, Math.min(1, it.t / def.flight));
      it.fill.scale.setScalar(Math.max(0.01, p));
      it.ring.material.opacity = 0.5 + 0.4 * Math.sin(it.t * 18);
      if (it.t > 0) {
        it.proj.visible = true;
        if (def.from === 'sky') {
          it.proj.position.set(it.at.x, 15 * (1 - p * p), it.at.z);
        } else {
          it.proj.position.lerpVectors(it.from, it.at, p);
          it.proj.position.y = it.from.y * (1 - p) + 6 * Math.sin(p * Math.PI);
          it.proj.rotation.x += it.spin.x * dt * 8;
          it.proj.rotation.z += it.spin.z * dt * 8;
        }
      }
      if (p >= 1) this.land(it);
    }
    for (const f of this.fires) {
      f.t += dt;
      f.tick -= dt;
      const life = 1 - f.t / f.dur;
      f.mesh.material.opacity = Math.max(0, 0.45 * Math.min(1, life * 3) * (0.85 + 0.15 * Math.sin(f.t * 20)));
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * f.r;
        G.particles.spawn(new THREE.Vector3(f.pos.x + Math.cos(a) * r, 0.1, f.pos.z + Math.sin(a) * r), { count: 1, color: [3, 1.1, 0.25], speed: 0.4, up: 2.4, life: 0.6, size: 0.12, gravity: -1.5, drag: 0.6 });
      }
      const P = G.player;
      if (f.tick <= 0 && f.t < f.dur && Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z) < f.r + 0.2) {
        f.tick = 0.55;
        this.boss.hurtPlayer(P, Math.round(config.boss.waveDamage * 0.35), new THREE.Vector3(P.pos.x - f.pos.x, 0, P.pos.z - f.pos.z).normalize());
      }
      if (f.t >= f.dur) {
        f.mesh.removeFromParent();
        f.mesh.material.dispose();
        f.mesh.geometry.dispose();
        f.done = true;
      }
    }
    this.fires = this.fires.filter((f) => !f.done);
    return this.items.some((it) => !it.landed) || this.fires.length > 0;
  }

  land(it) {
    const def = this.def;
    const G = this.game;
    it.landed = true;
    for (const m of [it.ring, it.fill, it.proj]) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    const P = G.player;
    const d = Math.hypot(P.pos.x - it.at.x, P.pos.z - it.at.z);
    if (d < def.r + PLAYER_RADIUS) this.boss.hurtPlayer(P, Math.round(config.boss.slamDamage * 0.55), new THREE.Vector3(P.pos.x - it.at.x, 0, P.pos.z - it.at.z).normalize());
    G.onSlam(it.at, def.kind === 'icicle' || def.kind === 'stalactite' ? 0.7 : 1);
    G.sfx.slam(G.panAt(it.at));
    G.shake.add(0.18);
    const color = def.kind === 'icicle' ? [1.6, 2.2, 3] : def.kind === 'pot' ? [3, 1.2, 0.3] : def.kind === 'cannonball' ? [3, 1.8, 0.6] : 0x8a7458;
    if (def.kind === 'cannonball') G.particles.spawn(it.at.clone().setY(0.6), { count: 14, color: 0x5a5450, speed: 2, up: 2, life: 1.1, size: 0.4, gravity: -0.4, drag: 0.5 });
    G.particles.spawn(it.at.clone().setY(0.4), { count: 22, color, speed: 5, up: 4, life: 0.7, size: def.kind === 'rock' ? 0.18 : 0.1, gravity: 9 });
    if (def.kind === 'pot') {
      // Burning oil spreads where the pot breaks.
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(def.r, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.45, 0.08), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      mesh.position.set(it.at.x, 0.06, it.at.z);
      G.scene.add(mesh);
      this.fires.push({ pos: it.at.clone(), r: def.r, t: 0, dur: 4.5, tick: 0.3, mesh });
      G.decals?.spawn(it.at, 'scorch', def.r * 1.6, 12);
    }
  }

  dispose() {
    for (const it of this.items) if (!it.landed) for (const m of [it.ring, it.fill, it.proj]) m.removeFromParent();
    for (const f of this.fires) f.mesh.removeFromParent();
  }
}

export class Boss extends Grunt {
  constructor(game, pos, level, index = 1, form = 0) {
    // The model is picked in Grunt's constructor (via modelId), before this.form exists.
    Boss.nextModel = BOSS_FORMS[form % BOSS_FORMS.length].model;
    super(game, pos, level);
    this.form = BOSS_FORMS[form % BOSS_FORMS.length];
    this.formIndex = form % BOSS_FORMS.length;
    this.barrages = [];
    this.barrageCool = 4;
    this.displayName = this.form.name;
    if (this.form.tint && this.model) for (const m of this.model.materials) m.color.multiply(new THREE.Color(this.form.tint));
    const o = outfits[this.form.outfit];
    if (o && this.model) {
      const mats = this.model.materials;
      loadTexture(o.texture, (tex) => {
        for (const m of mats) {
          m.map = tex;
          m.needsUpdate = true;
        }
      });
    }
    const b = config.boss;
    this.kind = 'boss';
    this.isBoss = true;
    this.index = index;
    this.maxHp = this.hp = b.baseHp * (1 + 0.6 * (index - 1));
    this.speed = b.speed;
    this.radius = 1.4;
    this.group.scale.setScalar(1);
    this.poise = 0;
    this.phase = 1;
    this.cool = 1.5;
    this.summonCool = 6;
    this.telegraph = new Telegraph(game.scene);
    this.waves = [];
    this.aim = new THREE.Vector3();
    this.atkDir = new THREE.Vector3(0, 0, 1);
    this.hpBar.visible = false;
    if (!this.model) {
      this.group.scale.setScalar(2.2);
      this.bodyMat.color.set(0x6f7d5a);
    }
  }

  get modelId() {
    const want = this.form?.model || Boss.nextModel;
    return want && models[want] ? want : 'warlord'; // the old warlord until a new model is generated
  }
  get modelHeight() {
    return config.boss.height;
  }
  get propId() {
    return 'hammer';
  }
  get propLength() {
    return 2.6;
  }

  updateHpBar() {
    this.hpBar.visible = false; // the boss uses the big bar at the top of the screen
  }

  enter(state) {
    this.lastState = this.state;
    this.state = state;
    this.t = 0;
    if (state !== 'windup' && state !== 'charge') this.telegraph.hide();
  }

  /** Called once it finishes rising from the gate. */
  startIntro() {
    this.enter('intro');
    this.game.onBossIntro(this);
  }

  pickAttack(dist) {
    if (this.phase === 2 && this.summonCool <= 0) return 'roar';
    if (this.barrageCool <= 0 && dist > 3.5 && Math.random() < 0.55) return 'barrage';
    if (dist < 5 && Math.random() < 0.7) return 'swing';
    if (dist > 8 && Math.random() < 0.6) return 'charge';
    return 'slam';
  }

  beginAttack(kind, player) {
    const b = config.boss;
    this.attack = kind;
    this.atkDir.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
    const yaw = Math.atan2(this.atkDir.x, this.atkDir.z);
    if (kind === 'swing') {
      this.windTime = b.swingWindup / this.rage;
      this.telegraph.show({ type: 'cone', r: 5, angle: Math.PI * 0.75 }, this.pos, yaw);
    } else if (kind === 'slam') {
      this.windTime = b.slamWindup / this.rage;
      this.aim.copy(player.pos);
      this.telegraph.show({ type: 'circle', r: 3.4 }, this.aim, 0);
    } else if (kind === 'charge') {
      this.windTime = b.chargeWindup / this.rage;
      this.telegraph.show({ type: 'rect', w: 2.8, len: 16 }, this.pos, yaw);
    } else if (kind === 'barrage') {
      this.windTime = 0.85 / this.rage;
    } else {
      this.windTime = 1.4;
    }
    this.enter('windup');
    this.game.sfx.windup(this.game.panAt(this.pos));
    if (kind === 'roar') this.game.sfx.bossRoar();
  }

  get rage() {
    return this.phase === 2 ? 1.3 : 1;
  }

  update(realDt, player) {
    const b = config.boss;
    this.flash = Math.max(0, this.flash - realDt);
    this.hitT = Math.max(0, this.hitT - realDt);
    this.waves = this.waves.filter((w) => w.update(realDt));
    this.barrageCool -= realDt;
    this.barrages = this.barrages.filter((b) => b.update(realDt) || (b.dispose(), false));
    if (this.state === 'dying') {
      this.t += realDt;
      this.telegraph.hide();
      this.updateDying(realDt * 0.6); // a slower, heavier death
      this.updateModel(realDt * 0.7);
      return;
    }
    if (this.updateStatus(realDt)) return;
    // Bosses shrug off most of a freeze or slow.
    if (this.frozenT > 0.4) this.frozenT = 0.4;
    const dt = realDt * Math.max(0.6, this.timeScale);
    this.t += dt;
    this.cool -= dt;
    this.summonCool -= dt;
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      this.game.onBossPhase(this);
    }

    tmp.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = tmp.length();
    if (dist > 1e-4) tmp.divideScalar(dist);
    let mx = 0;
    let mz = 0;
    let face = tmp;
    let turn = 3;

    switch (this.state) {
      case 'spawning':
        if (this.updateLeapIn(1.0)) this.startIntro();
        break;
      case 'intro':
        face = tmp;
        if (this.t > b.introTime) this.enter('chase');
        break;
      case 'chase':
        mx = tmp.x * this.speed * this.rage;
        mz = tmp.z * this.speed * this.rage;
        if (this.cool <= 0 && !player.dead && this.frozenT <= 0) this.beginAttack(this.pickAttack(dist), player);
        break;
      case 'windup': {
        const p = Math.min(1, this.t / this.windTime);
        face = this.atkDir;
        turn = 8;
        if (this.attack === 'slam' && p < 0.6) {
          // The slam target follows you for a moment, then locks.
          this.aim.lerp(player.pos, 1 - Math.exp(-3 * dt));
          this.telegraph.outline.position.set(this.aim.x, 0.06, this.aim.z);
          this.telegraph.fill.position.set(this.aim.x, 0.06, this.aim.z);
        }
        if (this.attack === 'swing' || this.attack === 'charge') {
          if (p < 0.5) this.atkDir.copy(tmp);
          const yaw = Math.atan2(this.atkDir.x, this.atkDir.z);
          this.telegraph.outline.rotation.y = this.telegraph.fill.rotation.y = yaw + (this.attack === 'swing' ? Math.PI : 0);
          this.telegraph.outline.position.set(this.pos.x, 0.06, this.pos.z);
          this.telegraph.fill.position.set(this.pos.x, 0.06, this.pos.z);
        }
        if (this.attack !== 'roar' && this.attack !== 'barrage') this.telegraph.progress(p);
        if (p >= 1) this.strike(player);
        break;
      }
      case 'charge': {
        face = this.atkDir;
        turn = 0;
        mx = this.atkDir.x * b.chargeSpeed;
        mz = this.atkDir.z * b.chargeSpeed;
        this.telegraph.outline.position.set(this.pos.x, 0.06, this.pos.z);
        this.telegraph.fill.position.set(this.pos.x, 0.06, this.pos.z);
        if (!this.hasHit && dist < this.radius + PLAYER_RADIUS + 0.3) {
          this.hasHit = true;
          this.hurtPlayer(player, b.chargeDamage, this.atkDir);
        }
        if (Math.random() < dt * 40) this.game.particles.spawn(this.pos.clone().setY(0.1), { count: 2, color: 0x7a6a58, speed: 1.5, up: 1, life: 0.5, size: 0.25, gravity: 2 });
        // Crashing into a wall or pillar stuns him.
        const before = this.pos.clone().addScaledVector(this.atkDir, b.chargeSpeed * dt);
        const blocked = Math.abs(before.x) > ARENA_HALF - this.radius - 0.05 || Math.abs(before.z) > ARENA_HALF - this.radius - 0.05 || pillars.some((q) => Math.hypot(before.x - q.x, before.z - q.z) < q.r + this.radius);
        if (blocked) {
          this.game.onSlam(this.pos.clone().addScaledVector(this.atkDir, 1.2), 1.4);
          this.game.onBossStunned(this);
          this.enter('stunned');
        } else if (this.t > b.chargeTime) {
          this.enter('recover');
        }
        break;
      }
      case 'stunned':
        face = this.atkDir;
        turn = 0;
        if (this.t > b.stunTime) {
          this.cool = 1;
          this.enter('chase');
        }
        break;
      case 'recover':
        face = this.atkDir;
        turn = 1;
        if (this.t > b.recoverTime / this.rage) {
          this.cool = (b.cooldown * (0.7 + Math.random() * 0.6)) / this.rage;
          this.enter('chase');
        }
        break;
    }

    this.pos.x += mx * dt + this.knock.x * realDt;
    this.pos.z += mz * dt + this.knock.z * realDt;
    this.knock.multiplyScalar(Math.exp(-9 * realDt));
    resolveCircle(this.pos, this.radius);
    if (turn > 0) {
      const targetYaw = Math.atan2(face.x, face.z);
      let d = targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-turn * dt));
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    const f = this.flash > 0 ? 0.8 : 0;
    const glow = this.state === 'windup' ? Math.min(1, this.t / this.windTime) * 0.25 : 0;
    const stun = this.state === 'stunned' ? 0.4 + 0.3 * Math.sin(this.t * 20) : 0;
    let r = f + glow + (this.phase === 2 ? 0.15 : 0);
    let g = f + stun * 0.8;
    let bl = f + stun;
    if (this.burnT > 0) r += 0.3;
    if (this.slowT > 0) bl += 0.3;
    this.bodyMat.emissive.setRGB(r, g, bl);
    if (this.model) {
      for (const m of this.model.materials) m.emissive.setRGB(r * 0.4, g * 0.4, bl * 0.4);
      this.flinch = Math.max(0, (this.flinch || 0) - realDt * 5);
      this.model.holder.rotation.x = -0.12 * this.flinch * this.flinch;
    }
    this.updateModel(dt);
  }

  strike(player) {
    const b = config.boss;
    const pan = this.game.panAt(this.pos);
    if (this.attack === 'swing') {
      // Cone in front of him.
      tmp.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
      const d = tmp.length();
      const ang = Math.acos(Math.max(-1, Math.min(1, tmp.normalize().dot(this.atkDir))));
      if (d < 5 + PLAYER_RADIUS && ang < Math.PI * 0.375) this.hurtPlayer(player, b.swingDamage, tmp.clone());
      this.game.sfx.slam(pan);
      this.game.onSlam(this.pos.clone().addScaledVector(this.atkDir, 3), 0.8);
      this.enter('recover');
    } else if (this.attack === 'slam') {
      const d = Math.hypot(player.pos.x - this.aim.x, player.pos.z - this.aim.z);
      if (d < 3.4 + PLAYER_RADIUS) this.hurtPlayer(player, b.slamDamage, tmp.set(player.pos.x - this.aim.x, 0, player.pos.z - this.aim.z).normalize().clone());
      // Leap onto the target: move there instantly at the impact (the clip sells the jump).
      this.pos.lerp(this.aim, 0.6);
      resolveCircle(this.pos, this.radius);
      this.game.sfx.bossSlam();
      this.game.onSlam(this.aim, 2.2);
      this.waves.push(new Shockwave(this.game, this.aim, 12, b.waveDamage));
      if (this.phase === 2) this.waves.push(new Shockwave(this.game, this.aim, 12, b.waveDamage, 0.45));
      this.enter('recover');
    } else if (this.attack === 'charge') {
      this.hasHit = false;
      this.game.sfx.lunge(pan);
      this.enter('charge');
    } else if (this.attack === 'barrage') {
      this.barrages.push(new Barrage(this.game, this, player));
      this.barrageCool = 7 + Math.random() * 3;
      this.game.sfx.sample('whoosh', { vol: 0.6, rate: 0.6, jitter: 0 });
      if (this.form.barrage === 'icicle' || this.form.barrage === 'stalactite') this.game.sfx.bossRoar();
      this.enter('recover');
    } else {
      this.summonCool = b.summonCooldown;
      this.game.onBossSummon(this);
      this.enter('recover');
    }
  }

  hurtPlayer(player, dmg, dir) {
    const res = player.takeDamage(dmg, dir, this.game);
    if (res === true) this.game.onPlayerHit({ lungeDir: dir }, dmg);
    else if (res === 'dodged') this.game.onPerfectDodge(this);
  }

  /** Heavy: little knockback, no normal stagger. Perfect shots break poise instead. */
  hit(damage, dir, charge, perfect) {
    if (!this.isHittable() || this.state === 'intro') return null;
    const b = config.boss;
    const mult = this.state === 'stunned' || this.state === 'broken' ? b.stunDamageMult : 1;
    this.hp -= damage * mult;
    this.flash = 0.06;
    this.flinch = 0.6;
    this.knock.addScaledVector(dir, 0.6);
    if (this.hp <= 0) {
      this.die(dir);
      this.game.onBossDefeated(this);
      return 'kill';
    }
    if (this.state !== 'stunned') {
      this.poise = Math.min(b.poise, this.poise + damage * (perfect ? 2 : 0.4));
      if (this.poise >= b.poise) {
        this.poise = 0;
        this.telegraph.hide();
        this.atkDir.copy(dir).negate();
        this.enter('stunned');
        this.game.onBossStunned(this, true);
        return 'stagger';
      }
    }
    return 'hit';
  }

  updateModel(dt) {
    const A = this.anim;
    if (!A) return;
    const mc = config.boss;
    switch (this.state) {
      case 'dying':
        A.set(['death'], { once: true, fade: 0.1 });
        break;
      case 'spawning':
        A.set(['idle']);
        break;
      case 'intro':
        A.set(['roar'], { once: true, fade: 0.2 });
        break;
      case 'chase':
        A.set(['walk']);
        if (A.action('walk')) A.action('walk').timeScale = 1.1 * this.rage;
        break;
      case 'windup': {
        const clip = this.attack === 'swing' ? 'swing' : this.attack === 'roar' ? 'roar' : this.attack === 'slam' || this.attack === 'barrage' ? 'slam' : 'charge';
        if (clip === 'roar' || clip === 'charge') {
          A.set([clip === 'charge' ? 'idle' : 'roar'], { once: clip === 'roar', fade: 0.15 });
          break;
        }
        A.set([clip], { once: true, fade: 0.12 });
        const a = A.action(clip);
        if (a) a.timeScale = 0;
        const hitAt = clip === 'swing' ? mc.swingHitAt : mc.slamHitAt;
        A.scrub(clip, A.duration(clip) * hitAt * Math.min(1, this.t / this.windTime));
        break;
      }
      case 'charge':
        A.set(['charge'], { fade: 0.1 });
        if (A.action('charge')) A.action('charge').timeScale = 1.6;
        break;
      case 'recover': {
        const clip = this.attack === 'swing' ? 'swing' : 'slam';
        if (this.attack === 'swing' || this.attack === 'slam' || this.attack === 'barrage') {
          const a = A.action(clip);
          if (a) a.timeScale = 1.2;
        } else {
          A.set(['idle'], { fade: 0.2 });
        }
        break;
      }
      case 'stunned':
        A.set(['hit'], { once: true, fade: 0.08 });
        break;
    }
    A.update(dt);
  }

  dispose() {
    super.dispose();
    this.telegraph.dispose();
    for (const w of this.waves) w.mesh.removeFromParent();
    for (const b of this.barrages) b.dispose();
  }
}
