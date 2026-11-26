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
import { createAccounts, verifyAdmin, rateLimiter, directoryClient } from './server/launch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const db = process.env.EMBERFALL_SQLITE ? new SqliteDB(process.env.EMBERFALL_SQLITE === '1' ? path.join(__dirname, 'data', 'emberfall.db') : process.env.EMBERFALL_SQLITE) : new DB(process.env.EMBERFALL_DB || path.join(__dirname, 'data', 'profiles.json'));
let game;
const PUBLIC_URL = () => process.env.EMBERFALL_PUBLIC_URL || `http://localhost:${PORT}`;
// email: POST to a webhook of your mail provider (EMBERFALL_MAIL_WEBHOOK), or log the link in development
const mailer = async (m) => {
  if (process.env.EMBERFALL_MAIL_WEBHOOK) await fetch(process.env.EMBERFALL_MAIL_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) });
  else console.log(`[mail] to ${m.to.replace(/(.).*@/, '$1***@')}: ${m.text.split('\n')[2]}`);
};
const accounts = createAccounts({ db, mailer, baseUrl: PUBLIC_URL });
const adminRate = rateLimiter(20, 60000), errRate = rateLimiter(60, 60000);
const directory = directoryClient({ url: process.env.EMBERFALL_DIRECTORY, self: () => ({ id: PUBLIC_URL(), url: PUBLIC_URL(), name: process.env.EMBERFALL_SERVER_NAME || 'Emberfall', region: process.env.EMBERFALL_REGION || 'local', players: game ? game.admin().online : 0, rooms: game?.rooms.size || 0 }), onlineTags: () => game?.onlineTags() || [] });
if (process.env.EMBERFALL_DIRECTORY) { directory.beat(); setInterval(() => directory.beat(), 15000).unref(); }
const readBody = (req, max = 16384) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > max) req.destroy(); }); req.on('end', () => ok(b)); });
const json = (res, code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(obj)); };

const server = http.createServer((req, res) => {
  const [rawPath, qs] = req.url.split('?');
  const url = decodeURIComponent(rawPath);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: game?.rooms.size || 0, uptime: Math.round(process.uptime()) })); }
  if (url === '/api/parties') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(game ? game.parties() : [])); }
  if (url === '/api/servers') return json(res, 200, { directory: !!process.env.EMBERFALL_DIRECTORY, servers: directory.state.servers });
  if (url === '/api/login-email' && req.method === 'POST') { readBody(req).then(async (b) => { let m = {}; try { m = JSON.parse(b); } catch { /* bad json */ } const r = await accounts.request(m.email, TOKEN_RE.test(m.token || '') ? m.token : null, req.socket.remoteAddress); json(res, r.error ? 400 : 200, r); }); return; }
  if (url === '/login') {
    const r = accounts.redeem(new URLSearchParams(qs || '').get('code'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Emberfall login</title><body style="background:#120c08;color:#f0e6d0;font:16px system-ui;display:grid;place-items:center;height:100vh"><div>${r.token ? 'Signed in — taking you to Emberhold…' : r.error.replace(/[<>&]/g, '')}</div><script>${r.token ? `try{localStorage.setItem('emberfall_token',${JSON.stringify(r.token)})}catch(e){};setTimeout(()=>location.href='/',900)` : ''}</script>`);
  }
  if (url === '/api/client-error' && req.method === 'POST') { readBody(req, 4096).then((b) => { if (errRate()) { try { game.clientError(JSON.parse(b), req.socket.remoteAddress); } catch { /* bad json */ } } json(res, 204, {}); }); return; }
  if (url === '/api/admin/action') {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-admin-ts, x-admin-sig' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    readBody(req).then((b) => {
      if (!adminRate()) return json(res, 429, { error: 'Too many admin actions — slow down.' }, cors);
      if (!verifyAdmin(process.env.EMBERFALL_ADMIN_KEY, req.headers['x-admin-ts'], req.headers['x-admin-sig'], b)) return json(res, 403, { error: 'Bad signature.' }, cors);
      let a = {}; try { a = JSON.parse(b); } catch { /* bad json */ }
      const r = game.adminAction(a); console.log(`[admin] ${a.action} ${a.target || ''} -> ${r.ok || r.error}`);
      json(res, r.error ? 400 : 200, r, cors);
    });
    return;
  }
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
game = createGame({ db, makeToken: () => crypto.randomBytes(16).toString('hex'), dev: !!process.env.EMBERFALL_DEV, crowd, where: directory.where });
wss.on('connection', (ws) => game.attach(ws));
const shutdown = () => { console.log('Shutting down…'); for (const c of wss.clients) c.close(1001, 'server restarting'); db.flush(); setTimeout(() => process.exit(0), 300); };
process.removeAllListeners('SIGTERM'); process.removeAllListeners('SIGINT');
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
server.listen(PORT, () => console.log(`Emberfall running at http://localhost:${PORT}`));
