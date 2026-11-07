// HUD, banners, overlays (title, pause, game over) and the skill draft.
import { config } from './config.js';
import { build, stat, rollCards, ROMAN, TYPE_LABEL } from './skills.js';
import { modelStatus } from './models.js';
import { audioStatus } from './audio.js';
import { profile } from './profile.js';

/** Methods mixed into Game (see game.js). */
export class UiMethods {
  openDraft() {
    this.tips.show('draft');
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
    this.tips.done('draft');
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
    if (this.pendingDescent) {
      this.pendingDescent = false;
      this.openArenaPortal();
    }
    const level = card.max > 1 && card.max !== Infinity ? ` ${ROMAN[card.next]}` : '';
    this.banner(`${card.name}${level}`, card.text, 2);
    this.particles.spawn(p.pos.clone().setY(1), { count: 24, color: [3, 2.2, 0.6], speed: 4, up: 3, life: 0.7, size: 0.08, gravity: 3 });
  }

  // ---------------------------------------------------------------- run state

  updateHud() {
    const h = this.hud;
    const p = this.player;
    const s = this.stats;
    const maxHp = stat.maxHp();
    const pct = Math.max(0, p.hp / maxHp);
    h.hpFill.style.width = `${pct * 100}%`;
    h.hpFill.classList.toggle('low', pct < 0.3);
    h.hpText.textContent = `${Math.ceil(p.hp)} / ${maxHp}`;
    const boss = this.boss && !this.boss.removed && this.boss.state !== 'spawning' ? this.boss : null;
    h.bossBar.classList.toggle('show', !!boss);
    if (boss) {
      h.bossName.textContent = boss.displayName + (boss.phase === 2 ? ' · Enraged' : '');
      h.bossFill.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
      h.bossPoise.style.width = `${(boss.poise / config.boss.poise) * 100}%`;
    }
    h.ultFill.style.width = `${this.ultimate.meter}%`;
    h.gems.textContent = `◆ ${this.loot.runGems}`;
    // Music follows the fight: calm between waves, building with enemy count, full on for bosses.
    const aliveNow = this.enemies.filter((e) => e.state !== 'dying' && !e.removed).length;
    const fighting = this.state === 'playing' && this.waveState === 'active';
    this.music.setIntensity(fighting ? 0.45 + Math.min(0.4, aliveNow * 0.06) + (this.boss ? 0.3 : 0) : 0.08, !!this.boss && fighting);
    h.ult.classList.toggle('ready', this.ultimate.ready);
    h.ult.classList.toggle('active', !!this.ultimate.active);
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
    this.overlayReadyAt = performance.now() + (kind === 'gameover' ? 1200 : 0);
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
        <div><kbd>Q</kbd><span>Arrow Storm, once the gold meter is full</span></div>
        <div><kbd>\`</kbd><span>Toggle tuning panel</span></div>
        <div><kbd>P</kbd><kbd>M</kbd><kbd>R</kbd><span>Pause · Mute · Restart</span></div>
      </div>`;
    if (kind === 'title') {
      o.innerHTML = `
        <h1>Draw &amp; Release</h1>
        <p class="tag">A bow-combat prototype. Survive the waves.</p>
        ${controls}
        <p class="tip">Grunts flash red and show a wedge before they lunge. A full-draw or perfect hit during that windup staggers them. Roll through a lunge at the last moment for a <b class="gold">perfect dodge</b>: time slows and your next tap is an instant perfect shot. After every wave, pick a skill to power up.</p>
        <button>Click to enter the camp</button>
        ${profile.best.wave ? `<p class="best">Best: wave ${profile.best.wave}, ${profile.best.kills} kills</p>` : ''}
        <p class="model-status" id="model-status">${this.modelStatusText()}</p>
        <p class="model-status" id="audio-status">${this.audioStatusText()}</p>`;
    } else if (kind === 'paused') {
      o.innerHTML = `<h1>Paused</h1>${controls}<button>Click to resume</button>`;
    } else {
      const secs = Math.floor(this.elapsed);
      o.innerHTML = `
        <h1>You fell</h1>
        <p class="tag">${newBest ? 'New best!' : `Best: wave ${profile.best.wave}, ${profile.best.kills} kills`}</p>
        <div class="summary">
          <div><b>${this.wave}</b><span>Wave reached</span></div>
          <div><b>${s.kills}</b><span>Kills</span></div>
          <div><b>${acc}%</b><span>Accuracy</span></div>
          <div><b>${perf}%</b><span>Perfect shots</span></div>
          <div><b>${s.bestStreak}</b><span>Best perfect streak</span></div>
          <div><b>${s.staggers}</b><span>Staggers</span></div>
          <div><b>${s.perfectDodges}</b><span>Perfect dodges</span></div>
          <div><b>◆ ${this.gemsThisRun ?? 0}</b><span>Soul gems banked</span></div>
          <div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>Survived</span></div>
        </div>
        ${build.owned().length ? `<div class="build-final">${this.buildChips()}</div>` : ''}
        ${this.newUnlocks?.length ? `<p class="unlocks">New in camp: ${this.newUnlocks.join(', ')}</p>` : ''}
        <button>Return to camp</button>
        <p class="tip">Or press R to jump straight back in</p>`;
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

  bossCard(title, sub) {
    const el = this.hud.bossCard;
    el.innerHTML = '<div class="name"></div><div class="sub"></div>';
    el.querySelector('.name').textContent = title;
    el.querySelector('.sub').textContent = sub;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
}
