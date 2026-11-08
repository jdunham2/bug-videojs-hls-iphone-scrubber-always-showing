import * as THREE from 'three';

// Merge a list of { geo, color, matrix?, sway? } into one non-indexed BufferGeometry
// with per-vertex colors. Keeps draw calls low for instanced props and creatures.
export function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal;
    c.set(p.color ?? 0xffffff);
    const jitter = p.jitter ?? 0;
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
      const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      col.push(c.r * j, c.g * j, c.b * j);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
  return m;
}

// Displace vertices of a geometry with random noise (for rocks, foliage clumps).
export function lumpify(geo, amount, rand = Math.random) {
  const g = geo.index ? geo : geo;
  const p = g.attributes.position;
  const map = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let d = map.get(key);
    if (d === undefined) { d = 1 + (rand() - 0.5) * amount; map.set(key, d); }
    v.multiplyScalar(d);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Adds a wind sway to a standard material. Strength scales with local height.
export function addWind(material, uniforms, { strength = 0.05, heightScale = 1, freq = 1.3 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float h = max(position.y, 0.0) * ${heightScale.toFixed(3)};
          float ph = ip.x * 0.13 + ip.z * 0.17;
          float s = sin(uTime * ${freq.toFixed(3)} + ph) * 0.7 + sin(uTime * ${(freq * 2.7).toFixed(3)} + ph * 1.7) * 0.3;
          transformed.x += s * h * h * ${strength.toFixed(4)} * uWind;
          transformed.z += cos(uTime * ${(freq * 0.8).toFixed(3)} + ph) * h * h * ${(strength * 0.6).toFixed(4)} * uWind;
        }`);
  };
  material.customProgramCacheKey = () => 'wind' + strength + heightScale + freq;
  return material;
}

export function rand(a, b) { return a + Math.random() * (b - a); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
