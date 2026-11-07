import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { config } from './config.js';
import { World } from './world.js';
import { Environment } from './environment.js';
import { Decals } from './juice.js';
import { EnemyArrows } from './archer.js';
import { ArrowVolley } from './ultimate.js';
import { Music } from './music.js';
import { Loot } from './loot.js';
import { GearDrops } from './gear-drops.js';
import { GearMethods } from './game-gear.js';
import { Gadgets } from './gadgets.js';
import { MissionMethods } from './game-mission.js';
import { selectedMission, ENDLESS } from './missions.js';
import { difficultyById, selectedDifficulty } from './difficulty.js';
import { Camp } from './camp.js';
import { Hazards } from './hazards.js';
import { Fireballs } from './variants.js';
import { settings, applySettings, SettingsPanel } from './settings.js';
import { Tips } from './tips.js';
import { profile, bankRun, noteProgress, noteRunStart } from './profile.js';
import { Player, ARROW_HEIGHT } from './player.js';
import { ArrowSystem } from './arrows.js';
import { Particles, DamageNumbers, Shake } from './fx.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { UiMethods } from './game-ui.js';
import { CombatMethods } from './game-combat.js';
import { FlowMethods } from './game-flow.js';
import { TuningMethods } from './game-tuning.js';
import { build, stat, buffs, SKILLS } from './skills.js';

const UP = new THREE.Vector3(0, 1, 0);

// Final look: gentle teal-shadow / warm-highlight split tone, contrast, vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.45 }, uGrade: { value: 1 }, uAberration: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uGrade; uniform float uAberration; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAberration > 0.0001) {
        vec2 dir = (vUv - 0.5) * uAberration;
        c.r = texture2D(tDiffuse, vUv + dir).r;
        c.b = texture2D(tDiffuse, vUv - dir).b;
      }
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
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
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
    this.decals = new Decals(this.scene);
    this.enemyArrows = new EnemyArrows(this);
    this.ultimate = new ArrowVolley(this);
    this.loot = new Loot(this);
    this.gearDrops = new GearDrops(this);
    this.gadgets = new Gadgets(this);
    this.camp = new Camp(this);
    this.hazards = new Hazards(this);

    this.fireballs = new Fireballs(this);
    this.numbers = new DamageNumbers(document.getElementById('numbers'), this.camera);
    this.shake = new Shake();
    this.sfx = new Sfx();
    this.sfx.init(); // decode samples now; playback starts on the first click
    this.music = new Music(this.sfx);
    this.settingsPanel = new SettingsPanel(this);
    this.tips = new Tips();
    applySettings(this);
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
      gems: $('gems'),
      ult: $('ult'),
      ultFill: $('ult-fill'),
      build: $('build'),
      bossBar: $('boss-bar'),
      fade: $('fade'),
      bossFill: $('boss-fill'),
      bossPoise: $('boss-poise'),
      bossName: $('boss-name'),
      bossCard: $('boss-card'),
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
      this.music.start();
      applySettings(this);
      if (this.state === 'paused') return this.setPaused(false);
      if (this.state === 'gameover' || this.state === 'victory') {
        // Only the button leaves the game-over screen, and not in the first moment, so
        // clicks meant for shooting don't skip straight past it.
        if (performance.now() < this.overlayReadyAt || !e.target.closest('button')) return;
      }
      this.enterCamp(); // title and game over both lead to the camp
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

  resetRun() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.arrows.clear();
    this.particles.clear();
    this.numbers.clear();
    this.decals.clear();
    this.enemyArrows.clear();
    this.fireballs.clear();
    this.ultimate.clear();
    this.loot.clear();
    this.gearDrops.clear();
    this.gadgets?.clear();
    this.hideGearCard?.();
    this.runGear = [];
    this.zoomPull = 0;
    this.killCam = null;
    this.cinematic = null;
    this.boss = null;
    this.pendingDescent = false;
    this.descending = false;
    this.deathShown = false;
    buffs.haste = 0;
    buffs.chill = 0;
    if (this.arenaPortal) this.arenaPortal.visible = false;
    document.body.classList.remove('letterbox');
    this.zoomKick = 0;
    this.aberration = 0;
    build.reset();
    this.player.reset();
    this.hideDraft?.();
    this.stats = { shots: 0, hits: 0, perfects: 0, kills: 0, staggers: 0, streak: 0, bestStreak: 0, dodges: 0, perfectDodges: 0, hitsTaken: 0, secret: false };
    this.clearSecret?.();
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

  start(fromCheckpoint = false) {
    if (this.camp.active) this.leaveCamp();
    this.resetRun();
    const cp = profile.checkpoint;
    this.difficulty = fromCheckpoint && cp?.difficulty ? difficultyById(cp.difficulty) : selectedDifficulty();
    // A mission from the world map, or the Endless Siege (also used to continue from a save point).
    const pick = selectedMission();
    this.mission = !fromCheckpoint && pick !== ENDLESS ? pick : null;
    this.setupMission();
    this.setArena(this.mission ? this.mission.theme : fromCheckpoint && cp ? cp.arena ?? 0 : 0);
    if (fromCheckpoint && cp) {
      // Resume after the last boss beaten, with the skills you had then.
      // Skills that no longer exist (renamed or removed) are dropped.
      for (const [id, l] of Object.entries(cp.build)) if (SKILLS.some((k) => k.id === id)) build.levels[id] = l;
      build.rerolls = cp.rerolls ?? 1;
      this.wave = cp.wave;
      this.player.hp = stat.maxHp();
      this.player.refillDodge();
      this.banner(`Wave ${cp.wave + 1}`, 'Continuing from your save point', 1.6);
    }
    this.runUnlocks = [];
    this.runStartBest = { ...profile.best };
    noteRunStart();
    this.sfx.runStart();
    if (this.mission) setTimeout(() => this.state === 'playing' && this.bossCard(this.mission.name, `${this.difficulty.name} · ${this.mission.challenge.text}`), 300);
    this.state = 'playing';
    this.hideOverlay();
  }

  /** The hub between runs. */
  enterCamp() {
    this.hideOverlay();
    this.tips.hide();
    setTimeout(() => this.state === 'camp' && this.tips.show('camp'), 1500);
    this.resetRun();
    this.state = 'camp';
    document.body.classList.remove('title-backdrop');
    this.setScene(this.camp.scene);
    this.camp.enter();
    document.body.classList.add('in-camp');
    this.fade();
  }

  /** Show the camp behind the title screen once models are ready. */
  showCampBackdrop() {
    if (this.state !== 'title') return;
    this.setScene(this.camp.scene);
    this.camp.enter();
    document.body.classList.add('in-camp', 'title-backdrop');
  }

  leaveCamp() {
    this.camp.leave();
    this.setScene(this.scene);
    document.body.classList.remove('in-camp');
  }

  startFromCamp(fromCheckpoint) {
    this.tips.hide();
    this.fade();
    this.sfx.sample('boom', { vol: 0.4, rate: 0.8, jitter: 0 });
    setTimeout(() => this.start(fromCheckpoint), 250);
  }

  setScene(scene) {
    this.renderPass.scene = scene;
    this.ao.scene = scene;
  }

  /** Quick fade through black for scene changes. */
  fade() {
    const f = this.hud.fade;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
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
    this.music.stinger(false);
    this.gemsThisRun = (this.stats.gemsBanked || 0) + this.loot.runGems;
    const prev = this.runStartBest || { ...profile.best };
    const newBest = this.wave > prev.wave || (this.wave === prev.wave && this.stats.kills > prev.kills);
    this.newUnlocks = [...(this.runUnlocks || []), ...bankRun({ gems: this.loot.runGems, wave: this.wave, kills: this.stats.kills })];
    this.loot.runGems = 0;
    this.showOverlay('gameover', newBest);
  }

  /** Save mid-run progress (records, unlocks) and tell the player about new unlocks. */
  noteProgress(progress) {
    const fresh = noteProgress(progress);
    if (fresh.length) {
      this.runUnlocks.push(...fresh);
      setTimeout(() => this.state === 'playing' && this.banner('Unlocked in camp', fresh.join(', '), 2.2), 2600);
    }
  }

  /** The account save arrived and changed the profile: refresh what shows it. */
  onProfileSynced() {
    if (this.state === 'title' || this.state === 'camp') {
      if (this.player.characterId && this.player.characterId !== profile.character) this.player.attachModel();
      this.camp.refreshHud();
      if (this.camp.openKind) this.camp.render();
    }
  }

  /** The tab is closing mid-run: keep the gems picked up so far. */
  bankOnExit() {
    if ((this.state === 'playing' || this.state === 'paused') && this.loot.runGems > 0) {
      bankRun({ gems: this.loot.runGems, wave: this.wave, kills: this.stats.kills });
      this.loot.runGems = 0;
    }
  }

  // ---------------------------------------------------------------- waves

  maxHp() {
    return stat.maxHp();
  }

  /** Stereo position (-1 left … 1 right) of a world point on screen. */
  panAt(pos) {
    const v = this.tmpPan || (this.tmpPan = new THREE.Vector3());
    v.copy(pos).project(this.camera);
    return Math.max(-1, Math.min(1, v.x)) * 0.7;
  }

  run() {
    // Cap the frame rate: 60 fps in play (high-refresh laptop screens would otherwise
    // render 120-144 fps for no visible gain), 30 fps on menus and overlays.
    this.renderer.setAnimationLoop((ts) => {
      const active = this.state === 'playing' || this.state === 'camp';
      const minGap = active ? 1000 / 62 : 1000 / 31;
      if (this.lastTs !== undefined && ts - this.lastTs < minGap) return;
      const delta = this.lastTs === undefined ? 1 / 60 : (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (active) this.autoQuality(delta);
      this.frame(Math.min(delta, 1 / 20));
    });
  }

  /**
   * "Auto" graphics: watch the frame time and step quality down (high → medium → low)
   * if this machine can't hold ~48 fps.
   */
  autoQuality(delta) {
    if (settings.quality !== 'auto') return;
    const p = (this.perf ||= { sum: 0, n: 0, level: 'medium' });
    p.sum += delta;
    p.n++;
    if (p.sum < 3) return;
    const avg = p.sum / p.n;
    p.sum = 0;
    p.n = 0;
    const next = { high: 'medium', medium: 'low' }[p.level];
    if (avg > 1 / 48 && next) {
      p.level = next;
      applySettings(this);
    }
  }

  frame(realDt, render = true) {
    this.input.poll();
    this.time += realDt;
    this.handleKeys();
    this.updateAim();

    let dt = 0;
    if (this.state === 'playing') {
      dt = realDt;
      if (this.slowmo > 0) {
        this.slowmo -= realDt;
        dt *= this.slowmoScale ?? config.dodge.slowmoScale;
        if (this.slowmo <= 0) this.hud.vignette.classList.remove('slowmo');
      }
      if (this.hitStop > 0) {
        this.hitStop -= realDt;
        dt = realDt * 0.03;
      }
      this.simulate(dt);
    } else if (this.state === 'camp' || (this.state === 'title' && this.camp.active)) {
      dt = realDt;
      this.player.update(dt, this.input, this.aimPoint, this);
      this.camp.update(dt, this.time);
    }

    this.particles.update(dt);
    this.decals.update(realDt);
    this.zoomKick *= Math.exp(-7 * realDt);
    this.aberration *= Math.exp(-5 * realDt);
    this.grade.uniforms.uAberration.value = this.aberration * 0.006;
    this.numbers.update(this.state === 'paused' ? 0 : realDt);
    this.shake.update(realDt);
    // Only animate the scene that's on screen.
    if (!this.camp.active) {
      this.world.update(realDt, this.time);
      this.env.update(realDt, this.time);
    }
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
    if (i.wasPressed('KeyO')) this.settingsPanel.toggle();
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
    this.arrows.update(dt, [...this.enemies, ...this.hazards.targets], this);
    this.hazards.update(dt);
    this.enemyArrows.update(dt);
    this.fireballs.update(dt);
    buffs.chill = Math.max(0, buffs.chill - dt);
    this.ultimate.update(dt);
    this.loot.update(dt);
    this.gearDrops.update(dt);
    this.updateGearCard(dt);
    this.gadgets.update(dt);
    this.updateSecret(dt);
    for (const n of [1, 2]) if (this.input.wasPressed(`Digit${n}`) && !this.player.dead) this.gadgets.use(n, this.aimPoint);
    if ((this.input.wasPressed('KeyQ') || this.input.wasPressed('KeyE')) && !this.player.dead) {
      if (!this.ultimate.activate(this.aimPoint) && !this.ultimate.active) {
        this.numbers.spawn(this.player.pos.clone().setY(2.3), `Volley ${Math.floor(this.ultimate.meter)}%`, 'callout');
      }
    }
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
    const pad = this.input.pad;
    if (pad?.aim) {
      // Right stick: aim in screen-relative directions, a fixed distance out.
      const dir = this.camRight.clone().multiplyScalar(pad.aim.x).addScaledVector(this.camForward, pad.aim.y).normalize();
      this.aimPoint.copy(this.player.pos).addScaledVector(dir, 8).setY(ARROW_HEIGHT);
      return;
    }
    if (pad) return; // gamepad without aim input: keep the last aim
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.ndcX, this.input.mouse.ndcY), this.camera);
    this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint);
  }

  updateCamera(dt) {
    // Look slightly toward the cursor so you can see what you're aiming at.
    const look = new THREE.Vector3(this.aimPoint.x - this.player.pos.x, 0, this.aimPoint.z - this.player.pos.z);
    if (look.length() > 7) look.setLength(7);
    const target = this.player.pos.clone().addScaledVector(look, 0.2);
    // Pull the camera back while Arrow Volley rains down so the whole area is in view.
    this.zoomPullAmt = (this.zoomPullAmt || 0) + ((this.ultimate.active ? 1 : 0) - (this.zoomPullAmt || 0)) * (1 - Math.exp(-3 * dt));
    let zoom = config.feel.cameraZoom * (1 - (this.zoomKick || 0)) * (1 + 0.22 * this.zoomPullAmt);
    if (this.cinematic) {
      // Boss intro: swing to the boss and push in, letterboxed.
      const c = this.cinematic;
      c.t += dt;
      const w = Math.sin(Math.min(1, c.t / c.dur) * Math.PI);
      target.lerp(c.target.pos, 0.85 * Math.min(1, w * 1.6));
      zoom *= 1 - 0.3 * w;
      if (c.t >= c.dur) {
        this.cinematic = null;
        document.body.classList.remove('letterbox');
      }
    }
    if (this.killCam) {
      // Swing toward the final kill and push in, then ease back out.
      const k = this.killCam;
      k.t += dt;
      const w = Math.sin(Math.min(1, k.t / k.dur) * Math.PI);
      target.lerp(k.target, 0.6 * w);
      zoom *= 1 - 0.35 * w;
      if (k.t >= k.dur) this.killCam = null;
    }
    this.camTarget.lerp(target, 1 - Math.exp(-6 * dt));
    this.camera.position.copy(this.camTarget).addScaledVector(this.camOffset, zoom);
    this.camera.lookAt(this.camTarget);
    this.camera.position.add(this.shake.offset(this.shakeOffset, config.feel.shake * settings.shake));
    this.camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- HUD

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.ao.setSize(innerWidth, innerHeight);
  }
}

// Game's methods live in a few focused modules; mix them in here.
for (const Mixin of [UiMethods, CombatMethods, FlowMethods, TuningMethods, GearMethods, MissionMethods]) {
  for (const key of Object.getOwnPropertyNames(Mixin.prototype)) {
    if (key !== 'constructor') Game.prototype[key] = Mixin.prototype[key];
  }
}
