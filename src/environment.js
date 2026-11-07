// Dresses the arena once the Meshy models have loaded: ruined architecture,
// braziers with fire, props, statues, trees, grass, mist and light shafts.
// Collision stays simple (circles in `pillars`, arena bounds), so this is
// mostly visual. If the models are missing, the basic arena from world.js stays.

import * as THREE from 'three';
import { ARENA_HALF, pillars } from './world.js';
import { models, spawnProp } from './models.js';

const rand = (a, b) => a + Math.random() * (b - a);
const faceCenter = (x, z) => Math.atan2(-x, -z);

/** Gate positions just inside the far archways; grunts spawn here. */
export const spawnGates = [];

/**
 * Arena themes. Each run descends through them: every boss beaten opens the
 * gate to the next one. Ids name Meshy props; anything missing falls back.
 */
export const THEMES = [
  {
    name: 'Sunken Ruins',
    pillar: 'pillar',
    broken: 'pillarBroken',
    brazier: 'brazier',
    wall: 'wall',
    coverA: 'crates',
    coverB: 'barrel',
    decor: 'bones',
    decorSize: 0.45,
    statue: 'statue',
    tree: 'deadTree',
    banners: true,
    grass: [0.13, 0.2, 0.08, 0.25, 0.35, 0.1],
    floor: { hue: [22, 38], sat: [6, 16], light: [30, 44], base: '#211d19', accent: 'moss' },
    ground: 'grass',
    fog: 0x0f1216,
    bg: 0x0d1014,
    rim: 0x8fb0ff,
    hemi: [0xb8c8ff, 0x3a2a1c, 0.8],
    sun: [0xffdcb0, 2.2],
    fireLight: 0xff8a3c,
    ember: [3, 1.2, 0.25],
    embers: { color: [2.2, 1.0, 0.4], speed: 0.35 },
    mist: 0x9aa6b8,
    rune: [1.4, 1.4, 1.4],
  },
  {
    name: 'Frozen Crypt',
    pillar: 'icePillar',
    broken: 'iceCrystals',
    brazier: 'iceBrazier',
    wall: 'iceWall',
    coverA: 'sarcophagus',
    coverB: 'iceCrystals',
    decor: 'iceCrystals',
    decorSize: 0.7,
    statue: 'statue',
    tree: 'iceCrystals',
    treeScale: 0.5,
    banners: false,
    grass: [0.55, 0.65, 0.75, 0.85, 0.92, 1.0],
    floor: { hue: [195, 215], sat: [10, 22], light: [34, 50], base: '#1a2028', accent: 'frost' },
    ground: 'snow',
    fog: 0x121a24,
    bg: 0x0c121a,
    rim: 0xb0d8ff,
    hemi: [0xcfe4ff, 0x202838, 1.0],
    sun: [0xd8ecff, 1.9],
    fireLight: 0x6ec8ff,
    ember: [1.2, 2.2, 3],
    embers: { color: [1.6, 1.8, 2.2], speed: -0.6 }, // falling snow
    mist: 0xc8dcf0,
    rune: [0.9, 1.6, 2.4],
  },
  {
    name: 'Infernal Forge',
    pillar: 'lavaPillar',
    broken: 'anvil',
    brazier: 'forgeBrazier',
    wall: 'forgeWall',
    coverA: 'anvil',
    coverB: 'explosiveBarrel',
    decor: 'rocks',
    decorSize: 0.6,
    statue: 'demonIdol',
    tree: 'rocks',
    treeScale: 0.35,
    banners: false,
    grass: null,
    floor: { hue: [8, 20], sat: [10, 25], light: [16, 28], base: '#120c0a', accent: 'lava' },
    ground: 'ash',
    fog: 0x1a0c08,
    bg: 0x120806,
    rim: 0xff9a60,
    hemi: [0xffb08a, 0x2a0e06, 0.7],
    sun: [0xffa070, 1.6],
    fireLight: 0xff6a20,
    ember: [3, 1.0, 0.2],
    embers: { color: [3, 1.2, 0.3], speed: 0.9 },
    mist: 0x6a3a2a,
    rune: [2.6, 0.9, 0.4],
  },
];

export class Environment {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;
    this.fires = [];
    this.mists = [];
    this.fadeable = [];
    this.time = 0;
    this.active = false;
    this.themeIndex = 0;
    this.root = new THREE.Group();
    this.scene.add(this.root);
  }

  get theme() {
    return THEMES[this.themeIndex % THEMES.length];
  }

  /** Pick a theme's prop id, falling back to the first arena's if it isn't generated yet. */
  id(key) {
    const want = this.theme[key];
    return models[want] ? want : THEMES[0][key];
  }

  /** Dress the arena in a theme (clears any previous dressing first). */
  build(themeIndex = this.themeIndex) {
    if (!models.pillar) return false;
    if (this.basePillars == null) this.basePillars = pillars.length;
    this.clear();
    this.themeIndex = themeIndex;
    this.active = true;
    this.lighting();
    this.floor();
    this.architecture();
    this.props();
    this.outskirts();
    this.grass();
    this.runeCircle();
    this.mist();
    this.lightShafts();
    return true;
  }

  clear() {
    this.root.clear();
    if (this.basePillars != null) pillars.length = this.basePillars;
    this.fires = [];
    this.mists = [];
    this.fadeable = [];
    this.windUniform = null;
    this.runeMat = null;
  }

  place(id, size, x, z, rotY = 0, opts = {}) {
    // Props outside the walls sit beyond the shadow camera's useful area: skip their shadow pass.
    const outside = Math.abs(x) > ARENA_HALF + 2 || Math.abs(z) > ARENA_HALF + 2;
    const p = spawnProp(id, size, outside ? { ...opts, shadows: false } : opts);
    if (!p) return null;
    // Tall props can stand between the camera and the hero; those fade out when they do.
    if (size > 1.6) this.fadeable.push(p);
    p.position.set(x, opts.y || 0, z);
    p.rotation.y = rotY;
    if (opts.scale) p.scale.set(...opts.scale);
    this.root.add(p);
    return p;
  }

  lighting() {
    // Cool moonlight from behind the action: rim-lights characters against the floor.
    const T = this.theme;
    const rim = new THREE.DirectionalLight(T.rim, 0.9);
    rim.position.set(-14, 10, -18);
    this.root.add(rim);
    this.scene.fog.color.set(T.fog);
    this.scene.background.set(T.bg);
    const W = this.world;
    W.hemi.color.set(T.hemi[0]);
    W.hemi.groundColor.set(T.hemi[1]);
    W.hemi.intensity = T.hemi[2];
    W.sun.color.set(T.sun[0]);
    W.sun.intensity = T.sun[1];
    for (const t of W.torches) t.light.color.set(T.fireLight);
    W.embers.material.color.setRGB(...T.embers.color);
    W.emberSpeed = T.embers.speed;
  }

  floor() {
    const { map, normalMap, emissiveMap } = floorTextures(this.theme.floor);
    const mat = this.world.floor.material;
    mat.map = map;
    mat.normalMap = normalMap;
    // Forge floors glow along their cracks.
    mat.emissiveMap = emissiveMap || null;
    mat.emissive = new THREE.Color(emissiveMap ? 0xff5a10 : 0x000000);
    mat.emissiveIntensity = emissiveMap ? 1.1 : 0;
    mat.normalScale.set(1.2, 1.2);
    mat.roughness = 0.9;
    mat.needsUpdate = true;
    const out = this.world.outside.material;
    out.map = grassTexture(this.theme.ground);
    out.color.set(0xffffff);
    out.needsUpdate = true;
  }

  architecture() {
    const W = this.world;
    // Swap placeholder pillars for the rune pillars and broken stumps.
    for (const { group, layout } of W.pillarGroups) {
      group.visible = false;
      if (layout.h > 2) this.place(this.id('pillar'), layout.h + 0.6, layout.x, layout.z, faceCenter(layout.x, layout.z));
      else this.place(this.id('broken'), layout.h + 0.5, layout.x, layout.z, Math.random() * Math.PI * 2);
    }
    // Torches become braziers standing in front of each pillar, toward the center.
    for (const t of W.torches) {
      t.holder.visible = false;
      t.flame.visible = false;
      const p = t.pillar;
      const x = p.x + t.dir.x * 1.9;
      const z = p.z + t.dir.z * 1.9;
      this.place(this.id('brazier'), 1.25, x, z, Math.random() * Math.PI * 2);
      t.light.position.set(x, 2.1, z);
      t.base = 24;
      t.light.distance = 14;
      pillars.push({ x, z, r: 0.6, h: 1.2 });
      this.fires.push({ pos: new THREE.Vector3(x, 1.2, z) });
      t.base = this.themeIndex === 2 ? 30 : 24;
    }

    // Walls: tall ruined walls on the two far sides, gates in the middle.
    for (const m of W.wallMeshes) m.visible = false;
    const seg = 6;
    const wallLen = 6.3;
    const edge = ARENA_HALF + 1.4;
    for (let i = 0; i < 5; i++) {
      const t = -ARENA_HALF + seg * (i + 0.5);
      if (i === 2) {
        // Archway gates (far -Z and far -X sides).
        this.place('archway', 5, 0, -ARENA_HALF - 0.8, 0);
        this.place('archway', 5, -ARENA_HALF - 0.8, 0, Math.PI / 2);
        continue;
      }
      this.place(this.id('wall'), wallLen, t, -edge, i % 2 ? Math.PI : 0, { axis: 'x' });
      this.place(this.id('wall'), wallLen, -edge, t, Math.PI / 2 + (i % 2 ? Math.PI : 0), { axis: 'x' });
    }
    spawnGates.length = 0;
    spawnGates.push({ x: 0, z: -ARENA_HALF + 1.6 }, { x: -ARENA_HALF + 1.6, z: 0 });

    // Camera-side edges: a low border of mossy rubble so it never hides the fight.
    for (let i = 0; i < 9; i++) {
      const t = -ARENA_HALF + 1.5 + i * 3.5 + rand(-0.6, 0.6);
      this.place('rocks', rand(0.7, 1.2), t, ARENA_HALF + 1.1 + rand(0, 0.5), Math.random() * 6.3);
      this.place('rocks', rand(0.7, 1.2), ARENA_HALF + 1.1 + rand(0, 0.5), t, Math.random() * 6.3);
    }
  }

  props() {
    const H = ARENA_HALF;
    // Cover near the corners (they block arrows like pillars do).
    const A = this.id('coverA');
    const B = this.themeIndex === 2 ? 'barrel' : this.id('coverB'); // forge barrels explode: those are hazards, not cover
    const cover = [
      [A, 1.8, -H + 1.6, -H + 1.6, 0.95],
      [B, 1.1, -H + 3.6, -H + 1.2, 0.5],
      [B, 1.1, H - 1.6, -H + 1.4, 0.5],
      [B, 1.0, H - 2.8, -H + 1.2, 0.5],
      [A, 1.6, -H + 1.3, H - 2.4, 0.85],
      ['rocks', 1.3, H - 2.6, H - 2.8, 1.1],
    ];
    for (const [id, size, x, z, r] of cover) {
      this.place(id, size, x, z, Math.random() * Math.PI * 2);
      pillars.push({ x, z, r, h: size });
    }
    // Banners on the far walls, facing the arena.
    for (const s of this.theme.banners ? [-8.5, 8.5] : []) {
      const a = this.place('banner', 4.4, s, -H + 0.45, 0);
      const b = this.place('banner', 4.4, -H + 0.45, s, Math.PI / 2);
      for (const o of [a, b]) {
        o?.traverse((m) => {
          if (m.isMesh) m.material.side = THREE.DoubleSide;
        });
      }
    }
    // Bone piles: decoration only.
    for (const [x, z] of [
      [3.4, -H + 1.4],
      [-H + 1.4, 3.2],
      [-H + 1.2, -6],
    ]) {
      this.place(this.id('decor'), this.theme.decorSize, x, z, Math.random() * 6.3, { shadows: false });
    }
  }

  outskirts() {
    // Statues watch from the corners; dead trees and boulders fill the dark beyond.
    for (const [x, z] of [
      [-H2(), -H2()],
      [H2() + 0.5, -H2()],
      [-H2(), H2() + 0.5],
    ]) {
      this.place(this.id('statue'), 5.2, x, z, faceCenter(x, z));
    }
    const trees = [
      [-22, -9, 6.5],
      [-9, -22, 7],
      [11, -22.5, 6],
      [-22.5, 9, 6.2],
      [21, -12, 5.5],
      [-13, 21, 5.5],
    ];
    for (const [x, z, h] of trees) this.place(this.id('tree'), h * (this.theme.treeScale || 1), x, z, Math.random() * 6.3);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(19, 27);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (x > 10 && z > 10) continue; // keep the camera side clear
      this.place('rocks', rand(0.8, 2.2), x, z, Math.random() * 6.3);
    }
    // The old placeholder cones and boulders are no longer needed.
    for (const m of this.world.decor) m.visible = false;
  }

  grass() {
    const G = this.theme.grass;
    if (!G) return;
    // Instanced crossed quads that sway in the wind.
    const blade = new THREE.PlaneGeometry(0.16, 0.6, 1, 3).translate(0, 0.3, 0);
    const cross = mergeCross(blade);
    const colors = [];
    const pos = cross.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 0.6;
      colors.push(G[0] + (G[3] - G[0]) * t, G[1] + (G[4] - G[1]) * t, G[2] + (G[5] - G[2]) * t);
    }
    cross.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    this.windUniform = { value: 0 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = this.windUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float sway = sin(uWind * 1.7 + ip.x * 0.35 + ip.z * 0.25) * 0.12 + sin(uWind * 3.1 + ip.z) * 0.04;
           transformed.x += sway * position.y * 1.6;
           transformed.z += sway * position.y * 0.8;`,
        );
    };
    const count = 2600;
    const mesh = new THREE.InstancedMesh(cross, mat, count);
    const d = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const x = rand(-30, 30);
      const z = rand(-30, 30);
      if (Math.abs(x) < ARENA_HALF + 2.2 && Math.abs(z) < ARENA_HALF + 2.2) continue;
      d.position.set(x, 0, z);
      d.rotation.y = Math.random() * Math.PI;
      d.scale.setScalar(rand(0.7, 1.6));
      d.updateMatrix();
      mesh.setMatrixAt(n++, d.matrix);
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  runeCircle() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.translate(256, 256);
    g.strokeStyle = 'rgba(120,255,230,0.9)';
    g.lineWidth = 6;
    for (const r of [240, 200]) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 3;
    // Rune glyphs between the rings.
    for (let i = 0; i < 24; i++) {
      g.save();
      g.rotate((i / 24) * Math.PI * 2);
      g.translate(0, -220);
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        g.moveTo(rand(-9, 9), rand(-12, 12));
        g.lineTo(rand(-9, 9), rand(-12, 12));
      }
      g.stroke();
      g.restore();
    }
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 * 2; // star by skipping points
      const p = [Math.sin(a) * 190, -Math.cos(a) * 190];
      i ? g.lineTo(...p) : g.moveTo(...p);
    }
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.runeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(...this.theme.rune),
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), this.runeMat);
    m.position.y = 0.025;
    m.renderOrder = 0;
    this.root.add(m);
  }

  mist() {
    const tex = noiseTexture();
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex.clone(),
        transparent: true,
        opacity: rand(0.08, 0.16),
        depthWrite: false,
        color: this.theme.mist,
      });
      mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.needsUpdate = true;
      const size = rand(18, 30);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
      // Keep the mist outside the walls so the arena floor stays crisp.
      const a = (i / 7) * Math.PI * 2;
      const d = rand(19, 26);
      m.position.set(Math.cos(a) * d, 0.12 + i * 0.04, Math.sin(a) * d);
      m.renderOrder = 3;
      this.root.add(m);
      this.mists.push({ mat, speed: rand(0.004, 0.012), dir: rand(0, Math.PI * 2) });
    }
  }

  lightShafts() {
    // Soft additive cones: moonlight falling through the gloom.
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    for (const [x, z, r] of [
      [-4, -6, 2.6],
      [6, 2, 2.1],
      [-9, 7, 1.8],
    ]) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0x9fc0ff,
        transparent: true,
        opacity: 0.035,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.7, 16, 20, 1, true), mat);
      cone.position.set(x + 3, 8, z + 4);
      cone.rotation.set(0.25, 0, -0.18);
      this.root.add(cone);
    }
  }

  /** Fade props that sit between the camera and the hero. */
  updateOcclusion(dt) {
    const cam = this.game.camera.position;
    const hero = this.game.player.pos;
    const toCam = new THREE.Vector3(cam.x - hero.x, 0, cam.z - hero.z).normalize();
    const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
    for (const p of this.fadeable) {
      const dx = p.position.x - hero.x;
      const dz = p.position.z - hero.z;
      const ahead = dx * toCam.x + dz * toCam.z; // how far toward the camera
      const lateral = Math.abs(dx * side.x + dz * side.z);
      const hide = ahead > 0.3 && ahead < 9 && lateral < 2.2;
      const target = hide ? 0.25 : 1;
      const cur = p.userData.fade ?? 1;
      const next = cur + (target - cur) * Math.min(1, dt * 8);
      if (Math.abs(next - cur) < 1e-3 && next === cur) continue;
      p.userData.fade = next;
      p.traverse((m) => {
        if (!m.isMesh) return;
        if (!m.userData.fadeMat) {
          m.material = m.material.clone();
          m.userData.fadeMat = true;
        }
        m.material.transparent = next < 0.99;
        m.material.opacity = next;
        m.material.depthWrite = next > 0.99;
        m.castShadow = true;
      });
    }
  }

  update(dt, time) {
    if (!this.active) return;
    this.time += dt;
    this.updateOcclusion(dt);
    if (this.windUniform) this.windUniform.value = time;
    if (this.runeMat) this.runeMat.opacity = 0.28 + 0.08 * Math.sin(time * 1.3);
    for (const m of this.mists) {
      m.mat.map.offset.x += Math.cos(m.dir) * m.speed * dt;
      m.mat.map.offset.y += Math.sin(m.dir) * m.speed * dt;
    }
    // Brazier embers and smoke.
    const P = this.game.particles;
    for (const f of this.fires) {
      if (Math.random() < dt * 14) {
        P.spawn(f.pos.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0.1, rand(-0.3, 0.3))), {
          count: 1,
          color: this.theme.ember,
          speed: 0.4,
          up: 2.8,
          life: 0.9,
          size: 0.06,
          gravity: -1.5,
          drag: 0.5,
        });
      }
      if (Math.random() < dt * 4) {
        P.spawn(f.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), {
          count: 1,
          color: 0x2b2a2a,
          speed: 0.2,
          up: 1.2,
          life: 1.6,
          size: 0.22,
          gravity: -0.6,
          drag: 0.3,
        });
      }
    }
  }
}

function H2() {
  return ARENA_HALF + 3.2;
}

function mergeCross(geo) {
  const a = geo.clone();
  const b = geo.clone().rotateY(Math.PI / 2);
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const nrm = [...a.attributes.normal.array, ...b.attributes.normal.array];
  const idxA = [...a.index.array];
  const off = a.attributes.position.count;
  const idx = [...idxA, ...[...b.index.array].map((i) => i + off)];
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}

/** Flagstone floor: color map plus a normal map derived from a height map. */
function floorTextures(pal = THEMES[0].floor) {
  const size = 1024;
  const tiles = 6;
  const ts = size / tiles;
  const color = document.createElement('canvas');
  const height = document.createElement('canvas');
  color.width = color.height = height.width = height.height = size;
  const gc = color.getContext('2d');
  const gh = height.getContext('2d');
  gc.fillStyle = pal.base;
  gc.fillRect(0, 0, size, size);
  gh.fillStyle = '#000';
  gh.fillRect(0, 0, size, size);
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      // Slightly irregular stones with bevelled edges.
      const j = () => rand(-5, 5);
      const x0 = x * ts + 5 + j();
      const y0 = y * ts + 5 + j();
      const w = ts - 10 + j();
      const h = ts - 10 + j();
      const hue = rand(pal.hue[0], pal.hue[1]);
      const l = rand(pal.light[0], pal.light[1]);
      gc.fillStyle = `hsl(${hue}, ${rand(pal.sat[0], pal.sat[1])}%, ${l}%)`;
      roundRect(gc, x0, y0, w, h, 10);
      gc.fill();
      for (let k = 6; k > 0; k--) {
        gh.fillStyle = `rgb(${255 - k * 30},${255 - k * 30},${255 - k * 30})`;
        roundRect(gh, x0 + (6 - k) * 2, y0 + (6 - k) * 2, w - (6 - k) * 4, h - (6 - k) * 4, 10);
        gh.fill();
      }
      // Grain, stains and wear.
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * 0.12;
        gc.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,240,220,${a * 0.5})`;
        const px = x0 + Math.random() * w;
        const py = y0 + Math.random() * h;
        gc.fillRect(px, py, rand(1, 4), rand(1, 4));
      }
      if (Math.random() < 0.4) {
        // Crack (dark in color, a groove in height).
        let cx = x0 + Math.random() * w;
        let cy = y0 + Math.random() * h;
        gc.strokeStyle = 'rgba(15,10,8,0.6)';
        gh.strokeStyle = 'rgba(40,40,40,1)';
        gc.lineWidth = gh.lineWidth = 2;
        gc.beginPath();
        gh.beginPath();
        gc.moveTo(cx, cy);
        gh.moveTo(cx, cy);
        for (let k = 0; k < 5; k++) {
          cx += rand(-24, 24);
          cy += rand(-24, 24);
          gc.lineTo(cx, cy);
          gh.lineTo(cx, cy);
        }
        gc.stroke();
        gh.stroke();
      }
      if (Math.random() < 0.25) {
        // Moss creeping in from an edge.
        const mx = x0 + (Math.random() < 0.5 ? 0 : w);
        const my = y0 + Math.random() * h;
        const grad = gc.createRadialGradient(mx, my, 0, mx, my, rand(20, 50));
        const tint = pal.accent === 'frost' ? '220,235,255' : pal.accent === 'lava' ? '40,20,14' : '70,95,40';
        grad.addColorStop(0, `rgba(${tint},0.55)`);
        grad.addColorStop(1, `rgba(${tint},0)`);
        gc.fillStyle = grad;
        gc.fillRect(mx - 60, my - 60, 120, 120);
      }
    }
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.5, 2.5);
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(heightToNormal(gh, size, 3));
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.copy(map.repeat);
  normalMap.anisotropy = 8;
  let emissiveMap = null;
  if (pal.accent === 'lava') {
    // Molten seams between the flagstones plus a few glowing cracks.
    const em = document.createElement('canvas');
    em.width = em.height = size;
    const ge = em.getContext('2d');
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, size, size);
    ge.strokeStyle = 'rgba(255,150,60,0.9)';
    ge.shadowColor = 'rgba(255,90,20,1)';
    ge.shadowBlur = 10;
    ge.lineWidth = 3;
    // Only some stone edges glow, in short broken runs, so it reads as seams of lava, not a grid.
    for (let i = 0; i <= tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        for (const vertical of [true, false]) {
          if (Math.random() > 0.22) continue;
          const a = j * ts + rand(0, ts * 0.3);
          const b = a + rand(ts * 0.3, ts * 0.7);
          ge.beginPath();
          if (vertical) {
            ge.moveTo(i * ts, a);
            ge.lineTo(i * ts, b);
          } else {
            ge.moveTo(a, i * ts);
            ge.lineTo(b, i * ts);
          }
          ge.stroke();
        }
      }
    }
    ge.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      let cx = Math.random() * size;
      let cy = Math.random() * size;
      ge.beginPath();
      ge.moveTo(cx, cy);
      for (let j = 0; j < 6; j++) {
        cx += rand(-30, 30);
        cy += rand(-30, 30);
        ge.lineTo(cx, cy);
      }
      ge.stroke();
    }
    emissiveMap = new THREE.CanvasTexture(em);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
    emissiveMap.repeat.copy(map.repeat);
  }
  return { map, normalMap, emissiveMap };
}

function heightToNormal(ctx, size, strength) {
  const src = ctx.getImageData(0, 0, size, size).data;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const og = out.getContext('2d');
  const img = og.createImageData(size, size);
  const hAt = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

function grassTexture(kind = 'grass') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const look = {
    grass: { base: '#1f2a17', h: [70, 110], s: [25, 45], l: [10, 24] },
    snow: { base: '#b8c6d4', h: [200, 220], s: [10, 25], l: [70, 92] },
    ash: { base: '#1a1412', h: [10, 30], s: [5, 20], l: [6, 18] },
  }[kind];
  g.fillStyle = look.base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `hsla(${rand(...look.h)}, ${rand(...look.s)}%, ${rand(...look.l)}%, 0.6)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 3), rand(2, 6));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  return t;
}

function noiseTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = rand(20, 70);
    for (const [ox, oy] of [
      [0, 0],
      [256, 0],
      [-256, 0],
      [0, 256],
      [0, -256],
    ]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
