// Emberfall server: static host + authoritative co-op simulation + server-side saves.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DB } from './server/db.js';
import { createGame, TOKEN_RE } from './server/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const db = new DB(process.env.EMBERFALL_DB || path.join(__dirname, 'data', 'profiles.json'));

const server = http.createServer((req, res) => {
  const [rawPath, qs] = req.url.split('?');
  const url = decodeURIComponent(rawPath);
  if (url === '/api/profile') {
    const token = new URLSearchParams(qs || '').get('token') || '';
    const prof = TOKEN_RE.test(token) ? db.get(token) : null;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(prof ? { name: prof.name, color: prof.color, gold: prof.gold, chars: Object.fromEntries(Object.entries(prof.chars).map(([k, c]) => [k, { level: c.level }])) } : null));
  }
  let base = PUBLIC, rel = url;
  if (url.startsWith('/lib/three/')) { base = THREE_DIR; rel = url.slice('/lib/three'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const game = createGame({ db, makeToken: () => crypto.randomBytes(16).toString('hex'), dev: !!process.env.EMBERFALL_DEV });
wss.on('connection', (ws) => game.attach(ws));
server.listen(PORT, () => console.log(`Emberfall running at http://localhost:${PORT}`));
