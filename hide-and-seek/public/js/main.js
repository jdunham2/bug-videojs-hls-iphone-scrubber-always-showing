// Dusk Hollow client: networking, input, first-person movement and HUD.
import { getWorld, collide, SPEED, STAM, NOISE_RANGE, HALF, F_SPRINT, F_CROUCH, F_MOVE, F_USE, F_WIND } from '/shared/world.js';
import { Gfx, COLORS } from './gfx.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const W = getWorld();
const canvas = $('c');
const gfx = new Gfx(canvas, W);
const sfx = new Sfx();
const css = (i) => '#' + COLORS[i % COLORS.length].toString(16).padStart(6, '0');

let ws = null, myId = null, roomCode = '';
const roster = new Map(); // id -> {n, c, bot}
const players = new Map(); // id -> live state
const G = { ph: 'lobby', tl: 0, host: null, res: 0, ct: new Set(), w: null, at: 0 };
const me = { x: 0, z: -5, yaw: 0, pitch: 0, stam: 100, wind: 0, crouch: false, q: 0, eye: 1.6, bob: 0, stepD: 0 };
const keys = {};
let locked = false, chatOpen = false, lastSend = 0, lastHud = 0, heartT = 0, tauntCd = 0, bannerT = 0;
window.__g = { me, players, G, gfx };

// ---------- menu ----------
const params = new URLSearchParams(location.search);
$('room').value = (params.get('room') || '').toUpperCase();
$('name').value = localStorage.getItem('dh_name') || '';
$('join').onclick = join;
for (const id of ['name', 'room']) $(id).addEventListener('keydown', (e) => e.key === 'Enter' && join());

function join() {
  if (ws) return;
  sfx.init();
  const name = $('name').value.trim() || 'Player' + ((Math.random() * 90 + 10) | 0);
  try { localStorage.setItem('dh_name', name); } catch {}
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, room: $('room').value }));
  ws.onmessage = (e) => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    ws = null;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const id of ['lobby', 'results', 'hud']) $(id).classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('err').textContent = myId ? 'Disconnected from the server.' : $('err').textContent || 'Could not connect.';
    for (const id of players.keys()) gfx.removeAvatar(id);
    players.clear(); roster.clear(); myId = null;
  };
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

// ---------- network ----------
function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      myId = m.id; roomCode = m.room;
      me.x = m.x; me.z = m.z; me.q = 0;
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('code').textContent = roomCode;
      history.replaceState(null, '', '?room=' + roomCode);
      refreshOverlays();
      break;
    case 'err': $('err').textContent = m.m; break;
    case 'ro': {
      const ids = new Set(m.p.map((p) => p.id));
      for (const id of [...roster.keys()]) if (!ids.has(id)) { roster.delete(id); players.delete(id); gfx.removeAvatar(id); }
      for (const p of m.p) if (!roster.has(p.id)) { roster.set(p.id, p); if (p.id !== myId) gfx.addAvatar(p.id, p.c, p.n); }
      renderLobby();
      break;
    }
    case 'st': onState(m); break;
    case 'tp': me.x = m.x; me.z = m.z; me.q = m.q; break;
    case 'feed': feed(m.m, m.k === 'big' ? '' : m.k); if (m.k === 'big') banner(m.m); break;
    case 'chat': { const r = roster.get(m.id); feed(m.m, 'chat', r ? r.n : '?'); break; }
    case 'noise': onNoise(m); break;
    case 'coin': if (m.w === myId) { sfx.coin(); feed('+10 coin', 'good'); } break;
    case 'caught':
      if (m.w === myId) { sfx.caught(); banner('CAUGHT! Wait for a rescue…'); } else if (m.b === myId) { sfx.win(); banner('Got one! +100'); } else sfx.thud();
      break;
    case 'freed': sfx.freed(); break;
    case 'search': if (m.id === myId) { sfx.stun(); banner('Empty! You are dazed…'); } break;
    case 'rock': gfx.throwRock(m.fx, m.fz, m.x, m.z); break;
    case 'round': me.stam = 100; me.wind = 0; break;
    case 'end': onEnd(m.w); break;
  }
}

function onState(m) {
  const prev = G.ph, prevHost = G.host;
  G.ph = m.ph; G.tl = m.tl; G.host = m.host; G.res = m.res; G.w = m.w; G.at = performance.now();
  G.ct = new Set(m.ct);
  gfx.setCoins(G.ct);
  for (const a of m.p) {
    let p = players.get(a[0]);
    if (!p) players.set(a[0], (p = { id: a[0], fd: 0, side: 1 }));
    p.x = a[1]; p.z = a[2]; p.r = a[3]; p.f = a[4]; p.role = a[5]; p.st = a[6]; p.hid = a[7]; p.sc = a[8]; p.fx = a[9]; p.rocks = a[10];
  }
  if (prev !== G.ph) onPhase(prev);
  else if (prevHost !== G.host && !locked) renderLobby();
}

function onPhase(prev) {
  const p = players.get(myId);
  if (G.ph === 'hide') { sfx.horn(); $('results').classList.add('hidden'); }
  if (G.ph === 'seek') { sfx.horn(); if (p && p.role === 1) banner('GO! Find them all'); }
  if (G.ph === 'lobby') { $('results').classList.add('hidden'); renderLobby(); }
  refreshOverlays();
}

function onEnd(w) {
  const p = players.get(myId), won = p && (p.role === 1) === (w === 'seekers');
  won ? sfx.win() : sfx.lose();
  $('resTitle').textContent = w === 'seekers' ? 'SEEKERS WIN' : 'HIDERS WIN';
  $('resSub').textContent = w === 'seekers' ? 'Everyone was caught.' : 'Somebody survived until the bell.';
  setTimeout(() => {
    const ul = $('resList');
    ul.textContent = '';
    [...players.values()].sort((a, b) => b.sc - a.sc).forEach((q, i) => {
      const r = roster.get(q.id);
      if (!r) return;
      ul.append(row(r, `${i === 0 ? '👑 ' : ''}${r.n}`, q.sc + ' pts'));
    });
    $('results').classList.remove('hidden');
  }, 200);
}

function onNoise(m) {
  const d = Math.hypot(m.x - me.x, m.z - me.z), range = NOISE_RANGE[m.k];
  if (m.k === 'taunt') sfx.taunt();
  if (d > range) return;
  const p = players.get(myId), seeker = p && p.role === 1;
  const col = { run: 0xffffff, breath: 0x9fd8ff, taunt: 0xff66cc, rock: 0xffd27a }[m.k];
  gfx.ring(m.x, m.z, m.k === 'run' ? 2.2 : m.k === 'breath' ? 1.4 : 5, col, m.k === 'run' ? 0.8 : 1.4);
  if (m.k === 'rock') sfx.thud();
  if (seeker && m.id !== myId) { gfx.ping(m.x, m.z); sfx.ping(Math.max(0.25, 1 - d / range)); }
}

// ---------- HUD helpers ----------
function row(r, text, right, cls) {
  const li = document.createElement('li'), dot = document.createElement('span'), nm = document.createElement('span'), s = document.createElement('span');
  dot.className = 'dot'; dot.style.background = css(r.c);
  nm.textContent = text; s.className = 's'; s.textContent = right;
  if (cls) li.className = cls;
  li.append(dot, nm, s);
  return li;
}
function feed(text, cls = '', who) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  if (who) { const b = document.createElement('b'); b.textContent = who + ': '; d.append(b); }
  d.append(text);
  $('feed').append(d);
  setTimeout(() => d.remove(), 7000);
  while ($('feed').children.length > 6) $('feed').firstChild.remove();
}
function banner(text) {
  $('banner').textContent = text;
  $('banner').classList.add('show');
  bannerT = performance.now() + 2600;
}

function renderLobby() {
  const ul = $('plist');
  ul.textContent = '';
  for (const [id, r] of roster) {
    const p = players.get(id);
    ul.append(row(r, r.n + (id === G.host ? ' ★' : '') + (r.bot ? ' 🤖' : '') + (id === myId ? ' (you)' : ''), p ? p.sc + ' pts' : ''));
  }
  const host = G.host === myId, lobby = G.ph === 'lobby';
  $('lobbyTitle').textContent = lobby ? 'Lobby' : 'Paused — the round is still running!';
  $('hostRow').classList.toggle('hidden', !(host && lobby));
  $('waitMsg').textContent = lobby && !host ? 'Waiting for the host to start the round…' : '';
  $('resume').textContent = lobby ? 'Explore the map' : 'Back to the game';
}
function refreshOverlays() {
  if (!myId) return;
  $('lobby').classList.toggle('hidden', locked);
  if (!locked) renderLobby();
}

$('copy').onclick = () => {
  const url = location.origin + location.pathname + '?room=' + roomCode;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => ($('copy').textContent = 'Copied!'), () => prompt('Invite link', url));
  setTimeout(() => ($('copy').textContent = 'Copy invite link'), 1500);
};
$('addBot').onclick = () => { sfx.click(); send({ t: 'lobby', a: 'addBot' }); };
$('delBot').onclick = () => { sfx.click(); send({ t: 'lobby', a: 'delBot' }); };
$('start').onclick = () => { send({ t: 'lobby', a: 'start' }); lock(); };
$('resume').onclick = lock;
function lock() { sfx.init(); const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); }
canvas.addEventListener('click', () => { if (myId && !locked) lock(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  for (const k in keys) keys[k] = false;
  refreshOverlays();
});

// ---------- input ----------
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  me.yaw -= e.movementX * 0.0023;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * 0.0023));
});
document.addEventListener('mousedown', (e) => { if (locked && e.button === 0) tag(); });
function tag() {
  const p = players.get(myId);
  if (!p || p.role !== 1 || G.ph !== 'seek') return;
  gfx.swing(); sfx.swing();
  send({ t: 'a', a: 'tag' });
}
document.addEventListener('keydown', (e) => {
  if (!myId) return;
  const chat = $('chat');
  if (chatOpen) {
    if (e.key === 'Enter') { if (chat.value.trim()) send({ t: 'chat', m: chat.value }); chat.value = ''; }
    if (e.key === 'Enter' || e.key === 'Escape') { chatOpen = false; chat.classList.remove('open'); chat.blur(); e.preventDefault(); }
    return;
  }
  if (e.code === 'Enter' && locked) { chatOpen = true; chat.classList.add('open'); chat.focus(); for (const k in keys) keys[k] = false; e.preventDefault(); return; }
  if (!locked) return;
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  const p = players.get(myId);
  if (!p) return;
  if (e.code === 'KeyE') send({ t: 'a', a: 'use' });
  else if (e.code === 'KeyF') tag();
  else if (e.code === 'KeyT' && p.role === 0 && G.ph === 'seek' && !p.st && performance.now() > tauntCd) { tauntCd = performance.now() + 10000; send({ t: 'a', a: 'taunt' }); }
  else if (e.code === 'KeyQ' && p.role === 0 && G.ph === 'seek' && !p.st && p.hid < 0 && p.rocks > 0) {
    const d = 13 * Math.max(0.35, Math.cos(me.pitch) + Math.max(0, me.pitch) * 0.3);
    send({ t: 'a', a: 'rock', x: me.x - Math.sin(me.yaw) * d, z: me.z - Math.cos(me.yaw) * d });
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- simulation ----------
function update(dt, now) {
  const p = players.get(myId);
  if (!p) return;
  const t = now / 1000, seeker = p.role === 1, hidden = p.hid >= 0, stunned = !!(p.fx & 1);
  const blind = seeker && G.ph === 'hide';
  const frozen = hidden || stunned || blind || chatOpen || !locked;
  let mx = 0, mz = 0;
  if (!frozen) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
  }
  const moving = !!(mx || mz);
  me.crouch = !!keys.KeyC && !hidden && !frozen;
  let sprint = (keys.ShiftLeft || keys.ShiftRight) && moving && !me.crouch && t > me.wind && me.stam > 0;
  if (sprint) {
    me.stam -= STAM.drain * dt;
    if (me.stam <= 0) { me.stam = 0; me.wind = t + STAM.windedFor; sprint = false; feed(seeker ? 'Out of breath!' : 'Out of breath — seekers can hear you gasping!', 'bad'); }
  } else me.stam = Math.min(100, me.stam + (moving ? STAM.regenMove : STAM.regenIdle) * dt);
  const winded = t < me.wind;
  const base = seeker ? SPEED.seeker : SPEED.hider;
  const sp = me.crouch ? SPEED.crouch : sprint ? base.sprint : winded ? SPEED.winded : base.walk;
  if (hidden) { const s = W.spots[p.hid]; me.x = s.x; me.z = s.z; }
  else if (moving) {
    const l = Math.hypot(mx, mz), s = Math.sin(me.yaw), c = Math.cos(me.yaw);
    mx /= l; mz /= l;
    const nx = me.x + (c * mx + s * mz) * sp * dt, nz = me.z + (-s * mx + c * mz) * sp * dt;
    const before = [me.x, me.z];
    [me.x, me.z] = collide(W, Math.max(-HALF + 0.4, Math.min(HALF - 0.4, nx)), Math.max(-HALF + 0.4, Math.min(HALF - 0.4, nz)));
    const moved = Math.hypot(me.x - before[0], me.z - before[1]);
    me.bob += moved * (sprint ? 1.9 : 2.3);
    me.stepD += moved;
    if (me.stepD > (sprint ? 2.1 : 1.6)) { me.stepD = 0; if (!me.crouch) sfx.step(sprint); }
  }
  me.flags = (sprint ? F_SPRINT : 0) | (me.crouch ? F_CROUCH : 0) | (moving ? F_MOVE : 0) | (keys.KeyE && !frozen ? F_USE : 0) | (winded ? F_WIND : 0);
  if (now - lastSend > 66) {
    lastSend = now;
    send({ t: 's', x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(3), f: me.flags, q: me.q });
  }

  // other players
  let nearSeeker = 99, jailedN = 0;
  for (const [id, o] of players) {
    if (o.role === 0 && o.st === 1) jailedN++;
    const sprinting = (o.f & F_SPRINT) && (o.f & F_MOVE);
    const ox = id === myId ? me.x : o.x, oz = id === myId ? me.z : o.z, orot = id === myId ? me.yaw : o.r;
    // consequences: sprinting leaves a trail anyone can follow
    if (sprinting && o.hid < 0 && G.ph !== 'lobby') {
      if (o.lx !== undefined) o.fd += Math.hypot(ox - o.lx, oz - o.lz);
      if (o.fd > 0.9) { o.fd = 0; o.side = -o.side; gfx.footprint(ox, oz, orot, o.side); }
    }
    o.lx = ox; o.lz = oz;
    if (id === myId) continue;
    if (o.role === 1) nearSeeker = Math.min(nearSeeker, Math.hypot(o.x - me.x, o.z - me.z));
    gfx.updateAvatar(id, {
      x: o.x, z: o.z, r: o.r, visible: o.hid < 0 && !blind, moving: !!(o.f & F_MOVE), sprint: !!sprinting, crouch: !!(o.f & F_CROUCH),
      seeker: o.role === 1 && G.ph !== 'lobby', showTag: G.ph === 'lobby' || G.ph === 'end' || o.role === p.role, stunned: !!(o.fx & 1), immune: !!(o.fx & 2),
    }, dt);
  }

  // tension: your heart pounds when a seeker is close
  const fear = !seeker && p.st === 0 && G.ph === 'seek' ? Math.max(0, Math.min(1, 1 - (nearSeeker - 4) / 11)) : 0;
  $('vignette').style.opacity = (fear * (0.55 + 0.45 * Math.sin(now / 1000 * (4 + fear * 8)))).toFixed(2);
  if (fear > 0.05 && now > heartT) { heartT = now + 1100 - fear * 650; sfx.heart(); }

  // camera
  const eyeT = hidden ? 1.15 : me.crouch ? 1.0 : 1.6;
  me.eye += (eyeT - me.eye) * Math.min(1, dt * 12);
  gfx.setSeekerView(seeker && G.ph !== 'lobby');
  gfx.frame(dt, { x: me.x, y: me.eye + (moving && !hidden ? Math.abs(Math.sin(me.bob)) * 0.05 : 0), z: me.z, yaw: me.yaw, pitch: me.pitch, bob: me.bob }, { res: G.res, jailed: jailedN > 0 });

  if (now - lastHud > 120) { lastHud = now; hud(p, now, { seeker, hidden, stunned, blind, winded, jailedN }); }
}

function hud(p, now, s) {
  const tl = Math.max(0, G.tl - (now - G.at) / 1000);
  const names = { lobby: 'LOBBY', hide: 'HIDING TIME', seek: 'SEEK!', end: 'ROUND OVER' };
  $('phase').textContent = names[G.ph];
  $('timer').textContent = G.ph === 'lobby' ? '—' : `${(tl / 60) | 0}:${String(Math.ceil(tl) % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('low', G.ph === 'seek' && tl < 20);
  const hs = [...players.values()].filter((q) => q.role === 0);
  $('left').textContent = G.ph === 'seek' || G.ph === 'hide' ? `${hs.length - s.jailedN} of ${hs.length} hiders free` : `Room ${roomCode}`;

  const role = $('role');
  const set = (cls, title, sub) => { role.className = cls; role.textContent = title; const sm = document.createElement('small'); sm.textContent = sub; role.append(sm); };
  if (G.ph === 'lobby') set('', 'Warm-up', 'Explore the town and learn the hiding spots.');
  else if (s.seeker) set('seeker', '🔦 SEEKER', 'Tag hiders (click). Search spots with E — carefully.');
  else if (p.st === 1) set('jail', '⛓ JAILED', 'A free teammate must hold E at the lever.');
  else set('hider', '🙈 HIDER', s.hidden ? 'Shh… E to climb out.' : 'Hide, grab coins, free your friends.');

  $('blind').classList.toggle('on', s.blind);
  if (s.blind) $('blindCount').textContent = Math.ceil(tl);
  $('hideview').className = s.hidden ? W.spots[p.hid].kind : '';
  $('stam').style.width = me.stam + '%';
  $('stam').classList.toggle('wind', s.winded);
  $('items').textContent = !s.seeker && G.ph === 'seek' && p.st === 0 ? `🪨 ×${p.rocks}  [Q] throw   📣 [T] taunt${now < tauntCd ? ' (' + Math.ceil((tauntCd - now) / 1000) + 's)' : ''}` : '';
  if (now > bannerT) $('banner').classList.remove('show');

  // scoreboard
  const ul = $('board');
  ul.textContent = '';
  for (const q of [...players.values()].sort((a, b) => b.sc - a.sc)) {
    const r = roster.get(q.id);
    if (!r) continue;
    const icon = G.ph === 'lobby' ? '' : q.role === 1 ? '🔦 ' : q.st === 1 ? '⛓ ' : '🙈 ';
    ul.append(row(r, icon + r.n, q.sc, (q.id === myId ? 'me ' : '') + (q.st === 1 ? 'out' : '')));
  }

  // context prompt
  const pr = $('prompt');
  pr.textContent = '';
  if (!locked || s.blind) return;
  if (s.stunned) { pr.textContent = '💫 Dazed…'; return; }
  if (s.hidden) { pr.textContent = '[E] Leave hiding spot'; return; }
  if (p.st === 1) return;
  if (!s.seeker && G.ph === 'seek' && s.jailedN && Math.hypot(W.lever.x - me.x, W.lever.z - me.z) < 2.4) {
    pr.textContent = 'Hold [E] to free your teammates';
    const bar = document.createElement('span'), i = document.createElement('i');
    bar.className = 'bar'; i.style.width = G.res * 100 + '%';
    bar.append(i); pr.append(bar);
    return;
  }
  for (const sp of W.spots) {
    if (Math.min(Math.hypot(sp.x - me.x, sp.z - me.z), Math.hypot(sp.ex - me.x, sp.ez - me.z)) > 2.3) continue;
    if (s.seeker) { if (G.ph === 'seek') pr.textContent = `[E] Search the ${sp.kind} (empty = dazed!)`; }
    else if (G.ph !== 'end') pr.textContent = `[E] Hide in the ${sp.kind}`;
    return;
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (myId) update(dt, now);
  else {
    // attract mode: slow orbit over the town
    const a = now / 9000;
    gfx.frame(dt, { x: Math.cos(a) * 30, y: 13, z: Math.sin(a) * 30, yaw: Math.PI / 2 - a, pitch: -0.32, bob: 0 }, { res: 0, jailed: false });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
