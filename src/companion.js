// The falcon: a hunting bird that joins you at hero level 4. It circles above
// you, and every few seconds picks the nearest enemy and dives at it, raking
// for damage and knocking it off balance, then climbs back to circle again.

import * as THREE from 'three';
import { heroPower } from './gear.js';
import { levelFor, FALCON_LEVEL } from './progression.js';
import { profile } from './profile.js';

export const falconUnlocked = () => levelFor(profile.xp || 0).level >= FALCON_LEVEL;

const tmp = new THREE.Vector3();

export class Falcon {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    const brown = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.8 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xd8a23a, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8).scale(0.8, 0.75, 1.6), brown);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(0.8, 0.7, 1.2), cream);
    chest.position.set(0, -0.04, 0.06);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), brown);
    head.position.set(0, 0.06, 0.26);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6).rotateX(Math.PI / 2), beakMat);
    beak.position.set(0, 0.04, 0.38);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.22), brown);
    tail.position.set(0, 0, -0.3);
    const wingGeo = new THREE.BoxGeometry(0.55, 0.02, 0.2).translate(0.28, 0, 0);
    this.wingL = new THREE.Mesh(wingGeo, brown);
    this.wingR = new THREE.Mesh(wingGeo, brown);
    this.wingR.scale.x = -1;
    for (const w of [this.wingL, this.wingR]) w.position.set(0, 0.04, 0);
    this.bird = new THREE.Group();
    this.bird.add(body, chest, head, beak, tail, this.wingL, this.wingR);
    this.bird.traverse((o) => o.isMesh && (o.castShadow = true));
    this.bird.scale.setScalar(1.6);
    this.group.add(this.bird);
    this.trail = [];
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.state = 'circle';
    this.cool = 3;
    this.t = Math.random() * 10;
    this.active = false;
  }

  /** Put the falcon into a scene next to the hero (or take it out). */
  attach(scene, on) {
    this.active = on;
    if (on) {
      scene.add(this.group);
      const P = this.game.player.pos;
      this.pos.set(P.x + 2, 3.5, P.z);
      this.state = 'circle';
      this.cool = 3;
    } else {
      this.group.removeFromParent();
    }
  }

  update(dt, enemies, fighting) {
    if (!this.active) return;
    this.t += dt;
    const P = this.game.player.pos;
    let target;
    let speed = 9;
    let flap = 10;
    if (this.state === 'circle') {
      const a = this.t * 1.1;
      target = tmp.set(P.x + Math.cos(a) * 2.4, 3.4 + Math.sin(this.t * 2.3) * 0.3, P.z + Math.sin(a) * 2.4);
      flap = 7;
      this.cool -= dt;
      if (fighting && this.cool <= 0) {
        let best = null;
        let bd = 13;
        for (const e of enemies) {
          if (!e.isHittable() || e.removed) continue;
          const d = Math.hypot(e.pos.x - P.x, e.pos.z - P.z);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) {
          this.prey = best;
          this.state = 'dive';
          this.t0 = this.t;
          this.game.sfx.sample('whoosh', { vol: 0.35, rate: 1.8, jitter: 0, pan: this.game.panAt(best.pos) });
        } else this.cool = 0.5;
      }
    } else if (this.state === 'dive') {
      const e = this.prey;
      if (!e || e.removed || !e.isHittable() || this.t - this.t0 > 2.5) {
        this.state = 'climb';
      } else {
        target = tmp.set(e.pos.x, 1.1, e.pos.z);
        speed = 20;
        flap = 2;
        if (this.pos.distanceTo(target) < 0.6) this.strike(e);
      }
    }
    if (this.state === 'climb') {
      target = tmp.set(P.x, 4, P.z);
      speed = 11;
      flap = 14;
      if (this.pos.y > 3.2) {
        this.state = 'circle';
        this.cool = 5 + Math.random() * 2;
      }
    }
    if (!target) target = tmp.set(P.x, 4, P.z);
    // Steer toward the target with a little inertia.
    const want = target.clone().sub(this.pos);
    const dist = want.length();
    if (dist > 1e-3) want.multiplyScalar(Math.min(speed, dist * 6) / dist);
    this.vel.lerp(want, 1 - Math.exp(-(this.state === 'dive' ? 10 : 4) * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.group.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.01) {
      this.bird.rotation.y = Math.atan2(this.vel.x, this.vel.z);
      this.bird.rotation.x = -Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z)) * 0.8;
    }
    const w = Math.sin(this.t * flap) * (this.state === 'dive' ? 0.15 : 0.7);
    this.wingL.rotation.z = w;
    this.wingR.rotation.z = -w;
  }

  strike(e) {
    const G = this.game;
    const dmg = Math.round(9 * (1 + 0.12 * heroPower()));
    const dir = this.vel.clone().setY(0).normalize();
    const res = e.hit(dmg, dir, 0.6, false);
    if (res) {
      G.numbers.spawn(e.pos.clone().setY(2.2), dmg, 'normal');
      G.particles.spawn(e.pos.clone().setY(1.2), { count: 12, color: 0xe8dcc0, speed: 3, up: 2, life: 0.4, size: 0.06, gravity: 4, dir, spread: 1 });
      G.sfx.sample('hit', { vol: 0.35, rate: 1.5, pan: G.panAt(e.pos) });
      if (res === 'kill') G.onKill(e);
    }
    this.state = 'climb';
  }
}
