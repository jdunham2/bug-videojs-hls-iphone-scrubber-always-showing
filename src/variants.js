// Arena-specific enemies.
//   Frost Raider (Frostpeak Keep): a fast northern raider whose blows leave you
//   numb with cold (slow).
//   Fire-pot Bomber (Molten Forge): keeps its distance and lobs clay fire pots that
//   leave burning ground, and his bandolier goes up when he falls.

import * as THREE from 'three';
import { Grunt } from './enemy.js';
import { Archer } from './archer.js';
import { arrowBlocked, resolveCircle, ARENA_HALF } from './world.js';
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

/**
 * Loot Thief: a bandit with a sack of treasure who turns up now and then and
 * runs for it. He never fights back. Bring him down before he slips away
 * (about 14 seconds) and the sack bursts: a shower of gems and a piece of gear.
 */
export class Thief extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'thief';
    this.isThief = true;
    this.speed *= 1.3;
    this.maxHp = this.hp = this.hp * 2.4;
    this.life = 14;
    this.zig = Math.random() * 10;
    // A glowing sack on his back so he's easy to pick out.
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sackGlow(), color: 0xffc040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, 1.5, -0.35);
    glow.scale.setScalar(1.6);
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9, emissive: 0x4a3000 }));
    sack.position.set(0, 1.3, -0.35);
    this.group.add(sack, glow);
    this.sackGlow = glow;
    if (this.model) for (const m of this.model.materials) m.color.multiplyScalar(0.8);
  }
  get modelId() {
    return 'bandit';
  }
  get propId() {
    return 'none';
  }

  update(realDt, player) {
    if (this.state !== 'chase') return super.update(realDt, player);
    this.flash = Math.max(0, this.flash - realDt);
    this.hitT = Math.max(0, this.hitT - realDt);
    if (this.updateStatus(realDt)) return;
    const dt = realDt * this.timeScale;
    this.t += dt;
    this.life -= realDt;
    // Run away from the hero, steering off the walls, with a weave.
    const away = new THREE.Vector3(this.pos.x - player.pos.x, 0, this.pos.z - player.pos.z);
    const d = away.length() || 1;
    away.divideScalar(d);
    const center = new THREE.Vector3(-this.pos.x, 0, -this.pos.z);
    const edge = Math.max(Math.abs(this.pos.x), Math.abs(this.pos.z)) / (ARENA_HALF - 1);
    away.addScaledVector(center.normalize(), Math.max(0, edge - 0.55) * 3);
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(Math.sin(this.t * 2.6 + this.zig) * 0.6);
    away.add(side).normalize();
    const pace = d < 9 ? this.speed : this.speed * 0.55; // eases off when you're far behind
    this.pos.x += (away.x * pace + this.knock.x) * dt;
    this.pos.z += (away.z * pace + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-9 * realDt));
    resolveCircle(this.pos, this.radius);
    const yaw = Math.atan2(away.x, away.z);
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-10 * dt));
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.sackGlow.material.opacity = 0.6 + 0.3 * Math.sin(this.t * 8);
    if (Math.random() < dt * 14) this.game.particles.spawn(this.pos.clone().setY(1.2), { count: 1, color: [3, 2.3, 0.6], speed: 0.6, up: 0.6, life: 0.7, size: 0.06, gravity: 1 });
    this.bodyMat.emissive.setRGB(this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.8 : 0);
    if (this.model) for (const m of this.model.materials) m.emissive.setRGB(this.flash > 0 ? 0.5 : 0.08, this.flash > 0 ? 0.5 : 0.06, this.flash > 0 ? 0.5 : 0);
    this.updateModel(realDt);
    if (this.life <= 0) this.escape();
  }

  /** Gone in a puff of smoke. */
  escape() {
    const G = this.game;
    G.particles.spawn(this.pos.clone().setY(0.8), { count: 40, color: 0x6a6460, speed: 3, up: 2, life: 1, size: 0.35, gravity: -0.5, drag: 0.5 });
    G.banner('The thief got away', 'Faster next time!', 1.6);
    G.sfx.sample('whoosh', { vol: 0.5, rate: 1.3, jitter: 0 });
    this.dispose();
  }
}

let glowTex = null;
function sackGlow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
