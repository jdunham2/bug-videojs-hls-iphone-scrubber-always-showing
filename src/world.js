import * as THREE from 'three';

export const ARENA_HALF = 15;

// Shared obstacle list so movement/arrow code doesn't need a World reference.
export const pillars = [];

export function resolveCircle(pos, r) {
  const lim = ARENA_HALF - r;
  pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
  pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
  for (const p of pillars) {
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.r + r;
    if (d < min && d > 1e-5) {
      pos.x = p.x + (dx / d) * min;
      pos.z = p.z + (dz / d) * min;
    }
  }
}

export function arrowBlocked(pos) {
  if (Math.abs(pos.x) > ARENA_HALF || Math.abs(pos.z) > ARENA_HALF) return true;
  for (const p of pillars) {
    if (pos.y < p.h && Math.hypot(pos.x - p.x, pos.z - p.z) < p.r + 0.02) return true;
  }
  return false;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function stoneTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2622';
  g.fillRect(0, 0, size, size);
  const tiles = 4;
  const ts = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const l = 34 + Math.random() * 14;
      g.fillStyle = `hsl(${28 + Math.random() * 10}, ${10 + Math.random() * 8}%, ${l}%)`;
      g.fillRect(x * ts + 3, y * ts + 3, ts - 6, ts - 6);
      // speckle
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        g.fillRect(x * ts + Math.random() * ts, y * ts + Math.random() * ts, 3, 3);
      }
      // occasional crack
      if (Math.random() < 0.35) {
        g.strokeStyle = 'rgba(20,15,10,0.5)';
        g.lineWidth = 2;
        g.beginPath();
        let cx = x * ts + Math.random() * ts;
        let cy = y * ts + Math.random() * ts;
        g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) {
          cx += rand(-20, 20);
          cy += rand(-20, 20);
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.torches = [];
    scene.background = new THREE.Color(0x120f0d);
    scene.fog = new THREE.Fog(0x120f0d, 26, 52);
    this.buildLights();
    this.buildFloor();
    this.buildWalls();
    this.buildPillars();
    this.buildDecor();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x3a2a1c, 0.8));
    const sun = new THREE.DirectionalLight(0xffdcb0, 2.2);
    sun.position.set(10, 22, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -20;
    s.right = s.top = 20;
    s.near = 1;
    s.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
  }

  buildFloor() {
    const tex = stoneTexture();
    tex.repeat.set(4, 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    floor.receiveShadow = true;
    this.scene.add(floor);

    const outside = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1d2416, roughness: 1 }),
    );
    outside.position.y = -0.02;
    outside.receiveShadow = true;
    this.scene.add(outside);
  }

  buildWalls() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.9, flatShading: true });
    const seg = 2;
    const n = Math.round((ARENA_HALF * 2) / seg);
    const geo = new THREE.BoxGeometry(seg * 0.98, 1, 0.9);
    const edge = ARENA_HALF + 0.45;
    for (let side = 0; side < 4; side++) {
      // The two walls nearest the camera (+x, +z) stay low so they don't hide the action.
      const near = side === 1 || side === 2;
      for (let i = 0; i < n; i++) {
        const h = near ? rand(0.35, 0.6) : rand(0.9, 1.7);
        const m = new THREE.Mesh(geo, mat);
        m.scale.y = h;
        const t = -ARENA_HALF + seg * (i + 0.5);
        if (side === 0) m.position.set(t, h / 2, -edge);
        if (side === 1) m.position.set(t, h / 2, edge);
        if (side === 2) m.position.set(edge, h / 2, t);
        if (side === 3) m.position.set(-edge, h / 2, t);
        if (side >= 2) m.rotation.y = Math.PI / 2;
        m.castShadow = !near;
        m.receiveShadow = true;
        this.scene.add(m);
      }
    }
  }

  buildPillars() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.85, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 0.9, flatShading: true });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.8, 0.5) });
    const layout = [
      { x: -7, z: -7, h: 4.2, torch: true },
      { x: 7, z: -7, h: 4.2, torch: true },
      { x: -7, z: 7, h: 4.2, torch: true },
      { x: 7, z: 7, h: 4.2, torch: true },
      { x: 0, z: -11, h: 1.4, torch: false },
      { x: -11, z: 1, h: 1.1, torch: false },
    ];
    for (const L of layout) {
      const r = 0.8;
      const g = new THREE.Group();
      g.position.set(L.x, 0, L.z);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, L.h, 8), stone);
      shaft.position.y = L.h / 2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, 0.4, r * 2.4), dark);
      base.position.y = 0.2;
      g.add(shaft, base);
      if (L.h > 2) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.3, 0.35, r * 2.3), dark);
        cap.position.y = L.h;
        g.add(cap);
      }
      g.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.scene.add(g);
      pillars.push({ x: L.x, z: L.z, r: r + 0.15, h: L.h + 0.2 });

      if (L.torch) {
        // Torch on the side of the pillar facing the arena center.
        const dir = new THREE.Vector3(-L.x, 0, -L.z).normalize();
        const tp = new THREE.Vector3(L.x, 2.3, L.z).addScaledVector(dir, r + 0.15);
        const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.5, 6), dark);
        holder.position.copy(tp);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 6), flameMat);
        flame.position.copy(tp).add(new THREE.Vector3(0, 0.4, 0));
        const light = new THREE.PointLight(0xff8a3c, 18, 11, 1.6);
        light.position.copy(flame.position).addScaledVector(dir, 0.3);
        this.scene.add(holder, flame, light);
        this.torches.push({ light, flame, seed: Math.random() * 100, base: 18 });
      }
    }
  }

  buildDecor() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4d4840, roughness: 1, flatShading: true });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 1, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(ARENA_HALF + 2, ARENA_HALF + 14);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.random() < 0.5) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.3, 1.1), 0), rockMat);
        m.position.set(x, 0.1, z);
        m.rotation.set(Math.random(), Math.random(), Math.random());
        m.castShadow = true;
        this.scene.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.ConeGeometry(rand(0.15, 0.3), rand(0.4, 0.9), 4), grassMat);
        m.position.set(x, 0.2, z);
        this.scene.add(m);
      }
    }
    // Drifting embers for atmosphere.
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-ARENA_HALF, ARENA_HALF);
      pos[i * 3 + 1] = rand(0.2, 6);
      pos[i * 3 + 2] = rand(-ARENA_HALF, ARENA_HALF);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: new THREE.Color(2.2, 1.0, 0.4),
        size: 0.07,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.embers);
  }

  update(dt, time) {
    for (const t of this.torches) {
      const f = 0.8 + 0.12 * Math.sin(time * 11 + t.seed) + 0.08 * Math.sin(time * 23.7 + t.seed * 2);
      t.light.intensity = t.base * f;
      t.flame.scale.set(1, 0.85 + 0.3 * f, 1);
    }
    const p = this.embers.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.35;
      if (y > 6) y = 0.2;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(time + i) * dt * 0.15);
    }
    p.needsUpdate = true;
  }
}
