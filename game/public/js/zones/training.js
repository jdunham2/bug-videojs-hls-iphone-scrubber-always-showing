// Training Grounds: a fenced practice yard behind Emberhold with three dummies, for testing builds against a DPS meter.
import * as THREE from 'three';
import { G } from '../state.js';
import { makeSky, buildPortal, textures, mtx, makeSun, followSun, envFromSky, Batcher } from './common.js';

export class TrainingZone {
  constructor(renderer) {
    this.type = 'training'; this.name = 'Training Grounds'; this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.spawn = { x: 0, z: 10 }; this.spawnYaw = 0;
    this.bloom = { strength: 0.4, radius: 0.5, threshold: 0.85 }; this.exposure = 1.1;
    this.colliders = [];
    this.build();
  }
  groundHeight() { return 0; }
  collide(pos, r) {
    const d = Math.hypot(pos.x, pos.z), max = 19;
    if (d > max) { pos.x *= max / d; pos.z *= max / d; }
    for (const c of this.colliders) { const dx = pos.x - c.x, dz = pos.z - c.z, l = Math.hypot(dx, dz), min = c.r + r; if (l < min && l > 1e-4) { pos.x = c.x + (dx / l) * min; pos.z = c.z + (dz / l) * min; } }
    return pos;
  }
  build() {
    const s = this.scene;
    s.fog = new THREE.FogExp2('#b8c8d0', 0.012);
    this.sky = makeSky({ top: '#3f7fd6', horizon: '#cfe3f2', bottom: '#8aa0b0', sunDir: [0.5, 0.5, -0.5], sunColor: '#fff0c8', sunSize: 0.9993 }); s.add(this.sky);
    const env = envFromSky(this.renderer, this.sky); if (env) { s.environment = env; s.environmentIntensity = 0.5; }
    s.add(new THREE.HemisphereLight('#dde8ff', '#5a4a30', 1.1));
    this.sun = makeSun('#fff4e0', 2.6, 30); s.add(this.sun, this.sun.target);
    const sandTex = textures.flagstone.clone(); sandTex.repeat.set(10, 10); sandTex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 48), new THREE.MeshStandardMaterial({ color: '#c8b08a', map: sandTex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const grass = new THREE.Mesh(new THREE.RingGeometry(24, 120, 48), new THREE.MeshStandardMaterial({ color: '#5d8a3a', roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; s.add(grass);
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.9 }), B = new Batcher();
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 20.5, z = Math.sin(a) * 20.5; B.add(new THREE.BoxGeometry(0.25, 1.4, 0.25), wood, mtx(x, 0.7, z)); B.add(new THREE.BoxGeometry(3.3, 0.14, 0.12), wood, mtx(x, 1.1, z, -a + Math.PI / 2)); }
    // weapon racks and banners
    for (const sx of [-1, 1]) { B.add(new THREE.BoxGeometry(3, 0.15, 0.6), wood, mtx(sx * 12, 1.2, 4)); for (let k = 0; k < 4; k++) B.add(new THREE.CylinderGeometry(0.04, 0.04, 2, 5), new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.8, roughness: 0.3 }), mtx(sx * 12 - 1.1 + k * 0.7, 1.2, 4.1, 0, 0, 0.25)); this.colliders.push({ x: sx * 12, z: 4, r: 1.6 }); }
    B.build(s);
    // exit portal back to Emberhold
    this.portal = buildPortal('#ffb347', '#ff5a1a'); this.portal.position.set(0, 0, 17); this.portal.rotation.y = Math.PI; this.portal.scale.setScalar(0.7); s.add(this.portal);
    this.interactables = [{ x: 0, z: 17, r: 3, mark: 'EMBERHOLD', label: () => 'Return to Emberhold', action: () => G.actions.travel('town') }];
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#5d8a3a'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#c8b08a'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
    this.map = { canvas: c, worldSize: 50, center: { x: 0, z: 0 }, view: 50 }; this.mapIcons = [{ x: 0, z: 17, color: '#ffb347', icon: 'portal' }];
  }
  update(dt, t, playerPos) {
    this.sky.position.copy(G.camera.position); this.sky.material.uniforms.time.value = t;
    followSun(this.sun, playerPos, { x: 20, y: 30, z: -20 });
    this.portal.userData.update?.(t);
  }
  dispose() {}
}
