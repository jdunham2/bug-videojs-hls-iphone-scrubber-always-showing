// Mischief Lane — vertical slice
// A top-down sandbox: one raccoon, one village, walk anywhere.
// Everything is drawn procedurally with Canvas 2D (no image assets).
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const TILE = 32;
  const MW = 72;            // map width in tiles
  const MH = 52;            // map height in tiles
  const WORLD_W = MW * TILE;
  const WORLD_H = MH * TILE;
  const IH = 12;            // extra rows below the village that hold house interiors
  const MH_ALL = MH + IH;
  const WALK_SPEED = 105;   // px / s
  const RUN_SPEED = 185;
  const ACCEL = 900;
  const FRICTION = 1100;

  // Tile types
  const GRASS = 0, PATH = 1, WATER = 2, SAND = 3, SOIL = 4, STONE = 5, BRIDGE = 6, FLOOR = 7, WALL = 8;

  // ---------------------------------------------------------------------------
  // Deterministic RNG so the village is the same every time
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rand = mulberry32(20261114); // re-seeded for every new village
  const rr = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------------------
  const map = new Uint8Array(MW * MH_ALL);
  const used = new Uint8Array(MW * MH_ALL); // tiles reserved by objects / features
  const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH_ALL;
  const idx = (x, y) => y * MW + x;
  const getT = (x, y) => (inb(x, y) ? map[idx(x, y)] : WATER);
  const setT = (x, y, t) => { if (inb(x, y)) map[idx(x, y)] = t; };
  const rectT = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setT(i, j, t); };
  const reserve = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inb(i, j)) used[idx(i, j)] = 1; };
  const isUsed = (x, y) => !inb(x, y) || used[idx(x, y)] === 1;

  const objects = [];
  let hideBushes = []; // the walk-in bushes of the current village

  // ---------------------------------------------------------------------------
  // Village generator. Each run rolls a new layout from a seed:
  // two crossing roads with the plaza on the crossing, and the four corners
  // shuffled between the pond, the garden and two clusters of houses.
  // ---------------------------------------------------------------------------
  let L = null; // current layout

  const VILLAGE_A = ['Bramble', 'Thistle', 'Puddle', 'Clover', 'Hazel', 'Mossy', 'Willow', 'Nettle', 'Acorn', 'Fern', 'Badger', 'Rook'];
  const VILLAGE_B = ['wick', 'ford', 'ton', 'bury', 'dale', 'by', 'field', 'combe', 'stead', 'hollow', 'mere', 'ley'];

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function genLayout() {
    const roadY = 22 + Math.floor(rand() * 7);  // top row of the 2-wide east–west road
    const roadX = 28 + Math.floor(rand() * 15); // left column of the 2-wide north–south road
    const quads = {
      NW: { x0: 4, y0: 4, x1: roadX - 1, y1: roadY - 1, north: true },
      NE: { x0: roadX + 3, y0: 4, x1: MW - 4, y1: roadY - 1, north: true },
      SW: { x0: 4, y0: roadY + 3, x1: roadX - 1, y1: MH - 4, north: false },
      SE: { x0: roadX + 3, y0: roadY + 3, x1: MW - 4, y1: MH - 4, north: false },
    };
    const order = shuffled(['NW', 'NE', 'SW', 'SE']);
    return {
      name: pick(VILLAGE_A) + pick(VILLAGE_B),
      roadY, roadX,
      plaza: { x: roadX - 5, y: roadY - 5, w: 12, h: 12 },
      quads,
      pondQ: quads[order[0]], gardenQ: quads[order[1]], homeQs: [quads[order[2]], quads[order[3]]],
      hideSide: rand() < 0.5 ? 'W' : 'E',
      houses: [], pond: null, garden: null, picnic: null,
    };
  }

  // Find a free w×h tile rect inside a quadrant (grass only, nothing reserved, clear of the plaza)
  function fitRect(q, w, h, tries = 80) {
    const keepOut = { x: L.plaza.x - 2, y: L.plaza.y - 2, w: L.plaza.w + 4, h: L.plaza.h + 4 };
    for (let n = 0; n < tries; n++) {
      const x = q.x0 + Math.floor(rand() * Math.max(1, q.x1 - q.x0 - w + 1));
      const y = q.y0 + Math.floor(rand() * Math.max(1, q.y1 - q.y0 - h + 1));
      if (x + w > q.x1 || y + h > q.y1) continue;
      const r = { x, y, w, h };
      if (rectsOverlap(r, keepOut)) continue;
      let ok = true;
      for (let j = y; j < y + h && ok; j++) for (let i = x; i < x + w; i++) {
        if (isUsed(i, j) || getT(i, j) !== GRASS) { ok = false; break; }
      }
      if (ok) return r;
    }
    return null;
  }

  // Carve a dirt path from (sx, sy) to the nearest existing path/plaza tile
  function carvePath(sx, sy, solid) {
    const prev = new Int32Array(MW * MH).fill(-1);
    const start = idx(sx, sy);
    prev[start] = start;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi], cx = cur % MW, cy = Math.floor(cur / MW);
      const t = map[cur];
      if (cur !== start && (t === PATH || t === STONE || t === BRIDGE)) {
        for (let i = prev[cur]; i !== start; i = prev[i]) setT(i % MW, Math.floor(i / MW), PATH);
        setT(sx, sy, PATH);
        return true;
      }
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 2 || ny < 2 || nx >= MW - 2 || ny >= MH - 2) continue;
        const ni = idx(nx, ny);
        if (prev[ni] !== -1 || solid[ni] || map[ni] === WATER) continue;
        prev[ni] = cur;
        queue.push(ni);
      }
    }
    return false;
  }

  function buildMap() {
    const { roadY, roadX, plaza } = L;
    const solid = new Uint8Array(MW * MH); // footprints paths must route around
    const markSolid = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inb(i, j)) solid[idx(i, j)] = 1; };

    // Hideout clearing first, at one end of the east–west road
    const hx = L.hideSide === 'W' ? 4.8 : MW - 4.8;
    reserve(Math.floor(hx) - 3, roadY - 5, 7, 5);
    markSolid(Math.floor(hx) - 1, roadY - 3, 3, 1);
    HIDEOUT = { x: hx * TILE, y: (roadY - 1.2) * TILE, rx: 50, ry: 28 };

    // Roads + plaza
    for (let x = 2; x < MW - 2; x++) for (let y = roadY; y <= roadY + 1; y++) setT(x, y, PATH);
    for (let y = 3; y < MH - 3; y++) for (let x = roadX; x <= roadX + 1; x++) setT(x, y, PATH);
    rectT(plaza.x, plaza.y, plaza.w, plaza.h, STONE);

    // Pond (+ a stream running off to the nearest map edge)
    {
      const q = L.pondQ;
      // Start big and shrink until it fits in its corner
      let rx = 7 + Math.floor(rand() * 3), ry = 5 + Math.floor(rand() * 2), r = null, w = 0, h = 0;
      for (;;) {
        w = Math.ceil(rx * 2.5) + 2; h = Math.ceil(ry * 2.5) + 2;
        r = fitRect(q, w, h, 120);
        if (r || (rx <= 4 && ry <= 3)) break;
        if (rx > 4) rx--;
        if (ry > 3 && (ry * 1.4 > rx || rx <= 4)) ry--;
      }
      if (!r) r = { x: q.x0, y: q.y0, w, h };
      const cx = r.x + w / 2, cy = r.y + h / 2;
      L.pond = { cx, cy, rx, ry };
      for (let y = r.y - 1; y <= r.y + h; y++) for (let x = r.x - 1; x <= r.x + w; x++) {
        if (!inb(x, y) || getT(x, y) !== GRASS) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy + Math.sin(x * 1.7 + y * 0.9) * 0.08;
        if (d < 1) setT(x, y, WATER);
        else if (d < 1.5) setT(x, y, SAND);
      }
      reserve(r.x, r.y, w, h);
      const sx0 = Math.round(cx + rx * 0.45);
      const dir = q.north ? -1 : 1;
      for (let y = Math.round(cy); y >= 0 && y < MH; y += dir) {
        const sx = sx0 + Math.round(Math.sin(y * 0.25) * 1.5);
        for (let x = sx - 1; x <= sx + 1; x++) if (getT(x, y) === GRASS || getT(x, y) === SAND) setT(x, y, WATER);
        for (const x of [sx - 2, sx + 2]) if (getT(x, y) === GRASS) setT(x, y, SAND);
        reserve(sx - 2, y, 5, 1);
      }
    }

    // Garden: 11×10 soil inside a fence, gate facing the road
    {
      const r = fitRect(L.gardenQ, 15, 14, 200) || { x: L.gardenQ.x0, y: L.gardenQ.y0 };
      const gx = r.x + 1, gy = r.y + 1;
      const gateTop = !L.gardenQ.north; // road is to the north of southern gardens
      L.garden = { x: gx, y: gy, w: 11, h: 10, gateX: gx + 5, gateY: gateTop ? gy - 1 : gy + 10, gateTop };
      rectT(gx, gy, 11, 10, SOIL);
      reserve(gx - 1, gy - 1, 13, 12);
      markSolid(gx - 1, gy - 1, 13, 12);
    }

    // Houses: up to three per home quadrant, rows nearest the road first
    const roofs = shuffled(['#b5523b', '#4f6fa8', '#7a4f8f', '#3f7f6a', '#c08a2e', '#b5523b', '#4f6fa8']);
    const keepOut = { x: plaza.x - 2, y: plaza.y - 2, w: plaza.w + 4, h: plaza.h + 4 };
    const tryHouse = (hx0, hy0, hw, hh) => {
      const res = { x: hx0 - 1, y: hy0 - 2, w: hw + 2, h: hh + 4 };
      if (res.x < 3 || res.y < 3 || res.x + res.w > MW - 3 || res.y + res.h > MH - 3) return false;
      if (rectsOverlap(res, keepOut)) return false;
      for (let j = res.y; j < res.y + res.h; j++) for (let i = res.x; i < res.x + res.w; i++) {
        if (isUsed(i, j) || getT(i, j) !== GRASS) return false;
      }
      reserve(res.x, res.y, res.w, res.h);
      markSolid(hx0, hy0, hw, hh);
      L.houses.push({ x: hx0, y: hy0, w: hw, h: hh, doorX: hx0 + Math.floor(hw / 2), roof: roofs[L.houses.length % roofs.length] });
      return true;
    };
    for (const q of L.homeQs) {
      let placed = 0;
      for (let row = 0; row < 3 && placed < 3; row++) {
        const hh = 4;
        const hy0 = q.north ? q.y1 - hh - 2 - row * 8 : q.y0 + 2 + row * 8;
        if (hy0 < q.y0 + 1 || hy0 + hh > q.y1 - 1) continue;
        for (let x = q.x0 + Math.floor(rand() * 3); x < q.x1 - 5 && placed < 3; ) {
          const hw = rand() < 0.5 ? 5 : 6;
          if (tryHouse(x, hy0, hw, hh)) { placed++; x += hw + 2 + Math.floor(rand() * 3); } else x += 1;
        }
      }
    }
    // Make sure there are at least four homes
    for (let n = 0; n < 200 && L.houses.length < 4; n++) {
      const q = L.quads[pick(['NW', 'NE', 'SW', 'SE'])];
      const r = fitRect(q, 8, 8, 1);
      if (r) tryHouse(r.x + 1, r.y + 2, 6, 4);
    }

    // Paths from every door (and the garden gate) to the road network
    for (const h of L.houses) carvePath(h.doorX, h.y + h.h, solid);
    {
      const g = L.garden;
      const outY = g.gateTop ? g.gateY - 1 : g.gateY + 1;
      setT(g.gateX, g.gateY, PATH);
      carvePath(g.gateX, outY, solid);
    }

    // Who lives where: Bertram nearest his garden, everyone else at random
    {
      const gcx = L.garden.x + 5, gcy = L.garden.y + 5;
      const byDist = L.houses.map((h, i) => [i, Math.hypot(h.x - gcx, h.y - gcy)]).sort((a, b) => a[1] - b[1]);
      const bert = byDist[0][0];
      const rest = shuffled(L.houses.map((_, i) => i).filter((i) => i !== bert));
      L.homes = { bertram: bert };
      ['fennick', 'rosa', 'percy', 'mabel', 'ollie'].forEach((id, i) => { L.homes[id] = rest.length ? rest[i % rest.length] : bert; });
      L.homes.toby = L.homes.rosa; // Toby lives with his mum
    }

    // Picnic table on the pond's road-facing side
    {
      const p = L.pond;
      const pcx = plaza.x + 6, pcy = plaza.y + 6;
      const base = Math.atan2(pcy - p.cy, pcx - p.cx);
      outer: for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, Math.PI]) {
        for (let k = 1.6; k <= 2.6; k += 0.25) {
          const tx = Math.round(p.cx + Math.cos(base + da) * p.rx * k * 0.85);
          const ty = Math.round(p.cy + Math.sin(base + da) * p.ry * k * 0.85);
          let ok = true;
          for (let j = ty - 2; j <= ty + 1 && ok; j++) for (let i = tx - 2; i <= tx + 1; i++) {
            if (!inb(i, j) || getT(i, j) !== GRASS || (isUsed(i, j) && !(Math.abs(i - p.cx) < p.rx * 1.6 && Math.abs(j - p.cy) < p.ry * 1.6))) { ok = false; break; }
          }
          if (ok) { L.picnic = { x: tx, y: ty }; break outer; }
        }
      }
      if (!L.picnic) L.picnic = { x: Math.round(pcx + 8), y: Math.round(pcy + 8) };
      reserve(L.picnic.x - 2, L.picnic.y - 2, 4, 3);
    }

    // Reserve roads and plaza so nothing grows on them
    for (let i = 0; i < MW * MH; i++) if (map[i] !== GRASS) used[i] = 1;

    buildInteriors();

    // Houses + mailboxes
    for (const h of L.houses) {
      objects.push(makeHouse(h.x, h.y, h.w, h.h, h.roof));
      objects.push(makeMailbox((h.doorX + 1.2) * TILE, (h.y + h.h + 0.7) * TILE));
    }

    // Plaza props
    const px = plaza.x, py = plaza.y;
    objects.push(makeWell((px + 6) * TILE, (py + 4.2) * TILE));
    objects.push(makeBench((px + 2) * TILE, (py + 1.4) * TILE));
    objects.push(makeBench((px + 10) * TILE, (py + 1.4) * TILE));
    objects.push(makeBench((px + 2) * TILE, (py + 10.6) * TILE));
    objects.push(makeBench((px + 10) * TILE, (py + 10.6) * TILE));
    for (const [lx, ly] of [[0.5, 0.6], [11.5, 0.6], [0.5, 11.6], [11.5, 11.6]]) objects.push(makeLamp((px + lx) * TILE, (py + ly) * TILE));
    {
      const pcx = px + 6;
      const gcx = L.garden.x + 5.5;
      const right = L.pond.cx > pcx ? 'POND' : gcx > pcx ? 'GARDEN' : 'HOMES';
      const left = L.pond.cx <= pcx ? 'POND' : gcx <= pcx ? 'GARDEN' : 'HOMES';
      objects.push(makeSign((px + 8.2) * TILE, (py + 7.4) * TILE, right, left === right ? 'HOMES' : left));
    }

    // Garden fence + scarecrow
    {
      const { x: gx, y: gy, gateX, gateY } = L.garden;
      for (let x = gx - 1; x <= gx + 11; x++) {
        if (!(x === gateX && gateY === gy - 1)) objects.push(makeFence(x, gy - 1, 'h'));
        if (!(x === gateX && gateY === gy + 10)) objects.push(makeFence(x, gy + 10, 'h'));
      }
      for (let y = gy; y <= gy + 9; y++) { objects.push(makeFence(gx - 1, y, 'v')); objects.push(makeFence(gx + 11, y, 'v')); }
      objects.push(makeScarecrow((gx + 8.5) * TILE, (gy + 4.9) * TILE));
    }

    objects.push(makePicnicTable(L.picnic.x * TILE, L.picnic.y * TILE));
    objects.push(makeHideoutLog(hx * TILE, (roadY - 2.5) * TILE));

    placeHideBushes();

    // Forest border: dense trees around the edge
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const edge = Math.min(x, y, MW - 1 - x, MH - 1 - y);
      if (edge > 2 || getT(x, y) !== GRASS || isUsed(x, y)) continue;
      if (rand() < (edge === 0 ? 0.9 : edge === 1 ? 0.7 : 0.35)) {
        objects.push(makeTree((x + rr(0.2, 0.8)) * TILE, (y + rr(0.4, 0.9)) * TILE));
        used[idx(x, y)] = 1;
      }
    }
    // Close the road ends with trees so the world edge feels solid
    for (const [x, y] of [[1, roadY], [1, roadY + 1], [MW - 2, roadY], [MW - 2, roadY + 1], [roadX, 1], [roadX + 1, 1], [roadX, MH - 2], [roadX + 1, MH - 2],
      [0, roadY], [0, roadY + 1], [MW - 1, roadY], [MW - 1, roadY + 1], [roadX, 0], [roadX + 1, 0], [roadX, MH - 1], [roadX + 1, MH - 1]]) {
      objects.push(makeTree((x + 0.5) * TILE, (y + 0.8) * TILE));
    }

    // Scattered trees, bushes, rocks on open grass
    const openSpot = (pad) => {
      for (let tries = 0; tries < 40; tries++) {
        const x = Math.floor(rr(3, MW - 3)), y = Math.floor(rr(3, MH - 3));
        let ok = true;
        for (let j = -pad; j <= pad && ok; j++) for (let i = -pad; i <= pad; i++) {
          if (isUsed(x + i, y + j) || getT(x + i, y + j) !== GRASS) { ok = false; break; }
        }
        if (ok) { used[idx(x, y)] = 1; return [x, y]; }
      }
      return null;
    };
    for (let n = 0; n < 75; n++) { const s = openSpot(1); if (s) objects.push(makeTree((s[0] + rr(0.3, 0.7)) * TILE, (s[1] + rr(0.5, 0.9)) * TILE)); }
    for (let n = 0; n < 45; n++) { const s = openSpot(0); if (s) objects.push(makeBush((s[0] + 0.5) * TILE, (s[1] + 0.75) * TILE)); }
    for (let n = 0; n < 25; n++) { const s = openSpot(0); if (s) objects.push(makeRock((s[0] + 0.5) * TILE, (s[1] + 0.7) * TILE)); }
    // Reeds along the water's sandy edge
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (getT(x, y) === SAND && rand() < 0.16) objects.push(makeReeds((x + rr(0.2, 0.8)) * TILE, (y + rr(0.5, 0.9)) * TILE));
    }
  }

  // ---------------------------------------------------------------------------
  // House interiors. Each house gets a room in a hidden strip of tiles below
  // the village (rows MH..MH_ALL). Doors move you between the two, so items,
  // physics, villagers and pathfinding all work indoors with no extra engine.
  // ---------------------------------------------------------------------------
  const ROOM_STRIDE = 12; // each room takes 12 columns of the strip
  const areaOf = (x, y) => (y < WORLD_H ? 0 : 1 + Math.floor(x / (ROOM_STRIDE * TILE)));
  const houseOfArea = (a) => (a > 0 && L && L.rooms ? L.rooms[a - 1] : null);
  const residentsOf = (h) => Object.keys(L.homes).filter((id) => L.houses[L.homes[id]] === h);
  const BLANKETS = ['#c0392b', '#4f6fa8', '#7a4f8f', '#3f7f6a', '#d9a43a', '#d94f7a'];

  function buildInteriors() {
    rectT(0, MH, MW, IH, WALL);
    L.rooms = [];
    const papers = shuffled(['#e8c9a0', '#c9d8b6', '#d8c4e0', '#f0d9a8', '#bcd3e0', '#e6b8a8']);
    const floors = shuffled(['#b07d48', '#a0703f', '#c08a52', '#9a6a3c']);
    const rugs = shuffled(['#b5523b', '#3f7f6a', '#4f6fa8', '#7a4f8f', '#c08a2e', '#2f6b5a']);
    L.houses.forEach((h, k) => {
      if (k >= 6) return; // six rooms fit in the strip; any extra house stays locked
      const x0 = 1 + k * ROOM_STRIDE, y0 = MH + 2;
      rectT(x0 + 1, y0 + 2, 9, 5, FLOOR);
      setT(x0 + 5, y0 + 7, FLOOR); // door mat
      h.room = { k, x0, y0, wall: papers[k % 6], floor: floors[k % 4], rug: rugs[k % 6], windowX: rand() < 0.5 ? 3.3 : 6.4 };
      h.area = k + 1;
      h.doorOut = { x: (h.doorX + 0.5) * TILE, y: (h.y + h.h) * TILE + 20 };
      h.exitIn = { x: (x0 + 5.5) * TILE, y: (y0 + 6.6) * TILE };
      L.rooms[k] = h;
      furnish(h);
    });
  }

  function furnish(h) {
    const T = TILE, { x0, y0 } = h.room;
    const who = residentsOf(h);
    const back = (y0 + 2.85) * T; // foot line of furniture against the back wall
    const bedLeft = rand() < 0.5;
    h.room.bedLeft = bedLeft;
    objects.push(makeBed((bedLeft ? x0 + 2.1 : x0 + 8.9) * T, (y0 + 3.9) * T, pick(BLANKETS)));
    const slots = bedLeft ? [x0 + 4.4, x0 + 6.6, x0 + 8.9] : [x0 + 2.1, x0 + 4.4, x0 + 6.6];
    const set = shuffled([who.includes('rosa') ? 'stove' : 'fireplace', 'shelf', 'wardrobe']);
    set.forEach((kind, i) => objects.push(makeFurniture(kind, slots[i] * T, back)));
    objects.push(makeTableIn((x0 + 5.5) * T, (y0 + 5) * T));
    h.room.armchair = { x: (bedLeft ? x0 + 8.8 : x0 + 2.2) * T, y: (y0 + 6.8) * T };
    objects.push(makeArmchair(h.room.armchair.x, h.room.armchair.y, h.room.rug));
    objects.push(makePlant((bedLeft ? x0 + 1.5 : x0 + 9.5) * T, (y0 + 6.8) * T));
  }

  // Furniture ------------------------------------------------------------------
  function makeBed(x, y, blanket) {
    const o = {
      // Only the headboard is solid for the raccoon, so it can crawl under the blanket;
      // navBox keeps villagers walking round the whole bed.
      kind: 'bed', x, y, hitbox: box(x - 30, y - 46, 60, 8), navBox: box(x - 30, y - 42, 60, 42), rustle: 0,
      bounds: { l: x - 34, r: x + 34, t: y - 64, b: y + 4 },
      contains(px, py) { return px > x - 26 && px < x + 26 && py > y - 31 && py < y + 3; },
      shadow(ctx) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x - 28, y - 4, 62, 6); },
      draw(ctx, t) {
        const wob = o.rustle > 0 ? Math.sin(t * 40) * 1.2 : 0;
        ctx.fillStyle = '#5a3a24'; roundRect(ctx, x - 31, y - 62, 62, 18, 4, true);       // headboard
        ctx.fillStyle = '#f4f2ee'; roundRect(ctx, x - 29, y - 48, 58, 46, 5, true);       // mattress
        ctx.fillStyle = '#ffffff'; roundRect(ctx, x - 21, y - 46, 42, 10, 4, true);       // pillow
        ctx.fillStyle = blanket; roundRect(ctx, x - 29 + wob, y - 34, 58, 32, 5, true);   // blanket
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 29 + wob, y - 34, 58, 4);
        if (player.hidden && player.hidingIn === o) { // a lump under the covers... and two eyes
          ctx.fillStyle = shade(blanket, 0.12); ellipse(ctx, player.x, player.y - 14, 13, 8);
          ctx.fillStyle = shade(blanket, -0.35); ctx.fillRect(x - 29, y - 6, 58, 5);
          ctx.fillStyle = '#ffffff'; circle(ctx, player.x - 3, y - 3.5, 1.5); circle(ctx, player.x + 3, y - 3.5, 1.5);
          ctx.fillStyle = NOSE; const look = Math.sin(t * 0.9) * 0.6; circle(ctx, player.x - 3 + look, y - 3.5, 0.75); circle(ctx, player.x + 3 + look, y - 3.5, 0.75);
        }
        ctx.fillStyle = '#5a3a24'; ctx.fillRect(x - 31, y - 4, 4, 4); ctx.fillRect(x + 27, y - 4, 4, 4);
      },
    };
    return o;
  }
  function makeFurniture(kind, x, y) {
    const o = { kind, x, y, hitbox: box(x - 20, y - 12, 40, 12), bounds: { l: x - 30, r: x + 30, t: y - 80, b: y + 4 } };
    if (kind === 'shelf') {
      const spines = Array.from({ length: 15 }, () => [pick(['#b5523b', '#4f6fa8', '#3f7f6a', '#d9a43a', '#7a4f8f', '#e8e3d6']), rr(3, 5), rr(9, 12)]);
      o.draw = (ctx) => {
        ctx.fillStyle = '#6b4226'; ctx.fillRect(x - 21, y - 66, 42, 66);
        ctx.fillStyle = '#4a2c18'; ctx.fillRect(x - 18, y - 63, 36, 60);
        let k = 0;
        for (let row = 0; row < 3; row++) {
          const sy = y - 63 + row * 20 + 18;
          ctx.fillStyle = '#6b4226'; ctx.fillRect(x - 18, sy, 36, 3);
          for (let bx = x - 17; bx < x + 15 && k < spines.length; k++) {
            const [col, w, hgt] = spines[k];
            ctx.fillStyle = col; ctx.fillRect(bx, sy - hgt, w, hgt);
            bx += w + 0.6;
          }
        }
      };
    } else if (kind === 'fireplace') {
      o.draw = (ctx, t) => {
        ctx.fillStyle = '#8f8a7c'; roundRect(ctx, x - 24, y - 50, 48, 50, 4, true);
        ctx.fillStyle = '#a8a396';
        for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) ctx.fillRect(x - 23 + c * 12 + (r % 2) * 6, y - 49 + r * 10, 10, 8);
        ctx.fillStyle = '#6b4226'; ctx.fillRect(x - 27, y - 54, 54, 6);
        ctx.fillStyle = '#1d1410'; roundRect(ctx, x - 13, y - 30, 26, 28, 10, true);
        const f = Math.sin(t * 9 + x) * 1.5;
        ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.ellipse(x, y - 9, 8, 10 + f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.ellipse(x, y - 7, 4, 6 - f * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,170,80,0.12)'; circle(ctx, x, y - 10, 30);
      };
    } else if (kind === 'stove') {
      o.draw = (ctx, t) => {
        ctx.fillStyle = '#3a3d42'; roundRect(ctx, x - 20, y - 42, 40, 42, 4, true);
        ctx.fillStyle = '#55595f'; ctx.fillRect(x - 20, y - 42, 40, 6);
        ctx.fillStyle = '#23252a'; roundRect(ctx, x - 14, y - 30, 28, 20, 3, true);
        ctx.fillStyle = `rgba(255,140,60,${0.35 + Math.sin(t * 4) * 0.1})`; ctx.fillRect(x - 11, y - 27, 22, 14);
        ctx.fillStyle = '#c0c4c8'; ctx.fillRect(x - 10, y - 40, 20, 3);
        ctx.fillStyle = '#9c3a3a'; roundRect(ctx, x - 9, y - 54, 18, 12, 3, true); // a pot
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(ctx, x - 2, y - 60 - Math.sin(t * 2) * 2, 3); circle(ctx, x + 3, y - 66 - Math.sin(t * 2 + 1) * 2, 2.5);
      };
    } else { // wardrobe
      o.draw = (ctx) => {
        ctx.fillStyle = '#7a4f2e'; roundRect(ctx, x - 19, y - 70, 38, 70, 3, true);
        ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 16, y - 66, 15, 60); ctx.strokeRect(x + 1, y - 66, 15, 60);
        ctx.fillStyle = '#f2c14e'; circle(ctx, x - 3, y - 36, 1.6); circle(ctx, x + 3, y - 36, 1.6);
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 21, y - 72, 42, 4);
      };
    }
    o.shadow = (ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x - 18, y - 2, 40, 5); };
    return o;
  }
  function makeTableIn(x, y) {
    return {
      kind: 'table', x, y, hitbox: box(x - 32, y - 24, 64, 24),
      bounds: { l: x - 46, r: x + 46, t: y - 44, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ellipse(ctx, x + 4, y - 2, 36, 7); },
      draw(ctx) {
        for (const s of [-1, 1]) { // chairs
          ctx.fillStyle = '#7a4f2e'; roundRect(ctx, x + s * 40 - 8, y - 26, 16, 18, 3, true);
          ctx.fillStyle = '#5a3a20'; ctx.fillRect(x + s * 40 - 8, y - 34, 16, 8);
        }
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 28, y - 16, 5, 16); ctx.fillRect(x + 23, y - 16, 5, 16);
        ctx.fillStyle = '#9a6a3c'; roundRect(ctx, x - 33, y - 38, 66, 24, 4, true);
        ctx.fillStyle = '#b07d48'; roundRect(ctx, x - 33, y - 38, 66, 20, 4, true);
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x - 12, y - 38, 24, 20); // runner
      },
    };
  }
  function makeArmchair(x, y, color) {
    return {
      kind: 'armchair', x, y, hitbox: box(x - 14, y - 12, 28, 12),
      bounds: { l: x - 20, r: x + 20, t: y - 40, b: y + 4 },
      shadow(ctx) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ellipse(ctx, x + 2, y - 1, 16, 4); },
      draw(ctx) {
        ctx.fillStyle = shade(color, -0.25); roundRect(ctx, x - 15, y - 34, 30, 20, 6, true);
        ctx.fillStyle = color; roundRect(ctx, x - 16, y - 20, 32, 18, 5, true);
        ctx.fillStyle = shade(color, -0.15); roundRect(ctx, x - 18, y - 24, 7, 20, 3, true); roundRect(ctx, x + 11, y - 24, 7, 20, 3, true);
      },
    };
  }
  function makePlant(x, y) {
    return {
      kind: 'plant', x, y, hitbox: box(x - 7, y - 8, 14, 8),
      bounds: { l: x - 18, r: x + 18, t: y - 44, b: y + 4 },
      draw(ctx, t) {
        ctx.fillStyle = '#c0643a'; poly(ctx, [[-8, -14], [8, -14], [6, 0], [-6, 0]].map(([a, b]) => [x + a, y + b])); ctx.fill();
        ctx.fillStyle = '#3f8a35';
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k - 2.5) * 0.45 + Math.sin(t + k) * 0.03;
          ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 10, y - 18 + Math.sin(a) * 12, 4, 9, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  }

  // Room shell drawn into the ground layer: floorboards, wallpaper, walls, rug, mat
  function drawRoomShell(g, h) {
    const T = TILE, R = h.room, X = R.x0 * T, Y = R.y0 * T;
    g.fillStyle = R.floor; g.fillRect(X + T, Y + 2 * T, 9 * T, 6 * T);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let yy = Y + 2 * T; yy < Y + 7 * T; yy += 12) {
      g.fillRect(X + T, yy, 9 * T, 1.2);
      const off = ((yy / 12) | 0) % 3 * 23;
      for (let xx = X + T + off; xx < X + 10 * T; xx += 70) g.fillRect(xx, yy, 1.2, 12);
    }
    // rug under the table
    g.fillStyle = shade(R.rug, -0.25); ellipse(g, X + 5.5 * T, Y + 4.7 * T, 3.4 * T, 1.55 * T);
    g.fillStyle = R.rug; ellipse(g, X + 5.5 * T, Y + 4.7 * T, 3.15 * T, 1.35 * T);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(X + 5.5 * T, Y + 4.7 * T, 2.5 * T, 1 * T, 0, 0, Math.PI * 2); g.stroke();
    // back wall: wallpaper, wainscot, window, picture
    g.fillStyle = R.wall; g.fillRect(X + T, Y, 9 * T, 2 * T);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    for (let xx = X + T + 6; xx < X + 10 * T; xx += 14) g.fillRect(xx, Y, 4, 2 * T - 16);
    g.fillStyle = shade(R.floor, -0.3); g.fillRect(X + T, Y + 2 * T - 16, 9 * T, 16);
    g.fillStyle = shade(R.floor, 0.12); g.fillRect(X + T, Y + 2 * T - 18, 9 * T, 3);
    const wx = X + R.windowX * T;
    g.fillStyle = '#f4f2ee'; g.fillRect(wx - 2, Y + 6, 44, 32);
    g.fillStyle = '#9fd3e8'; g.fillRect(wx + 1, Y + 9, 38, 26);
    g.fillStyle = '#ffffff'; ellipse(g, wx + 12, Y + 18, 7, 3);
    g.fillStyle = '#f4f2ee'; g.fillRect(wx + 19, Y + 9, 2, 26); g.fillRect(wx + 1, Y + 21, 38, 2);
    g.fillStyle = R.rug; g.fillRect(wx - 7, Y + 4, 7, 36); g.fillRect(wx + 40, Y + 4, 7, 36);
    // walls (dark wood) and the front wall with the door gap
    g.fillStyle = '#3a2a1e';
    g.fillRect(X, Y - 8, T, 8 * T + 8); g.fillRect(X + 10 * T, Y - 8, T, 8 * T + 8);
    g.fillRect(X, Y - 8, 11 * T, 8);
    g.fillRect(X, Y + 7 * T, 5 * T, T); g.fillRect(X + 6 * T, Y + 7 * T, 5 * T, T);
    g.fillStyle = '#5a4030';
    g.fillRect(X + T - 3, Y, 3, 7 * T); g.fillRect(X + 10 * T, Y, 3, 7 * T);
    g.fillRect(X, Y + 7 * T, 5 * T, 5); g.fillRect(X + 6 * T, Y + 7 * T, 5 * T, 5);
    // door mat
    g.fillStyle = '#8a3a2a'; roundRect(g, X + 5 * T + 3, Y + 7 * T + 3, T - 6, T - 8, 4, true);
    g.fillStyle = '#c0643a'; g.fillRect(X + 5 * T + 7, Y + 7 * T + 10, T - 14, 2); g.fillRect(X + 5 * T + 7, Y + 7 * T + 16, T - 14, 2);
  }

  // Doors ------------------------------------------------------------------------
  function enterHouse(h) {
    Object.assign(player, { x: h.exitIn.x, y: h.exitIn.y, vx: 0, vy: 0, dir: 'up', doorCD: 0.6 });
    cam.x = player.x; cam.y = player.y;
    sfx('door');
    run.visited.add(h.area);
    completeTask('burgle');
    setProgress('tour', run.visited.size);
  }
  function exitHouse(h) {
    Object.assign(player, { x: h.doorOut.x, y: h.doorOut.y, vx: 0, vy: 0, dir: 'down', doorCD: 0.6 });
    cam.x = player.x; cam.y = player.y;
    sfx('door');
    const it = player.held;
    if (it && it.home && areaOf(it.home.x, it.home.y) === h.area) completeTask('heist');
  }
  function updateDoors(dt, iy) {
    player.doorCD = Math.max(0, (player.doorCD || 0) - dt);
    if (player.doorCD > 0 || !L || !L.rooms) return;
    const a = areaOf(player.x, player.y);
    if (a === 0) {
      if (iy > -0.3) return;
      for (const h of L.rooms) {
        if (!h) continue;
        const wall = (h.y + h.h) * TILE;
        if (Math.abs(player.x - h.doorOut.x) < 12 && player.y > wall && player.y - wall < 14) { enterHouse(h); return; }
      }
    } else {
      const h = houseOfArea(a);
      if (h && player.y > (h.room.y0 + 7) * TILE + 8) exitHouse(h);
    }
  }
  // Where something indoors shows up on the minimap: its house's front door
  function outdoorPos(x, y) {
    const h = houseOfArea(areaOf(x, y));
    return h ? h.doorOut : { x, y };
  }
  // "go in" / "go out" hints by doors
  function drawDoorHint(ctx, t) {
    if (!L || !L.rooms || paused) return;
    const a = areaOf(player.x, player.y);
    let x, y, text;
    if (a === 0) {
      for (const h of L.rooms) {
        if (!h || Math.hypot(player.x - h.doorOut.x, player.y - h.doorOut.y) > 46) continue;
        x = h.doorOut.x; y = (h.y + h.h) * TILE - 50; text = isTouch ? 'push up: go in' : '↑ go in';
      }
    } else {
      const h = houseOfArea(a);
      if (h && Math.hypot(player.x - h.exitIn.x, player.y - h.exitIn.y) < 60) { x = h.exitIn.x; y = (h.room.y0 + 7) * TILE + 30; text = '↓ go out'; }
    }
    if (!text) return;
    ctx.font = '800 7px Nunito, sans-serif';
    const w = ctx.measureText(text).width + 10;
    const by = y + Math.sin(t * 4) * 1.2;
    ctx.fillStyle = 'rgba(28,36,24,0.85)'; roundRect(ctx, x - w / 2, by - 6, w, 11, 4, true);
    ctx.fillStyle = '#ffb547'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, by - 0.2);
  }

  // ---------------------------------------------------------------------------
  // Object factories. Each object: x,y = foot point (sort key), optional hitbox,
  // draw(ctx,t), optional shadow(ctx).
  // ---------------------------------------------------------------------------
  function box(x, y, w, h) { return { x, y, w, h }; }

  function makeHouse(tx, ty, tw, th, roof) {
    const X = tx * TILE, Y = ty * TILE, W = tw * TILE, H = th * TILE;
    const wallH = TILE * 1.7;
    const wallTop = Y + H - wallH;
    const roofTop = Y - TILE * 1.1;
    const doorX = (tx + Math.floor(tw / 2) + 0.5) * TILE;
    const roofDark = shade(roof, -0.28);
    const roofLight = shade(roof, 0.18);
    const wall = pick(['#e8dcc0', '#efe3cf', '#e2d2b0', '#dfe2d4']);
    const chimneyX = X + W * pick([0.2, 0.75]);
    return {
      kind: 'house', x: X + W / 2, y: Y + H,
      hitbox: box(X + 2, Y - 4, W - 4, H + 2),
      bounds: { l: X - 10, r: X + W + 10, t: roofTop - 30, b: Y + H + 10 },
      shadow(ctx) {
        ctx.fillStyle = 'rgba(20,40,10,0.22)';
        ctx.beginPath();
        ctx.moveTo(X + W, wallTop);
        ctx.lineTo(X + W + 22, wallTop + 14);
        ctx.lineTo(X + W + 22, Y + H + 12);
        ctx.lineTo(X + 14, Y + H + 12);
        ctx.lineTo(X, Y + H);
        ctx.closePath();
        ctx.fill();
      },
      draw(ctx) {
        // Front wall
        ctx.fillStyle = wall;
        ctx.fillRect(X, wallTop, W, wallH);
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let yy = wallTop + 8; yy < Y + H; yy += 8) ctx.fillRect(X, yy, W, 1);
        // Foundation
        ctx.fillStyle = '#8c8577';
        ctx.fillRect(X, Y + H - 6, W, 6);
        // Door
        ctx.fillStyle = '#6b4226';
        roundRect(ctx, doorX - 11, Y + H - 38, 22, 34, 10, true);
        ctx.fillStyle = '#56341d';
        ctx.fillRect(doorX - 1, Y + H - 34, 2, 28);
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath(); ctx.arc(doorX + 6, Y + H - 20, 1.8, 0, Math.PI * 2); ctx.fill();
        // Step
        ctx.fillStyle = '#a69f90';
        ctx.fillRect(doorX - 14, Y + H - 4, 28, 6);
        // Windows
        const winY = Y + H - 40;
        const slots = [];
        for (let wx = X + 20; wx < X + W - 20; wx += 44) {
          if (Math.abs(wx + 9 - doorX) > 26) slots.push(wx);
        }
        for (const wx of slots) {
          ctx.fillStyle = '#5a3a24';
          ctx.fillRect(wx - 2, winY - 2, 22, 22);
          ctx.fillStyle = '#9fd3e8';
          ctx.fillRect(wx, winY, 18, 18);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(wx + 2, winY + 2, 5, 7);
          ctx.fillStyle = '#5a3a24';
          ctx.fillRect(wx + 8, winY, 2, 18);
          ctx.fillRect(wx, winY + 8, 18, 2);
          // flower box
          ctx.fillStyle = '#7a4a2a';
          ctx.fillRect(wx - 3, winY + 19, 24, 5);
          for (let f = 0; f < 4; f++) {
            ctx.fillStyle = ['#ff6f91', '#ffd166', '#f78c6b', '#ffffff'][f];
            ctx.beginPath(); ctx.arc(wx + 1 + f * 5.5, winY + 18, 2.4, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Chimney (behind the ridge)
        ctx.fillStyle = '#8a5a44';
        ctx.fillRect(chimneyX - 7, roofTop - 14, 14, 26);
        ctx.fillStyle = '#6e4636';
        ctx.fillRect(chimneyX - 9, roofTop - 16, 18, 5);
        // Roof
        const eave = wallTop + 8;
        ctx.fillStyle = roof;
        ctx.fillRect(X - 8, roofTop, W + 16, eave - roofTop);
        // Shingle rows
        ctx.fillStyle = roofDark;
        for (let yy = roofTop + 10; yy < eave; yy += 10) {
          ctx.globalAlpha = 0.35;
          ctx.fillRect(X - 8, yy, W + 16, 2);
          const off = ((yy - roofTop) / 10) % 2 ? 0 : 9;
          for (let xx = X - 8 + off; xx < X + W + 8; xx += 18) ctx.fillRect(xx, yy - 10, 2, 10);
        }
        ctx.globalAlpha = 1;
        // Ridge highlight & eave edge
        ctx.fillStyle = roofLight;
        ctx.fillRect(X - 8, roofTop, W + 16, 5);
        ctx.fillStyle = roofDark;
        ctx.fillRect(X - 8, eave - 5, W + 16, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(X, eave, W, 5); // shadow under eave
      },
    };
  }

  function makeTree(x, y) {
    const r = rr(18, 27);
    const trunkH = rr(14, 20);
    const phase = rand() * Math.PI * 2;
    const hue = pick([['#2f6b2a', '#3f8a35', '#5aa848'], ['#2b5f33', '#3a7d40', '#55a05a'], ['#3b6b25', '#4e8c2f', '#6daa42']]);
    const blobs = [];
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr(-0.3, 0.3);
      blobs.push([Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.32, r * rr(0.55, 0.75)]);
    }
    const cy = -trunkH - r * 0.7;
    const obj = {
      kind: 'tree', x, y,
      hitbox: box(x - 7, y - 7, 14, 8),
      bounds: { l: x - r - 10, r: x + r + 10, t: y + cy - r - 5, b: y + 10 },
      canopy: { cx: x, cy: y + cy, r },
      shadow(ctx) {
        ctx.fillStyle = 'rgba(20,40,10,0.25)';
        ellipse(ctx, x + 8, y - 1, r * 1.0, r * 0.42);
      },
      draw(ctx, t, fade) {
        const sway = Math.sin(t * 1.3 + phase) * 1.2;
        // trunk
        ctx.fillStyle = '#6b4a2e';
        roundRect(ctx, x - 4.5, y - trunkH - 6, 9, trunkH + 6, 3, true);
        ctx.fillStyle = '#563a22';
        ctx.fillRect(x + 1, y - trunkH - 4, 3, trunkH + 3);
        ctx.save();
        if (fade) ctx.globalAlpha = 0.42;
        ctx.translate(x + sway, y + cy);
        ctx.fillStyle = hue[0];
        for (const [bx, by, br] of blobs) circle(ctx, bx, by + 3, br);
        circle(ctx, 0, 3, r * 0.75);
        ctx.fillStyle = hue[1];
        for (const [bx, by, br] of blobs) circle(ctx, bx - 1.5, by - 1.5, br * 0.86);
        circle(ctx, 0, -1, r * 0.7);
        ctx.fillStyle = hue[2];
        circle(ctx, -r * 0.25, -r * 0.3, r * 0.38);
        circle(ctx, r * 0.15, -r * 0.42, r * 0.22);
        ctx.restore();
      },
    };
    return obj;
  }

  function makeBush(x, y) {
    const r = rr(9, 13);
    const berries = rand() < 0.4;
    const dots = berries ? Array.from({ length: 5 }, () => [rr(-r * 0.8, r * 0.8), rr(-r * 1.3, -r * 0.4)]) : [];
    return {
      kind: 'bush', x, y,
      hitbox: box(x - r * 0.8, y - 7, r * 1.6, 8),
      bounds: { l: x - r * 1.5, r: x + r * 1.5, t: y - r * 2.2, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 4, y, r * 1.3, r * 0.45); },
      draw(ctx) {
        ctx.fillStyle = '#2f6b2a';
        circle(ctx, x - r * 0.6, y - r * 0.7, r * 0.8);
        circle(ctx, x + r * 0.6, y - r * 0.7, r * 0.8);
        circle(ctx, x, y - r, r);
        ctx.fillStyle = '#479a3c';
        circle(ctx, x - r * 0.3, y - r * 1.2, r * 0.55);
        ctx.fillStyle = '#d93f5b';
        for (const [dx, dy] of dots) circle(ctx, x + dx, y + dy, 1.8);
      },
    };
  }

  function makeRock(x, y) {
    const r = rr(7, 12);
    const pts = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      return [Math.cos(a) * r * rr(0.8, 1.15), Math.sin(a) * r * 0.65 * rr(0.8, 1.1)];
    });
    return {
      kind: 'rock', x, y,
      hitbox: box(x - r * 0.9, y - r * 0.6, r * 1.8, r * 0.7),
      bounds: { l: x - r * 1.5, r: x + r * 1.5, t: y - r * 1.5, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 3, y, r * 1.1, r * 0.4); },
      draw(ctx) {
        ctx.save(); ctx.translate(x, y - r * 0.55);
        ctx.fillStyle = '#7f8a8c';
        poly(ctx, pts); ctx.fill();
        ctx.fillStyle = '#a3adae';
        ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.2, r * 0.5, r * 0.28, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      },
    };
  }

  function makeReeds(x, y) {
    const blades = Array.from({ length: 5 }, () => [rr(-5, 5), rr(10, 18), rr(-0.3, 0.3)]);
    const phase = rand() * 6;
    return {
      kind: 'reeds', x, y, hitbox: null,
      bounds: { l: x - 12, r: x + 12, t: y - 24, b: y + 4 },
      draw(ctx, t) {
        const sway = Math.sin(t * 1.8 + phase) * 0.12;
        ctx.strokeStyle = '#5d8c3a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (const [bx, h, a] of blades) {
          ctx.beginPath(); ctx.moveTo(x + bx, y);
          ctx.quadraticCurveTo(x + bx, y - h * 0.6, x + bx + Math.sin(a + sway) * h, y - h);
          ctx.stroke();
        }
        ctx.fillStyle = '#7a5230';
        const [bx, h, a] = blades[0];
        ctx.beginPath(); ctx.ellipse(x + bx + Math.sin(a + sway) * h, y - h, 1.8, 4, a + sway, 0, Math.PI * 2); ctx.fill();
      },
    };
  }

  function makeFence(tx, ty, dir) {
    const X = tx * TILE, Y = ty * TILE;
    if (dir === 'h') {
      const y = Y + TILE * 0.7;
      return {
        kind: 'fence', x: X + TILE / 2, y,
        hitbox: box(X, y - 6, TILE, 7),
        bounds: { l: X - 4, r: X + TILE + 4, t: y - 24, b: y + 4 },
        draw(ctx) {
          ctx.fillStyle = '#c99b63';
          ctx.fillRect(X, y - 16, TILE, 3.5);
          ctx.fillRect(X, y - 8, TILE, 3.5);
          ctx.fillStyle = '#a87a45';
          roundRect(ctx, X + 1, y - 20, 5, 20, 2, true);
          roundRect(ctx, X + TILE - 6, y - 20, 5, 20, 2, true);
        },
      };
    }
    const x = X + TILE / 2;
    return {
      kind: 'fence', x, y: Y + TILE,
      hitbox: box(x - 4, Y, 8, TILE),
      bounds: { l: x - 8, r: x + 8, t: Y - 22, b: Y + TILE + 4 },
      draw(ctx) {
        ctx.fillStyle = '#c99b63';
        ctx.fillRect(x - 1.5, Y - 14, 3.5, TILE);
        ctx.fillStyle = '#a87a45';
        roundRect(ctx, x - 2.5, Y + TILE - 20, 5, 20, 2, true);
      },
    };
  }

  function makeScarecrow(x, y) {
    return {
      kind: 'scarecrow', x, y,
      hitbox: box(x - 4, y - 5, 8, 6),
      bounds: { l: x - 24, r: x + 24, t: y - 60, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 6, y, 14, 4); },
      draw(ctx, t) {
        const sway = Math.sin(t * 1.1) * 0.04;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sway);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-2, -48, 4, 48);
        ctx.fillRect(-20, -36, 40, 3);
        ctx.fillStyle = '#4f6fa8'; roundRect(ctx, -10, -40, 20, 22, 4, true);
        ctx.fillStyle = '#e6c56a';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 20, -36); ctx.lineTo(s * 25, -30); ctx.lineTo(s * 18, -31); ctx.fill(); }
        ctx.fillStyle = '#efe3cf'; circle(ctx, 0, -46, 7);
        ctx.fillStyle = '#2b2d33'; circle(ctx, -2.5, -47, 1.2); circle(ctx, 2.5, -47, 1.2);
        ctx.fillStyle = '#8a5a2e'; ctx.fillRect(-11, -53, 22, 3); roundRect(ctx, -6, -60, 12, 8, 2, true);
        ctx.restore();
      },
    };
  }

  function makeWell(x, y) {
    return {
      kind: 'well', x, y,
      hitbox: box(x - 18, y - 16, 36, 18),
      bounds: { l: x - 30, r: x + 30, t: y - 70, b: y + 10 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 6, y, 24, 7); },
      draw(ctx) {
        // stone ring
        ctx.fillStyle = '#7d7a72';
        roundRect(ctx, x - 20, y - 22, 40, 22, 6, true);
        ctx.fillStyle = '#9a968c';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
          roundRect(ctx, x - 19 + i * 10 + (j % 2) * 5, y - 21 + j * 10, 9, 9, 2, true);
        }
        ctx.fillStyle = '#2b3d4f';
        ctx.beginPath(); ctx.ellipse(x, y - 22, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4f86b0';
        ctx.beginPath(); ctx.ellipse(x, y - 21, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
        // posts & roof
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(x - 19, y - 52, 4, 32); ctx.fillRect(x + 15, y - 52, 4, 32);
        ctx.fillRect(x - 17, y - 46, 34, 3);
        ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 44); ctx.lineTo(x, y - 30); ctx.stroke();
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 4, y - 32, 8, 7);
        ctx.fillStyle = '#9c4a33';
        ctx.beginPath(); ctx.moveTo(x - 28, y - 50); ctx.lineTo(x, y - 66); ctx.lineTo(x + 28, y - 50); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7d3826';
        ctx.fillRect(x - 28, y - 52, 56, 4);
      },
    };
  }

  function makeBench(x, y) {
    return {
      kind: 'bench', x, y,
      hitbox: box(x - 20, y - 8, 40, 8),
      bounds: { l: x - 26, r: x + 26, t: y - 30, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ctx.fillRect(x - 18, y - 2, 42, 5); },
      draw(ctx) {
        ctx.fillStyle = '#5a5248';
        ctx.fillRect(x - 18, y - 10, 3, 10); ctx.fillRect(x + 15, y - 10, 3, 10);
        ctx.fillStyle = '#a8743f';
        ctx.fillRect(x - 21, y - 13, 42, 5);
        ctx.fillStyle = '#c08a52';
        ctx.fillRect(x - 21, y - 24, 42, 4); ctx.fillRect(x - 21, y - 18, 42, 3);
        ctx.fillStyle = '#5a5248';
        ctx.fillRect(x - 18, y - 25, 3, 13); ctx.fillRect(x + 15, y - 25, 3, 13);
      },
    };
  }

  function makeLamp(x, y) {
    return {
      kind: 'lamp', x, y,
      hitbox: box(x - 4, y - 5, 8, 6),
      bounds: { l: x - 20, r: x + 20, t: y - 66, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 8, y, 12, 3); },
      draw(ctx, t) {
        ctx.fillStyle = '#2f3437';
        ctx.fillRect(x - 6, y - 6, 12, 6);
        ctx.fillRect(x - 2, y - 50, 4, 46);
        ctx.fillRect(x - 7, y - 60, 14, 3);
        const g = 0.55 + Math.sin(t * 2 + x) * 0.05;
        ctx.fillStyle = `rgba(255, 210, 120, ${g * 0.25})`;
        circle(ctx, x, y - 52, 13);
        ctx.fillStyle = '#ffd98a';
        ctx.fillRect(x - 5, y - 57, 10, 9);
        ctx.fillStyle = '#2f3437';
        ctx.fillRect(x - 6, y - 49, 12, 2);
        ctx.beginPath(); ctx.moveTo(x - 8, y - 58); ctx.lineTo(x, y - 65); ctx.lineTo(x + 8, y - 58); ctx.fill();
      },
    };
  }

  function makeSign(x, y, rightLabel = 'POND', leftLabel = 'GARDEN') {
    return {
      kind: 'sign', x, y,
      hitbox: box(x - 3, y - 5, 6, 6),
      bounds: { l: x - 34, r: x + 34, t: y - 50, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 6, y, 10, 3); },
      draw(ctx) {
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 2, y - 40, 4, 40);
        ctx.fillStyle = '#c99b63';
        ctx.beginPath(); ctx.moveTo(x - 4, y - 42); ctx.lineTo(x + 26, y - 42); ctx.lineTo(x + 32, y - 36); ctx.lineTo(x + 26, y - 30); ctx.lineTo(x - 4, y - 30); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 4, y - 27); ctx.lineTo(x - 26, y - 27); ctx.lineTo(x - 32, y - 21); ctx.lineTo(x - 26, y - 15); ctx.lineTo(x + 4, y - 15); ctx.fill();
        ctx.fillStyle = '#4a3220';
        ctx.font = 'bold 6px Nunito, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(rightLabel, x + 13, y - 36);
        ctx.fillText(leftLabel, x - 13, y - 21);
      },
    };
  }

  function makeMailbox(x, y) {
    const color = pick(['#c0392b', '#2e6da4', '#3f7f6a']);
    return {
      kind: 'mailbox', x, y,
      hitbox: box(x - 3, y - 4, 6, 5),
      bounds: { l: x - 12, r: x + 12, t: y - 30, b: y + 4 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 5, y, 8, 2.5); },
      draw(ctx) {
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 1.5, y - 16, 3, 16);
        ctx.fillStyle = color; roundRect(ctx, x - 7, y - 24, 14, 9, 4, true);
        ctx.fillStyle = '#f2c14e'; ctx.fillRect(x + 5, y - 28, 2, 7);
      },
    };
  }

  function makeHideoutLog(x, y) {
    return {
      kind: 'hideout', x, y,
      hitbox: box(x - 34, y - 11, 66, 12),
      bounds: { l: x - 60, r: x + 50, t: y - 50, b: y + 8 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 2, y - 1, 40, 7); },
      draw(ctx) {
        // log body
        ctx.fillStyle = '#6e4a2c'; roundRect(ctx, x - 36, y - 30, 66, 29, 13, true);
        ctx.strokeStyle = '#563820'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        for (const [yy, x0, x1] of [[-23, -28, 6], [-16, -32, 18], [-9, -26, 10]]) {
          ctx.beginPath(); ctx.moveTo(x + x0, y + yy); ctx.quadraticCurveTo(x + (x0 + x1) / 2, y + yy - 2, x + x1, y + yy); ctx.stroke();
        }
        // moss
        ctx.fillStyle = '#6a9a3a';
        ellipse(ctx, x - 18, y - 29, 12, 4); ellipse(ctx, x + 2, y - 30, 8, 3);
        // cut end with the hollow (the entrance)
        ctx.fillStyle = '#c9a06a'; ellipse(ctx, x + 30, y - 15.5, 9, 14.5);
        ctx.strokeStyle = '#a8804e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x + 30, y - 15.5, 6.5, 11.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#24170e'; ellipse(ctx, x + 30.5, y - 14.5, 5, 9);
        // two eyes glinting inside (someone's home)
        ctx.fillStyle = 'rgba(255,220,120,0.8)'; circle(ctx, x + 29, y - 17, 0.9); circle(ctx, x + 32, y - 17, 0.9);
        // mushrooms
        for (const [mx, s] of [[-30, 1], [-24, 0.75]]) {
          ctx.fillStyle = '#efe3cf'; ctx.fillRect(x + mx - 1, y - 6 * s, 2, 6 * s);
          ctx.fillStyle = '#d23b3b'; ctx.beginPath(); ctx.arc(x + mx, y - 6 * s, 4 * s, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#fff'; circle(ctx, x + mx - 1.4 * s, y - 8 * s, 0.8 * s);
        }
        // hand-painted sign
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 49, y - 26, 3, 26);
        ctx.fillStyle = '#c99b63'; ctx.save(); ctx.translate(x - 47.5, y - 27); ctx.rotate(-0.12);
        roundRect(ctx, -12, -6, 24, 11, 2, true);
        ctx.fillStyle = '#4a3220'; ctx.font = '800 7px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('MINE', 0, 0); ctx.restore();
      },
    };
  }

  function makePicnicTable(x, y) {
    return {
      kind: 'picnic', x, y,
      hitbox: box(x - 28, y - 22, 56, 22),
      bounds: { l: x - 40, r: x + 40, t: y - 40, b: y + 8 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ctx.fillRect(x - 26, y - 6, 62, 10); },
      draw(ctx) {
        ctx.fillStyle = '#8a5d32';
        ctx.fillRect(x - 30, y - 30, 60, 5);  // back bench
        ctx.fillRect(x - 24, y - 12, 4, 12); ctx.fillRect(x + 20, y - 12, 4, 12);
        ctx.fillStyle = '#b07d48';
        ctx.fillRect(x - 28, y - 26, 56, 16); // table top
        ctx.fillStyle = '#e8e3d6'; ctx.fillRect(x - 18, y - 26, 30, 16); // cloth
        ctx.fillStyle = '#d24a4a';
        for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) ctx.fillRect(x - 18 + i * 6, y - 26 + j * 5.33, 6, 5.33);
        ctx.fillStyle = '#c99b63';
        ctx.fillRect(x - 30, y - 6, 60, 5);   // front bench
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fill(); }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); }
  function roundRect(ctx, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // ---------------------------------------------------------------------------
  // Ground layer: rendered once to an offscreen canvas
  // ---------------------------------------------------------------------------
  let ground, mini;
  function renderGround(seed = 99) {
    ground = document.createElement('canvas');
    ground.width = WORLD_W; ground.height = MH_ALL * TILE;
    const g = ground.getContext('2d');
    const grng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    const gr = (a, b) => a + grng() * (b - a);

    // Grass base with soft patches
    g.fillStyle = '#6fae4b';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = grng() < 0.5 ? 'rgba(90,150,60,0.35)' : 'rgba(140,195,90,0.25)';
      ellipse(g, gr(0, WORLD_W), gr(0, WORLD_H), gr(30, 90), gr(20, 60));
    }
    // Grass blades
    g.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = gr(0, WORLD_W), y = gr(0, WORLD_H);
      g.strokeStyle = grng() < 0.6 ? 'rgba(60,120,45,0.55)' : 'rgba(160,210,110,0.5)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + gr(-2, 2), y - gr(3, 6)); g.stroke();
    }

    const forTiles = (type, fn) => {
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (map[idx(x, y)] === type) fn(x, y);
    };
    const blobs = (type, color, r) => {
      g.fillStyle = color;
      forTiles(type, (x, y) => circle(g, (x + 0.5) * TILE, (y + 0.5) * TILE, r));
    };

    // Sand
    blobs(SAND, '#c9b57e', 25);
    blobs(SAND, '#e3cf96', 23);
    // Water (bridge tiles sit over water too)
    const waterLike = (x, y) => map[idx(x, y)] === WATER || map[idx(x, y)] === BRIDGE;
    g.fillStyle = '#356f9a';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (waterLike(x, y)) circle(g, (x + 0.5) * TILE, (y + 0.5) * TILE, 25);
    g.fillStyle = '#4c93c7';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (waterLike(x, y)) circle(g, (x + 0.5) * TILE, (y + 0.5) * TILE, 23);
    // deeper water in the pond middle
    const P = L.pond;
    g.fillStyle = 'rgba(30,80,130,0.35)';
    ellipse(g, P.cx * TILE, P.cy * TILE, (P.rx - 3) * TILE, (P.ry - 2.5) * TILE);
    // lily pads
    for (let i = 0; i < 14; i++) {
      const a = gr(0, Math.PI * 2), d = gr(0.2, 0.75);
      const lx = P.cx * TILE + Math.cos(a) * P.rx * TILE * d, ly = P.cy * TILE + Math.sin(a) * P.ry * TILE * d;
      g.fillStyle = '#4f9a3c';
      g.beginPath(); g.moveTo(lx, ly); g.arc(lx, ly, gr(6, 10), a + 0.4, a + Math.PI * 2 - 0.1); g.closePath(); g.fill();
      if (grng() < 0.35) { g.fillStyle = '#ffc6dd'; circle(g, lx + 2, ly - 2, 3); }
    }

    // Garden soil with furrows
    const G = L.garden;
    g.fillStyle = '#7a5434';
    g.fillRect(G.x * TILE, G.y * TILE, G.w * TILE, G.h * TILE);
    g.fillStyle = '#6a462a';
    for (let y = G.y * TILE + 10; y < (G.y + G.h) * TILE; y += 16) g.fillRect(G.x * TILE + 4, y, G.w * TILE - 8, 5);

    // Paths
    blobs(PATH, '#b08b55', 25);
    blobs(PATH, '#cfac72', 23);
    forTiles(PATH, (x, y) => {
      for (let k = 0; k < 4; k++) {
        g.fillStyle = grng() < 0.5 ? 'rgba(120,90,50,0.4)' : 'rgba(240,220,170,0.5)';
        circle(g, (x + grng()) * TILE, (y + grng()) * TILE, gr(1, 2.2));
      }
    });

    // Plaza cobbles
    const PX = L.plaza.x * TILE, PY = L.plaza.y * TILE;
    g.fillStyle = '#9b9688';
    roundRect(g, PX - 4, PY - 4, 12 * TILE + 8, 12 * TILE + 8, 14, true);
    g.fillStyle = '#b7b2a3';
    roundRect(g, PX, PY, 12 * TILE, 12 * TILE, 10, true);
    for (let y = PY; y < PY + 12 * TILE; y += 12) {
      const row = (y - PY) / 12;
      for (let x = PX + (row % 2) * 8; x < PX + 12 * TILE - 4; x += 16) {
        g.fillStyle = grng() < 0.5 ? '#c4bfb0' : '#aaa596';
        roundRect(g, x + 1, y + 1, 14, 10, 3, true);
      }
    }
    // Plaza mosaic circle
    g.strokeStyle = '#8f8a7c'; g.lineWidth = 4;
    g.beginPath(); g.arc(PX + 6 * TILE, PY + 6 * TILE, 3.3 * TILE, 0, Math.PI * 2); g.stroke();

    // Bridge
    forTiles(BRIDGE, (x, y) => {
      const X = x * TILE, Y = y * TILE;
      g.fillStyle = '#9c6b3e';
      g.fillRect(X - 2, Y, TILE + 4, TILE);
      g.fillStyle = '#b8834f';
      for (let px = X; px < X + TILE; px += 8) g.fillRect(px + 1, Y, 6, TILE);
    });
    // Bridge rails wherever a bridge tile meets water
    g.fillStyle = '#6b4a2e';
    forTiles(BRIDGE, (x, y) => {
      if (getT(x, y - 1) !== BRIDGE) { g.fillRect(x * TILE - 2, y * TILE - 3, TILE + 4, 4); g.fillRect(x * TILE, y * TILE - 9, 4, 8); }
      if (getT(x, y + 1) !== BRIDGE) { g.fillRect(x * TILE - 2, (y + 1) * TILE - 1, TILE + 4, 4); g.fillRect(x * TILE, (y + 1) * TILE - 7, 4, 8); }
    });

    // Flowers & clover on open grass
    const petals = ['#ffffff', '#ffd166', '#ff8fab', '#b39cff', '#ff7a59'];
    for (let i = 0; i < 700; i++) {
      const x = gr(0, WORLD_W), y = gr(0, WORLD_H);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (map[idx(tx, ty)] !== GRASS) continue;
      const c = petals[Math.floor(grng() * petals.length)];
      g.fillStyle = c;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        circle(g, x + Math.cos(a) * 2, y + Math.sin(a) * 2, 1.6);
      }
      g.fillStyle = '#f2b134';
      circle(g, x, y, 1.1);
    }

    // Hideout nest: trampled straw and leaves in front of the log
    g.fillStyle = 'rgba(120,90,45,0.45)';
    const HX = HIDEOUT.x, HY = HIDEOUT.y;
    ellipse(g, HX, HY, 48, 26);
    g.lineCap = 'round'; g.lineWidth = 1.3;
    for (let k = 0; k < 70; k++) {
      const a = grng() * Math.PI * 2, d = Math.sqrt(grng());
      const sx = HX + Math.cos(a) * 44 * d, sy = HY + Math.sin(a) * 23 * d;
      g.strokeStyle = grng() < 0.5 ? 'rgba(230,200,120,0.8)' : 'rgba(180,140,70,0.8)';
      const ang = grng() * Math.PI;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * 5, sy + Math.sin(ang) * 2); g.stroke();
    }
    for (let k = 0; k < 12; k++) {
      g.fillStyle = ['#c0643a', '#d9a43a', '#8a5a2e'][k % 3];
      ellipse(g, HX + gr(-40, 40), HY + gr(-19, 19), 2.6, 1.4);
    }

    // House interiors live in the strip below the village
    g.fillStyle = '#120d0a'; g.fillRect(0, WORLD_H, WORLD_W, IH * TILE);
    for (const h of L.houses) if (h.room) drawRoomShell(g, h);

    // Minimap
    mini = document.createElement('canvas');
    mini.width = MW * 3; mini.height = MH * 3;
    const m = mini.getContext('2d');
    m.imageSmoothingEnabled = true;
    m.drawImage(ground, 0, 0, WORLD_W, WORLD_H, 0, 0, mini.width, mini.height);
    for (const o of objects) {
      if (o.y > WORLD_H) continue;
      if (o.kind === 'house') {
        m.fillStyle = '#7a3e2c';
        const hb = o.hitbox;
        m.fillRect(hb.x / TILE * 3, hb.y / TILE * 3, hb.w / TILE * 3, hb.h / TILE * 3);
      } else if (o.kind === 'tree') {
        m.fillStyle = '#2f6b2a';
        m.fillRect(o.x / TILE * 3 - 1.5, o.y / TILE * 3 - 2.5, 3, 3);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------
  const player = {
    x: 32 * TILE, y: 29 * TILE,
    vx: 0, vy: 0,
    dir: 'down',
    walk: 0,          // walk cycle phase
    hop: 0, hopV: 0,  // little jump when chittering
    bubble: null,     // { text, t }
    dustT: 0,
    held: null,       // item being carried
    stun: 0,          // seconds of lost control after being shoved
    speed: 0,
  };
  const PLAYER_HB = { w: 16, h: 9 };

  function solidAt(px, py) {
    const t = getT(Math.floor(px / TILE), Math.floor(py / TILE));
    return t === WATER || t === WALL;
  }
  function collides(x, y) {
    const l = x - PLAYER_HB.w / 2, r = x + PLAYER_HB.w / 2, t = y - PLAYER_HB.h, b = y;
    if (l < 0 || t < 0 || r > WORLD_W || b > MH_ALL * TILE) return true;
    if (solidAt(l, t) || solidAt(r, t) || solidAt(l, b) || solidAt(r, b) || solidAt(x, t) || solidAt(x, b)) return true;
    for (const o of solidObjects) {
      const h = o.hitbox;
      if (r > h.x && l < h.x + h.w && b > h.y && t < h.y + h.h) return true;
    }
    for (const it of items) {
      if (!it.type.heavy || it.held || it.ghost || it.floating) continue;
      const h = itemBox(it);
      if (r > h.x && l < h.x + h.w && b > h.y && t < h.y + h.h) return true;
    }
    return false;
  }
  let solidObjects = [];

  function updatePlayer(dt, input) {
    let ix = input.x, iy = input.y;
    if (player.stun > 0) { player.stun -= dt; ix = 0; iy = 0; }
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const heavy = player.held && player.held.type.heavy;
    const running = input.run && !heavy;
    const maxSpd = heavy ? WALK_SPEED * heavyMult() : running ? runSpeed() : WALK_SPEED;
    const tx = ix * maxSpd, ty = iy * maxSpd;

    const approach = (v, target, rate) => {
      if (v < target) return Math.min(target, v + rate * dt);
      return Math.max(target, v - rate * dt);
    };
    const rateX = Math.abs(tx) > 0.01 ? ACCEL : FRICTION;
    const rateY = Math.abs(ty) > 0.01 ? ACCEL : FRICTION;
    player.vx = approach(player.vx, tx, rateX);
    player.vy = approach(player.vy, ty, rateY);

    // Move per axis so we slide along walls
    const nx = player.x + player.vx * dt;
    if (!collides(nx, player.y)) player.x = nx; else player.vx = 0;
    const ny = player.y + player.vy * dt;
    if (!collides(player.x, ny)) player.y = ny; else player.vy = 0;

    const speed = Math.hypot(player.vx, player.vy);
    player.speed = speed;
    if (mag > 0.15) {
      if (Math.abs(ix) > Math.abs(iy) * 1.1) player.dir = ix > 0 ? 'right' : 'left';
      else if (Math.abs(iy) > 0.01) player.dir = iy > 0 ? 'down' : 'up';
    }
    if (speed > 4) player.walk += dt * speed * 0.11;

    updateDoors(dt, iy);

    // Dust when running
    player.dustT -= dt;
    if (speed > WALK_SPEED * 1.15 && player.dustT <= 0 && player.hop === 0) {
      player.dustT = 0.07;
      particles.push({ x: player.x - player.vx * 0.05 + rr(-4, 4), y: player.y + rr(-2, 1), r: rr(2, 4), life: 0.5, max: 0.5, vy: -10 });
    }

    // Hop physics
    if (player.hop > 0 || player.hopV !== 0) {
      player.hopV -= 600 * dt;
      player.hop += player.hopV * dt;
      if (player.hop <= 0) { player.hop = 0; player.hopV = 0; }
    }
    if (player.bubble) {
      player.bubble.t -= dt;
      if (player.bubble.t <= 0) player.bubble = null;
    }
  }

  const CHITTERS = ['chirr!', 'hehe', '!!', 'mine.', '♪', 'skrrt', '?!'];
  function chitter() {
    if (player.hop > 0) return;
    player.hopV = 140;
    player.hop = 0.01;
    player.bubble = { text: CHITTERS[Math.floor(Math.random() * CHITTERS.length)], t: 1.3 };
    sfx('chitter');
    // You can't chitter with your mouth full: light things fall out
    if (player.held && !player.held.type.heavy) dropHeld(true);
    if (cat && cat.state !== 'flee' && Math.hypot(cat.x - player.x, cat.y - player.y) < chitterRadius()) catFlee(player.x, player.y);
    for (const v of villagers) {
      if (Math.hypot(v.x - player.x, v.y - player.y) < chitterRadius() && startleV(v, rpick(['Eek!', 'Gah!', 'Yikes!']))) completeTask('jump');
    }
    for (const b of butterflies) {
      if (Math.hypot(b.x - player.x, b.y - player.y) < 140) b.flee = 1.5;
    }
  }

  // Raccoon rendering --------------------------------------------------------
  const FUR = '#8b909a', FUR_DARK = '#5a5e68', FUR_LIGHT = '#c9ccd3', MASK = '#2b2d33', WHITE = '#f4f2ee', NOSE = '#1d1d22', RING = '#3c3f47';

  function drawRaccoon(ctx, p, t) {
    const moving = p.speed > 6;
    const bob = moving ? Math.abs(Math.sin(p.walk)) * 1.8 : Math.sin(t * 2.2) * 0.5;
    ctx.save();
    ctx.translate(p.x, p.y);
    // shadow
    const s = 1 - Math.min(p.hop, 30) / 60;
    ctx.fillStyle = 'rgba(20,30,10,0.28)';
    ellipse(ctx, 0, 0, 12 * s, 4.2 * s);
    ctx.translate(0, -p.hop);
    if (p.dir === 'left' || p.dir === 'right') {
      if (p.dir === 'left') ctx.scale(-1, 1);
      drawRaccoonSide(ctx, p, t, moving, bob);
    } else if (p.dir === 'down') {
      drawRaccoonFront(ctx, p, t, moving, bob);
    } else {
      drawRaccoonBack(ctx, p, t, moving, bob);
    }
    ctx.restore();
  }

  function tail(ctx, segs) {
    // segs: [x, y, r] from tip to base; alternating ring colors
    for (let i = 0; i < segs.length; i++) {
      const [x, y, r] = segs[i];
      ctx.fillStyle = i === 0 ? RING : (i % 2 ? FUR_LIGHT : RING);
      circle(ctx, x, y, r);
    }
  }

  function leg(ctx, x, y, h, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x - 2.2, y - h, 4.4, h, 2, true);
  }

  function drawRaccoonSide(ctx, p, t, moving, bob) {
    const sw = moving ? Math.sin(p.walk) * 3.2 : 0;
    const by = -11 - bob;
    // far legs
    leg(ctx, -6 - sw, 0, 7, FUR_DARK);
    leg(ctx, 6 + sw, 0, 7, FUR_DARK);
    // tail
    const wag = Math.sin(t * (moving ? 9 : 3)) * (moving ? 1.6 : 1);
    const segs = [];
    for (let i = 5; i >= 0; i--) segs.push([-10 - i * 3.1, by - 1 - i * 2.4 + Math.sin(i * 0.6) * wag, 4.6 - i * 0.15]);
    tail(ctx, segs);
    // body
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, by, 11.5, 7.2);
    ctx.fillStyle = FUR_LIGHT;
    ellipse(ctx, 2, by + 3.5, 7, 3);
    // near legs
    leg(ctx, -6 + sw, 0, 7, FUR);
    leg(ctx, 6 - sw, 0, 7, FUR);
    ctx.fillStyle = MASK;
    ellipse(ctx, -6 + sw, -0.5, 2.6, 1.3);
    ellipse(ctx, 6 - sw, -0.5, 2.6, 1.3);
    // head
    const hx = 10.5, hy = by - 5.5;
    ctx.fillStyle = FUR_DARK;
    poly(ctx, [[hx - 5, hy - 3], [hx - 3.5, hy - 10.5], [hx + 0.5, hy - 5]]); ctx.fill();
    ctx.fillStyle = FUR;
    circle(ctx, hx, hy, 6.6);
    ctx.fillStyle = WHITE;
    poly(ctx, [[hx - 4.2, hy - 4], [hx - 3.3, hy - 8.5], [hx - 1, hy - 5]]); ctx.fill();
    // snout
    ctx.fillStyle = FUR_LIGHT;
    ellipse(ctx, hx + 5.5, hy + 2, 4.2, 3);
    ctx.fillStyle = WHITE;
    ellipse(ctx, hx + 1.5, hy - 3.6, 4.5, 1.3); // brow
    ctx.fillStyle = MASK;
    ellipse(ctx, hx + 2, hy - 0.8, 4.6, 2.5);
    ctx.fillStyle = WHITE;
    circle(ctx, hx + 3.2, hy - 1.1, 1.5);
    ctx.fillStyle = NOSE;
    circle(ctx, hx + 3.5, hy - 1.1, 0.8);
    circle(ctx, hx + 9.4, hy + 1.4, 1.7);
  }

  function drawRaccoonFront(ctx, p, t, moving, bob) {
    const lift = moving ? Math.sin(p.walk) * 2.2 : 0;
    const by = -11 - bob;
    // tail peeking up behind
    const wag = Math.sin(t * (moving ? 9 : 3)) * (moving ? 2 : 1.2);
    const segs = [];
    for (let i = 5; i >= 0; i--) segs.push([5 + i * 2.2 + wag * i * 0.25, by - 2 - i * 2.6, 4.4 - i * 0.12]);
    tail(ctx, segs);
    // back legs (peeking out at sides)
    leg(ctx, -7, 0, 5, FUR_DARK);
    leg(ctx, 7, 0, 5, FUR_DARK);
    // body
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, by, 9.5, 8);
    ctx.fillStyle = FUR_LIGHT;
    ellipse(ctx, 0, by + 2, 5.5, 5);
    // front legs
    leg(ctx, -4, -Math.max(0, lift), 6, FUR);
    leg(ctx, 4, -Math.max(0, -lift), 6, FUR);
    ctx.fillStyle = MASK;
    ellipse(ctx, -4, -0.6 - Math.max(0, lift), 2.4, 1.2);
    ellipse(ctx, 4, -0.6 - Math.max(0, -lift), 2.4, 1.2);
    // head
    const hy = by - 8;
    for (const s of [-1, 1]) {
      ctx.fillStyle = FUR_DARK;
      poly(ctx, [[s * 2.5, hy - 5], [s * 6.5, hy - 11], [s * 7.5, hy - 3]]); ctx.fill();
      ctx.fillStyle = WHITE;
      poly(ctx, [[s * 4, hy - 5], [s * 6.3, hy - 9], [s * 6.8, hy - 4.5]]); ctx.fill();
    }
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, hy, 8, 7);
    ctx.fillStyle = WHITE;
    ellipse(ctx, 0, hy - 3.8, 5.5, 1.4);   // brow
    ellipse(ctx, 0, hy + 3, 5, 3.4);       // muzzle
    ctx.fillStyle = MASK;
    ellipse(ctx, -3.6, hy - 0.8, 3.6, 2.3);
    ellipse(ctx, 3.6, hy - 0.8, 3.6, 2.3);
    ctx.fillRect(-1, hy - 2.5, 2, 5);
    ctx.fillStyle = WHITE;
    circle(ctx, -3.3, hy - 1, 1.5); circle(ctx, 3.3, hy - 1, 1.5);
    ctx.fillStyle = NOSE;
    circle(ctx, -3.1, hy - 0.8, 0.8); circle(ctx, 3.5, hy - 0.8, 0.8);
    circle(ctx, 0, hy + 2.2, 1.7);
  }

  function drawRaccoonBack(ctx, p, t, moving, bob) {
    const lift = moving ? Math.sin(p.walk) * 2.2 : 0;
    const by = -11 - bob;
    leg(ctx, -4, -Math.max(0, lift), 6, FUR_DARK);
    leg(ctx, 4, -Math.max(0, -lift), 6, FUR_DARK);
    // head (behind body from this angle)
    const hy = by - 8;
    for (const s of [-1, 1]) {
      ctx.fillStyle = FUR_DARK;
      poly(ctx, [[s * 2.5, hy - 5], [s * 6.5, hy - 11], [s * 7.5, hy - 3]]); ctx.fill();
    }
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, hy, 8, 7);
    ctx.fillStyle = FUR_DARK;
    ellipse(ctx, 0, hy - 1, 2.5, 5);
    // body
    ctx.fillStyle = FUR;
    ellipse(ctx, 0, by, 9.5, 8);
    ctx.fillStyle = FUR_DARK;
    ellipse(ctx, 0, by - 2, 3, 5.5);
    // back legs
    leg(ctx, -7, -Math.max(0, -lift), 5, FUR);
    leg(ctx, 7, -Math.max(0, lift), 5, FUR);
    // tail toward the viewer, curling up
    const wag = Math.sin(t * (moving ? 9 : 3)) * (moving ? 2.2 : 1.2);
    const segs = [];
    for (let i = 5; i >= 0; i--) segs.push([wag * (i * 0.35), by + 6 - i * 3.2, 4.8 - i * 0.12]);
    tail(ctx, segs);
  }

  function drawBubble(ctx, p) {
    if (p.bubble) drawBubbleAt(ctx, p.x, p.y - p.hop - 42, p.bubble);
  }
  function drawBubbleAt(ctx, x, y, b) {
    const a = Math.min(1, b.t / 0.25);
    ctx.save();
    ctx.globalAlpha = a;
    if (b.alert) { // big red "!"
      const pop = 1 + Math.max(0, b.t - 0.85) * 2;
      ctx.translate(x, y); ctx.scale(pop, pop);
      ctx.fillStyle = '#e8453c'; circle(ctx, 0, 0, 8);
      ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(3, 6); ctx.lineTo(0, 11); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 12px Nunito, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 0.5);
      ctx.restore();
      return;
    }
    ctx.font = '700 10px Nunito, sans-serif';
    const w = Math.max(22, ctx.measureText(b.text).width + 12);
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, x - w / 2, y - 9, w, 18, 8, true);
    ctx.beginPath(); ctx.moveTo(x - 4, y + 8); ctx.lineTo(x + 4, y + 8); ctx.lineTo(x, y + 14); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, x, y + 0.5);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Ambient life
  // ---------------------------------------------------------------------------
  const particles = [];
  const butterflies = [];
  const clouds = [];
  function spawnAmbient() {
    const colors = ['#ffd166', '#ff8fab', '#ffffff', '#9ad1ff'];
    for (let i = 0; i < 14; i++) {
      const x = rr(4, MW - 4) * TILE, y = rr(4, MH - 4) * TILE;
      butterflies.push({ x, y, hx: x, hy: y, tx: x, ty: y, z: rr(14, 26), c: colors[i % colors.length], ph: rand() * 6, flee: 0 });
    }
    for (let i = 0; i < 6; i++) {
      clouds.push({ x: rr(0, WORLD_W), y: rr(0, WORLD_H), rx: rr(140, 260), ry: rr(70, 120), v: rr(8, 16) });
    }
  }
  function updateAmbient(dt) {
    for (const b of butterflies) {
      b.ph += dt * 18;
      const dp = Math.hypot(b.x - player.x, b.y - player.y);
      if (dp < 48 && player.speed > 20) b.flee = Math.max(b.flee, 1);
      if (b.flee > 0) {
        b.flee -= dt;
        const a = Math.atan2(b.y - player.y, b.x - player.x);
        b.x += Math.cos(a) * 120 * dt; b.y += Math.sin(a) * 120 * dt;
        b.z = Math.min(60, b.z + 40 * dt);
        b.tx = b.x; b.ty = b.y;
        b.hx = clamp(b.x, 3 * TILE, WORLD_W - 3 * TILE); b.hy = clamp(b.y, 3 * TILE, WORLD_H - 3 * TILE);
      } else {
        if (Math.hypot(b.tx - b.x, b.ty - b.y) < 6) {
          b.tx = b.hx + rr(-80, 80); b.ty = b.hy + rr(-80, 80);
        }
        const a = Math.atan2(b.ty - b.y, b.tx - b.x);
        b.x += Math.cos(a) * 30 * dt + Math.sin(b.ph * 0.3) * 10 * dt;
        b.y += Math.sin(a) * 30 * dt;
        b.z = lerp(b.z, 18 + Math.sin(b.ph * 0.1) * 6, dt * 2);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life -= dt;
      if (q.kind === 'ring') q.r += dt * 26;
      else if (q.kind === 'heart') { q.z += 26 * dt; q.x += Math.sin(q.life * 9) * 0.4; }
      else if (q.kind === 'drop' || q.kind === 'spark' || q.kind === 'shard') {
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vz -= 500 * dt; q.z += q.vz * dt;
        if (q.z < 0) q.life = 0;
      } else { q.y += q.vy * dt; q.r += dt * 6; }
      if (q.life <= 0) particles.splice(i, 1);
    }
    for (const c of clouds) {
      c.x += c.v * dt; c.y += c.v * 0.3 * dt;
      if (c.x - c.rx > WORLD_W) c.x = -c.rx;
      if (c.y - c.ry > WORLD_H) c.y = -c.ry;
    }
  }
  function drawButterfly(ctx, b) {
    const flap = Math.abs(Math.sin(b.ph)) * 4 + 1;
    ctx.fillStyle = 'rgba(20,40,10,0.15)';
    ellipse(ctx, b.x, b.y, 3, 1.2);
    const y = b.y - b.z;
    ctx.fillStyle = b.c;
    ctx.beginPath(); ctx.ellipse(b.x - flap * 0.6, y, flap * 0.7, 3, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(b.x + flap * 0.6, y, flap * 0.7, 3, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(b.x - 0.5, y - 2, 1, 4);
  }

  // ---------------------------------------------------------------------------
  // Items: things the raccoon can grab, carry, drop and throw
  // Each type draws itself with its foot point at (0, 0).
  //   h: drawn height, r: footprint radius, heavy: carried overhead + blocks
  //   movement, floats: bobs on water instead of sinking
  // ---------------------------------------------------------------------------
  const ITEM = {
    pie: { name: 'pie', h: 8, r: 8, draw(c) {
      c.fillStyle = '#b8792f'; ellipse(c, 0, -3, 8.5, 4);
      c.fillStyle = '#e2a85a'; ellipse(c, 0, -5, 7.5, 3.2);
      c.fillStyle = '#9c2f3a'; ellipse(c, 0, -5, 4, 1.7);
      c.strokeStyle = '#c98a3e'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-4, -6.5); c.lineTo(3, -3.5); c.moveTo(4, -6.5); c.lineTo(-3, -3.5); c.stroke();
    } },
    carrot: { name: 'carrot', h: 16, r: 5, draw(c, it) {
      c.strokeStyle = '#3f8a35'; c.lineWidth = 2; c.lineCap = 'round';
      if (it.planted) {
        c.fillStyle = '#e07b2a';
        c.beginPath(); c.moveTo(-3, -3); c.lineTo(3, -3); c.lineTo(0, 2); c.fill();
        for (const a of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(0, -3); c.lineTo(Math.sin(a) * 8, -3 - Math.cos(a) * 9); c.stroke(); }
        return;
      }
      c.fillStyle = '#e07b2a';
      c.beginPath(); c.moveTo(-3.2, -11); c.lineTo(3.2, -11); c.lineTo(0.4, 0); c.closePath(); c.fill();
      c.fillStyle = '#c4621c'; c.fillRect(-2, -8, 3, 0.9); c.fillRect(-1, -5, 2.5, 0.9);
      for (const a of [-0.45, 0, 0.45]) { c.beginPath(); c.moveTo(0, -11); c.lineTo(Math.sin(a) * 5, -11 - Math.cos(a) * 6); c.stroke(); }
    } },
    cabbage: { name: 'cabbage', h: 13, r: 7, floats: true, draw(c, it) {
      const y = it.planted ? -5 : -6.5;
      c.fillStyle = '#4f9a3c'; circle(c, 0, y, 7);
      c.fillStyle = '#8fd16a'; circle(c, 0, y - 1, 4.5);
      c.fillStyle = '#b8e68f'; circle(c, -1, y - 2, 2);
    } },
    apple: { name: 'apple', h: 11, r: 4, floats: true, draw(c) {
      c.fillStyle = '#d23b3b'; circle(c, 0, -4.5, 4.5);
      c.fillStyle = 'rgba(255,255,255,0.5)'; circle(c, -1.5, -6, 1.3);
      c.strokeStyle = '#5a3a24'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(0, -8.5); c.lineTo(1, -11); c.stroke();
      c.fillStyle = '#4f9a3c'; ellipse(c, 2.6, -10, 2.2, 1.1);
    } },
    ball: { name: 'beach ball', h: 12, r: 6, floats: true, draw(c, it) {
      c.save(); c.translate(0, -6); c.rotate(it.roll || 0);
      const cols = ['#e8453c', '#ffffff', '#3b7dd8', '#ffffff', '#f2c14e', '#ffffff'];
      for (let k = 0; k < 6; k++) {
        c.fillStyle = cols[k];
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 6, (k / 6) * Math.PI * 2, ((k + 1) / 6) * Math.PI * 2); c.closePath(); c.fill();
      }
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.55)'; circle(c, -2, -8.5, 1.6);
    } },
    gnome: { name: 'garden gnome', h: 26, r: 6, draw(c) {
      c.fillStyle = '#5a3a24'; ellipse(c, -2.5, -1, 3, 1.6); ellipse(c, 2.5, -1, 3, 1.6);
      c.fillStyle = '#3b6fb5'; roundRect(c, -5, -12, 10, 11, 3, true);
      c.fillStyle = '#3a2a1a'; c.fillRect(-5, -6, 10, 1.6);
      c.fillStyle = '#f2c9a0'; circle(c, 0, -14.5, 3.8);
      c.fillStyle = '#f4f2ee'; poly(c, [[-4.2, -14], [4.2, -14], [0, -6]]); c.fill();
      c.fillStyle = '#e8957a'; circle(c, 0, -14, 1.3);
      c.fillStyle = '#d23b3b'; poly(c, [[-4.8, -16.5], [4.8, -16.5], [1.5, -26]]); c.fill();
    } },
    crate: { name: 'crate', h: 24, r: 11, heavy: true, draw(c) {
      c.fillStyle = '#b07d48'; c.fillRect(-11, -20, 22, 20);
      c.lineWidth = 2; c.strokeStyle = '#8a5d32';
      c.strokeRect(-10, -19, 20, 18);
      c.beginPath(); c.moveTo(-10, -19); c.lineTo(10, -1); c.stroke();
      c.fillStyle = '#c99b63'; c.fillRect(-11, -24, 22, 5);
    } },
    barrel: { name: 'barrel', h: 28, r: 10, heavy: true, draw(c) {
      c.fillStyle = '#8a5a32'; roundRect(c, -10, -24, 20, 24, 5, true);
      c.fillStyle = '#5a5248'; c.fillRect(-10, -19, 20, 2.5); c.fillRect(-10, -6, 20, 2.5);
      c.fillStyle = '#a8743f'; c.beginPath(); c.ellipse(0, -24, 10, 3.5, 0, 0, Math.PI * 2); c.fill();
    } },
    bucket: { name: 'bucket', h: 13, r: 6, draw(c) {
      c.strokeStyle = '#5a5248'; c.lineWidth = 1;
      c.beginPath(); c.arc(0, -11, 6, Math.PI, 0); c.stroke();
      c.fillStyle = '#8f9aa3'; poly(c, [[-6, -11], [6, -11], [4.5, 0], [-4.5, 0]]); c.fill();
      c.fillStyle = '#6f7a83'; c.fillRect(-5.5, -7, 11, 1.4);
      c.fillStyle = '#4f93c7'; ellipse(c, 0, -11, 6, 1.8);
    } },
    hat: { name: 'straw hat', h: 9, r: 8, floats: true, draw(c) {
      c.fillStyle = '#d9b552'; ellipse(c, 0, -2, 9, 3.2);
      c.fillStyle = '#e6c56a'; roundRect(c, -5, -8.5, 10, 6.5, 3, true);
      c.fillStyle = '#c0392b'; c.fillRect(-5, -4.5, 10, 1.7);
    } },
    newspaper: { name: 'newspaper', h: 7, r: 7, draw(c) {
      c.save(); c.translate(0, -3); c.rotate(-0.25);
      c.fillStyle = '#ecebe4'; roundRect(c, -7, -3, 14, 6, 3, true);
      c.fillStyle = '#b9b7ad'; c.fillRect(-5, -1.5, 2, 3); c.fillRect(3, -1.5, 2, 3);
      c.fillStyle = '#c0392b'; c.fillRect(-0.8, -3, 1.6, 6);
      c.restore();
    } },
    duck: { name: 'rubber duck', h: 13, r: 6, floats: true, draw(c) {
      c.fillStyle = '#ffd23f'; ellipse(c, 0, -4, 6, 4);
      poly(c, [[-5, -5], [-8, -8], [-4, -7]]); c.fill();
      circle(c, 3.5, -9, 3.2);
      c.fillStyle = '#f2b92e'; ellipse(c, -1, -4.5, 3, 2);
      c.fillStyle = '#f28c28'; ellipse(c, 7, -8.5, 2.2, 1.1);
      c.fillStyle = '#1d1d22'; circle(c, 4.3, -9.8, 0.7);
    } },
    boot: { name: 'old boot', h: 13, r: 6, draw(c) {
      c.fillStyle = '#6b4226'; poly(c, [[-3.5, -12], [2, -12], [2, -4.5], [7, -3.5], [7, 0], [-3.5, 0]]); c.fill();
      c.fillStyle = '#3a2a1a'; c.fillRect(-3.5, -1.6, 10.5, 1.6);
      c.fillStyle = '#d8cba8'; c.fillRect(-2, -10, 3, 0.8); c.fillRect(-2, -8, 3, 0.8); c.fillRect(-2, -6, 3, 0.8);
    } },
    can: { name: 'watering can', h: 13, r: 7, draw(c) {
      c.strokeStyle = '#3f7f56'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(4, -4); c.lineTo(10, -10); c.stroke();
      c.beginPath(); c.arc(-1, -10, 4, Math.PI, 0); c.stroke();
      c.fillStyle = '#4f9a6a'; roundRect(c, -6, -10, 11, 10, 2, true);
      c.fillStyle = '#3f7f56'; circle(c, 10.5, -10.5, 1.7);
    } },
    pot: { name: 'flower pot', h: 17, r: 6, draw(c) {
      c.strokeStyle = '#3f8a35'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(0, -9); c.lineTo(0, -14); c.stroke();
      c.fillStyle = '#ff6f91';
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; circle(c, Math.cos(a) * 2.2, -15.5 + Math.sin(a) * 2.2, 1.8); }
      c.fillStyle = '#ffd166'; circle(c, 0, -15.5, 1.3);
      c.fillStyle = '#c0643a'; poly(c, [[-5, -8], [5, -8], [3.5, 0], [-3.5, 0]]); c.fill();
      c.fillStyle = '#a8522c'; c.fillRect(-6, -9.5, 12, 2.5);
    } },
    sandwich: { name: 'sandwich', h: 8, r: 7, draw(c) {
      c.fillStyle = '#d9a75a'; poly(c, [[-7, 0], [7, 0], [5, -3], [-5, -3]]); c.fill();
      c.fillStyle = '#7cc45a'; c.fillRect(-6.5, -4.2, 13, 1.6);
      c.fillStyle = '#d23b3b'; c.fillRect(-5.5, -5.2, 11, 1.2);
      c.fillStyle = '#e9c27a'; poly(c, [[-6, -5], [6, -5], [4, -8], [-4, -8]]); c.fill();
    } },
    // --- outdoors ---
    parcel: { name: 'parcel', h: 11, r: 7, draw(c) {
      c.fillStyle = '#c99b63'; c.fillRect(-7, -10, 14, 10);
      c.fillStyle = '#a87a45'; c.fillRect(-7, -10, 14, 2.5);
      c.fillStyle = '#8a5a32'; c.fillRect(-1, -10, 2, 10);
      c.fillStyle = '#f4f2ee'; c.fillRect(2, -7, 4, 3);
    } },
    yarn: { name: 'ball of yarn', h: 10, r: 5, floats: true, draw(c) {
      c.fillStyle = '#d94f7a'; circle(c, 0, -5, 5);
      c.strokeStyle = '#f28cab'; c.lineWidth = 1;
      for (const a of [-0.6, 0, 0.6]) { c.beginPath(); c.ellipse(0, -5, 4.4, 1.8, a, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = '#d94f7a'; c.beginPath(); c.moveTo(4, -3); c.quadraticCurveTo(9, 0, 12, -1); c.stroke();
    } },
    rod: { name: 'fishing rod', h: 7, r: 9, draw(c) {
      c.strokeStyle = '#6b4a2e'; c.lineWidth = 1.8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-11, -1); c.lineTo(10, -6); c.stroke();
      c.fillStyle = '#3a3a3a'; circle(c, -7, -2, 2);
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(10, -6); c.lineTo(12, -1); c.stroke();
      c.fillStyle = '#e8453c'; circle(c, 12, -1, 1.4);
    } },
    shovel: { name: 'shovel', h: 7, r: 9, draw(c) {
      c.strokeStyle = '#8a5a32'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-10, -2); c.lineTo(5, -4); c.stroke();
      c.fillStyle = '#6b4a2e'; c.fillRect(-13, -4.5, 4, 5);
      c.fillStyle = '#9aa3a8'; poly(c, [[5, -7.5], [12, -6], [12, -1], [5, -1]]); c.fill();
    } },
    rake: { name: 'rake', h: 7, r: 9, draw(c) {
      c.strokeStyle = '#8a5a32'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-11, -2); c.lineTo(7, -4); c.stroke();
      c.strokeStyle = '#7a8388'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(7, -9); c.lineTo(8, 1); c.stroke();
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(7.3 + k * 0.25, -8 + k * 3); c.lineTo(10.5, -8 + k * 3); c.stroke(); }
    } },
    wheelbarrow: { name: 'wheelbarrow', h: 18, r: 12, heavy: true, draw(c) {
      c.strokeStyle = '#6b4a2e'; c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-6, -10); c.lineTo(-15, -4); c.moveTo(4, -10); c.lineTo(-5, -4); c.stroke();
      c.fillStyle = '#3f7f56'; poly(c, [[-10, -18], [13, -18], [9, -6], [-6, -6]]); c.fill();
      c.fillStyle = '#4f9a6a'; c.fillRect(-10, -18, 23, 3);
      c.fillStyle = '#2b2d33'; circle(c, 9, -4, 4.2);
      c.fillStyle = '#9aa3a8'; circle(c, 9, -4, 1.5);
    } },
    birdhouse: { name: 'birdhouse', h: 18, r: 6, draw(c) {
      c.fillStyle = '#c0643a'; c.fillRect(-6, -13, 12, 12);
      c.fillStyle = '#7a3e2c'; poly(c, [[-8, -12], [8, -12], [0, -19]]); c.fill();
      c.fillStyle = '#2b1a10'; circle(c, 0, -8, 2.2);
      c.fillStyle = '#6b4a2e'; c.fillRect(-1, -4, 2, 4); c.fillRect(-3, -4.5, 6, 1);
    } },
    kite: { name: 'kite', h: 15, r: 8, floats: true, draw(c) {
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(0, -1); c.quadraticCurveTo(6, 2, 10, 0); c.stroke();
      c.fillStyle = '#ff6f91'; poly(c, [[0, -15], [6, -8], [0, -1], [0, -15]]); c.fill();
      c.fillStyle = '#ffd166'; poly(c, [[0, -15], [-6, -8], [0, -1]]); c.fill();
      c.fillStyle = '#3b7dd8'; poly(c, [[4, 0.5], [6, -1.5], [6.5, 1.5]]); c.fill();
    } },
    basket: { name: 'picnic basket', h: 13, r: 8, draw(c) {
      c.strokeStyle = '#8a5a32'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, -9, 6, Math.PI, 0); c.stroke();
      c.fillStyle = '#c9a06a'; roundRect(c, -8, -10, 16, 10, 2, true);
      c.fillStyle = '#a8804e'; c.fillRect(-8, -7, 16, 1); c.fillRect(-8, -4, 16, 1);
      c.fillStyle = '#d24a4a'; poly(c, [[-5, -10], [0, -13], [4, -10]]); c.fill();
    } },
    milk: { name: 'milk bottle', h: 14, r: 4, draw(c) {
      c.fillStyle = '#f7f7f2'; roundRect(c, -3.5, -11, 7, 11, 2.5, true); c.fillRect(-2, -14, 4, 4);
      c.fillStyle = '#c0c4c8'; c.fillRect(-2.2, -15, 4.4, 2);
      c.fillStyle = '#4f93c7'; c.fillRect(-3.5, -6, 7, 2);
    } },
    pumpkin: { name: 'pumpkin', h: 13, r: 9, floats: true, draw(c) {
      c.fillStyle = '#e07b2a'; ellipse(c, -4, -6, 5, 6); ellipse(c, 4, -6, 5, 6);
      c.fillStyle = '#f2913a'; ellipse(c, 0, -6, 5, 6.5);
      c.fillStyle = '#5a7a2a'; c.fillRect(-1, -14, 2.5, 4);
    } },
    pinecone: { name: 'pinecone', h: 8, r: 4, draw(c) {
      c.fillStyle = '#7a5230'; ellipse(c, 0, -4, 3.4, 4.5);
      c.strokeStyle = '#5a3a20'; c.lineWidth = 0.8;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(0, -7 + k * 2.5, 3, 0.2, Math.PI - 0.2); c.stroke(); }
    } },
    // --- indoors ---
    teapot: { name: 'teapot', h: 12, r: 6, draw(c) {
      c.strokeStyle = '#4f86b0'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(5, -5); c.quadraticCurveTo(9, -7, 9, -10); c.stroke();
      c.beginPath(); c.arc(-6, -6, 2.6, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
      c.fillStyle = '#7fb3d5'; ellipse(c, 0, -5, 6, 5);
      c.fillStyle = '#ffffff'; circle(c, -2, -6, 1.2); circle(c, 2, -4, 1);
      c.fillStyle = '#4f86b0'; ellipse(c, 0, -10, 3, 1.4); circle(c, 0, -11.5, 1.1);
    } },
    vase: { name: 'vase of flowers', h: 19, r: 5, draw(c) {
      c.strokeStyle = '#3f8a35'; c.lineWidth = 1;
      for (const a of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(0, -8); c.lineTo(Math.sin(a) * 6, -15); c.stroke(); }
      for (const [fx, col] of [[-2.6, '#ff6f91'], [0, '#ffd166'], [2.6, '#b39cff']]) { c.fillStyle = col; circle(c, fx, -16, 2.2); }
      c.fillStyle = '#4f6fa8'; c.beginPath(); c.moveTo(-3, -9); c.quadraticCurveTo(-6, -3, -3.5, 0); c.lineTo(3.5, 0); c.quadraticCurveTo(6, -3, 3, -9); c.closePath(); c.fill();
    } },
    book: { name: 'book', h: 5, r: 6, draw(c, it) {
      c.fillStyle = it.color || (it.color = pick(['#b5523b', '#3f7f6a', '#4f6fa8', '#7a4f8f']));
      roundRect(c, -6, -5, 12, 5, 1, true);
      c.fillStyle = '#f4f2ee'; c.fillRect(-5, -2, 11, 1.6);
    } },
    candle: { name: 'candlestick', h: 15, r: 3, draw(c, it, t) {
      c.fillStyle = '#c9a33a'; ellipse(c, 0, -1, 4, 1.6); c.fillRect(-1, -4, 2, 3);
      c.fillStyle = '#f4f2ee'; c.fillRect(-1.6, -11, 3.2, 7);
      c.fillStyle = '#ffb547'; ellipse(c, 0, -13 + Math.sin((t || 0) * 12) * 0.3, 1.4, 2.4);
    } },
    teddy: { name: 'teddy bear', h: 14, r: 6, floats: true, draw(c) {
      c.fillStyle = '#a8743f'; ellipse(c, 0, -5, 5, 5); circle(c, 0, -11, 4);
      circle(c, -3.3, -14, 1.7); circle(c, 3.3, -14, 1.7); circle(c, -5, -2, 1.8); circle(c, 5, -2, 1.8);
      c.fillStyle = '#d9b38a'; ellipse(c, 0, -10, 2, 1.5); ellipse(c, 0, -5, 3, 3);
      c.fillStyle = '#2b2d33'; circle(c, -1.4, -12, 0.6); circle(c, 1.4, -12, 0.6);
      c.fillStyle = '#c0392b'; c.fillRect(-3, -8, 6, 1.5);
    } },
    clock: { name: 'alarm clock', h: 13, r: 5, draw(c) {
      c.fillStyle = '#c0392b'; circle(c, -3.5, -11, 2); circle(c, 3.5, -11, 2);
      circle(c, 0, -6.5, 5.5);
      c.fillStyle = '#f4f2ee'; circle(c, 0, -6.5, 4.2);
      c.strokeStyle = '#2b2d33'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, -6.5); c.lineTo(0, -9.5); c.moveTo(0, -6.5); c.lineTo(2, -6.5); c.stroke();
      c.fillStyle = '#2b2d33'; c.fillRect(-3, -1.5, 1.5, 1.5); c.fillRect(1.5, -1.5, 1.5, 1.5);
    } },
    bread: { name: 'loaf of bread', h: 8, r: 7, draw(c) {
      c.fillStyle = '#c98a3e'; ellipse(c, 0, -4, 7.5, 4);
      c.fillStyle = '#e2a85a'; ellipse(c, 0, -5, 6.5, 3);
      c.strokeStyle = '#a86a2a'; c.lineWidth = 1;
      for (const k of [-3, 0, 3]) { c.beginPath(); c.moveTo(k - 1.5, -6.5); c.lineTo(k + 1.5, -3.5); c.stroke(); }
    } },
    cookies: { name: 'cookie jar', h: 14, r: 6, draw(c) {
      c.fillStyle = 'rgba(220,235,245,0.85)'; roundRect(c, -6, -12, 12, 12, 3, true);
      c.fillStyle = '#c98a3e'; circle(c, -2.5, -4, 2.4); circle(c, 2.5, -5, 2.4); circle(c, 0, -8, 2.4);
      c.fillStyle = '#5a3a24'; circle(c, -3, -4.5, 0.6); circle(c, 2.8, -5.3, 0.6);
      c.fillStyle = '#c0392b'; roundRect(c, -6.5, -14, 13, 3, 1, true);
    } },
    slippers: { name: 'fluffy slippers', h: 5, r: 7, draw(c) {
      c.fillStyle = '#f2b8c6'; ellipse(c, -3, -2.5, 3, 4.5); ellipse(c, 3.5, -2, 3, 4.5);
      c.fillStyle = '#ffffff'; ellipse(c, -3, -5, 3.2, 1.6); ellipse(c, 3.5, -4.5, 3.2, 1.6);
    } },
    frame: { name: 'picture frame', h: 13, r: 6, draw(c) {
      c.fillStyle = '#c9a33a'; c.fillRect(-6, -13, 12, 12);
      c.fillStyle = '#9fd3e8'; c.fillRect(-4.5, -11.5, 9, 9);
      c.fillStyle = '#4f9a3c'; poly(c, [[-4.5, -2.5], [-1, -7], [2, -4], [4.5, -6], [4.5, -2.5]]); c.fill();
      c.fillStyle = '#ffd166'; circle(c, 2.5, -9.5, 1.3);
    } },
    cake: { name: 'cake', h: 13, r: 8, draw(c) {
      c.fillStyle = '#f2d0b8'; ellipse(c, 0, -2, 8, 3);
      c.fillStyle = '#e8b0c0'; c.fillRect(-8, -9, 16, 7);
      c.fillStyle = '#fff4f6'; ellipse(c, 0, -9, 8, 3);
      c.fillStyle = '#d23b3b'; circle(c, -3, -10, 1.3); circle(c, 2, -10.5, 1.3); circle(c, 0, -8.5, 1.3);
      c.fillStyle = '#fff4f6'; for (let k = -6; k <= 6; k += 3) ellipse(c, k, -6.5, 1.2, 2);
    } },
    cheese: { name: 'wedge of cheese', h: 8, r: 6, draw(c) {
      c.fillStyle = '#f2c94e'; poly(c, [[-7, 0], [7, 0], [7, -6], [-7, -2]]); c.fill();
      c.fillStyle = '#ffe08a'; poly(c, [[-7, -2], [7, -6], [7, -7.5], [-7, -3]]); c.fill();
      c.fillStyle = '#d9a43a'; circle(c, 2, -2.5, 1.1); circle(c, -2.5, -1.3, 0.9); circle(c, 5, -1.5, 0.8);
    } },
    trophy: { name: 'fishing trophy', h: 15, r: 5, draw(c) {
      c.fillStyle = '#6b4226'; c.fillRect(-5, -3, 10, 3);
      c.fillStyle = '#e0b84a'; c.fillRect(-1, -7, 2, 4);
      c.beginPath(); c.moveTo(-5, -14); c.lineTo(5, -14); c.quadraticCurveTo(5, -7, 0, -7); c.quadraticCurveTo(-5, -7, -5, -14); c.fill();
      c.fillStyle = '#4f93c7'; ellipse(c, 0, -15.5, 3.5, 1.4);
    } },
    toyboat: { name: 'toy boat', h: 13, r: 7, floats: true, draw(c) {
      c.fillStyle = '#c0392b'; poly(c, [[-7, -4], [7, -4], [5, 0], [-5, 0]]); c.fill();
      c.fillStyle = '#6b4a2e'; c.fillRect(-0.5, -13, 1, 9);
      c.fillStyle = '#f4f2ee'; poly(c, [[0.5, -13], [6, -5], [0.5, -5]]); c.fill();
    } },
    bone: { name: 'bone', h: 5, r: 7, draw(c) {
      c.fillStyle = '#f4ecd8';
      c.fillRect(-5, -4, 10, 3);
      for (const s of [-1, 1]) { circle(c, s * 6, -4.4, 2.1); circle(c, s * 6, -1.6, 2.1); }
      c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(-5, -2, 10, 1);
    } },
    umbrella: { name: 'umbrella', h: 5, r: 9, draw(c) {
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-11, -2); c.lineTo(9, -2); c.stroke();
      c.beginPath(); c.arc(-11, -4, 2, Math.PI * 0.5, Math.PI * 1.5, true); c.stroke();
      c.fillStyle = '#3b5fa8'; poly(c, [[-6, -2], [8, -5], [8, 1]]); c.fill();
    } },
  };

  for (const k of ['vase', 'teapot', 'frame', 'cookies', 'milk']) ITEM[k].fragile = true;
  const items = [];
  let target = null; // item the raccoon would grab right now
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const LOW_KINDS = new Set(['fence', 'bench', 'rock', 'bush', 'mailbox', 'picnic', 'reeds', 'table', 'bed', 'armchair', 'plant']);
  const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const tileAt = (x, y) => getT(Math.floor(x / TILE), Math.floor(y / TILE));

  function addItem(kind, x, y, opts = {}) {
    const it = {
      isItem: true, kind, type: ITEM[kind], x, y, z: opts.z || 0,
      vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, roll: 0, ph0: rand() * 6,
      air: false, held: false, heldBy: null, ghost: false, floating: false, planted: !!opts.planted,
      owner: opts.owner || null,
    };
    it.home = { x, y, z: it.z, planted: it.planted }; // where its owner wants it
    items.push(it);
    return it;
  }
  function itemBox(it) {
    const r = it.type.r;
    return box(it.x - r, it.y - 7, r * 2, 8);
  }
  function boxesOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function playerBox() { return box(player.x - PLAYER_HB.w / 2, player.y - PLAYER_HB.h, PLAYER_HB.w, PLAYER_HB.h); }
  function overlapsPlayer(it) { return boxesOverlap(itemBox(it), playerBox()); }

  // Can an item occupy (x, y)? Thrown things fly over low props.
  function itemBlocked(it, x, y) {
    const r = Math.max(3, it.type.r * 0.6);
    if (x - r < 0 || y - 5 < 0 || x + r > WORLD_W || y > MH_ALL * TILE) return true;
    if (tileAt(x, y) === WALL || tileAt(x - r, y - 3) === WALL || tileAt(x + r, y - 3) === WALL) return true;
    const b = box(x - r, y - 5, r * 2, 5);
    for (const o of solidObjects) {
      if (it.z > 14 && LOW_KINDS.has(o.kind)) continue;
      if (boxesOverlap(b, o.hitbox)) return true;
    }
    for (const other of items) {
      if (other === it || !other.type.heavy || other.held || other.floating) continue;
      if (boxesOverlap(b, itemBox(other))) return true;
    }
    return false;
  }

  function spotFree(x, y, r) {
    if (tileAt(x, y) === WATER || tileAt(x, y) === WALL || tileAt(x - r, y - 4) === WALL || tileAt(x + r, y - 4) === WALL) return false;
    const b = box(x - r, y - 7, r * 2, 8);
    for (const o of solidObjects) if (boxesOverlap(b, o.navBox || o.hitbox)) return false;
    for (const it of items) if (it.type.heavy && boxesOverlap(b, itemBox(it))) return false;
    return true;
  }
  function placeFree(kind, x, y, opts) {
    const r = ITEM[kind].r;
    opts = opts || {};
    for (let ring = 0; ring < 8; ring++) {
      for (let k = 0; k < Math.max(1, ring * 6); k++) {
        const a = (k / Math.max(1, ring * 6)) * Math.PI * 2;
        const px = x + Math.cos(a) * ring * 8, py = y + Math.sin(a) * ring * 8;
        if (spotFree(px, py, r)) return addItem(kind, px, py, opts);
      }
    }
    return null;
  }

  // A walkable spot on the pond's shore in direction `a` (radians)
  function shorePoint(a) {
    const p = L.pond;
    for (let k = 1.0; k <= 2.4; k += 0.08) {
      const x = (p.cx + Math.cos(a) * p.rx * k) * TILE, y = (p.cy + Math.sin(a) * p.ry * k) * TILE;
      if (tileAt(x, y) !== WATER && !navBlockedPt(x, y)) return { x, y };
    }
    return { x: (p.cx + Math.cos(a) * p.rx * 1.6) * TILE, y: (p.cy + Math.sin(a) * p.ry * 1.6) * TILE };
  }
  const plazaAngleFromPond = () => Math.atan2(L.plaza.y + 6 - L.pond.cy, L.plaza.x + 6 - L.pond.cx);

  function placeItems() {
    const T = TILE, g = L.garden, P = L.plaza, hs = L.houses;
    // Garden crops (planted until pulled)
    for (let row = 0; row < 4; row++) for (let x = g.x + 1; x <= g.x + 9; x += 1.5) {
      addItem(row % 2 === 0 ? 'cabbage' : 'carrot', (x + 0.5) * T, (g.y + 1 + row * 2 + 0.6) * T, { planted: true, owner: 'bertram' });
    }
    const order = shuffled(hs.map((_, i) => i));
    const H = (k) => hs[order[k % hs.length]];
    const beside = (h, dx, dy) => [(h.x + h.w + dx) * T, (h.y + h.h + dy) * T];
    // Heavy things stacked beside houses
    placeFree('crate', ...beside(H(0), 0.6, -0.4));
    placeFree('crate', ...beside(H(0), 1.3, 0.3));
    placeFree('crate', ...beside(H(1), 0.6, -0.4));
    placeFree('barrel', ...beside(H(2), 0.7, -0.6));
    placeFree('barrel', ...beside(H(3), 0.7, -0.6));
    // Things resting on furniture
    addItem('pie', L.picnic.x * T + 16, L.picnic.y * T + 1, { z: 19, owner: 'rosa' });
    addItem('hat', (P.x + 10) * T - 6, (P.y + 10.6) * T + 1, { z: 12, owner: 'fennick' });
    addItem('sandwich', (P.x + 2) * T + 8, (P.y + 1.4) * T + 1, { z: 12, owner: 'fennick' });
    // Plaza
    placeFree('bucket', (P.x + 6) * T + 30, (P.y + 4.2) * T + 4, { owner: 'rosa' });
    placeFree('ball', (P.x + 4) * T, (P.y + 8.5) * T, { owner: 'toby' });
    // Mrs. Fennick's doorstep, then a couple of other houses
    const fen = hs[L.homes.fennick];
    placeFree('newspaper', (fen.doorX + 0.5) * T - 18, (fen.y + fen.h + 0.5) * T, { owner: 'fennick' });
    placeFree('pot', (fen.x - 0.7) * T, (fen.y + fen.h + 0.6) * T, { owner: 'fennick' });
    placeFree('gnome', (fen.x + fen.w + 0.6) * T, (fen.y + fen.h - 0.2) * T, { owner: 'fennick' });
    for (let k = 2; k <= 3; k++) {
      const h = H(k);
      if (h === fen) continue;
      placeFree('newspaper', (h.doorX + 0.5) * T - 18, (h.y + h.h + 0.5) * T);
      placeFree('pot', (h.x - 0.7) * T, (h.y + h.h + 0.6) * T);
    }
    placeFree('boot', ...beside(H(4), 0.5, 0.8));
    // Garden things
    placeFree('can', (g.x + 0.8) * T, (g.y + 0.8) * T, { owner: 'bertram' });
    placeFree('gnome', (g.x + 12.3) * T, (g.y + 0.8) * T, { owner: 'bertram' });
    // Toby's duck on the far shore
    const dp = shorePoint(plazaAngleFromPond() + Math.PI * 0.8);
    placeFree('duck', dp.x, dp.y, { owner: 'toby' });
    // Postie's parcels waiting on doorsteps
    const percyHome = hs[L.homes.percy];
    let parcels = 0;
    for (let k = 0; k < hs.length && parcels < 2; k++) {
      const h = H(k + 2);
      if (h === percyHome) continue;
      placeFree('parcel', (h.x + 0.8) * T, (h.y + h.h + 0.5) * T, { owner: 'percy' });
      parcels++;
    }
    // Milk on a couple of doorsteps, a birdhouse, a kite in the plaza
    for (let k = 4; k <= 5; k++) { const h = H(k); placeFree('milk', (h.doorX + 0.5) * T + 14, (h.y + h.h + 0.45) * T); }
    placeFree('birdhouse', ...beside(H(1), 0.8, 0.4));
    placeFree('kite', (P.x + 9) * T, (P.y + 8.5) * T, { owner: 'toby' });
    // Bertram's tools and harvest
    const gateOut = g.gateTop ? g.gateY - 1.2 : g.gateY + 1.6;
    placeFree('shovel', (g.gateX - 1.5) * T, gateOut * T, { owner: 'bertram' });
    placeFree('rake', (g.gateX + 2.5) * T, gateOut * T, { owner: 'bertram' });
    placeFree('wheelbarrow', (g.x - 2.4) * T, (g.y + 3) * T, { owner: 'bertram' });
    placeFree('pumpkin', (g.x + 9.8) * T, (g.y + 9.4) * T, { owner: 'bertram' });
    // Rosa's picnic basket, Granny Mabel's yarn, Ollie's rod
    placeFree('basket', (L.picnic.x - 1.6) * T, (L.picnic.y + 0.7) * T, { owner: 'rosa' });
    const mab = hs[L.homes.mabel];
    placeFree('yarn', (mab.doorX + 0.5) * T + 34, (mab.y + mab.h + 1.5) * T, { owner: 'mabel' });
    const fishPt = shorePoint(plazaAngleFromPond() + 1.6);
    placeFree('rod', fishPt.x + 16, fishPt.y + 6, { owner: 'ollie' });

    // Inside every house: things on the table and around the room
    for (const h of hs) {
      if (!h.room) continue;
      const { x0, y0 } = h.room;
      const who = residentsOf(h);
      const owner = who.includes('rosa') ? 'rosa' : who[0] || null;
      const tableY = (y0 + 5) * T + 1;
      const onTable = who.includes('rosa') ? ['cake', 'teapot'] : who.includes('mabel') ? ['cookies', 'teapot'] : [pick(['bread', 'cheese', 'teapot', 'cookies']), pick(['bread', 'cheese', 'vase'])];
      addItem(onTable[0], (x0 + 5.5) * T - 15, tableY, { z: 22, owner });
      addItem(onTable[1], (x0 + 5.5) * T + 15, tableY, { z: 22, owner });
      const floorKinds = shuffled(['slippers', 'book', 'vase', 'clock', 'frame', 'candle', 'umbrella', 'book']).slice(0, 3);
      if (who.includes('toby')) floorKinds.push('teddy', 'toyboat');
      if (who.includes('ollie')) floorKinds.push('trophy');
      if (who.includes('percy')) floorKinds.push('parcel');
      for (const kind of floorKinds) {
        const own = (kind === 'teddy' || kind === 'toyboat') ? 'toby' : owner;
        placeFree(kind, (x0 + rr(1.8, 9.2)) * T, (y0 + rr(3.4, 6.6)) * T, { owner: own });
      }
    }

    // Apples fallen under some trees, pinecones too
    const cones = objects.filter((o) => o.kind === 'tree' && o.x > 5 * T && o.x < WORLD_W - 5 * T && o.y > 5 * T && o.y < WORLD_H - 5 * T);
    for (let n = 0; n < 4 && cones.length; n++) {
      const tr = cones.splice(Math.floor(rand() * cones.length), 1)[0];
      placeFree('pinecone', tr.x + rr(-16, 16), tr.y + rr(6, 12));
    }
    const trees = objects.filter((o) => o.kind === 'tree' && o.x > 5 * T && o.x < WORLD_W - 5 * T && o.y > 5 * T && o.y < WORLD_H - 5 * T);
    for (let n = 0; n < 10 && trees.length; n++) {
      const tr = trees.splice(Math.floor(rand() * trees.length), 1)[0];
      placeFree('apple', tr.x + rr(-18, 18), tr.y + rr(6, 14));
    }
  }

  function heldPos(t) {
    const it = player.held;
    const moving = player.speed > 6;
    const bob = moving ? Math.abs(Math.sin(player.walk)) * 1.8 : Math.sin(t * 2.2) * 0.5;
    const lift = player.hop + bob;
    if (it.type.heavy) return { x: player.x, y: player.y, z: 29 + lift };
    switch (player.dir) {
      case 'right': return { x: player.x + 17, y: player.y, z: 7 + lift };
      case 'left': return { x: player.x - 17, y: player.y, z: 7 + lift };
      case 'up': return { x: player.x, y: player.y, z: 17 + lift };
      default: return { x: player.x, y: player.y + 1, z: 5 + lift };
    }
  }

  // How far something is from the spot just in front of the raccoon's nose
  function reachPoint() { const d = DIRV[player.dir]; return [player.x + d[0] * 12, player.y + d[1] * 9 - 3]; }
  function itemReach(it) { const [rx, ry] = reachPoint(); return Math.hypot(it.x - rx, it.y - ry) - it.type.r * 0.5; }
  // Which animal (if any) E would pet: whichever is closest to your nose, ahead of any item
  function petChoice() {
    if (!started || paused || player.held) return null;
    let best = null, bd = target ? itemReach(target) : Infinity;
    if (dogCanPet() && dogReach() < bd) { best = 'dog'; bd = dogReach(); }
    if (catCanPet() && catReach() < bd) best = 'cat';
    return best;
  }
  function dogReach() { const [rx, ry] = reachPoint(); return Math.hypot(dog.x - rx, dog.y - ry) - 8; }

  function findTarget() {
    if (player.held || !started) return null;
    const d = DIRV[player.dir];
    const rx = player.x + d[0] * 12, ry = player.y + d[1] * 9 - 3;
    let best = null, bd = 24;
    for (const it of items) {
      if (it.held || (it.air && it.z > 12)) continue;
      const dist = Math.hypot(it.x - rx, it.y - ry) - it.type.r * 0.5;
      if (dist < bd) { bd = dist; best = it; }
    }
    return best;
  }

  function grabOrDrop() {
    if (!started) return;
    if (player.held) { dropHeld(false); return; }
    const pc = petChoice();
    if (pc === 'dog') { petDog(); return; }
    if (pc === 'cat') { petCat(); return; }
    if (target) pickUp(target);
  }

  function pickUp(it) {
    const wasPlanted = it.planted;
    if (it.planted) { puff(it.x, it.y, 5, 'soil'); sfx('pop'); } else sfx(it.type.heavy ? 'heave' : 'pick');
    Object.assign(it, { held: true, heldBy: null, air: false, floating: false, planted: false, ghost: false, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0 });
    player.held = it;
    sparkle(it.x, it.y, it.z + it.type.h * 0.5);
    // to-do list
    if (wasPlanted) {
      tasks.cropPulls++;
      setProgress('crops5', tasks.cropPulls);
      if (it.kind === 'carrot') completeTask('carrot');
    }
    if (it.kind === 'pie') completeTask('pie');
    if (it.kind === 'newspaper') completeTask('paper');
    if (it.kind === 'gnome') completeTask('gnome');
    if (it.kind === 'parcel') completeTask('parcel');
    if (it.kind === 'cake') completeTask('cake');
    if (it.kind === 'rod') completeTask('rod');
    if (it.kind === 'yarn') {
      const m = VILLAGER.mabel;
      if (m && m.state === 'act' && m.stops[m.stopIdx].act === 'knit' && Math.hypot(m.x - it.x, m.y - it.y) < 90) completeTask('yarn');
    }
    if (it.type.heavy) completeTask('lift');
    if (it.droppedAt && time - it.droppedAt < 5) completeTask('snatchback');
    it.droppedAt = 0;
    if (it.kind === 'hat') {
      const f = VILLAGER.fennick;
      if (f && f.state === 'act' && f.stops[f.stopIdx].needs === 'hat' && Math.hypot(f.x - it.x, f.y - it.y) < 90) completeTask('hat');
    }
  }

  function dropHeld(pop) {
    const it = player.held;
    if (!it) return;
    player.held = null;
    it.held = false;
    const d = DIRV[player.dir];
    const reach = it.type.heavy ? PLAYER_HB.w / 2 + it.type.r + 3 : 16;
    let x = player.x + d[0] * reach;
    let y = player.y + d[1] * (it.type.heavy ? 12 : 10) + (d[1] >= 0 ? 1 : 0);
    if (itemBlocked(it, x, y)) { x = player.x; y = player.y + 1; }
    Object.assign(it, { x, y, z: it.type.heavy ? 10 : 8, air: true, ghost: true, kicker: null, noticed: false, thrownByPlayer: false, vz: pop ? 110 : 0, vx: player.vx * 0.3, vy: player.vy * 0.3, spin: pop ? (Math.random() - 0.5) * 10 : 0 });
  }

  function throwHeld() {
    const it = player.held;
    if (!it) return;
    player.held = null;
    it.held = false;
    const d = DIRV[player.dir];
    const heavy = it.type.heavy;
    const sp = heavy ? 150 : 270;
    if (player.dir === 'up' && !heavy) it.y = player.y - 6;
    Object.assign(it, {
      vx: d[0] * sp + player.vx * 0.6,
      vy: d[1] * sp * 0.75 + player.vy * 0.6,
      vz: heavy ? 110 : 150,
      air: true, ghost: true, kicker: null, noticed: false, thrownByPlayer: true,
      spin: heavy ? (d[0] || 1) * 4 : (Math.random() - 0.5) * 18 + d[0] * 8, byCat: false,
    });
    sfx('throw');
    if (heavy) completeTask('heavythrow');
  }

  function updateItems(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.held) { const hp = it.heldBy ? (it.heldBy === dog ? heldPosDog() : heldPosV(it.heldBy)) : heldPos(time); it.x = hp.x; it.y = hp.y; it.z = hp.z; continue; }
      if (it.ghost && !overlapsPlayer(it)) it.ghost = false;

      // Beach balls get kicked when you run into them
      if (it.kind === 'ball' && !it.floating && it.z < 6 && player.speed > 20 && Math.hypot(it.x - player.x, it.y - player.y) < 13) {
        const a = Math.atan2(it.y - player.y, it.x - player.x);
        const k = 60 + player.speed * 1.2;
        it.vx = Math.cos(a) * k; it.vy = Math.sin(a) * k; it.vz = 70 + player.speed * 0.3; it.air = true; it.kicker = null;
        sfx('bounce');
        completeTask('kick');
      }

      if (it.floating) {
        it.x += it.vx * dt; it.y += it.vy * dt;
        const f = Math.pow(0.4, dt); it.vx *= f; it.vy *= f;
        it.x += Math.sin(time * 0.4 + it.ph0) * 3 * dt;
        if (tileAt(it.x, it.y) !== WATER) it.floating = false; // washed ashore
        continue;
      }
      if (!it.air) continue;

      it.vz -= 760 * dt; it.z += it.vz * dt;
      it.rot += it.spin * dt;
      if (it.kind === 'ball') it.roll += (it.vx + it.vy * 0.5) * dt / 6;
      const nx = it.x + it.vx * dt;
      if (itemBlocked(it, nx, it.y)) { if (Math.abs(it.vx) > 60) sfx('bonk'); it.vx = -it.vx * 0.45; } else it.x = nx;
      const ny = it.y + it.vy * dt;
      if (itemBlocked(it, it.x, ny)) { if (Math.abs(it.vy) > 60) sfx('bonk'); it.vy = -it.vy * 0.45; } else it.y = ny;
      // Bonk! Thrown things hit villagers
      if (Math.hypot(it.vx, it.vy) > 80 && it.z < 34 && !it.kicker) { // villagers don't bonk themselves
        for (const v of villagers) {
          if (Math.hypot(it.x - v.x, it.y - v.y) > 11) continue;
          it.vx *= -0.3; it.vy *= -0.3;
          sfx('bonk');
          if (v.id === 'fennick') completeTask('bonk');
          if (v.id === 'rosa' && it.kind === 'boot') completeTask('boot');
          startleV(v, 'Ow!', it.owner === v.id ? { state: 'fetch', target: it } : { state: 'chase', target: null });
          break;
        }
      }

      if (it.z <= 0) {
        it.z = 0;
        if (tileAt(it.x, it.y) === WATER) {
          splash(it.x, it.y, it.type.heavy);
          if (!it.kicker) {
            completeTask('splash');
            if (it.kind === 'ball') completeTask('ballpond');
            if (it.kind === 'duck') completeTask('duck');
            if (!it.type.floats) { run.sunk++; setProgress('sink3', run.sunk); }
          }
          if (it.type.floats) Object.assign(it, { floating: true, air: false, vz: 0, rot: 0, spin: 0, vx: it.vx * 0.3, vy: it.vy * 0.3 });
          else items.splice(i, 1); // glub glub
          continue;
        }
        if (!it.noticed) { it.noticed = true; dogNotice(it); }
        if (it.type.fragile && it.vz < -165) { shatter(it); items.splice(i, 1); continue; } // crash!
        if (it.vz < -110) {
          it.vz = -it.vz * (it.kind === 'ball' ? 0.6 : 0.3);
          it.vx *= 0.75; it.vy *= 0.75;
          sfx(it.type.heavy ? 'thud' : 'bounce');
          puff(it.x, it.y, it.type.heavy ? 5 : 2);
        } else {
          if (it.vz < -30) { sfx(it.type.heavy ? 'thud' : 'tap'); puff(it.x, it.y, it.type.heavy ? 4 : 1); }
          it.vz = 0;
          const f = Math.pow(it.kind === 'ball' ? 0.3 : 0.002, dt);
          it.vx *= f; it.vy *= f;
          it.rot *= Math.pow(0.001, dt);
          if (Math.hypot(it.vx, it.vy) < 4) Object.assign(it, { air: false, vx: 0, vy: 0, rot: 0, spin: 0 });
        }
      }
    }
  }

  // Effects ------------------------------------------------------------------
  function puff(x, y, n, soil) {
    for (let k = 0; k < n; k++) {
      particles.push({ x: x + rr(-6, 6), y: y + rr(-2, 2), r: rr(2, 4), life: 0.45, max: 0.45, vy: -12, soil: !!soil });
    }
  }
  function sparkle(x, y, z) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({ kind: 'spark', x, y, z, vx: Math.cos(a) * 40, vy: Math.sin(a) * 20, vz: 60 + Math.random() * 60, life: 0.5, max: 0.5 });
    }
  }
  function splash(x, y, big) {
    sfx('splash');
    particles.push({ kind: 'ring', x, y, r: 3, life: 0.9, max: 0.9 });
    particles.push({ kind: 'ring', x, y, r: 0, life: 1.2, max: 1.2 });
    for (let k = 0; k < (big ? 18 : 10); k++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * (big ? 60 : 40);
      particles.push({ kind: 'drop', x, y, z: 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 90 + Math.random() * (big ? 140 : 90), life: 0.8, max: 0.8 });
    }
  }

  // Item rendering -------------------------------------------------------------
  function drawItemShadow(ctx, it) {
    if (!it.air && it.z > 0) return; // resting on furniture
    const s = 1 - Math.min(it.z, 60) / 90;
    ctx.fillStyle = 'rgba(20,40,10,0.25)';
    ellipse(ctx, it.x, it.y, it.type.r * s * 1.05, it.type.r * 0.38 * s + 0.5);
  }

  function drawItem(ctx, it, t) {
    ctx.save();
    let z = it.z;
    if (it.floating) {
      z = -2 + Math.sin(t * 2.4 + it.ph0);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
      const rr2 = it.type.r + 3 + Math.sin(t * 2 + it.ph0);
      ctx.beginPath(); ctx.ellipse(it.x, it.y, rr2, rr2 * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.rect(it.x - 40, it.y - 80, 80, 79); ctx.clip(); // waterline
    }
    ctx.translate(it.x, it.y - z);
    if (it.rot) { const h = it.type.h / 2; ctx.translate(0, -h); ctx.rotate(it.rot); ctx.translate(0, h); }
    it.type.draw(ctx, it, t);
    ctx.restore();
  }

  function drawPlayerWithHeld(ctx, t) {
    const it = player.held;
    if (!it) { drawRaccoon(ctx, player, t); return; }
    const behind = !it.type.heavy && player.dir === 'up';
    const draw = () => {
      ctx.save();
      ctx.translate(it.x, it.y - it.z);
      it.type.draw(ctx, it, t);
      ctx.restore();
      if (it.type.heavy) { // arms up, paws gripping the sides
        const py = it.y - it.z - it.type.h * 0.3;
        const sy = player.y - player.hop - 15;
        ctx.strokeStyle = FUR_DARK; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(player.x + s * 6, sy); ctx.lineTo(it.x + s * (it.type.r + 0.5), py); ctx.stroke();
        }
        ctx.fillStyle = MASK;
        circle(ctx, it.x - it.type.r - 0.5, py, 2.6);
        circle(ctx, it.x + it.type.r + 0.5, py, 2.6);
      }
    };
    if (behind) draw();
    drawRaccoon(ctx, player, t);
    if (!behind) draw();
  }

  function drawPrompt(ctx, it, t) {
    const x = it.x;
    const y0 = it.y - it.z - it.type.h - 6 + Math.sin(t * 5) * 1.5;
    ctx.fillStyle = '#fff8e6'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4, y0 - 4); ctx.lineTo(x + 4, y0 - 4); ctx.lineTo(x, y0 + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = '800 7px Nunito, sans-serif';
    ctx.textBaseline = 'middle';
    const keyW = isTouch ? 0 : 10;
    const label = itemName(it);
    const w = ctx.measureText(label).width + 8 + keyW;
    const lx = x - w / 2, ly = y0 - 17;
    ctx.fillStyle = 'rgba(28,36,24,0.85)'; roundRect(ctx, lx, ly, w, 11, 4, true);
    if (!isTouch) {
      ctx.fillStyle = '#ffb547'; roundRect(ctx, lx + 2, ly + 1.5, 8, 8, 2, true);
      ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center'; ctx.fillText('E', lx + 6, ly + 5.8);
    }
    ctx.fillStyle = '#fff4d6'; ctx.textAlign = 'left';
    ctx.fillText(label, lx + 4 + keyW, ly + 5.8);
  }

  // ---------------------------------------------------------------------------
  // Navigation: tile grid of blocked cells + A* pathfinding
  // ---------------------------------------------------------------------------
  let nav = null; // 1 = blocked
  function buildNav() {
    nav = new Uint8Array(MW * MH_ALL);
    for (let i = 0; i < MW * MH_ALL; i++) if (map[i] === WATER || map[i] === WALL) nav[i] = 1;
    for (const o of solidObjects) {
      const h = o.navBox || o.hitbox;
      const x0 = Math.floor((h.x + 3) / TILE), x1 = Math.floor((h.x + h.w - 3) / TILE);
      const y0 = Math.floor((h.y + 2) / TILE), y1 = Math.floor((h.y + h.h - 2) / TILE);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) nav[idx(x, y)] = 1;
    }
  }
  const navOpen = (tx, ty) => inb(tx, ty) && nav[idx(tx, ty)] === 0;
  const navBlockedPt = (x, y) => !navOpen(Math.floor(x / TILE), Math.floor(y / TILE));

  function nearestOpen(tx, ty) {
    if (navOpen(tx, ty)) return [tx, ty];
    for (let r = 1; r <= 6; r++) {
      let best = null, bd = Infinity;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r || !navOpen(tx + i, ty + j)) continue;
        const d = i * i + j * j;
        if (d < bd) { bd = d; best = [tx + i, ty + j]; }
      }
      if (best) return best;
    }
    return null;
  }

  // Returns a list of world-space waypoints, or null
  function findPath(sx, sy, gx, gy) {
    const s = nearestOpen(Math.floor(sx / TILE), Math.floor(sy / TILE));
    const goalTx = Math.floor(gx / TILE), goalTy = Math.floor(gy / TILE);
    const g = nearestOpen(goalTx, goalTy);
    if (!s || !g) return null;
    const N = MW * MH_ALL, si = idx(s[0], s[1]), gi = idx(g[0], g[1]);
    const gs = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = []; // [f, i]
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    const h = (i) => { const dx = Math.abs((i % MW) - g[0]), dy = Math.abs(Math.floor(i / MW) - g[1]); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    gs[si] = 0; push(h(si), si);
    let iter = 0;
    while (heap.length && iter++ < 6000) {
      const [, cur] = pop();
      if (cur === gi) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % MW, cy = Math.floor(cur / MW);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!navOpen(nx, ny)) continue;
        if (dx && dy && (!navOpen(cx + dx, cy) || !navOpen(cx, cy + dy))) continue; // no corner cutting
        const ni = idx(nx, ny);
        const ng = gs[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; push(ng + h(ni), ni); }
      }
    }
    if (si !== gi && came[gi] === -1) return null;
    const pts = [];
    for (let i = gi; i !== si && i !== -1; i = came[i]) pts.push({ x: (i % MW + 0.5) * TILE, y: (Math.floor(i / MW) + 0.6) * TILE });
    pts.reverse();
    // finish on the exact goal when it's walkable
    if (navOpen(goalTx, goalTy)) { if (pts.length) pts[pts.length - 1] = { x: gx, y: gy }; else pts.push({ x: gx, y: gy }); }
    return pts;
  }

  // Is the straight line between two points free of blocked tiles (with body width)?
  function lineClear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const px = -dy / d * 5, py = dx / d * 5;
    const steps = Math.ceil(d / 6);
    for (let i = 1; i <= steps; i++) {
      const x = x0 + dx * i / steps, y = y0 + dy * i / steps;
      if (navBlockedPt(x, y) || navBlockedPt(x + px, y + py) || navBlockedPt(x - px, y - py)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Villagers
  // ---------------------------------------------------------------------------
  const VILLAGER_DEFS = [
    {
      id: 'bertram', name: 'Bertram', skin: '#e8b996', hair: '#d8d8d8', shirt: '#5b7f3a', pants: '#6b5134', hat: 'straw',
      speed: 46, chase: 104, pitch: 150,
      lines: { tend: ['Grow, little ones.', 'Hmm. Weeds.', '♪ hm hm hm ♪'], rest: ['Ooh, my back.', 'Fine day for carrots.'] },
    },
    {
      id: 'fennick', name: 'Mrs. Fennick', skin: '#f0c8a8', hair: '#a4a4b0', shirt: '#7a4f8f', pants: '#5a3a6a', hat: 'bun', dress: true,
      speed: 42, chase: 110, pitch: 270,
      lines: { tidy: ['Such a mess.', 'Hmph. That wind.'], water: ['There, my darlings.'], sit: ['Lovely day.', 'Tsk. Kids these days.'], stroll: ['Mm-hm.'] },
    },
    {
      id: 'rosa', name: 'Rosa', skin: '#c98e66', hair: '#3a2418', shirt: '#b5523b', pants: '#5a3a24', hat: 'scarf', apron: true,
      speed: 52, chase: 124, pitch: 210,
      lines: { eat: ['Mmm, pie.', 'Perfect picnic.'], gaze: ['So peaceful.', 'Ducks!'], rest: ['Smells like rain.'], stroll: ['Morning!', 'Smells like fresh bread.'] },
    },
    {
      id: 'toby', name: 'Toby', skin: '#f2c9a0', hair: '#8a5a2e', shirt: '#e8453c', pants: '#3b6fb5', hat: 'cap', stripes: true, scale: 0.82,
      speed: 60, chase: 132, pitch: 380,
      lines: { play: ['Wheee!', 'Goal!!'], gaze: ['Quack quack!', 'Hi fishies!'], rest: ["Mom! I'm hungry!"] },
    },
  ];
  VILLAGER_DEFS.push(
    {
      id: 'percy', name: 'Percy', skin: '#e0a982', hair: '#4a3020', shirt: '#3b5fa8', pants: '#2c3d63', hat: 'cap', capColor: '#2c3d63', bag: true,
      speed: 58, chase: 130, pitch: 240,
      lines: { deliver: ['Post!', 'Parcel for you!', 'Sign here, please.'], rest: ['My feet...', 'Lovely day for it.'], home: ['Kettle on.'] },
    },
    {
      id: 'mabel', name: 'Granny Mabel', skin: '#f2d0b8', hair: '#e8e8ee', shirt: '#c56b8a', pants: '#8a4a66', hat: 'bun', dress: true, glasses: true, scale: 0.94,
      speed: 34, chase: 86, pitch: 300,
      lines: { knit: ['Knit one, purl two.', 'Mm, lovely weather.', 'Who goes there?'], sit: ['Ahh, sunshine.'], home: ['Where are my spectacles?', 'Time for a biscuit.'] },
    },
    {
      id: 'ollie', name: 'Ollie', skin: '#d9a07a', hair: '#7a5a3a', shirt: '#3f7f6a', pants: '#4a4e57', hat: 'beanie', capColor: '#c0392b', beard: true,
      speed: 48, chase: 114, pitch: 120,
      lines: { fish: ['Bite? No bite.', 'Shh. Fish are listening.', 'It was THIS big.'], stroll: ['Morning.'], home: ['Smells fishy in here.'] },
    },
  );
  const HOME_LINES = ['Home sweet home.', 'Now where did I put that...', 'Ahh, my own chair.'];
  const villagers = [];
  const VILLAGER = {}; // by id
  const rpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const itemName = (it) => (it.owner === 'biscuit' ? `Biscuit's ${it.type.name}` : it.owner && VILLAGER[it.owner] ? `${VILLAGER[it.owner].name}'s ${it.type.name}` : it.type.name);

  // Each villager's daily round, worked out from this village's layout
  function stopsFor(id) {
    const T = TILE, P = L.plaza, g = L.garden, h = L.houses[L.homes[id]];
    const door = [(h.doorX + 0.5) * T, (h.y + h.h + 1.3) * T];
    const S = (wx, wy, act, dur, face, needs) => ({ wx, wy, act, dur, face, needs });
    const faceTo = (pt, x, y) => (Math.abs(x - pt.x) > Math.abs(y - pt.y) ? (x > pt.x ? 'right' : 'left') : (y > pt.y ? 'down' : 'up'));
    const pondPx = [L.pond.cx * T, L.pond.cy * T];
    // A visit inside their own house (falls back to the doorstep if it has no room)
    const homeStop = (fx, fy, dur, face = 'down') => (h.room ? S((h.room.x0 + fx) * T, (h.room.y0 + fy) * T, 'home', dur, face) : S(...door, 'rest', dur, 'down'));
    switch (id) {
      case 'bertram': {
        const gateOut = g.gateTop ? g.gateY - 1.6 : g.gateY + 1.9;
        return [
          S((g.x + 3) * T, (g.y + 2.6) * T, 'tend', 7, 'down'),
          S((g.x + 7.5) * T, (g.y + 4.6) * T, 'tend', 7, 'down'),
          S((g.x + 2.5) * T, (g.y + 6.6) * T, 'tend', 6, 'up'),
          S((g.gateX + 0.5) * T, gateOut * T, 'rest', 3, 'down'),
          homeStop(3, 5.6, 8),
        ];
      }
      case 'fennick': return [
        S(...door, 'tidy', 5, 'down'),
        S(h.x * T, (h.y + h.h + 1.6) * T, 'water', 4, 'left'),
        S((P.x + 2.5) * T, (P.y + 2.5) * T, 'sit', 9, 'down', 'sandwich'),
        S((P.x + 7) * T, (P.y + 8.5) * T, 'stroll', 3, 'right'),
        S((P.x + 10) * T, (P.y + 11.6) * T, 'sit', 6, 'down', 'hat'),
        homeStop(7.5, 5.8, 6),
      ];
      case 'rosa': {
        const sp = shorePoint(plazaAngleFromPond() + 0.6);
        return [
          S(...door, 'rest', 4, 'down'),
          S((L.picnic.x + 0.5) * T, (L.picnic.y + 1.4) * T, 'eat', 10, 'up', 'pie'),
          S(sp.x, sp.y, 'gaze', 5, faceTo(sp, ...pondPx)),
          S((P.x + 3) * T, (P.y + 7) * T, 'stroll', 4, 'right'),
          homeStop(h.room && h.room.bedLeft ? 6.6 : 4.4, 3.6, 7, 'up'),
        ];
      }
      case 'percy': {
        const others = shuffled(L.houses.filter((x) => x !== h)).slice(0, 3);
        return [
          ...others.map((o) => S((o.doorX + 0.5) * T, (o.y + o.h + 1.2) * T, 'deliver', 2.5, 'up')),
          S((P.x + 7) * T, (P.y + 3) * T, 'rest', 4, 'down'),
          homeStop(5.5, 6, 5),
        ];
      }
      case 'mabel': return [
        S((h.doorX + 0.5) * T + 22, (h.y + h.h + 1.4) * T, 'knit', 14, 'down'),
        S((P.x + 2.5) * T, (P.y + 11.6) * T, 'sit', 8, 'down'),
        homeStop(3.5, 6, 10),
      ];
      case 'ollie': {
        const a = shorePoint(plazaAngleFromPond() + 1.6), b = shorePoint(plazaAngleFromPond() - 1.8);
        return [
          S(a.x, a.y, 'fish', 14, faceTo(a, ...pondPx)),
          S(b.x, b.y, 'fish', 10, faceTo(b, ...pondPx)),
          S((P.x + 9) * T, (P.y + 5) * T, 'stroll', 3, 'left'),
          homeStop(6.5, 6, 6),
        ];
      }
      default: { // toby
        const sp = shorePoint(plazaAngleFromPond() - 0.7);
        return [
          S((P.x + 4) * T, (P.y + 8.5) * T, 'play', 16, 'down'),
          S(...door, 'rest', 3, 'down'),
          homeStop(h.room && h.room.bedLeft ? 2.6 : 8.4, 4.8, 5),
          S(sp.x, sp.y, 'gaze', 6, faceTo(sp, ...pondPx)),
        ];
      }
    }
  }

  function spawnVillagers() {
    const mult = run.villagerSpeed;
    for (const d of VILLAGER_DEFS) {
      const stops = stopsFor(d.id).map((s) => {
        if (navBlockedPt(s.wx, s.wy)) {
          const o = nearestOpen(Math.floor(s.wx / TILE), Math.floor(s.wy / TILE));
          if (o) { s.wx = (o[0] + 0.5) * TILE; s.wy = (o[1] + 0.6) * TILE; }
        }
        return s;
      });
      const v = {
        ...d, stops, scale: d.scale || 1, speed: d.speed * mult, chase: d.chase * mult,
        x: stops[0].wx, y: stops[0].wy, dir: stops[0].face, walk: 0, moving: false, seed: Math.random() * 6,
        hop: 0, hopV: 0, bubble: null,
        state: 'act', actT: stops[0].dur * (0.6 + Math.random() * 0.4), stopIdx: 0, stateT: 0, lineT: 1 + Math.random() * 4,
        path: null, repathT: 0, target: null, held: null, lostT: 0, lastSeen: null,
        cooldown: 0, startleCD: 0, kickCD: 0, tidyT: Math.random(), after: null, searching: false, lookT: 0,
      };
      villagers.push(v);
      VILLAGER[v.id] = v;
    }
  }

  function say(v, text, dur = 2.2, alert = false) {
    v.bubble = { text, t: dur, alert };
    if (!alert && Math.hypot(v.x - player.x, v.y - player.y) < 260) babble(v.pitch, text.length);
  }

  function displaced(it) {
    const h = it.home;
    if (!h) return false;
    const far = it.kind === 'ball' ? 240 : 20;
    return Math.hypot(it.x - h.x, it.y - h.y) > far || (h.planted && !it.planted) || (h.z > 0 && it.z < h.z - 4);
  }
  const ownedKind = (v, kind) => items.find((it) => it.owner === v.id && it.kind === kind);

  function canSee(v, x, y) {
    const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy);
    if (d > run.vision || areaOf(v.x, v.y) !== areaOf(x, y)) return false;
    if (d > 45) { const f = DIRV[v.dir]; if ((dx * f[0] + dy * f[1]) / d < 0.2) return false; }
    return lineClear(v.x, v.y - 4, x, y);
  }

  function moveToward(v, x, y, speed, dt) {
    const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return true;
    const step = Math.min(d, speed * dt);
    const nx = v.x + dx / d * step, ny = v.y + dy / d * step;
    if (!navBlockedPt(nx, v.y)) v.x = nx;
    if (!navBlockedPt(v.x, ny)) v.y = ny;
    if (Math.abs(dx) > Math.abs(dy) * 1.1) v.dir = dx > 0 ? 'right' : 'left';
    else v.dir = dy > 0 ? 'down' : 'up';
    v.walk += dt * speed * 0.12;
    v.moving = true;
    return step >= d;
  }

  function followPath(v, speed, dt) {
    if (!v.path || !v.path.length) return true;
    while (v.path.length > 1 && lineClear(v.x, v.y, v.path[1].x, v.path[1].y)) v.path.shift();
    const p = v.path[0];
    if (Math.hypot(p.x - v.x, p.y - v.y) < 3 || moveToward(v, p.x, p.y, speed, dt)) v.path.shift();
    return v.path.length === 0;
  }

  // Walk to (gx, gy), going through house doors when the goal is in another area.
  // Returns true on arrival.
  function travel(v, gx, gy, speed, dt) {
    const va = areaOf(v.x, v.y), ga = areaOf(gx, gy);
    let tx = gx, ty = gy, portal = null;
    if (va !== ga) {
      if (va === 0) { const h = houseOfArea(ga); if (h) { tx = h.doorOut.x; ty = h.doorOut.y; portal = h; } }
      else { const h = houseOfArea(va); if (h) { tx = h.exitIn.x; ty = h.exitIn.y; portal = h; } }
    }
    if (!v.path || !v.pathGoal || v.pathGoal.x !== tx || v.pathGoal.y !== ty) {
      v.path = findPath(v.x, v.y, tx, ty) || [];
      v.pathGoal = { x: tx, y: ty };
    }
    if (!followPath(v, speed, dt)) return false;
    v.path = null; v.pathGoal = null;
    if (portal) {
      const near = Math.hypot(player.x - v.x, player.y - v.y) < 300;
      if (va === 0) { v.x = portal.exitIn.x; v.y = portal.exitIn.y - 2; v.dir = 'up'; }
      else { v.x = portal.doorOut.x; v.y = portal.doorOut.y + 2; v.dir = 'down'; }
      if (near || Math.hypot(player.x - v.x, player.y - v.y) < 300) sfx('door');
      return false;
    }
    return true;
  }

  function toRoute(v) {
    v.state = 'route'; v.path = null; v.target = null; v.searching = false;
  }
  function sulk(v, text) {
    say(v, text);
    sfx('hmph');
    v.state = 'sulk'; v.stateT = 2.2; v.target = null; v.path = null;
  }
  function alertV(v) {
    say(v, '!', 1.1, true);
    v.hopV = 120; v.hop = 0.01;
    sfx('alert');
  }
  function startChase(v, it) {
    v.state = 'chase'; v.target = it; v.lostT = 0; v.path = null; v.repathT = 0;
    v.lastSeen = { x: player.x, y: player.y };
    v.stateT = 7;
    alertV(v);
  }

  function villagerPick(v, it) {
    Object.assign(it, { held: true, heldBy: v, air: false, planted: false, ghost: false, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, floating: false });
    v.held = it; v.target = it; v.state = 'return'; v.path = null;
  }
  function villagerDrop(v) {
    const it = v.held;
    if (!it) return null;
    v.held = null;
    it.held = false; it.heldBy = null;
    let x = v.x + DIRV[v.dir][0] * 10, y = v.y + DIRV[v.dir][1] * 6 + 2;
    if (itemBlocked(it, x, y)) { x = v.x; y = v.y + 1; }
    it.droppedAt = time;
    Object.assign(it, { x, y, z: 12, air: true, ghost: true, vz: 120, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 50, spin: (Math.random() - 0.5) * 10 });
    return it;
  }
  function placeHome(v, it) {
    const h = it.home;
    v.held = null;
    Object.assign(it, { held: false, heldBy: null, x: h.x, y: h.y, z: h.z, planted: h.planted, air: false, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, ghost: true });
    say(v, rpick(['There.', 'Back where you belong.', 'Honestly!']));
    toRoute(v);
  }

  // Startle: hop, shout, drop whatever they're carrying. `after` = what to do next.
  function startleV(v, text, after) {
    if (v.startleCD > 0 || v.state === 'startled') return false;
    v.startleCD = 1.2;
    v.hopV = 170; v.hop = 0.01;
    say(v, text, 1.1);
    const dropped = villagerDrop(v);
    if (dropped && v.id === 'bertram') completeTask('bertdrop');
    v.after = after || (dropped ? { state: 'fetch', target: dropped } : { state: v.state, target: v.target });
    v.state = 'startled'; v.stateT = 0.75; v.path = null;
    return true;
  }
  function afterStartle(v) {
    const a = v.after || { state: 'route' };
    v.after = null; v.path = null;
    v.target = a.target || null;
    v.state = a.state === 'act' ? 'route' : a.state;
    if (v.state === 'fetch') v.stateT = 15;
    if (v.state === 'chase') {
      v.lostT = 0; v.lastSeen = { x: player.x, y: player.y };
      if (!v.target) { v.stateT = 6; say(v, rpick(['Hey, you!', 'Why I oughta...']), 1.6); sfx('alert'); }
    }
  }

  function catchPlayer(v) {
    const it = v.target;
    const dx = player.x - v.x, dy = player.y - v.y, d = Math.hypot(dx, dy) || 1;
    player.vx = dx / d * 240; player.vy = dy / d * 240; player.stun = 0.4;
    player.hopV = 100; player.hop = 0.01;
    sfx('snatch');
    if (lvl('slip') && Math.random() < 0.34) { // Slippery upgrade
      say(v, 'Slippery little...!');
      player.bubble = { text: 'wriggle!', t: 1 };
      toRoute(v); v.cooldown = 2.5;
      return;
    }
    addStrike();
    if (it && player.held === it) {
      player.held = null;
      Object.assign(it, { held: true, heldBy: v });
      v.held = it; v.state = 'return'; v.path = null; v.cooldown = 1.5;
      say(v, rpick(['Gimme that!', 'Mine, you rascal!', 'Got you!']));
    } else {
      say(v, rpick(['Scram!', 'Shoo! Shoo!', 'Go on, git!']));
      toRoute(v); v.cooldown = 3;
    }
  }

  function playBall(v, stop, dt) {
    const ball = ownedKind(v, 'ball');
    if (!ball || ball.held || ball.floating || Math.hypot(ball.x - stop.wx, ball.y - stop.wy) > 220) return;
    const d = Math.hypot(ball.x - v.x, ball.y - v.y);
    if (d > 10) {
      if (lineClear(v.x, v.y, ball.x, ball.y)) { moveToward(v, ball.x, ball.y, v.speed * 1.3, dt); v.path = null; }
      else {
        v.repathT -= dt;
        if (!v.path || v.repathT <= 0) { v.path = findPath(v.x, v.y, ball.x, ball.y) || []; v.repathT = 1; }
        followPath(v, v.speed * 1.3, dt);
      }
    } else if (v.kickCD <= 0 && ball.z < 4) {
      v.kickCD = 1.2;
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2;
        const lx = ball.x + Math.cos(a) * 90, ly = ball.y + Math.sin(a) * 60;
        if (tileAt(lx, ly) === WATER || Math.hypot(lx - stop.wx, ly - stop.wy) > 170 || navBlockedPt(lx, ly)) continue;
        Object.assign(ball, { vx: Math.cos(a) * 150, vy: Math.sin(a) * 110, vz: 90, air: true, spin: 0, kicker: v });
        sfx('bounce');
        break;
      }
    }
  }

  function routine(v, dt) {
    const stop = v.stops[v.stopIdx];
    if (v.state === 'route') {
      if (travel(v, stop.wx, stop.wy, v.speed, dt)) {
        v.path = null; v.state = 'act'; v.actT = stop.dur; v.dir = stop.face || v.dir;
        v.lineT = 1 + Math.random() * 2; v.searching = false;
        if (stop.needs) {
          const it = ownedKind(v, stop.needs);
          if (!it || it.held || displaced(it)) {
            say(v, `Where's my ${ITEM[stop.needs].name}?!`); v.searching = true;
            if (v.id === 'rosa' && stop.needs === 'pie') completeTask('picnic');
          }
        }
      }
      return;
    }
    v.actT -= dt;
    if (v.searching) {
      v.lookT -= dt;
      if (v.lookT <= 0) { v.lookT = 0.7; v.dir = rpick(['left', 'right', 'up', 'down']); }
    } else if (stop.act === 'play') {
      playBall(v, stop, dt);
    } else {
      v.lineT -= dt;
      if (v.lineT <= 0) {
        v.lineT = 5 + Math.random() * 6;
        const ls = v.lines[stop.act] || (stop.act === 'home' ? HOME_LINES : null);
        if (ls && Math.random() < 0.6) say(v, rpick(ls));
      }
    }
    if (v.actT <= 0) { v.stopIdx = (v.stopIdx + 1) % v.stops.length; toRoute(v); }
  }

  // Notice your own things lying around in the wrong place
  function tidyScan(v, dt) {
    v.tidyT -= dt;
    if (v.tidyT > 0 || v.held) return;
    v.tidyT = 0.5;
    for (const it of items) {
      if (it.owner !== v.id || it.held || it.air || it.floating || !displaced(it) || inHideout(it)) continue;
      if (canSee(v, it.x, it.y - 4)) {
        v.state = 'fetch'; v.target = it; v.path = null; v.stateT = 15;
        say(v, rpick(['Hm?', 'How did that get there?', 'Oh, for goodness sake.']));
        return;
      }
    }
  }

  function fetchItem(v, dt, sees) {
    const it = v.target;
    v.stateT -= dt;
    if (!it || !items.includes(it)) { sulk(v, 'Oh no...'); return; }
    if (it.held) {
      if (it.heldBy === v) { v.state = 'return'; return; }
      if (!it.heldBy && sees) { startChase(v, it); return; }
      if (!it.heldBy) { sulk(v, 'Thief!'); return; }
      toRoute(v); return;
    }
    if (it.floating) { sulk(v, 'Hmph! In the pond?!'); return; }
    if (inHideout(it)) { sulk(v, 'Not in that smelly log...'); return; }
    if (v.stateT <= 0) { sulk(v, 'I give up.'); return; }
    const d = Math.hypot(it.x - v.x, it.y - v.y);
    if (d < 14 && !it.air) { villagerPick(v, it); return; }
    const sp = v.speed * 1.3;
    if (areaOf(v.x, v.y) === areaOf(it.x, it.y) && lineClear(v.x, v.y, it.x, it.y)) { moveToward(v, it.x, it.y, sp, dt); v.path = null; return; }
    v.repathT -= dt;
    if (v.repathT <= 0) { v.path = null; v.repathT = 0.8; } // the item may have moved
    if (travel(v, it.x, it.y, sp, dt) && Math.hypot(it.x - v.x, it.y - v.y) < 34 && !it.air) villagerPick(v, it);
  }

  function returnHome(v, dt) {
    const it = v.held;
    if (!it) { toRoute(v); return; }
    if (travel(v, it.home.x, it.home.y, v.speed, dt)) placeHome(v, it);
  }

  function chase(v, dt, sees) {
    const it = v.target;
    if (it) {
      if (player.held !== it) { // the raccoon let go of it
        if (!items.includes(it)) { sulk(v, `My ${it.type.name}!`); return; }
        if (it.floating) { sulk(v, 'Hmph! In the pond?!'); return; }
        if (it.held) { toRoute(v); return; }
        v.state = 'fetch'; v.stateT = 15; v.path = null; return;
      }
    } else {
      v.stateT -= dt;
      if (v.stateT <= 0) { sulk(v, 'And stay out!'); v.cooldown = 2; return; }
    }
    if (sees) { v.lostT = 0; v.lastSeen = { x: player.x, y: player.y }; } else v.lostT += dt;
    if (playerInHideout()) { // nobody follows a raccoon into its den
      if (it && player.held === it) completeTask('escape');
      sulk(v, rpick(['Rotten raccoon!', "I'm not going in there."])); v.cooldown = 3; return;
    }
    if (v.lostT > 3) {
      if (player.hidden) { completeTask('bushescape'); say(v, rpick(['Where did it go?', 'Must have been the wind...']), 2); }
      if (it && player.held === it) completeTask('escape');
      if (!player.hidden) sulk(v, it ? 'Thief!' : 'Hmph.');
      else { v.state = 'sulk'; v.stateT = 2.2; v.target = null; v.path = null; } // already said "Where did it go?"
      v.cooldown = 2.5; return;
    }
    const d = Math.hypot(player.x - v.x, player.y - v.y);
    if (d < 15) { catchPlayer(v); return; }
    if (sees && lineClear(v.x, v.y, player.x, player.y)) { moveToward(v, player.x, player.y, v.chase, dt); v.path = null; return; }
    v.repathT -= dt;
    if (!v.path || v.repathT <= 0) { v.path = findPath(v.x, v.y, v.lastSeen.x, v.lastSeen.y) || []; v.repathT = 0.4; }
    followPath(v, v.chase, dt);
  }

  function updateVillagers(dt) {
    for (const v of villagers) {
      v.moving = false;
      v.cooldown = Math.max(0, v.cooldown - dt);
      v.startleCD = Math.max(0, v.startleCD - dt);
      v.kickCD -= dt;
      if (v.bubble) { v.bubble.t -= dt; if (v.bubble.t <= 0) v.bubble = null; }
      if (v.hop > 0 || v.hopV) { v.hopV -= 600 * dt; v.hop += v.hopV * dt; if (v.hop <= 0) { v.hop = 0; v.hopV = 0; } }

      const sees = started && canSeePlayer(v);
      const ph = player.held;
      if (ph && ph.owner === v.id && sees && !playerInHideout() && v.cooldown <= 0 && !v.held && v.state !== 'chase' && v.state !== 'startled') startChase(v, ph);

      switch (v.state) {
        case 'route': case 'act': routine(v, dt); if (started) tidyScan(v, dt); break;
        case 'chase': chase(v, dt, sees); break;
        case 'fetch': fetchItem(v, dt, sees); break;
        case 'return': returnHome(v, dt); break;
        case 'sulk': v.stateT -= dt; if (v.stateT <= 0) toRoute(v); break;
        case 'startled': v.stateT -= dt; if (v.stateT <= 0) afterStartle(v); break;
      }

      // Villagers are solid: nudge the raccoon out of the way
      const dx = player.x - v.x, dy = player.y - v.y, d = Math.hypot(dx, dy);
      if (d < 12 && d > 0.01) {
        const push = 12 - d;
        const nx = player.x + dx / d * push, ny = player.y + dy / d * push;
        if (!collides(nx, player.y)) player.x = nx;
        if (!collides(player.x, ny)) player.y = ny;
      }
    }
  }

  // Villager rendering -----------------------------------------------------------
  function heldPosV(v) {
    const it = v.held, s = v.scale;
    if (it.type.heavy) return { x: v.x, y: v.y, z: 38 * s + v.hop };
    const z = 11 * s + v.hop;
    switch (v.dir) {
      case 'right': return { x: v.x + 8 * s, y: v.y + 0.5, z };
      case 'left': return { x: v.x - 8 * s, y: v.y + 0.5, z };
      case 'up': return { x: v.x, y: v.y - 1, z: z + 2 };
      default: return { x: v.x, y: v.y + 1, z };
    }
  }

  function drawVillager(ctx, v, t) {
    const moving = v.moving;
    const bob = moving ? Math.abs(Math.sin(v.walk)) * 1.5 : Math.sin(t * 2 + v.seed) * 0.4;
    const acting = v.state === 'act' && !v.searching;
    const stop = v.stops[v.stopIdx];
    const bend = acting && (stop.act === 'tend' || stop.act === 'water' || stop.act === 'tidy' || stop.act === 'deliver') ? (Math.sin(t * 3 + v.seed) * 0.5 + 0.5) * 2.5 : 0;
    const carrying = !!v.held;
    const alarmed = v.bubble && v.bubble.alert;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.fillStyle = 'rgba(20,30,10,0.28)';
    ellipse(ctx, 0, 0, 9 * v.scale, 3.5 * v.scale);
    ctx.translate(0, -v.hop);
    ctx.scale(v.scale, v.scale);
    const side = v.dir === 'left' || v.dir === 'right';
    if (v.dir === 'left') ctx.scale(-1, 1);
    const sw = moving ? Math.sin(v.walk) * 3 : 0;

    // legs + shoes
    if (side) {
      ctx.fillStyle = v.pants;
      roundRect(ctx, -3 - sw, -10, 4, 10, 2, true);
      roundRect(ctx, -1 + sw, -10, 4, 10, 2, true);
      ctx.fillStyle = '#3a2a1a';
      ellipse(ctx, -0.5 - sw, -0.8, 3, 1.4); ellipse(ctx, 1.5 + sw, -0.8, 3, 1.4);
    } else {
      const l1 = moving ? Math.max(0, Math.sin(v.walk)) * 2 : 0, l2 = moving ? Math.max(0, -Math.sin(v.walk)) * 2 : 0;
      ctx.fillStyle = v.pants;
      roundRect(ctx, -5, -10, 4, 10 - l1, 2, true);
      roundRect(ctx, 1, -10, 4, 10 - l2, 2, true);
      ctx.fillStyle = '#3a2a1a';
      ellipse(ctx, -3, -0.8 - l1, 2.6, 1.4); ellipse(ctx, 3, -0.8 - l2, 2.6, 1.4);
    }

    ctx.translate(side ? bend * 0.6 : 0, -bob + bend * 0.4);
    // body
    ctx.fillStyle = v.shirt;
    if (v.dress) { poly(ctx, [[-6, -23], [6, -23], [8.5, -7], [-8.5, -7]]); ctx.fill(); }
    else roundRect(ctx, -7, -23, 14, 15, 4, true);
    if (v.stripes) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-7, -19, 14, 2); ctx.fillRect(-7, -14, 14, 2); }
    if (v.bag) { // postbag strap + satchel
      ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(5, -11); ctx.stroke();
      ctx.fillStyle = '#8a5a32'; roundRect(ctx, side ? -9 : 3, -14, 8, 7, 2, true);
    }
    if (acting && stop.act === 'fish') { // rod out over the water
      ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.6;
      const fx = side ? 26 : 10, fy = v.dir === 'up' ? -40 : v.dir === 'down' ? -6 : -30;
      ctx.beginPath(); ctx.moveTo(side ? 6 : 6, -16); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 2, fy + 18 + Math.sin(t * 2) * 2); ctx.stroke();
    }
    if (acting && stop.act === 'knit') { // needles and a little scarf
      ctx.fillStyle = '#d94f7a'; roundRect(ctx, -5, -14 + Math.sin(t * 6) * 0.5, 10, 5, 2, true);
      ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-6, -17); ctx.lineTo(1, -11); ctx.moveTo(6, -17); ctx.lineTo(-1, -11); ctx.stroke();
    }
    if (v.apron && v.dir !== 'up') { ctx.fillStyle = '#f4f2ee'; roundRect(ctx, side ? 0 : -5, -20, side ? 7 : 10, 13, 2, true); }

    // arms
    const armCol = v.shirt;
    if (side) {
      ctx.fillStyle = armCol;
      if (carrying) { roundRect(ctx, -1, -20, 10, 4, 2, true); ctx.fillStyle = v.skin; circle(ctx, 9, -18, 2.2); }
      else { roundRect(ctx, -2 - sw * 0.8, -21, 4, 12, 2, true); ctx.fillStyle = v.skin; circle(ctx, -sw * 0.8, -9, 2.2); }
    } else if (v.dir === 'down') {
      ctx.fillStyle = armCol;
      if (carrying) { roundRect(ctx, -9.5, -21, 3.5, 8, 2, true); roundRect(ctx, 6, -21, 3.5, 8, 2, true); ctx.fillStyle = v.skin; circle(ctx, -5, -14, 2.2); circle(ctx, 5, -14, 2.2); }
      else { roundRect(ctx, -9.5, -21 + sw * 0.3, 3.5, 12, 2, true); roundRect(ctx, 6, -21 - sw * 0.3, 3.5, 12, 2, true); ctx.fillStyle = v.skin; circle(ctx, -7.8, -9 + sw * 0.3, 2.2); circle(ctx, 7.8, -9 - sw * 0.3, 2.2); }
    } else {
      ctx.fillStyle = armCol;
      roundRect(ctx, -9.5, -21, 3.5, carrying ? 8 : 12, 2, true); roundRect(ctx, 6, -21, 3.5, carrying ? 8 : 12, 2, true);
    }

    // head
    ctx.translate(side ? bend * 0.6 : 0, bend * 0.5);
    const hy = -29;
    ctx.fillStyle = v.skin; circle(ctx, 0, hy, 7);
    ctx.fillStyle = v.hair;
    if (v.dir === 'up') {
      circle(ctx, 0, hy, 7.3);
    } else if (side) {
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.arc(0, hy, 7.3, Math.PI * 0.62, Math.PI * 1.85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b2d33'; circle(ctx, 3.6, hy + 0.5, alarmed ? 1.4 : 1);
      ctx.fillStyle = v.skin; circle(ctx, 7, hy + 1.8, 1.6);
    } else {
      ctx.beginPath(); ctx.arc(0, hy, 7.3, Math.PI, Math.PI * 2); ctx.fill();
      ellipse(ctx, -3, hy - 2.5, 4, 2.2); ellipse(ctx, 3.5, hy - 3, 3.5, 2);
      ctx.fillStyle = '#2b2d33';
      const er = alarmed ? 1.5 : 1;
      circle(ctx, -2.6, hy + 1, er); circle(ctx, 2.6, hy + 1, er);
      ctx.fillStyle = 'rgba(230,120,120,0.35)'; circle(ctx, -4.4, hy + 3.2, 1.4); circle(ctx, 4.4, hy + 3.2, 1.4);
      ctx.fillStyle = '#7a3a2a';
      if (alarmed || v.state === 'chase') circle(ctx, 0, hy + 4.2, 1.3);
      else ctx.fillRect(-1.2, hy + 4, 2.4, 0.9);
    }
    // face extras
    if (v.beard && v.dir !== 'up') {
      ctx.fillStyle = v.hair;
      if (side) { ctx.beginPath(); ctx.ellipse(3, hy + 4, 4, 3.5, 0.3, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(0, hy + 4.5, 5.5, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    if (v.glasses && v.dir !== 'up') {
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.8;
      if (side) { ctx.beginPath(); ctx.arc(3.6, hy + 0.5, 2, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(-2.6, hy + 1, 2, 0, Math.PI * 2); ctx.moveTo(4.6, hy + 1); ctx.arc(2.6, hy + 1, 2, 0, Math.PI * 2); ctx.stroke(); }
    }
    // headwear
    switch (v.hat) {
      case 'straw':
        ctx.fillStyle = '#e6c56a'; ellipse(ctx, 0, hy - 4, 11, 3.6);
        ctx.fillStyle = '#d9b552'; roundRect(ctx, -5, hy - 11, 10, 7, 3, true);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-5, hy - 6.5, 10, 1.5);
        break;
      case 'cap':
        ctx.fillStyle = v.capColor || '#2e6da4';
        ctx.beginPath(); ctx.arc(0, hy - 1, 7.5, Math.PI, Math.PI * 2); ctx.fill();
        if (v.dir === 'down') ellipse(ctx, 0, hy - 1, 7.5, 2.2);
        else if (side) ellipse(ctx, 6, hy - 1.5, 5, 1.8);
        break;
      case 'beanie':
        ctx.fillStyle = v.capColor || '#c0392b';
        ctx.beginPath(); ctx.arc(0, hy - 1.5, 7.6, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(v.capColor || '#c0392b', -0.2); ctx.fillRect(-7.6, hy - 3, 15.2, 3);
        circle(ctx, 0, hy - 9.5, 2);
        break;
      case 'bun':
        ctx.fillStyle = v.hair; circle(ctx, side ? -2 : 0, hy - 8, 3.6);
        break;
      case 'scarf':
        ctx.fillStyle = '#d9a43a';
        ctx.beginPath(); ctx.arc(0, hy - 0.5, 7.6, Math.PI, Math.PI * 2); ctx.fill();
        if (side) circle(ctx, -7, hy + 1, 2.2);
        if (v.dir === 'up') { circle(ctx, 0, hy + 5, 2.2); }
        break;
    }
    ctx.restore();
  }

  function drawVillagerWithHeld(ctx, v, t) {
    const it = v.held;
    if (!it) { drawVillager(ctx, v, t); return; }
    const behind = !it.type.heavy && v.dir === 'up';
    const drawIt = () => { ctx.save(); ctx.translate(it.x, it.y - it.z); it.type.draw(ctx, it, t); ctx.restore(); };
    if (behind) drawIt();
    drawVillager(ctx, v, t);
    if (!behind) drawIt();
  }

  // ---------------------------------------------------------------------------
  // The raccoon's hideout (a hollow log at the forest edge) — a safe zone
  // ---------------------------------------------------------------------------
  let HIDEOUT = { x: 4.8 * TILE, y: 23.8 * TILE, rx: 50, ry: 28 }; // set by buildMap
  function inHideoutPt(x, y) {
    const dx = (x - HIDEOUT.x) / HIDEOUT.rx, dy = (y - HIDEOUT.y) / HIDEOUT.ry;
    return dx * dx + dy * dy <= 1;
  }
  const inHideout = (it) => !it.held && !it.air && inHideoutPt(it.x, it.y);
  const playerInHideout = () => inHideoutPt(player.x, player.y - 4);

  function drawHideoutZone(ctx, t) {
    // Dashed ring when you're carrying something nearby: "drop it here"
    if (!player.held || Math.hypot(player.x - HIDEOUT.x, player.y - HIDEOUT.y) > 160) return;
    ctx.save();
    ctx.strokeStyle = `rgba(255,181,71,${0.55 + Math.sin(t * 4) * 0.25})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.ellipse(HIDEOUT.x, HIDEOUT.y, HIDEOUT.rx, HIDEOUT.ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Mischief to-do list: a pool of tasks; each run (a "day") draws a hand
  // ---------------------------------------------------------------------------
  const TASK_POOL = [
    { id: 'carrot', tier: 'Easy', text: 'Pull up a carrot' },
    { id: 'pie', tier: 'Easy', text: "Steal Rosa's pie" },
    { id: 'jump', tier: 'Easy', text: 'Make someone jump' },
    { id: 'kick', tier: 'Easy', text: "Kick Toby's ball" },
    { id: 'splash', tier: 'Easy', text: 'Throw something in the pond' },
    { id: 'paper', tier: 'Easy', text: 'Swipe a newspaper' },
    { id: 'gnome', tier: 'Easy', text: 'Kidnap a garden gnome' },
    { id: 'lift', tier: 'Easy', text: 'Lift something heavy' },
    { id: 'burgle', tier: 'Easy', text: "Sneak into someone's house" },
    { id: 'hide', tier: 'Easy', text: 'Hide in a bush' },
    { id: 'pet', tier: 'Easy', text: 'Pet Biscuit the dog' },
    { id: 'bed', tier: 'Easy', text: 'Hide under a bed' },
    { id: 'petcat', tier: 'Easy', text: 'Get a purr out of Marmalade the cat' },
    { id: 'parcel', tier: 'Easy', text: "Swipe one of Percy's parcels" },
    { id: 'ballpond', tier: 'Medium', text: "Get Toby's ball into the pond" },
    { id: 'bonk', tier: 'Medium', text: 'Bonk Mrs. Fennick' },
    { id: 'bertdrop', tier: 'Medium', text: "Make Bertram drop what he's carrying" },
    { id: 'escape', tier: 'Medium', text: 'Escape a chase' },
    { id: 'crops5', tier: 'Medium', text: 'Pull up 5 crops', goal: 5 },
    { id: 'duck', tier: 'Medium', text: "Set Toby's duck afloat" },
    { id: 'boot', tier: 'Medium', text: 'Give Rosa the boot', hint: 'hit her with the old boot' },
    { id: 'heavythrow', tier: 'Medium', text: 'Throw a crate or barrel' },
    { id: 'heist', tier: 'Medium', text: 'Carry something out of a house' },
    { id: 'bushescape', tier: 'Medium', text: 'Shake off a chaser by hiding in a bush' },
    { id: 'fetch', tier: 'Medium', text: 'Get Biscuit to fetch something you threw' },
    { id: 'outrun', tier: 'Medium', text: 'Outrun Biscuit' },
    { id: 'smash', tier: 'Medium', text: 'Smash something fragile' },
    { id: 'catswat', tier: 'Medium', text: 'Watch Marmalade knock something off a table' },
    { id: 'cake', tier: 'Medium', text: "Pinch Rosa's cake", hint: "it's on her kitchen table" },
    { id: 'rod', tier: 'Medium', text: "Steal Ollie's fishing rod" },
    { id: 'stash3', tier: 'Medium', text: 'Stash 3 things in your hideout', goal: 3, group: 'stash' },
    { id: 'picnic', tier: 'Hard', text: 'Ruin the picnic' },
    { id: 'hat', tier: 'Hard', text: 'Steal the hat from under her nose' },
    { id: 'double', tier: 'Hard', text: 'Get chased by two villagers at once' },
    { id: 'garden', tier: 'Hard', text: 'Empty the garden' },
    { id: 'stash5', tier: 'Hard', text: 'Stash 5 things in your hideout', goal: 5, group: 'stash' },
    { id: 'sink3', tier: 'Hard', text: 'Sink 3 things in the pond', goal: 3 },
    { id: 'snatchback', tier: 'Hard', text: 'Steal something back from a villager' },
    { id: 'gnomes', tier: 'Hard', text: 'Stash both garden gnomes' },
    { id: 'bone', tier: 'Hard', text: "Stash Biscuit's bone in your hideout" },
    { id: 'bedhome', tier: 'Hard', text: "Hide under a bed while someone's home" },
    { id: 'catdog', tier: 'Hard', text: 'Get Biscuit to chase Marmalade', hint: 'chitter to herd her' },
    { id: 'yarn', tier: 'Hard', text: "Take Granny Mabel's yarn while she knits" },
    { id: 'tour', tier: 'Hard', text: 'Sneak into 4 different houses', goal: 4 },
    { id: 'feast', tier: 'Final', final: true, text: 'Have a feast', hint: 'pie, sandwich and an apple in your hideout' },
    { id: 'loot8', tier: 'Final', final: true, text: 'Fill the den', hint: '8 things in your hideout', goal: 8, group: 'stash' },
    { id: 'everyone', tier: 'Final', final: true, text: 'Rob the whole village', hint: 'things from 5 different villagers in your hideout', goal: 5 },
  ];
  const TASK_BY_ID = Object.fromEntries(TASK_POOL.map((t) => [t.id, t]));
  const SHINIES = { Easy: 1, Medium: 2, Hard: 3, Final: 5 };

  const run = {
    day: 1, seed: 0, tasks: [], taskSet: new Set(), done: new Set(), progress: {}, cropPulls: 0, sunk: 0,
    timeLeft: 360, timeTotal: 360, strikes: 0, maxStrikes: 3, earned: 0, over: false, ended: false,
    startedAt: 0, checkT: 0, vision: 170, villagerSpeed: 1, shake: 0,
  };
  const tasks = run; // older code refers to the to-do state as `tasks`
  let paused = true;  // true while any overlay (title, day card, results, den) is up

  // Meta-progression, kept in this browser between visits ---------------------
  const SAVE_KEY = 'mischief-lane-save-v1';
  const save = { shinies: 0, up: {}, day: 1, bestDay: 0, runs: 0 };
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && typeof s === 'object') Object.assign(save, s, { up: { ...(s.up || {}) } });
    } catch (_) { /* no storage: start fresh */ }
  }
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* no storage */ } }
  const lvl = (id) => save.up[id] || 0;

  const UPGRADES = [
    { id: 'paws', name: 'Quick Paws', desc: 'Run 12% faster per level.', costs: [3, 6, 10] },
    { id: 'back', name: 'Strong Back', desc: 'Carry crates and barrels faster.', costs: [4, 8] },
    { id: 'step', name: 'Light Step', desc: 'Villagers spot you from 15% less far per level.', costs: [4, 8] },
    { id: 'chitter', name: 'Big Chitter', desc: 'Startle villagers from farther away.', costs: [3, 6] },
    { id: 'fur', name: 'Thick Fur', desc: 'One more strike before you’re out.', costs: [5, 10] },
    { id: 'day', name: 'Long Day', desc: 'One more minute before sunset per level.', costs: [3, 6] },
    { id: 'slip', name: 'Slippery', desc: '1 in 3 chance to wriggle free when caught.', costs: [8] },
    { id: 'treats', name: 'Dog Treats', desc: 'Biscuit starts each day as your friend.', costs: [5] },
  ];
  const runSpeed = () => RUN_SPEED * (1 + 0.12 * lvl('paws'));
  const heavyMult = () => [0.62, 0.8, 0.95][lvl('back')];
  const chitterRadius = () => 95 * (1 + 0.35 * lvl('chitter'));

  function setupRun(day) {
    Object.assign(run, { day, visited: new Set(), done: new Set(), progress: {}, cropPulls: 0, sunk: 0, strikes: 0, earned: 0, over: false, ended: false, checkT: 0, shake: 0 });
    run.maxStrikes = 3 + lvl('fur');
    run.timeTotal = Math.min(540, 360 + 30 * (day - 1)) + 60 * lvl('day');
    run.timeLeft = run.timeTotal;
    run.villagerSpeed = Math.min(1.4, 1 + 0.06 * (day - 1));
    run.vision = 170 * Math.min(1.35, 1 + 0.06 * (day - 1)) * (1 - 0.15 * lvl('step'));
    // Draw the hand of tasks: harder days ask for more
    const counts = { Easy: 3, Medium: Math.min(4, 2 + Math.floor((day - 1) / 2)), Hard: Math.min(3, 1 + Math.floor(day / 3)) };
    const groups = new Set();
    const chosen = [];
    const finale = rpick(TASK_POOL.filter((t) => t.final));
    if (finale.group) groups.add(finale.group);
    for (const tier of ['Easy', 'Medium', 'Hard']) {
      let n = counts[tier];
      const pool = TASK_POOL.filter((t) => t.tier === tier).sort(() => Math.random() - 0.5);
      for (const t of pool) {
        if (n <= 0) break;
        if (t.group && groups.has(t.group)) continue;
        if (t.group) groups.add(t.group);
        chosen.push(t); n--;
      }
    }
    chosen.push(finale);
    run.tasks = chosen;
    run.taskSet = new Set(chosen.map((t) => t.id));
  }

  const regularTasksDone = () => run.tasks.every((t) => t.final || run.done.has(t.id));

  function completeTask(id) {
    const task = TASK_BY_ID[id];
    if (!started || paused || run.over || !task || !run.taskSet.has(id) || run.done.has(id)) return;
    if (task.final && !regularTasksDone()) return;
    run.done.add(id);
    run.progress[id] = task.goal;
    const earn = SHINIES[task.tier];
    run.earned += earn;
    sfx(task.final ? 'fanfare' : 'ding');
    toast(task.text, `${task.final ? 'Finale!' : 'Done!'} +${earn} ✦`);
    for (let k = 0; k < 3; k++) sparkle(player.x + rr(-10, 10), player.y, 20 + k * 6);
    renderTodo(id);
    updateRunBar();
    if (run.done.size === run.tasks.length) {
      run.over = true;
      setTimeout(() => endRun('win'), 1600);
    } else if (!task.final && regularTasksDone()) {
      const fin = run.tasks.find((t) => t.final);
      setTimeout(() => { sfx('fanfare'); toast(fin.text, 'Finale unlocked!'); renderTodo(); }, 1600);
    }
  }
  function setProgress(id, n) {
    const task = TASK_BY_ID[id];
    if (!run.taskSet.has(id) || run.done.has(id) || run.progress[id] === n) return;
    run.progress[id] = Math.min(n, task.goal);
    renderTodo();
    if (n >= task.goal) completeTask(id);
  }

  // Conditions that are easier to poll than to catch as events
  function checkTasks(dt) {
    run.checkT -= dt;
    if (run.checkT > 0 || !started) return;
    run.checkT = 0.25;
    if (villagers.filter((v) => v.state === 'chase').length >= 2) completeTask('double');
    const crops = items.filter((it) => it.home && it.home.planted);
    if (crops.every((c) => !c.planted)) completeTask('garden');
    const stashed = items.filter(inHideout);
    for (const id of ['stash3', 'stash5', 'loot8']) setProgress(id, stashed.length);
    if (['pie', 'sandwich', 'apple'].every((k) => stashed.some((it) => it.kind === k))) completeTask('feast');
    if (stashed.some((it) => it.kind === 'bone')) completeTask('bone');
    const gnomes = items.filter((it) => it.kind === 'gnome');
    if (gnomes.length >= 2 && gnomes.every(inHideout)) completeTask('gnomes');
    setProgress('everyone', new Set(stashed.filter((it) => it.owner).map((it) => it.owner)).size);
  }

  // Getting caught ---------------------------------------------------------------
  function addStrike() {
    if (run.over) return;
    run.strikes++;
    run.shake = 0.4;
    updateRunBar();
    const left = run.maxStrikes - run.strikes;
    if (left <= 0) {
      run.over = true;
      toast('No strikes left', 'Caught!');
      setTimeout(() => endRun('caught'), 1200);
    } else {
      toast(`${left} strike${left === 1 ? '' : 's'} left`, 'Caught!');
    }
  }

  function endRun(reason) {
    if (run.ended) return;
    run.ended = true; run.over = true; paused = true;
    keys.clear();
    const win = reason === 'win';
    const timeBonus = win ? Math.floor(run.timeLeft / 30) : 0;
    const dayBonus = win ? run.day : 0;
    const total = run.earned + timeBonus + dayBonus;
    save.shinies += total;
    save.runs++;
    if (win) { save.bestDay = Math.max(save.bestDay, run.day); save.day = run.day + 1; } else save.day = 1;
    writeSave();
    sfx(win ? 'fanfare' : 'hmph');

    const titles = { win: `Day ${run.day} done!`, caught: 'Caught red-pawed!', sunset: 'Sunset!' };
    const subs = {
      win: `${L.name} has been thoroughly ransacked.`,
      caught: 'The villagers have had quite enough of you for one day.',
      sunset: 'The villagers lock their doors for the night.',
    };
    document.getElementById('res-title').textContent = titles[reason];
    document.getElementById('res-sub').textContent = subs[reason];
    const rows = [
      ['Tasks done', `${run.done.size} / ${run.tasks.length}`],
      ['Shinies from tasks', `+${run.earned}`],
    ];
    if (win) rows.push(['Time left bonus', `+${timeBonus}`], [`Day ${run.day} bonus`, `+${dayBonus}`]);
    rows.push(['Shinies earned', `+${total} ✦`]);
    const dl = document.getElementById('res-stats');
    dl.innerHTML = '';
    rows.forEach(([k, v], i) => {
      const row = document.createElement('div');
      row.className = i === rows.length - 1 ? 'row total' : 'row';
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      row.append(dt, dd); dl.appendChild(row);
    });
    document.getElementById('res-next').textContent = win
      ? `Next: Day ${run.day + 1}. More tasks, sharper villagers.`
      : 'Your streak goes back to Day 1. Upgrades you’ve bought stay.';
    showOverlay('results');
  }

  // Overlays -------------------------------------------------------------------
  const OVERLAYS = ['runcard', 'results', 'den'];
  function showOverlay(id) {
    for (const o of OVERLAYS) document.getElementById(o).hidden = o !== id;
    document.getElementById('runbar').hidden = id !== null && id !== 'runcard';
    todoEl.hidden = id === 'den' || id === 'results';
    paused = id !== null;
    if (id) { const btn = document.querySelector(`#${id} .primary`); setTimeout(() => btn && btn.focus(), 50); }
  }

  function startDay() {
    setupRun(save.day);
    run.seed = (Math.random() * 2 ** 31) >>> 0;
    newVillage(run.seed);
    showRunCard();
  }
  function showRunCard() {
    buildTodo();
    updateRunBar();
    document.getElementById('rc-day').textContent = `Day ${run.day}`;
    document.getElementById('rc-town').textContent = L.name;
    const m = Math.floor(run.timeTotal / 60), s = run.timeTotal % 60;
    document.getElementById('rc-tasks').textContent = `${run.tasks.length} tasks`;
    document.getElementById('rc-time').textContent = `${m}:${String(s).padStart(2, '0')} until sunset`;
    document.getElementById('rc-strikes').textContent = `${run.maxStrikes} strikes`;
    showOverlay('runcard');
  }
  function goRun() {
    if (document.getElementById('runcard').hidden) return;
    keys.clear();
    run.startedAt = performance.now();
    showOverlay(null);
    document.getElementById('runbar').hidden = false;
  }
  document.getElementById('rc-go').addEventListener('click', goRun);
  document.getElementById('res-den').addEventListener('click', showDen);
  document.getElementById('den-go').addEventListener('click', startDay);

  function showDen() {
    renderDen();
    showOverlay('den');
  }
  function renderDen() {
    document.getElementById('den-shinies').textContent = save.shinies;
    document.getElementById('den-best').textContent = save.bestDay ? `Best: Day ${save.bestDay}` : 'No days finished yet';
    document.getElementById('den-go').textContent = `Start Day ${save.day}`;
    const list = document.getElementById('den-ups');
    list.innerHTML = '';
    for (const u of UPGRADES) {
      const l = lvl(u.id), max = u.costs.length, cost = u.costs[l];
      const li = document.createElement('li');
      li.className = 'up' + (l >= max ? ' maxed' : '');
      const pips = Array.from({ length: max }, (_, i) => `<span class="pip${i < l ? ' on' : ''}"></span>`).join('');
      li.innerHTML = `<div class="up-head"><span class="up-name"></span><span class="pips">${pips}</span></div><p class="up-desc"></p><button type="button" class="buy"></button>`;
      li.querySelector('.up-name').textContent = u.name;
      li.querySelector('.up-desc').textContent = u.desc;
      const b = li.querySelector('.buy');
      if (l >= max) { b.textContent = 'Maxed'; b.disabled = true; }
      else {
        b.textContent = `${cost} ✦`;
        b.disabled = save.shinies < cost;
        b.setAttribute('aria-label', `Buy ${u.name} for ${cost} shinies`);
        b.addEventListener('click', () => {
          if (save.shinies < cost) return;
          save.shinies -= cost;
          save.up[u.id] = l + 1;
          writeSave();
          audioInit(); sfx('ding');
          renderDen();
        });
      }
      list.appendChild(li);
    }
  }

  // Run bar (top of screen) -----------------------------------------------------
  const PAW_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="13.5" rx="5" ry="4.2"/><circle cx="4.2" cy="8" r="2.1"/><circle cx="8" cy="4.8" r="2.1"/><circle cx="12" cy="4.8" r="2.1"/><circle cx="15.8" cy="8" r="2.1"/></svg>';
  let lastBarSecond = -1;
  function updateRunBar() {
    document.getElementById('rb-day').textContent = `Day ${run.day}`;
    document.getElementById('rb-town').textContent = L ? L.name : '';
    document.getElementById('rb-shiny').textContent = save.shinies + run.earned;
    const st = document.getElementById('rb-strikes');
    st.innerHTML = '';
    for (let i = 0; i < run.maxStrikes; i++) {
      const s = document.createElement('span');
      s.className = 'paw' + (i < run.maxStrikes - run.strikes ? '' : ' lost');
      s.innerHTML = PAW_SVG;
      st.appendChild(s);
    }
    st.setAttribute('aria-label', `${run.maxStrikes - run.strikes} strikes left`);
    lastBarSecond = -1;
    updateTimer();
  }
  function updateTimer() {
    const secs = Math.max(0, Math.ceil(run.timeLeft));
    if (secs === lastBarSecond) return;
    lastBarSecond = secs;
    document.getElementById('rb-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const frac = run.timeLeft / run.timeTotal;
    const fill = document.getElementById('rb-fill');
    fill.style.width = `${Math.max(0, frac) * 100}%`;
    document.getElementById('runbar').classList.toggle('dusk', frac < 0.3);
  }

  // To-do notepad ----------------------------------------------------------------
  const todoEl = document.getElementById('todo');
  const todoList = document.getElementById('todo-list');
  const todoCount = document.getElementById('todo-count');
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;

  function buildTodo() {
    let tier = '';
    todoList.innerHTML = '';
    for (const task of run.tasks) {
      if (task.tier !== tier) {
        tier = task.tier;
        const h = document.createElement('li');
        h.className = 'tier';
        h.textContent = tier === 'Final' ? 'Finale' : tier;
        todoList.appendChild(h);
      }
      const li = document.createElement('li');
      li.className = 'task';
      li.dataset.id = task.id;
      li.innerHTML = '<span class="box"></span><span class="txt"></span><span class="prog"></span>' +
        '<svg class="scribble" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M1 6 C 15 2, 30 9, 48 5 S 80 2, 99 6"/></svg>';
      todoList.appendChild(li);
    }
    renderTodo();
  }
  function initTodoToggle() {
    let open = !isTouch && window.innerWidth > 700;
    try { const s = localStorage.getItem('mischief-todo-open'); if (s !== null) open = s === '1'; } catch (_) { /* no storage */ }
    setTodoOpen(open);
    document.getElementById('todo-toggle').addEventListener('click', (e) => { e.currentTarget.blur(); setTodoOpen(!todoEl.classList.contains('open')); });
  }
  function setTodoOpen(open) {
    todoEl.classList.toggle('open', open);
    document.getElementById('todo-toggle').setAttribute('aria-expanded', String(open));
    try { localStorage.setItem('mischief-todo-open', open ? '1' : '0'); } catch (_) { /* no storage */ }
  }
  function renderTodo(justDone) {
    const unlocked = regularTasksDone();
    for (const li of todoList.querySelectorAll('.task')) {
      const task = TASK_BY_ID[li.dataset.id];
      const done = run.done.has(task.id);
      const locked = task.final && !unlocked;
      li.classList.toggle('done', done);
      li.classList.toggle('locked', locked);
      li.classList.toggle('fresh', task.id === justDone);
      li.querySelector('.txt').textContent = locked ? 'Finish everything else first' : task.text + (task.hint && !done ? ` (${task.hint})` : '');
      li.querySelector('.prog').textContent = task.goal && !done && !locked ? `${run.progress[task.id] || 0}/${task.goal}` : '';
    }
    todoCount.textContent = `${run.done.size}/${run.tasks.length}`;
  }
  function toast(text, label) {
    toastEl.innerHTML = '';
    const l = document.createElement('span'); l.className = 'label'; l.textContent = label;
    const tx = document.createElement('span'); tx.className = 'what'; tx.textContent = text;
    toastEl.append(l, tx);
    toastEl.hidden = false;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  // Dusk: the world warms, then dims, as sunset nears
  function drawDusk(ctx, left, top, viewW, viewH) {
    if (!started || run.timeTotal <= 0) return;
    const p = 1 - run.timeLeft / run.timeTotal;
    if (p < 0.55) return;
    const k = Math.min(1, (p - 0.55) / 0.45);
    const mix = (a, b, t) => Math.round(a + (b - a) * t);
    let r, g, b;
    if (k < 0.6) { const t = k / 0.6; r = 255; g = mix(255, 196, t); b = mix(255, 150, t); }
    else { const t = (k - 0.6) / 0.4; r = mix(255, 170, t); g = mix(196, 140, t); b = mix(150, 200, t); }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(left - 10, top - 10, viewW + 20, viewH + 20);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Hiding bushes: walk into one and villagers can't see you (unless they walk
  // right into it). Heavy loads stick out, and running makes the leaves rustle.
  // ---------------------------------------------------------------------------
  function makeHideBush(x, y) {
    const r = rr(21, 25);
    const blobs = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + rr(-0.3, 0.3);
      return [Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.32, r * rr(0.5, 0.62)];
    });
    const flowers = rand() < 0.5 ? Array.from({ length: 5 }, () => [rr(-r * 0.7, r * 0.7), rr(-r * 1.3, -r * 0.4)]) : [];
    const o = {
      kind: 'hidebush', x, y, r, hitbox: null, rustle: 0,
      bounds: { l: x - r * 1.4, r: x + r * 1.4, t: y - r * 2, b: y + 8 },
      contains(px, py) { const dx = (px - x) / (r * 0.8), dy = (py - (y - 8)) / (r * 0.5); return dx * dx + dy * dy < 1; },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 6, y - 1, r * 1.15, r * 0.4); },
      draw(ctx, t) {
        const shake = o.rustle > 0 ? Math.sin(t * 40) * 1.6 * Math.min(1, o.rustle * 3) : 0;
        ctx.save(); ctx.translate(x + shake, y - r * 0.75);
        ctx.fillStyle = '#2a5e2a';
        for (const [bx, by, br] of blobs) circle(ctx, bx, by + 4, br);
        circle(ctx, 0, 2, r * 0.7);
        ctx.fillStyle = '#3c8034';
        for (const [bx, by, br] of blobs) circle(ctx, bx - 1, by - 1, br * 0.85);
        circle(ctx, 0, -2, r * 0.62);
        ctx.fillStyle = '#56a046';
        circle(ctx, -r * 0.3, -r * 0.32, r * 0.3); circle(ctx, r * 0.25, -r * 0.4, r * 0.2);
        ctx.fillStyle = '#ffe9f0';
        for (const [fx, fy] of flowers) circle(ctx, fx, fy + r * 0.75, 1.8);
        ctx.restore();
        // the raccoon peeking out
        if (player.hidden && player.hidingIn === o) {
          const ex = player.x, ey = player.y - 15 - (o.rustle > 0 ? 0 : Math.max(0, Math.sin(t * 1.3)) * 2);
          ctx.fillStyle = MASK; ellipse(ctx, ex, ey, 7, 2.8);
          ctx.fillStyle = '#ffffff'; circle(ctx, ex - 3, ey, 1.6); circle(ctx, ex + 3, ey, 1.6);
          ctx.fillStyle = NOSE; const look = Math.sin(t * 0.9) * 0.6; circle(ctx, ex - 3 + look, ey, 0.8); circle(ctx, ex + 3 + look, ey, 0.8);
        }
      },
    };
    return o;
  }

  // Scatter hiding bushes: tactical spots beside houses and the garden, then a few at random
  function placeHideBushes() {
    const spots = [];
    for (const h of L.houses) spots.push([h.x - 1.5, h.y + 1.5], [h.x + h.w + 1.5, h.y + 2]);
    const g = L.garden;
    spots.push([g.x - 2.5, g.y + 8], [g.x + 13.5, g.y + 6], [g.x + 5, g.gateTop ? g.y + 12.5 : g.y - 3]);
    const P = L.plaza;
    spots.push([P.x - 2.5, P.y + 3], [P.x + 14, P.y + 9], [P.x + 9, P.y - 2.5], [P.x + 2, P.y + 14]);
    let placed = 0;
    const tryAt = (tx, ty) => {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [2, 0], [-2, 0]]) {
        const x = Math.floor(tx + dx), y = Math.floor(ty + dy);
        let ok = true;
        for (let j = -1; j <= 0 && ok; j++) for (let i = -1; i <= 1; i++) {
          if (isUsed(x + i, y + j) || getT(x + i, y + j) !== GRASS) { ok = false; break; }
        }
        if (!ok) continue;
        reserve(x - 1, y - 1, 3, 2);
        objects.push(makeHideBush((x + 0.5) * TILE, (y + 0.85) * TILE));
        placed++;
        return true;
      }
      return false;
    };
    for (const s of shuffled(spots)) { if (placed >= 12) break; if (rand() < 0.8) tryAt(...s); }
    for (let n = 0; n < 60 && placed < 18; n++) tryAt(rr(5, MW - 5), rr(5, MH - 5));
  }

  function updateHiding(dt) {
    for (const o of hideBushes) o.rustle = Math.max(0, o.rustle - dt);
    const wasHidden = player.hidden;
    let bush = null;
    for (const o of hideBushes) if (o.contains(player.x, player.y)) { bush = o; break; }
    if (bush && player.speed > 20) bush.rustle = 0.3;
    if (bush && bush !== player.hidingIn) { sfx('rustle'); bush.rustle = 0.4; }
    player.hidingIn = bush;
    const heavy = player.held && player.held.type.heavy;
    player.hidden = !!bush && !heavy && player.speed < WALK_SPEED * 1.15;
    if (player.hidden && bush.kind === 'bed' && villagers.some((v) => areaOf(v.x, v.y) === areaOf(player.x, player.y))) completeTask('bedhome');
    if (player.hidden && !wasHidden) {
      completeTask(bush.kind === 'bed' ? 'bed' : 'hide');
      // Chasers who weren't right on top of you lose track in the leaves
      for (const v of villagers) {
        if (v.state === 'chase' && Math.hypot(v.x - player.x, v.y - player.y) > 60) {
          const a = Math.random() * Math.PI * 2;
          v.lastSeen = { x: player.x + Math.cos(a) * 70, y: player.y + Math.sin(a) * 50 };
          v.path = null;
        }
      }
    }
    const pill = document.getElementById('hidden-pill');
    const show = player.hidden && !paused;
    if (pill.hidden === show) pill.hidden = !show;
    if (bush && !player.hidden && !paused && heavy) pill.hidden = true;
  }
  // Villagers only spot a hidden raccoon if they're practically in the bush with it
  function canSeePlayer(v) {
    if (!canSee(v, player.x, player.y - 6)) return false;
    return !player.hidden || Math.hypot(v.x - player.x, v.y - player.y) < 20;
  }

  // ---------------------------------------------------------------------------
  // Biscuit, Bertram's dog. Sniffs you out (bushes don't help), barks so the
  // villagers look your way, and knocks things out of your mouth. Throw
  // something and he'll fetch it instead; pet him and he's your friend.
  // ---------------------------------------------------------------------------
  let dog = null;
  const DOG_LINES = { sniff: ['*sniff sniff*', '*snrf*'], happy: ['♥', '♥♥'], bark: ['Woof!', 'Woof woof!', 'Arf!'] };

  function makeDogBed(x, y) {
    return {
      kind: 'dogbed', x, y, hitbox: null,
      bounds: { l: x - 26, r: x + 26, t: y - 24, b: y + 6 },
      draw(ctx) {
        ctx.fillStyle = '#7a3e2c'; ellipse(ctx, x, y - 7, 18, 9);
        ctx.fillStyle = '#c0643a'; ellipse(ctx, x, y - 8, 14, 6.5);
        ctx.fillStyle = '#e8b0a0'; ellipse(ctx, x, y - 7, 10, 4);
        ctx.fillStyle = '#9aa3a8'; ellipse(ctx, x + 22, y - 3, 6, 3); // water bowl
        ctx.fillStyle = '#4f93c7'; ellipse(ctx, x + 22, y - 3.6, 4.2, 1.8);
        ctx.fillStyle = '#3a2a1a'; ctx.font = '800 6px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('BISCUIT', x, y + 4);
      },
    };
  }

  function spawnDog() {
    const h = L.houses[L.homes.bertram];
    let bx = (h.x - 1.3) * TILE, by = (h.y + h.h + 0.6) * TILE;
    if (navBlockedPt(bx, by - 6)) { const o = nearestOpen(Math.floor(bx / TILE), Math.floor(by / TILE)); if (o) { bx = (o[0] + 0.5) * TILE; by = (o[1] + 0.8) * TILE; } }
    objects.push(makeDogBed(bx, by));
    placeFree('bone', bx - 24, by + 10, { owner: 'biscuit' });
    dog = {
      x: bx, y: by + 4, dir: 'down', walk: 0, moving: false, hop: 0, hopV: 0, scale: 1,
      state: 'sit', t: 2, path: null, repathT: 0, target: null, held: null, bubble: null,
      bedX: bx, bedY: by, barkT: 0, calm: 0, friendly: lvl('treats') ? 75 : 0, chaseT: 0, sniffT: 3,
    };
  }

  function dogSay(text, t = 1.4) { dog.bubble = { text, t }; }
  function dogBark(lx = player.x, ly = player.y) {
    dogSay(rpick(DOG_LINES.bark), 1);
    dog.hopV = 90; dog.hop = 0.01;
    if (Math.hypot(dog.x - player.x, dog.y - player.y) < 420) sfx('bark');
    // Everyone nearby turns to look where Biscuit is barking
    lookTowards(lx, ly, 280, (v) => (v.id === 'bertram' ? 'What is it, Biscuit?' : rpick(['Hm? Biscuit?', "Who's there?", 'What was that?'])));
  }

  function heldPosDog() {
    const s = DIRV[dog.dir];
    if (dog.dir === 'up') return { x: dog.x, y: dog.y - 1, z: 17 + dog.hop };
    if (dog.dir === 'down') return { x: dog.x, y: dog.y + 2, z: 11 + dog.hop };
    return { x: dog.x + s[0] * 21, y: dog.y + 0.5, z: 12 + dog.hop };
  }
  function dogPick(it) {
    Object.assign(it, { held: true, heldBy: dog, air: false, planted: false, floating: false, ghost: false, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0 });
    dog.held = it;
  }
  function dogDropAtBed() {
    const it = dog.held;
    if (!it) return;
    dog.held = null;
    Object.assign(it, { held: false, heldBy: null, x: dog.bedX + rr(-14, 14), y: dog.bedY + rr(2, 12), z: 6, air: true, vz: 30, ghost: true });
    it.droppedAt = time;
  }
  // A thrown thing landed: Biscuit can't resist
  function dogNotice(it) {
    if (!dog || it.type.heavy || it.held || dog.held || areaOf(it.x, it.y) !== 0) return;
    if (dog.state === 'fetch' || dog.state === 'return') return;
    if (Math.hypot(it.x - dog.x, it.y - dog.y) > 220) return;
    dog.state = 'fetch'; dog.target = it; dog.path = null; dog.t = 10;
    dogSay('!', 0.8); dog.hopV = 80; dog.hop = 0.01;
  }
  function petDog() {
    dog.friendly = 30; dog.state = 'happy'; dog.t = 2; dog.path = null;
    dogSay('♥', 1.6); dog.hopV = 110; dog.hop = 0.01;
    for (let k = 0; k < 5; k++) particles.push({ kind: 'heart', x: dog.x + rr(-8, 8), y: dog.y, z: 22 + k * 3, life: 1.1, max: 1.1 });
    sfx('happy');
    completeTask('pet');
  }
  const dogCanPet = () => dog && !player.held && dog.state !== 'chase' && dog.state !== 'catchase' && dog.state !== 'happy' && dog.state !== 'fetch' && dog.state !== 'return' && Math.hypot(dog.x - player.x, dog.y - player.y) < 26;

  function dogCatch() {
    const dx = player.x - dog.x, dy = player.y - dog.y, d = Math.hypot(dx, dy) || 1;
    player.vx = dx / d * 200; player.vy = dy / d * 200; player.stun = 0.35; player.hopV = 90; player.hop = 0.01;
    sfx('bark');
    const it = player.held;
    if (it) {
      dropHeld(true);
      if (!it.type.heavy) { dogPick(it); dog.state = 'return'; dog.path = null; dogSay('Grrr!', 1.2); return; }
    }
    dogSay('WOOF!', 1.2);
    dog.state = 'sit'; dog.t = 2; dog.calm = 5;
  }

  function dogWalkTo(x, y, speed, dt) {
    if (lineClear(dog.x, dog.y, x, y)) { dog.path = null; return moveToward(dog, x, y, speed, dt); }
    dog.repathT -= dt;
    if (!dog.path || dog.repathT <= 0) { dog.path = findPath(dog.x, dog.y, x, y) || []; dog.repathT = 0.5; }
    return followPath(dog, speed, dt);
  }

  function updateDog(dt) {
    if (!dog) return;
    const d = dog;
    d.moving = false;
    d.calm = Math.max(0, d.calm - dt);
    d.friendly = Math.max(0, d.friendly - dt);
    if (d.bubble) { d.bubble.t -= dt; if (d.bubble.t <= 0) d.bubble = null; }
    if (d.hop > 0 || d.hopV) { d.hopV -= 600 * dt; d.hop += d.hopV * dt; if (d.hop <= 0) { d.hop = 0; d.hopV = 0; } }
    for (const v of villagers) v.barkCD = Math.max(0, (v.barkCD || 0) - dt);

    const outside = areaOf(player.x, player.y) === 0 && !playerInHideout();
    const dp = Math.hypot(player.x - d.x, player.y - d.y);
    const hasBone = player.held && player.held.owner === 'biscuit';
    const smells = outside && started && !d.held && d.calm <= 0 && (hasBone ? dp < 230 : d.friendly <= 0 && dp < 140);
    d.t -= dt;

    switch (d.state) {
      case 'sit': case 'wander': {
        if (smells) { d.state = 'alert'; d.t = 0.7; d.path = null; dogSay('?', 0.8); break; }
        // Spot the cat outside? Forget everything else.
        if (cat && cat.state !== 'flee' && cat.z === 0 && areaOf(cat.x, cat.y) === 0 && d.calm <= 0 && d.friendly <= 0 &&
            Math.hypot(cat.x - d.x, cat.y - d.y) < 150 && lineClear(d.x, d.y, cat.x, cat.y)) {
          d.state = 'catchase'; d.chaseT = 5; d.barkT = 0; d.path = null;
          catFlee(d.x, d.y, 'MROW!');
          completeTask('catdog');
          break;
        }
        if (d.friendly > 0 && outside && dp < 260) { d.state = 'follow'; break; }
        if (d.state === 'sit') {
          if (d.t <= 0) {
            // Trot somewhere nearby, sometimes over to Bertram
            const b = VILLAGER.bertram;
            let tx = d.bedX + rr(-6, 6) * TILE, ty = d.bedY + rr(-5, 6) * TILE;
            if (b && areaOf(b.x, b.y) === 0 && Math.random() < 0.4) { tx = b.x + rr(-40, 40); ty = b.y + rr(10, 30); }
            tx = clamp(tx, 4 * TILE, WORLD_W - 4 * TILE); ty = clamp(ty, 4 * TILE, WORLD_H - 4 * TILE);
            d.path = findPath(d.x, d.y, tx, ty) || [];
            d.state = 'wander'; d.t = 8;
          }
        } else if (followPath(d, 58, dt) || d.t <= 0) {
          d.path = null; d.state = 'sit'; d.t = rr(2, 5);
          if (Math.random() < 0.4) dogSay(rpick(DOG_LINES.sniff), 1.2);
        }
        break;
      }
      case 'alert': {
        const dx = player.x - d.x, dy = player.y - d.y;
        d.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (d.t <= 0) {
          if (smells) { d.state = 'chase'; d.chaseT = 6; d.barkT = 0; d.path = null; }
          else { d.state = 'sit'; d.t = 1.5; }
        }
        break;
      }
      case 'chase': {
        d.chaseT -= dt; d.barkT -= dt;
        if (d.barkT <= 0) { dogBark(); d.barkT = 0.9; }
        if (!outside || d.friendly > 0 && !hasBone) { d.state = 'sit'; d.t = 2; dogSay('Woof?', 1); break; }
        if (d.chaseT <= 0) { d.state = 'sit'; d.t = 3; d.calm = 6; dogSay('*pant pant*', 1.4); completeTask('outrun'); break; }
        if (dp < 14) { dogCatch(); break; }
        dogWalkTo(player.x, player.y, 172, dt);
        break;
      }
      case 'catchase': {
        d.chaseT -= dt; d.barkT -= dt;
        if (d.barkT <= 0) { dogBark(cat.x, cat.y); d.barkT = 0.8; }
        if (areaOf(cat.x, cat.y) !== 0 || d.chaseT <= 0) { d.state = 'sit'; d.t = 2; d.calm = 8; d.path = null; dogSay(areaOf(cat.x, cat.y) !== 0 ? 'Woof?' : '*pant pant*', 1.3); break; }
        if (Math.hypot(cat.x - d.x, cat.y - d.y) < 12 && d.chaseT < 3.5) { // cornered, the cat stands her ground
          catSay('HSSS!', 1.2); cat.hopV = 160; cat.hop = 0.01; sfx('hiss');
          d.state = 'sit'; d.t = 2.5; d.calm = 10; d.path = null; dogSay('Yip!', 1.2);
          break;
        }
        if (cat.state !== 'flee' || cat.t < 1) catFlee(d.x, d.y, 'Mrow!');
        dogWalkTo(cat.x, cat.y, 165, dt);
        break;
      }
      case 'fetch': {
        const it = d.target;
        if (!it || !items.includes(it) || it.held || it.floating || d.t <= 0) { d.state = 'sit'; d.t = 1; d.target = null; break; }
        if (Math.hypot(it.x - d.x, it.y - d.y) < 14 && it.z < 6) {
          dogPick(it); d.state = 'return'; d.path = null; d.target = null;
          if (it.thrownByPlayer) completeTask('fetch');
          break;
        }
        dogWalkTo(it.x, it.y, 165, dt);
        break;
      }
      case 'return': {
        if (!d.held) { d.state = 'sit'; d.t = 1; break; }
        if (dogWalkTo(d.bedX, d.bedY + 6, 120, dt) || Math.hypot(d.bedX - d.x, d.bedY + 6 - d.y) < 12) {
          dogDropAtBed(); d.state = 'sit'; d.t = rr(3, 5); d.calm = 3; d.path = null;
          dogSay(rpick(['*wag wag*', 'Arf!']), 1.2);
        }
        break;
      }
      case 'happy': {
        if (d.t <= 0) d.state = d.friendly > 0 ? 'follow' : 'sit';
        break;
      }
      case 'follow': {
        if (smells) { d.state = 'alert'; d.t = 0.5; break; }
        if (d.friendly <= 0 || !outside || dp > 320) { d.state = 'sit'; d.t = 2; break; }
        if (dp > 36) dogWalkTo(player.x - DIRV[player.dir][0] * 20, player.y - DIRV[player.dir][1] * 14, Math.min(190, 60 + dp), dt);
        break;
      }
    }
  }

  function drawDog(ctx, d, t) {
    const moving = d.moving;
    const bob = moving ? Math.abs(Math.sin(d.walk)) * 1.6 : 0;
    const wagSpeed = d.state === 'happy' || d.state === 'follow' ? 24 : moving ? 12 : d.state === 'alert' ? 2 : 5;
    const wag = Math.sin(t * wagSpeed);
    const tongue = d.state === 'chase' || d.state === 'follow' || d.state === 'happy';
    const C = '#c8945a', DK = '#8a5a32', CH = '#f4e6cc', EAR = '#6b4226', COLLAR = '#c0392b';
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(20,30,10,0.28)';
    ellipse(ctx, 0, 0, 13, 4.2);
    ctx.translate(0, -d.hop);
    const side = d.dir === 'left' || d.dir === 'right';
    if (d.dir === 'left') ctx.scale(-1, 1);
    const sw = moving ? Math.sin(d.walk) * 3.5 : 0;
    if (side) {
      const by = -12 - bob;
      leg(ctx, -8 - sw, 0, 8, DK); leg(ctx, 8 + sw, 0, 8, DK);
      ctx.strokeStyle = C; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-11, by - 2); ctx.quadraticCurveTo(-17, by - 6 + wag * 2, -15 + wag * 2.5, by - 13); ctx.stroke();
      ctx.fillStyle = C; ellipse(ctx, 0, by, 12.5, 7);
      ctx.fillStyle = CH; ellipse(ctx, 7, by + 2, 4.5, 4.5);
      ctx.fillStyle = DK; ellipse(ctx, -3, by - 4, 5, 2.5); // a patch
      leg(ctx, -8 + sw, 0, 8, C); leg(ctx, 8 - sw, 0, 8, C);
      const hx = 12, hy = by - 7;
      ctx.fillStyle = C; circle(ctx, hx, hy, 6.5);
      ctx.fillStyle = CH; ellipse(ctx, hx + 6, hy + 2, 4.6, 3.2);
      ctx.fillStyle = NOSE; circle(ctx, hx + 10, hy + 1, 1.7);
      ctx.fillStyle = '#2b2d33'; circle(ctx, hx + 2, hy - 2, 1.1);
      ctx.fillStyle = EAR; ctx.beginPath(); ctx.ellipse(hx - 3, hy + 1 + (d.state === 'alert' ? -3 : 0), 2.6, 5.5, 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLLAR; ctx.fillRect(hx - 6, hy + 4, 4, 4.5);
      if (tongue) { ctx.fillStyle = '#f28cab'; ellipse(ctx, hx + 7, hy + 5.5, 1.6, 2.6); }
    } else if (d.dir === 'down') {
      const by = -11 - bob;
      ctx.strokeStyle = C; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, by - 4); ctx.quadraticCurveTo(wag * 4, by - 10, wag * 6, by - 16); ctx.stroke();
      leg(ctx, -7, 0, 5, DK); leg(ctx, 7, 0, 5, DK);
      ctx.fillStyle = C; ellipse(ctx, 0, by, 9.5, 8);
      ctx.fillStyle = CH; ellipse(ctx, 0, by + 1.5, 5, 6);
      const lift = moving ? Math.sin(d.walk) * 2 : 0;
      leg(ctx, -4, -Math.max(0, lift), 6, C); leg(ctx, 4, -Math.max(0, -lift), 6, C);
      const hy = by - 9;
      ctx.fillStyle = EAR;
      const perk = d.state === 'alert' ? -3 : 0;
      ctx.beginPath(); ctx.ellipse(-7, hy + 2 + perk, 2.8, 5.6, 0.25, 0, Math.PI * 2); ctx.ellipse(7, hy + 2 + perk, 2.8, 5.6, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C; circle(ctx, 0, hy, 7.5);
      ctx.fillStyle = CH; ellipse(ctx, 0, hy + 3.5, 4.6, 3.4);
      ctx.fillStyle = NOSE; circle(ctx, 0, hy + 2, 1.9);
      ctx.fillStyle = '#2b2d33'; circle(ctx, -2.8, hy - 1.5, 1.2); circle(ctx, 2.8, hy - 1.5, 1.2);
      ctx.fillStyle = COLLAR; ellipse(ctx, 0, hy + 7.5, 5.5, 1.7);
      ctx.fillStyle = '#f2c14e'; circle(ctx, 0, hy + 9, 1.3);
      if (tongue) { ctx.fillStyle = '#f28cab'; ellipse(ctx, 0.5, hy + 6.5, 1.6, 2.4); }
    } else {
      const by = -11 - bob;
      const lift = moving ? Math.sin(d.walk) * 2 : 0;
      leg(ctx, -4, -Math.max(0, lift), 6, DK); leg(ctx, 4, -Math.max(0, -lift), 6, DK);
      const hy = by - 9;
      ctx.fillStyle = EAR;
      ctx.beginPath(); ctx.ellipse(-7, hy + 2, 2.8, 5.6, 0.25, 0, Math.PI * 2); ctx.ellipse(7, hy + 2, 2.8, 5.6, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C; circle(ctx, 0, hy, 7.5);
      ctx.fillStyle = C; ellipse(ctx, 0, by, 9.5, 8);
      ctx.fillStyle = DK; ellipse(ctx, 2, by - 2, 4, 3);
      ctx.fillStyle = COLLAR; ellipse(ctx, 0, hy + 6, 5.5, 1.6);
      leg(ctx, -7, -Math.max(0, -lift), 5, C); leg(ctx, 7, -Math.max(0, lift), 5, C);
      ctx.strokeStyle = C; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, by + 4); ctx.quadraticCurveTo(wag * 4, by - 2, wag * 6, by - 8); ctx.stroke();
    }
    ctx.restore();
  }
  function drawDogWithHeld(ctx, t) {
    const it = dog.held;
    const drawIt = () => { if (!it) return; ctx.save(); ctx.translate(it.x, it.y - it.z); it.type.draw(ctx, it, t); ctx.restore(); };
    if (it && dog.dir === 'up') drawIt();
    drawDog(ctx, dog, t);
    if (it && dog.dir !== 'up') drawIt();
  }

  // ---------------------------------------------------------------------------
  // Villagers turn to look at a noise (a bark, a smash) within earshot
  // ---------------------------------------------------------------------------
  function lookTowards(x, y, radius, lineFor) {
    const area = areaOf(x, y);
    for (const v of villagers) {
      if (areaOf(v.x, v.y) !== area || Math.hypot(v.x - x, v.y - y) > radius) continue;
      if (v.state !== 'act' && v.state !== 'route') continue;
      const dx = x - v.x, dy = y - v.y;
      v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if ((v.barkCD || 0) <= 0) { say(v, lineFor(v), 1.6); v.barkCD = 6; }
      if (v.state === 'act') v.actT = Math.max(v.actT, 1.5); // stop and look for a moment
    }
  }

  // Fragile things smash when they hit the floor hard
  function shatter(it) {
    sfx('crash');
    const col = { vase: '#4f6fa8', teapot: '#7fb3d5', frame: '#c9a33a', cookies: '#dcebf5', milk: '#f7f7f2' }[it.kind] || '#dddddd';
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
      particles.push({ kind: 'shard', col, x: it.x, y: it.y, z: 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 60 + Math.random() * 90, life: 0.7, max: 0.7 });
    }
    puff(it.x, it.y, 3);
    lookTowards(it.x, it.y, 280, (v) => (it.owner === v.id ? `My ${it.type.name}!` : rpick(['What was that?!', 'Who broke that?', 'Oh dear...'])));
    if (!it.byCat) completeTask('smash');
  }

  // ---------------------------------------------------------------------------
  // Marmalade, Mrs. Fennick's cat. Ignores you, naps in cosy spots, knocks
  // things off tables (fragile ones smash), and is Biscuit's favourite thing
  // to chase. Chitter at her and she hisses and bolts.
  // ---------------------------------------------------------------------------
  let cat = null;

  function spawnCat() {
    const T = TILE, P = L.plaza, g = L.garden;
    const fh = L.houses[L.homes.fennick];
    const spots = [];
    if (fh.room && fh.room.armchair) spots.push({ x: fh.room.armchair.x, y: fh.room.armchair.y + 1, z: 13, indoor: true });
    spots.push({ x: (fh.doorX + 0.5) * T - 22, y: (fh.y + fh.h + 0.9) * T, z: 0 });
    spots.push({ x: (P.x + 10) * T - 8, y: (P.y + 1.4) * T + 1, z: 12 });
    spots.push({ x: (g.x + 7) * T, y: (g.y + 5.6) * T, z: 0 });
    const s0 = spots[0];
    cat = {
      x: s0.x, y: s0.y, z: s0.z, dir: 'down', walk: 0, moving: false, hop: 0, hopV: 0,
      state: 'nap', t: rr(6, 14), spots, goal: null, path: null, pathGoal: null, repathT: 0, bubble: null, zzzT: 1,
    };
  }

  function catSay(text, t = 1.3) { cat.bubble = { text, t }; }
  function catLeaveSpot() {
    if (cat.z > 0) {
      cat.z = 0;
      if (navBlockedPt(cat.x, cat.y)) { const o = nearestOpen(Math.floor(cat.x / TILE), Math.floor(cat.y / TILE)); if (o) { cat.x = (o[0] + 0.5) * TILE; cat.y = (o[1] + 0.6) * TILE; } }
    }
    cat.path = null; cat.pathGoal = null;
  }
  function catPickNext() {
    catLeaveSpot();
    const roll = Math.random();
    const onTables = items.filter((it) => !it.held && !it.air && it.z > 4 && !it.floating);
    if (roll < 0.4 && onTables.length) {
      const it = rpick(onTables);
      cat.goal = { kind: 'swat', item: it, x: it.x + (Math.random() < 0.5 ? -16 : 16), y: it.y + 12 };
    } else {
      const s = rpick(cat.spots);
      cat.goal = { kind: 'nap', ...s };
    }
    cat.state = 'stroll'; cat.t = 40;
  }
  function catFlee(fromX, fromY, text = 'HSSS!') {
    catLeaveSpot();
    catSay(text, 1.2);
    cat.hopV = 140; cat.hop = 0.01;
    // Bolt for home if it's nearby, otherwise just away
    const home = cat.spots.find((s) => s.indoor);
    const a = Math.atan2(cat.y - fromY, cat.x - fromX);
    let gx = clamp(cat.x + Math.cos(a) * 180, 4 * TILE, WORLD_W - 4 * TILE), gy = clamp(cat.y + Math.sin(a) * 140, 4 * TILE, WORLD_H - 4 * TILE);
    if (areaOf(cat.x, cat.y) !== 0) { gx = cat.x + Math.cos(a) * 60; gy = cat.y + Math.sin(a) * 40; }
    else if (home) { // run home only if home is away from whatever she's fleeing
      const hd = home.indoor ? L.houses[L.homes.fennick].doorOut : home;
      if ((hd.x - cat.x) * Math.cos(a) + (hd.y - cat.y) * Math.sin(a) > 0) { gx = home.x; gy = home.y; }
    }
    cat.goal = { kind: 'flee', x: gx, y: gy };
    cat.state = 'flee'; cat.t = 4;
    if (Math.hypot(cat.x - player.x, cat.y - player.y) < 400) sfx('hiss');
  }
  function catSwat() {
    const it = cat.goal && cat.goal.item;
    if (!it || it.held || it.air || it.z <= 4 || Math.hypot(it.x - cat.x, it.y - cat.y) > 34) return false;
    const dir = it.x >= cat.x ? 1 : -1;
    Object.assign(it, { vx: dir * 70, vy: 25, vz: 70, air: true, ghost: true, byCat: true, noticed: true, thrownByPlayer: false });
    cat.dir = dir > 0 ? 'right' : 'left';
    catSay('Mrrp.', 1.1);
    if (Math.hypot(player.x - cat.x, player.y - cat.y) < 280 && areaOf(player.x, player.y) === areaOf(cat.x, cat.y)) completeTask('catswat');
    for (const v of villagers) {
      if (canSee(v, cat.x, cat.y) && Math.hypot(v.x - cat.x, v.y - cat.y) < 220) { say(v, v.id === 'fennick' ? 'Marmalade, NO!' : 'Shoo, cat!', 1.6); break; }
    }
    return true;
  }
  const catCanPet = () => cat && !player.held && cat.state !== 'flee' && (cat.petCD || 0) <= 0 && Math.hypot(cat.x - player.x, cat.y - player.y) < 26;
  function catReach() { const [rx, ry] = reachPoint(); return Math.hypot(cat.x - rx, cat.y - cat.z * 0.3 - ry) - 8; }
  function petCat() {
    cat.petCD = 2.5;
    if (cat.state === 'nap' || Math.random() < 0.5) {
      catSay('prrrr ♥', 1.6);
      for (let k = 0; k < 4; k++) particles.push({ kind: 'heart', x: cat.x + rr(-6, 6), y: cat.y, z: 16 + cat.z + k * 3, life: 1, max: 1 });
      sfx('purr');
      if (cat.state !== 'nap') { cat.state = 'sit'; cat.t = 3; }
      else cat.t = Math.max(cat.t, 4);
      completeTask('petcat');
    } else {
      catFlee(player.x, player.y, 'Hss!');
    }
  }

  function updateCat(dt) {
    if (!cat) return;
    const c = cat;
    c.moving = false;
    if (c.bubble) { c.bubble.t -= dt; if (c.bubble.t <= 0) c.bubble = null; }
    c.petCD = Math.max(0, (c.petCD || 0) - dt);
    if (c.hop > 0 || c.hopV) { c.hopV -= 600 * dt; c.hop += c.hopV * dt; if (c.hop <= 0) { c.hop = 0; c.hopV = 0; } }
    c.t -= dt;
    switch (c.state) {
      case 'nap':
        c.zzzT -= dt;
        if (c.zzzT <= 0) { c.zzzT = 3; if (!c.bubble) catSay('z z z', 1.4); }
        if (c.t <= 0) { catSay(rpick(['*yaaawn*', '*stretch*']), 1.2); catPickNext(); }
        break;
      case 'sit':
        if (c.t <= 0) catPickNext();
        break;
      case 'stroll': {
        const g = c.goal;
        if (!g || c.t <= 0) { catPickNext(); break; }
        if (g.kind === 'swat' && (g.item.held || g.item.air || g.item.z <= 4 || !items.includes(g.item))) { catPickNext(); break; }
        if (travel(c, g.x, g.y, 50, dt)) {
          if (g.kind === 'nap') {
            Object.assign(c, { x: g.x, y: g.y, z: g.z, dir: 'down', state: 'nap', t: rr(10, 20), zzzT: 2 });
            if (g.z > 0) { c.hopV = 60; c.hop = 0.01; }
          } else { c.state = 'swat'; c.t = 0.7; c.dir = g.item.x >= c.x ? 'right' : 'left'; }
        }
        break;
      }
      case 'swat':
        if (c.t <= 0) { catSwat(); c.state = 'sit'; c.t = 1.5; }
        break;
      case 'flee':
        if (travel(c, c.goal.x, c.goal.y, 195, dt) || c.t <= 0) { c.state = 'sit'; c.t = 2.5; c.path = null; c.pathGoal = null; }
        break;
    }
  }

  function drawCat(ctx, c, t) {
    const O = '#e8913a', D = '#b8642a', W = '#f6d6b0', EYE = '#7ac74f';
    const moving = c.moving;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(20,30,10,0.25)';
    ellipse(ctx, 0, -c.z * 0.15, 9, 3);
    ctx.translate(0, -c.z - c.hop);
    if (c.state === 'nap') { // curled-up ball with the tail wrapped round
      const br = 1 + Math.sin(t * 2) * 0.04;
      ctx.scale(br, br);
      ctx.fillStyle = O; ellipse(ctx, 0, -6, 10, 6.5);
      ctx.strokeStyle = D; ctx.lineWidth = 1.4;
      for (const k of [-4, 0, 4]) { ctx.beginPath(); ctx.arc(k, -6, 4, Math.PI * 1.15, Math.PI * 1.65); ctx.stroke(); }
      ctx.strokeStyle = O; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -4, 9, 0.2, Math.PI * 0.9); ctx.stroke();
      ctx.fillStyle = O; circle(ctx, 6.5, -7, 4.6);
      poly(ctx, [[3.5, -10], [4.5, -14], [6.8, -11]]); ctx.fill(); poly(ctx, [[7.5, -11], [10, -13.5], [10, -9.5]]); ctx.fill();
      ctx.fillStyle = W; ellipse(ctx, 8, -5.5, 2.4, 1.6);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(5, -7.5); ctx.lineTo(6.6, -7.2); ctx.moveTo(7.8, -7.2); ctx.lineTo(9.4, -7.5); ctx.stroke();
      ctx.restore();
      return;
    }
    const side = c.dir === 'left' || c.dir === 'right';
    if (c.dir === 'left') ctx.scale(-1, 1);
    const sw = moving ? Math.sin(c.walk) * 3 : 0;
    const bob = moving ? Math.abs(Math.sin(c.walk)) * 1.2 : 0;
    const flee = c.state === 'flee';
    const tailSway = Math.sin(t * 2.5) * 2;
    if (side) {
      const by = -10 - bob - (flee ? 2 : 0);
      leg(ctx, -6 - sw, 0, 7, D); leg(ctx, 6 + sw, 0, 7, D);
      ctx.strokeStyle = O; ctx.lineWidth = flee ? 4.5 : 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, by); ctx.bezierCurveTo(-15, by - 4, -12 + tailSway, by - 12, -14 + tailSway, by - 17); ctx.stroke();
      ctx.fillStyle = O; ellipse(ctx, 0, by, 10, flee ? 6.5 : 5.5);
      ctx.strokeStyle = D; ctx.lineWidth = 1.3;
      for (const k of [-5, -1, 3]) { ctx.beginPath(); ctx.moveTo(k, by - 5); ctx.lineTo(k + 1, by - 1.5); ctx.stroke(); }
      ctx.fillStyle = W; ellipse(ctx, 5, by + 2.5, 3.5, 2.5);
      leg(ctx, -6 + sw, 0, 7, O); leg(ctx, 6 - sw, 0, 7, O);
      const hx = 10, hy = by - 5;
      ctx.fillStyle = O; circle(ctx, hx, hy, 5.2);
      poly(ctx, [[hx - 3.5, hy - 3], [hx - 2.5, hy - 9], [hx + 0.5, hy - 4]]); ctx.fill();
      poly(ctx, [[hx + 1, hy - 4.5], [hx + 3.5, hy - 9.5], [hx + 4.5, hy - 3]]); ctx.fill();
      ctx.fillStyle = W; ellipse(ctx, hx + 3.5, hy + 1.8, 2.6, 2);
      ctx.fillStyle = EYE; ellipse(ctx, hx + 2.2, hy - 1, 1.3, 1.6);
      ctx.fillStyle = '#1d1d22'; ellipse(ctx, hx + 2.4, hy - 1, 0.4, 1.2);
      ctx.fillStyle = '#e8957a'; circle(ctx, hx + 5.6, hy + 0.8, 0.9);
    } else {
      const by = -10 - bob;
      const lift = moving ? Math.sin(c.walk) * 2 : 0;
      const back = c.dir === 'up';
      if (!back) {
        ctx.strokeStyle = O; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(3, by - 2); ctx.quadraticCurveTo(9 + tailSway, by - 8, 7 + tailSway, by - 15); ctx.stroke();
      }
      leg(ctx, -3.5, -Math.max(0, lift), 6, back ? D : O); leg(ctx, 3.5, -Math.max(0, -lift), 6, back ? D : O);
      ctx.fillStyle = O; ellipse(ctx, 0, by, 7.5, 7);
      if (!back) { ctx.fillStyle = W; ellipse(ctx, 0, by + 1.5, 4, 5); }
      else { ctx.strokeStyle = D; ctx.lineWidth = 1.3; for (const k of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(-3.5, by + k); ctx.lineTo(3.5, by + k - 1); ctx.stroke(); } }
      const hy = by - 8;
      ctx.fillStyle = O; circle(ctx, 0, hy, 6);
      poly(ctx, [[-5.5, hy - 2], [-4.5, hy - 9.5], [-1, hy - 4.5]]); ctx.fill();
      poly(ctx, [[5.5, hy - 2], [4.5, hy - 9.5], [1, hy - 4.5]]); ctx.fill();
      if (!back) {
        ctx.fillStyle = W; ellipse(ctx, 0, hy + 2.6, 3.4, 2.4);
        ctx.fillStyle = EYE; ellipse(ctx, -2.4, hy - 0.8, 1.3, 1.6); ellipse(ctx, 2.4, hy - 0.8, 1.3, 1.6);
        ctx.fillStyle = '#1d1d22'; ellipse(ctx, -2.4, hy - 0.8, 0.4, 1.2); ellipse(ctx, 2.4, hy - 0.8, 0.4, 1.2);
        ctx.fillStyle = '#e8957a'; circle(ctx, 0, hy + 1.6, 0.9);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(-1.5, hy + 2.5); ctx.lineTo(-7, hy + 1.5); ctx.moveTo(1.5, hy + 2.5); ctx.lineTo(7, hy + 1.5); ctx.stroke();
      } else {
        ctx.strokeStyle = O; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, by + 5); ctx.quadraticCurveTo(tailSway * 2, by + 2, tailSway * 2.5, by - 6); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Sound: tiny synthesized blips (starts after the first key press / tap)
  // ---------------------------------------------------------------------------
  let actx = null, master = null, muted = false;
  function audioInit() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = 0.6; master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
    } catch (_) { actx = null; }
  }
  function tone(f0, f1, dur, type, vol, delay = 0) {
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = actx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start();
  }
  function sfx(name) {
    if (!actx || muted || actx.state !== 'running') return;
    switch (name) {
      case 'pick': tone(520, 980, 0.09, 'square', 0.05); break;
      case 'pop': tone(300, 760, 0.12, 'triangle', 0.1); break;
      case 'heave': tone(160, 300, 0.2, 'sawtooth', 0.05); break;
      case 'throw': noise(0.15, 0.12, 2500); tone(620, 240, 0.14, 'sine', 0.07); break;
      case 'bounce': tone(340, 200, 0.06, 'triangle', 0.1); break;
      case 'tap': tone(260, 160, 0.05, 'triangle', 0.08); break;
      case 'thud': tone(130, 50, 0.16, 'triangle', 0.25); noise(0.08, 0.15, 400); break;
      case 'bonk': tone(240, 120, 0.07, 'square', 0.05); break;
      case 'splash': noise(0.45, 0.3, 1200); tone(500, 140, 0.25, 'sine', 0.05); break;
      case 'chitter': for (let k = 0; k < 3; k++) tone(1300, 1750, 0.04, 'square', 0.03, k * 0.06); break;
      case 'alert': tone(660, 880, 0.08, 'square', 0.06); tone(880, 1320, 0.12, 'square', 0.06, 0.09); break;
      case 'snatch': noise(0.12, 0.15, 1800); tone(420, 200, 0.16, 'sawtooth', 0.05); break;
      case 'hmph': tone(220, 150, 0.22, 'triangle', 0.08); break;
      case 'bark': tone(420, 250, 0.09, 'square', 0.08); tone(400, 230, 0.1, 'square', 0.07, 0.13); break;
      case 'rustle': noise(0.18, 0.09, 3000); break;
      case 'crash': noise(0.3, 0.3, 4500); tone(1800, 900, 0.12, 'square', 0.04); tone(2400, 1400, 0.1, 'triangle', 0.04, 0.05); break;
      case 'hiss': noise(0.35, 0.12, 6000); break;
      case 'purr': for (let k = 0; k < 6; k++) tone(70, 64, 0.09, 'sawtooth', 0.05, k * 0.1); break;
      case 'happy': [880, 1100, 1320].forEach((f, k) => tone(f, f * 1.05, 0.08, 'sine', 0.05, k * 0.07)); break;
      case 'door': tone(520, 360, 0.07, 'triangle', 0.07); tone(360, 300, 0.09, 'triangle', 0.05, 0.07); noise(0.05, 0.08, 900); break;
      case 'ding': tone(988, 988, 0.12, 'triangle', 0.09); tone(1319, 1319, 0.22, 'triangle', 0.09, 0.1); break;
      case 'fanfare': [523, 659, 784, 1047].forEach((f, k) => tone(f, f, k === 3 ? 0.4 : 0.14, 'square', 0.05, k * 0.12)); break;
    }
  }
  // Villager "voices": a few pitched blips per sentence
  function babble(pitch, len) {
    if (!actx || muted || actx.state !== 'running') return;
    const n = Math.min(6, 2 + Math.floor(len / 5));
    for (let k = 0; k < n; k++) {
      const f = pitch * (0.85 + Math.random() * 0.5);
      tone(f, f * (0.8 + Math.random() * 0.4), 0.05, 'triangle', 0.035, k * 0.075);
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const keys = new Set();
  const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let started = false;
  let showMap = true;

  function readInput() {
    let x = 0, y = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
    let run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (touch.id !== null) {
      const dx = touch.x - touch.ox, dy = touch.y - touch.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const m = Math.min(1, d / 50);
        x = (dx / d) * m; y = (dy / d) * m;
        run = d > 70;
      }
    }
    if (!started || paused) return { x: 0, y: 0, run: false };
    return { x, y, run };
  }

  function start() {
    audioInit();
    if (started) return;
    started = true;
    document.getElementById('start').hidden = true;
    // First visit: straight into Day 1. Returning: stop by the den to spend shinies.
    if (save.runs > 0) showDen(); else showRunCard();
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!started) { start(); return; }
    if (paused) {
      if (!document.getElementById('runcard').hidden && ['Enter', 'Space', 'KeyE'].includes(e.code) && !e.repeat) { e.preventDefault(); goRun(); }
      return;
    }
    keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) chitter();
    if (e.code === 'KeyM' && !e.repeat) showMap = !showMap;
    if (e.code === 'KeyE' && !e.repeat) grabOrDrop();
    if (e.code === 'KeyF' && !e.repeat) throwHeld();
    if (e.code === 'KeyN' && !e.repeat) muted = !muted;
    if (e.code === 'KeyT' && !e.repeat) setTodoOpen(!todoEl.classList.contains('open'));
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  document.getElementById('start').addEventListener('pointerdown', (e) => { e.preventDefault(); start(); canvas.focus?.(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (touch.id !== null) return;
    touch.id = e.pointerId; touch.ox = touch.x = e.clientX; touch.oy = touch.y = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerId === touch.id) { touch.x = e.clientX; touch.y = e.clientY; } });
  const endTouch = (e) => { if (e.pointerId === touch.id) touch.id = null; };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  document.getElementById('chitter').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!started) { start(); return; } if (!paused) chitter(); });
  const grabBtn = document.getElementById('grab');
  const throwBtn = document.getElementById('throw');
  grabBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!started) { start(); return; } if (!paused) grabOrDrop(); });
  throwBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!started) { start(); return; } if (!paused) throwHeld(); });
  function syncTouchButtons() {
    const label = player.held ? 'drop' : petChoice() ? 'pet' : 'grab';
    if (grabBtn.textContent !== label) grabBtn.textContent = label;
    grabBtn.classList.toggle('ready', !!(player.held || target || petChoice()));
    if (throwBtn.hidden === !!player.held) throwBtn.hidden = !player.held;
  }

  // ---------------------------------------------------------------------------
  // Camera & render
  // ---------------------------------------------------------------------------
  let vw = 0, vh = 0, dpr = 1, zoom = 2;
  const cam = { x: player.x, y: player.y };
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    // Show roughly 22 tiles across on wide screens, at least ~11 on phones
    zoom = clamp(Math.min(vw / (18 * TILE), vh / (12 * TILE)), 1.2, 3.2);
    if (vw < 500) zoom = clamp(vw / (7.5 * TILE), 1.2, 2.6);
  }
  window.addEventListener('resize', resize);

  function render(t) {
    const viewW = vw / zoom, viewH = vh / zoom;
    const indoors = houseOfArea(areaOf(player.x, player.y));
    if (indoors) { // frame the whole room
      cam.x = (indoors.room.x0 + 5.5) * TILE; cam.y = (indoors.room.y0 + 4.3) * TILE;
    } else {
      cam.x = clamp(cam.x, viewW / 2, WORLD_W - viewW / 2);
      cam.y = clamp(cam.y, viewH / 2, WORLD_H - viewH / 2);
      if (viewW >= WORLD_W) cam.x = WORLD_W / 2;
      if (viewH >= WORLD_H) cam.y = WORLD_H / 2;
    }
    const shake = run.shake > 0 ? run.shake * 10 : 0;
    const left = cam.x - viewW / 2 + (Math.random() - 0.5) * shake, top = cam.y - viewH / 2 + (Math.random() - 0.5) * shake;
    const s = dpr * zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = indoors ? '#120d0a' : '#2f5a28';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, -Math.round(left * s), -Math.round(top * s));
    ctx.imageSmoothingEnabled = true;

    // Ground (only the visible slice)
    const sx = Math.max(0, Math.floor(left)), sy = Math.max(0, Math.floor(top));
    const sw = Math.min(WORLD_W - sx, Math.ceil(viewW) + 2), sh = Math.min(ground.height - sy, Math.ceil(viewH) + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);

    // Water shimmer
    const tx0 = Math.max(0, Math.floor(left / TILE)), ty0 = Math.max(0, Math.floor(top / TILE));
    const tx1 = Math.min(MW - 1, Math.ceil((left + viewW) / TILE)), ty1 = Math.min(MH - 1, Math.ceil((top + viewH) / TILE));
    ctx.lineCap = 'round'; ctx.lineWidth = 1.5;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (map[idx(x, y)] !== WATER) continue;
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const a = Math.sin(t * 1.6 + (h % 628) / 100);
      if (a < 0.3) continue;
      ctx.strokeStyle = `rgba(255,255,255,${(a - 0.3) * 0.5})`;
      const ox = (h % 20) + 6, oy = ((h >> 5) % 20) + 6;
      const drift = Math.sin(t * 0.8 + h) * 2;
      ctx.beginPath();
      ctx.moveTo(x * TILE + ox - 4 + drift, y * TILE + oy);
      ctx.lineTo(x * TILE + ox + 4 + drift, y * TILE + oy);
      ctx.stroke();
    }

    // Visible objects
    const pad = 40;
    const vis = [];
    for (const o of objects) {
      const b = o.bounds;
      if (b.r < left - pad || b.l > left + viewW + pad || b.b < top - pad || b.t > top + viewH + pad) continue;
      vis.push(o);
    }
    for (const o of vis) if (o.shadow) o.shadow(ctx);
    for (const it of items) {
      if (it.held || it.x < left - pad || it.x > left + viewW + pad || it.y < top - pad || it.y > top + viewH + pad) continue;
      if (!it.floating) drawItemShadow(ctx, it);
      vis.push(it);
    }

    for (const v of villagers) {
      if (v.x < left - pad || v.x > left + viewW + pad || v.y < top - pad || v.y > top + viewH + pad + 40) continue;
      vis.push({ y: v.y, isVillager: true, v });
    }
    if (dog && dog.x > left - pad && dog.x < left + viewW + pad && dog.y > top - pad && dog.y < top + viewH + pad + 40) vis.push({ y: dog.y, isDog: true });
    if (cat && cat.x > left - pad && cat.x < left + viewW + pad && cat.y > top - pad && cat.y < top + viewH + pad + 40) vis.push({ y: cat.y + 0.5, isCat: true });

    // Ground-level effects: dust and ripples
    for (const q of particles) {
      if (q.kind === 'ring') {
        ctx.strokeStyle = `rgba(255,255,255,${(q.life / q.max) * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r, q.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (!q.kind) {
        ctx.fillStyle = q.soil ? `rgba(110,75,45,${(q.life / q.max) * 0.7})` : `rgba(230,215,180,${(q.life / q.max) * 0.6})`;
        circle(ctx, q.x, q.y, q.r);
      }
    }

    drawHideoutZone(ctx, t);

    // Y-sorted draw: objects + items + player
    const playerEntry = { y: player.y, isPlayer: true };
    vis.push(playerEntry);
    vis.sort((a, b) => a.y - b.y);
    for (const o of vis) {
      if (o.isPlayer) { drawPlayerWithHeld(ctx, t); continue; }
      if (o.isItem) { drawItem(ctx, o, t); continue; }
      if (o.isVillager) { drawVillagerWithHeld(ctx, o.v, t); continue; }
      if (o.isDog) { drawDogWithHeld(ctx, t); continue; }
      if (o.isCat) { drawCat(ctx, cat, t); continue; }
      let fade = false;
      if (o.canopy && player.y < o.y && player.y > o.canopy.cy - o.canopy.r && Math.abs(player.x - o.x) < o.canopy.r + 6) fade = true;
      o.draw(ctx, t, fade);
    }

    // Indoors: black out everything beyond this room's walls (other rooms share the strip)
    if (indoors) {
      const R = indoors.room, rx = R.x0 * TILE, ry = R.y0 * TILE - 10, rw = 11 * TILE, rh = 8 * TILE + 10;
      const l0 = left - 20, t0 = top - 20, r0 = left + viewW + 20, b0 = top + viewH + 20;
      ctx.fillStyle = '#120d0a';
      ctx.fillRect(l0, t0, rx - l0, b0 - t0);
      ctx.fillRect(rx + rw, t0, r0 - rx - rw, b0 - t0);
      ctx.fillRect(rx, t0, rw, ry - t0);
      ctx.fillRect(rx, ry + rh, rw, b0 - ry - rh);
    }

    for (const b of butterflies) {
      if (b.x > left - 20 && b.x < left + viewW + 20 && b.y > top - 20 && b.y < top + viewH + 80) drawButterfly(ctx, b);
    }
    // Airborne effects: splashes and sparkles
    for (const q of particles) {
      if (q.kind === 'heart') {
        const hx = q.x, hy = q.y - q.z, a = q.life / q.max;
        ctx.fillStyle = `rgba(242,95,140,${a})`;
        circle(ctx, hx - 1.6, hy, 2); circle(ctx, hx + 1.6, hy, 2);
        ctx.beginPath(); ctx.moveTo(hx - 3.5, hy + 0.6); ctx.lineTo(hx + 3.5, hy + 0.6); ctx.lineTo(hx, hy + 4.5); ctx.fill();
        continue;
      }
      if (q.kind === 'shard') { ctx.fillStyle = q.col; ctx.globalAlpha = q.life / q.max; ctx.fillRect(q.x - 1.2, q.y - q.z - 1.2, 2.6, 2); ctx.globalAlpha = 1; continue; }
      if (q.kind !== 'drop' && q.kind !== 'spark') continue;
      ctx.fillStyle = q.kind === 'drop' ? `rgba(200,230,255,${q.life / q.max})` : `rgba(255,236,160,${q.life / q.max})`;
      circle(ctx, q.x, q.y - q.z, q.kind === 'drop' ? 1.8 : 1.4);
    }
    const pc = petChoice();
    if (pc === 'dog') drawPrompt(ctx, { x: dog.x, y: dog.y, z: 0, owner: null, type: { h: 24, name: 'pet Biscuit' } }, t);
    else if (pc === 'cat') drawPrompt(ctx, { x: cat.x, y: cat.y, z: cat.z, owner: null, type: { h: 18, name: 'pet Marmalade' } }, t);
    else if (target && started) drawPrompt(ctx, target, t);
    drawBubble(ctx, player);
    for (const v of villagers) if (v.bubble) drawBubbleAt(ctx, v.x, v.y - v.hop - 46 * v.scale, v.bubble);
    if (dog && dog.bubble) drawBubbleAt(ctx, dog.x, dog.y - dog.hop - 38, dog.bubble);
    if (cat && cat.bubble) drawBubbleAt(ctx, cat.x, cat.y - cat.z - cat.hop - 32, cat.bubble);

    drawDoorHint(ctx, t);

    // Drifting cloud shadows (outdoors only)
    ctx.fillStyle = 'rgba(20,35,60,0.07)';
    if (!indoors) for (const c of clouds) {
      ellipse(ctx, c.x, c.y, c.rx, c.ry);
      ellipse(ctx, c.x + c.rx * 0.5, c.y - c.ry * 0.3, c.rx * 0.6, c.ry * 0.7);
    }

    drawDusk(ctx, left, top, viewW, viewH);

    // ---- Screen space UI ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Touch joystick
    if (touch.id !== null) {
      ctx.fillStyle = 'rgba(255,244,214,0.12)';
      circle(ctx, touch.ox, touch.oy, 50);
      ctx.strokeStyle = 'rgba(255,244,214,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 50, 0, Math.PI * 2); ctx.stroke();
      const dx = touch.x - touch.ox, dy = touch.y - touch.oy, d = Math.hypot(dx, dy), m = Math.min(d, 50);
      ctx.fillStyle = 'rgba(255,181,71,0.85)';
      circle(ctx, touch.ox + (d ? dx / d * m : 0), touch.oy + (d ? dy / d * m : 0), 20);
    }
    // Minimap
    if (showMap && started) {
      const mw = vw < 500 ? 108 : 162, mh = mw * (MH / MW);
      const insetR = 12, insetB = isTouch ? 112 : 12;
      const mx = vw - mw - insetR, my = vh - mh - insetB;
      ctx.fillStyle = 'rgba(28,36,24,0.78)';
      roundRect(ctx, mx - 5, my - 5, mw + 10, mh + 10, 8, true);
      ctx.save();
      roundRect(ctx, mx, my, mw, mh, 5, false); ctx.clip();
      ctx.drawImage(mini, mx, my, mw, mh);
      ctx.strokeStyle = 'rgba(255,244,214,0.7)'; ctx.lineWidth = 1;
      if (!indoors) ctx.strokeRect(mx + left / WORLD_W * mw, my + top / WORLD_H * mh, viewW / WORLD_W * mw, viewH / WORLD_H * mh);
      ctx.restore();
      const pp = outdoorPos(player.x, player.y);
      ctx.fillStyle = '#ffb547';
      circle(ctx, mx + pp.x / WORLD_W * mw, my + pp.y / WORLD_H * mh, 3);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx + pp.x / WORLD_W * mw, my + pp.y / WORLD_H * mh, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffb547'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx + HIDEOUT.x / WORLD_W * mw, my + HIDEOUT.y / WORLD_H * mh, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#24170e'; circle(ctx, mx + HIDEOUT.x / WORLD_W * mw, my + HIDEOUT.y / WORLD_H * mh, 1.4);
      if (cat) {
        const cp = outdoorPos(cat.x, cat.y);
        ctx.fillStyle = '#e8913a'; circle(ctx, mx + cp.x / WORLD_W * mw, my + cp.y / WORLD_H * mh, 1.7);
      }
      if (dog) {
        ctx.fillStyle = dog.state === 'chase' ? '#e8453c' : '#c8945a';
        circle(ctx, mx + dog.x / WORLD_W * mw, my + dog.y / WORLD_H * mh, 2);
      }
      for (const v of villagers) {
        const vp = outdoorPos(v.x, v.y);
        const vx = mx + vp.x / WORLD_W * mw, vy = my + vp.y / WORLD_H * mh;
        ctx.fillStyle = v.state === 'chase' ? '#e8453c' : v.shirt;
        circle(ctx, vx, vy, v.state === 'chase' ? 3.2 : 2.4);
        ctx.strokeStyle = '#fff4d6'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(vx, vy, v.state === 'chase' ? 3.2 : 2.4, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = 0, time = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    time += dt;
    if (!paused) {
      updatePlayer(dt, readInput());
      updateItems(dt);
      updateVillagers(dt);
      updateDog(dt);
      updateCat(dt);
      updateHiding(dt);
      checkTasks(dt);
      if (started && !run.over) {
        run.timeLeft -= dt;
        updateTimer();
        if (run.timeLeft <= 0) { run.timeLeft = 0; endRun('sunset'); }
      }
      run.shake = Math.max(0, run.shake - dt);
    }
    updateAmbient(dt);
    target = paused ? null : findTarget();
    syncTouchButtons();
    // camera eases toward the player, with a little look-ahead
    const lx = player.x + player.vx * 0.25, ly = player.y - 10 + player.vy * 0.25;
    cam.x = lerp(cam.x, lx, 1 - Math.pow(0.002, dt));
    cam.y = lerp(cam.y, ly, 1 - Math.pow(0.002, dt));
    render(time);
    requestAnimationFrame(frame);
  }

  // Wipe the world and generate a fresh village from a seed
  function newVillage(seed) {
    rand = mulberry32(seed);
    map.fill(0); used.fill(0);
    objects.length = 0; items.length = 0; villagers.length = 0;
    particles.length = 0; butterflies.length = 0; clouds.length = 0;
    for (const k of Object.keys(VILLAGER)) delete VILLAGER[k];
    L = genLayout();
    buildMap();
    solidObjects = objects.filter((o) => o.hitbox);
    renderGround(seed);
    buildNav();
    placeItems();
    spawnVillagers();
    spawnDog();
    spawnCat();
    hideBushes = objects.filter((o) => o.kind === 'hidebush' || o.kind === 'bed'); // places to hide
    spawnAmbient();
    Object.assign(player, { x: HIDEOUT.x, y: HIDEOUT.y + 6, vx: 0, vy: 0, held: null, stun: 0, hop: 0, hopV: 0, bubble: null, dir: 'down', speed: 0, hidden: false, hidingIn: null });
    target = null;
    cam.x = player.x; cam.y = player.y;
  }

  function boot() {
    loadSave();
    setupRun(save.day);
    run.seed = (Math.random() * 2 ** 31) >>> 0;
    newVillage(run.seed);
    initTodoToggle();
    buildTodo();
    updateRunBar();
    resize();
    requestAnimationFrame((n) => { last = n; frame(n); });
  }

  // Debug: draw the whole village into one picture (used for testing layouts)
  function worldPicture(scale = 0.5) {
    const c = document.createElement('canvas');
    c.width = WORLD_W * scale; c.height = ground.height * scale;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.drawImage(ground, 0, 0);
    for (const o of objects) if (o.shadow) o.shadow(g);
    const list = [...objects, ...items.filter((i) => !i.held), ...villagers.map((v) => ({ y: v.y, isVillager: true, v })), { y: player.y, isPlayer: true }];
    list.sort((a, b) => a.y - b.y);
    for (const o of list) {
      if (o.isPlayer) drawRaccoon(g, player, 0);
      else if (o.isVillager) drawVillager(g, o.v, 0);
      else if (o.isItem) drawItem(g, o, 0);
      else o.draw(g, 0, false);
    }
    return c.toDataURL('image/png');
  }

  // Handy for poking at the game from the browser console
  window.mischief = { player, items, objects, villagers, run, save, completeTask, endRun, get layout() { return L; }, newVillage, startDay, findPath, worldPicture, get dog() { return dog; }, get cat() { return cat; }, get hideBushes() { return hideBushes; } };

  const hot = window.claude?.hot;
  if (hot?.ready) hot.ready(() => boot()); else boot();
})();
