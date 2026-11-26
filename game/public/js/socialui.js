// Social panel: friends & whispers, guild (members, invites, shared stash), daily/weekly bounties, season track & cosmetics.
import { G } from './state.js';
import { COSMETICS, SEASON_TRACK, GUILD_COST, DAY_MS } from '../shared/social.js';
import { TOWN } from '../shared/world.js';
import { RARITIES } from '../shared/items.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = [['friends', 'Friends'], ['guild', 'Guild'], ['bounties', 'Bounties'], ['season', 'Season']];
const ZN = { town: 'Emberhold', dark: 'Dark World', marsh: 'Ashen Marsh', peaks: 'Stormspire' };
const zoneName = (z) => (!z ? '' : ZN[z] || (z.startsWith('rift') ? 'Ember Rift' : z.startsWith('dungeon') ? 'Dungeon' : z));
const near = (pos, r) => G.player && Math.hypot(G.player.pos.x - pos.x, G.player.pos.z - pos.z) < r;
const fmtLeft = (ms) => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`; };

export function renderSocial(ui) {
  const S = G.social; if (!S) { $('socBody').innerHTML = '<div class="muted" style="padding:12px">Connecting…</div>'; return; }
  ui.socTab ||= 'friends';
  $('socTabs').innerHTML = TABS.map(([k, n]) => `<button class="stab ${k === ui.socTab ? 'on' : ''}" data-k="${k}">${n}${k === 'friends' && S.requests.length ? ` (${S.requests.length})` : ''}${k === 'bounties' && S.bounties.some((b) => b.prog >= b.n && !b.claimed) ? ' ●' : ''}</button>`).join('');
  $('socTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { ui.socTab = b.dataset.k; renderSocial(ui); }));
  const body = $('socBody'), send = (m) => G.net.send(m);
  if (ui.socTab === 'friends') {
    body.innerHTML = `
      <div class="soc-row"><span>Your friend code</span><b class="code">${S.tag}</b><button class="btn small" id="socCopy">Copy</button></div>
      <div class="soc-row"><input id="socAdd" maxlength="6" placeholder="Friend code" /><button class="btn small" id="socAddBtn">Add friend</button></div>
      ${S.requests.map((r) => `<div class="soc-row req"><span>📨 <b>${esc(r.name)}</b> wants to be friends</span><button class="btn small" data-acc="${r.tag}">Accept</button><button class="btn small ghost" data-dec="${r.tag}">Decline</button></div>`).join('')}
      <div class="soc-list">${S.friends.length ? S.friends.map((f) => `<div class="soc-friend"><i class="dot ${f.online ? 'on' : ''}"></i><div><b>${esc(f.name)}</b> <span class="muted small">${f.server ? `online on ${esc(f.server)}` : f.online ? `Lv${f.level} ${f.cls || ''} · ${zoneName(f.zone)}${f.room ? ` · party ${f.room}` : ''}` : 'offline'}</span></div>
        <span class="sp"></span>${f.url ? `<a class="btn small" href="${encodeURI(f.url)}">Go to server</a>` : ''}${f.online && !f.server ? `<button class="btn small" data-w="${esc(f.name)}">Whisper</button>${f.room && f.room !== G.roomCode ? `<button class="btn small" data-join="${f.room}">Join</button>` : ''}` : ''}<button class="btn small" data-visit="${f.tag}" title="Visit their home (from Emberhold)">🏠</button><button class="btn small ghost" data-rm="${f.tag}">✕</button></div>`).join('') : '<div class="muted small" style="padding:8px">Share your friend code to add friends. Whisper anyone online with <b>/w Name message</b>.</div>'}</div>`;
    $('socCopy').onclick = () => { navigator.clipboard?.writeText(S.tag); ui.toast('Friend code copied', '#5eea8a'); };
    $('socAddBtn').onclick = () => { const v = $('socAdd').value.trim().toUpperCase(); if (v) send({ t: 'friendAdd', code: v }); };
    body.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => send({ t: 'friendAccept', code: b.dataset.acc })));
    body.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => send({ t: 'friendDecline', code: b.dataset.dec })));
    body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => send({ t: 'friendRemove', code: b.dataset.rm })));
    body.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { ui.closeAll(); ui.openChat(); ui.chatInput.value = `/w ${b.dataset.w} `; }));
    body.querySelectorAll('[data-visit]').forEach((b) => (b.onclick = () => { ui.closeAll(); G.net.send({ t: 'houseEnter', tag: b.dataset.visit }); }));
    body.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => { location.href = `${location.pathname}?room=${b.dataset.join}`; }));
  } else if (ui.socTab === 'guild') {
    const g = S.guild;
    if (!g) {
      body.innerHTML = `<div class="soc-sec">Found a guild <span class="muted small">(${GUILD_COST} gold)</span></div>
        <div class="soc-row"><input id="gName" maxlength="20" placeholder="Guild name" /><input id="gTag" maxlength="4" placeholder="TAG" style="width:70px" /><button class="btn small" id="gCreate">Found</button></div>
        ${S.guildInvites.length ? `<div class="soc-sec">Invitations</div>${S.guildInvites.map((v) => `<div class="soc-row"><span>&lt;${esc(v.tag)}&gt; <b>${esc(v.name)}</b></span><button class="btn small" data-gj="${v.id}">Join</button></div>`).join('')}` : '<div class="muted small" style="padding:8px">Guilds share a 24-slot stash and compete on the guild rift leaderboard each season.</div>'}`;
      $('gCreate').onclick = () => send({ t: 'guildCreate', name: $('gName').value, tag: $('gTag').value.toUpperCase() });
      body.querySelectorAll('[data-gj]').forEach((b) => (b.onclick = () => send({ t: 'guildAccept', id: b.dataset.gj })));
    } else {
      const atStash = G.zoneKey === 'town' && near(TOWN.stash, 6), bag = G.prof.char.bag;
      body.innerHTML = `<div class="soc-guild">&lt;${esc(g.tag)}&gt; ${esc(g.name)} <span class="muted small">${g.members.length} member${g.members.length === 1 ? "" : "s"} · guild chat: /g message</span></div>
        <div class="soc-list">${g.members.map((f) => `<div class="soc-friend"><i class="dot ${f.online ? 'on' : ''}"></i><b>${esc(f.name)}</b>${f.tag === g.leader ? ' <span class="small" style="color:#ffd34d">Leader</span>' : ''}<span class="sp"></span><span class="muted small">${f.online ? zoneName(f.zone) : 'offline'}</span></div>`).join('')}</div>
        <div class="soc-row"><input id="gInv" maxlength="6" placeholder="Friend code" /><button class="btn small" id="gInvBtn">Invite</button><span class="sp"></span><button class="btn small ghost" id="gLeave">Leave guild</button></div>
        <div class="soc-sec">Guild stash ${g.stash.length}/24 ${atStash ? '' : '<span class="muted small">— visit the stash chest in Emberhold to deposit or withdraw</span>'}</div>
        <div class="soc-grid">${g.stash.map((it, i) => `<button class="bcell" data-take="${i}" title="${esc(it.name)}" style="border-color:${RARITIES[it.rarity].color}" ${atStash ? '' : 'disabled'}>${esc(it.name.split(' ').slice(-1)[0])}</button>`).join('') || '<span class="muted small">Empty</span>'}</div>
        ${atStash ? `<div class="soc-sec">Deposit from your bag</div><div class="soc-grid">${bag.map((it, i) => `<button class="bcell" data-put="${i}" title="${esc(it.name)}" style="border-color:${RARITIES[it.rarity].color}">${esc(it.name.split(' ').slice(-1)[0])}</button>`).join('') || '<span class="muted small">Your bag is empty</span>'}</div>` : ''}`;
      $('gInvBtn').onclick = () => { const v = $('gInv').value.trim().toUpperCase(); if (v) { send({ t: 'guildInvite', code: v }); ui.toast('Invitation sent', '#5eea8a'); } };
      $('gLeave').onclick = () => send({ t: 'guildLeave' });
      body.querySelectorAll('[data-take]').forEach((b) => (b.onclick = () => send({ t: 'guildStash', op: 'take', i: +b.dataset.take })));
      body.querySelectorAll('[data-put]').forEach((b) => (b.onclick = () => send({ t: 'guildStash', op: 'put', i: +b.dataset.put })));
    }
  } else if (ui.socTab === 'bounties') {
    const atBoard = G.zoneKey === 'town' && near(TOWN.board, 7), now = Date.now();
    const dayLeft = DAY_MS - (now % DAY_MS), weekLeft = ((7 - ((Math.floor(now / DAY_MS) + 3) % 7)) * DAY_MS) - (now % DAY_MS);
    const row = (b) => `<div class="bounty ${b.claimed ? 'done' : ''}"><div><b>${esc(b.text)}</b><div class="bar"><i style="width:${(b.prog / b.n) * 100}%"></i></div><span class="muted small">${b.prog}/${b.n} · ${b.reward.gold}g · ${b.reward.marks} Season Marks${b.reward.gems ? ' · gem' : ''}${b.reward.legendary ? ' · Legendary item' : ''}</span></div>
      <button class="btn small" data-claim="${b.id}" ${b.claimed || b.prog < b.n ? 'disabled' : ''}>${b.claimed ? 'Claimed' : 'Claim'}</button></div>`;
    body.innerHTML = `${atBoard ? '' : '<div class="muted small" style="padding:4px 2px 8px">Claim finished bounties at the Bounty Board in Emberhold (next to the Hall of Embers).</div>'}
      <div class="soc-sec">Daily bounties <span class="muted small">reset in ${fmtLeft(dayLeft)}</span></div>${S.bounties.filter((b) => !b.weekly).map(row).join('')}
      <div class="soc-sec">Weekly bounties <span class="muted small">reset in ${fmtLeft(weekLeft)}</span></div>${S.bounties.filter((b) => b.weekly).map(row).join('')}`;
    body.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = () => send({ t: 'bountyClaim', id: b.dataset.claim })));
  } else {
    const s = S.season, eq = S.cos || {};
    body.innerHTML = `<div class="soc-guild">Season ${esc(s.id)} <span class="muted small">· ${s.marks} Season Marks · earn them from bounties, rift clears and bosses. Marks reset each season; cosmetics are yours forever.</span></div>
      <div class="track">${SEASON_TRACK.map((T, i) => { const C = COSMETICS[T.cos], got = s.claimed.includes(i), can = !got && s.marks >= T.marks; return `<div class="tier ${got ? 'got' : can ? 'can' : ''}"><div class="tm">${T.marks}</div><div class="tc" style="color:${C.color}">${C.type === 'title' ? '🏷' : C.type === 'aura' ? '✨' : '🐎'} ${esc(C.name)}</div><button class="btn small" data-tier="${i}" ${can ? '' : 'disabled'}>${got ? '✔' : 'Claim'}</button></div>`; }).join('')}</div>
      <div class="soc-sec">Your cosmetics</div>
      ${['title', 'aura', 'steed'].map((type) => `<div class="soc-row"><span style="width:60px;text-transform:capitalize">${type}</span><select data-cos="${type}"><option value="">None</option>${S.cosmetics.filter((k) => COSMETICS[k].type === type).map((k) => `<option value="${k}" ${eq[type] === k ? 'selected' : ''}>${esc(COSMETICS[k].name)}</option>`).join('')}</select></div>`).join('')}`;
    body.querySelectorAll('[data-tier]').forEach((b) => (b.onclick = () => send({ t: 'seasonClaim', tier: +b.dataset.tier })));
    body.querySelectorAll('[data-cos]').forEach((sel) => (sel.onchange = () => send({ t: 'cosEquip', type: sel.dataset.cos, id: sel.value || null })));
  }
}
