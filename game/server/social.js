// Social + live-ops (server authoritative): friend codes, friends list and whispers, guilds with a shared
// stash and guild rift leaderboard, daily/weekly bounties, seasons with a cosmetic reward track.
import { allBounties, dayKey, weekKey, SEASON_TRACK, COSMETICS, GUILD_COST, GUILD_MAX, GUILD_STASH, validGuildName, validGuildTag } from '../public/shared/social.js';
import { season } from '../public/shared/rifts.js';

const CODE_A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createSocial({ db, online, send, P }) {
  const tagIndex = new Map();
  const index = () => { if (tagIndex.size) return; for (const [tok, pr] of Object.entries(db.data.profiles || {})) if (pr.tag) tagIndex.set(pr.tag, tok); };
  const guilds = () => (db.data.guilds ||= {});
  const byTag = (tag) => { index(); const tok = tagIndex.get(String(tag || '').toUpperCase().trim()); return tok ? db.get(tok) : null; };
  const onlineByTag = (tag) => { for (const p of online.values()) if (p.prof.tag === tag) return p; return null; };
  const onlineByName = (name) => { const n = String(name || '').toLowerCase(); for (const p of online.values()) if (p.prof.name.toLowerCase() === n) return p; return null; };

  function ensure(prof) {
    index();
    if (!prof.tag) { let t; do { t = Array.from({ length: 6 }, () => CODE_A[Math.floor(Math.random() * CODE_A.length)]).join(''); } while (tagIndex.has(t)); prof.tag = t; tagIndex.set(t, prof.token); }
    prof.friends ||= []; prof.friendReq ||= []; prof.guildInv ||= []; prof.cosmetics ||= []; prof.cos ||= {};
    const d = dayKey(), w = weekKey();
    const b = (prof.bounty ||= { day: d, week: w, prog: {}, done: [] });
    if (b.day !== d) { for (const k of Object.keys(b.prog)) if (k.startsWith('d')) delete b.prog[k]; b.done = b.done.filter((k) => !k.startsWith('d')); b.day = d; }
    if (b.week !== w) { for (const k of Object.keys(b.prog)) if (k.startsWith('w')) delete b.prog[k]; b.done = b.done.filter((k) => !k.startsWith('w')); b.week = w; }
    const s = season();
    if (!prof.season || prof.season.id !== s) prof.season = { id: s, marks: 0, claimed: [] }; // marks reset, unlocked cosmetics stay
    if (prof.guild && !guilds()[prof.guild]) prof.guild = null;
    return prof;
  }

  function view(p) {
    const pr = ensure(p.prof), G = pr.guild ? guilds()[pr.guild] : null;
    const friend = (tag) => { const f = byTag(tag), o = onlineByTag(tag); return { tag, name: f?.name || '?', online: !!o, room: o?.roomCode || null, zone: o?.zone || null, cls: o?.cls || null, level: o?.char.level || null }; };
    return {
      t: 'social', tag: pr.tag, friends: pr.friends.map(friend), requests: pr.friendReq.map((tag) => ({ tag, name: byTag(tag)?.name || '?' })),
      guild: G && { id: G.id, name: G.name, tag: G.tag, leader: G.leader, members: G.members.map(friend), stash: G.stash },
      guildInvites: pr.guildInv.map((id) => guilds()[id]).filter(Boolean).map((g) => ({ id: g.id, name: g.name, tag: g.tag })),
      bounties: allBounties().map((b) => ({ ...b, prog: Math.min(b.n, pr.bounty.prog[b.id] || 0), claimed: pr.bounty.done.includes(b.id) })),
      season: pr.season, cosmetics: pr.cosmetics, cos: pr.cos,
    };
  }
  const push = (p) => p && send(p.ws, view(p));
  const pushTag = (tag) => push(onlineByTag(tag));

  function addMarks(p, n) { ensure(p.prof); p.prof.season.marks += Math.round(n); p.dirty = true; }

  // progress every matching bounty; meta: { zone, k }
  function bountyEvent(p, kind, n = 1, meta = {}) {
    const pr = ensure(p.prof); let changed = false;
    for (const b of allBounties()) {
      if (b.kind !== kind || pr.bounty.done.includes(b.id)) continue;
      if (b.zone && b.zone !== meta.zone) continue;
      const before = pr.bounty.prog[b.id] || 0; if (before >= b.n) continue;
      pr.bounty.prog[b.id] = Math.min(b.n, before + n); changed = true;
      if (pr.bounty.prog[b.id] >= b.n) send(p.ws, { t: 'bountyReady', text: b.text, weekly: b.weekly });
    }
    if (changed) { p.dirty = true; p.socialDirty = true; }
  }

  function guildRift(p, k, time) {
    const pr = p.prof; if (!pr.guild) return;
    const B = ((db.data.guildBoard ||= {})[season()] ||= {}), cur = B[pr.guild], G = guilds()[pr.guild];
    if (!cur || k > cur.k || (k === cur.k && time < cur.time)) B[pr.guild] = { name: G.name, tag: G.tag, k, time, by: pr.name };
    db.touch();
  }
  const guildBoard = () => Object.values((db.data.guildBoard || {})[season()] || {}).sort((a, b) => b.k - a.k || a.time - b.time).slice(0, 20);

  /** returns an error string, true when handled, or undefined if the message is not a social message */
  function handle(p, m, ctx) {
    const pr = ensure(p.prof);
    switch (m.t) {
      case 'social': push(p); return true;
      case 'friendAdd': {
        const tag = String(m.code || '').toUpperCase().trim(), f = byTag(tag);
        if (!f || tag === pr.tag) return 'No hero with that friend code.';
        if (pr.friends.includes(tag)) return 'Already friends.';
        ensure(f);
        if (pr.friendReq.includes(tag)) { pr.friendReq = pr.friendReq.filter((x) => x !== tag); pr.friends.push(tag); f.friends.push(pr.tag); f.friendReq = f.friendReq.filter((x) => x !== pr.tag); }
        else if (!f.friendReq.includes(pr.tag)) { f.friendReq.push(pr.tag); const o = onlineByTag(tag); if (o) send(o.ws, { t: 'notice', text: `${pr.name} sent you a friend request (O to open Social).`, color: '#7ad0ff' }); }
        db.touch(); push(p); pushTag(tag); return true;
      }
      case 'friendAccept': case 'friendDecline': {
        const tag = String(m.code || ''), f = byTag(tag);
        if (!pr.friendReq.includes(tag) || !f) return 'No such request.';
        pr.friendReq = pr.friendReq.filter((x) => x !== tag);
        if (m.t === 'friendAccept' && !pr.friends.includes(tag)) { ensure(f); pr.friends.push(tag); if (!f.friends.includes(pr.tag)) f.friends.push(pr.tag); }
        db.touch(); push(p); pushTag(tag); return true;
      }
      case 'friendRemove': {
        const tag = String(m.code || ''), f = byTag(tag);
        pr.friends = pr.friends.filter((x) => x !== tag); if (f?.friends) f.friends = f.friends.filter((x) => x !== pr.tag);
        db.touch(); push(p); pushTag(tag); return true;
      }
      case 'whisper': {
        const text = String(m.text || '').slice(0, 200).trim(); if (!text) return true;
        const to = onlineByTag(String(m.to || '').toUpperCase()) || onlineByName(m.to);
        if (!to || to === p) return `${m.to} is not online.`;
        send(to.ws, { t: 'whisper', from: pr.name, fromTag: pr.tag, text });
        send(p.ws, { t: 'whisper', to: to.prof.name, toTag: to.prof.tag, text, self: true });
        return true;
      }
      // ---- guilds ----
      case 'guildCreate': {
        if (pr.guild) return 'Leave your guild first.';
        const name = String(m.name || '').trim(), tag = String(m.tag || '').toUpperCase();
        if (!validGuildName(name)) return 'Guild names are 3-20 letters, numbers or spaces.';
        if (!validGuildTag(tag)) return 'Guild tags are 2-4 letters or numbers.';
        if (Object.values(guilds()).some((g) => g.name.toLowerCase() === name.toLowerCase() || g.tag === tag)) return 'That guild name or tag is taken.';
        if (pr.gold < GUILD_COST) return `Founding a guild costs ${GUILD_COST} gold.`;
        pr.gold -= GUILD_COST;
        const id = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        guilds()[id] = { id, name, tag, leader: pr.tag, members: [pr.tag], stash: [], created: Date.now() };
        pr.guild = id; p.dirty = true; db.touch(); push(p); return true;
      }
      case 'guildInvite': {
        const G = guilds()[pr.guild]; if (!G) return 'You are not in a guild.';
        if (G.members.length >= GUILD_MAX) return 'Your guild is full.';
        const tag = String(m.code || '').toUpperCase(), f = byTag(tag); if (!f) return 'No hero with that friend code.';
        ensure(f); if (f.guild) return `${f.name} is already in a guild.`;
        if (!f.guildInv.includes(G.id)) f.guildInv.push(G.id);
        const o = onlineByTag(tag); if (o) { send(o.ws, { t: 'notice', text: `${pr.name} invited you to <${G.tag}> ${G.name}.`, color: '#ffd34d' }); push(o); }
        db.touch(); return true;
      }
      case 'guildAccept': {
        const G = guilds()[m.id]; if (!G || !pr.guildInv.includes(m.id)) return 'That invite has expired.';
        if (pr.guild) return 'Leave your guild first.';
        if (G.members.length >= GUILD_MAX) return 'That guild is full.';
        G.members.push(pr.tag); pr.guild = G.id; pr.guildInv = [];
        for (const t of G.members) pushTag(t);
        db.touch(); return true;
      }
      case 'guildLeave': {
        const G = guilds()[pr.guild]; if (!G) return true;
        G.members = G.members.filter((t) => t !== pr.tag); pr.guild = null;
        if (!G.members.length) delete guilds()[G.id]; else if (G.leader === pr.tag) G.leader = G.members[0];
        for (const t of G.members) pushTag(t);
        db.touch(); push(p); return true;
      }
      case 'guildStash': {
        const G = guilds()[pr.guild]; if (!G) return 'You are not in a guild.';
        if (!ctx.atStash) return 'Use the guild stash at the Emberhold stash chest.';
        const i = m.i | 0;
        if (m.op === 'put') { const it = p.char.bag[i]; if (!it) return 'No item.'; if (G.stash.length >= GUILD_STASH) return 'The guild stash is full.'; p.char.bag.splice(i, 1); G.stash.push(it); }
        else { const it = G.stash[i]; if (!it) return 'No item.'; if (p.char.bag.length >= P.BAG_SIZE) return 'Your bag is full.'; G.stash.splice(i, 1); p.char.bag.push(it); }
        p.dirty = true; db.touch(); for (const t of G.members) pushTag(t); return true;
      }
      // ---- bounties & seasons ----
      case 'bountyClaim': {
        const b = allBounties().find((x) => x.id === m.id);
        if (!b || pr.bounty.done.includes(b.id) || (pr.bounty.prog[b.id] || 0) < b.n) return 'That bounty is not complete.';
        if (!ctx.atBoard) return 'Claim bounties at the Bounty Board in Emberhold.';
        pr.bounty.done.push(b.id); pr.gold += b.reward.gold; pr.season.marks += b.reward.marks;
        if (b.reward.gems) P.dropGem(p, ctx.level + 3);
        if (b.reward.legendary) p.char.bag.push(P.rollItem(p, Math.max(ctx.level, p.char.level), { rarity: 4 }));
        p.dirty = true; db.touch(); push(p);
        send(p.ws, { t: 'notice', text: `Bounty complete! +${b.reward.gold}g · +${b.reward.marks} Season Marks${b.reward.legendary ? ' · a Legendary item' : ''}`, color: '#ffd34d' });
        return true;
      }
      case 'seasonClaim': {
        const T = SEASON_TRACK[m.tier | 0];
        if (!T || pr.season.claimed.includes(m.tier | 0)) return 'Already claimed.';
        if (pr.season.marks < T.marks) return `You need ${T.marks} Season Marks.`;
        pr.season.claimed.push(m.tier | 0); if (!pr.cosmetics.includes(T.cos)) pr.cosmetics.push(T.cos);
        p.dirty = true; db.touch(); push(p);
        send(p.ws, { t: 'notice', text: `Unlocked: ${COSMETICS[T.cos].name}!`, color: COSMETICS[T.cos].color });
        return true;
      }
      case 'cosEquip': {
        const type = ['title', 'aura', 'steed'].includes(m.type) ? m.type : null; if (!type) return true;
        if (m.id && (!pr.cosmetics.includes(m.id) || COSMETICS[m.id]?.type !== type)) return 'You have not unlocked that.';
        pr.cos[type] = m.id || null; p.dirty = true; db.touch(); push(p); return true;
      }
    }
    return undefined;
  }

  function guildChat(p, text) {
    const G = guilds()[p.prof.guild]; if (!G) return 'You are not in a guild.';
    for (const t of G.members) { const o = onlineByTag(t); if (o) send(o.ws, { t: 'chat', from: `<${G.tag}> ${p.prof.name}`, color: '#7affb0', text: String(text).slice(0, 160) }); }
    return true;
  }
  const notifyFriends = (p) => { for (const t of p.prof.friends || []) pushTag(t); };
  const guildOf = (prof) => (prof.guild ? guilds()[prof.guild] : null);

  return { ensure, view, push, handle, bountyEvent, addMarks, guildRift, guildBoard, guildChat, notifyFriends, guildOf };
}
