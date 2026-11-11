// Dusk Hollow — multiplayer hide & seek server.
// Serves the client, runs rooms, referees the rules and drives the bots.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { makeRoom, joinRoom, leaveRoom, handleMessage, tickRoom, TICK } from './public/shared/game.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CFG = { hide: +process.env.HIDE_T || 30, seek: +process.env.SEEK_T || 210, map: +process.env.MAP || 0, mode: +process.env.MODE || 0 };

// ---------- static files ----------
const ROOTS = [
  ['/vendor/', path.join(DIR, 'node_modules/three/build')],
  ['/', path.join(DIR, 'public')],
];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { url = '/'; }
  if (url === '/') url = '/index.html';
  for (const [prefix, root] of ROOTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.normalize(path.join(root, url.slice(prefix.length)));
    if (!file.startsWith(root + path.sep)) break;
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(404);
  res.end('Not found');
});

// ---------- rooms ----------
const rooms = new Map();
setInterval(() => { for (const room of rooms.values()) tickRoom(room, 1 / TICK); }, 1000 / TICK);

const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', (ws) => {
  let room = null, me = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      if (me) return;
      let code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) do { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join(''); } while (rooms.has(code));
      room = rooms.get(code);
      if (!room) rooms.set(code, (room = makeRoom(code, CFG)));
      me = joinRoom(room, m.name, (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }, m.look);
      if (!me) { ws.send(JSON.stringify({ t: 'err', m: 'That room is full.' })); room = null; }
      return;
    }
    if (me) handleMessage(room, me, m);
  });
  ws.on('close', () => { if (me && !leaveRoom(room, me)) rooms.delete(room.code); });
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`Dusk Hollow running → http://localhost:${PORT}`));
