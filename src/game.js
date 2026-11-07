import * as THREE from 'three';
import GUI from 'lil-gui';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { config, saveConfig, resetConfig } from './config.js';
import { World, ARENA_HALF, pillars } from './world.js';
import { Environment, spawnGates } from './environment.js';
import { Player, ARROW_HEIGHT } from './player.js';
import { Grunt } from './enemy.js';
import { ArrowSystem } from './arrows.js';
import { Particles, DamageNumbers, Shake } from './fx.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { build, lv, stat, rollCards, ROMAN, TYPE_LABEL } from './skills.js';
import { modelStatus } from './models.js';
import { audioStatus } from './audio.js';

const UP = new THREE.Vector3(0, 1, 0);

// Final look: gentle teal-shadow / warm-highlight split tone, contrast, vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.45 }, uGrade: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uGrade; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 graded = c.rgb;
      graded = mix(graded, graded * vec3(0.92, 1.0, 1.06), (1.0 - l) * 0.5);   // cool shadows
      graded = mix(graded, graded * vec3(1.06, 1.0, 0.92), l * 0.4);           // warm highlights
      graded = (graded - 0.5) * 1.08 + 0.5;                                     // a touch of contrast
      c.rgb = mix(c.rgb, graded, uGrade);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = c;
    }`,
};
const BEST_KEY = 'draw-release.best.v1';

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || 'null') || { wave: 0, kills: 0 };
  } catch {
    return { wave: 0, kills: 0 };
  }
}

export class Game {
  constructor(container) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(12, 17, 12);
    this.camTarget = new THREE.Vector3();
    this.camForward = new THREE.Vector3(-this.camOffset.x, 0, -this.camOffset.z).normalize();
    this.camRight = new THREE.Vector3().crossVectors(this.camForward, UP).normalize();

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.2 });
    this.ao.blendIntensity = 0.85;
    this.ao.enabled = config.feel.ambientOcclusion;
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), config.feel.bloomStrength, 0.5, 0.9);
    this.bloom.enabled = config.feel.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uVignette.value = config.feel.vignette;
    this.grade.uniforms.uGrade.value = config.feel.grade;
    this.composer.addPass(this.grade);

    this.world = new World(this.scene);
    this.env = new Environment(this);
    this.player = new Player(this.scene);
    this.arrows = new ArrowSystem(this.scene);
    this.particles = new Particles(this.scene);
    this.numbers = new DamageNumbers(document.getElementById('numbers'), this.camera);
    this.shake = new Shake();
    this.sfx = new Sfx();
    this.sfx.init(); // decode samples now; playback starts on the first click
    this.input = new Input(r.domElement);
    this.enemies = [];

    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(UP, -ARROW_HEIGHT);
    this.aimPoint = new THREE.Vector3(0, ARROW_HEIGHT, 0);
    this.shakeOffset = new THREE.Vector3();

    const $ = (id) => document.getElementById(id);
    this.hud = {
      root: $('hud'),
      hpFill: $('hp-fill'),
      hpText: $('hp-text'),
      dodgeFill: $('dodge-fill'),
      dodgeBox: $('dodge'),
      build: $('build'),
      draft: $('draft'),
      stats: $('stats'),
      wave: $('wave-label'),
      enemies: $('enemies-label'),
      streak: $('streak'),
      banner: $('banner'),
      reticle: $('reticle'),
      overlay: $('overlay'),
      vignette: $('vignette'),
    };

    this.state = 'title';
    this.time = 0;
    this.hitStop = 0;
    this.best = loadBest();
    this.resetRun();
    this.setupGui();
    this.showOverlay('title');

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.setPaused(true);
    });
    this.hud.overlay.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sfx.unlock();
      if (this.state === 'paused') this.setPaused(false);
      else this.start();
    });
    this.hud.draft.addEventListener('pointerover', (e) => {
      const card = e.target.closest('.card');
      if (card && card !== this.hoverCard) this.sfx.uiHover();
      this.hoverCard = card;
    });
    this.hud.draft.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('[data-pick]');
      if (card) this.pickSkill(Number(card.dataset.pick));
      else if (e.target.closest('[data-reroll]')) this.reroll();
    });
  }

  // ---------------------------------------------------------------- skill draft

  openDraft() {
    this.state = 'choosing';
    this.player.drawing = false;
    this.sfx.drawStop();
    this.draftCards = rollCards(3, this.wave);
    this.renderDraft();
  }

  renderDraft() {
    const cards = this.draftCards
      .map((c, i) => {
        const level = c.max === Infinity ? '' : c.max === 1 ? 'Unique' : `Level ${ROMAN[c.next]} / ${ROMAN[c.max]}`;
        const type = c.rarity === 'legendary' ? 'Legendary' : TYPE_LABEL[c.type];
        return `
        <button class="card r-${c.rarity} t-${c.type}" data-pick="${i}">
          <span class="key">${i + 1}</span>
          <span class="type">${type}</span>
          <span class="name"></span>
          <span class="level">${level}</span>
          <span class="desc"></span>
          ${c.note ? '<span class="note"></span>' : ''}
        </button>`;
      })
      .join('');
    const d = this.hud.draft;
    d.innerHTML = `
      <div class="draft-head">
        <div class="eyebrow">Wave ${this.wave} cleared</div>
        <h2>Choose a skill</h2>
      </div>
      <div class="cards">${cards}</div>
      <button class="reroll" data-reroll ${build.rerolls > 0 ? '' : 'disabled'}>Reroll (${build.rerolls} left) · F</button>`;
    // Text set via textContent so names/descriptions can't inject markup.
    d.querySelectorAll('.card').forEach((el, i) => {
      const c = this.draftCards[i];
      el.querySelector('.name').textContent = c.name;
      el.querySelector('.desc').textContent = c.text;
      if (c.note) el.querySelector('.note').textContent = c.note;
    });
    d.classList.add('visible');
  }

  hideDraft() {
    this.hud.draft.classList.remove('visible');
    this.hud.draft.innerHTML = '';
  }

  reroll() {
    if (this.state !== 'choosing' || build.rerolls <= 0) return;
    build.rerolls--;
    this.sfx.reroll();
    this.draftCards = rollCards(3, this.wave);
    this.renderDraft();
  }

  pickSkill(i) {
    if (this.state !== 'choosing') return;
    const card = this.draftCards[i];
    if (!card) return;
    build.add(card.id);
    const p = this.player;
    if (card.id === 'vitality') p.hp = stat.maxHp();
    if (card.id === 'secondWind') p.charges++;
    if (card.id === 'patchUp') p.hp = Math.min(stat.maxHp(), p.hp + 40);
    this.sfx.pick();
    this.hideDraft();
    this.state = 'playing';
    this.waveState = 'break';
    this.breakTimer = config.waves.breakTime;
    const level = card.max > 1 && card.max !== Infinity ? ` ${ROMAN[card.next]}` : '';
    this.banner(`${card.name}${level}`, card.text, 2);
    this.particles.spawn(p.pos.clone().setY(1), { count: 24, color: [3, 2.2, 0.6], speed: 4, up: 3, life: 0.7, size: 0.08, gravity: 3 });
  }

  // ---------------------------------------------------------------- run state

  resetRun() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.arrows.clear();
    this.particles.clear();
    this.numbers.clear();
    for (const b of this.bolts || []) b.line.removeFromParent();
    this.bolts = [];
    build.reset();
    this.player.reset();
    this.hideDraft?.();
    this.stats = { shots: 0, hits: 0, perfects: 0, kills: 0, staggers: 0, streak: 0, bestStreak: 0, dodges: 0, perfectDodges: 0 };
    this.slowmo = 0;
    this.wave = 0;
    this.waveState = 'break';
    this.breakTimer = 1.2;
    this.toSpawn = 0;
    this.elapsed = 0;
    this.deathTimer = 0;
    this.hitStop = 0;
    this.hud?.vignette.classList.remove('slowmo');
    this.camTarget.copy(this.player.pos);
  }

  start() {
    this.resetRun();
    this.sfx.runStart();
    this.state = 'playing';
    this.hideOverlay();
  }

  setPaused(paused) {
    if (paused && this.state === 'playing') {
      this.state = 'paused';
      this.player.drawing = false;
      this.sfx.drawStop();
      this.showOverlay('paused');
    } else if (!paused && this.state === 'paused') {
      this.state = 'playing';
      this.hideOverlay();
    }
  }

  gameOver() {
    this.state = 'gameover';
    this.sfx.gameOver();
    const newBest = this.wave > this.best.wave || (this.wave === this.best.wave && this.stats.kills > this.best.kills);
    if (newBest) {
      this.best = { wave: this.wave, kills: this.stats.kills };
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(this.best));
      } catch {
        /* ignore */
      }
    }
    this.showOverlay('gameover', newBest);
  }

  // ---------------------------------------------------------------- waves

  startWave(n) {
    this.wave = n;
    const w = config.waves;
    this.toSpawn = Math.max(1, Math.round(w.baseCount + w.countPerWave * (n - 1)));
    this.spawnTimer = 0.3;
    this.waveState = 'active';
    this.banner(`Wave ${n}`, n === 1 ? 'Hold to draw. Release in the gold flash.' : `Grunts are level ${n}`);
    this.sfx.wave(n);
    this.waveHurt = false;
  }

  updateWaves(dt) {
    if (this.waveState === 'break') {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.startWave(this.wave + 1);
      return;
    }
    if (this.waveState === 'cleared') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.openDraft();
      return;
    }
    this.spawnTimer -= dt;
    if (this.toSpawn > 0 && this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.toSpawn--;
      this.spawnTimer = config.waves.spawnInterval * (0.6 + Math.random() * 0.6);
    }
    if (this.toSpawn === 0 && this.enemies.every((e) => e.state === 'dying' || e.removed)) {
      this.waveState = 'cleared';
      this.clearTimer = 1.1;
      this.player.cheer();
      const heal = Math.min(config.player.healPerWave, stat.maxHp() - this.player.hp);
      this.player.hp += heal;
      this.banner(`Wave ${this.wave} cleared`, heal > 0 ? `+${Math.round(heal)} HP` : '');
      this.sfx.cleared(!this.waveHurt);
    }
  }

  spawnEnemy() {
    const p = new THREE.Vector3();
    // Half the grunts march out of the archway gates (when the dressed arena is loaded).
    const gates = spawnGates.filter((g) => Math.hypot(g.x - this.player.pos.x, g.z - this.player.pos.z) > 7);
    if (gates.length && Math.random() < 0.5) {
      const g = gates[Math.floor(Math.random() * gates.length)];
      p.set(g.x + (Math.random() - 0.5) * 2.4, 0, g.z + (Math.random() - 0.5) * 2.4);
      this.enemies.push(new Grunt(this, p, this.wave));
      return;
    }
    const H = ARENA_HALF - 1.5;
    for (let i = 0; i < 40; i++) {
      // Prefer the arena edges, away from the player and pillars.
      const edge = Math.floor(Math.random() * 4);
      const t = (Math.random() * 2 - 1) * H;
      const inset = H - Math.random() * 4;
      if (edge === 0) p.set(t, 0, -inset);
      else if (edge === 1) p.set(t, 0, inset);
      else if (edge === 2) p.set(inset, 0, t);
      else p.set(-inset, 0, t);
      const farFromPlayer = p.distanceTo(this.player.pos) > 9;
      const clearOfPillars = pillars.every((q) => Math.hypot(p.x - q.x, p.z - q.z) > q.r + 1.2);
      if (farFromPlayer && clearOfPillars) break;
    }
    this.enemies.push(new Grunt(this, p, this.wave));
  }

  // ---------------------------------------------------------------- combat events

  /** opts: { mega, extra } */
  fireArrow(origin, dir, speed, damage, charge, perfect, opts = {}) {
    const element = lv('fire') ? 'fire' : lv('frost') ? 'frost' : null;
    this.arrows.spawn(origin, dir, speed, damage, charge, perfect, { ...opts, bounces: lv('ricochet'), element });
    if (opts.extra) return; // Split Shot side arrows share the main shot's sound and stats
    this.sfx.release(charge, perfect, this.panAt(origin));
    if (opts.mega) {
      this.sfx.megaRelease();
      this.shake.add(0.5);
      this.particles.spawn(origin, { count: 24, color: [3, 0.6, 2.4], speed: 6, up: 1, life: 0.4, size: 0.1, gravity: 1, dir, spread: 1 });
    }
    this.stats.shots++;
    if (perfect) {
      this.stats.perfects++;
      this.stats.streak++;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
      if (this.stats.streak % 3 === 0) this.sfx.combo();
      this.particles.spawn(origin, { count: 14, color: [3, 2.2, 0.6], speed: 5, up: 1, life: 0.35, size: 0.08, gravity: 2, dir, spread: 0.9 });
      this.shake.add(0.18);
    } else {
      this.stats.streak = 0;
      this.particles.spawn(origin, { count: 4, color: 0xd8cfb8, speed: 2, up: 0.5, life: 0.25, size: 0.06, gravity: 0, dir, spread: 1 });
    }
  }

  onArrowHit(arrow, enemy, point) {
    const result = enemy.hit(arrow.damage, arrow.dir, arrow.charge, arrow.perfect || arrow.mega);
    if (!result) return;
    if (arrow.hitCount === 0 && !arrow.extra) this.stats.hits++;
    const feel = config.feel;
    const full = arrow.charge >= 0.999;

    const kind = arrow.mega ? 'mega' : arrow.perfect ? 'perfect' : full ? 'crit' : 'normal';
    this.numbers.spawn(point.clone().add(new THREE.Vector3(0, 0.8, 0)), Math.round(arrow.damage), kind);
    this.particles.spawn(point, {
      count: arrow.perfect || arrow.mega ? 22 : 8 + Math.round(arrow.charge * 8),
      color: arrow.mega ? [3, 0.6, 2.4] : arrow.perfect ? [3, 2.1, 0.5] : 0xb33a2a,
      speed: 3 + arrow.charge * 5,
      up: 2,
      life: 0.5,
      size: 0.1,
      dir: arrow.dir,
      spread: 1.1,
    });

    const big = arrow.perfect || arrow.mega;
    this.hitStop = Math.max(this.hitStop, big ? feel.perfectHitStop : feel.hitStop * (0.3 + 0.7 * arrow.charge));
    this.shake.add(arrow.mega ? 0.6 : arrow.perfect ? 0.45 : 0.12 + 0.2 * arrow.charge);
    this.sfx.hit(arrow.perfect, this.panAt(point));

    if (result === 'stagger') {
      this.stats.staggers++;
      this.numbers.spawn(point.clone().add(new THREE.Vector3(0, 1.6, 0)), 'STAGGER', 'callout');
      this.sfx.stagger(this.panAt(point));
    }
    if (result === 'kill') this.onKill(enemy);
    else this.applyElement(enemy, point);
    if (arrow.perfect) this.chainLightning(enemy, arrow.damage);
  }

  onKill(enemy) {
    this.stats.kills++;
    this.sfx.kill(this.panAt(enemy.pos));
    // Three kills in quick succession earns the announcer.
    this.killTimes = (this.killTimes || []).filter((t) => this.elapsed - t < 1.5);
    this.killTimes.push(this.elapsed);
    if (this.killTimes.length >= 3 && this.elapsed - (this.lastMultiKill || -9) > 2.5) {
      this.lastMultiKill = this.elapsed;
      this.sfx.multiKill();
    }
    this.particles.spawn(enemy.pos.clone().setY(0.9), { count: 26, color: 0x7a2a20, speed: 6, up: 4, life: 0.8, size: 0.16 });
    this.particles.spawn(enemy.pos.clone().setY(0.9), { count: 10, color: 0x2a2420, speed: 3, up: 3, life: 1, size: 0.25 });
  }

  applyElement(enemy, point) {
    const fire = lv('fire');
    const frost = lv('frost');
    if (fire) enemy.applyBurn(1 + 3 * fire, 3);
    if (frost && enemy.applyFrost(0.2 + 0.1 * frost, 2, 3, 1.5)) {
      this.numbers.spawn(point.clone().setY(2.4), 'FROZEN', 'callout');
      this.sfx.freeze(this.panAt(enemy.pos));
      this.particles.spawn(enemy.pos.clone().setY(1), { count: 16, color: [1.2, 2.2, 3], speed: 4, up: 2, life: 0.6, size: 0.1 });
    }
  }

  /** Thunderstrike: arc from the struck grunt through the nearest others. */
  chainLightning(source, damage) {
    const n = lv('thunderstrike');
    if (!n) return;
    const targets = this.enemies
      .filter((e) => e !== source && e.isHittable() && e.pos.distanceTo(source.pos) < 7)
      .sort((a, b) => a.pos.distanceTo(source.pos) - b.pos.distanceTo(source.pos))
      .slice(0, n + 1);
    if (!targets.length) return;
    this.sfx.zap(this.panAt(source.pos));
    let from = source.pos;
    for (const t of targets) {
      this.bolt(from, t.pos);
      const dir = new THREE.Vector3().subVectors(t.pos, from).setY(0).normalize();
      const res = t.hit(damage * 0.6, dir, 0, false);
      this.numbers.spawn(t.pos.clone().setY(2.1), Math.round(damage * 0.6), 'zap');
      if (res === 'kill') this.onKill(t);
      from = t.pos;
    }
  }

  bolt(a, b) {
    // WebGL lines are 1px wide, so draw a few jittered strands for a thicker bolt.
    for (let k = 0; k < 3; k++) this.boltStrand(a, b);
    this.particles.spawn(b.clone().setY(1.1), { count: 6, color: [1.5, 2.4, 4], speed: 3, up: 1, life: 0.25, size: 0.06, gravity: 0 });
  }

  boltStrand(a, b) {
    const pts = [];
    const segs = 9;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jitter = i === 0 || i === segs ? 0 : 0.35;
      pts.push(
        new THREE.Vector3(
          a.x + (b.x - a.x) * t + (Math.random() - 0.5) * jitter,
          1.1 + (Math.random() - 0.5) * jitter,
          a.z + (b.z - a.z) * t + (Math.random() - 0.5) * jitter,
        ),
      );
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: new THREE.Color(1.5, 2.4, 4), transparent: true }),
    );
    this.scene.add(line);
    this.bolts.push({ line, life: 0.2 });
  }

  updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / 0.2);
      if (b.life <= 0) {
        b.line.removeFromParent();
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  onRicochet(point) {
    this.sfx.thunk(this.panAt(point));
    this.particles.spawn(point, { count: 6, color: 0xffe9b0, speed: 3, up: 1, life: 0.25, size: 0.05, gravity: 0 });
  }

  onRefresh() {
    this.numbers.spawn(this.player.pos.clone().setY(2.2), 'REFRESH', 'callout');
    this.particles.spawn(this.player.pos.clone().setY(0.8), { count: 10, color: [1.6, 2.2, 3], speed: 3, up: 1, life: 0.35, size: 0.06, gravity: 0 });
  }

  onArrowStopped(arrow, hitWall) {
    if (hitWall) {
      this.sfx.thunk(this.panAt(arrow.pos));
      this.particles.spawn(arrow.pos, { count: 5, color: 0x8a8070, speed: 2, up: 1, life: 0.35, size: 0.06 });
    } else {
      this.particles.spawn(arrow.pos.clone().setY(0.05), { count: 4, color: 0x5a5048, speed: 1.2, up: 1.5, life: 0.3, size: 0.05 });
      this.sfx.arrowGround(this.panAt(arrow.pos));
    }
  }

  /** Stereo position (-1 left … 1 right) of a world point on screen. */
  panAt(pos) {
    const v = this.tmpPan || (this.tmpPan = new THREE.Vector3());
    v.copy(pos).project(this.camera);
    return Math.max(-1, Math.min(1, v.x)) * 0.7;
  }

  onDodge() {
    this.stats.dodges++;
    this.sfx.dodge();
  }

  onPerfectDodge(enemy) {
    const d = config.dodge;
    this.stats.perfectDodges++;
    this.player.counterT = d.counterWindow;
    this.slowmo = d.slowmoTime;
    this.sfx.perfectDodge();
    this.numbers.spawn(this.player.pos.clone().setY(2.2), 'PERFECT DODGE', 'callout gold');
    this.particles.spawn(this.player.pos.clone().setY(0.8), { count: 18, color: [2.4, 2.4, 3], speed: 4, up: 1, life: 0.4, size: 0.07, gravity: 0 });
    this.hud.vignette.classList.add('slowmo');
  }

  onPlayerHit(enemy) {
    this.sfx.hurt();
    this.waveHurt = true;
    this.shake.add(0.6);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.numbers.spawn(this.player.pos.clone().setY(2), `-${config.grunt.damage}`, 'hurt');
    this.particles.spawn(this.player.pos.clone().setY(1), { count: 14, color: 0xff3b2f, speed: 5, up: 2, life: 0.5, size: 0.1, dir: enemy.lungeDir, spread: 1 });
    this.hud.vignette.classList.remove('flash');
    void this.hud.vignette.offsetWidth; // restart the CSS animation
    this.hud.vignette.classList.add('flash');
  }

  // ---------------------------------------------------------------- loop

  run() {
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop((ts) => {
      this.timer.update(ts);
      this.frame(Math.min(this.timer.getDelta(), 1 / 20));
    });
  }

  frame(realDt, render = true) {
    this.time += realDt;
    this.handleKeys();
    this.updateAim();

    let dt = 0;
    if (this.state === 'playing') {
      dt = realDt;
      if (this.slowmo > 0) {
        this.slowmo -= realDt;
        dt *= config.dodge.slowmoScale;
        if (this.slowmo <= 0) this.hud.vignette.classList.remove('slowmo');
      }
      if (this.hitStop > 0) {
        this.hitStop -= realDt;
        dt = realDt * 0.03;
      }
      this.simulate(dt);
    }

    this.particles.update(dt);
    this.updateBolts(realDt);
    this.numbers.update(this.state === 'paused' ? 0 : realDt);
    this.shake.update(realDt);
    this.world.update(realDt, this.time);
    this.env.update(realDt, this.time);
    this.updateCamera(realDt);
    this.updateHud();
    if (render) this.composer.render();
    this.input.endFrame();
  }

  handleKeys() {
    const i = this.input;
    if (this.state === 'choosing') {
      ['Digit1', 'Digit2', 'Digit3'].forEach((code, n) => {
        if (i.wasPressed(code)) this.pickSkill(n);
      });
      if (i.wasPressed('KeyF')) this.reroll();
    }
    if (i.wasPressed('Backquote')) {
      this.guiHidden = !this.guiHidden;
      this.gui.show(!this.guiHidden);
    }
    if (i.wasPressed('KeyM')) {
      const muted = this.sfx.toggleMute();
      this.banner(muted ? 'Muted' : 'Sound on', '', 0.8);
    }
    if (i.wasPressed('KeyP') || i.wasPressed('Escape')) {
      if (this.state === 'playing') this.setPaused(true);
      else if (this.state === 'paused') this.setPaused(false);
    }
    if (i.wasPressed('KeyR') && this.state !== 'title') {
      this.sfx.unlock();
      this.start();
    }
  }

  simulate(dt) {
    this.elapsed += dt;
    this.player.update(dt, this.input, this.aimPoint, this);
    for (const e of this.enemies) e.update(dt, this.player);
    this.separate();
    this.arrows.update(dt, this.enemies, this);
    this.enemies = this.enemies.filter((e) => !e.removed);

    if (this.player.dead) {
      this.deathTimer += dt;
      if (this.deathTimer > 1.3) this.gameOver();
    } else {
      this.updateWaves(dt);
    }
  }

  /** Keep grunts from stacking on each other or standing inside the player. */
  separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'dying') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'dying') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
      if (a.state !== 'lunge' && !this.player.dead && !this.player.rolling) {
        const dx = a.pos.x - this.player.pos.x;
        const dz = a.pos.z - this.player.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + 0.45;
        if (d < min && d > 1e-4) {
          a.pos.x = this.player.pos.x + (dx / d) * min;
          a.pos.z = this.player.pos.z + (dz / d) * min;
        }
      }
    }
  }

  updateAim() {
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.ndcX, this.input.mouse.ndcY), this.camera);
    this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint);
  }

  updateCamera(dt) {
    // Look slightly toward the cursor so you can see what you're aiming at.
    const look = new THREE.Vector3(this.aimPoint.x - this.player.pos.x, 0, this.aimPoint.z - this.player.pos.z);
    if (look.length() > 7) look.setLength(7);
    const target = this.player.pos.clone().addScaledVector(look, 0.2);
    this.camTarget.lerp(target, 1 - Math.exp(-6 * dt));
    this.camera.position.copy(this.camTarget).addScaledVector(this.camOffset, config.feel.cameraZoom);
    this.camera.lookAt(this.camTarget);
    this.camera.position.add(this.shake.offset(this.shakeOffset, config.feel.shake));
    this.camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- HUD

  updateHud() {
    const h = this.hud;
    const p = this.player;
    const s = this.stats;
    const maxHp = stat.maxHp();
    const pct = Math.max(0, p.hp / maxHp);
    h.hpFill.style.width = `${pct * 100}%`;
    h.hpFill.classList.toggle('low', pct < 0.3);
    h.hpText.textContent = `${Math.ceil(p.hp)} / ${maxHp}`;
    const maxCharges = stat.dodgeCharges();
    h.dodgeFill.style.width = `${(p.dodgeMeter / maxCharges) * 100}%`;
    h.dodgeBox.style.setProperty('--segs', maxCharges);
    h.dodgeBox.classList.toggle('ready', p.charges >= 1);
    const buildKey = JSON.stringify(build.levels);
    if (buildKey !== this.lastBuildKey) {
      this.lastBuildKey = buildKey;
      h.build.innerHTML = this.buildChips();
    }
    h.dodgeBox.classList.toggle('counter', p.counterT > 0);
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    h.stats.textContent = `Kills ${s.kills}  ·  Accuracy ${acc}%  ·  Perfects ${s.perfects}`;
    h.wave.textContent = this.wave ? `Wave ${this.wave}` : '';
    const alive = this.enemies.filter((e) => e.state !== 'dying').length + this.toSpawn;
    h.enemies.textContent = this.wave && this.waveState === 'active' ? `${alive} remaining` : '';
    h.streak.textContent = s.streak >= 2 ? `Perfect ×${s.streak}` : '';
    h.streak.classList.toggle('show', s.streak >= 2);

    // Reticle follows the mouse and tightens with charge.
    const r = h.reticle;
    r.style.transform = `translate(${this.input.mouse.x}px, ${this.input.mouse.y}px)`;
    r.style.setProperty('--size', `${44 - 26 * p.charge}px`);
    r.dataset.phase = this.state !== 'playing' ? 'none' : p.drawPhase === 'none' && p.counterT > 0 ? 'perfect' : p.drawPhase;
    r.style.display = this.state === 'playing' ? 'block' : 'none';
  }

  banner(title, sub = '', duration = 1.8) {
    const b = this.hud.banner;
    b.innerHTML = `<div class="title"></div><div class="sub"></div>`;
    b.querySelector('.title').textContent = title;
    b.querySelector('.sub').textContent = sub;
    b.style.setProperty('--dur', `${duration}s`);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  showOverlay(kind, newBest = false) {
    const o = this.hud.overlay;
    const s = this.stats;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const perf = s.shots ? Math.round((s.perfects / s.shots) * 100) : 0;
    const controls = `
      <div class="controls">
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Move</span></div>
        <div><kbd>Mouse</kbd><span>Aim</span></div>
        <div><kbd>Hold LMB</kbd><span>Draw the bow (slows you down)</span></div>
        <div><kbd>Release</kbd><span>Fire. In the <b class="gold">gold flash</b> = perfect: 2× damage, pierces</span></div>
        <div><kbd>Space</kbd><kbd>RMB</kbd><span>Dodge roll (invulnerable, rolls through grunts)</span></div>
        <div><kbd>\`</kbd><span>Toggle tuning panel</span></div>
        <div><kbd>P</kbd><kbd>M</kbd><kbd>R</kbd><span>Pause · Mute · Restart</span></div>
      </div>`;
    if (kind === 'title') {
      o.innerHTML = `
        <h1>Draw &amp; Release</h1>
        <p class="tag">A bow-combat prototype. Survive the waves.</p>
        ${controls}
        <p class="tip">Grunts flash red and show a wedge before they lunge. A full-draw or perfect hit during that windup staggers them. Roll through a lunge at the last moment for a <b class="gold">perfect dodge</b>: time slows and your next tap is an instant perfect shot. After every wave, pick a skill to power up.</p>
        <button>Click to start</button>
        ${this.best.wave ? `<p class="best">Best: wave ${this.best.wave}, ${this.best.kills} kills</p>` : ''}
        <p class="model-status" id="model-status">${this.modelStatusText()}</p>
        <p class="model-status" id="audio-status">${this.audioStatusText()}</p>`;
    } else if (kind === 'paused') {
      o.innerHTML = `<h1>Paused</h1>${controls}<button>Click to resume</button>`;
    } else {
      const secs = Math.floor(this.elapsed);
      o.innerHTML = `
        <h1>You fell</h1>
        <p class="tag">${newBest ? 'New best!' : `Best: wave ${this.best.wave}, ${this.best.kills} kills`}</p>
        <div class="summary">
          <div><b>${this.wave}</b><span>Wave reached</span></div>
          <div><b>${s.kills}</b><span>Kills</span></div>
          <div><b>${acc}%</b><span>Accuracy</span></div>
          <div><b>${perf}%</b><span>Perfect shots</span></div>
          <div><b>${s.bestStreak}</b><span>Best perfect streak</span></div>
          <div><b>${s.staggers}</b><span>Staggers</span></div>
          <div><b>${s.perfectDodges}</b><span>Perfect dodges</span></div>
          <div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>Survived</span></div>
        </div>
        ${build.owned().length ? `<div class="build-final">${this.buildChips()}</div>` : ''}
        <button>Click to try again</button>
        <p class="tip">Or press R</p>`;
    }
    o.classList.add('visible');
  }

  buildChips() {
    return build
      .owned()
      .map((s) => {
        const level = s.max > 1 ? ` ${ROMAN[s.level]}` : '';
        return `<span class="chip t-${s.type} r-${s.rarity}">${s.name}${level}</span>`;
      })
      .join('');
  }

  modelStatusText() {
    const m = modelStatus;
    if (m.state === 'loading') return '3D models: loading…';
    if (m.state === 'ready') return `3D models: ${m.loaded}/${m.total} loaded`;
    if (m.state === 'none') return '3D models: none found (using placeholder shapes)';
    return `3D models: ${m.loaded}/${m.total} loaded. Problem: ${m.errors.join('; ')}`;
  }

  audioStatusText() {
    const a = audioStatus;
    if (a.state === 'ready') return `Sound: ${a.loaded}/${a.total} samples`;
    if (a.state === 'loading' || a.state === 'idle') return 'Sound: loading…';
    if (a.state === 'unsupported') return 'Sound: not supported in this browser';
    return `Sound: synth only (${a.error || 'samples failed'})`;
  }

  showModelStatus() {
    const el = document.getElementById('model-status');
    if (el) el.textContent = this.modelStatusText();
  }

  hideOverlay() {
    this.hud.overlay.classList.remove('visible');
  }

  // ---------------------------------------------------------------- tuning panel

  setupGui() {
    const gui = (this.gui = new GUI({ title: 'Tuning  ( ` to hide )' }));
    this.guiHidden = false;
    const b = gui.addFolder('Bow');
    b.add(config.bow, 'drawTime', 0.2, 2, 0.01).name('Draw time (s)');
    b.add(config.bow, 'perfectWindow', 0.03, 0.5, 0.01).name('Perfect window (s)');
    b.add(config.bow, 'minDamage', 1, 40, 1).name('Min damage');
    b.add(config.bow, 'maxDamage', 5, 80, 1).name('Max damage');
    b.add(config.bow, 'perfectMultiplier', 1, 4, 0.1).name('Perfect multiplier');
    b.add(config.bow, 'minArrowSpeed', 5, 60, 1).name('Min arrow speed');
    b.add(config.bow, 'maxArrowSpeed', 10, 100, 1).name('Max arrow speed');
    b.add(config.bow, 'range', 8, 40, 1).name('Range');
    b.add(config.bow, 'drawMoveMultiplier', 0, 1, 0.05).name('Move speed while drawing');
    b.add(config.bow, 'fireCooldown', 0, 1, 0.01).name('Fire cooldown (s)');

    const pl = gui.addFolder('Player');
    pl.add(config.player, 'moveSpeed', 2, 14, 0.1).name('Move speed');
    pl.add(config.player, 'maxHp', 20, 400, 10).name('Max HP');
    pl.add(config.player, 'iFrames', 0, 2, 0.05).name('Invuln after hit (s)');
    pl.add(config.player, 'healPerWave', 0, 100, 5).name('Heal per wave');

    const dg = gui.addFolder('Dodge');
    dg.add(config.dodge, 'distance', 1, 10, 0.1).name('Distance');
    dg.add(config.dodge, 'duration', 0.1, 0.8, 0.01).name('Duration (s)');
    dg.add(config.dodge, 'iFrameStart', 0, 0.5, 0.01).name('Invuln starts (s)');
    dg.add(config.dodge, 'iFrameEnd', 0, 0.8, 0.01).name('Invuln ends (s)');
    dg.add(config.dodge, 'cooldown', 0, 3, 0.05).name('Cooldown (s)');
    dg.add(config.dodge, 'cancelsDraw').name('Rolling cancels draw');
    dg.add(config.dodge, 'slowmoTime', 0, 2, 0.05).name('Perfect: slow-mo (s)');
    dg.add(config.dodge, 'slowmoScale', 0.05, 1, 0.05).name('Perfect: slow-mo speed');
    dg.add(config.dodge, 'counterWindow', 0, 5, 0.1).name('Perfect: counter window (s)');

    const g = gui.addFolder('Grunt');
    g.add(config.grunt, 'baseHp', 5, 200, 1).name('Base HP');
    g.add(config.grunt, 'speed', 0.5, 10, 0.1).name('Speed');
    g.add(config.grunt, 'attackRange', 1, 6, 0.1).name('Attack range');
    g.add(config.grunt, 'windupTime', 0.1, 1.5, 0.01).name('Windup (s)');
    g.add(config.grunt, 'lungeSpeed', 4, 30, 0.5).name('Lunge speed');
    g.add(config.grunt, 'lungeTime', 0.05, 0.6, 0.01).name('Lunge time (s)');
    g.add(config.grunt, 'recoverTime', 0, 2, 0.05).name('Recover (s)');
    g.add(config.grunt, 'damage', 1, 100, 1).name('Damage');
    g.add(config.grunt, 'staggerCharge', 0, 1, 0.05).name('Charge to stagger');

    const w = gui.addFolder('Waves');
    w.add(config.waves, 'baseCount', 1, 20, 1).name('Wave 1 count');
    w.add(config.waves, 'countPerWave', 0, 10, 1).name('+ per wave');
    w.add(config.waves, 'hpGrowth', 0, 1, 0.01).name('HP growth / wave');
    w.add(config.waves, 'speedGrowth', 0, 0.5, 0.01).name('Speed growth / wave');
    w.add(config.waves, 'spawnInterval', 0.1, 3, 0.05).name('Spawn interval (s)');
    w.add(config.waves, 'breakTime', 0.5, 10, 0.5).name('Break between waves');

    const mdl = gui.addFolder('Models (Meshy)');
    mdl.add(config.models, 'heroHeight', 1, 3, 0.05).name('Hero height (m)');
    mdl.add(config.models, 'gruntHeight', 1, 3, 0.05).name('Grunt height (m)');
    mdl.add(config.models, 'heroAimYaw', -180, 180, 1).name('Hero aim turn (°)');
    mdl.add(config.models, 'shootStartAt', 0, 0.95, 0.01).name('Bow clip: nocked');
    mdl.add(config.models, 'shootFullAt', 0.05, 0.95, 0.01).name('Bow clip: full draw');
    mdl.add(config.models, 'shootReleaseAt', 0.05, 0.95, 0.01).name('Bow clip: release');
    mdl.add(config.models, 'attackWindupEnd', 0, 0.95, 0.01).name('Grunt clip: crouch end');
    mdl.add(config.models, 'attackHitAt', 0.05, 0.95, 0.01).name('Grunt clip: landing');
    mdl.add(config.models, 'runAnimSpeed', 1, 12, 0.1).name('Run anim speed ref');
    mdl.close();

    const f = gui.addFolder('Feel');
    f.add(config.feel, 'hitStop', 0, 0.2, 0.005).name('Hit-stop (s)');
    f.add(config.feel, 'perfectHitStop', 0, 0.3, 0.005).name('Perfect hit-stop (s)');
    f.add(config.feel, 'shake', 0, 3, 0.05).name('Screen shake');
    f.add(config.feel, 'knockback', 0, 20, 0.5).name('Knockback');
    f.add(config.feel, 'cameraZoom', 0.6, 1.6, 0.05).name('Camera distance');
    f.add(config.feel, 'bloom').name('Bloom').onChange((v) => (this.bloom.enabled = v));
    f.add(config.feel, 'bloomStrength', 0, 2, 0.05).name('Bloom strength').onChange((v) => (this.bloom.strength = v));
    f.add(config.feel, 'ambientOcclusion').name('Ambient occlusion').onChange((v) => (this.ao.enabled = v));
    f.add(config.feel, 'vignette', 0, 1, 0.05).name('Vignette').onChange((v) => (this.grade.uniforms.uVignette.value = v));
    f.add(config.feel, 'grade', 0, 1, 0.05).name('Color grade').onChange((v) => (this.grade.uniforms.uGrade.value = v));

    const actions = {
      restart: () => {
        this.sfx.unlock();
        this.start();
      },
      copy: async () => {
        const json = JSON.stringify(config, null, 2);
        console.log(json);
        try {
          await navigator.clipboard.writeText(json);
          this.banner('Settings copied', 'Paste them to share your tuning', 1.2);
        } catch {
          this.banner('Copy failed', 'Settings were printed to the console', 1.5);
        }
      },
      reset: () => {
        resetConfig();
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
        this.bloom.enabled = config.feel.bloom;
        this.bloom.strength = config.feel.bloomStrength;
      },
    };
    gui.add(actions, 'restart').name('↻ Restart run');
    gui.add(actions, 'copy').name('⧉ Copy settings JSON');
    gui.add(actions, 'reset').name('⟲ Reset to defaults');

    for (const folder of [pl, g, w, f]) folder.close();
    dg.open();
    gui.onFinishChange(() => saveConfig());
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.ao.setSize(innerWidth, innerHeight);
  }
}
