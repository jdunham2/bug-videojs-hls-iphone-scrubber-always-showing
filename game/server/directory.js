// Emberfall directory service: game servers send heartbeats (name, region, url, player count, online friend
// codes); clients and servers read back the server list and where each friend code is online.
// Run standalone:  node server/directory.js   (PORT, default 4000)  or embed createDirectory() in tests.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function createDirectory({ ttl = 45000 } = {}) {
  const servers = new Map(); // id -> { id, name, region, url, players, rooms, at, tags }
  const prune = () => { const now = Date.now(); for (const [id, s] of servers) if (now - s.at > ttl) servers.delete(id); };
  const list = () => { prune(); return [...servers.values()].map(({ tags, ...s }) => s).sort((a, b) => a.region.localeCompare(b.region) || b.players - a.players); };
  const presence = () => { prune(); const out = {}; for (const s of servers.values()) for (const t of s.tags || []) out[t] = { server: s.name, region: s.region, url: s.url }; return out; };
  function heartbeat(b) {
    const id = String(b.id || b.url || '').slice(0, 200); if (!id) return { error: 'missing id' };
    servers.set(id, { id, name: String(b.name || 'Emberfall').slice(0, 40), region: String(b.region || 'unknown').slice(0, 24), url: String(b.url || '').slice(0, 200), players: b.players | 0, rooms: b.rooms | 0, at: Date.now(), tags: (b.tags || []).slice(0, 2000).map((t) => String(t).slice(0, 12)) });
    return { servers: list(), presence: presence() };
  }
  const handler = (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.url === '/servers') { res.writeHead(200, cors); return res.end(JSON.stringify(list())); }
    if (req.url === '/heartbeat' && req.method === 'POST') {
      let body = ''; req.on('data', (c) => { body += c; if (body.length > 200000) req.destroy(); });
      req.on('end', () => { let b = {}; try { b = JSON.parse(body); } catch { /* bad json */ } res.writeHead(200, cors); res.end(JSON.stringify(heartbeat(b))); });
      return;
    }
    res.writeHead(404, cors); res.end('{}');
  };
  return { heartbeat, list, presence, handler };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dir = createDirectory(), port = process.env.PORT || 4000;
  http.createServer(dir.handler).listen(port, () => console.log(`Emberfall directory on :${port}`));
}
