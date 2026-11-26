// Emberfall server: static host + authoritative co-op simulation + server-side saves.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DB } from './server/db.js';
import { SqliteDB } from './server/db-sqlite.js';
import { createGame, TOKEN_RE } from './server/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const db = process.env.EMBERFALL_SQLITE ? new SqliteDB(process.env.EMBERFALL_SQLITE === '1' ? path.join(__dirname, 'data', 'emberfall.db') : process.env.EMBERFALL_SQLITE) : new DB(process.env.EMBERFALL_DB || path.join(__dirname, 'data', 'profiles.json'));
let game;

const server = http.createServer((req, res) => {
  const [rawPath, qs] = req.url.split('?');
  const url = decodeURIComponent(rawPath);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: game?.rooms.size || 0, uptime: Math.round(process.uptime()) })); }
  if (url === '/api/parties') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(game ? game.parties() : [])); }
  if (url === '/api/admin') {
    // live-ops dashboard feed; disabled unless EMBERFALL_ADMIN_KEY is set. CORS-enabled so a hosted dashboard can poll it.
    const key = process.env.EMBERFALL_ADMIN_KEY, given = new URLSearchParams(qs || '').get('key') || req.headers['x-admin-key'];
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-admin-key', 'Cache-Control': 'no-store' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (!key || given !== key) { res.writeHead(key ? 403 : 404, cors); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    return res.end(JSON.stringify(game.admin()));
  }
  if (url === '/api/profile') {
    const token = new URLSearchParams(qs || '').get('token') || '';
    const prof = TOKEN_RE.test(token) ? db.get(token) : null;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(prof ? { name: prof.name, color: prof.color, gold: prof.gold, chars: Object.fromEntries(Object.entries(prof.chars).map(([k, c]) => [k, { level: c.level }])) } : null));
  }
  let base = PUBLIC, rel = url;
  if (url.startsWith('/lib/three/')) { base = THREE_DIR; rel = url.slice('/lib/three'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
const crowd = process.env.EMBERFALL_WORKERS === '1' ? new (await import('./server/crowd-node.js')).CrowdWorker(80) : null;
game = createGame({ db, makeToken: () => crypto.randomBytes(16).toString('hex'), dev: !!process.env.EMBERFALL_DEV, crowd });
wss.on('connection', (ws) => game.attach(ws));
const shutdown = () => { console.log('Shutting down…'); for (const c of wss.clients) c.close(1001, 'server restarting'); db.flush(); setTimeout(() => process.exit(0), 300); };
process.removeAllListeners('SIGTERM'); process.removeAllListeners('SIGINT');
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
server.listen(PORT, () => console.log(`Emberfall running at http://localhost:${PORT}`));
