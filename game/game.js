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
  const GRASS = 0, PATH = 1, WATER = 2, SAND = 3, SOIL = 4, STONE = 5, BRIDGE = 6, FLOOR = 7, WALL = 8, ICE = 9;

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

  const VILLAGE_B_RIVER = ['ford', 'bridge', 'brook', 'wade', 'water', 'burn'];
  const VILLAGE_B_SEA = ['haven', 'port', 'sands', 'cove', 'bay', 'quay'];
  function genLayout(opts = {}) {
    const kind = opts.kind || pick(KIND_NAMES);
    const season = opts.season || pick(SEASON_NAMES);
    const weatherName = opts.weather || pickWeather(season);
    const roadY = kind === 'seaside' ? 18 + Math.floor(rand() * 6) : 22 + Math.floor(rand() * 7);  // top row of the 2-wide east–west road
    const roadX = 28 + Math.floor(rand() * 15); // left column of the 2-wide north–south road
    const quads = {
      NW: { x0: 4, y0: 4, x1: roadX - 1, y1: roadY - 1, north: true },
      NE: { x0: roadX + 3, y0: 4, x1: MW - 4, y1: roadY - 1, north: true },
      SW: { x0: 4, y0: roadY + 3, x1: roadX - 1, y1: kind === 'seaside' ? MH - 11 : MH - 4, north: false },
      SE: { x0: roadX + 3, y0: roadY + 3, x1: MW - 4, y1: kind === 'seaside' ? MH - 11 : MH - 4, north: false },
    };
    const order = shuffled(['NW', 'NE', 'SW', 'SE']);
    return {
      name: pick(VILLAGE_A) + pick(kind === 'seaside' ? VILLAGE_B_SEA : kind === 'river' ? VILLAGE_B_RIVER : VILLAGE_B),
      kind, season, weather: weatherName, weatherPlan: opts.plan || planWeather(season, weatherName), planIdx: 1, roadY, roadX,
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
        if (prev[ni] !== -1 || solid[ni] || map[ni] === WATER || map[ni] === ICE) continue;
        prev[ni] = cur;
        queue.push(ni);
      }
    }
    return false;
  }

  // Seaside villages: a sea along the south edge with a sandy beach and a pier
  function buildSea() {
    L.shore = [];
    for (let x = 0; x < MW; x++) {
      const sy = Math.round(MH - 8 + Math.sin(x * 0.21) * 1.2 + Math.sin(x * 0.07 + 1) * 1.6);
      L.shore[x] = sy;
      for (let y = sy - 2; y < MH; y++) setT(x, y, y > sy ? WATER : SAND);
      reserve(x, sy - 3, 1, MH - sy + 3);
    }
    const px = L.roadX, sy = Math.max(L.shore[px], L.shore[px + 1]);
    for (let y = sy - 3; y <= sy; y++) { setT(px, y, PATH); setT(px + 1, y, PATH); }
    for (let y = sy + 1; y <= sy + 6; y++) { setT(px, y, BRIDGE); setT(px + 1, y, BRIDGE); }
    L.pier = { x: (px + 1) * TILE, baseY: (sy + 1) * TILE, endY: (sy + 7) * TILE };
    L.pond = { cx: px + 1, cy: MH - 3, rx: 9, ry: 3 }; // stands in for "the water" for shore spots
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

    if (L.kind === 'seaside') buildSea();
    // Pond (+ a stream running off to the nearest map edge; a river village's runs right across)
    else {
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
      let sx0 = Math.round(cx + rx * 0.45);
      let dirs = [q.north ? -1 : 1];
      if (L.kind === 'river') {
        // keep the river clear of the plaza, the north–south road and the hideout
        const hxT = L.hideSide === 'W' ? 4 : MW - 5;
        const bad = (x) => (x >= plaza.x - 4 && x <= plaza.x + 15) || Math.abs(x - roadX - 0.5) < 5 || Math.abs(x - hxT) < 6 || x < 3 || x > MW - 4;
        if (bad(sx0)) sx0 = Math.round(cx - rx * 0.45);
        if (!bad(sx0)) { dirs = [-1, 1]; L.river = { x: sx0 }; }
      }
      for (const dir of dirs) for (let y = Math.round(cy); y >= 0 && y < MH; y += dir) {
        const sx = sx0 + Math.round(Math.sin(y * 0.25) * 1.5);
        for (let x = sx - 1; x <= sx + 1; x++) {
          const t0 = getT(x, y);
          if (t0 === GRASS || t0 === SAND) setT(x, y, WATER);
          else if (t0 === PATH) setT(x, y, BRIDGE); // the road crosses on a bridge
        }
        for (const x of [sx - 2, sx + 2]) if (getT(x, y) === GRASS) setT(x, y, SAND);
        reserve(sx - 2, y, 5, 1);
      }
    }
    // In winter, ponds and rivers freeze over
    if (hasIce()) for (let i = 0; i < MW * MH; i++) if (map[i] === WATER) map[i] = ICE;

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
    placeSeasonal();
    buildPaddock();
    buildWilds();

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
      const t0 = getT(x, y);
      if (t0 === WATER || t0 === BRIDGE || t0 === ICE || t0 === SAND) continue; // not on the pier or in the sea
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
    } else { // wardrobe: climb in to hide
      o.wardrobe = true; o.creak = 0;
      o.front = { x, y: y + 16 };
      o.draw = (ctx, t) => {
        const occupied = player.inWardrobe === o;
        const open = o.creak > 0 ? Math.sin(o.creak * Math.PI) * 9 : occupied ? 2.5 : 0; // door swing / crack
        ctx.fillStyle = '#7a4f2e'; roundRect(ctx, x - 19, y - 70, 38, 70, 3, true);
        if (open > 0) { // the dark gap between the doors, and who's in it
          ctx.fillStyle = '#1d1410'; ctx.fillRect(x - open, y - 66, open * 2, 60);
          if (occupied) {
            const ey = y - 40 + Math.sin(t * 0.8) * 1.5;
            ctx.fillStyle = '#ffffff'; circle(ctx, x - 1.6, ey, 1.4); circle(ctx, x + 1.6, ey, 1.4);
            ctx.fillStyle = NOSE; circle(ctx, x - 1.6 + Math.sin(t * 0.9) * 0.4, ey, 0.7); circle(ctx, x + 1.6 + Math.sin(t * 0.9) * 0.4, ey, 0.7);
          }
        }
        ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 16 - open * 0.3, y - 66, 15, 60); ctx.strokeRect(x + 1 + open * 0.3, y - 66, 15, 60);
        ctx.fillStyle = '#f2c14e'; circle(ctx, x - 3 - open, y - 36, 1.6); circle(ctx, x + 3 + open, y - 36, 1.6);
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 21, y - 72, 42, 4);
        if (occupied && !paused && o.creak <= 0) { // how to get out
          const text = isTouch ? 'move to step out' : 'E / move: step out';
          ctx.font = '800 7px Nunito, sans-serif';
          const w = ctx.measureText(text).width + 10;
          ctx.fillStyle = 'rgba(28,36,24,0.85)'; roundRect(ctx, x - w / 2, y - 92, w, 11, 4, true);
          ctx.fillStyle = '#ffb547'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(text, x, y - 86.2);
        }
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
          ctx.fillStyle = duskK > 0.35 ? '#ffd98a' : '#9fd3e8'; // lamps on as evening falls
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
        if (isWinter()) {
          const snowH = (eave - roofTop) * 0.5;
          ctx.fillStyle = '#f4f8fb'; ctx.fillRect(X - 8, roofTop - 2, W + 16, snowH);
          for (let xx = X - 8; xx < X + W + 8; xx += 12) circle(ctx, xx + 6, roofTop - 2 + snowH, 6);
          ctx.fillStyle = '#dff3ff';
          for (let xx = X - 4; xx < X + W + 4; xx += 9) poly(ctx, [[xx, eave], [xx + 4, eave], [xx + 2, eave + 5 + (xx % 3)]]), ctx.fill();
          ctx.fillStyle = '#f4f8fb'; ctx.fillRect(chimneyX - 9, roofTop - 19, 18, 4);
        }
        if (L && (L.season === 'winter' || L.season === 'autumn')) { // wood smoke
          const tt = (performance.now() / 1000) + chimneyX * 0.01;
          for (let k = 0; k < 4; k++) {
            const ph = (tt * 0.5 + k / 4) % 1;
            ctx.fillStyle = `rgba(230,230,235,${0.45 * (1 - ph)})`;
            circle(ctx, chimneyX + Math.sin(ph * 5 + k) * 5 + ph * 10, roofTop - 18 - ph * 40, 4 + ph * 7);
          }
        }
      },
    };
  }

  function makeTree(x, y) {
    const r = rr(18, 27);
    const trunkH = rr(14, 20);
    const phase = rand() * Math.PI * 2;
    const S = (L && L.season) || 'summer';
    const hue = S === 'winter' ? ['#2b5a3a', '#3a6e48', '#4f8a5a'] : pick(SEASON_LOOK[S].trees);
    const pine = S === 'winter' && rand() < 0.45;            // evergreens keep their needles
    const bare = S === 'winter' && !pine;                     // everything else is bare branches
    const blossom = S === 'spring' && rand() < 0.5 ? Array.from({ length: 14 }, () => [rr(-1, 1), rr(-1, 0.6)]) : null;
    const branches = bare ? Array.from({ length: 5 }, (_, i) => [(i - 2) * 0.45 + rr(-0.15, 0.15), rr(0.6, 1)]) : null;
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
        if (pine) { // a snowy evergreen
          ctx.fillStyle = '#5a3a24'; ctx.fillRect(x - 3, y - 12, 6, 12);
          ctx.save(); if (fade) ctx.globalAlpha = 0.42;
          for (let k = 0; k < 3; k++) {
            const wy = y - 10 - k * r * 0.55, ww = r * (1.05 - k * 0.25);
            ctx.fillStyle = hue[0]; poly(ctx, [[x - ww + sway * 0.3, wy], [x + ww + sway * 0.3, wy], [x + sway, wy - r * 0.9]]); ctx.fill();
            ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - ww * 0.55 + sway * 0.3, wy - r * 0.4], [x + ww * 0.3 + sway * 0.3, wy - r * 0.48], [x + sway, wy - r * 0.9]]); ctx.fill();
          }
          ctx.restore();
          return;
        }
        // trunk
        ctx.fillStyle = '#6b4a2e';
        roundRect(ctx, x - 4.5, y - trunkH - 6, 9, trunkH + 6, 3, true);
        ctx.fillStyle = '#563a22';
        ctx.fillRect(x + 1, y - trunkH - 4, 3, trunkH + 3);
        if (bare) { // winter branches dusted with snow
          ctx.save(); if (fade) ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#5a3a24'; ctx.lineCap = 'round';
          for (const [a, len] of branches) {
            const ex = x + Math.sin(a) * r * len + sway, ey = y - trunkH - 4 - Math.cos(a) * r * 1.3 * len;
            ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - trunkH - 2); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo((x + ex) / 2, (y - trunkH + ey) / 2); ctx.lineTo(ex + Math.sin(a + 0.6) * 8, ey - 6); ctx.stroke();
            ctx.fillStyle = '#f4f8fb'; ellipse(ctx, ex, ey - 1, 3.5, 1.6);
          }
          ctx.restore();
          return;
        }
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
        if (blossom) { ctx.fillStyle = '#ffc6dd'; for (const [bx, by] of blossom) circle(ctx, bx * r * 0.8, by * r * 0.7, 2.2); }
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
        const bc = look().bush;
        ctx.fillStyle = bc[0];
        circle(ctx, x - r * 0.6, y - r * 0.7, r * 0.8);
        circle(ctx, x + r * 0.6, y - r * 0.7, r * 0.8);
        circle(ctx, x, y - r, r);
        ctx.fillStyle = bc[1];
        circle(ctx, x - r * 0.3, y - r * 1.2, r * 0.55);
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; ellipse(ctx, x, y - r * 1.7, r * 0.8, r * 0.35); ellipse(ctx, x - r * 0.6, y - r * 1.3, r * 0.45, r * 0.22); }
        ctx.fillStyle = L && L.season === 'spring' ? '#ffd1e3' : '#d93f5b';
        if (!isWinter()) for (const [dx, dy] of dots) circle(ctx, x + dx, y + dy, 1.8);
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

    // Grass (or snow) base with soft patches
    const LK = look();
    g.fillStyle = LK.grass;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = grng() < 0.5 ? LK.patch[0] : LK.patch[1];
      ellipse(g, gr(0, WORLD_W), gr(0, WORLD_H), gr(30, 90), gr(20, 60));
    }
    // Grass blades
    g.lineCap = 'round';
    for (let i = 0; i < LK.blades; i++) {
      const x = gr(0, WORLD_W), y = gr(0, WORLD_H);
      g.strokeStyle = grng() < 0.6 ? LK.blade[0] : LK.blade[1];
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
    blobs(SAND, LK.sand[0], 25);
    blobs(SAND, LK.sand[1], 23);
    // Water (bridge tiles sit over water too)
    const waterLike = (x, y) => map[idx(x, y)] === WATER || map[idx(x, y)] === BRIDGE;
    g.fillStyle = '#356f9a';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (waterLike(x, y)) circle(g, (x + 0.5) * TILE, (y + 0.5) * TILE, 25);
    g.fillStyle = '#4c93c7';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (waterLike(x, y)) circle(g, (x + 0.5) * TILE, (y + 0.5) * TILE, 23);
    // Ice (frozen ponds and rivers): pale, with cracks and skate marks
    blobs(ICE, '#8fbcd4', 25);
    blobs(ICE, '#cfe8f3', 23);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1;
    forTiles(ICE, (x, y) => { if (grng() < 0.35) { const cx0 = (x + grng()) * TILE, cy0 = (y + grng()) * TILE; g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0 + gr(-14, 14), cy0 + gr(-8, 8)); g.lineTo(cx0 + gr(-14, 14), cy0 + gr(-8, 8)); g.stroke(); } });
    g.strokeStyle = 'rgba(120,160,190,0.35)';
    forTiles(ICE, (x, y) => { if (grng() < 0.15) { const cx0 = (x + 0.5) * TILE; g.beginPath(); g.arc(cx0, (y + 0.5) * TILE, gr(6, 14), 0, Math.PI * 1.4); g.stroke(); } });
    // deeper water in the pond middle
    const P = L.pond;
    if (L.kind === 'seaside') { // foam along the shore, waves further out
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2.5;
      g.beginPath();
      for (let x = 0; x <= MW; x++) { const sy = (L.shore[Math.min(MW - 1, x)] + 1.15) * TILE; if (x === 0) g.moveTo(0, sy); else g.lineTo(x * TILE, sy + Math.sin(x * 1.3) * 3); }
      g.stroke();
      g.fillStyle = 'rgba(30,80,130,0.25)'; g.fillRect(0, (MH - 4) * TILE, WORLD_W, 4 * TILE);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.4;
      for (let i = 0; i < 60; i++) { const wx = gr(0, WORLD_W), wy = gr((MH - 5) * TILE, WORLD_H - 8); g.beginPath(); g.arc(wx, wy, gr(6, 12), Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    } else if (!hasIce()) {
    g.fillStyle = 'rgba(30,80,130,0.35)';
    ellipse(g, P.cx * TILE, P.cy * TILE, (P.rx - 3) * TILE, (P.ry - 2.5) * TILE);
    }
    // lily pads
    for (let i = 0; i < (L.kind === 'seaside' || hasIce() ? 0 : 14); i++) {
      const a = gr(0, Math.PI * 2), d = gr(0.2, 0.75);
      const lx = P.cx * TILE + Math.cos(a) * P.rx * TILE * d, ly = P.cy * TILE + Math.sin(a) * P.ry * TILE * d;
      g.fillStyle = '#4f9a3c';
      g.beginPath(); g.moveTo(lx, ly); g.arc(lx, ly, gr(6, 10), a + 0.4, a + Math.PI * 2 - 0.1); g.closePath(); g.fill();
      if (grng() < 0.35) { g.fillStyle = '#ffc6dd'; circle(g, lx + 2, ly - 2, 3); }
    }

    // Garden soil with furrows
    const G = L.garden;
    g.fillStyle = isWinter() ? '#6e6052' : '#7a5434';
    g.fillRect(G.x * TILE, G.y * TILE, G.w * TILE, G.h * TILE);
    g.fillStyle = isWinter() ? '#e8eef4' : '#6a462a';
    for (let y = G.y * TILE + 10; y < (G.y + G.h) * TILE; y += 16) g.fillRect(G.x * TILE + 4, y, G.w * TILE - 8, 5);

    // Paths
    blobs(PATH, LK.path[0], 25);
    blobs(PATH, LK.path[1], 23);
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

    if (isWinter()) { // snow drifting over the plaza and the edges of paths
      for (let i = 0; i < 500; i++) {
        const x = gr(0, WORLD_W), y = gr(0, WORLD_H), t0 = map[idx(Math.floor(x / TILE), Math.floor(y / TILE))];
        if (t0 !== STONE && t0 !== PATH) continue;
        g.fillStyle = 'rgba(255,255,255,0.6)'; ellipse(g, x, y, gr(6, 18), gr(3, 8));
      }
    }
    if (LK.leaves) { // fallen leaves everywhere
      for (let i = 0; i < LK.leaves; i++) {
        const x = gr(0, WORLD_W), y = gr(0, WORLD_H), t0 = map[idx(Math.floor(x / TILE), Math.floor(y / TILE))];
        if (t0 !== GRASS && t0 !== PATH && t0 !== STONE) continue;
        g.fillStyle = ['#c0392b', '#e07b2a', '#f0a040', '#d9a43a', '#8a5a2e'][Math.floor(grng() * 5)];
        g.beginPath(); g.ellipse(x, y, 3, 1.7, grng() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    // Flowers & clover on open grass
    const petals = LK.petals || [];
    for (let i = 0; i < (petals.length ? LK.flowers : 0); i++) {
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
    let mag = Math.hypot(ix, iy);
    if (player.inWardrobe) {
      if (mag > 0.3 && (player.wardCD || 0) <= 0) exitWardrobe();
      else { ix = 0; iy = 0; mag = 0; }
    }
    player.wardCD = Math.max(0, (player.wardCD || 0) - dt);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const heavy = player.held && player.held.type.heavy;
    const running = input.run && !heavy;
    let maxSpd = heavy ? WALK_SPEED * heavyMult() : running ? runSpeed() : WALK_SPEED;
    if (player.stuffed) maxSpd = Math.min(maxSpd, WALK_SPEED * 0.75); // waddle
    else if (player.sugar > 0) maxSpd *= 1.25;                         // zoom
    const tx = ix * maxSpd, ty = iy * maxSpd;

    const approach = (v, target, rate) => {
      if (v < target) return Math.min(target, v + rate * dt);
      return Math.max(target, v - rate * dt);
    };
    const slip = onIce(player.x, player.y) ? 0.14 : frosty(player.x, player.y) ? 0.3 : 1; // ice: hard to start, harder to stop
    const rateX = (Math.abs(tx) > 0.01 ? ACCEL : FRICTION) * slip;
    const rateY = (Math.abs(ty) > 0.01 ? ACCEL : FRICTION) * slip;
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
    updateEating(dt, mag > 0.2);

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
    online.chit++;
    // You can't chitter with your mouth full: light things fall out
    if (player.held && !player.held.type.heavy) dropHeld(true);
    if (cat && cat.state !== 'flee' && Math.hypot(cat.x - player.x, cat.y - player.y) < chitterRadius()) catFlee(player.x, player.y);
    critterScare(player.x, player.y, chitterRadius() * 1.1);
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
    ctx.translate(0, -p.hop - (p.eating ? Math.abs(Math.sin(t * 16)) * 1.3 : 0));
    const fat = (p.tummy || 0) / 100;
    ctx.scale(1 + fat * 0.28, 1 + fat * 0.06);
    if (p.dir === 'left' || p.dir === 'right') {
      if (p.dir === 'left') ctx.scale(-1, 1);
      drawRaccoonSide(ctx, p, t, moving, bob);
    } else if (p.dir === 'down') {
      drawRaccoonFront(ctx, p, t, moving, bob);
    } else {
      drawRaccoonBack(ctx, p, t, moving, bob);
    }
    if (p.mud > 0) { // caked in mud
      ctx.globalAlpha = Math.min(1, p.mud / 6) * 0.8; ctx.fillStyle = '#6b4a2e';
      ellipse(ctx, -4, -5, 3.4, 2.4); ellipse(ctx, 4, -8, 2.6, 2); ellipse(ctx, 1, -2, 4, 1.8); ellipse(ctx, -1, -12, 2, 1.5);
      ctx.globalAlpha = 1;
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
    const nb = { spring: 18, summer: 14, autumn: 5, winter: 0 }[L.season] ?? 14;
    for (let i = 0; i < nb; i++) {
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
      if (dp < 48 && player.speed > WALK_SPEED * 1.15) b.flee = Math.max(b.flee, 1);
      if (dp < 13 && b.flee <= 0 && started && areaOf(player.x, player.y) === 0) { // caught! (and let go)
        b.flee = 2.5; sparkle(b.x, b.y, b.z); sfx('pick'); player.bubble = { text: 'caught one!', t: 1 };
        completeTask('butterfly');
      }
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
      } else if (q.kind === 'print') { /* fades where it is */ }
      else { q.y += q.vy * dt; q.r += dt * 6; }
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
      const warm = isWinter() ? 'cocoa' : 'teapot';
      const onTable = who.includes('rosa') ? ['cake', warm] : who.includes('mabel') ? ['cookies', warm] : [pick(['bread', 'cheese', 'teapot', 'cookies']), pick(['bread', 'cheese', 'vase'])];
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
    placeSeasonalItems();
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
  let nearWardrobe = null;
  function petChoice() {
    if (!started || paused || player.inWardrobe) return null;
    let best = null, bd = target && !player.held ? itemReach(target) : Infinity;
    if (!player.held) {
      if (dogCanPet() && dogReach() < bd) { best = 'dog'; bd = dogReach(); }
      if (catCanPet() && catReach() < bd) { best = 'cat'; bd = catReach(); }
    }
    // A wardrobe right in front of you (you can't squeeze in with something heavy)
    nearWardrobe = null;
    if (!(player.held && player.held.type.heavy) && areaOf(player.x, player.y) > 0) {
      const [rx, ry] = reachPoint();
      for (const o of solidObjects) {
        if (!o.wardrobe) continue;
        const d = Math.hypot(o.x - rx, o.y - ry);
        if (d < 26 && d - 4 < bd) { best = 'wardrobe'; bd = d - 4; nearWardrobe = o; }
      }
    }
    return best;
  }

  function enterWardrobe(o) {
    if (!o) return;
    // Anyone chasing who sees you climb in knows exactly where you went
    for (const v of villagers) if (v.state === 'chase' && canSeePlayer(v)) v.knowsWardrobe = o;
    player.eating = null;
    Object.assign(player, { inWardrobe: o, x: o.front.x, y: o.front.y, vx: 0, vy: 0, dir: 'up', wardCD: 0.4 });
    o.creak = 1;
    sfx('creak');
  }
  function exitWardrobe() {
    const o = player.inWardrobe;
    if (!o) return;
    player.inWardrobe = null;
    player.wardCD = 0.3;
    Object.assign(player, { x: o.front.x, y: o.front.y, dir: 'down' });
    if (collides(player.x, player.y)) player.y += 10;
    o.creak = 1;
    sfx('creak');
    for (const v of villagers) v.knowsWardrobe = null;
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
    if (player.inWardrobe) { exitWardrobe(); return; }
    if (player.held && !(petChoice() === 'wardrobe')) { dropHeld(false); return; }
    const pc = petChoice();
    if (pc === 'dog') { petDog(); return; }
    if (pc === 'cat') { petCat(); return; }
    if (pc === 'wardrobe') { enterWardrobe(nearWardrobe); return; }
    if (target) { pickUp(target); return; }
    if (canScoop()) scoopSnowball();
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
    it.touched = true;
    if (it.kind === 'goldpot') { completeTask('gold'); run.earned += 3; updateRunBar(); setTimeout(() => toast('+3 \u2726 bonus', 'Pot of gold!', true), 1200); if (L.rainbow) L.rainbow.t = Math.min(L.rainbow.t, 4); }
    if (it.owner && VILLAGER[it.owner] && VILLAGER[it.owner].dozing > 0 && Math.hypot(VILLAGER[it.owner].x - it.x, VILLAGER[it.owner].y - it.y) < 160) completeTask('dozing');
    if (it.kind === 'egg') completeTask('egg');
    if (it.kind === 'paintegg') { run.eggs = (run.eggs || 0) + 1; setProgress('eggs3', run.eggs); }
    if (it.kind === 'sock' || it.kind === 'shirt') completeTask('washing');
    if (it.kind === 'fish' && it.owner === 'ollie') completeTask('fish');
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
    if (!it || player.inWardrobe) return;
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
      if (it.held && !it.heldBy && player.held !== it) Object.assign(it, { held: false, air: true, vz: 0 }); // let go somehow: just drop it
      if (it.held) { const hp = it.heldBy ? (it.heldBy === dog ? heldPosDog() : it.heldBy.type === 'gull' ? heldPosGull(it.heldBy) : heldPosV(it.heldBy)) : heldPos(time); it.x = hp.x; it.y = hp.y; it.z = hp.z; continue; }
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
        if (L.river && Math.abs(it.x - (L.river.x + 0.5) * TILE) < 2.6 * TILE) { // carried downstream
          it.vy = Math.max(it.vy, 26);
          it.floatDist = (it.floatDist || 0) + 26 * dt;
          if (it.floatDist > 240 && !it.kicker) completeTask('downriver');
        }
        it.x += it.vx * dt; it.y += it.vy * dt;
        const f = Math.pow(0.4, dt); it.vx *= f; it.vy *= f;
        it.x += Math.sin(time * 0.4 + it.ph0) * 3 * dt;
        if (tileAt(it.x, it.y) !== WATER) it.floating = false; // washed ashore
        continue;
      }
      if (!it.air) continue;

      it.vz -= 760 * dt; it.z += it.vz * dt;
      if (WIND() && it.z > 2) it.vx += WIND() * dt;
      it.rot += it.spin * dt;
      if (it.kind === 'ball') it.roll += (it.vx + it.vy * 0.5) * dt / 6;
      const nx = it.x + it.vx * dt;
      if (itemBlocked(it, nx, it.y)) { if (Math.abs(it.vx) > 60) sfx('bonk'); it.vx = -it.vx * 0.45; } else it.x = nx;
      const ny = it.y + it.vy * dt;
      if (itemBlocked(it, it.x, ny)) { if (Math.abs(it.vy) > 60) sfx('bonk'); it.vy = -it.vy * 0.45; } else it.y = ny;
      // Thrown things knock snowmen over
      if (L.extra && Math.hypot(it.vx, it.vy) > 80 && it.z < 40) {
        for (const s of L.extra.snowmen) {
          if (s.down || Math.hypot(it.x - s.x, it.y - s.y) > 15) continue;
          s.down = true; s.hitbox = box(s.x - 4, s.y - 4, 8, 4);
          for (let k = 0; k < 14; k++) particles.push({ kind: 'shard', col: '#f4f8fb', x: s.x, y: s.y, z: 20, vx: rr(-60, 60), vy: rr(-30, 30), vz: rr(40, 120), life: 0.9, max: 0.9 });
          sfx('splat');
          lookTowards(s.x, s.y, 220, () => rpick(['My snowman!', 'Who did that?!', 'Aww, the snowman!']));
          completeTask('snowman');
          it.vx *= -0.3; it.vy *= -0.3;
        }
      }
      // Bonk! Thrown things hit villagers
      if (items[i] === it && Math.hypot(it.vx, it.vy) > 80 && it.z < 34 && !it.kicker) { // villagers don't bonk themselves
        for (const v of villagers) {
          if (Math.hypot(it.x - v.x, it.y - v.y) > 11) continue;
          it.vx *= -0.3; it.vy *= -0.3;
          sfx('bonk');
          if (v.id === 'fennick') completeTask('bonk');
          if (v.id === 'rosa' && it.kind === 'boot') completeTask('boot');
          if (it.kind === 'snowball') { completeTask('snowballhit'); shatter(it); items.splice(i, 1); }
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
        if (it.type.fragile && it.vz < (it.kind === 'snowball' ? -40 : -165)) { shatter(it); items.splice(i, 1); continue; } // crash!
        if (it.vz < -110) {
          it.vz = -it.vz * (it.kind === 'ball' ? 0.6 : 0.3);
          it.vx *= 0.75; it.vy *= 0.75;
          sfx(it.type.heavy ? 'thud' : 'bounce');
          puff(it.x, it.y, it.type.heavy ? 5 : 2);
        } else {
          if (it.vz < -30) { sfx(it.type.heavy ? 'thud' : 'tap'); puff(it.x, it.y, it.type.heavy ? 4 : 1); }
          it.vz = 0;
          const f = Math.pow(onIce(it.x, it.y) ? 0.6 : it.kind === 'ball' ? 0.3 : 0.002, dt);
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
    drawItemBody(ctx, it, t);
    ctx.restore();
  }

  function drawPlayerWithHeld(ctx, t) {
    if (player.inWardrobe) return; // only the eyes in the crack show
    const it = player.held;
    if (!it) { drawRaccoon(ctx, player, t); return; }
    const behind = !it.type.heavy && player.dir === 'up';
    const draw = () => {
      ctx.save();
      ctx.translate(it.x, it.y - it.z);
      drawItemBody(ctx, it, t);
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
        const a = L.pier ? { x: L.pier.x + 6, y: L.pier.endY - 26 } : shorePoint(plazaAngleFromPond() + 1.6);
        const b = shorePoint(plazaAngleFromPond() - 1.8);
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
    if (!alert && v.stops && L && areaOf(v.x, v.y) === 0) parrotHear(v, text);
  }

  function displaced(it) {
    const h = it.home;
    if (!h) return false;
    const far = it.kind === 'ball' ? 240 : 20;
    return Math.hypot(it.x - h.x, it.y - h.y) > far || (h.planted && !it.planted) || (h.z > 0 && it.z < h.z - 4);
  }
  const ownedKind = (v, kind) => items.find((it) => it.owner === v.id && it.kind === kind);

  function canSee(v, x, y) {
    if (v.dozing > 0) return false; // fast asleep
    const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy);
    if (d > run.vision * visionMul() || areaOf(v.x, v.y) !== areaOf(x, y)) return false;
    if (d > 45) { const f = DIRV[v.dir]; if ((dx * f[0] + dy * f[1]) / d < 0.2) return false; }
    return lineClear(v.x, v.y - 4, x, y);
  }

  function moveToward(v, x, y, speed, dt) {
    if (v.stops && L && L.weather === 'heatwave') speed *= 0.75; // too hot to hurry
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
    v.dozing = 0;
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
    // Hail: run home. Heatwave: nod off.
    if (v.shelter) {
      v.shelter = false;
      const hi = v.stops.findIndex((s) => s.act === 'home');
      if (hi >= 0 && v.stopIdx !== hi && areaOf(v.x, v.y) === 0) { v.stopIdx = hi; toRoute(v); say(v, rpick(['Ow! Hail!', 'Run for it!', 'Ouch, ouch!']), 1.4); return; }
    }
    if (L.weather === 'heatwave' && !(v.dozing > 0) && stop.act !== 'play' && Math.random() < dt * 0.06) { v.dozing = rr(7, 12); say(v, 'Zzz...', 1.5); }
    if (v.dozing > 0) {
      v.dozing -= dt; v.actT = Math.max(v.actT, 0.5);
      if (!v.bubble && Math.random() < dt * 0.5) say(v, 'z z z', 1.2, false);
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
    if (player.inWardrobe && v.knowsWardrobe === player.inWardrobe) {
      const f = player.inWardrobe.front;
      v.lostT = 0;
      if (Math.hypot(f.x - v.x, f.y - v.y) < 22) { exitWardrobe(); catchPlayer(v); say(v, 'Aha! Found you!', 1.8); return; }
      travel(v, f.x, f.y, v.chase, dt);
      return;
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
      if (L.weather === 'frost') frostSlip(v, dt);

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

    if (isWinter()) { // everyone's wrapped up warm
      ctx.fillStyle = v.scarf || (v.scarf = pick(['#c0392b', '#2e6da4', '#d9a43a', '#3f7f56', '#7a4f8f']));
      roundRect(ctx, -7.5, -25, 15, 4.5, 2, true);
      if (v.dir !== 'up') roundRect(ctx, side ? -6 : 2, -23, 3.5, 9, 1.5, true);
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
    if (wet() && areaOf(v.x, v.y) === 0) { // an umbrella against the rain
      const col = v.umbrella || (v.umbrella = pick(['#e8453c', '#2e6da4', '#f2c14e', '#3f7f56', '#7a4f8f']));
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(5, -14); ctx.lineTo(3, hy - 13); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(3, hy - 12, 15, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(3, hy - 12, 15, Math.PI, Math.PI * 1.25); ctx.lineTo(3, hy - 12); ctx.fill();
    }
    ctx.restore();
  }

  function drawVillagerWithHeld(ctx, v, t) {
    const it = v.held;
    if (!it) { drawVillager(ctx, v, t); return; }
    const behind = !it.type.heavy && v.dir === 'up';
    const drawIt = () => { ctx.save(); ctx.translate(it.x, it.y - it.z); drawItemBody(ctx, it, t); ctx.restore(); };
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
    { id: 'splash', tier: 'Easy', text: 'Throw something in the water', req: ['water'] },
    { id: 'paper', tier: 'Easy', text: 'Swipe a newspaper' },
    { id: 'gnome', tier: 'Easy', text: 'Kidnap a garden gnome' },
    { id: 'lift', tier: 'Easy', text: 'Lift something heavy' },
    { id: 'burgle', tier: 'Easy', text: "Sneak into someone's house" },
    { id: 'hide', tier: 'Easy', text: 'Hide in a bush' },
    { id: 'pet', tier: 'Easy', text: 'Pet Biscuit the dog' },
    { id: 'bed', tier: 'Easy', text: 'Hide under a bed' },
    { id: 'wardrobe', tier: 'Easy', text: 'Hide in a wardrobe' },
    { id: 'chicken', tier: 'Easy', text: 'Chase a chicken' },
    { id: 'baa', tier: 'Easy', text: 'Make the sheep baa', req: ['farm'] },
    { id: 'moo', tier: 'Easy', text: 'Get a moo out of the cow', req: ['farm'] },
    { id: 'headbutt', tier: 'Easy', text: 'Get headbutted by the goat', hint: 'chitter at it', req: ['farm'] },
    { id: 'hedgehog', tier: 'Easy', text: 'Make a hedgehog curl up', hint: 'after dusk' },
    { id: 'rabbit', tier: 'Easy', text: 'Send a rabbit bolting', req: ['notwinter'] },
    { id: 'swan', tier: 'Easy', text: 'Get chased by the swan', hint: 'go near it, then run!', req: ['swan'] },
    { id: 'butterfly', tier: 'Easy', text: 'Catch a butterfly', hint: 'walk, don’t run', req: ['notwinter'] },
    { id: 'whirlwind', tier: 'Easy', text: 'Get swept up in the whirlwind', req: ['whirlwind'] },
    { id: 'mud', tier: 'Easy', text: 'Roll in the mud with the pig', req: ['pig'] },
    { id: 'pepper', tier: 'Easy', text: 'Win Pepper the pup over with a snack', hint: 'drop some food near her' },
    { id: 'quack', tier: 'Easy', text: 'Make a duck quack', req: ['ducks'] },
    { id: 'birds', tier: 'Easy', text: 'Scatter a flock of sparrows', req: ['sparrows'] },
    { id: 'squirrel', tier: 'Easy', text: 'Chase a squirrel up a tree' },
    { id: 'puddle', tier: 'Easy', text: 'Splash through 5 puddles', goal: 5, req: ['puddles'] },
    { id: 'gullscare', tier: 'Easy', text: 'Scare off the seagulls', hint: 'chitter at them', req: ['seaside'] },
    { id: 'egg', tier: 'Easy', text: 'Steal an egg from the hen house' },
    { id: 'skate', tier: 'Easy', text: 'Go skating on the ice', req: ['ice'] },
    { id: 'leafjump', tier: 'Easy', text: 'Jump in a leaf pile', req: ['autumn'] },
    { id: 'washing', tier: 'Easy', text: 'Steal washing off the line', req: ['summer'] },
    { id: 'pier', tier: 'Easy', text: 'Walk to the end of the pier', req: ['seaside'] },
    { id: 'eat', tier: 'Easy', text: "Eat someone's food" },
    { id: 'petcat', tier: 'Easy', text: 'Get a purr out of Marmalade the cat' },
    { id: 'parcel', tier: 'Easy', text: "Swipe one of Percy's parcels" },
    { id: 'ballpond', tier: 'Medium', text: "Get Toby's ball into the water", req: ['water'] },
    { id: 'bonk', tier: 'Medium', text: 'Bonk Mrs. Fennick' },
    { id: 'bertdrop', tier: 'Medium', text: "Make Bertram drop what he's carrying" },
    { id: 'escape', tier: 'Medium', text: 'Escape a chase' },
    { id: 'crops5', tier: 'Medium', text: 'Pull up 5 crops', goal: 5 },
    { id: 'duck', tier: 'Medium', text: "Set Toby's duck afloat", req: ['water'] },
    { id: 'boot', tier: 'Medium', text: 'Give Rosa the boot', hint: 'hit her with the old boot' },
    { id: 'heavythrow', tier: 'Medium', text: 'Throw a crate or barrel' },
    { id: 'heist', tier: 'Medium', text: 'Carry something out of a house' },
    { id: 'bushescape', tier: 'Medium', text: 'Shake off a chaser by hiding in a bush' },
    { id: 'fetch', tier: 'Medium', text: 'Get Biscuit to fetch something you threw' },
    { id: 'outrun', tier: 'Medium', text: 'Outrun Biscuit' },
    { id: 'smash', tier: 'Medium', text: 'Smash something fragile' },
    { id: 'goat', tier: 'Medium', text: "Feed the goat something that isn't food", hint: 'drop it near the goat', req: ['farm'] },
    { id: 'owl', tier: 'Medium', text: 'Chitter back at the owl', hint: 'after dusk' },
    { id: 'fireflies', tier: 'Medium', text: 'Catch 3 fireflies', goal: 3, hint: 'after dusk' },
    { id: 'gold', tier: 'Medium', text: 'Find the pot of gold at the end of the rainbow', hint: 'after the rain clears', req: ['rainbow'] },
    { id: 'dozing', tier: 'Medium', text: "Steal from someone who's dozing in the heat", req: ['heatwave'] },
    { id: 'fox', tier: 'Medium', text: 'Chase the fox away from the hens', hint: 'it sneaks up on the hen house' },
    { id: 'badger', tier: 'Medium', text: 'Get chased off by a badger', hint: 'after dusk', req: ['notwinter'] },
    { id: 'catchfish', tier: 'Medium', text: 'Catch a fish with your paws', hint: 'wait quietly at the water’s edge', req: ['fishpond'] },
    { id: 'soak', tier: 'Medium', text: 'Soak a villager with a puddle splash', hint: 'run through a puddle beside them', req: ['soak'] },
    { id: 'slip', tier: 'Medium', text: 'Make a chaser slip on the frost', hint: 'lead them along the icy paths', req: ['frost'] },
    { id: 'parrot', tier: 'Medium', text: 'Get the parrot shouting “THIEF!”', hint: 'carry someone’s things past it', req: ['parrot'] },
    { id: 'muddy', tier: 'Medium', text: 'Track mud into someone’s house', req: ['pig'] },
    { id: 'mouse', tier: 'Medium', text: 'Scare someone with a mouse', hint: 'chase one towards them, indoors' },
    { id: 'feedducks', tier: 'Medium', text: 'Feed the ducks', hint: 'drop some food near them', req: ['ducks'] },
    { id: 'frog', tier: 'Medium', text: 'Startle a frog into the water', req: ['frogs'] },
    { id: 'gullsnack', tier: 'Medium', text: 'Lose a snack to a seagull', req: ['seaside'] },
    { id: 'dogtree', tier: 'Medium', text: 'Get Biscuit barking up a tree', hint: 'squirrels!' },
    { id: 'snowman', tier: 'Medium', text: 'Knock down a snowman', hint: 'throw something at it', req: ['winter'] },
    { id: 'snowballhit', tier: 'Medium', text: 'Hit someone with a snowball', req: ['winter'] },
    { id: 'leafhide', tier: 'Medium', text: 'Hide in a leaf pile', hint: 'walk in slowly', req: ['autumn'] },
    { id: 'pumpkinsmash', tier: 'Medium', text: 'Smash a pumpkin', req: ['autumn'] },
    { id: 'tulips', tier: 'Medium', text: "Trample Mrs. Fennick's tulips", req: ['spring'] },
    { id: 'lemonade', tier: 'Medium', text: "Drink Rosa's lemonade", req: ['summer'] },
    { id: 'fish', tier: 'Medium', text: "Steal one of Ollie's fish", hint: 'by the pier', req: ['seaside'] },
    { id: 'shells', tier: 'Medium', text: 'Stash 3 seashells in your hideout', goal: 3, req: ['seaside'] },
    { id: 'downriver', tier: 'Medium', text: 'Send something floating down the river', req: ['river', 'water'] },
    { id: 'wardrobehome', tier: 'Medium', text: "Hide in a wardrobe while someone's in the room" },
    { id: 'eatpie', tier: 'Medium', text: "Eat Rosa's pie" },
    { id: 'sugar', tier: 'Medium', text: 'Get a sugar rush', hint: 'eat something sweet' },
    { id: 'stuffed', tier: 'Medium', text: "Eat until you're stuffed" },
    { id: 'catswat', tier: 'Medium', text: 'Watch Marmalade knock something off a table' },
    { id: 'cake', tier: 'Medium', text: "Pinch Rosa's cake", hint: "it's on her kitchen table" },
    { id: 'rod', tier: 'Medium', text: "Steal Ollie's fishing rod" },
    { id: 'stash3', tier: 'Medium', text: 'Stash 3 things in your hideout', goal: 3, group: 'stash' },
    { id: 'picnic', tier: 'Hard', text: 'Ruin the picnic' },
    { id: 'hat', tier: 'Hard', text: 'Steal the hat from under her nose' },
    { id: 'double', tier: 'Hard', text: 'Get chased by two villagers at once' },
    { id: 'garden', tier: 'Hard', text: 'Empty the garden' },
    { id: 'stash5', tier: 'Hard', text: 'Stash 5 things in your hideout', goal: 5, group: 'stash' },
    { id: 'sink3', tier: 'Hard', text: 'Sink 3 things in the water', goal: 3, req: ['water'] },
    { id: 'snatchback', tier: 'Hard', text: 'Steal something back from a villager' },
    { id: 'gnomes', tier: 'Hard', text: 'Stash both garden gnomes' },
    { id: 'bone', tier: 'Hard', text: "Stash Biscuit's bone in your hideout" },
    { id: 'herd', tier: 'Hard', text: 'Herd a sheep out of its field', hint: 'chase it out the gate', req: ['farm'] },
    { id: 'deer', tier: 'Hard', text: 'Sneak right up to a deer', hint: 'freeze when it looks up' },
    { id: 'bees', tier: 'Hard', text: 'Lead a swarm of bees to a villager', hint: 'bump the beehive, then run', req: ['bees'] },
    { id: 'hens', tier: 'Hard', text: 'Get every hen squawking at once' },
    { id: 'eggs3', tier: 'Hard', text: 'Find 3 painted eggs', goal: 3, req: ['spring'] },
    { id: 'eat5', tier: 'Hard', text: 'Eat 5 things', goal: 5 },
    { id: 'eatfront', tier: 'Hard', text: "Finish someone's food while they watch" },
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
    Object.assign(run, { day, eaten: 0, visited: new Set(), done: new Set(), progress: {}, cropPulls: 0, sunk: 0, strikes: 0, earned: 0, over: false, ended: false, checkT: 0, shake: 0 });
    run.maxStrikes = 3 + lvl('fur');
    run.timeTotal = Math.min(540, 360 + 30 * (day - 1)) + 60 * lvl('day');
    run.timeLeft = run.timeTotal;
    run.villagerSpeed = Math.min(1.4, 1 + 0.06 * (day - 1));
    run.vision = 170 * Math.min(1.35, 1 + 0.06 * (day - 1)) * (1 - 0.15 * lvl('step'));
  }

  // Can this village support a task? (seasons, water, village kind)
  function taskFits(t) {
    for (const r of t.req || []) {
      if (r === 'water' && !hasOpenWater()) return false;
      if (r === 'ice' && !hasIce()) return false;
      if (SEASON_NAMES.includes(r) && L.season !== r) return false;
      if (KIND_NAMES.includes(r) && L.kind !== r) return false;
      if (r === 'ducks' && L.kind === 'seaside') return false;
      if (r === 'sparrows' && ['rain', 'storm', 'snowstorm', 'downpour'].includes(L.weather)) return false;
      if (r === 'frogs' && !(L.kind !== 'seaside' && hasOpenWater() && (wet() || L.season === 'spring'))) return false;
      if (r === 'puddles' && !(planHas(WET_SET) && !isWinter())) return false;
      if (r === 'soak' && !(planHas(['rain', 'storm', 'downpour']) && !isWinter())) return false;
      if (r === 'whirlwind' && !planHas(['windy'])) return false;
      if (r === 'frost' && !planHas(['frost'])) return false;
      if (r === 'bees' && !L.hive) return false;
      if (r === 'pig' && !L.mud) return false;
      if (r === 'parrot' && !L.perch) return false;
      if (r === 'fishpond' && !(L.kind !== 'seaside' && hasOpenWater())) return false;
      if (r === 'swan' && L.kind === 'seaside') return false;
      if (r === 'notwinter' && isWinter()) return false;
      if (r === 'farm' && !L.paddock) return false;
      if (r === 'rainbow' && !rainbowPossible()) return false;
      if (r === 'heatwave' && !planHas(['heatwave'])) return false;
    }
    return true;
  }
  // Deal the day's hand of tasks once the village exists: harder days ask for more
  function dealTasks() {
    const day = run.day;
    const counts = { Easy: 3, Medium: Math.min(4, 2 + Math.floor((day - 1) / 2)), Hard: Math.min(3, 1 + Math.floor(day / 3)) };
    const groups = new Set();
    const chosen = [];
    const finale = rpick(TASK_POOL.filter((t) => t.final && taskFits(t)));
    if (finale.group) groups.add(finale.group);
    for (const tier of ['Easy', 'Medium', 'Hard']) {
      let n = counts[tier];
      // this place and season's own tasks first, so every day feels different
      const pool = TASK_POOL.filter((t) => t.tier === tier && taskFits(t)).sort(() => Math.random() - 0.5)
        .sort((a, b) => (b.req ? 1 : 0) - (a.req ? 1 : 0) || 0);
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
    if (run.tasks.every((t) => run.done.has(t.id))) {
      run.over = true;
      setTimeout(() => endRun('win'), 1600);
    } else if (!task.final && regularTasksDone()) {
      const fin = run.tasks.find((t) => t.final);
      setTimeout(() => { sfx('fanfare'); toast(fin.text, 'Finale unlocked!', true); renderTodo(); }, 1600);
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
    setProgress('shells', stashed.filter((it) => it.kind === 'shell').length);
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
      toast('No strikes left', 'Caught!', true);
      setTimeout(() => endRun('caught'), 1200);
    } else {
      toast(`${left} strike${left === 1 ? '' : 's'} left`, 'Caught!', true);
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
    save.earnedTotal = (save.earnedTotal || 0) + total;
    save.runs++;
    if (win) { save.bestDay = Math.max(save.bestDay, run.day); save.day = run.day + 1; } else save.day = 1;
    writeSave();
    postScore();
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
    run.seed = dailySeed(save.day); // the same village for everyone on this day number today
    newVillage(run.seed);
    dealTasks();
    joinVillageRoom(run.seed);
    showRunCard();
  }
  function showRunCard() {
    buildTodo();
    updateRunBar();
    document.getElementById('rc-day').textContent = `Day ${run.day}`;
    document.getElementById('rc-town').textContent = L.name;
    document.getElementById('rc-season').textContent = `${cap(L.season)}${L.weather !== 'clear' ? ', ' + WEATHER_LABEL[L.weather].toLowerCase() : ''} \u00b7 ${L.kind === 'seaside' ? 'Seaside' : L.kind === 'river' ? 'Riverside' : 'Pond'} village`;
    const later = (L.weatherPlan || []).slice(1).find((s) => s.w !== L.weather);
    const forecast = later ? `Forecast: ${later.w === 'clear' ? 'clearing up' : WEATHER_LABEL[later.w].toLowerCase()} later.` : '';
    document.getElementById('rc-tip').textContent = [WEATHER_TIP[L.weather], forecast, SEASON_TIP[L.season], KIND_TIP[L.kind]].filter(Boolean).join(' ');
    const m = Math.floor(run.timeTotal / 60), s = run.timeTotal % 60;
    document.getElementById('rc-tasks').textContent = `${run.tasks.length} tasks`;
    document.getElementById('rc-time').textContent = `${m}:${String(s).padStart(2, '0')} until sunset`;
    document.getElementById('rc-strikes').textContent = `${run.maxStrikes} strikes`;
    updateOnlineHud();
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
    document.getElementById('rb-town').textContent = L ? `${L.name} \u00b7 ${cap(L.season)}${L.weather !== 'clear' ? ', ' + WEATHER_LABEL[L.weather].toLowerCase() : ''}` : '';
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
  // A pop-up at the top. Finished tasks are struck through; news (`plain`) isn't.
  function toast(text, label, plain = false) {
    toastEl.classList.toggle('plain', plain);
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
        const bc = look().bush;
        ctx.fillStyle = shade(bc[0], -0.1);
        for (const [bx, by, br] of blobs) circle(ctx, bx, by + 4, br);
        circle(ctx, 0, 2, r * 0.7);
        ctx.fillStyle = bc[0];
        for (const [bx, by, br] of blobs) circle(ctx, bx - 1, by - 1, br * 0.85);
        circle(ctx, 0, -2, r * 0.62);
        ctx.fillStyle = bc[1];
        circle(ctx, -r * 0.3, -r * 0.32, r * 0.3); circle(ctx, r * 0.25, -r * 0.4, r * 0.2);
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; ellipse(ctx, -2, -r * 0.62, r * 0.75, r * 0.3); ellipse(ctx, r * 0.45, -r * 0.3, r * 0.35, r * 0.16); }
        else { ctx.fillStyle = '#ffe9f0'; for (const [fx, fy] of flowers) circle(ctx, fx, fy + r * 0.75, 1.8); }
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
    for (const o of solidObjects) if (o.wardrobe && o.creak > 0) o.creak = Math.max(0, o.creak - dt * 2.5);
    if (player.inWardrobe) {
      player.hidden = true; player.hidingIn = player.inWardrobe;
      completeTask('wardrobe');
      if (villagers.some((v) => areaOf(v.x, v.y) === areaOf(player.x, player.y))) completeTask('wardrobehome');
      const pill = document.getElementById('hidden-pill');
      if (pill.hidden === !paused) pill.hidden = paused;
      return;
    }
    const wasHidden = player.hidden;
    let bush = null;
    for (const o of hideBushes) if (o.contains(player.x, player.y)) { bush = o; break; }
    if (bush && player.speed > 20) bush.rustle = 0.3;
    if (bush && bush !== player.hidingIn) {
      if (bush.kind === 'leafpile' && player.speed > 60) scatterLeaves(bush);
      else { sfx('rustle'); bush.rustle = 0.4; }
    }
    player.hidingIn = bush;
    const heavy = player.held && player.held.type.heavy;
    player.hidden = !!bush && !heavy && player.speed < WALK_SPEED * 1.15 && !(bush.kind === 'leafpile' && bush.h < 0.6);
    if (player.hidden && bush.kind === 'bed' && villagers.some((v) => areaOf(v.x, v.y) === areaOf(player.x, player.y))) completeTask('bedhome');
    if (player.hidden && !wasHidden) {
      completeTask(bush.kind === 'bed' ? 'bed' : bush.kind === 'leafpile' ? 'leafhide' : 'hide');
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
    if (player.inWardrobe) return false;
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
  const dogCanPet = () => dog && !player.held && dog.state !== 'chase' && dog.state !== 'catchase' && dog.state !== 'squirrelchase' && dog.state !== 'happy' && dog.state !== 'fetch' && dog.state !== 'return' && Math.hypot(dog.x - player.x, dog.y - player.y) < 26;

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
    const smellR = isFood(player.held) ? 190 : 140; // food smells delicious
    const smells = outside && started && !d.held && d.calm <= 0 && (hasBone ? dp < 230 : d.friendly <= 0 && dp < smellR);
    d.t -= dt;

    switch (d.state) {
      case 'sit': case 'wander': {
        if (smells) { d.state = 'alert'; d.t = 0.7; d.path = null; dogSay('?', 0.8); break; }
        // A squirrel on the ground? Chase it up a tree.
        const sq = critters.find((c) => c.type === 'squirrel' && !c.tree && Math.hypot(c.x - d.x, c.y - d.y) < 130);
        if (sq && d.calm <= 0 && d.friendly <= 0 && lineClear(d.x, d.y, sq.x, sq.y)) {
          d.state = 'squirrelchase'; d.target = sq; d.chaseT = 5; d.barkT = 0; d.path = null; dogSay('!', 0.8);
          break;
        }
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
      case 'squirrelchase': {
        d.chaseT -= dt; d.barkT -= dt;
        const sq = d.target;
        if (!sq || sq.tree || d.chaseT <= 0) { if (d.state === 'squirrelchase') { d.state = 'sit'; d.t = 2; d.calm = 6; } break; }
        if (d.barkT <= 0) { dogBark(sq.x, sq.y); d.barkT = 0.9; }
        dogWalkTo(sq.x, sq.y, 165, dt);
        break;
      }
      case 'treebark': { // yapping up at the tree the squirrel escaped into
        d.t -= dt; d.barkT -= dt;
        if (d.barkT <= 0) { dogBark(d.x, d.y - 30); d.barkT = 0.8; completeTask('dogtree'); }
        if (d.t <= 0) { d.state = 'sit'; d.t = 2; d.calm = 8; d.target = null; }
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
    const drawIt = () => { if (!it) return; ctx.save(); ctx.translate(it.x, it.y - it.z); drawItemBody(ctx, it, t); ctx.restore(); };
    if (it && dog.dir === 'up') drawIt();
    drawDog(ctx, dog, t);
    if (it && dog.dir !== 'up') drawIt();
  }

  // ---------------------------------------------------------------------------
  // Villagers turn to look at a noise (a bark, a smash) within earshot
  // ---------------------------------------------------------------------------
  function lookTowards(x, y, radius, lineFor) {
    radius *= hearingMul(); // rain and wind drown out noises
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
    if (it.kind === 'snowball') { // a soft white splat, not a crash
      for (let k = 0; k < 8; k++) particles.push({ kind: 'shard', col: '#f4f8fb', x: it.x, y: it.y, z: Math.max(2, it.z), vx: rr(-40, 40), vy: rr(-20, 20), vz: rr(30, 80), life: 0.5, max: 0.5 });
      sfx('splat');
      return;
    }
    if (it.kind === 'pumpkin') completeTask('pumpkinsmash');
    sfx('crash');
    const col = { vase: '#4f6fa8', teapot: '#7fb3d5', frame: '#c9a33a', cookies: '#dcebf5', milk: '#f7f7f2', pumpkin: '#f2913a', egg: '#f2e6d0', paintegg: '#ffd166' }[it.kind] || '#dddddd';
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
  // Eating people's food. Hold something edible and press Q (or "eat") to
  // munch: stand still, bite by bite. Fills your tummy; too much and you're
  // stuffed (rounder, slower, no running). Sweets give a sugar rush. Munching
  // is noisy, and owners are outraged if they watch you finish their food.
  // ---------------------------------------------------------------------------
  const FOOD = {
    pie: { bites: 3, fill: 45, sweet: true }, cake: { bites: 3, fill: 45, sweet: true }, cookies: { bites: 3, fill: 30, sweet: true },
    sandwich: { bites: 2, fill: 35 }, bread: { bites: 2, fill: 30 }, cheese: { bites: 2, fill: 25 },
    apple: { bites: 1, fill: 14 }, carrot: { bites: 1, fill: 12 }, cabbage: { bites: 2, fill: 18 }, pumpkin: { bites: 3, fill: 40 },
    milk: { bites: 1, fill: 15, drink: true },
  };
  const BITE_TIME = 0.85;
  const isFood = (it) => !!(it && FOOD[it.kind]);

  // Draw an item, shrunk a little for every bite taken out of it
  function drawItemBody(ctx, it, t) {
    const f = FOOD[it.kind];
    if (f && it.bites) {
      const s = 1 - 0.55 * (it.bites / f.bites);
      ctx.scale(s, s);
    }
    it.type.draw(ctx, it, t);
  }

  function startEating() {
    const it = player.held;
    if (!started || paused || !isFood(it)) return;
    if (player.eating) { player.eating = null; return; } // press again to stop
    player.eating = { it, t: BITE_TIME };
    player.bubble = null;
  }

  function crumbs(x, y, z, n, col) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 15 + Math.random() * 35;
      particles.push({ kind: 'shard', col, x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 30 + Math.random() * 50, life: 0.6, max: 0.6 });
    }
  }
  const CRUMB = { pie: '#e2a85a', cake: '#fff4f6', cookies: '#c98a3e', sandwich: '#e9c27a', bread: '#e2a85a', cheese: '#f2c94e', apple: '#f4e6cc', carrot: '#e07b2a', cabbage: '#8fd16a', pumpkin: '#f2913a', milk: '#ffffff' };

  function takeBite() {
    const it = player.eating.it, f = FOOD[it.kind];
    it.bites = (it.bites || 0) + 1;
    player.tummy = Math.min(100, (player.tummy || 0) + f.fill / f.bites);
    crumbs(it.x, it.y, it.z, f.drink ? 0 : 6, CRUMB[it.kind] || '#e2a85a');
    sfx(f.drink ? 'gulp' : 'chomp');
    // Munching is noisy: anyone close by turns to look
    lookTowards(player.x, player.y, 95, () => rpick(["What's that munching?", 'Who’s chewing?', 'Hm? Crunching?']));
    if (it.bites < f.bites) { player.eating.t = BITE_TIME; return; }
    finishFood(it, f);
  }

  function finishFood(it, f) {
    player.eating = null;
    player.held = null;
    const idx = items.indexOf(it);
    if (idx >= 0) items.splice(idx, 1);
    crumbs(player.x, player.y, 8, 10, CRUMB[it.kind] || '#e2a85a');
    run.eaten = (run.eaten || 0) + 1;
    completeTask('eat');
    setProgress('eat5', run.eaten);
    if (it.kind === 'pie') completeTask('eatpie');
    if (it.kind === 'lemonade') completeTask('lemonade');
    if (f.sweet) { player.sugar = 12; completeTask('sugar'); toast('Sugar rush!', 'Zoom zoom', true); }
    // Did the owner watch you finish it?
    const owner = it.owner && VILLAGER[it.owner];
    if (owner && canSee(owner, player.x, player.y - 6) && Math.hypot(owner.x - player.x, owner.y - player.y) < run.vision) {
      say(owner, `You ATE my ${it.type.name}!`, 2.4);
      owner.hopV = 150; owner.hop = 0.01;
      completeTask('eatfront');
    }
    if (player.tummy >= 80 && !player.stuffed) { player.stuffed = true; completeTask('stuffed'); player.bubble = { text: '*BURP*', t: 1.3 }; sfx('burp'); }
    else player.bubble = { text: rpick(['nom!', 'mmm!', '*munch*', 'delish.']), t: 1.1 };
  }

  function updateEating(dt, moving) {
    // Digest slowly; stuffed until the tummy settles
    player.tummy = Math.max(0, (player.tummy || 0) - 1.1 * dt);
    if (player.stuffed && player.tummy < 50) { player.stuffed = false; player.bubble = { text: 'ahh, better', t: 1.2 }; }
    player.sugar = Math.max(0, (player.sugar || 0) - dt);
    if (player.sugar > 0 && player.speed > 40 && Math.random() < 0.4) particles.push({ kind: 'spark', x: player.x + rr(-6, 6), y: player.y, z: rr(4, 16), vx: 0, vy: 0, vz: 20, life: 0.4, max: 0.4 });
    const e = player.eating;
    if (!e) return;
    if (player.held !== e.it || moving) { player.eating = null; return; } // dropped it, or walked off
    e.t -= dt;
    if (Math.random() < dt * 8) crumbs(e.it.x, e.it.y, e.it.z, 1, CRUMB[e.it.kind] || '#e2a85a');
    if (e.t <= 0) takeBite();
  }

  // Little "Q eat" hint over your head when you're carrying food
  function drawEatHint(ctx, t) {
    if (!started || paused || !isFood(player.held) || player.eating || player.bubble) return;
    const text = isTouch ? 'tap eat' : 'Q eat';
    ctx.font = '800 7px Nunito, sans-serif';
    const w = ctx.measureText(text).width + 10;
    const x = player.x, y = player.y - player.hop - 46 + Math.sin(t * 4) * 1.2;
    ctx.fillStyle = 'rgba(28,36,24,0.85)'; roundRect(ctx, x - w / 2, y - 6, w, 11, 4, true);
    ctx.fillStyle = '#ffb547'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 0.2);
  }

  function updateBellyHud() {
    const fill = document.getElementById('rb-tummy-fill');
    if (!fill) return;
    const pct = Math.round(player.tummy || 0);
    if (fill.dataset.v !== String(pct)) { fill.dataset.v = String(pct); fill.style.width = `${pct}%`; }
    document.getElementById('rb-tummy').classList.toggle('full', !!player.stuffed);
    const pills = { 'stuffed-pill': player.stuffed && !paused, 'sugar-pill': player.sugar > 0 && !paused };
    for (const [id, show] of Object.entries(pills)) { const el = document.getElementById(id); if (el.hidden === show) el.hidden = !show; }
  }

  // ---------------------------------------------------------------------------
  // Online. Two parts, both optional (the game is complete without them):
  //  - Play together live: villages are "daily" (same seed for everyone on the
  //    same day number today, UTC), and each village has its own live room.
  //    You see the other raccoons there move, carry, chitter, eat and hide.
  //    Only raccoons are shared; each player's villagers and items are their own.
  //  - A shared leaderboard of best days, kept in the artifact's database.
  // ---------------------------------------------------------------------------
  const online = {
    lobby: null, room: null, user: null, db: null, myId: null,
    peers: new Map(), names: {}, colors: {}, lastSent: '', sendT: 0, chit: 0,
    scores: [], scoresState: 'off', lastScore: '', scoreBlocked: false, unsubPeers: null,
  };

  function dailySeed(day) {
    const d = new Date().toISOString().slice(0, 10);
    let h = 2166136261;
    for (const ch of `${d}#${day}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  async function initOnline() {
    const use = window.claude && typeof window.claude.use === 'function' ? window.claude.use : null;
    if (!use) { renderBoard(); return; }
    try {
      const [room, user, db] = await Promise.all([use('room'), use('user'), use('db')]);
      online.lobby = room; online.user = user; online.db = db;
      if (user) online.myId = await user.id();
      if (db) subscribeScores(); else renderBoard();
      if (room) joinVillageRoom(run.seed);
    } catch (_) { renderBoard(); }
  }

  async function joinVillageRoom(seed) {
    if (!online.lobby) return;
    const name = 'village-' + seed;
    if (online.room && online.room.name === name) return;
    const old = online.room;
    online.room = null; online.peers.clear(); updateOnlineHud();
    if (old) { try { if (online.unsubPeers) online.unsubPeers(); await old.leave(); } catch (_) { /* already gone */ } }
    try {
      const r = await online.lobby.join(name);
      if (run.seed !== seed) { r.leave().catch(() => {}); return; } // a newer day started meanwhile
      online.room = r;
      online.lastSent = '';
      online.unsubPeers = r.onPeers((ch) => syncPeers(ch.peers), () => { online.room = null; online.peers.clear(); updateOnlineHud(); });
    } catch (_) { online.room = null; }
  }

  // Read other raccoons' presence (untrusted: validate everything)
  function syncPeers(list) {
    const seen = new Set();
    for (const p of list) {
      if (p.isMe || p.kind !== 'viewer') continue;
      const pr = p.presence || {};
      if (typeof pr.x !== 'number' || typeof pr.y !== 'number' || !isFinite(pr.x) || !isFinite(pr.y)) continue;
      seen.add(p.peer);
      let r = online.peers.get(p.peer);
      if (!r) { r = { x: pr.x, y: pr.y, walk: 0, hop: 0, hopV: 0, speed: 0, bubble: null, chit: +pr.chit || 0 }; online.peers.set(p.peer, r); }
      r.tx = clamp(pr.x, 0, WORLD_W); r.ty = clamp(pr.y, 0, MH_ALL * TILE);
      r.dir = ['up', 'down', 'left', 'right'].includes(pr.dir) ? pr.dir : 'down';
      r.held = typeof pr.held === 'string' && Object.prototype.hasOwnProperty.call(ITEM, pr.held) ? pr.held : null;
      r.hidden = pr.hidden === true; r.eating = pr.eat === true;
      r.tummy = clamp(Number(pr.tummy) || 0, 0, 100);
      r.by = p.by || (typeof pr.uid === 'string' && pr.uid.length < 80 ? pr.uid : null);
      const chit = Number(pr.chit) || 0;
      if (chit !== r.chit) {
        r.chit = chit; r.hopV = 140; r.hop = 0.01; r.bubble = { text: rpick(CHITTERS), t: 1.2 };
        if (Math.hypot(r.x - player.x, r.y - player.y) < 300) sfx('chitter');
      }
    }
    for (const k of [...online.peers.keys()]) if (!seen.has(k)) online.peers.delete(k);
    refreshNames();
    updateOnlineHud();
  }

  async function refreshNames() {
    if (!online.user) return;
    const ids = new Set();
    for (const r of online.peers.values()) if (r.by) ids.add(r.by);
    for (const s of online.scores) ids.add(s.id);
    if (!ids.size) return;
    try {
      const ps = await online.user.profiles([...ids]);
      for (const id of ids) if (ps[id]) { online.names[id] = ps[id].name || ''; online.colors[id] = ps[id].color; }
      renderBoard();
    } catch (_) { /* names are optional */ }
  }
  const peerName = (r) => (r.by && online.names[r.by]) || 'A raccoon';

  function updateOnline(dt) {
    for (const r of online.peers.values()) {
      const ox = r.x, oy = r.y;
      if (Math.hypot(r.tx - r.x, r.ty - r.y) > 200) { r.x = r.tx; r.y = r.ty; } // teleports (doors, new day)
      else { const k = Math.min(1, dt * 10); r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; }
      r.speed = dt > 0 ? Math.hypot(r.x - ox, r.y - oy) / dt : 0;
      if (r.speed > 4) r.walk += dt * r.speed * 0.11;
      if (r.hop > 0 || r.hopV) { r.hopV -= 600 * dt; r.hop += r.hopV * dt; if (r.hop <= 0) { r.hop = 0; r.hopV = 0; } }
      if (r.bubble) { r.bubble.t -= dt; if (r.bubble.t <= 0) r.bubble = null; }
    }
    // Share where I am (absolute state, a dozen times a second at most, only when it changed)
    online.sendT -= dt;
    if (!online.room || online.sendT > 0 || !started) return;
    online.sendT = 0.08;
    const me = {
      x: Math.round(player.x), y: Math.round(player.y), dir: player.dir,
      held: player.held ? player.held.kind : null, hidden: !!player.hidden, eat: !!player.eating,
      tummy: Math.round(player.tummy || 0), chit: online.chit, day: run.day, uid: online.myId,
    };
    const key = JSON.stringify(me);
    if (key === online.lastSent) return;
    online.lastSent = key;
    online.room.presence(me).catch(() => {});
  }

  function drawRemote(ctx, r, t) {
    if (r.hidden) { // just a pair of eyes in the leaves
      const ey = r.y - 15;
      ctx.fillStyle = MASK; ellipse(ctx, r.x, ey, 7, 2.8);
      ctx.fillStyle = '#ffffff'; circle(ctx, r.x - 3, ey, 1.6); circle(ctx, r.x + 3, ey, 1.6);
      ctx.fillStyle = NOSE; circle(ctx, r.x - 3, ey, 0.8); circle(ctx, r.x + 3, ey, 0.8);
      return;
    }
    const p = { x: r.x, y: r.y, dir: r.dir, speed: r.speed, walk: r.walk, hop: r.hop, tummy: r.tummy, eating: r.eating };
    const drawHeld = () => {
      if (!r.held) return;
      const ty = ITEM[r.held];
      const fake = { kind: r.held, type: ty, bites: 0, planted: false, roll: 0 };
      let hx = r.x, hz = 7;
      if (ty.heavy) hz = 29; else if (r.dir === 'right') hx += 17; else if (r.dir === 'left') hx -= 17; else hz = r.dir === 'up' ? 17 : 5;
      ctx.save(); ctx.translate(hx, r.y + (r.dir === 'down' ? 1 : 0) - hz - r.hop); ty.draw(ctx, fake, t); ctx.restore();
    };
    const behind = r.held && !ITEM[r.held].heavy && r.dir === 'up';
    if (behind) drawHeld();
    drawRaccoon(ctx, p, t);
    // a scarf in their own colour, so friends are easy to tell apart
    ctx.fillStyle = (r.by && online.colors[r.by]) || '#7fe3ff';
    ctx.beginPath(); ctx.ellipse(r.x + (r.dir === 'left' ? -7 : r.dir === 'right' ? 7 : 0), r.y - 13 - r.hop, 5.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (!behind) drawHeld();
  }
  function drawRemoteTag(ctx, r) {
    const name = peerName(r);
    ctx.font = '800 7px Nunito, sans-serif';
    const w = ctx.measureText(name).width + 10;
    const y = r.y - r.hop - (r.hidden ? 26 : 40);
    ctx.fillStyle = 'rgba(28,36,24,0.8)'; roundRect(ctx, r.x - w / 2, y - 6, w, 11, 4, true);
    ctx.fillStyle = (r.by && online.colors[r.by]) || '#7fe3ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, r.x, y - 0.2);
    if (r.bubble) drawBubbleAt(ctx, r.x, y - 14, r.bubble);
  }

  function updateOnlineHud() {
    const chip = document.getElementById('rb-online');
    if (!chip) return;
    const n = online.peers.size;
    chip.hidden = n === 0;
    chip.textContent = n === 1 ? '1 other raccoon here' : `${n} other raccoons here`;
    const rc = document.getElementById('rc-online');
    if (rc) rc.textContent = online.lobby
      ? (n ? `${n === 1 ? '1 other raccoon is' : n + ' other raccoons are'} in this village right now.` : 'Friends on the same day number today get this same village and play alongside you.')
      : '';
  }

  // Leaderboard ------------------------------------------------------------------
  function subscribeScores() {
    online.scoresState = 'loading';
    renderBoard();
    const timer = setTimeout(() => { if (online.scoresState === 'loading') { online.scoresState = 'slow'; renderBoard(); } }, 10000);
    try {
      online.db.collection('scores').orderBy('best', 'desc').limit(20).onSnapshot((snap) => {
        if (!snap.metadata.fromCache) clearTimeout(timer);
        online.scores = snap.docs.map((d) => {
          const v = d.data() || {};
          return { id: d.id, best: clamp(Math.floor(Number(v.best) || 0), 0, 9999), shinies: clamp(Math.floor(Number(v.shinies) || 0), 0, 1e7) };
        }).filter((s) => s.best > 0);
        online.scoresState = 'ok';
        refreshNames();
        renderBoard();
      }, () => { clearTimeout(timer); online.scoresState = 'error'; renderBoard(); });
    } catch (_) { clearTimeout(timer); online.scoresState = 'error'; renderBoard(); }
  }
  async function postScore() {
    if (!online.db || !online.myId || !save.bestDay) return;
    const body = { best: save.bestDay, shinies: save.earnedTotal || 0, runs: save.runs, updatedAt: new Date().toISOString() };
    const key = JSON.stringify([body.best, body.shinies, body.runs]);
    if (key === online.lastScore) return;
    try { await online.db.doc('scores/' + online.myId).set(body); online.lastScore = key; online.scoreBlocked = false; }
    catch (_) { online.scoreBlocked = true; }
    renderBoard();
  }
  function renderBoard() {
    const list = document.getElementById('den-board'), note = document.getElementById('board-note');
    if (!list || !note) return;
    list.innerHTML = '';
    const notes = {
      off: 'The leaderboard shows up when the game is opened from its claude.ai link.',
      loading: 'Loading scores…',
      slow: 'Can’t reach the leaderboard right now.',
      error: 'The leaderboard isn’t available here.',
    };
    if (online.scoresState !== 'ok') { note.textContent = notes[online.scoresState] || notes.off; return; }
    online.scores.slice(0, 10).forEach((s, i) => {
      const li = document.createElement('li');
      if (s.id === online.myId) li.className = 'me';
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1);
      const nm = document.createElement('span'); nm.className = 'who';
      nm.textContent = (online.names[s.id] || 'A raccoon') + (s.id === online.myId ? ' (you)' : '');
      const best = document.createElement('span'); best.className = 'best'; best.textContent = `Day ${s.best}`;
      const sh = document.createElement('span'); sh.className = 'sh'; sh.textContent = `${s.shinies} ✦`;
      li.append(rank, nm, best, sh);
      list.appendChild(li);
    });
    note.textContent = online.scoreBlocked
      ? 'Your score couldn’t be saved. Ask the game’s owner for Contributor access.'
      : online.scores.length ? 'Best day reached. Finish a day to get on the board.' : 'No scores yet. Finish a day to get on the board.';
  }

  // ---------------------------------------------------------------------------
  // Seasons and village kinds. Each daily village rolls a season (spring,
  // summer, autumn, winter) and a kind (pond, river, seaside); both change how
  // it looks and what there is to do.
  // ---------------------------------------------------------------------------
  const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
  const KIND_NAMES = ['pond', 'river', 'seaside'];
  const SEASON_LOOK = {
    spring: { grass: '#7cba55', patch: ['rgba(110,170,70,0.35)', 'rgba(175,220,120,0.3)'], blade: ['rgba(70,135,50,0.55)', 'rgba(175,225,120,0.5)'], blades: 9000,
      flowers: 1200, petals: ['#ffffff', '#ffd1e3', '#ff9ec4', '#c9b3ff', '#fff3a8'], path: ['#b08b55', '#cfac72'], sand: ['#c9b57e', '#e3cf96'],
      trees: [['#3f8a35', '#56a646', '#7cc45a'], ['#3a7d40', '#55a05a', '#86c870']], blossom: '#ffc6dd', bush: ['#3a7d34', '#56a646'] },
    summer: { grass: '#6fae4b', patch: ['rgba(90,150,60,0.35)', 'rgba(140,195,90,0.25)'], blade: ['rgba(60,120,45,0.55)', 'rgba(160,210,110,0.5)'], blades: 9000,
      flowers: 700, petals: ['#ffffff', '#ffd166', '#ff8fab', '#b39cff', '#ff7a59'], path: ['#b08b55', '#cfac72'], sand: ['#c9b57e', '#e3cf96'],
      trees: [['#2f6b2a', '#3f8a35', '#5aa848'], ['#2b5f33', '#3a7d40', '#55a05a'], ['#3b6b25', '#4e8c2f', '#6daa42']], bush: ['#2f6b2a', '#479a3c'] },
    autumn: { grass: '#9ea64f', patch: ['rgba(150,140,60,0.35)', 'rgba(195,175,90,0.3)'], blade: ['rgba(120,110,50,0.5)', 'rgba(205,185,100,0.45)'], blades: 7000,
      flowers: 0, leaves: 1100, path: ['#a8824e', '#c7a26a'], sand: ['#c2ad78', '#dcc690'],
      trees: [['#a8461e', '#d0662a', '#f0a040'], ['#8a5a1e', '#c08a2a', '#e8c04a'], ['#7a2e1e', '#b5442a', '#e07a3a'], ['#3b6b25', '#6a8a2f', '#a8aa42']], bush: ['#8a4a1e', '#c0782a'] },
    winter: { grass: '#e9eff5', patch: ['rgba(190,205,225,0.45)', 'rgba(255,255,255,0.7)'], blade: ['rgba(90,105,85,0.45)', 'rgba(150,160,140,0.4)'], blades: 1600,
      flowers: 0, path: ['#a59d90', '#c9c2b7'], sand: ['#cfcabd', '#e4e0d6'], trees: null, bush: ['#3a6a4a', '#4f8a5a'] },
  };
  const look = () => SEASON_LOOK[(L && L.season) || 'summer'];
  const isWinter = () => !!L && L.season === 'winter';
  const hasIce = () => isWinter() && L.kind !== 'seaside';
  const hasOpenWater = () => !L || !(isWinter() && L.kind !== 'seaside');

  const SEASON_TIP = {
    spring: "Spring: Mrs. Fennick's tulips are out, and someone has hidden painted eggs around the village.",
    summer: 'Summer: washing is drying on the lines, and Rosa has made lemonade.',
    autumn: 'Autumn: leaf piles are perfect for jumping in, and for hiding in.',
    winter: 'Winter: press E on the snow to scoop a snowball. Watch out, the ice is slippery.',
  };
  const KIND_TIP = { pond: '', river: 'A river runs right through the village.', seaside: 'The village sits by the sea, with a pier.' };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  // --- Seasonal objects ---------------------------------------------------------
  function makeSnowman(x, y) {
    const o = {
      kind: 'snowman', x, y, down: false, hitbox: box(x - 9, y - 8, 18, 9),
      bounds: { l: x - 26, r: x + 26, t: y - 60, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(60,80,110,0.2)'; ellipse(ctx, x + 5, y, 14, 4.5); },
      draw(ctx) {
        if (o.down) { // a sad heap with the hat on top
          ctx.fillStyle = '#f4f8fb'; ellipse(ctx, x - 4, y - 5, 12, 6); ellipse(ctx, x + 7, y - 4, 8, 5);
          ctx.fillStyle = '#2b2d33'; ctx.fillRect(x + 2, y - 12, 10, 3); ctx.fillRect(x + 4, y - 18, 6, 6);
          ctx.fillStyle = '#e07b2a'; poly(ctx, [[x - 10, y - 6], [x - 3, y - 7], [x - 3, y - 5]]); ctx.fill();
          return;
        }
        ctx.fillStyle = '#f4f8fb'; circle(ctx, x, y - 10, 11); circle(ctx, x, y - 27, 8.5); circle(ctx, x, y - 40, 6.5);
        ctx.fillStyle = 'rgba(160,185,215,0.5)'; circle(ctx, x + 3, y - 7, 7); circle(ctx, x + 2.5, y - 25, 5);
        ctx.fillStyle = '#2b2d33'; for (const k of [-31, -27, -23]) circle(ctx, x, y + k, 1.1);
        circle(ctx, x - 2.4, y - 42, 1); circle(ctx, x + 2.4, y - 42, 1);
        ctx.fillStyle = '#e07b2a'; poly(ctx, [[x, y - 40], [x + 7, y - 39], [x, y - 38]]); ctx.fill();
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(x - 7, y - 47, 14, 2.5); ctx.fillRect(x - 4.5, y - 55, 9, 8);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 4.5, y - 50, 9, 2);
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 7, y - 28); ctx.lineTo(x - 17, y - 34); ctx.moveTo(x + 7, y - 28); ctx.lineTo(x + 16, y - 36); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 7, y - 35, 14, 3); ctx.fillRect(x + 3, y - 35, 3, 9);
      },
    };
    return o;
  }

  function makeLeafPile(x, y) {
    const r = rr(18, 22);
    const leaves = Array.from({ length: 34 }, () => [rr(-1, 1), rr(-1, 0.2), pick(['#c0392b', '#e07b2a', '#f0a040', '#d9a43a', '#8a5a2e']), rr(0, Math.PI)]);
    const o = {
      kind: 'leafpile', x, y, r, h: 1, hitbox: null, rustle: 0,
      bounds: { l: x - r * 1.4, r: x + r * 1.4, t: y - r * 1.4, b: y + 6 },
      contains(px, py) { const dx = (px - x) / (r * 0.85), dy = (py - (y - 6)) / (r * 0.5); return dx * dx + dy * dy < 1; },
      draw(ctx, t) {
        const hh = 0.35 + o.h * 0.65;
        const sh = o.rustle > 0 ? Math.sin(t * 40) * 1.2 : 0;
        ctx.fillStyle = '#9a5a26'; ellipse(ctx, x + sh, y - 4, r * 1.05, r * 0.42);
        for (const [lx, ly, col, a] of leaves) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(x + sh + lx * r * 0.95, y - 4 + ly * r * 0.75 * hh, 3.2, 1.8, a, 0, Math.PI * 2); ctx.fill();
        }
        if (player.hidden && player.hidingIn === o) {
          const ey = player.y - 10;
          ctx.fillStyle = '#ffffff'; circle(ctx, player.x - 3, ey, 1.6); circle(ctx, player.x + 3, ey, 1.6);
          ctx.fillStyle = NOSE; circle(ctx, player.x - 3, ey, 0.8); circle(ctx, player.x + 3, ey, 0.8);
        }
      },
    };
    return o;
  }

  function makeFlowerBed(x, y) { // Mrs. Fennick's tulips (x, y = top-left in px)
    const w = 2.6 * TILE, hgt = 1.1 * TILE;
    const tulips = Array.from({ length: 16 }, (_, i) => [8 + (i % 8) * (w - 16) / 7 + rr(-2, 2), 10 + Math.floor(i / 8) * 14 + rr(-2, 2), pick(['#e8453c', '#ff6f91', '#ffd166', '#b39cff'])]);
    const o = {
      kind: 'flowerbed', x: x + w / 2, y: y + hgt, trample: 0, hitbox: null, rect: { x, y, w, h: hgt },
      bounds: { l: x - 6, r: x + w + 6, t: y - 16, b: y + hgt + 6 },
      draw(ctx) {
        ctx.fillStyle = '#6a462a'; roundRect(ctx, x, y, w, hgt, 6, true);
        ctx.fillStyle = '#7a5434'; roundRect(ctx, x + 2, y + 2, w - 4, hgt - 4, 5, true);
        for (const [tx, ty, col] of tulips) {
          const flat = o.trample;
          ctx.strokeStyle = '#3f8a35'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(x + tx, y + ty + 6); ctx.lineTo(x + tx + flat * 6, y + ty - 6 * (1 - flat)); ctx.stroke();
          ctx.fillStyle = col;
          if (flat > 0.5) { ctx.beginPath(); ctx.ellipse(x + tx + 6, y + ty + 2, 3, 1.4, 0.3, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.beginPath(); ctx.ellipse(x + tx + flat * 6, y + ty - 8 * (1 - flat), 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill(); }
        }
      },
    };
    return o;
  }

  function makeWashLine(x, y) { // posts 3.5 tiles apart, rope at ~26px
    const w = 3.5 * TILE;
    return {
      kind: 'washline', x: x + w / 2, y, hitbox: box(x - 3, y - 5, 6, 6), hitbox2: box(x + w - 3, y - 5, 6, 6),
      bounds: { l: x - 10, r: x + w + 10, t: y - 40, b: y + 6 },
      draw(ctx) {
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 2, y - 32, 4, 32); ctx.fillRect(x + w - 2, y - 32, 4, 32);
        ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.quadraticCurveTo(x + w / 2, y - 24, x + w, y - 30); ctx.stroke();
      },
    };
  }

  function makeCoop(x, y) {
    return {
      kind: 'coop', x, y, hitbox: box(x - 26, y - 14, 52, 15),
      bounds: { l: x - 34, r: x + 34, t: y - 60, b: y + 10 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ctx.fillRect(x - 22, y - 2, 56, 7); },
      draw(ctx) {
        ctx.fillStyle = '#8a5a32'; ctx.fillRect(x - 22, y - 8, 4, 8); ctx.fillRect(x + 18, y - 8, 4, 8);
        ctx.fillStyle = '#b5523b'; ctx.fillRect(x - 24, y - 38, 48, 30);
        ctx.fillStyle = '#9c4430'; for (let k = 0; k < 5; k++) ctx.fillRect(x - 24 + k * 10, y - 38, 1.5, 30);
        ctx.fillStyle = '#7a3e2c'; poly(ctx, [[x - 30, y - 36], [x, y - 56], [x + 30, y - 36]]); ctx.fill();
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(x - 30, y - 38, 60, 3);
        ctx.fillStyle = '#2b1a10'; roundRect(ctx, x - 7, y - 26, 14, 18, 6, true);
        ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 4, y - 8); ctx.lineTo(x - 10, y + 6); ctx.stroke();
        ctx.fillStyle = '#e6c56a'; ellipse(ctx, x + 14, y - 1, 9, 3); // straw
      },
    };
  }

  function makeBoat(x, y) {
    return {
      kind: 'boat', x, y, hitbox: box(x - 26, y - 10, 52, 11),
      bounds: { l: x - 34, r: x + 34, t: y - 26, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,60,0.2)'; ellipse(ctx, x + 4, y, 30, 6); },
      draw(ctx) {
        ctx.fillStyle = '#3f6fa8'; ctx.beginPath(); ctx.moveTo(x - 30, y - 16); ctx.lineTo(x + 30, y - 16); ctx.lineTo(x + 22, y); ctx.lineTo(x - 24, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(x - 30, y - 16, 60, 3);
        ctx.fillStyle = '#8a5a32'; ctx.fillRect(x - 18, y - 13, 6, 10); ctx.fillRect(x + 8, y - 13, 6, 10);
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 30, y - 2); ctx.stroke();
      },
    };
  }

  // Find a free spot on open grass near (tx, ty) for something w×h tiles
  function freeSpotNear(tx, ty, w = 1, h = 1, spread = 3) {
    for (let ring = 0; ring <= spread; ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = Math.floor(tx + dx), y = Math.floor(ty + dy);
        let ok = true;
        for (let j = y; j < y + h && ok; j++) for (let i = x; i < x + w; i++) if (isUsed(i, j) || getT(i, j) !== GRASS) { ok = false; break; }
        if (ok) { reserve(x, y, w, h); return [x, y]; }
      }
    }
    return null;
  }
  function randomFreeSpot(w = 1, h = 1) {
    for (let n = 0; n < 80; n++) { const s = freeSpotNear(rr(5, MW - 6), rr(5, MH - 6), w, h, 0); if (s) return s; }
    return null;
  }

  // Objects that depend on the season (called while building the map)
  function placeSeasonal() {
    const T = TILE, g = L.garden, P = L.plaza;
    L.extra = { snowmen: [], leafpiles: [], beds: [], lines: [] };
    // Hen house beside the garden, for every village
    {
      const tries = [[g.x - 5, g.y + 3], [g.x + 13, g.y + 3], [g.x + 4, g.gateTop ? g.y + 12 : g.y - 5], [g.x - 5, g.y + 7]];
      let s = null;
      for (const [tx, ty] of tries) { s = freeSpotNear(tx, ty, 3, 3, 2); if (s) break; }
      if (!s) s = randomFreeSpot(3, 3);
      if (s) { L.coop = { x: (s[0] + 1.5) * T, y: (s[1] + 1.6) * T }; objects.push(makeCoop(L.coop.x, L.coop.y)); }
    }
    if (L.kind === 'seaside') { // a rowing boat pulled up on the beach
      for (let n = 0; n < 30; n++) {
        const x = Math.floor(rr(6, MW - 6));
        if (Math.abs(x - L.roadX) < 5) continue;
        const y = L.shore[x] - 1;
        if (getT(x, y) === SAND && getT(x + 1, y) === SAND && getT(x - 1, y) === SAND) { objects.push(makeBoat((x + 0.5) * T, (y + 0.8) * T)); reserve(x - 1, y, 3, 1); break; }
      }
    }
    if (L.season === 'winter') {
      for (const [tx, ty] of [[P.x - 3, P.y + 8], [P.x + 14, P.y + 3], [g.x + 5, g.gateTop ? g.y - 3 : g.y + 12]]) {
        const s = freeSpotNear(tx, ty, 1, 1, 3) || randomFreeSpot();
        if (s) { const o = makeSnowman((s[0] + 0.5) * T, (s[1] + 0.85) * T); objects.push(o); L.extra.snowmen.push(o); }
      }
    } else if (L.season === 'autumn') {
      for (let n = 0; n < 7; n++) {
        const h = L.houses[n % L.houses.length];
        const s = n < 4 ? freeSpotNear(h.x + h.w + 1, h.y + h.h + 1, 2, 1, 3) : randomFreeSpot(2, 1);
        if (s) { const o = makeLeafPile((s[0] + 1) * T, (s[1] + 0.9) * T); objects.push(o); L.extra.leafpiles.push(o); }
      }
    } else if (L.season === 'spring') {
      const fh = L.houses[L.homes ? L.homes.fennick : 0] || L.houses[0];
      for (const [tx, ty] of [[fh.x - 4, fh.y + fh.h - 1], [fh.x + fh.w + 1, fh.y + 1], [P.x + 4.5, P.y - 3]]) {
        const s = freeSpotNear(tx, ty, 3, 2, 3);
        if (s) { const o = makeFlowerBed(s[0] * T, s[1] * T + 6); objects.push(o); L.extra.beds.push(o); }
      }
    } else { // summer: washing lines beside a couple of houses
      for (let n = 0; n < Math.min(2, L.houses.length); n++) {
        const h = L.houses[(n * 3 + 1) % L.houses.length];
        const s = freeSpotNear(h.x + h.w + 1, h.y + 1, 4, 2, 3) || freeSpotNear(h.x - 5, h.y + 1, 4, 2, 3);
        if (s) { const o = makeWashLine(s[0] * T + 4, (s[1] + 1.6) * T); objects.push(o); objects.push({ ...o, kind: 'washpost', hitbox: o.hitbox2, draw() {}, bounds: o.bounds }); L.extra.lines.push({ o, house: h }); }
      }
    }
  }

  // --- New items -------------------------------------------------------------------
  Object.assign(ITEM, {
    snowball: { name: 'snowball', h: 8, r: 4, fragile: true, draw(c) { c.fillStyle = '#f4f8fb'; circle(c, 0, -4, 4); c.fillStyle = 'rgba(160,185,215,0.6)'; circle(c, 1.2, -3, 2.4); } },
    egg: { name: 'egg', h: 7, r: 3, fragile: true, draw(c) { c.fillStyle = '#f2e6d0'; ellipse(c, 0, -3.5, 3, 3.8); c.fillStyle = 'rgba(255,255,255,0.6)'; circle(c, -1, -5, 1); } },
    paintegg: { name: 'painted egg', h: 7, r: 3, fragile: true, draw(c, it) {
      const col = it.color || (it.color = pick(['#ff8fab', '#7fe3ff', '#ffd166', '#b39cff', '#8fd16a']));
      c.fillStyle = col; ellipse(c, 0, -3.5, 3, 3.8);
      c.fillStyle = '#ffffff'; c.fillRect(-3, -4, 6, 1); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-3, -2.4, 6, 0.8);
    } },
    cocoa: { name: 'mug of cocoa', h: 10, r: 4, draw(c) {
      c.strokeStyle = '#c0392b'; c.lineWidth = 1.4; c.beginPath(); c.arc(4, -5, 2.2, -1.2, 1.2); c.stroke();
      c.fillStyle = '#c0392b'; c.fillRect(-4, -9, 8, 9); c.fillStyle = '#5a3a24'; ellipse(c, 0, -9, 4, 1.4);
      c.fillStyle = '#ffffff'; circle(c, -1.2, -9.5, 1.1); circle(c, 1.4, -9.8, 1);
    } },
    lemonade: { name: 'jug of lemonade', h: 14, r: 5, draw(c) {
      c.fillStyle = 'rgba(255,240,140,0.9)'; roundRect(c, -5, -12, 10, 12, 2, true);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-4, -11, 2, 9);
      c.fillStyle = '#f2c14e'; circle(c, 1.5, -7, 2); c.strokeStyle = '#d8d0c0'; c.lineWidth = 1.4; c.beginPath(); c.arc(5.5, -7, 3, -1.3, 1.3); c.stroke();
    } },
    sock: { name: 'stripy sock', h: 11, r: 4, draw(c) {
      c.fillStyle = '#e8453c'; roundRect(c, -2.5, -11, 5, 9, 2, true); roundRect(c, -2.5, -4, 7, 4, 2, true);
      c.fillStyle = '#ffffff'; c.fillRect(-2.5, -9, 5, 1.4); c.fillRect(-2.5, -6, 5, 1.4);
    } },
    shirt: { name: 'shirt', h: 13, r: 7, draw(c, it) {
      c.fillStyle = it.color || (it.color = pick(['#4f6fa8', '#ffd166', '#8fd16a', '#ff8fab']));
      poly(c, [[-4, -13], [4, -13], [8, -10], [6, -7], [4, -8.5], [4, 0], [-4, 0], [-4, -8.5], [-6, -7], [-8, -10]]); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(-1, -13, 2, 2);
    } },
    shell: { name: 'seashell', h: 5, r: 4, draw(c) {
      c.fillStyle = '#f7d9c4'; c.beginPath(); c.arc(0, -2, 4.5, Math.PI, 0); c.closePath(); c.fill();
      c.strokeStyle = '#d9a08a'; c.lineWidth = 0.7; for (const a of [-1.2, -0.6, 0, 0.6, 1.2]) { c.beginPath(); c.moveTo(0, -0.5); c.lineTo(Math.sin(a) * 4.3, -2 - Math.cos(a) * 4); c.stroke(); }
    } },
    fish: { name: 'fish', h: 5, r: 7, draw(c) {
      c.fillStyle = '#9ab4c4'; ellipse(c, 0, -3, 6.5, 2.6);
      c.beginPath(); c.moveTo(-5.5, -3); c.lineTo(-9, -6); c.lineTo(-9, 0); c.closePath(); c.fill();
      c.fillStyle = '#1d1d22'; circle(c, 4, -3.6, 0.7); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(-3, -4.5, 6, 1);
    } },
  });
  ITEM.pumpkin.fragile = true;
  Object.assign(FOOD, {
    egg: { bites: 1, fill: 10 }, paintegg: { bites: 1, fill: 10 }, fish: { bites: 2, fill: 22 },
    cocoa: { bites: 1, fill: 15, sweet: true, drink: true }, lemonade: { bites: 2, fill: 20, sweet: true, drink: true },
  });
  Object.assign(CRUMB, { egg: '#f2e6d0', paintegg: '#ffd166', fish: '#9ab4c4', cocoa: '#5a3a24', lemonade: '#fff08c' });

  // Items that depend on the season / kind (called at the end of placeItems)
  function placeSeasonalItems() {
    const T = TILE, P = L.plaza;
    if (L.coop) for (let k = 0; k < 3; k++) placeFree('egg', L.coop.x + 18 + k * 6, L.coop.y + 4, { owner: 'bertram' });
    if (L.season === 'winter') {
      for (const s of L.extra.snowmen) for (let k = 0; k < 2; k++) placeFree('snowball', s.x + 16 + k * 8, s.y + 6);
    }
    if (L.season === 'spring') { // painted eggs tucked by hiding bushes
      const spots = shuffled(objects.filter((o) => o.kind === 'hidebush'));
      for (let k = 0; k < Math.min(5, spots.length); k++) placeFree('paintegg', spots[k].x + rr(-26, 26), spots[k].y + rr(6, 14));
    }
    if (L.season === 'summer') {
      addItem('lemonade', L.picnic.x * T - 12, L.picnic.y * T + 1, { z: 19, owner: 'rosa' });
      for (const { o, house } of L.extra.lines) {
        const owner = residentsOf(house)[0] || null;
        const x0 = o.x - 1.75 * T;
        ['shirt', 'sock', 'shirt', 'sock'].forEach((k, i) => addItem(k, x0 + 18 + i * 24, o.y + 2, { z: 18 - Math.sin((i + 0.5) / 4 * Math.PI) * 4, owner }));
      }
    }
    if (L.kind === 'seaside') {
      for (let k = 0; k < 6; k++) { const x = Math.floor(rr(5, MW - 5)); placeFree('shell', (x + 0.5) * T, (L.shore[x] - 0.3) * T); }
      for (let k = 0; k < 3; k++) placeFree('fish', L.pier.x + (k - 1) * 12 + 24, L.pier.baseY - 10, { owner: 'ollie' });
    }
  }

  // --- Hens ------------------------------------------------------------------------
  let hens = [];
  function spawnHens() {
    hens = [];
    if (!L.coop) return;
    for (let k = 0; k < 4; k++) {
      hens.push({ x: L.coop.x + rr(-30, 40), y: L.coop.y + rr(14, 34), dir: 'down', walk: 0, moving: false, panic: 0, fleeA: 0, alarmCD: 0, bubble: null, tx: 0, ty: 0, wait: rr(0, 2), peck: 0, path: null });
    }
  }
  function updateHens(dt) {
    let panicking = 0;
    const outside = areaOf(player.x, player.y) === 0;
    for (const h of hens) {
      h.moving = false;
      h.panic = Math.max(0, h.panic - dt); h.alarmCD = Math.max(0, h.alarmCD - dt);
      if (h.bubble) { h.bubble.t -= dt; if (h.bubble.t <= 0) h.bubble = null; }
      const d = Math.hypot(player.x - h.x, player.y - h.y);
      if (outside && started && d < 60 && player.speed > 25 && !player.hidden) {
        if (h.panic <= 0.4) {
          h.bubble = { text: rpick(['BAWK!', 'Bwaak!', 'BUK-BUK!']), t: 1 };
          for (let k = 0; k < 3; k++) particles.push({ kind: 'shard', col: '#ffffff', x: h.x, y: h.y, z: 10, vx: rr(-30, 30), vy: rr(-15, 15), vz: rr(40, 90), life: 0.8, max: 0.8 });
          if (d < 260) sfx('cluck');
          completeTask('chicken');
        }
        h.panic = 1.6;
        h.fleeA = Math.atan2(h.y - player.y, h.x - player.x) + rr(-0.5, 0.5);
        if (player.speed > 110 && h.alarmCD <= 0) {
          h.alarmCD = 4;
          lookTowards(h.x, h.y, 230, (v) => (v.id === 'bertram' ? 'Oi! Leave my hens be!' : "What's got the hens going?"));
        }
      }
      if (h.panic > 0) {
        panicking++;
        moveToward(h, h.x + Math.cos(h.fleeA) * 40, h.y + Math.sin(h.fleeA) * 40, 140, dt);
      } else {
        h.wait -= dt;
        if (h.wait > 0) { h.peck += dt * 9; continue; }
        if (!h.tx || Math.hypot(h.tx - h.x, h.ty - h.y) < 4) {
          h.tx = L.coop.x + rr(-60, 60); h.ty = L.coop.y + rr(10, 60);
          if (navBlockedPt(h.tx, h.ty)) { h.tx = h.x; h.ty = h.y; }
          h.wait = rr(0.6, 2.5);
        }
        moveToward(h, h.tx, h.ty, 26, dt);
      }
    }
    if (hens.length >= 3 && panicking >= hens.length) completeTask('hens');
  }
  function drawHen(ctx, h, t) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.fillStyle = 'rgba(20,30,10,0.22)'; ellipse(ctx, 0, 0, 7, 2.5);
    const flap = h.panic > 0 ? Math.sin(t * 40) * 3 : 0;
    const hop = h.panic > 0 ? Math.abs(Math.sin(t * 20)) * 3 : 0;
    ctx.translate(0, -hop);
    if (h.dir === 'left') ctx.scale(-1, 1);
    const pk = h.panic <= 0 && h.wait > 0 ? Math.max(0, Math.sin(h.peck)) * 3 : 0;
    ctx.strokeStyle = '#e8a33a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-1.5, -4); ctx.lineTo(-2, 0); ctx.moveTo(1.5, -4); ctx.lineTo(2, 0); ctx.stroke();
    ctx.fillStyle = '#f7f3ea'; ellipse(ctx, 0, -7, 6, 4.5);
    ctx.fillStyle = '#e8e2d4'; ellipse(ctx, -1, -7 - flap * 0.3, 3.5, 2.5 + Math.abs(flap) * 0.4); // wing
    ctx.fillStyle = '#f7f3ea'; poly(ctx, [[-5, -9], [-8, -13], [-4, -11]]); ctx.fill(); // tail
    const hx = 4.5, hy = -11 + pk;
    ctx.fillStyle = '#f7f3ea'; circle(ctx, hx, hy, 2.8);
    ctx.fillStyle = '#e8453c'; circle(ctx, hx - 0.5, hy - 2.8, 1.2); circle(ctx, hx + 0.8, hy - 2.6, 1); ellipse(ctx, hx + 1.6, hy + 2, 0.8, 1.2);
    ctx.fillStyle = '#e8a33a'; poly(ctx, [[hx + 2.4, hy - 0.6], [hx + 5, hy + 0.2], [hx + 2.4, hy + 0.8]]); ctx.fill();
    ctx.fillStyle = '#1d1d22'; circle(ctx, hx + 0.8, hy - 0.6, 0.6);
    ctx.restore();
  }

  // --- Weather, tint, footprints, ice, snowballs ----------------------------------------
  // --- Weather ----------------------------------------------------------------------
  // Each village rolls a weather that suits its season. It changes what villagers can
  // see and hear, brings puddles, lightning, fog, wind, and decides which animals are out.
  const WEATHER_TABLE = {
    spring: [['clear', 40], ['rain', 28], ['drizzle', 15], ['downpour', 8], ['storm', 10], ['windy', 15], ['hail', 6]],
    summer: [['clear', 50], ['rain', 12], ['drizzle', 6], ['downpour', 8], ['storm', 16], ['windy', 10], ['heatwave', 20]],
    autumn: [['clear', 25], ['rain', 20], ['drizzle', 12], ['downpour', 8], ['fog', 22], ['windy', 20], ['frost', 15], ['storm', 5], ['hail', 6]],
    winter: [['clear', 35], ['snowstorm', 28], ['fog', 25], ['frost', 25]],
  };
  const WEATHER_LABEL = { clear: 'Clear', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog', windy: 'Windy', snowstorm: 'Snowstorm', hail: 'Hail', heatwave: 'Heatwave', drizzle: 'Drizzle', downpour: 'Downpour', frost: 'Frost' };
  const WEATHER_TIP = {
    rain: 'It’s raining: villagers huddle under umbrellas and can’t see or hear as well. Splash in the puddles.',
    storm: 'Thunderstorm! Every thunderclap makes the villagers jump.',
    fog: 'Thick fog: villagers can barely see past their noses. Perfect sneaking weather.',
    windy: 'Windy: thrown things get blown off course, and watch out for the whirlwind.',
    snowstorm: 'Snowstorm: you can hardly see a thing, and neither can they.',
    hail: 'Hail! The villagers are running for cover.',
    heatwave: 'Heatwave: the villagers are slow and sleepy, and some will doze off.',
    drizzle: 'A light drizzle: the frogs are out, and the puddles are filling up.',
    downpour: 'A downpour! Huge puddles everywhere: run through one next to a villager to soak them.',
    frost: 'A hard frost: the paths are slippery, and villagers chasing you might go flying.',
    clear: '',
  };
  function pickWeather(season) {
    const table = WEATHER_TABLE[season];
    let r = rand() * table.reduce((a, [, w]) => a + w, 0);
    for (const [name, w] of table) { r -= w; if (r <= 0) return name; }
    return 'clear';
  }
  const wet = () => !!L && WET_SET.includes(L.weather);
  const WIND = () => (L && L.weather === 'windy' ? 70 : L && L.weather === 'snowstorm' ? 40 : 0);
  // How far villagers can see / hear in this weather
  const visionMul = () => ({ rain: 0.82, storm: 0.75, fog: 0.55, snowstorm: 0.62, hail: 0.85, drizzle: 0.93, downpour: 0.68 }[L && L.weather] || 1);
  const hearingMul = () => ({ rain: 0.75, storm: 0.7, snowstorm: 0.75, hail: 0.65, drizzle: 0.9, downpour: 0.6 }[L && L.weather] || 1);

  const weather = [];
  const fx = { flash: 0, nextBolt: 8, thunderAt: -1, ambience: null };
  function spawnWeather() {
    weather.length = 0;
    const W = L.weather, S = L.season;
    let n = { winter: 150, autumn: 34, spring: 44 }[S] || 0;
    if (W === 'rain') n = 230; else if (W === 'storm') n = 300; else if (W === 'snowstorm') n = 380; else if (W === 'windy') n = Math.max(n, 70);
    else if (W === 'hail') n = 200; else if (W === 'heatwave') n = 0;
    else if (W === 'drizzle') n = 110; else if (W === 'downpour') n = 440;
    for (let i = 0; i < n; i++) weather.push({ x: Math.random(), y: Math.random(), s: Math.random(), ph: Math.random() * 6, col: pick(['#c0392b', '#e07b2a', '#f0a040', '#d9a43a']) });
    fx.flash = 0; fx.nextBolt = rr(6, 12); fx.thunderAt = -1;
    startAmbience();
  }
  function drawWeather(ctx, left, top, viewW, viewH, t, dt) {
    const S = L.season, W = L.weather;
    const rainy = WET_SET.includes(W);
    const wind = W === 'windy' ? 0.25 : W === 'snowstorm' ? 0.12 : W === 'storm' ? 0.06 : 0;
    ctx.lineCap = 'round';
    for (const w of weather) {
      if (W === 'hail') { // hailstones pelting down, bouncing
        w.y += (1.4 + w.s * 0.5) * dt; w.x += 0.03 * dt;
        if (w.y > 1.05) { w.y = -0.05; w.x = Math.random(); }
        const hx = left + w.x * viewW, hy = top + w.y * viewH;
        ctx.fillStyle = 'rgba(245,250,255,0.9)'; circle(ctx, hx, hy, 1.1 + w.s * 0.9);
        continue;
      }
      if (rainy) { w.y += (0.9 + w.s * 0.5) * (W === 'downpour' ? 1.3 : W === 'drizzle' ? 0.7 : 1) * dt; w.x += (0.08 + wind) * dt; }
      else if (S === 'winter') { w.y += (0.05 + w.s * 0.05) * (W === 'snowstorm' ? 2.6 : 1) * dt; w.x += (Math.sin(t * 0.8 + w.ph) * 0.004 + wind) * dt; }
      else { w.y += (0.03 + w.s * 0.03) * dt; w.x += (Math.sin(t * 0.6 + w.ph) * 0.02 + 0.01 + wind) * dt; }
      if (w.y > 1.05) { w.y = -0.05; w.x = Math.random(); }
      if (w.x > 1.05) w.x = -0.05; else if (w.x < -0.05) w.x = 1.05;
      const x = left + w.x * viewW, y = top + w.y * viewH;
      if (rainy) {
        const len = W === 'drizzle' ? 0.45 : W === 'downpour' ? 1.5 : 1;
        ctx.strokeStyle = `rgba(200,220,240,${(0.35 + w.s * 0.3) * (W === 'drizzle' ? 0.7 : 1)})`; ctx.lineWidth = W === 'downpour' ? 1.3 : 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (2 + wind * 30) * len, y - (9 + w.s * 5) * len); ctx.stroke();
      } else if (S === 'winter') { ctx.fillStyle = `rgba(255,255,255,${0.55 + w.s * 0.4})`; circle(ctx, x, y, 0.8 + w.s * 1.6); }
      else {
        ctx.fillStyle = S === 'spring' ? (w.s > 0.5 ? '#ffd1e3' : '#ffffff') : S === 'summer' ? '#8fd16a' : w.col;
        ctx.beginPath(); ctx.ellipse(x, y, S === 'spring' ? 2 : 3, S === 'spring' ? 1.3 : 1.7, t * 2 + w.ph, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function drawSeasonTint(ctx, left, top, viewW, viewH) {
    const W = L && L.weather;
    const tint = W === 'storm' ? 'rgb(168,176,198)' : W === 'rain' ? 'rgb(200,208,222)' : W === 'snowstorm' ? 'rgb(222,230,246)'
      : W === 'hail' ? 'rgb(208,214,228)' : W === 'heatwave' ? 'rgb(255,232,200)'
      : W === 'drizzle' ? 'rgb(216,222,232)' : W === 'downpour' ? 'rgb(166,176,198)' : W === 'frost' ? 'rgb(230,238,255)'
      : { winter: 'rgb(226,234,252)', autumn: 'rgb(255,238,214)', spring: 'rgb(255,250,248)' }[L && L.season];
    if (tint) {
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint;
      ctx.fillRect(left - 10, top - 10, viewW + 20, viewH + 20); ctx.restore();
    }
  }
  // Screen-space weather overlays: fog with a clear patch around you, lightning flashes
  function drawWeatherOverlay(ctx, indoors, left, top) {
    const W = L && L.weather;
    if (!indoors && (W === 'fog' || W === 'snowstorm')) {
      const px = (player.x - left) * zoom, py = (player.y - 12 - top) * zoom; // the clear patch follows you
      const inner = Math.min(vw, vh) * (W === 'fog' ? 0.16 : 0.22), outer = Math.min(vw, vh) * (W === 'fog' ? 0.52 : 0.7);
      const g = ctx.createRadialGradient(px, py, inner, px, py, outer);
      const c = W === 'fog' ? '226,232,236' : '236,242,250';
      g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},${W === 'fog' ? 0.9 : 0.6})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, fx.flash)})`; ctx.fillRect(0, 0, vw, vh); }
  }
  // Puddles (rainy days): splash through them, noisily
  function placePuddles() {
    L.puddles = [];
    if (!wet() || isWinter()) return;
    const big = L.weather === 'downpour';
    for (let n = 0; n < 300 && L.puddles.length < (big ? 22 : 14); n++) {
      const tx = Math.floor(rr(4, MW - 4)), ty = Math.floor(rr(4, MH - 4)), t0 = getT(tx, ty);
      if (t0 !== PATH && t0 !== GRASS && t0 !== STONE) continue;
      if (t0 === GRASS && rand() < 0.7) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (L.puddles.some((p) => Math.hypot(p.x - x, p.y - y) < 90)) continue;
      L.puddles.push({ x, y, rx: big ? rr(24, 38) : rr(14, 22), ry: big ? rr(10, 15) : rr(6, 9), splashT: 0 });
    }
  }
  function drawPuddles(ctx, t) {
    if (!L.puddles) return;
    for (const p of L.puddles) {
      ctx.fillStyle = 'rgba(90,120,150,0.45)'; ellipse(ctx, p.x, p.y, p.rx, p.ry);
      ctx.fillStyle = 'rgba(200,225,245,0.35)'; ellipse(ctx, p.x - p.rx * 0.3, p.y - p.ry * 0.3, p.rx * 0.4, p.ry * 0.3);
      ctx.strokeStyle = 'rgba(230,240,250,0.6)'; ctx.lineWidth = 0.8;
      const k = (t * 1.3 + p.x * 0.01) % 1; // a raindrop ripple
      ctx.beginPath(); ctx.ellipse(p.x + Math.sin(p.y) * p.rx * 0.4, p.y, 2 + k * 8, (2 + k * 8) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function updateWeatherFx(dt) {
    if (!L) return;
    updateWeatherPlan();
    fx.flash = Math.max(0, fx.flash - dt * 2.2);
    // Puddle splashes (a downpour makes them spread)
    if (L.weather === 'downpour' && L.puddles) for (const p of L.puddles) { if (p.rx < 44) { p.rx += dt * 0.25; p.ry += dt * 0.1; } }
    if (L.puddles && areaOf(player.x, player.y) === 0) for (const p of L.puddles) {
      p.splashT = Math.max(0, p.splashT - dt);
      const dx = (player.x - p.x) / p.rx, dy = (player.y - p.y) / p.ry;
      if (dx * dx + dy * dy < 1 && player.speed > 30 && p.splashT <= 0) {
        p.splashT = 0.6;
        for (let k = 0; k < 8; k++) particles.push({ kind: 'drop', x: player.x, y: player.y, z: 1, vx: rr(-50, 50), vy: rr(-25, 25), vz: rr(60, 120), life: 0.6, max: 0.6 });
        sfx('splat');
        run.puddles = (run.puddles || 0) + 1;
        setProgress('puddle', run.puddles);
        if (player.speed > 120) lookTowards(player.x, player.y, 90, () => rpick(['Who’s splashing about?', 'Hm? Splashing?']));
        player.mud = Math.max(0, (player.mud || 0) - 15); // washes the mud off
        for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - p.x, v.y - p.y) < p.rx + 26 && player.speed > 120) {
          if (startleV(v, rpick(['I’m SOAKED!', 'Eugh! My clothes!', 'You little—! I’m drenched!']))) completeTask('soak');
        }
      }
    }
    // Thunderstorms: lightning, then thunder that makes everyone jump
    if (L.weather === 'storm' && started && !paused) {
      fx.nextBolt -= dt;
      if (fx.nextBolt <= 0) { fx.flash = 1; fx.nextBolt = rr(9, 18); fx.thunderAt = 0.5 + Math.random() * 0.6; }
      if (fx.thunderAt >= 0) {
        fx.thunderAt -= dt;
        if (fx.thunderAt < 0) {
          sfx('thunder');
          run.shake = Math.max(run.shake, 0.25);
          for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.random() < 0.6) startleV(v, rpick(['Eek!', 'Goodness!', 'Yikes!']));
          for (const h of hens) { h.panic = 1.6; h.fleeA = Math.random() * Math.PI * 2; }
          if (cat && areaOf(cat.x, cat.y) === 0 && cat.state !== 'flee') catFlee(cat.x + 20, cat.y, 'Mrrow!');
          if (dog && dog.state !== 'return') { dog.state = 'sit'; dog.t = 3; dog.calm = 6; dogSay('*whimper*', 1.4); }
          critterScare(player.x, player.y, 9999);
        }
      }
    }
  }
  // A soft looping hiss of rain (or wind) under everything else
  function startAmbience() {
    try { if (fx.ambience) { fx.ambience.src.stop(); fx.ambience = null; } } catch (_) { fx.ambience = null; }
    const W = L && L.weather;
    if (!actx || !(WET_SET.includes(W) || W === 'windy' || W === 'snowstorm' || W === 'hail')) return;
    const n = actx.sampleRate * 2, buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = actx.createBiquadFilter(); f.type = W === 'windy' || W === 'snowstorm' || W === 'hail' ? 'bandpass' : 'lowpass'; f.frequency.value = W === 'hail' ? 2200 : W === 'windy' || W === 'snowstorm' ? 500 : 2500;
    const g = actx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master); src.start();
    fx.ambience = { src, g, level: W === 'storm' || W === 'downpour' ? 0.08 : W === 'rain' ? 0.05 : W === 'drizzle' ? 0.025 : 0.04 };
  }
  function updateAmbienceLevel() {
    if (!fx.ambience) { if (actx && actx.state === 'running' && L && ['rain', 'storm', 'drizzle', 'downpour', 'windy', 'snowstorm', 'hail'].includes(L.weather)) startAmbience(); return; }
    const indoors = areaOf(player.x, player.y) > 0;
    const want = muted || paused ? 0 : fx.ambience.level * (indoors ? 0.35 : 1);
    fx.ambience.g.gain.value += (want - fx.ambience.g.gain.value) * 0.05;
  }

  // --- More animals --------------------------------------------------------------------
  // ducks on the water, sparrow flocks, squirrels, frogs (rain/spring), seagulls (seaside)
  let critters = [];
  const isWaterish = (x, y) => { const t0 = tileAt(x, y); return t0 === WATER || t0 === ICE; };
  function critterBlocked(c, x, y) {
    if (areaOf(x, y) !== 0 || x < TILE || y < TILE || x > WORLD_W - TILE || y > WORLD_H - TILE) return true;
    if (isWaterish(x, y)) return !(c.type === 'duck' || c.type === 'frog' || c.type === 'swan'); // only ducks and frogs go in the water
    return navBlockedPt(x, y) && c.type !== 'squirrel' && c.type !== 'sparrow'; // small things squeeze past trees
  }
  function critterMove(c, tx, ty, speed, dt) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return true;
    const step = Math.min(d, speed * dt), nx = c.x + dx / d * step, ny = c.y + dy / d * step;
    if (c.flying || !critterBlocked(c, nx, ny)) { c.x = nx; c.y = ny; }
    else { c.tx = null; return true; }
    if (Math.abs(dx) > 0.5) c.dir = dx > 0 ? 'right' : 'left';
    c.walk += dt * speed * 0.15; c.moving = true;
    return step >= d;
  }
  function spawnCritters() {
    critters = [];
    const T = TILE, P = L.plaza, W = L.weather;
    const stormy = W === 'rain' || W === 'storm' || W === 'snowstorm' || W === 'downpour';
    // Ducks on the pond / river (they stand on the ice in winter)
    if (L.kind !== 'seaside') {
      for (let k = 0; k < 4; k++) {
        for (let n = 0; n < 40; n++) {
          const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.8;
          const x = (L.pond.cx + Math.cos(a) * L.pond.rx * d) * T, y = (L.pond.cy + Math.sin(a) * L.pond.ry * d) * T;
          if (isWaterish(x, y)) { critters.push({ type: 'duck', x, y, z: 0, dir: 'left', walk: 0, ph: rand() * 6, panic: 0, tx: null, wait: 0 }); break; }
        }
      }
    }
    // A flock of sparrows pecking at the plaza, unless they're sheltering from the weather
    if (!stormy) {
      const hx = (P.x + rr(2, 10)) * T, hy = (P.y + rr(5, 10)) * T;
      for (let k = 0; k < 6; k++) critters.push({ type: 'sparrow', x: hx + rr(-30, 30), y: hy + rr(-20, 20), z: 0, hx, hy, dir: 'left', walk: 0, ph: rand() * 6, flying: false, flyT: 0, tx: null, wait: rr(0, 2) });
    }
    // Squirrels around the trees (not the forest edge)
    const trees = objects.filter((o) => o.kind === 'tree' && o.x > 6 * T && o.x < WORLD_W - 6 * T && o.y > 6 * T && o.y < WORLD_H - 6 * T);
    L.squirrelTrees = trees;
    if (trees.length) for (let k = 0; k < 3; k++) {
      const tr = trees[Math.floor(rand() * trees.length)];
      critters.push({ type: 'squirrel', x: tr.x + rr(-20, 20), y: tr.y + rr(8, 20), z: 0, dir: 'left', walk: 0, ph: rand() * 6, tree: null, upT: 0, tx: null, wait: rr(0, 3) });
    }
    // Frogs by the water in rain or in spring
    if (L.kind !== 'seaside' && hasOpenWater() && (wet() || L.season === 'spring')) {
      for (let k = 0; k < 4; k++) {
        const sp = shorePoint(rand() * Math.PI * 2);
        critters.push({ type: 'frog', x: sp.x, y: sp.y, z: 0, dir: 'left', walk: 0, ph: rand() * 6, hopT: rr(0.5, 3), vz: 0, hx: sp.x, hy: sp.y, gone: 0 });
      }
    }
    // Seagulls on the beach and pier, after your snacks
    if (L.kind === 'seaside') {
      for (let k = 0; k < 4; k++) {
        const x = (L.roadX + rr(-12, 12)) * T, y = (L.shore[Math.max(0, Math.min(MW - 1, Math.floor(x / T)))] - 1) * T;
        critters.push({ type: 'gull', x, y, z: 0, hx: x, hy: y, dir: 'left', walk: 0, ph: rand() * 6, flying: false, state: 'idle', cd: rr(2, 6), carry: null, tx: null, wait: rr(0, 3) });
      }
    }
    spawnFarmNight();
    spawnWilds();
  }

  // Something scary happened near (x, y): birds and frogs bolt (see also farmNightScare)
  function critterScare(x, y, r) {
    for (const c of critters) {
      if (Math.hypot(c.x - x, c.y - y) > r) continue;
      if (FN_TYPES.has(c.type)) { farmNightScare(c, x, y, r); continue; }
      if (WD_TYPES.has(c.type)) { wildScare(c, x, y, r); continue; }
      if (c.type === 'sparrow' && !c.flying) startFlock(c, x, y);
      if (c.type === 'gull' && c.state !== 'flee') { gullDrop(c); c.state = 'flee'; c.flying = true; c.fleeT = 3; c.fa = Math.atan2(c.y - y, c.x - x); c.cd = 8; if (r < 9999) completeTask('gullscare'); }
      if (c.type === 'duck') {
        c.panic = 1.5; c.fa = Math.atan2(c.y - y, c.x - x);
        if (r < 9999) { c.bubble = { text: 'QUACK!', t: 1 }; sfx('quack'); completeTask('quack'); }
      }
      if (c.type === 'frog' && !(c.gone > 0)) {
        particles.push({ kind: 'ring', x: c.x, y: c.y, r: 2, life: 0.8, max: 0.8 });
        c.gone = rr(6, 12);
        if (r < 9999) { sfx('plop'); completeTask('frog'); }
      }
    }
  }
  function startFlock(c, x, y) {
    for (const s of critters) {
      if (s.type !== 'sparrow' || s.flying || Math.hypot(s.x - c.x, s.y - c.y) > 90) continue;
      s.flying = true; s.flyT = rr(2.5, 4); s.fa = Math.atan2(s.y - y, s.x - x) + rr(-0.6, 0.6);
    }
    if (Math.hypot(player.x - c.x, player.y - c.y) < 300) sfx('flutter');
    completeTask('birds');
  }
  function gullDrop(c) {
    const it = c.carry;
    if (!it) return;
    c.carry = null;
    Object.assign(it, { held: false, heldBy: null, x: c.x, y: c.y, z: c.z + 10, air: true, vz: 0, vx: rr(-30, 30), vy: rr(-10, 10), ghost: true });
    it.droppedAt = time;
  }

  function updateCritters(dt) {
    if (critters.some((c) => c.caught || c.dead || (c.gone === true && c.z > 220))) critters = critters.filter((c) => !c.caught && !c.dead && !(c.gone === true && c.z > 220));
    const outside = areaOf(player.x, player.y) === 0;
    const pdist = (c) => Math.hypot(player.x - c.x, player.y - c.y);
    for (const c of critters) {
      c.moving = false;
      c.ph += dt;
      if (c.bubble) { c.bubble.t -= dt; if (c.bubble.t <= 0) c.bubble = null; }
      const near = outside && started && pdist(c) < 70 && player.speed > 25 && !player.hidden;
      if (FN_TYPES.has(c.type)) { updateFarmNight(c, dt, near); continue; }
      if (WD_TYPES.has(c.type)) { updateWilds(c, dt, near); continue; }

      if (c.type === 'duck') {
        c.panic = Math.max(0, c.panic - dt);
        if (near && c.panic < 0.5) {
          c.panic = 1.5; c.fa = Math.atan2(c.y - player.y, c.x - player.x);
          c.bubble = { text: rpick(['Quack!', 'QUACK!', 'Quack quack!']), t: 1 };
          if (pdist(c) < 300) sfx('quack');
          completeTask('quack');
        }
        // Food lying nearby? Ducks can't resist.
        if (!c.food || !items.includes(c.food) || c.food.held) {
          c.food = null;
          for (const it of items) if (isFood(it) && !it.held && !it.air && it.z <= 2 && Math.hypot(it.x - c.x, it.y - c.y) < 170 && areaOf(it.x, it.y) === 0) { c.food = it; c.eatT = 1.2; break; }
        }
        if (c.panic > 0) critterMove(c, c.x + Math.cos(c.fa) * 30, c.y + Math.sin(c.fa) * 30, 110, dt);
        else if (c.food) {
          if (Math.hypot(c.food.x - c.x, c.food.y - c.y) > 10) critterMove(c, c.food.x, c.food.y, 60, dt);
          else {
            c.eatT -= dt; c.walk += dt * 20;
            if (c.eatT <= 0) {
              const it = c.food, idx2 = items.indexOf(it);
              if (idx2 >= 0) items.splice(idx2, 1);
              crumbs(it.x, it.y, 2, 6, CRUMB[it.kind] || '#e2a85a');
              c.bubble = { text: 'quack! ♥', t: 1.2 };
              if (it.touched) completeTask('feedducks');
              c.food = null;
            }
          }
        } else {
          c.wait -= dt;
          if (c.wait <= 0 && (!c.tx || critterMove(c, c.tx, c.ty, 22, dt))) {
            // paddle about on the water, and sometimes waddle up onto the bank
            const bank = Math.random() < 0.3;
            for (let n = 0; n < 8; n++) {
              const tx = c.x + rr(-70, 70), ty = c.y + rr(-40, 40);
              if (bank ? !critterBlocked(c, tx, ty) && !isWaterish(tx, ty) && Math.hypot(tx - L.pond.cx * TILE, ty - L.pond.cy * TILE) < (L.pond.rx + 3) * TILE : isWaterish(tx, ty)) { c.tx = tx; c.ty = ty; break; }
            }
            c.wait = rr(0.5, 3);
          }
        }
      } else if (c.type === 'sparrow') {
        if (!c.flying) {
          if (near) startFlock(c, player.x, player.y);
          c.wait -= dt;
          if (c.wait <= 0) { c.tx = c.hx + rr(-40, 40); c.ty = c.hy + rr(-25, 25); c.wait = rr(0.5, 2.5); }
          if (c.tx) critterMove(c, c.tx, c.ty, 30, dt);
          c.z = c.moving ? Math.abs(Math.sin(c.walk * 2)) * 2 : 0;
        } else {
          c.flyT -= dt;
          c.z = Math.min(60, c.z + 70 * dt);
          c.x += Math.cos(c.fa) * 120 * dt; c.y += Math.sin(c.fa) * 80 * dt; c.walk += dt * 30;
          c.dir = Math.cos(c.fa) > 0 ? 'right' : 'left';
          if (c.flyT <= 0) { // settle somewhere new
            c.flying = false; c.z = 0;
            c.hx = clamp(c.x, 5 * TILE, WORLD_W - 5 * TILE); c.hy = clamp(c.y, 5 * TILE, WORLD_H - 5 * TILE);
            if (navBlockedPt(c.hx, c.hy)) { c.hx = (L.plaza.x + 6) * TILE; c.hy = (L.plaza.y + 8) * TILE; }
            c.x = c.hx + rr(-20, 20); c.y = c.hy + rr(-15, 15);
          }
        }
      } else if (c.type === 'squirrel') {
        if (c.tree) { // up the tree, chattering
          c.upT -= dt;
          c.z = Math.min(34, c.z + 90 * dt);
          if (c.upT <= 0) { c.z = 0; c.x = c.tree.x + rr(-14, 14); c.y = c.tree.y + 10; c.tree = null; c.wait = rr(1, 3); }
          continue;
        }
        const dogNear = dog && dog.state === 'squirrelchase' && dog.target === c && Math.hypot(dog.x - c.x, dog.y - c.y) < 90;
        if (near || dogNear || c.fleeing) {
          // dash for the nearest tree and scamper up it
          if (!c.fleeing) {
            let best = null, bd = Infinity;
            for (const tr of L.squirrelTrees) { const d = Math.hypot(tr.x - c.x, tr.y - c.y); if (d < bd) { bd = d; best = tr; } }
            c.fleeing = best; c.bubble = { text: rpick(['Chk-chk!', 'Chitter!']), t: 0.8 };
          }
          if (critterMove(c, c.fleeing.x, c.fleeing.y + 2, 170, dt) || Math.hypot(c.fleeing.x - c.x, c.fleeing.y - c.y) < 8) {
            c.tree = c.fleeing; c.fleeing = null; c.upT = rr(5, 9); c.x = c.tree.x + 2; c.y = c.tree.y + 1;
            if (pdist(c) < 200 && !dogNear) completeTask('squirrel');
            if (dog && dog.state === 'squirrelchase' && dog.target === c) { dog.state = 'treebark'; dog.t = 4; dog.barkT = 0; dog.path = null; }
          }
          continue;
        }
        c.wait -= dt;
        if (c.wait <= 0 && (!c.tx || critterMove(c, c.tx, c.ty, 90, dt))) {
          const tr = L.squirrelTrees[Math.floor(Math.random() * L.squirrelTrees.length)];
          if (tr && Math.hypot(tr.x - c.x, tr.y - c.y) < 400) { c.tx = tr.x + rr(-24, 24); c.ty = tr.y + rr(6, 22); }
          c.wait = rr(1, 4);
        }
      } else if (c.type === 'frog') {
        if (c.gone > 0) { c.gone -= dt; if (c.gone <= 0) { c.x = c.hx; c.y = c.hy; } continue; }
        if (near) {
          // hop for the water and plop in
          const P = L.pond;
          const a = Math.atan2(P.cy * TILE - c.y, P.cx * TILE - c.x);
          c.x += Math.cos(a) * 40; c.y += Math.sin(a) * 26; c.vz = 120; c.z = 0.1;
          particles.push({ kind: 'ring', x: c.x, y: c.y, r: 2, life: 0.8, max: 0.8 }); // plop, gone
          sfx('plop'); c.gone = rr(6, 12); completeTask('frog');
          continue;
        }
        c.hopT -= dt;
        if (c.z > 0 || c.vz) { c.vz -= 500 * dt; c.z += c.vz * dt; if (c.z <= 0) { c.z = 0; c.vz = 0; } }
        if (c.hopT <= 0) {
          c.hopT = rr(1.5, 4);
          const tx = c.hx + rr(-30, 30), ty = c.hy + rr(-20, 20);
          if (!critterBlocked(c, tx, ty)) { c.dir = tx > c.x ? 'right' : 'left'; c.x = tx; c.y = ty; c.vz = 90; c.z = 0.1; }
          if (Math.random() < 0.4 && pdist(c) < 260) { c.bubble = { text: 'ribbit', t: 0.9 }; sfx('ribbit'); }
        }
      } else if (c.type === 'gull') {
        c.cd = Math.max(0, c.cd - dt);
        const food = isFood(player.held) ? player.held : null;
        if (c.state === 'idle') {
          c.flying = false; c.z = Math.max(0, c.z - 60 * dt);
          if (food && outside && started && c.cd <= 0 && pdist(c) < 150 && !player.hidden) { c.state = 'swoop'; c.flying = true; c.bubble = { text: 'SQUAWK!', t: 1 }; sfx('squawk'); }
          else {
            c.wait -= dt;
            if (c.wait <= 0) { c.tx = c.hx + rr(-60, 60); c.ty = c.hy + rr(-20, 20); c.wait = rr(1, 4); if (navBlockedPt(c.tx, c.ty) && !isWaterish(c.tx, c.ty)) c.tx = null; }
            if (c.tx) critterMove(c, c.tx, c.ty, 30, dt);
          }
        } else if (c.state === 'swoop') {
          c.z = Math.min(26, c.z + 60 * dt);
          if (!food || !outside) { c.state = 'idle'; c.cd = 4; }
          else if (critterMove(c, player.x, player.y - 4, 200, dt) || pdist(c) < 10) {
            // snatch!
            player.held = null; player.eating = null;
            Object.assign(food, { held: true, heldBy: c, air: false });
            c.carry = food; c.state = 'flee'; c.fleeT = 3.5; c.fa = Math.random() * Math.PI * 2; c.cd = 10;
            c.bubble = { text: 'MINE!', t: 1.2 }; sfx('squawk');
            player.bubble = { text: 'HEY!', t: 1.2 };
            completeTask('gullsnack');
          }
        } else if (c.state === 'flee') {
          c.fleeT -= dt; c.z = Math.min(55, c.z + 50 * dt);
          c.x += Math.cos(c.fa) * 150 * dt; c.y += Math.sin(c.fa) * 100 * dt; c.walk += dt * 25;
          c.x = clamp(c.x, 3 * TILE, WORLD_W - 3 * TILE); c.y = clamp(c.y, 3 * TILE, WORLD_H - 2 * TILE);
          c.dir = Math.cos(c.fa) > 0 ? 'right' : 'left';
          if (c.fleeT <= 0) { gullDrop(c); c.state = 'idle'; c.hx = c.x; c.hy = c.y; c.flying = false; }
        }
      }
    }
  }
  // Where a gull carries its prize
  function heldPosGull(c) { return { x: c.x + (c.dir === 'right' ? 7 : -7), y: c.y + 0.5, z: c.z + 2 }; }

  function drawCritter(ctx, c, t) {
    if (FN_TYPES.has(c.type)) { drawFarmNight(ctx, c, t); return; }
    if (WD_TYPES.has(c.type)) { drawWilds(ctx, c, t); return; }
    if (c.type === 'frog' && c.gone > 0) return;
    ctx.save();
    ctx.translate(c.x, c.y);
    const swimming = c.type === 'duck' && tileAt(c.x, c.y) === WATER;
    if (!swimming) { ctx.fillStyle = 'rgba(20,30,10,0.2)'; ellipse(ctx, 0, 0, c.type === 'gull' ? 7 : 5, 2); }
    ctx.translate(0, -(c.z || 0));
    if (c.dir === 'left') ctx.scale(-1, 1);
    const flap = Math.sin(c.walk * 2) * 3;
    switch (c.type) {
      case 'duck': {
        const bob = Math.sin(c.ph * 3) * 0.6;
        if (swimming) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 1, 9, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.strokeStyle = '#e8a33a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(-1.5, 0); ctx.moveTo(1.5, -3); ctx.lineTo(2, 0); ctx.stroke(); }
        const by = swimming ? -2 + bob : -5;
        ctx.fillStyle = '#8a6a4a'; ellipse(ctx, 0, by, 6.5, 3.6);
        ctx.fillStyle = '#6a7a8a'; ellipse(ctx, -1, by - 0.5, 3.5, 2.2);
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(3, by - 3, 2, 1.2);
        const eat = c.food && c.eatT < 1.2 ? Math.abs(Math.sin(c.walk)) * 3 : 0;
        ctx.fillStyle = '#2f7a4a'; circle(ctx, 5, by - 4 + eat, 2.6);
        ctx.fillStyle = '#f2c14e'; ellipse(ctx, 7.6, by - 3.6 + eat, 1.8, 0.9);
        ctx.fillStyle = '#1d1d22'; circle(ctx, 5.6, by - 4.6 + eat, 0.5);
        break;
      }
      case 'sparrow': {
        ctx.fillStyle = '#8a6a4a'; ellipse(ctx, 0, -3, 3.2, 2.2);
        ctx.fillStyle = '#6b4a2e'; ellipse(ctx, -0.5, -3.4 - (c.flying ? flap * 0.5 : 0), 2.2, c.flying ? 2.5 + Math.abs(flap) * 0.4 : 1.3);
        ctx.fillStyle = '#a8865e'; circle(ctx, 2.4, -4.6, 1.6);
        ctx.fillStyle = '#3a2a1a'; poly(ctx, [[3.8, -4.8], [5, -4.4], [3.8, -4.1]]); ctx.fill();
        if (!c.flying) { ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-0.5, -1); ctx.lineTo(-0.5, 0); ctx.moveTo(0.8, -1); ctx.lineTo(0.8, 0); ctx.stroke(); }
        break;
      }
      case 'squirrel': {
        const run = c.moving ? Math.sin(c.walk * 2) * 1.5 : 0;
        ctx.fillStyle = '#b5622a';
        ctx.beginPath(); ctx.moveTo(-3, -3); ctx.bezierCurveTo(-11, -4, -12, -14, -5, -15 + run); ctx.bezierCurveTo(-7, -10, -6, -6, -3, -5); ctx.fill(); // tail
        ellipse(ctx, 0, -4 - Math.abs(run) * 0.5, 4.2, 3);
        circle(ctx, 3.8, -7, 2.5);
        poly(ctx, [[2.6, -9], [3, -11.5], [4.2, -9.2]]); ctx.fill();
        ctx.fillStyle = '#f4e6cc'; ellipse(ctx, 1.5, -3.2, 2, 1.6);
        ctx.fillStyle = '#1d1d22'; circle(ctx, 4.6, -7.4, 0.55);
        break;
      }
      case 'frog': {
        ctx.fillStyle = '#4f9a3c'; ellipse(ctx, 0, -2.6, 4.2, 2.8);
        ctx.fillStyle = '#3f7f30'; ellipse(ctx, -2.6, -1.2, 2, 1.2); ellipse(ctx, 2.6, -1.2, 2, 1.2);
        ctx.fillStyle = '#8fd16a'; ellipse(ctx, 1.4, -2, 2, 1.4);
        ctx.fillStyle = '#4f9a3c'; circle(ctx, 1.6, -5, 1.4); circle(ctx, -1, -5, 1.4);
        ctx.fillStyle = '#1d1d22'; circle(ctx, 1.8, -5.2, 0.6); circle(ctx, -0.8, -5.2, 0.6);
        break;
      }
      case 'gull': {
        if (c.flying) {
          ctx.fillStyle = '#c9ced6';
          poly(ctx, [[-1, -4], [-10, -8 - flap], [-3, -3]]); ctx.fill(); poly(ctx, [[1, -4], [9, -9 - flap], [3, -3]]); ctx.fill();
        } else { ctx.strokeStyle = '#e8a33a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 0); ctx.moveTo(2, -3); ctx.lineTo(2, 0); ctx.stroke(); }
        ctx.fillStyle = '#ffffff'; ellipse(ctx, 0, -5, 6, 3.2);
        ctx.fillStyle = '#9aa3ae'; ellipse(ctx, -1.5, -5.5, 3.8, 2);
        ctx.fillStyle = '#2b2d33'; poly(ctx, [[-5, -6], [-8, -5], [-5, -4]]); ctx.fill();
        ctx.fillStyle = '#ffffff'; circle(ctx, 4.8, -7.6, 2.4);
        ctx.fillStyle = '#f2c14e'; poly(ctx, [[6.6, -8], [10, -7.2], [6.6, -6.6]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 5.4, -8.2, 0.55);
        break;
      }
    }
    ctx.restore();
    if (c.type === 'gull' && c.carry) { const it = c.carry; ctx.save(); ctx.translate(it.x, it.y - it.z); drawItemBody(ctx, it, t); ctx.restore(); }
  }

  const onSnow = (x, y) => isWinter() && areaOf(x, y) === 0 && [GRASS, SAND, SOIL].includes(tileAt(x, y));
  const onIce = (x, y) => tileAt(x, y) === ICE;
  const canScoop = () => onSnow(player.x, player.y) && !player.held && !player.inWardrobe;
  function scoopSnowball() {
    const it = addItem('snowball', player.x, player.y + 1);
    sfx('rustle');
    puff(player.x, player.y, 3);
    pickUp(it);
  }
  function drawScoopHint(ctx, t) {
    if (!started || paused || !canScoop() || target || petChoice() || (player.idleT || 0) < 1.2 || player.bubble) return;
    const text = isTouch ? 'grab: scoop snow' : 'E scoop a snowball';
    ctx.font = '800 7px Nunito, sans-serif';
    const w = ctx.measureText(text).width + 10;
    const x = player.x, y = player.y - player.hop - 46 + Math.sin(t * 4) * 1.2;
    ctx.fillStyle = 'rgba(28,36,24,0.85)'; roundRect(ctx, x - w / 2, y - 6, w, 11, 4, true);
    ctx.fillStyle = '#bff1ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 0.2);
  }

  // Per-frame seasonal goings-on
  function updateSeason(dt) {
    if (!L || !L.extra) return;
    player.idleT = player.speed < 5 ? (player.idleT || 0) + dt : 0;
    // pawprints in the snow
    player.printT = (player.printT || 0) - dt;
    if (player.speed > 20 && player.printT <= 0 && onSnow(player.x, player.y)) {
      player.printT = 0.17;
      player.printSide = -(player.printSide || 1);
      const d = DIRV[player.dir];
      particles.push({ kind: 'print', x: player.x + d[1] * 3 * player.printSide, y: player.y - 1 + d[0] * 2 * player.printSide, life: 9, max: 9 });
    }
    if (player.mud > 0 && player.speed > 20 && player.printT <= 0 && !onSnow(player.x, player.y)) { // muddy pawprints
      player.printT = 0.17; player.printSide = -(player.printSide || 1);
      const d = DIRV[player.dir];
      particles.push({ kind: 'print', mud: true, x: player.x + d[1] * 3 * player.printSide, y: player.y - 1 + d[0] * 2 * player.printSide, life: 14, max: 14 });
    }
    if (onIce(player.x, player.y) && player.speed > 95) completeTask('skate');
    if (L.pier && tileAt(player.x, player.y) === BRIDGE && player.y > L.pier.endY - 40) completeTask('pier');
    for (const o of L.extra.leafpiles) { o.h = Math.min(1, o.h + dt * 0.08); o.rustle = Math.max(0, o.rustle - dt); }
    for (const b of L.extra.beds) {
      const r = b.rect;
      if (player.speed > 20 && player.x > r.x && player.x < r.x + r.w && player.y > r.y && player.y < r.y + r.h + 6) {
        const before = b.trample;
        b.trample = Math.min(1, b.trample + dt * 1.6);
        if (Math.random() < dt * 10) particles.push({ kind: 'shard', col: pick(['#e8453c', '#ff6f91', '#ffd166']), x: player.x, y: player.y, z: 4, vx: rr(-30, 30), vy: rr(-15, 15), vz: rr(30, 60), life: 0.6, max: 0.6 });
        if (before < 0.45 && b.trample >= 0.45) {
          completeTask('tulips');
          const f = VILLAGER.fennick;
          if (f && canSeePlayer(f) && Math.hypot(f.x - player.x, f.y - player.y) < 240) startleV(f, 'My TULIPS!', { state: 'chase', target: null });
        }
      }
    }
  }
  // A leaf pile you barge into explodes noisily
  function scatterLeaves(o) {
    o.h = 0.3; o.rustle = 0.5;
    for (let k = 0; k < 18; k++) particles.push({ kind: 'shard', col: pick(['#c0392b', '#e07b2a', '#f0a040', '#d9a43a']), x: o.x + rr(-12, 12), y: o.y - 4, z: 6, vx: rr(-60, 60), vy: rr(-30, 30), vz: rr(60, 140), life: 1.1, max: 1.1 });
    sfx('rustle'); sfx('rustle');
    lookTowards(o.x, o.y, 150, () => rpick(['Who’s in the leaves?', 'Hey! My leaf pile!', 'Hm? Rustling?']));
    completeTask('leafjump');
  }

  // ---------------------------------------------------------------------------
  // Dusk, changing weather, rainbows, hail, heatwaves; the farm; night animals
  // ---------------------------------------------------------------------------
  let duskK = 0; // 0 in daylight, 1 at sunset
  function updateDusk() {
    const p = run.timeTotal > 0 ? 1 - run.timeLeft / run.timeTotal : 0;
    duskK = started ? clamp((p - 0.55) / 0.45, 0, 1) : 0;
  }

  // Weather can change partway through a day
  function planWeather(season, first) {
    const plan = [{ at: 0, w: first }];
    if (first === 'hail') { plan.push({ at: 0.1, w: 'clear' }); return plan; }
    if (rand() < 0.45) {
      const at = 0.3 + rand() * 0.3;
      let next;
      if (WET_SET.includes(first) || first === 'fog' || first === 'frost') next = 'clear'; // clears up / the fog lifts / the frost melts
      else if (season === 'winter') next = pick(['snowstorm', 'fog']);
      else if (season === 'summer') next = pick(['storm', 'rain', 'downpour', first === 'heatwave' ? 'storm' : 'heatwave']);
      else next = pick(['rain', 'hail', 'storm', 'drizzle', 'downpour']);
      if (next !== first) {
        plan.push({ at, w: next });
        if (next === 'hail') plan.push({ at: at + 0.07, w: first });
        else if (WET_SET.includes(next)) plan.push({ at: Math.min(0.92, at + 0.2 + rand() * 0.15), w: 'clear' });
      }
    }
    return plan;
  }
  const planHas = (names) => !!L && (L.weatherPlan || []).some((s) => names.includes(s.w));
  const rainbowPossible = () => !!L && (L.weatherPlan || []).some((s, i, a) => i > 0 && s.w === 'clear' && ['rain', 'storm', 'downpour'].includes(a[i - 1].w));

  const WEATHER_NEWS = {
    rain: 'It’s starting to rain', storm: 'A storm is rolling in', hail: 'Hail! Everyone’s running for cover',
    heatwave: 'Phew, a heatwave', drizzle: 'It’s starting to drizzle', downpour: 'It’s bucketing down!', snowstorm: 'A snowstorm is blowing in', fog: 'Fog is rolling in', windy: 'The wind is picking up',
  };
  function setWeather(w) {
    const was = L.weather;
    if (was === w) return;
    L.weather = w;
    spawnWeather();
    if (wet() && !isWinter() && !(L.puddles && L.puddles.length)) placePuddles();
    if (w === 'downpour' && L.puddles) for (const p of L.puddles) { p.grow = 1; }
    if (['rain', 'storm', 'downpour'].includes(was) && !wet()) startRainbow();
    L.whirl = w === 'windy' ? (L.whirl || newWhirl()) : null;
    for (const v of villagers) v.shelter = w === 'hail';
    toast(w === 'clear' ? (was === 'fog' ? 'The fog has lifted' : was === 'frost' ? 'The frost is melting' : 'The sky is clearing') : WEATHER_NEWS[w] || WEATHER_LABEL[w], 'Weather', true);
    updateRunBar();
  }
  function updateWeatherPlan() {
    if (!started || paused || run.over || !L.weatherPlan) return;
    const prog = 1 - run.timeLeft / run.timeTotal;
    while (L.planIdx < L.weatherPlan.length && prog >= L.weatherPlan[L.planIdx].at) setWeather(L.weatherPlan[L.planIdx++].w);
  }

  // Rainbow, with a pot of gold where it ends
  function startRainbow() {
    const base = areaOf(player.x, player.y) === 0 ? player : { x: (L.plaza.x + 6) * TILE, y: (L.plaza.y + 6) * TILE };
    for (let n = 0; n < 80; n++) {
      const a = Math.random() * Math.PI * 2, d = (6 + Math.random() * 8) * TILE;
      const x = base.x + Math.cos(a) * d, y = base.y + Math.sin(a) * d * 0.7;
      if (x < 5 * TILE || x > WORLD_W - 5 * TILE || y < 5 * TILE || y > WORLD_H - 5 * TILE) continue;
      if (tileAt(x, y) !== GRASS || navBlockedPt(x, y)) continue;
      L.rainbow = { x, y, t: 45 };
      addItem('goldpot', x, y);
      setTimeout(() => toast('Find the pot of gold at its end!', 'A rainbow!', true), 2700);
      return;
    }
  }
  function drawRainbow(ctx, dt) {
    const rb = L.rainbow;
    if (!rb || rb.t <= 0) return;
    if (!paused) rb.t -= dt;
    const a = Math.min(1, rb.t / 6, (45 - rb.t) / 2) * 0.4;
    const R = 520, cx = rb.x - R, cy = rb.y;
    ['#e8453c', '#f2913a', '#f2c14e', '#8fd16a', '#4f93c7', '#5a5ad0', '#9a5ad0'].forEach((col, i) => {
      ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(cx, cy, R - i * 7, Math.PI, Math.PI * 2); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (!paused && Math.random() < dt * 6 && items.some((it) => it.kind === 'goldpot' && !it.held)) particles.push({ kind: 'spark', x: rb.x + rr(-10, 10), y: rb.y, z: rr(4, 20), vx: 0, vy: 0, vz: 30, life: 0.6, max: 0.6 });
  }
  ITEM.goldpot = { name: 'pot of gold', h: 13, r: 7, draw(c) {
    c.fillStyle = '#2b2d33'; ellipse(c, 0, -5, 7, 5); c.fillRect(-7, -6, 14, 3);
    c.fillStyle = '#f2c14e'; for (const [x, y] of [[-3, -10], [0, -11], [3, -10], [-1.5, -12.5], [1.5, -12.5]]) circle(c, x, y, 2.2);
    c.fillStyle = '#fff3a8'; circle(c, -0.5, -12, 0.8);
  } };

  // --- The farm: a fenced sheep field with a cow, and a goat on the loose ---------------
  function buildPaddock() {
    const qs = shuffled([L.gardenQ, ...L.homeQs, L.pondQ]);
    for (const [w, h] of [[12, 9], [10, 8], [9, 7]]) for (const q of qs) {
      const r = fitRect(q, w + 2, h + 2, 50);
      if (!r) continue;
      const px = r.x + 1, py = r.y + 1;
      const gateBottom = py + h / 2 < L.plaza.y + 6;
      const gy = gateBottom ? py + h - 1 : py, gx = px + Math.floor(w / 2) - 1;
      for (let x = px; x < px + w; x++) {
        if (!(gy === py && (x === gx || x === gx + 1))) objects.push(makeFence(x, py, 'h'));
        if (!(gy === py + h - 1 && (x === gx || x === gx + 1))) objects.push(makeFence(x, py + h - 1, 'h'));
      }
      for (let y = py + 1; y < py + h - 1; y++) { objects.push(makeFence(px, y, 'v')); objects.push(makeFence(px + w - 1, y, 'v')); }
      objects.push(makeTrough((px + w - 2.5) * TILE, (py + 2.6) * TILE));
      reserve(r.x, r.y, w + 2, h + 2);
      L.paddock = { x: px, y: py, w, h, gx, gy, gateBottom };
      return;
    }
  }
  function makeTrough(x, y) {
    return {
      kind: 'trough', x, y, hitbox: box(x - 16, y - 8, 32, 9), bounds: { l: x - 22, r: x + 22, t: y - 22, b: y + 6 },
      draw(ctx) {
        ctx.fillStyle = '#7a5230'; roundRect(ctx, x - 17, y - 14, 34, 14, 3, true);
        ctx.fillStyle = '#4f93c7'; ctx.fillRect(x - 14, y - 13, 28, 4);
        ctx.fillStyle = '#e6c56a'; ellipse(ctx, x - 26, y - 4, 9, 6); // a hay bale
        ctx.strokeStyle = '#c9a33a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 32, y - 6); ctx.lineTo(x - 20, y - 6); ctx.stroke();
      },
    };
  }
  const inPaddock = (c) => { const P = L.paddock; return P && c.x > P.x * TILE && c.x < (P.x + P.w) * TILE && c.y > P.y * TILE && c.y < (P.y + P.h) * TILE; };
  const FN_TYPES = new Set(['sheep', 'cow', 'goat', 'hedgehog', 'owl', 'firefly']);

  function spawnFarmNight() {
    const T = TILE, P = L.paddock;
    if (P) {
      const ix = () => (P.x + 1.5 + rand() * (P.w - 3)) * T, iy = () => (P.y + 1.8 + rand() * (P.h - 3.2)) * T;
      for (let k = 0; k < 5; k++) critters.push({ type: 'sheep', x: ix(), y: iy(), z: 0, dir: 'left', walk: 0, ph: rand() * 6, panic: 0, tx: null, wait: rr(0, 3) });
      critters.push({ type: 'cow', x: ix(), y: iy(), z: 0, dir: 'right', walk: 0, ph: rand() * 6, tx: null, wait: rr(1, 4), mooT: rr(6, 12) });
      const gx = (P.gx + 1) * T, gyy = (P.gateBottom ? P.y + P.h + 1.5 : P.y - 1.5) * T;
      critters.push({ type: 'goat', x: gx + rr(-30, 30), y: gyy, z: 0, hx: gx, hy: gyy, dir: 'left', walk: 0, ph: rand() * 6, tx: null, wait: rr(1, 3), charge: 0, cd: 0, food: null });
    }
    // Night creatures (they come out as dusk falls)
    const bushes = objects.filter((o) => (o.kind === 'bush' || o.kind === 'hidebush') && o.x > 5 * T && o.x < WORLD_W - 5 * T && o.y > 5 * T && o.y < WORLD_H - 5 * T);
    for (let k = 0; k < 2 && bushes.length; k++) { const b = bushes[Math.floor(rand() * bushes.length)]; critters.push({ type: 'hedgehog', x: b.x + rr(-20, 20), y: b.y + 14, z: 0, hx: b.x, hy: b.y + 14, dir: 'left', walk: 0, ph: rand() * 6, curl: 0, tx: null, wait: rr(0, 3) }); }
    const tall = (L.squirrelTrees || []).filter((tr) => tr.canopy);
    if (tall.length) { const tr = tall[Math.floor(rand() * tall.length)]; critters.push({ type: 'owl', x: tr.x, y: tr.y + 1, z: tr.y - tr.canopy.cy + tr.canopy.r * 0.6, flying: true, dir: 'left', walk: 0, ph: rand() * 6, cd: 0, hootT: rr(4, 9), gone: false }); }
    if (!isWinter()) for (let k = 0; k < 16; k++) {
      const a = rand() * Math.PI * 2, d = rr(2, 10) * T;
      const x = clamp((L.pond.cx * T) + Math.cos(a) * d * 1.6, 5 * T, WORLD_W - 5 * T), y = clamp((L.pond.cy * T) + Math.sin(a) * d - (L.kind === 'seaside' ? 8 * T : 0), 5 * T, WORLD_H - 5 * T);
      critters.push({ type: 'firefly', x, y, z: rr(8, 24), hx: x, hy: y, flying: true, dir: 'left', walk: 0, ph: rand() * 6 });
    }
  }

  function updateFarmNight(c, dt, near) {
    const pd = Math.hypot(player.x - c.x, player.y - c.y);
    const outside = areaOf(player.x, player.y) === 0;
    switch (c.type) {
      case 'sheep': {
        c.panic = Math.max(0, c.panic - dt);
        if (near && c.panic < 0.6) {
          c.panic = 1.4; c.fa = Math.atan2(c.y - player.y, c.x - player.x) + rr(-0.4, 0.4);
          c.bubble = { text: rpick(['Baa!', 'Baaa!', 'BAA!']), t: 1 }; if (pd < 300) sfx('baa');
          completeTask('baa');
        }
        if (c.panic > 0) critterMove(c, c.x + Math.cos(c.fa) * 30, c.y + Math.sin(c.fa) * 30, 115, dt);
        else {
          c.wait -= dt;
          if (c.wait <= 0) { c.tx = c.x + rr(-50, 50); c.ty = c.y + rr(-35, 35); c.wait = rr(1.5, 4); }
          if (c.tx && critterMove(c, c.tx, c.ty, 16, dt)) c.tx = null;
        }
        if (L.paddock && !inPaddock(c)) {
          const P = L.paddock, mx = Math.max(P.x * TILE - c.x, c.x - (P.x + P.w) * TILE, P.y * TILE - c.y, c.y - (P.y + P.h) * TILE);
          if (mx > TILE * 0.8) completeTask('herd');
        }
        break;
      }
      case 'cow': {
        c.mooT -= dt;
        if (c.mooT <= 0) { c.mooT = rr(8, 15); c.bubble = { text: 'Mooo', t: 1.2 }; if (pd < 320) sfx('moo'); }
        if (pd < 22 && outside) { // a big warm wall of cow
          const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy) || 1, push = 22 - d;
          const nx = player.x + dx / d * push, ny = player.y + dy / d * push;
          if (!collides(nx, player.y)) player.x = nx;
          if (!collides(player.x, ny)) player.y = ny;
          if (!c.bumped || c.bumped < time - 3) { c.bumped = time; c.bubble = { text: 'MOOO!', t: 1.2 }; sfx('moo'); completeTask('moo'); }
        }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.x + rr(-40, 40); c.ty = c.y + rr(-25, 25); c.wait = rr(3, 7); }
        if (c.tx && critterMove(c, c.tx, c.ty, 10, dt)) c.tx = null;
        break;
      }
      case 'goat': {
        c.cd = Math.max(0, c.cd - dt);
        if (c.charge > 0) { // head down, charging straight at you
          c.charge -= dt;
          if (!outside || player.inWardrobe) { c.charge = 0; break; }
          critterMove(c, player.x, player.y, 175, dt);
          if (pd < 15) {
            const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy) || 1;
            player.vx = dx / d * 260; player.vy = dy / d * 260; player.stun = 0.35; player.hopV = 120; player.hop = 0.01;
            c.bubble = { text: 'BLEHH!', t: 1.2 }; sfx('meh'); sfx('bonk');
            c.charge = 0; c.cd = 6;
            completeTask('headbutt');
          }
          break;
        }
        // The goat eats anything lying about
        if (!c.food || !items.includes(c.food) || c.food.held || c.food.air) {
          c.food = null;
          for (const it of items) {
            if (it.held || it.air || it.z > 2 || it.type.heavy || it.floating || it.planted || areaOf(it.x, it.y) !== 0 || it.kind === 'goldpot') continue;
            if (c.ignored && c.ignored.has(it)) continue;
            const d = Math.hypot(it.x - c.x, it.y - c.y);
            if (d < 150 && (!c.food || d < Math.hypot(c.food.x - c.x, c.food.y - c.y))) c.food = it; // the nearest thing
          }
          if (c.food) { c.chew = 2; c.foodT = 6; }
        }
        if (c.food) {
          if (Math.hypot(c.food.x - c.x, c.food.y - c.y) > 10) {
            c.foodT -= dt; // only the walk over counts: can't reach it in time? forget it
            if (c.foodT <= 0) { (c.ignored = c.ignored || new Set()).add(c.food); c.food = null; break; }
            critterMove(c, c.food.x, c.food.y, 40, dt);
          }
          else {
            c.chew -= dt; c.walk += dt * 14;
            if (c.chew <= 0) {
              const it = c.food, i2 = items.indexOf(it);
              if (i2 >= 0) items.splice(i2, 1);
              crumbs(it.x, it.y, 3, 6, '#c9b57e');
              c.bubble = { text: rpick(['Mehh!', 'Nom nom. Meh.']), t: 1.2 }; if (pd < 300) sfx('meh');
              if (it.touched && !isFood(it)) completeTask('goat');
              const owner = it.owner && VILLAGER[it.owner];
              if (owner && canSee(owner, c.x, c.y)) say(owner, `That goat ate my ${it.type.name}!`, 2);
              c.food = null;
            }
          }
          break;
        }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-90, 90); c.ty = c.hy + rr(-60, 60); c.wait = rr(1, 4); }
        if (c.tx && critterMove(c, c.tx, c.ty, 24, dt)) c.tx = null;
        break;
      }
      case 'hedgehog': {
        if (duskK < 0.25) break;
        if (c.curl > 0) { c.curl -= dt; break; }
        if (outside && pd < 55 && player.speed > 20) { c.curl = 4; c.bubble = { text: '*huff*', t: 0.9 }; completeTask('hedgehog'); break; }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-50, 50); c.ty = c.hy + rr(-30, 30); c.wait = rr(1, 3); }
        if (c.tx && critterMove(c, c.tx, c.ty, 14, dt)) c.tx = null;
        break;
      }
      case 'owl': {
        if (duskK < 0.25) break;
        if (c.gone) { c.z += 40 * dt; c.x += 90 * dt; c.walk += dt * 25; break; }
        c.cd = Math.max(0, c.cd - dt);
        c.hootT -= dt;
        if (c.hootT <= 0) { c.hootT = rr(7, 12); c.bubble = { text: 'hoo... hoo...', t: 1.4 }; if (pd < 400) sfx('hoot'); }
        // The owl sees everything, and tells everyone
        if (outside && started && pd < 160 && player.speed > 25 && !player.hidden && c.cd <= 0) {
          c.cd = 8; c.bubble = { text: 'HOO! HOO!', t: 1.4 }; sfx('hoot'); sfx('hoot');
          c.dir = player.x > c.x ? 'right' : 'left';
          lookTowards(player.x, player.y, 280, () => rpick(['What’s the owl on about?', 'Who’s out there?', 'Hm? An owl?']));
        }
        break;
      }
      case 'firefly': {
        if (duskK < 0.2) break;
        c.x = c.hx + Math.sin(c.ph * 0.7) * 26 + Math.sin(c.ph * 1.9) * 8;
        c.y = c.hy + Math.cos(c.ph * 0.5) * 18;
        c.z = 14 + Math.sin(c.ph * 1.3) * 8;
        if (outside && pd < 11) { // caught!
          c.caught = true; sparkle(c.x, c.y, c.z); sfx('pick');
          run.fireflies = (run.fireflies || 0) + 1; setProgress('fireflies', run.fireflies);
        }
        break;
      }
    }
  }
  // Chitter reactions for the farm and night animals
  function farmNightScare(c, x, y, r) {
    if (c.type === 'sheep') { c.panic = 1.4; c.fa = Math.atan2(c.y - y, c.x - x); c.bubble = { text: 'Baa!', t: 1 }; if (r < 9999) { sfx('baa'); completeTask('baa'); } }
    if (c.type === 'cow' && r < 9999) { c.bubble = { text: 'MOOO!', t: 1.2 }; sfx('moo'); completeTask('moo'); }
    if (c.type === 'goat' && r < 9999 && c.cd <= 0 && Math.hypot(c.x - x, c.y - y) < 110) { c.charge = 2.5; c.bubble = { text: 'Meh?!', t: 0.8 }; sfx('meh'); }
    if (c.type === 'hedgehog') c.curl = 4;
    if (c.type === 'owl' && duskK >= 0.25 && !c.gone && r < 9999 && Math.hypot(c.x - x, c.y - y) < 150) { c.gone = true; c.bubble = { text: 'HOO?!', t: 1 }; sfx('flutter'); completeTask('owl'); }
  }

  function drawFarmNight(ctx, c, t) {
    const night = c.type === 'hedgehog' || c.type === 'owl' || c.type === 'firefly';
    if (night && duskK < (c.type === 'firefly' ? 0.2 : 0.25)) return;
    if (c.caught) return;
    ctx.save();
    if (night) ctx.globalAlpha = Math.min(1, (duskK - 0.2) * 4);
    ctx.translate(c.x, c.y);
    if (c.type === 'firefly') {
      const glow = 0.5 + Math.sin(c.ph * 6) * 0.5;
      ctx.translate(0, -c.z);
      ctx.fillStyle = `rgba(255,240,120,${0.18 * glow})`; circle(ctx, 0, 0, 7);
      ctx.fillStyle = `rgba(255,250,170,${0.6 + glow * 0.4})`; circle(ctx, 0, 0, 1.6);
      ctx.restore(); return;
    }
    if (c.type !== 'owl') { ctx.fillStyle = 'rgba(20,30,10,0.22)'; ellipse(ctx, 0, 0, c.type === 'cow' ? 14 : c.type === 'hedgehog' ? 5 : 9, c.type === 'cow' ? 4 : 2.5); }
    ctx.translate(0, -(c.z || 0));
    if (c.dir === 'left') ctx.scale(-1, 1);
    const step = c.moving ? Math.sin(c.walk * 2) * 2 : 0;
    const graze = !c.moving && Math.sin(c.ph * 0.8) > 0.3 ? 3 : 0;
    switch (c.type) {
      case 'sheep': {
        ctx.fillStyle = '#2b2d33';
        ctx.fillRect(-5 + step * 0.5, -4, 1.6, 4); ctx.fillRect(4 - step * 0.5, -4, 1.6, 4);
        ctx.fillStyle = '#f4f2ee';
        for (const [bx, by, br] of [[-4, -8, 4.5], [0, -10, 5], [4, -8, 4.5], [-1, -6, 4.5], [3, -6, 4]]) circle(ctx, bx, by, br);
        ctx.fillStyle = '#2b2d33'; ellipse(ctx, 8, -8 + graze, 2.8, 3.4);
        ctx.fillStyle = '#ffffff'; circle(ctx, 9, -9 + graze, 0.6);
        break;
      }
      case 'cow': {
        ctx.fillStyle = '#2b2d33';
        for (const lx of [-9, -5, 6, 10]) ctx.fillRect(lx + (lx < 0 ? step : -step) * 0.4, -7, 2.6, 7);
        ctx.fillStyle = '#f4f2ee'; roundRect(ctx, -13, -19, 25, 13, 6, true);
        ctx.fillStyle = '#2b2d33'; ellipse(ctx, -6, -15, 4, 3); ellipse(ctx, 4, -11, 3.5, 2.5); ellipse(ctx, 8, -17, 2.5, 2);
        ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-13, -16); ctx.quadraticCurveTo(-17, -10, -15, -6 + Math.sin(c.ph * 2)); ctx.stroke();
        ctx.fillStyle = '#f4f2ee'; roundRect(ctx, 10, -21 + graze, 9, 9, 3, true);
        ctx.fillStyle = '#f2b8c6'; roundRect(ctx, 14, -16 + graze, 6, 4.5, 2, true);
        ctx.fillStyle = '#2b2d33'; circle(ctx, 13.5, -18 + graze, 0.8);
        ctx.fillStyle = '#d9c9a8'; poly(ctx, [[11, -21 + graze], [9, -25 + graze], [13, -21.5 + graze]]); ctx.fill();
        break;
      }
      case 'goat': {
        const head = c.charge > 0 ? 3 : graze;
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(-5 + step * 0.5, -6, 1.8, 6); ctx.fillRect(4 - step * 0.5, -6, 1.8, 6);
        ctx.fillStyle = '#d9c4a0'; roundRect(ctx, -7, -13, 14, 8, 4, true);
        ctx.fillStyle = '#d9c4a0'; roundRect(ctx, 5, -17 + head, 6, 7, 3, true);
        ctx.fillStyle = '#f4f2ee'; poly(ctx, [[8, -10 + head], [10, -10 + head], [9, -6 + head]]); ctx.fill(); // beard
        ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(6.5, -17 + head); ctx.quadraticCurveTo(4, -21 + head, 2.5, -18 + head); ctx.stroke(); // horn
        ctx.fillStyle = '#1d1d22'; circle(ctx, 9, -15 + head, 0.7);
        ctx.fillStyle = '#d9c4a0'; poly(ctx, [[-7, -12], [-10, -14], [-7, -10]]); ctx.fill();
        break;
      }
      case 'hedgehog': {
        if (c.curl > 0) { // a spiky ball
          ctx.fillStyle = '#6b4a2e'; circle(ctx, 0, -4, 5);
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.9;
          for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 4, -4 + Math.sin(a) * 4); ctx.lineTo(Math.cos(a) * 7, -4 + Math.sin(a) * 7); ctx.stroke(); }
        } else {
          ctx.fillStyle = '#6b4a2e'; ellipse(ctx, -1, -3.5, 5.5, 3.5);
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.8;
          for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(-5 + k * 1.5, -5); ctx.lineTo(-6 + k * 1.5, -8); ctx.stroke(); }
          ctx.fillStyle = '#d9b38a'; ellipse(ctx, 4.2, -2.6, 2.6, 1.8);
          ctx.fillStyle = '#1d1d22'; circle(ctx, 6.6, -2.6, 0.7); circle(ctx, 4.4, -3.4, 0.5);
        }
        break;
      }
      case 'owl': {
        const flap = c.gone ? Math.sin(c.walk * 2) * 4 : 0;
        ctx.fillStyle = '#8a6a4a'; ellipse(ctx, 0, -7, 5, 6.5);
        if (c.gone) { poly(ctx, [[-3, -8], [-12, -12 - flap], [-3, -4]]); ctx.fill(); poly(ctx, [[3, -8], [12, -12 - flap], [3, -4]]); ctx.fill(); }
        ctx.fillStyle = '#d9c4a0'; ellipse(ctx, 0, -5, 3.2, 4);
        ctx.fillStyle = '#8a6a4a'; poly(ctx, [[-4.5, -12], [-3.5, -16], [-1.5, -12.5]]); ctx.fill(); poly(ctx, [[4.5, -12], [3.5, -16], [1.5, -12.5]]); ctx.fill();
        ctx.fillStyle = '#f2c14e'; circle(ctx, -2, -11, 1.8); circle(ctx, 2, -11, 1.8);
        ctx.fillStyle = '#1d1d22'; circle(ctx, -2, -11, 0.9); circle(ctx, 2, -11, 0.9);
        ctx.fillStyle = '#e8a33a'; poly(ctx, [[-0.8, -9.6], [0.8, -9.6], [0, -8]]); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Wild animals (fox, rabbits, badger, deer), water and sky (fish, swan, bees),
  // pets and pests (parrot, pig, mice, Pepper the pup), and wilder weather
  // (drizzle, downpours, whirlwinds, frost)
  // ---------------------------------------------------------------------------
  const WD_TYPES = new Set(['fox', 'rabbit', 'badger', 'deer', 'pfish', 'swan', 'swarm', 'parrot', 'pig', 'mouse', 'pup']);
  const WET_SET = ['rain', 'storm', 'drizzle', 'downpour'];

  // A walkable grass spot just inside the forest edge, near (nx, ny)
  function edgeSpot(nx, ny) {
    let best = null, bd = 1e9;
    for (let n = 0; n < 400; n++) {
      const tx = Math.floor(rr(3, MW - 3)), ty = Math.floor(rr(3, MH - 3));
      const e = Math.min(tx, ty, MW - 1 - tx, MH - 1 - ty);
      if (e < 3 || e > 5 || getT(tx, ty) !== GRASS || !navOpen(tx, ty)) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, d = Math.hypot(x - nx, y - ny) + rr(0, 200);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }
  // Follow an A* path (critters that need to get around houses and fences)
  function wayTo(c, gx, gy, speed, dt) {
    if (!c.path || c.pathGoal !== gx + ',' + gy) { c.path = findPath(c.x, c.y, gx, gy) || [{ x: gx, y: gy }]; c.pathGoal = gx + ',' + gy; }
    while (c.path.length && Math.hypot(c.path[0].x - c.x, c.path[0].y - c.y) < 4) c.path.shift();
    if (!c.path.length) return true;
    const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), step = Math.min(d, speed * dt);
    c.x += dx / d * step; c.y += dy / d * step;
    if (Math.abs(dx) > 0.5) c.dir = dx > 0 ? 'right' : 'left';
    c.walk += dt * speed * 0.15; c.moving = true;
    return false;
  }
  // Knock the raccoon flying (goat-style)
  function knockPlayer(fromX, fromY, k = 240) {
    const dx = player.x - fromX, dy = player.y - fromY, d = Math.hypot(dx, dy) || 1;
    player.vx = dx / d * k; player.vy = dy / d * k; player.stun = 0.35; player.hopV = 120; player.hop = 0.01;
    if (player.held && !player.held.type.heavy) dropHeld(true);
  }

  // --- Objects: beehive, mud wallow, parrot perch ------------------------------------
  function makeHive(x, y) {
    return {
      kind: 'hive', x, y, hitbox: box(x - 8, y - 5, 16, 6), bounds: { l: x - 14, r: x + 14, t: y - 34, b: y + 4 },
      draw(ctx, t) {
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 9, y - 10, 2, 10); ctx.fillRect(x + 7, y - 10, 2, 10); ctx.fillRect(x - 10, y - 12, 20, 3);
        const knocked = L.hive && L.hive.angry > 0 ? Math.sin(t * 40) * 1.2 : 0;
        ctx.fillStyle = '#d9a43a';
        for (let k = 0; k < 4; k++) roundRect(ctx, x - 9 + k * 1.5 + knocked, y - 18 - k * 5, 18 - k * 3, 6, 3, true);
        ctx.fillStyle = '#3a2a1a'; ellipse(ctx, x + knocked, y - 14, 2.2, 1.6);
        if (!L.hive || L.hive.angry <= 0) { // a few lazy bees about the place
          ctx.fillStyle = '#1d1d22';
          for (let k = 0; k < 4; k++) { const a = t * 2.4 + k * 1.6; circle(ctx, x + Math.cos(a) * 14, y - 18 + Math.sin(a * 1.7) * 6, 0.9); }
        }
      },
    };
  }
  function makeMud(x, y, rx, ry) {
    return {
      kind: 'mud', x, y: y - ry - 40, bounds: { l: x - rx, r: x + rx, t: y - ry, b: y + ry },
      draw(ctx, t) {
        ctx.fillStyle = '#6b4a2e'; ellipse(ctx, x, y, rx, ry);
        ctx.fillStyle = '#5a3a20'; ellipse(ctx, x + 4, y + 1, rx * 0.7, ry * 0.6);
        ctx.fillStyle = 'rgba(160,120,80,0.6)';
        for (let k = 0; k < 4; k++) { const b = (t * 0.4 + k * 0.27) % 1; ctx.globalAlpha = 1 - b; circle(ctx, x - rx * 0.5 + k * rx * 0.33, y - 1 + Math.sin(k) * 3, 1 + b * 2); }
        ctx.globalAlpha = 1;
      },
    };
  }
  function makePerch(x, y) {
    return {
      kind: 'perch', x, y, hitbox: box(x - 4, y - 3, 8, 4), bounds: { l: x - 12, r: x + 12, t: y - 44, b: y + 4 },
      draw(ctx) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 1.5, y - 26, 3, 26); ctx.fillRect(x - 9, y - 27, 18, 2.5);
        ctx.fillStyle = '#5a3a20'; ellipse(ctx, x, y, 6, 2);
        ctx.fillStyle = '#c9b57e'; ctx.fillRect(x + 6, y - 27, 4, 4); // seed cup
      },
    };
  }
  // Placed while the map is being built (after the farm)
  function buildWilds() {
    const T = TILE, g = L.garden;
    L.hive = null; L.mud = null; L.perch = null;
    if (L.season === 'spring' || L.season === 'summer') {
      const s = g && (freeSpotNear(g.x + g.w + 1, g.y + 1, 1, 1, 4) || freeSpotNear(g.x - 2, g.y + 1, 1, 1, 4));
      if (s) { const x = (s[0] + 0.5) * T, y = (s[1] + 0.8) * T; L.hive = { x, y, angry: 0, honey: true }; objects.push(makeHive(x, y)); }
    }
    const P = L.paddock;
    const ms = P ? freeSpotNear(P.x + P.w + 1, P.y + P.h - 3, 3, 2, 5) || freeSpotNear(P.x - 4, P.y + 2, 3, 2, 5) : null;
    const m2 = ms || freeSpotNear(L.plaza.x + 14, L.plaza.y + 2, 3, 2, 8) || randomFreeSpot(3, 2);
    if (m2) { const x = (m2[0] + 1.5) * T, y = (m2[1] + 1) * T; L.mud = { x, y, rx: 1.4 * T, ry: 0.85 * T }; objects.push(makeMud(x, y, L.mud.rx, L.mud.ry)); }
    const hs = shuffled(L.houses.slice());
    for (const h of hs) {
      const s = freeSpotNear(h.x + h.w + 1, h.y + h.h, 1, 1, 3);
      if (s) { L.perch = { x: (s[0] + 0.5) * T, y: (s[1] + 0.8) * T }; objects.push(makePerch(L.perch.x, L.perch.y)); break; }
    }
  }

  // --- Spawning -------------------------------------------------------------------------
  function spawnWilds() {
    const T = TILE, g = L.garden;
    const mk = (type, x, y, extra) => critters.push(Object.assign({ type, x, y, z: 0, dir: 'left', walk: 0, ph: rand() * 6, tx: null, wait: rr(0, 3), cd: 0 }, extra));
    // Fox: lurks at the forest edge nearest the hen house
    if (L.coop) { const e = edgeSpot(L.coop.x, L.coop.y); if (e) mk('fox', e.x, e.y, { hx: e.x, hy: e.y, state: 'lurk', t: rr(15, 35) }); }
    // Rabbits around the garden
    if (g && !isWinter()) for (let k = 0; k < 3; k++) {
      const x = (g.x + rr(-2, g.w + 2)) * T, y = (g.y + (k === 0 ? rr(1, g.h - 1) : rr(-2, g.h + 2))) * T;
      if (!critterBlocked({ type: 'rabbit' }, x, y)) mk('rabbit', x, y, { hx: x, hy: y, flee: 0, hopZ: 0 });
    }
    // Badger (comes out at dusk)
    if (!isWinter()) { const e = edgeSpot(rr(0, WORLD_W), rr(0, WORLD_H)); if (e) mk('badger', e.x, e.y, { hx: e.x, hy: e.y, charge: 0 }); }
    // Deer grazing at the forest edge
    { const e = edgeSpot(rr(0, WORLD_W), rr(0, WORLD_H)); if (e) for (let k = 0; k < 2; k++) mk('deer', e.x + k * 26, e.y + k * 10, { hx: e.x, hy: e.y, look: rr(2, 5), up: false, bolt: 0, gone: 0 }); }
    // Fish in open water, and a swan
    if (L.kind !== 'seaside' && hasOpenWater()) {
      for (let k = 0; k < 5; k++) for (let n = 0; n < 40; n++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.85;
        const x = (L.pond.cx + Math.cos(a) * L.pond.rx * d) * T, y = (L.pond.cy + Math.sin(a) * L.pond.ry * d) * T;
        if (tileAt(x, y) === WATER) { mk('pfish', x, y, { flying: true, leap: 0, lx: 0, ly: 0 }); break; }
      }
    }
    if (L.kind !== 'seaside') for (let n = 0; n < 40; n++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.6;
      const x = (L.pond.cx + Math.cos(a) * L.pond.rx * d) * T, y = (L.pond.cy + Math.sin(a) * L.pond.ry * d) * T;
      if (isWaterish(x, y)) { mk('swan', x, y, { hx: x, hy: y, chase: 0 }); break; }
    }
    // Parrot on its perch
    if (L.perch) mk('parrot', L.perch.x, L.perch.y + 0.5, { z: 27, flying: true, heard: null, heardT: 0, thiefCD: 0 });
    // Pig by the mud
    if (L.mud) mk('pig', L.mud.x + 20, L.mud.y + 6, { hx: L.mud.x, hy: L.mud.y, roll: 0, food: null, oinkT: rr(4, 9) });
    // Mice indoors
    (L.rooms || []).forEach((h, k) => {
      if (!h || (k > 1 && rand() < 0.4)) return;
      const R = h.room;
      mk('mouse', (R.x0 + 2 + rand() * 7) * T, (R.y0 + 4 + rand() * 2.5) * T, { room: R, flying: true, flee: 0 });
    });
    // Pepper, a yappy little terrier who hangs about the plaza
    { const P = L.plaza, x = (P.x + 3 + rand() * 6) * T, y = (P.y + 3 + rand() * 6) * T; mk('pup', x, y, { hx: x, hy: y, friend: false, yapT: 0, food: null, lookCD: 0, nipCD: 0 }); }
    // A whirlwind on windy days
    L.whirl = L.weather === 'windy' ? newWhirl() : null;
  }
  function newWhirl() {
    const P = L.plaza;
    return { x: (P.x + rr(-12, 18)) * TILE, y: (P.y + rr(-8, 16)) * TILE, a: rand() * Math.PI * 2, t: 0, hitCD: 0 };
  }

  // --- Per-frame behaviour -------------------------------------------------------------
  function updateWilds(c, dt, near) {
    const pd = Math.hypot(player.x - c.x, player.y - c.y);
    const outside = areaOf(player.x, player.y) === 0;
    const running = player.speed > WALK_SPEED * 1.15;
    c.cd = Math.max(0, (c.cd || 0) - dt);
    switch (c.type) {
      case 'fox': {
        if (c.state === 'lurk') {
          c.t -= dt;
          if (c.t <= 0 && hens.length) { c.state = 'sneak'; c.path = null; }
          break;
        }
        if (c.state === 'flee') {
          if (wayTo(c, c.hx, c.hy, 150, dt)) { c.state = 'lurk'; c.t = rr(35, 60); c.path = null; }
          break;
        }
        if (near || (outside && pd < 110 && running && !player.hidden)) { foxFlee(c); break; }
        if (c.state === 'sneak') {
          if (wayTo(c, L.coop.x, L.coop.y + 26, 46, dt) || Math.hypot(L.coop.x - c.x, L.coop.y - c.y) < 70) {
            c.state = 'hunt'; c.t = 14; c.bubble = { text: '*sniff sniff*', t: 1.2 };
            lookTowards(c.x, c.y, 260, () => rpick(['Is that a fox?!', 'Fox! Mind the hens!', 'Shoo, fox!']));
          }
          break;
        }
        // hunting: chase the nearest hen around the yard
        c.t -= dt;
        let hen = null, hd = 1e9;
        for (const h of hens) { const d = Math.hypot(h.x - c.x, h.y - c.y); if (d < hd) { hd = d; hen = h; } }
        if (!hen || c.t <= 0) { c.state = 'flee'; c.path = null; break; }
        critterMove(c, hen.x, hen.y, 70, dt);
        for (const h of hens) if (Math.hypot(h.x - c.x, h.y - c.y) < 50) {
          if (h.panic <= 0.4) { h.bubble = { text: rpick(['BAWK!', 'FOX!', 'Bwaak!']), t: 1 }; if (pd < 300) sfx('cluck'); }
          h.panic = 1.6; h.fleeA = Math.atan2(h.y - c.y, h.x - c.x) + rr(-0.5, 0.5);
        }
        break;
      }
      case 'rabbit': {
        c.flee = Math.max(0, c.flee - dt);
        c.hopZ = c.moving ? Math.abs(Math.sin(c.walk * 1.4)) * (c.flee > 0 ? 7 : 3) : 0;
        if (near && c.flee < 0.5) {
          c.flee = 2.2; c.fa = Math.atan2(c.y - player.y, c.x - player.x); c.bubble = { text: '!', t: 0.6 };
          completeTask('rabbit');
        }
        if (c.flee > 0) {
          if (Math.random() < dt * 3) c.fa += rr(-1.2, 1.2); // zig-zag
          if (critterMove(c, c.x + Math.cos(c.fa) * 30, c.y + Math.sin(c.fa) * 30, 150, dt) && c.tx === null) c.fa += Math.PI * rr(0.5, 1.5);
          c.hx = c.x; c.hy = c.y;
        } else {
          c.wait -= dt;
          if (c.wait <= 0) { c.tx = c.hx + rr(-40, 40); c.ty = c.hy + rr(-30, 30); c.wait = rr(1, 3.5); }
          if (c.tx && critterMove(c, c.tx, c.ty, 30, dt)) c.tx = null;
        }
        break;
      }
      case 'badger': {
        if (duskK < 0.3) break;
        if (c.charge > 0) {
          c.charge -= dt;
          if (!outside || player.inWardrobe) { c.charge = 0; break; }
          critterMove(c, player.x, player.y, 150, dt);
          if (pd < 14) {
            knockPlayer(c.x, c.y, 220); c.bubble = { text: 'GRRRUMPH!', t: 1.2 }; sfx('growl'); sfx('bonk');
            c.charge = 0; c.cd = 7; completeTask('badger');
          }
          break;
        }
        if (outside && pd < 50 && !player.hidden && c.cd <= 0) { c.charge = 2; c.bubble = { text: 'Grrr...', t: 0.9 }; sfx('growl'); break; }
        c.wait -= dt;
        if (c.wait <= 0) { const e = Math.random() < 0.3 ? edgeSpot(c.x, c.y) : null; c.tx = e ? e.x : c.hx + rr(-120, 120); c.ty = e ? e.y : c.hy + rr(-80, 80); c.wait = rr(3, 6); }
        if (c.tx && critterMove(c, c.tx, c.ty, 22, dt)) c.tx = null;
        if (Math.random() < dt * 0.4) c.bubble = { text: '*snuffle*', t: 0.9 };
        break;
      }
      case 'deer': {
        if (c.gone > 0) { c.gone -= dt; if (c.gone <= 0) { c.x = c.hx + rr(-20, 20); c.y = c.hy + rr(-10, 10); c.bolt = 0; } break; }
        if (c.bolt > 0) { // bounding off into the trees
          c.bolt -= dt; c.walk += dt * 16;
          c.x += Math.cos(c.fa) * 190 * dt; c.y += Math.sin(c.fa) * 190 * dt; c.moving = true;
          if (c.bolt <= 0) c.gone = rr(25, 40);
          break;
        }
        c.look -= dt;
        if (c.look <= 0) { c.up = !c.up; c.look = c.up ? rr(1.2, 2) : rr(2.5, 5); }
        const spooked = outside && started && !player.hidden && ((running && pd < 150) || (c.up && player.speed > 12 && pd < 120) || player.held && pd < 40 && player.held.air);
        if (spooked) {
          for (const d of critters) if (d.type === 'deer' && !(d.bolt > 0) && !(d.gone > 0)) {
            const e = Math.atan2(d.hy - WORLD_H / 2, d.hx - WORLD_W / 2);
            d.bolt = 1.4; d.fa = e + rr(-0.3, 0.3); d.dir = Math.cos(d.fa) > 0 ? 'right' : 'left'; d.bubble = { text: '!', t: 0.6 };
          }
          sfx('flutter');
          break;
        }
        if (outside && pd < 30 && !player.hidden) { completeTask('deer'); c.bubble = { text: '♥', t: 1 }; }
        if (!c.up) { c.wait -= dt; if (c.wait <= 0) { c.tx = c.hx + rr(-30, 30); c.ty = c.hy + rr(-20, 20); c.wait = rr(3, 6); } if (c.tx && critterMove(c, c.tx, c.ty, 9, dt)) c.tx = null; }
        else if (player.x !== c.x) c.dir = player.x > c.x ? 'right' : 'left';
        break;
      }
      case 'pfish': {
        if (c.leap > 0) { // mid-air
          c.leap -= dt;
          const k = 1 - c.leap / 0.7;
          c.x = lerp(c.lx, c.ex, k); c.y = lerp(c.ly, c.ey, k); c.z = Math.sin(k * Math.PI) * 26;
          if (c.leap <= 0) {
            c.z = 0;
            if (c.toPlayer && Math.hypot(player.x - c.x, player.y - c.y) < 26 && !player.held && player.speed < 10) {
              const it = addItem('fish', player.x, player.y); pickUp(it); c.dead = true;
              player.bubble = { text: 'Got one!', t: 1.2 }; completeTask('catchfish');
            } else if (tileAt(c.x, c.y) !== WATER) { addItem('fish', c.x, c.y); c.dead = true; sfx('splat'); } // flopped onto the bank
            else { splash(c.x, c.y, false); sfx('plop'); c.x = c.lx; c.y = c.ly; }
            c.toPlayer = false;
          }
          break;
        }
        // drawn to a raccoon waiting quietly at the water's edge
        const waiting = outside && player.speed < 5 && (player.idleT || 0) > 1.2 && !player.held && pd < 140;
        if (waiting) critterMove(c, player.x, player.y, 26, dt);
        else {
          c.wait -= dt;
          if (c.wait <= 0 || c.tx === null) { c.tx = c.x + rr(-40, 40); c.ty = c.y + rr(-25, 25); c.wait = rr(1.5, 3); }
          if (tileAt(c.tx, c.ty) === WATER) critterMove(c, c.tx, c.ty, 18, dt); else c.tx = null;
        }
        if (tileAt(c.x, c.y) !== WATER) { c.x -= (player.x - c.x) * 0.05; c.y -= (player.y - c.y) * 0.05; }
        c.cd -= dt;
        if (waiting && pd < 36 && c.cd <= 0) { c.leap = 0.7; c.lx = c.x; c.ly = c.y; c.ex = player.x; c.ey = player.y - 2; c.toPlayer = true; c.cd = 4; sfx('plop'); }
        else if (c.cd <= -6 && Math.random() < dt * 0.3) { c.leap = 0.7; c.lx = c.x; c.ly = c.y; c.ex = c.x + rr(-14, 14); c.ey = c.y + rr(-4, 4); c.cd = 0; }
        break;
      }
      case 'swan': {
        if (c.chase > 0) {
          c.chase -= dt;
          if (!outside || player.inWardrobe || player.hidden) c.chase = Math.min(c.chase, 0.3);
          critterMove(c, player.x, player.y, 128, dt);
          c.walk += dt * 8;
          if (pd < 14 && c.cd <= 0) {
            knockPlayer(c.x, c.y, 200); c.bubble = { text: 'HONK!!', t: 1.2 }; sfx('honk'); sfx('bonk');
            c.cd = 10; c.chase = 0; completeTask('swan');
          }
          break;
        }
        if (outside && started && pd < 60 && c.cd <= 0 && !player.hidden) { c.chase = 3.5; c.bubble = { text: 'HSSSS!', t: 1 }; sfx('hiss'); break; }
        if (!isWaterish(c.x, c.y)) { critterMove(c, c.hx, c.hy, 40, dt); break; } // waddle back to the water
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-60, 60); c.ty = c.hy + rr(-40, 40); c.wait = rr(2, 5); }
        if (c.tx && isWaterish(c.tx, c.ty) && critterMove(c, c.tx, c.ty, 14, dt)) c.tx = null; else if (c.tx && !isWaterish(c.tx, c.ty)) c.tx = null;
        break;
      }
      case 'swarm': {
        c.t -= dt;
        const lost = player.hidden || !outside || player.inWardrobe;
        if (c.t <= 0 || lost) { if (lost && c.t > 0) player.bubble = { text: 'phew...', t: 1 }; c.dead = true; if (L.hive) L.hive.angry = 0; break; }
        c.x += (player.x - c.x) * Math.min(1, dt * 1.6); c.y += (player.y - 4 - c.y) * Math.min(1, dt * 1.6);
        if (pd < 18) { c.sting = (c.sting || 0) - dt; if (c.sting <= 0) { c.sting = 1.1; player.bubble = { text: rpick(['Ow!', 'Ouch!', 'Yowch!']), t: 0.8 }; player.hopV = 110; player.hop = 0.01; sfx('bonk'); } }
        for (const v of villagers) {
          if (areaOf(v.x, v.y) !== 0 || Math.hypot(v.x - c.x, v.y - c.y) > 42) continue;
          if (startleV(v, rpick(['BEES!!', 'Aaah! Bees!', 'Get them off!']), { state: 'sulk' })) { v.stateT = 2.5; completeTask('bees'); }
        }
        if (dog && Math.hypot(dog.x - c.x, dog.y - c.y) < 40 && dog.state !== 'return') { dog.state = 'sit'; dog.t = 2; dogSay('Yip!', 1); }
        break;
      }
      case 'parrot': {
        c.thiefCD = Math.max(0, c.thiefCD - dt);
        if (c.heard) { c.heardT -= dt; if (c.heardT <= 0) { c.bubble = { text: 'SQUAWK! ' + c.heard, t: 2 }; if (pd < 320) sfx('squawk'); c.heard = null; } }
        const it = player.held;
        if (outside && started && it && it.owner && pd < 100 && !player.hidden && c.thiefCD <= 0) {
          c.thiefCD = 10; c.bubble = { text: 'THIEF! THIEF!', t: 1.8 }; sfx('squawk'); sfx('squawk');
          lookTowards(player.x, player.y, 260, () => rpick(['Thief? Where?', 'What’s that bird on about?', 'Polly?']));
          completeTask('parrot');
        }
        if (player.x !== c.x && pd < 200) c.dir = player.x > c.x ? 'right' : 'left';
        break;
      }
      case 'pig': {
        c.oinkT -= dt;
        if (c.oinkT <= 0) { c.oinkT = rr(6, 12); c.bubble = { text: rpick(['Oink', 'Snrrk', 'Oink oink']), t: 1 }; if (pd < 280) sfx('oink'); }
        // Food dropped nearby? Gobbled.
        if (!c.food || !items.includes(c.food) || c.food.held || c.food.air) {
          c.food = null;
          for (const f of items) if (isFood(f) && f.touched && !f.held && !f.air && !f.planted && areaOf(f.x, f.y) === 0 && Math.hypot(f.x - c.x, f.y - c.y) < 120) { c.food = f; break; }
        }
        if (c.food) {
          if (critterMove(c, c.food.x, c.food.y, 34, dt) || Math.hypot(c.food.x - c.x, c.food.y - c.y) < 8) {
            const i2 = items.indexOf(c.food); if (i2 >= 0) items.splice(i2, 1);
            crumbs(c.x, c.y, 3, 6, '#c9b57e'); c.bubble = { text: 'SNORF!', t: 1 }; if (pd < 280) sfx('oink'); c.food = null;
          }
          break;
        }
        c.roll = Math.max(0, c.roll - dt);
        const inMud = L.mud && ((c.x - L.mud.x) / L.mud.rx) ** 2 + ((c.y - L.mud.y) / L.mud.ry) ** 2 < 1;
        if (inMud && c.roll <= 0 && Math.random() < dt * 0.25) c.roll = 2.5;
        if (c.roll > 0) break;
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-55, 55); c.ty = c.hy + rr(-30, 30); c.wait = rr(2, 5); }
        if (c.tx && critterMove(c, c.tx, c.ty, 16, dt)) c.tx = null;
        break;
      }
      case 'mouse': {
        const R = c.room, minX = (R.x0 + 1.4) * TILE, maxX = (R.x0 + 9.6) * TILE, minY = (R.y0 + 3) * TILE, maxY = (R.y0 + 6.8) * TILE;
        const same = areaOf(player.x, player.y) === areaOf(c.x, c.y);
        c.flee = Math.max(0, c.flee - dt);
        if (same && pd < 55 && player.speed > 20 && c.flee < 0.3) { c.flee = 1.6; c.fa = Math.atan2(c.y - player.y, c.x - player.x) + rr(-0.4, 0.4); c.bubble = { text: 'eek!', t: 0.6 }; sfx('squeak'); }
        let tx, ty, sp;
        if (c.flee > 0) { tx = c.x + Math.cos(c.fa) * 30; ty = c.y + Math.sin(c.fa) * 30; sp = 140; }
        else { c.wait -= dt; if (c.wait <= 0 || c.tx === null) { c.tx = rr(minX, maxX); c.ty = rr(minY, maxY); c.wait = rr(1, 3); } tx = c.tx; ty = c.ty; sp = c.wait > 0.6 ? 60 : 0; }
        if (sp) {
          const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
          if (d > 1) { c.x += dx / d * Math.min(d, sp * dt); c.y += dy / d * Math.min(d, sp * dt); c.dir = dx > 0 ? 'right' : 'left'; c.moving = true; c.walk += dt * 20; }
        }
        if (c.x < minX || c.x > maxX) { c.x = clamp(c.x, minX, maxX); c.fa = Math.PI - c.fa; }
        if (c.y < minY || c.y > maxY) { c.y = clamp(c.y, minY, maxY); c.fa = -c.fa; }
        if (c.flee > 0) for (const v of villagers) {
          if (areaOf(v.x, v.y) !== areaOf(c.x, c.y) || Math.hypot(v.x - c.x, v.y - c.y) > 40) continue;
          if (startleV(v, rpick(['EEEK! A MOUSE!', 'A mouse!!', 'Get it out!']), { state: 'sulk' })) { v.stateT = 2; completeTask('mouse'); }
        }
        break;
      }
      case 'pup': updatePup(c, dt, pd, outside); break;
    }
  }

  function foxFlee(c) {
    if (c.state === 'flee' || c.state === 'lurk') return;
    c.state = 'flee'; c.path = null; c.bubble = { text: 'Yip!', t: 0.8 }; sfx('yip');
    completeTask('fox');
  }

  function updatePup(c, dt, pd, outside) {
    c.yapT -= dt; c.lookCD = Math.max(0, c.lookCD - dt); c.nipCD = Math.max(0, c.nipCD - dt);
    // Snacks win Pepper over
    if (!c.food || !items.includes(c.food) || c.food.held || c.food.air) {
      c.food = null;
      for (const f of items) if (isFood(f) && f.touched && !f.held && !f.air && !f.planted && areaOf(f.x, f.y) === 0 && Math.hypot(f.x - c.x, f.y - c.y) < 140) { c.food = f; break; }
    }
    if (c.food) {
      if (critterMove(c, c.food.x, c.food.y, 120, dt) || Math.hypot(c.food.x - c.x, c.food.y - c.y) < 8) {
        const it = c.food, i2 = items.indexOf(it); if (i2 >= 0) items.splice(i2, 1);
        crumbs(c.x, c.y, 3, 6, '#c9b57e'); sfx('chomp'); c.food = null;
        if (it.touched && !c.friend) {
          c.friend = true; c.bubble = { text: 'Yip! ♥', t: 1.4 }; sfx('happy');
          for (let k = 0; k < 4; k++) particles.push({ kind: 'heart', x: c.x + rr(-6, 6), y: c.y, z: 14 + k * 4, life: 1.2, max: 1.2 });
          completeTask('pepper');
        }
      }
      return;
    }
    if (c.friend) {
      // Trots along at your heels, and yaps at anyone chasing you
      if (outside && pd > 34) { if (pd > 400) { c.x = player.x - 20; c.y = player.y; } critterMove(c, player.x - 18, player.y + 4, pd > 90 ? 200 : 110, dt); }
      for (const v of villagers) if (v.state === 'chase' && c.nipCD <= 0 && Math.hypot(v.x - c.x, v.y - c.y) < 50) {
        c.nipCD = 7; c.bubble = { text: 'YAP! YAP!', t: 1 }; sfx('yip');
        startleV(v, rpick(['Pepper, no!', 'Off, you little...', 'Gah! The dog!']));
      }
      return;
    }
    // Not a friend: yaps at the raccoon and gives you away
    if (outside && started && pd < 130 && !player.hidden) {
      if (pd > 40) critterMove(c, player.x, player.y, 90, dt);
      else { c.circle = (c.circle || 0) + dt * 3; critterMove(c, player.x + Math.cos(c.circle) * 34, player.y + Math.sin(c.circle) * 20, 110, dt); }
      if (c.yapT <= 0) {
        c.yapT = 1.2; c.bubble = { text: rpick(['Yip! Yip!', 'YAP!', 'Rrrip!']), t: 0.8 }; sfx('yip');
        if (c.lookCD <= 0) { c.lookCD = 5; lookTowards(player.x, player.y, 190, () => rpick(['What’s Pepper yapping at?', 'Pepper? What is it?'])); }
      }
      return;
    }
    c.wait -= dt;
    if (c.wait <= 0) { c.tx = c.hx + rr(-90, 90); c.ty = c.hy + rr(-70, 70); c.wait = rr(1, 3); }
    if (c.tx && critterMove(c, c.tx, c.ty, 50, dt)) c.tx = null;
  }

  // Chitter reactions
  function wildScare(c, x, y, r) {
    const real = r < 9999, d = Math.hypot(c.x - x, c.y - y);
    if (c.type === 'fox' && real) foxFlee(c);
    if (c.type === 'rabbit') { c.flee = 2.2; c.fa = Math.atan2(c.y - y, c.x - x); if (real) completeTask('rabbit'); }
    if (c.type === 'badger' && real && duskK >= 0.3 && c.cd <= 0 && d < 110) { c.charge = 2; c.bubble = { text: 'GRRR!', t: 0.9 }; sfx('growl'); }
    if (c.type === 'deer' && !(c.bolt > 0) && !(c.gone > 0)) { c.bolt = 1.4; c.fa = Math.atan2(c.hy - WORLD_H / 2, c.hx - WORLD_W / 2); c.dir = Math.cos(c.fa) > 0 ? 'right' : 'left'; }
    if (c.type === 'swan' && real && c.cd <= 0) { c.chase = 3.5; c.bubble = { text: 'HSSSS!', t: 1 }; sfx('hiss'); }
    if (c.type === 'parrot' && real) { c.heard = rpick(['Chirr! Hehe!', 'Skrrt! Skrrt!', 'Mine! Mine!']); c.heardT = 1; }
    if (c.type === 'pig' && real) { c.bubble = { text: 'OINK!', t: 1 }; sfx('oink'); c.tx = c.x + (c.x - x); c.ty = c.y + (c.y - y); }
    if (c.type === 'mouse' && real && areaOf(x, y) === areaOf(c.x, c.y)) { c.flee = 1.6; c.fa = Math.atan2(c.y - y, c.x - x); sfx('squeak'); }
  }
  // Villagers' words get picked up by the parrot
  function parrotHear(v, text) {
    for (const c of critters) if (c.type === 'parrot' && !c.heard && Math.hypot(v.x - c.x, v.y - c.y) < 220 && text.length < 30 && Math.random() < 0.6) { c.heard = text; c.heardT = 1.6; }
  }

  // Bump or hit the beehive and out comes a swarm (and a jar of honey)
  function angerHive() {
    const H = L.hive;
    if (!H || H.angry > 0) return;
    H.angry = 1; sfx('buzz');
    critters.push({ type: 'swarm', x: H.x, y: H.y - 16, z: 0, flying: true, dir: 'left', walk: 0, ph: 0, t: 9 });
    if (H.honey) { H.honey = false; addItem('honey', H.x + 12, H.y + 6); }
    player.bubble = { text: 'uh oh', t: 1.2 };
  }
  ITEM.honey = { name: 'honey', h: 9, r: 5, draw(c) {
    c.fillStyle = '#e8a33a'; roundRect(c, -4, -9, 8, 9, 2, true);
    c.fillStyle = '#f2c14e'; c.fillRect(-3, -7, 3, 5);
    c.fillStyle = '#c9b57e'; c.fillRect(-4.5, -10, 9, 2.5);
  } };
  FOOD.honey = { bites: 2, fill: 20, sweet: true };

  // Whirlwind, frost, mud, puddle soaking: once a frame
  function updateWildsWorld(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    // Beehive: run into it, or throw something at it
    const H = L.hive;
    if (H) {
      H.angry = Math.max(0, H.angry - dt * 0.05);
      if (outside && Math.hypot(player.x - H.x, player.y - H.y) < 26 && Math.max(player.speed, H.lastSpd || 0) > 60) angerHive();
      H.lastSpd = player.speed;
      for (const it of items) if (it.air && Math.hypot(it.vx, it.vy) > 80 && it.z < 30 && Math.hypot(it.x - H.x, it.y - H.y) < 16) { angerHive(); break; }
    }
    // Mud: roll in it, then track it everywhere
    if (L.mud && outside) {
      const m = L.mud, k = ((player.x - m.x) / m.rx) ** 2 + ((player.y - m.y) / m.ry) ** 2;
      if (k < 1) {
        if (!(player.mud > 20)) { sfx('splat'); for (let n = 0; n < 6; n++) particles.push({ kind: 'shard', col: '#6b4a2e', x: player.x, y: player.y, z: 3, vx: rr(-40, 40), vy: rr(-20, 20), vz: rr(40, 90), life: 0.6, max: 0.6 }); }
        player.mud = 40; completeTask('mud');
      }
    }
    if (player.mud > 0) {
      player.mud -= dt * (wet() ? 2 : 1);
      if (areaOf(player.x, player.y) > 0) completeTask('muddy');
    }
    // Whirlwind
    const W = L.whirl;
    if (W) {
      W.t += dt; W.hitCD = Math.max(0, W.hitCD - dt);
      W.a += rr(-1, 1) * dt * 2;
      let nx = W.x + Math.cos(W.a) * 55 * dt, ny = W.y + Math.sin(W.a) * 40 * dt;
      if (nx < 6 * TILE || nx > WORLD_W - 6 * TILE || ny < 6 * TILE || ny > WORLD_H - 6 * TILE || isWaterish(nx, ny)) { W.a += Math.PI * 0.8; nx = W.x; ny = W.y; }
      W.x = nx; W.y = ny;
      if (Math.random() < dt * 25) particles.push({ x: W.x + rr(-14, 14), y: W.y + rr(-4, 4), r: rr(2, 4), life: 0.5, max: 0.5, vy: -20 });
      for (const it of items) {
        if (it.held || it.air || it.type.heavy || it.planted || it.floating || areaOf(it.x, it.y) !== 0) continue;
        if (Math.hypot(it.x - W.x, it.y - W.y) < 22) { const a = rr(0, Math.PI * 2); Object.assign(it, { air: true, vz: rr(240, 320), vx: Math.cos(a) * rr(80, 150), vy: Math.sin(a) * rr(50, 100), spin: rr(-12, 12), kicker: null }); }
      }
      if (outside && W.hitCD <= 0 && Math.hypot(player.x - W.x, player.y - W.y) < 20 && !player.inWardrobe) {
        W.hitCD = 4; player.bubble = { text: 'wheeee!', t: 1.3 };
        knockPlayer(W.x - rr(-5, 5), W.y - rr(-5, 5), 280); player.hopV = 260; player.stun = 0.8; player.spin = 0.9;
        sfx('whoosh'); completeTask('whirlwind');
      }
      for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - W.x, v.y - W.y) < 20) startleV(v, rpick(['Whoa!', 'My hat!', 'What a wind!']));
    }
    if (player.spin > 0) { player.spin -= dt; player.dir = ['down', 'right', 'up', 'left'][Math.floor(time * 14) % 4]; }
  }
  function drawWhirl(ctx, t) {
    const W = L.whirl;
    if (!W) return;
    ctx.save(); ctx.lineCap = 'round';
    for (let k = 0; k < 11; k++) {
      const h = k * 7, r = 6 + k * 2.8, a = t * 9 + k * 0.7;
      ctx.strokeStyle = `rgba(150,128,92,${0.75 - k * 0.045})`; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(W.x + Math.sin(t * 3 + k) * 2, W.y - h, r, r * 0.35, 0, a, a + 4); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,100,70,0.3)'; ellipse(ctx, W.x, W.y, 18, 5);
    for (let k = 0; k < 5; k++) { const a = t * 7 + k * 1.3, h = (t * 30 + k * 13) % 60; ctx.fillStyle = k % 2 ? '#c99a4a' : '#8fbf5a'; circle(ctx, W.x + Math.cos(a) * (6 + h * 0.3), W.y - h, 1.4); }
    ctx.restore();
  }
  // Frost: slippery paths with a white sheen
  const frosty = (x, y) => !!L && L.weather === 'frost' && areaOf(x, y) === 0 && [PATH, STONE, BRIDGE].includes(tileAt(x, y));
  function drawFrost(ctx, left, top, viewW, viewH, t) {
    if (!L || L.weather !== 'frost') return;
    const x0 = Math.max(0, Math.floor(left / TILE)), y0 = Math.max(0, Math.floor(top / TILE));
    const x1 = Math.min(MW - 1, Math.ceil((left + viewW) / TILE)), y1 = Math.min(MH - 1, Math.ceil((top + viewH) / TILE));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t0 = getT(x, y);
      if (t0 === PATH || t0 === STONE || t0 === BRIDGE) {
        ctx.fillStyle = 'rgba(225,238,255,0.45)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (((x * 7 + y * 13) % 5) === 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 3 + x + y) * 0.5})`; circle(ctx, x * TILE + 8 + (y % 3) * 5, y * TILE + 9, 0.9); }
      } else if (t0 === GRASS && ((x * 3 + y * 5) % 4) === 0) { ctx.fillStyle = 'rgba(240,246,255,0.25)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
  }
  // Villagers chasing you can slip on the frost
  function frostSlip(v, dt) {
    if (v.state !== 'chase' || !frosty(v.x, v.y) || Math.random() > dt * 0.5) return;
    if (startleV(v, rpick(['Whoooa!', 'Oof! Slippery!', 'Woah-oh-oh!']), { state: 'sulk' })) {
      v.stateT = 2; sfx('thud');
      for (let k = 0; k < 6; k++) particles.push({ kind: 'shard', col: '#eaf4ff', x: v.x, y: v.y, z: 2, vx: rr(-40, 40), vy: rr(-15, 15), vz: rr(30, 70), life: 0.6, max: 0.6 });
      completeTask('slip');
    }
  }

  // --- Drawing --------------------------------------------------------------------------
  function drawWilds(ctx, c, t) {
    if (c.dead) return;
    if (c.type === 'badger' && duskK < 0.3) return;
    if (c.type === 'deer' && c.gone > 0) return;
    if (c.type === 'fox' && c.state === 'lurk') return; // hidden in the trees
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.type === 'badger') ctx.globalAlpha = Math.min(1, (duskK - 0.3) * 4);
    if (c.type === 'deer' && c.bolt > 0) ctx.globalAlpha = Math.min(1, c.bolt / 0.6);
    if (c.type === 'swarm') {
      for (let k = 0; k < 18; k++) {
        const a = t * (4 + (k % 5)) + k * 2.1, rad = 4 + (k % 4) * 3;
        ctx.fillStyle = k % 3 ? '#1d1d22' : '#f2c14e';
        circle(ctx, Math.cos(a) * rad, -16 + Math.sin(a * 1.3) * rad * 0.7, 1.1);
      }
      ctx.restore(); return;
    }
    if (c.type === 'pfish') {
      if (c.z > 0) { // leaping
        ctx.translate(0, -c.z); ctx.rotate((c.ex > c.lx ? 1 : -1) * (c.leap - 0.35) * 2);
        ctx.fillStyle = '#c9d4dc'; ellipse(ctx, 0, 0, 6, 2.6);
        ctx.fillStyle = '#8fa3b1'; poly(ctx, [[-5, 0], [-9, -3], [-9, 3]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 3.5, -0.6, 0.6);
      } else {
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#2b4a5e';
        ctx.rotate(Math.sin(c.ph) * 0.2 + (c.dir === 'left' ? Math.PI : 0)); ellipse(ctx, 0, 0, 6, 2.2);
        poly(ctx, [[-5, 0], [-9, -2.5], [-9, 2.5]]); ctx.fill();
      }
      ctx.restore(); return;
    }
    const small = c.type === 'mouse' || c.type === 'rabbit' || c.type === 'parrot';
    if (c.type !== 'parrot') { ctx.fillStyle = 'rgba(20,30,10,0.22)'; ellipse(ctx, 0, 0, small ? 4 : c.type === 'deer' ? 11 : 8, small ? 1.6 : 2.6); }
    ctx.translate(0, -(c.z || 0) - (c.hopZ || 0));
    if (c.dir === 'left') ctx.scale(-1, 1);
    const step = c.moving ? Math.sin(c.walk * 2) * 2 : 0;
    switch (c.type) {
      case 'fox': {
        ctx.fillStyle = '#2b2d33';
        ctx.fillRect(-5 + step * 0.5, -5, 1.6, 5); ctx.fillRect(4 - step * 0.5, -5, 1.6, 5);
        ctx.fillStyle = '#d9682a'; roundRect(ctx, -7, -11, 14, 7, 3.5, true);
        ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(-16, -12, -15, -4); ctx.quadraticCurveTo(-11, -6, -6, -6); ctx.fill(); // brush
        ctx.fillStyle = '#f4f2ee'; circle(ctx, -14.5, -5, 1.8);
        ctx.fillStyle = '#d9682a'; poly(ctx, [[4, -9], [12, -10], [13, -7], [6, -5]]); ctx.fill(); // snout
        poly(ctx, [[5, -11], [6, -16], [8, -11]]); ctx.fill(); poly(ctx, [[8, -11], [9.5, -15.5], [10.5, -10.5]]); ctx.fill();
        ctx.fillStyle = '#f4f2ee'; poly(ctx, [[6, -6.5], [12, -7.2], [8, -5]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 13, -8.5, 0.9); circle(ctx, 8.5, -9, 0.7);
        break;
      }
      case 'rabbit': {
        ctx.fillStyle = '#a08060'; ellipse(ctx, -1, -4, 4.5, 3.5); ellipse(ctx, 3, -7, 2.6, 2.4);
        ctx.fillStyle = '#a08060'; ellipse(ctx, 2.4, -11, 0.9, 3); ellipse(ctx, 3.8, -11, 0.9, 3);
        ctx.fillStyle = '#f4f2ee'; circle(ctx, -5, -4, 1.6);
        ctx.fillStyle = '#1d1d22'; circle(ctx, 4.2, -7.4, 0.6);
        break;
      }
      case 'badger': {
        ctx.fillStyle = '#2b2d33';
        ctx.fillRect(-6 + step * 0.4, -4, 2, 4); ctx.fillRect(4 - step * 0.4, -4, 2, 4);
        ctx.fillStyle = '#7a7a80'; ellipse(ctx, -1, -6.5, 8.5, 4.5);
        ctx.fillStyle = '#f4f2ee'; poly(ctx, [[5, -10], [13, -6], [12, -3], [5, -4]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; poly(ctx, [[6, -9], [12, -5.6], [12, -4.8], [6, -7.4]]); ctx.fill(); // the stripe
        circle(ctx, 13, -4.5, 0.9);
        break;
      }
      case 'deer': {
        const head = c.up ? -10 : -1;
        ctx.fillStyle = '#6b4a2e';
        for (const lx of [-6, -3, 4, 7]) ctx.fillRect(lx + (lx < 0 ? step : -step) * 0.5, -11, 1.6, 11);
        ctx.fillStyle = '#b07d48'; roundRect(ctx, -9, -18, 19, 8, 4, true);
        ctx.fillStyle = '#f4f2ee'; circle(ctx, -9, -15, 1.8);
        ctx.fillStyle = '#b07d48'; poly(ctx, [[6, -16], [9, -16], [12, -18 + head], [9, -18 + head]]); ctx.fill(); // neck
        roundRect(ctx, 9, -21 + head, 7, 5, 2.4, true);
        poly(ctx, [[10, -21 + head], [9, -25 + head], [12, -21 + head]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 13.5, -19.5 + head, 0.7); circle(ctx, 15.8, -18 + head, 0.6);
        ctx.fillStyle = '#f4f2ee'; for (const [sx, sy] of [[-4, -16], [0, -15], [3, -16.5]]) circle(ctx, sx, sy, 0.8);
        break;
      }
      case 'swan': {
        const hiss = c.chase > 0;
        ctx.fillStyle = '#f8f8f6'; ellipse(ctx, -1, -4, 8, 4.5);
        poly(ctx, [[-8, -5], [-12, -9], [-6, -7]]); ctx.fill();
        if (hiss) { poly(ctx, [[-4, -7], [-10, -15], [2, -8]]); ctx.fill(); } // wings up
        ctx.strokeStyle = '#f8f8f6'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(5, -5);
        if (hiss) ctx.quadraticCurveTo(8, -7, 11, -7); else ctx.quadraticCurveTo(9, -10, 6, -16);
        ctx.stroke();
        ctx.fillStyle = '#e8732a'; if (hiss) { poly(ctx, [[11, -8], [15, -7], [11, -6]]); ctx.fill(); } else { poly(ctx, [[6, -17], [10, -16], [6, -15]]); ctx.fill(); }
        ctx.fillStyle = '#1d1d22'; circle(ctx, hiss ? 10.5 : 6, hiss ? -8 : -16.5, 0.7);
        if (isWaterish(c.x, c.y)) { ctx.fillStyle = 'rgba(200,230,255,0.4)'; ellipse(ctx, 0, -0.5, 10, 2); }
        break;
      }
      case 'parrot': {
        ctx.fillStyle = '#3fae5a'; ellipse(ctx, 0, -5, 3.6, 5);
        ctx.fillStyle = '#e8453c'; ellipse(ctx, 0.5, -10, 3, 3);
        ctx.fillStyle = '#3a7fd0'; poly(ctx, [[-2, -3], [-3, 4], [0, 1]]); ctx.fill(); // tail
        ctx.fillStyle = '#f2c14e'; poly(ctx, [[2.8, -10.5], [5.5, -9.5], [3, -8]]); ctx.fill();
        ctx.fillStyle = '#f4f2ee'; circle(ctx, 1.6, -10.8, 1.1); ctx.fillStyle = '#1d1d22'; circle(ctx, 1.8, -10.8, 0.5);
        break;
      }
      case 'pig': {
        const rolling = c.roll > 0;
        if (rolling) ctx.rotate(Math.sin(t * 6) * 0.6);
        ctx.fillStyle = '#e89aa6';
        ctx.fillRect(-6 + step * 0.4, -5, 2.2, 5); ctx.fillRect(4 - step * 0.4, -5, 2.2, 5);
        ellipse(ctx, 0, -8, 9, 5.5);
        ellipse(ctx, 8, -8.5, 4, 3.8);
        ctx.fillStyle = '#d97a8a'; ellipse(ctx, 11.5, -8, 1.8, 1.6); poly(ctx, [[6, -11.5], [7, -14.5], [9, -11.5]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 9.5, -10, 0.7);
        ctx.strokeStyle = '#d97a8a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-10, -9, 1.6, 0, Math.PI * 1.6); ctx.stroke();
        ctx.fillStyle = 'rgba(107,74,46,0.75)'; ellipse(ctx, -3, -6, 3, 2); ellipse(ctx, 3, -10, 2, 1.5); // muddy patches
        break;
      }
      case 'mouse': {
        ctx.scale(1.3, 1.3);
        ctx.fillStyle = '#66666e'; ellipse(ctx, 0, -2, 3.4, 2.2); ellipse(ctx, 3, -2.4, 1.8, 1.5);
        ctx.fillStyle = '#c9a0a8'; circle(ctx, 2.4, -4, 1); circle(ctx, 4.6, -2.2, 0.5);
        ctx.strokeStyle = '#c9a0a8'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.quadraticCurveTo(-6, -4 + Math.sin(c.ph * 8), -8, -1); ctx.stroke();
        break;
      }
      case 'pup': {
        const wag = Math.sin(c.ph * (c.friend ? 22 : 12)) * 3;
        ctx.fillStyle = '#f4f2ee';
        ctx.fillRect(-5 + step * 0.5, -5, 1.8, 5); ctx.fillRect(3.5 - step * 0.5, -5, 1.8, 5);
        roundRect(ctx, -6.5, -10, 13, 6.5, 3, true);
        roundRect(ctx, 4, -14, 7, 6.5, 2.5, true);
        ctx.fillStyle = '#b07d48'; ellipse(ctx, -2, -8.5, 3, 2.2); poly(ctx, [[5, -14], [6, -17], [8, -14]]); ctx.fill(); // patch + ear
        ctx.strokeStyle = '#f4f2ee'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-9, -13 + wag * 0.4); ctx.stroke();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 8.5, -11.8, 0.7); circle(ctx, 11, -10.3, 0.8);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(3.5, -9, 3, 1.2); // collar
        break;
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
      case 'baa': tone(420, 360, 0.25, 'sawtooth', 0.035); break;
      case 'moo': tone(160, 120, 0.6, 'sawtooth', 0.05); break;
      case 'meh': tone(520, 440, 0.2, 'square', 0.03); tone(480, 400, 0.12, 'square', 0.025, 0.2); break;
      case 'hoot': tone(420, 380, 0.18, 'sine', 0.06); tone(400, 360, 0.25, 'sine', 0.06, 0.25); break;
      case 'quack': tone(560, 380, 0.09, 'sawtooth', 0.04); tone(540, 360, 0.09, 'sawtooth', 0.035, 0.12); break;
      case 'flutter': for (let k = 0; k < 5; k++) noise(0.04, 0.05, 3500); break;
      case 'ribbit': tone(260, 200, 0.07, 'square', 0.03); tone(300, 220, 0.07, 'square', 0.03, 0.09); break;
      case 'plop': tone(700, 200, 0.12, 'sine', 0.06); break;
      case 'squawk': tone(1300, 800, 0.18, 'sawtooth', 0.04); tone(1200, 700, 0.15, 'sawtooth', 0.035, 0.16); break;
      case 'thunder': { const n = Math.floor(actx.sampleRate * 1.8), b = actx.createBuffer(1, n, actx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
        const s = actx.createBufferSource(); s.buffer = b; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
        const g = actx.createGain(); g.gain.value = 0.9; s.connect(f).connect(g).connect(master); s.start(); break; }
      case 'growl': tone(110, 90, 0.4, 'sawtooth', 0.06); break;
      case 'honk': tone(330, 280, 0.16, 'sawtooth', 0.06); tone(320, 260, 0.2, 'sawtooth', 0.05, 0.18); break;
      case 'oink': tone(240, 180, 0.12, 'sawtooth', 0.05); tone(220, 170, 0.12, 'sawtooth', 0.04, 0.14); break;
      case 'squeak': tone(2400, 3000, 0.05, 'sine', 0.04); tone(2600, 3200, 0.05, 'sine', 0.035, 0.07); break;
      case 'yip': tone(900, 600, 0.06, 'square', 0.05); tone(950, 620, 0.06, 'square', 0.045, 0.09); break;
      case 'buzz': for (let k = 0; k < 4; k++) tone(180, 200, 0.2, 'sawtooth', 0.025, k * 0.18); break;
      case 'whoosh': noise(0.7, 0.18, 800); break;
      case 'cluck': [700, 900, 760].forEach((f, k) => tone(f, f * 0.7, 0.06, 'square', 0.035, k * 0.07)); break;
      case 'splat': noise(0.12, 0.12, 1500); break;
      case 'creak': tone(180, 240, 0.25, 'sawtooth', 0.025); tone(240, 160, 0.2, 'triangle', 0.03, 0.18); break;
      case 'chomp': noise(0.08, 0.14, 2200); tone(260, 180, 0.06, 'square', 0.04, 0.02); break;
      case 'gulp': tone(300, 120, 0.14, 'sine', 0.09); tone(260, 110, 0.12, 'sine', 0.07, 0.15); break;
      case 'burp': tone(110, 70, 0.35, 'sawtooth', 0.09); break;
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
    if (e.code === 'KeyQ' && !e.repeat) startEating();
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
  const eatBtn = document.getElementById('eat');
  eatBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!started) { start(); return; } if (!paused) startEating(); });
  grabBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!started) { start(); return; } if (!paused) grabOrDrop(); });
  throwBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!started) { start(); return; } if (!paused) throwHeld(); });
  function syncTouchButtons() {
    const pcl = petChoice();
    const label = player.inWardrobe ? 'out' : pcl === 'wardrobe' ? 'hide' : player.held ? 'drop' : pcl ? 'pet' : 'grab';
    if (grabBtn.textContent !== label) grabBtn.textContent = label;
    grabBtn.classList.toggle('ready', !!(player.held || target || petChoice()));
    if (throwBtn.hidden === !!player.held) throwBtn.hidden = !player.held;
    const canEat = isFood(player.held);
    if (eatBtn.hidden === canEat) eatBtn.hidden = !canEat;
    const eatLabel = player.eating ? 'stop' : 'eat';
    if (eatBtn.textContent !== eatLabel) eatBtn.textContent = eatLabel;
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
    for (const r of online.peers.values()) {
      if (r.x > left - pad && r.x < left + viewW + pad && r.y > top - pad && r.y < top + viewH + pad + 40) vis.push({ y: r.y, isRemote: true, r });
    }
    for (const c of critters) if (c.x > left - pad && c.x < left + viewW + pad && c.y > top - pad && c.y < top + viewH + pad + 60) vis.push({ y: c.y, isCritter: true, c });
    for (const h of hens) if (h.x > left - pad && h.x < left + viewW + pad && h.y > top - pad && h.y < top + viewH + pad) vis.push({ y: h.y, isHen: true, h });
    if (cat && cat.x > left - pad && cat.x < left + viewW + pad && cat.y > top - pad && cat.y < top + viewH + pad + 40) vis.push({ y: cat.y + 0.5, isCat: true });

    if (!indoors) { drawPuddles(ctx, t); drawFrost(ctx, left, top, viewW, viewH, t); }
    // Ground-level effects: dust and ripples
    for (const q of particles) {
      if (q.kind === 'ring') {
        ctx.strokeStyle = `rgba(255,255,255,${(q.life / q.max) * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r, q.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (q.kind === 'print') {
        ctx.fillStyle = q.mud ? `rgba(90,58,30,${(q.life / q.max) * 0.7})` : `rgba(110,130,165,${(q.life / q.max) * 0.45})`;
        ellipse(ctx, q.x, q.y, 2.2, 1.4); circle(ctx, q.x - 1.6, q.y - 2.2, 0.8); circle(ctx, q.x + 1.6, q.y - 2.2, 0.8);
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
      if (o.isRemote) { drawRemote(ctx, o.r, t); continue; }
      if (o.isHen) { drawHen(ctx, o.h, t); continue; }
      if (o.isCritter) { drawCritter(ctx, o.c, t); continue; }
      let fade = false;
      if (o.canopy && player.y < o.y && player.y > o.canopy.cy - o.canopy.r && Math.abs(player.x - o.x) < o.canopy.r + 6) fade = true;
      o.draw(ctx, t, fade);
    }

    if (!indoors) drawWhirl(ctx, t);
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
    if (pc === 'wardrobe') drawPrompt(ctx, { x: nearWardrobe.x, y: nearWardrobe.y, z: 0, owner: null, type: { h: 74, name: 'hide in wardrobe' } }, t);
    else if (pc === 'dog') drawPrompt(ctx, { x: dog.x, y: dog.y, z: 0, owner: null, type: { h: 24, name: 'pet Biscuit' } }, t);
    else if (pc === 'cat') drawPrompt(ctx, { x: cat.x, y: cat.y, z: cat.z, owner: null, type: { h: 18, name: 'pet Marmalade' } }, t);
    else if (target && started) drawPrompt(ctx, target, t);
    drawBubble(ctx, player);
    for (const v of villagers) if (v.bubble) drawBubbleAt(ctx, v.x, v.y - v.hop - 46 * v.scale, v.bubble);
    for (const h of hens) if (h.bubble) drawBubbleAt(ctx, h.x, h.y - 28, h.bubble);
    for (const c of critters) if (c.bubble) drawBubbleAt(ctx, c.x, c.y - (c.z || 0) - 24, c.bubble);
    if (dog && dog.bubble) drawBubbleAt(ctx, dog.x, dog.y - dog.hop - 38, dog.bubble);
    if (cat && cat.bubble) drawBubbleAt(ctx, cat.x, cat.y - cat.z - cat.hop - 32, cat.bubble);
    for (const r of online.peers.values()) {
      if (r.x > left - 60 && r.x < left + viewW + 60 && r.y > top - 60 && r.y < top + viewH + 80) drawRemoteTag(ctx, r);
    }

    drawDoorHint(ctx, t);
    drawEatHint(ctx, t);
    drawScoopHint(ctx, t);

    // Drifting cloud shadows (outdoors only)
    ctx.fillStyle = 'rgba(20,35,60,0.07)';
    if (!indoors) for (const c of clouds) {
      ellipse(ctx, c.x, c.y, c.rx, c.ry);
      ellipse(ctx, c.x + c.rx * 0.5, c.y - c.ry * 0.3, c.rx * 0.6, c.ry * 0.7);
    }

    if (!indoors) { drawWeather(ctx, left, top, viewW, viewH, t, Math.min(0.05, t - (render.lastT || t))); drawSeasonTint(ctx, left, top, viewW, viewH); }
    if (!indoors) drawRainbow(ctx, Math.min(0.05, t - (render.lastT || t)));
    render.lastT = t;
    drawDusk(ctx, left, top, viewW, viewH);

    // ---- Screen space UI ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWeatherOverlay(ctx, indoors, left, top);
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
      for (const r of online.peers.values()) {
        const rp = outdoorPos(r.x, r.y);
        ctx.fillStyle = (r.by && online.colors[r.by]) || '#7fe3ff';
        circle(ctx, mx + rp.x / WORLD_W * mw, my + rp.y / WORLD_H * mh, 2.6);
        ctx.strokeStyle = '#1c2418'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(mx + rp.x / WORLD_W * mw, my + rp.y / WORLD_H * mh, 2.6, 0, Math.PI * 2); ctx.stroke();
      }
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
      updateHens(dt);
      updateDusk();
      updateCritters(dt);
      updateWildsWorld(dt);
      updateWeatherFx(dt);
      updateSeason(dt);
      updateHiding(dt);
      checkTasks(dt);
      updateBellyHud();
      if (started && !run.over) {
        run.timeLeft -= dt;
        updateTimer();
        if (run.timeLeft <= 0) { run.timeLeft = 0; endRun('sunset'); }
      }
      run.shake = Math.max(0, run.shake - dt);
    }
    updateAmbient(dt);
    updateAmbienceLevel();
    updateOnline(dt);
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
  function newVillage(seed, opts = {}) {
    rand = mulberry32(seed);
    map.fill(0); used.fill(0);
    objects.length = 0; items.length = 0; villagers.length = 0;
    particles.length = 0; butterflies.length = 0; clouds.length = 0;
    for (const k of Object.keys(VILLAGER)) delete VILLAGER[k];
    L = genLayout(opts);
    buildMap();
    solidObjects = objects.filter((o) => o.hitbox);
    renderGround(seed);
    buildNav();
    placeItems();
    spawnVillagers();
    spawnDog();
    spawnCat();
    spawnHens();
    placePuddles();
    spawnCritters();
    spawnWeather();
    hideBushes = objects.filter((o) => o.kind === 'hidebush' || o.kind === 'bed' || o.kind === 'leafpile'); // places to hide
    spawnAmbient();
    Object.assign(player, { x: HIDEOUT.x, y: HIDEOUT.y + 6, vx: 0, vy: 0, held: null, stun: 0, hop: 0, hopV: 0, bubble: null, dir: 'down', speed: 0, hidden: false, hidingIn: null, inWardrobe: null, tummy: 0, stuffed: false, sugar: 0, eating: null, mud: 0, spin: 0 });
    target = null;
    cam.x = player.x; cam.y = player.y;
  }

  function boot() {
    loadSave();
    setupRun(save.day);
    run.seed = dailySeed(save.day);
    newVillage(run.seed);
    dealTasks();
    initTodoToggle();
    buildTodo();
    updateRunBar();
    resize();
    requestAnimationFrame((n) => { last = n; frame(n); });
    initOnline();
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
  window.mischief = { player, items, objects, villagers, run, save, completeTask, endRun, get layout() { return L; }, newVillage, startDay, findPath, worldPicture, get dog() { return dog; }, get critters() { return critters; }, fx, setWeather, get duskK() { return duskK; }, online, dailySeed, get cat() { return cat; }, get hideBushes() { return hideBushes; }, butterflies };

  const hot = window.claude?.hot;
  if (hot?.ready) hot.ready(() => boot()); else boot();
})();
