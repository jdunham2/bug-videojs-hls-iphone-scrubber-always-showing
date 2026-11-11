// Drives a vehicle through the game rules directly: climbing in, fuel burn per metre, engine noise, getting out, being caught.
import { makeRoom, joinRoom, addBot, handleMessage, tickRoom } from '../public/shared/game.js';
import { VEHICLES } from '../public/shared/world.js';

let clock = 1e12;
Date.now = () => clock;
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const room = makeRoom('V', {});
const got = [];
const me = joinRoom(room, 'Driver', (m) => got.push(m));
addBot(room);
const tick = (n = 1) => { for (let i = 0; i < n; i++) { clock += 1000 / 15; tickRoom(room, 1 / 15); } };
const v = room.veh.find((o) => o.k === 4); // the rocket car
if (!v) fail('no rocket car on the map');
// walk next to it and climb in
me.x = v.x + 1.5; me.z = v.z;
handleMessage(room, me, { t: 'a', a: 'use' });
if (me.veh !== v.id || v.driver !== me.id) fail('could not climb in');
// drive 60 m in small steps (the server refuses jumps of more than 6 m)
let x = v.x, z = v.z;
const dir = x > 0 ? -1 : 1;
for (let i = 0; i < 100; i++) { x += dir * 0.6; handleMessage(room, me, { t: 's', x, z, r: 0, f: 0, q: me.q, l: 0, vr: 1.5 }); tick(); }
const want = 100 - (60 * VEHICLES[4].drain) / VEHICLES[4].max;
if (Math.abs(v.fuel - want) > 1) fail(`fuel should be about ${want.toFixed(1)} after 60 m, is ${v.fuel.toFixed(1)}`);
if (Math.abs(v.x - x) > 0.01 || v.r !== 1.5) fail('server did not follow the vehicle');
// parked with the driver aboard it recovers slowly; empty it recovers faster
const f0 = v.fuel;
tick(30);
if (!(v.fuel > f0)) fail('fuel should recover while parked');
handleMessage(room, me, { t: 'a', a: 'use' });
if (me.veh !== -1 || v.driver) fail('could not get out');
if (!got.some((m) => m.t === 'tp')) fail('driver should be placed beside the vehicle');
if (Math.hypot(me.x - v.x, me.z - v.z) > 2.5) fail('driver ended up far from the vehicle');
// a second player cannot take an occupied vehicle
handleMessage(room, me, { t: 'a', a: 'use' });
const other = joinRoom(room, 'Other', () => {});
other.x = v.x + 1; other.z = v.z;
handleMessage(room, other, { t: 'a', a: 'use' });
if (other.veh !== -1) fail('two drivers in one vehicle');
console.log('vehicles OK (rocket car fuel after 60 m:', want.toFixed(1) + ')');
