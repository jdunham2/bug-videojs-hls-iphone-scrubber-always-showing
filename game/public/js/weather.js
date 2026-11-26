// Client weather renderer: rain streaks, blizzard snow and ash storms around the camera, plus fog and light changes.
import * as THREE from 'three';
import { G } from './state.js';
import { weatherFx } from '../shared/life.js';

const N = 1400, BOX = 34, H = 22;
function flakeTex() { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); }
export class WeatherView {
  constructor() {
    this.kind = 'clear'; this.k = 0; this.fogMul = 1; this.t = 0;
    // rain: line segments
    const rp = new Float32Array(N * 6);
    this.rainGeo = new THREE.BufferGeometry(); this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: '#a8c0d8', transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false;
    // snow / ash: points
    const pp = new Float32Array(N * 3);
    this.ptsGeo = new THREE.BufferGeometry(); this.ptsGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.ptsMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, map: flakeTex(), transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, alphaTest: 0.01 });
    this.pts = new THREE.Points(this.ptsGeo, this.ptsMat); this.pts.frustumCulled = false;
    this.drops = Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * BOX * 2, y: Math.random() * H, z: (Math.random() - 0.5) * BOX * 2, s: 0.7 + Math.random() * 0.6, ph: Math.random() * 6.28 }));
    this.root = new THREE.Group(); this.root.add(this.rain, this.pts);
    this.rain.visible = this.pts.visible = false;
  }
  set(kind) { this.kind = kind || 'clear'; }
  attach(scene) { scene.add(this.root); }
  update(dt, zone, cam) {
    this.t += dt;
    const W = weatherFx(this.kind), on = this.kind !== 'clear';
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * 0.5);
    if (zone?.scene?.fog && zone.baseFog === undefined) zone.baseFog = zone.scene.fog.density;
    if (zone?.scene?.fog?.density !== undefined && zone.baseFog !== undefined) { this.fogMul += ((on ? W.fog || 1 : 1) - this.fogMul) * Math.min(1, dt * 0.5); zone.scene.fog.density = zone.baseFog * (1 + (this.fogMul - 1) * this.k); }
    const show = this.k > 0.02 && zone && zone.type !== 'town' && zone.type !== 'dungeon' && zone.type !== 'rift';
    const rainy = show && (this.kind === 'rain' || (this.kind === 'clear' && this.last === 'rain'));
    const flaky = show && !rainy;
    if (on) this.last = this.kind;
    this.rain.visible = rainy; this.pts.visible = flaky;
    if (!show) return;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const n = Math.floor(N * Math.min(1, this.k));
    if (rainy) {
      const a = this.rainGeo.attributes.position.array, wind = 3;
      for (let i = 0; i < N; i++) {
        const d = this.drops[i];
        d.y -= 28 * d.s * dt; d.x += wind * dt;
        if (d.y < -4 || i >= n) { d.y = H - Math.random() * 4; d.x = (Math.random() - 0.5) * BOX * 2; d.z = (Math.random() - 0.5) * BOX * 2; }
        const x = cx + d.x, y = cy - 6 + d.y, z = cz + d.z, o = i * 6, vis = i < n ? 1 : 0;
        a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x - wind * 0.03; a[o + 4] = y - 0.9 * vis; a[o + 5] = z;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.42 * this.k;
      if (zone.flash !== undefined && Math.random() < dt * 0.05) { zone.flash = 0.9; setTimeout(() => G.audio.slam(), 300 + Math.random() * 900); }
    } else {
      const ash = this.kind === 'ash' || this.last === 'ash', a = this.ptsGeo.attributes.position.array;
      const fall = ash ? 1.2 : 3.4, wind = ash ? 4.5 : 7;
      this.ptsMat.color.set(ash ? '#9a8a80' : '#ffffff'); this.ptsMat.size = ash ? 0.16 : 0.22; this.ptsMat.opacity = 0.9 * this.k;
      for (let i = 0; i < N; i++) {
        const d = this.drops[i];
        d.y -= fall * d.s * dt; d.x += (wind + Math.sin(this.t * 1.3 + d.ph) * 2) * dt * d.s; d.z += Math.cos(this.t + d.ph) * dt;
        if (d.y < -4 || d.x > BOX || i >= n) { d.y = H - Math.random() * 6; d.x = -BOX + Math.random() * 6; d.z = (Math.random() - 0.5) * BOX * 2; if (Math.random() < 0.5) d.x = (Math.random() - 0.5) * BOX * 2; }
        const o = i * 3; a[o] = cx + d.x; a[o + 1] = i < n ? cy - 6 + d.y : -999; a[o + 2] = cz + d.z;
      }
      this.ptsGeo.attributes.position.needsUpdate = true;
      if (ash && Math.random() < dt * 20) G.fx.emit({ pos: new THREE.Vector3(cx + (Math.random() - 0.5) * 30, cy - 3 + Math.random() * 6, cz + (Math.random() - 0.5) * 30), count: 1, speed: 2, dir: new THREE.Vector3(1, 0.2, 0), spread: 0.4, color: '#ffb060', color2: '#ff3000', size: 0.14, life: 1.5, drag: 0.3 });
    }
  }
}
