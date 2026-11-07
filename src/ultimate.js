// Arrow Storm: the hero's ultimate. Fill the meter with perfect shots, hits,
// kills and perfect dodges, then press Q to call a rain of golden arrows
// down on the target area.

import * as THREE from 'three';
import { config } from './config.js';
import { makeArrowMesh } from './arrows.js';
import { lv } from './skills.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class ArrowStorm {
  constructor(game) {
    this.game = game;
    this.meter = 0;
    this.active = null;
    this.falling = [];
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 2.1, 0.5),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), ringMat);
    this.ringFill = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), ringMat.clone());
    this.ring.renderOrder = this.ringFill.renderOrder = 3;
    this.ring.visible = this.ringFill.visible = false;
    game.scene.add(this.ring, this.ringFill);
  }

  get ready() {
    return this.meter >= 100 && !this.active;
  }

  gain(amount) {
    if (this.active) return;
    const was = this.meter;
    this.meter = Math.min(100, this.meter + amount * config.ultimate.gainRate);
    if (was < 100 && this.meter >= 100) this.game.onUltimateReady();
  }

  activate(target) {
    if (!this.ready) return false;
    const u = config.ultimate;
    this.meter = 0;
    this.active = { t: 0, target: target.clone().setY(0), spawned: 0 };
    this.ring.visible = this.ringFill.visible = true;
    this.ring.position.set(target.x, 0.07, target.z);
    this.ringFill.position.copy(this.ring.position);
    this.ring.scale.setScalar(u.radius);
    const G = this.game;
    G.player.casting = u.castTime;
    G.player.iframes = Math.max(G.player.iframes, u.castTime + 0.2);
    G.slowmo = u.castTime;
    G.slowmoScale = 0.35;
    G.zoomPull = 1;
    G.sfx.ultimateCast();
    G.shake.add(0.3);
    G.banner('Arrow Storm!', '', 1.2);
    G.particles.spawn(G.player.pos.clone().setY(1.2), { count: 40, color: [3, 2.2, 0.6], speed: 5, up: 6, life: 0.9, size: 0.1, gravity: -2 });
    return true;
  }

  update(dt) {
    const u = config.ultimate;
    const a = this.active;
    if (a) {
      a.t += dt;
      const pulse = 0.5 + 0.5 * Math.sin(a.t * 18);
      this.ring.material.opacity = 0.6 + 0.3 * pulse;
      this.ringFill.material.opacity = 0.08 + 0.06 * pulse;
      this.ringFill.scale.setScalar(u.radius * Math.min(1, a.t / u.castTime));
      // After the cast, arrows rain down evenly over the storm's duration.
      const rainT = a.t - u.castTime;
      if (rainT > 0) {
        const want = Math.min(u.arrows, Math.floor((rainT / u.duration) * u.arrows));
        while (a.spawned < want) {
          a.spawned++;
          this.dropArrow(a.target, u.radius);
        }
      }
      if (rainT > u.duration + 0.8) {
        this.active = null;
        this.ring.visible = this.ringFill.visible = false;
        this.game.onUltimateEnd();
      }
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.pos.addScaledVector(f.vel, dt);
      f.mesh.position.copy(f.pos);
      if (f.pos.y <= 0.25) {
        this.impact(f);
        f.stuck = 2.5;
        f.pos.y = 0.25;
        f.mesh.getObjectByName('trail').visible = false;
        this.falling.splice(i, 1);
        this.stuck.push(f);
      }
    }
    this.stuck = (this.stuck || []).filter((f) => {
      f.stuck -= dt;
      if (f.stuck < 0.5) f.mesh.position.y -= dt * 0.8;
      if (f.stuck <= 0) {
        f.mesh.removeFromParent();
        return false;
      }
      return true;
    });
  }

  dropArrow(center, radius) {
    // Uniform over the disc, slightly favouring the edge so it reads as a "storm".
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const land = new THREE.Vector3(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
    const start = land.clone().add(new THREE.Vector3(rand(-2, 2) - 3, 16, rand(-2, 2) - 3));
    const vel = land.clone().sub(start).normalize().multiplyScalar(rand(34, 42));
    const mesh = makeArrowMesh(true);
    mesh.scale.setScalar(1.2);
    mesh.position.copy(start);
    mesh.lookAt(start.clone().add(vel));
    this.game.scene.add(mesh);
    this.falling.push({ mesh, pos: start, vel, land });
  }

  impact(f) {
    const G = this.game;
    const u = config.ultimate;
    const dmg = u.damage * (1 + 0.2 * lv('heavyDraw'));
    G.particles.spawn(f.pos.clone().setY(0.2), { count: 5, color: [3, 2, 0.5], speed: 3, up: 2, life: 0.35, size: 0.07 });
    if (Math.random() < 0.3) G.decals.spawn(f.pos, 'scorch', 0.6, 6);
    if (Math.random() < 0.35) G.sfx.sample(Math.random() < 0.5 ? 'thunkGround' : 'thunkWood', { vol: 0.25, rate: 1.4, pan: G.panAt(f.pos) });
    for (const e of G.enemies) {
      if (!e.isHittable()) continue;
      if (Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) > e.radius + u.splash) continue;
      const dir = new THREE.Vector3(e.pos.x - f.pos.x, 0, e.pos.z - f.pos.z).normalize();
      const res = e.hit(dmg, dir, 0.4, false);
      G.numbers.spawn(e.pos.clone().setY(2 + Math.random()), Math.round(dmg), 'crit');
      if (res === 'kill') G.onKill(e);
    }
  }

  clear() {
    for (const f of [...this.falling, ...(this.stuck || [])]) f.mesh.removeFromParent();
    this.falling.length = 0;
    this.stuck = [];
    this.active = null;
    this.meter = 0;
    this.ring.visible = this.ringFill.visible = false;
  }
}
