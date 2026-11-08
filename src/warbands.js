// More enemies, spread across the dungeons:
//   Sapper          runs at you with a lit powder keg, stops and lights the
//                   fuse; the blast hurts his friends too. Shoot him first and
//                   the keg goes off where he stands.
//   Bog Lurker      travels underground (only a moving mud ripple shows, and
//                   arrows can't reach him), then bursts up beside you to strike
//   Netcaster       throws a weighted net: get caught and you're slowed right down
//   Frost Berserker at half health he flies into a rage: faster, quicker blows
// Meshy models; an older model stands in until one is generated.

import * as THREE from 'three';
import { Grunt } from './enemy.js';
import { Archer } from './archer.js';
import { config } from './config.js';
import { models } from './models.js';
import { buffs } from './skills.js';

const pick = (id, fallback) => (models[id] ? id : fallback);
const tmp = new THREE.Vector3();

export class Sapper extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'sapper';
    this.speed *= 1.15;
    this.maxHp = this.hp = this.hp * 0.8;
    this.tune = { ...config.grunt, attackRange: -1 }; // never lunges: he lights the fuse instead
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.6, 0.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.fuseRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.85, 48).rotateX(-Math.PI / 2), mat);
    this.fuseRing.visible = false;
    game.scene.add(this.fuseRing);
    if (!this.model) this.bodyMat.color.set(0x6a5a48);
  }
  get modelId() {
    return pick('sapper', 'brute');
  }
  get propId() {
    return 'none';
  }
  update(dt, player) {
    if (this.state === 'chase' && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 2.4) {
      this.enter('fuse');
      this.game.sfx.sample('whoosh', { vol: 0.35, rate: 2.2, jitter: 0, pan: this.game.panAt(this.pos) });
    }
    if (this.state !== 'fuse') return super.update(dt, player);
    // Fuse burning: he stands still, glows, and the blast ring fills.
    this.t += dt;
    const p = Math.min(1, this.t / 0.95);
    this.fuseRing.visible = true;
    this.fuseRing.position.set(this.pos.x, 0.06, this.pos.z);
    this.fuseRing.material.opacity = 0.3 + 0.6 * Math.abs(Math.sin(this.t * (8 + p * 18)));
    this.bodyMat.emissive.setRGB(1.5 * p, 0.4 * p, 0);
    if (this.model) for (const m of this.model.materials) m.emissive.setRGB(0.8 * p * Math.abs(Math.sin(this.t * 20)), 0.2 * p, 0);
    if (Math.random() < dt * 30) this.game.particles.spawn(this.pos.clone().setY(1.6), { count: 1, color: [3, 2, 0.6], speed: 1.5, up: 2, life: 0.3, size: 0.05, gravity: 4 });
    this.updateModel(dt);
    if (p >= 1) this.blowUp();
  }
  blowUp() {
    if (this.exploded) return;
    this.exploded = true;
    this.fuseRing.visible = false;
    const pos = this.pos.clone();
    this.die(new THREE.Vector3(0, 0, 1));
    this.game.explosion(pos, 3, 45, 22);
  }
  die(dir) {
    super.die(dir);
    if (this.fuseRing) this.fuseRing.visible = false;
  }
  dispose() {
    this.fuseRing?.removeFromParent();
    super.dispose();
  }
}

export class Lurker extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'lurker';
    this.maxHp = this.hp = this.hp * 1.1;
    this.burrowCool = 0.5;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4a3a24, transparent: true, opacity: 0.75, depthWrite: false });
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.85, 32).rotateX(-Math.PI / 2), mat);
    this.ripple.visible = false;
    game.scene.add(this.ripple);
    if (!this.model) this.bodyMat.color.set(0x5a5a3a);
  }
  get modelId() {
    return pick('lurker', 'raider');
  }
  get propId() {
    return 'none';
  }
  /** Underground he can't be hit. */
  isHittable() {
    return this.state !== 'burrowed' && this.state !== 'surfacing' && super.isHittable();
  }
  update(dt, player) {
    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (this.state === 'chase') {
      this.burrowCool -= dt;
      if (this.burrowCool <= 0 && d > 4.5 && this.frozenT <= 0) {
        this.enter('burrowed');
        this.group.visible = false;
        this.game.particles.spawn(this.pos.clone().setY(0.3), { count: 14, color: 0x5a4a30, speed: 2.5, up: 2.5, life: 0.6, size: 0.15, gravity: 8 });
      }
    }
    if (this.state === 'burrowed') {
      // Tunnel toward the hero, fast; only the ripple shows.
      this.t += dt;
      tmp.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
      this.pos.addScaledVector(tmp, this.speed * 1.7 * dt);
      this.ripple.visible = true;
      this.ripple.position.set(this.pos.x, 0.05, this.pos.z);
      this.ripple.scale.setScalar(1 + 0.15 * Math.sin(this.t * 12));
      if (Math.random() < dt * 18) this.game.particles.spawn(this.pos.clone().setY(0.1), { count: 1, color: 0x5a4a30, speed: 1, up: 1.2, life: 0.4, size: 0.12, gravity: 6 });
      this.group.position.copy(this.pos);
      if (d < 2.2 || this.t > 6) {
        this.enter('surfacing');
        this.group.visible = true;
        this.ripple.visible = false;
        this.yaw = Math.atan2(tmp.x, tmp.z);
        this.game.particles.spawn(this.pos.clone().setY(0.4), { count: 24, color: 0x5a4a30, speed: 4, up: 4, life: 0.7, size: 0.16, gravity: 9 });
        this.game.sfx.sample('slam', { vol: 0.35, rate: 1.3, jitter: 0.1, pan: this.game.panAt(this.pos) });
      }
      return;
    }
    if (this.state === 'surfacing') {
      this.t += dt;
      const p = Math.min(1, this.t / 0.35);
      this.rig.position.y = -1.6 * (1 - p);
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.yaw;
      this.updateModel(dt);
      if (p >= 1) {
        this.rig.position.y = 0;
        this.lungeDir.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
        this.enter('windup');
        this.burrowCool = 2.5;
      }
      return;
    }
    super.update(dt, player);
  }
  dispose() {
    this.ripple?.removeFromParent();
    super.dispose();
  }
}

/** A tangle of rope for the thrown net. */
function netMesh() {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xd8c08a });
  const geo = new THREE.WireframeGeometry(new THREE.SphereGeometry(0.42, 6, 4));
  g.add(new THREE.LineSegments(geo, mat));
  const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ color: 0x4a4a50 }));
  for (const [x, z] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
    const m = w.clone();
    m.position.set(x, -0.1, z);
    g.add(m);
  }
  return g;
}

export class Netcaster extends Archer {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'netcaster';
    if (!this.model) this.bodyMat.color.set(0x8a6a4a);
  }
  get modelId() {
    return pick('netcaster', 'bomber');
  }
  get propId() {
    return 'none';
  }
  get aimYawDeg() {
    return 0;
  }
  fire() {
    const origin = new THREE.Vector3(this.pos.x, 1.2, this.pos.z).addScaledVector(this.aimDir, 0.7);
    const A = this.game.enemyArrows;
    A.spawn(origin, this.aimDir.clone(), config.archer.arrowSpeed * 0.65, Math.round(config.archer.damage * 0.4), this);
    // Swap the arrow for a spinning net.
    const a = A.list[A.list.length - 1];
    a.mesh.removeFromParent();
    a.mesh = netMesh();
    a.mesh.position.copy(origin);
    a.spin = true;
    this.game.scene.add(a.mesh);
    this.game.sfx.sample('whoosh', { vol: 0.45, rate: 0.9, pan: this.game.panAt(this.pos) });
  }
  /** Called by the enemy arrows when the net lands on you. */
  onArrowHit(game) {
    buffs.netted = 1.6;
    game.numbers.spawn(game.player.pos.clone().setY(2.4), 'NETTED!', 'callout');
    game.particles.spawn(game.player.pos.clone().setY(1), { count: 12, color: 0xd8c08a, speed: 2, up: 1, life: 0.5, size: 0.06, gravity: 4 });
  }
}

export class Berserker extends Grunt {
  constructor(game, pos, level) {
    super(game, pos, level);
    this.kind = 'berserker';
    this.maxHp = this.hp = this.hp * 1.6;
    this.tune = { ...config.grunt, damage: config.grunt.damage * 1.2 };
    if (!this.model) this.bodyMat.color.set(0xc87a5a);
  }
  get modelId() {
    return pick('berserker', 'brute');
  }
  get modelHeight() {
    return config.models.gruntHeight * 1.08;
  }
  get propId() {
    return 'club';
  }
  hit(damage, dir, charge, perfect) {
    const res = super.hit(damage, dir, charge, perfect);
    if (!this.enraged && res && res !== 'kill' && this.hp < this.maxHp * 0.5) this.enrage();
    return res;
  }
  /** Rage: faster, shorter windups, quicker recovery. */
  enrage() {
    this.enraged = true;
    this.speed *= 1.6;
    const g = config.grunt;
    this.tune = { ...this.tune, windupTime: g.windupTime * 0.6, recoverTime: g.recoverTime * 0.6, lungeSpeed: g.lungeSpeed * 1.15 };
    this.game.numbers.spawn(this.pos.clone().setY(2.6), 'ENRAGED!', 'callout');
    this.game.sfx.sample('hitHeavy', { vol: 0.5, rate: 0.55, jitter: 0.05, pan: this.game.panAt(this.pos) });
    this.game.particles.spawn(this.pos.clone().setY(1.4), { count: 20, color: [3, 0.6, 0.3], speed: 3, up: 2, life: 0.5, size: 0.08, gravity: 2 });
  }
  update(dt, player) {
    super.update(dt, player);
    if (this.enraged && this.state !== 'dying' && this.model) {
      const k = 0.25 + 0.15 * Math.sin(performance.now() * 0.012);
      for (const m of this.model.materials) m.emissive.r = Math.max(m.emissive.r, k);
    }
  }
}

if (typeof window !== 'undefined') {
  window.__warbands = { Sapper, Lurker, Netcaster, Berserker };
  window.__buffs = buffs; // for tests and debugging
}
