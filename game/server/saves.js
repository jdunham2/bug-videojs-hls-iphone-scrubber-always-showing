// Save versioning + migrations and chat moderation. Pure (no Node APIs) so the offline browser build can use it too.
// ---------- save versioning ----------
export const SAVE_VERSION = 6;
const MIGRATIONS = [
  /* 1 */ (p) => { p.chars ||= {}; p.stash ||= []; p.chests ||= {}; },
  /* 2 */ (p) => { p.mats ||= { shards: 0, cores: 0 }; p.gems ||= {}; },
  /* 3 */ (p) => { for (const c of Object.values(p.chars)) { c.talents ||= {}; c.quest ||= { i: 0, n: 0 }; c.bag ||= []; } },
  /* 4 */ (p) => { p.friends ||= []; p.friendReq ||= []; p.cosmetics ||= []; p.cos ||= {}; },
  /* 5 */ (p) => { p.house ||= { items: [], owned: {}, next: 1 }; p.trophies ||= {}; p.fish ||= {}; },
  /* 6 */ (p) => { p.muted ||= []; p.mats.essence ||= 0; },
];
/** upgrade a stored profile in place to the current save version; returns the list of steps applied */
export function migrate(p) {
  const from = p.v || 0, done = [];
  for (let v = from; v < SAVE_VERSION; v++) { MIGRATIONS[v](p); done.push(v + 1); }
  p.v = SAVE_VERSION;
  return done;
}

// ---------- chat moderation ----------
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'dick', 'whore', 'slut', 'faggot', 'retard', 'nigger', 'kys'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const norm = (w) => w.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
/** masks profanity (also l33t and repeated-letter variants) with asterisks, keeping message length */
export function filterText(text) {
  return String(text).replace(/[\p{L}\p{N}@$]+/gu, (w) => { const n = norm(w).replace(/(.)\1+/g, '$1'); return BAD.some((b) => { const c = b.replace(/(.)\1+/g, '$1'); return b.length <= 4 ? n === c || n === c + 's' || n === c + 'y' : n.includes(c); }) ? '*'.repeat(w.length) : w; });
}
export const cleanName = (n) => { const f = filterText(String(n || '').slice(0, 16)).trim(); return /\*/.test(f) || !f ? 'Hero' : f; };

