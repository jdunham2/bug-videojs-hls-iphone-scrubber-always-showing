// Enemies of the Far Reaches. Each brings a new way to fight:
//   Jungle Stalker   pounces from far away: a long, low leap at you
//   Shieldbearer     a bronze shield stops arrows from the front; flank him,
//                    or break through with a full draw or a perfect shot
//   Deckhand         a pirate who looses a fan of three bolts
//   Automaton        slow clockwork soldier, armored against light shots;
//                    his blow cracks the ground
//   Highland Lancer  charges a long way in a straight line (watch the wedge)
// Models come from Meshy; until one is generated, an older model stands in.

import * as THREE from 'three';
import { Grunt } from './enemy.js';
import { Archer } from './archer.js';
import { config } from './config.js';
import { models } from './models.js';
import { ARROW_HEIGHT } from './player.js';

const pick = (id, fallback) => (models[id] ? id : fallback);

export class Stalker extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'stalker';
    this.speed *= 1.2;
    this.maxHp = this.hp = this.hp * 0.85;
    const g = config.grunt;
    this.tune = { ...g, attackRange: 8.5, windupTime: 0.65, lungeSpeed: 15, lungeTime: 0.5, damage: g.damage * 1.1, recoverTime: g.recoverTime * 1.3 };
    if (!this.model) this.bodyMat.color.set(0x3f6a2a);
  }
  get modelId() {
    return pick('stalker', 'raider');
  }
  get propId() {
    return 'none';
  }
  update(dt, player) {
    super.update(dt, player);
    // The pounce is a leap: rise and fall over the lunge.
    if (this.state === 'lunge') this.rig.position.y = Math.sin(Math.min(1, this.t / this.tune.lungeTime) * Math.PI) * 1.3;
    else if (this.state !== 'spawning') this.rig.position.y = 0;
  }
}

export class Shieldbearer extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'shieldbearer';
    this.speed *= 0.8;
    this.maxHp = this.hp = this.hp * 1.8;
    const g = config.grunt;
    this.tune = { ...g, windupTime: g.windupTime * 1.15, damage: g.damage * 1.25 };
    if (!this.model) this.bodyMat.color.set(0xb8945a);
  }
  get modelId() {
    return pick('shieldbearer', 'brute');
  }
  get propId() {
    return 'none';
  }
  /** Arrows from the front glance off the shield unless they're a full draw or perfect. */
  hit(damage, dir, charge, perfect) {
    if (this.isHittable() && this.state !== 'recover' && !perfect && charge < 0.999) {
      const facing = Math.sin(this.yaw) * -dir.x + Math.cos(this.yaw) * -dir.z;
      if (facing > 0.45) {
        damage *= 0.15;
        const G = this.game;
        if ((this.blockedShown = (this.blockedShown || 0) + 1) % 2 === 1) G.numbers.spawn(this.pos.clone().setY(2.3), 'BLOCKED', 'callout');
        G.particles.spawn(this.pos.clone().setY(1.2).addScaledVector(dir, -0.6), { count: 10, color: [3, 2.4, 1.2], speed: 4, up: 1.5, life: 0.3, size: 0.05, gravity: 6 });
        G.sfx.sample('clang', { vol: 0.3, rate: 1.7, jitter: 0.1, pan: G.panAt(this.pos) });
      }
    }
    return super.hit(damage, dir, charge, perfect);
  }
}

export class Deckhand extends Archer {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'deckhand';
    this.maxHp = this.hp = this.hp * 1.1;
    if (!this.model) this.bodyMat.color.set(0xc84a3a);
  }
  get modelId() {
    return pick('deckhand', 'bandit');
  }
  /** A fan of three bolts: dodge sideways or roll through. */
  fire() {
    const base = Math.atan2(this.aimDir.x, this.aimDir.z);
    for (const off of [-0.24, 0, 0.24]) {
      const d = new THREE.Vector3(Math.sin(base + off), 0, Math.cos(base + off));
      const origin = new THREE.Vector3(this.pos.x, ARROW_HEIGHT, this.pos.z).addScaledVector(d, 0.7);
      this.game.enemyArrows.spawn(origin, d, config.archer.arrowSpeed * 0.9, Math.round(config.archer.damage * 0.7), this);
    }
    this.game.sfx.release(0.9, false, this.game.panAt(this.pos));
  }
}

export class Automaton extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'automaton';
    this.speed *= 0.7;
    this.maxHp = this.hp = this.hp * 2.6;
    this.radius *= 1.2;
    const g = config.grunt;
    this.tune = { ...g, attackRange: g.attackRange * 1.1, windupTime: g.windupTime * 1.35, lungeSpeed: 7, lungeTime: 0.35, damage: g.damage * 1.5 };
    if (!this.model) this.bodyMat.color.set(0x8a7a5a);
  }
  get modelId() {
    return pick('automaton', 'brute');
  }
  get modelHeight() {
    return config.models.gruntHeight * 1.15;
  }
  get propId() {
    return 'none';
  }
  /** Iron plates: light shots do less than half damage. */
  hit(damage, dir, charge, perfect) {
    if (this.isHittable() && !perfect && charge < 0.6) {
      damage *= 0.45;
      this.game.particles.spawn(this.pos.clone().setY(1.3), { count: 5, color: [3, 2.2, 1], speed: 3, up: 1, life: 0.25, size: 0.04, gravity: 6 });
    }
    return super.hit(damage, dir, charge, perfect);
  }
  /** The end of his blow cracks the ground in front of him. */
  enter(state) {
    if (this.state === 'lunge' && state === 'recover') {
      const at = this.pos.clone().addScaledVector(this.lungeDir, 1.2);
      this.game.onSlam(at, 1.1);
      this.game.shake.add(0.15);
      this.game.sfx.sample('clang', { vol: 0.35, rate: 0.6, jitter: 0, pan: this.game.panAt(at) });
    }
    super.enter(state);
  }
  die(dir) {
    super.die(dir);
    this.game.particles.spawn(this.pos.clone().setY(1.4), { count: 30, color: 0xd8d4cc, speed: 2.5, up: 3, life: 1.2, size: 0.35, gravity: -0.6, drag: 0.6 });
  }
}

export class Lancer extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'lancer';
    this.maxHp = this.hp = this.hp * 1.15;
    const g = config.grunt;
    this.tune = { ...g, attackRange: 10, windupTime: g.windupTime * 1.3, lungeSpeed: 19, lungeTime: 0.55, damage: g.damage * 1.3, recoverTime: g.recoverTime * 1.4 };
    if (!this.model) this.bodyMat.color.set(0x5a7aa8);
  }
  get modelId() {
    return pick('lancer', 'raider');
  }
  get propId() {
    return models.spear ? 'spear' : 'club';
  }
  get propLength() {
    return models.spear ? 2.3 : 1.0;
  }
}

// For the automated tests (and debugging from the console).
if (typeof window !== 'undefined') window.__reach = { Stalker, Shieldbearer, Deckhand, Automaton, Lancer };
