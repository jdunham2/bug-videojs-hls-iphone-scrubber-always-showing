// SQLite profile store (node:sqlite). Same interface as the JSON DB: keeps a hot in-memory copy, persists in transactions.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const KV_KEYS = ['leaderboard', 'guilds', 'guildBoard'];
export class SqliteDB {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles (token TEXT PRIMARY KEY, json TEXT NOT NULL, updated INTEGER); CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, json TEXT NOT NULL);');
    this.data = { profiles: {} };
    for (const r of this.db.prepare('SELECT token, json FROM profiles').all()) this.data.profiles[r.token] = JSON.parse(r.json);
    for (const k of KV_KEYS) { const r = this.db.prepare('SELECT json FROM kv WHERE k = ?').get(k); if (r) this.data[k] = JSON.parse(r.json); }
    this.dirty = false;
    setInterval(() => this.flush(), 3000).unref();
    const bye = () => { this.flush(); process.exit(0); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
  }
  get(token) { return this.data.profiles[token] || null; }
  put(token, prof) { this.data.profiles[token] = prof; this.touch(); }
  touch() { this.dirty = true; }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const up = this.db.prepare('INSERT INTO profiles (token, json, updated) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET json = excluded.json, updated = excluded.updated');
    const kv = this.db.prepare('INSERT INTO kv (k, json) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET json = excluded.json');
    this.db.exec('BEGIN');
    try {
      const now = Date.now();
      for (const [t, p] of Object.entries(this.data.profiles)) up.run(t, JSON.stringify(p), now);
      for (const k of KV_KEYS) if (this.data[k]) kv.run(k, JSON.stringify(this.data[k]));
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); console.error('db flush failed', e); this.dirty = true; }
  }
}
