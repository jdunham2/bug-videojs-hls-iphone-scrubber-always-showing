import * as THREE from 'three';
import { createNoise2D, fbm, smoothstep, clamp, lerp } from './noise.js';

export const WORLD = 900;          // island tile size in world units
export const HALF = WORLD / 2;
export const WATER_LEVEL = 0;

const n1 = createNoise2D(1337);
const n2 = createNoise2D(4242);
const n3 = createNoise2D(9001);

// Ashfang Volcano on the east coast.
export const VOLCANO = { x: 245, z: -105, r: 150, crater: 26 };
const vn = createNoise2D(777);

// 0..1 how volcanic (ash-covered) a spot is.
export function volcanicAt(x, z) {
  const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z) + vn(x * 0.02, z * 0.02) * 14;
  return 1 - smoothstep(105, 165, d);
}

// Murkmire Swamp in the south-west: flat wetland dotted with shallow pools.
export const SWAMP = { x: -235, z: 175, r: 130 };
const sn = createNoise2D(4711);
export function swampAt(x, z) {
  const d = Math.hypot(x - SWAMP.x, z - SWAMP.z) + sn(x * 0.015, z * 0.015) * 22;
  return 1 - smoothstep(SWAMP.r * 0.6, SWAMP.r, d);
}

// Frostpeak: the snowy northern highlands (cheap version when the height is known).
export function frostFrom(h, x, z) {
  return smoothstep(30, 44, h) * smoothstep(-30, -100, z) * (1 - volcanicAt(x, z));
}
export function frostAt(x, z) { return frostFrom(surfaceHeight(x, z), x, z); }

// Caves (and anything else far outside the island) can supply their own ground.
let groundProvider = null;
export function setGroundProvider(fn) { groundProvider = fn; }
let blockProvider = null;
export function setBlockProvider(fn) { blockProvider = fn; }
// true where a cave wall blocks movement
export function blockedAt(x, z) { return blockProvider ? blockProvider(x, z) : false; }
let ceilProvider = null;
export function setCeilingProvider(fn) { ceilProvider = fn; }
// cave ceiling height (Infinity in the open)
export function ceilingAt(x, z) { const c = ceilProvider && (x > 1500 || x < -1500) ? ceilProvider(x, z) : undefined; return c === undefined ? Infinity : c; }

// Analytic height function — used for both mesh and gameplay queries.
export function heightAt(x, z) {
  if (groundProvider && (x > 1500 || x < -1500)) { const g = groundProvider(x, z); if (g !== undefined) return g; }
  return surfaceHeight(x, z);
}

function surfaceHeight(x, z) {
  // Distorted radial island mask
  const wx = x + n2(x * 0.004, z * 0.004) * 60;
  const wz = z + n2(x * 0.004 + 50, z * 0.004 + 50) * 60;
  const d = Math.sqrt(wx * wx + wz * wz) / (HALF * 0.9);
  const island = 1 - smoothstep(0.62, 1.0, d);

  // Rolling lowlands
  let h = (fbm(n1, x * 0.0045, z * 0.0045, 5) * 0.5 + 0.5) * 16 + 3;

  // Ridged mountain range in the north with a peak
  const mx = x * 0.006, mz = z * 0.006;
  let ridge = 1 - Math.abs(fbm(n3, mx, mz, 4));
  ridge = ridge * ridge;
  const north = smoothstep(40, -220, z) * (1 - smoothstep(120, 300, Math.abs(x + 40)));
  const peakD = Math.hypot(x + 40, z + 230);
  const peak = Math.max(0, 1 - peakD / 140);
  h += ridge * north * 48 + peak * peak * 70;

  // Gentle valley carved through the middle (a lake basin)
  const lake = Math.max(0, 1 - Math.hypot(x - 120, z - 30) / 70);
  h -= lake * lake * 22;

  h = h * island + (-16) * (1 - island);

  // the volcano cone rises out of the coast, with a crater at the top
  const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (vd < VOLCANO.r) {
    const k = 1 - vd / VOLCANO.r;
    const rough = 1 + vn(x * 0.03, z * 0.03) * 0.12 * k;
    h = Math.max(h, -16) + Math.pow(k, 1.7) * 92 * rough * (h < 0 ? 1.15 : 1);
    if (vd < VOLCANO.crater) h -= Math.pow(1 - vd / VOLCANO.crater, 1.2) * 52;
  }

  // the swamp flattens into a low wetland with pools just below sea level
  const sw = swampAt(x, z);
  if (sw > 0 && h > -6) {
    const wet = 0.9 + sn(x * 0.045, z * 0.045) * 1.5 + sn(x * 0.12, z * 0.12) * 0.4;
    h = lerp(h, wet, sw);
  }

  // Flatten beaches near the waterline
  const b = smoothstep(-1.5, 4.5, h);
  h = lerp(h * 0.55 + 0.3, h, b);
  return h;
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 1.0;
  const hL = heightAt(x - e, z), hR = heightAt(x + e, z);
  const hD = heightAt(x, z - e), hU = heightAt(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

export function slopeAt(x, z) { return 1 - normalAt(x, z).y; }

const C = {
  deep: new THREE.Color(0x8a7a5a),
  sand: new THREE.Color(0xd8c79a),
  wetSand: new THREE.Color(0xa8946a),
  grass: new THREE.Color(0x5f8f3a),
  grass2: new THREE.Color(0x40702a),
  forest: new THREE.Color(0x355a24),
  dirt: new THREE.Color(0x6b5a3f),
  rock: new THREE.Color(0x777068),
  rock2: new THREE.Color(0x56514b),
  snow: new THREE.Color(0xf2f4f7),
  ash: new THREE.Color(0x3c3836),
  mud: new THREE.Color(0x4a4628),
  moss: new THREE.Color(0x3c4a24),
  ice: new THREE.Color(0xc8d8e8),
  ash2: new THREE.Color(0x2a2624),
  basalt: new THREE.Color(0x5a281c),
};

export function buildTerrain(quality) {
  const seg = quality === 'high' ? 320 : 200;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const s = slopeAt(x, z);
    const v = n1(x * 0.05, z * 0.05) * 0.5 + 0.5;
    const v2 = n2(x * 0.013, z * 0.013) * 0.5 + 0.5;

    if (h < -2) c.copy(C.deep).lerp(C.wetSand, smoothstep(-10, -2, h));
    else if (h < 0.6) c.copy(C.wetSand).lerp(C.sand, smoothstep(-2, 0.6, h));
    else if (h < 2.6) c.copy(C.sand).lerp(C.grass, smoothstep(1.6, 2.6, h));
    else {
      c.copy(C.grass).lerp(C.grass2, v);
      c.lerp(C.forest, smoothstep(0.45, 0.75, v2) * 0.8);
      c.lerp(C.dirt, smoothstep(0.65, 0.9, v) * 0.35);
      tmp.copy(C.rock).lerp(C.rock2, v);
      c.lerp(tmp, smoothstep(26, 40, h) * 0.85);
      c.lerp(tmp, smoothstep(0.18, 0.32, s));
      const vol = volcanicAt(x, z);
      c.lerp(C.snow, smoothstep(70, 85, h + v * 8) * (1 - smoothstep(0.35, 0.5, s)) * (1 - vol));
      if (vol > 0) {
        tmp.copy(C.ash).lerp(C.ash2, v);
        c.lerp(tmp, vol * 0.92);
        const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
        c.lerp(C.basalt, smoothstep(60, 28, vd) * 0.8);
      }
    }
    const sw = swampAt(x, z);
    if (sw > 0 && h > -2) { tmp.copy(C.mud).lerp(C.moss, v); c.lerp(tmp, sw * 0.9); }
    const fr = frostFrom(h, x, z);
    if (fr > 0) { tmp.copy(C.snow).lerp(C.ice, v * 0.4); c.lerp(tmp, fr * (1 - smoothstep(0.3, 0.55, s) * 0.6)); }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // Add fine detail noise in the fragment shader so ground doesn't look smeared up close.
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dn = vnoise(vWPos.xz * 1.7) * 0.5 + vnoise(vWPos.xz * 6.0) * 0.3 + vnoise(vWPos.xz * 0.35) * 0.2;
        diffuseColor.rgb *= 0.82 + dn * 0.36;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// Low-res heightmap texture for the water shader (shoreline foam / depth tint).
export function buildHeightTexture(res = 256) {
  const data = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = (i / (res - 1) - 0.5) * WORLD;
      const z = (j / (res - 1) - 0.5) * WORLD;
      data[j * res + i] = THREE.DataUtils.toHalfFloat(clamp(heightAt(x, z), -30, 120));
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Lava lake level inside the crater.
export const LAVA_Y = surfaceHeight(VOLCANO.x, VOLCANO.z) + 14;
export function inVolcanoLava(x, z, y) {
  return Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.crater && y < LAVA_Y + 0.4;
}

export function findSpawn() {
  // Walk from the south edge inward until we hit a dry beach.
  for (let z = HALF; z > 0; z -= 1) {
    const h = heightAt(20, z);
    if (h > 1.4) return new THREE.Vector3(20, h, z - 6);
  }
  return new THREE.Vector3(0, heightAt(0, 0), 0);
}
