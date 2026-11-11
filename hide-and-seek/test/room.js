// Tests the artifact multiplayer path: one tab hosts the game, another joins, through a fake realtime room.
import { connectRoom } from '../public/js/net.js';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const members = new Map(); // peer -> { presence, listeners:Set }
let gone = [];
function notify() {
  setTimeout(() => {
    const left = gone; gone = [];
    for (const [peer, mem] of members) {
      const peers = [...members].map(([p, m]) => ({ peer: p, presence: m.presence, sameTab: p === peer }));
      for (const fn of [...mem.listeners]) fn({ peers, joined: [], updated: [], left });
    }
  }, 5);
}
let n = 0;
const api = () => ({
  async join() {
    const peer = 'p' + String(++n).padStart(3, '0'), mem = { presence: Object.freeze({}), listeners: new Set() };
    members.set(peer, mem);
    notify();
    return {
      presence: async (patch) => {
        if (JSON.stringify({ ...mem.presence, ...patch }).length > 4096) throw new Error('presence over 4 KiB');
        mem.presence = JSON.parse(JSON.stringify({ ...mem.presence, ...patch }));
        notify();
      },
      onPeers: (fn) => { mem.listeners.add(fn); notify(); return () => mem.listeners.delete(fn); },
      leave: async () => { members.delete(peer); gone.push({ peer }); notify(); },
    };
  },
});

const log = { host: [], guest: [] };
const mk = (who) => ({ onmsg: (m) => log[who].push(m), onclose: (r) => log[who].push({ t: 'closed', r }) });
const host = await connectRoom(api(), 'Hosty', 'abc', mk('host'));
const guest = await connectRoom(api(), 'Guesty', 'abc', mk('guest'));
await new Promise((r) => setTimeout(r, 600));

const gw = log.guest.find((m) => m.t === 'welcome'), hw = log.host.find((m) => m.t === 'welcome');
if (!hw || !gw || gw.id === hw.id) fail('both should be welcomed with different ids');
const ro = log.guest.filter((m) => m.t === 'ro').pop();
if (!ro || ro.p.length !== 2 || !ro.p.some((p) => p.n === 'Guesty')) fail('guest should see a roster of two');

// the guest walks; the host must see it
guest.send({ t: 's', x: gw.x + 1, z: gw.z, r: 1, f: 4, q: 0 });
host.send({ t: 'lobby', a: 'addBot' });
host.send({ t: 'lobby', a: 'start' });
await new Promise((r) => setTimeout(r, 700));
const hs = log.host.filter((m) => m.t === 'st').pop(), gs = log.guest.filter((m) => m.t === 'st').pop();
if (!gs || gs.ph !== 'hide' || gs.p.length !== 3) fail('guest should see the round start with 3 players');
if (!log.guest.some((m) => m.t === 'round')) fail('guest should receive the round event');
if (!log.guest.some((m) => m.t === 'tp')) fail('guest should receive its own teleport');
if (log.guest.filter((m) => m.t === 'round').length !== 1) fail('events must not be delivered twice');
if (!hs.p.find((p) => p[0] === gw.id)) fail('host should track the guest');

// host leaves -> guest is told
host.close();
await new Promise((r) => setTimeout(r, 4600));
if (!log.guest.some((m) => m.t === 'closed')) fail('guest should be told when the host leaves');
console.log('room OK');
process.exit(0);
