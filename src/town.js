// The town down the road from camp: a square with a well, townhouses, market
// stalls, a cottage you can buy, and five villagers who wander about, turn to
// greet you, and give you tasks (a "!" over their head) or want them handed in
// (a "?"). Built into the camp's scene; the camp handles walking and screens.

import * as THREE from 'three';
import { spawnProp, instantiate, models, disposeInstance } from './models.js';
import { VILLAGERS, markerFor } from './quests.js';
import { profile } from './profile.js';

/**
 * The villages down the roads from camp. Each has a square (a circle you can
 * walk in), a road from the camp's edge, buildings, villagers and things it can
 * build with your donations.
 *   road 'z+' runs along +z from the camp; 'x+' along +x; 'x-' along -x.
 */
export const VILLAGES = [
  {
    id: 'oakvale',
    name: 'Oakvale',
    x: 0,
    z: 70,
    r: 21,
    road: 'z+',
    cottage: [-13, -3],
    buildings: [
      ['townHouse', 6, 12, -7, 2.6],
      ['townHouse', 6.5, 15, 6, 2.6],
      ['townHouse', 6, -13, 10, 2.6],
      ['townHouse', 6.5, -4, 15, 2.6],
      ['townHouse', 6, 8, 15, 2.6],
    ],
    props: [
      ['merchantStall', 3.4, 6, -4, 1.5],
      ['merchantStall', 3.4, -6, 4, 1.5],
      ['springWell', 1.8, 0, 2, 1.2],
      ['barrel', 1.1, 9, -2, 0.5],
      ['crates', 1.2, -8, 1, 0.6],
      ['barrel', 1.0, -3, 10, 0.45],
      ['crates', 1.1, 4, 10, 0.6],
    ],
    lanterns: [[-4, -12], [4, -12], [-10, -6], [10, 1], [-9, 5], [3, 6], [-1, -4]],
    unlocks: { oven: ['forgeBrazier', 1.4, 10, -1.5], tower: ['watchtower', 6.5, -6, -17] },
  },
  {
    id: 'millbrook',
    name: 'Millbrook',
    x: 72,
    z: 0,
    r: 19,
    road: 'x+',
    buildings: [
      ['windmill', 10, 6, -9, 3.2],
      ['barn', 7, -6, -10, 3.6],
      ['farmhouse', 6.5, 9, 8, 3],
      ['farmhouse', 6, -7, 10, 3],
    ],
    props: [
      ['springWell', 1.6, 0, 0, 1.1],
      ['fence', 2.6, 13, -2, 0, { axis: 'x' }],
      ['fence', 2.6, 13, 1, 0, { axis: 'x' }],
      ['crates', 1.2, -3, -5, 0.6],
      ['barrel', 1.1, 3, 4, 0.5],
      ['weaponPile', 1.0, -11, 2, 0.5],
    ],
    lanterns: [[-12, -3], [-12, 3], [4, -3], [-3, 5], [12, 3]],
    unlocks: { mill: [['crates', 1.3, 2, -4], ['crates', 1.1, 3.5, -5], ['barrel', 1.1, 1, -6]] },
  },
  {
    id: 'saltmere',
    name: 'Saltmere',
    x: -70,
    z: 0,
    r: 18,
    road: 'x-',
    lake: { x: -98, z: 0, r: 13 },
    buildings: [
      ['fishingHut', 4.5, -7, -10, 2.3],
      ['fishingHut', 4.5, -8, 9, 2.3],
      ['fishingHut', 4.2, 5, 11, 2.2],
      ['fishingHut', 4.2, 6, -11, 2.2],
    ],
    props: [
      ['dock', 11, -21, 0, 0, { rot: -Math.PI / 2, axis: 'h' }],
      ['rowboat', 3, -15, -6, 0.9, { axis: 'h' }],
      ['barrel', 1.0, -4, 3, 0.45],
      ['crates', 1.1, 2, -4, 0.6],
      ['lantern', 2.0, -16, 2.2, 0.25],
    ],
    lanterns: [[11, -3], [11, 3], [-2, -6], [-3, 6], [4, 1]],
    unlocks: { boats: [['rowboat', 3, -15, 6, -0.5, { axis: 'h' }], ['rowboat', 2.8, -13, -9, 1.6, { axis: 'h' }], ['lantern', 2.0, -16, -2.2]] },
  },
];
export const villageById = (id) => VILLAGES.find((v) => v.id === id);

const CAMP_EDGE = 20; // roads start a little inside the camp's 25 m fence
const ROAD_HALF = 3.2;
/** The road's walkable rectangle for a village: { x0, x1, z0, z1 }. */
function roadRect(v) {
  if (v.road === 'z+') return { x0: v.x - ROAD_HALF, x1: v.x + ROAD_HALF, z0: CAMP_EDGE, z1: v.z - v.r + 6 };
  if (v.road === 'x+') return { x0: CAMP_EDGE, x1: v.x - v.r + 6, z0: v.z - ROAD_HALF, z1: v.z + ROAD_HALF };
  return { x0: v.x + v.r - 6, x1: -CAMP_EDGE, z0: v.z - ROAD_HALF, z1: v.z + ROAD_HALF };
}
export const ROADS = VILLAGES.map(roadRect);

/** Is (x, z) on a road or in a village square (shrunk by r)? */
export function inVillages(x, z, r = 0) {
  for (const q of ROADS) if (x > q.x0 + r && x < q.x1 - r && z > q.z0 + r && z < q.z1 - r) return true;
  for (const v of VILLAGES) if (Math.hypot(x - v.x, z - v.z) < v.r - r) return true;
  return false;
}

/** Nearest points on each road and square (for stepping back onto walkable ground). */
export function villageSnaps(x, z, r) {
  const out = [];
  for (const q of ROADS) out.push([Math.max(q.x0 + r, Math.min(q.x1 - r, x)), Math.max(q.z0 + r, Math.min(q.z1 - r, z))]);
  for (const v of VILLAGES) {
    const d = Math.hypot(x - v.x, z - v.z) || 1;
    out.push([v.x + ((x - v.x) / d) * (v.r - r), v.z + ((z - v.z) / d) * (v.r - r)]);
  }
  return out;
}

/** Angles (around the camp) where the camp fence opens for a road. */
export const ROAD_ANGLES = VILLAGES.map((v) => (v.road === 'z+' ? Math.PI / 2 : v.road === 'x+' ? 0 : Math.PI));

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
    // Grass beyond the camp, out to every village.
    const outer = new THREE.Mesh(new THREE.RingGeometry(59, 190, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c2615, roughness: 1 }));
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    S.add(outer);
    this.unlockGroup = new THREE.Group();
    S.add(this.unlockGroup);
    for (const v of VILLAGES) this.buildVillage(S, v, glowTexture);
    this.refreshUnlocks();
    this.spawnVillagers(S);
  }

  buildVillage(S, v, glowTexture) {
    const C = this.camp;
    const at = (dx, dz) => [v.x + dx, v.z + dz];
    const face = (x, z) => Math.atan2(v.x - x, v.z - z);
    // The road from camp, then the square's worn ground.
    const q = roadRect(v);
    const alongZ = v.road === 'z+';
    const len = (alongZ ? q.z1 - q.z0 : q.x1 - q.x0) + 10;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2.6, len).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: roadTexture(), transparent: true, roughness: 1, depthWrite: false }));
    road.material.map.repeat.set(1, len / 12);
    if (!alongZ) road.rotation.y = Math.PI / 2;
    road.position.set(alongZ ? v.x : (q.x0 + q.x1) / 2, 0.02, alongZ ? (q.z0 + q.z1) / 2 : v.z);
    road.receiveShadow = true;
    S.add(road);
    const square = new THREE.Mesh(new THREE.CircleGeometry(v.r + 5, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dirtTexture(), transparent: true, roughness: 1, depthWrite: false }));
    square.position.set(v.x, 0.015, v.z);
    square.receiveShadow = true;
    S.add(square);
    // A lake (Saltmere): still water with a darker rim.
    if (v.lake) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(v.lake.r, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a5a78, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.92 }));
      water.position.set(v.lake.x, 0.03, v.lake.z);
      S.add(water);
      const rim = new THREE.Mesh(new THREE.RingGeometry(v.lake.r, v.lake.r + 1.6, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3e2c, roughness: 1 }));
      rim.position.set(v.lake.x, 0.025, v.lake.z);
      S.add(rim);
      this.water = water;
    }
    // The cottage for sale (Oakvale).
    if (v.cottage) {
      const [x, z] = at(...v.cottage);
      C.building(models.cottage ? 'cottage' : 'tent', 5.2, x, z, 'cottage', profile.house ? 'Your Cottage' : 'Cottage for Sale', 2.8);
      this.cottageSpot = C.spots[C.spots.length - 1];
      this.sign = canvasSprite(() => {}, 256, 128, [1.8, 0.9]);
      this.sign.position.set(x + 2.6, 2.4, z + 1.2);
      S.add(this.sign);
      this.drawSign(profile.house ? 'HOME' : 'FOR SALE');
    }
    for (const [id, size, dx, dz, col] of v.buildings) {
      const [x, z] = at(dx, dz);
      C.prop(models[id] ? id : 'tent', size, x, z, face(x, z), col);
    }
    for (const [id, size, dx, dz, col, opts = {}] of v.props) {
      const [x, z] = at(dx, dz);
      C.prop(id, size, x, z, opts.rot ?? face(x, z), col, opts);
    }
    for (const [dx, dz] of v.lanterns) {
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
    // A fence round the village, open toward the road (and the lake).
    const toCamp = Math.atan2(-v.z, -v.x);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const off = (b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      if (off(toCamp) < 0.3) continue;
      if (v.lake && off(Math.atan2(v.lake.z - v.z, v.lake.x - v.x)) < 0.5) continue;
      C.prop('fence', 1.0, v.x + Math.cos(a) * (v.r + 0.6), v.z + Math.sin(a) * (v.r + 0.6), -a, 0, { axis: 'x', size: 2.6 });
    }
    // The village's name, on a signpost where the road arrives.
    const ex = v.x + Math.cos(toCamp) * (v.r + 2) + (alongZ ? 4.5 : 0);
    const ez = v.z + Math.sin(toCamp) * (v.r + 2) + (alongZ ? 0 : 4.5);
    C.prop('signpost', 2.4, ex, ez, toCamp + Math.PI / 2, 0);
    const name = canvasSprite((g, w, h) => {
      g.textAlign = 'center';
      g.font = '800 64px Cinzel, Georgia, serif';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(v.name.toUpperCase(), w / 2, 84);
      g.fillStyle = '#ffd27a';
      g.fillText(v.name.toUpperCase(), w / 2, 84);
    }, 768, 128, [5.4, 0.9]);
    name.position.set(ex, 3.4, ez);
    S.add(name);
    // Trees around the village and along its road.
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(v.r + 4, v.r + 14);
      const x = v.x + Math.cos(a) * d;
      const z = v.z + Math.sin(a) * d;
      if (Math.abs(Math.atan2(Math.sin(a - toCamp), Math.cos(a - toCamp))) < 0.5) continue;
      if (v.lake && Math.hypot(x - v.lake.x, z - v.lake.z) < v.lake.r + 3) continue;
      C.prop(Math.random() < 0.6 ? 'deadTree' : 'rocks', Math.random() < 0.6 ? rand(4, 7) : rand(1, 2.5), x, z, Math.random() * 6, 0);
    }
    const from = alongZ ? q.z0 + 6 : q.x0 + 4;
    const to = alongZ ? q.z1 - 4 : q.x1 - 6;
    for (let t = from; t < to; t += 7) {
      for (const side of [-1, 1]) {
        const off = side * rand(6, 9);
        const x = alongZ ? v.x + off : t + rand(-2, 2);
        const z = alongZ ? t + rand(-2, 2) : v.z + off;
        C.prop(Math.random() < 0.5 ? 'deadTree' : 'rocks', Math.random() < 0.5 ? rand(4, 6) : rand(1, 2), x, z, Math.random() * 6, 0);
      }
    }
  }

  /** Things the villages build with your donations. */
  refreshUnlocks() {
    this.unlockGroup.clear();
    const u = profile.townUnlocks || {};
    for (const v of VILLAGES) {
      for (const [key, spec] of Object.entries(v.unlocks || {})) {
        if (!u[key]) continue;
        const list = Array.isArray(spec[0]) ? spec : [spec];
        for (const [id, size, dx, dz, rot = Math.random() * 6, opts = {}] of list) {
          const p = spawnProp(id, size, opts);
          if (!p) continue;
          p.position.set(v.x + dx, 0, v.z + dz);
          p.rotation.y = rot;
          this.unlockGroup.add(p);
        }
      }
    }
  }

  drawSign(text) {
    const c = this.sign.material.map.image;
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
    g.fillText(text, c.width / 2, c.height / 2 + 14);
    this.sign.material.map.needsUpdate = true;
  }

  spawnVillagers(S) {
    for (const v of VILLAGERS) {
      const id = models[v.id] ? v.id : 'bandit';
      const inst = instantiate(id, 1.75);
      if (!inst) continue;
      const vil = villageById(v.village || 'oakvale');
      const home = new THREE.Vector3(vil.x + v.home[0], 0, vil.z + v.home[1]);
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
    if (this.sign) this.drawSign('HOME');
  }

  dispose() {
    for (const n of this.villagers) disposeInstance(n.inst);
  }
}
