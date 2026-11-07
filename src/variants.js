// Arena-specific enemies.
//   Frost Ghoul (Frozen Crypt): a fast grunt-style lunger whose hits chill you (slow).
//   Fire Imp (Infernal Forge): keeps its distance and hurls fireballs that leave
//   burning ground, then bursts into flame when it dies.

import * as THREE from 'three';
import { config } from './config.js';
import { Grunt } from './enemy.js';
import { Skeleton } from './skeleton.js';
import { arrowBlocked } from './world.js';
import { PLAYER_RADIUS, ARROW_HEIGHT } from './player.js';

export class Ghoul extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'ghoul';
    this.speed *= 1.35;
    this.timeBoost = 1.3; // quicker windup than a grunt
    this.maxHp = this.hp = this.hp * 0.85;
    if (!this.model) this.bodyMat.color.set(0x8fb8d8);
  }
  get modelId() {
    return 'ghoul';
  }
  get propId() {
    return 'none';
  }
}

export class Imp extends Skeleton {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'imp';
    this.maxHp = this.hp = this.hp * 0.9;
    this.aimMat.color.setRGB(3, 1, 0.25);
    if (!this.model) this.bodyMat.color.set(0xd0502a);
  }
  get modelId() {
    return 'imp';
  }
  get modelHeight() {
    return 1.5;
  }
  get propId() {
    return 'none';
  }
  /** Throws face forward (no side-on archery turn). */
  get aimYawDeg() {
    return 0;
  }
  fire() {
    const origin = new THREE.Vector3(this.pos.x, ARROW_HEIGHT, this.pos.z).addScaledVector(this.aimDir, 0.6);
    this.game.fireballs.spawn(origin, this.aimDir.clone(), this);
    this.game.sfx.sample('whoosh', { vol: 0.5, rate: 0.7, pan: this.game.panAt(this.pos) });
  }
}

const ballGeo = new THREE.SphereGeometry(0.28, 14, 10);
const ballMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.25) });

/** Imp fireballs: slower than arrows, leave a patch of fire where they land. */
export class Fireballs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.fires = [];
  }

  spawn(origin, dir, owner) {
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), dir, owner, traveled: 0, dodged: false });
  }

  update(dt) {
    const G = this.game;
    const P = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.pos.addScaledVector(b.dir, 11 * dt);
      b.traveled += 11 * dt;
      b.mesh.position.copy(b.pos);
      b.mesh.scale.setScalar(1 + 0.15 * Math.sin(b.traveled * 6));
      if (Math.random() < dt * 40) G.particles.spawn(b.pos, { count: 1, color: [3, 1, 0.2], speed: 0.6, up: 0.6, life: 0.4, size: 0.12, gravity: -1 });
      const d = Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z);
      let land = false;
      if (!P.dead && d < PLAYER_RADIUS + 0.35) {
        const res = P.takeDamage(16, b.dir, G);
        if (res === true) G.onPlayerHit({ lungeDir: b.dir }, 16);
        else if (res === 'dodged' && !b.dodged) {
          b.dodged = true;
          G.onPerfectDodge(b.owner);
          continue;
        }
        land = true;
      }
      if (!land && (arrowBlocked(b.pos) || b.traveled > 16)) land = true;
      if (land) {
        this.ignite(b.pos);
        b.mesh.removeFromParent();
        this.list.splice(i, 1);
      }
    }
    // Burning ground patches.
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (Math.random() < dt * 20) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.1;
        G.particles.spawn(new THREE.Vector3(f.pos.x + Math.cos(a) * r, 0.1, f.pos.z + Math.sin(a) * r), { count: 1, color: [3, 1.1, 0.2], speed: 0.3, up: 2, life: 0.5, size: 0.08, gravity: -1.5 });
      }
      if (!P.dead && Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z) < 1.2) {
        f.acc = (f.acc || 0) + dt;
        if (f.acc > 0.5) {
          f.acc = 0;
          const res = P.takeDamage(5, new THREE.Vector3(0, 0, 1), G);
          if (res === true) G.onPlayerHit({ lungeDir: new THREE.Vector3(0, 0, 1) }, 5);
        }
      }
      if (f.t <= 0) this.fires.splice(i, 1);
    }
  }

  ignite(pos) {
    const G = this.game;
    G.decals.spawn(pos, 'scorch', 2.4, 4);
    G.particles.spawn(pos.clone().setY(0.3), { count: 18, color: [3, 1.1, 0.25], speed: 3, up: 3, life: 0.5, size: 0.12 });
    G.sfx.sample('thunkGround', { vol: 0.4, rate: 0.7, pan: G.panAt(pos) });
    this.fires.push({ pos: pos.clone().setY(0), t: 2.5 });
  }

  clear() {
    for (const b of this.list) b.mesh.removeFromParent();
    this.list.length = 0;
    this.fires.length = 0;
  }
}
