// The town down the road from camp: a square with a well, townhouses, market
// stalls, a cottage you can buy, and five villagers who wander about, turn to
// greet you, and give you tasks (a "!" over their head) or want them handed in
// (a "?"). Built into the camp's scene; the camp handles walking and screens.

import * as THREE from 'three';
import { spawnProp, instantiate, models, disposeInstance } from './models.js';
import { VILLAGERS, markerFor } from './quests.js';
import { profile } from './profile.js';

export const TOWN = { x: 0, z: 70, r: 21 }; // the square
export const ROAD = { halfWidth: 3.2, from: 20, to: TOWN.z - TOWN.r + 6 }; // camp edge → town edge, along +z

const rand = (a, b) => a + Math.random() * (b - a);

function canvasSprite(draw, w = 256, h = 128, scale = [1.6, 0.8]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(scale[0], scale[1], 1);
  s.renderOrder = 6;
  return s;
}

function dirtTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(92,70,48,1)');
  grad.addColorStop(0.75, 'rgba(80,62,42,0.9)');
  grad.addColorStop(1, 'rgba(70,52,36,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,30,20' : '140,120,90'},${Math.random() * 0.25})`;
    g.fillRect(Math.random() * size, Math.random() * size, rand(1, 3), rand(1, 3));
  }
  // Worn stones in the middle of the square.
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * size * 0.3;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,104,84' : '60,48,36'},${rand(0.15, 0.3)})`;
    g.beginPath();
    g.ellipse(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, rand(2, 4.5), rand(1.5, 3.5), Math.random() * 3, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(76,58,40,0)');
  grad.addColorStop(0.18, 'rgba(84,64,44,0.95)');
  grad.addColorStop(0.82, 'rgba(84,64,44,0.95)');
  grad.addColorStop(1, 'rgba(76,58,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,30,20' : '140,120,90'},${Math.random() * 0.3})`;
    g.fillRect(rand(20, 108), Math.random() * 512, rand(1, 3), rand(1, 3));
  }
  // Two cart ruts.
  g.fillStyle = 'rgba(40,30,20,0.25)';
  g.fillRect(44, 0, 6, 512);
  g.fillRect(78, 0, 6, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Town {
  constructor(camp) {
    this.camp = camp;
    this.villagers = [];
  }

  build(S, glowTexture) {
    const C = this.camp;
    const T = TOWN;
    // Grass beyond the camp, the road, and the square's worn ground.
    const outer = new THREE.Mesh(new THREE.RingGeometry(59, 170, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c2615, roughness: 1 }));
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    S.add(outer);
    const roadLen = T.z - 10;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.halfWidth * 2.6, roadLen).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: roadTexture(), transparent: true, roughness: 1, depthWrite: false }));
    road.material.map.repeat.set(1, roadLen / 12);
    road.position.set(0, 0.02, 10 + roadLen / 2 - 6);
    road.receiveShadow = true;
    S.add(road);
    const square = new THREE.Mesh(new THREE.CircleGeometry(T.r + 5, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dirtTexture(), transparent: true, roughness: 1, depthWrite: false }));
    square.position.set(T.x, 0.015, T.z);
    square.receiveShadow = true;
    S.add(square);
    const at = (dx, dz) => [T.x + dx, T.z + dz];
    const face = (x, z) => Math.atan2(T.x - x, T.z - z);
    const house = models.townHouse ? 'townHouse' : 'tent';
    // The cottage for sale, and the townhouses around the square.
    {
      const [x, z] = at(-13, -3);
      C.building(models.cottage ? 'cottage' : 'tent', 5.2, x, z, 'cottage', profile.house ? 'Your Cottage' : 'Cottage for Sale', 2.8);
      this.cottageSpot = C.spots[C.spots.length - 1];
      this.sign = canvasSprite((g, w, h) => {
        g.fillStyle = 'rgba(40,24,10,0.85)';
        g.fillRect(0, 20, w, h - 40);
        g.strokeStyle = '#d8a23a';
        g.lineWidth = 6;
        g.strokeRect(4, 24, w - 8, h - 48);
        g.font = '800 40px Cinzel, Georgia, serif';
        g.textAlign = 'center';
        g.fillStyle = '#ffd27a';
        g.fillText(profile.house ? 'HOME' : 'FOR SALE', w / 2, h / 2 + 14);
      }, 256, 128, [1.8, 0.9]);
      this.sign.position.set(x + 2.6, 2.4, z + 1.2);
      S.add(this.sign);
    }
    for (const [dx, dz, size] of [
      [12, -7, 6],
      [15, 6, 6.5],
      [-13, 10, 6],
      [-4, 15, 6.5],
      [8, 15, 6],
    ]) {
      const [x, z] = at(dx, dz);
      C.prop(house, size, x, z, face(x, z), 2.6);
    }
    // Market stalls, the well, barrels and crates, lanterns.
    for (const [id, size, dx, dz, col] of [
      ['merchantStall', 3.4, 6, -4, 1.5],
      ['merchantStall', 3.4, -6, 4, 1.5],
      ['springWell', 1.8, 0, 2, 1.2],
      ['barrel', 1.1, 9, -2, 0.5],
      ['crates', 1.2, -8, 1, 0.6],
      ['barrel', 1.0, -3, 10, 0.45],
      ['crates', 1.1, 4, 10, 0.6],
      ['signpost', 2.2, 2.5, -15, 0.4],
    ]) {
      const [x, z] = at(dx, dz);
      C.prop(id, size, x, z, face(x, z), col);
    }
    for (const [dx, dz] of [
      [-4, -12],
      [4, -12],
      [-10, -6],
      [10, 1],
      [-9, 5],
      [3, 6],
      [-1, -4],
      [-4.6, 40 - T.z],
      [4.6, 30 - T.z],
    ]) {
      const [x, z] = at(dx, dz);
      C.prop('lantern', 2.0, x, z, Math.random() * 6, 0.25);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb066, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(x, 1.85, z);
      glow.scale.setScalar(1.6);
      S.add(glow);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x6a4020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.position.set(x, 0.03, z);
      S.add(pool);
    }
    // A fence round the town, open toward the road.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.3) continue;
      C.prop('fence', 1.0, T.x + Math.cos(a) * (T.r + 0.6), T.z + Math.sin(a) * (T.r + 0.6), -a, 0, { axis: 'x', size: 2.6 });
    }
    // Trees around the town and along the road.
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(T.r + 4, T.r + 14);
      const x = T.x + Math.cos(a) * d;
      const z = T.z + Math.sin(a) * d;
      if (z < T.z - T.r + 2 && Math.abs(x) < 8) continue;
      C.prop(Math.random() < 0.6 ? 'deadTree' : 'rocks', Math.random() < 0.6 ? rand(4, 7) : rand(1, 2.5), x, z, Math.random() * 6, 0);
    }
    for (let z = 28; z < T.z - T.r; z += 7) {
      for (const side of [-1, 1]) C.prop(Math.random() < 0.5 ? 'deadTree' : 'rocks', Math.random() < 0.5 ? rand(4, 6) : rand(1, 2), side * rand(6, 9), z + rand(-2, 2), Math.random() * 6, 0);
    }
    this.unlockGroup = new THREE.Group();
    S.add(this.unlockGroup);
    this.refreshUnlocks();
    this.spawnVillagers(S);
  }

  /** Things the town builds with your donations. */
  refreshUnlocks() {
    this.unlockGroup.clear();
    const u = profile.townUnlocks || {};
    const add = (id, size, dx, dz, rot = 0) => {
      const p = spawnProp(id, size);
      if (!p) return;
      p.position.set(TOWN.x + dx, 0, TOWN.z + dz);
      p.rotation.y = rot;
      this.unlockGroup.add(p);
    };
    if (u.oven) add('forgeBrazier', 1.4, 10, -1.5);
    if (u.tower) add('watchtower', 6.5, -6, -17, 0.4);
  }

  spawnVillagers(S) {
    for (const v of VILLAGERS) {
      const id = models[v.id] ? v.id : 'bandit';
      const inst = instantiate(id, 1.75);
      if (!inst) continue;
      const home = new THREE.Vector3(TOWN.x + v.home[0], 0, TOWN.z + v.home[1]);
      inst.holder.position.copy(home);
      S.add(inst.holder);
      const A = inst.animator;
      if (A?.has('idle')) A.set(['idle'], { fade: 0 });
      A?.update(Math.random() * 2);
      const marker = canvasSprite(() => {}, 128, 128, [0.9, 0.9]);
      marker.position.y = 2.5;
      inst.holder.add(marker);
      const tag = canvasSprite((g, w, h) => {
        g.textAlign = 'center';
        g.font = '800 34px Cinzel, Georgia, serif';
        g.lineWidth = 7;
        g.strokeStyle = 'rgba(0,0,0,0.85)';
        g.strokeText(v.name, w / 2, 50);
        g.fillStyle = '#fff3d6';
        g.fillText(v.name, w / 2, 50);
      }, 512, 80, [2.6, 0.4]);
      tag.position.y = 2.05;
      inst.holder.add(tag);
      const spot = { kind: 'npc', npc: v.id, label: v.name, x: home.x, z: home.z };
      this.camp.spots.push(spot);
      this.villagers.push({ v, inst, A, home, pos: home.clone(), target: home.clone(), wait: rand(1, 4), marker, markerKey: null, spot, greeted: false, yaw: 0 });
    }
    this.refreshMarkers();
  }

  /** Redraw the '!' / '?' over each villager's head. */
  refreshMarkers() {
    for (const n of this.villagers) {
      const key = markerFor(n.v.id);
      if (key === n.markerKey) continue;
      n.markerKey = key;
      const c = n.marker.material.map.image;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      if (key) {
        g.textAlign = 'center';
        g.font = '900 104px Georgia, serif';
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(40,20,0,0.9)';
        g.strokeText(key, 64, 104);
        g.fillStyle = key === '?' ? '#7fe0a0' : '#ffd23a';
        g.fillText(key, 64, 104);
      }
      n.marker.material.map.needsUpdate = true;
    }
  }

  /** Villagers stroll about the square, and stop to face you when you come close. */
  update(dt, playerPos, time) {
    for (const n of this.villagers) {
      const toPlayer = Math.hypot(playerPos.x - n.pos.x, playerPos.z - n.pos.z);
      let moving = false;
      if (toPlayer < 3.2) {
        const want = Math.atan2(playerPos.x - n.pos.x, playerPos.z - n.pos.z);
        n.yaw += Math.atan2(Math.sin(want - n.yaw), Math.cos(want - n.yaw)) * (1 - Math.exp(-6 * dt));
        if (!n.greeted && n.A?.has('greet')) {
          n.greeted = true;
          n.A.set(['greet'], { once: true, fade: 0.2 });
          n.greetT = 2.2;
        }
      } else {
        if (toPlayer > 6) n.greeted = false;
        n.wait -= dt;
        const d = Math.hypot(n.target.x - n.pos.x, n.target.z - n.pos.z);
        if (d > 0.2 && n.wait <= 0) {
          moving = true;
          const sx = (n.target.x - n.pos.x) / d;
          const sz = (n.target.z - n.pos.z) / d;
          n.pos.x += sx * 1.1 * dt;
          n.pos.z += sz * 1.1 * dt;
          const want = Math.atan2(sx, sz);
          n.yaw += Math.atan2(Math.sin(want - n.yaw), Math.cos(want - n.yaw)) * (1 - Math.exp(-5 * dt));
        } else if (n.wait <= 0) {
          // Pick somewhere nearby to wander to next.
          const a = Math.random() * Math.PI * 2;
          const r = rand(0.5, 3.2);
          n.target.set(n.home.x + Math.cos(a) * r, 0, n.home.z + Math.sin(a) * r);
          n.wait = rand(2, 6);
        }
      }
      n.greetT = Math.max(0, (n.greetT || 0) - dt);
      if (n.A && !n.greetT) n.A.set([moving && n.A.has('walk') ? 'walk' : 'idle'], { fade: 0.25 });
      n.A?.update(dt);
      n.inst.holder.position.copy(n.pos);
      n.inst.holder.rotation.y = n.yaw;
      n.marker.position.y = 2.5 + Math.sin(time * 3 + n.home.x) * 0.08;
      n.spot.x = n.pos.x;
      n.spot.z = n.pos.z;
    }
  }

  /** The cottage's sign and label once you own it. */
  setOwned() {
    if (this.cottageSpot) this.cottageSpot.label = 'Your Cottage';
    const c = this.sign?.material.map.image;
    if (!c) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(40,24,10,0.85)';
    g.fillRect(0, 20, c.width, c.height - 40);
    g.strokeStyle = '#d8a23a';
    g.lineWidth = 6;
    g.strokeRect(4, 24, c.width - 8, c.height - 48);
    g.font = '800 40px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.fillStyle = '#ffd27a';
    g.fillText('HOME', c.width / 2, c.height / 2 + 14);
    this.sign.material.map.needsUpdate = true;
  }

  dispose() {
    for (const n of this.villagers) disposeInstance(n.inst);
  }
}
