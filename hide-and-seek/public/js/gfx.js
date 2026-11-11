// Everything visual: the town at dusk, characters, and effects.
import * as THREE from '../vendor/three.module.js';
import { HALF, FLOOR_H } from '../shared/world.js';

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
    // A fixed pool of point lights that follows the player around: each map has far more lamps than a phone can shade at once
    this.pool = [];
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffffff, 0, 20, 1.8); this.scene.add(l); this.pool.push(l); }
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
    this.coins = []; this.items = []; this.beacons = []; this.sites = []; this.siteT = 0;
    this.applyTheme();
    this.buildGround();
    this.buildWorld();
  }

  // Lighting and sky for the current map. Blackout mode overrides it with near-total darkness.
  applyTheme() {
    const T = this.W.theme, u = this.sky.material.uniforms, D = this.dark;
    const k = D ? 0.06 : 1;
    u.uTop.value.set(...T.sky[0]).multiplyScalar(k); u.uMid.value.set(...T.sky[1]).multiplyScalar(k); u.uHor.value.set(...T.sky[2]).multiplyScalar(k); u.uGlow.value = D ? 0 : T.glow;
    this.scene.fog.color.set(D ? 0x020308 : T.fog[0]); this.scene.fog.density = D ? 0.05 : T.fog[1];
    this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = D ? 0.14 : T.hemi[2];
    this.sun.color.set(T.sun[0]); this.sun.intensity = D ? 0.04 : T.sun[1];
    this.sunMesh.material.color.set(T.disc); this.sunMesh.visible = !D;
    this.stars.visible = D || T.stars > 0; this.stars.material.opacity = D ? 1 : T.stars;
    this.renderer.toneMappingExposure = D ? 1.15 : T.exposure;
  }
  setDark(on) {
    if (!!on === !!this.dark) return;
    this.dark = !!on;
    this.applyTheme();
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
      cove: (g) => {
        g.fillStyle = '#ead9a6'; g.fillRect(0, 0, S, S);
        speckle(g, ['#f2e4b8', '#dcc88f', '#f7ecc8', '#d2bd84'], 26000, 0.6);
        // surf along the edges and the lagoon
        const [x, z, rx, rz] = W.pond;
        for (const [col, grow] of [['#f7f3df', 1.6], ['#7fd6e0', 0.6], ['#3fb2d0', -0.6]]) {
          g.fillStyle = col;
          g.beginPath(); g.ellipse(px(x), px(z), (rx + grow) * k, (rz + grow) * k, 0, 0, 7); g.fill();
        }
        g.fillStyle = '#7fd6e0';
        for (const r of [[0, 0, S, 5 * k], [0, S - 5 * k, S, 5 * k], [0, 0, 5 * k, S], [S - 5 * k, 0, 5 * k, S]]) g.fillRect(...r);
        g.strokeStyle = '#c9b27a'; g.lineWidth = 2.4 * k; g.lineCap = 'round';
        for (const h of W.houses) { g.beginPath(); g.moveTo(C, C); g.quadraticCurveTo(px(h.x * 0.3), px(h.z * 0.7), px(h.x * 0.86), px(h.z * 0.86)); g.stroke(); }
        plaza(g, '#d6c08a', '#b89f66');
        g.fillStyle = '#b89f66'; g.fillRect(px(-3.4), px(9.6), 6.8 * k, 6.8 * k);
      },
      grave: (g) => {
        g.fillStyle = '#2b3a30'; g.fillRect(0, 0, S, S);
        speckle(g, ['#33443a', '#24322a', '#3a4a3c', '#1f2b25', '#44503f'], 26000, 0.55);
        g.strokeStyle = '#4a4438'; g.lineWidth = 3 * k; g.lineCap = 'round';
        for (const [a, b, c, d] of [[0, -60, 0, 46], [-62, 0, 62, 0], [-54, -44, 0, 0], [56, 44, 0, 0]]) { g.beginPath(); g.moveTo(px(a), px(b)); g.lineTo(px(c), px(d)); g.stroke(); }
        plaza(g, '#5a5866', '#3f3d4a');
        g.fillStyle = '#34323c'; g.fillRect(px(-3.4), px(9.6), 6.8 * k, 6.8 * k);
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
      const a = (i / 26) * Math.PI * 2, rr = HALF * 1.6 + Math.random() * 45, s = 26 + Math.random() * 30;
      const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * (0.5 + Math.random() * 0.6), 6), hill);
      m.position.set(Math.cos(a) * rr, s * 0.2, Math.sin(a) * rr);
      this.root.add(m);
    }
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), std(T.outer));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05;
    this.root.add(outer);
  }

  site(x, y, z, color, intensity, dist) { this.sites.push({ x, y, z, color, intensity, dist }); }
  mesh(geo, mat, x, y, z, parent = this.cur || this.root, shadow = true) {
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
      wall: std({ town: 0x6d6a85, camp: 0x7a5a3c, docks: 0x4a505c, cove: 0xc9b382, grave: 0x3a3d48 }[W.id]), hedge: std(0x2f6b3a, { roughness: 1 }), crate: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }),
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

    const upperG = new THREE.Group(); // everything that stands on an upstairs floor
    upperG.position.y = FLOOR_H;
    this.root.add(upperG);
    for (const b of W.boxes) {
      const par = (this.cur = b.lv === 1 ? upperG : this.root);
      switch (b.kind) {
        case 'rail': box(b, M.dark, 0.08, 0.92); { const long = b.w > b.d, len = Math.max(b.w, b.d); for (let i = -len / 2; i <= len / 2 + 0.01; i += 0.5) { const q = this.mesh(unit, M.dark, b.x + (long ? i : 0), 0.46, b.z + (long ? 0 : i)); q.scale.set(0.06, 0.92, 0.06); } } break;
        case 'wall': box(b, M.wall); break;
        case 'hwall': {
          box(b, wallMat(b.color));
          const len = Math.max(b.w, b.d);
          if (!b.inner && len >= 3.2) {
            const n = Math.max(1, Math.floor(len / 4.5));
            for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
              const off = ((i + 0.5) / n - 0.5) * len;
              const m = this.mesh(win, M.glass, b.x, 1.75, b.z, par, false);
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
        case 'post': box(b, M.trunk); break;
        case 'palm': {
          const lean = (b.v - 0.5) * 0.5, h = 4.6 + b.v * 1.6;
          const tr = this.mesh(cyl, M.trunk, b.x + Math.sin(lean) * h * 0.25, h / 2, b.z); tr.scale.set(0.18, h, 0.18); tr.rotation.z = -lean * 0.5;
          const tx = b.x + Math.sin(lean) * h * 0.5;
          for (let i = 0; i < 7; i++) { const f = this.mesh(unit, leaf[i % 3], tx, h - 0.1, b.z); f.scale.set(0.5, 0.06, 2.6); f.rotation.order = 'YXZ'; f.rotation.set(-0.5, i * 0.9 + b.v * 3, 0); f.translateZ(1.2); }
          for (let i = 0; i < 3; i++) this.mesh(ball, M.trunk, tx + Math.cos(i * 2.1) * 0.2, h - 0.35, b.z + Math.sin(i * 2.1) * 0.2).scale.setScalar(0.16);
          break;
        }
        case 'deadtree': {
          const t = this.mesh(cyl, M.dark, b.x, 1.7, b.z); t.scale.set(0.22, 3.4, 0.22);
          for (let i = 0; i < 4; i++) { const br = this.mesh(cyl, M.dark, b.x, 2.6 + i * 0.35, b.z); br.scale.set(0.06, 1.8 - i * 0.25, 0.06); br.rotation.order = 'YXZ'; br.rotation.set(0.9 + b.v * 0.4, i * 1.7 + b.v * 6, 0); br.translateY(0.8 - i * 0.1); }
          break;
        }
        case 'boat': {
          const long = b.w > b.d;
          box(b, M.fence, 0.55);
          const rim = this.mesh(unit, M.trunk, b.x, 0.62, b.z); rim.scale.set(b.w + 0.12, 0.12, b.d + 0.12);
          const seat = this.mesh(unit, M.table, b.x, 0.7, b.z); seat.scale.set(long ? 0.3 : b.w, 0.06, long ? b.d : 0.3);
          const oar = this.mesh(cyl, M.table, b.x + (long ? 0.3 : 0.9), 0.5, b.z + (long ? 0.9 : 0.3)); oar.scale.set(0.035, 2.2, 0.035); oar.rotation.set(long ? 0 : 1.3, 0, long ? 1.3 : 0);
          break;
        }
        case 'sandcastle': {
          const sand = M.sand || (M.sand = std(0xe6cf8f, { roughness: 1 }));
          box(b, sand, 0.5);
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const tw = this.mesh(cyl, sand, b.x + sx * 0.6, 0.55, b.z + sz * 0.6); tw.scale.set(0.24, 1.1, 0.24); const c = this.mesh(cone, sand, b.x + sx * 0.6, 1.3, b.z + sz * 0.6); c.scale.set(0.3, 0.4, 0.3); }
          const flag = this.mesh(unit, M.red, b.x + 0.12, 1.25, b.z, par, false); flag.scale.set(0.25, 0.16, 0.02);
          const pole = this.mesh(cyl, M.dark, b.x, 0.95, b.z); pole.scale.set(0.015, 0.9, 0.015);
          break;
        }
        case 'tomb': {
          const st = this.mesh(unit, M.stone, b.x, 0.5, b.z); st.scale.set(b.w, 1.0, b.d); st.rotation.z = (b.v - 0.5) * 0.16;
          const cap = this.mesh(cyl, M.stone, b.x, 1.0, b.z); cap.scale.set(b.w / 2, b.d, b.w / 2); cap.rotation.x = Math.PI / 2; cap.rotation.z = (b.v - 0.5) * 0.16;
          break;
        }
        case 'coffinbox': {
          box(b, M.shelf, 0.7);
          const lid = this.mesh(unit, M.trunk, b.x + 0.08, 0.76, b.z); lid.scale.set(b.w + 0.1, 0.1, b.d + 0.1); lid.rotation.z = 0.08;
          this.mesh(unit, M.metal, b.x + 0.08, 0.83, b.z - 0.3, par, false).scale.set(0.5, 0.02, 0.1);
          this.mesh(unit, M.metal, b.x + 0.08, 0.83, b.z - 0.3, par, false).scale.set(0.1, 0.02, 0.8);
          break;
        }
        case 'pumpkin': {
          const pk = this.mesh(ball, M.pumpkin || (M.pumpkin = new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0xff5a00, emissiveIntensity: 0.55, roughness: 0.7, flatShading: true })), b.x, 0.3, b.z);
          pk.scale.set(0.4, 0.32, 0.4); pk.rotation.y = b.v * 6;
          this.mesh(cyl, M.hedge, b.x, 0.66, b.z).scale.set(0.04, 0.14, 0.04);
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
        case 'sofa': box(b, M.sofa, 0.45); { const bk = this.mesh(unit, M.sofa, b.x + (b.flip ? -0.35 : 0.35), 0.6, b.z); bk.scale.set(0.3, 0.9, b.d); } break;
        case 'shelf': box(b, M.shelf); break;
        case 'locker': {
          if (b.coffin) { box(b, M.shelf); const cr = this.mesh(unit, M.metal, b.x, 1.45, b.z + (b.z > 0 ? -0.41 : 0.41), par, false); cr.scale.set(0.34, 0.07, 0.02); const cv = this.mesh(unit, M.metal, b.x, 1.4, b.z + (b.z > 0 ? -0.41 : 0.41), par, false); cv.scale.set(0.07, 0.5, 0.02); break; }
          box(b, M.locker);
          for (let i = 0; i < 4; i++) for (const [dx, dz] of [[0.41, 0], [-0.41, 0], [0, 0.41], [0, -0.41]]) { const v = this.mesh(unit, M.dark, b.x + dx, 1.45 + i * 0.1, b.z + dz, par, false); v.scale.set(dx ? 0.02 : 0.5, 0.04, dz ? 0.02 : 0.5); }
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
          par.add(g);
          break;
        }
        case 'lamp': {
          const p = this.mesh(cyl, M.dark, b.x, 2.1, b.z); p.scale.set(0.08, 4.2, 0.08);
          this.mesh(new THREE.SphereGeometry(0.28, 10, 8), M.bulb, b.x, 4.3, b.z, par, false);
          this.site(b.x, 4.1, b.z, 0xffc477, 55, 20);
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
          par.add(pivot);
          this.lever = pivot;
          break;
        }
        case 'container': {
          for (let y = 0, n = 0; y < b.h - 0.1; y += 2.6, n++) { const m = this.mesh(unit, boxMat(n ? b.color2 : b.color), b.x + n * 0.15, y + 1.3, b.z + n * 0.1); m.scale.set(b.w, 2.6, b.d); }
          break;
        }
        case 'hidebox': {
          box(b, boxMat(b.color));
          const door = this.mesh(unit, M.dark, b.x + b.w / 2 + 0.01, 1.1, b.z, par, false); door.scale.set(0.04, 2.1, 1.5);
          break;
        }
        case 'logs': {
          const long = b.w > b.d, len = Math.max(b.w, b.d);
          for (const [o, y] of [[-0.3, 0.3], [0.3, 0.3], [0, 0.78]]) { const l = this.mesh(cyl, M.trunk, b.x + (long ? 0 : o), y, b.z + (long ? o : 0)); l.scale.set(0.3, len, 0.3); l.rotation.set(long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0); }
          break;
        }
        case 'snowman': {
          [[0.45, 0.42], [0.33, 1.05], [0.23, 1.5]].forEach(([r, y]) => this.mesh(ball, M.snow, b.x, y, b.z).scale.setScalar(r));
          const a = b.v * 6.28, nose = this.mesh(cone, M.flame, b.x + Math.sin(a) * 0.3, 1.5, b.z + Math.cos(a) * 0.3, par, false);
          nose.scale.set(0.05, 0.25, 0.05); nose.rotation.order = 'YXZ'; nose.rotation.set(Math.PI / 2, a, 0);
          break;
        }
        case 'campfire': {
          for (let i = 0; i < 9; i++) { const r = this.mesh(ico, M.rock, Math.cos(i * 0.7) * 1.5, 0.2, Math.sin(i * 0.7) * 1.5); r.scale.set(0.38, 0.3, 0.38); r.rotation.y = i; }
          for (let i = 0; i < 4; i++) { const l = this.mesh(cyl, M.trunk, 0, 0.45, 0); l.scale.set(0.14, 2.2, 0.14); l.rotation.set(0.95, i * 0.785, 0, 'YXZ'); }
          this.flame = this.mesh(cone, M.flame, 0, 1.1, 0, par, false);
          this.flame.scale.set(0.7, 1.9, 0.7);
          this.site(0, 1.8, 0, 0xff8a3c, 60, 22);
          break;
        }
        case 'tower': {
          for (let i = 0; i < 5; i++) { const m = this.mesh(cyl, i % 2 ? M.pillow : M.barrel, 0, 0.7 + i * 1.4, 0); m.scale.set(1.2 - i * 0.12, 1.4, 1.2 - i * 0.12); }
          this.blink = this.mesh(ball, new THREE.MeshBasicMaterial({ color: 0xff4040 }), 0, 7.5, 0, par, false);
          this.blink.scale.setScalar(0.5);
          this.site(0, 7.2, 0, 0xff5040, 40, 26);
          break;
        }
        case 'beacon': {
          box(b, M.stone, 1.0);
          const bowl = this.mesh(cyl, M.dark, b.x, 1.2, b.z); bowl.scale.set(0.5, 0.4, 0.5);
          const mat = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
          const flame = this.mesh(cone, mat, b.x, 1.9, b.z, par, false);
          const beam = this.mesh(cyl, new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), b.x, 30, b.z, par, false);
          beam.scale.set(0.3, 60, 0.3);
          this.beacons[b.bi] = { flame, beam, mat };
          break;
        }
        case 'fountain': {
          const base = this.mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.9, 16, 1), M.stone, 0, 0.45, 0);
          base.material = M.stone;
          const wtr = this.mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.05, 16), M.water, 0, 0.9, 0, par, false);
          this.water = wtr;
          this.mesh(cyl, M.stone, 0, 1.3, 0).scale.set(0.25, 1.6, 0.25);
          this.mesh(new THREE.SphereGeometry(0.4, 10, 8), M.water, 0, 2.25, 0, par, false);
          this.site(0, 1.6, 0, 0x55ccff, 14, 12);
          break;
        }
      }
    }

    this.cur = null;

    // Houses: floor, ceiling, pitched roof, warm interior light; two-storey ones also get an upper floor and stairs
    for (const h of W.houses) {
      const f = this.mesh(unit, M.floor, h.x, 0.02, h.z, this.root, false); f.scale.set(h.w, 0.04, h.d);
      const c = this.mesh(unit, M.roof, h.x, h.h + 0.12, h.z); c.scale.set(h.w + 0.9, 0.25, h.d + 0.9);
      const p = this.mesh(new THREE.ConeGeometry(0.72, 1, 4), M.roof, h.x, h.h + 0.25 + 1.2, h.z);
      p.rotation.y = Math.PI / 4;
      const g = new THREE.Group(); // scale along world axes after the 45° turn
      g.position.copy(p.position); p.position.set(0, 0, 0); g.add(p); g.scale.set(h.w + 0.9, 2.4, h.d + 0.9);
      this.root.add(g);
      this.site(h.x, Math.min(h.h, FLOOR_H) - 0.5, h.z, 0xffb060, h.floors === 2 ? 42 : 30, h.floors === 2 ? 19 : 15);
      if (h.floors !== 2) continue;
      this.site(h.x, FLOOR_H * 2 - 0.5, h.z, 0xffb060, 34, 16);
      const st = h.stair, x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, z0 = h.z - h.d / 2, z1 = h.z + h.d / 2;
      // upper floor, with a hole where the stairs come up
      for (const [ax, az, bx, bz] of [[x0, z0, st.x0, z1], [st.x1, z0, x1, z1], [st.x0, st.z1, st.x1, z1], [st.x0, z0, st.x1, st.z0]]) {
        const sl = this.mesh(unit, M.floor, (ax + bx) / 2, FLOOR_H - 0.1, (az + bz) / 2);
        sl.scale.set(bx - ax, 0.2, bz - az);
      }
    }
    // Every staircase, indoors or out
    for (const st of W.stairs) {
      const steps = 12, run = (st.xb - st.xa) / steps;
      for (let i = 0; i < steps; i++) {
        const hh = ((i + 1) * FLOOR_H) / steps;
        const sp = this.mesh(unit, i % 2 ? M.table : M.shelf, st.xa + (i + 0.5) * run, hh / 2 - 0.1, (st.z0 + st.z1) / 2);
        sp.scale.set(Math.abs(run), hh, st.z1 - st.z0);
      }
    }
    // Lookout decks and balconies: places to jump off
    for (const d of W.decks) {
      const sl = this.mesh(unit, M.table, (d.x0 + d.x1) / 2, FLOOR_H - 0.1, (d.z0 + d.z1) / 2);
      sl.scale.set(d.x1 - d.x0, 0.2, d.z1 - d.z0);
      const edge = this.mesh(unit, new THREE.MeshBasicMaterial({ color: 0xffd447 }), (d.x0 + d.x1) / 2, FLOOR_H + 0.011, (d.z0 + d.z1) / 2, this.root, false);
      edge.scale.set(d.x1 - d.x0 - 0.3, 0.004, d.z1 - d.z0 - 0.3);
      const top = this.mesh(unit, M.table, (d.x0 + d.x1) / 2, FLOOR_H + 0.013, (d.z0 + d.z1) / 2, this.root, false);
      top.scale.set(d.x1 - d.x0 - 0.6, 0.004, d.z1 - d.z0 - 0.6);
    }
    // Jump pads: step on one to be launched high enough to land on a lookout
    this.pads = [];
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3de0d0, emissive: 0x19a89a, emissiveIntensity: 1.2, roughness: 0.3 });
    for (const p of W.pads) {
      this.mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.14, 20), M.dark, p.x, 0.07, p.z);
      this.pads.push(this.mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20), padMat, p.x, 0.17, p.z, this.root, false));
      const ar = this.mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x9dfff3, transparent: true, opacity: 0.8 }), p.x, 1.2, p.z, this.root, false);
      this.pads.push(ar);
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
    for (const c of W.coins) { const m = this.mesh(cg, cm, c.x, 0.9 + c.lv * FLOOR_H, c.z); m.userData.y0 = m.position.y; this.coins.push(m); }
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
  // Seekers carry the flashlight. In a blackout everyone else gets a faint glow so they can find their feet.
  setSeekerView(on) {
    this.torch.visible = on; this.spot.visible = on;
    if (!this.glow) { this.glow = new THREE.PointLight(0x9fb8ff, 0, 9, 1.6); this.camera.add(this.glow); }
    this.glow.intensity = this.dark && !on ? 5 : 0;
  }
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
  addAvatar(id, look, name) {
    const ch = makeCharacter(look);
    const g = new THREE.Group();
    g.add(ch.inner);
    const col = COLORS[look[1] % COLORS.length];
    const tex = canvasTex(256, 64, (c) => {
      c.font = 'bold 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(name, 128, 34);
      c.fillStyle = '#' + col.toString(16).padStart(6, '0'); c.fillText(name, 128, 34);
    });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    tag.scale.set(1.9, 0.48, 1);
    g.add(tag);
    // "dazed" stars
    const stun = new THREE.Group();
    for (let i = 0; i < 3; i++) put(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffe14d }), Math.cos(i * 2.09) * 0.4, ch.top + 0.2, Math.sin(i * 2.09) * 0.4, stun, false);
    g.add(stun);
    g.visible = false;
    this.scene.add(g);
    const old = this.avatars.get(id);
    const pet = makePet(look[4] | 0);
    if (pet) this.scene.add(pet.g);
    const a = { ...ch, g, tag, stun, pet, phase: Math.random() * 6, x: 0, y: 0, z: 0, r: 0, init: false };
    if (old) { a.x = old.x; a.y = old.y; a.z = old.z; a.r = old.r; a.init = old.init; this.removeAvatar(id); }
    this.avatars.set(id, a);
    return a;
  }
  removeAvatar(id) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.scene.remove(a.g);
    if (a.pet) this.scene.remove(a.pet.g);
    a.tag.material.map.dispose();
    this.avatars.delete(id);
  }
  // s: {x,y,z,r,visible,moving,sprint,crouch,jump,seeker,showTag,stunned,immune}
  updateAvatar(id, s, dt) {
    const a = this.avatars.get(id);
    if (!a) return;
    a.g.visible = s.visible;
    if (!a.init || Math.hypot(s.x - a.x, s.z - a.z) > 6) { a.x = s.x; a.y = s.y; a.z = s.z; a.r = s.r; a.init = true; }
    const k = Math.min(1, dt * 12);
    a.x += (s.x - a.x) * k; a.y += (s.y - a.y) * k; a.z += (s.z - a.z) * k;
    let dr = s.r - a.r;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    a.r += dr * k;
    a.g.position.set(a.x, a.y, a.z);
    a.g.rotation.y = a.r;
    // pets trail behind and to the left of their owner
    if (a.pet) stepPet(a.pet, a.x + Math.sin(a.r) * 0.9 - Math.cos(a.r) * 0.6, a.y, a.z + Math.cos(a.r) * 0.9 + Math.sin(a.r) * 0.6, s.visible && s.pet, dt, this.time);
    if (!s.visible) return;
    // Prop Hunt disguise, and the ice block of Freeze Tag
    if ((s.prop || 0) !== (a.propI || 0)) {
      if (a.propG) a.g.remove(a.propG);
      a.propI = s.prop || 0;
      a.propG = a.propI ? this.makeProp(a.propI) : null;
      if (a.propG) a.g.add(a.propG);
    }
    if (s.frozen && !a.ice) {
      a.ice = put(new THREE.BoxGeometry(1, 2.1, 1), new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2 }), 0, 1.05, 0, a.g, false);
    }
    if (a.ice) a.ice.visible = !!s.frozen;
    a.phase += dt * (s.sprint ? 15 : s.crouch ? 6 : 10) * (s.moving ? 1 : 0);
    const sw = s.moving ? Math.sin(a.phase) * (s.sprint ? 0.9 : 0.55) : 0;
    a.legs.forEach((l, i) => { l.rotation.x = i % 2 ? -sw : sw; });
    a.arms.forEach((m, i) => { m.position.z = m.userData.z0 + (i % 2 ? sw : -sw) * 0.25; });
    const sy = s.crouch ? 0.62 : 1;
    a.inner.scale.y += (sy - a.inner.scale.y) * Math.min(1, dt * 14);
    a.jt = s.jump ? (a.jt || 0) + dt : 0;
    a.inner.position.y = a.float + (s.moving ? Math.abs(Math.sin(a.phase)) * 0.06 : Math.sin(this.time * 2 + a.phase) * (a.float ? 0.06 : 0.012)) + Math.sin(Math.min(1, a.jt / 0.72) * Math.PI) * 0.95;
    a.inner.rotation.x = s.sprint ? -0.18 : 0;
    a.hider.visible = !s.seeker; a.seeker.visible = s.seeker;
    a.tag.visible = s.showTag;
    a.tag.position.y = (a.top + 0.5) * a.inner.scale.y + a.float + 0.1;
    a.stun.visible = s.stunned;
    if (s.stunned) a.stun.rotation.y = this.time * 5;
    const blink = s.immune && Math.sin(this.time * 20) > 0;
    a.inner.visible = !blink && !a.propI;
  }

  makeProp(i) {
    const g = new THREE.Group(), M = this.M;
    if (i === 1) put(new THREE.BoxGeometry(1.3, 1.3, 1.3), M.crate, 0, 0.65, 0, g);
    else if (i === 2) put(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10), M.barrel, 0, 0.55, 0, g);
    else if (i === 3) for (let k = 0; k < 6; k++) { const a = k * 1.05, rr = k < 5 ? 0.75 : 0, m = put(new THREE.IcosahedronGeometry(k < 5 ? 0.85 : 1, 0), std(k % 2 ? 0x2e8b47 : 0x3fa35a, { roughness: 1 }), Math.cos(a) * rr, k < 5 ? 0.75 : 1.35, Math.sin(a) * rr, g); m.rotation.set(k, k * 2, k * 3); }
    else if (i === 4) { const m = put(new THREE.IcosahedronGeometry(1, 0), M.rock, 0, 0.4, 0, g); m.scale.set(0.95, 0.75, 0.85); }
    else { put(new THREE.ConeGeometry(0.28, 0.9, 12), std(0xff7a1a, { flatShading: false }), 0, 0.5, 0, g); put(new THREE.CylinderGeometry(0.19, 0.23, 0.14, 12), std(0xf4f4f4, { flatShading: false }), 0, 0.45, 0, g); put(new THREE.BoxGeometry(0.7, 0.06, 0.7), std(0xff7a1a), 0, 0.03, 0, g); }
    return g;
  }
  // Your own pet runs a little ahead of you, where you can see it
  setSelfPet(look) {
    if (this.selfPet) this.scene.remove(this.selfPet.g);
    this.selfPet = makePet(look[4] | 0);
    if (this.selfPet) this.scene.add(this.selfPet.g);
  }
  updateSelfPet(x, y, z, yaw, visible, dt) {
    if (!this.selfPet) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    stepPet(this.selfPet, x + fx * 2.4 + Math.cos(yaw) * 1.0, y, z + fz * 2.4 - Math.sin(yaw) * 1.0, visible, dt, this.time);
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

    for (let i = 0; i < this.coins.length; i++) { const m = this.coins[i]; m.rotation.y = t * 2.4 + i; m.position.y = m.userData.y0 + Math.sin(t * 2 + i) * 0.12; }
    if (this.water) this.water.material.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.2;
    if (this.pads) for (let i = 1; i < this.pads.length; i += 2) { const m = this.pads[i]; m.position.y = 0.9 + ((t * 1.4 + i) % 1) * 1.1; m.material.opacity = 0.9 - ((t * 1.4 + i) % 1) * 0.9; this.pads[i - 1].scale.y = 1 + Math.sin(t * 6) * 0.3; }
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
    // hand the pooled lights to the nearest lamps and windows
    if ((this.siteT -= dt) <= 0) {
      this.siteT = 0.3;
      const near = this.sites.map((o) => [(o.x - cam.x) ** 2 + (o.z - cam.z) ** 2, o]).sort((p, q) => p[0] - q[0]);
      this.pool.forEach((l, i) => {
        const o = near[i] && near[i][1];
        l.visible = true;
        if (!o) { l.intensity = 0; return; }
        l.position.set(o.x, o.y, o.z); l.color.set(o.color); l.intensity = o.intensity; l.distance = o.dist;
      });
    }
    this.renderer.render(this.scene, c);
  }
}

// ---------- character factory ----------
function put(geo, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = shadow;
  parent.add(m);
  return m;
}
const patTex = [null];
function pattern(i) {
  if (patTex[i] !== undefined) return patTex[i];
  return (patTex[i] = canvasTex(128, 128, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#9a9a9a';
    if (i === 1) for (let y = 8; y < 128; y += 32) g.fillRect(0, y, 128, 14);
    else if (i === 2) for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) { g.beginPath(); g.arc(x * 22 + (y % 2 ? 11 : 0), y * 28 + 10, 6.5, 0, 7); g.fill(); }
    else { g.fillStyle = '#8a8a8a'; g.fillRect(0, 60, 128, 68); }
  }));
}
const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

// look = [character, colour, hat, pattern]. Builds a model facing -z with its feet at y = 0.
export function makeCharacter(look) {
  const [kind, ci, hatI, pat] = look;
  const col = COLORS[ci % COLORS.length];
  const inner = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, map: pattern(pat) });
  const plain = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  const dark = std(0x23202e), white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const pale = new THREE.MeshStandardMaterial({ color: new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.65), roughness: 0.7 });
  const orange = std(0xff9a2e, { flatShading: false });
  const legG = new THREE.BoxGeometry(0.17, 0.46, 0.2);
  legG.translate(0, -0.23, 0);
  const legs = [], arms = [];
  const leg = (sx, y = 0.46, mat = dark, sc = 1) => { const l = put(legG, mat, sx, y, 0, inner); l.scale.set(sc, y / 0.46, sc); legs.push(l); };
  const arm = (sx, y, z = 0, geo = S(0.11, 8, 6), mat = plain) => { const m = put(geo, mat, sx, y, z, inner); m.userData.z0 = z; arms.push(m); return m; };
  const eyes = (y, z, sx = 0.11, r = 0.075) => { for (const s of [-sx, sx]) { put(S(r, 8, 6), white, s, y, z, inner, false); put(S(r * 0.5, 6, 5), black, s, y, z - r * 0.85, inner, false); } };
  // head: centre height, radius, how far the face sticks out, body centre height and depth (for the backpack)
  let hy = 1.58, hr = 0.3, face = 0.25, by = 1.0, bz = 0.33, float = 0;

  if (kind === 1) { // Robot
    put(new THREE.BoxGeometry(0.62, 0.7, 0.42), skin, 0, 0.95, 0, inner);
    put(new THREE.BoxGeometry(0.5, 0.42, 0.44), plain, 0, 1.56, 0, inner);
    const glow = new THREE.MeshBasicMaterial({ color: 0x7df9ff });
    for (const s of [-0.12, 0.12]) put(new THREE.BoxGeometry(0.12, 0.09, 0.03), glow, s, 1.6, -0.23, inner, false);
    put(new THREE.BoxGeometry(0.22, 0.03, 0.03), dark, 0, 1.45, -0.23, inner, false);
    for (const s of [-1, 1]) { put(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5), dark, s * 0.27, 1.72, 0, inner).rotation.z = s * -0.6; put(S(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff5050 }), s * 0.33, 1.8, 0, inner, false); }
    for (const s of [-0.4, 0.4]) arm(s, 0.95, 0, new THREE.BoxGeometry(0.14, 0.4, 0.16));
    leg(-0.16); leg(0.16);
    hy = 1.56; hr = 0.25; face = 0.23; by = 0.98; bz = 0.3;
  } else if (kind === 3) { // Bear
    put(new THREE.CapsuleGeometry(0.4, 0.5, 4, 12), skin, 0, 0.94, 0, inner);
    put(S(0.34), plain, 0, 1.62, 0, inner);
    for (const s of [-0.25, 0.25]) { put(S(0.12, 8, 6), plain, s, 1.9, 0, inner); put(S(0.065, 6, 5), pale, s, 1.9, -0.08, inner, false); }
    put(S(0.14, 8, 6), pale, 0, 1.55, -0.28, inner);
    put(S(0.05, 6, 5), black, 0, 1.59, -0.41, inner, false);
    eyes(1.7, -0.29, 0.13, 0.06);
    for (const s of [-0.48, 0.48]) arm(s, 0.98, 0, S(0.13, 8, 6));
    leg(-0.17, 0.46, dark, 1.15); leg(0.17, 0.46, dark, 1.15);
    hy = 1.62; hr = 0.34; face = 0.3; bz = 0.4;
  } else if (kind === 4) { // Penguin
    put(S(1), skin, 0, 0.88, 0, inner).scale.set(0.42, 0.6, 0.4);
    put(S(1), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.7 }), 0, 0.85, -0.12, inner).scale.set(0.32, 0.48, 0.32);
    put(S(0.28), plain, 0, 1.55, 0, inner);
    const beak = put(new THREE.ConeGeometry(0.07, 0.2, 8), orange, 0, 1.5, -0.32, inner); beak.rotation.x = -Math.PI / 2;
    eyes(1.6, -0.22, 0.1, 0.06);
    for (const s of [-0.42, 0.42]) arm(s, 0.95, 0, S(1, 8, 6)).scale.set(0.07, 0.3, 0.16);
    leg(-0.14, 0.3, orange, 1.1); leg(0.14, 0.3, orange, 1.1);
    hy = 1.55; hr = 0.28; face = 0.24; by = 0.9; bz = 0.36;
  } else if (kind === 5) { // Ghost
    put(new THREE.CapsuleGeometry(0.36, 0.6, 4, 12), skin, 0, 1.0, 0, inner);
    for (let i = 0; i < 6; i++) put(S(0.13, 8, 6), plain, Math.cos(i * 1.047) * 0.27, 0.42, Math.sin(i * 1.047) * 0.27, inner);
    for (const s of [-0.12, 0.12]) put(S(1, 8, 6), black, s, 1.38, -0.31, inner, false).scale.set(0.06, 0.1, 0.04);
    put(S(1, 8, 6), black, 0, 1.2, -0.34, inner, false).scale.set(0.05, 0.07, 0.03);
    for (const s of [-0.42, 0.42]) arm(s, 1.05, -0.05);
    hy = 1.36; hr = 0.36; face = 0.32; by = 0.95; bz = 0.36; float = 0.18;
  } else if (kind === 6) { // Frog
    put(S(0.42), skin, 0, 0.72, 0, inner).scale.set(1, 0.95, 0.95);
    put(S(1), plain, 0, 1.28, -0.02, inner).scale.set(0.38, 0.27, 0.34);
    for (const s of [-0.19, 0.19]) { put(S(0.13, 8, 6), plain, s, 1.5, -0.06, inner); put(S(0.085, 8, 6), white, s, 1.52, -0.15, inner, false); put(S(0.045, 6, 5), black, s, 1.52, -0.225, inner, false); }
    put(new THREE.BoxGeometry(0.36, 0.025, 0.03), black, 0, 1.22, -0.335, inner, false);
    for (const s of [-0.46, 0.46]) arm(s, 0.75);
    leg(-0.22, 0.34, plain, 1.3); leg(0.22, 0.34, plain, 1.3);
    hy = 1.28; hr = 0.3; face = 0.3; by = 0.75; bz = 0.4;
  } else if (kind === 7) { // Alien
    put(new THREE.CapsuleGeometry(0.26, 0.6, 4, 12), skin, 0, 0.92, 0, inner);
    put(S(1), plain, 0, 1.72, 0, inner).scale.set(0.36, 0.44, 0.36);
    for (const s of [-1, 1]) { const e = put(S(1, 10, 8), black, s * 0.15, 1.72, -0.29, inner, false); e.scale.set(0.1, 0.15, 0.05); e.rotation.z = s * 0.5; }
    for (const s of [-1, 1]) { put(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 5), plain, s * 0.16, 2.2, 0, inner).rotation.z = s * -0.35; put(S(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0x9dff7a }), s * 0.205, 2.33, 0, inner, false); }
    for (const s of [-0.34, 0.34]) arm(s, 0.98, 0, S(0.09, 8, 6));
    leg(-0.12); leg(0.12);
    hy = 1.72; hr = 0.36; face = 0.32; bz = 0.26;
  } else if (kind === 8) { // Dino
    put(new THREE.CapsuleGeometry(0.34, 0.5, 4, 12), skin, 0, 0.92, 0, inner);
    put(S(0.28), plain, 0, 1.56, -0.02, inner);
    put(new THREE.BoxGeometry(0.34, 0.24, 0.34), plain, 0, 1.5, -0.3, inner);
    for (const s of [-0.08, 0.08]) put(new THREE.ConeGeometry(0.03, 0.07, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), s, 1.37, -0.42, inner, false).rotation.x = Math.PI;
    eyes(1.68, -0.22, 0.13, 0.06);
    for (let i = 0; i < 5; i++) put(new THREE.ConeGeometry(0.07, 0.18, 4), pale, 0, 1.82 - i * 0.26, 0.2 + (i > 0 ? 0.12 : 0) + (i > 3 ? 0.1 : 0), inner);
    const tail = put(new THREE.ConeGeometry(0.16, 0.7, 6), plain, 0, 0.6, 0.55, inner); tail.rotation.x = -1.9;
    for (const s of [-0.36, 0.36]) arm(s, 1.05, -0.12, S(0.08, 8, 6));
    leg(-0.17, 0.46, plain, 1.2); leg(0.17, 0.46, plain, 1.2);
    hy = 1.56; hr = 0.28; face = 0.46; bz = 0.36;
  } else if (kind === 10) { // Astronaut
    const suit = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.5 });
    put(new THREE.CapsuleGeometry(0.36, 0.5, 4, 12), suit, 0, 0.92, 0, inner);
    put(new THREE.BoxGeometry(0.3, 0.2, 0.06), skin, 0, 1.0, -0.36, inner);
    put(S(0.33), suit, 0, 1.6, 0, inner);
    put(S(0.25), new THREE.MeshStandardMaterial({ color: col, roughness: 0.1, metalness: 0.7 }), 0, 1.62, -0.13, inner).scale.set(1, 0.85, 0.8);
    put(new THREE.BoxGeometry(0.46, 0.55, 0.22), suit, 0, 1.02, 0.36, inner);
    for (const s of [-0.46, 0.46]) arm(s, 0.98, 0, S(0.12, 8, 6), suit);
    leg(-0.16, 0.46, suit, 1.15); leg(0.16, 0.46, suit, 1.15);
    hy = 1.6; hr = 0.33; face = 0.33; bz = 0.52;
  } else if (kind === 11) { // Ninja
    put(new THREE.CapsuleGeometry(0.32, 0.55, 4, 12), skin, 0, 0.92, 0, inner);
    put(S(0.29), plain, 0, 1.58, 0, inner);
    put(new THREE.BoxGeometry(0.4, 0.11, 0.1), pale, 0, 1.62, -0.235, inner, false);
    for (const s of [-0.09, 0.09]) put(S(0.035, 6, 5), black, s, 1.62, -0.285, inner, false);
    put(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 14), std(0xc8324a, { flatShading: false }), 0, 1.74, 0, inner);
    for (const s of [-0.06, 0.06]) { const tl = put(new THREE.BoxGeometry(0.06, 0.3, 0.02), std(0xc8324a), s, 1.6, 0.31, inner); tl.rotation.x = 0.4 + s * 3; }
    put(new THREE.BoxGeometry(0.66, 0.08, 0.5), dark, 0, 0.82, 0, inner);
    const sw = put(new THREE.BoxGeometry(0.05, 0.75, 0.03), std(0x9aa0b5, { metalness: 0.8, roughness: 0.3 }), 0.12, 1.15, 0.33, inner); sw.rotation.z = 0.5;
    for (const s of [-0.4, 0.4]) arm(s, 0.95);
    leg(-0.15); leg(0.15);
    hy = 1.58; hr = 0.29; face = 0.24;
  } else if (kind === 12) { // Pumpkin
    put(new THREE.CapsuleGeometry(0.3, 0.55, 4, 12), skin, 0, 0.9, 0, inner);
    const pm = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.7, emissive: 0x5a2000 });
    put(S(0.36, 12, 8), pm, 0, 1.6, 0, inner).scale.set(1, 0.85, 1);
    for (const a of [0.5, -0.5, 1.6, -1.6]) put(S(0.36, 8, 8), pm, 0, 1.6, 0, inner).scale.set(0.62, 0.86, 1.04), (inner.children[inner.children.length - 1].rotation.y = a);
    put(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 6), std(0x3f7d4a), 0, 1.95, 0, inner);
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (const s of [-0.13, 0.13]) { const e = put(new THREE.ConeGeometry(0.065, 0.1, 3), glow, s, 1.67, -0.34, inner, false); e.rotation.y = Math.PI; }
    put(new THREE.BoxGeometry(0.3, 0.05, 0.03), glow, 0, 1.5, -0.35, inner, false);
    for (const s of [-0.38, 0.38]) arm(s, 0.95);
    leg(-0.14); leg(0.14);
    hy = 1.6; hr = 0.36; face = 0.36;
  } else if (kind === 13) { // Duck
    put(S(1), skin, 0, 0.82, 0.02, inner).scale.set(0.4, 0.5, 0.46);
    put(S(0.27), plain, 0, 1.5, -0.04, inner);
    const bill = put(new THREE.BoxGeometry(0.26, 0.07, 0.24), orange, 0, 1.44, -0.34, inner);
    bill.geometry.translate(0, 0, 0);
    eyes(1.57, -0.26, 0.1, 0.055);
    const tail = put(new THREE.ConeGeometry(0.14, 0.3, 5), plain, 0, 1.0, 0.44, inner); tail.rotation.x = -0.9;
    for (const s of [-0.4, 0.4]) arm(s, 0.9, 0.02, S(1, 8, 6)).scale.set(0.08, 0.26, 0.2);
    leg(-0.14, 0.34, orange, 1.2); leg(0.14, 0.34, orange, 1.2);
    hy = 1.5; hr = 0.27; face = 0.3; by = 0.88; bz = 0.44;
  } else { // Blob, Cat and Bunny share a body
    put(new THREE.CapsuleGeometry(0.34, 0.55, 4, 12), skin, 0, 0.92, 0, inner);
    put(S(0.3), plain, 0, 1.58, 0, inner);
    eyes(1.62, -0.25);
    for (const s of [-0.42, 0.42]) arm(s, 0.95);
    leg(-0.15); leg(0.15);
    if (kind === 2) {
      for (const s of [-0.17, 0.17]) { put(new THREE.ConeGeometry(0.1, 0.2, 4), plain, s, 1.9, 0, inner); put(new THREE.ConeGeometry(0.055, 0.12, 4), pale, s, 1.88, -0.03, inner, false); }
      put(S(0.04, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff8fa8 }), 0, 1.54, -0.3, inner, false);
      for (const s of [-1, 1]) for (const a of [-0.15, 0.15]) { const w = put(new THREE.BoxGeometry(0.22, 0.008, 0.008), black, s * 0.2, 1.52 + a * 0.2, -0.27, inner, false); w.rotation.z = s * a; }
      const tail = put(new THREE.CylinderGeometry(0.045, 0.06, 0.6, 6), plain, 0, 0.82, 0.45, inner); tail.rotation.x = -0.9;
    }
    if (kind === 9) {
      for (const s of [-0.11, 0.11]) { const e = put(new THREE.CapsuleGeometry(0.06, 0.36, 4, 8), plain, s, 2.02, 0.02, inner); e.rotation.z = -s * 1.4; put(new THREE.CapsuleGeometry(0.03, 0.3, 3, 6), pale, s, 2.02, -0.035, inner, false).rotation.z = -s * 1.4; }
      put(S(0.04, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff8fa8 }), 0, 1.55, -0.3, inner, false);
      put(new THREE.BoxGeometry(0.09, 0.07, 0.02), white, 0, 1.47, -0.285, inner, false);
      put(S(0.11, 8, 6), pale, 0, 0.7, 0.38, inner);
    }
  }
  const top = hy + hr * (kind === 7 ? 1.22 : kind === 6 ? 1.05 : kind === 12 ? 0.85 : 1);

  // hat
  const hat = new THREE.Group(), hs = hr / 0.3;
  hat.position.y = top - 0.02; hat.scale.setScalar(hs);
  if (kind === 6) hat.position.y -= 0.12;
  if (hatI === 1) { put(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf1f1f1, { flatShading: false }), 0, -0.24, 0, hat).scale.y = 0.85; put(S(0.07, 8, 6), std(0xff5d5d), 0, 0.04, 0, hat); }
  else if (hatI === 2) { put(new THREE.CylinderGeometry(0.29, 0.31, 0.15, 14), std(0x2a4a8a), 0, 0.0, 0, hat); put(new THREE.BoxGeometry(0.4, 0.035, 0.28), std(0x2a4a8a), 0, -0.05, -0.36, hat); }
  else if (hatI === 3) { put(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 16), std(0x16161c), 0, -0.04, 0, hat); put(new THREE.CylinderGeometry(0.23, 0.24, 0.4, 14), std(0x16161c), 0, 0.17, 0, hat); put(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 14), std(0xc8324a), 0, 0.03, 0, hat); }
  else if (hatI === 4) { const gold = new THREE.MeshStandardMaterial({ color: 0xffd447, metalness: 0.8, roughness: 0.3, emissive: 0x6b4a00 }); put(new THREE.CylinderGeometry(0.24, 0.22, 0.14, 12, 1, true), gold, 0, 0.02, 0, hat).material.side = THREE.DoubleSide; for (let i = 0; i < 6; i++) put(new THREE.ConeGeometry(0.05, 0.14, 4), gold, Math.cos(i * 1.047) * 0.23, 0.16, Math.sin(i * 1.047) * 0.23, hat); }
  else if (hatI === 5) { put(new THREE.ConeGeometry(0.2, 0.46, 12), new THREE.MeshStandardMaterial({ color: 0xff5fc8, map: pattern(1), roughness: 0.6 }), 0, 0.18, 0, hat); put(S(0.06, 8, 6), std(0xffe14d), 0, 0.43, 0, hat); }
  else if (hatI === 6) { const band = put(new THREE.TorusGeometry(0.32, 0.03, 6, 16, Math.PI), std(0x23202e, { flatShading: false }), 0, -0.3, 0, hat); for (const s of [-0.33, 0.33]) { const c = put(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), std(0xff5d5d), s, -0.32, 0, hat); c.rotation.z = Math.PI / 2; } band.rotation.y = 0; }
  else if (hatI === 7) { const halo = put(new THREE.TorusGeometry(0.22, 0.03, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffe98a }), 0, 0.2, 0, hat, false); halo.rotation.x = Math.PI / 2; }
  inner.add(hat);

  // hider kit: a backpack. seeker kit: glowing red visor and a flashlight beam
  const hider = new THREE.Group(), seeker = new THREE.Group();
  put(new THREE.BoxGeometry(0.4, 0.45, 0.2), std(0x4a3f66), 0, by, bz, hider);
  put(new THREE.BoxGeometry(hr * 1.75, 0.11, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, kind === 6 ? 1.34 : hy + 0.04, -face - 0.02, seeker, false);
  const bg = new THREE.ConeGeometry(2.2, 9, 18, 1, true);
  bg.translate(0, -4.5, 0); bg.rotateX(Math.PI / 2);
  const beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.set(0.3, 1.2, -0.3);
  seeker.add(beam);
  inner.add(hider, seeker);
  inner.position.y = float;
  return { inner, legs, arms, hider, seeker, top, float };
}

// A small turntable view of one character, for the look picker.
export class Preview {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 30);
    this.cam.position.set(0, 1.5, 6.2);
    this.cam.lookAt(0, 1.02, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.9));
    const d = new THREE.DirectionalLight(0xfff0dd, 2.2);
    d.position.set(2, 4, 3);
    this.scene.add(d);
    this.ch = null;
  }
  set(look) {
    if (this.ch) this.scene.remove(this.ch.inner);
    if (this.pet) this.scene.remove(this.pet.g);
    this.ch = makeCharacter(look);
    this.ch.seeker.visible = false;
    this.scene.add(this.ch.inner);
    this.pet = makePet(look[4] | 0);
    if (this.pet) { this.pet.g.visible = true; this.scene.add(this.pet.g); }
  }
  render(t) {
    if (!this.ch) return;
    this.ch.inner.rotation.y = Math.PI + t * 0.9;
    this.ch.inner.position.y = this.ch.float + Math.sin(t * 2.2) * 0.03;
    if (this.pet) {
      const a = t * 0.9;
      this.pet.g.position.set(Math.cos(a) * 0.85, this.pet.fly ? 0.75 + Math.sin(t * 3) * 0.08 : Math.abs(Math.sin(t * 5)) * (this.pet.hop ? 0.16 : 0.04), -Math.sin(a) * 0.85);
      this.pet.g.rotation.y = a + Math.PI;
      animPet(this.pet, t, true);
    }
    this.r.render(this.scene, this.cam);
  }
}

// ---------- pets ----------
// Small companions, about knee high, facing -z. Returns null for "no pet".
export function makePet(i) {
  if (!i) return null;
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const pet = { g, body, fly: false, hop: false, wings: [], tail: null, x: 0, y: 0, z: 0, r: 0, init: false, phase: Math.random() * 6 };
  const m = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyes = (y, z, sx, r = 0.03) => { for (const s of [-sx, sx]) put(S(r, 6, 5), black, s, y, z, body, false); };
  const quad = (col, dark, pointy) => {
    const b = put(new THREE.CapsuleGeometry(0.12, 0.22, 4, 10), m(col), 0, 0.24, 0, body); b.rotation.x = Math.PI / 2;
    put(S(0.14, 10, 8), m(col), 0, 0.4, -0.24, body);
    put(S(0.06, 8, 6), m(0xf4ece0), 0, 0.36, -0.36, body);
    put(S(0.025, 6, 5), black, 0, 0.38, -0.415, body, false);
    eyes(0.44, -0.355, 0.06);
    for (const s of [-1, 1]) {
      if (pointy) put(new THREE.ConeGeometry(0.05, 0.11, 4), m(dark), s * 0.08, 0.55, -0.22, body);
      else { const e = put(new THREE.BoxGeometry(0.05, 0.13, 0.08), m(dark), s * 0.14, 0.4, -0.22, body); e.rotation.z = s * 0.3; }
      for (const z of [-0.13, 0.13]) put(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), m(dark), s * 0.08, 0.07, z, body);
    }
    pet.tail = put(new THREE.CylinderGeometry(0.02, 0.035, 0.22, 6), m(dark), 0, 0.36, 0.26, body);
    pet.tail.rotation.x = pointy ? 0.5 : -0.7;
  };
  if (i === 1) quad(0xb9783f, 0x7a4a22, false);
  else if (i === 2) quad(0x9a9aa6, 0x6a6a78, true);
  else if (i === 3) { // bunny
    pet.hop = true;
    put(S(0.17, 10, 8), m(0xf7f4ef), 0, 0.2, 0.02, body).scale.set(1, 0.95, 1.15);
    put(S(0.13, 10, 8), m(0xf7f4ef), 0, 0.4, -0.14, body);
    for (const s of [-0.06, 0.06]) { const e = put(new THREE.CapsuleGeometry(0.03, 0.2, 3, 6), m(0xf7f4ef), s, 0.62, -0.12, body); e.rotation.z = -s * 3; put(new THREE.CapsuleGeometry(0.014, 0.16, 3, 6), m(0xffb3c7), s, 0.62, -0.145, body, false).rotation.z = -s * 3; }
    put(S(0.022, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff8fa8 }), 0, 0.38, -0.27, body, false);
    eyes(0.44, -0.24, 0.06);
    put(S(0.06, 8, 6), m(0xffffff), 0, 0.2, 0.2, body);
  } else if (i === 4) { // duckling
    put(S(0.15, 10, 8), m(0xffd93c), 0, 0.2, 0, body).scale.set(1, 0.9, 1.25);
    put(S(0.11, 10, 8), m(0xffd93c), 0, 0.42, -0.13, body);
    const bk = put(new THREE.ConeGeometry(0.045, 0.11, 6), m(0xff8a1f), 0, 0.4, -0.26, body); bk.rotation.x = -Math.PI / 2; bk.scale.y = 1; bk.scale.x = 1.5;
    eyes(0.46, -0.215, 0.055, 0.022);
    for (const s of [-0.07, 0.07]) put(new THREE.BoxGeometry(0.07, 0.02, 0.1), m(0xff8a1f), s, 0.02, -0.03, body);
    pet.tail = put(new THREE.ConeGeometry(0.05, 0.1, 5), m(0xffd93c), 0, 0.27, 0.19, body); pet.tail.rotation.x = -0.9;
  } else if (i === 5) { // baby dragon
    pet.fly = true;
    put(S(0.16, 10, 8), m(0x4fbf6a), 0, 0, 0, body).scale.set(1, 0.95, 1.3);
    put(S(0.12, 10, 8), m(0x4fbf6a), 0, 0.14, -0.22, body);
    put(S(0.07, 8, 6), m(0x7fdc8f), 0, 0.1, -0.33, body);
    eyes(0.18, -0.31, 0.06, 0.028);
    for (const s of [-1, 1]) { put(new THREE.ConeGeometry(0.025, 0.08, 4), m(0xffe98a), s * 0.06, 0.27, -0.2, body); const w = put(new THREE.BoxGeometry(0.3, 0.012, 0.2), m(0xff8a5c, { side: THREE.DoubleSide }), 0, 0, 0, body); w.geometry.translate(0.15, 0, 0); w.position.set(s * 0.1, 0.1, 0.02); w.scale.x = s; pet.wings.push(w); }
    pet.tail = put(new THREE.ConeGeometry(0.05, 0.3, 5), m(0x4fbf6a), 0, -0.02, 0.3, body); pet.tail.rotation.x = -1.4;
    put(S(0.1, 8, 6), m(0xf5e6a8), 0, -0.06, -0.02, body).scale.set(1, 0.7, 1.2);
  } else if (i === 6) { // slime
    pet.hop = true;
    put(S(0.2, 12, 9), new THREE.MeshStandardMaterial({ color: 0x6dff8a, transparent: true, opacity: 0.75, roughness: 0.15 }), 0, 0.15, 0, body).scale.set(1, 0.78, 1);
    for (const s of [-0.07, 0.07]) { put(S(0.04, 6, 5), white, s, 0.2, -0.165, body, false); put(S(0.02, 6, 5), black, s, 0.2, -0.2, body, false); }
  } else if (i === 7) { // bee
    pet.fly = true;
    put(S(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd23c, map: pattern(1), roughness: 0.6 }), 0, 0, 0, body).scale.set(1, 1, 1.35);
    put(S(0.09, 10, 8), m(0x2a2320), 0, 0.03, -0.19, body);
    for (const s of [-0.045, 0.045]) put(S(0.025, 6, 5), white, s, 0.06, -0.265, body, false);
    for (const s of [-1, 1]) { const w = put(new THREE.BoxGeometry(0.2, 0.008, 0.11), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0, 0, 0, body, false); w.geometry.translate(0.1, 0, 0); w.position.set(s * 0.05, 0.12, 0); w.scale.x = s; pet.wings.push(w); }
    put(new THREE.ConeGeometry(0.025, 0.08, 5), m(0x2a2320), 0, 0, 0.2, body).rotation.x = Math.PI / 2;
  } else if (i === 8) { // robo-ball
    pet.fly = true;
    put(S(0.17, 14, 10), m(0xb8c0d0, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0, body);
    put(S(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7df9ff }), 0, 0.02, -0.125, body, false);
    put(new THREE.TorusGeometry(0.175, 0.018, 6, 20), m(0x3a4254, { metalness: 0.6 }), 0, 0, 0, body).rotation.x = Math.PI / 2;
    put(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 5), m(0x3a4254), 0, 0.23, 0, body);
    put(S(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff5050 }), 0, 0.31, 0, body, false);
  } else if (i === 9) { // fox
    quad(0xe8742c, 0xb5501a, true);
    pet.tail.scale.set(2.2, 1.3, 2.2);
    put(S(0.05, 6, 5), m(0xffffff), 0, 0.47, 0.33, body);
  } else if (i === 10) { // panda
    put(S(0.18, 10, 8), m(0xf7f7f2), 0, 0.2, 0.02, body);
    put(S(0.14, 10, 8), m(0xf7f7f2), 0, 0.44, -0.08, body);
    for (const s of [-1, 1]) {
      put(S(0.05, 6, 5), m(0x1a1a1e), s * 0.1, 0.57, -0.06, body);
      put(S(0.04, 6, 5), m(0x1a1a1e), s * 0.055, 0.46, -0.2, body, false).scale.set(1, 1.3, 0.5);
      put(S(0.07, 6, 5), m(0x1a1a1e), s * 0.15, 0.27, -0.06, body);
      put(S(0.07, 6, 5), m(0x1a1a1e), s * 0.1, 0.06, 0.02, body);
    }
    for (const s of [-0.055, 0.055]) put(S(0.014, 5, 4), white, s, 0.47, -0.222, body, false);
    put(S(0.02, 5, 4), black, 0, 0.41, -0.215, body, false);
  } else if (i === 11) { // piglet
    quad(0xffa8b8, 0xf08aa0, false);
    const sn = put(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), m(0xff8aa0), 0, 0.37, -0.4, body); sn.rotation.x = Math.PI / 2;
    pet.tail.scale.set(0.8, 0.5, 0.8);
  } else if (i === 12) { // unicorn
    quad(0xffffff, 0xd9b3ff, true);
    const horn = put(new THREE.ConeGeometry(0.03, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xffd447, emissive: 0x8a6a00, metalness: 0.6, roughness: 0.3 }), 0, 0.6, -0.28, body); horn.rotation.x = -0.35;
    [0xff6b8a, 0xffc93c, 0x5fd17a, 0x4da3ff].forEach((c, k) => put(S(0.04, 6, 5), m(c), 0, 0.5 - k * 0.04, -0.13 + k * 0.06, body));
  } else if (i === 13) { // turtle
    put(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(0x3f7d4a, { flatShading: true }), 0, 0.09, 0.02, body).scale.set(1, 0.85, 1.15);
    put(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 10), m(0xd9c98a), 0, 0.08, 0.02, body).scale.set(1, 1, 1.15);
    put(S(0.07, 8, 6), m(0x7fbf6a), 0, 0.15, -0.25, body);
    eyes(0.18, -0.305, 0.035, 0.016);
    for (const s of [-1, 1]) for (const z of [-0.14, 0.17]) put(S(0.045, 6, 5), m(0x7fbf6a), s * 0.17, 0.05, z, body);
    pet.tail = put(new THREE.ConeGeometry(0.02, 0.08, 4), m(0x7fbf6a), 0, 0.07, 0.25, body); pet.tail.rotation.x = -1.5;
  } else if (i === 14) { // owl
    pet.fly = true;
    put(S(0.15, 10, 8), m(0x8a6a44), 0, 0, 0, body).scale.set(1, 1.2, 0.95);
    put(S(0.1, 8, 6), m(0xe8d9b8), 0, -0.04, -0.07, body).scale.set(1, 1.2, 0.8);
    for (const s of [-1, 1]) {
      put(S(0.055, 8, 6), white, s * 0.06, 0.08, -0.12, body, false); put(S(0.028, 6, 5), black, s * 0.06, 0.08, -0.165, body, false);
      put(new THREE.ConeGeometry(0.03, 0.08, 4), m(0x6a4a2a), s * 0.09, 0.2, -0.02, body);
      const w = put(new THREE.BoxGeometry(0.24, 0.02, 0.16), m(0x6a4a2a), 0, 0, 0, body); w.geometry.translate(0.12, 0, 0); w.position.set(s * 0.12, 0.02, 0.02); w.scale.x = s; pet.wings.push(w);
    }
    const bk = put(new THREE.ConeGeometry(0.022, 0.05, 4), m(0xffb02e), 0, 0.03, -0.16, body); bk.rotation.x = Math.PI;
  } else if (i === 15) { // bat
    pet.fly = true;
    put(S(0.1, 8, 6), m(0x3a3350), 0, 0, 0, body).scale.set(1, 1.15, 1);
    for (const s of [-1, 1]) {
      put(new THREE.ConeGeometry(0.03, 0.09, 4), m(0x3a3350), s * 0.055, 0.13, 0, body);
      put(S(0.02, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffe14d }), s * 0.04, 0.03, -0.09, body, false);
      const w = put(new THREE.BoxGeometry(0.34, 0.01, 0.2), m(0x554a78, { side: THREE.DoubleSide }), 0, 0, 0, body); w.geometry.translate(0.17, 0, 0); w.position.set(s * 0.07, 0.03, 0); w.scale.x = s; pet.wings.push(w);
    }
  } else if (i === 16) { // ghostling
    pet.fly = true;
    put(new THREE.CapsuleGeometry(0.12, 0.14, 4, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, roughness: 0.3, emissive: 0x556688 }), 0, 0, 0, body);
    for (let k = 0; k < 5; k++) put(S(0.05, 6, 5), m(0xffffff, { transparent: true, opacity: 0.8 }), Math.cos(k * 1.257) * 0.08, -0.18, Math.sin(k * 1.257) * 0.08, body, false);
    for (const s of [-0.045, 0.045]) put(S(0.025, 6, 5), black, s, 0.06, -0.105, body, false).scale.set(1, 1.5, 0.6);
  } else { // crab
    put(S(0.16, 10, 8), m(0xe0503a), 0, 0.14, 0, body).scale.set(1.25, 0.6, 0.9);
    for (const s of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5), m(0xe0503a), s * 0.07, 0.26, -0.08, body);
      put(S(0.03, 6, 5), white, s * 0.07, 0.32, -0.08, body, false); put(S(0.015, 5, 4), black, s * 0.07, 0.32, -0.105, body, false);
      const claw = put(S(0.065, 8, 6), m(0xc23a28), s * 0.25, 0.2, -0.14, body); claw.scale.set(1, 0.8, 1.3); pet.wings.push(claw);
      for (const z of [-0.04, 0.05, 0.13]) { const l = put(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 5), m(0xc23a28), s * 0.2, 0.07, z, body); l.rotation.z = s * 0.9; }
    }
    pet.crab = true;
  }
  g.visible = false;
  return pet;
}
function animPet(p, t, moving) {
  if (p.crab) { for (let i = 0; i < 2; i++) p.wings[i].position.y = 0.2 + Math.max(0, Math.sin(t * 6 + i * 3)) * 0.08; }
  else for (let i = 0; i < p.wings.length; i++) p.wings[i].rotation.z = (i ? -1 : 1) * Math.sin(t * 28) * 0.7;
  if (p.tail && !p.fly) p.tail.rotation.z = Math.sin(t * (moving ? 14 : 5)) * 0.5;
}
// Move a pet toward the point it wants to be at, and animate it.
function stepPet(p, tx, ty, tz, visible, dt, t) {
  p.g.visible = !!visible;
  if (!visible) { p.init = false; return; }
  if (!p.init || Math.hypot(tx - p.x, tz - p.z) > 9) { p.x = tx; p.y = ty; p.z = tz; p.init = true; }
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), moving = d > 0.3;
  if (moving) {
    const step = Math.min(d, Math.min(10, 1.5 + d * 3.5) * dt);
    p.x += (dx / d) * step; p.z += (dz / d) * step;
    let dr = Math.atan2(-dx, -dz) - p.r;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    p.r += dr * Math.min(1, dt * 10);
    p.phase += dt * 12;
  }
  p.y += (ty - p.y) * Math.min(1, dt * 8);
  const bob = p.fly ? 0.75 + Math.sin(t * 3 + p.phase * 0.1) * 0.08 : moving ? Math.abs(Math.sin(p.phase)) * (p.hop ? 0.22 : 0.05) : 0;
  p.g.position.set(p.x, p.y + bob, p.z);
  p.g.rotation.y = p.r;
  if (p.hop) p.body.scale.y = 1 - (moving ? Math.abs(Math.cos(p.phase)) * 0.18 : Math.sin(t * 3) * 0.05);
  animPet(p, t, moving);
}
