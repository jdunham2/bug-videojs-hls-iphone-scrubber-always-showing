// WebGPU renderer path (opt-in in Settings → Graphics). Loaded only when "three" maps to the WebGPU build:
// node-material (TSL) versions of the custom GLSL shaders, instanced sprite particles and TSL bloom.
import * as THREE from 'three/webgpu';
import { uniform, vec3, vec4, float, uv, positionLocal, normalize, dot, max, pow, mix, smoothstep, select, length, sin, atan2, instancedBufferAttribute, pass, hash, floor } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const U = (v) => uniform(v);

/** gradient sky with sun/moon disc and stars; exposes .uniforms like the GLSL version */
export function skyMaterial(o) {
  const u = {
    top: U(new THREE.Color(o.top)), horizon: U(new THREE.Color(o.horizon)), bottom: U(new THREE.Color(o.bottom || o.horizon)),
    sunDir: U(new THREE.Vector3(...(o.sunDir || [0.4, 0.5, -0.6])).normalize()), sunColor: U(new THREE.Color(o.sunColor || '#fff2c0')),
    sunSize: U(o.sunSize || 0.9995), stars: U(o.stars || 0), time: U(0), moon: U(o.moon || 0),
  };
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const d = normalize(positionLocal), h = d.y;
  const up = mix(u.horizon, u.top, pow(max(h, 0.0001), 0.55)), down = mix(u.horizon, u.bottom, pow(max(h.negate(), 0.0001), 0.4));
  const sd = dot(d, normalize(u.sunDir)), isMoon = u.moon.greaterThan(0);
  let col = select(h.greaterThan(0), up, down);
  col = col.add(u.sunColor.mul(pow(max(sd, 0), 12).mul(select(isMoon, 0.18, 0.35)))).add(u.sunColor.mul(pow(max(sd, 0), 180).mul(select(isMoon, 0.25, 0.6))));
  const disc = smoothstep(u.sunSize, u.sunSize.add(0.0004), sd);
  col = mix(col, u.sunColor.mul(select(isMoon, 0.85, 3.0)), disc);
  const g = floor(d.mul(260)), s = hash(g.x.add(g.y.mul(57)).add(g.z.mul(113)));
  const tw = sin(u.time.mul(2).add(s.mul(50))).mul(0.4).add(0.6);
  col = col.add(vec3(s.greaterThan(0.9975).select(1, 0)).mul(tw).mul(u.stars).mul(smoothstep(0, 0.25, h)));
  m.colorNode = col;
  m.uniforms = u;
  return m;
}

/** swirling portal disc */
export function portalMaterial(c1, c2) {
  const u = { time: U(0), c1: U(new THREE.Color(c1)), c2: U(new THREE.Color(c2)) };
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const p = uv().mul(2).sub(1), r = length(p), a = atan2(p.y, p.x);
  const s = sin(a.mul(5).add(u.time.mul(3)).sub(r.mul(14))).mul(0.5).add(0.5), s2 = sin(a.mul(3).sub(u.time.mul(2.2)).add(r.mul(9))).mul(0.5).add(0.5);
  let col = mix(u.c1, u.c2, s.mul(s2)).mul(float(1.3).sub(r.mul(0.5)).mul(1.05));
  col = col.add(u.c2.mul(pow(float(1).sub(r).max(0), 4).mul(1.4))).add(u.c1.mul(smoothstep(0.8, 1, r).mul(1.2)));
  m.colorNode = col; m.opacityNode = smoothstep(1, 0.88, r).mul(0.95);
  m.uniforms = u;
  return m;
}

/** additive light beam over loot */
export function beamMaterial(color) {
  const u = { color: U(new THREE.Color(color)), time: U(0) };
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const a = pow(float(1).sub(uv().y), 1.6).mul(sin(u.time.mul(4).add(uv().y.mul(10))).mul(0.15).add(0.55));
  m.colorNode = u.color.mul(a).mul(1.6); m.opacityNode = a;
  m.uniforms = u;
  return m;
}

/** GPU particles as instanced camera-facing sprites (WebGPU has no point sizes); shares the FX typed arrays */
export function particleMesh(fx, count) {
  const pos = new THREE.InstancedBufferAttribute(fx.pos, 3), col = new THREE.InstancedBufferAttribute(fx.col, 3);
  const size = new THREE.InstancedBufferAttribute(fx.size, 1), alpha = new THREE.InstancedBufferAttribute(fx.alpha, 1);
  for (const a of [pos, col, size, alpha]) a.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.positionNode = instancedBufferAttribute(pos);
  m.scaleNode = instancedBufferAttribute(size); // size is the sprite's world-space diameter, as in the GLSL point shader
  const d = length(uv().sub(0.5)), k = pow(max(float(1).sub(d.mul(2)), 0), 1.6).mul(instancedBufferAttribute(alpha));
  m.colorNode = vec4(instancedBufferAttribute(col).mul(k), k);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false; mesh.renderOrder = 10;
  mesh.userData.attrs = [pos, col, size, alpha];
  return mesh;
}

/** scene pass + TSL bloom; mirrors the WebGL composer's strength/radius/threshold controls */
export function makePost(renderer, scene, camera) {
  const post = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera), out = scenePass.getTextureNode('output');
  const b = bloom(out, 0.6, 0.5, 0.8);
  post.outputNode = out.add(b);
  return {
    post, scenePass,
    setScene(s) { scenePass.scene = s; },
    bloom: { set strength(v) { b.strength.value = v; }, get strength() { return b.strength.value; }, set radius(v) { b.radius.value = v; }, get radius() { return b.radius.value; }, set threshold(v) { b.threshold.value = v; }, get threshold() { return b.threshold.value; }, enabled: true },
    render() { post.render(); },
  };
}
export { THREE };
