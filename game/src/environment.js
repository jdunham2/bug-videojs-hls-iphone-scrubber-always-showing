import * as THREE from 'three';
import { WORLD, buildHeightTexture } from './terrain.js';
import { mergeParts, mtx, lumpify } from './util.js';
import { smoothstep, lerp } from './noise.js';

// Sky dome, sun/moon lighting, water, clouds and the day/night cycle.
export class Environment {
  constructor(scene, renderer, quality, shared) {
    this.scene = scene;
    this.shared = shared;
    this.time = 0.30;           // 0..1, 0.25 = sunrise, 0.5 = noon
    this.dayLength = 720;       // seconds per full day
    this.day = 1;

    // ---------- Lights ----------
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a3f2a, 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = true;
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3();

    // ---------- Sky ----------
    this.skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: shared.uTime,
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        uniform vec3 uSunDir, uTop, uHorizon, uSunColor; uniform float uNight; uniform float uTime;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.45));
          col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.25, d.y));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.6);
          col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 8.0;
          // moon (opposite the sun)
          float md = max(dot(d, -normalize(uSunDir)), 0.0);
          col += vec3(0.75,0.8,1.0) * smoothstep(0.9990, 0.9994, md) * 1.5 * uNight;
          col += vec3(0.2,0.25,0.4) * pow(md, 30.0) * 0.3 * uNight;
          // stars
          vec3 sp = floor(d * 400.0);
          float s = step(0.9985, hash(sp)) * smoothstep(0.0, 0.3, d.y);
          float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash(sp + 7.0) * 40.0);
          col += vec3(s * tw) * uNight * 1.2;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    scene.fog = new THREE.FogExp2(0xbfd6e6, 0.0032);

    // ---------- Water ----------
    const heightTex = buildHeightTexture(256);
    this.waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uHeight: { value: null },
      uWorld: { value: WORLD },
      uLight: { value: 1 },
    }]);
    this.waterUniforms.uTime = shared.uTime;
    this.waterUniforms.uHeight.value = heightTex;
    const waterMat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true, fog: true,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWPos;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          wp.y += sin(wp.x*0.05 + uTime*0.9)*0.12 + sin(wp.z*0.07 + uTime*1.1)*0.1;
          vWPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uWorld, uLight; uniform vec3 uSunDir, uSunColor, uSky; uniform sampler2D uHeight;
        varying vec3 vWPos;
        #include <fog_pars_fragment>
        vec2 wave(vec2 p, vec2 dir, float f, float s, float a){ float ph = dot(p, dir)*f + uTime*s; return dir * cos(ph) * a * f; }
        void main(){
          vec2 p = vWPos.xz;
          vec2 g = wave(p, normalize(vec2(1.0,0.3)), 0.11, 1.3, 0.35) + wave(p, normalize(vec2(-0.4,1.0)), 0.17, 1.7, 0.22)
                 + wave(p, normalize(vec2(0.7,-0.8)), 0.43, 2.6, 0.08) + wave(p, normalize(vec2(-0.9,-0.2)), 0.9, 3.4, 0.035)
                 + wave(p, normalize(vec2(0.2,0.95)), 1.9, 4.5, 0.012);
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 v = normalize(cameraPosition - vWPos);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.85 + 0.08;
          vec2 uv = p / uWorld + 0.5;
          float ground = -30.0;
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ground = texture2D(uHeight, uv).r;
          float depth = clamp(-ground, 0.0, 30.0);
          vec3 shallow = vec3(0.10, 0.55, 0.55);
          vec3 deep = vec3(0.01, 0.10, 0.20);
          vec3 water = mix(shallow, deep, smoothstep(0.0, 14.0, depth)) * uLight;
          vec3 col = mix(water, uSky, fres);
          vec3 r = reflect(-v, n);
          float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0);
          col += uSunColor * spec * 3.0 * step(0.0, uSunDir.y);
          // shoreline foam
          float foamBand = 1.0 - smoothstep(0.0, 1.6, depth);
          float foamN = sin(p.x*1.3 + uTime*1.5)*sin(p.y*1.1 - uTime*1.2)*0.5+0.5;
          float foam = foamBand * smoothstep(0.35, 0.9, foamN + foamBand*0.6);
          col = mix(col, vec3(0.95) * max(uLight, 0.25), foam * 0.8);
          float alpha = mix(0.55, 0.94, smoothstep(0.0, 4.0, depth));
          alpha = max(alpha, fres);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const wgeo = new THREE.PlaneGeometry(6000, 6000, 200, 200);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, waterMat);
    this.water.renderOrder = 2;
    scene.add(this.water);

    // ---------- Clouds ----------
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92, fog: false, emissive: 0x222833 });
    this.cloudMat = cloudMat;
    for (let i = 0; i < 26; i++) {
      const parts = [];
      const n = 5 + Math.floor(Math.random() * 6);
      for (let k = 0; k < n; k++) {
        const r = 10 + Math.random() * 14;
        parts.push({ geo: lumpify(new THREE.IcosahedronGeometry(r, 1), 0.25), color: 0xffffff,
          matrix: mtx((k - n / 2) * 13 + Math.random() * 6, Math.random() * 6, (Math.random() - 0.5) * 18, 0, 0, 0, 1, 0.55, 1) });
      }
      const m = new THREE.Mesh(mergeParts(parts), cloudMat);
      const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 650;
      m.position.set(Math.cos(a) * d, 150 + Math.random() * 60, Math.sin(a) * d);
      m.rotation.y = Math.random() * Math.PI;
      m.scale.setScalar(0.8 + Math.random() * 0.9);
      this.clouds.add(m);
    }
    scene.add(this.clouds);

    // palette
    this._c = {
      dayTop: new THREE.Color(0x3a7bd5), dayHor: new THREE.Color(0xbfd6e6),
      duskTop: new THREE.Color(0x2c3e70), duskHor: new THREE.Color(0xf09060),
      nightTop: new THREE.Color(0x02040c), nightHor: new THREE.Color(0x0b1424),
      sunDay: new THREE.Color(0xfff1d6), sunDusk: new THREE.Color(0xff8a4a),
    };
    this.top = new THREE.Color(); this.hor = new THREE.Color(); this.sunCol = new THREE.Color();
  }

  get isNight() { return this.daylight < 0.25; }

  clockString() {
    const t = (this.time * 24 + 24) % 24;
    const h = Math.floor(t), m = Math.floor((t - h) * 60);
    return `Day ${this.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt, focus) {
    const prev = this.time;
    this.time = (this.time + dt / this.dayLength) % 1;
    if (this.time < prev) this.day++;

    const ang = (this.time - 0.25) * Math.PI * 2;  // 0 at sunrise
    this.sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang), 0.35).normalize();
    const elev = this.sunDir.y;
    const day = smoothstep(-0.12, 0.25, elev);
    const dusk = (1 - smoothstep(0.0, 0.35, Math.abs(elev))) ;
    this.daylight = day;

    const c = this._c;
    this.top.copy(c.nightTop).lerp(c.dayTop, day).lerp(c.duskTop, dusk * 0.5 * day + dusk * 0.2);
    this.hor.copy(c.nightHor).lerp(c.dayHor, day).lerp(c.duskHor, dusk * 0.75);
    this.sunCol.copy(c.sunDusk).lerp(c.sunDay, smoothstep(0.05, 0.4, elev));

    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    this.skyUniforms.uTop.value.copy(this.top);
    this.skyUniforms.uHorizon.value.copy(this.hor);
    this.skyUniforms.uSunColor.value.copy(this.sunCol).multiplyScalar(day);
    this.skyUniforms.uNight.value = 1 - day;

    // Sun follows the player so the shadow frustum stays centred.
    const lightDir = elev > -0.05 ? this.sunDir : this._moonDir || (this._moonDir = new THREE.Vector3());
    if (elev <= -0.05) lightDir.copy(this.sunDir).negate();
    this.sun.position.copy(focus).addScaledVector(lightDir, 300);
    this.sun.target.position.copy(focus);
    // snap to texel grid to reduce shadow shimmering
    this.sun.intensity = elev > -0.05 ? lerp(0.0, 2.8, smoothstep(-0.05, 0.3, elev)) : 0.35 * smoothstep(-0.05, -0.3, elev);
    this.sun.color.copy(elev > -0.05 ? this.sunCol : new THREE.Color(0x8aa0ff));
    this.hemi.intensity = lerp(0.12, 0.75, day);
    this.hemi.color.copy(this.top).lerp(new THREE.Color(0xffffff), 0.4);
    this.hemi.groundColor.set(0x3a3020).multiplyScalar(lerp(0.3, 1, day));

    this.scene.fog.color.copy(this.hor);
    this.scene.fog.density = lerp(0.0045, 0.0028, day);

    this.waterUniforms.uSunDir.value.copy(this.sunDir);
    this.waterUniforms.uSunColor.value.copy(this.sunCol).multiplyScalar(day);
    this.waterUniforms.uSky.value.copy(this.hor).lerp(this.top, 0.3);
    this.waterUniforms.uLight.value = lerp(0.12, 1, day);

    this.sky.position.copy(focus);
    this.water.position.x = Math.round(focus.x / 30) * 30;
    this.water.position.z = Math.round(focus.z / 30) * 30;

    this.cloudMat.color.copy(this.hor).lerp(new THREE.Color(0xffffff), 0.5 * day + 0.1);
    this.cloudMat.emissive.copy(this.hor).multiplyScalar(0.3);
    for (const cl of this.clouds.children) {
      cl.position.x += dt * 2.5;
      if (cl.position.x > 900) cl.position.x = -900;
    }
  }
}
