// Dusk Hollow client: networking, input, first-person movement and HUD.
import { getWorld, collide, levelAt, cleanLook, LOOKS, FLOOR_H, MAPS, MODES, PROPS, ITEMS, SPEED, STAM, NOISE_RANGE, HALF, F_SPRINT, F_CROUCH, F_MOVE, F_USE, F_WIND, F_JUMP } from '../shared/world.js';
import { Gfx, Preview, COLORS } from './gfx.js';
import { Sfx } from './audio.js';
import { connectWs, connectLocal, connectRoom } from './net.js';

const $ = (id) => document.getElementById(id);
let W = getWorld(0), curMap = 0;
const canvas = $('c');
const gfx = new Gfx(canvas, W);
const sfx = new Sfx();
const css = (i) => '#' + COLORS[i % COLORS.length].toString(16).padStart(6, '0');

const IN_ARTIFACT = !!window.claude; // published as a claude.ai artifact: no game server, use the realtime room
const TOUCH = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
const USE = TOUCH ? 'USE' : '[E]';
document.body.classList.toggle('touch', TOUCH);
let net = null, joining = false, softLook = false, myId = null, roomCode = '', solo = false;
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const looks = new Map(); // pointerId -> last position, for drag-to-look
const roster = new Map(); // id -> {n, c, bot}
const players = new Map(); // id -> live state
const G = { ph: 'lobby', tl: 0, host: null, res: 0, ct: new Set(), w: null, at: 0, bc: [0, 0, 0], md: 0 };
const me = { x: 0, z: -5, yaw: 0, pitch: 0, stam: 100, wind: 0, crouch: false, q: 0, eye: 1.6, bob: 0, stepD: 0, y: 0, vy: 0, freeUntil: 0, boostUntil: 0, chal: '', chalDone: false, lv: 0, gy: 0 };
const keys = {};
let playing = false, chatOpen = false, lastSend = 0, lastHud = 0, heartT = 0, tauntCd = 0, bannerT = 0;
window.__g = { me, players, G, gfx };

// ---------- menu ----------
const params = new URLSearchParams(location.search);
$('room').value = (params.get('room') || '').toUpperCase();
try { $('name').value = localStorage.getItem('dh_name') || ''; } catch {}
if (IN_ARTIFACT) {
  $('join').textContent = 'Play with others here';
  $('roomHint').textContent = '(same code = same game; empty joins the main one)';
  $('copy').textContent = 'Copy room code';
}
// ---------- character picker ----------
let look;
try { look = JSON.parse(localStorage.getItem('dh_look')); } catch {}
look = cleanLook(look);
let preview = null;
try { preview = new Preview($('pv')); } catch {}
const LISTS = { 0: LOOKS.chars, 2: LOOKS.hats, 3: LOOKS.pats, 4: LOOKS.pets };
for (let i = 0; i < LOOKS.colors; i++) {
  const b = document.createElement('button');
  b.className = 'sw'; b.style.background = css(i); b.setAttribute('aria-label', 'Colour ' + (i + 1));
  b.onclick = () => { look[1] = i; applyLook(); };
  $('swatches').append(b);
}
for (const b of document.querySelectorAll('#picker [data-k]')) b.onclick = () => {
  const k = +b.dataset.k, n = LISTS[k].length;
  look[k] = (look[k] + +b.dataset.d + n) % n;
  applyLook();
};
function applyLook(tell = true) {
  for (const k of [0, 2, 3, 4]) $('pk' + k).textContent = LISTS[k][look[k]];
  [...$('swatches').children].forEach((b, i) => b.classList.toggle('on', i === look[1]));
  if (preview) preview.set(look);
  gfx.setSelfPet(look);
  try { localStorage.setItem('dh_look', JSON.stringify(look)); } catch {}
  if (tell && myId) send({ t: 'look', lk: look });
}
applyLook(false);
$('lookBtn').onclick = () => {
  const inLobby = $('picker').parentNode === $('lookSlot');
  (inLobby ? $('menuSlot') : $('lookSlot')).append($('picker'));
  $('lookBtn').textContent = inLobby ? 'Change character' : 'Done';
};

$('join').onclick = () => join('online');
$('solo').onclick = () => join('solo');
for (const id of ['name', 'room']) $(id).addEventListener('keydown', (e) => e.key === 'Enter' && join('online'));

async function join(mode) {
  if (net || joining) return;
  joining = true;
  sfx.init();
  const name = $('name').value.trim() || 'Player' + ((Math.random() * 90 + 10) | 0);
  try { localStorage.setItem('dh_name', name); } catch {}
  const h = { onmsg: onMsg, onclose: onClose };
  $('err').textContent = mode === 'solo' ? '' : 'Connecting…';
  solo = mode === 'solo';
  try {
    if (solo) net = connectLocal(name, h, look);
    else if (IN_ARTIFACT) {
      const api = await window.claude.use('room');
      if (!api) throw new Error('no room');
      net = await connectRoom(api, name, $('room').value, h, look);
    } else net = await connectWs(name, $('room').value, h, look);
    $('err').textContent = '';
  } catch {
    solo = true;
    net = connectLocal(name, h, look);
    $('err').textContent = '';
    feed('Multiplayer is not available in this view, so you are playing solo with bots.', 'bad');
  }
  joining = false;
}
function onClose(reason) {
  if (net) net.close();
  net = null;
  if (document.pointerLockElement) document.exitPointerLock();
  playing = false; softLook = false;
  for (const id of ['lobby', 'results', 'hud']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('menuSlot').append($('picker'));
  $('lookBtn').textContent = 'Change character';
  $('err').textContent = reason || 'Disconnected.';
  for (const id of players.keys()) gfx.removeAvatar(id);
  players.clear(); roster.clear(); myId = null;
}
const send = (m) => net && net.send(m);

// ---------- network ----------
function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      myId = m.id; roomCode = m.room;
      me.x = m.x; me.z = m.z; me.q = 0;
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('code').textContent = roomCode;
      if (!IN_ARTIFACT && !solo) try { history.replaceState(null, '', '?room=' + roomCode); } catch {}
      refreshOverlays();
      break;
    case 'err': $('err').textContent = m.m; break;
    case 'ro': {
      const ids = new Set(m.p.map((p) => p.id));
      for (const id of [...roster.keys()]) if (!ids.has(id)) { roster.delete(id); players.delete(id); gfx.removeAvatar(id); }
      for (const p of m.p) {
        const old = roster.get(p.id);
        roster.set(p.id, p);
        if (p.id !== myId && (!old || String(old.lk) !== String(p.lk))) gfx.addAvatar(p.id, cleanLook(p.lk), p.n);
      }
      renderLobby();
      break;
    }
    case 'st': onState(m); break;
    case 'tp': me.x = m.x; me.z = m.z; me.q = m.q; me.lv = m.lv || 0; me.gy = me.lv * FLOOR_H; break;
    case 'feed': feed(m.m, m.k === 'big' ? '' : m.k); if (m.k === 'big') banner(m.m); break;
    case 'chat': { const r = roster.get(m.id); feed(m.m, 'chat', r ? r.n : '?'); break; }
    case 'noise': onNoise(m); break;
    case 'coin': if (m.w === myId) { sfx.coin(); feed('+10 coin', 'good'); } break;
    case 'caught':
      if (m.w === myId) { sfx.caught(); banner(m.m === 1 ? 'INFECTED! You are a seeker now' : m.m === 2 ? 'FROZEN! Wait for a thaw…' : 'CAUGHT! Wait for a rescue…'); }
      else if (m.b === myId) { sfx.win(); banner(m.m === 1 ? 'Infected one! +100' : m.m === 2 ? 'Frozen! +100' : 'Got one! +100'); }
      else sfx.thud();
      break;
    case 'freed': sfx.freed(); break;
    case 'search': if (m.id === myId) { sfx.stun(); banner('Empty! You are dazed…'); } break;
    case 'rock': gfx.throwRock(m.fx, m.fz, m.x, m.z); break;
    case 'round': me.stam = 100; me.wind = 0; me.freeUntil = me.boostUntil = 0; me.chal = ''; break;
    case 'chal':
      me.chal = m.text; me.chalDone = !!m.done;
      if (m.done) { sfx.win(); banner('Challenge complete! +75'); }
      break;
    case 'item':
      if (m.w === myId) { sfx.coin(); banner(`${ITEMS[m.k].icon} ${ITEMS[m.k].name}! ${TOUCH ? 'Tap its button' : 'Press G'} to use it`); }
      break;
    case 'used': {
      if (m.w !== myId) break;
      const t = performance.now() / 1000;
      sfx.freed();
      if (m.k === 1) { me.stam = 100; me.wind = 0; me.freeUntil = t + 8; feed('Energy drink: 8 seconds of endless, silent sprinting.', 'good'); }
      else if (m.k === 2) feed('Shadow cloak: seekers cannot see you for 6 seconds.', 'good');
      else if (m.k === 4) { me.boostUntil = t + 7; feed('Rocket boots: 7 seconds of extra speed.', 'good'); }
      break;
    }
    case 'radar':
      for (const [x, z] of m.pts) { gfx.ping(x, z); gfx.ring(x, z, 4, 0xff5555, 1.6); }
      sfx.ping(1);
      feed(m.pts.length ? `Radar found ${m.pts.length} hider${m.pts.length > 1 ? 's' : ''} in the open.` : 'Radar found nobody in the open. They must be hiding.', 'good');
      break;
    case 'beacon': { const b = W.beacons[m.id]; if (b) gfx.ring(b.x, b.z, 9, 0x6dff8a, 2); sfx.freed(); break; }
    case 'end': onEnd(m.w); break;
  }
}

function onState(m) {
  const prev = G.ph, prevHost = G.host;
  G.ph = m.ph; G.tl = m.tl; G.host = m.host; G.res = m.res; G.w = m.w; G.at = performance.now();
  if (m.mp !== undefined && m.mp !== curMap) {
    curMap = m.mp;
    W = getWorld(curMap);
    gfx.setWorld(W);
    if (!playing) renderLobby();
  }
  G.bc = m.bc || G.bc;
  if ((m.md || 0) !== G.md) { G.md = m.md || 0; if (!playing) renderLobby(); }
  gfx.setItems(new Set(m.it || []));
  G.ct = new Set(m.ct);
  gfx.setCoins(G.ct);
  for (const a of m.p) {
    let p = players.get(a[0]);
    if (!p) players.set(a[0], (p = { id: a[0], fd: 0, side: 1 }));
    p.x = a[1]; p.z = a[2]; p.r = a[3]; p.f = a[4]; p.role = a[5]; p.st = a[6]; p.hid = a[7]; p.sc = a[8]; p.fx = a[9]; p.rocks = a[10]; p.item = a[11] || 0; p.lv = a[12] || 0; p.prop = a[13] || 0;
  }
  if (prev !== G.ph) onPhase(prev);
  else if (prevHost !== G.host && !playing) renderLobby();
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
  $('resSub').textContent = w === 'seekers' ? 'Everyone was caught.' : G.bc.every((v) => v >= 1) ? 'All three beacons were lit.' : 'Somebody survived until the bell.';
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
  const col = { run: 0xffffff, breath: 0x9fd8ff, taunt: 0xff66cc, rock: 0xffd27a, beacon: 0x6dff8a }[m.k];
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
  $('mapName').textContent = MAPS[curMap].name;
  $('modeName').textContent = MODES[G.md].name;
  $('modeBlurb').textContent = MODES[G.md].blurb;
  $('mapBlurb').textContent = MAPS[curMap].blurb;
  $('waitMsg').textContent = lobby && !host ? 'Waiting for the host to start the round…' : '';
  $('resume').textContent = lobby ? 'Explore the map' : 'Back to the game';
}
function refreshOverlays() {
  if (!myId) return;
  $('lobby').classList.toggle('hidden', playing);
  if (!playing) renderLobby();
}

$('copy').onclick = () => {
  const label = $('copy').textContent;
  const text = IN_ARTIFACT ? roomCode : location.origin + location.pathname + '?room=' + roomCode;
  const done = (ok) => { $('copy').textContent = ok ? 'Copied!' : 'Code: ' + roomCode; setTimeout(() => ($('copy').textContent = label), 1500); };
  try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch { done(false); }
};
$('modeBtn').onclick = () => { sfx.click(); send({ t: 'lobby', a: 'mode' }); };
$('mapBtn').onclick = () => { sfx.click(); send({ t: 'lobby', a: 'map' }); };
$('addBot').onclick = () => { sfx.click(); send({ t: 'lobby', a: 'addBot' }); };
$('delBot').onclick = () => { sfx.click(); send({ t: 'lobby', a: 'delBot' }); };
$('start').onclick = () => { send({ t: 'lobby', a: 'start' }); lock(); };
$('resume').onclick = lock;
// "Playing" means the game has your input. With a mouse that is pointer lock; on touch screens, or where
// pointer lock is refused, it is "soft" mode: drag to look, with on-screen controls on touch.
function setPlaying(v, soft) {
  playing = v;
  softLook = v && !!soft;
  for (const k in keys) keys[k] = false;
  stick.id = null; looks.clear();
  $('stick').hidden = true;
  document.body.classList.toggle('soft', softLook);
  refreshOverlays();
}
function lock() {
  sfx.init();
  if (TOUCH) return setPlaying(true, true);
  let r;
  try { r = canvas.requestPointerLock(); } catch { return setPlaying(true, true); }
  if (r && r.catch) r.catch(() => { if (!document.pointerLockElement) setPlaying(true, true); });
  setTimeout(() => { if (!document.pointerLockElement && !playing) setPlaying(true, true); }, 400);
}
canvas.addEventListener('click', () => { if (myId && !playing) lock(); });
document.addEventListener('pointerlockchange', () => {
  const on = document.pointerLockElement === canvas;
  if (!on && softLook) return;
  setPlaying(on, false);
});

// ---------- input ----------
document.addEventListener('mousemove', (e) => {
  if (!playing || softLook) return;
  me.yaw -= e.movementX * 0.0023;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * 0.0023));
});
document.addEventListener('mousedown', (e) => { if (playing && !softLook && e.button === 0) tag(); });
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
  if (e.code === 'Enter' && playing) { chatOpen = true; chat.classList.add('open'); chat.focus(); for (const k in keys) keys[k] = false; e.preventDefault(); return; }
  if (!playing) return;
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (e.code === 'Space') jump();
  if (e.code === 'KeyG') send({ t: 'a', a: 'item' });
  if (e.code === 'KeyR') send({ t: 'a', a: 'prop' });
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Escape' && softLook) setPlaying(false);
  else if (e.code === 'KeyE') send({ t: 'a', a: 'use' });
  else if (e.code === 'KeyF') tag();
  else if (e.code === 'KeyT') taunt();
  else if (e.code === 'KeyQ') rock();
});
function taunt() {
  const p = players.get(myId);
  if (!p || p.role !== 0 || G.ph !== 'seek' || p.st || performance.now() < tauntCd) return;
  tauntCd = performance.now() + 10000;
  send({ t: 'a', a: 'taunt' });
}
function rock() {
  const p = players.get(myId);
  if (!p || p.role !== 0 || G.ph !== 'seek' || p.st || p.hid >= 0 || p.rocks <= 0) return;
  const d = 13 * Math.max(0.35, Math.cos(me.pitch) + Math.max(0, me.pitch) * 0.3);
  send({ t: 'a', a: 'rock', x: me.x - Math.sin(me.yaw) * d, z: me.z - Math.cos(me.yaw) * d });
}

// ---------- touch + drag controls ----------
// Left part of the screen is a floating joystick (push it to the edge to sprint); dragging anywhere else looks around.
const STICK_R = 56;
canvas.addEventListener('pointerdown', (e) => {
  if (!playing || !softLook) return;
  e.preventDefault();
  if (TOUCH && stick.id === null && e.clientX < window.innerWidth * 0.42 && e.clientY > window.innerHeight * 0.3) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    const el = $('stick');
    el.hidden = false;
    el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px';
    $('knob').style.transform = 'translate(-50%, -50%)';
  } else looks.set(e.pointerId, [e.clientX, e.clientY]);
  try { canvas.setPointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === stick.id) {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    stick.x = dx / STICK_R; stick.y = dy / STICK_R;
    $('knob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    $('knob').classList.toggle('run', d > STICK_R * 0.92);
    return;
  }
  const l = looks.get(e.pointerId);
  if (!l) return;
  const k = e.pointerType === 'mouse' ? 0.004 : 0.0055;
  me.yaw -= (e.clientX - l[0]) * k;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - (e.clientY - l[1]) * k));
  l[0] = e.clientX; l[1] = e.clientY;
});
const pointerEnd = (e) => {
  if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; $('stick').hidden = true; }
  looks.delete(e.pointerId);
};
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const press = (id, down, up) => {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.init(); down(); });
  if (up) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
};
press('tUse', () => { keys.KeyE = true; send({ t: 'a', a: 'use' }); }, () => { keys.KeyE = false; });
press('tAct', () => { const p = players.get(myId); if (p && p.role === 1) tag(); else rock(); });
press('tTaunt', taunt);
press('tCrouch', () => { keys.KeyC = !keys.KeyC; $('tCrouch').classList.toggle('on', !!keys.KeyC); });
press('tPause', () => setPlaying(false));
press('tItem', () => send({ t: 'a', a: 'item' }));
press('tJump', jump);
press('tProp', () => send({ t: 'a', a: 'prop' }));
function jump() {
  const p = players.get(myId);
  if (!p || !playing || me.y > 0 || me.stam < 6 || p.hid >= 0 || (p.fx & 1) || (p.role === 1 && G.ph === 'hide')) return;
  me.vy = 5.4; me.y = 0.001; me.stam -= 6;
  sfx.swing();
}
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- simulation ----------
function update(dt, now) {
  const p = players.get(myId);
  if (!p) return;
  const t = now / 1000, seeker = p.role === 1, hidden = p.hid >= 0, stunned = !!(p.fx & 1);
  const blind = seeker && G.ph === 'hide';
  const frozen = hidden || stunned || blind || chatOpen || !playing || p.st === 2;
  let mx = 0, mz = 0;
  if (!frozen) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (stick.id !== null && Math.hypot(stick.x, stick.y) > 0.18) { mx = stick.x; mz = stick.y; }
  }
  const moving = !!(mx || mz), pushed = stick.id !== null && Math.hypot(stick.x, stick.y) > 0.92;
  me.crouch = !!keys.KeyC && !hidden && !frozen;
  let sprint = (keys.ShiftLeft || keys.ShiftRight || pushed) && moving && !me.crouch && t > me.wind && me.stam > 0;
  if (sprint) {
    if (t > me.freeUntil) me.stam -= STAM.drain * dt;
    if (me.stam <= 0) { me.stam = 0; me.wind = t + STAM.windedFor; sprint = false; feed(seeker ? 'Out of breath!' : 'Out of breath — seekers can hear you gasping!', 'bad'); }
  } else me.stam = Math.min(100, me.stam + (moving ? STAM.regenMove : STAM.regenIdle) * dt);
  const winded = t < me.wind;
  const base = seeker ? SPEED.seeker : SPEED.hider;
  const sp = (me.crouch ? SPEED.crouch : sprint ? base.sprint : winded ? SPEED.winded : base.walk) * (t < me.boostUntil ? 1.35 : 1);
  if (me.y > 0) { me.y += me.vy * dt; me.vy -= 15 * dt; if (me.y <= 0) { me.y = 0; me.vy = 0; sfx.step(true); } }
  if (hidden) { const s = W.spots[p.hid]; me.x = s.x; me.z = s.z; me.lv = s.lv; me.gy = s.lv * FLOOR_H; }
  else if (moving) {
    const l = Math.hypot(mx, mz), s = Math.sin(me.yaw), c = Math.cos(me.yaw);
    mx /= l; mz /= l;
    const nx = me.x + (c * mx + s * mz) * sp * dt, nz = me.z + (-s * mx + c * mz) * sp * dt;
    const before = [me.x, me.z];
    [me.x, me.z] = collide(W, Math.max(-HALF + 0.4, Math.min(HALF - 0.4, nx)), Math.max(-HALF + 0.4, Math.min(HALF - 0.4, nz)), 0.4, me.lv);
    [me.lv, me.gy] = levelAt(W, me.x, me.z, me.lv);
    const moved = Math.hypot(me.x - before[0], me.z - before[1]);
    me.bob += moved * (sprint ? 1.9 : 2.3);
    me.stepD += moved;
    if (me.stepD > (sprint ? 2.1 : 1.6)) { me.stepD = 0; if (!me.crouch) sfx.step(sprint); }
  }
  me.flags = (sprint ? F_SPRINT : 0) | (me.crouch ? F_CROUCH : 0) | (moving ? F_MOVE : 0) | (keys.KeyE && !frozen ? F_USE : 0) | (winded ? F_WIND : 0) | (me.y > 0 ? F_JUMP : 0);
  if (now - lastSend > 66) {
    lastSend = now;
    send({ t: 's', x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(3), f: me.flags, q: me.q, l: me.lv });
  }

  // other players
  let nearSeeker = 99, jailedN = 0;
  for (const [id, o] of players) {
    if (o.role === 0 && o.st) jailedN++;
    const sprinting = (o.f & F_SPRINT) && (o.f & F_MOVE);
    const ox = id === myId ? me.x : o.x, oz = id === myId ? me.z : o.z, orot = id === myId ? me.yaw : o.r;
    // consequences: sprinting leaves a trail anyone can follow
    if (sprinting && o.hid < 0 && G.ph !== 'lobby' && !(id === myId ? me.lv : o.lv)) {
      if (o.lx !== undefined) o.fd += Math.hypot(ox - o.lx, oz - o.lz);
      if (o.fd > 0.9) { o.fd = 0; o.side = -o.side; gfx.footprint(ox, oz, orot, o.side); }
    }
    o.lx = ox; o.lz = oz;
    if (id === myId) continue;
    if (o.role === 1) nearSeeker = Math.min(nearSeeker, Math.hypot(o.x - me.x, o.z - me.z));
    gfx.updateAvatar(id, {
      x: o.x, y: levelAt(W, o.x, o.z, o.lv)[1], z: o.z, r: o.r, visible: o.hid < 0 && !blind && !((o.fx & 4) && o.role !== p.role), jump: !!(o.f & F_JUMP), moving: !!(o.f & F_MOVE), sprint: !!sprinting, crouch: !!(o.f & F_CROUCH),
      seeker: o.role === 1 && G.ph !== 'lobby', showTag: G.ph === 'lobby' || G.ph === 'end' || o.role === p.role, stunned: !!(o.fx & 1), immune: !!(o.fx & 2), prop: o.prop, frozen: o.st === 2,
      pet: !o.prop && (G.ph === 'lobby' || G.ph === 'end' || o.role === 1 || o.role === p.role),
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
  gfx.updateSelfPet(me.x, me.gy, me.z, me.yaw, !hidden && !blind && !p.prop, dt);
  gfx.frame(dt, { x: me.x, y: me.gy + me.eye + me.y + (moving && !hidden ? Math.abs(Math.sin(me.bob)) * 0.05 : 0), z: me.z, yaw: me.yaw, pitch: me.pitch, bob: me.bob }, { res: G.res, jailed: jailedN > 0, bc: G.bc });

  if (now - lastHud > 120) { lastHud = now; hud(p, now, { seeker, hidden, stunned, blind, winded, jailedN }); }
}

function hud(p, now, s) {
  const tl = Math.max(0, G.tl - (now - G.at) / 1000);
  const names = { lobby: 'LOBBY', hide: 'HIDING TIME', seek: 'SEEK!', end: 'ROUND OVER' };
  $('phase').textContent = names[G.ph];
  $('timer').textContent = G.ph === 'lobby' ? '—' : `${(tl / 60) | 0}:${String(Math.ceil(tl) % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('low', G.ph === 'seek' && tl < 20);
  const hs = [...players.values()].filter((q) => q.role === 0);
  $('left').textContent = G.ph === 'seek' || G.ph === 'hide' ? `${hs.length - s.jailedN} of ${hs.length} hiders free · beacons ${G.bc.filter((v) => v >= 1).length}/3` : `Room ${roomCode}`;

  const role = $('role');
  const set = (cls, title, sub) => {
    role.className = cls; role.textContent = title;
    const sm = document.createElement('small');
    sm.textContent = sub;
    role.append(sm);
    if (me.chal && G.ph !== 'lobby') { const c = document.createElement('em'); c.textContent = (me.chalDone ? '✔ ' : '★ ') + me.chal; if (me.chalDone) c.className = 'done'; role.append(c); }
  };
  if (G.ph === 'lobby') set('', 'Warm-up', 'Explore the map and learn the hiding spots.');
  else if (s.seeker && G.md === 3) set('seeker', '🔦 SEEKER', 'Hiders look like props. Tag the ones that move. Miss and you are dazed.');
  else if (s.seeker) set('seeker', '🔦 SEEKER', TOUCH ? 'Tap TAG next to a hider. Search spots with USE, carefully.' : 'Tag hiders (click). Search spots with E — carefully.');
  else if (p.st === 1) set('jail', '⛓ JAILED', `A free teammate must hold ${USE} at the lever.`);
  else if (p.st === 2) set('jail', '🧊 FROZEN', `A free teammate can thaw you: they hold ${USE} next to you.`);
  else if (p.prop) set('hider', `📦 You are a ${PROPS[p.prop].toUpperCase()}`, `Hold still to blend in. ${TOUCH ? 'Tap PROP' : 'Press R'} to change disguise.`);
  else if (G.md === 1) set('hider', '🙈 SURVIVOR', 'If a seeker tags you, you join them. Be the last one left.');
  else set('hider', '🙈 HIDER', s.hidden ? `Shh… ${USE} to climb out.` : 'Hide, grab coins, free your friends.');

  $('blind').classList.toggle('on', s.blind);
  if (s.blind) $('blindCount').textContent = Math.ceil(tl);
  $('hideview').className = s.hidden ? ({ tent: 'dumpster', snowdrift: 'bush snow', container: 'locker' }[W.spots[p.hid].kind] || W.spots[p.hid].kind) : '';
  $('stam').style.width = me.stam + '%';
  $('stam').classList.toggle('wind', s.winded);
  const canAct = !s.blind && p.st === 0 && G.ph === 'seek';
  $('tAct').hidden = !canAct || (!s.seeker && (s.hidden || p.rocks <= 0));
  $('tAct').textContent = s.seeker ? 'TAG' : '🪨 ' + p.rocks;
  $('tTaunt').hidden = !canAct || s.seeker;
  $('tUse').hidden = s.blind || !!p.st;
  $('tCrouch').hidden = s.blind || s.hidden || !!p.st;
  $('tProp').hidden = !p.prop;
  $('tItem').hidden = !p.item || G.ph !== 'seek';
  $('tItem').textContent = p.item ? ITEMS[p.item].icon : '';
  $('tJump').hidden = s.blind || s.hidden || s.stunned;
  const itemTxt = p.item && G.ph === 'seek' ? `${ITEMS[p.item].icon} [G] ${ITEMS[p.item].name}   ` : '';
  $('items').textContent = TOUCH ? '' : itemTxt + (!s.seeker && G.ph === 'seek' && p.st === 0 ? `🪨 ×${p.rocks}  [Q] throw   📣 [T] taunt${now < tauntCd ? ' (' + Math.ceil((tauntCd - now) / 1000) + 's)' : ''}` : '');
  if (now > bannerT) $('banner').classList.remove('show');

  // scoreboard
  const ul = $('board');
  ul.textContent = '';
  for (const q of [...players.values()].sort((a, b) => b.sc - a.sc)) {
    const r = roster.get(q.id);
    if (!r) continue;
    const icon = G.ph === 'lobby' ? '' : q.role === 1 ? '🔦 ' : q.st === 1 ? '⛓ ' : q.st === 2 ? '🧊 ' : '🙈 ';
    ul.append(row(r, icon + r.n, q.sc, (q.id === myId ? 'me ' : '') + (q.st ? 'out' : '')));
  }

  // context prompt
  const pr = $('prompt');
  pr.textContent = '';
  if (!playing || s.blind) return;
  if (s.stunned) { pr.textContent = '💫 Dazed…'; return; }
  if (s.hidden) { pr.textContent = `${USE}: leave hiding spot`; return; }
  if (p.st) return;
  const progress = (text, v) => {
    pr.textContent = text;
    const bar = document.createElement('span'), i = document.createElement('i');
    bar.className = 'bar'; i.style.width = v * 100 + '%';
    bar.append(i); pr.append(bar);
  };
  if (!s.seeker && G.ph === 'seek') for (const b of W.beacons) {
    if (G.bc[b.id] >= 1 || Math.hypot(b.x - me.x, b.z - me.z) > 2.4) continue;
    return progress(`Hold ${USE} to light the beacon (it hums!)`, G.bc[b.id]);
  }
  if (!s.seeker && G.ph === 'seek' && s.jailedN && Math.hypot(W.lever.x - me.x, W.lever.z - me.z) < 2.4) {
    pr.textContent = `Hold ${USE} to free your teammates`;
    const bar = document.createElement('span'), i = document.createElement('i');
    bar.className = 'bar'; i.style.width = G.res * 100 + '%';
    bar.append(i); pr.append(bar);
    return;
  }
  if (!s.seeker && G.ph === 'seek') for (const o of players.values()) {
    if (o.st !== 2 || o.lv !== me.lv || Math.hypot(o.x - me.x, o.z - me.z) > 2.3) continue;
    return progress(`Hold ${USE} to thaw ${(roster.get(o.id) || {}).n || 'your teammate'}`, G.res);
  }
  if (G.md === 3) return;
  for (const sp of W.spots) {
    if (sp.lv !== me.lv) continue;
    if (Math.min(Math.hypot(sp.x - me.x, sp.z - me.z), Math.hypot(sp.ex - me.x, sp.ez - me.z)) > 2.3) continue;
    if (s.seeker) { if (G.ph === 'seek') pr.textContent = `${USE}: search the ${sp.kind} (empty = dazed!)`; }
    else if (G.ph !== 'end') pr.textContent = `${USE}: hide in the ${sp.kind}`;
    return;
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (preview && !$('picker').closest('.hidden')) preview.render(now / 1000);
  if (myId) update(dt, now);
  else {
    // attract mode: slow orbit over the town
    const a = now / 9000;
    gfx.frame(dt, { x: Math.cos(a) * 30, y: 13, z: Math.sin(a) * 30, yaw: Math.PI / 2 - a, pitch: -0.32, bob: 0 }, { res: 0, jailed: false });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
