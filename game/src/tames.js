import { ITEMS } from './items.js';

// Tame roster: list of your creatures with rename, heal (feed), follow/stay, release,
// plus whistle commands that act on every following tame at once.
const ICON = {
  pudgewing: '🐦', dashbeak: '🦎', crestcaller: '🦕', trikeros: '🦏', domehead: '🐏', ironhide: '🐢',
  talonrunner: '🦖', spinesail: '🐊', thunderneck: '🦕', gorgonax: '🦖', galewing: '🪽', thunderwing: '🦅', deepjaw: '🐋', glimmerfin: '🐟', cinderback: '🌋', duskraptor: '🦇', bogmaw: '🐊', reedhorn: '🦆', frosthorn: '🦬', rimeclaw: '❄️',
};

export function tameXpNeed(c) { return 30 + c.level * 6; }

export class TameRoster {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.el = document.getElementById('roster');
    this.list = document.getElementById('roster-list');
    this.confirm = null;
    document.getElementById('roster-close').addEventListener('click', () => this.toggle(false));
    this.el.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => this.command(b.dataset.cmd)));
    this.list.addEventListener('click', (e) => this.onClick(e));
    this.list.addEventListener('change', (e) => this.onRename(e));
    this.list.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
  }

  tames() { return this.game.creatures.list.filter((c) => c.tamed && c.alive); }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('show', this.open);
    const g = this.game;
    g.input.keys = {};
    if (this.open) { if (g.noLock) g.locked = false; else document.exitPointerLock?.(); this.render(); }
    else g.lock();
  }

  // Whistle commands (also bound to keys while playing).
  command(cmd) {
    const g = this.game;
    const near = this.tames().filter((c) => c.pos.distanceTo(g.player.pos) < 80 && !c.riddenBy);
    if (cmd === 'follow' || cmd === 'stay') {
      for (const c of near) { c.follow = cmd === 'follow'; if (cmd === 'stay') { c.state = 'tamed'; c.target = null; } }
      g.ui.notify(`Whistle: ${near.length} tame${near.length === 1 ? '' : 's'} ${cmd === 'follow' ? 'following' : 'staying'}`);
    } else if (cmd === 'attack') {
      const { c } = g.lookTarget();
      const t = c && c.creature;
      if (!t || t.tamed || !t.alive || t.ko) { g.ui.notify('Aim at a wild creature, then whistle attack', 'warn'); return; }
      let n = 0;
      for (const m of near) { if (m.species === 'pudgewing') continue; m.state = 'chase'; m.target = t; m.timer = 30; n++; }
      g.ui.notify(`Whistle: ${n} tame${n === 1 ? '' : 's'} attacking ${t.label}`, 'kill');
    }
    g.audio.tone({ f0: 1500, f1: 2400, dur: 0.25, vol: 0.12, type: 'sine', verb: 0.3 });
    if (this.open) this.render();
  }

  // XP from kills; called by the game when a tame (or your mount) lands the killing blow.
  grantXP(c, victim) {
    if (!c || !c.tamed) return;
    c.xp = (c.xp || 0) + 10 + victim.level * 3 * (victim.alpha ? 3 : 1);
    while (c.xp >= tameXpNeed(c)) {
      c.xp -= tameXpNeed(c);
      c.level++;
      c.maxHp = Math.round(c.maxHp * 1.05); c.hp = c.maxHp;
      c.dmg *= 1.04;
      this.game.ui.notify(`${c.name} reached level ${c.level}!`, 'quest');
    }
    this.game.saves.markDirty();
  }

  feedHeal(c) {
    const g = this.game;
    const food = c.def.diet === 'carn' ? (g.inv.count('cooked') ? 'cooked' : 'meat') : 'berries';
    if (!g.inv.count(food)) { g.ui.notify(`You need ${ITEMS[food].name} to feed ${c.name}`, 'warn'); return; }
    if (c.hp >= c.maxHp) { g.ui.notify(`${c.name} is already at full health`); return; }
    g.inv.remove(food, 1);
    c.hp = Math.min(c.maxHp, c.hp + c.maxHp * (food === 'cooked' ? 0.3 : 0.2));
    g.audio.eat();
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const c = this.tames().find((x) => String(x.id) === b.dataset.id);
    if (!c) return;
    const g = this.game;
    if (b.dataset.act === 'follow') c.follow = !c.follow;
    if (b.dataset.act === 'feed') this.feedHeal(c);
    if (b.dataset.act === 'release') {
      if (this.confirm !== c.id) { this.confirm = c.id; this.render(); return; }
      if (c.riddenBy) g.dismount();
      c.tamed = false; c.state = 'wander'; c.follow = false; c.timer = 5;
      g.ui.notify(`${c.name} returns to the wild`);
    }
    this.confirm = null;
    g.saves.markDirty();
    this.render();
  }

  onRename(e) {
    const input = e.target.closest('input[data-id]');
    if (!input) return;
    const c = this.tames().find((x) => String(x.id) === input.dataset.id);
    const name = input.value.trim().slice(0, 16);
    if (c && name) { c.name = name; this.game.saves.markDirty(); }
    this.render();
  }

  render() {
    const g = this.game;
    const tames = this.tames().sort((a, b) => b.level - a.level);
    document.getElementById('roster-count').textContent = `${tames.length} tame${tames.length === 1 ? '' : 's'}`;
    if (!tames.length) {
      this.list.innerHTML = '<div class="roster-empty">No tames yet. Knock a creature out with tranq arrows or a club, then feed it while it sleeps.</div>';
      return;
    }
    this.list.innerHTML = tames.map((c) => {
      const hp = Math.max(0, c.hp / c.maxHp) * 100, xp = ((c.xp || 0) / tameXpNeed(c)) * 100;
      const dist = Math.round(c.pos.distanceTo(g.player.pos));
      const status = (c.riddenBy ? 'Riding' : c.follow ? 'Following' : 'Staying') + (c.baby ? ` · Baby ${Math.round(c.growth * 100)}%` : '') + (c.mating > 0 ? ` · Courting ${Math.round(c.mating * 100)}%` : '') + (c.mateCd > 0 && !c.baby ? ' · Resting' : '');
      const confirming = this.confirm === c.id;
      return `<div class="tame-row">
        <div class="tame-ic">${ICON[c.species] || '🦖'}</div>
        <div class="tame-main">
          <div class="tame-top"><input data-id="${c.id}" id="tame-name-${c.id}" value="${c.name.replace(/"/g, '&quot;')}" maxlength="16" aria-label="Rename ${c.def.name}"><span class="tame-meta">${c.def.name} · Lv ${c.level} · ${status} · ${dist} m</span></div>
          <div class="tame-bar hp"><i style="width:${hp}%"></i><span>${Math.ceil(c.hp)} / ${c.maxHp}</span></div>
          <div class="tame-bar xp"><i style="width:${xp}%"></i></div>
        </div>
        <div class="tame-actions">
          <button data-id="${c.id}" data-act="feed">Feed</button>
          <button data-id="${c.id}" data-act="follow" ${c.riddenBy ? 'disabled' : ''}>${c.follow ? 'Stay' : 'Follow'}</button>
          <button data-id="${c.id}" data-act="release" class="${confirming ? 'danger' : ''}">${confirming ? 'Confirm?' : 'Release'}</button>
        </div>
      </div>`;
    }).join('');
  }
}
