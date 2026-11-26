// Server simulation tests: run with `npm test` (node:test, no browser or network needed).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, client, wait } from './harness.mjs';

const games = [];
const G = () => { const g = makeGame(); games.push(g); return g; };
after(() => games.forEach((g) => g.stop()));

test('new player gets a class starter profile and enters town', async () => {
  const c = client(G(), { cls: 'hexcaller' });
  await wait(20);
  assert.equal(c.prof.cls, 'hexcaller');
  assert.equal(c.prof.char.equipped.weapon.type, 'staff');
  assert.equal(c.zone.zone, 'town');
});

test('killing enemies pays gold and xp server-side', async () => {
  const c = client(G());
  await wait(20);
  c.send({ t: 'zone', to: 'dungeon' }); await wait(80);
  const gold0 = c.prof.gold;
  const e = c.ents.list.find((x) => !['boss', 'goblin', 'shieldbearer', 'burrower', 'matriarch', 'drake'].includes(x[1]));
  c.send({ t: 'state', x: e[2] + 1, y: 0, z: e[3], hp: 100, maxHp: 100 });
  c.send({ t: 'hit', id: e[0], dmg: e[5] });
  await wait(120);
  assert.ok(c.count('edie') >= 1, 'enemy died');
  assert.ok(c.prof.gold > gold0, 'gold increased');
});

test('absurd damage is rejected by the server budget', async () => {
  const c = client(G());
  await wait(20);
  c.send({ t: 'zone', to: 'dungeon' }); await wait(80);
  const boss = c.ents.list.find((x) => x[1] === 'boss');
  c.send({ t: 'state', x: boss[2] + 2, y: 0, z: boss[3], hp: 100, maxHp: 100 });
  c.send({ t: 'hit', id: boss[0], dmg: 999999 });
  await wait(80);
  assert.equal(c.count('ehit'), 0, 'hit was rejected');
});

test('lever puzzle opens the boss gate only in the right order', async () => {
  const c = client(G());
  await wait(20);
  c.send({ t: 'zone', to: 'dungeon' }); await wait(80);
  const d = c.dungeon();
  for (const i of d.leverOrder) { const L = d.levers[i]; c.send({ t: 'state', x: L.x + 1, y: 0, z: L.z, hp: 100, maxHp: 100 }); c.send({ t: 'lever', i }); }
  await wait(60);
  assert.ok(c.count('gateOpen') === 1);
});

test('gold cannot be spent beyond what the server holds', async () => {
  const c = client(G());
  await wait(20);
  c.send({ t: 'build', kind: 'tower', x: 10, z: 30 }); // 60 gold, profile starts with 60
  c.send({ t: 'build', kind: 'tower', x: 14, z: 30 });
  await wait(60);
  assert.equal(c.prof.gold, 0);
  assert.match(c.last.notice.text, /Need 60 gold/);
});

test('trading moves gold between players atomically', async () => {
  const g = G();
  const a = client(g); await wait(20);
  const b = client(g, { room: a.room }); await wait(20);
  a.send({ t: 'state', x: 0, y: 0, z: 13, hp: 100, maxHp: 100 }); b.send({ t: 'state', x: 2, y: 0, z: 13, hp: 100, maxHp: 100 });
  a.send({ t: 'tradeReq', to: b.id }); await wait(10);
  b.send({ t: 'tradeResp', yes: true }); await wait(10);
  a.send({ t: 'tradeOffer', items: [], gold: 25 }); await wait(10);
  a.send({ t: 'tradeAccept' }); b.send({ t: 'tradeAccept' }); await wait(60);
  assert.equal(a.prof.gold, 35); assert.equal(b.prof.gold, 85);
});

test('ember rift: progress, guardian, completion and keystone upgrade', { timeout: 60000 }, async () => {
  const c = client(G());
  await wait(20);
  c.send({ t: 'state', x: -12, y: 0, z: 5, hp: 100, maxHp: 100 });
  c.send({ t: 'chat', text: '/xp 400000' }); // levels up so damage budgets allow big test hits
  c.send({ t: 'rift', k: 1 }); await wait(80);
  assert.equal(c.zone.type, 'rift');
  for (let r = 0; r < 16 && !c.last.guardian; r++) {
    for (const e of c.ents.list.slice(0, 9)) { c.send({ t: 'state', x: e[2] + 1, y: 0, z: e[3], hp: 100, maxHp: 100 }); c.send({ t: 'hit', id: e[0], dmg: Math.min(e[5], 4000) }); }
    await wait(1050); // stay under the per-second damage budget
  }
  assert.ok(c.last.guardian, 'guardian spawned');
  await wait(3200); // boss intro
  const g = c.ents.list.find((x) => x[0] === c.last.guardian.id);
  c.send({ t: 'state', x: g[2] + 2, y: 0, z: g[3], hp: 100, maxHp: 100 });
  for (let k = 0; k < 8 && !c.last.riftDone; k++) { for (let h = 0; h < 4; h++) c.send({ t: 'hit', id: g[0], dmg: 1100 }); await wait(1050); }
  assert.ok(c.last.riftDone?.ok, 'rift completed in time');
  assert.ok(c.prof.riftMax >= 2, 'keystone upgraded');
});

test('quests advance from the right events only', async () => {
  const c = client(G());
  await wait(20);
  c.send({ t: 'state', x: 3.5, y: 0, z: 19, hp: 100, maxHp: 100 });
  c.send({ t: 'talk' }); await wait(40);
  assert.equal(c.prof.char.quest.i, 1);
  c.send({ t: 'zone', to: 'peaks' }); await wait(40);
  assert.match(c.last.notice.text, /sealed/);
});

test('message floods are throttled', async () => {
  const c = client(G());
  await wait(20);
  for (let i = 0; i < 300; i++) c.send({ t: 'chat', text: 'spam ' + i });
  await wait(40);
  assert.ok(c.count('chat') < 200, `only ${c.count('chat')} chat messages relayed`);
});

test('ranger starts with a bow; gems socket, combine and unsocket server-side', async () => {
  const c = client(G(), { cls: 'ranger' });
  await wait(120);
  assert.equal(c.prof.char.equipped.weapon.type, 'bow');
  c.send({ t: 'chat', text: '/gold 5000' }); c.send({ t: 'chat', text: '/loot 1' });
  await wait(120);
  const p = [...games.at(-1).rooms.values()][0].players.values().next().value;
  p.prof.gems = { ruby1: 3, emerald2: 1 }; p.dirty = true;
  c.send({ t: 'state', x: -9, y: 0, z: -2, hp: 100, maxHp: 100 });
  const i = c.prof.char.bag.findIndex((x) => x.sockets?.length);
  c.send({ t: 'combine', k: 'ruby1' }); await wait(120);
  assert.equal(c.prof.gems.ruby2, 1);
  if (i >= 0) {
    c.send({ t: 'socket', src: 'bag', ref: i, idx: 0, k: 'emerald2' }); await wait(120);
    assert.equal(c.prof.char.bag[i].sockets[0], 'emerald2');
    c.send({ t: 'socket', src: 'bag', ref: i, idx: 0, k: 'ruby2' }); await wait(120);
    assert.match(c.last.notice.text, /not empty/);
  }
  c.send({ t: 'look', look: { dye: '#2a3a8a', hideHelm: true, ap: 4 } }); await wait(120);
  assert.deepEqual(c.prof.char.look, { dye: '#2a3a8a', hideHelm: true, ap: 4 });
  c.send({ t: 'look', look: { dye: 'javascript:alert(1)' } }); await wait(120);
  assert.equal(c.prof.char.look.dye, null);
});

test('act II: companion joins, relics, and the 4-phase Storm Herald binds the Drake', { timeout: 60000 }, async () => {
  const { REGIONS, ACT1_END, QUESTS } = await import('../public/shared/regions.js');
  const game = G(), c = client(game, { cls: 'ranger' });
  await wait(20);
  const p = [...game.rooms.get(c.room).players.values()][0];
  p.char.quest = { i: ACT1_END, n: 0 }; p.prof.peaks = true;
  c.send({ t: 'chat', text: '/xp 400000' });
  c.send({ t: 'zone', to: 'peaks' }); await wait(60);
  assert.equal(c.zone.zone, 'peaks');
  const R = REGIONS.peaks;
  c.send({ t: 'state', x: R.camp.x + 1, y: 0, z: R.camp.z, hp: 100, maxHp: 100 });
  c.send({ t: 'talk' }); await wait(200);
  assert.equal(p.char.quest.i, ACT1_END + 1, 'talked to Ilsa');
  assert.equal(c.last.dialog.who, 'Scout Ilsa');
  assert.ok(c.ents.allies?.length === 1, 'companion follows');
  // companion goes down and is revived by standing next to her
  const zone = game.rooms.get(c.room).zones.get('peaks'), ally = [...zone.allies.values()][0];
  zone.hurtAlly(ally, 1e6); assert.ok(ally.dead);
  c.send({ t: 'state', x: ally.x + 1, y: 0, z: ally.z, hp: 100, maxHp: 100 }); await wait(2900);
  assert.ok(!ally.dead && c.last.allyUp, 'companion revived');
  // relics only count at the relic step, once each
  c.send({ t: 'state', x: R.relics[0].x, y: 0, z: R.relics[0].z, hp: 100, maxHp: 100 }); c.send({ t: 'relic', i: 0 }); await wait(40);
  assert.equal(p.char.quest.i, ACT1_END + 1, 'relic ignored before its step');
  p.char.quest = { i: QUESTS.findIndex((q) => q.kind === 'relic'), n: 0 };
  for (let i = 0; i < 3; i++) { c.send({ t: 'state', x: R.relics[i].x, y: 0, z: R.relics[i].z, hp: 100, maxHp: 100 }); c.send({ t: 'relic', i }); c.send({ t: 'relic', i }); await wait(30); }
  assert.equal(QUESTS[p.char.quest.i].kind, 'drake', 'three relics advance the quest');
  // the Herald
  p.char.quest = { i: QUESTS.findIndex((q) => q.kind === 'herald'), n: 0 };
  for (const e of [...zone.enemies.values()]) zone.remove(e);
  c.send({ t: 'state', x: R.summit.x, y: 0, z: R.summit.z, hp: 100, maxHp: 100 });
  c.send({ t: 'challenge' }); await wait(200);
  const h = [...zone.enemies.values()].find((e) => e.type === 'herald');
  assert.ok(h, 'herald summoned');
  await wait(3100);
  const hit = async (e, total) => { for (let done = 0; done < total && zone.enemies.has(e.id);) { c.send({ t: 'state', x: e.x + 2, y: 0, z: e.z, hp: 100, maxHp: 100 }); for (let k = 0; k < 4; k++) { c.send({ t: 'hit', id: e.id, dmg: 1000 }); done += 1000; } await wait(1050); } };
  await hit(h, h.maxHp * 0.3);
  assert.equal(h.phase, 2); assert.ok(h.invuln, 'herald immune while the Drake is bound');
  const hp = h.hp; c.send({ t: 'hit', id: h.id, dmg: 500 }); await wait(30); assert.equal(h.hp, hp, 'immune');
  const dr = [...zone.enemies.values()].find((e) => e.bound === h.id);
  assert.ok(dr, 'drake bound');
  dr.introT = 0; dr.flying = false; dr.strafe = null;
  while (zone.enemies.has(dr.id)) { dr.flying = false; dr.strafe = null; c.send({ t: 'state', x: dr.x + 2, y: 0, z: dr.z, hp: 100, maxHp: 100 }); for (let k = 0; k < 4; k++) c.send({ t: 'hit', id: dr.id, dmg: 1000 }); await wait(1050); }
  assert.ok(!h.invuln && h.hp < h.maxHp * 0.5, 'bond broken');
  while (zone.enemies.has(h.id)) { h.flying = false; h.strafe = null; c.send({ t: 'state', x: h.x + 2, y: 0, z: h.z, hp: 100, maxHp: 100 }); for (let k = 0; k < 4; k++) c.send({ t: 'hit', id: h.id, dmg: 1000 }); await wait(1050); }
  assert.ok(c.last.actComplete, 'act complete');
  assert.equal(p.char.quest.i, QUESTS.findIndex((q) => q.kind === 'herald') + 1, 'act II finished');
});

test('world clock and weather reach the client; fishing is validated server-side', async () => {
  const { TOWN } = await import('../public/shared/world.js');
  const game = G(), c = client(game);
  await wait(30);
  assert.ok(typeof c.zone.clock === 'number', 'clock sent on zone entry');
  assert.equal(c.zone.weather, 'clear');
  const room = game.rooms.get(c.room);
  // weather changes are broadcast and alter the zone's rules
  c.send({ t: 'zone', to: 'marsh' }); await wait(60);
  const marsh = room.zones.get('marsh'); marsh.weatherT = 0; await wait(120);
  assert.ok(c.last.weather, 'weather broadcast');
  marsh.weather = 'ash'; assert.equal(marsh.W.dmg, 1.15);
  c.send({ t: 'zone', to: 'town' }); await wait(60);
  // fishing: too far from the lake does nothing
  c.send({ t: 'fishStart' }); await wait(30);
  assert.equal(c.count('fishBite'), 0);
  const L = TOWN.lake;
  c.send({ t: 'state', x: L.x - 12, y: 0, z: L.z, hp: 100, maxHp: 100 });
  c.send({ t: 'fishStart' }); await wait(30);
  assert.equal(c.count('fishBite'), 1);
  c.send({ t: 'fishEnd', ok: true }); await wait(30); // instantly "reeled in": rejected
  assert.equal(c.count('fishCaught'), 0); assert.match(c.last.fishLost.text, /snapped/);
  c.send({ t: 'fishStart' }); await wait(30);
  const p = [...room.players.values()][0]; p.fish.bite = Date.now() - 2000; // pretend the bite happened 2s ago
  c.send({ t: 'fishEnd', ok: true }); await wait(120);
  assert.equal(c.count('fishCaught'), 1);
  assert.equal(Object.values(c.prof.fish).reduce((a, b) => a + b, 0), 1);
});

test('friends, whispers, guilds with a shared stash, bounties, seasons and the admin feed', async () => {
  const { TOWN } = await import('../public/shared/world.js');
  const { allBounties, SEASON_TRACK } = await import('../public/shared/social.js');
  const game = G();
  const a = client(game, { name: 'Ash' }), b = client(game, { name: 'Bryn', room: 'ZZZZ' });
  await wait(60);
  assert.ok(a.last.social?.tag && b.last.social?.tag, 'friend codes issued');
  const A = a.last.social.tag, B = b.last.social.tag;
  // friend request across rooms, accept, whisper
  a.send({ t: 'friendAdd', code: B }); await wait(30);
  assert.equal(b.last.social.requests[0].tag, A);
  b.send({ t: 'friendAccept', code: A }); await wait(30);
  assert.equal(a.last.social.friends[0].online, true);
  a.send({ t: 'chat', text: '/w Bryn meet me at the obelisk' }); await wait(30);
  assert.equal(b.last.whisper.text, 'meet me at the obelisk'); assert.equal(b.last.whisper.from, 'Ash');
  // guild: costs gold, invite by code, shared stash only at the stash chest
  a.send({ t: 'guildCreate', name: 'Ember Wardens', tag: 'EW' }); await wait(30);
  assert.match(a.last.notice.text, /costs 1000/);
  a.send({ t: 'chat', text: '/gold 2000' }); await wait(80);
  a.send({ t: 'guildCreate', name: 'Ember Wardens', tag: 'EW' }); await wait(30);
  assert.equal(a.last.social.guild.tag, 'EW');
  a.send({ t: 'guildInvite', code: B }); await wait(30);
  b.send({ t: 'guildAccept', id: b.last.social.guildInvites[0].id }); await wait(30);
  assert.equal(b.last.social.guild.members.length, 2);
  a.send({ t: 'guildStash', op: 'put', i: 0 }); await wait(30);
  assert.match(a.last.notice.text, /stash chest/);
  a.send({ t: 'chat', text: '/loot 1' }); await wait(80);
  a.send({ t: 'state', x: TOWN.stash.x, y: 0, z: TOWN.stash.z + 1, hp: 100, maxHp: 100 });
  a.send({ t: 'guildStash', op: 'put', i: 0 }); await wait(30);
  assert.equal(b.last.social.guild.stash.length, 1, 'guild-mate sees the deposit');
  a.send({ t: 'chat', text: '/g for the guild!' }); await wait(30);
  assert.equal(b.last.chat.text, 'for the guild!');
  // bounties: progress from real events, claim only when done and at the board
  const room = game.rooms.get(a.room), p = [...room.players.values()][0];
  const fishB = allBounties().find((x) => x.kind === 'kill') || allBounties()[0];
  room.bounty(p, fishB.kind, fishB.n, { zone: fishB.zone }); await wait(600);
  const vb = a.last.social.bounties.find((x) => x.id === fishB.id);
  assert.equal(vb.prog, fishB.n);
  a.send({ t: 'state', x: -20, y: 0, z: 10, hp: 100, maxHp: 100 });
  a.send({ t: 'bountyClaim', id: fishB.id }); await wait(30);
  assert.match(a.last.notice.text, /Bounty Board/);
  a.send({ t: 'state', x: TOWN.board.x, y: 0, z: TOWN.board.z + 1, hp: 100, maxHp: 100 });
  a.send({ t: 'bountyClaim', id: fishB.id }); a.send({ t: 'bountyClaim', id: fishB.id }); await wait(60);
  assert.equal(a.last.social.bounties.find((x) => x.id === fishB.id).claimed, true);
  const marks = a.last.social.season.marks;
  assert.equal(marks, fishB.reward.marks, 'claimed exactly once');
  // season track: locked until enough marks, then unlocks a cosmetic you can equip
  a.send({ t: 'seasonClaim', tier: 6 }); await wait(30);
  assert.match(a.last.notice.text, /Season Marks/);
  room.marks(p, 20); // e.g. from a rift clear
  a.send({ t: 'seasonClaim', tier: 0 }); await wait(30);
  assert.ok(a.last.social.cosmetics.includes(SEASON_TRACK[0].cos));
  a.send({ t: 'cosEquip', type: 'title', id: SEASON_TRACK[0].cos }); await wait(30);
  assert.equal(a.last.social.cos.title, SEASON_TRACK[0].cos);
  a.send({ t: 'cosEquip', type: 'aura', id: 'aura_storm' }); await wait(30);
  assert.match(a.last.notice.text, /not unlocked/);
  // admin feed: rooms, players and the anti-cheat log
  a.send({ t: 'chat', text: '/depth 1' });
  a.send({ t: 'hit', id: 999999, dmg: 1 });
  const ad0 = game.admin(); assert.equal(ad0.online, 2); assert.equal(ad0.rooms.length, 2);
  a.send({ t: 'zone', to: 'marsh' }); await wait(80);
  const e = room.zones.get('marsh').enemies.values().next().value;
  a.send({ t: 'state', x: e.x + 1, y: 0, z: e.z, hp: 100, maxHp: 100 }); a.send({ t: 'hit', id: e.id, dmg: 9e9 }); await wait(30);
  const ad = game.admin();
  assert.equal(ad.anticheat[0].name, 'Ash');
  assert.ok(ad.rooms.some((r) => r.players.some((pl) => pl.guild === 'EW')));
});

test('delta snapshots reproduce the full state; speed hacks are clamped and corrected', { timeout: 30000 }, async () => {
  // deltas: the client's reconstructed entity list matches the server's full snapshot
  const game = G(), c = client(game);
  await wait(20);
  c.send({ t: 'zone', to: 'marsh' }); await wait(100);
  const zone = game.rooms.get(c.room).zones.get('marsh');
  c.send({ t: 'state', x: 0, y: 0, z: 0, hp: 100, maxHp: 100 });
  await wait(1500); // ~10 broadcasts, mostly deltas
  assert.ok(c.count('entsD') > 3, 'deltas are sent');
  const full = zone.snapshot().list, mine = new Map(c.ents.list.map((r) => [r[0], r]));
  assert.equal(mine.size, full.length);
  for (const r of full) { const m = mine.get(r[0]); assert.ok(m, 'entity present'); assert.ok(Math.abs(m[2] - r[2]) < 0.6 && Math.abs(m[3] - r[3]) < 0.6, 'position within one tick'); assert.equal(m[6], r[6]); }
  // movement validation (on in production): a 60 m jump in 0.1 s is clamped and the client is told
  const { makeGame } = await import('./harness.mjs');
  const g2 = makeGame({ moveCheck: true }); games.push(g2);
  const d = client(g2); await wait(3200); // after the zone-entry grace window
  const p = [...g2.rooms.get(d.room).players.values()][0];
  d.send({ t: 'state', seq: 1, x: 0, y: 0, z: 13, hp: 100, maxHp: 100 }); await wait(100);
  d.send({ t: 'state', seq: 2, x: 2, y: 0, z: 13, hp: 100, maxHp: 100 }); await wait(100); // normal run
  assert.equal(d.count('correct'), 0);
  d.send({ t: 'state', seq: 3, x: 6, y: 0, z: 13, hp: 100, maxHp: 100 }); await wait(100); // a roll: uses burst
  assert.equal(d.count('correct'), 0, 'rolls and blinks fit the burst allowance');
  d.send({ t: 'state', seq: 4, x: 66, y: 0, z: 13, hp: 100, maxHp: 100 }); await wait(50);
  assert.equal(d.last.correct.seq, 4);
  assert.ok(p.x < 30, `clamped to ${p.x}`);
  assert.equal(g2.admin().anticheat[0].kind, 'move');
});

test('act III: Corvin tanks, tide bells need low water, the 5-phase King and its sigil puzzle', { timeout: 60000 }, async () => {
  const { REGIONS, ACT2_END, QUESTS, tideAt, LOW_TIDE } = await import('../public/shared/regions.js');
  const game = G(), c = client(game, { cls: 'warden' });
  await wait(20);
  const room = game.rooms.get(c.room), p = [...room.players.values()][0], R = REGIONS.citadel;
  c.send({ t: 'zone', to: 'citadel' }); await wait(40);
  assert.match(c.last.notice.text, /Act II/);
  p.char.quest = { i: ACT2_END, n: 0 }; p.prof.citadel = true;
  c.send({ t: 'chat', text: '/xp 400000' });
  c.send({ t: 'zone', to: 'citadel' }); await wait(80);
  c.send({ t: 'state', x: R.gate.x + 1, y: 0, z: R.gate.z, hp: 100, maxHp: 100 });
  c.send({ t: 'talk' }); await wait(250);
  assert.equal(c.last.dialog.who, 'Sir Corvin');
  assert.equal(c.ents.allies?.[0]?.[9], 1, 'Corvin follows');
  const zone = room.zones.get('citadel');
  // Corvin taunts packs onto himself
  for (const e of [...zone.enemies.values()]) zone.remove(e);
  const ally = [...zone.allies.values()][0]; ally.tauntCd = 0;
  const pack = [0, 1, 2].map((k) => zone.spawn('drowned', ally.x + 2 + k * 0.5, ally.z + 1, { aggro: true }));
  await wait(400);
  assert.ok(pack.some((e) => e.tauntAlly === ally.id), 'pack taunted');
  for (const e of [...zone.enemies.values()]) zone.remove(e);
  // tide bells
  p.char.quest = { i: QUESTS.findIndex((q) => q.kind === 'bell'), n: 0 };
  const setTide = (low) => { const now = (Date.now() - room.clock0) / 1000; room.clockOffset = (low ? 90 : 30) - now; };
  setTide(false); assert.ok(tideAt(room.clock) > LOW_TIDE);
  c.send({ t: 'state', x: R.bells[0].x, y: 0, z: R.bells[0].z, hp: 100, maxHp: 100 }); c.send({ t: 'bell', i: 0 }); await wait(40);
  assert.match(c.last.notice.text, /under the tide/);
  setTide(true);
  for (let i = 0; i < 3; i++) { c.send({ t: 'state', x: R.bells[i].x, y: 0, z: R.bells[i].z, hp: 100, maxHp: 100 }); c.send({ t: 'bell', i }); await wait(30); }
  assert.equal(QUESTS[p.char.quest.i].kind, 'event', 'three bells rung');
  // the Hollow King Reborn
  for (const e of [...zone.enemies.values()]) zone.remove(e);
  p.char.quest = { i: QUESTS.findIndex((q) => q.kind === 'king'), n: 0 };
  c.send({ t: 'state', x: R.throne.x, y: 0, z: R.throne.z + 3, hp: 100, maxHp: 100 }); c.send({ t: 'challenge' }); await wait(200);
  const k = [...zone.enemies.values()].find((e) => e.type === 'kingreborn'); assert.ok(k);
  k.introDone = true; k.introT = 0; zone.allies.clear();
  const smack = async (e, n) => { for (let i = 0; i < n && zone.enemies.has(e.id); i++) { e.introT = 0; c.send({ t: 'state', x: e.x + 2, y: 0, z: e.z, hp: 100, maxHp: 100 }); for (let h = 0; h < 4; h++) c.send({ t: 'hit', id: e.id, dmg: 1000 }); await wait(1050); } };
  while (k.phase < 3) await smack(k, 1);
  await wait(100);
  assert.ok(k.invuln && k.sigils, 'puzzle phase');
  const sig = () => k.sigils.ids.map((id) => zone.enemies.get(id));
  const order = k.sigils.order;
  const wrong = sig().find((s) => s.sigil !== order[0]);
  c.send({ t: 'state', x: wrong.x + 1, y: 0, z: wrong.z, hp: 100, maxHp: 100 }); c.send({ t: 'hit', id: wrong.id, dmg: 50 }); await wait(40);
  assert.ok(c.last.sigilFail, 'wrong rune resets');
  for (const i of order) { const s = sig().find((x) => x && x.sigil === i); c.send({ t: 'state', x: s.x + 1, y: 0, z: s.z, hp: 100, maxHp: 100 }); c.send({ t: 'hit', id: s.id, dmg: 50 }); await wait(40); }
  assert.ok(!k.invuln && c.last.sigilsDone, 'puzzle solved');
  for (const e of [...zone.enemies.values()]) if (e !== k) zone.remove(e);
  while (zone.enemies.has(k.id)) { k.strafe = null; await smack(k, 1); }
  assert.equal(c.last.actComplete?.act, 3);
  assert.equal(p.char.quest.i, QUESTS.length, 'act III complete');
});

test('endgame: Nightmare scaling, weekly Rift Trial with ranks and a replay, crafting 2.0, comparisons', { timeout: 60000 }, async () => {
  const { DIFFICULTY, trialOf, compareItem } = await import('../public/shared/endgame.js');
  const { TOWN } = await import('../public/shared/world.js');
  const game = G(), c = client(game);
  await wait(20);
  const room = game.rooms.get(c.room), p = [...room.players.values()][0];
  c.send({ t: 'difficulty', d: 2 }); await wait(30);
  assert.match(c.last.notice.text, /needs level/);
  c.send({ t: 'chat', text: '/xp 400000' }); await wait(60);
  c.send({ t: 'difficulty', d: 2 }); await wait(30);
  assert.equal(c.last.roomDiff.d, 2);
  c.send({ t: 'zone', to: 'dungeon' }); await wait(80);
  assert.equal(c.zone.diff, 2);
  const dz = room.zones.get(room.currentDungeon), sk = [...dz.enemies.values()].find((e) => e.type === 'skeleton' && !e.affix);
  if (sk) { const base = dz.spawn('skeleton', 0, 0); assert.equal(base.maxHp, sk.maxHp); dz.diff = 0; const norm = dz.spawn('skeleton', 0, 0); assert.ok(Math.abs(sk.maxHp / norm.maxHp - DIFFICULTY[2].hp) < 0.05, 'Nightmare II hp'); }
  c.send({ t: 'zone', to: 'town' }); await wait(60);
  // weekly trial: fixed seed and modifiers, recorded, ranked
  c.send({ t: 'state', x: TOWN.obelisk.x, y: 0, z: TOWN.obelisk.z + 2, hp: 100, maxHp: 100 });
  c.send({ t: 'trial' }); await wait(100);
  const T = trialOf();
  assert.equal(c.zone.seed, T.seed); assert.deepEqual(c.zone.rift.mods, T.mods); assert.ok(c.zone.trial);
  const tz = room.zones.get(room.currentTrial);
  for (let r = 0; r < 400 && !c.last.guardian; r++) { const e = [...tz.enemies.values()].find((x) => !x.guardian && !x.burrowed); if (e) { e.introT = 0; tz.damageEnemy(e, e.hp + 1, p.id); } await wait(8); }
  assert.ok(c.last.guardian, 'guardian');
  await wait(3200);
  const gd = tz.enemies.get(c.last.guardian.id);
  while (tz.enemies.has(gd.id)) { gd.introT = 0; gd.strafe = null; gd.flying = false; c.send({ t: 'state', x: gd.x + 2, y: 0, z: gd.z, hp: 100, maxHp: 100 }); for (let h = 0; h < 4; h++) c.send({ t: 'hit', id: gd.id, dmg: 1100 }); await wait(1050); }
  assert.ok(c.last.trialDone?.ok && c.last.trialDone.rank === 1 && c.last.trialDone.best);
  c.send({ t: 'trialBoard' }); c.send({ t: 'trialReplay' }); await wait(60);
  assert.equal(c.last.trialBoard.list[0].names[0], 'Tester'); assert.ok(c.last.trialBoard.replay);
  const R = c.last.trialReplay.replay;
  assert.ok(R.frames.length > 20 && R.types.length > 0 && Object.keys(R.players).length === 1, 'replay frames recorded');
  // crafting at the smith
  c.send({ t: 'zone', to: 'town' }); await wait(60);
  c.send({ t: 'state', x: TOWN.smith.x + 1, y: 0, z: TOWN.smith.z, hp: 100, maxHp: 100 });
  p.prof.mats = { shards: 5000, cores: 20, essence: 10 }; p.prof.gold = 50000;
  const bag0 = p.char.bag.length;
  c.send({ t: 'craftRecipe', key: 'n_dread', slot: 'helm' }); await wait(30);
  const crafted = p.char.bag.at(-1);
  assert.equal(p.char.bag.length, bag0 + 1); assert.equal(crafted.leg, 'n_dread'); assert.equal(p.prof.mats.essence, 5);
  const key = Object.keys(crafted.affixes)[0];
  c.send({ t: 'enchantRoll', src: 'bag', ref: p.char.bag.length - 1, key }); await wait(30);
  assert.equal(c.last.enchantOpts.opts.length, 3);
  const pick = c.last.enchantOpts.opts[2];
  c.send({ t: 'enchantPick', idx: 2 }); await wait(30);
  assert.equal(crafted.affixes[pick.k], pick.v); assert.equal(crafted.enchKey, pick.k);
  const other = Object.keys(crafted.affixes).find((k) => k !== pick.k);
  if (other) { c.send({ t: 'enchantRoll', src: 'bag', ref: p.char.bag.length - 1, key: other }); await wait(30); assert.match(c.last.notice.text, /can be enchanted/); }
  c.send({ t: 'chat', text: '/loot 0' }); await wait(80); // gives a full class set
  const si = p.char.bag.findIndex((it) => it.set);
  c.send({ t: 'transmute', src: 'bag', ref: si, set: 'warlord', slot: 'boots' }); await wait(30);
  assert.equal(p.char.bag[si].set, 'warlord'); assert.equal(p.char.bag[si].slot, 'boots');
  // comparison math: a much better weapon raises DPS
  const better = { ...p.char.equipped.weapon, dmg: p.char.equipped.weapon.dmg * 3, id: 'x' };
  assert.ok(compareItem(p.char, p.cls, better).dpsPct > 1);
});

test('combat depth: elemental combos, counters on heavy blows, training dummies', { timeout: 30000 }, async () => {
  const game = G(), c = client(game);
  await wait(20);
  c.send({ t: 'chat', text: '/xp 400000' });
  c.send({ t: 'zone', to: 'marsh' }); await wait(80);
  const room = game.rooms.get(c.room), z = room.zones.get('marsh');
  for (const e of [...z.enemies.values()]) z.remove(e);
  const mk = (x) => { const e = z.spawn('brute', x, 30, { introDone: true }); e.st = { wet: 0, burn: 0, oil: 0 }; return e; };
  const hit = (e, el, dmg = 20) => { c.send({ t: 'state', x: e.x + 1, y: 0, z: e.z, hp: 100, maxHp: 100 }); c.send({ t: 'hit', id: e.id, dmg, el }); };
  // shock: wet + storm stuns, adds damage and arcs to a wet neighbour
  const a = mk(0), b = mk(2); a.st.wet = 5; b.st.wet = 5;
  const ha = a.hp, hb = b.hp; hit(a, 'storm'); await wait(30);
  assert.equal(c.last.combo.kind, 'shock'); assert.ok(a.stunT > 0.5); assert.ok(ha - a.hp >= 28, 'bonus damage'); assert.ok(b.hp < hb, 'arc'); assert.equal(a.st.wet, 0);
  // explosion: oil + fire hits everything nearby
  const o = mk(20), n = mk(21.5); a.stunT = 0;
  hit(o, 'oil'); await wait(20); assert.ok(o.st.oil > 0);
  const hn = n.hp; hit(o, 'fire'); await wait(30);
  assert.equal(c.last.combo.kind, 'explode'); assert.ok(n.hp < hn, 'explosion splash');
  // steam: wet + fire blinds (enemies deal 40% less)
  const s = mk(40); s.st.wet = 5; hit(s, 'fire'); await wait(30);
  assert.equal(c.last.combo.kind, 'steam'); assert.ok(s.blindT > 3);
  // plain fire burns over time
  const f = mk(60); const hf = f.hp; hit(f, 'fire', 40); await wait(1200);
  assert.ok(hf - f.hp > 40, 'burn ticks'); assert.ok(c.msgs.some((m) => m.t === 'ehit' && m.dot === 'burn'));
  // counters: only right after a heavy windup, once per attack
  const h = mk(80);
  c.send({ t: 'counter', id: h.id }); await wait(20);
  assert.ok(!c.last.countered, 'no counter without an attack');
  h.parryable = true; h.lastAtk = Date.now();
  c.send({ t: 'state', x: h.x + 1, y: 0, z: h.z, hp: 100, maxHp: 100 }); c.send({ t: 'counter', id: h.id }); c.send({ t: 'counter', id: h.id }); await wait(30);
  assert.equal(c.count('countered'), 1); assert.ok(h.stunT > 1.5 && h.exposedT > 3);
  const he = h.hp; c.send({ t: 'hit', id: h.id, dmg: 100 }); await wait(20); assert.ok(he - h.hp >= 149, 'exposed: +50% damage');
  // training grounds: dummies take hits forever and pay nothing
  c.send({ t: 'zone', to: 'training' }); await wait(80);
  assert.equal(c.ents.list.filter((r) => r[1] === 'dummy').length, 3);
  const d = c.ents.list.find((r) => r[1] === 'dummy'), g0 = c.prof.gold;
  c.send({ t: 'state', x: d[2] + 1, y: 0, z: d[3], hp: 100, maxHp: 100 });
  for (let i = 0; i < 5; i++) c.send({ t: 'hit', id: d[0], dmg: 300 }); await wait(120);
  assert.ok(c.msgs.filter((m) => m.t === 'ehit' && m.id === d[0]).length >= 1);
  assert.equal(c.count('edie'), c.msgs.filter((m) => m.t === 'edie').length); assert.ok(room.zones.get('training').enemies.has(d[0]), 'dummy survives');
  assert.equal(c.prof.gold, g0);
});
