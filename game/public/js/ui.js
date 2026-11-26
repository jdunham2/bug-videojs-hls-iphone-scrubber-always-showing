// DOM user interface: HUD, minimap, inventory/shop/stash/trade, talents, emote wheel, settings, dialogs.
import * as THREE from 'three';
import { G } from './state.js';
import { RARITIES, affixLines, WEAPONS, LEGENDARIES, SETS, SALVAGE, GEMS, gemName, parseGem } from '../shared/items.js';
import { STRUCTURES, TOWN, upgradeCost, repairCost, MUTATORS, RESEARCH, researchCost } from '../shared/world.js';
import { CLASSES, TIER_REQ, talentPoints, spentPoints, canLearn } from '../shared/classes.js';
import { xpForLevel, computeStats } from '../shared/stats.js';
import { SHRINES } from '../shared/dungeon.js';
import { AFFIXES } from '../shared/enemies.js';
import { RIFT_MODS, RIFT_TIME, PARAGON, LEVEL_CAP, paragonXp } from '../shared/rifts.js';
import { QUESTS, EVENTS, REGIONS, ACT1_END, ACT2_END, COMPANIONS } from '../shared/regions.js';
import { renderSocial } from './socialui.js';
const FINISH_ICON = { warden: '🛡', emberblade: '🔥', hexcaller: '✴', ranger: '⚡' }, FINISH_NAME = { warden: 'Shield Slam', emberblade: 'Ember Execution', hexcaller: 'Arcane Overload', ranger: 'Storm Arrow' };
import { renderForge, renderTrial } from './endgameui.js';
import { compareItem, DIFFICULTY } from '../shared/endgame.js';
import { placeLabel, escapeHtml, EMOTES } from './entities.js';
import { STYLE_RANKS, ROLL_CD } from './player.js';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyName } from './input.js';
import { QUALITY, saveSettings, getToken, setToken } from './settings.js';

const $ = (id) => document.getElementById(id);
export const COLORS = ['#e8a33d', '#e0453a', '#3a8ee0', '#4ac46a', '#b05ae0', '#e05aa8', '#3ad0c8', '#f2f2f2'];
const ICON = { bow: '🏹', sword: '🗡️', axe: '🪓', hammer: '🔨', dagger: '🔪', staff: '🪄', helm: '⛑️', chest: '🛡️', boots: '🥾' };
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
    $('wardrobeBtn').onclick = () => this.openPanel('wardrobe');
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
    if (G.net.offline) { $('roomInfo').innerHTML = `<b>SOLO</b><br><span class="muted">Depth <span id="depthTxt">${G.roomLevel}</span><br>Offline play · saved in this browser</span>`; return; }
    const url = `${location.origin}${location.pathname}?room=${code}`;
    $('roomInfo').innerHTML = `Party code <b>${code}</b><br><span class="muted">Depth <span id="depthTxt">${G.roomLevel}</span></span><br><button class="btn" id="copyInv">Copy invite link</button>`;
    $('copyInv').onclick = () => { navigator.clipboard?.writeText(url); this.toast('Invite link copied!', '#ffd98a'); };
    history.replaceState(null, '', `?room=${code}`);
  }
  setDepth(l) { const e = $('depthTxt'); if (e) e.innerHTML = `${l}${G.roomDiff ? ` · <span style="color:${DIFFICULTY[G.roomDiff].color}">${DIFFICULTY[G.roomDiff].name}</span>` : ''}`; }

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
  chat(from, text, color, fromTag) {
    if (fromTag && G.social?.muted?.includes(fromTag)) return; // muted players stay silent
    const d = document.createElement('div');
    d.innerHTML = from === '★' ? `<span style="color:#ffd98a">${escapeHtml(text)}</span>` : `<b class="cname" style="color:${color || '#fff'}">${escapeHtml(from)}:</b>${escapeHtml(text)}`;
    if (fromTag && fromTag !== G.social?.tag) d.querySelector('.cname').onclick = (e) => this.chatMenu(from, fromTag, e);
    this.chatLog.appendChild(d);
    while (this.chatLog.children.length > 40) this.chatLog.firstChild.remove();
  }
  // click a name in chat: whisper, mute or report
  chatMenu(name, tag, e) {
    let m = $('chatMenu'); if (!m) { m = document.createElement('div'); m.id = 'chatMenu'; document.body.appendChild(m); }
    m.innerHTML = `<b>${escapeHtml(name)}</b><button data-a="w">Whisper</button><button data-a="m">Mute</button><button data-a="r">Report…</button>`;
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY - 110 + 'px'; m.hidden = false;
    m.querySelector('[data-a=w]').onclick = () => { m.hidden = true; this.openChat(); this.chatInput.value = `/w ${name} `; };
    m.querySelector('[data-a=m]').onclick = () => { m.hidden = true; G.net.send({ t: 'chat', text: `/mute ${tag}` }); };
    m.querySelector('[data-a=r]').onclick = () => { m.hidden = true; this.openChat(); this.chatInput.value = `/report ${name} `; this.toast('Add a short reason and press Enter', '#c8b890'); };
    setTimeout(() => addEventListener('click', () => (m.hidden = true), { once: true }), 0);
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
    let html = skill('skLMB', cls === 'hexcaller' ? '🔥' : cls === 'ranger' ? '➶' : '⚔️', 'LMB');
    if (C) C.skills.forEach((s, i) => { html += skill('sk' + (i + 1), s.icon, keyName(b['skill' + (i + 1)]), s.cost ? `<div class="cost">${s.cost}</div>` : ''); });
    if (cls) html += skill('skFin', FINISH_ICON[cls], keyName(b.finisher || 'KeyF'), '<div class="pips" id="cpPips"><i></i><i></i><i></i><i></i><i></i></div>');
    html += skill('skDodge', '🌀', keyName(b.dodge)) + skill('skPot', '🧪', keyName(b.potion), '<div class="cnt" id="potCount">3</div>');
    $('skills').innerHTML = html;
    if (C) C.skills.forEach((s, i) => { const el = $('sk' + (i + 1)); el.onmouseenter = (e) => this.showText(`<div class="tn" style="color:${C.color}">${s.name}</div><div class="tm">${s.cost ? `${s.cost} ${C.resource.name} · ` : ''}${s.cd ? `${s.cd}s cooldown` : s.hold ? 'Hold' : ''}</div><div>${s.desc}</div>`, C.color, e); el.onmouseleave = () => this.hideTip(); });
    $('resFill').style.background = C ? C.resource.color : '#4a8cff';
    if (cls) $('skFin').onmouseenter = (e) => this.showText(`<div class="tn">${FINISH_NAME[cls]}</div><div class="tm">Combo finisher · spend 2-5 combo points</div><div class="ta">Basic attacks build combo points (crits build two, counters build two). Finishers hit harder the more points you spend.</div>`, '#ffd34d', e);
    if (cls) $('skFin').onmouseleave = () => this.hideTip();
  }

  // ---------- HUD ----------
  updateHUD() {
    const p = G.player, pr = G.prof;
    if (!p || !pr) return;
    const S = p.stats, c = pr.char, C = CLASSES[p.cls];
    $('hpFill').style.width = (Math.max(0, p.hp) / S.maxHp) * 100 + '%';
    { const pe = $('cpPips'); if (pe) { const n = p.cp || 0; if (pe._n !== n) { pe._n = n; [...pe.children].forEach((x, k) => x.classList.toggle('on', k < n)); $('skFin').classList.toggle('ready', n >= 2); } } }
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
      $('sk' + (i + 1)).classList.toggle('nores', p.resource < p.kit.cost(i));
      const ce = $('sk' + (i + 1)).querySelector('.cost'); if (ce) ce.textContent = p.kit.cost(i) || '';
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
    const html = all.map((m) => `<div class="pf ${m.dead ? 'dead' : ''}" style="--c:${m.color}"><div class="n">${CLASSES[m.cls]?.skills ? `<i class="ci">${{ warden: '🛡️', emberblade: '🔥', hexcaller: '🔮', ranger: '🏹' }[m.cls]}</i>` : ''}${escapeHtml(m.name)}${m.me ? ' (you)' : ''}<span>Lv${m.level} · ${zoneName(m.zone)}</span></div><div class="t"><i style="width:${Math.max(0, (m.hp / m.maxHp) * 100)}%"></i></div></div>`).join('');
    if (html !== this._party) { $('party').innerHTML = html; this._party = html; }
    // boss bar
    let boss = null;
    for (const e of G.enemies.values()) if (e.boss && !e.dead) boss = e;
    const bb = $('bossBar');
    bb.style.top = G.zone?.type === 'town' && G.defense.phase !== 'day' ? '150px' : G.rift ? '104px' : '';
    if (boss && boss.pos.distanceTo(p.pos) < 40) {
      bb.classList.remove('hidden');
      const ph = boss.flags & 16 ? ' · ENRAGED' : '';
      bb.querySelector('.bb-name').textContent = `${boss.def.name} · Lv ${boss.level}${ph}`;
      bb.querySelector('.bb-fill').style.width = (boss.hp / boss.maxHp) * 100 + '%';
      bb.classList.toggle('enraged', !!(boss.flags & 16));
    } else bb.classList.add('hidden');
    // quest tracker + world event
    const q = c.quest || { i: 0, n: 0 }, Q = QUESTS[q.i];
    const qt = Q ? `<div class="qt-t">${Q.title}</div><div class="qt-g">${Q.goal}${Q.need > 1 ? ` (${q.n}/${Q.need})` : ''}</div>` : '<div class="qt-t">Act I complete</div><div class="qt-g">Stormspire Peaks is open</div>';
    const ev = G.event ? `<div class="qt-ev">⚑ ${EVENTS[G.event.kind].name}<br><span>${EVENTS[G.event.kind].goal}${G.event.left != null ? ` — ${G.event.left} left` : ''}</span></div>` : '';
    if (qt + ev !== this._qt) { $('questTrack').innerHTML = qt + ev; this._qt = qt + ev; }
    // rift HUD
    const rh = $('riftHud');
    if (G.rift && G.zone?.type === 'dungeon') {
      rh.classList.remove('hidden');
      const el = G.rift.done ? G.rift.final ?? (G.rift.final = performance.now() / 1000 - G.rift.t0) : performance.now() / 1000 - G.rift.t0;
      const left = RIFT_TIME - el, mm = Math.floor(Math.abs(left) / 60), ss = String(Math.floor(Math.abs(left) % 60)).padStart(2, '0');
      rh.querySelector('.rh-title').textContent = `EMBER RIFT · LEVEL ${G.rift.k}`;
      rh.querySelector('.rh-time').textContent = (left < 0 ? '+' : '') + `${mm}:${ss}`;
      rh.querySelector('.rh-time').classList.toggle('late', left < 0);
      rh.querySelector('.rh-fill').style.width = G.rift.p * 100 + '%';
      rh.querySelector('.rh-sub').innerHTML = G.rift.done ? 'Rift complete — step through the portal' : G.rift.guardian ? 'Slay the Guardian!' : `${Math.round(G.rift.p * 100)}% · ` + G.rift.mods.map((k) => `<span style="color:${RIFT_MODS[k].color}">${RIFT_MODS[k].name}</span>`).join(' · ');
    } else rh.classList.add('hidden');
    // defense
    const d = G.defense, dh = $('defenseHud');
    if (G.zone?.type === 'town' && d.phase !== 'day') {
      dh.classList.remove('hidden');
      let title = '', sub = '';
      if (d.phase === 'build') { title = 'NIGHTFALL'; sub = `The horde arrives in ${d.timer}s — press ${keyName(G.input.bindings.build)} to build defenses`; }
      else if (d.phase === 'wave') { title = `WAVE ${d.wave} / ${d.waves}`; sub = `${[...G.enemies.values()].filter((e) => !e.dead).length} enemies in the field`; }
      else if (d.phase === 'intermission') { title = `WAVE ${d.wave} REPELLED`; sub = `Next wave in ${d.timer}s — repair and upgrade!`; }
      else if (d.phase === 'dawn') { title = d.result === 'victory' ? 'DAWN BREAKS' : 'THE HEART DIMS'; sub = d.result === 'victory' ? 'Emberhold stands. The city rewards you.' : 'The Ember Heart was overwhelmed…'; }
      if (d.mutator && MUTATORS[d.mutator]) sub += ` · ${MUTATORS[d.mutator].name}`;
      dh.querySelector('.dh-title').textContent = title; dh.querySelector('.dh-sub').textContent = sub;
      dh.querySelector('.dh-fill').style.width = (Math.max(0, d.coreHp) / d.coreMax) * 100 + '%';
    } else dh.classList.add('hidden');
    const lanes = G.laneThreat || [];
    const warn = lanes.map((n, i) => (n ? `<span>⚠ ${LANE_NAMES[i]} gate — ${n}</span>` : '')).join('');
    if (warn !== this._lw) { $('laneWarn').innerHTML = warn; this._lw = warn; }
    // reticle
    const ret = $('reticle');
    if (G.lock && !G.lock.dead) { ret.style.display = ''; placeLabel(ret, new THREE.Vector3(G.lock.pos.x, G.lock.pos.y + G.lock.height * 0.55, G.lock.pos.z), G.camera, 60); } else ret.style.display = 'none';
    $('clickToPlay').textContent = G.input.lockFailed ? 'Hold right mouse and drag to look around' : 'Click to look around';
    $('clickToPlay').classList.toggle('hidden', G.input.lockFailed ? G.input.buttons.has(2) || G.uiOpen : G.input.locked || G.uiOpen || this.chatting || G.cinematic || G.input.pad.connected);
    this.updateBuildBar();
  }

  // ---------- landmarks ----------
  setMarks(zone) {
    this.marks.forEach((m) => m.el.remove());
    this.marks = (zone.interactables || []).filter((i) => i.mark).map((i) => {
      const el = document.createElement('div'); el.className = 'mark'; el.textContent = i.mark;
      $('labels').appendChild(el);
      return { el, show: i.showMark, pos: new THREE.Vector3(i.x, zone.groundHeight(i.x, i.z) + (zone.type === 'dungeon' ? 5 : i.mark === 'TRAINER' || i.mark === 'STASH' || i.showMark ? 3.6 : 10.5), i.z) };
    });
  }
  updateMarks(camera) { for (const m of this.marks) { if (m.show && !m.show()) { m.el.style.display = 'none'; continue; } placeLabel(m.el, m.pos, camera, 90); } }

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
    for (const ic of zone.mapIcons || []) { if (ic.show && !ic.show()) continue; dot(ic.x, ic.z, ic.icon === 'lever' || ic.icon === 'shrine' ? 4 : 5, ic.color); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (zone.type === 'town') for (const ch of zone.chests) if (!ch.open) dot(ch.x, ch.z, 3.5, '#ffd34d');
    if (G.event) { const pulse = 4 + Math.sin(performance.now() / 120) * 2; dot(G.event.x, G.event.z, pulse + 2, '#ffd34d'); dot(G.event.x, G.event.z, 3, '#000'); }
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
  get anyPanel() { return ['inventory', 'shop', 'help', 'talents', 'stash', 'trade', 'settings', 'smith', 'riftPanel', 'board', 'research', 'waypoint', 'quests', 'wardrobe', 'social', 'forge'].some((id) => !$(id).classList.contains('hidden')); }
  togglePanel(id) { if ($(id).classList.contains('hidden')) this.openPanel(id); else this.closePanel(id); }
  openPanel(id) {
    $(id).classList.remove('hidden');
    G.uiOpen = true; G.input.unlock();
    if (id === 'inventory') this.renderInventory();
    if (id === 'social') { renderSocial(this); G.net.send({ t: 'social' }); }
    if (id === 'shop') { G.net.send({ t: 'shopOpen' }); $('inventory').classList.remove('hidden'); this.renderInventory(); this.sideBySide('shop', true); }
    if (id === 'stash') { $('inventory').classList.add('hidden'); this.renderStash(); }
    if (id === 'talents') this.renderTalents();
    if (id === 'settings') this.renderSettings();
    if (id === 'smith') { this.smithSel = null; this.renderSmith(); $('openForge').onclick = () => { this.closePanel('smith'); this.openPanel('forge'); }; }
    if (id === 'riftPanel') { this.renderRiftPanel(); renderTrial(this, null); G.net.send({ t: 'trialBoard' }); }
    if (id === 'forge') renderForge(this);
    if (id === 'research') this.renderResearch();
    if (id === 'waypoint') this.renderWaypoint();
    if (id === 'quests') this.renderQuests();
    if (id === 'wardrobe') this.renderWardrobe();
  }
  closePanel(id) {
    $(id).classList.add('hidden');
    if (id === 'shop' || (id === 'inventory' && !$('shop').classList.contains('hidden'))) { $('shop').classList.add('hidden'); $('inventory').classList.add('hidden'); this.sideBySide('shop', false); }
    if (id === 'trade') G.net.send({ t: 'tradeCancel' });
    this.hideTip();
    G.uiOpen = this.anyPanel;
  }
  closeAll() { ['inventory', 'shop', 'help', 'talents', 'stash', 'settings', 'smith', 'riftPanel', 'board', 'research', 'waypoint', 'quests', 'wardrobe', 'social', 'forge'].forEach((id) => this.closePanel(id)); if (!$('trade').classList.contains('hidden')) this.closePanel('trade'); }
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
    if (!$('smith').classList.contains('hidden')) this.renderSmith();
    if (!$('research').classList.contains('hidden')) this.renderResearch();
    if (!$('wardrobe').classList.contains('hidden')) this.renderWardrobe();
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
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') + (st.sets || []).map((s) => `<div><span style="color:#5eea8a">${SETS[s.id].name}</span><b style="color:#5eea8a">${s.n}/4</b></div>`).join('') + Object.keys(st.flags).filter((f) => LEGENDARIES[f]).map((f) => `<div><span style="color:#ff9a3c">✦ ${LEGENDARIES[f].name}</span><b></b></div>`).join('');
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

  npcDialog(who, text, then) {
    const el = $('npcDialog');
    if (!el.classList.contains('hidden')) { (this._dq ||= []).push([who, text, then]); return; }
    el.querySelector('.nd-name').textContent = who; el.querySelector('.nd-portrait').textContent = who[0];
    const body = el.querySelector('.nd-text'); body.textContent = '';
    el.classList.remove('hidden'); G.uiOpen = true; G.input.unlock();
    let i = 0; clearInterval(this._typer);
    this._typer = setInterval(() => { body.textContent = text.slice(0, ++i); if (i % 3 === 0) G.audio.click(); if (i >= text.length) clearInterval(this._typer); }, 18);
    el.querySelector('.nd-next').onclick = () => { if (i < text.length) { i = text.length; body.textContent = text; return; } el.classList.add('hidden'); clearInterval(this._typer); G.uiOpen = this.anyPanel; then?.(); const nx = this._dq?.shift(); if (nx) this.npcDialog(...nx); };
  }
  renderWaypoint() {
    const pr = G.prof, peaksOpen = pr.peaks || (pr.char.quest?.i || 0) >= ACT1_END;
    const citOpen = pr.citadel || (pr.char.quest?.i || 0) >= ACT2_END;
    const dests = [['town', 'Emberhold', 'The last city'], ['marsh', REGIONS.marsh.name, REGIONS.marsh.sub], ['peaks', REGIONS.peaks.name, peaksOpen ? REGIONS.peaks.sub : 'Sealed — complete Act I'], ['citadel', REGIONS.citadel.name, citOpen ? REGIONS.citadel.sub : 'Sealed — complete Act II']];
    $('wpList').innerHTML = dests.map(([k, n, s]) => `<button class="btn wpb" data-k="${k}" ${(k === 'peaks' && !peaksOpen) || (k === 'citadel' && !citOpen) || k === G.zoneKey ? 'disabled' : ''}><b>${n}</b><br><span class="small muted">${k === G.zoneKey ? 'You are here' : s}</span></button>`).join('');
    $('wpList').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.closePanel('waypoint'); G.actions.travel(b.dataset.k); }));
  }
  renderWardrobe() {
    const pr = G.prof, L = { dye: null, hideHelm: false, ap: -1, ...(pr.char.look || {}) };
    const dyes = [null, '#8a1c1c', '#c2501a', '#d8a635', '#2f6a2a', '#1a5a6a', '#2a3a8a', '#5a2a7a', '#1a1a1e', '#e8e4dc'];
    const send = (patch) => G.net.send({ t: 'look', look: { ...L, ...patch } });
    $('wardrobeBody').innerHTML = `<div class="sub-h">Dye</div><div class="dyes">${dyes.map((c) => `<button class="dye ${L.dye === c ? 'on' : ''}" data-c="${c || ''}" style="background:${c || 'linear-gradient(135deg,#888 45%,#c22 50%,#888 55%)'}" title="${c ? c : 'Banner colour'}"></button>`).join('')}</div>
      <div class="sub-h">Armour appearance</div><div class="dyes">${['As equipped', ...RARITIES.map((r) => r.name)].map((n, i) => `<button class="btn apb ${L.ap === i - 1 ? 'on' : ''}" data-ap="${i - 1}">${n}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="hideHelm" ${L.hideHelm ? 'checked' : ''}/> Hide helmet</label>
      <div class="sub-h">Saved looks</div><div class="dyes">${[0, 1, 2].map((i) => { const s = (pr.looks || [])[i]; return `<span class="lookslot">${s ? `<button class="btn" data-load="${i}">Wear look ${i + 1}</button>` : `<span class="muted small">Empty</span>`} <button class="btn" data-save="${i}">Save here</button></span>`; }).join('')}</div>`;
    const W = $('wardrobeBody');
    W.querySelectorAll('.dye').forEach((b) => (b.onclick = () => send({ dye: b.dataset.c || null })));
    W.querySelectorAll('.apb').forEach((b) => (b.onclick = () => send({ ap: +b.dataset.ap })));
    W.querySelector('#hideHelm').onchange = (e) => send({ hideHelm: e.target.checked });
    W.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => G.net.send({ t: 'saveLook', slot: +b.dataset.save })));
    W.querySelectorAll('[data-load]').forEach((b) => (b.onclick = () => G.net.send({ t: 'look', look: pr.looks[+b.dataset.load] })));
  }
  renderQuests() {
    const q = G.prof.char.quest || { i: 0, n: 0 };
    const comps = Object.entries(COMPANIONS).filter(([, C]) => q.i >= C.unlock);
    const picker = comps.length ? `<div class="qcomp">Companion: ${comps.map(([k, C]) => `<button class="btn small ${this._comp === k ? 'on' : ''}" data-comp="${k}" title="${C.role}">${C.name}</button>`).join('')}<button class="btn small ghost ${this._comp === 'none' ? 'on' : ''}" data-comp="none">None</button></div>` : '';
    const hdr = (i) => (i === 0 ? picker + '<div class="qact">ACT I · The Ashen Marsh</div>' : i === ACT1_END ? '<div class="qact">ACT II · The Storm Crown</div>' : i === ACT2_END ? '<div class="qact">ACT III · The Hollow Crown</div>' : '');
    $('questList').innerHTML = QUESTS.map((Q, i) => hdr(i) + `<div class="qrow ${i < q.i ? 'done' : i === q.i ? 'cur' : 'locked'}"><b>${i < q.i ? '✔' : i === q.i ? '➤' : '•'} ${Q.title}</b><div class="small muted">${i <= q.i ? Q.goal : '???'}${i === q.i && Q.need > 1 ? ` (${q.n}/${Q.need})` : ''}</div></div>`).join('');
    $('questList').querySelectorAll('[data-comp]').forEach((b) => (b.onclick = () => { this._comp = b.dataset.comp; G.net?.send({ t: 'companion', kind: b.dataset.comp }); this.renderQuests(); }));
  }

  renderResearch() {
    const pr = G.prof, r = pr.research || {}, m = pr.mats || { shards: 0 };
    $('researchMats').textContent = `${m.shards} Ember Shards · ◉ ${pr.gold}`;
    $('researchList').innerHTML = Object.entries(RESEARCH).map(([k, R]) => { const lv = r[k] || 0, c = researchCost(lv); return `<div class="rrow"><div class="ri">${R.icon}</div><div class="rt"><b>${R.name}</b> <span class="muted small">rank ${lv}/3</span><div class="small muted">${R.desc}</div><div class="rpips">${[0, 1, 2].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div><button class="btn" data-k="${k}" ${lv >= 3 ? 'disabled' : ''}>${lv >= 3 ? 'Done' : `${c.shards} shards · ${c.gold}g`}</button></div>`; }).join('');
    $('researchList').querySelectorAll('button').forEach((b) => (b.onclick = () => G.net.send({ t: 'research', key: b.dataset.k })));
  }

  // ---------- rifts & leaderboard ----------
  renderRiftPanel() {
    const max = G.prof.riftMax || 1;
    const sel = $('riftLevel'); sel.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">Level ${i + 1}${i + 1 === max ? ' (highest)' : ''}</option>`).join(''); sel.value = max;
    $('riftInfo').innerHTML = `Monster level ${Math.max(G.roomLevel, Math.ceil(max * 0.8))}+, +${Math.round(8 * max)}% health. Two random modifiers: ${Object.values(RIFT_MODS).map((m) => `<span style="color:${m.color}">${m.name}</span>`).join(', ')}.<br>Fill the bar by slaying enemies, then kill the Guardian. Finish within <b>${RIFT_TIME / 60} minutes</b> to raise your keystone (+2 if under ${Math.round(RIFT_TIME * 0.6 / 60)} min) and enter the Hall of Embers.`;
    $('riftGo').onclick = () => { G.net.send({ t: 'rift', k: +sel.value }); this.closePanel('riftPanel'); };
  }
  renderBoard(m) {
    this.boardData = m; this.boardCls ||= G.prof?.cls || 'warden';
    $('boardSeason').textContent = `Season ${m.season}`;
    $('boardTabs').innerHTML = Object.entries(CLASSES).map(([k, C]) => `<button class="stab ${k === this.boardCls ? 'on' : ''}" data-k="${k}" style="color:${C.color}">${C.name}</button>`).join('') + `<button class="stab ${this.boardCls === 'guilds' ? 'on' : ''}" data-k="guilds" style="color:#7affb0">Guilds</button>`;
    $('boardBounties').onclick = () => { this.closePanel('board'); this.socTab = 'bounties'; this.openPanel('social'); };
    $('boardTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.boardCls = b.dataset.k; this.renderBoard(this.boardData); }));
    if (this.boardCls === 'guilds') { const g = m.guilds || []; $('boardRows').innerHTML = g.length ? `<table class="lb"><thead><tr><th>#</th><th>Guild</th><th>Rift</th><th>Time</th><th>By</th></tr></thead><tbody>${g.map((r, i) => `<tr><td>${i + 1}</td><td>&lt;${escapeHtml(r.tag)}&gt; ${escapeHtml(r.name)}</td><td>${r.k}</td><td>${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}</td><td>${escapeHtml(r.by)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted" style="padding:12px">No guild has cleared a rift in time this season.</div>'; return; }
    const rows = (m.data[this.boardCls] || []).slice(0, 10);
    $('boardRows').innerHTML = rows.length ? `<table class="lb"><thead><tr><th>#</th><th>Hero</th><th>Rift</th><th>Time</th><th>Party</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.k}</td><td>${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}</td><td>${r.party}</td></tr>`).join('')}</tbody></table>` : '<div class="muted" style="padding:12px">No champions yet this season. Be the first.</div>';
  }

  // ---------- blacksmith ----------
  renderSmith() {
    const pr = G.prof, ch = pr.char, m = pr.mats || { shards: 0, cores: 0 };
    $('smithMats').textContent = `· ${m.shards} Ember Shards · ${m.cores} Ember Cores · ◉ ${pr.gold}`;
    const eqEl = $('smithEq'); eqEl.innerHTML = '';
    for (const slot of ['weapon', 'helm', 'chest', 'boots']) {
      const it = ch.equipped[slot]; const c = document.createElement('div'); c.className = 'bcell' + (it ? ' filled' : '');
      if (it) { c.style.color = RARITIES[it.rarity].color; c.textContent = itemIcon(it); this.bindTip(c, it, null); c.onclick = () => { this.smithSel = { src: 'eq', ref: slot }; this.renderSmith(); }; if (this.smithSel?.src === 'eq' && this.smithSel.ref === slot) c.classList.add('sel'); }
      eqEl.appendChild(c);
    }
    this.bagCells($('smithBag'), ch.bag, BAG, (i) => { this.smithSel = { src: 'bag', ref: i }; this.renderSmith(); }, null, false);
    if (this.smithSel?.src === 'bag') $('smithBag').children[this.smithSel.ref]?.classList.add('sel');
    const sel = this.smithSel, it = sel && (sel.src === 'eq' ? ch.equipped[sel.ref] : ch.bag[sel.ref]);
    const d = $('smithDetail');
    const gemList = Object.entries(pr.gems || {}).filter(([, n]) => n > 0).sort();
    $('gemPouch').innerHTML = gemList.length ? gemList.map(([k, n]) => `<span class="gemchip" style="--g:${GEMS[parseGem(k).type].color}">◆ ${gemName(k)} ×${n}${n >= 3 && parseGem(k).tier < 5 ? ` <button class="btn" data-k="${k}">Combine 3 (${30 * parseGem(k).tier}g)</button>` : ''}</span>`).join('') : '<span class="muted small">Gem pouch is empty.</span>';
    $('gemPouch').querySelectorAll('button').forEach((b) => (b.onclick = () => G.net.send({ t: 'combine', k: b.dataset.k })));
    if (!it) { d.innerHTML = '<div class="muted">Select an item to work on it.</div>'; return; }
    const R = RARITIES[it.rarity];
    const rc = { shards: 6 * (it.rarity + 1), gold: 15 * G.roomLevel }, uc = { shards: 10 * (it.rarity + 1) + it.level * 2, cores: it.rarity === 4 ? 1 : 0 };
    let html = `<div class="tn" style="color:${R.color}">${escapeHtml(it.name)}</div><div class="muted">${R.name} · Item level ${it.level} · Power ${it.power}</div>`;
    html += `<div class="sub-h" style="margin-top:10px">Upgrade</div><div>Raise item level to ${it.level + 1} (${uc.shards} shards${uc.cores ? ', 1 core' : ''})</div><button class="btn" data-a="up">Upgrade</button>`;
    const keys = Object.keys(it.affixes || {});
    html += `<div class="sub-h" style="margin-top:10px">Reroll an affix <span class="muted small">(${rc.shards} shards, ${rc.gold}g)</span></div>` + (keys.length ? keys.map((k, i) => `<div>${affixLines({ affixes: { [k]: it.affixes[k] } })[0]} <button class="btn" data-a="rr" data-k="${k}">Reroll</button></div>`).join('') : '<div class="muted">No affixes to reroll.</div>');
    const gems = Object.entries(pr.gems || {}).filter(([, n]) => n > 0);
    if (it.sockets?.length) html += `<div class="sub-h" style="margin-top:10px">Sockets</div>` + it.sockets.map((g, si) => g ? `<div>◆ <span style="color:${GEMS[parseGem(g).type].color}">${gemName(g)}</span> <button class="btn" data-a="unsock" data-i="${si}">Remove (${20 * parseGem(g).tier}g)</button></div>` : `<div>◇ Empty ${gems.length ? `<select data-i="${si}" class="gemsel">${gems.map(([k, n]) => `<option value="${k}">${gemName(k)} ×${n}</option>`).join('')}</select> <button class="btn" data-a="sock" data-i="${si}">Socket</button>` : '<span class="muted">— no gems (they drop from elites and bosses)</span>'}</div>`).join('');
    if (sel.src === 'bag') html += `<div class="sub-h" style="margin-top:10px">Salvage</div><div>Break it down for ${Math.round(SALVAGE[it.rarity] * (1 + it.level * 0.1))} shards${it.rarity === 4 ? ' and 1 Ember Core' : ''}.</div><button class="btn" data-a="salv">Salvage</button>`;
    d.innerHTML = html;
    d.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'up') G.net.send({ t: 'upgradeItem', src: sel.src, ref: sel.ref });
      if (a === 'rr') G.net.send({ t: 'reroll', src: sel.src, ref: sel.ref, key: b.dataset.k });
      if (a === 'salv') { G.net.send({ t: 'salvage', i: sel.ref }); this.smithSel = null; }
      if (a === 'sock') G.net.send({ t: 'socket', src: sel.src, ref: sel.ref, idx: +b.dataset.i, k: d.querySelector(`select[data-i="${b.dataset.i}"]`).value });
      if (a === 'unsock') G.net.send({ t: 'unsocket', src: sel.src, ref: sel.ref, idx: +b.dataset.i });
      G.audio.build();
    }));
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
    const pg = ch.paragon || { pts: 0, xp: 0, alloc: {} }, pspent = Object.values(pg.alloc || {}).reduce((a, b) => a + b, 0);
    if (ch.level >= LEVEL_CAP || pg.pts) {
      const row = document.createElement('div'); row.className = 'paragon';
      row.innerHTML = `<div class="sub-h">Paragon ${pg.pts} <span class="muted small">${pg.pts - pspent} unspent · next in ${paragonXp(pg.pts) - pg.xp} XP</span></div><div class="pgrid">${Object.entries(PARAGON).map(([k, D]) => `<button class="btn pbtn" data-k="${k}" ${pg.pts - pspent <= 0 ? 'disabled' : ''}><b>${D.name}</b><br><span class="small">${D.fmt((pg.alloc?.[k] || 0) * D.per)}</span></button>`).join('')}</div>`;
      tree.appendChild(row);
      row.querySelectorAll('.pbtn').forEach((b) => (b.onclick = () => G.net.send({ t: 'paragon', key: b.dataset.k })));
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
    this.dialog(`<b>${escapeHtml(m.by)}</b> wants to enter ${m.target?.type === 'rift' ? `an <b>Ember Rift (Level ${m.target.k})</b>` : `the <b>Dungeon (Depth ${G.roomLevel})</b>`}.<br>Are you ready?`, [['Ready', () => G.net.send({ t: 'readyResp', yes: true })], ['Not yet', () => G.net.send({ t: 'readyResp', yes: false })]], m.timeout);
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
    bind('setDynres', 'dynres'); $('setRenderer').onchange = (e) => { s.renderer = e.target.value; saveSettings(s); setTimeout(() => location.reload(), 150); }; bind('setRumble', 'rumble'); bind('setCb', 'cb'); bind('setUiScale', 'uiScale', (v) => Math.round(v * 100) + '%'); bind('setTouch', 'touch');
    $('acctCopy').onclick = () => { try { navigator.clipboard.writeText(getToken()); this.toast('Recovery code copied — keep it safe', '#ffd98a'); } catch (e) { this.toast('Select the code and copy it manually', '#ff9a7a'); } };
    $('acctEmailBtn').onclick = () => {
      if (G.net.offline) { this.toast('Email login needs an online server.', '#ff9a7a'); return; }
      fetch('/api/login-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: $('acctEmail').value, token: getToken() }) }).then((r) => r.json()).then((j) => this.toast(j.error || 'Check your inbox — the link works for 15 minutes.', j.error ? '#ff6a5a' : '#5eea8a')).catch(() => this.toast('Could not reach the server.', '#ff6a5a'));
    };
    $('acctRestore').onclick = () => { const v = $('acctInput').value.trim().toLowerCase(); if (!/^[a-f0-9]{32}$/.test(v)) { this.toast('That is not a valid recovery code', '#ff6a5a'); return; } setToken(v); location.reload(); };
    $('replayIntro').onclick = () => { this.closePanel('settings'); G.actions.playIntro(); };
    $('resetBinds').onclick = () => { s.bindings = { ...DEFAULT_BINDINGS }; saveSettings(s); G.actions.applySettings(); this.renderSettings(); };
    document.querySelectorAll('.stab').forEach((b) => (b.onclick = () => { document.querySelectorAll('.stab').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.spage').forEach((p) => p.classList.toggle('hidden', p.id !== b.dataset.p)); }));
  }
  renderSettings() {
    const s = this.settings;
    $('setDynres').checked = s.dynres; $('setRenderer').value = s.renderer || 'webgl'; $('setRumble').checked = s.rumble !== false; $('setCb').checked = s.cb; $('setUiScale').value = s.uiScale; $('setUiScaleV').textContent = Math.round(s.uiScale * 100) + '%'; $('setTouch').value = s.touch;
    $('acctCode').textContent = getToken() || '(join a game first)';
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
    if (it.leg && LEGENDARIES[it.leg]) { const L = LEGENDARIES[it.leg]; html += `<div class="tleg">${L.nightmare ? '<span class="nmtag">Nightmare</span> ' : ''}✦ ${L.name}${L.cls ? ` <span class="muted">(${CLASSES[L.cls].name})</span>` : ''}<br><span style="font-weight:600">${L.desc}</span></div>`; }
    if (it.set && SETS[it.set]) { const S = SETS[it.set], n = G.prof ? Object.values(G.prof.char.equipped).filter((x) => x && x.set === it.set).length : 0; html += `<div class="tset"><b>${S.name}</b> (${n}/4)<br><span class="${n >= 2 ? '' : 'off'}">(2) ${S.d2}</span><br><span class="${n >= 4 ? '' : 'off'}">(4) ${S.d4}</span></div>`; }
    if (it.slot === 'weapon' && G.prof && !CLASSES[G.prof.cls].weapons.includes(it.type)) html += `<div class="cmp neg">Your ${CLASSES[G.prof.cls].name} cannot wield this</div>`;
    else if (cmp !== it && G.prof && it.slot) { // real stat deltas against what is equipped in this slot
      const c = compareItem(G.prof.char, G.prof.cls, it), pc = (v) => `${v >= 0 ? '▲ +' : '▼ '}${(v * 100).toFixed(1)}%`;
      html += `<div class="cmp">vs equipped: <span class="${c.dpsPct >= 0 ? 'pos' : 'neg'}">${pc(c.dpsPct)} DPS</span> · <span class="${c.ehpPct >= 0 ? 'pos' : 'neg'}">${pc(c.ehpPct)} toughness</span><br><span class="muted small">DPS ${Math.round(c.cur.dmg * c.cur.atkSpeed)} → ${Math.round(c.next.dmg * c.next.atkSpeed)} · Health ${c.cur.maxHp} → ${c.next.maxHp} · Armor ${c.cur.armor} → ${c.next.armor}</span></div>`;
    }
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
  if (z.startsWith('rift')) return 'Ember Rift';
  if (REGIONS[z]) return REGIONS[z].name;
  return z === 'dark' ? 'Dark World' : 'Emberhold';
}

export const ui = new UI();
