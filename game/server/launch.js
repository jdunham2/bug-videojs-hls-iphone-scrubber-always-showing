// Launch readiness: save versioning + migrations, chat moderation, email magic-link accounts, signed admin
// actions with rate limits, client error reports, and the directory-service client for cross-server presence.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export { SAVE_VERSION, migrate, filterText, cleanName } from './saves.js';

// ---------- accounts: optional email login via magic link ----------
export const emailKey = (email) => createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
export const validEmail = (e) => typeof e === 'string' && e.length < 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
export function createAccounts({ db, mailer, baseUrl }) {
  const pending = new Map(), hits = new Map();
  const limited = (key, n = 3, ms = 10 * 60 * 1000) => { const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < ms); h.push(now); hits.set(key, h); return h.length > n; };
  return {
    /** start a login: links the email to `token` (or to the profile already bound to it) once the link is opened */
    async request(email, token, ip = '') {
      if (!validEmail(email)) return { error: 'Enter a valid email address.' };
      if (limited('e:' + emailKey(email)) || limited('ip:' + ip, 10)) return { error: 'Too many login emails — try again in a few minutes.' };
      const code = randomBytes(20).toString('hex');
      pending.set(code, { key: emailKey(email), token, exp: Date.now() + 15 * 60 * 1000 });
      const link = `${baseUrl()}/login?code=${code}`;
      await mailer({ to: email.trim(), subject: 'Your Emberfall login link', text: `Open this link within 15 minutes to sign in to Emberfall on this device:\n\n${link}\n\nIf you did not ask for this, ignore this email.` });
      return { ok: true };
    },
    /** finish a login: returns the profile token this device should use */
    redeem(code) {
      const P = pending.get(String(code)); pending.delete(String(code));
      if (!P || P.exp < Date.now()) return { error: 'This link has expired. Request a new one in Settings.' };
      const A = (db.data.accounts ||= {});
      if (!A[P.key] && P.token && db.get(P.token)) { A[P.key] = P.token; db.get(P.token).email = true; db.touch(); }
      return A[P.key] ? { token: A[P.key] } : { error: 'No hero is linked to this email yet.' };
    },
  };
}

// ---------- signed admin actions ----------
/** dashboard requests carry x-admin-ts and x-admin-sig = HMAC-SHA256(key, ts + '.' + body) */
export function verifyAdmin(key, ts, sig, body) {
  if (!key || !ts || !sig || Math.abs(Date.now() - +ts) > 60000) return false;
  const want = createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
  try { return timingSafeEqual(Buffer.from(want), Buffer.from(String(sig))); } catch { return false; }
}
export const signAdmin = (key, ts, body) => createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
export function rateLimiter(n, ms) { const hits = []; return () => { const now = Date.now(); while (hits.length && now - hits[0] > ms) hits.shift(); if (hits.length >= n) return false; hits.push(now); return true; }; }

// ---------- directory client: register this server and learn where friends are online ----------
export function directoryClient({ url, self, onlineTags, fetchImpl = globalThis.fetch }) {
  const state = { servers: [], presence: {}, ok: false };
  async function beat() {
    if (!url) return;
    try {
      const r = await fetchImpl(`${url}/heartbeat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...self(), tags: onlineTags() }) });
      const j = await r.json(); state.servers = j.servers || []; state.presence = j.presence || {}; state.ok = true;
    } catch { state.ok = false; }
  }
  return { state, beat, where: (tag) => state.presence[tag] || null };
}
