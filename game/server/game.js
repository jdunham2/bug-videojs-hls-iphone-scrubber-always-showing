// Emberfall game simulation: rooms, players and message handling. Runs under Node (server.js) or in the browser (offline/solo build).
import { CLASSES } from '../public/shared/classes.js';
import { TOWN, DARK, townLayout } from '../public/shared/world.js';
import { Zone, send } from './zone.js';
import { Defense } from './defense.js';
import * as P from './profile.js';

const TOKEN_RE = /^[a-f0-9]{32}$/;
export { TOKEN_RE };

export function createGame({ db, makeToken, dev = false }) {
const rooms = new Map();
const online = new Map(); // token -> player
const DT = 0.05;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => Math.round(v * 100) / 100;
const CHESTS = new Map(townLayout().chests.map((c) => [c.id, c]));

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.level = 1; this.nextId = 1; this.zones = new Map();
    this.currentDungeon = null; this.ready = null; this.tickN = 0;
    this.zones.set('town', new Zone(this, 'town', 'town', 1));
    this.zones.set('dark', new Zone(this, 'dark', 'dark', 1));
    this.defense = new Defense(this);
  }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
  get town() { return this.zones.get('town'); }

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
    } else zone = this.zones.get(type === 'dark' ? 'dark' : 'town');
    if (p.trade) this.closeTrade(p.trade, 'Trade cancelled.');
    p.zone = zone.key;
    p.loot.clear();
    const msg = { t: 'enterZone', zone: zone.key, type: zone.type, level: zone.type === 'dungeon' ? zone.level : this.level };
    if (zone.dungeon) { msg.seed = zone.seed; msg.cleared = zone.cleared; }
    if (zone.type === 'town') { msg.structs = this.defense.list(); msg.defense = this.defense.view(); }
    send(p.ws, msg);
    send(p.ws, zone.snapshot());
    for (const h of zone.hazards.values()) send(p.ws, { t: 'hazard', h });
    if (zone.dungeon) send(p.ws, zone.dstate());
  }

  requestDungeon(p) {
    const cur = this.currentDungeon && this.zones.get(this.currentDungeon);
    if (this.players.size === 1 || (cur && cur.players().length)) return this.enterZone(p, 'dungeon');
    if (this.ready) return;
    this.ready = { by: p.id, yes: new Set([p.id]), t: 20 };
    this.broadcast({ t: 'readyCheck', by: p.name, byId: p.id, timeout: 20 });
  }
  readyResp(p, yes) {
    const r = this.ready; if (!r) return;
    if (!yes) { this.ready = null; this.broadcast({ t: 'readyCancel', text: `${p.name} is not ready.` }); return; }
    r.yes.add(p.id);
    this.broadcast({ t: 'readyUpdate', ready: [...r.yes] });
    if ([...this.players.keys()].every((id) => r.yes.has(id))) {
      this.ready = null;
      this.broadcast({ t: 'readyGo' });
      for (const q of this.players.values()) this.enterZone(q, 'dungeon');
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
      if (z.type === 'dungeon') {
        z.emptyT = n ? 0 : z.emptyT + DT;
        if (z.emptyT > 120 || (z.emptyT > 3 && key !== this.currentDungeon)) this.zones.delete(key);
      }
    }
    for (const p of this.players.values()) if (p.dirty) { p.dirty = false; send(p.ws, P.profileView(p)); db.touch(); }
    if (this.tickN % 3 === 0) {
      const plist = [...this.players.values()].map((p) => ({ id: p.id, name: p.prof.name, color: p.prof.color, cls: p.cls, zone: p.zone, x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry), anim: p.anim, hp: p.hp, maxHp: p.maxHp, gear: p.gear, level: p.char.level, dead: p.dead, spirit: p.spirit, emote: p.emote, block: p.block }));
      this.broadcast({ t: 'players', list: plist });
      for (const z of this.zones.values()) if (z.players().length) z.broadcast(z.snapshot());
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
      if (!room) { room = new Room(code); rooms.set(code, room); }
      if (room.players.size >= 4) { send(ws, { t: 'error', text: 'Party is full (4 players max).' }); room = null; return; }
      p = { id: nextPlayer++, ws, token, prof, cls, char, zone: 'town', x: TOWN.spawn.x, y: 0, z: TOWN.spawn.z, ry: 0, anim: 0, hp: 100, maxHp: 100, gear: {}, dead: false, buffs: {}, loot: new Map(), shop: null, style: 0, spirit: false, trade: null, emote: null, block: false };
      online.set(token, p);
      room.players.set(p.id, p);
      db.touch();
      send(ws, { t: 'welcome', id: p.id, room: code, level: room.level, token });
      send(ws, P.profileView(p));
      room.broadcast({ t: 'chat', from: '★', text: `${prof.name} the ${CLASSES[cls].name} has joined the party.` });
      room.enterZone(p, 'town');
      return;
    }
    if (!p) return;
    const zone = room.zones.get(p.zone);
    switch (m.t) {
      case 'state':
        p.x = +m.x || 0; p.y = +m.y || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.anim = m.anim | 0;
        p.hp = m.hp | 0; p.maxHp = m.maxHp | 0; p.dead = !!m.dead; p.gear = m.gear || p.gear;
        p.style = Math.max(0, Math.min(4, m.style | 0)); p.spirit = m.spirit | 0; p.emote = m.emote || null; p.block = !!m.block;
        break;
      case 'zone': if (m.to === 'dungeon') room.requestDungeon(p); else room.enterZone(p, m.to); break;
      case 'readyResp': room.readyResp(p, !!m.yes); break;
      case 'hit': {
        const e = zone?.enemies.get(m.id);
        if (e && dist(e, p) < 24) zone.damageEnemy(e, Math.min(100000, Math.max(0, +m.dmg || 0)), p.id, m.crit, Math.min(4, +m.kb || 0), Math.min(4, +m.stun || 0), p.x, p.z);
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
        if (dev && /^\/(depth|gold|xp|wave) \d+$/.test(m.text || '')) {
          const [cmd, n] = m.text.slice(1).split(' ');
          if (cmd === 'depth') { room.level = Math.max(1, +n); room.currentDungeon = null; room.broadcast({ t: 'roomLevel', level: room.level }); }
          if (cmd === 'gold') { p.prof.gold += +n; p.dirty = true; }
          if (cmd === 'xp') P.addXp(p, +n, (mm) => send(ws, mm));
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
    room.broadcast({ t: 'chat', from: '★', text: `${p.prof.name} left the party.` });
    if (room.ready) room.readyResp(p, true);
    if (room.players.size === 0) rooms.delete(room.code);
  });
}

  const timer = setInterval(() => { for (const r of rooms.values()) r.tick(); }, DT * 1000);
  return { attach, rooms, stop: () => clearInterval(timer) };
}
