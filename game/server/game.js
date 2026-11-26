// Emberfall game simulation: rooms, players and message handling. Runs under Node (server.js) or in the browser (offline/solo build).
import { CLASSES } from '../public/shared/classes.js';
import { TOWN, DARK, townLayout } from '../public/shared/world.js';
import { Zone, send } from './zone.js';
import { Defense, research } from './defense.js';
import * as P from './profile.js';
import { SETS } from '../public/shared/items.js';
import { RIFT_TIME, season } from '../public/shared/rifts.js';
import { REGIONS, QUESTS, CAPTAIN, questDone, ACT1_END, ACT2_END, COMPANIONS } from '../public/shared/regions.js';
// which companion follows a hero: their choice if unlocked, else the newest one they have
const companionOf = (p) => { const qi = p.char.quest?.i || 0; if (p.companion === false) return null; if (p.companion && COMPANIONS[p.companion] && qi >= COMPANIONS[p.companion].unlock) return p.companion; return qi >= COMPANIONS.corvin.unlock ? 'corvin' : qi >= COMPANIONS.ilsa.unlock ? 'ilsa' : null; };
import { FISH, rollFish, nearLake, MIN_REEL, hourAt, isNight } from '../public/shared/life.js';
import { createSocial } from './social.js';
const SOCIAL_T = new Set(['social', 'friendAdd', 'friendAccept', 'friendDecline', 'friendRemove', 'whisper', 'guildCreate', 'guildInvite', 'guildAccept', 'guildLeave', 'guildStash', 'bountyClaim', 'seasonClaim', 'cosEquip']);

const TOKEN_RE = /^[a-f0-9]{32}$/;
export { TOKEN_RE };

// Generous per-hit and per-second damage budgets derived from the hero's real stats (server-side).
function damageCap(p) {
  if (!p.capT || Date.now() - p.capT > 2000) {
    const st = P.statsOf(p);
    const base = st.dmg * st.critDmg * (1 + st.skillDmg) * 1.5;
    p.cap = { hit: base * 16 + 50, sec: base * 60 + 200 };
    p.capT = Date.now();
  }
  return p.cap;
}

export function createGame({ db, makeToken, dev = false, crowd = null, moveCheck = !dev }) {
const rooms = new Map();
const online = new Map(); // token -> player
const DT = 0.05;
const MOVE_SPEED = 26, BURST_MAX = 18, BURST_REFILL = 8; // m/s, m, m/s
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const CHESTS = new Map(townLayout().chests.map((c) => [c.id, c]));
const social = createSocial({ db, online, send, P });
const acLog = []; const started = Date.now();
function logCheat(e) { acLog.push({ at: Date.now(), ...e }); if (acLog.length > 200) acLog.shift(); }

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.level = 1; this.nextId = 1; this.zones = new Map();
    this.currentDungeon = null; this.ready = null; this.tickN = 0; this.clock0 = Date.now(); this.crowd = crowd;
    this.zones.set('town', new Zone(this, 'town', 'town', 1));
    this.zones.set('dark', new Zone(this, 'dark', 'dark', 1));
    this.defense = new Defense(this);
  }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
  get town() { return this.zones.get('town'); }
  get clock() { return (Date.now() - this.clock0) / 1000 + (this.clockOffset || 0); }

  reward(p, gold, xp, x, z, big = false) {
    const st = P.statsOf(p);
    const g = Math.max(1, Math.round(gold * (1 + st.goldFind) * (1 + 0.1 * Math.min(4, p.style || 0))));
    p.prof.gold += g;
    send(p.ws, { t: 'reward', gold: g, xp: Math.round(xp), x: r2(x), z: r2(z), big });
    P.addXp(p, Math.round(xp), (m) => { send(p.ws, m); this.broadcast({ t: 'plevel', id: p.id, level: p.char.level }); });
    p.dirty = true;
  }
  giveLoot(p, level, opts, x, z) {
    const item = P.rollItem(p, level, opts);
    p.loot.set(item.id, { item, x, z, zone: p.zone });
    if (p.loot.size > 60) p.loot.delete(p.loot.keys().next().value);
    send(p.ws, { t: 'loot', item, x: r2(x), z: r2(z) });
  }

  enterZone(p, type) {
    let zone;
    if (type === 'dungeon') {
      if (!this.currentDungeon || !this.zones.has(this.currentDungeon)) {
        const key = 'dungeon:' + this.nextId++;
        this.zones.set(key, new Zone(this, key, 'dungeon', this.level));
        this.currentDungeon = key;
      }
      zone = this.zones.get(this.currentDungeon);
    } else if (REGIONS[type]) {
      if (type === 'citadel' && (p.char.quest?.i || 0) < ACT2_END && !p.prof.citadel) { send(p.ws, { t: 'notice', text: 'The Sunken Citadel lies beyond the storm. Finish Act II first.', color: '#ff9a7a' }); return; }
      if (type === 'peaks' && !questDone(p.char.quest) && !p.prof.peaks) { send(p.ws, { t: 'notice', text: 'The pass to Stormspire is sealed. Finish Act I first.', color: '#ff9a7a' }); return; }
      zone = this.zones.get(type) || this.zones.set(type, new Zone(this, type, 'region', this.level)).get(type);
    } else zone = this.zones.get(type === 'dark' ? 'dark' : 'town');
    this.joinZone(p, zone);
  }
  enterRift(p, k) {
    let zone = this.currentRift && this.zones.get(this.currentRift);
    if (!zone || zone.k !== k || zone.rift.done || !zone.players().length) {
      const key = 'rift:' + this.nextId++;
      zone = new Zone(this, key, 'rift', k);
      this.zones.set(key, zone); this.currentRift = key;
    }
    this.joinZone(p, zone);
  }
  dropGem(p, level) { return P.dropGem(p, level); }
  bounty(p, kind, n = 1, meta = {}) { social.bountyEvent(p, kind, n, meta); }
  marks(p, n) { social.addMarks(p, n); }
  questEvent(p, kind, n = 1) {
    const q = (p.char.quest ||= { i: 0, n: 0 });
    const Q = QUESTS[q.i]; if (!Q || Q.kind !== kind) return;
    q.n += n;
    if (q.n >= Q.need) {
      q.i++; q.n = 0;
      this.reward(p, 60 + 40 * q.i, 120 * q.i, p.x, p.z, true);
      if (q.i === ACT1_END) { p.prof.peaks = true; this.giveLoot(p, Math.max(this.level, p.char.level), { rarity: 4 }, p.x + 1.5, p.z); }
      if (q.i === ACT1_END + 1 || q.i === ACT2_END + 1) { if (q.i === ACT2_END + 1) p.companion = 'corvin'; const z = this.zones.get(p.zone), k = companionOf(p); if (z && z.type !== 'town' && k) z.addAlly(p, k); }
      if (q.i === ACT2_END) { p.prof.act2 = true; p.prof.citadel = true; p.prof.gold += 1500; }
      if (q.i >= QUESTS.length) { p.prof.act3 = true; p.prof.gold += 3000; }
      send(p.ws, { t: 'questDone', i: q.i - 1 });
    }
    p.dirty = true;
  }
  riftComplete(zone, guardian) {
    const r = zone.rift, time = (Date.now() - r.start) / 1000, ok = time <= RIFT_TIME;
    const bump = ok ? (time < RIFT_TIME * 0.6 ? 2 : 1) : 0;
    const lb = (db.data.leaderboard ||= {}), S = (lb[season()] ||= {});
    for (const p of zone.players()) {
      this.reward(p, 120 * zone.k, 250 * zone.k, guardian.x, guardian.z, true);
      for (let i = 0; i < 2; i++) this.giveLoot(p, zone.level, { minRarity: 3, luck: 3 }, guardian.x + i * 1.5, guardian.z);
      if (Math.random() < 0.5 + zone.k * 0.03) this.giveLoot(p, zone.level, { rarity: 4 }, guardian.x - 1.5, guardian.z);
      p.prof.riftMax = Math.max(p.prof.riftMax || 1, zone.k + bump);
      this.questEvent(p, 'rift'); this.bounty(p, 'rift', 1, { k: zone.k }); this.marks(p, 6 * zone.k);
      if (ok) social.guildRift(p, zone.k, Math.round(time * 10) / 10);
      if (ok) {
        const list = (S[p.cls] ||= []);
        list.push({ name: p.prof.name, k: zone.k, time: Math.round(time * 10) / 10, party: zone.players().length });
        list.sort((a, b) => b.k - a.k || a.time - b.time); list.length = Math.min(list.length, 20);
      }
      p.dirty = true;
    }
    db.touch();
    zone.cleared = true;
    zone.broadcast({ t: 'riftDone', time: Math.round(time * 10) / 10, ok, bump, k: zone.k, x: guardian.x, z: guardian.z });
  }
  joinZone(p, zone) {
    if (p.trade) this.closeTrade(p.trade, 'Trade cancelled.');
    p.mvGrace = Date.now() + 3000; // zone travel teleports the hero
    for (const z of this.zones.values()) z.removeAllies(p.id);
    { const k = companionOf(p); if (zone.type !== 'town' && k) zone.addAlly(p, k); }
    p.zone = zone.key;
    p.loot.clear();
    const msg = { t: 'enterZone', zone: zone.key, type: zone.type, level: zone.dungeon ? zone.level : this.level, clock: Math.round(this.clock * 10) / 10, weather: zone.weather };
    if (zone.dungeon) { msg.seed = zone.seed; msg.cleared = zone.cleared; }
    if (zone.rift) msg.rift = zone.riftState();
    if (zone.type === 'town') { msg.structs = this.defense.list(); msg.defense = this.defense.view(); }
    send(p.ws, msg);
    send(p.ws, zone.snapshot());
    for (const h of zone.hazards.values()) send(p.ws, { t: 'hazard', h });
    if (zone.dungeon) send(p.ws, zone.dstate());
  }

  enterTarget(p, target) { if (target.type === 'rift') this.enterRift(p, target.k); else this.enterZone(p, 'dungeon'); }
  requestDungeon(p, target = { type: 'dungeon' }) {
    const cur = target.type === 'rift' ? this.currentRift && this.zones.get(this.currentRift) : this.currentDungeon && this.zones.get(this.currentDungeon);
    if (this.players.size === 1 || (cur && cur.players().length && (target.type !== 'rift' || cur.k === target.k))) return this.enterTarget(p, target);
    if (this.ready) return;
    this.ready = { by: p.id, yes: new Set([p.id]), t: 20, target };
    this.broadcast({ t: 'readyCheck', by: p.prof.name, byId: p.id, timeout: 20, target });
  }
  readyResp(p, yes) {
    const r = this.ready; if (!r) return;
    if (!yes) { this.ready = null; this.broadcast({ t: 'readyCancel', text: `${p.name} is not ready.` }); return; }
    r.yes.add(p.id);
    this.broadcast({ t: 'readyUpdate', ready: [...r.yes] });
    if ([...this.players.keys()].every((id) => r.yes.has(id))) {
      this.ready = null;
      this.broadcast({ t: 'readyGo' });
      for (const q of this.players.values()) this.enterTarget(q, r.target);
    }
  }

  openTrade(a, b) {
    const tr = { a, b, offer: { a: { items: [], gold: 0 }, b: { items: [], gold: 0 } }, acc: {} };
    a.trade = b.trade = tr;
    this.pushTrade(tr);
  }
  pushTrade(tr) { send(tr.a.ws, P.tradeView(tr, tr.a)); send(tr.b.ws, P.tradeView(tr, tr.b)); }
  closeTrade(tr, text) {
    tr.a.trade = tr.b.trade = null;
    for (const q of [tr.a, tr.b]) send(q.ws, { t: 'tradeClosed', text });
  }

  tick() {
    this.tickN++;
    this.defense.tick(DT);
    if (this.ready) { this.ready.t -= DT; if (this.ready.t <= 0) { this.ready = null; this.broadcast({ t: 'readyCancel', text: 'Ready check timed out.' }); } }
    for (const [key, z] of this.zones) {
      const n = z.players().length;
      if (n || z.type === 'town') z.tick(DT);
      if (z.type === 'dungeon' || z.type === 'rift') {
        z.emptyT = n ? 0 : z.emptyT + DT;
        if (z.emptyT > 120 || (z.emptyT > 3 && key !== this.currentDungeon && key !== this.currentRift)) this.zones.delete(key);
      }
    }
    for (const p of this.players.values()) { if (p.dirty) { p.dirty = false; send(p.ws, P.profileView(p)); db.touch(); } if (p.socialDirty && this.tickN % 10 === 0) { p.socialDirty = false; social.push(p); } }
    if (this.tickN % 3 === 0) {
      const plist = [...this.players.values()].map((p) => ({ id: p.id, name: p.prof.name, color: p.prof.color, cls: p.cls, zone: p.zone, x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry), anim: p.anim, hp: p.hp, maxHp: p.maxHp, gear: p.gear, level: p.char.level, dead: p.dead, spirit: p.spirit, emote: p.emote, block: p.block, mount: p.mount, cos: p.prof.cos, gtag: social.guildOf(p.prof)?.tag }));
      this.broadcast({ t: 'players', list: plist });
      for (const z of this.zones.values()) if (z.players().length) z.broadcast(this.fullSnapshots ? z.snapshot() : z.deltaSnapshot());
    }
    if (this.tickN % 10 === 0 && this.defense.state.phase !== 'day') this.town.broadcast(this.defense.view());
  }
}

let nextPlayer = 1;
const near = (p, pos, r) => dist(p, pos) < r;

function attach(ws) {
  let room = null, p = null;
  const notice = (text, color = '#ff6a5a') => send(ws, { t: 'notice', text, color });
  const ok = (err, okText, color) => { if (err) notice(err); else if (okText) notice(okText, color || '#5eea8a'); return !err; };
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello' && !p) {
      let token = TOKEN_RE.test(m.token || '') ? m.token : makeToken();
      let prof = db.get(token);
      if (!prof) { prof = P.newProfile(token); db.put(token, prof); }
      if (online.has(token)) { const old = online.get(token); send(old.ws, { t: 'error', text: 'Signed in from another tab.' }); old.ws.close(); }
      prof.name = String(m.name || prof.name || 'Hero').slice(0, 16);
      if (/^#[0-9a-f]{6}$/i.test(m.color || '')) prof.color = m.color;
      const cls = CLASSES[m.cls] ? m.cls : 'warden';
      const char = P.getChar(prof, cls);
      let code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) code = makeCode();
      room = rooms.get(code);
      if (!room) { room = new Room(code); room.public = !!m.public; rooms.set(code, room); }
      if (room.players.size >= 4) { send(ws, { t: 'error', text: 'Party is full (4 players max).' }); room = null; return; }
      p = { dmgWin: 0, dmgSum: 0, msgWin: Date.now(), msgN: 0, id: nextPlayer++, ws, token, prof, cls, char, zone: 'town', x: TOWN.spawn.x, y: 0, z: TOWN.spawn.z, ry: 0, anim: 0, hp: 100, maxHp: 100, gear: {}, dead: false, buffs: {}, loot: new Map(), shop: null, style: 0, spirit: false, trade: null, emote: null, block: false };
      p.roomCode = code; social.ensure(prof);
      online.set(token, p);
      room.players.set(p.id, p);
      db.touch();
      send(ws, { t: 'welcome', id: p.id, room: code, level: room.level, token });
      send(ws, P.profileView(p)); social.push(p); social.notifyFriends(p);
      room.broadcast({ t: 'chat', from: '★', text: `${prof.name} the ${CLASSES[cls].name} has joined the party.` });
      room.enterZone(p, 'town');
      return;
    }
    if (!p) return;
    // rate limiting: drop floods, disconnect abusive clients
    const tnow = Date.now();
    if (tnow - p.msgWin > 1000) { if (p.msgN > 400) { ws.close(1008, 'rate limit'); return; } p.msgWin = tnow; p.msgN = 0; }
    if (++p.msgN > 150) return;
    const zone = room.zones.get(p.zone);
    if (SOCIAL_T.has(m.t)) { const r = social.handle(p, m, { atStash: p.zone === 'town' && near(p, TOWN.stash, 6), atBoard: p.zone === 'town' && near(p, TOWN.board, 7), level: room.level }); if (typeof r === 'string') notice(r); return; }
    switch (m.t) {
      case 'state': {
        // server-side movement validation: speed budget + a refilling burst allowance for rolls, blinks and knockback.
        // Over-budget moves are clamped and the client is told to reconcile ('correct').
        let nx = +m.x || 0, nz = +m.z || 0;
        const now = Date.now();
        if (moveCheck && !p.dead && !m.dead && now > (p.mvGrace || 0) && p.mvT) {
          const dt = Math.min(1, (now - p.mvT) / 1000), d = Math.hypot(nx - p.x, nz - p.z), allow = MOVE_SPEED * dt + 0.6;
          p.burst = Math.min(BURST_MAX, (p.burst ?? BURST_MAX) + BURST_REFILL * dt);
          if (d > allow) {
            const extra = d - allow;
            if (extra <= p.burst) p.burst -= extra;
            else {
              const k = (allow + p.burst) / d; p.burst = 0;
              nx = p.x + (nx - p.x) * k; nz = p.z + (nz - p.z) * k;
              p.corrections = (p.corrections || 0) + 1;
              if (p.corrections % 10 === 1) logCheat({ room: room.code, name: p.prof.name, cls: p.cls, level: p.char.level, dmg: Math.round(d), cap: Math.round(allow + extra), capSec: 0, total: p.corrections, kind: 'move' });
              send(ws, { t: 'correct', seq: m.seq | 0, x: r2(nx), z: r2(nz) });
            }
          }
        }
        if (p.dead && !m.dead) p.mvGrace = now + 1500; // respawn teleports
        p.mvT = now;
        p.x = nx; p.y = +m.y || 0; p.z = nz; p.ry = +m.ry || 0; p.anim = m.anim | 0;
        p.hp = m.hp | 0; p.maxHp = m.maxHp | 0; p.dead = !!m.dead; p.gear = m.gear || p.gear;
        p.style = Math.max(0, Math.min(4, m.style | 0)); p.spirit = m.spirit | 0; p.emote = m.emote || null; p.block = !!m.block; p.mount = !!m.mount;
        break;
      }
      case 'zone': if (m.to === 'dungeon') room.requestDungeon(p); else room.enterZone(p, m.to); break;
      case 'rift': {
        const k = Math.max(1, m.k | 0);
        if (p.zone !== 'town' || !near(p, TOWN.obelisk, 7)) break;
        if (k > (p.prof.riftMax || 1)) { notice(`Your highest unlocked rift is level ${p.prof.riftMax || 1}.`); break; }
        room.requestDungeon(p, { type: 'rift', k });
        break;
      }
      case 'leaderboard': { const S = (db.data.leaderboard || {})[season()] || {}; send(ws, { t: 'leaderboard', season: season(), data: S, guilds: social.guildBoard() }); break; }
      case 'socket': if (p.zone === 'town' && near(p, TOWN.smith, 7)) ok(P.socket(p, m.src, m.ref, m.idx | 0, String(m.k)), 'Gem socketed!', '#5ab0ff'); break;
      case 'unsocket': if (p.zone === 'town' && near(p, TOWN.smith, 7)) ok(P.unsocket(p, m.src, m.ref, m.idx | 0)); break;
      case 'combine': if (p.zone === 'town' && near(p, TOWN.smith, 7)) ok(P.combineGem(p, String(m.k)), 'The gems fuse into something finer.', '#ffd34d'); break;
      case 'look': ok(P.setLook(p, m.look || {})); break;
      case 'saveLook': ok(P.saveLook(p, m.slot | 0), 'Look saved.', '#5eea8a'); break;
      case 'research': if (p.zone === 'town' && near(p, TOWN.wartable, 7)) ok(research(p, String(m.key)), 'Research complete!', '#5ab0ff'); break;
      case 'challenge': if (zone?.type === 'dark') zone.challengeKing(p); else if (zone?.region) zone.summonColossus(p); break;
      case 'talk':
        if (p.zone === 'town' && near(p, CAPTAIN, 6)) { send(ws, { t: 'dialog', who: 'Captain Bryn', i: (p.char.quest?.i || 0) }); room.questEvent(p, 'talk'); }
        else if (p.zone === 'peaks' && near(p, REGIONS.peaks.camp, 6) && (p.char.quest?.i || 0) === ACT1_END) { send(ws, { t: 'dialog', who: 'Scout Ilsa', i: ACT1_END }); room.questEvent(p, 'talk2'); }
        else if (p.zone === 'citadel' && near(p, REGIONS.citadel.gate, 6) && (p.char.quest?.i || 0) === ACT2_END) { send(ws, { t: 'dialog', who: 'Sir Corvin', i: ACT2_END }); room.questEvent(p, 'talk3'); }
        break;
      case 'relic': if (p.zone === 'peaks') zone.takeRelic(p, m.i | 0); break;
      // ---- fishing (server rolls the fish and validates the reel time) ----
      case 'fishStart': {
        if (p.zone !== 'town' || !nearLake(p.x, p.z) || p.fish) break;
        const delay = 1.8 + Math.random() * 4.2, k = rollFish(Math.random, isNight(hourAt(room.clock)));
        p.fish = { k, bite: Date.now() + delay * 1000 };
        send(ws, { t: 'fishBite', delay: Math.round(delay * 100) / 100, diff: FISH[k].diff });
        break;
      }
      case 'fishEnd': {
        const f = p.fish; p.fish = null;
        if (!f || !m.ok) { if (f) send(ws, { t: 'fishLost' }); break; }
        const since = (Date.now() - f.bite) / 1000;
        if (since < MIN_REEL || since > 40 || !nearLake(p.x, p.z)) { send(ws, { t: 'fishLost', text: 'The line snapped!' }); break; }
        const F = FISH[f.k], pf = (p.prof.fish ||= {});
        pf[f.k] = (pf[f.k] || 0) + 1;
        room.reward(p, F.gold, 10 + F.gold * 0.5, p.x, p.z, true); room.bounty(p, 'fish');
        let gem = null; if (F.gem) gem = P.dropGem(p, room.level + 4);
        send(ws, { t: 'fishCaught', k: f.k, n: pf[f.k], gem });
        p.dirty = true;
        break;
      }
      case 'companion': p.companion = m.kind === 'none' || m.on === false ? false : COMPANIONS[m.kind] ? m.kind : 'ilsa'; if (zone && zone.type !== 'town') { zone.removeAllies(p.id); const k = companionOf(p); if (k) zone.addAlly(p, k); } send(ws, { t: 'companion', kind: companionOf(p) }); break;
      case 'bell': if (p.zone === 'citadel') zone.ringBell(p, m.i | 0); break;
      case 'paragon': ok(P.spendParagon(p, String(m.key))); break;
      case 'readyResp': room.readyResp(p, !!m.yes); break;
      case 'hit': {
        const e = zone?.enemies.get(m.id);
        if (!e || dist(e, p) >= 24) break;
        const dmg = Math.max(0, +m.dmg || 0), cap = damageCap(p), now = Date.now();
        if (now - p.dmgWin > 1000) { p.dmgWin = now; p.dmgSum = 0; }
        if (dmg > cap.hit || p.dmgSum + dmg > cap.sec) { p.rejected = (p.rejected || 0) + 1; logCheat({ room: room.code, name: p.prof.name, cls: p.cls, level: p.char.level, dmg: Math.round(dmg), cap: Math.round(cap.hit), capSec: Math.round(cap.sec), total: p.rejected }); if (p.rejected % 20 === 1) console.warn(`[anticheat] rejected hit from ${p.prof.name} (${p.cls}): ${Math.round(dmg)} (cap ${Math.round(cap.hit)}/hit, ${Math.round(cap.sec)}/s), total rejected ${p.rejected}`); break; }
        p.dmgSum += dmg;
        zone.damageEnemy(e, dmg, p.id, m.crit, Math.max(-2, Math.min(4, +m.kb || 0)), Math.min(4, +m.stun || 0), p.x, p.z);
        break;
      }
      case 'taunt': zone?.taunt(p, Math.min(14, +m.r || 10), Math.min(8, +m.dur || 6)); break;
      case 'fx': zone?.broadcast({ ...m, t: 'fx', by: p.id }); break;
      case 'emote': zone?.broadcast({ t: 'emote', id: p.id, kind: String(m.kind).slice(0, 12) }); break;
      case 'build': ok(room.defense.build(p, m.kind, +m.x, +m.z)); break;
      case 'upgrade': ok(room.defense.upgrade(p, m.id)); break;
      case 'repair': ok(room.defense.repair(p, m.id)); break;
      case 'startNight': if (p.zone === 'town') room.defense.startNight(); break;
      case 'chat':
        if (/^\/w \S+ ./.test(m.text || '')) { const [, to, ...rest] = m.text.split(' '); const r = social.handle(p, { t: 'whisper', to, text: rest.join(' ') }, {}); if (typeof r === 'string') notice(r); break; }
        if (/^\/g ./.test(m.text || '')) { const r = social.guildChat(p, m.text.slice(3)); if (typeof r === 'string') notice(r); break; }
        if (dev && zone && /^\/weather (clear|rain|snow|ash)$/.test(m.text || '')) { zone.weather = m.text.split(' ')[1]; zone.weatherT = 600; zone.broadcast({ t: 'weather', kind: zone.weather, zone: zone.key }); break; }
        if (dev && /^\/(depth|gold|xp|wave|loot|gems|quest|hour) \d+$/.test(m.text || '')) {
          const [cmd, n] = m.text.slice(1).split(' ');
          if (cmd === 'depth') { room.level = Math.max(1, +n); room.currentDungeon = null; room.broadcast({ t: 'roomLevel', level: room.level }); }
          if (cmd === 'gold') { p.prof.gold += +n; p.dirty = true; }
          if (cmd === 'xp') P.addXp(p, +n, (mm) => send(ws, mm));
          if (cmd === 'loot') {
            const S = Object.entries(SETS).find(([, s]) => s.cls === p.cls);
            for (const slot of ['weapon', 'helm', 'chest', 'boots']) { const it = P.rollItem(p, room.level, { slot, rarity: 3, types: CLASSES[p.cls].weapons }); it.set = S[0]; it.name = S[1].name + ' ' + S[1].pieces[['weapon', 'helm', 'chest', 'boots'].indexOf(slot)]; p.char.bag.push(it); }
            for (let k = 0; k < +n; k++) p.char.bag.push(P.rollItem(p, room.level, { rarity: 4 }));
            p.dirty = true;
          }
          if (cmd === 'quest') { p.char.quest = { i: Math.min(+n, QUESTS.length), n: 0 }; if (+n >= ACT1_END) p.prof.peaks = true; if (+n >= ACT2_END) p.prof.citadel = true; p.dirty = true; }
          if (cmd === 'hour') { room.clockOffset = (room.clockOffset || 0) + ((((+n - hourAt(room.clock)) % 24) + 24) % 24) / 24 * 480; room.broadcast({ t: 'clock', clock: room.clock }); }
          if (cmd === 'gems') for (let k = 0; k < +n; k++) P.dropGem(p, room.level + 8);
          if (cmd === 'wave') { const d = room.defense.state; if (d.phase === 'day') room.defense.startNight(); d.wave = Math.max(0, +n - 1); d.phase = 'intermission'; d.timer = 2; }
          break;
        }
        room.broadcast({ t: 'chat', from: p.prof.name, color: p.prof.color, text: String(m.text || '').slice(0, 160) }); break;
      // ---- inventory & economy (server authoritative) ----
      case 'pickup': {
        const l = p.loot.get(m.id);
        if (!l || l.zone !== p.zone || dist(p, l) > 4) break;
        if (p.char.bag.length >= P.BAG_SIZE) { send(ws, { t: 'pickFail', id: m.id }); break; }
        p.loot.delete(m.id); p.char.bag.push(l.item); p.dirty = true;
        send(ws, { t: 'picked', id: m.id });
        break;
      }
      case 'chest': {
        const c = CHESTS.get(m.id);
        if (!c || p.zone !== 'town' || dist(p, c) > 4.5) break;
        if (Date.now() - (p.prof.chests[c.id] || 0) < 10 * 60 * 1000) { notice('The chest is empty… it refills in time.'); break; }
        p.prof.chests[c.id] = Date.now();
        room.giveLoot(p, room.level, { minRarity: 1, luck: 1.6 }, c.x + 1.5, c.z + 1.5);
        room.reward(p, 25 + 15 * room.level, 20, c.x, c.z);
        send(ws, { t: 'chestOpened', id: c.id });
        break;
      }
      case 'equip': ok(P.equip(p, m.i | 0)); break;
      case 'unequip': ok(P.unequip(p, String(m.slot))); break;
      case 'discard': ok(P.discard(p, m.i | 0)); break;
      case 'potion': if (p.char.potions > 0) { p.char.potions--; p.dirty = true; } break;
      case 'shopOpen':
        if (p.zone !== 'dark' || !near(p, DARK.merchant, 9)) break;
        p.shop ||= P.makeShop(room.level);
        send(ws, { t: 'shop', stock: p.shop });
        break;
      case 'buy': if (p.zone === 'dark' && ok(P.buy(p, m.i | 0), 'Purchased!', '#ffd34d')) send(ws, { t: 'shop', stock: p.shop }); break;
      case 'buySpecial': if (p.zone === 'dark') ok(P.buySpecial(p, m.kind === 'potion' ? 'potion' : 'cache', room.level), m.kind === 'potion' ? 'Potion purchased.' : 'The cache cracks open…', '#c77dff'); break;
      case 'reroll':
        if (p.zone !== 'dark') break;
        if (p.prof.gold < 25) { notice('Not enough gold.'); break; }
        p.prof.gold -= 25; p.dirty = true; p.shop = P.makeShop(room.level); send(ws, { t: 'shop', stock: p.shop });
        break;
      case 'sell': if (p.zone === 'dark' && near(p, DARK.merchant, 9)) ok(P.sell(p, m.i | 0)); else notice('Find the Hollow Merchant in the Dark World to sell.', '#c77dff'); break;
      case 'talent': ok(P.learn(p, String(m.id))); break;
      case 'talentReset': if (p.zone === 'town' && near(p, TOWN.trainer, 7)) ok(P.resetTalents(p), 'Talents reset.'); break;
      case 'salvage': if (p.zone === 'town' && near(p, TOWN.smith, 7)) ok(P.salvage(p, m.i | 0)); break;
      case 'reroll': if (p.zone === 'town' && near(p, TOWN.smith, 7)) ok(P.reroll(p, m.src, m.ref, String(m.key), room.level), 'The runes shift…', '#c77dff'); break;
      case 'upgradeItem': if (p.zone === 'town' && near(p, TOWN.smith, 7)) ok(P.upgradeItem(p, m.src, m.ref), 'Item level increased!', '#ffd34d'); break;
      case 'stash': if (p.zone === 'town' && near(p, TOWN.stash, 6)) ok(P.stashOp(p, m.op === 'put' ? 'put' : 'take', m.i | 0)); break;
      // ---- dungeon events ----
      case 'lever': if (zone?.dungeon) zone.pullLever(p, m.i | 0); break;
      case 'shrine': if (zone?.dungeon) zone.useShrine(p, m.i | 0); break;
      // ---- trading ----
      case 'tradeReq': {
        const q = room.players.get(m.to);
        if (!q || q === p || q.zone !== p.zone || dist(p, q) > 9 || q.trade || p.trade) { notice('They cannot trade right now.'); break; }
        q.tradeInvite = p.id;
        send(q.ws, { t: 'tradeInvite', from: p.id, name: p.prof.name });
        notice(`Trade request sent to ${q.prof.name}.`, '#ffd98a');
        break;
      }
      case 'tradeResp': {
        const q = room.players.get(p.tradeInvite); p.tradeInvite = null;
        if (!q) break;
        if (!m.yes || q.trade || p.trade) { send(q.ws, { t: 'notice', text: `${p.prof.name} declined the trade.`, color: '#ff6a5a' }); break; }
        room.openTrade(q, p);
        break;
      }
      case 'tradeOffer': {
        const tr = p.trade; if (!tr) break;
        const side = tr.a === p ? 'a' : 'b';
        const ids = (Array.isArray(m.items) ? m.items : []).filter((id) => p.char.bag.some((x) => x.id === id)).slice(0, 12);
        tr.offer[side] = { items: [...new Set(ids)], gold: Math.max(0, Math.min(p.prof.gold, m.gold | 0)) };
        tr.acc = {};
        room.pushTrade(tr);
        break;
      }
      case 'tradeAccept': {
        const tr = p.trade; if (!tr) break;
        tr.acc[tr.a === p ? 'a' : 'b'] = true;
        if (tr.acc.a && tr.acc.b) {
          const err = P.executeTrade(tr);
          room.closeTrade(tr, err || 'Trade complete!');
        } else room.pushTrade(tr);
        break;
      }
      case 'tradeCancel': if (p.trade) room.closeTrade(p.trade, `${p.prof.name} cancelled the trade.`); break;
    }
  });
  ws.on('close', () => {
    if (!room || !p) return;
    if (p.trade) room.closeTrade(p.trade, 'Trade cancelled.');
    room.players.delete(p.id);
    if (online.get(p.token) === p) online.delete(p.token);
    db.touch();
    room.broadcast({ t: 'left', id: p.id });
    social.notifyFriends(p);
    room.broadcast({ t: 'chat', from: '★', text: `${p.prof.name} left the party.` });
    if (room.ready) room.readyResp(p, true);
    if (room.players.size === 0) rooms.delete(room.code);
  });
}

  const timer = setInterval(() => { for (const r of rooms.values()) r.tick(); }, DT * 1000);
  const parties = () => [...rooms.values()].filter((r) => r.public && r.players.size < 4).map((r) => ({ code: r.code, depth: r.level, players: [...r.players.values()].map((p) => ({ name: p.prof.name, cls: p.cls, level: p.char.level })) }));
  // live-ops snapshot for the admin dashboard
  const admin = () => ({
    now: Date.now(), uptime: Math.round((Date.now() - started) / 1000), online: online.size,
    rooms: [...rooms.values()].map((r) => ({ code: r.code, depth: r.level, public: !!r.public, hour: Math.round(hourAt(r.clock) * 10) / 10, night: r.defense.state.phase !== 'day' ? { phase: r.defense.state.phase, wave: r.defense.state.wave } : null,
      zones: [...r.zones.values()].filter((z) => z.players().length || z.type === 'town').map((z) => ({ key: z.key, type: z.type, enemies: z.enemies.size, players: z.players().length, weather: z.weather })),
      players: [...r.players.values()].map((p) => ({ name: p.prof.name, cls: p.cls, level: p.char.level, zone: p.zone, hp: p.hp, maxHp: p.maxHp, dead: p.dead, rejected: p.rejected || 0, guild: social.guildOf(p.prof)?.tag || null })) })),
    anticheat: acLog.slice(-60).reverse(),
    guilds: Object.keys(db.data.guilds || {}).length, profiles: Object.keys(db.data.profiles || {}).length,
  });
  return { attach, rooms, parties, admin, stop: () => clearInterval(timer) };
}
