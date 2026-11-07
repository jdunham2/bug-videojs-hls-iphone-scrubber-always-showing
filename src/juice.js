// Extra feedback effects: floor decals (blood, scorch, frost, cracks).

import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

function splatTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blob(g, color, n, spread, rMin, rMax) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() ** 1.6 * spread;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, rand(rMin, rMax), 0, Math.PI * 2);
    g.fill();
  }
}

const TEXTURES = {};
function textures() {
  if (TEXTURES.blood) return TEXTURES;
  TEXTURES.blood = [0, 1, 2].map(() =>
    splatTexture((g) => {
      blob(g, 'rgba(90,8,6,0.9)', 14, 26, 8, 20);
      blob(g, 'rgba(110,12,8,0.8)', 26, 56, 1.5, 5);
    }),
  );
  TEXTURES.scorch = [
    splatTexture((g) => {
      const grad = g.createRadialGradient(0, 0, 4, 0, 0, 60);
      grad.addColorStop(0, 'rgba(10,6,4,0.95)');
      grad.addColorStop(0.6, 'rgba(25,14,8,0.6)');
      grad.addColorStop(1, 'rgba(25,14,8,0)');
      g.fillStyle = grad;
      g.fillRect(-64, -64, 128, 128);
      blob(g, 'rgba(255,120,30,0.5)', 10, 30, 1, 3);
    }),
  ];
  TEXTURES.frost = [
    splatTexture((g) => {
      const grad = g.createRadialGradient(0, 0, 4, 0, 0, 60);
      grad.addColorStop(0, 'rgba(200,235,255,0.75)');
      grad.addColorStop(1, 'rgba(160,210,255,0)');
      g.fillStyle = grad;
      g.fillRect(-64, -64, 128, 128);
      g.strokeStyle = 'rgba(235,250,255,0.9)';
      g.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * rand(30, 58), Math.sin(a) * rand(30, 58));
        g.stroke();
      }
    }),
  ];
  TEXTURES.crack = [
    splatTexture((g) => {
      g.strokeStyle = 'rgba(12,8,6,0.9)';
      for (let i = 0; i < 8; i++) {
        let x = 0;
        let y = 0;
        let a = (i / 8) * Math.PI * 2 + rand(-0.3, 0.3);
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(0, 0);
        for (let k = 0; k < 5; k++) {
          a += rand(-0.5, 0.5);
          x += Math.cos(a) * rand(8, 13);
          y += Math.sin(a) * rand(8, 13);
          g.lineTo(x, y);
          g.lineWidth = Math.max(0.8, 3.5 - k * 0.6);
        }
        g.stroke();
      }
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 22);
      grad.addColorStop(0, 'rgba(10,6,4,0.7)');
      grad.addColorStop(1, 'rgba(10,6,4,0)');
      g.fillStyle = grad;
      g.fillRect(-30, -30, 60, 60);
    }),
  ];
  return TEXTURES;
}

const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export class Decals {
  constructor(scene, max = 90) {
    this.scene = scene;
    this.max = max;
    this.list = [];
  }

  /** type: 'blood' | 'scorch' | 'frost' | 'crack' */
  spawn(pos, type = 'blood', size = 1, life = 14) {
    const tex = textures()[type];
    const mat = new THREE.MeshBasicMaterial({
      map: tex[Math.floor(Math.random() * tex.length)],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      opacity: 1,
    });
    const m = new THREE.Mesh(plane, mat);
    m.position.set(pos.x, 0.03 + this.list.length * 0.0004, pos.z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.01);
    m.renderOrder = 1;
    this.scene.add(m);
    this.list.push({ m, mat, size, life, max: life, grow: 0 });
    if (this.list.length > this.max) this.remove(0);
  }

  remove(i) {
    const d = this.list[i];
    d.m.removeFromParent();
    d.mat.dispose();
    this.list.splice(i, 1);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.life -= dt;
      d.grow = Math.min(1, d.grow + dt * 7);
      d.m.scale.setScalar(d.size * (1 - (1 - d.grow) ** 3)); // splat out quickly
      d.mat.opacity = Math.min(1, d.life / 2);
      if (d.life <= 0) this.remove(i);
    }
  }

  clear() {
    while (this.list.length) this.remove(0);
  }
}

let doorTex = null;
let spillTex = null;
/** Soft warm light for the open gateway (`floor`: the patch of light on the ground). */
export function doorwayTexture(floor = false) {
  if (floor ? spillTex : doorTex) return floor ? spillTex : doorTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = floor ? g.createLinearGradient(0, 128, 0, 0) : g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, floor ? 'rgba(255,236,190,0.55)' : 'rgba(255,244,214,0.95)');
  grad.addColorStop(1, floor ? 'rgba(255,236,190,0)' : 'rgba(255,214,150,0.75)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  // Fade the sides.
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.2, 'rgba(0,0,0,0)');
  side.addColorStop(0.8, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (floor) spillTex = tex;
  else doorTex = tex;
  return tex;
}
