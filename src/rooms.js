// Walkable building interiors. Going into a camp building takes the hero into
// a small room of its own: heroes on pedestals in the Hall, outfits on stands
// in the Tailor's tent, the merchant's goods on the counter, the smith at the
// anvil, racks in the Armory. Walk up to a station and press E to use it; the
// glowing doormat leads back out to camp.

import * as THREE from 'three';
import { spawnProp, instantiate, loadTexture, outfits, models, disposeInstance, disposeTree, findBone, attachProp } from './models.js';
import { Particles } from './fx.js';
import { CHARACTERS, OUTFITS, profile, outfitKey, requirementMet, currentCharacter } from './profile.js';
import { merchantStock, price } from './shops.js';
import { equipped, RARITIES, BOWS } from './gear.js';
import { makeBowParts } from './bow.js';
import { config } from './config.js';

const W = 8; // room half-width (x)
const D = 7; // room half-depth (z)
const FACE_CAMERA = Math.PI / 4; // the camera looks from +x,+z
const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ painted textures

const texCache = {};
function canvasTex(key, w, h, draw, repeat = null) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return (texCache[key] = t);
}

const speckle = (g, w, h, n, alpha = 0.08) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,240,220'},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
  }
};

const TEX = {
  stone: () =>
    canvasTex(
      'stone',
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#26221d';
        g.fillRect(0, 0, w, h);
        const n = 4;
        const s = w / n;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            const l = rand(22, 32);
            g.fillStyle = `hsl(${rand(28, 40)}, ${rand(8, 14)}%, ${l}%)`;
            g.fillRect(x * s + 4, y * s + 4, s - 8, s - 8);
            g.fillStyle = 'rgba(255,255,255,0.05)';
            g.fillRect(x * s + 4, y * s + 4, s - 8, 6);
          }
        speckle(g, w, h, 6000, 0.12);
      },
      [4, 3.5],
    ),
  wood: () =>
    canvasTex(
      'wood',
      512,
      512,
      (g, w, h) => {
        const rows = 8;
        const rh = h / rows;
        for (let y = 0; y < rows; y++) {
          let x = -rand(0, 200);
          while (x < w) {
            const len = rand(160, 320);
            g.fillStyle = `hsl(${rand(22, 30)}, ${rand(35, 48)}%, ${rand(20, 28)}%)`;
            g.fillRect(x, y * rh, len, rh);
            g.strokeStyle = 'rgba(0,0,0,0.25)';
            for (let k = 0; k < 4; k++) {
              g.beginPath();
              const yy = y * rh + rand(4, rh - 4);
              g.moveTo(x, yy);
              g.bezierCurveTo(x + len * 0.3, yy + rand(-3, 3), x + len * 0.6, yy + rand(-3, 3), x + len, yy);
              g.stroke();
            }
            g.fillStyle = 'rgba(0,0,0,0.6)';
            g.fillRect(x, y * rh, 3, rh);
            x += len;
          }
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(0, y * rh, w, 3);
        }
        speckle(g, w, h, 3000, 0.08);
      },
      [3, 3],
    ),
  brick: () =>
    canvasTex(
      'brick',
      512,
      256,
      (g, w, h) => {
        g.fillStyle = '#1e1a16';
        g.fillRect(0, 0, w, h);
        const bh = 32;
        for (let y = 0; y < h / bh; y++) {
          const off = y % 2 ? 0 : -32;
          for (let x = off; x < w; x += 64) {
            g.fillStyle = `hsl(${rand(24, 34)}, ${rand(10, 18)}%, ${rand(24, 33)}%)`;
            g.fillRect(x + 2, y * bh + 2, 60, bh - 4);
            g.fillStyle = 'rgba(255,255,255,0.05)';
            g.fillRect(x + 2, y * bh + 2, 60, 4);
          }
        }
        speckle(g, w, h, 3000, 0.12);
      },
      [4, 2],
    ),
  planks: () =>
    canvasTex(
      'planks',
      512,
      512,
      (g, w, h) => {
        const pw = 48;
        for (let x = 0; x < w; x += pw) {
          g.fillStyle = `hsl(${rand(22, 30)}, ${rand(30, 42)}%, ${rand(17, 24)}%)`;
          g.fillRect(x, 0, pw, h);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(x, 0, 3, h);
          g.fillStyle = '#1a120c';
          g.beginPath();
          g.arc(x + pw / 2, rand(40, h - 40), 3, 0, 7);
          g.fill();
        }
        speckle(g, w, h, 3000, 0.08);
      },
      [4, 1],
    ),
  canvas: () =>
    canvasTex(
      'canvas',
      512,
      512,
      (g, w, h) => {
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = (x / 64) % 2 ? '#c9ae7e' : '#8a3a2c';
          g.fillRect(x, 0, 64, h);
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(x + 54, 0, 10, h);
        }
        speckle(g, w, h, 4000, 0.06);
      },
      [4, 1],
    ),
  rug: (color) =>
    canvasTex(`rug${color}`, 256, 512, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d8a23a';
      g.lineWidth = 10;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.lineWidth = 3;
      g.strokeRect(30, 30, w - 60, h - 60);
      g.fillStyle = 'rgba(216,162,58,0.55)';
      for (let y = 70; y < h - 60; y += 64) {
        g.beginPath();
        g.moveTo(w / 2, y);
        g.lineTo(w / 2 + 26, y + 26);
        g.lineTo(w / 2, y + 52);
        g.lineTo(w / 2 - 26, y + 26);
        g.closePath();
        g.fill();
      }
      speckle(g, w, h, 3000, 0.1);
    }),
  banner: (color) =>
    canvasTex(`banner${color}`, 128, 320, (g, w, h) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, 0);
      g.lineTo(w, h);
      g.lineTo(w / 2, h - 40);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      g.strokeStyle = '#d8a23a';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(12, 0);
      g.lineTo(12, h - 12);
      g.moveTo(w - 12, 0);
      g.lineTo(w - 12, h - 12);
      g.stroke();
      // A bow and arrow: the camp's emblem.
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(42, 70);
      g.quadraticCurveTo(110, 130, 42, 190);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(42, 70);
      g.lineTo(42, 190);
      g.moveTo(28, 130);
      g.lineTo(100, 130);
      g.stroke();
    }),
  flame: () =>
    canvasTex('flame', 64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,220,1)');
      gr.addColorStop(0.3, 'rgba(255,190,80,0.9)');
      gr.addColorStop(0.7, 'rgba(255,110,30,0.35)');
      gr.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }),
  door: () =>
    canvasTex('doorspill', 128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,160,0.9)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }),
};

/** A floating name tag drawn on a canvas (two lines: title and status). */
function label(title, status = '', color = '#ffd27a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.font = '800 44px Cinzel, Georgia, serif';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(title, 256, 52);
  g.fillStyle = '#fff3d6';
  g.fillText(title, 256, 52);
  if (status) {
    g.font = '600 32px "Trebuchet MS", sans-serif';
    g.strokeText(status, 256, 104);
    g.fillStyle = color;
    g.fillText(status, 256, 104);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(4, 1, 1);
  s.renderOrder = 5;
  return s;
}

// ------------------------------------------------------------ the room

export class Room {
  constructor(kind, game, title) {
    this.kind = kind;
    this.game = game;
    this.title = title;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.colliders = [];
    this.stations = [];
    this.dynStations = [];
    this.flames = [];
    this.spinners = [];
    this.animators = [];
    this.instances = [];
    this.time = 0;
    this.entry = new THREE.Vector3(W - 2.4, 0, D - 2.2);
    this.center = new THREE.Vector3(-1.6, 0, -3);
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);
    this.particles = new Particles(this.scene, 300);
    this.shell();
    BUILD[kind]?.(this);
  }

  /** Floor, two back walls, lights and the way out. */
  shell() {
    const S = this.scene;
    const look = LOOK[this.kind] || LOOK.hall;
    S.add(new THREE.HemisphereLight(look.sky, 0x1a120c, look.ambient));
    const key = new THREE.DirectionalLight(look.key, look.keyI);
    key.position.set(-6, 14, 4);
    key.target.position.set(0, 0, -1);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    S.add(key, key.target);
    // A dark apron beyond the walls, then the floor itself.
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 }));
    apron.position.y = -0.02;
    S.add(apron);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TEX[look.floor](), roughness: 0.9 }));
    floor.receiveShadow = true;
    S.add(floor);
    // Front edges: a raised stone lip so the room reads as a cutaway, not a floating tile.
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.9 });
    const lipA = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.6, 0.35, 0.5), lipMat);
    lipA.position.set(0, 0.17, D + 0.25);
    const lipB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, D * 2 + 0.6), lipMat);
    lipB.position.set(W + 0.25, 0.17, 0);
    S.add(lipA, lipB);
    // Back walls.
    const wallMat = new THREE.MeshStandardMaterial({ map: TEX[look.wall](), roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.6, 5.2, 0.5), wallMat);
    back.position.set(0, 2.6, -D - 0.25);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, D * 2 + 0.6), wallMat);
    side.position.set(-W - 0.25, 2.6, 0);
    for (const m of [back, side]) {
      m.receiveShadow = true;
      m.castShadow = true;
    }
    S.add(back, side);
    // Skirting and a top beam.
    const trim = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
    for (const [w, d, x, z] of [
      [W * 2, 0.15, 0, -D + 0.05],
      [0.15, D * 2, -W + 0.05, 0],
    ]) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), trim);
      sk.position.set(x, 0.15, z);
      const bm = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d + 0.2), trim);
      bm.position.set(x, 5.0, z);
      S.add(sk, bm);
    }
    // The way out: a warm doormat with light spilling in.
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TEX.rug('#5a2a1a'), roughness: 1 }));
    mat.position.set(W - 1.6, 0.012, D - 1.1);
    mat.rotation.y = FACE_CAMERA;
    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: TEX.door(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 }),
    );
    spill.position.set(W - 1.7, 0.02, D - 1.3);
    S.add(mat, spill);
    const exitLabel = label('Back to camp');
    exitLabel.position.set(W - 1.6, 1.6, D - 1.1);
    exitLabel.scale.multiplyScalar(0.8);
    S.add(exitLabel);
    this.stations.push({ act: 'exit', label: 'Camp', verb: 'Leave to', x: W - 1.6, z: D - 1.1, r: 1.6 });
  }

  /** Rebuild what changes between visits: heroes, outfits, stock, your gear. */
  refresh() {
    for (const inst of this.instances) disposeInstance(inst);
    this.instances = [];
    this.animators = [];
    this.spinners = [];
    this.rings = [];
    for (const c of [...this.dyn.children]) {
      c.removeFromParent();
      disposeTree(c);
    }
    this.dynColliders = [];
    this.dynStations = [];
    DISPLAY[this.kind]?.(this);
  }

  allStations() {
    return this.dynStations.concat(this.stations);
  }

  /** Keep the hero inside the room and out of the furniture. */
  collide = (pos, r) => {
    pos.x = Math.min(W - 0.3 - r, Math.max(-W + 0.4 + r, pos.x));
    pos.z = Math.min(D - 0.3 - r, Math.max(-D + 0.4 + r, pos.z));
    for (const c of this.colliders.concat(this.dynColliders || [])) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd < c.r + r && dd > 1e-4) {
        pos.x = c.x + (dx / dd) * (c.r + r);
        pos.z = c.z + (dz / dd) * (c.r + r);
      }
    }
  };

  // ---------------------------------------------------------- building blocks

  prop(id, size, x, z, rotY = FACE_CAMERA, collideR = 0, opts = {}) {
    const p = spawnProp(id, size, opts);
    if (!p) return null;
    p.position.set(x, opts.y || 0, z);
    p.rotation.y = rotY;
    (opts.dyn ? this.dyn : this.scene).add(p);
    if (collideR > 0) (opts.dyn ? this.dynColliders : this.colliders).push({ x, z, r: collideR });
    return p;
  }

  box(w, h, d, color, x, y, z, collideR = 0, rough = 0.85) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    this.scene.add(m);
    if (collideR > 0) this.colliders.push({ x, z, r: collideR });
    return m;
  }

  /** A wall torch: bracket, flickering flame sprite and (optionally) a real light. */
  torch(x, y, z, light = true) {
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a2018 }));
    bracket.position.set(x, y, z);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.position.set(x, y + 0.45, z);
    flame.scale.set(0.55, 0.8, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame(), color: 0xff8a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    halo.position.copy(flame.position);
    halo.scale.setScalar(2.6);
    this.scene.add(bracket, flame, halo);
    let pl = null;
    if (light) {
      pl = new THREE.PointLight(0xff9a4a, 9, 10, 1.6);
      pl.position.set(x + 0.3, y + 0.6, z + 0.3);
      this.scene.add(pl);
    }
    this.flames.push({ flame, halo, light: pl, base: pl ? pl.intensity : 0, seed: Math.random() * 10 });
  }

  /** A cloth banner hanging flat against a back wall. */
  banner(x, z, rotY, color, h = 2.6) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.4, h), new THREE.MeshStandardMaterial({ map: TEX.banner(color), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
    m.position.set(x, 4.6 - h / 2, z);
    m.rotation.y = rotY;
    this.scene.add(m);
  }

  rug(x, z, w, d, color, rotY = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TEX.rug(color), roughness: 1 }));
    m.position.set(x, 0.01, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    this.scene.add(m);
  }

  /** A glowing floor ring that brightens when the hero can use the station. */
  ring(x, z, r, color, parent = this.dyn) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 48).rotateX(-Math.PI / 2), mat);
    m.position.set(x, 0.03, z);
    parent.add(m);
    (this.rings ||= []).push({ m, x, z });
    return m;
  }

  /** A character standing on a pedestal, idling. */
  figure(id, x, z, y, outfitId, dark = false) {
    const h = id === 'dwarf' ? config.models.heroHeight * 0.82 : config.models.heroHeight;
    const inst = instantiate(id, h);
    if (!inst) return null;
    inst.holder.position.set(x, y, z);
    inst.holder.rotation.y = FACE_CAMERA;
    this.dyn.add(inst.holder);
    this.instances.push(inst);
    if (inst.animator?.has('idle')) {
      inst.animator.set(['idle'], { fade: 0 });
      inst.animator.update(Math.random() * 2);
      this.animators.push(inst.animator);
    }
    const o = outfits[outfitId];
    if (o && o.base === id) {
      loadTexture(o.texture, (tex) => {
        if (!this.instances.includes(inst)) return;
        for (const m of inst.materials) {
          m.map = tex;
          m.color.set(dark ? 0x0a0a0c : 0xffffff);
          m.needsUpdate = true;
        }
      });
    }
    if (dark) for (const m of inst.materials) m.color.set(0x0a0a0c);
    return inst;
  }

  pedestal(x, z, r = 0.8, h = 0.45, color = 0x4a443c) {
    const stone = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 32), stone);
    p.position.set(x, h / 2, z);
    p.castShadow = p.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.5, metalness: 0.3 }));
    cap.position.set(x, h, z);
    this.dyn.add(p, cap);
    this.dynColliders.push({ x, z, r: r + 0.1 });
    return h + 0.04;
  }

  /** A bow model floating and turning above a stand, with a rarity beam. */
  bowDisplay(item, x, y, z) {
    const base = BOWS[item.base] || BOWS.longbow;
    const parts = makeBowParts(base.color);
    const g = new THREE.Group();
    g.add(parts.limbs, parts.grip);
    const t = parts.tip;
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, t.y, t.z), new THREE.Vector3(0, -t.y, t.z)]), new THREE.LineBasicMaterial({ color: 0xf3ead2 })));
    g.scale.setScalar(1.4 * base.scale);
    g.rotation.z = 0.15;
    g.position.set(x, y, z);
    this.dyn.add(g);
    this.spinners.push({ obj: g, y, speed: 0.9 });
    this.beam(x, z, RARITIES[item.rarity].color, y);
    return g;
  }

  /** An icon (armor, gadget) floating above a stand, drawn from the item's SVG. */
  iconDisplay(item, svg, x, y, z) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const color = RARITIES[item.rarity].color;
    const img = new Image();
    img.onload = () => {
      const g = c.getContext('2d');
      g.shadowColor = color;
      g.shadowBlur = 16;
      g.drawImage(img, 14, 14, 100, 100);
      t.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" color="${color}"`).replaceAll('currentColor', color))}`;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.9);
    s.position.set(x, y, z);
    this.dyn.add(s);
    this.spinners.push({ obj: s, y, speed: 0 });
    this.beam(x, z, color, y);
  }

  beam(x, z, color, top) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.32, top + 1.4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.position.set(x, (top + 1.4) / 2, z);
    this.dyn.add(m);
  }

  addLabel(text, status, color, x, y, z, scale = 1) {
    const l = label(text, status, color);
    l.position.set(x, y, z);
    l.scale.multiplyScalar(scale);
    this.dyn.add(l);
    return l;
  }

  // ---------------------------------------------------------- per frame

  update(dt, playerPos, near) {
    this.time += dt;
    const t = this.time;
    for (const f of this.flames) {
      const k = 0.85 + 0.1 * Math.sin(t * 11 + f.seed) + 0.06 * Math.sin(t * 27 + f.seed * 3);
      f.flame?.scale.set(0.5 * k, 0.8 * (2 - k), 1);
      if (f.halo) f.halo.material.opacity = 0.3 * k;
      if (f.light) f.light.intensity = f.base * k;
    }
    for (const s of this.spinners) {
      s.obj.rotation.y += dt * s.speed;
      s.obj.position.y = s.y + Math.sin(t * 2 + s.y) * 0.08;
    }
    for (const a of this.animators) a.update(dt);
    for (const r of this.rings || []) {
      const on = near && Math.hypot(near.x - r.x, near.z - r.z) < 0.5;
      const target = on ? 0.95 : 0.3 + 0.08 * Math.sin(t * 3 + r.x);
      r.m.material.opacity += (target - r.m.material.opacity) * (1 - Math.exp(-8 * dt));
    }
    TICK[this.kind]?.(this, dt);
    this.particles.update(dt);
  }
}

// ------------------------------------------------------------ the rooms

const LOOK = {
  hall: { floor: 'stone', wall: 'brick', sky: 0xa8b4d8, ambient: 1.25, key: 0xd8e2ff, keyI: 2.2 },
  wardrobe: { floor: 'wood', wall: 'canvas', sky: 0xffe0b8, ambient: 1.4, key: 0xffe2b8, keyI: 2.2 },
  armory: { floor: 'wood', wall: 'planks', sky: 0xd8c8b0, ambient: 1.3, key: 0xffd8a8, keyI: 2.1 },
  merchant: { floor: 'wood', wall: 'planks', sky: 0xffd8a8, ambient: 1.3, key: 0xffe2b8, keyI: 2.1 },
  blacksmith: { floor: 'stone', wall: 'brick', sky: 0x9a8a80, ambient: 0.95, key: 0xffc890, keyI: 1.5 },
};

/** Fixed furniture, built once per room. */
const BUILD = {
  hall(R) {
    R.rug(-1, -1, 3, 11, '#6a1a16', FACE_CAMERA);
    R.banner(-5, -D + 0.02, 0, '#7a1e1a');
    R.banner(0, -D + 0.02, 0, '#1e3a6a', 3);
    R.banner(5, -D + 0.02, 0, '#7a1e1a');
    R.banner(-W + 0.02, -1, Math.PI / 2, '#2a5a2a');
    R.banner(-W + 0.02, 4, Math.PI / 2, '#7a1e1a');
    R.torch(-2.5, 2.8, -D + 0.35);
    R.torch(2.5, 2.8, -D + 0.35);
    R.torch(-W + 0.35, 2.8, 1.5, false);
    R.prop('kingStatue', 3.4, -W + 1.3, -D + 1.3, FACE_CAMERA, 1.0);
    R.prop('pillarCarved', 4.4, -W + 0.9, 5.5, 0, 0.6);
    R.prop('pillarCarved', 4.4, 6.5, -D + 0.9, 0, 0.6);
    R.prop('brazier', 1.3, 4.5, 2.5, 0, 0.5);
    // A lectern with the book of talents.
    R.box(0.7, 1.1, 0.5, 0x4a2e18, -W + 1.6, 0.55, 1.6, 0.6);
    const book = R.box(0.8, 0.08, 0.6, 0x7a1e1a, -W + 1.6, 1.16, 1.6);
    book.rotation.z = -0.25;
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.46).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf3e6c4 }));
    page.position.set(-W + 1.6, 1.215, 1.6);
    page.rotation.z = -0.25;
    R.scene.add(page);
    const tag = label('Hero talents', 'Spend your level points');
    tag.position.set(-W + 1.6, 2.6, 1.6);
    tag.scale.multiplyScalar(0.8);
    R.scene.add(tag);
    R.stations.push({ act: 'panel', panel: 'talents', label: 'Hero talents', verb: 'Read the', x: -W + 2.7, z: 2.4, r: 1.4 });
    R.ring(-W + 2.7, 2.4, 0.6, 0x9fe0ff, R.scene);
  },
  wardrobe(R) {
    R.rug(0, 0, 6, 6, '#7a2a24');
    const cols = ['#c8443a', '#7fc4ff', '#6a5a8a', '#ffc04d', '#5f8f4a', '#d87a3a'];
    // Bolts of cloth on a rail along the back wall.
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, W * 1.6, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    rail.position.set(0, 3.8, -D + 0.5);
    R.scene.add(rail);
    for (let i = 0; i < 10; i++) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, rand(1.8, 2.6)), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 1 }));
      cloth.position.set(-6 + i * 1.3, 3.8 - cloth.geometry.parameters.height / 2, -D + 0.55);
      R.scene.add(cloth);
    }
    // A cutting table with spools.
    R.box(3, 0.15, 1.2, 0x5a3a20, -W + 1.2, 1.0, 1, 0.9);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12), new THREE.MeshStandardMaterial({ color: cols[i] }));
      sp.position.set(-W + 1.2, 1.22, 0 + i * 0.45);
      R.scene.add(sp);
    }
    R.prop('lantern', 1.8, -W + 1, -D + 1, 0, 0.3);
    R.prop('lantern', 1.8, 6.5, -D + 1, 0, 0.3);
    R.torch(-3, 3.2, -D + 0.35);
    R.torch(3, 3.2, -D + 0.35, false);
    R.prop('crates', 1.2, -W + 1, 5, 0.4, 0.6);
  },
  armory(R) {
    R.rug(0, 0, 4, 7, '#2a3a5a', FACE_CAMERA);
    R.prop('weaponRack', 2.4, -4.5, -D + 0.8, 0, 0.8);
    R.prop('weaponRack', 2.4, -0.5, -D + 0.8, 0, 0.8);
    R.prop('weaponRack', 2.4, -W + 0.8, -2.5, Math.PI / 2, 0.8);
    R.prop('weaponPile', 1.6, -W + 1.4, 3.2, 0.5, 0.8);
    R.prop('barrel', 1.2, 5.2, -D + 0.9, 0, 0.5);
    R.prop('barrel', 1.0, 6.3, -D + 1.3, 0, 0.45);
    R.prop('crates', 1.2, -W + 1, 5.6, 0.2, 0.6);
    R.torch(-2.5, 3, -D + 0.35);
    R.torch(-W + 0.35, 3, 0.5);
    R.banner(2.5, -D + 0.02, 0, '#1e3a6a');
    R.banner(-W + 0.02, -5.5, Math.PI / 2, '#7a1e1a');
    R.stations.push({ act: 'panel', panel: 'armory', label: 'Weapon racks', verb: 'Browse', x: -2.5, z: -D + 2, r: 1.8 });
    const tag = label('Weapon racks', 'Your stash: bows, armor, gadgets');
    tag.position.set(-2.5, 2.9, -D + 1.2);
    tag.scale.multiplyScalar(0.8);
    R.scene.add(tag);
    R.stations.push({ act: 'panel', panel: 'armory', label: 'Weapon racks', verb: 'Browse', x: -W + 2, z: -2.5, r: 1.6 });
    R.ring(-2.5, -D + 2, 0.9, 0xffd27a, R.scene);
    R.ring(-W + 2, -2.5, 0.8, 0xffd27a, R.scene);
  },
  merchant(R) {
    R.rug(1, 1.5, 4, 5, '#2a5a6a', FACE_CAMERA);
    // Counter across the back with goods on shelves behind it.
    R.box(9, 1.1, 1.0, 0x6a4426, -1, 0.55, -3.6);
    R.box(9.3, 0.12, 1.2, 0x8a5a32, -1, 1.15, -3.6);
    for (let x = -5; x <= 3; x += 2) R.colliders.push({ x, z: -3.6, r: 0.75 });
    for (const y of [1.6, 2.6, 3.6]) {
      R.box(10, 0.1, 0.7, 0x4a2e18, -1, y, -D + 0.4);
      for (let x = -5.5; x < 3.8; x += rand(0.45, 0.8)) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, rand(0.3, 0.5), 10), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.4, 0.4), roughness: 0.3, metalness: 0.1 }));
        jar.position.set(x, y + 0.25, -D + 0.4);
        R.scene.add(jar);
      }
    }
    R.prop('barrel', 1.2, -W + 1, -D + 1.1, 0, 0.55);
    R.prop('crates', 1.3, -W + 1, 1, 0.3, 0.7);
    R.prop('crates', 1.0, -W + 1.1, 2.4, 1.1, 0.6);
    R.prop('powderBarrel', 1.0, 6, -D + 1, 0, 0.45);
    R.torch(-W + 0.35, 3, -2.5);
    R.torch(4.5, 3.2, -D + 0.35);
    R.banner(6.5, -D + 0.02, 0, '#7a1e1a');
  },
  blacksmith(R) {
    R.prop('blacksmithForge', 3.8, -W + 2.2, -D + 2.2, FACE_CAMERA, 1.8);
    const forgeLight = new THREE.PointLight(0xff6a20, 26, 12, 1.6);
    forgeLight.position.set(-W + 3, 1.6, -D + 3);
    R.scene.add(forgeLight);
    R.flames.push({ flame: null, halo: null, light: forgeLight, base: 26, seed: 1 });
    R.forgeAt = new THREE.Vector3(-W + 2.6, 1.4, -D + 2.6);
    R.prop('anvil', 0.9, -0.5, -1.5, FACE_CAMERA + 0.4, 0.6);
    R.prop('barrel', 1.2, 4, -D + 1, 0, 0.55);
    R.prop('weaponPile', 1.5, 6, -D + 1.6, 0.3, 0.8);
    R.prop('hammer', 0.9, -W + 0.9, 3.5, 1.2, 0, { axis: 'x' });
    R.prop('brazier', 1.2, -W + 1, 5.4, 0, 0.5);
    R.prop('weaponRack', 2.2, -W + 0.8, 0.5, Math.PI / 2, 0.8);
    R.prop('crates', 1.1, 5.5, 2.5, 0.6, 0.6);
    R.prop('barrel', 1.0, 6.4, 1.4, 0, 0.45);
    R.rug(2.5, 1.5, 3, 4, '#4a2a1a', FACE_CAMERA);
    // A grindstone by the wall.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.95 }));
    wheel.position.set(3, 0.75, -D + 1.2);
    wheel.castShadow = true;
    R.scene.add(wheel);
    R.box(0.9, 0.5, 0.5, 0x4a2e18, 3, 0.25, -D + 1.2, 0.6);
    R.wheel = wheel;
    const tag = label('Anvil', 'Temper & hone your gear', '#ffb070');
    tag.position.set(-0.5, 2.6, -1.5);
    tag.scale.multiplyScalar(0.8);
    R.scene.add(tag);
    R.torch(1.5, 3, -D + 0.35);
    R.torch(-W + 0.35, 3, 2, false);
    R.anvilAt = new THREE.Vector3(-0.5, 0.95, -1.5);
    R.smithT = 1;
    R.stations.push({ act: 'panel', panel: 'blacksmith', label: 'Anvil', verb: 'Use the', x: -0.5, z: -1.5, r: 1.9 });
    R.ring(-0.5, -1.5, 1.1, 0xff9a4a, R.scene);
    // The smith himself, hammer in hand.
    if (models.dwarf) {
      const inst = instantiate('dwarf', config.models.heroHeight * 0.82);
      inst.holder.position.set(-1.9, 0, -2.4);
      inst.holder.rotation.y = Math.atan2(1.4, 0.9);
      R.scene.add(inst.holder);
      if (inst.animator?.has('idle')) {
        inst.animator.set(['idle'], { fade: 0 });
        R.smith = inst.animator;
      }
      for (const m of inst.materials) m.color.multiplyScalar(0.9);
      const hand = findBone(inst.root, [/hand/i, /right|(^|[_.])r([_.]|$)/i]);
      if (hand) attachProp('hammer', hand, 0.55);
      R.colliders.push({ x: -1.9, z: -2.4, r: 0.5 });
    }
  },
};

/** What changes between visits, rebuilt by refresh(). */
const DISPLAY = {
  hall(R) {
    const spots = [
      [-4.6, -3.6],
      [-0.8, -4.9],
      [3.2, -4.6],
    ];
    CHARACTERS.forEach((c, i) => {
      const [x, z] = spots[i] || [i * 2, 0];
      const owned = !!profile.owned[c.id];
      const selected = profile.character === c.id;
      const top = R.pedestal(x, z, 0.85, 0.55);
      R.figure(c.id, x, z, top, profile.outfit[c.id] || 'default', !owned);
      const status = selected ? 'Equipped' : owned ? 'Owned · press E to pick' : !models[c.id] ? 'Coming soon' : requirementMet(c.requires) ? `Unlock · ◆ ${c.cost}` : `🔒 ${c.requires.label}`;
      R.addLabel(c.name, status, selected ? '#7fe0a0' : owned ? '#ffd27a' : '#c8b8a0', x, 3.0, z, 0.9);
      R.ring(x + 1.1, z + 1.1, 0.6, selected ? 0x7fe0a0 : 0xffd27a);
      R.dynStations.push({ act: 'panel', panel: 'hall', focus: c.id, label: c.name, verb: 'Meet', x: x + 1.1, z: z + 1.1, r: 1.3 });
    });
  },
  wardrobe(R) {
    const hero = currentCharacter();
    const list = OUTFITS.filter((o) => o.base === hero.id);
    if (!list.length) {
      R.addLabel("Tailor's Tent", `Outfits for ${hero.name.split(' ')[0]} coming soon`, '#ffd27a', 0, 2.4, -3);
      return;
    }
    const spots = [
      [-5.4, -1.2],
      [-3.8, -4.6],
      [-0.6, -5.2],
      [2.6, -5.0],
      [5.4, -3.6],
    ];
    const cur = profile.outfit[hero.id] || 'default';
    list.forEach((o, i) => {
      const [x, z] = spots[i] || [i * 2 - 4, -4];
      const key = outfitKey(o);
      const owned = !!profile.owned[key];
      const top = R.pedestal(x, z, 0.7, 0.3, 0x5a3a20);
      R.figure(hero.id, x, z, top, o.id, false);
      const status = cur === o.id ? 'Wearing' : owned ? 'Owned' : requirementMet(o.requires) ? `◆ ${o.cost}` : `🔒 ${o.requires.label}`;
      R.addLabel(o.name, status, cur === o.id ? '#7fe0a0' : '#ffd27a', x, 2.75, z, 0.85);
      R.ring(x + 1, z + 1, 0.55, 0xffd27a);
      R.dynStations.push({ act: 'panel', panel: 'wardrobe', focus: o.id, label: o.name, verb: 'Try on', x: x + 1, z: z + 1, r: 1.2 });
    });
  },
  armory(R) {
    // Your bow on a stand in the middle of the room.
    const bow = equipped('bow');
    if (bow) {
      const top = R.pedestal(2.2, -2.6, 0.55, 0.9, 0x5a3a20);
      R.bowDisplay(bow, 2.2, top + 1.0, -2.6);
      R.addLabel(bow.name, `Power ${bow.power} · equipped`, RARITIES[bow.rarity].color, 2.2, 3.4, -2.6, 0.8);
      R.ring(3.2, -1.6, 0.6, 0xffd27a);
      R.dynStations.push({ act: 'panel', panel: 'armory', label: 'Your gear', verb: 'Check', x: 3.2, z: -1.6, r: 1.3 });
    }
  },
  merchant(R) {
    const stock = merchantStock();
    const xs = [-4, -1, 2];
    stock.slice(0, 3).forEach((item, i) => {
      const x = xs[i];
      const z = -3.6;
      if (item.sold) {
        R.addLabel('Sold', '', '#c8b8a0', x, 2.2, z, 0.7);
      } else {
        if (item.slot === 'bow') R.bowDisplay(item, x, 1.9, z);
        else R.iconDisplay(item, ICON_SVG[item.slot] || ICON_SVG.armor, x, 1.8, z);
        R.addLabel(item.name, `◆ ${price(item)} · ${RARITIES[item.rarity].name}`, RARITIES[item.rarity].color, x, 3.0, z, 0.75);
      }
      R.ring(x, z + 1.4, 0.55, 0xffd27a);
      R.dynStations.push({ act: 'panel', panel: 'merchant', label: item.sold ? 'Merchant' : item.name, verb: 'Look at', x, z: z + 1.4, r: 1.1 });
    });
    // The mystery chest.
    R.prop('treasureChest', 1.0, 5.2, -2.6, FACE_CAMERA - 0.5, 0.7, { dyn: true });
    R.addLabel('Mystery goods', 'Unknown gear · ◆ 45', '#c89aff', 5.2, 2.0, -2.6, 0.75);
    R.ring(5.9, -1.5, 0.6, 0xc89aff);
    R.dynStations.push({ act: 'panel', panel: 'merchant', label: 'Mystery chest', verb: 'Open the', x: 5.9, z: -1.5, r: 1.2 });
  },
};

const ICON_SVG = {
  armor: '<svg viewBox="0 0 32 32"><path d="M10 5 L 4 9 L 6 16 L 9 15 L 9 27 L 23 27 L 23 15 L 26 16 L 28 9 L 22 5 C 20 8, 12 8, 10 5 Z" fill="currentColor" fill-opacity=".35" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  gadget: '<svg viewBox="0 0 32 32"><path d="M12 4 L 20 4 L 20 10 L 25 26 C 25 28, 24 29, 22 29 L 10 29 C 8 29, 7 28, 7 26 L 12 10 Z" fill="currentColor" fill-opacity=".35" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

/** Per-room life: forge embers, the smith's hammer sparks. */
const TICK = {
  blacksmith(R, dt) {
    if (Math.random() < dt * 14) R.particles.spawn(R.forgeAt.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4))), { count: 1, color: [3, 1.2, 0.3], speed: 0.4, up: 2.2, life: 1.2, size: 0.05, gravity: -1, drag: 0.4 });
    R.smith?.update(dt);
    if (R.wheel) R.wheel.rotation.z -= dt * 2;
    R.smithT -= dt;
    if (R.smithT <= 0) {
      R.smithT = rand(1.6, 3);
      R.particles.spawn(R.anvilAt, { count: 18, color: [3, 1.8, 0.5], speed: 3.5, up: 2.5, life: 0.5, size: 0.04, gravity: 9 });
      if (R.game.camp.room === R) R.game.sfx.sample('clang', { vol: 0.12, rate: rand(1.1, 1.3), jitter: 0 });
    }
  },
  hall(R, dt) {
    if (Math.random() < dt * 10) R.particles.spawn(new THREE.Vector3(4.5 + rand(-0.2, 0.2), 1.3, 2.5 + rand(-0.2, 0.2)), { count: 1, color: [3, 1.3, 0.3], speed: 0.3, up: 2, life: 1, size: 0.05, gravity: -1, drag: 0.5 });
  },
};

export const ROOM_KINDS = Object.keys(BUILD);
