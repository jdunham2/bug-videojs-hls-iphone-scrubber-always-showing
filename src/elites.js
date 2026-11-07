// Elite enemies: tougher versions with one trait and a coloured ground marker.
//   Swift       – much faster, shorter telegraphs.
//   Armored     – carries a big round shield that soaks most damage until a
//                 full-draw or perfect hit splits it.
//   Hardy       – patches itself up when you stop hitting it.
//   Powder Keg  – carries a keg of black powder that goes off shortly after it falls.

import * as THREE from 'three';

export const AFFIXES = {
  swift: { name: 'Swift', color: 0xf2c94c },
  shielded: { name: 'Armored', color: 0xb8c4cc },
  hardy: { name: 'Hardy', color: 0x6fcf6f },
  volatile: { name: 'Powder Keg', color: 0xf2994a },
};

const markerGeo = new THREE.RingGeometry(1.0, 1.15, 40).rotateX(-Math.PI / 2);
const shieldGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20).rotateX(Math.PI / 2);
const shieldMat = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 });
const rimGeo = new THREE.TorusGeometry(0.55, 0.04, 6, 24);
const ironMat = new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.5, metalness: 0.6 });
const kegGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.45, 12);
const kegMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.8 });

/** Turn a spawned enemy into an elite with the given affix. */
export function makeElite(enemy, affix) {
  const A = AFFIXES[affix];
  enemy.affix = affix;
  enemy.elite = true;
  enemy.maxHp = enemy.hp = enemy.hp * 2;
  enemy.group.scale.multiplyScalar(1.18);
  enemy.radius *= 1.18;
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: A.color, transparent: true, opacity: 0.7, depthWrite: false }));
  marker.position.y = 0.05;
  marker.renderOrder = 2;
  enemy.group.add(marker);
  enemy.aura = marker;
  if (affix === 'swift') {
    enemy.speed *= 1.6;
    enemy.timeBoost = 1.25; // shortens its telegraphs
  }
  if (affix === 'shielded') {
    enemy.shield = 70;
    const shield = new THREE.Group();
    shield.add(new THREE.Mesh(shieldGeo, shieldMat), new THREE.Mesh(rimGeo, ironMat));
    shield.position.set(-0.35, 1.1, 0.55);
    shield.traverse((o) => (o.castShadow = true));
    enemy.group.add(shield);
    enemy.bubble = shield;
  }
  if (affix === 'volatile') {
    const keg = new THREE.Mesh(kegGeo, kegMat);
    keg.position.set(0, 1.25, -0.45);
    keg.castShadow = true;
    enemy.group.add(keg);
  }
  enemy.sinceHit = 0;
  // Wrap hit() for the shield.
  const baseHit = enemy.hit.bind(enemy);
  enemy.hit = (damage, dir, charge, perfect) => {
    enemy.sinceHit = 0;
    if (enemy.shield > 0 && enemy.isHittable()) {
      if (perfect || charge >= 0.999) {
        enemy.shield = 0;
        enemy.game.onShieldBreak(enemy);
      } else {
        enemy.shield -= damage;
        damage *= 0.25;
        if (enemy.shield <= 0) enemy.game.onShieldBreak(enemy);
      }
    }
    return baseHit(damage, dir, charge, perfect);
  };
}

/** Per-frame elite upkeep: marker fade, shield, Hardy regeneration. */
export function updateElite(enemy, dt) {
  if (!enemy.elite) return;
  const dying = enemy.state === 'dying';
  enemy.aura.material.opacity = dying ? Math.max(0, enemy.aura.material.opacity - dt * 2) : 0.7;
  if (enemy.bubble) enemy.bubble.visible = enemy.shield > 0 && !dying;
  if (enemy.affix === 'hardy' && !dying) {
    enemy.sinceHit += dt;
    if (enemy.sinceHit > 2 && enemy.hp < enemy.maxHp) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * 0.05 * dt);
  }
}
