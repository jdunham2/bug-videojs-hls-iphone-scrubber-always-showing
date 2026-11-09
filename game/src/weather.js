import * as THREE from 'three';
import { lerp, clamp } from './noise.js';

// Weather: a slow state machine (clear → cloudy → rain → storm, plus fog banks) that
// tints the sky, thickens fog, dims the sun, drives rain streaks, wind, lightning and audio.
const STATES = {
  clear:  { cloud: 0.0, rain: 0, fog: 0.0, wind: 1.0, label: 'Clear' },
  cloudy: { cloud: 0.55, rain: 0, fog: 0.15, wind: 1.4, label: 'Overcast' },
  rain:   { cloud: 0.85, rain: 0.65, fog: 0.35, wind: 1.9, label: 'Rain' },
  storm:  { cloud: 1.0, rain: 1.0, fog: 0.5, wind: 3.0, label: 'Thunderstorm' },
  fog:    { cloud: 0.4, rain: 0, fog: 1.0, wind: 0.6, label: 'Fog' },
};
const NEXT = {
  clear: [['clear', 2], ['cloudy', 3], ['fog', 1]],
  cloudy: [['clear', 2], ['rain', 3], ['cloudy', 1]],
  rain: [['cloudy', 2], ['storm', 2], ['rain', 1]],
  storm: [['rain', 3], ['cloudy', 1]],
  fog: [['clear', 2], ['cloudy', 1]],
};
const RAIN_N = 2600;
const BOX = 46;

export class Weather {
  constructor(scene, shared, audio) {
    this.scene = scene;
    this.shared = shared;
    this.audio = audio;
    this.state = 'clear';
    this.timer = 150 + Math.random() * 120;
    this.cur = { cloud: 0, rain: 0, fog: 0, wind: 1 };
    this.flash = 0;
    this.boltCd = 8;
    this.grey = new THREE.Color(0x6a7078);
    this.stormGrey = new THREE.Color(0x3a4048);

    const pos = new Float32Array(RAIN_N * 6);
    this.seeds = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      this.seeds[i * 3] = (Math.random() - 0.5) * BOX;
      this.seeds[i * 3 + 1] = Math.random() * BOX;
      this.seeds[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaabbd0, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 3;
    scene.add(this.rain);
  }

  get label() { return STATES[this.state].label; }
  get raining() { return this.cur.rain > 0.2; }

  set(state) { this.state = state; this.timer = 150 + Math.random() * 180; }

  update(dt, env, camera, playerUnderwater, altitude = 0) {
    // snow always falls high on the peaks
    const snow = clamp((altitude - 55) / 20, 0, 1);
    this.snow = snow;
    this.timer -= dt;
    if (this.timer <= 0) {
      const opts = NEXT[this.state];
      let r = Math.random() * opts.reduce((n, o) => n + o[1], 0);
      for (const [s, w] of opts) { r -= w; if (r <= 0) { this.set(s); break; } }
    }
    const tgt = STATES[this.state];
    const k = Math.min(1, dt / 20); // ~20 s blends
    for (const key of ['cloud', 'rain', 'fog', 'wind']) this.cur[key] = lerp(this.cur[key], tgt[key], k);
    const { cloud, rain, fog, wind } = this.cur;
    this.shared.uWind.value = wind;

    // --- sky, fog and light
    const su = env.skyUniforms;
    const g = this.state === 'storm' ? this.stormGrey : this.grey;
    const dayK = 0.25 + env.daylight * 0.75;
    const gc = g.clone().multiplyScalar(dayK);
    su.uTop.value.lerp(gc, Math.min(1, cloud * 0.95 + fog * 0.3));
    su.uHorizon.value.lerp(gc, Math.min(1, cloud * 0.85 + fog * 0.5));
    su.uSunColor.value.multiplyScalar(1 - cloud * 0.9);
    env.sun.intensity *= 1 - cloud * 0.65;
    env.hemi.intensity *= 1 - cloud * 0.25;
    this.scene.fog.color.lerp(gc, Math.max(cloud * 0.7, fog * 0.6));
    this.scene.fog.density *= 1 + fog * 6 + rain * 1.2;
    env.waterUniforms.uSky.value.lerp(gc, cloud * 0.7);
    env.cloudMat.color.lerp(gc, cloud * 0.8);
    env.cloudMat.opacity = 0.92;

    // --- lightning
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.state === 'storm' && this.cur.rain > 0.7) {
      this.boltCd -= dt;
      if (this.boltCd <= 0) {
        this.boltCd = 5 + Math.random() * 12;
        this.flash = 1;
        const delay = 300 + Math.random() * 2500;
        setTimeout(() => this.thunder(1 - delay / 3200), delay);
      }
    }
    if (this.flash > 0) {
      const f = this.flash * (0.6 + Math.random() * 0.4);
      env.hemi.intensity += f * 2.2;
      su.uTop.value.lerp(new THREE.Color(0xc8d4ff), f * 0.6);
      su.uHorizon.value.lerp(new THREE.Color(0xc8d4ff), f * 0.5);
    }

    // --- rain streaks around the camera
    const precip = Math.max(rain, snow * 0.9);
    this.rainMat.opacity = precip * (snow > 0.3 ? 0.9 : 0.55) * (playerUnderwater ? 0 : 1);
    this.rainMat.color.setRGB(0.67 + snow * 0.33, 0.73 + snow * 0.27, 0.82 + snow * 0.18);
    this.rain.visible = precip > 0.02;
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position.array;
      const t = this.shared.uTime.value;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const fall = lerp(22, 2.5, snow), len = lerp(0.9 + rain * 0.6, 0.1, snow);
      const slant = wind * 0.12;
      for (let i = 0; i < RAIN_N; i++) {
        const sx = this.seeds[i * 3], sy = this.seeds[i * 3 + 1], sz = this.seeds[i * 3 + 2];
        // wrap each drop inside a box centred on the camera
        const x = cx + ((((sx - cx) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
        const z = cz + ((((sz - cz) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
        const y = cy + ((((sy - t * fall) % BOX) + BOX) % BOX) - BOX / 2;
        const o = i * 6;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x + slant * len; pos[o + 4] = y + len; pos[o + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // --- audio
    this.audio.weather?.(rain, wind);
  }

  thunder(near) {
    this.audio.thunder?.(clamp(near, 0.1, 1));
  }
}
