import * as THREE from 'three';
import { VOLCANO, LAVA_Y } from './terrain.js';

// Shared animated lava surface material (crater lake and lava-cave pools).
export function lavaMaterial(shared) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    fog: true,
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * 0.25;
        float a = n(p + vec2(uTime * 0.08, uTime * 0.05)) * 0.6 + n(p * 2.3 - uTime * 0.12) * 0.4;
        float crust = smoothstep(0.55, 0.7, a);
        vec3 hot = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.3), smoothstep(0.2, 0.0, abs(a - 0.45)));
        vec3 col = mix(hot * 2.2, vec3(0.12, 0.05, 0.03), crust);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = shared.uTime;
  m.toneMapped = false;
  return m;
}

function softSprite(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Crater lava lake, a rising smoke column and drifting embers.
export class Volcano {
  constructor(scene, shared) {
    this.scene = scene;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO.crater + 2, 48), lavaMaterial(shared));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(VOLCANO.x, LAVA_Y, VOLCANO.z);
    scene.add(lake);
    this.lake = lake;

    const make = (n, tex, size, color, blending) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({ size, map: tex, color, transparent: true, depthWrite: false, blending, sizeAttenuation: true, opacity: 0.65 });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts, n, life: new Float32Array(n).map(() => Math.random()), seed: new Float32Array(n * 2).map(() => Math.random() * 2 - 1) };
    };
    this.smoke = make(70, softSprite('rgba(90,86,84,0.9)', 'rgba(90,86,84,0)'), 26, 0x77706c, THREE.NormalBlending);
    this.embers = make(60, softSprite('rgba(255,200,90,1)', 'rgba(255,90,20,0)'), 1.6, 0xffaa55, THREE.AdditiveBlending);
  }

  update(dt, playerPos) {
    const near = Math.hypot(playerPos.x - VOLCANO.x, playerPos.z - VOLCANO.z) < 700;
    this.smoke.pts.visible = this.embers.pts.visible = near;
    if (!near) return;
    const step = (sys, speed, rise, spread, grow) => {
      const pos = sys.pts.geometry.attributes.position.array;
      for (let i = 0; i < sys.n; i++) {
        sys.life[i] += dt * speed;
        if (sys.life[i] > 1) sys.life[i] -= 1;
        const l = sys.life[i];
        const r = spread * (0.2 + l * grow);
        pos[i * 3] = VOLCANO.x + sys.seed[i * 2] * r + l * 30;          // smoke drifts east with the wind
        pos[i * 3 + 1] = LAVA_Y + 2 + l * rise;
        pos[i * 3 + 2] = VOLCANO.z + sys.seed[i * 2 + 1] * r;
      }
      sys.pts.geometry.attributes.position.needsUpdate = true;
    };
    step(this.smoke, 0.05, 160, 10, 3.5);
    step(this.embers, 0.25, 45, 12, 1.2);
  }
}
