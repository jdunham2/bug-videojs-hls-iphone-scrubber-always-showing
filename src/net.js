// The network link for online play.
//
// On claude.ai the game uses the page's live "room": everyone who has the game
// open right now (signed in, and invited to it) is in it. Each player shares one
// small state object (their "presence"), which everyone else receives about 15
// times a second. Everything in online play travels that way, so it works for
// every player, not only the page's editors.
//
// Opened anywhere else (a local dev server, a test), two tabs of the same
// browser can play together through a BroadcastChannel instead.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Connect, or resolve null when online play isn't available here. */
export async function connectNet() {
  // Inside claude.ai the page is embedded and `window.claude` arrives early; give it a moment.
  const embedded = window.parent !== window;
  for (let i = 0; i < 10 && embedded && !window.claude?.use; i++) await sleep(300);
  if (window.claude?.use) {
    try {
      const room = await window.claude.use('room');
      return room ? wrapRoom(room) : null;
    } catch {
      return null;
    }
  }
  return typeof BroadcastChannel === 'function' ? localNet() : null;
}

/** The claude.ai room, behind the small interface the game uses. */
function wrapRoom(room) {
  const listeners = [];
  let dead = false;
  room.onPeers(
    () => listeners.forEach((f) => f()),
    () => {
      dead = true; // not granted / revoked: play on alone
      listeners.forEach((f) => f());
    },
  );
  return {
    kind: 'room',
    setPresence(g) {
      if (!dead) room.presence({ g }).catch(() => {});
    },
    /** Everyone else here (your other tabs count as other players). */
    peers() {
      if (dead) return [];
      return room
        .peers()
        .filter((p) => !p.sameTab && p.kind === 'viewer' && p.presence?.g)
        .map((p) => ({ peer: p.peer, by: p.by, guest: p.guest, g: p.presence.g }));
    },
    myPeer() {
      return room.peers().find((p) => p.sameTab)?.peer || 'me';
    },
    connected: () => !dead && room.connected(),
    onChange: (fn) => listeners.push(fn),
  };
}

/** Same-browser fallback: tabs talk over a BroadcastChannel. */
function localNet() {
  const id = Math.random().toString(36).slice(2, 10);
  const chan = new BroadcastChannel('draw-release-net');
  const peers = new Map();
  const listeners = [];
  let mine = null;
  const changed = () => listeners.forEach((f) => f());
  chan.onmessage = (e) => {
    const m = e.data;
    if (!m || m.id === id) return;
    if (m.bye) {
      if (peers.delete(m.id)) changed();
      return;
    }
    const fresh = !peers.has(m.id);
    peers.set(m.id, { peer: m.id, by: null, guest: false, g: m.g, seen: performance.now() });
    if (fresh) {
      if (mine) chan.postMessage({ id, g: mine }); // say hello back
      changed();
    }
  };
  setInterval(() => {
    const now = performance.now();
    let gone = false;
    for (const [k, p] of peers) {
      if (now - p.seen > 5000) {
        peers.delete(k);
        gone = true;
      }
    }
    if (gone) changed();
    if (mine) chan.postMessage({ id, g: mine }); // heartbeat
  }, 1000);
  addEventListener('pagehide', () => chan.postMessage({ id, bye: true }));
  return {
    kind: 'local',
    setPresence(g) {
      mine = g;
      chan.postMessage({ id, g });
    },
    peers: () => [...peers.values()].filter((p) => p.g),
    myPeer: () => id,
    connected: () => true,
    onChange: (fn) => listeners.push(fn),
  };
}
