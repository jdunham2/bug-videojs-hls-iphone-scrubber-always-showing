// Extra feedback effects: floor decals (blood, scorch, frost, cracks) and spawn portals.

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
  TEXTURES.portal = splatTexture((g) => {
    for (let r = 58; r > 6; r -= 4) {
      g.strokeStyle = `rgba(${170 + r},${60 + r},255,${0.15 + (58 - r) / 90})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, r, r * 0.11, r * 0.11 + Math.PI * 1.4);
      g.stroke();
    }
  });
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

/** Swirling ground portal shown where an enemy is summoned. */
export class Portals {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  spawn(pos, duration = 1.3, size = 2.6, color = new THREE.Color(2.2, 0.9, 3)) {
    const mat = new THREE.MeshBasicMaterial({
      map: textures().portal,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color,
    });
    const m = new THREE.Mesh(plane, mat);
    m.position.set(pos.x, 0.06, pos.z);
    m.renderOrder = 2;
    this.scene.add(m);
    this.list.push({ m, mat, t: 0, duration, size });
  }

  update(dt, particles) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = p.t / p.duration;
      const open = Math.min(1, k * 4) * Math.min(1, (1 - k) * 3);
      p.m.scale.setScalar(p.size * (0.3 + 0.7 * open));
      p.m.rotation.y += dt * 4;
      p.mat.opacity = open;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * p.size * 0.4;
        particles.spawn(new THREE.Vector3(p.m.position.x + Math.cos(a) * r, 0.1, p.m.position.z + Math.sin(a) * r), {
          count: 1,
          color: [1.8, 0.7, 3],
          speed: 0.3,
          up: 3,
          life: 0.7,
          size: 0.07,
          gravity: -2,
        });
      }
      if (k >= 1) {
        p.m.removeFromParent();
        p.mat.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) p.m.removeFromParent();
    this.list.length = 0;
  }
}
