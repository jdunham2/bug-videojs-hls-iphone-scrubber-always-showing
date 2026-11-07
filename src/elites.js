// Elite enemies: tougher versions with one affix and a colored aura.
//   Swift     – much faster, shorter telegraphs.
//   Shielded  – a barrier soaks most damage until a full-draw or perfect hit shatters it.
//   Vampiric  – heals when it hurts you.
//   Volatile  – explodes shortly after it dies.

import * as THREE from 'three';

export const AFFIXES = {
  swift: { name: 'Swift', color: new THREE.Color(3, 2.6, 0.6) },
  shielded: { name: 'Shielded', color: new THREE.Color(0.8, 1.8, 3) },
  vampiric: { name: 'Vampiric', color: new THREE.Color(3, 0.3, 0.4) },
  volatile: { name: 'Volatile', color: new THREE.Color(3, 1.2, 0.2) },
};

const auraTex = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 54, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.moveTo(40, 0);
      g.lineTo(54, 0);
      g.stroke();
    }
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

/** Turn a spawned enemy into an elite with the given affix. */
export function makeElite(enemy, affix) {
  const A = AFFIXES[affix];
  enemy.affix = affix;
  enemy.elite = true;
  enemy.maxHp = enemy.hp = enemy.hp * 2;
  enemy.group.scale.multiplyScalar(1.18);
  enemy.radius *= 1.18;
  const mat = new THREE.MeshBasicMaterial({
    map: auraTex(),
    color: A.color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), mat);
  aura.position.y = 0.06;
  aura.renderOrder = 2;
  enemy.group.add(aura);
  enemy.aura = aura;
  if (affix === 'swift') {
    enemy.speed *= 1.6;
    enemy.timeBoost = 1.25; // shortens its telegraphs
  }
  if (affix === 'shielded') {
    enemy.shield = 70;
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 20, 14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 3), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    bubble.position.y = 1.1;
    enemy.group.add(bubble);
    enemy.bubble = bubble;
  }
  // Wrap hit() for the shield.
  const baseHit = enemy.hit.bind(enemy);
  enemy.hit = (damage, dir, charge, perfect) => {
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

/** Per-frame elite visuals (aura spin, shield shimmer). */
export function updateElite(enemy, dt) {
  if (!enemy.elite) return;
  enemy.aura.rotation.y += dt * 1.5;
  enemy.aura.material.opacity = enemy.state === 'dying' ? Math.max(0, enemy.aura.material.opacity - dt * 2) : 0.6 + 0.25 * Math.sin(performance.now() * 0.006);
  if (enemy.bubble) {
    enemy.bubble.visible = enemy.shield > 0 && enemy.state !== 'dying';
    enemy.bubble.material.opacity = 0.14 + 0.06 * Math.sin(performance.now() * 0.01);
  }
}
