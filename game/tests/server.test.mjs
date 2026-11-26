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
  const e = c.ents.list.find((x) => x[1] !== 'boss' && x[1] !== 'goblin');
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
  assert.equal(p.char.quest.i, QUESTS.length, 'act II finished');
});
