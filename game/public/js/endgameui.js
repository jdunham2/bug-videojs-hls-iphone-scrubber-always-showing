// Endgame UI: Mystic Forge (legendary recipes, enchanting, set transmutation), Nightmare difficulty and weekly Rift Trials.
import { G } from './state.js';
import { CRAFT, recipesFor, setsFor, DIFFICULTY, trialOf, TRIAL_LIMIT } from '../shared/endgame.js';
import { RARITIES, SETS, AFFIXES, LEGENDARIES, affixLines } from '../shared/items.js';
import { RIFT_MODS } from '../shared/rifts.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cost = (c) => [c.cores && `${c.cores} cores`, c.shards && `${c.shards} shards`, c.essence && `${c.essence} essence`, c.gold && `${c.gold}g`].filter(Boolean).join(' · ');
const SLOTS = ['weapon', 'helm', 'chest', 'boots'];
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function renderForge(ui) {
  ui.forgeTab ||= 'recipes';
  const pr = G.prof, m = pr.mats || {}, send = (x) => G.net.send(x);
  $('forgeMats').textContent = `${m.cores || 0} Ember Cores · ${m.shards || 0} shards · ${m.essence || 0} Nightmare Essence · ${pr.gold}g`;
  $('forgeTabs').innerHTML = [['recipes', 'Legendary recipes'], ['enchant', 'Enchant'], ['transmute', 'Transmute sets']].map(([k, n]) => `<button class="stab ${ui.forgeTab === k ? 'on' : ''}" data-k="${k}">${n}</button>`).join('');
  $('forgeTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { ui.forgeTab = b.dataset.k; renderForge(ui); }));
  const body = $('forgeBody'), bag = pr.char.bag;
  if (ui.forgeTab === 'recipes') {
    ui.forgeSlot ||= 'weapon';
    body.innerHTML = `<div class="soc-row"><span>Craft into</span>${SLOTS.map((s) => `<button class="btn small ${ui.forgeSlot === s ? 'on' : ''}" data-slot="${s}">${s}</button>`).join('')}</div>
      <div class="recipes">${recipesFor(pr.cls).map((L) => `<div class="recipe ${L.nightmare ? 'nm' : ''}"><b>${esc(L.name)}</b>${L.nightmare ? ' <span class="nmtag">Nightmare</span>' : ''}<div class="small">${esc(L.desc)}</div><div class="muted small">${cost(L.nightmare ? CRAFT.recipeNightmare : CRAFT.recipe)}</div><button class="btn small" data-rec="${L.key}">Forge</button></div>`).join('')}</div>`;
    body.querySelectorAll('[data-slot]').forEach((b) => (b.onclick = () => { ui.forgeSlot = b.dataset.slot; renderForge(ui); }));
    body.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => send({ t: 'craftRecipe', key: b.dataset.rec, slot: ui.forgeSlot })));
  } else if (ui.forgeTab === 'enchant') {
    const sel = bag[ui.enchSel];
    body.innerHTML = `<div class="muted small" style="padding:2px 0 6px">Pick an item, then the affix to enchant. You choose from three results (keeping the current roll is always one). Once enchanted, only that affix can be enchanted again; each enchant costs more.</div>
      <div class="soc-grid">${bag.map((it, i) => `<button class="bcell ${ui.enchSel === i ? 'on' : ''}" data-i="${i}" style="border-color:${RARITIES[it.rarity].color}" title="${esc(it.name)}">${esc(it.name.split(' ').slice(-1)[0])}</button>`).join('') || '<span class="muted small">Your bag is empty.</span>'}</div>
      ${sel ? `<div class="soc-sec">${esc(sel.name)} <span class="muted small">next enchant: ${cost(CRAFT.enchant(sel.enchants || 0))}</span></div>${Object.entries(sel.affixes || {}).map(([k, v]) => `<div class="soc-row"><span>${AFFIXES[k].fmt(v)}${sel.enchKey === k ? ' <span class="nmtag">enchanted</span>' : ''}</span><span class="sp"></span><button class="btn small" data-ench="${k}" ${sel.enchKey && sel.enchKey !== k ? 'disabled' : ''}>Enchant</button></div>`).join('') || '<span class="muted small">This item has no affixes.</span>'}` : ''}
      ${ui.enchOpts ? `<div class="soc-sec">Choose the result</div><div class="soc-row">${ui.enchOpts.map((o, i) => `<button class="btn" data-pick="${i}">${esc(o.text)}${i === 0 ? ' <span class="muted small">(keep)</span>' : ''}</button>`).join('')}</div>` : ''}`;
    body.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { ui.enchSel = +b.dataset.i; ui.enchOpts = null; renderForge(ui); }));
    body.querySelectorAll('[data-ench]').forEach((b) => (b.onclick = () => send({ t: 'enchantRoll', src: 'bag', ref: ui.enchSel, key: b.dataset.ench })));
    body.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { send({ t: 'enchantPick', idx: +b.dataset.pick }); ui.enchOpts = null; }));
  } else {
    const sets = setsFor(pr.cls), items = bag.map((it, i) => [it, i]).filter(([it]) => it.set);
    ui.tmSet ||= sets[0]; ui.tmSlot ||= 'weapon';
    body.innerHTML = `<div class="muted small" style="padding:2px 0 6px">Reshape a set piece into any piece of your class sets (${cost(CRAFT.transmute)}).</div>
      <div class="soc-row"><span>Into</span><select id="tmSet">${sets.map((s) => `<option value="${s}" ${ui.tmSet === s ? 'selected' : ''}>${esc(SETS[s].name)}</option>`).join('')}</select><select id="tmSlot">${SLOTS.map((s) => `<option ${ui.tmSlot === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      ${items.map(([it, i]) => `<div class="soc-row"><span style="color:${RARITIES[it.rarity].color}">${esc(it.name)}</span><span class="sp"></span><button class="btn small" data-tm="${i}">Transmute</button></div>`).join('') || '<div class="muted small">No set items in your bag.</div>'}`;
    $('tmSet').onchange = (e) => (ui.tmSet = e.target.value); $('tmSlot').onchange = (e) => (ui.tmSlot = e.target.value);
    body.querySelectorAll('[data-tm]').forEach((b) => (b.onclick = () => send({ t: 'transmute', src: 'bag', ref: +b.dataset.tm, set: ui.tmSet, slot: ui.tmSlot })));
  }
}

/** difficulty picker + weekly trial block appended to the Rift Obelisk panel */
export function renderTrial(ui, board) {
  const T = board?.trial || trialOf(), box = $('trialBox'), d = G.roomDiff || 0;
  box.innerHTML = `<div class="soc-sec">Difficulty</div><div class="soc-row">${DIFFICULTY.map((D, i) => `<button class="btn small ${d === i ? 'on' : ''}" data-d="${i}" style="color:${D.color}" title="Enemies ×${D.hp} health, ×${D.dmg} damage, ×${D.luck} loot luck${i ? `, requires level ${D.minLevel}` : ''}">${D.name}</button>`).join('')}</div>
    <div class="muted small">Applies to dungeons and rifts for the whole party. Nightmare bosses drop Nightmare Essence and can drop Nightmare-only legendary powers.</div>
    <div class="soc-sec">Weekly Rift Trial</div>
    <div class="small">Same dungeon for everyone this week: keystone ${T.k}, monster level ${T.level}, modifiers ${T.mods.map((k) => `<span style="color:${RIFT_MODS[k].color}">${RIFT_MODS[k].name}</span>`).join(' + ')}. Clear it within ${fmtT(TRIAL_LIMIT)} to be ranked.</div>
    <div class="soc-row"><button class="btn primary" id="trialGo">Enter the Trial</button><button class="btn" id="trialWatch" ${board?.replay ? '' : 'disabled'}>▶ Watch the top run</button></div>
    ${board ? `<table class="lb"><thead><tr><th>#</th><th>Party</th><th>Time</th></tr></thead><tbody>${board.list.map((r, i) => `<tr><td>${i + 1}</td><td>${r.names.map(esc).join(', ')}</td><td>${fmtT(r.time)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No runs yet this week.</td></tr>'}</tbody></table>` : ''}`;
  box.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => G.net.send({ t: 'difficulty', d: +b.dataset.d })));
  $('trialGo').onclick = () => { G.net.send({ t: 'trial' }); ui.closePanel('riftPanel'); };
  $('trialWatch').onclick = () => { G.net.send({ t: 'trialReplay' }); ui.closePanel('riftPanel'); };
}
