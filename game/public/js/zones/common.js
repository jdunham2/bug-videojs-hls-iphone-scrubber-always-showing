// Shared zone building blocks: sky dome, portals, procedural textures, geometry batching, labels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function makeSky(o) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(o.top) }, horizon: { value: new THREE.Color(o.horizon) }, bottom: { value: new THREE.Color(o.bottom || o.horizon) },
      sunDir: { value: new THREE.Vector3(...(o.sunDir || [0.4, 0.5, -0.6])).normalize() }, sunColor: { value: new THREE.Color(o.sunColor || '#fff2c0') },
      sunSize: { value: o.sunSize || 0.9995 }, stars: { value: o.stars || 0 }, time: { value: 0 }, moon: { value: o.moon || 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, sunColor; uniform vec3 sunDir; uniform float sunSize, stars, time, moon; varying vec3 vDir;
      float hash(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){ vec3 d=normalize(vDir); float h=d.y;
        vec3 col = h>0. ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        float sd = dot(d, normalize(sunDir));
        col += sunColor * pow(max(sd,0.), 12.) * (moon>0.?0.18:0.35) + sunColor * pow(max(sd,0.), 180.) * (moon>0.?0.25:0.6);
        float disc = smoothstep(sunSize, sunSize+0.0004, sd);
        col = mix(col, sunColor*(moon>0.?0.85:3.), disc);
        if(stars>0.){ vec3 g=floor(d*260.); float s=hash(g); float tw=0.6+0.4*sin(time*2.+s*50.); col += vec3(step(0.9975,s))*tw*stars*smoothstep(0.,.25,h); }
        gl_FragColor = vec4(col,1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

export function portalMaterial(c1, c2) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { time: { value: 0 }, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float time; uniform vec3 c1,c2; varying vec2 vUv;
      void main(){ vec2 p=vUv*2.-1.; float r=length(p); if(r>1.) discard; float a=atan(p.y,p.x);
        float s=sin(a*5.+time*3.-r*14.)*.5+.5; float s2=sin(a*3.-time*2.2+r*9.)*.5+.5;
        vec3 col=mix(c1,c2,s*s2); col*=(1.3-r*0.5)*1.05; col+=c2*pow(1.-r,4.)*1.4; col+=c1*smoothstep(.8,1.,r)*1.2;
        gl_FragColor=vec4(col, smoothstep(1.,.88,r)*0.95); }`,
  });
}

export function buildPortal(c1, c2, stoneMat) {
  const g = new THREE.Group();
  const stone = stoneMat || new THREE.MeshStandardMaterial({ color: '#6f6a66', roughness: 0.9 });
  const pillarG = new THREE.BoxGeometry(1.2, 6, 1.2);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillarG, stone); p.position.set(2.8 * s, 3, 0); p.castShadow = p.receiveShadow = true; g.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), stone); cap.position.set(2.8 * s, 6.1, 0); cap.castShadow = true; g.add(cap);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.5, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c2).multiplyScalar(2.5) }));
    rune.position.set(2.8 * s - 0.61 * s, 3, 0); g.add(rune);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.55, 8, 24, Math.PI), stone);
  arch.position.y = 6; arch.castShadow = true; g.add(arch);
  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: c2, emissive: c2, emissiveIntensity: 3 }));
  keystone.position.y = 9.2; g.add(keystone);
  const mat = portalMaterial(c1, c2);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  disc.scale.set(2.3, 3.6, 1); disc.position.y = 3.6; g.add(disc);
  const light = new THREE.PointLight(c2, 25, 14, 2); light.position.set(0, 3.5, 1.5); g.add(light);
  g.userData = { mat, keystone, light, update: (t) => { mat.uniforms.time.value = t; keystone.rotation.y = t; keystone.position.y = 9.2 + Math.sin(t * 2) * 0.15; light.intensity = 22 + Math.sin(t * 5) * 4; } };
  return g;
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function speckle(ctx, s, n, a) {
  for (let i = 0; i < n; i++) { const v = Math.random() * 255 | 0; ctx.fillStyle = `rgba(${v},${v},${v},${a})`; ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3); }
}

export const textures = {
  _c: {},
  get flagstone() {
    return this._c.flag ||= canvasTex(512, (ctx, s) => {
      ctx.fillStyle = '#4a4440'; ctx.fillRect(0, 0, s, s);
      const n = 4, cs = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = 90 + Math.random() * 40;
        ctx.fillStyle = `rgb(${v},${v * 0.95},${v * 0.9})`;
        ctx.fillRect(x * cs + 4, y * cs + 4, cs - 8, cs - 8);
        const gr = ctx.createRadialGradient(x * cs + cs / 2, y * cs + cs / 2, 4, x * cs + cs / 2, y * cs + cs / 2, cs * 0.7);
        gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = gr; ctx.fillRect(x * cs + 4, y * cs + 4, cs - 8, cs - 8);
      }
      speckle(ctx, s, 9000, 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 18; i++) { ctx.beginPath(); let x = Math.random() * s, y = Math.random() * s; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); }
    });
  },
  get brick() {
    return this._c.brick ||= canvasTex(512, (ctx, s) => {
      ctx.fillStyle = '#2a2624'; ctx.fillRect(0, 0, s, s);
      const rows = 8, bh = s / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * 0.5, bw = s / 4;
        for (let c = -1; c < 5; c++) {
          const v = 70 + Math.random() * 35;
          ctx.fillStyle = `rgb(${v},${v * 0.93},${v * 0.88})`;
          ctx.fillRect((c + off) * bw + 3, r * bh + 3, bw - 6, bh - 6);
        }
      }
      speckle(ctx, s, 8000, 0.15);
      const gr = ctx.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    });
  },
  get plaster() {
    return this._c.plaster ||= canvasTex(256, (ctx, s) => { ctx.fillStyle = '#e8dcc4'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, 5000, 0.08); });
  },
  get wood() {
    return this._c.wood ||= canvasTex(256, (ctx, s) => {
      ctx.fillStyle = '#6b4a2e'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) { ctx.strokeStyle = `rgba(30,15,5,${Math.random() * 0.3})`; ctx.beginPath(); const y = Math.random() * s; ctx.moveTo(0, y); ctx.bezierCurveTo(s / 3, y + 6, s * 2 / 3, y - 6, s, y); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, (i * s) / 4, s, 2); }
    });
  },
  get rock() {
    return this._c.rock ||= canvasTex(256, (ctx, s) => { ctx.fillStyle = '#77716a'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, 9000, 0.2); });
  },
};

// Merge many transformed geometries per material into few draw calls.
export class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix) {
    let g = this.groups.get(mat);
    if (!g) { g = []; this.groups.set(mat, g); }
    const c = (geo.index ? geo.toNonIndexed() : geo.clone());
    c.applyMatrix4(matrix);
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    g.push(c);
  }
  box(w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) { this.add(new THREE.BoxGeometry(w, h, d), mat, mtx(x, y, z, ry, rx, rz)); }
  build(parent, shadows = true) {
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = shadows; m.receiveShadow = true;
      parent.add(m);
      list.forEach((g) => g.dispose());
    }
    this.groups.clear();
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export function mtx(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.clone().compose(_p, _q, _s);
}

export function makeSun(color, intensity, size = 40) {
  const sun = new THREE.DirectionalLight(color, intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = 160;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  return sun;
}

// keep shadow frustum centered on the player
export function followSun(sun, target, offset) {
  sun.position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();
}

// Grass with a wind vertex shader.
export function makeGrass(count, sampler, color1 = '#5d8a3a', color2 = '#9cc45a') {
  const geo = new THREE.ConeGeometry(0.06, 0.6, 3, 1, true);
  geo.translate(0, 0.3, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide });
  const uniforms = { time: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = uniforms.time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wp = instanceMatrix * vec4(0.,0.,0.,1.);
      float sway = sin(time*1.8 + wp.x*0.35 + wp.z*0.2) * 0.18 + sin(time*3.1 + wp.z*0.6)*0.05;
      transformed.x += sway * position.y; transformed.z += sway*0.5*position.y;`);
  };
  const im = new THREE.InstancedMesh(geo, mat, count);
  const c1 = new THREE.Color(color1), c2 = new THREE.Color(color2), c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const s = sampler();
    if (!s) continue;
    im.setMatrixAt(n, mtx(s.x, s.y, s.z, Math.random() * 6, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1, s.s || (0.6 + Math.random() * 0.9), 1));
    c.copy(c1).lerp(c2, Math.random()); im.setColorAt(n, c);
    n++;
  }
  im.count = n;
  im.receiveShadow = true;
  im.userData.uniforms = uniforms;
  return im;
}

export function heightTerrain(size, segs, heightFn, colorFn) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightFn(x, z);
    pos.setY(i, y);
    colorFn(x, z, y, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

export function envFromSky(renderer, sky) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const s = sky.clone(); s.material = sky.material; sc.add(s);
  const rt = pm.fromScene(sc, 0.02);
  pm.dispose();
  return rt.texture;
}
