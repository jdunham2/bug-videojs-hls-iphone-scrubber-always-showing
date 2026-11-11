// Three ways to reach a game, all with the same shape: { send(msg), close() } plus onmsg/onclose callbacks.
//  - connectWs:    the Node server (many rooms, anyone who can reach the server)
//  - connectLocal: the whole game runs in this tab, with bots
//  - connectRoom:  one tab hosts the game and shares it through a realtime "room" (used when published as an artifact)
import { makeRoom, joinRoom, leaveRoom, handleMessage, tickRoom, addBot, TICK } from '../shared/game.js';

export function connectWs(name, code, h, look) {
  return new Promise((resolve, reject) => {
    let open = false;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => {
      open = true;
      ws.send(JSON.stringify({ t: 'join', name, room: code, look }));
      resolve({ send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)), close: () => ws.close() });
    };
    ws.onmessage = (e) => h.onmsg(JSON.parse(e.data));
    ws.onerror = () => { if (!open) reject(new Error('no server')); };
    ws.onclose = () => { if (open) h.onclose('Disconnected from the server.'); };
  });
}

function hostGame(name, code, h, bots, onTick, look) {
  const room = makeRoom(code);
  const me = joinRoom(room, name, (m) => h.onmsg(m), look);
  for (let i = 0; i < bots; i++) addBot(room);
  let last = performance.now();
  const iv = setInterval(() => {
    const t = performance.now(), dt = Math.min(0.25, (t - last) / 1000);
    last = t;
    const snap = tickRoom(room, dt);
    if (onTick) onTick(snap);
  }, 1000 / TICK);
  return { room, me, send: (m) => handleMessage(room, me, m), close: () => clearInterval(iv) };
}

export function connectLocal(name, h, look, bots = 7) {
  return hostGame(name, 'SOLO', h, bots, null, look);
}

// ---------- realtime room ----------
// Everything travels in "presence": each tab publishes one small object that the platform shares with the others.
// The host publishes the game state, a short rolling log of events and the roster; guests publish their own
// position plus their recent actions. Presence is latest-value-wins, so a dropped update is simply replaced.
const isHost = (p) => !p.sameTab && p.presence && p.presence.hs === 1 && p.presence.host === 1;

export async function connectRoom(api, name, code, h, look) {
  code = String(code || 'PLAY').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PLAY';
  const nr = await api.join('dh-' + code.toLowerCase());
  const found = await new Promise((res) => {
    let un = null;
    const t = setTimeout(() => { if (un) un(); res(false); }, 2500);
    un = nr.onPeers((ch) => {
      if (!ch.peers.some(isHost)) return;
      clearTimeout(t);
      queueMicrotask(() => un && un());
      res(true);
    }, () => { clearTimeout(t); res(false); });
  });
  return found ? roomGuest(nr, name, code, h, look) : roomHost(nr, name, code, h, look);
}

function roomHost(nr, name, code, h, look) {
  const peers = new Map(); // peer label -> { pl, ac, ch, ls }
  let evs = [], seq = 0, roster = [], k = 0, dead = false, un = null;
  const pushEv = (to, m) => evs.push({ i: ++seq, to, m, at: Date.now() });

  const g = hostGame(name, code, h, 0, (snap) => {
    const t = Date.now();
    evs = evs.filter((e) => t - e.at < 4000);
    let out = evs.map((e) => ({ i: e.i, to: e.to, m: e.m }));
    while (out.length > 40 || JSON.stringify(out).length > 1700) out.shift();
    nr.presence({ hs: 1, host: 1, st: { ...snap, k: ++k }, ev: out, ro: roster, pm: [...peers].map(([peer, v]) => [peer, v.pl.id]) }).catch(() => {});
  }, look);
  g.room.tap = (m) => {
    if (m.t === 'st') return;
    if (m.t === 'ro') roster = m.p;
    else pushEv(0, m);
  };
  roster = [...g.room.players.values()].map((p) => ({ id: p.id, n: p.name, c: p.color, bot: p.bot, lk: p.look }));

  const stop = (reason) => {
    if (dead) return;
    dead = true;
    g.close();
    if (un) un();
    nr.leave().catch(() => {});
    if (reason) h.onclose(reason);
  };

  un = nr.onPeers((ch) => {
    if (dead) return;
    for (const p of ch.left) {
      const v = peers.get(p.peer);
      if (v) { leaveRoom(g.room, v.pl); peers.delete(p.peer); }
    }
    const mine = ch.peers.find((p) => p.sameTab);
    for (const p of ch.peers) {
      if (p.sameTab) continue;
      const pr = p.presence;
      if (!pr || pr.hs !== 1) continue;
      if (pr.host === 1) {
        // two tabs opened the room at the same moment: the one with the lower label keeps hosting
        if (mine && p.peer < mine.peer) return stop('Someone else is already hosting this room. Join again to play with them.');
        continue;
      }
      let v = peers.get(p.peer);
      if (!v) {
        if (typeof pr.n !== 'string') continue;
        const hold = {};
        const pl = joinRoom(g.room, pr.n, (m, bc) => { if (!bc && m.t !== 'welcome' && hold.id) pushEv(hold.id, m); }, pr.lk);
        if (!pl) continue;
        hold.id = pl.id;
        peers.set(p.peer, (v = { pl, ac: 0, ch: 0, ls: null, lk: pr.lk }));
      }
      const s = pr.s;
      if (s && typeof s === 'object' && s !== v.ls) { v.ls = s; handleMessage(g.room, v.pl, { t: 's', x: s.x, z: s.z, r: s.r, f: s.f, q: s.q, l: s.l }); }
      if (pr.lk !== v.lk) { v.lk = pr.lk; handleMessage(g.room, v.pl, { t: 'look', lk: pr.lk }); }
      if (Array.isArray(pr.ac)) for (const a of pr.ac) {
        if (!Array.isArray(a) || !(a[0] > v.ac)) continue;
        v.ac = a[0];
        handleMessage(g.room, v.pl, { t: 'a', a: a[1], x: a[2], z: a[3] });
      }
      if (Array.isArray(pr.ch) && pr.ch[0] > v.ch) { v.ch = pr.ch[0]; handleMessage(g.room, v.pl, { t: 'chat', m: pr.ch[1] }); }
    }
  }, () => stop('Lost the connection to the room.'));

  return { send: g.send, close: () => stop() };
}

function roomGuest(nr, name, code, h, look) {
  const mine = { hs: 1, n: name, lk: look, s: null, ac: [], ch: null };
  let aseq = 0, myPid = null, welcomed = false, lastK = -1, lastEv = 0, roStr = '', lost = null, dead = false, un = null;
  const publish = () => nr.presence(mine).catch(() => {});
  const stop = (reason) => {
    if (dead) return;
    dead = true;
    clearTimeout(lost);
    if (un) un();
    nr.leave().catch(() => {});
    if (reason) h.onclose(reason);
  };
  publish();
  const giveUp = setTimeout(() => { if (!welcomed) stop('Could not join that game. It may be full.'); }, 9000);

  un = nr.onPeers((ch) => {
    if (dead) return;
    const hp = ch.peers.find(isHost), self = ch.peers.find((p) => p.sameTab);
    if (!hp) {
      if (!lost) lost = setTimeout(() => stop('The host left, so the game ended.'), 4000);
      return;
    }
    clearTimeout(lost);
    lost = null;
    const pr = hp.presence;
    if (!self || !Array.isArray(pr.pm) || !pr.st || !Array.isArray(pr.st.p)) return;
    const row = pr.pm.find((e) => e[0] === self.peer);
    if (!row) return;
    const ev = Array.isArray(pr.ev) ? pr.ev : [];
    if (!welcomed) {
      const r = pr.st.p.find((a) => a[0] === row[1]);
      if (!r) return;
      welcomed = true;
      clearTimeout(giveUp);
      myPid = row[1];
      for (const e of ev) lastEv = Math.max(lastEv, e.i);
      h.onmsg({ t: 'welcome', id: myPid, room: code, x: r[1], z: r[2] });
    }
    const rs = JSON.stringify(pr.ro || []);
    if (rs !== roStr) { roStr = rs; h.onmsg({ t: 'ro', p: JSON.parse(rs) }); }
    if (pr.st.k !== lastK) { lastK = pr.st.k; h.onmsg(pr.st); }
    for (const e of ev) {
      if (!(e.i > lastEv)) continue;
      lastEv = e.i;
      if (e.to === 0 || e.to === myPid) h.onmsg(e.m);
    }
  }, () => stop('Lost the connection to the room.'));

  return {
    send(m) {
      if (m.t === 's') mine.s = { x: m.x, z: m.z, r: m.r, f: m.f, q: m.q, l: m.l };
      else if (m.t === 'look') mine.lk = m.lk;
      else if (m.t === 'a') mine.ac = [...mine.ac.slice(-5), [++aseq, m.a, m.x || 0, m.z || 0]];
      else if (m.t === 'chat') mine.ch = [++aseq, String(m.m).slice(0, 120)];
      else return;
      publish();
    },
    close: () => stop(),
  };
}
