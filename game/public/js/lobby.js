// Lobby: class selection with a live 3D hero preview, banner colours, party code.
import * as THREE from 'three';
import { CLASSES } from '../shared/classes.js';
import { buildHero, animateRig } from './models.js';
import { COLORS } from './ui.js';
import { getToken } from './settings.js';

const $ = (id) => document.getElementById(id);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

export class Lobby {
  constructor() {
    this.cls = lsGet('emberfall_cls') || 'warden';
    if (!CLASSES[this.cls]) this.cls = 'warden';
    this.color = lsGet('emberfall_color') || COLORS[0];
    this.levels = {};
    const canvas = $('preview');
    const R = THREE.WebGLRenderer || THREE.WebGPURenderer; // the WebGPU build (experimental renderer) has no WebGLRenderer
    this.renderer = new R({ canvas, antialias: true, alpha: true, forceWebGL: true }); this.renderer.init?.();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 360, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 320 / 360, 0.1, 50);
    this.camera.position.set(0, 1.6, 6.4); this.camera.lookAt(0, 1.05, 0);
    this.scene.add(new THREE.HemisphereLight('#c8d8ff', '#2a1a10', 1.1));
    const key = new THREE.DirectionalLight('#ffe2b0', 2.6); key.position.set(2, 4, 3); key.castShadow = true; this.scene.add(key);
    this.rim = new THREE.PointLight('#ff9a3c', 25, 8, 2); this.rim.position.set(-1.5, 2.2, -1.5); this.scene.add(this.rim);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.18, 40), new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: 0.6, metalness: 0.3 }));
    disc.position.y = -0.09; disc.receiveShadow = true; this.scene.add(disc);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.025, 6, 64), new THREE.MeshBasicMaterial({ color: '#ff9a3c' }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.01; this.scene.add(this.ring);
    this.rot = 0.4; this.t = 0; this.drag = null;
    canvas.addEventListener('pointerdown', (e) => (this.drag = e.clientX));
    addEventListener('pointerup', () => (this.drag = null));
    addEventListener('pointermove', (e) => { if (this.drag !== null) { this.rot += (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    const qp = new URLSearchParams(location.search).get('room');
    if (qp) $('roomInput').value = qp.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.buildCards(); this.buildColors();
    this.setClass(this.cls);
    const token = getToken();
    if (window.EMBERFALL_OFFLINE) {
      $('roomRow').hidden = true; $('roomInput').hidden = true;
      $('lobbyGold').textContent = 'Solo mode — progress is saved in this browser. For online co-op, run the game server (npm start) and share the link.';
      import('./localserver.js').then(({ offlineProfile }) => { const p = token && offlineProfile(token); if (p) { this.levels = Object.fromEntries(Object.entries(p.chars || {}).map(([k, c]) => [k, c.level])); if (!$('nameInput').value) $('nameInput').value = p.name || ''; this.buildCards(); } }).catch(() => {});
    } else if (token) fetch('/api/profile?token=' + token).then((r) => r.json()).then((p) => {
      if (!p) return;
      this.levels = Object.fromEntries(Object.entries(p.chars || {}).map(([k, c]) => [k, c.level]));
      if (!$('nameInput').value) $('nameInput').value = p.name || '';
      if (p.color && !lsGet('emberfall_color')) { this.color = p.color; this.buildColors(); this.setClass(this.cls); }
      $('lobbyGold').textContent = p.gold ? `◉ ${p.gold.toLocaleString()} gold in your account` : '';
      this.buildCards();
    }).catch(() => {});
    this.active = true;
    if (!window.EMBERFALL_OFFLINE) { this.loadParties(); this.loadServers(); }
  }
  loadParties() {
    fetch('/api/parties').then((r) => r.json()).then((list) => {
      const el = $('partyBrowser');
      if (!this.active) return;
      el.innerHTML = list.length ? '<label>Public parties</label>' + list.map((p) => `<div class="pb-row"><span><b>${p.code}</b> · Depth ${p.depth} · ${p.players.map((x) => `${x.cls[0].toUpperCase()}${x.level}`).join(' ')}</span><button class="btn" data-c="${p.code}">Join</button></div>`).join('') : '';
      el.querySelectorAll('button').forEach((b) => (b.onclick = () => { $('roomInput').value = b.dataset.c; $('playBtn').click(); }));
      setTimeout(() => this.active && this.loadParties(), 5000);
    }).catch(() => {});
  }
  // region browser: other Emberfall servers known to the directory service (if this server uses one)
  loadServers() {
    fetch('/api/servers').then((r) => r.json()).then((j) => {
      if (!j.directory || !j.servers.length) return;
      const el = $('serverBrowser'), here = location.origin;
      el.innerHTML = '<label>Servers</label>' + j.servers.map((s) => `<div class="pb-row"><span><b>${s.name.replace(/[<>&]/g, '')}</b> · ${s.region.replace(/[<>&]/g, '')} · ${s.players} online <span class="muted" data-ping="${s.url}"></span></span>${s.url === here ? '<span class="muted">you are here</span>' : `<a class="btn" href="${encodeURI(s.url)}">Play</a>`}</div>`).join('');
      el.querySelectorAll('[data-ping]').forEach((sp) => { const t0 = performance.now(); fetch(sp.dataset.ping + '/healthz', { mode: 'no-cors', cache: 'no-store' }).then(() => (sp.textContent = `· ${Math.round(performance.now() - t0)} ms`)).catch(() => (sp.textContent = '· unreachable')); });
    }).catch(() => {});
  }
  buildCards() {
    $('classCards').innerHTML = Object.entries(CLASSES).map(([k, C]) => `<div class="ccard ${k === this.cls ? 'on' : ''}" data-k="${k}" style="--c:${C.color}"><div class="cicon">${{ warden: '🛡️', emberblade: '🔥', hexcaller: '🔮', ranger: '🏹' }[k]}</div><div class="cname">${C.name}</div><div class="crole">${C.role}</div>${this.levels[k] ? `<div class="clvl">Lv ${this.levels[k]}</div>` : ''}</div>`).join('');
    document.querySelectorAll('.ccard').forEach((c) => (c.onclick = () => this.setClass(c.dataset.k)));
  }
  buildColors() {
    const sw = $('colors'); sw.innerHTML = '';
    COLORS.forEach((c) => {
      const d = document.createElement('div'); d.className = 'sw' + (c === this.color ? ' on' : ''); d.style.background = c; d.style.color = c;
      d.onclick = () => { this.color = c; lsSet('emberfall_color', c); [...sw.children].forEach((x) => x.classList.remove('on')); d.classList.add('on'); this.setClass(this.cls); };
      sw.appendChild(d);
    });
  }
  setClass(k) {
    this.cls = k; lsSet('emberfall_cls', k);
    document.querySelectorAll('.ccard').forEach((c) => c.classList.toggle('on', c.dataset.k === k));
    const C = CLASSES[k];
    $('classInfo').innerHTML = `<div class="cdesc">${C.desc}</div><div class="cskills">${C.skills.map((s) => `<span title="${s.desc}">${s.icon} ${s.name}</span>`).join('')}</div><div class="cres" style="color:${C.resource.color}">Resource: ${C.resource.name}</div>`;
    if (this.hero) this.scene.remove(this.hero.root);
    this.hero = buildHero(this.color, k);
    this.hero.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.hero.root);
    this.rim.color.set(C.color); this.ring.material.color.set(C.color);
    this.t = 0;
  }
  values() { return { name: $('nameInput').value.trim() || 'Hero', room: $('roomInput').value.trim().toUpperCase(), cls: this.cls, color: this.color }; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.drag === null) this.rot += dt * 0.35;
    this.hero.root.rotation.y = this.rot;
    // cycle through showcase poses
    const cyc = this.t % 6, s = { t: this.t, move: 0, atk: -1, slam: -1 };
    if (cyc > 2 && cyc < 2.6) { s.atk = (cyc - 2) / 0.6; s.combo = 2; }
    else if (cyc > 4 && cyc < 4.8) {
      if (this.cls === 'warden') s.block = true;
      else if (this.cls === 'hexcaller') s.cast = Math.sin(((cyc - 4) / 0.8) * Math.PI);
      else s.channel = true;
    }
    if (s.channel) this.hero.root.rotation.y = this.rot + (this.t * 20) % (Math.PI * 2);
    animateRig(this.hero, s);
    this.ring.rotation.z += dt * 0.5;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { this.active = false; this.renderer.dispose(); }
}
