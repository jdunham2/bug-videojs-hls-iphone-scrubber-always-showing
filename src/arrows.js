import * as THREE from 'three';
import { config } from './config.js';
import { arrowBlocked } from './world.js';

// Arrow model points down +Z, centered on its middle, 1 unit long.
const shaftGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5).rotateX(Math.PI / 2);
const headGeo = new THREE.ConeGeometry(0.055, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0.56);
const fletchA = new THREE.BoxGeometry(0.15, 0.008, 0.2).translate(0, 0, -0.4);
const fletchB = fletchA.clone().rotateZ(Math.PI / 2);

const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc9a26b, roughness: 0.7 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, metalness: 0.6, roughness: 0.35 });
const fletchMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 });
const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 0.5) });
const trailTex = (() => {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
})();
const trailGeo = new THREE.PlaneGeometry(0.07, 2.2).rotateX(-Math.PI / 2).translate(0, 0, -1.4);
const trailMat = (color, opacity) =>
  new THREE.MeshBasicMaterial({ map: trailTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const trailMats = {
  normal: trailMat(new THREE.Color(1, 0.95, 0.85), 0.35),
  perfect: trailMat(new THREE.Color(3, 2, 0.5), 0.8),
  mega: trailMat(new THREE.Color(3, 0.6, 2.4), 0.9),
};
const megaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.7, 2.4) });

export function makeArrowMesh(perfect = false, mega = false) {
  const g = new THREE.Group();
  const special = mega ? megaMat : perfect ? glowMat : null;
  const shaft = new THREE.Mesh(shaftGeo, special || shaftMat);
  shaft.castShadow = true;
  g.add(shaft, new THREE.Mesh(headGeo, special || headMat));
  if (mega) g.scale.setScalar(1.8);
  // Streak behind the arrow so fast shots read clearly.
  const trail = new THREE.Mesh(trailGeo, mega ? trailMats.mega : perfect ? trailMats.perfect : trailMats.normal);
  trail.name = 'trail';
  trail.renderOrder = 2;
  g.add(trail);
  g.add(new THREE.Mesh(fletchA, fletchMat), new THREE.Mesh(fletchB, fletchMat));
  return g;
}

/** Closest-approach test of segment AB against a circle (XZ plane). Returns t in [0,1] or -1. */
function segCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax;
  const dz = bz - az;
  const a = dx * dx + dz * dz;
  let t = a > 0 ? -((ax - cx) * dx + (az - cz) * dz) / a : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz <= r * r ? t : -1;
}

const MAX_STUCK = 60;
const RICOCHET_RANGE = 9;
const TRAIL = { fire: [3, 1.1, 0.2], frost: [0.8, 1.8, 3] };
const tmp = new THREE.Vector3();

export class ArrowSystem {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  /** opts: { mega, extra, bounces, element } */
  spawn(origin, dir, speed, damage, charge, perfect, opts = {}) {
    const mesh = makeArrowMesh(perfect, opts.mega);
    mesh.position.copy(origin);
    mesh.lookAt(tmp.copy(origin).add(dir));
    this.scene.add(mesh);
    this.list.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      dir: dir.clone(),
      speed,
      damage,
      charge,
      perfect,
      mega: !!opts.mega,
      extra: !!opts.extra, // side arrows from Split Shot (not counted as separate shots)
      bounces: opts.bounces || 0,
      element: opts.element || null,
      pierce: perfect || !!opts.mega,
      hitSet: new Set(),
      hitCount: 0,
      traveled: 0,
      state: 'flying',
      life: 0,
      enemy: null,
    });
  }

  update(dt, enemies, game) {
    let stuckCount = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.state === 'flying') this.fly(a, dt, enemies, game);
      else if (a.state === 'falling') this.fall(a, dt, game);
      else {
        a.life += dt;
        stuckCount++;
        const gone = a.state === 'attached' ? a.enemy.removed : a.life > 7 || stuckCount > MAX_STUCK;
        if (a.state === 'stuck' && a.life > 6) a.mesh.position.y -= dt * 0.6; // sink away
        if (gone) {
          a.mesh.removeFromParent();
          this.list.splice(i, 1);
        }
      }
    }
  }

  fly(a, dt, enemies, game) {
    const px = a.pos.x;
    const pz = a.pos.z;
    a.pos.addScaledVector(a.vel, dt);
    a.traveled += a.speed * dt;

    const hits = [];
    for (const e of enemies) {
      if (!e.isHittable() || a.hitSet.has(e)) continue;
      const t = segCircle(px, pz, a.pos.x, a.pos.z, e.pos.x, e.pos.z, e.radius);
      if (t >= 0) hits.push({ e, t });
    }
    hits.sort((h1, h2) => h1.t - h2.t);
    for (const { e, t } of hits) {
      a.hitSet.add(e);
      const point = new THREE.Vector3(px + (a.pos.x - px) * t, a.pos.y, pz + (a.pos.z - pz) * t);
      game.onArrowHit(a, e, point);
      a.hitCount++;
      if (!a.pierce) {
        if (a.bounces > 0 && this.ricochet(a, e, point, enemies, game)) return;
        // Embed the arrow in the enemy so it rides along (and falls with it).
        a.pos.copy(point).addScaledVector(a.dir, 0.3);
        a.mesh.position.copy(a.pos);
        e.rig.attach(a.mesh);
        a.state = 'attached';
        a.mesh.getObjectByName('trail').visible = false;
        a.enemy = e;
        return;
      }
    }

    if (a.mega) {
      game.particles.spawn(a.pos, { count: 3, color: [3, 0.6, 2.4], speed: 1, up: 0, life: 0.35, size: 0.12, gravity: 0 });
    } else if (a.perfect) {
      game.particles.spawn(a.pos, { count: 1, color: [3, 2, 0.5], speed: 0.4, up: 0, life: 0.25, size: 0.07, gravity: 0 });
    }
    if (a.element && Math.random() < 0.5) {
      game.particles.spawn(a.pos, { count: 1, color: TRAIL[a.element], speed: 0.5, up: 0.5, life: 0.3, size: 0.06, gravity: 0 });
    }

    if (arrowBlocked(a.pos)) {
      a.state = 'stuck';
      a.mesh.getObjectByName('trail').visible = false;
      game.onArrowStopped(a, true);
    } else if (a.traveled > config.bow.range) {
      a.state = 'falling';
      a.mesh.getObjectByName('trail').visible = false;
    }
    a.mesh.position.copy(a.pos);
  }

  /** Redirect an arrow from `from` to the nearest other grunt. Returns false if none in range. */
  ricochet(a, from, point, enemies, game) {
    let best = null;
    let bestD = RICOCHET_RANGE;
    for (const e of enemies) {
      if (e === from || !e.isHittable() || a.hitSet.has(e)) continue;
      const d = Math.hypot(e.pos.x - point.x, e.pos.z - point.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return false;
    a.bounces--;
    a.pos.copy(point);
    a.dir.set(best.pos.x - point.x, 0, best.pos.z - point.z).normalize();
    a.vel.copy(a.dir).multiplyScalar(a.speed);
    a.traveled = 0;
    a.mesh.position.copy(a.pos);
    a.mesh.lookAt(tmp.copy(a.pos).add(a.dir));
    game.onRicochet(point);
    return true;
  }

  fall(a, dt, game) {
    a.vel.y -= 30 * dt;
    a.vel.x *= 1 - 1.5 * dt;
    a.vel.z *= 1 - 1.5 * dt;
    a.pos.addScaledVector(a.vel, dt);
    a.mesh.position.copy(a.pos);
    a.mesh.lookAt(tmp.copy(a.pos).add(a.vel));
    if (a.pos.y <= 0.15 || arrowBlocked(a.pos)) {
      a.pos.y = Math.max(a.pos.y, 0.15);
      a.mesh.position.copy(a.pos);
      a.state = 'stuck';
      game.onArrowStopped(a, false);
    }
  }

  clear() {
    for (const a of this.list) a.mesh.removeFromParent();
    this.list.length = 0;
  }
}
