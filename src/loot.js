// Loot: soul gems (the currency for unlocks) and health orbs. They burst out
// of defeated enemies, bounce, then get pulled into the hero.

import * as THREE from 'three';

const gemGeo = new THREE.OctahedronGeometry(0.16, 0);
const orbGeo = new THREE.SphereGeometry(0.2, 12, 8);
const gemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.6, 3) });
const orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.45) });
const rand = (a, b) => a + Math.random() * (b - a);

export class Loot {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.runGems = 0;
  }

  /** Burst `gems` soul gems (and maybe health orbs) out of a point. */
  drop(pos, gems, orbs = 0) {
    for (let i = 0; i < gems + orbs; i++) {
      const type = i < gems ? 'gem' : 'orb';
      const mesh = new THREE.Mesh(type === 'gem' ? gemGeo : orbGeo, type === 'gem' ? gemMat : orbMat);
      const a = Math.random() * Math.PI * 2;
      const sp = rand(2, 5);
      const item = {
        type,
        mesh,
        pos: pos.clone().setY(1),
        vel: new THREE.Vector3(Math.cos(a) * sp, rand(4, 7), Math.sin(a) * sp),
        t: 0,
        spin: rand(2, 5),
      };
      mesh.position.copy(item.pos);
      this.game.scene.add(mesh);
      this.items.push(item);
    }
  }

  update(dt) {
    const P = this.game.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const to = new THREE.Vector3(P.pos.x - it.pos.x, 1 - it.pos.y, P.pos.z - it.pos.z);
      const d = to.length();
      // After a short settle, items home in on the hero (faster the closer they are).
      const magnet = it.t > 0.7 && !P.dead && (d < 4.5 || it.t > 2.2);
      if (magnet) {
        const pull = 14 + 30 / Math.max(0.5, d);
        it.vel.lerp(to.normalize().multiplyScalar(pull), 1 - Math.exp(-6 * dt));
      } else {
        it.vel.y -= 18 * dt;
        it.vel.x *= 1 - 1.5 * dt;
        it.vel.z *= 1 - 1.5 * dt;
      }
      it.pos.addScaledVector(it.vel, dt);
      if (!magnet && it.pos.y < 0.25) {
        it.pos.y = 0.25;
        it.vel.y = Math.abs(it.vel.y) * 0.45;
      }
      it.mesh.position.copy(it.pos);
      if (!magnet && it.vel.lengthSq() < 0.5) it.mesh.position.y = 0.3 + Math.sin(it.t * 4) * 0.08;
      it.mesh.rotation.y += it.spin * dt;
      it.mesh.rotation.x += it.spin * 0.5 * dt;
      if (Math.random() < dt * 6) {
        this.game.particles.spawn(it.pos, {
          count: 1,
          color: it.type === 'gem' ? [0.8, 1.6, 3] : [3, 0.5, 0.4],
          speed: 0.2,
          up: 0.3,
          life: 0.35,
          size: 0.05,
          gravity: 0,
        });
      }
      if (d < 0.7) {
        this.collect(it);
        it.mesh.removeFromParent();
        this.items.splice(i, 1);
      }
    }
  }

  collect(it) {
    const G = this.game;
    if (it.type === 'gem') {
      this.runGems++;
      G.sfx.sample('ding', { vol: 0.18, rate: 2 + Math.random() * 0.3, jitter: 0 });
      G.hud.gems.classList.remove('bump');
      void G.hud.gems.offsetWidth;
      G.hud.gems.classList.add('bump');
    } else {
      const P = G.player;
      const heal = Math.min(10, G.maxHp() - P.hp);
      P.hp += heal;
      if (heal > 0) G.numbers.spawn(P.pos.clone().setY(2.2), `+${Math.round(heal)}`, 'heal');
      G.sfx.sample('ding', { vol: 0.3, rate: 0.9, jitter: 0 });
    }
  }

  /** Collect every gem still on the floor (used when leaving an arena). */
  scoop() {
    for (const it of this.items) {
      if (it.type === 'gem') this.runGems++;
      it.mesh.removeFromParent();
    }
    this.items.length = 0;
  }

  clear() {
    for (const it of this.items) it.mesh.removeFromParent();
    this.items.length = 0;
    this.runGems = 0;
  }
}
