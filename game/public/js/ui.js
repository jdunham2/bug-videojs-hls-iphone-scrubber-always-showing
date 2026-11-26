// DOM user interface: HUD, minimap, inventory, shop, chat, banners, build bar.
import * as THREE from 'three';
import { G } from './state.js';
import { RARITIES, affixLines, generateItem, WEAPONS } from '../shared/items.js';
import { STRUCTURES } from '../shared/world.js';
import { xpForLevel, computeStats, BAG_SIZE } from './save.js';
import { placeLabel, escapeHtml } from './entities.js';
import { SLAM_CD, DASH_CD } from './player.js';

const $ = (id) => document.getElementById(id);
export const COLORS = ['#e8a33d', '#e0453a', '#3a8ee0', '#4ac46a', '#b05ae0', '#e05aa8', '#3ad0c8', '#f2f2f2'];
const ICON = { sword: '🗡️', axe: '🪓', hammer: '🔨', dagger: '🔪', helm: '⛑️', chest: '🛡️', boots: '🥾' };
const SLOT_NAMES = { weapon: 'Weapon', helm: 'Helm', chest: 'Chest', boots: 'Boots' };
export const itemIcon = (it) => ICON[it.type] || ICON[it.slot] || '❔';

class UI {
  init(save) {
    this.save = save;
    const sw = $('colors');
    COLORS.forEach((c) => {
      const d = document.createElement('div'); d.className = 'sw' + (c === save.color ? ' on' : ''); d.style.background = c; d.style.color = c;
      d.onclick = () => { save.color = c; [...sw.children].forEach((x) => x.classList.remove('on')); d.classList.add('on'); };
      sw.appendChild(d);
    });
    $('nameInput').value = save.name || '';
    const qp = new URLSearchParams(location.search).get('room');
    if (qp) $('roomInput').value = qp.toUpperCase();
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => this.closePanel(b.dataset.close)));
    $('rerollBtn').onclick = () => this.rerollShop(true);
    this.chatLog = $('chatLog'); this.chatInput = $('chatInput');
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const t = this.chatInput.value.trim(); if (t) G.net.send({ t: 'chat', text: t }); this.closeChat(); e.preventDefault(); }
      if (e.key === 'Escape') this.closeChat();
      e.stopPropagation();
    });
    this.mm = $('minimap').getContext('2d');
    this.tooltip = $('tooltip');
    this.marks = [];
    this.bannerT = 0; this.bigT = 0;
    this.shopStock = [];
    this.selectedBuild = 'barricade';
    addEventListener('mousemove', (e) => { if (!this.tooltip.classList.contains('hidden')) this.placeTooltip(e.clientX, e.clientY); });
  }

  // ---------- lobby ----------
  lobbyValues() { return { name: $('nameInput').value.trim() || 'Hero', room: $('roomInput').value.trim().toUpperCase() }; }
  lobbyMsg(t) { $('lobbyMsg').textContent = t; }
  hideLobby() { $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden'); }
  fade(on) { $('fade').style.opacity = on ? 1 : 0; }

  setRoom(code) {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    $('roomInfo').innerHTML = `Party code <b>${code}</b><br><span class="muted">Depth <span id="depthTxt">${G.roomLevel}</span></span><br><button class="btn" id="copyInv">Copy invite link</button>`;
    $('copyInv').onclick = () => { navigator.clipboard?.writeText(url); this.toast('Invite link copied!', '#ffd98a'); };
    history.replaceState(null, '', `?room=${code}`);
  }
  setDepth(l) { const e = $('depthTxt'); if (e) e.textContent = l; }

  // ---------- messages ----------
  zoneBanner(title, sub) {
    const el = $('zoneBanner');
    el.querySelector('.zb-title').textContent = title; el.querySelector('.zb-sub').textContent = sub || '';
    el.classList.add('show'); clearTimeout(this._zb);
    this._zb = setTimeout(() => el.classList.remove('show'), 3200);
  }
  bigBanner(title, sub, ms = 3500) {
    const el = $('bigBanner');
    el.querySelector('.bb-t').textContent = title; el.querySelector('.bb-s').textContent = sub || '';
    el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this._bb); this._bb = setTimeout(() => el.classList.add('hidden'), ms);
  }
  toast(html, color = '#efe7d6', sub = '') {
    const d = document.createElement('div'); d.className = 'toast'; d.style.color = color;
    d.innerHTML = html + (sub ? `<small>${sub}</small>` : '');
    $('toasts').prepend(d);
    setTimeout(() => d.remove(), 4200);
    while ($('toasts').children.length > 6) $('toasts').lastChild.remove();
  }
  chat(from, text, color) {
    const d = document.createElement('div');
    d.innerHTML = from === '★' ? `<span style="color:#ffd98a">${escapeHtml(text)}</span>` : `<b style="color:${color || '#fff'}">${escapeHtml(from)}:</b>${escapeHtml(text)}`;
    this.chatLog.appendChild(d);
    while (this.chatLog.children.length > 40) this.chatLog.firstChild.remove();
  }
  openChat() { $('chat').classList.add('open'); this.chatInput.classList.remove('hidden'); this.chatInput.focus(); G.input.unlock(); }
  closeChat() { this.chatInput.value = ''; this.chatInput.blur(); this.chatInput.classList.add('hidden'); $('chat').classList.remove('open'); }
  get chatting() { return document.activeElement === this.chatInput; }
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = `<kbd>E</kbd>${escapeHtml(text)}`; el.classList.remove('hidden');
  }
  hurtFlash() {
    const v = $('vignette'); v.style.boxShadow = 'inset 0 0 180px rgba(255,0,0,0.65)';
    clearTimeout(this._hf); this._hf = setTimeout(() => (v.style.boxShadow = 'inset 0 0 160px rgba(255,0,0,0)'), 120);
  }
  showDeath(on) { $('death').classList.toggle('hidden', !on); }

  // ---------- HUD ----------
  updateHUD(dt) {
    const p = G.player, s = this.save;
    if (!p) return;
    const S = p.stats;
    $('hpFill').style.width = (Math.max(0, p.hp) / S.maxHp) * 100 + '%';
    $('hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${S.maxHp}`;
    $('xpFill').style.width = (s.xp / xpForLevel(s.level)) * 100 + '%';
    $('lvlBadge').textContent = s.level;
    $('goldText').textContent = s.gold.toLocaleString();
    $('potCount').textContent = s.potions;
    const cd = (id, v, max) => { const el = $(id).querySelector('.cd'); el.style.height = Math.max(0, Math.min(1, v / max)) * 100 + '%'; };
    cd('skQ', p.slamCd, SLAM_CD); cd('skDash', p.dashCd, DASH_CD); cd('skPot', Math.max(p.potCd, s.potions ? 0 : 1), 1);
    if (p.dead) $('deathSub').textContent = `Rising again in ${Math.ceil(p.deadT)}…`;
    // party
    const all = [{ name: s.name, color: s.color, hp: p.hp, maxHp: S.maxHp, level: s.level, zone: G.zoneKey, dead: p.dead, me: true }, ...G.party.values()];
    const html = all.map((m) => `<div class="pf ${m.dead ? 'dead' : ''}" style="--c:${m.color}"><div class="n">${escapeHtml(m.name)}${m.me ? ' (you)' : ''}<span>Lv${m.level} · ${zoneName(m.zone)}</span></div><div class="t"><i style="width:${Math.max(0, (m.hp / m.maxHp) * 100)}%"></i></div></div>`).join('');
    if (html !== this._party) { $('party').innerHTML = html; this._party = html; }
    // boss bar
    let boss = null;
    for (const e of G.enemies.values()) if (e.boss && !e.dead) boss = e;
    const bb = $('bossBar');
    if (boss && boss.pos.distanceTo(p.pos) < 30) {
      bb.classList.remove('hidden');
      bb.querySelector('.bb-name').textContent = `${boss.def.name} · Lv ${boss.level}`;
      bb.querySelector('.bb-fill').style.width = (boss.hp / boss.maxHp) * 100 + '%';
    } else bb.classList.add('hidden');
    // defense
    const d = G.defense, dh = $('defenseHud');
    if (G.zone?.type === 'town' && d.phase !== 'day') {
      dh.classList.remove('hidden');
      let title = '', sub = '';
      if (d.phase === 'build') { title = 'NIGHTFALL'; sub = `The horde arrives in ${d.timer}s — press B to build defenses`; }
      else if (d.phase === 'wave') { title = `WAVE ${d.wave} / ${d.waves}`; sub = `${[...G.enemies.values()].filter((e) => !e.dead).length} enemies in the field`; }
      else if (d.phase === 'intermission') { title = `WAVE ${d.wave} REPELLED`; sub = `Next wave in ${d.timer}s — reinforce the walls!`; }
      else if (d.phase === 'dawn') { title = d.result === 'victory' ? 'DAWN BREAKS' : 'THE HEART DIMS'; sub = d.result === 'victory' ? 'Emberhold stands. The city rewards you.' : 'The Ember Heart was overwhelmed…'; }
      dh.querySelector('.dh-title').textContent = title; dh.querySelector('.dh-sub').textContent = sub;
      dh.querySelector('.dh-fill').style.width = (Math.max(0, d.coreHp) / d.coreMax) * 100 + '%';
    } else dh.classList.add('hidden');
    $('clickToPlay').classList.toggle('hidden', G.input.locked || G.uiOpen || this.chatting);
    this.updateBuildBar();
  }

  // ---------- landmarks ----------
  setMarks(zone) {
    this.marks.forEach((m) => m.el.remove());
    this.marks = (zone.interactables || []).filter((i) => i.mark).map((i) => {
      const el = document.createElement('div'); el.className = 'mark'; el.textContent = i.mark;
      $('labels').appendChild(el);
      return { el, pos: new THREE.Vector3(i.x, zone.groundHeight(i.x, i.z) + (zone.type === 'dungeon' ? 5 : 10.5), i.z) };
    });
  }
  updateMarks(camera) { for (const m of this.marks) placeLabel(m.el, m.pos, camera, 90); }

  // ---------- minimap ----------
  drawMinimap(zone, player, yaw) {
    const ctx = this.mm, S = 180, map = zone.map;
    if (!map) return;
    const view = map.view, sc = S / (2 * view);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2); ctx.rotate(yaw);
    const px = player.pos.x, pz = player.pos.z;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(map.canvas, (map.center.x - map.worldSize / 2 - px) * sc, (map.center.z - map.worldSize / 2 - pz) * sc, map.worldSize * sc, map.worldSize * sc);
    ctx.globalAlpha = 1;
    const dot = (x, z, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((x - px) * sc, (z - pz) * sc, r, 0, 7); ctx.fill(); };
    for (const ic of zone.mapIcons || []) { dot(ic.x, ic.z, 5, ic.color); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (zone.type === 'town') for (const ch of zone.chests) if (!ch.open) dot(ch.x, ch.z, 3.5, '#ffd34d');
    for (const s of G.structures.values()) { ctx.fillStyle = '#5ab0ff'; ctx.fillRect((s.s.x - px) * sc - 2, (s.s.z - pz) * sc - 2, 4, 4); }
    for (const l of G.loots.values()) dot(l.g.position.x, l.g.position.z, 2.5, RARITIES[l.item.rarity].color);
    for (const e of G.enemies.values()) if (!e.dead) dot(e.pos.x, e.pos.z, e.boss ? 5 : 2.6, e.boss ? '#ff2a1a' : '#ff5a4a');
    for (const r of G.remotes.values()) if (r.p.zone === G.zoneKey) dot(r.pos.x, r.pos.z, 4, r.color);
    // player arrow
    ctx.save(); ctx.rotate(-player.ry + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    // north marker
    const na = yaw;
    ctx.fillStyle = '#ffd98a'; ctx.font = '800 12px Cinzel, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', S / 2 + Math.sin(-na) * (S / 2 - 12) * -1, S / 2 - Math.cos(-na) * (S / 2 - 12));
  }

  // ---------- panels ----------
  get anyPanel() { return ['inventory', 'shop', 'help'].some((id) => !$(id).classList.contains('hidden')); }
  togglePanel(id) { if ($(id).classList.contains('hidden')) this.openPanel(id); else this.closePanel(id); }
  openPanel(id) {
    $(id).classList.remove('hidden');
    G.uiOpen = true; G.input.unlock();
    if (id === 'inventory' || id === 'shop') this.renderInventory();
    if (id === 'shop') { if (!this.shopStock.length) this.rerollShop(false); this.renderShop(); $('inventory').classList.remove('hidden'); this.positionShop(true); }
  }
  closePanel(id) {
    $(id).classList.add('hidden');
    if (id === 'shop' || id === 'inventory') { $('shop').classList.add('hidden'); $('inventory').classList.add('hidden'); this.positionShop(false); }
    this.hideTip();
    G.uiOpen = this.anyPanel;
  }
  closeAll() { ['inventory', 'shop', 'help'].forEach((id) => this.closePanel(id)); }
  positionShop(on) {
    const inv = $('inventory'), shop = $('shop');
    if (on && innerWidth > 1400) { shop.style.left = 'calc(50% - 400px)'; inv.style.left = 'calc(50% + 330px)'; }
    else { shop.style.left = ''; inv.style.left = ''; if (on) inv.classList.add('hidden'); }
  }

  renderInventory() {
    const s = this.save;
    const eq = $('equipSlots'); eq.innerHTML = '';
    for (const slot of ['weapon', 'helm', 'chest', 'boots']) {
      const it = s.equipped[slot];
      const d = document.createElement('div'); d.className = 'eslot';
      if (it) { d.style.borderColor = RARITIES[it.rarity].color; d.style.borderStyle = 'solid'; d.innerHTML = `<div class="lab">${SLOT_NAMES[slot]}</div><div class="ename" style="color:${RARITIES[it.rarity].color}">${itemIcon(it)} ${escapeHtml(it.name)}</div>`; }
      else d.innerHTML = `<div class="lab">${SLOT_NAMES[slot]}</div><div class="ename muted">— empty —</div>`;
      if (it) { this.bindTip(d, it, null); d.onclick = () => this.unequip(slot); }
      eq.appendChild(d);
    }
    const st = computeStats(s);
    $('statsBox').innerHTML = [
      ['Damage', Math.round(st.dmg)], ['Attack speed', st.atkSpeed.toFixed(2)], ['Health', st.maxHp], ['Armor', `${st.armor} (−${Math.round((1 - 100 / (100 + st.armor)) * 100)}%)`],
      ['Crit chance', (st.crit * 100).toFixed(1) + '%'], ['Move speed', Math.round(st.moveSpeed * 100) + '%'], ['Gold find', '+' + Math.round(st.goldFind * 100) + '%'], ['Lifesteal', (st.leech * 100).toFixed(1) + '%'],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const bag = $('bag'); bag.innerHTML = '';
    for (let i = 0; i < BAG_SIZE; i++) {
      const it = s.bag[i];
      const c = document.createElement('div'); c.className = 'bcell' + (it ? ' filled' : '');
      if (it) {
        c.style.color = RARITIES[it.rarity].color; c.textContent = itemIcon(it);
        const cur = s.equipped[it.slot];
        if (!cur || it.power > cur.power) { const u = document.createElement('span'); u.className = 'up'; u.textContent = '▲'; c.appendChild(u); }
        this.bindTip(c, it, cur);
        c.onclick = () => this.equip(i);
        c.oncontextmenu = (e) => { e.preventDefault(); this.sell(i); };
      }
      bag.appendChild(c);
    }
    $('invHint').textContent = $('shop').classList.contains('hidden') ? 'Click to equip · Sell items at the Hollow Merchant in the Dark World' : 'Click to equip · Right-click to SELL';
  }

  equip(i) {
    const s = this.save, it = s.bag[i];
    if (!it) return;
    const cur = s.equipped[it.slot];
    s.equipped[it.slot] = it;
    if (cur) s.bag[i] = cur; else s.bag.splice(i, 1);
    G.audio.loot(Math.min(2, it.rarity));
    this.afterGearChange();
  }
  unequip(slot) {
    const s = this.save;
    if (!s.equipped[slot] || s.bag.length >= BAG_SIZE) return;
    s.bag.push(s.equipped[slot]); s.equipped[slot] = null;
    this.afterGearChange();
  }
  sell(i) {
    if ($('shop').classList.contains('hidden')) { this.toast('Find the Hollow Merchant in the Dark World to sell.', '#c77dff'); return; }
    const s = this.save, it = s.bag[i];
    if (!it) return;
    s.bag.splice(i, 1); s.gold += it.price;
    G.audio.coin();
    this.toast(`Sold ${escapeHtml(it.name)}`, '#ffd34d', `+${it.price} gold`);
    this.afterGearChange();
  }
  afterGearChange() {
    this.hideTip();
    G.player.refreshStats(false);
    G.actions.saveNow();
    this.renderInventory();
    if (!$('shop').classList.contains('hidden')) this.renderShop();
  }

  rerollShop(paid) {
    const s = this.save;
    if (paid) { if (s.gold < 25) { this.toast('Not enough gold.', '#ff6a5a'); return; } s.gold -= 25; G.audio.coin(); }
    const lvl = G.roomLevel;
    this.shopStock = [];
    for (let i = 0; i < 6; i++) {
      const it = generateItem(null, lvl, { minRarity: i < 2 ? 2 : 1, luck: 1.8 });
      it.cost = Math.round(it.price * 4 + 10 * lvl);
      this.shopStock.push(it);
    }
    if (paid) this.renderShop();
  }
  renderShop() {
    const s = this.save, el = $('shopItems'); el.innerHTML = '';
    const special = [
      { kind: 'potion', name: 'Ember Draught', desc: 'Restores 50% health', icon: '🧪', cost: 25, color: '#ff6a5a' },
      { kind: 'cache', name: 'Mystery Cache', desc: `A sealed cache. Rare or better (Lv ${G.roomLevel})`, icon: '🎁', cost: 90 * G.roomLevel, color: '#c77dff' },
    ];
    for (const sp of special) {
      const d = document.createElement('div'); d.className = 'sitem' + (s.gold < sp.cost ? ' poor' : ''); d.style.color = sp.color;
      d.innerHTML = `<div class="si">${sp.icon}</div><div><div class="sn">${sp.name}</div><div class="muted small">${sp.desc}</div><div class="sp">◉ ${sp.cost}</div></div>`;
      d.onclick = () => this.buySpecial(sp);
      el.appendChild(d);
    }
    this.shopStock.forEach((it, i) => {
      const d = document.createElement('div'); d.className = 'sitem' + (s.gold < it.cost ? ' poor' : ''); d.style.color = RARITIES[it.rarity].color;
      d.innerHTML = `<div class="si">${itemIcon(it)}</div><div><div class="sn">${escapeHtml(it.name)}</div><div class="muted small">${RARITIES[it.rarity].name} · Lv ${it.level} · Power ${it.power}</div><div class="sp">◉ ${it.cost}</div></div>`;
      this.bindTip(d, it, s.equipped[it.slot]);
      d.onclick = () => this.buy(i);
      el.appendChild(d);
    });
  }
  buy(i) {
    const s = this.save, it = this.shopStock[i];
    if (!it) return;
    if (s.gold < it.cost) { this.toast('Not enough gold.', '#ff6a5a'); return; }
    if (s.bag.length >= BAG_SIZE) { this.toast('Your bag is full.', '#ff6a5a'); return; }
    s.gold -= it.cost; delete it.cost;
    s.bag.push(it); this.shopStock.splice(i, 1);
    G.audio.buy(); this.toast(`Bought ${escapeHtml(it.name)}`, RARITIES[it.rarity].color);
    this.afterGearChange();
  }
  buySpecial(sp) {
    const s = this.save;
    if (s.gold < sp.cost) { this.toast('Not enough gold.', '#ff6a5a'); return; }
    if (sp.kind === 'potion') { if (s.potions >= 9) { this.toast('You can carry 9 potions.', '#ff6a5a'); return; } s.potions++; }
    else {
      if (s.bag.length >= BAG_SIZE) { this.toast('Your bag is full.', '#ff6a5a'); return; }
      const it = generateItem(null, G.roomLevel, { minRarity: 2, luck: 2.5 });
      s.bag.push(it); G.audio.loot(it.rarity);
      this.toast(`The cache held: ${escapeHtml(it.name)}`, RARITIES[it.rarity].color, RARITIES[it.rarity].name);
    }
    s.gold -= sp.cost; G.audio.buy();
    this.afterGearChange();
  }

  // ---------- tooltip ----------
  bindTip(el, it, cmp) {
    el.onmouseenter = (e) => this.showTip(it, cmp, e.clientX, e.clientY);
    el.onmouseleave = () => this.hideTip();
  }
  showTip(it, cmp, x, y) {
    const R = RARITIES[it.rarity], t = this.tooltip;
    t.style.color = R.color;
    let main = it.slot === 'weapon' ? `${it.dmg} Damage · ${it.speed.toFixed(2)} speed<br><span class="muted">${WEAPONS[it.type].name}${WEAPONS[it.type].cleave ? ' · wide cleave' : ''}</span>` : `${it.armor} Armor · +${it.hp} Health`;
    let html = `<div class="tn">${escapeHtml(it.name)}</div><div class="tr">${R.name} ${SLOT_NAMES[it.slot]} · Item Level ${it.level}</div><div class="tm">${main}</div>`;
    html += affixLines(it).map((l) => `<div class="ta">${l}</div>`).join('');
    if (cmp !== null && cmp !== undefined && cmp !== it) {
      const diff = it.power - cmp.power;
      html += `<div class="cmp">vs equipped: <span class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '▲ +' : '▼ '}${diff} power</span></div>`;
    } else if (cmp === undefined || (cmp === null && !this.save.equipped[it.slot])) html += `<div class="cmp pos">Empty slot — equip it!</div>`;
    html += `<div class="tp">Power ${it.power} · Sells for ${it.price}g</div>`;
    t.innerHTML = html; t.classList.remove('hidden');
    this.placeTooltip(x, y);
  }
  placeTooltip(x, y) {
    const t = this.tooltip, w = 270, h = t.offsetHeight;
    t.style.left = Math.min(innerWidth - w - 10, x + 16) + 'px';
    t.style.top = Math.min(innerHeight - h - 10, y + 12) + 'px';
  }
  hideTip() { this.tooltip.classList.add('hidden'); }

  // ---------- build bar ----------
  updateBuildBar() {
    const el = $('buildBar');
    const show = G.buildMode && G.zone?.type === 'town';
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const key = Object.keys(STRUCTURES).map((k) => k + (this.selectedBuild === k) + (this.save.gold >= STRUCTURES[k].cost)).join();
    if (key === this._bb) return;
    this._bb = key;
    el.innerHTML = Object.entries(STRUCTURES).map(([k, S]) => `<div class="bslot ${this.selectedBuild === k ? 'on' : ''} ${this.save.gold < S.cost ? 'poor' : ''}" data-k="${k}"><div class="bi">${S.icon}</div><div class="bn">[${S.key}] ${S.name}</div><div class="bc">◉ ${S.cost}</div><div class="muted small">${S.desc}</div></div>`).join('');
    el.querySelectorAll('.bslot').forEach((b) => (b.onclick = () => { this.selectedBuild = b.dataset.k; this._bb = null; }));
  }
}

export function zoneName(z) {
  if (!z) return '';
  if (z.startsWith('dungeon')) return 'Dungeon';
  return z === 'dark' ? 'Dark World' : 'Emberhold';
}

export const ui = new UI();
