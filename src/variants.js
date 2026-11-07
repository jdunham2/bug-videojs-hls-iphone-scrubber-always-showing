// Arena-specific enemies.
//   Frost Raider (Frostpeak Keep): a fast northern raider whose blows leave you
//   numb with cold (slow).
//   Fire-pot Bomber (Molten Forge): keeps its distance and lobs clay fire pots that
//   leave burning ground, and his bandolier goes up when he falls.

import * as THREE from 'three';
import { Grunt } from './enemy.js';
import { Archer } from './archer.js';
import { arrowBlocked } from './world.js';
import { PLAYER_RADIUS, ARROW_HEIGHT } from './player.js';

export class Raider extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'raider';
    this.speed *= 1.35;
    this.timeBoost = 1.3; // quicker windup than a grunt
    this.maxHp = this.hp = this.hp * 0.85;
    if (!this.model) this.bodyMat.color.set(0x8fb8d8);
  }
  get modelId() {
    return 'raider';
  }
  get propId() {
    return 'club';
  }
}

export class Bomber extends Archer {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'bomber';
    this.maxHp = this.hp = this.hp * 0.9;
    this.aimMat.color.setRGB(3, 1, 0.25);
    if (!this.model) this.bodyMat.color.set(0xd0502a);
  }
  get modelId() {
    return 'bomber';
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

// A clay pot with a burning rag stuffed in the neck.
const potGeo = new THREE.SphereGeometry(0.22, 12, 8).scale(1, 1.15, 1);
const potMat = new THREE.MeshStandardMaterial({ color: 0xa8582c, roughness: 0.85 });
const ragGeo = new THREE.ConeGeometry(0.08, 0.2, 6).translate(0, 0.32, 0);
const ragMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.3) });

/** Clay fire pots: slower than arrows, they shatter into a patch of fire where they land. */
export class Fireballs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.fires = [];
  }

  spawn(origin, dir, owner) {
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(potGeo, potMat), new THREE.Mesh(ragGeo, ragMat));
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
      // Lobbed: a shallow arc, tumbling end over end.
      b.mesh.position.copy(b.pos).setY(b.pos.y + Math.sin(Math.min(1, b.traveled / 16) * Math.PI) * 1.6);
      b.mesh.rotation.x += dt * 9;
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
    G.particles.spawn(pos.clone().setY(0.3), { count: 8, color: 0x8a4a28, speed: 3.5, up: 2.5, life: 0.5, size: 0.1, gravity: 9 }); // pot shards
    G.sfx.sample('clang', { vol: 0.2, rate: 1.8, pan: G.panAt(pos) });
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
