// Gear drops in the arena: the item spins above the floor inside a beam of light
// in its rarity colour, so you can spot a Unique across the room. Walk over it
// to pick it up (it goes straight into your stash).

import * as THREE from 'three';
import { RARITIES, baseOf } from './gear.js';
import { makeSimpleBow } from './bow.js';

const beamTex = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();
const beamGeo = new THREE.CylinderGeometry(0.32, 0.42, 4, 16, 1, true).translate(0, 2, 0);
const ringGeo = new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2);

// A simple chest piece for armor drops.
const chestGeo = new THREE.CylinderGeometry(0.28, 0.22, 0.5, 10);
const shoulderGeo = new THREE.SphereGeometry(0.12, 10, 8);

function armorMesh(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(chestGeo, mat);
  const l = new THREE.Mesh(shoulderGeo, mat);
  l.position.set(-0.3, 0.2, 0);
  const r = l.clone();
  r.position.x = 0.3;
  g.add(body, l, r);
  return g;
}

const ARMOR_COLOR = { jerkin: 0x7a5232, cloak: 0x3f5a35, chainmail: 0x8a9096, plate: 0xb8bec4 };

export class GearDrops {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(pos, item) {
    const color = new THREE.Color(RARITIES[item.rarity].color);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ map: beamTex(), color, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 0.04;
    const icon = item.slot === 'bow' ? makeSimpleBow(baseOf(item).color) : armorMesh(ARMOR_COLOR[item.base] || 0x888888);
    icon.scale.setScalar(item.slot === 'bow' ? 1.3 : 1.5);
    icon.position.y = 1;
    group.add(beam, ring, icon);
    this.game.scene.add(group);
    // Pops up out of the body and lands, like the gems.
    const a = Math.random() * Math.PI * 2;
    this.list.push({ item, group, beam, ring, icon, t: 0, vel: new THREE.Vector3(Math.cos(a) * 2, 6, Math.sin(a) * 2), y: 1.2, landed: false });
    const G = this.game;
    G.sfx.sample(item.rarity === 'common' ? 'uiSelect' : 'ding', { vol: item.rarity === 'unique' ? 0.8 : 0.5, rate: item.rarity === 'unique' ? 0.7 : 1, jitter: 0, pan: G.panAt(pos) });
    if (item.rarity === 'unique') G.banner('', 'A Unique item dropped!', 1.4);
  }

  update(dt) {
    const G = this.game;
    const P = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      if (!d.landed) {
        d.vel.y -= 18 * dt;
        d.group.position.x += d.vel.x * dt;
        d.group.position.z += d.vel.z * dt;
        d.y += d.vel.y * dt;
        if (d.y <= 0.9 && d.vel.y < 0) {
          d.landed = true;
          d.y = 0.9;
          G.sfx.sample('thunkGround', { vol: 0.3, rate: 1.2, pan: G.panAt(d.group.position) });
        }
      }
      d.icon.position.y = d.landed ? 0.9 + Math.sin(d.t * 2.5) * 0.12 : d.y;
      d.icon.rotation.y += dt * 1.8;
      d.beam.material.opacity = d.landed ? Math.min(0.55, d.beam.material.opacity + dt * 1.5) * (0.85 + 0.15 * Math.sin(d.t * 3)) : 0;
      d.ring.scale.setScalar(1 + 0.08 * Math.sin(d.t * 3));
      if (d.landed && Math.random() < dt * (d.item.rarity === 'unique' ? 16 : 6)) {
        const c = new THREE.Color(RARITIES[d.item.rarity].color);
        G.particles.spawn(d.group.position.clone().setY(0.2 + Math.random() * 1.5), { count: 1, color: [c.r * 2, c.g * 2, c.b * 2], speed: 0.2, up: 0.8, life: 0.8, size: 0.05, gravity: -0.5 });
      }
      const dist = Math.hypot(P.pos.x - d.group.position.x, P.pos.z - d.group.position.z);
      if (d.landed && dist < 1.1 && !P.dead) this.pickup(i);
    }
  }

  pickup(i) {
    const d = this.list[i];
    this.list.splice(i, 1);
    d.group.removeFromParent();
    this.game.onGearPickup(d.item);
  }

  /** Grab everything still on the floor (leaving the arena). */
  scoop() {
    while (this.list.length) this.pickup(this.list.length - 1);
  }

  clear() {
    for (const d of this.list) d.group.removeFromParent();
    this.list.length = 0;
  }
}
