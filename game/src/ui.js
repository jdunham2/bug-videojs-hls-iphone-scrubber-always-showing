import { ITEMS, RECIPES } from './items.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.hotbar = $('hotbar');
    this.inv = $('inventory');
    this.invGrid = $('inv-grid');
    this.craftList = $('craft-list');
    this.feed = $('feed');
    this.prompt = $('prompt');
    this.target = $('target');
    this.questEl = $('quest');
    this.clock = $('clock');
    this.compass = $('compass-strip');
    this.vignette = $('hurt');
    this.water = $('underwater');
    this.drag = null;
    this.open = false;

    for (let i = 0; i < 8; i++) {
      const d = document.createElement('div');
      d.className = 'slot'; d.dataset.i = i;
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); game.selectHot(i); });
      this.hotbar.appendChild(d);
    }
    for (let i = 0; i < 24; i++) {
      const d = document.createElement('div');
      d.className = 'slot'; d.dataset.i = i;
      d.addEventListener('click', (e) => {
        e.preventDefault();
        if (game.openStorage) { game.storeMove(true, i); return; }
        if (this.drag === null) { if (game.inv.slots[i]) { this.drag = i; d.classList.add('drag'); } return; }
        if (this.drag !== i) game.inv.swap(this.drag, i);
        else game.useItem(i); // tapping a selected slot again uses it (eat / wear)
        this.clearDrag();
      });
      this.invGrid.appendChild(d);
    }
    this.storeGrid = $('store-grid');
    for (let i = 0; i < 24; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.addEventListener('click', (e) => { e.preventDefault(); game.storeMove(false, i); });
      this.storeGrid.appendChild(d);
    }
    $('armor-slot').addEventListener('click', () => game.unwearArmor());

    // compass strip
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let html = '';
    for (let r = 0; r < 3; r++) for (let i = 0; i < 72; i++) {
      const deg = i * 5;
      const label = deg % 45 === 0 ? dirs[deg / 45] : '';
      html += `<span class="${label ? 'major' : deg % 15 === 0 ? 'mid' : ''}">${label || '|'}</span>`;
    }
    this.compass.innerHTML = html;
  }

  clearDrag() { this.drag = null; this.invGrid.querySelectorAll('.drag').forEach((e) => e.classList.remove('drag')); }

  slotHTML(s) {
    if (!s) return '';
    const def = ITEMS[s.id];
    const q = def.tool ? '' : `<b>${s.qty}</b>`;
    const dur = (def.tool || def.armor) && s.dur !== undefined ? `<i style="width:${Math.max(0, (s.dur / def.durability) * 100)}%"></i>` : '';
    return `<span class="ic">${def.icon}</span>${q}${dur}<em>${def.name}</em>`;
  }

  refresh() {
    const g = this.game;
    [...this.hotbar.children].forEach((d, i) => {
      d.innerHTML = this.slotHTML(g.inv.slots[i]) + `<sup>${i + 1}</sup>`;
      d.classList.toggle('active', i === g.hotIndex);
    });
    if (this.open) {
      [...this.invGrid.children].forEach((d, i) => { d.innerHTML = this.slotHTML(g.inv.slots[i]) + (i < 8 ? `<sup>${i + 1}</sup>` : ''); d.classList.toggle('hot', i < 8); });
      const box = g.openStorage;
      $('storage-panel').hidden = !box;
      $('craft-panel').hidden = !!box;
      if (box) [...this.storeGrid.children].forEach((d, i) => { d.innerHTML = this.slotHTML(box.items[i]); });
      const a = g.player.armor;
      $('armor-slot').innerHTML = a ? this.slotHTML({ id: a.id, qty: 1, dur: a.dur }) : '<span class="empty">no armor</span>';
      $('inv-hint').textContent = box ? 'tap an item to move it between your inventory and the box' : 'tap two slots to swap · tap a selected item again to eat or wear it';
      if (!box) this.renderCraft();
    }
  }

  renderCraft() {
    const g = this.game;
    this.craftList.innerHTML = '';
    for (const r of RECIPES) {
      const def = ITEMS[r.id];
      const needStation = r.station && !g.stationNear(r.station);
      const can = g.inv.has(r.cost) && !needStation;
      const el = document.createElement('div');
      el.className = 'recipe' + (can ? ' can' : '');
      el.innerHTML = `<div class="ric">${def.icon}</div><div class="rbody"><div class="rname">${def.name}${r.yield ? ` ×${r.yield}` : ''}</div><div class="rdesc">${r.desc}${r.station ? ` <b class="${needStation ? 'no' : 'ok'}">${needStation ? 'Needs a Forge nearby' : 'Forge nearby'}</b>` : ''}</div><div class="rcost">${Object.entries(r.cost).map(([id, q]) => `<span class="${g.inv.count(id) >= q ? 'ok' : 'no'}">${ITEMS[id].icon} ${g.inv.count(id)}/${q}</span>`).join('')}</div></div><button ${can ? '' : 'disabled'}>Craft</button>`;
      el.querySelector('button').addEventListener('click', () => g.craft(r));
      this.craftList.appendChild(el);
    }
  }

  toggleInventory(force) {
    this.open = force ?? !this.open;
    this.inv.classList.toggle('show', this.open);
    this.refresh();
  }

  bars(p) {
    const set = (id, v, max) => { const el = $(id); el.style.width = `${Math.max(0, (v / max) * 100)}%`; el.parentElement.classList.toggle('low', v / max < 0.25); };
    set('bar-hp', p.hp, p.maxHp);
    set('bar-st', p.stam, p.maxStam);
    set('bar-fd', p.food, 100);
    set('bar-wt', p.water, 100);
    set('bar-xp', p.xp, p.xpNeed());
    $('lvl').textContent = p.level;
    $('hp-num').textContent = Math.ceil(p.hp);
    const t = this.game.ambientTemp;
    if (t !== undefined) {
      const el = $('temp');
      el.textContent = `${Math.round(t)}°C`;
      el.className = p.cold > 8 ? 'freezing' : p.cold > 0 ? 'cold' : p.hot > 0 ? 'hot' : '';
    }
  }

  notify(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'note ' + kind;
    d.textContent = text;
    this.feed.prepend(d);
    setTimeout(() => d.classList.add('fade'), 3200);
    setTimeout(() => d.remove(), 4000);
    while (this.feed.children.length > 7) this.feed.lastChild.remove();
  }

  banner(title, sub) {
    const b = $('banner');
    b.innerHTML = `<h2>${title}</h2><p>${sub || ''}</p>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  saveIndicator(text, loud) {
    const el = document.getElementById('saved');
    el.textContent = '💾 ' + text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    if (loud) this.notify(text, 'craft');
  }

  setPrompt(text) {
    if (this._p === text) return;
    this._p = text;
    this.prompt.innerHTML = text || '';
    this.prompt.style.opacity = text ? 1 : 0;
  }

  setTarget(c) {
    if (!c) { this.target.style.opacity = 0; this._tid = null; return; }
    this.target.style.opacity = 1;
    const hp = Math.max(0, c.hp / c.maxHp) * 100;
    const tp = c.def.torpor === Infinity ? 0 : Math.min(100, (c.torpor / c.maxTorpor) * 100);
    const name = !c.alive ? `${c.def.name} (Carcass)` : c.label;
    const tag = c.boss ? '<span class="tag hostile">BOSS</span>' : c.alpha && c.alive ? '<span class="tag alpha">ALPHA</span>' : c.tamed ? '<span class="tag tame">TAMED</span>' : !c.alive ? '' : c.ko ? '<span class="tag ko">UNCONSCIOUS</span>' : c.def.temper === 'aggressive' ? '<span class="tag hostile">HOSTILE</span>' : c.def.temper === 'neutral' ? '<span class="tag neutral">NEUTRAL</span>' : '<span class="tag passive">PASSIVE</span>';
    let extra = '';
    if (c.ko && !c.tamed) extra = `<div class="tbar tame"><i style="width:${c.tame}%"></i><span>Taming ${c.tame.toFixed(0)}%</span></div><div class="thint">Prefers ${ITEMS[c.def.tameFood].name}</div>`;
    this.target.innerHTML = `<div class="tname">${name} ${tag}</div>
      <div class="tbar hp"><i style="width:${hp}%"></i><span>${Math.max(0, Math.ceil(c.hp))} / ${c.maxHp}</span></div>
      ${c.def.torpor !== Infinity && c.alive ? `<div class="tbar tp"><i style="width:${tp}%"></i><span>Torpor</span></div>` : ''}${extra}`;
  }

  quest(q, idx, total) {
    if (!q) { this.questEl.innerHTML = `<div class="qh">VERTICAL SLICE COMPLETE</div><div class="qt">You conquered the island's basics. Explore freely — the Gorgonax awaits in the northern highlands.</div>`; return; }
    this.questEl.innerHTML = `<div class="qh">OBJECTIVE ${idx + 1}/${total}</div><div class="qt">${q.title}</div><div class="qd">${q.progress()}</div>`;
  }

  frame(game) {
    const p = game.player;
    this.clock.textContent = `${game.env.clockString()} · ${game.weather.label}`;
    // compass: 72 ticks per 360deg, each 18px wide
    let deg = ((-p.yaw * 180) / Math.PI) % 360; if (deg < 0) deg += 360;
    this.compass.style.transform = `translateX(${-(deg / 5) * 18 - 72 * 18 + 180}px)`;
    this.vignette.style.opacity = Math.min(1, p.hurtT * 2.2 + (p.hp / p.maxHp < 0.3 ? 0.35 + Math.sin(performance.now() / 200) * 0.1 : 0));
    this.water.style.opacity = p.underwater && !p.mount ? 1 : 0;
    $('frost').style.opacity = Math.min(0.85, Math.max(0, (p.cold || 0) - 4) / 10);
  }
}
