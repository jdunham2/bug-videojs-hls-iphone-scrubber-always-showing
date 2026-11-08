// Run flow: waves, spawning, elites, bosses, arenas, the exit gate and save points.
import * as THREE from 'three';
import { noteBossOnTier } from './difficulty.js';
import { doorwayTexture } from './juice.js';
import { config } from './config.js';
import { ARENA_HALF, pillars } from './world.js';
import { spawnGates, THEMES } from './environment.js';
import { Grunt } from './enemy.js';
import { Archer } from './archer.js';
import { Boss } from './boss.js';
import { Raider, Bomber, Thief } from './variants.js';
import { rollItem } from './gear.js';

/** Twists a wave can come with (from wave 4). */
const WAVE_EVENTS = [
  { id: 'horde', name: 'Horde', text: 'Half again as many, and they keep coming. Break them for a purse of gems.', count: 1.6 },
  { id: 'elite', name: 'War Party', text: 'Elite warriors lead this wave. Beat it for a Rare piece of gear.', count: 0.75 },
  { id: 'golden', name: 'Golden Wave', text: 'Every gem dropped this wave is doubled!', count: 1 },
];
import { makeElite, makeChampion, AFFIXES } from './elites.js';
import { build, stat } from './skills.js';
import { profile, saveProfile } from './profile.js';

/** Methods mixed into Game (see game.js). */
export class FlowMethods {
  startWave(n) {
    this.wave = n;
    if (n === 1) this.tips.show('draw');
    if (n === 2) this.tips.show('gadget');
    if (this.mission && n === this.secretWave) setTimeout(() => this.state === 'playing' && this.spawnSecret(), 4000);
    const w = config.waves;
    this.toSpawn = Math.max(1, Math.round((w.baseCount + w.countPerWave * (n - 1)) * (this.mods?.count || 1)));
    if (this.env.active) this.hazards.restock(this.arena);
    if (this.mission ? n === this.mission.waves : n % config.boss.every === 0) return this.startBossWave(n);
    this.spawnTimer = 0.3;
    this.waveState = 'active';
    // From wave 6, sometimes a named Champion leads the wave.
    if (n >= 6 && Math.random() < 0.2) setTimeout(() => this.state === 'playing' && this.wave === n && this.waveState === 'active' && this.spawnChampion(), 2500 + Math.random() * 3000);
    // Now and then a loot thief turns up partway through a wave.
    if (n >= 3 && Math.random() < 0.3) setTimeout(() => this.state === 'playing' && this.wave === n && this.waveState === 'active' && this.spawnThief(), 4000 + Math.random() * 5000);
    // From wave 4, some waves come with a twist.
    this.waveEvent = n >= 4 && Math.random() < 0.28 ? WAVE_EVENTS[Math.floor(Math.random() * WAVE_EVENTS.length)] : null;
    const ev = this.waveEvent;
    if (ev) {
      this.toSpawn = Math.max(1, Math.round(this.toSpawn * ev.count));
      document.body.classList.add(`wave-${ev.id}`);
      this.sfx.sample('bell', { vol: 0.6, rate: ev.id === 'golden' ? 1.3 : 0.8, jitter: 0 });
    }
    this.banner(ev ? `Wave ${n} · ${ev.name}` : `Wave ${n}`, ev ? ev.text : n === 1 ? 'Hold to draw. Release in the gold flash.' : `Grunts are level ${n}`, ev ? 2.4 : undefined);
    this.sfx.wave(n);
    this.waveHurt = false;
  }

  startBossWave(n) {
    this.toSpawn = 0;
    this.waveState = 'active';
    this.waveHurt = false;
    this.bossIndex = Math.round(n / config.boss.every);
    const gate = spawnGates[0] || { x: 0, z: -ARENA_HALF + 2 };
    const p = new THREE.Vector3(gate.x, 0, gate.z + 1);
    this.boss = new Boss(this, p, this.enemyLevel(), this.bossIndex, this.arena || 0);
    this.enemies.push(this.toughen(this.boss));
    this.banner('A boss approaches', this.boss.displayName, 2.2);
    this.sfx.wave(n);
    this.sfx.bossRoar();
    this.shake.add(0.4);
  }

  onBossIntro(boss) {
    this.cinematic = { t: 0, dur: config.boss.introTime, target: boss };
    document.body.classList.add('letterbox');
    this.sfx.bossRoar();
    this.shake.add(0.5);
    this.bossCard(boss.displayName, boss.form.sub);
  }

  onBossPhase(boss) {
    this.banner('Enraged!', 'He moves faster and calls for reinforcements', 1.8);
    this.sfx.bossRoar();
    this.shake.add(0.5);
    this.aberration = 1;
    this.particles.spawn(boss.pos.clone().setY(2), { count: 40, color: [3, 0.4, 0.2], speed: 6, up: 3, life: 0.8, size: 0.14 });
  }

  onBossStunned(boss, broken = false) {
    this.numbers.spawn(boss.pos.clone().setY(4.6), broken ? 'POISE BROKEN' : 'STUNNED', 'callout gold');
    this.sfx.stagger(this.panAt(boss.pos));
    this.sfx.sample('clang', { vol: 0.9, rate: 0.6 });
    this.shake.add(0.4);
    this.zoomKick = Math.min(0.12, this.zoomKick + 0.08);
  }

  /** The boss blows his war horn: reinforcements leap down from the walls. */
  onBossSummon(boss) {
    this.sfx.warHorn();
    this.banner('', 'He sounds the war horn!', 1.2);
    const n = boss.phase === 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const g = spawnGates[i % Math.max(1, spawnGates.length)] || { x: (i - 1) * 4, z: -ARENA_HALF + 2 };
      const p = new THREE.Vector3(g.x + (Math.random() - 0.5) * 3, 0, g.z + (Math.random() - 0.5) * 3);
      this.enemies.push(this.toughen(new Grunt(this, p, this.enemyLevel())));
    }
  }

  onBossDefeated(boss) {
    this.boss = null;
    this.banner('Boss defeated!', boss.displayName, 2.6);
    this.sfx.cleared(true);
    this.sfx.bossRoar();
    this.shake.add(0.8);
    this.slowmo = 2;
    this.slowmoScale = 0.18;
    this.hud.vignette.classList.add('slowmo');
    this.killCam = { t: 0, dur: 2.4, target: boss.pos.clone() };
    this.particles.spawn(boss.pos.clone().setY(2.5), { count: 80, color: [3, 1.6, 0.4], speed: 9, up: 5, life: 1.4, size: 0.16 });
    this.decals.spawn(boss.pos, 'scorch', 5, 30);
    // Kill the summoned grunts too, so the wave ends with the boss.
    for (const e of this.enemies) if (e !== boss && e.isHittable()) e.die(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize());
    this.stats.bossesDefeated = (this.stats.bossesDefeated || 0) + 1;
    const next = noteBossOnTier(this.difficulty.id);
    if (next) setTimeout(() => this.banner(`${next.name} unlocked!`, 'Choose it at the camp gate for better loot', 2.6), 2800);
    this.noteProgress({ bosses: 1, wave: this.wave - 1, kills: this.stats.kills });
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
    if (this.waveState === 'mission-won') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.missionComplete();
      return;
    }
    if (this.waveState === 'portal') {
      this.updateArenaPortal(dt);
      return;
    }
    this.spawnTimer -= dt;
    if (this.toSpawn > 0 && this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.toSpawn--;
      this.spawnTimer = config.waves.spawnInterval * (0.6 + Math.random() * 0.6) * (this.waveEvent?.id === 'horde' ? 0.5 : 1);
    }
    if (this.toSpawn === 0 && this.enemies.every((e) => e.state === 'dying' || e.removed)) {
      if (this.mission && this.wave >= this.mission.waves) {
        // The mission's boss is down: let the kill cam play, then the victory screen.
        this.waveState = 'mission-won';
        this.clearTimer = 2.8;
        this.player.cheer();
        this.noteProgress({ wave: this.wave, kills: this.stats.kills });
        return;
      }
      this.waveState = 'cleared';
      this.clearTimer = 1.1;
      this.bounty('wave');
      this.endWaveEvent(true);
      this.player.cheer();
      this.noteProgress({ wave: this.wave, kills: this.stats.kills });
      if (!this.mission && this.wave % config.boss.every === 0) this.saveCheckpoint();
      const heal = this.mods?.noHeal ? 0 : Math.min(config.player.healPerWave, stat.maxHp() - this.player.hp);
      this.player.hp += heal;
      this.banner(`Wave ${this.wave} cleared`, heal > 0 ? `+${Math.round(heal)} HP` : '');
      this.sfx.cleared(!this.waveHurt);
      this.music.stinger(true);
    }
  }

  /** Which enemy type to spawn this time. */
  enemyClass() {
    const s = config.archer;
    const chance = this.mods?.archers ? 0.45 : this.wave >= s.firstWave ? Math.min(0.4, 0.12 * (this.wave - s.firstWave + 1)) : 0;
    const ranged = Math.random() < chance;
    // Each arena brings its own enemies: raiders in the Keep, fire-pot bombers in the Forge.
    const theme = (this.arena || 0) % THEMES.length;
    if (theme === 1) return ranged ? Archer : Math.random() < 0.7 ? Raider : Grunt;
    if (theme === 2) return ranged ? Bomber : Grunt;
    // The newer dungeons mix the warbands: who you meet depends on the place.
    const mix = {
      3: [Archer, 0.3], // Marsh: bog-dwellers with bows, grunts in the reeds
      4: [Archer, 0.6], // Hollow: hunters and raiders
      5: [Bomber, 0.2], // Mines: powder-pot throwers
      6: [Archer, 0.75], // Harbor: raiders off the boats
      7: [Bomber, 0.5], // Canyon
      8: [Bomber, 0.4], // Caldera
    }[theme];
    if (mix) return ranged ? mix[0] : Math.random() < mix[1] ? Raider : Grunt;
    return ranged ? Archer : Grunt;
  }

  /** Scale a fresh enemy's health for the difficulty tier. */
  toughen(enemy) {
    const k = (this.difficulty?.enemyHp || 1) * (this.mods?.hp || 1);
    enemy.maxHp = enemy.hp = enemy.hp * k;
    if (!enemy.isBoss) enemy.speed *= this.mods?.speed || 1;
    return enemy;
  }

  /** Occasionally promote a fresh spawn to an elite (from wave 4). */
  maybeElite(enemy) {
    const chance = this.waveEvent?.id === 'elite' ? 0.55 : (this.wave >= 4 ? Math.min(0.25, 0.04 * (this.wave - 3)) : 0) * (this.mods?.elites || 1);
    if (Math.random() >= chance) return enemy;
    const keys = Object.keys(AFFIXES);
    makeElite(enemy, keys[Math.floor(Math.random() * keys.length)]);
    return enemy;
  }

  spawnEnemy() {
    const Kind = this.enemyClass();
    const p = new THREE.Vector3();
    // Half the grunts march out of the archway gates (when the dressed arena is loaded).
    const gates = spawnGates.filter((g) => Math.hypot(g.x - this.player.pos.x, g.z - this.player.pos.z) > 7);
    if (gates.length && Math.random() < 0.5) {
      const g = gates[Math.floor(Math.random() * gates.length)];
      p.set(g.x + (Math.random() - 0.5) * 2.4, 0, g.z + (Math.random() - 0.5) * 2.4);
      this.enemies.push(this.maybeElite(this.toughen(new Kind(this, p, this.enemyLevel()))));
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
    this.enemies.push(this.maybeElite(this.toughen(new Kind(this, p, this.enemyLevel()))));
  }

  /** A wave event is over: pay its bonus (if cleared) and drop the screen tint. */
  endWaveEvent(cleared) {
    const ev = this.waveEvent;
    if (!ev) return;
    this.waveEvent = null;
    document.body.classList.remove(`wave-${ev.id}`);
    if (!cleared) return;
    if (ev.id === 'horde') {
      this.loot.drop(this.player.pos, Math.round(12 * (this.difficulty?.gems || 1)), 1);
      setTimeout(() => this.banner('Horde broken!', 'A purse of gems for your trouble', 1.6), 600);
    } else if (ev.id === 'elite') {
      this.gearDrops.spawn(this.player.pos, rollItem(['bow', 'armor', 'gadget'][Math.floor(Math.random() * 3)], this.enemyLevel() + (this.difficulty?.lootPower || 0) + 1, 'rare'));
      setTimeout(() => this.banner('War party defeated!', 'They left something behind', 1.6), 600);
    }
  }

  /** A named Champion leaps in at a gate. */
  spawnChampion() {
    const Kind = this.enemyClass() === Archer ? Grunt : this.enemyClass();
    const gate = spawnGates[Math.floor(Math.random() * spawnGates.length)] || { x: 0, z: -ARENA_HALF + 2 };
    const e = makeChampion(this.toughen(new Kind(this, new THREE.Vector3(gate.x, 0, gate.z + 1), this.enemyLevel() + 1)));
    this.enemies.push(e);
    this.toSpawn = Math.max(0, this.toSpawn - 1);
    this.banner(e.championName, 'A Champion joins the fight', 2.2);
    this.sfx.bossRoar();
  }

  /** A loot thief drops in at the far side of the arena and runs. */
  spawnThief() {
    const H = ARENA_HALF - 3;
    const p = new THREE.Vector3(-Math.sign(this.player.pos.x || 1) * H * 0.7, 0, -Math.sign(this.player.pos.z || 1) * H * 0.7);
    const t = new Thief(this, p, this.enemyLevel());
    this.enemies.push(this.toughen(t));
    this.banner('A loot thief!', 'Bring him down before he gets away', 2);
    this.sfx.sample('jingleClear', { vol: 0.4, rate: 1.5, jitter: 0 });
  }

  /** An enemy dropped into the arena: dust and a thud (a big one for the boss). */
  onEnemyLanded(enemy) {
    const big = enemy === this.boss;
    this.particles.spawn(enemy.pos.clone().setY(0.15), { count: big ? 30 : 12, color: 0x8a7a66, speed: big ? 4 : 2, up: 1, life: 0.7, size: big ? 0.45 : 0.3, gravity: 0.6, drag: 2.5 });
    this.decals.spawn(enemy.pos, 'scorch', big ? 3.2 : 1.4, big ? 8 : 3);
    this.sfx.sample(big ? 'slam' : 'thunkGround', { vol: big ? 0.9 : 0.35, rate: big ? 0.8 : 0.9, pan: this.panAt(enemy.pos) });
    if (big) this.shake.add(0.6);
  }

  // ---------------------------------------------------------------- combat events

  /** Switch the arena dressing (Ruins → Keep → Forge, then around again). */
  setArena(index) {
    this.arena = index;
    this.music.setTheme(index % THEMES.length);
    if (this.env.active && this.env.themeIndex !== index % THEMES.length) this.env.build(index % THEMES.length);
    else this.env.themeIndex = index % THEMES.length;
    // Hazards depend on the arena's layout, so lay them out after the dressing.
    if (this.env.active) this.hazards.setup(index);
  }

  /** After a boss: the far gate swings open onto daylight; walking through moves on to the next arena. */
  openArenaPortal() {
    this.waveState = 'portal';
    const next = THEMES[(this.arena + 1) % THEMES.length];
    const gate = spawnGates[0] || { x: 0, z: -ARENA_HALF + 1.6 };
    if (!this.arenaPortal) {
      // Light spilling through the open gateway (a warm glow, nothing swirling).
      const mat = new THREE.MeshBasicMaterial({ map: doorwayTexture(), transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.4, 1.1) });
      this.arenaPortal = new THREE.Group();
      const opening = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), mat);
      opening.position.y = 1.7;
      const spill = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: doorwayTexture(true), transparent: true, depthWrite: false, color: new THREE.Color(1.2, 1.05, 0.8) }));
      spill.position.set(0, 0.05, 2);
      this.arenaPortal.add(opening, spill);
      this.scene.add(this.arenaPortal);
    }
    this.arenaPortal.position.set(gate.x, 0, gate.z - 1.9);
    this.arenaPortal.visible = true;
    this.portalPos = new THREE.Vector3(gate.x, 0, gate.z - 0.6);
    this.banner('The gate is open', `Walk through to march on to the ${next.name}`, 3);
    this.tips.show('portal');
    this.sfx.sample('thunkWood', { vol: 0.8, rate: 0.5, jitter: 0 });
    this.sfx.warHorn();
  }

  updateArenaPortal(dt) {
    const p = this.arenaPortal;
    // Dust drifting in the light.
    if (Math.random() < dt * 12) {
      this.particles.spawn(new THREE.Vector3(p.position.x + (Math.random() - 0.5) * 2.4, 0.3 + Math.random() * 2.8, p.position.z + 0.5 + Math.random() * 2), {
        count: 1,
        color: [1.6, 1.4, 1.0],
        speed: 0.15,
        up: 0.1,
        life: 1.6,
        size: 0.04,
        gravity: -0.05,
      });
    }
    if (this.player.pos.distanceTo(this.portalPos) < 2.2 && !this.descending) this.descend();
  }

  descend() {
    this.descending = true;
    this.tips.done('portal');
    this.fade();
    this.sfx.sample('boom', { vol: 0.5, rate: 0.7, jitter: 0 });
    setTimeout(() => {
      // Anything still on the floor is scooped up on the way through.
      this.loot.scoop();
      this.gearDrops.scoop();
      this.arrows.clear();
      this.enemyArrows.clear();
      this.decals.clear();
      this.arenaPortal.visible = false;
      this.setArena(this.arena + 1);
      this.player.pos.set(0, 0, 4);
      this.camTarget.copy(this.player.pos);
      this.waveState = 'break';
      this.breakTimer = 2.5;
      this.descending = false;
      this.bossCard(THEMES[this.arena % THEMES.length].name, `Stage ${this.arena + 1}`);
      this.sfx.warHorn();
    }, 280);
  }

  /** Save point: after each boss, store the run so it can be resumed from the camp, and bank gems. */
  saveCheckpoint() {
    profile.checkpoint = { wave: this.wave, build: { ...build.levels }, rerolls: build.rerolls, arena: this.arena + 1, difficulty: this.difficulty.id };
    this.pendingDescent = true;
    profile.gems += this.loot.runGems;
    profile.totalGems += this.loot.runGems;
    this.stats.gemsBanked = (this.stats.gemsBanked || 0) + this.loot.runGems;
    this.loot.runGems = 0;
    saveProfile();
    setTimeout(() => this.banner('Progress saved', 'Continue from here at the camp gate', 1.8), 900);
  }
}

