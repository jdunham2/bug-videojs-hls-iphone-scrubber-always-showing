// Everything visual: the town at dusk, characters, and effects.
import * as THREE from '../vendor/three.module.js';
import { HALF } from '../shared/world.js';

export const COLORS = [0xff5d5d, 0x4da3ff, 0xffc93c, 0x5fd17a, 0xc77dff, 0xff8fc7, 0x3de0d0, 0xff9248,
  0xa3e635, 0x8d99ff, 0xf5f5f5, 0xb08968, 0x6ee7b7, 0xfca5a5, 0x93c5fd, 0xfde68a];

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Gfx {
  constructor(canvas, W) {
    this.W = W;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x3a2a55, 0.011);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.time = 0;
    this.avatars = new Map();
    this.rings = []; this.pings = []; this.prints = []; this.rocks = []; this.spin = [];
    this.printI = 0;

    this.buildSky();
    this.setWorld(W);
    this.buildViewModel();
    this.buildPools();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Swap in a different map: everything map-specific lives under this.root.
  setWorld(W) {
    if (this.root) {
      this.scene.remove(this.root);
      if (this.groundTex) this.groundTex.dispose();
    }
    this.W = W;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.lever = this.water = this.flame = this.blink = null;
    this.coins = []; this.items = []; this.beacons = [];
    const T = W.theme, u = this.sky.material.uniforms;
    u.uTop.value.set(...T.sky[0]); u.uMid.value.set(...T.sky[1]); u.uHor.value.set(...T.sky[2]); u.uGlow.value = T.glow;
    this.scene.fog.color.set(T.fog[0]); this.scene.fog.density = T.fog[1];
    this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = T.hemi[2];
    this.sun.color.set(T.sun[0]); this.sun.intensity = T.sun[1];
    this.sunMesh.material.color.set(T.disc);
    this.stars.visible = T.stars > 0; this.stars.material.opacity = T.stars;
    this.renderer.toneMappingExposure = T.exposure;
    this.buildGround();
    this.buildWorld();
  }

  // ---------- environment ----------
  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { uTop: { value: new THREE.Vector3() }, uMid: { value: new THREE.Vector3() }, uHor: { value: new THREE.Vector3() }, uGlow: { value: 0.6 } },
        vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `varying vec3 vP; uniform vec3 uTop, uMid, uHor; uniform float uGlow; void main(){ float h=vP.y;
          vec3 c=mix(uHor,uMid,smoothstep(-.03,.2,h)); c=mix(c,uTop,smoothstep(.14,.65,h));
          float sun=max(0.,dot(vP,normalize(vec3(-.75,.12,-.55)))); c+=vec3(1.,.6,.3)*pow(sun,24.)*uGlow;
          gl_FragColor=vec4(c,1.); }`,
      }),
    );
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);

    const sp = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2, v = 0.25 + Math.random() * 0.75;
      const rr = Math.sqrt(1 - v * v) * 380;
      sp.push(Math.cos(u) * rr, v * 380, Math.sin(u) * rr);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    this.scene.add(this.stars);

    const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 12), new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
    sun.position.set(-0.75, 0.1, -0.55).normalize().multiplyScalar(370);
    this.sunMesh = sun;
    this.scene.add(sun);

    this.hemi = new THREE.HemisphereLight(0x8f93e0, 0x33284a, 1.25);
    this.scene.add(this.hemi);
    const d = (this.sun = new THREE.DirectionalLight(0xff9a66, 2.2));
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    const sc = d.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
    d.shadow.bias = -0.0006; d.shadow.normalBias = 0.04;
    this.scene.add(d, d.target);
  }

  buildGround() {
    const W = this.W, T = W.theme, S = 2048, k = S / (HALF * 2), C = S / 2;
    const px = (v) => (v + HALF) * k;
    const speckle = (g, cols, n, alpha) => {
      g.globalAlpha = alpha;
      for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 5, 2 + Math.random() * 5); }
      g.globalAlpha = 1;
    };
    const plaza = (g, fill, stroke) => {
      g.fillStyle = fill;
      g.beginPath(); g.arc(C, C, 9.5 * k, 0, 7); g.fill();
      g.strokeStyle = stroke; g.lineWidth = 2;
      for (let r = 2; r < 10; r += 1.5) { g.beginPath(); g.arc(C, C, r * k, 0, 7); g.stroke(); }
      for (let a = 0; a < 24; a++) { g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a * 0.2618) * 9.5 * k, C + Math.sin(a * 0.2618) * 9.5 * k); g.stroke(); }
    };
    const paint = {
      town: (g) => {
        g.fillStyle = '#3f6b3a'; g.fillRect(0, 0, S, S);
        speckle(g, ['#497a40', '#356033', '#5a8a45', '#2f5730', '#6b9150'], 26000, 0.5);
        g.fillStyle = '#4a4654';
        g.fillRect(0, px(-3.2), S, 6.4 * k);
        g.fillRect(px(-3.2), px(-29), 6.4 * k, 58 * k);
        g.strokeStyle = '#d9c98a'; g.lineWidth = 3; g.setLineDash([22, 22]);
        g.beginPath(); g.moveTo(0, C); g.lineTo(S, C); g.moveTo(C, px(-29)); g.lineTo(C, px(29)); g.stroke();
        g.setLineDash([]);
        plaza(g, '#8b7f8f', '#6e6475');
        g.fillStyle = '#5c5566'; g.fillRect(px(-3.4), px(9.6), 6.8 * k, 6.8 * k);
        g.fillStyle = '#6b5a45'; g.fillRect(px(-10), px(30), 20 * k, 12 * k);
      },
      camp: (g) => {
        g.fillStyle = '#eaf0f6'; g.fillRect(0, 0, S, S);
        speckle(g, ['#dfe7f0', '#f7fafd', '#d3dde9', '#ffffff'], 22000, 0.6);
        // trodden trails from the fire to each cabin
        g.strokeStyle = '#c9c2b6'; g.lineWidth = 2.6 * k; g.lineCap = 'round';
        for (const h of W.houses) { g.beginPath(); g.moveTo(C, C); g.quadraticCurveTo(px(h.x * 0.2), px(h.z * 0.75), px(h.x * 0.86), px(h.z * 0.84)); g.stroke(); }
        const [x, z, rx, rz] = W.pond;
        g.fillStyle = '#a9d4ee'; g.beginPath(); g.ellipse(px(x), px(z), rx * k, rz * k, 0, 0, 7); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 3;
        for (let i = 0; i < 14; i++) { const a = px(x + (Math.random() - 0.5) * rx * 1.3), b = px(z + (Math.random() - 0.5) * rz * 1.3); g.beginPath(); g.moveTo(a, b); g.lineTo(a + 60 * (Math.random() - 0.3), b + 30 * (Math.random() - 0.5)); g.stroke(); }
        g.strokeStyle = '#7fb6d6'; g.lineWidth = 6; g.beginPath(); g.ellipse(px(x), px(z), rx * k, rz * k, 0, 0, 7); g.stroke();
        plaza(g, '#bdb4a8', '#a39a8e');
        g.fillStyle = '#9a9186'; g.fillRect(px(-3.4), px(9.6), 6.8 * k, 6.8 * k);
      },
      docks: (g) => {
        g.fillStyle = '#3d424c'; g.fillRect(0, 0, S, S);
        speckle(g, ['#454a55', '#353a43', '#4d525d', '#2f333b'], 24000, 0.6);
        g.fillStyle = '#2b2e36';
        g.fillRect(0, px(-7), S, 14 * k); g.fillRect(px(-7), 0, 14 * k, S);
        g.strokeStyle = '#e0b23a'; g.lineWidth = 4;
        for (const v of [-7, 7]) { g.beginPath(); g.moveTo(0, px(v)); g.lineTo(S, px(v)); g.moveTo(px(v), 0); g.lineTo(px(v), S); g.stroke(); }
        g.setLineDash([26, 26]); g.strokeStyle = '#c9ccd4';
        g.beginPath(); g.moveTo(0, C); g.lineTo(S, C); g.moveTo(C, 0); g.lineTo(C, S); g.stroke();
        g.setLineDash([]);
        // painted bay numbers in the container yard
        g.fillStyle = 'rgba(224,178,58,0.5)'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
        let n = 1;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let a = 0; a < 4; a++) g.fillText('B' + n++, px(sx * (12.5 + a * 9)), px(sz * 8.6) + (sz > 0 ? 40 : -8));
        plaza(g, '#555a66', '#e0b23a');
        g.fillStyle = '#23262d'; g.fillRect(px(-3.4), px(9.6), 6.8 * k, 6.8 * k);
      },
    };
    const tex = (this.groundTex = canvasTex(S, S, (g) => {
      paint[W.id](g);
      speckle(g, ['#000000', '#ffffff'], 9000, 0.07);
    }));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 2, HALF * 2 + 2), new THREE.MeshStandardMaterial({ map: tex, roughness: W.id === 'docks' ? 0.75 : 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    // distant hills so the world doesn't end at the wall
    const hill = std(T.hills);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, rr = 95 + Math.random() * 30, s = 18 + Math.random() * 22;
      const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * (0.5 + Math.random() * 0.6), 6), hill);
      m.position.set(Math.cos(a) * rr, s * 0.2, Math.sin(a) * rr);
      this.root.add(m);
    }
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), std(T.outer));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05;
    this.root.add(outer);
  }

  mesh(geo, mat, x, y, z, parent = this.root, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  buildWorld() {
    const W = this.W, T = W.theme, unit = new THREE.BoxGeometry(1, 1, 1);
    const box = (b, mat, h = b.h, y0 = 0) => {
      const m = this.mesh(unit, mat, b.x, y0 + h / 2, b.z);
      m.scale.set(b.w, h, b.d);
      return m;
    };
    const wood = canvasTex(128, 128, (g) => {
      g.fillStyle = '#a8763e'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#6e4a22'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
      g.beginPath(); g.moveTo(6, 6); g.lineTo(122, 122); g.moveTo(122, 6); g.lineTo(6, 122); g.stroke();
      g.lineWidth = 2;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
    });
    const M = {
      wall: std({ town: 0x6d6a85, camp: 0x7a5a3c, docks: 0x4a505c }[W.id]), hedge: std(0x2f6b3a, { roughness: 1 }), crate: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }),
      trunk: std(0x5b3d28), fence: std(0x8a6a48), rock: std(0x7b7a8c), barrel: std(0xb5533c, { metalness: 0.3, roughness: 0.6 }),
      bench: std(0x8a6a48), bed: std(0x7fa7d9), pillow: std(0xf3efe6), table: std(0x9a6b42), sofa: std(0xb0567a), shelf: std(0x7a5a3c),
      locker: std(0x5f7f9a, { metalness: 0.5, roughness: 0.5 }), dark: std(0x1c1c26), dumpster: std(0x2f7d5b, { metalness: 0.3, roughness: 0.6 }),
      metal: std(0x9aa0b5, { metalness: 0.8, roughness: 0.35 }), glass: new THREE.MeshBasicMaterial({ color: 0xffd28a }),
      floor: std(0x8b6b4a), roof: std(T.roof), snow: std(0xf4f7fb, { roughness: 1 }), flame: new THREE.MeshBasicMaterial({ color: 0xff9a3c }), stone: std(0x9c97ab), water: new THREE.MeshStandardMaterial({ color: 0x66d9ff, emissive: 0x2288cc, emissiveIntensity: 0.9, roughness: 0.1, transparent: true, opacity: 0.85 }),
      bulb: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), tire: std(0x16161c), red: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
    };
    this.M = M;
    const leaf = (T.snow ? [0x2c6b48, 0x357a55, 0x24583c, 0x2f7050] : [0x2f7d3f, 0x3e9150, 0x276b45, 0xd9822b, 0xc45a2a, 0x4aa05a]).map((c) => std(c, { roughness: 1 }));
    const corr = canvasTex(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c4c4c4'; g.fillRect(i * 8, 0, 8, 64); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3); });
    const boxMats = new Map();
    const boxMat = (c) => boxMats.get(c) || (boxMats.set(c, new THREE.MeshStandardMaterial({ color: c, map: corr, metalness: 0.35, roughness: 0.6 })), boxMats.get(c));
    const ball = new THREE.SphereGeometry(1, 12, 9);
    const wallMats = new Map();
    const wallMat = (c) => wallMats.get(c) || (wallMats.set(c, std(c)), wallMats.get(c));
    const cone = new THREE.ConeGeometry(1, 1, 7), ico = new THREE.IcosahedronGeometry(1, 0), cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const win = new THREE.PlaneGeometry(1.3, 1.0);

    for (const b of W.boxes) {
      switch (b.kind) {
        case 'wall': box(b, M.wall); break;
        case 'hwall': {
          box(b, wallMat(b.color));
          const len = Math.max(b.w, b.d);
          if (!b.inner && len >= 3.2) {
            const n = Math.max(1, Math.floor(len / 4.5));
            for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
              const off = ((i + 0.5) / n - 0.5) * len;
              const m = this.mesh(win, M.glass, b.x, 1.75, b.z, this.root, false);
              if (b.w > b.d) { m.position.x += off; m.position.z += s * (b.d / 2 + 0.012); m.rotation.y = s > 0 ? 0 : Math.PI; }
              else { m.position.z += off; m.position.x += s * (b.w / 2 + 0.012); m.rotation.y = (s * Math.PI) / 2; }
            }
          }
          break;
        }
        case 'hedge': box(b, M.hedge); break;
        case 'crate': for (let y = 0; y < b.h - 0.1; y += 1.3) { const m = this.mesh(unit, M.crate, b.x, y + 0.65, b.z); m.scale.set(1.3, 1.3, 1.3); m.rotation.y = y ? 0.12 : 0; } break;
        case 'tree': {
          const t = this.mesh(cyl, M.trunk, b.x, 1.3, b.z);
          t.scale.set(0.28, 2.6, 0.28);
          const mat = leaf[(b.v * leaf.length) | 0], s = 0.85 + b.v * 0.5;
          if (b.v < 0.55) {
            for (let i = 0; i < 3; i++) { const c = this.mesh(cone, mat, b.x, 2.6 + i * 1.25 * s, b.z); c.scale.set((2.1 - i * 0.5) * s, 2.2 * s, (2.1 - i * 0.5) * s); c.rotation.y = i; }
            if (T.snow) { const c = this.mesh(cone, M.snow, b.x, 2.6 + 2.9 * s, b.z); c.scale.set(0.8 * s, 1.5 * s, 0.8 * s); }
          }
          else { const c = this.mesh(ico, mat, b.x, 3.9, b.z); c.scale.set(2.1 * s, 1.9 * s, 2.1 * s); c.rotation.set(b.v * 5, b.v * 9, 0); const c2 = this.mesh(ico, mat, b.x + 1 * s, 3.1, b.z + 0.5); c2.scale.setScalar(1.15 * s); }
          break;
        }
        case 'fence': {
          const long = b.w > b.d;
          for (let i = -2.75; i <= 2.75; i += 0.5) { const p = this.mesh(unit, M.fence, b.x + (long ? i : 0), 0.9, b.z + (long ? 0 : i)); p.scale.set(long ? 0.42 : 0.12, 1.8, long ? 0.12 : 0.42); }
          break;
        }
        case 'rock': { const m = this.mesh(ico, M.rock, b.x, 0.4, b.z); m.scale.set(0.95, 0.75, 0.85); m.rotation.set(b.v * 3, b.v * 7, b.v); break; }
        case 'barrel': { const m = this.mesh(cyl, M.barrel, b.x, 0.55, b.z); m.scale.set(0.4, 1.1, 0.4); break; }
        case 'bench': box(b, M.bench, 0.12, 0.38); for (const s of [-0.8, 0.8]) { const l = this.mesh(unit, M.dark, b.x + s, 0.19, b.z); l.scale.set(0.12, 0.38, 0.5); } break;
        case 'bed': { box(b, M.bed); const long = b.d > b.w; const p = this.mesh(unit, M.pillow, b.x - (long ? 0 : b.w / 2 - 0.35), 0.68, b.z - (long ? b.d / 2 - 0.35 : 0)); p.scale.set(long ? b.w * 0.8 : 0.5, 0.16, long ? 0.5 : b.d * 0.8); break; }
        case 'table': box(b, M.table, 0.1, 0.7); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = this.mesh(unit, M.table, b.x + sx * (b.w / 2 - 0.1), 0.35, b.z + sz * (b.d / 2 - 0.1)); l.scale.set(0.1, 0.7, 0.1); } break;
        case 'sofa': box(b, M.sofa, 0.45); { const bk = this.mesh(unit, M.sofa, b.x + 0.35, 0.6, b.z); bk.scale.set(0.3, 0.9, b.d); } break;
        case 'shelf': box(b, M.shelf); break;
        case 'locker': {
          box(b, M.locker);
          for (let i = 0; i < 4; i++) for (const [dx, dz] of [[0.41, 0], [-0.41, 0], [0, 0.41], [0, -0.41]]) { const v = this.mesh(unit, M.dark, b.x + dx, 1.45 + i * 0.1, b.z + dz, this.root, false); v.scale.set(dx ? 0.02 : 0.5, 0.04, dz ? 0.02 : 0.5); }
          break;
        }
        case 'dumpster': { box(b, M.dumpster, 1.15); const lid = this.mesh(unit, M.dark, b.x, 1.22, b.z); lid.scale.set(b.w + 0.1, 0.14, b.d + 0.1); lid.rotation.z = 0.06; break; }
        case 'car': {
          const g = new THREE.Group();
          g.position.set(b.x, 0, b.z);
          if (b.turn) g.rotation.y = Math.PI / 2;
          const body = std(b.color, { metalness: 0.5, roughness: 0.4 });
          this.mesh(unit, body, 0, 0.62, 0, g).scale.set(4.4, 0.7, 1.9);
          this.mesh(unit, M.dark, 0.1, 1.2, 0, g).scale.set(2.3, 0.6, 1.7);
          for (const sx of [-1.4, 1.4]) for (const sz of [-0.95, 0.95]) { const w = this.mesh(cyl, M.tire, sx, 0.36, sz, g); w.scale.set(0.36, 0.25, 0.36); w.rotation.x = Math.PI / 2; }
          for (const sz of [-0.6, 0.6]) { this.mesh(unit, M.bulb, -2.21, 0.65, sz, g, false).scale.set(0.05, 0.18, 0.35); this.mesh(unit, M.red, 2.21, 0.65, sz, g, false).scale.set(0.05, 0.18, 0.35); }
          this.root.add(g);
          break;
        }
        case 'lamp': {
          const p = this.mesh(cyl, M.dark, b.x, 2.1, b.z); p.scale.set(0.08, 4.2, 0.08);
          this.mesh(new THREE.SphereGeometry(0.28, 10, 8), M.bulb, b.x, 4.3, b.z, this.root, false);
          const l = new THREE.PointLight(0xffc477, 55, 20, 1.8);
          l.position.set(b.x, 4.1, b.z);
          this.root.add(l);
          break;
        }
        case 'cage': {
          const long = b.w > b.d, len = Math.max(b.w, b.d);
          for (let i = -len / 2; i <= len / 2 + 0.01; i += 0.42) { const bar = this.mesh(cyl, M.metal, b.x + (long ? i : 0), 1.5, b.z + (long ? 0 : i)); bar.scale.set(0.04, 3, 0.04); }
          for (const y of [0.06, 3]) { const rail = this.mesh(unit, M.metal, b.x, y, b.z); rail.scale.set(long ? len + 0.2 : 0.12, 0.12, long ? 0.12 : len + 0.2); }
          break;
        }
        case 'lever': {
          box(b, M.dark);
          const pivot = new THREE.Group();
          pivot.position.set(b.x, 1.1, b.z);
          this.mesh(unit, M.metal, 0, 0.35, 0, pivot).scale.set(0.08, 0.7, 0.08);
          this.knobMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.4 });
          this.mesh(new THREE.SphereGeometry(0.15, 10, 8), this.knobMat, 0, 0.72, 0, pivot);
          this.root.add(pivot);
          this.lever = pivot;
          break;
        }
        case 'container': {
          for (let y = 0, n = 0; y < b.h - 0.1; y += 2.6, n++) { const m = this.mesh(unit, boxMat(n ? b.color2 : b.color), b.x + n * 0.15, y + 1.3, b.z + n * 0.1); m.scale.set(b.w, 2.6, b.d); }
          break;
        }
        case 'hidebox': {
          box(b, boxMat(b.color));
          const door = this.mesh(unit, M.dark, b.x + b.w / 2 + 0.01, 1.1, b.z, this.root, false); door.scale.set(0.04, 2.1, 1.5);
          break;
        }
        case 'logs': {
          const long = b.w > b.d, len = Math.max(b.w, b.d);
          for (const [o, y] of [[-0.3, 0.3], [0.3, 0.3], [0, 0.78]]) { const l = this.mesh(cyl, M.trunk, b.x + (long ? 0 : o), y, b.z + (long ? o : 0)); l.scale.set(0.3, len, 0.3); l.rotation.set(long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0); }
          break;
        }
        case 'snowman': {
          [[0.45, 0.42], [0.33, 1.05], [0.23, 1.5]].forEach(([r, y]) => this.mesh(ball, M.snow, b.x, y, b.z).scale.setScalar(r));
          const a = b.v * 6.28, nose = this.mesh(cone, M.flame, b.x + Math.sin(a) * 0.3, 1.5, b.z + Math.cos(a) * 0.3, this.root, false);
          nose.scale.set(0.05, 0.25, 0.05); nose.rotation.order = 'YXZ'; nose.rotation.set(Math.PI / 2, a, 0);
          break;
        }
        case 'campfire': {
          for (let i = 0; i < 9; i++) { const r = this.mesh(ico, M.rock, Math.cos(i * 0.7) * 1.5, 0.2, Math.sin(i * 0.7) * 1.5); r.scale.set(0.38, 0.3, 0.38); r.rotation.y = i; }
          for (let i = 0; i < 4; i++) { const l = this.mesh(cyl, M.trunk, 0, 0.45, 0); l.scale.set(0.14, 2.2, 0.14); l.rotation.set(0.95, i * 0.785, 0, 'YXZ'); }
          this.flame = this.mesh(cone, M.flame, 0, 1.1, 0, this.root, false);
          this.flame.scale.set(0.7, 1.9, 0.7);
          const l = new THREE.PointLight(0xff8a3c, 60, 22, 1.8);
          l.position.set(0, 1.8, 0);
          this.root.add(l);
          break;
        }
        case 'tower': {
          for (let i = 0; i < 5; i++) { const m = this.mesh(cyl, i % 2 ? M.pillow : M.barrel, 0, 0.7 + i * 1.4, 0); m.scale.set(1.2 - i * 0.12, 1.4, 1.2 - i * 0.12); }
          this.blink = this.mesh(ball, new THREE.MeshBasicMaterial({ color: 0xff4040 }), 0, 7.5, 0, this.root, false);
          this.blink.scale.setScalar(0.5);
          const l = new THREE.PointLight(0xff5040, 40, 26, 1.8);
          l.position.set(0, 7.2, 0);
          this.root.add(l);
          break;
        }
        case 'beacon': {
          box(b, M.stone, 1.0);
          const bowl = this.mesh(cyl, M.dark, b.x, 1.2, b.z); bowl.scale.set(0.5, 0.4, 0.5);
          const mat = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
          const flame = this.mesh(cone, mat, b.x, 1.9, b.z, this.root, false);
          const beam = this.mesh(cyl, new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), b.x, 30, b.z, this.root, false);
          beam.scale.set(0.3, 60, 0.3);
          this.beacons[b.bi] = { flame, beam, mat };
          break;
        }
        case 'fountain': {
          const base = this.mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.9, 16, 1), M.stone, 0, 0.45, 0);
          base.material = M.stone;
          const wtr = this.mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.05, 16), M.water, 0, 0.9, 0, this.root, false);
          this.water = wtr;
          this.mesh(cyl, M.stone, 0, 1.3, 0).scale.set(0.25, 1.6, 0.25);
          this.mesh(new THREE.SphereGeometry(0.4, 10, 8), M.water, 0, 2.25, 0, this.root, false);
          const l = new THREE.PointLight(0x55ccff, 14, 12, 1.8);
          l.position.set(0, 1.6, 0);
          this.root.add(l);
          break;
        }
      }
    }

    // Houses: floor, ceiling, pitched roof, warm interior light
    for (const h of W.houses) {
      const f = this.mesh(unit, M.floor, h.x, 0.02, h.z, this.root, false); f.scale.set(h.w, 0.04, h.d);
      const c = this.mesh(unit, M.roof, h.x, h.h + 0.12, h.z); c.scale.set(h.w + 0.9, 0.25, h.d + 0.9);
      const p = this.mesh(new THREE.ConeGeometry(0.72, 1, 4), M.roof, h.x, h.h + 0.25 + 1.2, h.z);
      p.rotation.y = Math.PI / 4;
      const g = new THREE.Group(); // scale along world axes after the 45° turn
      g.position.copy(p.position); p.position.set(0, 0, 0); g.add(p); g.scale.set(h.w + 0.9, 2.4, h.d + 0.9);
      this.root.add(g);
      const l = new THREE.PointLight(0xffb060, 30, 15, 1.8);
      l.position.set(h.x, h.h - 0.6, h.z);
      this.root.add(l);
    }

    // Hiding bushes
    const bushMat = std(0x2e8b47, { roughness: 1 }), bushMat2 = std(0x3fa35a, { roughness: 1 });
    for (const s of W.spots) {
      if (s.kind === 'tent') {
        const t = this.mesh(new THREE.ConeGeometry(1.75, 2.3, 4), std([0xe07a3c, 0x3c9ae0, 0xd9c23c, 0xc94f6d][s.id % 4]), s.x, 1.15, s.z);
        t.rotation.y = Math.PI / 4 + s.id;
        continue;
      }
      if (s.kind !== 'bush' && s.kind !== 'snowdrift') continue;
      const snowy = s.kind === 'snowdrift';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05, rr = i < 5 ? 0.75 : 0;
        const m = this.mesh(ico, snowy ? M.snow : i % 2 ? bushMat : bushMat2, s.x + Math.cos(a) * rr, i < 5 ? 0.75 : 1.35, s.z + Math.sin(a) * rr);
        m.scale.setScalar(i < 5 ? 0.85 : 1.0);
        m.rotation.set(i, i * 2, i * 3);
      }
    }

    // Coins
    this.coins = [];
    const cg = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 14);
    cg.rotateX(Math.PI / 2);
    const cm = new THREE.MeshStandardMaterial({ color: 0xffd447, emissive: 0xffa800, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 });
    for (const c of W.coins) this.coins.push(this.mesh(cg, cm, c.x, 0.9, c.z));
    // Power-up boxes
    const qm = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#7a3cff'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#d9c2ff'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58); g.fillStyle = '#fff'; g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 35); }) });
    for (const it of W.items) { const m = this.mesh(unit, qm, it.x, 1, it.z, this.root, false); m.scale.setScalar(0.62); this.items.push(m); }
  }

  buildViewModel() {
    // The seeker's flashlight, held in first person
    const g = (this.torch = new THREE.Group());
    g.position.set(0.3, -0.26, -0.5);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.32, 10), std(0x22222c, { metalness: 0.6, roughness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.06, 10), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    lens.rotation.x = Math.PI / 2; lens.position.z = -0.18;
    g.add(body, lens);
    g.scale.setScalar(0.6);
    this.camera.add(g);
    const s = (this.spot = new THREE.SpotLight(0xfff0c8, 260, 34, 0.5, 0.45, 1.6));
    s.position.set(0.3, -0.2, -0.3);
    s.target.position.set(0.1, -0.15, -6);
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.camera.near = 0.3; s.shadow.camera.far = 34;
    this.camera.add(s, s.target);
    this.setSeekerView(false);
  }
  setSeekerView(on) { this.torch.visible = on; this.spot.visible = on; }
  swing() { this.swingT = 0.25; }

  buildPools() {
    const ringG = new THREE.RingGeometry(0.82, 1, 40);
    ringG.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      this.scene.add(m);
      this.rings.push({ m, t: 1, dur: 1, r: 1 });
    }
    const pingTex = canvasTex(128, 128, (g) => {
      g.strokeStyle = '#ffdf6b'; g.lineWidth = 9; g.lineCap = 'round';
      for (const r of [22, 40, 58]) { g.beginPath(); g.arc(64, 64, r, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(64, 64, r, Math.PI - 0.9, Math.PI + 0.9); g.stroke(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 9, 0, 7); g.fill();
    });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pingTex, transparent: true, depthTest: false, opacity: 0 }));
      s.visible = false; s.renderOrder = 50;
      this.scene.add(s);
      this.pings.push({ s, t: 9 });
    }
    const pg = new THREE.PlaneGeometry(0.2, 0.36);
    pg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x15101c, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      this.scene.add(m);
      this.prints.push({ m, t: 99 });
    }
  }

  // ---------- characters ----------
  addAvatar(id, colorIdx, name) {
    const col = COLORS[colorIdx % COLORS.length];
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const mat = std(col, { flatShading: false, roughness: 0.6 });
    const body = this.mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 12), mat, 0, 0.92, 0, inner);
    const head = this.mesh(new THREE.SphereGeometry(0.3, 14, 10), mat, 0, 1.58, 0, inner);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff }), pupM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const sx of [-0.11, 0.11]) {
      this.mesh(new THREE.SphereGeometry(0.075, 8, 6), eyeM, sx, 1.62, -0.25, inner, false);
      this.mesh(new THREE.SphereGeometry(0.036, 6, 5), pupM, sx, 1.62, -0.315, inner, false);
    }
    const legG = new THREE.BoxGeometry(0.17, 0.46, 0.2);
    legG.translate(0, -0.23, 0);
    const dark = std(0x23202e);
    const legs = [-0.15, 0.15].map((sx) => this.mesh(legG, dark, sx, 0.46, 0, inner));
    const armG = new THREE.SphereGeometry(0.11, 8, 6);
    const arms = [-0.42, 0.42].map((sx) => this.mesh(armG, mat, sx, 0.95, 0, inner));
    // hider kit: backpack + beanie
    const hider = new THREE.Group();
    this.mesh(new THREE.BoxGeometry(0.4, 0.45, 0.2), std(0x4a3f66), 0, 1.0, 0.33, hider);
    const beanie = this.mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf1f1f1), 0, 1.62, 0, hider);
    beanie.scale.y = 0.8;
    // seeker kit: glowing visor, cap, flashlight beam
    const seeker = new THREE.Group();
    this.mesh(new THREE.BoxGeometry(0.5, 0.11, 0.12), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 1.63, -0.24, seeker, false);
    this.mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.16, 12), std(0x1c1c26), 0, 1.84, 0, seeker);
    this.mesh(new THREE.BoxGeometry(0.4, 0.04, 0.3), std(0x1c1c26), 0, 1.78, -0.36, seeker);
    const bg = new THREE.ConeGeometry(2.2, 9, 18, 1, true);
    bg.translate(0, -4.5, 0); bg.rotateX(Math.PI / 2);
    const beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.set(0.3, 1.25, -0.3);
    seeker.add(beam);
    inner.add(hider, seeker);
    // name tag
    const tex = canvasTex(256, 64, (c) => {
      c.font = 'bold 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(name, 128, 34);
      c.fillStyle = '#' + col.toString(16).padStart(6, '0'); c.fillText(name, 128, 34);
    });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    tag.scale.set(1.9, 0.48, 1); tag.position.y = 2.3;
    g.add(tag);
    // "dazed" stars
    const stun = new THREE.Group();
    for (let i = 0; i < 3; i++) { const s = this.mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffe14d }), Math.cos(i * 2.09) * 0.4, 2.05, Math.sin(i * 2.09) * 0.4, stun, false); s.userData.a = i * 2.09; }
    g.add(stun);
    g.visible = false;
    this.scene.add(g);
    const a = { g, inner, legs, arms, hider, seeker, tag, stun, body, head, phase: Math.random() * 6, x: 0, z: 0, r: 0, init: false };
    this.avatars.set(id, a);
    return a;
  }
  removeAvatar(id) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.scene.remove(a.g);
    a.g.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
    this.avatars.delete(id);
  }
  // s: {x,z,r,visible,moving,sprint,crouch,seeker,showTag,stunned,immune}
  updateAvatar(id, s, dt) {
    const a = this.avatars.get(id);
    if (!a) return;
    a.g.visible = s.visible;
    if (!a.init || Math.hypot(s.x - a.x, s.z - a.z) > 6) { a.x = s.x; a.z = s.z; a.r = s.r; a.init = true; }
    const k = Math.min(1, dt * 12);
    a.x += (s.x - a.x) * k; a.z += (s.z - a.z) * k;
    let dr = s.r - a.r;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    a.r += dr * k;
    a.g.position.set(a.x, 0, a.z);
    a.g.rotation.y = a.r;
    if (!s.visible) return;
    a.phase += dt * (s.sprint ? 15 : s.crouch ? 6 : 10) * (s.moving ? 1 : 0);
    const sw = s.moving ? Math.sin(a.phase) * (s.sprint ? 0.9 : 0.55) : 0;
    a.legs[0].rotation.x = sw; a.legs[1].rotation.x = -sw;
    a.arms[0].position.z = -sw * 0.25; a.arms[1].position.z = sw * 0.25;
    const sy = s.crouch ? 0.62 : 1;
    a.inner.scale.y += (sy - a.inner.scale.y) * Math.min(1, dt * 14);
    a.jt = s.jump ? (a.jt || 0) + dt : 0;
    a.inner.position.y = (s.moving ? Math.abs(Math.sin(a.phase)) * 0.06 : Math.sin(this.time * 2 + a.phase) * 0.012) + Math.sin(Math.min(1, a.jt / 0.72) * Math.PI) * 0.95;
    a.inner.rotation.x = s.sprint ? -0.18 : 0;
    a.hider.visible = !s.seeker; a.seeker.visible = s.seeker;
    a.tag.visible = s.showTag;
    a.tag.position.y = 2.3 * a.inner.scale.y + 0.1;
    a.stun.visible = s.stunned;
    if (s.stunned) a.stun.rotation.y = this.time * 5;
    const blink = s.immune && Math.sin(this.time * 20) > 0;
    a.inner.visible = !blink;
  }

  // ---------- effects ----------
  ring(x, z, r, color, dur = 1) {
    const o = this.rings.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    o.t = 0; o.dur = dur; o.r = r;
    o.m.material.color.set(color);
    o.m.position.set(x, 0.08, z);
    o.m.visible = true;
  }
  ping(x, z) {
    const o = this.pings.reduce((a, b) => (a.t > b.t ? a : b));
    o.t = 0;
    o.s.position.set(x, 1.4, z);
    o.s.visible = true;
  }
  footprint(x, z, r, side) {
    const o = this.prints[this.printI++ % this.prints.length];
    o.t = 0;
    o.m.position.set(x + Math.cos(r) * 0.14 * side, 0.03, z - Math.sin(r) * 0.14 * side);
    o.m.rotation.y = r;
    o.m.visible = true;
  }
  throwRock(fx, fz, x, z) {
    const m = this.mesh(new THREE.IcosahedronGeometry(0.12, 0), this.M.rock, fx, 1.4, fz, this.scene, false);
    this.rocks.push({ m, fx, fz, x, z, t: 0 });
  }
  setCoins(taken) { this.coins.forEach((c, i) => (c.visible = !taken.has(i))); }
  setItems(taken) { this.items.forEach((c, i) => (c.visible = !taken.has(i))); }

  frame(dt, cam, env) {
    this.time += dt;
    const t = this.time, c = this.camera;
    c.position.set(cam.x, cam.y, cam.z);
    c.rotation.set(cam.pitch, cam.yaw, 0);
    this.sky.position.copy(c.position);
    this.stars.position.copy(c.position);
    this.sun.position.set(cam.x - 60, 34, cam.z - 44);
    this.sun.target.position.set(cam.x, 0, cam.z);
    // viewmodel sway + tag jab
    this.swingT = Math.max(0, (this.swingT || 0) - dt);
    const jab = Math.sin((this.swingT / 0.25) * Math.PI);
    this.torch.position.set(0.3 + Math.sin(cam.bob) * 0.012, -0.26 + Math.abs(Math.cos(cam.bob)) * 0.014, -0.5 - jab * 0.28);
    this.torch.rotation.x = jab * 0.5;

    for (let i = 0; i < this.coins.length; i++) { const m = this.coins[i]; m.rotation.y = t * 2.4 + i; m.position.y = 0.9 + Math.sin(t * 2 + i) * 0.12; }
    if (this.water) this.water.material.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.2;
    for (let i = 0; i < this.items.length; i++) { const m = this.items[i]; m.rotation.set(t * 0.9, t * 1.6 + i, 0); m.position.y = 1 + Math.sin(t * 2.4 + i * 2) * 0.15; }
    if (this.flame) this.flame.scale.set(0.7 + Math.sin(t * 13) * 0.08, 1.9 + Math.sin(t * 9) * 0.25, 0.7 + Math.cos(t * 11) * 0.08);
    if (this.blink) this.blink.visible = Math.sin(t * 3) > -0.3;
    this.beacons.forEach((b, i) => {
      const v = (env.bc && env.bc[i]) || 0, lit = v >= 1;
      b.mat.color.set(lit ? 0x6dff8a : 0x66e0ff);
      b.beam.material.color.set(lit ? 0x6dff8a : 0x66e0ff);
      b.beam.material.opacity = lit ? 0.45 : 0.08 + v * 0.15;
      b.flame.visible = v > 0;
      b.flame.scale.set(0.3 + v * 0.15, (0.3 + v * 0.9) * (1 + Math.sin(t * 12 + i) * 0.1), 0.3 + v * 0.15);
    });
    if (this.lever) {
      this.lever.rotation.z = -0.7 + env.res * 1.4;
      this.knobMat.emissiveIntensity = env.jailed ? 1.2 + Math.sin(t * 6) * 0.8 : 0.3;
    }
    for (const o of this.rings) {
      if (!o.m.visible) continue;
      o.t += dt;
      const k = o.t / o.dur;
      if (k >= 1) { o.m.visible = false; continue; }
      const s = 0.3 + (o.r - 0.3) * (1 - (1 - k) * (1 - k));
      o.m.scale.set(s, 1, s);
      o.m.material.opacity = (1 - k) * 0.7;
    }
    for (const o of this.pings) {
      if (!o.s.visible) continue;
      o.t += dt;
      if (o.t > 1.8) { o.s.visible = false; continue; }
      const d = o.s.position.distanceTo(c.position), s = Math.max(0.9, d * 0.07) * (1 + Math.sin(o.t * 10) * 0.08);
      o.s.scale.set(s, s, 1);
      o.s.material.opacity = Math.min(1, (1.8 - o.t) * 1.4);
    }
    for (const o of this.prints) {
      if (!o.m.visible) continue;
      o.t += dt;
      if (o.t > 12) { o.m.visible = false; continue; }
      o.m.material.opacity = 0.55 * (1 - o.t / 12);
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const o = this.rocks[i];
      o.t += dt / 0.65;
      if (o.t >= 1) { this.scene.remove(o.m); this.rocks.splice(i, 1); continue; }
      o.m.position.set(o.fx + (o.x - o.fx) * o.t, 1.4 * (1 - o.t) + Math.sin(o.t * Math.PI) * 3.2, o.fz + (o.z - o.fz) * o.t);
      o.m.rotation.x += dt * 12;
    }
    this.renderer.render(this.scene, c);
  }
}
