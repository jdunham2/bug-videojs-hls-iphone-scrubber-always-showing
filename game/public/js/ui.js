// DOM user interface: HUD, minimap, inventory/shop/stash/trade, talents, emote wheel, settings, dialogs.
import * as THREE from 'three';
import { G } from './state.js';
import { RARITIES, affixLines, WEAPONS } from '../shared/items.js';
import { STRUCTURES, TOWN, upgradeCost, repairCost } from '../shared/world.js';
import { CLASSES, TIER_REQ, talentPoints, spentPoints, canLearn } from '../shared/classes.js';
import { xpForLevel, computeStats } from '../shared/stats.js';
import { SHRINES } from '../shared/dungeon.js';
import { AFFIXES } from '../shared/enemies.js';
import { placeLabel, escapeHtml, EMOTES } from './entities.js';
import { STYLE_RANKS, ROLL_CD } from './player.js';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyName } from './input.js';
import { QUALITY, saveSettings } from './settings.js';

const $ = (id) => document.getElementById(id);
export const COLORS = ['#e8a33d', '#e0453a', '#3a8ee0', '#4ac46a', '#b05ae0', '#e05aa8', '#3ad0c8', '#f2f2f2'];
const ICON = { sword: '🗡️', axe: '🪓', hammer: '🔨', dagger: '🔪', staff: '🪄', helm: '⛑️', chest: '🛡️', boots: '🥾' };
const SLOT_NAMES = { weapon: 'Weapon', helm: 'Helm', chest: 'Chest', boots: 'Boots' };
export const itemIcon = (it) => ICON[it.type] || ICON[it.slot] || '❔';
const BAG = 24, STASH = 48;
const LANE_NAMES = ['East', 'South', 'West'];
const EMOTE_LIST = Object.keys(EMOTES);

class UI {
  init(settings) {
    this.settings = settings;
    this.chatLog = $('chatLog'); this.chatInput = $('chatInput');
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const t = this.chatInput.value.trim(); if (t) G.net.send({ t: 'chat', text: t }); this.closeChat(); e.preventDefault(); }
      if (e.key === 'Escape') this.closeChat();
      e.stopPropagation();
    });
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => this.closePanel(b.dataset.close)));
    $('rerollBtn').onclick = () => G.net.send({ t: 'reroll' });
    $('gearBtn').onclick = () => this.togglePanel('settings');
    this.mm = $('minimap').getContext('2d');
    this.tooltip = $('tooltip');
    this.marks = []; this.shopStock = []; this.selectedBuild = 'barricade';
    this.offer = { items: [], gold: 0 };
    addEventListener('mousemove', (e) => { if (!this.tooltip.classList.contains('hidden')) this.placeTooltip(e.clientX, e.clientY); });
    this.buildSkillBar(null);
    this.buildSettings();
    this.buildEmoteWheel();
  }

  // ---------- lobby ----------
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
    el.innerHTML = `<kbd>${keyName(G.input.bindings.interact)}</kbd>${escapeHtml(text)}`; el.classList.remove('hidden');
  }
  hurtFlash() {
    const v = $('vignette'); v.style.boxShadow = 'inset 0 0 180px rgba(255,0,0,0.65)';
    clearTimeout(this._hf); this._hf = setTimeout(() => (v.style.boxShadow = 'inset 0 0 160px rgba(255,0,0,0)'), 120);
  }
  showDeath(on) { $('death').classList.toggle('hidden', !on); }
  perfect(text = 'PERFECT DODGE') {
    const el = $('perfect'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  styleUp(rank) { const el = $('styleRank'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  flashSkill(i, kind) { const el = $('sk' + (i + 1)); if (!el) return; el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny'); }

  // ---------- skill bar ----------
  buildSkillBar(cls) {
    const C = cls ? CLASSES[cls] : null;
    const b = G.input?.bindings || DEFAULT_BINDINGS;
    const skill = (id, ico, key, extra = '') => `<div class="skill" id="${id}"><div class="ico">${ico}</div><div class="key">${key}</div>${extra}<div class="cd"></div><div class="cdt"></div></div>`;
    let html = skill('skLMB', cls === 'hexcaller' ? '🔥' : '⚔️', 'LMB');
    if (C) C.skills.forEach((s, i) => { html += skill('sk' + (i + 1), s.icon, keyName(b['skill' + (i + 1)]), s.cost ? `<div class="cost">${s.cost}</div>` : ''); });
    html += skill('skDodge', '🌀', keyName(b.dodge)) + skill('skPot', '🧪', keyName(b.potion), '<div class="cnt" id="potCount">3</div>');
    $('skills').innerHTML = html;
    if (C) C.skills.forEach((s, i) => { const el = $('sk' + (i + 1)); el.onmouseenter = (e) => this.showText(`<div class="tn" style="color:${C.color}">${s.name}</div><div class="tm">${s.cost ? `${s.cost} ${C.resource.name} · ` : ''}${s.cd ? `${s.cd}s cooldown` : s.hold ? 'Hold' : ''}</div><div>${s.desc}</div>`, C.color, e); el.onmouseleave = () => this.hideTip(); });
    $('resFill').style.background = C ? C.resource.color : '#4a8cff';
  }

  // ---------- HUD ----------
  updateHUD() {
    const p = G.player, pr = G.prof;
    if (!p || !pr) return;
    const S = p.stats, c = pr.char, C = CLASSES[p.cls];
    $('hpFill').style.width = (Math.max(0, p.hp) / S.maxHp) * 100 + '%';
    $('hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${S.maxHp}`;
    $('resFill').style.width = (p.resource / S.resMax) * 100 + '%';
    $('resText').textContent = `${Math.floor(p.resource)} ${C.resource.name}`;
    $('xpFill').style.width = (c.xp / xpForLevel(c.level)) * 100 + '%';
    $('lvlBadge').textContent = c.level;
    $('goldText').textContent = pr.gold.toLocaleString();
    $('potCount').textContent = c.potions;
    const cd = (id, v, max, label) => { const el = $(id); if (!el) return; el.querySelector('.cd').style.height = Math.max(0, Math.min(1, v / max)) * 100 + '%'; el.querySelector('.cdt').textContent = v > 0.05 && max > 1.5 ? Math.ceil(v) : ''; };
    C.skills.forEach((s, i) => {
      cd('sk' + (i + 1), p.kit.cds[i], p.kit.cdMax(i) || 1);
      $('sk' + (i + 1)).classList.toggle('nores', p.resource < s.cost);
      $('sk' + (i + 1)).classList.toggle('active', (s.hold && p.blocking) || (s.id === 'whirl' && p.kit.whirlT > 0));
    });
    cd('skDodge', p.rollCd, ROLL_CD); cd('skPot', Math.max(p.potCd, c.potions ? 0 : 1), 1);
    if (p.dead) $('deathSub').textContent = `Rising again in ${Math.ceil(p.deadT)}…`;
    const tp = talentPoints(c.level) - spentPoints(c.talents);
    $('talentPip').textContent = tp > 0 ? `${tp} talent point${tp > 1 ? 's' : ''} — press ${keyName(G.input.bindings.talents)}` : '';
    // buffs
    const buffs = Object.entries(pr.buffs || {}).map(([k, s]) => `<div class="buff" style="color:${SHRINES[k]?.color}">${SHRINES[k]?.name.replace('Shrine of ', '') || k} <b>${s}s</b></div>`).join('') + (p.slowT > 0 ? '<div class="buff" style="color:#7ad8ff">Slowed</div>' : '') + (p.burnT > 0 ? '<div class="buff" style="color:#ff6a1a">Burning</div>' : '');
    if (buffs !== this._buffs) { $('buffs').innerHTML = buffs; this._buffs = buffs; }
    // style meter
    const r = p.rank, R = STYLE_RANKS[r], next = STYLE_RANKS[r + 1];
    const st = $('style');
    st.classList.toggle('hidden', p.style < 2 && p.comboCount < 2);
    $('styleRank').textContent = R.r; $('styleRank').style.color = R.color; $('styleName').textContent = R.name; $('styleName').style.color = R.color;
    $('styleFill').style.width = (next ? (p.style - R.min) / (next.min - R.min) : 1) * 100 + '%'; $('styleFill').style.background = R.color;
    $('comboNum').textContent = p.comboCount > 1 ? `${p.comboCount} HIT COMBO` : '';
    // party
    const all = [{ name: pr.name, color: pr.color, hp: p.hp, maxHp: S.maxHp, level: c.level, zone: G.zoneKey, dead: p.dead, me: true, cls: p.cls }, ...G.party.values()];
    const html = all.map((m) => `<div class="pf ${m.dead ? 'dead' : ''}" style="--c:${m.color}"><div class="n">${CLASSES[m.cls]?.skills ? `<i class="ci">${{ warden: '🛡️', emberblade: '🔥', hexcaller: '🔮' }[m.cls]}</i>` : ''}${escapeHtml(m.name)}${m.me ? ' (you)' : ''}<span>Lv${m.level} · ${zoneName(m.zone)}</span></div><div class="t"><i style="width:${Math.max(0, (m.hp / m.maxHp) * 100)}%"></i></div></div>`).join('');
    if (html !== this._party) { $('party').innerHTML = html; this._party = html; }
    // boss bar
    let boss = null;
    for (const e of G.enemies.values()) if (e.boss && !e.dead) boss = e;
    const bb = $('bossBar');
    bb.style.top = G.zone?.type === 'town' && G.defense.phase !== 'day' ? '150px' : '';
    if (boss && boss.pos.distanceTo(p.pos) < 40) {
      bb.classList.remove('hidden');
      const ph = boss.flags & 16 ? ' · ENRAGED' : '';
      bb.querySelector('.bb-name').textContent = `${boss.def.name} · Lv ${boss.level}${ph}`;
      bb.querySelector('.bb-fill').style.width = (boss.hp / boss.maxHp) * 100 + '%';
      bb.classList.toggle('enraged', !!(boss.flags & 16));
    } else bb.classList.add('hidden');
    // defense
    const d = G.defense, dh = $('defenseHud');
    if (G.zone?.type === 'town' && d.phase !== 'day') {
      dh.classList.remove('hidden');
      let title = '', sub = '';
      if (d.phase === 'build') { title = 'NIGHTFALL'; sub = `The horde arrives in ${d.timer}s — press ${keyName(G.input.bindings.build)} to build defenses`; }
      else if (d.phase === 'wave') { title = `WAVE ${d.wave} / ${d.waves}`; sub = `${[...G.enemies.values()].filter((e) => !e.dead).length} enemies in the field`; }
      else if (d.phase === 'intermission') { title = `WAVE ${d.wave} REPELLED`; sub = `Next wave in ${d.timer}s — repair and upgrade!`; }
      else if (d.phase === 'dawn') { title = d.result === 'victory' ? 'DAWN BREAKS' : 'THE HEART DIMS'; sub = d.result === 'victory' ? 'Emberhold stands. The city rewards you.' : 'The Ember Heart was overwhelmed…'; }
      dh.querySelector('.dh-title').textContent = title; dh.querySelector('.dh-sub').textContent = sub;
      dh.querySelector('.dh-fill').style.width = (Math.max(0, d.coreHp) / d.coreMax) * 100 + '%';
    } else dh.classList.add('hidden');
    const lanes = G.laneThreat || [];
    const warn = lanes.map((n, i) => (n ? `<span>⚠ ${LANE_NAMES[i]} gate — ${n}</span>` : '')).join('');
    if (warn !== this._lw) { $('laneWarn').innerHTML = warn; this._lw = warn; }
    // reticle
    const ret = $('reticle');
    if (G.lock && !G.lock.dead) { ret.style.display = ''; placeLabel(ret, new THREE.Vector3(G.lock.pos.x, G.lock.pos.y + G.lock.height * 0.55, G.lock.pos.z), G.camera, 60); } else ret.style.display = 'none';
    $('clickToPlay').classList.toggle('hidden', G.input.locked || G.uiOpen || this.chatting || G.cinematic || G.input.pad.connected);
    this.updateBuildBar();
  }

  // ---------- landmarks ----------
  setMarks(zone) {
    this.marks.forEach((m) => m.el.remove());
    this.marks = (zone.interactables || []).filter((i) => i.mark).map((i) => {
      const el = document.createElement('div'); el.className = 'mark'; el.textContent = i.mark;
      $('labels').appendChild(el);
      return { el, pos: new THREE.Vector3(i.x, zone.groundHeight(i.x, i.z) + (zone.type === 'dungeon' ? 5 : i.mark === 'TRAINER' || i.mark === 'STASH' ? 3.6 : 10.5), i.z) };
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
    for (const ic of zone.mapIcons || []) { dot(ic.x, ic.z, ic.icon === 'lever' || ic.icon === 'shrine' ? 4 : 5, ic.color); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (zone.type === 'town') for (const ch of zone.chests) if (!ch.open) dot(ch.x, ch.z, 3.5, '#ffd34d');
    for (const s of G.structures.values()) { ctx.fillStyle = '#5ab0ff'; ctx.fillRect((s.s.x - px) * sc - 2, (s.s.z - pz) * sc - 2, 4, 4); }
    for (const l of G.loots.values()) dot(l.g.position.x, l.g.position.z, 2.5, RARITIES[l.item.rarity].color);
    for (const e of G.enemies.values()) if (!e.dead) dot(e.pos.x, e.pos.z, e.boss ? 5 : e.affix ? 3.6 : 2.6, e.type === 'goblin' ? '#ffd34d' : e.affix ? AFFIXES[e.affix].color : e.boss ? '#ff2a1a' : '#ff5a4a');
    for (const r of G.remotes.values()) if (r.p.zone === G.zoneKey) dot(r.pos.x, r.pos.z, 4, r.color);
    ctx.save(); ctx.rotate(-player.ry + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // lane threat wedges at the map edge
    if (zone.type === 'town' && G.laneThreat) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 150);
      G.laneThreat.forEach((n, i) => {
        if (!n) return;
        const a = TOWN.lanes[i];
        const wx = Math.cos(a) * 60 - px, wz = Math.sin(a) * 60 - pz, ang = Math.atan2(wz, wx);
        ctx.strokeStyle = `rgba(255,60,40,${0.5 + pulse * 0.5})`; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(0, 0, S / 2 - 5, ang - 0.32, ang + 0.32); ctx.stroke();
      });
    }
    ctx.restore();
    ctx.fillStyle = '#ffd98a'; ctx.font = '800 12px Cinzel, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', S / 2 + Math.sin(yaw) * (S / 2 - 12), S / 2 - Math.cos(yaw) * (S / 2 - 12));
  }

  // ---------- panels ----------
  get anyPanel() { return ['inventory', 'shop', 'help', 'talents', 'stash', 'trade', 'settings'].some((id) => !$(id).classList.contains('hidden')); }
  togglePanel(id) { if ($(id).classList.contains('hidden')) this.openPanel(id); else this.closePanel(id); }
  openPanel(id) {
    $(id).classList.remove('hidden');
    G.uiOpen = true; G.input.unlock();
    if (id === 'inventory') this.renderInventory();
    if (id === 'shop') { G.net.send({ t: 'shopOpen' }); $('inventory').classList.remove('hidden'); this.renderInventory(); this.sideBySide('shop', true); }
    if (id === 'stash') { $('inventory').classList.add('hidden'); this.renderStash(); }
    if (id === 'talents') this.renderTalents();
    if (id === 'settings') this.renderSettings();
  }
  closePanel(id) {
    $(id).classList.add('hidden');
    if (id === 'shop' || (id === 'inventory' && !$('shop').classList.contains('hidden'))) { $('shop').classList.add('hidden'); $('inventory').classList.add('hidden'); this.sideBySide('shop', false); }
    if (id === 'trade') G.net.send({ t: 'tradeCancel' });
    this.hideTip();
    G.uiOpen = this.anyPanel;
  }
  closeAll() { ['inventory', 'shop', 'help', 'talents', 'stash', 'settings'].forEach((id) => this.closePanel(id)); if (!$('trade').classList.contains('hidden')) this.closePanel('trade'); }
  sideBySide(id, on) {
    const inv = $('inventory'), other = $(id);
    if (on && innerWidth > 1400) { other.style.left = 'calc(50% - 400px)'; inv.style.left = 'calc(50% + 330px)'; }
    else { other.style.left = ''; inv.style.left = ''; if (on) inv.classList.add('hidden'); }
  }
  shopOpen() { return !$('shop').classList.contains('hidden'); }

  setProfile(prof) {
    if (!$('inventory').classList.contains('hidden')) this.renderInventory();
    if (!$('talents').classList.contains('hidden')) this.renderTalents();
    if (!$('stash').classList.contains('hidden')) this.renderStash();
    if (this.shopOpen()) this.renderShop();
    if (this.trade) this.renderTradeBag();
  }

  bagCells(container, items, size, onClick, onRight, cmp = true) {
    container.innerHTML = '';
    const eq = G.prof.char.equipped;
    for (let i = 0; i < size; i++) {
      const it = items[i];
      const c = document.createElement('div'); c.className = 'bcell' + (it ? ' filled' : '');
      if (it) {
        c.style.color = RARITIES[it.rarity].color; c.textContent = itemIcon(it);
        const cur = eq[it.slot];
        const usable = it.slot !== 'weapon' || CLASSES[G.prof.cls].weapons.includes(it.type);
        if (!usable) c.classList.add('unusable');
        else if (cmp && (!cur || it.power > cur.power)) { const u = document.createElement('span'); u.className = 'up'; u.textContent = '▲'; c.appendChild(u); }
        this.bindTip(c, it, cur);
        c.onclick = () => onClick(i, it);
        c.oncontextmenu = (e) => { e.preventDefault(); onRight?.(i, it); };
      }
      container.appendChild(c);
    }
  }

  renderInventory() {
    const pr = G.prof; if (!pr) return;
    const ch = pr.char;
    const eq = $('equipSlots'); eq.innerHTML = '';
    for (const slot of ['weapon', 'helm', 'chest', 'boots']) {
      const it = ch.equipped[slot];
      const d = document.createElement('div'); d.className = 'eslot';
      if (it) { d.style.borderColor = RARITIES[it.rarity].color; d.style.borderStyle = 'solid'; d.innerHTML = `<div class="lab">${SLOT_NAMES[slot]}</div><div class="ename" style="color:${RARITIES[it.rarity].color}">${itemIcon(it)} ${escapeHtml(it.name)}</div>`; this.bindTip(d, it, null); d.onclick = () => G.net.send({ t: 'unequip', slot }); }
      else d.innerHTML = `<div class="lab">${SLOT_NAMES[slot]}</div><div class="ename muted">— empty —</div>`;
      eq.appendChild(d);
    }
    const st = computeStats(ch, pr.cls, pr.buffs || {});
    const C = CLASSES[pr.cls];
    $('statsBox').innerHTML = `<div><span>Class</span><b style="color:${C.color}">${C.name}</b></div>` + [
      ['Damage', Math.round(st.dmg)], ['Attack speed', st.atkSpeed.toFixed(2)], ['Health', st.maxHp], ['Armor', `${st.armor} (−${Math.round((1 - 100 / (100 + st.armor)) * 100)}%)`],
      ['Crit', `${(st.crit * 100).toFixed(1)}% ×${st.critDmg.toFixed(1)}`], ['Cooldowns', '−' + Math.round(st.cdr * 100) + '%'], ['Move speed', Math.round(st.moveSpeed * 100) + '%'], ['Gold find', '+' + Math.round(st.goldFind * 100) + '%'], ['Lifesteal', (st.leech * 100).toFixed(1) + '%'],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.bagCells($('bag'), ch.bag, BAG, (i, it) => { if (this._tradeMode) return this.toggleOffer(it); G.net.send({ t: 'equip', i }); G.audio.click(); }, (i) => (this.shopOpen() ? G.net.send({ t: 'sell', i }) : this.confirmDiscard(i)));
    $('invHint').textContent = this.shopOpen() ? 'Click to equip · Right-click to SELL' : 'Click to equip · Right-click to discard · Sell at the Dark World merchant';
  }
  confirmDiscard(i) {
    const it = G.prof.char.bag[i]; if (!it) return;
    if (this._discard === it.id) { G.net.send({ t: 'discard', i }); this._discard = null; return; }
    this._discard = it.id; this.toast(`Right-click again to discard ${escapeHtml(it.name)}`, '#ff9a7a');
  }

  setShop(stock) { this.shopStock = stock; if (this.shopOpen()) this.renderShop(); }
  renderShop() {
    const pr = G.prof, el = $('shopItems'); el.innerHTML = '';
    const special = [
      { kind: 'potion', name: 'Ember Draught', desc: 'Restores 50% health', icon: '🧪', cost: 25, color: '#ff6a5a' },
      { kind: 'cache', name: 'Mystery Cache', desc: `Rare or better (Lv ${G.roomLevel})`, icon: '🎁', cost: 90 * G.roomLevel, color: '#c77dff' },
    ];
    for (const sp of special) {
      const d = document.createElement('div'); d.className = 'sitem' + (pr.gold < sp.cost ? ' poor' : ''); d.style.color = sp.color;
      d.innerHTML = `<div class="si">${sp.icon}</div><div><div class="sn">${sp.name}</div><div class="muted small">${sp.desc}</div><div class="sp">◉ ${sp.cost}</div></div>`;
      d.onclick = () => G.net.send({ t: 'buySpecial', kind: sp.kind });
      el.appendChild(d);
    }
    this.shopStock.forEach((it, i) => {
      const d = document.createElement('div'); d.className = 'sitem' + (pr.gold < it.cost ? ' poor' : ''); d.style.color = RARITIES[it.rarity].color;
      d.innerHTML = `<div class="si">${itemIcon(it)}</div><div><div class="sn">${escapeHtml(it.name)}</div><div class="muted small">${RARITIES[it.rarity].name} · Lv ${it.level} · Power ${it.power}</div><div class="sp">◉ ${it.cost}</div></div>`;
      this.bindTip(d, it, pr.char.equipped[it.slot]);
      d.onclick = () => G.net.send({ t: 'buy', i });
      el.appendChild(d);
    });
  }

  renderStash() {
    const pr = G.prof;
    $('stashGold').textContent = `◉ ${pr.gold.toLocaleString()} (shared by all your heroes)`;
    this.bagCells($('stashGrid'), pr.stash, STASH, (i) => G.net.send({ t: 'stash', op: 'take', i }), null, false);
    this.bagCells($('stashBag'), pr.char.bag, BAG, (i) => G.net.send({ t: 'stash', op: 'put', i }), null, false);
  }

  // ---------- talents ----------
  renderTalents(atTrainer) {
    if (atTrainer !== undefined) this._atTrainer = atTrainer;
    const pr = G.prof, ch = pr.char, C = CLASSES[pr.cls];
    const pts = talentPoints(ch.level), spent = spentPoints(ch.talents);
    $('talentHead').innerHTML = `<b style="color:${C.color}">${C.name}</b> · Level ${ch.level} · <span class="tp">${pts - spent}</span> point${pts - spent === 1 ? '' : 's'} available`;
    const tree = $('talentTree'); tree.innerHTML = '';
    for (let tier = 0; tier < 4; tier++) {
      const row = document.createElement('div'); row.className = 'trow' + (spent >= TIER_REQ[tier] ? '' : ' locked');
      row.innerHTML = `<div class="treq">${tier ? `${TIER_REQ[tier]} pts` : 'Tier 1'}</div>`;
      for (const t of C.talents.filter((x) => x.tier === tier)) {
        const r = ch.talents[t.id] || 0;
        const can = canLearn(pr.cls, ch.talents, t.id, ch.level);
        const n = document.createElement('div'); n.className = 'tnode' + (r ? ' has' : '') + (can ? ' can' : '') + (r >= t.max ? ' max' : '');
        n.style.setProperty('--c', C.color);
        n.innerHTML = `<div class="tico">${t.icon}</div><div class="tname">${t.name}</div><div class="trank">${r}/${t.max}</div>`;
        n.onclick = () => { if (can) { G.net.send({ t: 'talent', id: t.id }); G.audio.pop(); } };
        n.onmouseenter = (e) => this.showText(`<div class="tn" style="color:${C.color}">${t.name}</div><div class="tm">Rank ${r}/${t.max}</div><div>${t.desc}</div>${can ? '<div class="pos">Click to learn</div>' : ''}`, C.color, e);
        n.onmouseleave = () => this.hideTip();
        row.appendChild(n);
      }
      tree.appendChild(row);
    }
    $('talentReset').classList.toggle('hidden', !this._atTrainer);
    $('talentReset').textContent = `Reset talents (${25 * ch.level}g)`;
    $('talentReset').onclick = () => G.net.send({ t: 'talentReset' });
  }

  // ---------- trading ----------
  tradeInvite(from, name) {
    this.dialog(`<b>${escapeHtml(name)}</b> wants to trade with you.`, [['Accept', () => G.net.send({ t: 'tradeResp', yes: true })], ['Decline', () => G.net.send({ t: 'tradeResp', yes: false })]], 20);
  }
  tradeState(m) {
    this.trade = m;
    if ($('trade').classList.contains('hidden')) { this.offer = { items: m.mine.items.map((x) => x.id), gold: m.mine.gold }; $('trade').classList.remove('hidden'); G.uiOpen = true; G.input.unlock(); this._tradeMode = true; }
    this.renderTradeBag();
    $('tradeWith').textContent = `Trading with ${m.withName}`;
    const list = (items) => items.map((it) => `<div class="titem" style="color:${RARITIES[it.rarity].color}">${itemIcon(it)} ${escapeHtml(it.name)}</div>`).join('') || '<div class="muted small">Nothing offered</div>';
    $('tradeMine').innerHTML = list(m.mine.items) + `<div class="tgold">◉ ${m.mine.gold}</div>`;
    $('tradeTheirs').innerHTML = list(m.theirs.items) + `<div class="tgold">◉ ${m.theirs.gold}</div>`;
    $('tradeStatus').innerHTML = `${m.accMine ? '✅ You accepted' : '⏳ You have not accepted'} · ${m.theirs ? (m.accTheirs ? '✅ They accepted' : '⏳ Waiting for them') : ''}`;
    $('tradeAccept').onclick = () => G.net.send({ t: 'tradeAccept' });
    $('tradeCancel').onclick = () => this.closePanel('trade');
    $('tradeGold').onchange = () => { this.offer.gold = Math.max(0, $('tradeGold').value | 0); this.sendOffer(); };
  }
  renderTradeBag() {
    if (!this.trade) return;
    this.bagCells($('tradeBag'), G.prof.char.bag, BAG, (i, it) => this.toggleOffer(it), null, false);
    [...$('tradeBag').children].forEach((c, i) => { const it = G.prof.char.bag[i]; c.classList.toggle('offered', !!it && this.offer.items.includes(it.id)); });
  }
  toggleOffer(it) {
    const i = this.offer.items.indexOf(it.id);
    if (i >= 0) this.offer.items.splice(i, 1); else this.offer.items.push(it.id);
    this.sendOffer();
  }
  sendOffer() { G.net.send({ t: 'tradeOffer', items: this.offer.items, gold: this.offer.gold }); }
  tradeClosed(text) {
    this._tradeMode = false; this.trade = null;
    $('trade').classList.add('hidden');
    G.uiOpen = this.anyPanel;
    if (text) this.toast(escapeHtml(text), '#ffd98a');
  }

  // ---------- dialogs ----------
  dialog(html, buttons, timeout) {
    const el = $('dialog');
    el.innerHTML = `<div class="dmsg">${html}</div><div class="dbtns">${buttons.map(([l], i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${l} <small>[${i === 0 ? 'Y' : 'N'}]</small></button>`).join('')}</div>${timeout ? '<div class="dtimer"><i></i></div>' : ''}`;
    el.classList.remove('hidden');
    const close = () => { el.classList.add('hidden'); this._dialog = null; clearTimeout(this._dt); };
    this._dialog = { buttons, close };
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => { close(); buttons[+b.dataset.i][1](); }));
    if (timeout) { const bar = el.querySelector('.dtimer i'); bar.style.transition = `width ${timeout}s linear`; requestAnimationFrame(() => (bar.style.width = '0%')); this._dt = setTimeout(close, timeout * 1000); }
  }
  dialogKey(code) {
    if (!this._dialog) return false;
    const b = this._dialog.buttons;
    if (code === 'KeyY') { this._dialog.close(); b[0][1](); return true; }
    if (code === 'KeyN' && b[1]) { this._dialog.close(); b[1][1](); return true; }
    return false;
  }
  closeDialog() { this._dialog?.close(); }
  readyCheck(m) {
    if (m.byId === G.myId) { this.toast('Ready check sent to your party…', '#ffd98a'); return; }
    this.dialog(`<b>${escapeHtml(m.by)}</b> wants to enter the <b>Dungeon (Depth ${G.roomLevel})</b>.<br>Are you ready?`, [['Ready', () => G.net.send({ t: 'readyResp', yes: true })], ['Not yet', () => G.net.send({ t: 'readyResp', yes: false })]], m.timeout);
  }

  // ---------- emote wheel ----------
  buildEmoteWheel() {
    const el = $('emoteWheel');
    el.innerHTML = EMOTE_LIST.map((k, i) => { const a = (i / EMOTE_LIST.length) * Math.PI * 2 - Math.PI / 2; return `<div class="eslice" data-k="${k}" style="left:${50 + Math.cos(a) * 36}%;top:${50 + Math.sin(a) * 36}%"><div>${EMOTES[k]}</div><small>${k}</small></div>`; }).join('') + '<div class="ecenter">Emote</div>';
    this.wheelVec = { x: 0, y: 0 };
  }
  openWheel() { $('emoteWheel').classList.remove('hidden'); this.wheelVec = { x: 0, y: 0 }; this.wheelSel = null; G.emoteWheel = true; }
  updateWheel(dx, dy, padX, padY) {
    const v = this.wheelVec;
    v.x = Math.max(-120, Math.min(120, v.x + dx)); v.y = Math.max(-120, Math.min(120, v.y + dy));
    if (Math.hypot(padX, padY) > 0.5) { v.x = padX * 100; v.y = -padY * 100; }
    let sel = null;
    if (Math.hypot(v.x, v.y) > 30) { const a = Math.atan2(v.y, v.x) + Math.PI / 2; const i = Math.round((a / (Math.PI * 2)) * EMOTE_LIST.length + EMOTE_LIST.length) % EMOTE_LIST.length; sel = EMOTE_LIST[i]; }
    this.wheelSel = sel;
    document.querySelectorAll('.eslice').forEach((s) => s.classList.toggle('on', s.dataset.k === sel));
  }
  closeWheel() { $('emoteWheel').classList.add('hidden'); G.emoteWheel = false; return this.wheelSel; }

  // ---------- settings ----------
  buildSettings() {
    const s = this.settings;
    $('setQuality').innerHTML = Object.entries(QUALITY).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('');
    const bind = (id, key, fmt = (v) => v) => { const el = $(id); el.oninput = el.onchange = () => { s[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; saveSettings(s); G.actions.applySettings(); if ($(id + 'V')) $(id + 'V').textContent = fmt(s[key]); }; };
    bind('setQuality', 'quality'); bind('setMaster', 'master', (v) => Math.round(v * 100) + '%'); bind('setMusic', 'music', (v) => Math.round(v * 100) + '%'); bind('setSfx', 'sfx', (v) => Math.round(v * 100) + '%');
    bind('setSens', 'sens', (v) => v.toFixed(2) + '×'); bind('setInvert', 'invertY'); bind('setIntro', 'intro');
    $('replayIntro').onclick = () => { this.closePanel('settings'); G.actions.playIntro(); };
    $('resetBinds').onclick = () => { s.bindings = { ...DEFAULT_BINDINGS }; saveSettings(s); G.actions.applySettings(); this.renderSettings(); };
    document.querySelectorAll('.stab').forEach((b) => (b.onclick = () => { document.querySelectorAll('.stab').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.spage').forEach((p) => p.classList.toggle('hidden', p.id !== b.dataset.p)); }));
  }
  renderSettings() {
    const s = this.settings;
    $('setQuality').value = s.quality; $('setMaster').value = s.master; $('setMusic').value = s.music; $('setSfx').value = s.sfx; $('setSens').value = s.sens; $('setInvert').checked = s.invertY; $('setIntro').checked = s.intro;
    $('setMasterV').textContent = Math.round(s.master * 100) + '%'; $('setMusicV').textContent = Math.round(s.music * 100) + '%'; $('setSfxV').textContent = Math.round(s.sfx * 100) + '%'; $('setSensV').textContent = (+s.sens).toFixed(2) + '×';
    const list = $('bindList'); list.innerHTML = '';
    for (const [act, label] of Object.entries(ACTION_LABELS)) {
      const row = document.createElement('div'); row.className = 'brow';
      row.innerHTML = `<span>${label}</span><button class="btn kbtn">${keyName(s.bindings[act])}</button>`;
      const btn = row.querySelector('button');
      btn.onclick = () => {
        btn.textContent = 'Press a key…'; btn.classList.add('listen');
        G.input.capture = (code) => {
          if (code !== 'Escape') { for (const k in s.bindings) if (s.bindings[k] === code && k !== act) s.bindings[k] = s.bindings[act]; s.bindings[act] = code; }
          saveSettings(s); G.actions.applySettings(); this.renderSettings();
        };
      };
      list.appendChild(row);
    }
    $('padInfo').textContent = G.input.pad.connected ? '🎮 Gamepad connected — Left stick move · Right stick camera · A jump · B dodge · X attack · Y interact · LB/RB/LT/RT skills 1–4 · R3 lock-on · D-pad ↑ potion · Start settings' : 'Connect a gamepad and press any button to use it.';
  }

  // ---------- tooltip ----------
  bindTip(el, it, cmp) {
    el.onmouseenter = (e) => this.showTip(it, cmp, e.clientX, e.clientY);
    el.onmouseleave = () => this.hideTip();
  }
  showText(html, color, e) { const t = this.tooltip; t.style.color = color; t.innerHTML = html; t.classList.remove('hidden'); this.placeTooltip(e.clientX, e.clientY); }
  showTip(it, cmp, x, y) {
    const R = RARITIES[it.rarity], t = this.tooltip;
    t.style.color = R.color;
    const main = it.slot === 'weapon' ? `${it.dmg} Damage · ${it.speed.toFixed(2)} speed<br><span class="muted">${WEAPONS[it.type].name}${WEAPONS[it.type].cleave ? ' · wide cleave' : ''}${WEAPONS[it.type].ranged ? ' · ranged' : ''}</span>` : `${it.armor} Armor · +${it.hp} Health`;
    let html = `<div class="tn">${escapeHtml(it.name)}</div><div class="tr">${R.name} ${SLOT_NAMES[it.slot]} · Item Level ${it.level}</div><div class="tm">${main}</div>`;
    html += affixLines(it).map((l) => `<div class="ta">${l}</div>`).join('');
    if (it.slot === 'weapon' && G.prof && !CLASSES[G.prof.cls].weapons.includes(it.type)) html += `<div class="cmp neg">Your ${CLASSES[G.prof.cls].name} cannot wield this</div>`;
    else if (cmp && cmp !== it) { const diff = it.power - cmp.power; html += `<div class="cmp">vs equipped: <span class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '▲ +' : '▼ '}${diff} power</span></div>`; }
    else if (cmp === null && G.prof && !G.prof.char.equipped[it.slot]) html += `<div class="cmp pos">Empty slot — equip it!</div>`;
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
    $('buildInfo').classList.toggle('hidden', !show || !G.buildTarget);
    if (!show) return;
    if (G.buildTarget) {
      const s = G.buildTarget.s, S = STRUCTURES[s.kind];
      const up = s.tier < 3 ? `<kbd>${keyName(G.input.bindings.upgrade)}</kbd> Upgrade to tier ${s.tier + 1} (◉ ${upgradeCost(s.kind, s.tier)})` : 'Max tier';
      const rc = repairCost(s);
      $('buildInfo').innerHTML = `<b>${S.icon} ${S.name}</b> · Tier ${s.tier} · ${Math.round(s.hp)}/${Math.round(s.maxHp)} HP<br>${up} · ${rc > 0 ? `<kbd>${keyName(G.input.bindings.potion)}</kbd> Repair (◉ ${rc})` : 'Fully repaired'}`;
    }
    const gold = G.prof?.gold || 0;
    const key = Object.keys(STRUCTURES).map((k) => k + (this.selectedBuild === k) + (gold >= STRUCTURES[k].cost)).join();
    if (key === this._bb) return;
    this._bb = key;
    el.innerHTML = Object.entries(STRUCTURES).map(([k, S]) => `<div class="bslot ${this.selectedBuild === k ? 'on' : ''} ${gold < S.cost ? 'poor' : ''}" data-k="${k}"><div class="bi">${S.icon}</div><div class="bn">[${S.key}] ${S.name}</div><div class="bc">◉ ${S.cost}</div><div class="muted small">${S.desc}</div></div>`).join('');
    el.querySelectorAll('.bslot').forEach((b) => (b.onclick = () => { this.selectedBuild = b.dataset.k; this._bb = null; }));
  }
}

export function zoneName(z) {
  if (!z) return '';
  if (z.startsWith('dungeon')) return 'Dungeon';
  return z === 'dark' ? 'Dark World' : 'Emberhold';
}

export const ui = new UI();
