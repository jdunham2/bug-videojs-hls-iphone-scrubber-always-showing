// Tiny JSON-file profile database (atomic writes, debounced).
import fs from 'node:fs';
import path from 'node:path';

export class DB {
  constructor(file) {
    this.file = file;
    this.data = { profiles: {} };
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fresh db */ }
    this.data.profiles ||= {};
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
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
