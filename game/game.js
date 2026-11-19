// Mischief Lane — vertical slice
// A top-down sandbox: one raccoon, one village, walk anywhere.
// Everything is drawn procedurally with Canvas 2D (no image assets).
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const TILE = 32;
  const MW = 96;            // map width in tiles
  const MH = 68;            // map height in tiles
  const AREA_K = (MW * MH) / (72 * 52); // how much bigger than the original 72×52 village (scales scenery)
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
  const VILLAGE_B_KIND = { market: ['market', 'cross', 'chester', 'borough'], windmill: ['mill', 'hill', 'down', 'barrow'], lake: ['mere', 'lake', 'water', 'pool'], castle: ['castle', 'keep', 'tower', 'gate'], forest: ['wood', 'grove', 'holt', 'shaw'], mountain: ['crag', 'peak', 'fell', 'tor'], canal: ['lock', 'wharf', 'cut', 'basin'], orchard: ['orchard', 'garth', 'apple', 'pippin'], railway: ['junction', 'halt', 'sidings', 'cross'], marsh: ['marsh', 'fen', 'moss', 'mire'] };
  function genLayout(opts = {}) {
    let kind = opts.kind || pick(KIND_NAMES);
    const harbour = kind === 'harbour';
    if (harbour) kind = 'seaside'; // a harbour town is a seaside village with a working harbour
    const season = opts.season || pick(SEASON_NAMES);
    const weatherName = opts.weather || pickWeather(season);
    const roadY = kind === 'seaside' ? 24 + Math.floor(rand() * 8) : 29 + Math.floor(rand() * 10);  // top row of the 2-wide east–west road
    const roadX = 37 + Math.floor(rand() * 21); // left column of the 2-wide north–south road
    const quads = {
      NW: { x0: 4, y0: 4, x1: roadX - 1, y1: roadY - 1, north: true },
      NE: { x0: roadX + 3, y0: 4, x1: MW - 4, y1: roadY - 1, north: true },
      SW: { x0: 4, y0: roadY + 3, x1: roadX - 1, y1: kind === 'seaside' ? MH - 11 : MH - 4, north: false },
      SE: { x0: roadX + 3, y0: roadY + 3, x1: MW - 4, y1: kind === 'seaside' ? MH - 11 : MH - 4, north: false },
    };
    const order = shuffled(['NW', 'NE', 'SW', 'SE']);
    return {
      name: pick(VILLAGE_A) + pick(kind === 'seaside' ? VILLAGE_B_SEA : kind === 'river' ? VILLAGE_B_RIVER : VILLAGE_B_KIND[kind] || VILLAGE_B),
      event: opts.event !== undefined ? opts.event : pickEvent(season),
      night: opts.night !== undefined ? opts.night : run.day >= 2 && rand() < 0.22,
      pest: opts.pest !== undefined ? opts.pest : (run.day >= 2 && rand() < 0.45) || run.day >= 5,
      eclipse: opts.eclipse !== undefined ? opts.eclipse : rand() < 0.1 ? { at: 0.3 + rand() * 0.25, dur: 30 } : null,
      kind, harbour, season, weather: weatherName, weatherPlan: opts.plan || planWeather(season, weatherName), planIdx: 1, roadY, roadX,
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
      let rx = L.kind === 'lake' ? 11 : 7 + Math.floor(rand() * 3), ry = L.kind === 'lake' ? 7 : 5 + Math.floor(rand() * 2), r = null, w = 0, h = 0;
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
      if (L.kind === 'lake') { buildLakeIsland(cx, cy, rx, ry); buildJetty(); }
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
    buildCanal();
    buildRailway();
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
    buildKindEarly(markSolid);

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
      for (let row = 0; row < 4 && placed < 4; row++) {
        const hh = 4;
        const hy0 = q.north ? q.y1 - hh - 2 - row * 8 : q.y0 + 2 + row * 8;
        if (hy0 < q.y0 + 1 || hy0 + hh > q.y1 - 1) continue;
        for (let x = q.x0 + Math.floor(rand() * 3); x < q.x1 - 5 && placed < 4; ) {
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
    if (L.jetty) carvePath(L.jetty.baseX - L.jetty.sx, L.jetty.baseY - L.jetty.sy, solid);
    if (L.castle) carvePath(L.castle.out[0], L.castle.out[1], solid);
    if (L.maze) carvePath(L.maze.entrance.x, L.maze.entrance.y, solid);
    if (L.museum) carvePath(L.museum.x + Math.floor(L.museum.w / 2) - 1, L.museum.y + L.museum.h, solid);

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
      const ho = makeHouse(h.x, h.y, h.w, h.h, h.roof); h.obj = ho;
      { const d0 = ho.draw; ho.draw = (c, t, f) => { d0(c, t, f); drawPipe(c, h); drawGutters(c, h); }; }
      objects.push(ho);
      objects.push(makeMailbox((h.doorX + 1.2) * TILE, (h.y + h.h + 0.7) * TILE));
      if (shopOf(h)) objects.push(makeShopFront(h, shopOf(h)));
    }

    // Plaza props
    const px = plaza.x, py = plaza.y;
    objects.push(makeWell((px + 6) * TILE, (py + 4.2) * TILE));
    if (L.kind !== 'market') { // on market day the stalls take the benches' places
      objects.push(makeBench((px + 2) * TILE, (py + 1.4) * TILE));
      objects.push(makeBench((px + 10) * TILE, (py + 1.4) * TILE));
      objects.push(makeBench((px + 2) * TILE, (py + 10.6) * TILE));
      objects.push(makeBench((px + 10) * TILE, (py + 10.6) * TILE));
    }
    for (const [lx, ly] of [[0.5, 0.6], [11.5, 0.6], [0.5, 11.6], [11.5, 11.6]]) objects.push(makeLamp((px + lx) * TILE, (py + ly) * TILE));
    {
      const pcx = px + 6;
      const gcx = L.garden.x + 5.5;
      const right = L.pond.cx > pcx ? 'POND' : gcx > pcx ? 'GARDEN' : 'HOMES';
      const left = L.pond.cx <= pcx ? 'POND' : gcx <= pcx ? 'GARDEN' : 'HOMES';
      objects.push(makeSign((px + 8.2) * TILE, (py + 7.4) * TILE, right, left === right ? 'HOMES' : left));
    }
    buildKindLate();

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
    buildSnowFeatures();

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
    for (let n = 0; n < (L.kind === 'forest' ? 180 : 75) * AREA_K; n++) { const s = openSpot(1); if (s) objects.push(makeTree((s[0] + rr(0.3, 0.7)) * TILE, (s[1] + rr(0.5, 0.9)) * TILE)); }
    for (let n = 0; n < 45 * AREA_K; n++) { const s = openSpot(0); if (s) objects.push(makeBush((s[0] + 0.5) * TILE, (s[1] + 0.75) * TILE)); }
    for (let n = 0; n < 25 * AREA_K; n++) { const s = openSpot(0); if (s) objects.push(makeRock((s[0] + 0.5) * TILE, (s[1] + 0.7) * TILE)); }
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
      if (k >= Math.floor(MW / ROOM_STRIDE)) return; // as many rooms as fit in the strip; any extra house stays locked
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
    const shop = shopOf(h);
    objects.push(shop ? makeShopCounter((x0 + 5.5) * T, (y0 + 5) * T, shop.col) : makeTableIn((x0 + 5.5) * T, (y0 + 5) * T));
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
    const shop = shopOf(h);
    if (shop) { // ding-a-ling!
      sfx('shopbell'); completeTask('shopbell');
      const keeper = VILLAGER[shop.owner];
      if (keeper && areaOf(keeper.x, keeper.y) === h.area && keeper.state === 'act') { keeper.dir = 'down'; say(keeper, rpick(['Be right with you!', 'Hello? Who’s there?', 'Welcome!']), 1.6); }
    }
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
      kind: 'house', x: X + W / 2, y: Y + H, chimneyX, roofTop, wallTop,
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
          ctx.fillStyle = this.paint || '#c99b63';
          ctx.fillRect(X, y - 16, TILE, 3.5);
          ctx.fillRect(X, y - 8, TILE, 3.5);
          ctx.fillStyle = this.paint ? shade(this.paint, -0.15) : '#a87a45';
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
        ctx.fillStyle = this.paint || '#c99b63';
        ctx.fillRect(x - 1.5, Y - 14, 3.5, TILE);
        ctx.fillStyle = this.paint ? shade(this.paint, -0.15) : '#a87a45';
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
      kind: 'sign', x, y, right: rightLabel, left: leftLabel,
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
        ctx.fillText(this.right, x + 13, y - 36);
        ctx.fillText(this.left, x - 13, y - 21);
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
    for (let i = 0; i < LK.blades * AREA_K; i++) {
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
    // Flagstones anywhere else that's paved (castle courtyard, museum gallery)
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (getT(x, y) !== STONE || (x >= L.plaza.x && x < L.plaza.x + L.plaza.w && y >= L.plaza.y && y < L.plaza.y + L.plaza.h)) continue;
      g.fillStyle = '#a9a496'; g.fillRect(x * TILE, y * TILE, TILE, TILE);
      for (const [ox, oy, w, h] of [[1, 1, 14, 14], [17, 1, 14, 14], [1, 17, 14, 14], [17, 17, 14, 14]]) { g.fillStyle = grng() < 0.5 ? '#bcb7a8' : '#b2ad9e'; roundRect(g, x * TILE + ox, y * TILE + oy, w, h, 2, true); }
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
      for (let i = 0; i < LK.leaves * AREA_K; i++) {
        const x = gr(0, WORLD_W), y = gr(0, WORLD_H), t0 = map[idx(Math.floor(x / TILE), Math.floor(y / TILE))];
        if (t0 !== GRASS && t0 !== PATH && t0 !== STONE) continue;
        g.fillStyle = ['#c0392b', '#e07b2a', '#f0a040', '#d9a43a', '#8a5a2e'][Math.floor(grng() * 5)];
        g.beginPath(); g.ellipse(x, y, 3, 1.7, grng() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    // Flowers & clover on open grass
    const petals = LK.petals || [];
    for (let i = 0; i < (petals.length ? LK.flowers * AREA_K : 0); i++) {
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
    return (t === WATER && !canSwim()) || t === WALL;
  }
  function collides(x, y) {
    if (player.boat) return boatBlocked(x, y);
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
    if (player.tree) { updateTree(dt, input); return; }
    if (player.roof) { updateRoof(dt, input); return; }
    if (player.ride) { updateRide(dt, input); return; }
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
    player.swim = !player.boat && areaOf(player.x, player.y) === 0 && tileAt(player.x, player.y) === WATER;
    if (player.boat) maxSpd = 80; // rowing
    else if (player.swim) maxSpd = 70; // paddling
    else if (player.sled) maxSpd = onHill(player.x, player.y) ? 290 : 115;
    else if (player.hidingIn && player.hidingIn.kind === 'drift') maxSpd *= 0.6; // wading through snow
    else if (inFlood(player.x, player.y)) maxSpd *= 0.65; // wading through flood water
    else if (inBog(player.x, player.y)) maxSpd *= 0.45; // stuck in the sucking mud
    else if (player.stuffed) maxSpd = Math.min(maxSpd, WALK_SPEED * 0.75); // waddle
    else if (player.sugar > 0) maxSpd *= 1.25;                         // zoom
    const tx = ix * maxSpd, ty = iy * maxSpd;

    const approach = (v, target, rate) => {
      if (v < target) return Math.min(target, v + rate * dt);
      return Math.max(target, v - rate * dt);
    };
    const slip = player.sled ? 0.22 : onIce(player.x, player.y) ? 0.14 : frosty(player.x, player.y) ? 0.3 : 1;
    if (player.sled && onHill(player.x, player.y)) player.vy += 320 * dt; // downhill! // ice: hard to start, harder to stop
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
    fairyCheck();
    puddleJump();
    if (duskK >= 0.4 && critters.some((c) => c.type === 'bat' && Math.hypot(c.x - player.x, c.y - player.y) < 180)) { for (const c of critters) if (c.type === 'bat') c.scatter = 3; sfx('squeak'); completeTask('bats'); }
    caveEcho();
    for (const v of villagers) {
      if (Math.hypot(v.x - player.x, v.y - player.y) < chitterRadius() && startleV(v, rpick(['Eek!', 'Gah!', 'Yikes!']))) completeTask('jump');
    }
    for (const b of butterflies) {
      if (Math.hypot(b.x - player.x, b.y - player.y) < 140) b.flee = 1.5;
    }
  }

  // Raccoon rendering --------------------------------------------------------
  let FUR = '#8b909a', FUR_DARK = '#5a5e68', FUR_LIGHT = '#c9ccd3', RING = '#3c3f47'; // fur colours can be changed in the den
  const MASK = '#2b2d33', WHITE = '#f4f2ee', NOSE = '#1d1d22';

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
    if (p === player) drawDisguise(ctx, p);
    if (p.flour > 0) { // dusted white from ears to tail
      ctx.globalAlpha = Math.min(1, p.flour / 5) * 0.72; ctx.fillStyle = '#fbfaf6';
      ellipse(ctx, 0, -9, 11, 8); ellipse(ctx, 0, -17, 8, 6); ellipse(ctx, -9, -8, 5, 3);
      ctx.globalAlpha = 1;
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
      } else if (q.kind === 'print' || q.kind === 'slime' || q.kind === 'shoeprint') { /* fades where it is */ }
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
      const shop = shopOf(h);
      if (shop) { // the shop counter: the day's goods laid out
        const goods = shop.owner === 'rosa' ? ['cake', ...shop.goods] : shop.goods;
        goods.forEach((k, i) => { addItem(k, (x0 + 5.5) * T - 36 + i * (72 / Math.max(1, goods.length - 1)), tableY - 2, { z: 22, owner: shop.owner }).shop = true; });
      } else {
        addItem(onTable[0], (x0 + 5.5) * T - 15, tableY, { z: 22, owner });
        addItem(onTable[1], (x0 + 5.5) * T + 15, tableY, { z: 22, owner });
      }
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
    placeKindItems();
    placeSnowItems();
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
      if (it.held || (it.air && it.z > 12) || (player.swim && it.type.heavy)) continue;
      const dist = Math.hypot(it.x - rx, it.y - ry) - it.type.r * 0.5;
      if (dist < bd) { bd = dist; best = it; }
    }
    return best;
  }

  function grabOrDrop() {
    if (!started) return;
    if (player.inWardrobe) { exitWardrobe(); return; }
    if (boatAction()) return;
    if (sledAction()) return;
    if (treeAction()) return;
    if (roofAction()) return;
    if (leverAction()) return;
    if (rideAction()) return;
    if (rummageAction()) return;
    if (player.held && !(petChoice() === 'wardrobe')) { dropHeld(false); return; }
    if (!target && signAction()) return;
    if (!target && knockAction()) return;
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
    if (it.stall) { completeTask('stall'); if (['teddy', 'toyboat', 'kite'].includes(it.kind)) completeTask('toystall'); }
    if (it.kind === 'bigfish') completeTask('bigfish');
    if (it.kind === 'present') completeTask('present');
    if (it.kind === 'net') completeTask('netsteal');
    if (L.eclipseOn) completeTask('eclipse');
    if (it.blown) completeTask('umbrella');
    if (it.kind === 'ring') completeTask('lockring');
    if (it.woodnuts) completeTask('woodpecker');
    if (it.kind === 'suitcase') completeTask('luggage');
    if (it.catch) completeTask('catch');
    if (it.kind === 'wispgem') completeTask('wisp');
    if (it.stall && L.harbour) completeTask('fishmarket');
    if (it.trainOff !== undefined) delete it.trainOff;
    if (it.scarehat) completeTask('scarehat');
    if (areaOf(it.x, it.y) > 0) budgieTattle(it);
    if (it.shop) {
      const keeper = VILLAGER[it.owner];
      if (keeper && areaOf(keeper.x, keeper.y) === areaOf(it.x, it.y)) completeTask('counter');
      if (it.kind === 'sweets' || it.kind === 'lolly') completeTask('sweets');
      if (it.kind === 'letters') completeTask('letters');
    }
    if (L.night && it.owner && VILLAGER[it.owner] && VILLAGER[it.owner].dozing > 0 && areaOf(VILLAGER[it.owner].x, VILLAGER[it.owner].y) === areaOf(it.x, it.y)) completeTask('tiptoe');
    if (it.museum) { if (it.kind === 'crown') completeTask('heist'); if (!run.alarms) completeTask('sneaky'); }
    if (it.kind === 'tortoise') completeTask('tortoise');
    if (it.kind === 'rosette') completeTask('rosette');
    if (it.kind === 'weddingcake') completeTask('weddingcake');
    if (it.kind === 'bouquet') completeTask('bouquet');
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
    if (player.tree) { dropFromTree(); return; }
    if (player.roof) { dropFromRoof(); return; }
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
      if (it.held) { const hp = it.heldBy ? (it.heldBy === dog ? heldPosDog() : it.heldBy.type === 'gull' ? heldPosGull(it.heldBy) : it.heldBy.carrier ? heldPosCritter(it.heldBy) : heldPosV(it.heldBy)) : heldPos(time); it.x = hp.x; it.y = hp.y; it.z = hp.z; continue; }
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
          if (it.kind === 'snowball') { completeTask('snowballhit'); if (v.id === 'toby') { run.tobyHits = (run.tobyHits || 0) + 1; setProgress('snowfight', run.tobyHits); if (run.tobyHits >= 3) say(v, 'OK, OK, you win!', 1.8); } shatter(it); items.splice(i, 1); }
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
        if (it.type.fragile && it.vz < (it.kind === 'snowball' || it.kind === 'flour' ? -40 : -165)) { shatter(it); items.splice(i, 1); continue; } // crash!
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
    {
      id: 'guard', name: 'the museum', skin: '#e0b090', hair: '#2a2a30', shirt: '#2c3d63', pants: '#1d2a44', hat: 'cap', capColor: '#1d2a44',
      speed: 50, chase: 128, pitch: 160,
      lines: { patrol: ['All quiet.', 'No funny business.', 'Hm hm hm.', 'Lovely treasures, these.'] },
    },
    {
      id: 'pest', name: 'the pest controller', skin: '#d9a07a', hair: '#3a2a1a', shirt: '#d9a43a', pants: '#3f5f3a', hat: 'cap', capColor: '#3f5f3a',
      speed: 52, chase: 140, pitch: 130, lines: {},
    },
    {
      id: 'watch', name: 'the night watchman', skin: '#e8b996', hair: '#5a5a60', shirt: '#2c3a5e', pants: '#1d2436', hat: 'beanie', capColor: '#2c3a5e', beard: true,
      speed: 40, chase: 120, pitch: 150,
      lines: { patrol: ['All’s well!', 'Midnight, and all’s well!', 'Who goes there?', '*yawn*'] },
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
      case 'pest': return [S((P.x + 6) * T, (P.y + 6) * T, 'hunt', 5, 'down')];
      case 'watch': return [
        S((P.x + 1) * T, (P.y + 1) * T, 'patrol', 3, 'down'), S((P.x + 11) * T, (P.y + 1) * T, 'patrol', 3, 'left'),
        S((L.roadX + 0.5) * T, (L.roadY + 12) * T, 'patrol', 4, 'up'), S((P.x + 11) * T, (P.y + 11) * T, 'patrol', 3, 'up'),
        S((L.roadX - 12) * T, (L.roadY + 1) * T, 'patrol', 4, 'right'), S((P.x + 1) * T, (P.y + 11) * T, 'patrol', 3, 'right'),
      ];
      case 'guard': {
        const M = L.museum, X = M.x * T, Y = M.y * T, W = M.w * T, H = M.h * T;
        return [
          S(X + W / 2, Y + H * 0.62, 'patrol', 5, 'down'),
          S(X + W + 20, Y + H + 14, 'patrol', 4, 'left'),
          S(X + W / 2, Y + H + 26, 'patrol', 6, 'up'),
          S(X - 20, Y + H + 14, 'patrol', 4, 'right'),
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
      if ((d.id === 'guard' && !L.museum) || (d.id === 'pest' && !L.pest) || (d.id === 'watch' && !L.night)) continue;
      const stops = withStall(d.id, stopsFor(d.id)).map((s) => {
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
    const nightK = L && L.night && areaOf(v.x, v.y) === 0 ? (v.id === 'watch' ? 0.9 : 0.5) : 1;
    if (d > run.vision * visionMul() * nightK || areaOf(v.x, v.y) !== areaOf(x, y)) return false;
    if (d > 45 || (L && L.night && v.id === 'watch')) { const f = DIRV[v.dir]; if ((dx * f[0] + dy * f[1]) / d < 0.2) return false; }
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
    if (stop.act === 'sleep' && !(v.dozing > 0) && time > (v.wokeT || 0)) v.dozing = 9999;
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
        const ls = stop.lines || v.lines[stop.act] || (stop.act === 'home' ? HOME_LINES : null);
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
      if (ph && ph.owner === v.id && sees && (!player.disguise || Math.hypot(player.x - v.x, player.y - v.y) < 60) && !playerInHideout() && v.cooldown <= 0 && !v.held && v.state !== 'chase' && v.state !== 'startled') startChase(v, ph);

      if (v.id === 'pest' && (v.state === 'route' || v.state === 'act')) v.state = 'hunt';
      if (v.id === 'watch' && (v.state === 'route' || v.state === 'act') && sees && Math.hypot(player.x - v.x, player.y - v.y) < 150) { // the watchman calls out
        v.state = 'chase'; v.target = null; v.stateT = 8; v.lostT = 0; v.lastSeen = { x: player.x, y: player.y }; v.path = null; say(v, 'HALT! Who goes there?!', 1.6, true); sfx('alert');
      }
      switch (v.state) {
        case 'route': case 'act': routine(v, dt); if (started) tidyScan(v, dt); break;
        case 'chase': chase(v, dt, sees); break;
        case 'fetch': fetchItem(v, dt, sees); break;
        case 'return': returnHome(v, dt); break;
        case 'sulk': v.stateT -= dt; if (v.stateT <= 0) toRoute(v); break;
        case 'startled': v.stateT -= dt; if (v.stateT <= 0) afterStartle(v); break;
        case 'game': if (v.game) hideSeek(v, dt); else toRoute(v); break;
        case 'hunt': pestHunt(v, dt); break;
      }
      if (L.weather === 'frost' || L.weather === 'sleet') frostSlip(v, dt);

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
    if (wet() && areaOf(v.x, v.y) === 0 && !v.noBrella) { // an umbrella against the rain
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
    { id: 'stall', tier: 'Easy', text: 'Swipe something from a market stall', req: ['stalls'] },
    { id: 'flour', tier: 'Easy', text: 'Get covered in flour', hint: 'throw a flour sack', req: ['mill'] },
    { id: 'wheat', tier: 'Easy', text: 'Hide in the wheat field', req: ['wheatfield'] },
    { id: 'hay', tier: 'Easy', text: 'Hide in the haystack by the barn', req: ['barn'] },
    { id: 'row', tier: 'Easy', text: 'Row the boat out onto the lake', hint: 'press E by the boat at the jetty', req: ['boat'] },
    { id: 'rosette', tier: 'Easy', text: 'Swipe the first-prize rosette', req: ['fete'] },
    { id: 'toffee', tier: 'Easy', text: 'Eat a toffee apple', req: ['bonfire'] },
    { id: 'robin', tier: 'Easy', text: 'Get close to a robin', hint: 'don’t run', req: ['robins'] },
    { id: 'snowyowl', tier: 'Easy', text: 'Startle the snowy owl into flight', hint: 'chitter at it', req: ['snowyowl'] },
    { id: 'icicles', tier: 'Easy', text: 'Knock the icicles off a house', hint: 'throw something at the front', req: ['winter'] },
    { id: 'snowflake', tier: 'Easy', text: 'Catch a snowflake on your tongue', hint: 'stand still and look up', req: ['snowy'] },
    { id: 'sledge', tier: 'Easy', text: 'Sledge down the hill', hint: 'E by the sledge at the top', req: ['hill'] },
    { id: 'drift', tier: 'Easy', text: 'Burrow into a snowdrift', req: ['drifts'] },
    { id: 'igloo', tier: 'Easy', text: 'Hide in the igloo', req: ['igloo'] },
    { id: 'horse', tier: 'Easy', text: 'Feed the horse', hint: 'drop some food near it', req: ['stable'] },
    { id: 'horsekick', tier: 'Easy', text: 'Get kicked by the horse', hint: 'walk behind it', req: ['stable'] },
    { id: 'llama', tier: 'Easy', text: 'Get spat at by the llama', req: ['llama'] },
    { id: 'tortoise', tier: 'Easy', text: "Pick up Granny Mabel's tortoise", req: ['tortoise'] },
    { id: 'bell', tier: 'Easy', text: 'Ring the castle bell', hint: 'tug the rope', req: ['bell'] },
    { id: 'armour', tier: 'Easy', text: 'Hide in a suit of armour', req: ['armour'] },
    { id: 'treehouse', tier: 'Easy', text: 'Climb up into a treehouse', hint: 'E at the ladder', req: ['treehouses'] },
    { id: 'fairyring', tier: 'Easy', text: 'Chitter in a fairy ring', req: ['rings'] },
    { id: 'hollow', tier: 'Easy', text: 'Hide in the hollow tree', req: ['hollow'] },
    { id: 'shopbell', tier: 'Easy', text: 'Ring a shop’s doorbell', hint: 'walk into a shop', req: ['shops'] },
    { id: 'alarm', tier: 'Easy', text: 'Set off the museum alarm', hint: 'touch a red tripwire', req: ['museum'] },
    { id: 'disguise', tier: 'Easy', text: 'Put on a disguise', hint: 'hold a hat, bucket, shirt… and press G' },
    { id: 'bury', tier: 'Easy', text: 'Bury something', hint: 'press B on grass or sand' },
    { id: 'swim', tier: 'Easy', text: 'Go for a swim', req: ['swimmable'] },
    { id: 'roof', tier: 'Easy', text: 'Climb onto a roof', hint: 'E at a drainpipe' },
    { id: 'trapspring', tier: 'Easy', text: 'Spring a cage trap from a distance', hint: 'throw something at it', req: ['pest'] },
    { id: 'snail', tier: 'Easy', text: 'Find a snail', hint: 'they come out in the rain', req: ['snails'] },
    { id: 'web', tier: 'Easy', text: 'Walk through a dewy spider web', hint: 'on the fences', req: ['webs'] },
    { id: 'dragonfly', tier: 'Easy', text: 'Get up close to a dragonfly', hint: 'by the water, no running', req: ['dragonflies'] },
    { id: 'crab', tier: 'Easy', text: 'Get pinched by a crab', req: ['seaside'] },
    { id: 'heron', tier: 'Easy', text: 'Scare the heron off its fishing spot', req: ['heron'] },
    { id: 'flood', tier: 'Easy', text: 'Wade through the flood water', hint: 'a downpour floods the pond', req: ['flood'] },
    { id: 'puddlejump', tier: 'Easy', text: 'Jump in a puddle', hint: 'chitter while standing in one', req: ['puddles'] },
    { id: 'mudprints', tier: 'Easy', text: 'Leave 30 muddy pawprints', goal: 30, req: ['wetday'] },
    { id: 'echo', tier: 'Easy', text: 'Chitter in the cave and hear it echo', hint: 'step inside first', req: ['cave'] },
    { id: 'mgoat', tier: 'Easy', text: 'Chase a mountain goat up the rocks', req: ['mgoats'] },
    { id: 'lookout', tier: 'Easy', text: 'Ride the cable car up to the lookout', req: ['cable'] },
    { id: 'narrowboat', tier: 'Easy', text: 'Hitch a ride on a narrowboat', hint: 'E beside one', req: ['boats'] },
    { id: 'lock', tier: 'Easy', text: 'Work the canal lock', hint: 'pull the red lever', req: ['lock'] },
    { id: 'shake', tier: 'Easy', text: 'Shake an apple tree', hint: 'run into the trunk', req: ['orchardtrees'] },
    { id: 'carousel', tier: 'Easy', text: 'Ride the carousel', req: ['carousel'] },
    { id: 'bigwheel', tier: 'Easy', text: 'Ride to the top of the big wheel', req: ['bigwheel'] },
    { id: 'candyfloss', tier: 'Easy', text: 'Eat some candyfloss', req: ['candy'] },
    { id: 'mirrors', tier: 'Easy', text: 'Get lost in the hall of mirrors', req: ['tent'] },
    { id: 'boar', tier: 'Easy', text: 'Get charged by the wild boar', hint: 'go near her piglets', req: ['boar'] },
    { id: 'moose', tier: 'Easy', text: 'Shoo the moose off the road', hint: 'chitter at it', req: ['moose'] },
    { id: 'bats', tier: 'Easy', text: 'Scatter the bats', hint: 'after dusk, round the lamps' },
    { id: 'kitten', tier: 'Easy', text: 'Make friends with the kitten', hint: 'sit still beside it', req: ['kitten'] },
    { id: 'hamster', tier: 'Easy', text: 'Let the hamster out', hint: 'in Toby’s room', req: ['hamster'] },
    { id: 'tent', tier: 'Easy', text: 'Hide in a tent at the campsite', req: ['camp'] },
    { id: 'marshmallow', tier: 'Easy', text: 'Toast a marshmallow', hint: 'hold it by the campfire', req: ['camp'] },
    { id: 'rummage', tier: 'Easy', text: 'Rummage through the scrapyard', hint: 'E by a junk pile', req: ['scrap'] },
    { id: 'crowfield', tier: 'Easy', text: 'Scatter the crows from the field', req: ['fieldcrows'] },
    { id: 'trainride', tier: 'Easy', text: 'Ride the train', hint: 'hop on at the station', req: ['rail'] },
    { id: 'luggage', tier: 'Easy', text: 'Pinch luggage off the station platform', req: ['rail'] },
    { id: 'traintoot', tier: 'Easy', text: 'Get tooted at by the train', hint: 'stand on the tracks... then move!', req: ['rail'] },
    { id: 'lighthouse', tier: 'Easy', text: 'Climb the lighthouse', req: ['harbourtown'] },
    { id: 'lobster', tier: 'Easy', text: 'Raid a lobster pot', req: ['harbourtown'] },
    { id: 'bog', tier: 'Easy', text: 'Get stuck in the sucking mud', req: ['bog'] },
    { id: 'stilthut', tier: 'Easy', text: 'Hide in a stilt hut', req: ['huts'] },
    { id: 'toad', tier: 'Easy', text: 'Hear the giant toad croak', req: ['bog'] },
    { id: 'signswap', tier: 'Easy', text: 'Swap the signposts round', hint: 'E at the plaza sign' },
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
    { id: 'cart', tier: 'Medium', text: 'Knock over the fruit cart', hint: 'run into it', req: ['cart'] },
    { id: 'toystall', tier: 'Medium', text: "Steal a toy from Percy's toy stall", req: ['stalls'] },
    { id: 'ghost', tier: 'Medium', text: 'Scare someone while covered in flour', hint: 'they’ll think you’re a ghost', req: ['mill'] },
    { id: 'island', tier: 'Medium', text: 'Stash something on the island', req: ['island'] },
    { id: 'bigfish', tier: 'Medium', text: 'Steal the prize fish from the fishing contest', req: ['contest'] },
    { id: 'cakecontest', tier: 'Medium', text: 'Eat a cake from the cake contest', req: ['fete'] },
    { id: 'bouquet', tier: 'Medium', text: 'Steal the wedding bouquet', req: ['wedding'] },
    { id: 'firework', tier: 'Medium', text: 'Set off a firework', hint: 'throw a rocket into the bonfire', req: ['bonfire'] },
    { id: 'scarecrows', tier: 'Medium', text: 'Knock down 3 festival scarecrows', goal: 3, hint: 'throw things at them', req: ['scarecrows'] },
    { id: 'stoat', tier: 'Medium', text: 'Make the stoat drop a stolen egg', hint: 'it raids the hen house', req: ['stoat'] },
    { id: 'present', tier: 'Medium', text: 'Swipe a present off the reindeer’s sleigh', hint: 'startle the reindeer', req: ['sleigh'] },
    { id: 'roofsnow', tier: 'Medium', text: 'Dump roof snow on someone', hint: 'hit the house as they pass the door', req: ['winter'] },
    { id: 'sledbump', tier: 'Medium', text: 'Crash your sledge into someone', req: ['hill'] },
    { id: 'buildsnowman', tier: 'Medium', text: 'Build your own snowman', hint: 'drop 3 snowballs together', req: ['winter'] },
    { id: 'snowfight', tier: 'Medium', text: 'Win a snowball fight with Toby', hint: 'hit him 3 times', goal: 3, req: ['winter'] },
    { id: 'ducklings', tier: 'Medium', text: 'Lead the ducklings on a parade', hint: 'walk up to them slowly', req: ['ducklings'] },
    { id: 'llamaspit', tier: 'Medium', text: 'Get the llama to spit at a villager', hint: 'annoy it when someone’s near', req: ['llama'] },
    { id: 'tortoisestash', tier: 'Medium', text: "Stash Granny Mabel's tortoise in your hideout", req: ['tortoise'] },
    { id: 'ropebridge', tier: 'Medium', text: 'Cross the rope bridge between the treehouses', req: ['treehouses'] },
    { id: 'treedrop', tier: 'Medium', text: 'Drop something on someone from a treehouse', hint: 'F from up top', req: ['treehouses'] },
    { id: 'logs', tier: 'Medium', text: 'Send the woodpile rolling', hint: 'run into it', req: ['logpile'] },
    { id: 'sweets', tier: 'Medium', text: 'Pinch something from the sweet shop', req: ['sweetshop'] },
    { id: 'letters', tier: 'Medium', text: 'Swipe the sack of letters from the post office', req: ['postoffice'] },
    { id: 'hideseek', tier: 'Medium', text: 'Win hide-and-seek with Toby', hint: 'go up to him, then hide' },
    { id: 'race', tier: 'Medium', text: 'Beat Biscuit in a race', hint: 'stand on the RACE line, then run', req: ['race'] },
    { id: 'disguisewalk', tier: 'Medium', text: 'Stroll past someone with their things, in disguise', req: [] },
    { id: 'bury3', tier: 'Medium', text: 'Bury 3 things', goal: 3 },
    { id: 'swimescape', tier: 'Medium', text: 'Escape a chaser by swimming', req: ['swimmable'] },
    { id: 'roofdrop', tier: 'Medium', text: 'Drop something on someone from a roof', hint: 'F from the edge' },
    { id: 'chimney', tier: 'Medium', text: 'Drop something down a chimney', hint: 'F next to the chimney' },
    { id: 'pestescape', tier: 'Medium', text: 'Give the pest controller the slip', req: ['pest'] },
    { id: 'tiptoe', tier: 'Medium', text: 'Steal from a bedroom while its owner sleeps', req: ['night'] },
    { id: 'watchman', tier: 'Medium', text: 'Sneak right up behind the night watchman', req: ['night'] },
    { id: 'nighteat', tier: 'Medium', text: 'Have a midnight feast (eat 2 things)', goal: 2, req: ['night'] },
    { id: 'worm', tier: 'Medium', text: 'Grab a worm before the blackbird does', req: ['wetday'] },
    { id: 'ladybird', tier: 'Medium', text: 'Get a ladybird to land on you', hint: 'stand still by a bush', req: ['ladybirds'] },
    { id: 'seal', tier: 'Medium', text: 'Feed the seal a fish', hint: 'it lazes at the end of the pier', req: ['seal'] },
    { id: 'otter', tier: 'Medium', text: 'Go swimming with the otters', req: ['otters'] },
    { id: 'lightning', tier: 'Medium', text: 'Be close by when lightning strikes', req: ['storm'] },
    { id: 'frograin', tier: 'Medium', text: 'Catch a frog that fell from the sky', req: ['frograin'] },
    { id: 'eclipse', tier: 'Medium', text: 'Steal something during the eclipse', req: ['eclipse'] },
    { id: 'umbrella', tier: 'Medium', text: 'Grab an umbrella the wind blew away', req: ['umbrellas'] },
    { id: 'gutter', tier: 'Medium', text: 'Lead a chaser under an overflowing gutter', hint: 'by the front corner of a house', req: ['wetday'] },
    { id: 'roll', tier: 'Medium', text: 'Roll something down the slope into someone', hint: 'boulders are at the top', req: ['slope'] },
    { id: 'lockring', tier: 'Medium', text: 'Drain the lock and find what’s in the mud', req: ['lock'] },
    { id: 'appleconk', tier: 'Medium', text: 'Drop apples on someone’s head', hint: 'shake the tree they’re under', req: ['apples'] },
    { id: 'cider', tier: 'Medium', text: 'Make cider', hint: 'put 3 apples in the press', req: ['press'] },
    { id: 'maze', tier: 'Medium', text: 'Reach the middle of the hedge maze', req: ['maze'] },
    { id: 'coconut', tier: 'Medium', text: 'Knock down all three coconuts', hint: 'throw things at them', req: ['shy'] },
    { id: 'woodpecker', tier: 'Medium', text: 'Follow the woodpecker to its hidden nuts', hint: 'walk up to it, again and again', req: ['woodpecker'] },
    { id: 'goldfish', tier: 'Medium', text: 'Tip over a goldfish bowl', req: ['fishbowl'] },
    { id: 'budgie', tier: 'Medium', text: 'Get told on by a budgie', hint: 'pick something up in its room', req: ['budgie'] },
    { id: 'junk3', tier: 'Medium', text: 'Stash 3 bits of scrapyard junk in your hideout', goal: 3, req: ['scrap'] },
    { id: 'scarehat', tier: 'Medium', text: 'Steal a scarecrow’s hat', req: ['field'] },
    { id: 'crowquest', tier: 'Medium', text: 'Bring the crow something shiny', hint: 'drop it by the crow with the “!”', req: ['qcrow'] },
    { id: 'foxquest', tier: 'Medium', text: 'Bring the hungry fox an egg', hint: 'its den is at the forest edge', req: ['qfox'] },
    { id: 'molequest', tier: 'Medium', text: 'Dig up 3 worms for the mole', hint: 'B on grass with empty paws', req: ['qmole'] },
    { id: 'trainthrow', tier: 'Medium', text: 'Throw something onto the train', req: ['rail'] },
    { id: 'fishmarket', tier: 'Medium', text: 'Swipe a fish from the fish market', req: ['harbourtown'] },
    { id: 'catch', tier: 'Medium', text: 'Pinch the fishing boat’s catch', hint: 'it unloads at the end of the pier', req: ['harbourtown'] },
    { id: 'toadsnack', tier: 'Medium', text: 'Lose a snack to the giant toad’s tongue', req: ['bog'] },
    { id: 'wisp', tier: 'Medium', text: 'Follow the will-o’-the-wisp to its treasure', hint: 'over the marsh, after dusk', req: ['wisp'] },
    { id: 'knock', tier: 'Medium', text: 'Knock on a door and hide before they answer', hint: 'E at a door, then run!' },
    { id: 'whoopee', tier: 'Medium', text: 'Catch someone with a whoopee cushion', hint: 'leave it where someone sits' },
    { id: 'paint', tier: 'Medium', text: 'Paint 10 fence panels pink', goal: 10, hint: 'carry the paint pot along a fence' },
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
    { id: 'weddingcake', tier: 'Hard', text: 'Run off with the wedding cake', req: ['wedding'] },
    { id: 'presents3', tier: 'Hard', text: 'Stash 3 presents in your hideout', goal: 3, req: ['sleigh'] },
    { id: 'treasure', tier: 'Hard', text: 'Stash the castle’s treasure chest in your hideout', req: ['chest'] },
    { id: 'counter', tier: 'Hard', text: 'Steal from a shop counter while the shopkeeper’s in', req: ['shops'] },
    { id: 'heist', tier: 'Hard', text: 'Steal the crown from the museum', req: ['museum'] },
    { id: 'sneaky', tier: 'Hard', text: 'Lift a museum treasure without setting off the alarm', hint: 'the tripwires blink off', req: ['museum'] },
    { id: 'netsteal', tier: 'Hard', text: 'Steal the pest controller’s net', hint: 'make him jump', req: ['pest'] },
    { id: 'mazeescape', tier: 'Hard', text: 'Shake off a chaser in the hedge maze', req: ['maze'] },
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
    Object.assign(run, { day, eaten: 0, tobyHits: 0, prints: 0, painted: 0, crows: 0, fireflies: 0, puddles: 0, eggs: 0, visited: new Set(), done: new Set(), progress: {}, cropPulls: 0, sunk: 0, strikes: 0, earned: 0, over: false, ended: false, checkT: 0, shake: 0 });
    run.maxStrikes = 3 + lvl('fur');
    run.timeTotal = Math.min(600, 420 + 30 * (day - 1)) + 60 * lvl('day'); // the bigger village takes a little longer to ransack
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
      if (r === 'sparrows' && ['rain', 'storm', 'snowstorm', 'downpour', 'sleet', 'blizzard'].includes(L.weather)) return false;
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
      if (EVENT_NAMES.includes(r) && L.event !== r) return false;
      if (r === 'boat' && !(L.boat && hasOpenWater())) return false;
      if (r === 'island' && !L.island) return false;
      if (r === 'contest' && !L.contest) return false;
      if (r === 'cart' && !L.cart) return false;
      if (r === 'stalls' && !L.stalls) return false;
      if (r === 'mill' && !L.mill) return false;
      if (r === 'wheatfield' && !L.wheat) return false;
      if (r === 'barn' && !L.barn) return false;
      if (r === 'robins' && !critters.some((c) => c.type === 'robin')) return false;
      if (r === 'stoat' && !critters.some((c) => c.type === 'stoat')) return false;
      if (r === 'snowyowl' && !critters.some((c) => c.type === 'snowyowl')) return false;
      if (r === 'sleigh' && !critters.some((c) => c.type === 'sleigh')) return false;
      if (r === 'stable' && !critters.some((c) => c.type === 'horse')) return false;
      if (r === 'ducklings' && !L.ducklings) return false;
      if (r === 'llama' && !critters.some((c) => c.type === 'llama')) return false;
      if (r === 'hill' && !L.hill) return false;
      if (r === 'igloo' && !L.igloo) return false;
      if (r === 'drifts' && !(L.drifts && L.drifts.length)) return false;
      if (r === 'snowy' && !(isWinter() || planHas(SNOWY_W))) return false;
      if (r === 'tortoise' && !items.some((it) => it.kind === 'tortoise')) return false;
      if (r === 'bell' && !L.bell) return false;
      if (r === 'chest' && !L.castleChest) return false;
      if (r === 'armour' && !L.castle) return false;
      if (r === 'treehouses' && !L.treehouses) return false;
      if (r === 'logpile' && !L.logpile) return false;
      if (r === 'rings' && !(L.rings && L.rings.length)) return false;
      if (r === 'hollow' && !L.hollow) return false;
      if (r === 'shops' && !(L.shopHouses && L.shopHouses.size)) return false;
      if (r === 'sweetshop' && !(L.shopHouses && [...L.shopHouses.values()].some((x) => x.kind === 'sweets'))) return false;
      if (r === 'postoffice' && !(L.shopHouses && [...L.shopHouses.values()].some((x) => x.kind === 'post'))) return false;
      if (r === 'race' && !L.race) return false;
      if (r === 'museum' && !L.museum) return false;
      if (r === 'pest' && !L.pest) return false;
      if (r === 'night' && !L.night) return false;
      if (r === 'swimmable' && !hasOpenWater()) return false;
      if (r === 'wetday' && !(planHas(WET_SET) && !isWinter())) return false;
      if (r === 'storm' && !planHas(['storm'])) return false;
      if (r === 'flood' && !(planHas(['downpour']) && L.kind !== 'seaside')) return false;
      if (r === 'frograin' && !planHas(['frograin'])) return false;
      if (r === 'eclipse' && !(L.eclipse && !L.night)) return false;
      if (r === 'umbrellas' && !planHas(['rain', 'storm', 'downpour', 'frograin'])) return false;
      if (r === 'webs' && !(L.webs && L.webs.length)) return false;
      if (r === 'slope' && !L.slope) return false;
      if (r === 'cave' && !L.cave) return false;
      if (r === 'cable' && !L.cable) return false;
      if (r === 'mgoats' && !critters.some((c) => c.type === 'mgoat')) return false;
      if (r === 'boats' && !(L.boats && L.boats.length && !isWinter())) return false;
      if (r === 'lock' && !L.canal) return false;
      if (r === 'orchardtrees' && !(L.fruitTrees && L.fruitTrees.length)) return false;
      if (r === 'apples' && !(L.fruitTrees && L.fruitTrees.length && (L.season === 'summer' || L.season === 'autumn'))) return false;
      if (r === 'press' && !(L.press && (L.season === 'summer' || L.season === 'autumn'))) return false;
      if (r === 'maze' && !L.maze) return false;
      if (r === 'carousel' && !(L.fair && L.fair.carousel)) return false;
      if (r === 'bigwheel' && !(L.fair && L.fair.wheel)) return false;
      if (r === 'shy' && !L.shy) return false;
      if (r === 'candy' && !(L.fair && L.fair.candy)) return false;
      if (r === 'tent' && !(L.fair && L.fair.tent)) return false;
      if (r === 'camp' && !L.camp) return false;
      if (r === 'rail' && !L.rail) return false;
      if (r === 'harbourtown' && !(L.harbour && L.lighthouse)) return false;
      if (r === 'bog' && !L.bog) return false;
      if (r === 'huts' && !(L.huts && L.huts.length)) return false;
      if (r === 'wisp' && !(L.bog && !isWinter())) return false;
      if (r === 'scrap' && !L.scrap) return false;
      if (r === 'field' && !(L.fieldCrows && L.fieldCrows.length)) return false;
      if (r === 'fishbowl' && !L.fishHouse) return false;
      if (r === 'hamster' && !L.hamster) return false;
      if (r === 'budgie' && !L.budgie) return false;
      for (const [rq, ty] of [['boar', 'boar'], ['moose', 'moose'], ['woodpecker', 'woodpecker'], ['kitten', 'kitten'], ['fieldcrows', 'fcrow'], ['qcrow', 'qcrow'], ['qfox', 'qfox'], ['qmole', 'qmole']]) if (r === rq && !critters.some((c) => c.type === ty)) return false;
      for (const [rq, ty] of [['snails', 'snail'], ['dragonflies', 'dragonfly'], ['ladybirds', 'ladybird'], ['seal', 'seal'], ['otters', 'otter'], ['heron', 'heron']]) if (r === rq && !critters.some((c) => c.type === ty)) return false;
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
    setProgress('presents3', stashed.filter((it) => it.kind === 'present').length);
    if (stashed.some((it) => it.kind === 'tortoise')) completeTask('tortoisestash');
    if (stashed.some((it) => it.kind === 'chest')) completeTask('treasure');
    setProgress('junk3', stashed.filter((it) => it.junk).length);
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
    const trophyNews = recordTrophies(win);
    writeSave();
    postScore();
    sfx(win ? 'fanfare' : 'hmph');

    const titles = { win: `Day ${run.day} done!`, caught: 'Caught red-pawed!', sunset: L.night ? 'Sunrise!' : 'Sunset!' };
    const subs = {
      win: `${L.name} has been thoroughly ransacked.`,
      caught: 'The villagers have had quite enough of you for one day.',
      sunset: L.night ? 'The village is waking up. Time to scarper.' : 'The villagers lock their doors for the night.',
    };
    document.getElementById('res-title').textContent = titles[reason];
    document.getElementById('res-sub').textContent = subs[reason];
    const rows = [
      ['Tasks done', `${run.done.size} / ${run.tasks.length}`],
      ['Shinies from tasks', `+${run.earned}`],
    ];
    if (win) rows.push(['Time left bonus', `+${timeBonus}`], [`Day ${run.day} bonus`, `+${dayBonus}`]);
    rows.push(['Shinies earned', `+${total} ✦`]);
    const kept = items.filter(inHideout).length + (L.buried || []).length;
    if (kept) rows.push(['Added to your trophy shelf', `${kept}`]);
    for (const n of trophyNews) rows.push([n, '★']);
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
    document.getElementById('rc-season').textContent = `${cap(L.season)}${L.weather !== 'clear' ? ', ' + WEATHER_LABEL[L.weather].toLowerCase() : ''} \u00b7 ${KIND_LABEL[L.harbour ? 'harbour' : L.kind]} village${L.event ? ' \u00b7 ' + EVENT_LABEL[L.event] + '!' : ''}${L.night ? ' \u00b7 Night raid!' : ''}`;
    const later = (L.weatherPlan || []).slice(1).find((s) => s.w !== L.weather);
    const forecast = later ? `Forecast: ${later.w === 'clear' ? 'clearing up' : WEATHER_LABEL[later.w].toLowerCase()} later.` : '';
    document.getElementById('rc-tip').textContent = [L.eclipse && !L.night ? 'Stargazers say there’ll be a solar eclipse today!' : '', L.night ? 'Night raid! Most villagers are asleep in bed: walk, don’t run, near them. The night watchman’s lantern sees far.' : '', L.pest ? 'The pest controller is in town: he follows your trail and has set cage traps on the paths.' : '', EVENT_TIP[L.event], KIND_TIP[L.harbour ? 'harbour' : L.kind], WEATHER_TIP[L.weather], forecast, SEASON_TIP[L.season]].filter(Boolean).join(' ');
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
    renderTrophies();
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
    if (L && (L.night || L.eclipseOn)) { drawNight(ctx, left, top, viewW, viewH); return; }
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
    for (let n = 0; n < 90 && placed < Math.round(18 * AREA_K); n++) tryAt(rr(5, MW - 5), rr(5, MH - 5));
  }

  function updateHiding(dt) {
    if (player.tree || player.roof || (player.ride && ['cable', 'wheel', 'lighthouse'].includes(player.ride.kind))) { // villagers never look up
      player.hidden = true; player.hidingIn = null;
      const pill = document.getElementById('hidden-pill'); if (pill.hidden === !paused) pill.hidden = paused;
      return;
    }
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
      if (bush.kind === 'wheat') completeTask('wheat');
      if (bush.kind === 'haystack') completeTask('hay');
      if (bush.kind === 'drift') completeTask('drift');
      if (bush.kind === 'igloo') completeTask('igloo');
      if (bush.kind === 'armour') completeTask('armour');
      if (bush.kind === 'hollowtree') completeTask('hollow');
      if (bush.kind === 'tent') completeTask('tent');
      if (bush.kind === 'stilthut') completeTask('stilthut');
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
    if (d.race) return; // racing (see updateRace)
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
    if (it.kind === 'fishbowl') { // SPLOSH: the goldfish flops about until someone scoops it into a glass
      splash(it.x, it.y, false); sfx('crash'); sfx('splash');
      critters.push({ type: 'goldfish', x: it.x, y: it.y, z: 0, dir: 'left', walk: 0, ph: 0, life: 6 });
      lookTowards(it.x, it.y, 260, (v) => (it.owner === v.id ? 'My GOLDFISH!' : 'Oh no, the goldfish!'));
      completeTask('goldfish');
      return;
    }
    if (it.kind === 'flour') { burstFlour(it); return; }
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
    if (it.contest && it.kind === 'cake') completeTask('cakecontest');
    if (it.kind === 'toffee') completeTask('toffee');
    if (it.kind === 'candyfloss') completeTask('candyfloss');
    if (L.night) { run.nightEats = (run.nightEats || 0) + 1; setProgress('nighteat', run.nightEats); }
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
  const KIND_NAMES = ['pond', 'river', 'seaside', 'market', 'windmill', 'lake', 'castle', 'forest', 'mountain', 'canal', 'orchard', 'railway', 'harbour', 'marsh'];
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
  const KIND_TIP = { pond: '', river: 'A river runs right through the village.', seaside: 'The village sits by the sea, with a pier.',
    market: 'It’s market day! The stalls are full of goodies, and the stallholders are watching.', windmill: 'A windmill turns on the hill: flour sacks, a wheat field and a hay barn.', lake: 'A big lake with an island in the middle. Take the rowing boat from the jetty.',
    castle: 'Old castle ruins with a moat: ring the bell, hide in the armour, and there’s a treasure chest in the courtyard.', forest: 'A village deep in the woods: treehouses with a rope bridge, a woodpile, fairy rings and a hollow tree.',
    mountain: 'A village on a mountainside: a rocky slope with goats, a cable car up to the lookout, and a cave that echoes.', canal: 'A canal runs through the village: narrowboats you can hop aboard, a lock you can drain, and humpback bridges.', orchard: 'An orchard village: apple trees to shake, a cider press, and a hedge maze.',
    railway: 'A railway runs through the village: hop on the little train at the station, and mind the level crossing.', harbour: 'A harbour town: a lighthouse, lobster pots, a fish market, and a fishing boat bringing in its catch.', marsh: 'A village beside a marsh: boardwalks over sucking mud, stilt huts, a giant toad, and strange lights at night.' };
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
    spring: [['clear', 40], ['frograin', 2], ['snowfall', 4], ['sleet', 5], ['rain', 28], ['drizzle', 15], ['downpour', 8], ['storm', 10], ['windy', 15], ['hail', 6]],
    summer: [['clear', 50], ['frograin', 2], ['rain', 12], ['drizzle', 6], ['downpour', 8], ['storm', 16], ['windy', 10], ['heatwave', 20]],
    autumn: [['clear', 25], ['snowfall', 5], ['sleet', 7], ['rain', 20], ['drizzle', 12], ['downpour', 8], ['fog', 22], ['windy', 20], ['frost', 15], ['storm', 5], ['hail', 6]],
    winter: [['clear', 35], ['snowstorm', 24], ['blizzard', 12], ['sleet', 12], ['fog', 22], ['frost', 22]],
  };
  const WEATHER_LABEL = { clear: 'Clear', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog', windy: 'Windy', snowstorm: 'Snowstorm', hail: 'Hail', heatwave: 'Heatwave', drizzle: 'Drizzle', downpour: 'Downpour', frost: 'Frost', sleet: 'Sleet', blizzard: 'Blizzard', snowfall: 'Snow', frograin: 'Raining frogs' };
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
    sleet: 'Sleet: half rain, half snow. Miserable for villagers, and the paths are slippery.',
    blizzard: 'Blizzard! You can barely see, the wind shoves you along, and drifts pile up to burrow into.',
    frograin: 'It’s raining... frogs?! Catch one, if you can.',
    snowfall: 'Surprise snow! Stand still and look up to catch a snowflake.',
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
  const WIND = () => (L && L.weather === 'windy' ? 70 : L && L.weather === 'blizzard' ? 60 : L && L.weather === 'snowstorm' ? 40 : 0);
  // How far villagers can see / hear in this weather
  const visionMul = () => ({ rain: 0.82, storm: 0.75, fog: 0.55, snowstorm: 0.62, hail: 0.85, drizzle: 0.93, downpour: 0.68, sleet: 0.8, blizzard: 0.45, snowfall: 0.9, frograin: 0.85 }[L && L.weather] || 1);
  const hearingMul = () => ({ rain: 0.75, storm: 0.7, snowstorm: 0.75, hail: 0.65, drizzle: 0.9, downpour: 0.6, sleet: 0.75, blizzard: 0.55 }[L && L.weather] || 1);

  const weather = [];
  const fx = { flash: 0, nextBolt: 8, thunderAt: -1, ambience: null };
  function spawnWeather() {
    weather.length = 0;
    const W = L.weather, S = L.season;
    let n = { winter: 150, autumn: 34, spring: 44 }[S] || 0;
    if (W === 'rain') n = 230; else if (W === 'storm') n = 300; else if (W === 'snowstorm') n = 380; else if (W === 'windy') n = Math.max(n, 70);
    else if (W === 'hail') n = 200; else if (W === 'heatwave') n = 0;
    else if (W === 'drizzle') n = 110; else if (W === 'downpour') n = 440;
    else if (W === 'frograin') n = 200; else if (W === 'sleet') n = 280; else if (W === 'blizzard') n = 560; else if (W === 'snowfall') n = 170;
    for (let i = 0; i < n; i++) weather.push({ x: Math.random(), y: Math.random(), s: Math.random(), ph: Math.random() * 6, col: pick(['#c0392b', '#e07b2a', '#f0a040', '#d9a43a']) });
    fx.flash = 0; fx.nextBolt = rr(6, 12); fx.thunderAt = -1;
    startAmbience();
  }
  function drawWeather(ctx, left, top, viewW, viewH, t, dt) {
    const S = L.season, W = L.weather;
    const rainy = WET_SET.includes(W);
    const snowy = S === 'winter' || W === 'snowfall' || W === 'blizzard' || W === 'sleet';
    const wind = W === 'windy' ? 0.25 : W === 'blizzard' ? 0.4 : W === 'snowstorm' ? 0.12 : W === 'sleet' ? 0.1 : W === 'storm' ? 0.06 : 0;
    ctx.lineCap = 'round';
    for (const w of weather) {
      if (W === 'hail') { // hailstones pelting down, bouncing
        w.y += (1.4 + w.s * 0.5) * dt; w.x += 0.03 * dt;
        if (w.y > 1.05) { w.y = -0.05; w.x = Math.random(); }
        const hx = left + w.x * viewW, hy = top + w.y * viewH;
        ctx.fillStyle = 'rgba(245,250,255,0.9)'; circle(ctx, hx, hy, 1.1 + w.s * 0.9);
        continue;
      }
      const sleetRain = W === 'sleet' && w.s > 0.5;
      if (rainy || sleetRain) { w.y += (0.9 + w.s * 0.5) * (W === 'downpour' ? 1.3 : W === 'drizzle' || sleetRain ? 0.7 : 1) * dt; w.x += (0.08 + wind) * dt; }
      else if (snowy) { w.y += (0.05 + w.s * 0.05) * (W === 'snowstorm' ? 2.6 : W === 'blizzard' ? 3.6 : W === 'sleet' ? 4 : 1) * dt; w.x += (Math.sin(t * 0.8 + w.ph) * 0.004 + wind) * dt; }
      else { w.y += (0.03 + w.s * 0.03) * dt; w.x += (Math.sin(t * 0.6 + w.ph) * 0.02 + 0.01 + wind) * dt; }
      if (w.y > 1.05) { w.y = -0.05; w.x = Math.random(); }
      if (w.x > 1.05) w.x = -0.05; else if (w.x < -0.05) w.x = 1.05;
      const x = left + w.x * viewW, y = top + w.y * viewH;
      if (rainy || sleetRain) {
        const len = W === 'drizzle' ? 0.45 : W === 'downpour' ? 1.5 : 1;
        ctx.strokeStyle = `rgba(200,220,240,${(0.35 + w.s * 0.3) * (W === 'drizzle' ? 0.7 : 1)})`; ctx.lineWidth = W === 'downpour' ? 1.3 : 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (2 + wind * 30) * len, y - (9 + w.s * 5) * len); ctx.stroke();
      } else if (snowy) { ctx.fillStyle = `rgba(255,255,255,${0.55 + w.s * 0.4})`; circle(ctx, x, y, (0.8 + w.s * 1.6) * (W === 'blizzard' ? 1.3 : W === 'sleet' ? 0.8 : 1)); }
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
      : W === 'sleet' ? 'rgb(198,204,216)' : W === 'blizzard' ? 'rgb(222,228,242)' : W === 'snowfall' ? 'rgb(234,238,250)'
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
    if (!indoors && (W === 'fog' || W === 'snowstorm' || W === 'blizzard')) {
      const px = (player.x - left) * zoom, py = (player.y - 12 - top) * zoom; // the clear patch follows you
      const inner = Math.min(vw, vh) * (W === 'fog' ? 0.16 : W === 'blizzard' ? 0.13 : 0.22), outer = Math.min(vw, vh) * (W === 'fog' ? 0.52 : W === 'blizzard' ? 0.45 : 0.7);
      const g = ctx.createRadialGradient(px, py, inner, px, py, outer);
      const c = W === 'fog' ? '226,232,236' : '236,242,250';
      g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},${W === 'fog' ? 0.9 : W === 'blizzard' ? 0.85 : 0.6})`);
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
          if (Math.random() < 0.45) lightningStrike();
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
    if (!actx || !(WET_SET.includes(W) || ['windy', 'snowstorm', 'hail', 'sleet', 'blizzard'].includes(W))) return;
    const n = actx.sampleRate * 2, buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = actx.createBiquadFilter(); f.type = ['windy', 'snowstorm', 'hail', 'blizzard'].includes(W) ? 'bandpass' : 'lowpass'; f.frequency.value = W === 'hail' ? 2200 : W === 'windy' || W === 'snowstorm' ? 500 : 2500;
    const g = actx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master); src.start();
    fx.ambience = { src, g, level: W === 'storm' || W === 'downpour' || W === 'blizzard' ? 0.08 : W === 'rain' ? 0.05 : W === 'drizzle' ? 0.025 : 0.04 };
  }
  function updateAmbienceLevel() {
    if (!fx.ambience) { if (actx && actx.state === 'running' && L && ['rain', 'storm', 'drizzle', 'downpour', 'frograin', 'windy', 'snowstorm', 'hail', 'sleet', 'blizzard'].includes(L.weather)) startAmbience(); return; }
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
    const stormy = ['rain', 'storm', 'snowstorm', 'downpour', 'sleet', 'blizzard'].includes(W);
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
    spawnSnowAnimals();
    placeWebs();
    spawnRainCritters();
    spawnMoreCritters();
    spawnOutskirtsCritters();
    spawnMarshCritters();
  }

  // Something scary happened near (x, y): birds and frogs bolt (see also farmNightScare)
  function critterScare(x, y, r) {
    for (const c of critters) {
      if (Math.hypot(c.x - x, c.y - y) > r) continue;
      if (FN_TYPES.has(c.type)) { farmNightScare(c, x, y, r); continue; }
      if (c.type === 'mgoat') { c.wait = 0; continue; }
      if (OK_TYPES.has(c.type)) { okScare(c, x, y, r); continue; }
      if (WD_TYPES.has(c.type)) { wildScare(c, x, y, r); continue; }
      if (SN_TYPES.has(c.type)) { snowScare(c, x, y, r); continue; }
      if (RN_TYPES.has(c.type)) { rainScare(c, x, y, r); continue; }
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
      if (SN_TYPES.has(c.type)) { updateSnowAnimals(c, dt, near); continue; }
      if (RN_TYPES.has(c.type)) { updateRainCritter(c, dt, near); continue; }
      if (c.type === 'mgoat') { updateMGoat(c, dt); continue; }
      if (OK_TYPES.has(c.type)) { updateOutskirtsCritter(c, dt, near); continue; }
      if (c.type === 'gtoad' || c.type === 'wisp') { updateMarshCritter(c, dt); continue; }

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
    if (SN_TYPES.has(c.type)) { drawSnowAnimal(ctx, c, t); return; }
    if (RN_TYPES.has(c.type)) { drawRainCritter(ctx, c, t); return; }
    if (c.type === 'mgoat') { drawMGoat(ctx, c); return; }
    if (OK_TYPES.has(c.type)) { drawOutskirtsCritter(ctx, c, t); return; }
    if (c.type === 'gtoad' || c.type === 'wisp') { drawMarshCritter(ctx, c, t); return; }
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
    const rainMud = wet() && !isWinter() && areaOf(player.x, player.y) === 0 && [PATH, GRASS, SOIL].includes(tileAt(player.x, player.y)) && !player.swim;
    if ((player.mud > 0 || rainMud) && player.speed > 20 && player.printT <= 0 && !onSnow(player.x, player.y)) { // muddy pawprints
      player.printT = 0.17;
      if (rainMud) { run.prints = (run.prints || 0) + 1; setProgress('mudprints', run.prints); } player.printSide = -(player.printSide || 1);
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
    duskK = L && (L.night || L.eclipseOn) ? 1 : started ? clamp((p - 0.55) / 0.45, 0, 1) : 0;
  }

  // Weather can change partway through a day
  function planWeather(season, first) {
    const plan = [{ at: 0, w: first }];
    if (first === 'hail') { plan.push({ at: 0.1, w: 'clear' }); return plan; }
    if (rand() < 0.45) {
      const at = 0.3 + rand() * 0.3;
      let next;
      if (WET_SET.includes(first) || ['fog', 'frost', 'sleet', 'snowfall', 'blizzard'].includes(first)) next = 'clear'; // clears up / the fog lifts / the frost melts
      else if (season === 'winter') next = pick(['snowstorm', 'fog', 'blizzard', 'sleet']);
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
    heatwave: 'Phew, a heatwave', drizzle: 'It’s starting to drizzle', downpour: 'It’s bucketing down!', sleet: 'Ugh, sleet', blizzard: 'A blizzard is blowing in!', snowfall: 'It’s snowing!', frograin: 'It’s raining... FROGS?!', snowstorm: 'A snowstorm is blowing in', fog: 'Fog is rolling in', windy: 'The wind is picking up',
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
  const WET_SET = ['rain', 'storm', 'drizzle', 'downpour', 'frograin'];

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
  const frosty = (x, y) => !!L && (L.weather === 'frost' || L.weather === 'sleet') && areaOf(x, y) === 0 && [PATH, STONE, BRIDGE].includes(tileAt(x, y));
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
  // More villages: market day, a windmill on the hill, a lake with an island.
  // Village events: a fete, a wedding, bonfire night, a scarecrow festival.
  // ---------------------------------------------------------------------------
  const EVENT_NAMES = ['fete', 'wedding', 'bonfire', 'scarecrows', 'funfair'];
  const EVENTS_BY_SEASON = { spring: ['fete', 'wedding', 'funfair'], summer: ['fete', 'wedding', 'scarecrows', 'funfair'], autumn: ['bonfire', 'scarecrows', 'wedding', 'funfair'], winter: ['bonfire'] };
  const EVENT_LABEL = { fete: 'Village fete', wedding: 'Wedding day', bonfire: 'Bonfire night', scarecrows: 'Scarecrow festival', funfair: 'Funfair' };
  const EVENT_TIP = {
    fete: 'It’s the village fete! Bunting, and a cake contest on the plaza.',
    wedding: 'There’s a wedding on the plaza today: flowers, chairs, and a very big cake.',
    bonfire: 'Bonfire night! Fireworks after dusk, toffee apples, and a box of rockets by the fire.',
    scarecrows: 'Scarecrow festival: everyone’s made a scarecrow. It would be a shame if they fell over...',
    funfair: 'The funfair’s in town! A carousel, a big wheel, a coconut shy, candyfloss and a hall of mirrors.',
  };
  const KIND_LABEL = { pond: 'Pond', river: 'Riverside', seaside: 'Seaside', market: 'Market', windmill: 'Windmill', lake: 'Lakeside', castle: 'Castle', forest: 'Forest', mountain: 'Mountain', canal: 'Canal', orchard: 'Orchard', railway: 'Railway', harbour: 'Harbour', marsh: 'Marsh' };
  function pickEvent(season) { return rand() < 0.4 ? pick(EVENTS_BY_SEASON[season]) : null; }

  // --- New items -----------------------------------------------------------------------------
  Object.assign(ITEM, {
    flour: { name: 'flour sack', h: 13, r: 6, fragile: true, draw(c) {
      c.fillStyle = '#efe6d2'; roundRect(c, -6, -13, 12, 13, 4, true);
      c.fillStyle = '#d9cdb0'; c.fillRect(-6, -11, 12, 1.5);
      c.fillStyle = '#c0a060'; c.font = 'bold 5px sans-serif'; c.textAlign = 'center'; c.fillText('FLOUR', 0, -4);
    } },
    bigfish: { name: 'prize fish', h: 8, r: 10, draw(c) {
      c.fillStyle = '#7fa3b8'; ellipse(c, 0, -4, 11, 4.5);
      c.fillStyle = '#5a8199'; poly(c, [[-9, -4], [-15, -9], [-15, 1]]); c.fill();
      c.fillStyle = '#c9d8e2'; ellipse(c, 1, -2.6, 7, 1.6);
      c.fillStyle = '#1d1d22'; circle(c, 7, -5, 0.9);
      c.fillStyle = '#e8453c'; c.fillRect(-3, -10, 5, 3); // prize ribbon
    } },
    rosette: { name: 'first-prize rosette', h: 9, r: 5, draw(c) {
      c.fillStyle = '#4f6fa8'; poly(c, [[-2, -3], [-4, 3], [-1, 1]]); c.fill(); poly(c, [[2, -3], [4, 3], [1, 1]]); c.fill();
      c.fillStyle = '#4f6fa8'; circle(c, 0, -6, 4.5); c.fillStyle = '#f2c14e'; circle(c, 0, -6, 2.2);
    } },
    weddingcake: { name: 'wedding cake', h: 26, r: 9, heavy: true, draw(c) {
      c.fillStyle = '#f8f4ec'; roundRect(c, -9, -10, 18, 10, 2, true); roundRect(c, -6.5, -18, 13, 8, 2, true); roundRect(c, -4, -24, 8, 6, 2, true);
      c.fillStyle = '#f2b8c6'; for (const [y, w] of [[-10, 9], [-18, 6.5], [-24, 4]]) c.fillRect(-w, y, w * 2, 1.4);
      c.fillStyle = '#e8453c'; circle(c, 0, -25.5, 1.6);
    } },
    bouquet: { name: 'wedding bouquet', h: 11, r: 5, draw(c) {
      c.fillStyle = '#3f7f6a'; poly(c, [[-1.5, 0], [1.5, 0], [3, -6], [-3, -6]]); c.fill();
      for (const [x, y, col] of [[-3, -8, '#ffffff'], [3, -8, '#f2b8c6'], [0, -10, '#ffd166'], [-1.5, -6.5, '#f2b8c6'], [1.5, -6.5, '#ffffff']]) { c.fillStyle = col; circle(c, x, y, 2.3); }
    } },
    rocket: { name: 'firework rocket', h: 14, r: 4, draw(c) {
      c.fillStyle = '#c0392b'; c.fillRect(-2, -12, 4, 10);
      c.fillStyle = '#f2c14e'; poly(c, [[-2.5, -12], [2.5, -12], [0, -16]]); c.fill();
      c.fillStyle = '#7a5230'; c.fillRect(-0.5, -2, 1, 4);
    } },
    toffee: { name: 'toffee apple', h: 11, r: 4, draw(c) {
      c.fillStyle = '#d9c4a0'; c.fillRect(-0.6, -11, 1.2, 5);
      c.fillStyle = '#8a3a1a'; circle(c, 0, -4, 4); c.fillStyle = '#c0582a'; circle(c, -1.2, -5.2, 1.4);
    } },
  });
  Object.assign(FOOD, { weddingcake: { bites: 5, fill: 60, sweet: true }, toffee: { bites: 2, fill: 18, sweet: true } });

  // --- Lake: an island, a jetty and a rowing boat --------------------------------------------
  function buildLakeIsland(cx, cy, rx, ry) {
    if (rx < 7 || ry < 4) return;
    let n = 0;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d < 0.07) { setT(x, y, GRASS); n++; } else if (d < 0.13) { setT(x, y, SAND); n++; }
    }
    if (n) L.island = { cx, cy, rx: rx * Math.sqrt(0.13), ry: ry * Math.sqrt(0.13) };
  }
  const onIsland = (x, y) => { const I = L && L.island; if (!I) return false; const dx = (x / TILE - I.cx) / I.rx, dy = (y / TILE - I.cy) / I.ry; return dx * dx + dy * dy < 1.1 && tileAt(x, y) !== WATER; };
  // A jetty sticking out into the lake on the side facing the plaza (planks over the water)
  function buildJetty() {
    const p = L.pond, a = Math.atan2(L.plaza.y + 6 - p.cy, L.plaza.x + 6 - p.cx);
    const horiz = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    const ox = horiz ? Math.sign(Math.cos(a)) : 0, oy = horiz ? 0 : Math.sign(Math.sin(a)); // towards the plaza
    let x = Math.floor(p.cx), y = Math.floor(p.cy), seenWater = false, shore = null;
    for (let n = 0; n < 40; n++, x += ox, y += oy) {
      const w = getT(x, y) === WATER;
      if (w) seenWater = true; else if (seenWater) { shore = [x, y]; break; }
    }
    if (!shore) return;
    const sx = -ox, sy = -oy; // the jetty points back out over the water
    x = shore[0]; y = shore[1];
    let len = 0;
    for (; len < 4; len++) { x += sx; y += sy; if (getT(x, y) !== WATER) break; setT(x, y, BRIDGE); }
    if (len < 2) return;
    const endX = x - sx, endY = y - sy;
    L.jetty = { baseX: shore[0], baseY: shore[1], x: (endX + 0.5) * TILE, y: (endY + 0.6) * TILE, sx, sy };
    // the boat moored alongside the end
    const bx = endX + (sy !== 0 ? 1 : 0), by = endY + (sx !== 0 ? 1 : 0);
    if (getT(bx, by) === WATER) L.boat = { x: (bx + 0.5) * TILE, y: (by + 0.7) * TILE };
    else if (getT(endX + sx, endY + sy) === WATER) L.boat = { x: (endX + sx + 0.5) * TILE, y: (endY + sy + 0.7) * TILE };
    L.boatHome = L.boat && { ...L.boat };
  }
  function drawRowboat(ctx, x, y, t, rowing) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(200,230,255,0.45)'; ellipse(ctx, 0, 2, 20, 6);
    ctx.fillStyle = '#7a5230'; ellipse(ctx, 0, -1, 18, 7.5);
    ctx.fillStyle = '#a0703f'; ellipse(ctx, 0, -2.5, 15, 5.5);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-2, -8, 4, 11);
    const a = rowing ? Math.sin(t * 6) * 0.5 : 0.2;
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 6, -3); ctx.lineTo(s * (19 + Math.cos(a) * 2), 3 + Math.sin(a) * 4); ctx.stroke(); }
    ctx.restore();
  }
  const boatWater = (x, y) => tileAt(x, y) === WATER;
  function boatBlocked(x, y) {
    for (const [ox, oy] of [[-10, -4], [10, -4], [-10, 3], [10, 3], [0, 0]]) if (!boatWater(x + ox, y + oy) || x + ox < 0 || y + oy < 0) return true;
    return false;
  }
  // E by the boat climbs in; E in the boat climbs out onto the nearest bit of land
  function boatAction() {
    if (!L || L.kind !== 'lake') return false;
    if (player.boat) {
      const d = DIRV[player.dir];
      let best = null, bd = 1e9;
      player.boat = false;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) for (const r of [20, 26, 32]) {
        const x = player.x + Math.cos(a) * r, y = player.y + Math.sin(a) * r * 0.8;
        if (collides(x, y) || tileAt(x, y) === WATER) continue;
        const score = r - (Math.cos(a) * d[0] + Math.sin(a) * d[1]) * 12;
        if (score < bd) { bd = score; best = { x, y }; }
      }
      if (!best) { player.boat = true; player.bubble = { text: 'no land here', t: 1 }; return true; }
      L.boat = { x: player.x, y: player.y };
      Object.assign(player, { x: best.x, y: best.y, vx: 0, vy: 0 });
      sfx('tap');
      return true;
    }
    if (!L.boat || !hasOpenWater() || (player.held && player.held.type.heavy)) return false;
    if (Math.hypot(L.boat.x - player.x, L.boat.y - player.y) > 46) return false;
    Object.assign(player, { boat: true, x: L.boat.x, y: L.boat.y, vx: 0, vy: 0, boatFrom: { x: L.boat.x, y: L.boat.y } });
    L.boat = null; sfx('splash');
    return true;
  }
  const boatNear = () => L && L.kind === 'lake' && !player.boat && L.boat && hasOpenWater() && Math.hypot(L.boat.x - player.x, L.boat.y - player.y) < 46;
  function makeBoatObj() {
    const o = {
      kind: 'rowboat', isBoatObj: true,
      get x() { return L.boat ? L.boat.x : -999; }, get y() { return L.boat ? L.boat.y : -999; },
      get bounds() { const b = L.boat || { x: -999, y: -999 }; return { l: b.x - 24, r: b.x + 24, t: b.y - 14, b: b.y + 10 }; },
      draw(ctx, t) { if (L.boat) drawRowboat(ctx, L.boat.x, L.boat.y + Math.sin(t * 1.5) * 0.6, t, false); },
    };
    return o;
  }
  function makeContestTable(x, y, label, cloth = '#f4f2ee') {
    return {
      kind: 'table', x, y, hitbox: box(x - 22, y - 8, 44, 9), bounds: { l: x - 30, r: x + 30, t: y - 40, b: y + 4 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 4, y, 26, 5); },
      draw(ctx) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 20, y - 12, 3, 12); ctx.fillRect(x + 17, y - 12, 3, 12);
        ctx.fillStyle = cloth; roundRect(ctx, x - 23, y - 16, 46, 6, 2, true);
        ctx.fillStyle = shade(cloth, -0.12); ctx.fillRect(x - 23, y - 11, 46, 4);
        if (label) {
          ctx.fillStyle = '#7a5230'; ctx.fillRect(x + 24, y - 30, 2, 30);
          ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x + 14, y - 40, 34, 12, 2, true);
          ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x + 31, y - 32);
        }
      },
    };
  }

  // --- Market: four stalls on the plaza and a fruit cart -------------------------------------
  const STALLS = [
    { owner: 'rosa', label: 'BAKERY', col: '#c0392b', goods: ['bread', 'cookies', 'bread'], lines: ['Fresh bread!', 'Cookies! Lovely cookies!', 'Get your loaves here!'] },
    { owner: 'bertram', label: 'FRUIT & VEG', col: '#3f7f6a', goods: ['apple', 'cabbage', 'apple', 'carrot'], lines: ['Apples! Crunchy apples!', 'Veg, fresh from the garden!', 'Carrots, two a penny!'] },
    { owner: 'ollie', label: 'FISH', col: '#4f6fa8', goods: ['fish', 'fish', 'fish'], lines: ['Fresh fish!', 'Caught this morning!', 'Fiiish! Lovely fish!'] },
    { owner: 'percy', label: 'TOYS', col: '#d9a43a', goods: ['teddy', 'toyboat', 'kite'], lines: ['Toys for the little ones!', 'Teddies! Kites!', 'Roll up, roll up!'] },
  ];
  function makeStall(x, y, s) {
    return {
      kind: 'stall', x, y, hitbox: box(x - 44, y - 11, 88, 12), bounds: { l: x - 52, r: x + 52, t: y - 70, b: y + 4 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 4, y, 50, 6); },
      draw(ctx, t) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 46, y - 56, 3, 56); ctx.fillRect(x + 43, y - 56, 3, 56);
        ctx.fillStyle = '#a0703f'; ctx.fillRect(x - 46, y - 16, 92, 16);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 46, y - 16, 92, 3);
        // striped canopy
        for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#f4f2ee' : s.col; ctx.fillRect(x - 50 + k * 12.5, y - 64, 12.5, 10); }
        for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#f4f2ee' : s.col; ctx.beginPath(); ctx.arc(x - 43.75 + k * 12.5, y - 54, 6.25, 0, Math.PI); ctx.fill(); }
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x - 26, y - 13, 52, 9, 2, true);
        ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 6.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(s.label, x, y - 6.5);
      },
    };
  }
  function makeCart(x, y) {
    const C = { x, y, tipped: false };
    L.cart = C;
    return {
      kind: 'cart', x, y, hitbox: box(x - 20, y - 8, 40, 9), bounds: { l: x - 34, r: x + 34, t: y - 34, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 4, y, 26, 5); },
      draw(ctx) {
        ctx.save(); ctx.translate(x, y);
        if (C.tipped) ctx.rotate(-0.5);
        ctx.fillStyle = '#7a5230'; circle(ctx, -12, -4, 6); circle(ctx, 12, -4, 6);
        ctx.fillStyle = '#c9a26a'; circle(ctx, -12, -4, 2); circle(ctx, 12, -4, 2);
        ctx.fillStyle = '#a0703f'; ctx.fillRect(-20, -18, 40, 11);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(18, -14, 14, 2.5);
        if (!C.tipped) { ctx.fillStyle = '#e8453c'; for (let k = 0; k < 7; k++) circle(ctx, -15 + k * 5, -19 - (k % 2) * 2, 3); }
        ctx.restore();
      },
    };
  }
  function tipCart() {
    const C = L.cart;
    if (!C || C.tipped) return;
    C.tipped = true; sfx('crash'); sfx('thud'); run.shake = Math.max(run.shake, 0.2);
    for (let k = 0; k < 6; k++) {
      const it = addItem('apple', C.x + rr(-10, 10), C.y - 4, { owner: 'bertram' });
      Object.assign(it, { air: true, z: 14, vz: rr(80, 160), vx: rr(-120, 120), vy: rr(-30, 90), spin: rr(-10, 10), kicker: 'cart' });
    }
    lookTowards(C.x, C.y, 320, () => rpick(['My apples!', 'The cart!', 'Who did that?!']));
    completeTask('cart');
  }

  // --- Windmill village: the mill, flour, a wheat field and a hay barn ----------------------
  function makeWindmill(x, y) {
    return {
      kind: 'windmill', x, y, hitbox: box(x - 26, y - 16, 52, 17), bounds: { l: x - 80, r: x + 80, t: y - 190, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 12, y, 44, 9); },
      draw(ctx, t) {
        ctx.fillStyle = '#e8dcc4'; poly(ctx, [[x - 28, y], [x + 28, y], [x + 18, y - 104], [x - 18, y - 104]]); ctx.fill();
        ctx.fillStyle = '#d4c6a8'; poly(ctx, [[x + 8, y], [x + 28, y], [x + 18, y - 104], [x + 4, y - 104]]); ctx.fill();
        ctx.fillStyle = '#7a4f3a'; poly(ctx, [[x - 22, y - 102], [x + 22, y - 102], [x, y - 128]]); ctx.fill();
        ctx.fillStyle = '#5a3a20'; roundRect(ctx, x - 8, y - 22, 16, 22, 7, true);
        ctx.fillStyle = '#7fa3b8'; ctx.fillRect(x - 5, y - 64, 10, 10); ctx.fillRect(x - 4, y - 90, 8, 8);
        const spd = L.weather === 'windy' || L.weather === 'storm' ? 2.4 : L.weather === 'heatwave' ? 0.25 : 0.8;
        const hx = x, hy = y - 100, a0 = t * spd;
        for (let k = 0; k < 4; k++) {
          const a = a0 + k * Math.PI / 2;
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
          ctx.fillStyle = '#7a5230'; ctx.fillRect(-1.5, 0, 3, 70);
          ctx.fillStyle = 'rgba(244,242,238,0.92)'; ctx.fillRect(2, 14, 12, 54);
          ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 0.8;
          for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.moveTo(2, 18 + j * 11); ctx.lineTo(14, 18 + j * 11); ctx.stroke(); }
          ctx.restore();
        }
        ctx.fillStyle = '#5a3a20'; circle(ctx, hx, hy, 4);
      },
    };
  }
  function makeWheatRow(x0, x1, y) {
    const stalks = [];
    for (let x = x0 + 2; x < x1 - 2; x += 4.5) stalks.push([x + rr(-1, 1), rr(16, 22), rr(0, 6)]);
    const o = {
      kind: 'wheat', x: (x0 + x1) / 2, y, rustle: 0, hitbox: null,
      bounds: { l: x0 - 4, r: x1 + 4, t: y - 30, b: y + 4 },
      contains(px, py) { return px > x0 + 4 && px < x1 - 4 && py > y - TILE + 4 && py <= y + 4; },
      draw(ctx, t) {
        const col = L.season === 'spring' ? ['#7fb350', '#5f9a3a'] : ['#e6c25a', '#c9a33a'];
        ctx.lineCap = 'round';
        for (const [sx, h, ph] of stalks) {
          const near = Math.abs(sx - player.x) < 14 && Math.abs(y - player.y) < TILE && player.speed > 10 ? Math.sin(t * 30 + ph) * 2.5 : 0;
          const sw = Math.sin(t * 1.4 + ph + sx * 0.05) * 2 + near;
          ctx.strokeStyle = col[1]; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(sx, y); ctx.quadraticCurveTo(sx, y - h * 0.6, sx + sw, y - h); ctx.stroke();
          ctx.fillStyle = col[0]; ellipse(ctx, sx + sw, y - h - 2, 1.8, 4);
        }
      },
    };
    return o;
  }
  function makeBarn(x, y) {
    return {
      kind: 'barn', x, y, hitbox: box(x - 56, y - 50, 112, 51), bounds: { l: x - 64, r: x + 64, t: y - 120, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ctx.fillRect(x - 50, y - 6, 120, 12); },
      draw(ctx) {
        ctx.fillStyle = '#a8392b'; ctx.fillRect(x - 56, y - 70, 112, 70);
        ctx.fillStyle = '#8a2e22'; poly(ctx, [[x - 62, y - 68], [x + 62, y - 68], [x + 40, y - 110], [x - 40, y - 110]]); ctx.fill();
        ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 20, y - 48, 40, 48);
        ctx.fillStyle = '#e6c56a'; poly(ctx, [[x - 18, y], [x + 18, y], [x + 12, y - 22], [x - 10, y - 26]]); ctx.fill(); // hay inside
        ctx.strokeStyle = '#f4f2ee'; ctx.lineWidth = 2.5;
        ctx.strokeRect(x - 20, y - 48, 40, 48);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 22, y - 48); ctx.lineTo(x + s * 42, y); ctx.moveTo(x + s * 42, y - 48); ctx.lineTo(x + s * 22, y); ctx.stroke(); }
        ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 10, y - 92, 20, 16); // the loft door
        ctx.fillStyle = '#e6c56a'; ctx.fillRect(x - 8, y - 82, 16, 6);
      },
    };
  }
  function makeHaystack(x, y) {
    const o = {
      kind: 'haystack', x, y, r: 22, hitbox: null, rustle: 0,
      bounds: { l: x - 30, r: x + 30, t: y - 40, b: y + 6 },
      contains(px, py) { const dx = (px - x) / 20, dy = (py - (y - 6)) / 11; return dx * dx + dy * dy < 1; },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 5, y, 26, 6); },
      draw(ctx, t) {
        const shake = o.rustle > 0 ? Math.sin(t * 40) * 1.5 : 0;
        ctx.fillStyle = '#c9a33a'; ellipse(ctx, x + shake, y - 12, 24, 15);
        ctx.fillStyle = '#e6c56a'; ellipse(ctx, x + shake - 2, y - 15, 20, 12);
        ctx.strokeStyle = '#b08a2a'; ctx.lineWidth = 0.8;
        for (let k = 0; k < 9; k++) { const a = k * 0.7; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 14 + shake, y - 14 + Math.sin(a) * 7); ctx.lineTo(x + Math.cos(a) * 19 + shake, y - 18 + Math.sin(a) * 8); ctx.stroke(); }
        if (player.hidden && player.hidingIn === o) {
          const ex = player.x, ey = player.y - 16;
          ctx.fillStyle = MASK; ellipse(ctx, ex, ey, 7, 2.8);
          ctx.fillStyle = '#ffffff'; circle(ctx, ex - 3, ey, 1.6); circle(ctx, ex + 3, ey, 1.6);
          ctx.fillStyle = NOSE; circle(ctx, ex - 3, ey, 0.8); circle(ctx, ex + 3, ey, 0.8);
        }
      },
    };
    return o;
  }

  // Called from buildMap after the garden, before the houses (needs room)
  function buildKindEarly(markSolid) {
    const T = TILE;
    const quads = shuffled([...L.homeQs, L.pondQ, L.gardenQ]);
    const place = (w, h) => { for (const q of quads) { const r = fitRect(q, w, h, 60); if (r) { reserve(r.x, r.y, w, h); return r; } } return null; };
    L.mill = null; L.wheat = null; L.barn = null;
    if (L.kind === 'windmill') {
      const r = place(7, 6);
      if (r) { L.mill = { x: (r.x + 3.5) * T, y: (r.y + 4.6) * T, door: { x: (r.x + 3.5) * T, y: (r.y + 5.4) * T } }; markSolid(r.x + 2, r.y + 3, 3, 2); }
      if (!isWinter()) { const w = place(10, 5); if (w) L.wheat = { x: w.x + 1, y: w.y + 1, w: 8, h: 3 }; }
      const b = place(6, 6);
      if (b) { L.barn = { x: (b.x + 3) * T, y: (b.y + 3.6) * T }; markSolid(b.x, b.y + 1, 6, 3); }
    }
    L.castle = null; L.treehouses = null; L.museum = null;
    if (L.kind === 'castle') buildCastle(markSolid, place);
    if (L.kind === 'forest') buildForest(markSolid, place);
    buildMarsh(markSolid, place);
    buildMoreEarly(markSolid, place);
    buildOutskirts(markSolid, place);
    if (L.kind === 'castle' || (L.kind !== 'market' && rand() < 0.3)) buildMuseum(markSolid, place);
  }
  // Called from buildMap after the plaza props
  function buildKindLate() {
    const T = TILE, P = L.plaza, px = P.x, py = P.y;
    L.stalls = null; L.cart = null; L.festCrows = []; L.bonfire = null; L.fireworks = [];
    placeCastleObjects(); placeForestObjects(); placeMuseumObjects(); placeRace(); placeMoreObjects(); placeOutskirtsObjects(); placeRailObjects();
    if (L.museum) L.homes.guard = L.homes.percy;
    L.homes.pest = L.homes.percy; L.homes.watch = L.homes.percy;
    L.lights = objects.filter((o) => o.kind === 'lamp');
    placeTraps();
    if (L.kind === 'market') {
      L.stalls = [];
      const spots = [[px + 2.6, py + 2.2], [px + 9.4, py + 2.2], [px + 2.6, py + 10.6], [px + 9.4, py + 10.6]];
      STALLS.forEach((s, i) => {
        const [sx, sy] = spots[i];
        objects.push(makeStall(sx * T, sy * T, s));
        L.stalls.push({ ...s, x: sx * T, y: sy * T, vx: sx * T, vy: (sy - 0.9) * T });
      });
      const c = freeSpotNear(px + 13, py + 6, 2, 1, 3) || freeSpotNear(px - 3, py + 6, 2, 1, 3);
      if (c) objects.push(makeCart((c[0] + 1) * T, (c[1] + 0.7) * T));
    }
    if (L.mill) objects.push(makeWindmill(L.mill.x, L.mill.y));
    if (L.wheat) { const W = L.wheat; for (let r = 0; r < W.h; r++) objects.push(makeWheatRow(W.x * T, (W.x + W.w) * T, (W.y + r + 0.95) * T)); }
    if (L.barn) { objects.push(makeBarn(L.barn.x, L.barn.y)); objects.push(makeHaystack(L.barn.x + 70, L.barn.y + 14)); }
    if (L.jetty) {
      objects.push(makeBoatObj());
      const J = L.jetty, s = freeSpotNear(J.baseX + 2, J.baseY + 1, 2, 1, 4) || freeSpotNear(J.baseX - 3, J.baseY - 1, 2, 1, 4);
      if (s) { L.contest = { x: (s[0] + 1) * T, y: (s[1] + 0.8) * T }; objects.push(makeContestTable(L.contest.x, L.contest.y, 'BIGGEST CATCH', '#dbe6ee')); }
    }
    if (L.island) { const I = L.island; objects.push(makeTree((I.cx + 0.6) * T, (I.cy - 0.1) * T)); }
    // Events
    const E = L.event;
    if (E === 'fete' || E === 'wedding') objects.push(makeBunting(E));
    if (E === 'fete') objects.push(makeContestTable((px + 9) * T, (py + 7.6) * T, 'CAKE CONTEST', '#f2d6dc'));
    if (E === 'wedding') {
      objects.push(makeArch((px + 6) * T, (py + 9.6) * T));
      for (const cx of [3.4, 4.6, 7.4, 8.6]) for (const cy of [7, 8]) objects.push(makeChair((px + cx) * T, (py + cy) * T));
      objects.push(makeContestTable((px + 2.6) * T, (py + 5.6) * T, null, '#f8f4ec'));
    }
    if (E === 'bonfire') {
      L.bonfire = { x: (px + 6) * T, y: (py + 8.6) * T };
      objects.push(makeBonfire(L.bonfire.x, L.bonfire.y));
      objects.push(makeContestTable((px + 2.6) * T, (py + 5.6) * T, 'TOFFEE APPLES', '#f2e2c4'));
    }
    if (E === 'scarecrows') {
      const cols = [['#c0392b', '#3a2418'], ['#7a4f8f', '#d9a43a'], ['#3f7f6a', '#2b2d33'], ['#d9a43a', '#4f6fa8'], ['#f2b8c6', '#7a5230']];
      for (let k = 0; k < 5; k++) {
        const s = k < 2 ? freeSpotNear(px + (k ? 13 : -2), py + 3 + k * 5, 1, 1, 4) : randomFreeSpot(1, 1);
        if (s) { const o = makeFestScarecrow((s[0] + 0.5) * T, (s[1] + 0.85) * T, cols[k][0], cols[k][1]); objects.push(o); L.festCrows.push(o); }
      }
    }
  }
  // Items for the new villages and events (called at the end of placeItems)
  function placeKindItems() {
    const T = TILE, P = L.plaza, px = P.x, py = P.y;
    if (L.stalls) for (const s of L.stalls) s.goods.forEach((g, i) => { addItem(g, s.x - 30 + i * (60 / Math.max(1, s.goods.length - 1)), s.y - 3, { z: 16, owner: s.owner }).stall = true; });
    if (L.mill) {
      for (let k = 0; k < 3; k++) placeFree('flour', L.mill.x - 34 + k * 12, L.mill.y + 12);
      placeFree('bread', L.mill.x + 28, L.mill.y + 10, { owner: 'rosa' });
      placeFree('flour', L.mill.x + 40, L.mill.y + 4);
    }
    placeMoreItems();
    placeOutskirtsItems();
    placePrankItems();
    if (L.rail) for (let k = 0; k < 3; k++) placeFree('suitcase', L.rail.station.x - 90 + k * 22, L.rail.station.y - 4, { owner: 'percy' });
    if (L.castleChest) addItem('chest', L.castleChest.x, L.castleChest.y);
    if (L.plinths) ['crown', 'gem', 'goldvase'].forEach((k, i) => { const p = L.plinths[i]; addItem(k, p.x, p.y - 2, { z: 18, owner: 'guard' }).museum = true; });
    if (L.rings) for (const R of L.rings) for (let k = 0; k < 2; k++) placeFree('mushroom', R.x + rr(-40, 40), R.y + rr(18, 30));
    if (L.contest) { const it = addItem('bigfish', L.contest.x - 6, L.contest.y - 3, { z: 16, owner: 'ollie' }); it.contest = true; }
    const E = L.event;
    if (E === 'fete') {
      [['cake', 'rosa'], ['cake', 'mabel'], ['cake', 'fennick']].forEach(([k, o], i) => { const it = addItem(k, (px + 9) * T - 15 + i * 15, (py + 7.6) * T - 3, { z: 16, owner: o }); it.contest = true; });
      addItem('rosette', (px + 9) * T + 18, (py + 7.6) * T - 2, { z: 16, owner: 'fennick' });
    }
    if (E === 'wedding') {
      addItem('weddingcake', (px + 2.6) * T, (py + 5.6) * T - 3, { z: 16, owner: 'rosa' });
      addItem('bouquet', (px + 7.4) * T, (py + 7) * T + 2, { z: 8, owner: 'fennick' });
    }
    if (E === 'bonfire') {
      for (let k = 0; k < 3; k++) addItem('toffee', (px + 2.6) * T - 14 + k * 14, (py + 5.6) * T - 3, { z: 16, owner: 'mabel' });
      for (let k = 0; k < 3; k++) placeFree('rocket', L.bonfire.x + 60 + k * 9, L.bonfire.y + 4);
    }
  }
  // Market day: stallholders spend the morning at their stalls
  function withStall(id, stops) {
    const ns = nightStops(id);
    if (ns) return ns; // night raid: everyone's in bed
    const T = TILE, extra = [];
    const s = L.stalls && L.stalls.find((x) => x.owner === id);
    if (s) extra.push({ wx: s.vx, wy: s.vy, act: 'sell', dur: 22, face: 'down', lines: s.lines });
    const h = L.houses[L.homes[id]], shop = h && h.room && shopOf(h);
    if (shop && shop.owner === id) extra.push({ wx: (h.room.x0 + 5.5) * T, wy: (h.room.y0 + 3.7) * T, act: 'shop', dur: 20, face: 'down', lines: ['Can I help you?', 'Lovely day for it!', 'Just browsing?', 'Mind the shelves!'] });
    if (id === 'bertram' && L.kind === 'forest' && L.logpile) extra.push({ wx: L.logpile.x + 37, wy: L.logpile.y + 16, act: 'chop', dur: 12, face: 'up', lines: ['Timber!', 'Chop, chop.', 'Lovely bit of oak, this.'] });
    return [...extra, ...stops];
  }

  // --- Event decorations --------------------------------------------------------------------
  function makeBunting(kind) {
    const P = L.plaza, T = TILE, x0 = P.x * T + 16, x1 = (P.x + P.w) * T - 16, ys = [P.y * T + 12, (P.y + P.h) * T - 10];
    const cols = kind === 'wedding' ? ['#ffffff', '#f2b8c6', '#ffe9f0'] : ['#e8453c', '#f2c14e', '#4f93c7', '#8fd16a'];
    return {
      kind: 'bunting', x: (x0 + x1) / 2, y: ys[0] - 1, bounds: { l: x0 - 10, r: x1 + 10, t: ys[0] - 60, b: ys[1] + 4 },
      draw(ctx, t) {
        for (const y of ys) {
          const top = y - 44;
          ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(x0, top); ctx.quadraticCurveTo((x0 + x1) / 2, top + 14, x1, top); ctx.stroke();
          const n = 18;
          for (let k = 1; k < n; k++) {
            const u = k / n, fx = x0 + (x1 - x0) * u, fy = top + 14 * 2 * u * (1 - u) + Math.sin(t * 2 + k) * 0.6;
            ctx.fillStyle = cols[k % cols.length]; poly(ctx, [[fx - 3.5, fy], [fx + 3.5, fy], [fx, fy + 7]]); ctx.fill();
          }
        }
      },
    };
  }
  function makeArch(x, y) {
    return {
      kind: 'arch', x, y, hitbox: null, bounds: { l: x - 40, r: x + 40, t: y - 80, b: y + 6 },
      draw(ctx, t) {
        ctx.strokeStyle = '#f4f2ee'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x - 30, y - 44); ctx.arc(x, y - 44, 30, Math.PI, 0); ctx.lineTo(x + 30, y); ctx.stroke();
        for (let k = 0; k < 14; k++) {
          const a = Math.PI + (k / 13) * Math.PI, fx = x + Math.cos(a) * 30, fy = y - 44 + Math.sin(a) * 30;
          ctx.fillStyle = k % 2 ? '#f2b8c6' : '#ffffff'; circle(ctx, fx, fy, 3.4);
          ctx.fillStyle = '#7fb350'; circle(ctx, fx + 2, fy + 2, 1.5);
        }
        if (Math.random() < 0.05 && !paused) particles.push({ kind: 'shard', col: pick(['#f2b8c6', '#ffd166', '#ffffff', '#9ad1ff']), x: x + rr(-30, 30), y, z: 70, vx: rr(-15, 15), vy: rr(-5, 5), vz: rr(0, 20), life: 1.6, max: 1.6 });
      },
    };
  }
  function makeChair(x, y) {
    return {
      kind: 'chair', x, y, hitbox: null, bounds: { l: x - 8, r: x + 8, t: y - 22, b: y + 3 },
      draw(ctx) {
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(x - 5, y - 8, 10, 2.5); ctx.fillRect(x - 5, y - 18, 10, 9);
        ctx.fillStyle = '#d9d2c4'; ctx.fillRect(x - 5, y - 6, 1.5, 6); ctx.fillRect(x + 3.5, y - 6, 1.5, 6);
        ctx.fillStyle = '#f2b8c6'; circle(ctx, x, y - 16, 1.8);
      },
    };
  }
  function makeBonfire(x, y) {
    return {
      kind: 'bonfire', x, y, hitbox: box(x - 16, y - 8, 32, 9), bounds: { l: x - 60, r: x + 60, t: y - 70, b: y + 30 },
      shadow(ctx) { const g = ctx.createRadialGradient(x, y - 6, 4, x, y - 6, 70); g.addColorStop(0, `rgba(255,170,60,${0.25 + duskK * 0.35})`); g.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 70, y - 76, 140, 140); },
      draw(ctx, t) {
        ctx.fillStyle = '#5a3a20';
        for (const [a, l] of [[-0.6, 22], [0.6, 22], [-0.2, 18], [0.25, 20]]) { ctx.save(); ctx.translate(x, y - 3); ctx.rotate(a); ctx.fillRect(-2, -l, 4, l); ctx.restore(); }
        for (let k = 0; k < 6; k++) {
          const fx = x + Math.sin(t * 5 + k * 2) * 5 + (k - 2.5) * 3, h = 16 + Math.sin(t * 9 + k) * 6 + (k % 3) * 4;
          ctx.fillStyle = k % 2 ? '#f2913a' : '#ffd166';
          poly(ctx, [[fx - 5, y - 4], [fx + 5, y - 4], [fx + Math.sin(t * 7 + k) * 2, y - 4 - h]]); ctx.fill();
        }
        if (Math.random() < 0.3 && !paused) particles.push({ kind: 'spark', x: x + rr(-6, 6), y, z: 20, vx: rr(-10, 10), vy: 0, vz: rr(40, 90), life: 0.8, max: 0.8 });
      },
    };
  }
  function makeFestScarecrow(x, y, shirt, hat) {
    const o = {
      kind: 'festcrow', x, y, down: false,
      hitbox: box(x - 4, y - 5, 8, 6), bounds: { l: x - 30, r: x + 30, t: y - 64, b: y + 10 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 6, y, 14, 4); },
      draw(ctx, t) {
        ctx.save(); ctx.translate(x, y);
        if (o.down) { ctx.translate(0, 2); ctx.rotate(Math.PI / 2 * 0.95); } else ctx.rotate(Math.sin(t * 1.1 + x) * 0.04);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-2, -48, 4, 48); ctx.fillRect(-20, -36, 40, 3);
        ctx.fillStyle = shirt; roundRect(ctx, -10, -40, 20, 22, 4, true);
        ctx.fillStyle = '#e6c56a'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 20, -36); ctx.lineTo(s * 25, -30); ctx.lineTo(s * 18, -31); ctx.fill(); }
        ctx.fillStyle = L.season === 'autumn' ? '#f2913a' : '#efe3cf'; circle(ctx, 0, -46, 7.5); // pumpkin heads in autumn
        ctx.fillStyle = '#2b2d33'; circle(ctx, -2.5, -47, 1.3); circle(ctx, 2.5, -47, 1.3); ctx.fillRect(-3, -43.5, 6, 1.2);
        ctx.fillStyle = hat; ctx.fillRect(-11, -54, 22, 3); roundRect(ctx, -6, -62, 12, 9, 2, true);
        ctx.fillStyle = '#f2c14e'; circle(ctx, 6, -26, 2.2); // a prize ribbon
        ctx.restore();
      },
    };
    return o;
  }

  // --- Per frame ---------------------------------------------------------------------------------
  function updateKinds(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    // Rowing
    if (player.boat) {
      if (player.boatFrom && Math.hypot(player.x - player.boatFrom.x, player.y - player.boatFrom.y) > 70) completeTask('row');
      if (player.speed > 10 && Math.random() < dt * 4) particles.push({ kind: 'ring', x: player.x + rr(-12, 12), y: player.y + 2, r: 2, life: 0.8, max: 0.8 });
    }
    if (L.island) for (const it of items) if (!it.held && !it.air && onIsland(it.x, it.y) && it.touched) { completeTask('island'); break; }
    // The fruit cart
    const C = L.cart;
    if (C && !C.tipped && outside) {
      if (Math.hypot(player.x - C.x, player.y - (C.y - 4)) < 30 && Math.max(player.speed, C.lastSpd || 0) > 120) tipCart();
      C.lastSpd = player.speed;
      for (const it of items) if (it.air && it.kicker !== 'cart' && Math.hypot(it.vx, it.vy) > 100 && it.z < 30 && Math.hypot(it.x - C.x, it.y - C.y) < 22) { tipCart(); break; }
    }
    // Flour clouds: walk into one and you come out white
    if (L.flourClouds) for (let i = L.flourClouds.length - 1; i >= 0; i--) {
      const c = L.flourClouds[i];
      c.t -= dt;
      if (Math.random() < dt * 12) particles.push({ x: c.x + rr(-22, 22), y: c.y + rr(-10, 10), r: rr(5, 9), life: 0.9, max: 0.9, vy: -6 });
      if (Math.hypot(player.x - c.x, player.y - c.y) < 40 && areaOf(player.x, player.y) === areaOf(c.x, c.y)) {
        if (!(player.flour > 20)) player.bubble = { text: '*cough* pfft!', t: 1.3 };
        player.flour = 35; completeTask('flour');
      }
      if (c.t <= 0) L.flourClouds.splice(i, 1);
    }
    // Flour: covered in it, you look like a ghost
    if (player.flour > 0) {
      player.flour -= dt * (wet() ? 3 : 1);
      if (Math.random() < dt * 6) particles.push({ x: player.x + rr(-6, 6), y: player.y - rr(0, 4), r: rr(1.5, 3), life: 0.6, max: 0.6, vy: -6 });
      if (!player.hidden) for (const v of villagers) {
        if ((v.ghostCD || 0) > time || (v.state !== 'route' && v.state !== 'act') || !canSeePlayer(v) || Math.hypot(v.x - player.x, v.y - player.y) > 140) continue;
        v.ghostCD = time + 20;
        if (startleV(v, rpick(['A G-G-GHOST!', 'Eeek! A ghost!', 'Wh-what IS that?!']), { state: 'sulk' })) { v.stateT = 2.5; completeTask('ghost'); }
      }
    }
    // Festival scarecrows get knocked over by thrown things
    for (const o of L.festCrows) {
      if (o.down) continue;
      for (const it of items) {
        if (!it.air || Math.hypot(it.vx, it.vy) < 80 || it.z > 55 || Math.hypot(it.x - o.x, it.y - o.y) > 16) continue;
        o.down = true; o.hitbox.w = 1; o.hitbox.h = 1; sfx('thud'); puff(o.x, o.y, 4);
        lookTowards(o.x, o.y, 220, () => rpick(['My scarecrow!', 'Not my prize scarecrow!', 'Who knocked that over?!']));
        run.crows = (run.crows || 0) + 1; setProgress('scarecrows', run.crows);
        it.vx *= -0.3; it.vy *= -0.3; break;
      }
    }
    // Bonfire night: rockets in the fire go up, and the sky fills with fireworks after dusk
    const B = L.bonfire;
    if (B) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.kind !== 'rocket' || it.held || it.z > 30 || Math.hypot(it.x - B.x, it.y - B.y) > 34) continue;
        items.splice(i, 1);
        launchFirework(B.x, B.y - 10, true);
      }
      L.fwT = (L.fwT || 0) - dt;
      if (duskK > 0.45 && L.fwT <= 0) { L.fwT = rr(2, 5); launchFirework(B.x + rr(-200, 200), B.y + rr(-150, 50), false); }
    }
    for (let i = L.fireworks.length - 1; i >= 0; i--) {
      const f = L.fireworks[i];
      f.z += f.vz * dt; f.vz -= 170 * dt; f.x += f.vx * dt;
      if (Math.random() < 0.8) particles.push({ kind: 'spark', x: f.x, y: f.y, z: f.z, vx: 0, vy: 0, vz: -20, life: 0.3, max: 0.3 });
      if (f.vz < 40) {
        L.fireworks.splice(i, 1);
        const col = pick(['#ff6f91', '#ffd166', '#9ad1ff', '#8fd16a', '#c79aff']);
        for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2, s = rr(60, 110); particles.push({ kind: 'shard', col, x: f.x, y: f.y, z: f.z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.3, vz: Math.sin(a) * s * 0.9 + 40, life: 1.3, max: 1.3 }); }
        if (Math.hypot(f.x - player.x, f.y - player.y) < 600) { sfx('thud'); sfx('crash'); }
        if (f.mine) {
          completeTask('firework');
          for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - f.x, v.y - f.y) < 420) startleV(v, rpick(['Ooh!', 'Aaah!', 'Who lit that?!', 'Goodness!']));
        }
      }
    }
  }
  function launchFirework(x, y, mine) {
    L.fireworks.push({ x, y, z: 10, vz: rr(230, 290), vx: rr(-15, 15), mine });
    if (Math.hypot(x - player.x, y - player.y) < 500) sfx('whoosh');
  }
  // A flour sack bursts: a big white cloud
  function burstFlour(it) {
    sfx('splat'); sfx('whoosh');
    for (let k = 0; k < 26; k++) { const a = Math.random() * Math.PI * 2, s = rr(10, 70); particles.push({ kind: 'shard', col: '#f8f6f0', x: it.x, y: it.y, z: rr(2, 12), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: rr(20, 90), life: 1, max: 1 }); }
    for (let k = 0; k < 10; k++) particles.push({ x: it.x + rr(-20, 20), y: it.y + rr(-10, 10), r: rr(5, 9), life: 1.4, max: 1.4, vy: -8 });
    (L.flourClouds = L.flourClouds || []).push({ x: it.x, y: it.y, t: 4 }); // hangs in the air for a bit: run through it
    for (const v of villagers) if (Math.hypot(v.x - it.x, v.y - it.y) < 48) startleV(v, rpick(['Achoo!', 'Pfft! Flour!', '*cough cough*']));
    lookTowards(it.x, it.y, 200, () => rpick(['Who wasted that flour?!', 'What a mess!']));
  }

  // ---------------------------------------------------------------------------
  // Winter animals (robins, a stoat, a snowy owl, a reindeer with a sleigh),
  // more snowy weather (sleet, blizzards, surprise snow, roof snow, icicles),
  // snow fun (a sledging hill, snowmen, Toby's snowball fights, drifts, an
  // igloo) and year-round animals (a horse, ducklings, a llama, a tortoise)
  // ---------------------------------------------------------------------------
  const SN_TYPES = new Set(['robin', 'stoat', 'snowyowl', 'sleigh', 'horse', 'mamaduck', 'duckling', 'llama']);
  const SNOWY_W = ['snowstorm', 'blizzard', 'snowfall', 'sleet'];
  const snowing = () => !!L && (isWinter() || SNOWY_W.includes(L.weather));

  Object.assign(ITEM, {
    present: { name: 'present', h: 10, r: 6, draw(c, it) {
      const col = ['#c0392b', '#3f7f6a', '#4f6fa8', '#7a4f8f'][Math.floor((it ? it.ph0 : 0) * 10) % 4];
      c.fillStyle = col; c.fillRect(-6, -10, 12, 10);
      c.fillStyle = '#f2c14e'; c.fillRect(-1, -10, 2, 10); c.fillRect(-6, -6, 12, 2);
      c.beginPath(); c.ellipse(-2.5, -11, 2.5, 1.5, -0.4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(2.5, -11, 2.5, 1.5, 0.4, 0, Math.PI * 2); c.fill();
    } },
    sled: { name: 'sledge (E to ride)', h: 6, r: 10, draw(c) {
      c.strokeStyle = '#5a3a20'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-11, 0); c.lineTo(9, 0); c.quadraticCurveTo(13, 0, 12, -4); c.stroke();
      c.fillStyle = '#c0392b'; c.fillRect(-10, -6, 18, 4);
      c.fillStyle = '#5a3a20'; c.fillRect(-8, -2.5, 1.5, 2.5); c.fillRect(5, -2.5, 1.5, 2.5);
    } },
    tortoise: { name: 'tortoise', h: 8, r: 6, draw(c, it, t) {
      const k = it && it.walking ? Math.sin((t || 0) * 6) * 1 : 0;
      c.fillStyle = '#8a9a5a'; for (const [x, y] of [[-4, -1], [4, -1]]) c.fillRect(x - 1 + k * (x > 0 ? 1 : -1), y, 2.2, 2);
      c.fillStyle = '#9aaa6a'; ellipse(c, (it && it.facing < 0 ? -6 : 6), -3, 2.4, 2);
      c.fillStyle = '#6b5a3a'; ellipse(c, 0, -4, 6, 4.5);
      c.fillStyle = '#8a7a4a'; for (const [x, y] of [[-2.5, -5], [2.5, -5], [0, -2.5], [0, -6.8]]) circle(c, x, y, 1.4);
      c.fillStyle = '#1d1d22'; circle(c, (it && it.facing < 0 ? -7 : 7), -3.4, 0.5);
    } },
  });

  // --- Objects: icicles + roof snow, snowdrifts, igloo, sledging hill, stable ---------------
  function makeEaves(h, i) {
    const X = h.x * TILE, W = h.w * TILE, eave = (h.y + h.h) * TILE - TILE * 1.7 - 2;
    const S = { fallen: false, heap: 0 };
    (L.roofs = L.roofs || [])[i] = S;
    const ics = Array.from({ length: Math.floor(W / 9) }, (_, k) => [X + 5 + k * 9 + rr(-2, 2), rr(5, 12)]);
    return {
      kind: 'eaves', x: X + W / 2, y: (h.y + h.h) * TILE + 1, bounds: { l: X - 10, r: X + W + 10, t: eave - 4, b: (h.y + h.h) * TILE + 30 },
      draw(ctx) {
        if (!S.fallen) { ctx.fillStyle = 'rgba(220,238,250,0.9)'; for (const [x, l] of ics) poly(ctx, [[x - 2, eave], [x + 2, eave], [x, eave + l]]), ctx.fill(); }
        if (S.heap > 0) { // a heap of snow that slid off the roof
          const dx = (h.doorX + 0.5) * TILE, by = (h.y + h.h) * TILE + 14;
          ctx.fillStyle = '#f4f8fb'; ellipse(ctx, dx - 20, by, 22, 7); ellipse(ctx, dx + 16, by + 2, 18, 6);
          ctx.fillStyle = '#dce8f2'; ellipse(ctx, dx - 16, by + 3, 12, 3);
        }
      },
    };
  }
  function roofHit(i) {
    const S = L.roofs && L.roofs[i], h = L.houses[i];
    if (!S || S.fallen || !isWinter()) return;
    S.fallen = true; S.heap = 1;
    const X = h.x * TILE, W = h.w * TILE, by = (h.y + h.h) * TILE;
    sfx('whoosh'); sfx('crash');
    for (let k = 0; k < 40; k++) particles.push({ kind: 'shard', col: k % 4 ? '#f4f8fb' : '#cfe6f5', x: X + rr(4, W - 4), y: by + rr(0, 20), z: rr(30, 60), vx: rr(-20, 20), vy: rr(0, 30), vz: rr(-60, 10), life: 0.9, max: 0.9 });
    completeTask('icicles');
    for (const v of villagers) {
      if (areaOf(v.x, v.y) !== 0 || v.x < X - 16 || v.x > X + W + 16 || v.y < by - 4 || v.y > by + 44) continue;
      if (startleV(v, rpick(['BRRR! Snow down my neck!', 'Eek! Cold!', 'Who did that?!']), { state: 'sulk' })) { v.stateT = 2.2; completeTask('roofsnow'); }
    }
  }
  function makeDrift(x, y, rx) {
    const o = {
      kind: 'drift', x, y, r: rx, hitbox: null, rustle: 0, grow: 0,
      bounds: { l: x - rx - 6, r: x + rx + 6, t: y - 26, b: y + 6 },
      contains(px, py) { const dx = (px - x) / (rx * 0.8), dy = (py - (y - 4)) / 9; return o.grow > 0.6 && dx * dx + dy * dy < 1; },
      draw(ctx, t) {
        const g = Math.min(1, o.grow), sh = o.rustle > 0 ? Math.sin(t * 40) * 1.2 : 0;
        ctx.fillStyle = '#e4eef7'; ellipse(ctx, x + sh, y - 3 * g, rx * g, 9 * g);
        ctx.fillStyle = '#f8fbfd'; ellipse(ctx, x - 3 + sh, y - 6 * g, rx * 0.8 * g, 7 * g);
        if (player.hidden && player.hidingIn === o) {
          const ex = player.x, ey = player.y - 12;
          ctx.fillStyle = MASK; ellipse(ctx, ex, ey, 7, 2.8);
          ctx.fillStyle = '#ffffff'; circle(ctx, ex - 3, ey, 1.6); circle(ctx, ex + 3, ey, 1.6);
          ctx.fillStyle = NOSE; circle(ctx, ex - 3, ey, 0.8); circle(ctx, ex + 3, ey, 0.8);
        }
      },
    };
    return o;
  }
  function makeIgloo(x, y) {
    const o = {
      kind: 'igloo', x, y, r: 26, hitbox: null, rustle: 0,
      bounds: { l: x - 34, r: x + 34, t: y - 44, b: y + 6 },
      contains(px, py) { const dx = (px - x) / 24, dy = (py - (y - 8)) / 12; return dx * dx + dy * dy < 1; },
      shadow(ctx) { ctx.fillStyle = 'rgba(60,80,110,0.2)'; ellipse(ctx, x + 6, y, 32, 8); },
      draw(ctx) {
        ctx.fillStyle = '#eef4fa'; ctx.beginPath(); ctx.ellipse(x, y - 2, 30, 34, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#c9d8e6'; ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x, y - 2, 30, 34 - k * 9, 0, Math.PI, 0); ctx.stroke(); }
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * 11, y - 2); ctx.lineTo(x + k * 8, y - 14); ctx.stroke(); }
        ctx.fillStyle = '#e4eef7'; roundRect(ctx, x - 10, y - 20, 20, 20, 9, true);
        ctx.fillStyle = '#3a4a5e'; roundRect(ctx, x - 7, y - 15, 14, 15, 7, true);
        if (player.hidden && player.hidingIn === o) {
          ctx.fillStyle = '#ffffff'; circle(ctx, x - 3, y - 8, 1.6); circle(ctx, x + 3, y - 8, 1.6);
          ctx.fillStyle = NOSE; circle(ctx, x - 3, y - 8, 0.8); circle(ctx, x + 3, y - 8, 0.8);
        }
      },
    };
    return o;
  }
  function makeHill(H) {
    const X = H.x * TILE, Y = H.y * TILE, W = H.w * TILE, Ht = H.h * TILE;
    return {
      kind: 'hill', x: X + W / 2, y: Y - 60, bounds: { l: X - 10, r: X + W + 10, t: Y - 20, b: Y + Ht + 10 },
      draw(ctx) {
        const g = ctx.createLinearGradient(0, Y, 0, Y + Ht);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dbe7f2');
        ctx.fillStyle = g; roundRect(ctx, X, Y, W, Ht, 20, true);
        ctx.strokeStyle = 'rgba(150,175,200,0.5)'; ctx.lineWidth = 1;
        for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(X + 10, Y + k * Ht / 5); ctx.quadraticCurveTo(X + W / 2, Y + k * Ht / 5 + 8, X + W - 10, Y + k * Ht / 5); ctx.stroke(); }
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(X + W - 18, Y + 4, 2, 22);
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, X + W - 40, Y + 2, 34, 11, 2, true);
        ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SLEDGING', X + W - 23, Y + 10);
      },
    };
  }
  const onHill = (x, y) => { const H = L && L.hill; return !!H && x > H.x * TILE && x < (H.x + H.w) * TILE && y > H.y * TILE && y < (H.y + H.h) * TILE; };
  function makeStable(x, y) {
    return {
      kind: 'stable', x, y, hitbox: box(x - 40, y - 34, 80, 22), bounds: { l: x - 48, r: x + 48, t: y - 90, b: y + 4 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ctx.fillRect(x - 36, y - 14, 86, 10); },
      draw(ctx) {
        ctx.fillStyle = '#8a5a3a'; ctx.fillRect(x - 42, y - 62, 84, 50);
        ctx.fillStyle = '#6b4226'; poly(ctx, [[x - 48, y - 60], [x + 48, y - 60], [x + 36, y - 84], [x - 36, y - 84]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - 44, y - 66], [x + 44, y - 66], [x + 34, y - 84], [x - 34, y - 84]]); ctx.fill(); }
        ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 16, y - 50, 32, 38);
        ctx.fillStyle = '#a0703f'; ctx.fillRect(x - 18, y - 30, 36, 18); // the half door
        ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 18, y - 30, 36, 18);
        ctx.fillStyle = '#e6c56a'; ctx.fillRect(x + 26, y - 26, 12, 14);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 38, y - 24, 14, 10); // a water bucket
      },
    };
  }

  // Built with the map (needs room)
  function buildSnowFeatures() {
    const T = TILE;
    L.hill = null; L.igloo = null; L.stable = null; L.drifts = [];
    if (isWinter()) {
      const quads = shuffled([...L.homeQs, L.pondQ, L.gardenQ]);
      for (const q of quads) { const r = fitRect(q, 6, 9, 60); if (r) { reserve(r.x, r.y, 6, 9); L.hill = { x: r.x + 1, y: r.y + 1, w: 4, h: 7 }; objects.push(makeHill(L.hill)); break; } }
      const s = freeSpotNear(L.plaza.x + rr(-6, 18), L.plaza.y + rr(-6, 18), 3, 2, 8) || randomFreeSpot(3, 2);
      if (s) { L.igloo = { x: (s[0] + 1.5) * T, y: (s[1] + 1.6) * T }; objects.push(makeIgloo(L.igloo.x, L.igloo.y)); }
      for (let k = 0; k < 7; k++) { const d = randomFreeSpot(2, 1); if (d) { const o = makeDrift((d[0] + 1) * T, (d[1] + 0.8) * T, rr(22, 30)); o.grow = 1; objects.push(o); L.drifts.push(o); } }
      L.houses.forEach((h, i) => objects.push(makeEaves(h, i)));
    }
    const P = L.paddock;
    const st = (P && (freeSpotNear(P.x - 4, P.y + 1, 3, 2, 5) || freeSpotNear(P.x + P.w + 1, P.y + 1, 3, 2, 5))) || randomFreeSpot(3, 2);
    if (st) { L.stable = { x: (st[0] + 1.5) * T, y: (st[1] + 1.6) * T }; objects.push(makeStable(L.stable.x, L.stable.y)); }
  }
  function placeSnowItems() {
    if (L.hill) placeFree('sled', (L.hill.x + 2) * TILE, (L.hill.y + 0.8) * TILE);
    const h = L.houses[L.homes.mabel];
    if (h) placeFree('tortoise', (h.doorX - 1.5) * TILE, (h.y + h.h + 1.6) * TILE, { owner: 'mabel' });
  }

  // --- Spawning ----------------------------------------------------------------------------------
  function spawnSnowAnimals() {
    const T = TILE;
    const mk = (type, x, y, extra) => critters.push(Object.assign({ type, x, y, z: 0, dir: 'left', walk: 0, ph: rand() * 6, tx: null, wait: rr(0, 3), cd: 0 }, extra));
    if (L.season === 'winter' || L.season === 'autumn') {
      const fences = objects.filter((o) => o.kind === 'fence' && o.y < WORLD_H);
      for (let k = 0; k < 3 && fences.length; k++) { const f = fences[Math.floor(rand() * fences.length)]; mk('robin', f.x + rr(-6, 6), f.y + 1, { z: 13, hx: f.x, hy: f.y + 1, hz: 13, flying: true, flyT: 0 }); }
    }
    if (isWinter()) {
      if (L.coop) { const e = edgeSpot(L.coop.x, L.coop.y); if (e) mk('stoat', e.x, e.y, { hx: e.x, hy: e.y, state: 'lurk', t: rr(10, 25), carrier: true, carry: null }); }
      const tall = (L.squirrelTrees || []).filter((tr) => tr.canopy);
      if (tall.length) { const tr = tall[Math.floor(rand() * tall.length)]; mk('snowyowl', tr.x, tr.y + 1, { z: tr.y - tr.canopy.cy + tr.canopy.r * 0.6, flying: true, gone: false, circleT: 0 }); }
      mk('sleigh', -80, (L.roadY + 1.1) * T, { flying: true, vx: 0, wait: rr(6, 14), presents: 4, dirX: 1, spook: 0 });
    }
    // Year-round animals
    if (L.stable) mk('horse', L.stable.x + rr(-10, 10), L.stable.y + 28, { hx: L.stable.x, hy: L.stable.y + 28, face: 1, food: null, neighT: rr(6, 12), kickCD: 0 });
    if (!isWinter() && L.kind !== 'seaside') {
      const sp = shorePoint(rand() * Math.PI * 2);
      mk('mamaduck', sp.x, sp.y, { hx: sp.x, hy: sp.y, flying: false });
      const mum = critters[critters.length - 1];
      let lead = mum;
      for (let k = 0; k < 4; k++) { mk('duckling', sp.x - (k + 1) * 9, sp.y, { leader: lead, mum, follow: 'mum', flying: false }); lead = critters[critters.length - 1]; }
      L.ducklings = true;
    } else L.ducklings = false;
    {
      const P = L.paddock, base = P ? { x: (P.gx + 1) * T + 60, y: (P.gateBottom ? P.y + P.h + 2 : P.y - 2) * T } : { x: (L.plaza.x + 15) * T, y: (L.plaza.y + 3) * T };
      if (!navBlockedPt(base.x, base.y)) mk('llama', base.x, base.y, { hx: base.x, hy: base.y, annoy: 0, spitCD: 0 });
    }
    L.spits = [];
  }
  const heldPosCritter = (c) => ({ x: c.x + (c.dir === 'right' ? 8 : -8), y: c.y + 0.5, z: (c.z || 0) + 3 });

  // --- Behaviour -------------------------------------------------------------------------------------
  function updateSnowAnimals(c, dt, near) {
    const pd = Math.hypot(player.x - c.x, player.y - c.y);
    const outside = areaOf(player.x, player.y) === 0;
    const running = player.speed > WALK_SPEED * 1.15;
    c.cd = Math.max(0, (c.cd || 0) - dt);
    switch (c.type) {
      case 'robin': {
        if (c.flyT > 0) { // flitting to another perch
          c.flyT -= dt; c.walk += dt * 30;
          c.x += Math.cos(c.fa) * 90 * dt; c.y += Math.sin(c.fa) * 50 * dt; c.z = 13 + Math.sin((1 - c.flyT / 1.4) * Math.PI) * 30;
          if (c.flyT <= 0) { c.hx = c.x; c.hy = c.y; c.z = 2; c.hz = 2; }
          break;
        }
        if (outside && pd < 70 && running && !player.hidden) { c.flyT = 1.4; c.fa = Math.atan2(c.y - player.y, c.x - player.x) + rr(-0.6, 0.6); sfx('flutter'); break; }
        if (outside && pd < 24 && !player.hidden && c.cd <= 0) { c.cd = 5; c.bubble = { text: '♪ tweet ♪', t: 1.2 }; completeTask('robin'); }
        c.wait -= dt;
        if (c.wait <= 0) { c.wait = rr(0.8, 2.5); c.dir = Math.random() < 0.5 ? 'left' : 'right'; c.z = c.hz + 2; }
        c.z = Math.max(c.hz, c.z - dt * 20);
        break;
      }
      case 'stoat': {
        const scared = outside && !player.hidden && ((pd < 70 && running) || pd < 30);
        if (c.state === 'flee') { if (wayTo(c, c.hx, c.hy, 150, dt)) { c.state = 'lurk'; c.t = rr(30, 50); c.path = null; } break; }
        if (scared && c.state !== 'lurk') { stoatDrop(c, true); break; }
        if (c.state === 'lurk') { c.t -= dt; if (c.t <= 0) { c.state = 'sneak'; c.path = null; } break; }
        if (c.state === 'sneak') {
          const egg = items.find((it) => it.kind === 'egg' && !it.held && !it.air && Math.hypot(it.x - L.coop.x, it.y - L.coop.y) < 140);
          if (!egg) { c.state = 'flee'; c.path = null; break; }
          if (wayTo(c, egg.x, egg.y, 60, dt) || Math.hypot(egg.x - c.x, egg.y - c.y) < 8) {
            Object.assign(egg, { held: true, heldBy: c, air: false }); c.carry = egg; c.state = 'carry'; c.path = null; c.bubble = { text: '*snatch*', t: 0.8 };
            lookTowards(c.x, c.y, 200, () => rpick(['A stoat! After the eggs!', 'Oi! My eggs!']));
          }
          break;
        }
        if (c.state === 'carry') {
          if (wayTo(c, c.hx, c.hy, 85, dt)) { // got away with it
            const i2 = items.indexOf(c.carry); if (i2 >= 0) items.splice(i2, 1);
            c.carry = null; c.state = 'lurk'; c.t = rr(25, 45); c.path = null;
          }
        }
        break;
      }
      case 'snowyowl': {
        if (c.gone) { c.circleT += dt; c.x += Math.cos(c.circleT * 1.2) * 70 * dt; c.y += Math.sin(c.circleT * 1.2) * 40 * dt; c.z = 60 + Math.sin(c.circleT) * 10; c.walk += dt * 22; if (c.circleT > 12) { c.gone = false; c.z = c.homeZ; c.x = c.hx; c.y = c.hy; } break; }
        if (c.homeZ === undefined) { c.homeZ = c.z; c.hx = c.x; c.hy = c.y; }
        if (player.x !== c.x && pd < 220) c.dir = player.x > c.x ? 'right' : 'left';
        break;
      }
      case 'sleigh': {
        if (c.vx === 0) {
          c.wait -= dt;
          if (c.wait <= 0) { c.vx = 75 * c.dirX; c.x = c.dirX > 0 ? -60 : WORLD_W + 60; c.presents = Math.max(c.presents, 2); }
          break;
        }
        c.spook = Math.max(0, c.spook - dt);
        c.x += c.vx * (c.spook > 0 ? 2.2 : 1) * dt; c.dir = c.vx > 0 ? 'right' : 'left'; c.moving = true; c.walk += dt * 12;
        if (Math.random() < dt * 2 && pd < 400) sfx('jingle');
        if (outside && !player.hidden && c.spook <= 0 && ((near && pd < 60) || pd < 30)) sleighSpook(c);
        if ((c.vx > 0 && c.x > WORLD_W + 80) || (c.vx < 0 && c.x < -80)) { c.vx = 0; c.dirX = -c.dirX; c.wait = rr(30, 50); }
        break;
      }
      case 'horse': {
        c.kickCD = Math.max(0, c.kickCD - dt);
        c.neighT -= dt;
        if (c.neighT <= 0) { c.neighT = rr(9, 16); c.bubble = { text: 'Neighhh', t: 1.2 }; if (pd < 300) sfx('neigh'); }
        if (!c.food || !items.includes(c.food) || c.food.held || c.food.air) {
          c.food = null;
          for (const f of items) if (isFood(f) && f.touched && !f.held && !f.air && areaOf(f.x, f.y) === 0 && Math.hypot(f.x - c.x, f.y - c.y) < 90) { c.food = f; break; }
        }
        if (c.food) {
          if (critterMove(c, c.food.x, c.food.y, 30, dt) || Math.hypot(c.food.x - c.x, c.food.y - c.y) < 10) {
            const i2 = items.indexOf(c.food); if (i2 >= 0) items.splice(i2, 1);
            crumbs(c.x, c.y, 6, 6, '#c9b57e'); c.food = null; c.bubble = { text: 'Neigh! ♥', t: 1.3 }; sfx('neigh');
            for (let k = 0; k < 3; k++) particles.push({ kind: 'heart', x: c.x + rr(-6, 6), y: c.y, z: 26 + k * 4, life: 1.2, max: 1.2 });
            completeTask('horse');
          }
          c.face = c.dir === 'right' ? 1 : -1;
          break;
        }
        // Never walk behind a horse
        const behind = Math.sign(player.x - c.x) === -c.face && Math.abs(player.y - c.y) < 14 && Math.abs(player.x - c.x) < 30;
        if (outside && behind && player.speed > 15 && c.kickCD <= 0) {
          c.kickCD = 4; c.kick = 0.4; c.bubble = { text: 'NEIGH!', t: 1 }; sfx('neigh'); sfx('bonk');
          knockPlayer(c.x, c.y, 260); completeTask('horsekick');
        }
        c.kick = Math.max(0, (c.kick || 0) - dt);
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-36, 36); c.ty = c.hy + rr(-6, 14); c.wait = rr(3, 7); }
        if (c.tx && critterMove(c, c.tx, c.ty, 14, dt)) c.tx = null;
        c.face = c.dir === 'right' ? 1 : -1;
        break;
      }
      case 'mamaduck': {
        const kidsGone = critters.some((d) => d.type === 'duckling' && d.follow === 'player');
        if (kidsGone && outside) { // waddles after you, quacking crossly
          if (pd > 40) critterMove(c, player.x, player.y, 34, dt);
          if (Math.random() < dt * 0.8) { c.bubble = { text: 'QUACK! QUACK!', t: 0.9 }; if (pd < 260) sfx('quack'); }
          break;
        }
        c.wait -= dt;
        if (c.wait <= 0) { const sp = shorePoint(Math.atan2(c.y / TILE - L.pond.cy, c.x / TILE - L.pond.cx) + rr(-0.5, 0.5)); c.tx = sp.x; c.ty = sp.y; c.wait = rr(3, 6); }
        if (c.tx && critterMove(c, c.tx, c.ty, 18, dt)) c.tx = null;
        break;
      }
      case 'duckling': {
        if (c.follow === 'mum' && outside && !player.hidden && pd < 36 && player.speed > 15 && !running) {
          // imprint on the raccoon: the whole line follows you now
          for (const d of critters) if (d.type === 'duckling') d.follow = 'player';
          L.paradeT = 0; c.bubble = { text: 'peep!', t: 0.8 }; sfx('peep');
        }
        if (c.follow === 'player' && (running || !outside || player.hidden)) { for (const d of critters) if (d.type === 'duckling') d.follow = 'mum'; sfx('peep'); }
        const leadIdx = critters.filter((d) => d.type === 'duckling').indexOf(c);
        let lx, ly;
        if (c.follow === 'player') {
          const ducks = critters.filter((d) => d.type === 'duckling');
          const prev = leadIdx === 0 ? player : ducks[leadIdx - 1];
          lx = prev.x; ly = prev.y;
        } else { lx = c.leader.x; ly = c.leader.y; }
        if (Math.hypot(lx - c.x, ly - c.y) > 11) critterMove(c, lx, ly, Math.max(30, Math.hypot(lx - c.x, ly - c.y) * 3), dt);
        if (leadIdx === 0 && c.follow === 'player') {
          L.paradeT = (L.paradeT || 0) + dt;
          if (Math.random() < dt * 0.7) { c.bubble = { text: 'peep peep', t: 0.7 }; if (pd < 200) sfx('peep'); }
          if (L.paradeT > 12) completeTask('ducklings');
        }
        break;
      }
      case 'llama': {
        c.annoy = Math.max(0, c.annoy - dt); c.spitCD = Math.max(0, c.spitCD - dt);
        const front = Math.sign(player.x - c.x) === (c.dir === 'right' ? 1 : -1);
        if (outside && pd < 44 && front && !player.hidden && c.annoy <= 0 && player.speed > 10) { c.annoy = 5; c.bubble = { text: 'Hmmmph.', t: 1 }; }
        if (c.annoy > 0) {
          let tgt = null, td = 1e9;
          for (const v of villagers) { const d = Math.hypot(v.x - c.x, v.y - c.y); if (areaOf(v.x, v.y) === 0 && d < 110 && d < td) { td = d; tgt = v; } }
          if (!tgt && outside && pd < 110 && !player.hidden) tgt = player;
          if (tgt) {
            c.dir = tgt.x > c.x ? 'right' : 'left';
            if (c.spitCD <= 0) { c.spitCD = 1.6; c.bubble = { text: 'PTOO!', t: 0.7 }; sfx('spit'); L.spits.push({ x: c.x + (c.dir === 'right' ? 10 : -10), y: c.y, z: 26, tgt, t: 1.2 }); }
          }
          break;
        }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-60, 60); c.ty = c.hy + rr(-40, 40); c.wait = rr(2, 5); }
        if (c.tx && critterMove(c, c.tx, c.ty, 20, dt)) c.tx = null;
        break;
      }
    }
  }
  function stoatDrop(c, scared) {
    if (c.carry) {
      const it = c.carry; c.carry = null;
      Object.assign(it, { held: false, heldBy: null, x: c.x, y: c.y, z: 4, air: true, vz: 40, vx: rr(-30, 30), vy: rr(-10, 10), ghost: true });
      if (scared) completeTask('stoat');
    }
    c.state = 'flee'; c.path = null; c.bubble = { text: 'Chk!', t: 0.7 };
  }
  function sleighSpook(c) {
    c.spook = 1.2; c.bubble = { text: 'Snort!', t: 0.8 }; sfx('jingle'); sfx('jingle');
    if (c.presents > 0) {
      c.presents--;
      const it = addItem('present', c.x - (c.vx > 0 ? 20 : -20), c.y);
      Object.assign(it, { air: true, z: 14, vz: 90, vx: rr(-40, 40), vy: rr(20, 60), spin: rr(-6, 6), kicker: 'sleigh' });
    }
  }
  function snowScare(c, x, y, r) {
    const real = r < 9999;
    if (c.type === 'robin' && !(c.flyT > 0)) { c.flyT = 1.4; c.fa = Math.atan2(c.y - y, c.x - x) + rr(-0.6, 0.6); }
    if (c.type === 'stoat' && real && c.state !== 'lurk') stoatDrop(c, true);
    if (c.type === 'snowyowl' && real && !c.gone && Math.hypot(c.x - x, c.y - y) < 150) { c.gone = true; c.circleT = 0; c.bubble = { text: 'HOOO!', t: 1 }; sfx('hoot'); sfx('flutter'); completeTask('snowyowl'); }
    if (c.type === 'sleigh' && real && c.vx !== 0 && c.spook <= 0) sleighSpook(c);
    if (c.type === 'llama' && real) { c.annoy = 6; c.bubble = { text: 'HMMMPH!', t: 1 }; }
    if (c.type === 'duckling' && c.follow === 'player') { for (const d of critters) if (d.type === 'duckling') d.follow = 'mum'; }
    if (c.type === 'mamaduck' && real) { c.bubble = { text: 'QUACK!', t: 0.8 }; sfx('quack'); }
  }

  // --- Once a frame: weather extras, sledging, snowmen, Toby's snowballs, tortoise, spit --------
  function updateSnowWorld(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    // Blizzard: wind shoves you along, and drifts pile up over the paths
    if (L.weather === 'blizzard' && outside) {
      if (!collides(player.x + 22 * dt, player.y) && !player.hidden) player.x += 22 * dt;
      L.driftT = (L.driftT || 0) - dt;
      if (L.driftT <= 0 && L.drifts.length < 22) {
        L.driftT = 3;
        for (let n = 0; n < 20; n++) {
          const x = player.x + rr(-350, 350), y = player.y + rr(-250, 250), t0 = tileAt(x, y);
          if (areaOf(x, y) !== 0 || ![PATH, GRASS, STONE].includes(t0) || navBlockedPt(x, y) || L.drifts.some((d) => Math.hypot(d.x - x, d.y - y) < 60) || Math.hypot(x - player.x, y - player.y) < 60) continue;
          const o = makeDrift(x, y, rr(22, 32)); objects.push(o); L.drifts.push(o); hideBushes.push(o); break;
        }
      }
    }
    for (const d of L.drifts) d.grow = Math.min(1, d.grow + dt * 0.15);
    // Snowflakes on your tongue: stand still, face up
    if (snowing() && outside && player.dir === 'up' && (player.idleT || 0) > 1.5 && !player.held) {
      if (!player.tongueDone) { player.tongueDone = true; player.bubble = { text: 'mmm, snow!', t: 1.4 }; completeTask('snowflake'); }
    } else if ((player.idleT || 0) < 0.2) player.tongueDone = false;
    // Roof snow: something thrown hard against the front of a house
    if (L.roofs) for (const it of items) {
      if (!it.air || Math.hypot(it.vx, it.vy) < 90) continue;
      L.houses.forEach((h, i) => { if (it.x > h.x * TILE && it.x < (h.x + h.w) * TILE && it.y > (h.y + h.h) * TILE - 4 && it.y < (h.y + h.h) * TILE + 10) roofHit(i); });
    }
    // Sledging
    if (player.sled) {
      if (onHill(player.x, player.y) && player.speed > 170) completeTask('sledge');
      if (player.speed > 110) for (const v of villagers) {
        if (areaOf(v.x, v.y) !== 0 || Math.hypot(v.x - player.x, v.y - player.y) > 16) continue;
        if (startleV(v, rpick(['WHOA!', 'Mind out!', 'Oof! A sledging raccoon!']), { state: 'sulk' })) { v.stateT = 2; sfx('thud'); completeTask('sledbump'); }
      }
      if (Math.random() < dt * player.speed * 0.15) particles.push({ kind: 'shard', col: '#f4f8fb', x: player.x + rr(-6, 6), y: player.y, z: 1, vx: rr(-20, 20), vy: -player.vy * 0.1, vz: rr(20, 50), life: 0.4, max: 0.4 });
    }
    // Build your own snowman: three snowballs dropped together
    if (isWinter()) {
      const balls = items.filter((it) => it.kind === 'snowball' && !it.held && !it.air && areaOf(it.x, it.y) === 0);
      for (const b of balls) {
        const near = balls.filter((o) => Math.hypot(o.x - b.x, o.y - b.y) < 26);
        if (near.length >= 3) {
          for (const o of near.slice(0, 3)) items.splice(items.indexOf(o), 1);
          const s = makeSnowman(b.x, b.y + 4); objects.push(s); solidObjects.push(s); L.extra.snowmen.push(s);
          sparkle(b.x, b.y, 20); sfx('happy'); player.bubble = { text: 'ta-da!', t: 1.4 };
          completeTask('buildsnowman');
          break;
        }
      }
    }
    // Snowball fights: Toby pelts you if he spots you
    const tb = VILLAGER.toby;
    if (tb && isWinter() && (tb.state === 'act' || tb.state === 'route') && areaOf(tb.x, tb.y) === 0 && outside && !player.hidden) {
      tb.snowCD = (tb.snowCD || 0) - dt;
      const d = Math.hypot(player.x - tb.x, player.y - tb.y);
      if (tb.snowCD <= 0 && d < 170 && d > 30 && canSeePlayer(tb)) {
        tb.snowCD = rr(2.2, 3.5);
        if (!tb.fightOn) { tb.fightOn = true; say(tb, 'SNOWBALL FIGHT!', 1.6); }
        const it = addItem('snowball', tb.x, tb.y - 2), tt = d / 230;
        Object.assign(it, { air: true, z: 14, vx: (player.x + player.vx * tt * 0.5 - tb.x) / tt, vy: (player.y + player.vy * tt * 0.5 - tb.y) / tt, vz: 760 * tt / 2 - 14 / tt, kicker: 'toby', fromToby: true });
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.fromToby || !it.air || Math.hypot(it.x - player.x, it.y - player.y) > 12 || it.z > 24) continue;
      items.splice(i, 1);
      for (let k = 0; k < 8; k++) particles.push({ kind: 'shard', col: '#f4f8fb', x: player.x, y: player.y, z: 12, vx: rr(-40, 40), vy: rr(-20, 20), vz: rr(30, 80), life: 0.5, max: 0.5 });
      sfx('splat'); player.bubble = { text: 'brrr!', t: 1 }; player.stun = Math.max(player.stun, 0.25);
    }
    // The tortoise plods about
    for (const it of items) {
      if (it.kind !== 'tortoise') continue;
      it.walking = false;
      if (it.held || it.air || it.floating) continue;
      it.tw = (it.tw || 0) - dt;
      if (it.tw <= 0) { it.tw = rr(3, 7); it.ta = Math.random() * Math.PI * 2; it.facing = Math.cos(it.ta) >= 0 ? 1 : -1; }
      const nx = it.x + Math.cos(it.ta) * 5 * dt, ny = it.y + Math.sin(it.ta) * 3 * dt;
      if (!itemBlocked(it, nx, ny) && tileAt(nx, ny) !== WATER) { it.x = nx; it.y = ny; it.walking = true; } else it.tw = 0;
    }
    // Llama spit in flight
    for (let i = L.spits.length - 1; i >= 0; i--) {
      const s = L.spits[i], tg = s.tgt;
      s.t -= dt;
      const dx = tg.x - s.x, dy = tg.y - s.y, d = Math.hypot(dx, dy);
      if (d > 1) { s.x += dx / d * Math.min(d, 240 * dt); s.y += dy / d * Math.min(d, 240 * dt); }
      s.z = Math.max(8, s.z - dt * 20);
      if (d < 8) {
        L.spits.splice(i, 1);
        for (let k = 0; k < 6; k++) particles.push({ kind: 'drop', x: tg.x, y: tg.y, z: 14, vx: rr(-30, 30), vy: rr(-15, 15), vz: rr(20, 60), life: 0.5, max: 0.5 });
        if (tg === player) { player.bubble = { text: 'Ew! Llama spit!', t: 1.4 }; player.stun = Math.max(player.stun, 0.3); completeTask('llama'); }
        else if (startleV(tg, rpick(['EUGH! Llama spit!', 'Disgusting!', 'In my hair?!']), { state: 'sulk' })) { tg.stateT = 2; completeTask('llamaspit'); }
        continue;
      }
      if (s.t <= 0) L.spits.splice(i, 1);
    }
  }
  function drawSpits(ctx) {
    if (!L || !L.spits) return;
    for (const s of L.spits) { ctx.fillStyle = 'rgba(220,235,210,0.9)'; circle(ctx, s.x, s.y - s.z, 2.2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(ctx, s.x - 0.6, s.y - s.z - 0.6, 0.8); }
  }
  // E by the sledge sits on it; E again climbs off
  function sledAction() {
    if (player.sled) {
      player.sled = false;
      const it = addItem('sled', player.x + 12, player.y + 4); it.touched = true;
      return true;
    }
    if (player.held || player.boat || !target || target.kind !== 'sled') return false;
    items.splice(items.indexOf(target), 1);
    Object.assign(player, { sled: true }); sfx('tap');
    player.bubble = { text: 'wheee?', t: 1 };
    return true;
  }
  function drawSledUnder(ctx, x, y) {
    ctx.save(); ctx.translate(x, y + 2);
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(11, 0); ctx.quadraticCurveTo(15, 0, 14, -5); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-12, -6, 22, 4);
    ctx.restore();
  }

  // --- Drawing the animals ---------------------------------------------------------------------
  function drawSnowAnimal(ctx, c, t) {
    ctx.save(); ctx.translate(c.x, c.y);
    const big = c.type === 'horse' || c.type === 'llama' || c.type === 'sleigh';
    if (c.type !== 'robin' && c.type !== 'snowyowl') { ctx.fillStyle = 'rgba(20,30,10,0.22)'; ellipse(ctx, 0, 0, big ? 16 : c.type === 'duckling' ? 3 : 7, big ? 4 : 2); }
    ctx.translate(0, -(c.z || 0));
    if (c.dir === 'left') ctx.scale(-1, 1);
    const step = c.moving ? Math.sin(c.walk * 2) * 2 : 0;
    switch (c.type) {
      case 'robin': {
        const flap = c.flyT > 0 ? Math.sin(c.walk) * 3 : 0;
        ctx.fillStyle = '#7a5a3a'; ellipse(ctx, 0, -3, 3.4, 3); if (flap) { poly(ctx, [[-1, -4], [-5, -7 - flap], [1, -3]]); ctx.fill(); }
        ctx.fillStyle = '#e8592a'; ellipse(ctx, 1.4, -2.6, 2, 2);
        ctx.fillStyle = '#7a5a3a'; poly(ctx, [[-3, -3], [-6, -5], [-5.5, -2]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 2, -4.4, 0.5); ctx.fillStyle = '#e8a33a'; poly(ctx, [[3.2, -3.8], [4.8, -3.4], [3.2, -3]]); ctx.fill();
        break;
      }
      case 'stoat': {
        ctx.fillStyle = '#f8f8f6';
        ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-3, -9 + step * 0.5, 3, -5); ctx.lineTo(3, -3); ctx.quadraticCurveTo(-3, -6, -9, -2); ctx.fill();
        ellipse(ctx, 5, -5.5, 3, 2.4);
        ctx.fillStyle = '#1d1d22'; poly(ctx, [[-9, -4], [-13, -5], [-12, -2], [-9, -2]]); ctx.fill(); // black-tipped tail
        circle(ctx, 6.5, -6, 0.6); circle(ctx, 8, -5.2, 0.6);
        break;
      }
      case 'snowyowl': {
        const flap = c.gone ? Math.sin(c.walk * 2) * 4 : 0;
        ctx.fillStyle = '#f8f8f6'; ellipse(ctx, 0, -7, 5.2, 6.8);
        if (c.gone) { poly(ctx, [[-3, -8], [-13, -12 - flap], [-3, -4]]); ctx.fill(); poly(ctx, [[3, -8], [13, -12 - flap], [3, -4]]); ctx.fill(); }
        ctx.fillStyle = '#1d1d22'; for (const [x, y] of [[-2, -5], [2, -4], [0, -7.5], [-2.5, -2.5], [2.5, -2]]) circle(ctx, x, y, 0.5);
        ctx.fillStyle = '#f2c14e'; circle(ctx, -2, -11, 1.7); circle(ctx, 2, -11, 1.7);
        ctx.fillStyle = '#1d1d22'; circle(ctx, -2, -11, 0.8); circle(ctx, 2, -11, 0.8);
        break;
      }
      case 'sleigh': {
        // the reindeer out in front, the sleigh full of presents behind
        ctx.fillStyle = '#7a5a3a';
        for (const lx of [10, 13, 20, 23]) ctx.fillRect(lx + (lx % 2 ? step : -step) * 0.5, -12, 1.8, 12);
        roundRect(ctx, 8, -19, 18, 8, 4, true);
        poly(ctx, [[22, -17], [26, -17], [29, -24], [26, -25]]); ctx.fill();
        roundRect(ctx, 26, -28, 8, 6, 2.5, true);
        ctx.fillStyle = '#e8453c'; circle(ctx, 34, -25, 1.6);
        ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(28, -28); ctx.lineTo(26, -34); ctx.lineTo(23, -36); ctx.moveTo(26, -34); ctx.lineTo(29, -37); ctx.moveTo(31, -28); ctx.lineTo(32, -34); ctx.lineTo(35, -36); ctx.stroke();
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, -15); ctx.lineTo(-2, -10); ctx.stroke();
        ctx.fillStyle = '#f2c14e'; circle(ctx, 14, -14, 1.2); // bell
        ctx.strokeStyle = '#c9a33a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-2, 0); ctx.quadraticCurveTo(3, 0, 2, -5); ctx.stroke();
        ctx.fillStyle = '#c0392b'; poly(ctx, [[-30, -4], [-2, -4], [0, -14], [-26, -14], [-30, -20]]); ctx.fill();
        const cols = ['#3f7f6a', '#4f6fa8', '#f2c14e', '#7a4f8f'];
        for (let k = 0; k < c.presents; k++) { ctx.fillStyle = cols[k % 4]; ctx.fillRect(-26 + k * 6, -22 - (k % 2) * 3, 6, 7); ctx.fillStyle = '#ffffff'; ctx.fillRect(-23.5 + k * 6, -22 - (k % 2) * 3, 1, 7); }
        break;
      }
      case 'horse': {
        const kick = c.kick > 0 ? -6 : 0;
        ctx.fillStyle = '#c98a4a';
        ctx.fillRect(-10 + (kick ? 0 : step * 0.5), -14, 2.6, 14 + (kick ? -4 : 0));
        ctx.save(); if (kick) { ctx.translate(-8, -12); ctx.rotate(0.9); ctx.translate(8, 12); } ctx.fillRect(-7, -14, 2.6, 14); ctx.restore();
        ctx.fillRect(6 - step * 0.5, -14, 2.6, 14); ctx.fillRect(9 + step * 0.5, -14, 2.6, 14);
        roundRect(ctx, -12, -24, 25, 11, 5, true);
        poly(ctx, [[8, -22], [13, -22], [18, -33], [13, -34]]); ctx.fill();
        roundRect(ctx, 14, -36, 10, 6, 2.5, true);
        ctx.fillStyle = '#3a2418'; ctx.fillRect(9, -33, 3, 10); // mane
        ctx.beginPath(); ctx.moveTo(-12, -21); ctx.quadraticCurveTo(-18, -16, -16, -8 + Math.sin(c.ph * 2)); ctx.lineWidth = 2.4; ctx.strokeStyle = '#3a2418'; ctx.stroke();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 18, -34, 0.8);
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(21, -35, 2, 4);
        break;
      }
      case 'mamaduck': case 'duckling': {
        const s = c.type === 'duckling' ? 0.55 : 1, bob = c.moving ? Math.abs(Math.sin(c.walk * 2)) : 0;
        ctx.scale(s, s); ctx.translate(0, -bob);
        ctx.fillStyle = c.type === 'duckling' ? '#f7d74a' : '#a08060'; ellipse(ctx, 0, -4, 6, 4);
        ctx.fillStyle = c.type === 'duckling' ? '#f7d74a' : '#8a6a4a'; circle(ctx, 5, -8, 3.2);
        ctx.fillStyle = '#e8a33a'; poly(ctx, [[7.5, -8.5], [11, -7.6], [7.5, -6.6]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 6, -9, 0.7);
        break;
      }
      case 'llama': {
        ctx.fillStyle = '#efe3cf';
        for (const lx of [-7, -4, 5, 8]) ctx.fillRect(lx + (lx < 0 ? step : -step) * 0.4, -12, 2.2, 12);
        roundRect(ctx, -10, -21, 21, 10, 5, true);
        roundRect(ctx, 7, -38, 6, 19, 3, true);
        roundRect(ctx, 8, -42, 9, 7, 3, true);
        poly(ctx, [[8.5, -42], [8, -47], [10.5, -42]]); ctx.fill(); poly(ctx, [[12, -42], [12, -47], [14, -42]]); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(-3, -21, 8, 4); // a little blanket
        ctx.fillStyle = '#1d1d22'; circle(ctx, 14, -40, 0.8);
        if (c.annoy > 0) { ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(12.5, -42); ctx.lineTo(15.5, -41); ctx.stroke(); }
        break;
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Castle and forest villages, shops to sneak into, and mini-games:
  // hide-and-seek with Toby, a race against Biscuit, and a museum heist.
  // ---------------------------------------------------------------------------
  Object.assign(ITEM, {
    chest: { name: 'treasure chest', h: 16, r: 10, heavy: true, draw(c) {
      c.fillStyle = '#7a4f2a'; roundRect(c, -10, -12, 20, 12, 2, true);
      c.fillStyle = '#8a5a30'; c.beginPath(); c.ellipse(0, -12, 10, 4, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#c9a33a'; c.fillRect(-10, -9, 20, 1.6); c.fillRect(-1.5, -14, 3, 7);
      c.fillStyle = '#f2c14e'; circle(c, -5, -14.5, 1.4); circle(c, 4, -15, 1.2);
    } },
    crown: { name: 'crown', h: 10, r: 5, draw(c) {
      c.fillStyle = '#f2c14e'; poly(c, [[-6, 0], [6, 0], [7, -8], [3.5, -4], [0, -9], [-3.5, -4], [-7, -8]]); c.fill();
      c.fillStyle = '#e8453c'; circle(c, 0, -3, 1.4); c.fillStyle = '#4f93c7'; circle(c, -4, -2.5, 1); circle(c, 4, -2.5, 1);
    } },
    gem: { name: 'giant gem', h: 9, r: 5, draw(c) {
      c.fillStyle = '#5ac8d8'; poly(c, [[-5, -5], [-2.5, -8], [2.5, -8], [5, -5], [0, 1]]); c.fill();
      c.fillStyle = '#b8f0f8'; poly(c, [[-2.5, -8], [0, -5], [-5, -5]]); c.fill();
    } },
    goldvase: { name: 'golden vase', h: 14, r: 5, fragile: true, draw(c) {
      c.fillStyle = '#d9a43a'; c.beginPath(); c.moveTo(-3, -14); c.quadraticCurveTo(-8, -6, -3, 0); c.lineTo(3, 0); c.quadraticCurveTo(8, -6, 3, -14); c.fill();
      c.fillStyle = '#f2d06a'; c.fillRect(-1.5, -12, 1.5, 9);
    } },
    sweets: { name: 'bag of sweets', h: 9, r: 4, draw(c) {
      c.fillStyle = '#f2b8c6'; poly(c, [[-4, 0], [4, 0], [3, -7], [-3, -7]]); c.fill();
      c.fillStyle = '#e8453c'; c.fillRect(-3, -8.5, 6, 1.6);
      for (const [x, y, col] of [[-1.5, -3, '#4f93c7'], [1.5, -4.5, '#ffd166'], [0, -2, '#8fd16a']]) { c.fillStyle = col; circle(c, x, y, 1.1); }
    } },
    lolly: { name: 'lollipop', h: 13, r: 3, draw(c) {
      c.fillStyle = '#f4f2ee'; c.fillRect(-0.5, -7, 1, 7);
      c.fillStyle = '#e8453c'; circle(c, 0, -10, 3.5); c.strokeStyle = '#ffffff'; c.lineWidth = 0.9; c.beginPath(); c.arc(0, -10, 2, 0, Math.PI * 1.5); c.stroke();
    } },
    letters: { name: 'sack of letters', h: 12, r: 6, draw(c) {
      c.fillStyle = '#a0703f'; roundRect(c, -6, -11, 12, 11, 4, true);
      c.fillStyle = '#f4f2ee'; c.fillRect(-4, -14, 5, 4); c.fillRect(0, -13, 5, 3.5);
      c.fillStyle = '#c0392b'; c.fillRect(-1, -13.5, 1.4, 1.4);
    } },
    mushroom: { name: 'mushroom', h: 7, r: 3, draw(c) {
      c.fillStyle = '#efe3cf'; c.fillRect(-1.2, -4, 2.4, 4);
      c.fillStyle = '#c0392b'; c.beginPath(); c.ellipse(0, -4, 4, 3, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#ffffff'; circle(c, -1.5, -5, 0.7); circle(c, 1.4, -5.6, 0.6);
    } },
    log: { name: 'log', h: 9, r: 9, heavy: true, draw(c) {
      c.fillStyle = '#7a5230'; roundRect(c, -10, -9, 20, 9, 4, true);
      c.fillStyle = '#c9a26a'; ellipse(c, 9, -4.5, 2.5, 4.3); c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.6; c.beginPath(); c.ellipse(9, -4.5, 1.2, 2.2, 0, 0, Math.PI * 2); c.stroke();
    } },
  });
  Object.assign(FOOD, { sweets: { bites: 2, fill: 12, sweet: true }, lolly: { bites: 2, fill: 8, sweet: true }, mushroom: { bites: 1, fill: 8 } });

  // --- Castle -----------------------------------------------------------------------------
  function makeCastleWall(tx, ty, tower, ruined) {
    const x = tx * TILE, y = ty * TILE, h = tower ? 70 : ruined ? 18 : 46;
    return {
      kind: 'castlewall', x: x + TILE / 2, y: y + TILE, hitbox: box(x, y + 4, TILE, TILE - 4),
      bounds: { l: x - 8, r: x + TILE + 8, t: y + TILE - h - 20, b: y + TILE + 2 },
      draw(ctx) {
        const base = y + TILE, w = tower ? TILE + 10 : TILE, x0 = tower ? x - 5 : x;
        ctx.fillStyle = '#9a958a'; ctx.fillRect(x0, base - h, w, h);
        ctx.fillStyle = '#b5b0a4'; ctx.fillRect(x0, base - h, w, 5);
        ctx.strokeStyle = 'rgba(70,60,50,0.35)'; ctx.lineWidth = 1;
        for (let yy = base - h + 8; yy < base; yy += 8) { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke(); for (let xx = x0 + ((yy / 8) % 2 ? 6 : 12); xx < x0 + w; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, yy - 8); ctx.lineTo(xx, yy); ctx.stroke(); } }
        if (!ruined) { ctx.fillStyle = '#9a958a'; for (let k = 0; k < (tower ? 4 : 3); k++) ctx.fillRect(x0 + k * (w / (tower ? 4 : 3)) + 1, base - h - 7, w / (tower ? 8 : 6), 7); }
        if (ruined) { ctx.fillStyle = '#7fb350'; circle(ctx, x + 6, base - h + 1, 3); circle(ctx, x + 22, base - h + 2, 2.4); }
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; ctx.fillRect(x0, base - h - (ruined ? 0 : 3), w, 3); }
        if (tower) { ctx.fillStyle = '#3a3530'; roundRect(ctx, x0 + w / 2 - 3, base - h + 18, 6, 12, 3, true); }
      },
    };
  }
  function makeBellTower(x, y) {
    return {
      kind: 'belltower', x, y, hitbox: box(x - 14, y - 12, 28, 13), bounds: { l: x - 24, r: x + 24, t: y - 130, b: y + 4 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 10, y, 22, 6); },
      draw(ctx, t) {
        ctx.fillStyle = '#a8a396'; ctx.fillRect(x - 14, y - 100, 28, 100);
        ctx.fillStyle = '#3a3530'; ctx.fillRect(x - 9, y - 92, 18, 22);
        const sw = L.bellT > 0 ? Math.sin(t * 14) * 0.5 * L.bellT : 0;
        ctx.save(); ctx.translate(x, y - 90); ctx.rotate(sw);
        ctx.fillStyle = '#d9a43a'; poly(ctx, [[-6, 14], [6, 14], [4, 2], [-4, 2]]); ctx.fill(); circle(ctx, 0, 2, 4);
        ctx.restore();
        ctx.fillStyle = '#7a4f3a'; poly(ctx, [[x - 18, y - 100], [x + 18, y - 100], [x, y - 126]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - 10, y - 108], [x + 10, y - 108], [x, y - 126]]); ctx.fill(); }
        ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 2, y - 76); ctx.lineTo(x + 2 + sw * 6, y + 6); ctx.stroke(); // the bell rope
        ctx.fillStyle = '#c9a26a'; circle(ctx, x + 2 + sw * 6, y + 7, 1.8);
      },
    };
  }
  function makeArmour(x, y) {
    const o = {
      kind: 'armour', x, y, r: 12, hitbox: null, rustle: 0,
      bounds: { l: x - 14, r: x + 14, t: y - 50, b: y + 4 },
      contains(px, py) { return Math.abs(px - x) < 9 && py > y - 9 && py < y + 4; },
      draw(ctx, t) {
        const shake = o.rustle > 0 ? Math.sin(t * 40) * 1 : 0;
        ctx.save(); ctx.translate(x + shake, y);
        ctx.fillStyle = '#5a5a60'; ctx.fillRect(-8, -3, 16, 3);
        ctx.fillStyle = '#b8bcc4'; ctx.fillRect(-5, -16, 4, 13); ctx.fillRect(1, -16, 4, 13);
        roundRect(ctx, -7, -32, 14, 17, 4, true);
        ctx.fillStyle = '#9aa0aa'; ctx.fillRect(-7, -24, 14, 2);
        ctx.fillStyle = '#b8bcc4'; roundRect(ctx, -5, -43, 10, 11, 4, true);
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(-4, -39, 8, 1.8);
        ctx.fillStyle = '#c0392b'; poly(ctx, [[0, -43], [4, -50], [1, -43]]); ctx.fill();
        if (player.hidden && player.hidingIn === o) { ctx.fillStyle = '#ffffff'; circle(ctx, -2, -38, 1); circle(ctx, 2, -38, 1); }
        ctx.restore();
      },
    };
    return o;
  }
  // Built before the houses (needs room): moat, drawbridge, walls, towers, bell tower, armour
  function buildCastle(markSolid, place) {
    const r = place(15, 14);
    if (!r) return;
    const ox = r.x + 1, oy = r.y + 1, W = 13, H = 12, ix = ox + 2, iy = oy + 2, iw = 9, ih = 8;
    const pcx = L.plaza.x + 6, pcy = L.plaza.y + 6, ccx = ox + W / 2, ccy = oy + H / 2;
    const side = Math.abs(pcx - ccx) > Math.abs(pcy - ccy) ? (pcx > ccx ? 'E' : 'W') : (pcy > ccy ? 'S' : 'N');
    for (let y = oy; y < oy + H; y++) for (let x = ox; x < ox + W; x++) {
      const inner = x >= ix && x < ix + iw && y >= iy && y < iy + ih;
      setT(x, y, inner ? STONE : WATER);
    }
    // drawbridge + gate
    let gate = [], out;
    if (side === 'N' || side === 'S') {
      const gx = ix + 3, wy = side === 'N' ? iy : iy + ih - 1;
      for (const x of [gx, gx + 1]) { for (const y of side === 'N' ? [oy, oy + 1] : [oy + H - 2, oy + H - 1]) setT(x, y, BRIDGE); gate.push([x, wy]); }
      out = [gx, side === 'N' ? oy - 1 : oy + H];
    } else {
      const gy = iy + 3, wx = side === 'W' ? ix : ix + iw - 1;
      for (const y of [gy, gy + 1]) { for (const x of side === 'W' ? [ox, ox + 1] : [ox + W - 2, ox + W - 1]) setT(x, y, BRIDGE); gate.push([wx, y]); }
      out = [side === 'W' ? ox - 1 : ox + W, gy];
    }
    const isGate = (x, y) => gate.some(([gx, gy]) => gx === x && gy === y);
    const walls = [];
    for (let x = ix; x < ix + iw; x++) for (let y = iy; y < iy + ih; y++) {
      if (x !== ix && x !== ix + iw - 1 && y !== iy && y !== iy + ih - 1) continue;
      if (isGate(x, y)) continue;
      const corner = (x === ix || x === ix + iw - 1) && (y === iy || y === iy + ih - 1);
      walls.push([x, y, corner]);
    }
    const ruinable = walls.filter((w) => !w[2]);
    const ruins = new Set([pick(ruinable), pick(ruinable)].map((w) => w[0] + ',' + w[1]));
    L.castle = { ox, oy, W, H, ix, iy, iw, ih, side, out, walls, ruins };
    reserve(r.x, r.y, 15, 14);
    markSolid(ox, oy, W, H);
  }
  function placeCastleObjects() {
    const C = L.castle;
    if (!C) return;
    const T = TILE;
    for (const [x, y, corner] of C.walls) objects.push(makeCastleWall(x, y, corner, C.ruins.has(x + ',' + y)));
    // bell tower in the corner furthest from the gate, armour along the inside walls
    const bx = C.side === 'E' ? C.ix + 1.5 : C.ix + C.iw - 1.5, by = C.side === 'N' ? C.iy + C.ih - 2.6 : C.iy + 1.7;
    L.bell = { x: bx * T, y: by * T, rope: { x: bx * T + 2, y: by * T + 12 } };
    objects.push(makeBellTower(L.bell.x, L.bell.y));
    const ax = C.side === 'E' ? C.ix + C.iw - 1.6 : C.ix + 1.6;
    for (const k of [0, 1]) objects.push(makeArmour(ax * T, (C.iy + 2.2 + k * 2.6) * T));
    L.castleChest = { x: (C.ix + C.iw / 2) * T, y: (C.iy + C.ih / 2 + 0.3) * T };
  }

  const leafCol = (k) => (look().trees ? look().trees[0][k] : ['#2f5a3a', '#3a6a4a', '#5a8a6a'][k]);
  // --- Forest -----------------------------------------------------------------------------
  function makeTreehouse(x, y, label) {
    return {
      kind: 'treehouse', x, y, hitbox: box(x - 9, y - 7, 18, 8), bounds: { l: x - 60, r: x + 60, t: y - 140, b: y + 20 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 10, y, 50, 12); },
      draw(ctx, t) {
        const P = y - 54;
        const lk = look();
        ctx.fillStyle = leafCol(0); circle(ctx, x - 26, P - 40, 26); circle(ctx, x + 28, P - 38, 24); circle(ctx, x, P - 58, 30);
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 8, P, 16, 54);
        ctx.fillStyle = '#a0703f'; ctx.fillRect(x - 32, P - 2, 64, 7); // platform
        ctx.fillStyle = '#c08a52'; ctx.fillRect(x - 18, P - 28, 36, 26);
        ctx.fillStyle = '#7a4f3a'; poly(ctx, [[x - 23, P - 26], [x + 23, P - 26], [x, P - 44]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - 14, P - 33], [x + 14, P - 33], [x, P - 44]]); ctx.fill(); }
        ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 5, P - 18, 10, 16);
        ctx.fillStyle = duskK > 0.35 ? '#ffd98a' : '#9fd3e8'; ctx.fillRect(x + 8, P - 22, 7, 7);
        ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 1.4; // ladder
        ctx.beginPath(); ctx.moveTo(x - 4, P + 5); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, P + 5); ctx.lineTo(x + 4, y); ctx.stroke();
        for (let yy = P + 10; yy < y; yy += 7) { ctx.beginPath(); ctx.moveTo(x - 4, yy); ctx.lineTo(x + 4, yy); ctx.stroke(); }
        ctx.fillStyle = leafCol(2); circle(ctx, x - 34, P - 20, 14); circle(ctx, x + 36, P - 16, 12);
      },
    };
  }
  function makeRopeBridge(ax, bx, y) {
    const P = y - 54;
    return {
      kind: 'ropebridge', x: (ax + bx) / 2, y: y - 0.5, bounds: { l: ax, r: bx, t: P - 20, b: P + 20 },
      draw(ctx) {
        const x0 = ax + 30, x1 = bx - 30, sag = 10;
        const yAt = (u) => P + 2 + Math.sin(u * Math.PI) * sag;
        ctx.fillStyle = '#a0703f';
        for (let u = 0; u <= 1.0001; u += 0.06) { const xx = x0 + (x1 - x0) * u; ctx.fillRect(xx - 2.5, yAt(u) - 1, 5, 4); }
        ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 1.2;
        for (const off of [-12, -6]) { ctx.beginPath(); for (let u = 0; u <= 1.0001; u += 0.05) { const xx = x0 + (x1 - x0) * u, yy = yAt(u) + off + Math.sin(u * Math.PI) * 2; if (u === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke(); }
      },
    };
  }
  function makeHollowTree(x, y) {
    const o = {
      kind: 'hollowtree', x, y, r: 16, hitbox: null, rustle: 0,
      bounds: { l: x - 34, r: x + 34, t: y - 90, b: y + 6 },
      contains(px, py) { return Math.abs(px - x) < 10 && py > y - 8 && py < y + 3; },
      draw(ctx) {
        const lk = look();
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 17, y - 50, 34, 50);
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 13, y - 50, 4, 50); ctx.fillRect(x + 6, y - 50, 3, 50);
        ctx.fillStyle = '#1d140c'; roundRect(ctx, x - 9, y - 28, 18, 28, 9, true);
        ctx.fillStyle = leafCol(1); circle(ctx, x - 14, y - 60, 20); circle(ctx, x + 14, y - 62, 18); circle(ctx, x, y - 76, 22);
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; ellipse(ctx, x, y - 92, 16, 5); }
        if (player.hidden && player.hidingIn === o) { ctx.fillStyle = '#ffffff'; circle(ctx, x - 3, y - 14, 1.6); circle(ctx, x + 3, y - 14, 1.6); ctx.fillStyle = NOSE; circle(ctx, x - 3, y - 14, 0.8); circle(ctx, x + 3, y - 14, 0.8); }
      },
    };
    return o;
  }
  function makeLogPile(x, y) {
    const S = { x, y, rolled: false };
    L.logpile = S;
    return {
      kind: 'logpile', x, y, hitbox: box(x - 22, y - 10, 44, 11), bounds: { l: x - 40, r: x + 40, t: y - 40, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 4, y, 28, 6); },
      draw(ctx) {
        const rows = S.rolled ? [[0, 1]] : [[0, 3], [1, 2], [2, 1]];
        for (const [row, n] of rows) for (let k = 0; k < n; k++) {
          const lx = x - (n - 1) * 9 + k * 18, ly = y - 6 - row * 11;
          ctx.fillStyle = '#7a5230'; ellipse(ctx, lx, ly, 9, 6);
          ctx.fillStyle = '#c9a26a'; ellipse(ctx, lx, ly, 6.5, 4.5); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(lx, ly, 3, 2, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x + 30, y - 12, 14, 12); // chopping block
        ctx.fillStyle = '#c9a26a'; ellipse(ctx, x + 37, y - 12, 7, 2.5);
      },
    };
  }
  function makeFairyRing(x, y) {
    const spots = Array.from({ length: 11 }, (_, k) => { const a = (k / 11) * Math.PI * 2; return [x + Math.cos(a) * 26, y + Math.sin(a) * 13]; });
    return {
      kind: 'fairyring', x, y: y - 14, bounds: { l: x - 34, r: x + 34, t: y - 22, b: y + 20 },
      draw(ctx, t) {
        for (const [mx, my] of spots) {
          ctx.fillStyle = '#efe3cf'; ctx.fillRect(mx - 1, my - 3, 2, 3);
          ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(mx, my - 3, 3, 2.2, 0, Math.PI, 0); ctx.fill();
        }
        if (duskK > 0.3) for (let k = 0; k < 4; k++) { ctx.fillStyle = `rgba(200,255,220,${0.4 + Math.sin(t * 3 + k) * 0.3})`; circle(ctx, x + Math.cos(t + k * 1.6) * 18, y - 10 + Math.sin(t * 1.3 + k) * 6, 1.2); }
      },
    };
  }
  function buildForest(markSolid, place) {
    const T = TILE;
    const r = place(14, 6);
    if (r) {
      const A = { x: (r.x + 2.5) * T, y: (r.y + 4.6) * T }, B = { x: (r.x + 11.5) * T, y: (r.y + 4.6) * T };
      L.treehouses = [A, B];
      markSolid(r.x + 2, r.y + 4, 1, 1); markSolid(r.x + 11, r.y + 4, 1, 1);
    }
  }
  function placeForestObjects() {
    if (L.kind !== 'forest') return;
    const T = TILE;
    if (L.treehouses) {
      const [A, B] = L.treehouses;
      objects.push(makeTreehouse(A.x, A.y)); objects.push(makeTreehouse(B.x, B.y)); objects.push(makeRopeBridge(A.x, B.x, A.y));
    }
    const h = freeSpotNear(L.plaza.x + rr(-8, 20), L.plaza.y + rr(-8, 20), 2, 1, 8) || randomFreeSpot(2, 1);
    if (h) { const o = makeHollowTree((h[0] + 1) * T, (h[1] + 0.8) * T); objects.push(o); L.hollow = o; }
    const g = L.garden, lp = freeSpotNear(g.x + g.w + 2, g.y + g.h - 2, 3, 1, 5) || randomFreeSpot(3, 1);
    if (lp) objects.push(makeLogPile((lp[0] + 1.2) * T, (lp[1] + 0.8) * T));
    L.rings = [];
    for (let k = 0; k < 2; k++) { const s = randomFreeSpot(2, 2); if (s) { const R = { x: (s[0] + 1) * T, y: (s[1] + 1.2) * T }; L.rings.push(R); objects.push(makeFairyRing(R.x, R.y)); } }
  }
  function rollLogs() {
    const S = L.logpile;
    if (!S || S.rolled) return;
    S.rolled = true; sfx('thud'); sfx('crash'); run.shake = Math.max(run.shake, 0.25);
    for (let k = 0; k < 4; k++) { const it = addItem('log', S.x + rr(-14, 14), S.y + 10); Object.assign(it, { air: true, z: 10, vz: rr(40, 90), vx: rr(-140, 140), vy: rr(30, 110), kicker: 'logs', owner: 'bertram' }); it.owner = 'bertram'; }
    lookTowards(S.x, S.y, 300, () => rpick(['My woodpile!', 'TIMBER?!', 'Who knocked that over?']));
    completeTask('logs');
  }
  // Up in the treehouses: E at a ladder climbs up, left/right crosses the rope bridge, E climbs down
  function treeAction() {
    if (!L.treehouses) return false;
    const [A, B] = L.treehouses;
    if (player.tree) {
      const t = player.tree.t;
      if (t > 0.15 && t < 0.85) { player.bubble = { text: 'not from up here!', t: 1 }; return true; }
      const P = t < 0.5 ? A : B;
      player.tree = null;
      Object.assign(player, { x: P.x, y: P.y + 14, vx: 0, vy: 0, dir: 'down' });
      sfx('tap');
      return true;
    }
    if (player.held && player.held.type.heavy) return false;
    for (const [P, t] of [[A, 0], [B, 1]]) {
      if (Math.hypot(player.x - P.x, player.y - (P.y + 12)) < 22) {
        player.tree = { t, from: t };
        Object.assign(player, { x: P.x, y: P.y + 1, vx: 0, vy: 0 });
        sfx('creak'); completeTask('treehouse');
        return true;
      }
    }
    return false;
  }
  const ladderNear = () => !player.tree && L && L.treehouses && L.treehouses.some((P) => Math.hypot(player.x - P.x, player.y - (P.y + 12)) < 22);
  function updateTree(dt, input) {
    const [A, B] = L.treehouses, span = B.x - A.x;
    const ix = player.stun > 0 ? 0 : input.x;
    const prev = player.tree.t;
    player.tree.t = clamp(prev + ix * 70 * dt / span, 0, 1);
    player.x = A.x + span * player.tree.t; player.y = A.y + 1;
    player.speed = Math.abs(ix) > 0.1 && player.tree.t !== prev ? 70 : 0;
    if (Math.abs(ix) > 0.1) { player.dir = ix > 0 ? 'right' : 'left'; player.walk += dt * 8; }
    player.vx = player.vy = 0;
    const T0 = player.tree;
    if ((T0.from === 0 && T0.t > 0.9) || (T0.from === 1 && T0.t < 0.1)) { completeTask('ropebridge'); T0.from = T0.t > 0.5 ? 1 : 0; }
    if (player.bubble) { player.bubble.t -= dt; if (player.bubble.t <= 0) player.bubble = null; }
  }
  // Throwing from up high just drops it straight down
  function dropFromTree() {
    const it = player.held;
    if (!it) return;
    player.held = null;
    Object.assign(it, { held: false, heldBy: null, x: player.x, y: player.y + 2, z: 50, vx: 0, vy: 0, vz: 0, air: true, kicker: null, fromTree: true });
    sfx('throw');
  }

  // --- Shops -------------------------------------------------------------------------------------
  const SHOPS = { rosa: { kind: 'bakery', label: 'BAKERY', col: '#c0392b', goods: ['bread', 'cookies', 'pie'] }, mabel: { kind: 'sweets', label: 'SWEET SHOP', col: '#d94f7a', goods: ['sweets', 'lolly', 'sweets', 'lolly'] }, percy: { kind: 'post', label: 'POST OFFICE', col: '#c0392b', goods: ['letters', 'parcel', 'parcel'] } };
  function shopOf(h) {
    if (!L.shopHouses) {
      L.shopHouses = new Map();
      for (const id of ['rosa', 'mabel', 'percy']) { const hh = L.houses[L.homes[id]]; if (hh && L.houses.indexOf(hh) < Math.floor(MW / ROOM_STRIDE) && !L.shopHouses.has(hh)) L.shopHouses.set(hh, { ...SHOPS[id], owner: id }); }
    }
    return L.shopHouses.get(h) || null;
  }
  function makeShopCounter(x, y, col) {
    return {
      kind: 'counter', x, y, hitbox: box(x - 46, y - 10, 92, 11), bounds: { l: x - 52, r: x + 52, t: y - 34, b: y + 4 },
      draw(ctx) {
        ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 48, y - 22, 96, 22);
        ctx.fillStyle = '#a0703f'; ctx.fillRect(x - 50, y - 25, 100, 5);
        ctx.fillStyle = col; ctx.fillRect(x - 48, y - 15, 96, 4);
        ctx.fillStyle = '#c9a33a'; roundRect(ctx, x + 30, y - 31, 12, 7, 2, true); // the till
      },
    };
  }
  function makeShopFront(h, S) {
    const X = h.x * TILE, W = h.w * TILE, by = (h.y + h.h) * TILE, dx = (h.doorX + 0.5) * TILE;
    return {
      kind: 'shopfront', x: X + W / 2, y: by + 0.8, bounds: { l: X - 10, r: X + W + 10, t: by - 90, b: by + 6 },
      draw(ctx, t) {
        const top = by - TILE * 1.7 - 2;
        for (let k = 0; k < Math.floor(W / 12); k++) { ctx.fillStyle = k % 2 ? '#f4f2ee' : S.col; ctx.fillRect(X + k * 12, top, 12, 7); }
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, dx - 34, top - 16, 68, 13, 3, true);
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.2; ctx.strokeRect(dx - 34, top - 16, 68, 13);
        ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 7.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(S.label, dx, top - 6.5);
        ctx.fillStyle = '#d9a43a'; circle(ctx, dx + 14, by - 40, 2.4); // the doorbell
      },
    };
  }

  // --- Mini-games -------------------------------------------------------------------------------
  // Race against Biscuit along the road, from the RACE banner to the FINISH banner
  function makeBanner(x, y, label, chequer) {
    return {
      kind: 'banner', x, y: y + 2 * TILE + 8, bounds: { l: x - 30, r: x + 30, t: y - 60, b: y + 2 * TILE + 10 },
      draw(ctx) {
        const yb = y + 2 * TILE + 6;
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 2, y - 50, 3, yb - y + 50); // one pole each side of the road
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 2, y - 50, 3, 4);
        ctx.fillStyle = chequer ? '#ffffff' : '#e8453c'; ctx.fillRect(x - 3, y - 48, 6, 2 * TILE + 8);
        if (chequer) { ctx.fillStyle = '#1d1d22'; for (let k = 0; k < 18; k++) if (k % 2) ctx.fillRect(x - 3 + (k % 4 > 1 ? 3 : 0), y - 48 + k * 4, 3, 4); }
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x - 22, y - 62, 44, 13, 3, true);
        ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - 52.5);
      },
    };
  }
  function placeRace() {
    const T = TILE, P = L.plaza;
    let sx = 0, fx = 0, west = false, ok = false;
    for (const w of P.x > MW / 2 ? [true, false] : [false, true]) {
      sx = w ? P.x - 2 : P.x + P.w + 2; fx = w ? sx - 18 : sx + 18; west = w;
      if (fx < 7 || fx > MW - 7) continue;
      ok = true;
      for (let x = Math.min(sx, fx); x <= Math.max(sx, fx); x++) { const t0 = getT(x, L.roadY); if (t0 !== PATH && t0 !== BRIDGE && t0 !== STONE) { ok = false; break; } }
      if (ok) break;
    }
    if (!ok) return;
    L.race = { sx: (sx + 0.5) * T, fx: (fx + 0.5) * T, y: (L.roadY + 1) * T, dir: west ? -1 : 1, state: null, t: 0 };
    objects.push(makeBanner(L.race.sx, L.roadY * T - 2, 'RACE', false));
    objects.push(makeBanner(L.race.fx, L.roadY * T - 2, 'FINISH', true));
  }
  function updateRace(dt) {
    const R = L.race;
    if (!R || !dog) return;
    const onStart = areaOf(player.x, player.y) === 0 && Math.abs(player.x - R.sx) < 18 && player.y > R.y - TILE - 4 && player.y < R.y + TILE + 6;
    if (!R.state) {
      R.cd = Math.max(0, (R.cd || 0) - dt);
      if (onStart && player.speed < 20 && R.cd <= 0 && !player.held) {
        R.state = 'count'; R.t = 3.2; dog.race = true; dog.x = R.sx; dog.y = R.y + 14; dog.path = null; dogSay('Woof! (race?)', 1.6);
        player.bubble = { text: 'ready...', t: 1 };
      }
      return;
    }
    if (R.state === 'count') {
      R.t -= dt;
      const n = Math.ceil(R.t - 0.2);
      if (n !== R.lastN) { R.lastN = n; if (n > 0) { toast(String(n), 'Race!', true); sfx('tap'); } }
      if ((player.x - R.sx) * R.dir > 14) { R.state = null; R.cd = 2; dog.race = false; toast('False start!', 'Race', true); return; }
      if (!onStart && Math.abs(player.x - R.sx) > 30) { R.state = null; dog.race = false; return; }
      if (R.t <= 0.2) { R.state = 'go'; toast('GO!', 'Race!', true); sfx('ding'); dogSay('WOOF!', 1); }
      return;
    }
    // racing: Biscuit gallops along the road
    moveToward(dog, R.fx + R.dir * 10, R.y + 14, 140, dt);
    dog.moving = true;
    const pDone = (player.x - R.fx) * R.dir > 0, dDone = (dog.x - R.fx) * R.dir > 0;
    if (pDone || dDone) {
      if (pDone && !dDone) { toast('You beat Biscuit!', 'Race', true); dogSay('Woof?!', 1.4); completeTask('race'); }
      else { toast('Biscuit wins!', 'Race', true); dogSay('Woof woof! ♥', 1.4); }
      R.state = null; R.cd = 5; dog.race = false; dog.state = 'sit'; dog.t = 2;
    }
  }
  // Hide-and-seek with Toby: get near him and he starts counting; stay hidden until he gives up
  function hideSeekStart(v) {
    v.state = 'game'; v.game = { phase: 'count', t: 8, n: 0 }; v.path = null;
    say(v, 'Hide and seek! I’ll count to 10!', 2);
  }
  function hideSeek(v, dt) {
    const g = v.game;
    g.t -= dt;
    if (g.phase === 'count') {
      v.dir = 'up'; // eyes covered, facing away
      const n = Math.min(10, Math.floor((8 - g.t) / 0.8) + 1);
      if (n !== g.n) { g.n = n; say(v, n < 10 ? `${n}...` : 'Ready or not, here I come!', 0.8); }
      if (g.t <= 0) { g.phase = 'seek'; g.t = 22; g.goal = null; }
      return;
    }
    // seeking: wander from spot to spot, peeking about
    if (canSeePlayer(v) && Math.hypot(player.x - v.x, player.y - v.y) < 150) {
      say(v, 'FOUND YOU! Hee hee!', 2); v.game = null; v.hsCD = 45; toRoute(v); return;
    }
    if (g.t <= 0) {
      say(v, 'I give up! You win!', 2.2); v.game = null; v.hsCD = 60; toRoute(v); completeTask('hideseek'); return;
    }
    if (!g.goal || travel(v, g.goal.x, g.goal.y, v.speed * 1.3, dt)) {
      g.goal = null;
      g.look = (g.look || 0) - dt;
      if (g.look <= 0) {
        g.look = 1.2;
        const near = hideBushes.filter((o) => areaOf(o.x, o.y) === 0 && Math.hypot(o.x - v.x, o.y - v.y) < 300);
        const o = near.length && Math.random() < 0.6 ? pick(near) : null;
        const x = o ? o.x + rr(-30, 30) : v.x + rr(-160, 160), y = o ? o.y + rr(14, 30) : v.y + rr(-100, 100);
        if (!navBlockedPt(x, y) && areaOf(x, y) === 0) g.goal = { x, y };
        if (Math.random() < 0.4) say(v, rpick(['Where are you?', 'Are you behind here?', 'I can hear you...', 'Hmm...']), 1.2);
      }
    }
  }

  // Museum: treasures on plinths, blinking tripwires, and a guard on patrol
  function makePlinth(x, y) {
    return {
      kind: 'plinth', x, y, hitbox: box(x - 9, y - 7, 18, 8), bounds: { l: x - 12, r: x + 12, t: y - 26, b: y + 3 },
      draw(ctx) { ctx.fillStyle = '#e8e4da'; ctx.fillRect(x - 8, y - 18, 16, 18); ctx.fillStyle = '#d4cfc2'; ctx.fillRect(x - 10, y - 20, 20, 4); ctx.fillRect(x - 10, y - 3, 20, 3); },
    };
  }
  function makeMuseum(M) {
    const X = M.x * TILE, Y = M.y * TILE, W = M.w * TILE, H = M.h * TILE;
    return {
      kind: 'museum', x: X + W / 2, y: Y + 4, hitbox: box(X, Y - 4, W, 10), bounds: { l: X - 10, r: X + W + 10, t: Y - 80, b: Y + 10 },
      draw(ctx) {
        ctx.fillStyle = '#e8e4da'; ctx.fillRect(X, Y - 54, W, 58);
        ctx.fillStyle = '#d4cfc2'; for (let k = 0; k < 6; k++) ctx.fillRect(X + 10 + k * (W - 20) / 5 - 4, Y - 50, 8, 52);
        ctx.fillStyle = '#c9c3b4'; poly(ctx, [[X - 6, Y - 54], [X + W + 6, Y - 54], [X + W / 2, Y - 78]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[X + 10, Y - 60], [X + W - 10, Y - 60], [X + W / 2, Y - 78]]); ctx.fill(); }
        ctx.fillStyle = '#5a5248'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('MUSEUM', X + W / 2, Y - 60);
      },
    };
  }
  function buildMuseum(markSolid, place) {
    const r = place(11, 9);
    if (!r) return;
    const M = { x: r.x + 1, y: r.y + 1, w: 9, h: 7 };
    // the gallery: a stone floor behind the facade, open at the front (south) through a gap in the railings
    for (let y = M.y + 1; y < M.y + M.h; y++) for (let x = M.x; x < M.x + M.w; x++) setT(x, y, STONE);
    L.museum = M;
    reserve(r.x, r.y, 11, 9);
    markSolid(M.x, M.y, M.w, M.h);
  }
  function placeMuseumObjects() {
    const M = L.museum;
    if (!M) return;
    const T = TILE, X = M.x * T, Y = M.y * T, W = M.w * T, H = M.h * T;
    objects.push(makeMuseum(M));
    // railings down the sides and along the front, with a gap in the middle
    for (let y = M.y + 1; y < M.y + M.h; y++) { objects.push(makeFence(M.x, y, 'v')); objects.push(makeFence(M.x + M.w - 1, y, 'v')); }
    const gx = M.x + Math.floor(M.w / 2) - 1;
    for (let x = M.x; x < M.x + M.w; x++) if (x !== gx && x !== gx + 1) objects.push(makeFence(x, M.y + M.h - 1, 'h'));
    L.museumGate = { x: (gx + 1) * T, y: (M.y + M.h - 0.5) * T };
    L.plinths = [[0.25, 0.42], [0.5, 0.32], [0.75, 0.42]].map(([u, v]) => ({ x: X + W * u, y: Y + H * v + 10 }));
    for (const p of L.plinths) objects.push(makePlinth(p.x, p.y));
    // tripwires: across the entrance, and in front of each plinth
    const gy = L.museumGate.y - 18;
    L.lasers = [
      { x1: X + T * 1.2, y1: gy, x2: X + W - T * 1.2, y2: gy, ph: 0 },
      ...L.plinths.map((p, i) => ({ x1: p.x - 22, y1: p.y + 14, x2: p.x + 22, y2: p.y + 14, ph: 1.1 * (i + 1) })),
    ];
  }
  const laserOn = (l) => ((time + l.ph) % 3.4) < 2.1;
  function segDist(px, py, l) {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1, u = clamp(((px - l.x1) * dx + (py - l.y1) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(px - (l.x1 + dx * u), py - (l.y1 + dy * u));
  }
  function drawLasers(ctx, t) {
    if (!L.lasers) return;
    for (const l of L.lasers) {
      ctx.fillStyle = '#5a5248'; ctx.fillRect(l.x1 - 2, l.y1 - 14, 4, 15); ctx.fillRect(l.x2 - 2, l.y2 - 14, 4, 15);
      if (!laserOn(l)) continue;
      ctx.strokeStyle = `rgba(255,40,40,${0.6 + Math.sin(t * 20) * 0.2})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1 - 8); ctx.lineTo(l.x2, l.y2 - 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,90,90,0.25)'; ctx.lineWidth = 4; ctx.stroke();
    }
  }
  function soundAlarm() {
    if ((L.alarmT || 0) > 0) return;
    L.alarmT = 4; run.alarms = (run.alarms || 0) + 1;
    toast('ALARM! The guard is coming!', 'Museum', true);
    completeTask('alarm');
    const gd = VILLAGER.guard, it = player.held && player.held.museum ? player.held : null;
    if (gd) { gd.cooldown = 0; startleV(gd, 'INTRUDER!', { state: 'chase', target: it }); if (!it) { gd.stateT = 8; } }
    lookTowards(player.x, player.y, 400, () => rpick(['The museum alarm!', 'A burglar?!', 'What’s that racket?']));
  }

  // --- Per frame ---------------------------------------------------------------------------------
  function updateCastleForest(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    // the castle bell: walk into the rope
    L.bellT = Math.max(0, (L.bellT || 0) - dt);
    if (L.bell && outside && L.bellT <= 0 && Math.hypot(player.x - L.bell.rope.x, player.y - L.bell.rope.y) < 14) {
      L.bellT = 3;
      for (let k = 0; k < 4; k++) setTimeout(() => sfx('bell'), k * 520);
      for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.random() < 0.7) startleV(v, rpick(['The castle bell?!', 'Who’s ringing that?', 'Goodness!']));
      critterScare(L.bell.x, L.bell.y, 400);
      completeTask('bell');
    }
    // the woodpile
    const S = L.logpile;
    if (S && !S.rolled && outside) {
      if (Math.hypot(player.x - S.x, player.y - (S.y - 2)) < 32 && Math.max(player.speed, S.lastSpd || 0) > 120) rollLogs();
      S.lastSpd = player.speed;
    }
    // things dropped from the treehouses
    for (const it of items) {
      if (!it.fromTree) continue;
      if (!it.air) { it.fromTree = false; continue; }
      if (it.z > 26) continue;
      for (const v of villagers) {
        if (Math.hypot(it.x - v.x, it.y - v.y) > 14) continue;
        it.fromTree = false; sfx('bonk');
        if (startleV(v, rpick(['OW! From above?!', 'What the—?!', 'Is it raining teapots?!']))) completeTask(it.dropTask || 'treedrop');
        break;
      }
    }
    // museum tripwires
    L.alarmT = Math.max(0, (L.alarmT || 0) - dt);
    if (L.lasers && outside && !player.hidden) for (const l of L.lasers) {
      if (laserOn(l) && segDist(player.x, player.y - 2, l) < 5) { soundAlarm(); break; }
    }
    if (L.alarmT > 0 && Math.random() < dt * 4) sfx('alarm');
    // Toby: hide-and-seek when you come up to him
    const tb = VILLAGER.toby;
    if (tb) {
      tb.hsCD = Math.max(0, (tb.hsCD || 0) - dt);
      if ((tb.state === 'act' || tb.state === 'route') && tb.hsCD <= 0 && outside && areaOf(tb.x, tb.y) === 0 && !player.held && !player.tree &&
        Math.hypot(player.x - tb.x, player.y - tb.y) < 40 && player.speed < 10 && (player.idleT || 0) > 0.8 && !(isWinter() && tb.fightOn)) hideSeekStart(tb);
    }
    updateRace(dt);
  }
  // A chitter inside a fairy ring
  function fairyCheck() {
    if (!L.rings) return;
    for (const R of L.rings) if (Math.hypot((player.x - R.x) / 26, (player.y - R.y) / 13) < 0.8) {
      for (let k = 0; k < 16; k++) particles.push({ kind: 'spark', x: R.x + rr(-20, 20), y: R.y + rr(-8, 8), z: rr(4, 20), vx: rr(-20, 20), vy: 0, vz: rr(40, 90), life: 1, max: 1 });
      sfx('happy'); player.bubble = { text: '✨ ooh! ✨', t: 1.4 }; completeTask('fairyring');
    }
  }

  // ---------------------------------------------------------------------------
  // Disguises and tricks (G: wear/remove, B: bury/dig up, swimming, roofs),
  // the pest controller, night raids, and the trophy den.
  // ---------------------------------------------------------------------------
  ITEM.net = { name: 'butterfly net', h: 20, r: 6, draw(c) {
    c.strokeStyle = '#7a5230'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-6, 0); c.lineTo(4, -14); c.stroke();
    c.strokeStyle = '#d9d2c4'; c.lineWidth = 1; c.beginPath(); c.ellipse(6, -17, 5, 4, 0.6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(230,226,214,0.45)'; c.beginPath(); c.ellipse(7, -15, 4, 5, 0.6, 0, Math.PI * 2); c.fill();
  } };

  // --- Disguises -----------------------------------------------------------------------------
  const WEARABLE = new Set(['hat', 'shirt', 'bucket', 'pot', 'crown', 'sock']);
  function wearToggle() {
    if (!started || paused || player.tree || player.roof) return;
    if (player.disguise) {
      const it = player.disguise; player.disguise = null;
      Object.assign(it, { x: player.x + 10, y: player.y + 4, z: 0, held: false, heldBy: null, air: false });
      items.push(it); sfx('pop'); player.bubble = { text: 'ta-da, it’s me!', t: 1.2 };
      return;
    }
    const it = player.held;
    if (!it || !WEARABLE.has(it.kind)) { player.bubble = { text: 'can’t wear that', t: 1 }; return; }
    player.held = null;
    const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
    player.disguise = it; sfx('pick'); sparkle(player.x, player.y, 20);
    player.bubble = { text: rpick(['very dapper.', 'nobody will know.', '*innocent whistle*']), t: 1.4 };
    completeTask('disguise');
  }
  function drawDisguise(ctx, p) {
    const d = p.disguise;
    if (!d) return;
    const side = p.dir === 'left' || p.dir === 'right', hx = side ? 10.5 : 0, hy = side ? -22 : -26;
    switch (d.kind) {
      case 'hat': ctx.fillStyle = '#7a4f8f'; ellipse(ctx, hx, hy + 3, 10, 3); roundRect(ctx, hx - 5.5, hy - 5, 11, 8, 3, true); ctx.fillStyle = '#f2b8c6'; ctx.fillRect(hx - 5.5, hy, 11, 2); break;
      case 'bucket': ctx.fillStyle = '#9aa0aa'; poly(ctx, [[hx - 7, hy + 4], [hx + 7, hy + 4], [hx + 5, hy - 6], [hx - 5, hy - 6]]); ctx.fill(); ctx.fillStyle = '#c4c8d0'; ctx.fillRect(hx - 5, hy - 6, 10, 2); break;
      case 'pot': ctx.fillStyle = '#c0582a'; poly(ctx, [[hx - 6.5, hy + 4], [hx + 6.5, hy + 4], [hx + 5, hy - 5], [hx - 5, hy - 5]]); ctx.fill(); ctx.fillStyle = '#d97a4a'; ctx.fillRect(hx - 7, hy + 2, 14, 2.4); break;
      case 'crown': ctx.fillStyle = '#f2c14e'; poly(ctx, [[hx - 6, hy + 3], [hx + 6, hy + 3], [hx + 7, hy - 5], [hx + 3.5, hy - 1], [hx, hy - 6], [hx - 3.5, hy - 1], [hx - 7, hy - 5]]); ctx.fill(); ctx.fillStyle = '#e8453c'; circle(ctx, hx, hy, 1.3); break;
      case 'sock': ctx.fillStyle = '#e8453c'; roundRect(ctx, hx - 6, hy - 2, 12, 6, 3, true); ctx.fillStyle = '#ffffff'; ctx.fillRect(hx - 6, hy + 2, 12, 2); circle(ctx, hx + 6, hy - 4, 2.2); break;
      case 'shirt': ctx.globalAlpha = 0.92; ctx.fillStyle = '#4f93c7'; roundRect(ctx, -9, -17, 18, 11, 4, true); ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -17, 2, 11); ctx.globalAlpha = 1; break;
    }
  }

  // --- Burying loot -------------------------------------------------------------------------------
  const diggable = (x, y) => areaOf(x, y) === 0 && [GRASS, SOIL, SAND].includes(tileAt(x, y)) && !navBlockedPt(x, y);
  function buryAction() {
    if (!started || paused || player.tree || player.roof || player.boat || player.digging) return;
    L.buried = L.buried || [];
    const mound = L.buried.find((b) => Math.hypot(b.x - player.x, b.y - player.y) < 20);
    if (!player.held && mound) { player.digging = { t: 0.8, up: mound }; player.stun = 0.8; sfx('rustle'); return; }
    const it = player.held;
    if (!it) { if (diggable(player.x, player.y)) { player.digging = { t: 0.8, worms: true }; player.stun = 0.8; sfx('rustle'); } else player.bubble = { text: 'can’t dig here', t: 1 }; return; } // dig for worms
    if (it.type.heavy) { player.bubble = { text: 'too big to bury!', t: 1 }; return; }
    if (!diggable(player.x, player.y)) { player.bubble = { text: 'can’t dig here', t: 1 }; return; }
    player.digging = { t: 1, it }; player.stun = 1; sfx('rustle');
  }
  function updateDigging(dt) {
    const D = player.digging;
    if (!D) return;
    D.t -= dt;
    if (Math.random() < dt * 14) puff(player.x + rr(-6, 6), player.y + 2, 1, 'soil');
    if (D.t > 0) return;
    player.digging = null;
    if (D.worms) { if (Math.random() < 0.45) { player.worms = (player.worms || 0) + 1; player.bubble = { text: `a worm! (${player.worms})`, t: 1.2 }; sfx('pick'); } else player.bubble = { text: 'just dirt...', t: 1 }; return; }
    if (D.up) { // dig it back up
      const b = D.up; L.buried.splice(L.buried.indexOf(b), 1);
      Object.assign(b.it, { x: b.x, y: b.y, z: 0, held: false, heldBy: null, air: true, vz: 120, vx: 0, vy: 10 });
      items.push(b.it); sfx('pop');
      return;
    }
    const it = D.it;
    if (player.held !== it) return;
    player.held = null;
    const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
    L.buried.push({ x: player.x, y: player.y + 3, it });
    sfx('pop'); player.bubble = { text: 'safe and sound.', t: 1.2 };
    run.buried = (run.buried || 0) + 1;
    completeTask('bury'); setProgress('bury3', run.buried);
  }
  function drawMounds(ctx) {
    if (!L.buried) return;
    for (const b of L.buried) {
      ctx.fillStyle = isWinter() ? '#dfe9f2' : '#7a5a3a'; ellipse(ctx, b.x, b.y, 9, 4);
      ctx.fillStyle = isWinter() ? '#f4f8fb' : '#8a6a46'; ellipse(ctx, b.x - 1, b.y - 1, 6, 2.5);
      ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x - 3, b.y - 2); ctx.lineTo(b.x + 3, b.y + 1); ctx.moveTo(b.x + 3, b.y - 2); ctx.lineTo(b.x - 3, b.y + 1); ctx.stroke();
    }
  }

  // --- Swimming ------------------------------------------------------------------------------------
  const canSwim = () => !(player.held && player.held.type.heavy) && !player.boat;

  // --- Roofs -----------------------------------------------------------------------------------------
  const pipeBase = (h) => ({ x: (h.x + h.w) * TILE - 4, y: (h.y + h.h) * TILE + 8 });
  function roofRect(h) { const o = h.obj; return { l: h.x * TILE + 8, r: (h.x + h.w) * TILE - 8, t: o.roofTop + 12, b: o.wallTop - 2 }; }
  function roofAction() {
    if (!L.houses) return false;
    if (player.roof) {
      const h = player.roof, R = roofRect(h);
      if (player.x > R.r - 26 && player.y > R.b - 24) {
        const pb = pipeBase(h);
        player.roof = null; Object.assign(player, { x: pb.x + 8, y: pb.y + 4, vx: 0, vy: 0, dir: 'down' }); sfx('tap');
      } else player.bubble = { text: 'the drainpipe’s at the corner', t: 1.2 };
      return true;
    }
    if (areaOf(player.x, player.y) !== 0 || (player.held && player.held.type.heavy)) return false;
    for (const h of L.houses) {
      if (!h.obj) continue;
      const pb = pipeBase(h);
      if (Math.hypot(player.x - pb.x, player.y - pb.y) < 18) {
        const R = roofRect(h);
        player.roof = h; Object.assign(player, { x: R.r - 12, y: R.b - 6, vx: 0, vy: 0, dir: 'up' });
        sfx('creak'); completeTask('roof');
        return true;
      }
    }
    return false;
  }
  const pipeNear = () => !player.roof && areaOf(player.x, player.y) === 0 && L.houses && L.houses.some((h) => h.obj && Math.hypot(player.x - pipeBase(h).x, player.y - pipeBase(h).y) < 18);
  function updateRoof(dt, input) {
    const R = roofRect(player.roof);
    let ix = input.x, iy = input.y;
    if (player.stun > 0) { player.stun -= dt; ix = iy = 0; }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    player.x = clamp(player.x + ix * 80 * dt, R.l, R.r); player.y = clamp(player.y + iy * 60 * dt, R.t, R.b);
    player.speed = m > 0.15 ? 80 : 0; player.vx = player.vy = 0;
    if (m > 0.15) { if (Math.abs(ix) > Math.abs(iy)) player.dir = ix > 0 ? 'right' : 'left'; else player.dir = iy > 0 ? 'down' : 'up'; player.walk += dt * 9; }
    if (player.bubble) { player.bubble.t -= dt; if (player.bubble.t <= 0) player.bubble = null; }
  }
  // Throwing from a roof: down the chimney if you're by it, otherwise over the edge onto whoever's below
  function dropFromRoof() {
    const it = player.held, h = player.roof;
    if (!it) return;
    player.held = null;
    if (Math.abs(player.x - h.obj.chimneyX) < 16 && player.y < roofRect(h).t + 34 && h.room) {
      const x = (h.room.x0 + 5.5) * TILE, y = (h.room.y0 + 3.4) * TILE;
      Object.assign(it, { held: false, heldBy: null, x, y, z: 30, vx: rr(-30, 30), vy: 20, vz: 0, air: true, kicker: 'chimney' });
      for (let k = 0; k < 12; k++) particles.push({ x: x + rr(-14, 14), y: y + rr(-6, 6), r: rr(3, 6), life: 1, max: 1, vy: -10, soil: true });
      sfx('thud'); player.bubble = { text: 'ho ho ho!', t: 1.3 };
      for (const v of villagers) if (areaOf(v.x, v.y) === h.area) startleV(v, rpick(['EEK! Something came down the chimney!', 'Goodness, the chimney!']));
      completeTask('chimney');
      return;
    }
    Object.assign(it, { held: false, heldBy: null, x: player.x, y: (h.y + h.h) * TILE + 14, z: 70, vx: 0, vy: 0, vz: 0, air: true, kicker: null, fromTree: true, dropTask: 'roofdrop' });
    sfx('throw');
  }
  function drawPipe(ctx, h) {
    const pb = pipeBase(h), top = h.obj.roofTop + 18;
    ctx.fillStyle = '#7a7f88'; ctx.fillRect(pb.x - 2, top, 4, pb.y - 8 - top);
    ctx.fillRect(pb.x - 4, pb.y - 12, 8, 4);
    ctx.fillStyle = '#5a5e66'; for (let y = top + 10; y < pb.y - 10; y += 14) ctx.fillRect(pb.x - 3, y, 6, 2);
  }

  // --- The pest controller ---------------------------------------------------------------------------
  function makeTrapObj(T0) {
    return {
      kind: 'trap', x: T0.x, y: T0.y + 0.2, bounds: { l: T0.x - 14, r: T0.x + 14, t: T0.y - 20, b: T0.y + 4 },
      draw(ctx) {
        const x = T0.x, y = T0.y;
        ctx.fillStyle = 'rgba(20,30,10,0.2)'; ellipse(ctx, x, y, 12, 3);
        if (T0.armed) { ctx.fillStyle = '#f2d06a'; poly(ctx, [[x - 3, y - 1], [x + 3, y - 1], [x, y - 5]]); ctx.fill(); } // the cheese
        ctx.strokeStyle = '#6a6e76'; ctx.lineWidth = 1;
        const hgt = 12, door = T0.armed ? -10 : 0;
        ctx.strokeRect(x - 10, y - hgt, 20, hgt);
        for (let k = -7; k <= 7; k += 3.5) { ctx.beginPath(); ctx.moveTo(x + k, y - hgt); ctx.lineTo(x + k, y); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(x - 10, y - hgt / 2); ctx.lineTo(x + 10, y - hgt / 2); ctx.stroke();
        ctx.strokeStyle = '#8a8e96'; ctx.beginPath(); ctx.moveTo(x - 10, y + door); ctx.lineTo(x - 10, y - hgt + door * 0.2); ctx.stroke();
      },
    };
  }
  function placeTraps() {
    L.traps = [];
    if (!L.pest) return;
    for (let n = 0; n < 300 && L.traps.length < 3; n++) {
      const tx = Math.floor(rr(4, MW - 4)), ty = Math.floor(rr(4, MH - 4));
      if (getT(tx, ty) !== PATH || !navOpen(tx, ty)) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.6) * TILE;
      if (Math.hypot(x - HIDEOUT.x, y - HIDEOUT.y) < 12 * TILE || L.traps.some((t) => Math.hypot(t.x - x, t.y - y) < 10 * TILE)) continue;
      const T0 = { x, y, armed: true }; L.traps.push(T0); objects.push(makeTrapObj(T0));
    }
  }
  function pestHunt(v, dt) {
    v.huntT = (v.huntT || 0) - dt;
    if (v.huntGoal && v.huntT > -6) { // heading for a sprung trap
      if (travel(v, v.huntGoal.x, v.huntGoal.y + 10, v.chase * 0.9, dt)) { v.huntGoal = null; v.huntT = 0; }
    } else {
      if (v.huntT <= 0) {
        v.huntT = 3;
        const tr = L.trail || [], p = tr.length > 10 ? tr[tr.length - 10] : tr[0];
        v.goal = p && areaOf(p.x, p.y) === 0 ? { x: p.x, y: p.y } : { x: (L.plaza.x + rr(0, 12)) * TILE, y: (L.plaza.y + rr(0, 12)) * TILE };
        if (Math.random() < 0.35) say(v, rpick(['I can smell you, raccoon...', 'Fresh pawprints!', 'Here, ratty ratty...', 'No masked bandits on my watch.']), 1.6);
      }
      if (v.goal && travel(v, v.goal.x, v.goal.y, v.speed * 1.2, dt)) v.goal = null;
    }
    if (started && canSeePlayer(v) && !playerInHideout() && !player.roof && !player.tree) {
      v.state = 'chase'; v.target = null; v.stateT = 10; v.lostT = 0; v.lastSeen = { x: player.x, y: player.y }; v.path = null;
      say(v, rpick(['THERE you are!', 'Gotcha now, you masked menace!', 'Stop, raccoon!']), 1.6, true); sfx('alert');
    }
  }

  // --- Night raids -------------------------------------------------------------------------------------
  let nightCv = null;
  function drawNight(ctx, left, top, viewW, viewH) {
    const w = Math.ceil(viewW), h = Math.ceil(viewH);
    if (!nightCv) nightCv = document.createElement('canvas');
    if (nightCv.width !== w || nightCv.height !== h) { nightCv.width = w; nightCv.height = h; }
    const g = nightCv.getContext('2d'), indoors = areaOf(player.x, player.y) > 0;
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
    g.fillStyle = indoors ? 'rgba(10,12,30,0.55)' : 'rgba(8,12,36,0.76)'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a = 1) => {
      const lx = x - left, ly = y - top;
      if (lx < -r || ly < -r || lx > w + r || ly > h + r) return;
      const gr = g.createRadialGradient(lx, ly, 0, lx, ly, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(lx - r, ly - r, r * 2, r * 2);
    };
    light(player.x, player.y - 10, 78, 0.75);
    if (indoors) { const hh = houseOfArea(areaOf(player.x, player.y)); if (hh) light((hh.room.x0 + 5.5) * TILE, (hh.room.y0 + 3) * TILE, 170, 0.75); }
    else {
      for (const o of L.lights || []) light(o.x, o.y - 30, 95, 0.95);
      for (const hs of L.houses) light((hs.doorX + 0.5) * TILE, (hs.y + hs.h) * TILE - 10, 48, 0.8);
      if (L.bonfire) light(L.bonfire.x, L.bonfire.y - 10, 140, 1);
      if (L.lighthouse) { const H = L.lighthouse, a = time * 0.9; light(H.x, H.y - 140, 70, 1); light(H.x + Math.cos(a) * 200, H.y - 140 + Math.sin(a) * 100, 60, 0.8); }
      for (const c of critters) if (c.type === 'wisp' && !c.done) light(c.x, c.y - c.z, 40, 0.8);
      if (L.rail && L.train) light(L.train.x + L.train.dir * 30, L.rail.y - 10, 70, 0.8);
      const wt = VILLAGER.watch;
      if (wt && areaOf(wt.x, wt.y) === 0) light(wt.x + (wt.dir === 'left' ? -8 : 8), wt.y - 14, 120, 1);
      for (const c of critters) if (c.type === 'firefly' && !c.caught) light(c.x, c.y - c.z, 14, 0.6);
    }
    ctx.drawImage(nightCv, left, top, w, h);
  }
  function drawLantern(ctx, t) {
    const wt = VILLAGER.watch;
    if (!wt || !L.night) return;
    const x = wt.x + (wt.dir === 'left' ? -9 : 9), y = wt.y - 14 - wt.hop + Math.sin(t * 3) * 1;
    ctx.strokeStyle = '#3a3530'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 10); ctx.stroke();
    ctx.fillStyle = '#3a3530'; ctx.fillRect(x - 3.5, y - 7, 7, 1.5); ctx.fillRect(x - 3.5, y + 2, 7, 1.5);
    ctx.fillStyle = '#ffd98a'; ctx.fillRect(x - 2.5, y - 5.5, 5, 7.5);
  }
  const nightStops = (id) => {
    if (!L.night || ['watch', 'guard', 'pest'].includes(id)) return null;
    const h = L.houses[L.homes[id]];
    if (!h || !h.room) return null;
    const R = h.room, T = TILE;
    return [{ wx: (R.bedLeft ? R.x0 + 3.5 : R.x0 + 7.5) * T + (id === 'toby' ? 10 : 0), wy: (R.y0 + 4.3) * T, act: 'sleep', dur: 9999, face: 'down' }];
  };

  // --- Trophy den: what you've stashed over every run, collections, achievements, fur colours --------
  const FURS = {
    classic: { name: 'Classic', c: ['#8b909a', '#5a5e68', '#c9ccd3', '#3c3f47'] },
    ginger: { name: 'Ginger', c: ['#c98a4a', '#8a5a2a', '#ecc896', '#6b3d1a'] },
    silver: { name: 'Silver', c: ['#b8bcc4', '#80848c', '#e4e6ea', '#5a5e66'] },
    golden: { name: 'Golden', c: ['#d9a43a', '#9a6e1e', '#f2d68a', '#7a5212'] },
    candy: { name: 'Candy', c: ['#e8a0b8', '#b8607e', '#f8d4e0', '#8a3a5a'] },
    river: { name: 'River blue', c: ['#7a9ab8', '#4a6a88', '#c4d6e6', '#2e4a66'] },
    arctic: { name: 'Arctic', c: ['#e8ecf0', '#b8c0c8', '#ffffff', '#8a929a'] },
    midnight: { name: 'Midnight', c: ['#4a4e5a', '#2a2d36', '#7a7e8a', '#1a1c22'] },
  };
  const COLLECTIONS = [
    { id: 'picnic', name: 'Picnic basket', kinds: ['pie', 'sandwich', 'apple', 'bread', 'cheese'], fur: 'ginger' },
    { id: 'garden', name: 'Garden raid', kinds: ['carrot', 'cabbage', 'gnome', 'pumpkin'], fur: 'river' },
    { id: 'sweet', name: 'Sweet tooth', kinds: ['sweets', 'lolly', 'cookies', 'cake', 'toffee'], fur: 'candy' },
    { id: 'toys', name: 'Toy box', kinds: ['teddy', 'toyboat', 'ball', 'kite', 'duck'], fur: 'silver' },
    { id: 'curios', name: 'Curiosities', kinds: ['trophy', 'clock', 'vase', 'frame', 'candle'], fur: 'midnight' },
    { id: 'winter', name: 'Winter wonderland', kinds: ['present', 'cocoa', 'sled', 'pinecone'], fur: 'arctic' },
    { id: 'treasure', name: 'Treasure hunter', kinds: ['crown', 'gem', 'goldvase', 'chest', 'goldpot'], fur: 'golden' },
  ];
  const ACHIEVEMENTS = [
    { id: 'firstwin', name: 'First heist', desc: 'Finish a day', test: (s) => (s.wins || 0) >= 1 },
    { id: 'day3', name: 'On a roll', desc: 'Reach day 3', test: () => save.bestDay >= 3 },
    { id: 'day7', name: 'Week of mischief', desc: 'Reach day 7', test: () => save.bestDay >= 7 },
    { id: 'tasks25', name: 'Busy paws', desc: 'Do 25 tasks', test: (s) => (s.tasks || 0) >= 25 },
    { id: 'tasks100', name: 'Menace', desc: 'Do 100 tasks', test: (s) => (s.tasks || 0) >= 100 },
    { id: 'stash30', name: 'Hoarder', desc: 'Stash 30 things in your hideout', test: (s) => (s.stashed || 0) >= 30 },
    { id: 'eat25', name: 'Bottomless', desc: 'Eat 25 things', test: (s) => (s.eaten || 0) >= 25 },
    { id: 'kinds20', name: 'Magpie', desc: 'Collect 20 different things', test: () => Object.keys(save.trophies || {}).length >= 20 },
    { id: 'col1', name: 'Collector', desc: 'Complete a collection', test: () => COLLECTIONS.some(colDone) },
    { id: 'colall', name: 'Curator', desc: 'Complete every collection', test: () => COLLECTIONS.every(colDone) },
  ];
  const colDone = (c) => c.kinds.every((k) => (save.trophies || {})[k] > 0);
  function applyFur() {
    const f = FURS[save.fur] && (save.fur === 'classic' || COLLECTIONS.some((c) => c.fur === save.fur && colDone(c))) ? FURS[save.fur] : FURS.classic;
    [FUR, FUR_DARK, FUR_LIGHT, RING] = f.c;
  }
  // At the end of every day: whatever's in the hideout goes on the trophy shelf
  function recordTrophies(win) {
    save.trophies = save.trophies || {}; save.stats = save.stats || {};
    const before = new Set(COLLECTIONS.filter(colDone).map((c) => c.id));
    const achBefore = new Set(ACHIEVEMENTS.filter((a) => a.test(save.stats)).map((a) => a.id));
    const stashed = items.filter(inHideout);
    for (const it of stashed) save.trophies[it.kind] = (save.trophies[it.kind] || 0) + 1;
    for (const b of L.buried || []) save.trophies[b.it.kind] = (save.trophies[b.it.kind] || 0) + 1;
    const S = save.stats;
    S.tasks = (S.tasks || 0) + run.done.size; S.eaten = (S.eaten || 0) + (run.eaten || 0); S.stashed = (S.stashed || 0) + stashed.length;
    if (win) S.wins = (S.wins || 0) + 1;
    const news = [];
    for (const c of COLLECTIONS) if (colDone(c) && !before.has(c.id)) news.push(`Collection complete: ${c.name}! New fur: ${FURS[c.fur].name}`);
    for (const a of ACHIEVEMENTS) if (a.test(S) && !achBefore.has(a.id)) news.push(`Achievement: ${a.name}`);
    return news;
  }
  const iconCache = {};
  function itemIcon(kind) {
    if (iconCache[kind]) return iconCache[kind];
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'), T = ITEM[kind];
    if (T) { const s = Math.min(2.6, 34 / Math.max(T.h, T.r * 2, 8)); g.translate(32, 32 + T.h * s / 2); g.scale(s, s); try { T.draw(g, { ph0: 0.1, walking: false, facing: 1, bites: 0 }, 0); } catch (_) { /* odd drawer */ } }
    return (iconCache[kind] = c.toDataURL());
  }
  function renderTrophies() {
    const T = save.trophies || {}, S = save.stats || {};
    const shelf = document.getElementById('den-shelf');
    if (!shelf) return;
    shelf.innerHTML = '';
    const kinds = Object.keys(T).filter((k) => ITEM[k]).sort((a, b) => T[b] - T[a]);
    if (!kinds.length) shelf.innerHTML = '<p class="hint">Nothing yet: whatever is in your hideout at the end of a day ends up here.</p>';
    for (const k of kinds) {
      const li = document.createElement('li');
      li.innerHTML = '<img alt=""><span class="n"></span>';
      li.querySelector('img').src = itemIcon(k); li.title = ITEM[k].name;
      li.querySelector('.n').textContent = `×${T[k]}`;
      li.setAttribute('aria-label', `${ITEM[k].name}: ${T[k]}`);
      shelf.appendChild(li);
    }
    const cols = document.getElementById('den-cols'); cols.innerHTML = '';
    for (const c of COLLECTIONS) {
      const have = c.kinds.filter((k) => T[k] > 0).length, done = have === c.kinds.length;
      const li = document.createElement('li'); li.className = done ? 'done' : '';
      li.innerHTML = '<div class="ct"><span class="cn"></span><span class="cp"></span></div><div class="ck"></div><div class="cr"></div>';
      li.querySelector('.cn').textContent = c.name; li.querySelector('.cp').textContent = `${have}/${c.kinds.length}`;
      const ck = li.querySelector('.ck');
      for (const k of c.kinds) { const im = document.createElement('img'); im.src = itemIcon(k); im.alt = ITEM[k] ? ITEM[k].name : k; im.title = im.alt; if (!(T[k] > 0)) im.className = 'missing'; ck.appendChild(im); }
      li.querySelector('.cr').textContent = done ? `Unlocked: ${FURS[c.fur].name} fur` : `Reward: ${FURS[c.fur].name} fur`;
      cols.appendChild(li);
    }
    const furs = document.getElementById('den-furs'); furs.innerHTML = '';
    for (const [id, f] of Object.entries(FURS)) {
      const open = id === 'classic' || COLLECTIONS.some((c) => c.fur === id && colDone(c));
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fur' + ((save.fur || 'classic') === id ? ' on' : '');
      b.disabled = !open; b.style.setProperty('--f', f.c[0]); b.style.setProperty('--r', f.c[3]);
      b.innerHTML = '<span class="sw"></span><span class="fn"></span>'; b.querySelector('.fn').textContent = open ? f.name : 'Locked';
      b.setAttribute('aria-label', open ? `${f.name} fur` : `${f.name} fur (locked)`);
      b.addEventListener('click', () => { save.fur = id; writeSave(); applyFur(); audioInit(); sfx('pick'); renderTrophies(); });
      furs.appendChild(b);
    }
    const achs = document.getElementById('den-achs'); achs.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const ok = a.test(S), li = document.createElement('li'); li.className = ok ? 'got' : '';
      li.innerHTML = '<span class="ai"></span><span class="an"></span><span class="ad"></span>';
      li.querySelector('.ai').textContent = ok ? '★' : '☆'; li.querySelector('.an').textContent = a.name; li.querySelector('.ad').textContent = a.desc;
      achs.appendChild(li);
    }
  }

  // --- Per frame -----------------------------------------------------------------------------------------
  function updateTricks(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    updateDigging(dt);
    // the trail the pest controller follows
    L.trailT = (L.trailT || 0) - dt;
    if (L.trailT <= 0 && outside) { L.trailT = 0.5; (L.trail = L.trail || []).push({ x: player.x, y: player.y }); if (L.trail.length > 30) L.trail.shift(); }
    // swimming
    if (player.swim) { player.swimT = (player.swimT || 0) + dt; if (player.swimT > 0.8) completeTask('swim'); if (Math.random() < dt * 3) particles.push({ kind: 'ring', x: player.x + rr(-6, 6), y: player.y - 2, r: 3, life: 0.8, max: 0.8 }); } else player.swimT = 0;
    // disguised: walk right past the owner of what you're carrying
    if (player.disguise) for (const v of villagers) {
      const d = Math.hypot(v.x - player.x, v.y - player.y);
      if (v.state === 'chase' || !canSeePlayer(v) || d > 170) continue;
      if (player.disguise.owner === v.id && (v.disCD || 0) < time && v.state !== 'startled') { // that's MY hat!
        v.disCD = time + 8; v.cooldown = 0;
        startleV(v, `That’s MY ${player.disguise.type.name}!`, { state: 'chase', target: null }); v.stateT = 8;
        continue;
      }
      if (player.held && player.held.owner === v.id && d > 60 && (v.greetCD || 0) < time) {
        v.greetCD = time + 12; say(v, rpick(['Morning, stranger!', 'Lovely hat.', 'Oh, hello there!', 'New in town?']), 1.6);
        completeTask('disguisewalk');
      }
    }
    // chases ending: did you get away?
    for (const v of villagers) {
      if (v.state === 'chase' && v.prevState !== 'chase') v.chaseStrikes = run.strikes;
      if (v.prevState === 'chase' && v.state !== 'chase' && v.state !== 'startled' && run.strikes === v.chaseStrikes) {
        if (player.swim || (player.swimT === 0 && tileAt(player.x, player.y + 12) === WATER)) completeTask('swimescape');
        if (v.id === 'pest') completeTask('pestescape');
      }
      v.prevState = v.state;
    }
    // traps
    for (const T0 of L.traps || []) {
      if (!T0.armed) continue;
      if (outside && !player.roof && !player.tree && !player.boat && Math.hypot(player.x - T0.x, player.y - T0.y) < 9) {
        T0.armed = false; player.caged = 3.5; player.x = T0.x; player.y = T0.y; sfx('crash'); toast('Trapped! Wriggle free...', 'Snap!', true);
        const pv = VILLAGER.pest; if (pv) { pv.huntGoal = { x: T0.x, y: T0.y }; pv.huntT = 0; if (pv.state !== 'chase') pv.state = 'hunt'; say(pv, 'Got one! Coming!', 1.4); }
        continue;
      }
      for (const it of items) if (it.air && Math.hypot(it.x - T0.x, it.y - T0.y) < 12 && it.z < 16) { T0.armed = false; sfx('crash'); completeTask('trapspring'); break; }
    }
    if (player.caged > 0) {
      player.caged -= dt; player.stun = Math.max(player.stun, 0.05); player.vx = player.vy = 0;
      const pv = VILLAGER.pest;
      if (pv && Math.hypot(pv.x - player.x, pv.y - player.y) < 18) { player.caged = 0; catchPlayer(pv); }
      if (player.caged <= 0) player.bubble = { text: 'free!', t: 1 };
    }
    // night: sleepers wake to a racket; the watchman
    if (L.night) {
      for (const v of villagers) {
        if (!(v.dozing > 0) || !v.stops[v.stopIdx] || v.stops[v.stopIdx].act !== 'sleep') continue;
        if (areaOf(v.x, v.y) === areaOf(player.x, player.y) && player.speed > WALK_SPEED * 1.15 && Math.hypot(v.x - player.x, v.y - player.y) < 100) {
          v.dozing = 0; v.wokeT = time + 25; v.cooldown = 0;
          startleV(v, rpick(['Wha—?! A BURGLAR!', 'Who’s there?!', 'Hnnh? THIEF!']), { state: 'chase', target: null }); v.stateT = 8;
        }
      }
      const wt = VILLAGER.watch;
      if (wt && outside && !player.hidden && Math.hypot(wt.x - player.x, wt.y - player.y) < 28 && !canSeePlayer(wt) && wt.state !== 'chase') completeTask('watchman');
    }
  }

  // ---------------------------------------------------------------------------
  // Rainy-day critters (snails, worms and a blackbird, dewy webs, dragonflies,
  // ladybirds), river and seaside animals (crabs, a seal, otters, a heron),
  // wild weather (lightning strikes, floods, a rain of frogs, an eclipse) and
  // rainy-day fun (umbrellas in the wind, overflowing gutters, muddy prints,
  // puddle jumping)
  // ---------------------------------------------------------------------------
  const RN_TYPES = new Set(['snail', 'worm', 'blackbird', 'dragonfly', 'ladybird', 'crab', 'seal', 'otter', 'heron', 'skyfrog']);
  const snailWeather = () => wet() || L.season === 'spring';

  // --- Spider webs on the fences --------------------------------------------------------------
  function makeWeb(x, y) {
    const o = {
      kind: 'web', x, y: y + 0.4, broken: false, bounds: { l: x - 14, r: x + 14, t: y - 30, b: y + 2 },
      draw(ctx, t) {
        if (o.broken) return;
        const dewy = wet() || ['fog', 'frost', 'drizzle', 'sleet'].includes(L.weather) || (run.timeTotal && run.timeLeft / run.timeTotal > 0.75);
        const cx = x, cy = y - 16;
        ctx.strokeStyle = dewy ? 'rgba(240,248,255,0.85)' : 'rgba(240,248,255,0.4)'; ctx.lineWidth = 0.5;
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 9); ctx.stroke(); }
        for (const r of [3, 6, 9]) { ctx.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.82; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
        if (dewy) for (let k = 0; k < 10; k++) { const a = k * 1.9, r = 3 + (k % 3) * 3; ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 3 + k) * 0.4})`; circle(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.82, 0.8); }
        ctx.fillStyle = '#2b2d33'; circle(ctx, cx + 1, cy + 1 + Math.sin(t * 0.7) * 0.6, 1.4); // the spider
      },
    };
    return o;
  }
  function placeWebs() {
    L.webs = [];
    if (isWinter()) return;
    const fences = objects.filter((o) => o.kind === 'fence' && o.y < WORLD_H);
    for (let k = 0; k < 6 && fences.length; k++) { const f = fences.splice(Math.floor(rand() * fences.length), 1)[0]; const o = makeWeb(f.x + 4, f.y - 2); objects.push(o); L.webs.push(o); }
  }

  // --- Spawning --------------------------------------------------------------------------------
  function spawnRainCritters() {
    const T = TILE;
    const mk = (type, x, y, extra) => critters.push(Object.assign({ type, x, y, z: 0, dir: 'left', walk: 0, ph: rand() * 6, tx: null, wait: rr(0, 3), cd: 0 }, extra));
    const grassSpot = () => { for (let n = 0; n < 60; n++) { const tx = Math.floor(rr(5, MW - 5)), ty = Math.floor(rr(5, MH - 5)); if (getT(tx, ty) === GRASS && navOpen(tx, ty)) return { x: (tx + 0.5) * T, y: (ty + 0.5) * T }; } return null; };
    if (!isWinter() && (planHas(WET_SET) || L.season === 'spring')) for (let k = 0; k < 5; k++) { const s = grassSpot(); if (s) mk('snail', s.x, s.y, { shell: 0, trail: 0 }); }
    if (!isWinter() && planHas(WET_SET)) { const s = grassSpot(); if (s) mk('blackbird', s.x, s.y, { hx: s.x, hy: s.y, flying: false, target: null }); }
    if (!isWinter() && hasOpenWater() && L.kind !== 'seaside' && L.season !== 'autumn') for (let k = 0; k < 4; k++) {
      const sp = shorePoint(rand() * Math.PI * 2); mk('dragonfly', sp.x, sp.y, { z: 16, hx: sp.x, hy: sp.y, flying: true, col: pick(['#4f93c7', '#3fae5a', '#c0392b']) });
    }
    if (!isWinter()) {
      const bushes = objects.filter((o) => (o.kind === 'bush' || o.kind === 'hidebush') && o.y < WORLD_H);
      for (let k = 0; k < 5 && bushes.length; k++) { const b = bushes[Math.floor(rand() * bushes.length)]; mk('ladybird', b.x + rr(-10, 10), b.y - 2, { z: 14, hx: b.x, hy: b.y, flying: true, onNose: false, idleNear: 0 }); }
    }
    if (L.kind === 'seaside') {
      for (let k = 0; k < 4; k++) { const tx = Math.floor(rr(6, MW - 6)), sy = (L.shore[tx] - 1) * T; mk('crab', (tx + 0.5) * T, sy, { hx: (tx + 0.5) * T, hy: sy, pinchCD: 0 }); }
      if (L.pier) mk('seal', L.pier.x + 10, L.pier.endY - 12, { flying: true, fed: false, food: null, barkT: rr(4, 9) });
    }
    if (L.kind === 'river' && L.river && hasOpenWater()) for (let k = 0; k < 2; k++) mk('otter', (L.river.x + 0.5) * T, (8 + k * 16) * T, { flying: true, play: 0, vy: 30 });
    if (L.kind === 'lake' && hasOpenWater()) for (let k = 0; k < 2; k++) { const a = rand() * 6.3; mk('otter', (L.pond.cx + Math.cos(a) * L.pond.rx * 0.7) * T, (L.pond.cy + Math.sin(a) * L.pond.ry * 0.7) * T, { flying: true, play: 0, lake: true }); }
    if (L.kind !== 'seaside' && hasOpenWater()) { const sp = shorePoint(rand() * Math.PI * 2); mk('heron', sp.x, sp.y, { hx: sp.x, hy: sp.y, flying: false, gone: 0, spearT: rr(4, 8), carrier: true, carry: null }); }
    L.wormT = 2; L.frogT = 0;
  }

  // --- Behaviour -------------------------------------------------------------------------------
  function updateRainCritter(c, dt, near) {
    const pd = Math.hypot(player.x - c.x, player.y - c.y);
    const outside = areaOf(player.x, player.y) === 0;
    const running = player.speed > WALK_SPEED * 1.15;
    c.cd = Math.max(0, (c.cd || 0) - dt);
    switch (c.type) {
      case 'snail': {
        if (!snailWeather()) break;
        c.shell = Math.max(0, c.shell - dt);
        if (outside && pd < 18 && c.shell <= 0) { c.shell = 5; c.bubble = { text: '...', t: 0.8 }; completeTask('snail'); }
        if (c.shell > 0) break;
        c.wait -= dt;
        if (c.wait <= 0 || c.tx === null) { c.tx = c.x + rr(-30, 30); c.ty = c.y + rr(-20, 20); c.wait = rr(6, 12); }
        critterMove(c, c.tx, c.ty, 3, dt);
        c.trail -= dt;
        if (c.trail <= 0) { c.trail = 0.6; particles.push({ kind: 'slime', x: c.x, y: c.y, life: 14, max: 14 }); }
        break;
      }
      case 'worm': {
        c.life -= dt;
        if (c.life <= 0) { c.dead = true; break; }
        if (outside && pd < 11) { c.dead = true; sparkle(c.x, c.y, 4); sfx('pick'); player.worms = (player.worms || 0) + 1; player.bubble = { text: 'wriggly!', t: 1 }; completeTask('worm'); }
        break;
      }
      case 'blackbird': {
        if (c.flying) { // swooping to a worm
          const w = c.target;
          if (!w || w.dead) { c.flying = false; c.target = null; c.z = 0; break; }
          critterMove(c, w.x, w.y, 160, dt); c.z = Math.max(0, Math.hypot(w.x - c.x, w.y - c.y) * 0.3); c.walk += dt * 20;
          if (Math.hypot(w.x - c.x, w.y - c.y) < 4) { w.dead = true; c.flying = false; c.z = 0; c.bubble = { text: '*gulp*', t: 0.8 }; }
          break;
        }
        if (outside && pd < 50 && running) { c.x += rr(-60, 60); c.y += rr(-40, 40); sfx('flutter'); break; }
        const w = critters.find((x) => x.type === 'worm' && !x.dead && Math.hypot(x.x - c.x, x.y - c.y) < 260);
        if (w && c.cd <= 0) { c.flying = true; c.target = w; c.cd = 2; break; }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-60, 60); c.ty = c.hy + rr(-40, 40); c.wait = rr(1, 3); }
        if (c.tx && critterMove(c, c.tx, c.ty, 30, dt)) c.tx = null;
        break;
      }
      case 'dragonfly': {
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-90, 90); c.ty = c.hy + rr(-60, 60); c.wait = rr(0.5, 1.6); }
        if (c.tx) { const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy); if (d > 2) { c.x += dx / d * Math.min(d, 140 * dt); c.y += dy / d * Math.min(d, 140 * dt); c.dir = dx > 0 ? 'right' : 'left'; } }
        c.z = 14 + Math.sin(c.ph * 3) * 4;
        if (outside && pd < 22 && !running) completeTask('dragonfly');
        break;
      }
      case 'ladybird': {
        if (c.onNose) {
          if (running || !outside) { c.onNose = false; c.hx = player.x; c.hy = player.y; sfx('flutter'); break; }
          const side = player.dir === 'left' ? -1 : player.dir === 'right' ? 1 : 0;
          c.x = player.x + side * 14; c.y = player.y + 0.5; c.z = player.dir === 'down' ? 16 : 20;
          break;
        }
        c.z = 12 + Math.sin(c.ph) * 2;
        if (outside && pd < 40 && player.speed < 5) { c.idleNear += dt; if (c.idleNear > 2) { c.onNose = true; c.idleNear = 0; player.bubble = { text: 'a ladybird! ♥', t: 1.4 }; completeTask('ladybird'); } }
        else c.idleNear = 0;
        if (Math.random() < dt * 0.3) { c.x = c.hx + rr(-14, 14); c.y = c.hy + rr(-6, 4); }
        break;
      }
      case 'crab': {
        c.pinchCD = Math.max(0, c.pinchCD - dt);
        if (outside && pd < 14 && c.pinchCD <= 0 && !player.boat) {
          c.pinchCD = 5; c.bubble = { text: 'SNIP!', t: 0.9 }; sfx('bonk');
          player.bubble = { text: 'OW! My toe!', t: 1.2 }; player.hopV = 160; player.hop = 0.01; player.stun = Math.max(player.stun, 0.3);
          if (player.held && !player.held.type.heavy) dropHeld(true);
          completeTask('crab');
        }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-40, 40); c.ty = c.hy + rr(-8, 8); c.wait = rr(1, 3); }
        if (c.tx && critterMove(c, c.tx, c.ty, pd < 50 ? 60 : 24, dt)) c.tx = null;
        c.dir = 'right'; // crabs walk sideways
        break;
      }
      case 'seal': {
        c.barkT -= dt;
        if (c.barkT <= 0) { c.barkT = rr(6, 12); c.bubble = { text: c.fed ? 'Arf arf! ♥' : 'ARF! ARF!', t: 1 }; if (pd < 300) sfx('bark'); }
        if (!c.food || !items.includes(c.food) || c.food.held) {
          c.food = items.find((it) => it.kind === 'fish' && !it.held && !it.air && Math.hypot(it.x - c.x, it.y - c.y) < 70) || null;
        }
        if (c.food) {
          const it = c.food, i2 = items.indexOf(it); if (i2 >= 0) items.splice(i2, 1);
          c.food = null; c.fed = true; c.clap = 2.5; c.bubble = { text: '*clap clap* ARF!', t: 1.4 }; sfx('bark'); sfx('happy');
          for (let k = 0; k < 3; k++) particles.push({ kind: 'heart', x: c.x + rr(-6, 6), y: c.y, z: 16 + k * 4, life: 1.2, max: 1.2 });
          completeTask('seal');
        }
        c.clap = Math.max(0, (c.clap || 0) - dt);
        break;
      }
      case 'otter': {
        c.play = Math.max(0, c.play - dt);
        if (player.swim && pd < 70) { // swimming with you!
          if (c.play <= 0) { c.play = 3; c.bubble = { text: rpick(['*squeak!*', 'eep eep!', '*splash*']), t: 1 }; }
          if (!c.with) { c.with = true; completeTask('otter'); }
          const a = c.ph * 2;
          c.x += (player.x + Math.cos(a) * 26 - c.x) * Math.min(1, dt * 2); c.y += (player.y + Math.sin(a) * 14 - c.y) * Math.min(1, dt * 2);
          break;
        }
        c.with = false;
        if (c.lake) { c.wait -= dt; if (c.wait <= 0) { const a = rand() * 6.3; c.tx = (L.pond.cx + Math.cos(a) * L.pond.rx * 0.7) * TILE; c.ty = (L.pond.cy + Math.sin(a) * L.pond.ry * 0.7) * TILE; c.wait = rr(3, 6); } if (c.tx && tileAt(c.tx, c.ty) === WATER) critterMove(c, c.tx, c.ty, 30, dt); }
        else { c.y += c.vy * dt; const sx = (L.river.x + 0.5) * TILE + Math.sin(c.y * 0.25 / TILE) * 1.5 * TILE; c.x += (sx - c.x) * Math.min(1, dt * 2); if (c.y > WORLD_H - 3 * TILE || tileAt(c.x, c.y + 20) !== WATER) c.vy = -Math.abs(c.vy); if (c.y < 3 * TILE) c.vy = Math.abs(c.vy); c.dir = c.vy > 0 ? 'right' : 'left'; }
        if (Math.random() < dt * 0.2) c.play = 1.5; // a roll in the water
        break;
      }
      case 'heron': {
        if (c.gone > 0) { c.gone -= dt; c.z = Math.min(120, c.z + 60 * dt); c.x += 80 * dt; c.walk += dt * 14; if (c.gone <= 0) { c.x = c.hx; c.y = c.hy; c.z = 0; } break; }
        if (outside && !player.hidden && ((pd < 60 && running) || pd < 26)) { heronFly(c, true); break; }
        // steal a fish left lying about
        const f = items.find((it) => it.kind === 'fish' && !it.held && !it.air && Math.hypot(it.x - c.x, it.y - c.y) < 140);
        if (f) {
          if (critterMove(c, f.x, f.y, 50, dt) || Math.hypot(f.x - c.x, f.y - c.y) < 8) { const i2 = items.indexOf(f); if (i2 >= 0) items.splice(i2, 1); c.bubble = { text: '*gulp*', t: 1 }; lookTowards(c.x, c.y, 200, () => 'That heron ate my fish!'); }
          break;
        }
        c.spearT -= dt;
        if (c.spearT <= 0) { c.spearT = rr(6, 11); c.spear = 0.5; splash(c.x + (c.dir === 'right' ? 12 : -12), c.y + 2, false); if (Math.random() < 0.5) c.bubble = { text: '*gulp*', t: 0.8 }; }
        c.spear = Math.max(0, (c.spear || 0) - dt);
        break;
      }
      case 'skyfrog': {
        if (c.z > 0) { c.vz -= 500 * dt; c.z = Math.max(0, c.z + c.vz * dt); if (c.z === 0) { particles.push({ kind: 'ring', x: c.x, y: c.y, r: 2, life: 0.6, max: 0.6 }); for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - c.x, v.y - c.y) < 40) startleV(v, rpick(['A FROG?! From the SKY?!', 'Eek! Frogs!', 'It’s raining frogs!'])); } break; }
        c.life -= dt; if (c.life <= 0) { c.dead = true; break; }
        if (outside && pd < 12) { c.dead = true; sparkle(c.x, c.y, 6); sfx('ribbit'); player.bubble = { text: 'caught a sky frog!', t: 1.2 }; completeTask('frograin'); break; }
        c.hopT -= dt;
        if (c.hopT <= 0) { c.hopT = rr(0.6, 1.6); c.hz = 1; const a = rand() * 6.3; c.tx = c.x + Math.cos(a) * 24; c.ty = c.y + Math.sin(a) * 16; if (Math.random() < 0.3 && pd < 260) sfx('ribbit'); }
        if (c.tx && critterMove(c, c.tx, c.ty, 50, dt)) c.tx = null;
        break;
      }
    }
  }
  function heronFly(c, scared) {
    if (c.gone > 0) return;
    c.gone = 18; c.bubble = { text: 'GRAAK!', t: 1 }; sfx('squawk'); sfx('flutter');
    if (scared) completeTask('heron');
  }
  function rainScare(c, x, y, r) {
    const real = r < 9999;
    if (c.type === 'snail') c.shell = 5;
    if (c.type === 'heron' && real) heronFly(c, true);
    if (c.type === 'blackbird' && !c.flying) { c.x += rr(-60, 60); c.y += rr(-40, 40); }
    if (c.type === 'ladybird' && c.onNose) { c.onNose = false; c.hx = player.x; c.hy = player.y; }
    if (c.type === 'seal' && real) { c.bubble = { text: 'ARF?!', t: 0.8 }; sfx('bark'); }
  }

  // --- Drawing -------------------------------------------------------------------------------------
  function drawRainCritter(ctx, c, t) {
    if (c.dead) return;
    if (c.type === 'snail' && !snailWeather()) return;
    if (c.type === 'heron' && c.gone > 0 && c.z > 110) return;
    ctx.save(); ctx.translate(c.x, c.y);
    const small = ['snail', 'worm', 'ladybird', 'dragonfly', 'skyfrog'].includes(c.type);
    if (c.type !== 'dragonfly' && c.type !== 'ladybird' && c.type !== 'otter') { ctx.fillStyle = 'rgba(20,30,10,0.2)'; ellipse(ctx, 0, 0, small ? 3 : c.type === 'seal' ? 12 : 7, small ? 1.2 : 2.4); }
    ctx.translate(0, -(c.z || 0));
    if (c.dir === 'left') ctx.scale(-1, 1);
    const step = c.moving ? Math.sin(c.walk * 2) * 2 : 0;
    switch (c.type) {
      case 'snail': {
        if (c.shell <= 0) { ctx.fillStyle = '#c9b090'; ellipse(ctx, 1, -1, 5, 1.6); ctx.strokeStyle = '#c9b090'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(4.5, -2); ctx.lineTo(6, -5); ctx.moveTo(5, -2); ctx.lineTo(7.5, -4.5); ctx.stroke(); }
        ctx.fillStyle = '#a0703f'; circle(ctx, -1, -3.5, 3.4); ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(-1, -3.5, 1.8, 0, Math.PI * 1.6); ctx.stroke();
        break;
      }
      case 'worm': { const w = Math.sin(c.ph * 6); ctx.strokeStyle = '#d98a8a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(0, -4 - w * 2, 3, -6 + w); ctx.stroke(); ctx.fillStyle = 'rgba(90,60,30,0.6)'; ellipse(ctx, -4, 0, 2.5, 1); break; }
      case 'blackbird': {
        const flap = c.flying ? Math.sin(c.walk) * 3 : 0;
        ctx.fillStyle = '#1d1d22'; ellipse(ctx, 0, -4, 4.5, 3.2); circle(ctx, 3.5, -6.5, 2.4); poly(ctx, [[-4, -4], [-8, -6], [-7, -2]]); ctx.fill();
        if (flap) { poly(ctx, [[-1, -5], [-5, -10 - flap], [2, -5]]); ctx.fill(); }
        ctx.fillStyle = '#f2a33a'; poly(ctx, [[5.5, -7], [8.5, -6.4], [5.5, -5.8]]); ctx.fill(); circle(ctx, 3.8, -7, 0.6);
        break;
      }
      case 'dragonfly': {
        const fl = Math.sin(t * 60) * 1.5;
        ctx.fillStyle = 'rgba(220,240,255,0.6)'; ellipse(ctx, -1, -1.5 - fl, 5, 1.4); ellipse(ctx, 1, -1.5 + fl, 5, 1.4);
        ctx.strokeStyle = c.col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(4, 0); ctx.stroke(); ctx.fillStyle = c.col; circle(ctx, 4.5, 0, 1.3);
        break;
      }
      case 'ladybird': { ctx.fillStyle = '#e8453c'; ellipse(ctx, 0, 0, 2.3, 1.9); ctx.fillStyle = '#1d1d22'; circle(ctx, 2, 0, 1); ctx.fillRect(-0.2, -1.9, 0.4, 3.8); circle(ctx, -1, -0.7, 0.45); circle(ctx, 0.9, 0.7, 0.45); break; }
      case 'crab': {
        ctx.fillStyle = '#e8592a'; ellipse(ctx, 0, -3, 5.5, 3.5);
        ctx.strokeStyle = '#e8592a'; ctx.lineWidth = 1; for (const s of [-1, 1]) for (const k of [0, 1, 2]) { ctx.beginPath(); ctx.moveTo(s * 4, -2 + k); ctx.lineTo(s * (7 + step * 0.3), 0 + k); ctx.stroke(); }
        const snip = c.pinchCD > 4 ? 1 : 0;
        ctx.fillStyle = '#e8592a'; circle(ctx, -6, -6 - snip * 2, 2); circle(ctx, 6, -6 - snip * 2, 2);
        ctx.fillStyle = '#1d1d22'; circle(ctx, -1.5, -6, 0.7); circle(ctx, 1.5, -6, 0.7);
        break;
      }
      case 'seal': {
        const clap = c.clap > 0 ? Math.sin(t * 20) * 3 : 0;
        ctx.fillStyle = '#7a7e88'; ellipse(ctx, 0, -5, 12, 5); ellipse(ctx, 9, -9, 5, 4.5);
        ctx.fillStyle = '#6a6e78'; poly(ctx, [[-11, -4], [-17, -8], [-16, -1]]); ctx.fill();
        poly(ctx, [[3, -4], [6, 0 - clap], [0, -1]]); ctx.fill(); poly(ctx, [[5, -4], [10, -1 + clap], [4, -2]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 11, -10, 0.9); circle(ctx, 13.6, -8.4, 0.8);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(13, -8); ctx.lineTo(16, -9); ctx.moveTo(13, -7.5); ctx.lineTo(16, -7); ctx.stroke();
        break;
      }
      case 'otter': {
        const roll = c.play > 0 ? Math.sin(t * 8) * 0.6 : 0;
        ctx.rotate(roll);
        ctx.fillStyle = 'rgba(200,230,255,0.4)'; ellipse(ctx, 0, 0, 10, 2.5);
        ctx.fillStyle = '#6b4a2e'; ellipse(ctx, -1, -2, 8, 3); circle(ctx, 7, -3.5, 3);
        ctx.fillStyle = '#c9a26a'; ellipse(ctx, 7.8, -2.6, 1.8, 1.3);
        ctx.fillStyle = '#1d1d22'; circle(ctx, 8, -4.5, 0.6); circle(ctx, 9.8, -3, 0.6);
        break;
      }
      case 'heron': {
        const fly = c.gone > 0, sp = c.spear > 0 ? 6 : 0;
        ctx.fillStyle = '#9aa0aa';
        if (!fly) { ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(-1, 0); ctx.moveTo(1, -12); ctx.lineTo(1.5, 0); ctx.stroke(); }
        ellipse(ctx, 0, -15, 6, 4);
        if (fly) { const f = Math.sin(c.walk) * 5; poly(ctx, [[-2, -16], [-14, -22 - f], [4, -16]]); ctx.fill(); }
        ctx.strokeStyle = '#d4d8de'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -16); ctx.quadraticCurveTo(8, -24, 6 + sp, -28 + sp * 2); ctx.stroke();
        ctx.fillStyle = '#f2c14e'; poly(ctx, [[6 + sp, -29 + sp * 2], [13 + sp, -27 + sp * 2.5], [6 + sp, -27 + sp * 2]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 6.5 + sp, -29.5 + sp * 2, 0.6); ctx.fillRect(4 + sp, -31 + sp * 2, 5, 0.8);
        break;
      }
      case 'skyfrog': {
        ctx.fillStyle = '#5aa848'; ellipse(ctx, 0, -2.5, 4, 2.8); ctx.fillStyle = '#4a8a3a'; circle(ctx, -2, -4.6, 1.3); circle(ctx, 2, -4.6, 1.3);
        ctx.fillStyle = '#1d1d22'; circle(ctx, -2, -4.8, 0.6); circle(ctx, 2, -4.8, 0.6);
        if (c.z > 0) { ctx.strokeStyle = '#5aa848'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(-6, 2); ctx.moveTo(3, -1); ctx.lineTo(6, 2); ctx.stroke(); }
        break;
      }
    }
    ctx.restore();
  }

  // --- Wild weather -------------------------------------------------------------------------------
  // Lightning strikes a tree near you: knocks things flying, startles everyone, sets the tree smoking
  function lightningStrike() {
    if (areaOf(player.x, player.y) !== 0) return;
    const dist = (o) => Math.hypot(o.x - player.x, o.y - player.y);
    let trees = objects.filter((o) => o.kind === 'tree' && o.y < WORLD_H && dist(o) > 40 && dist(o) < 200);
    if (!trees.length) trees = objects.filter((o) => o.kind === 'tree' && o.y < WORLD_H && dist(o) > 40 && dist(o) < 340);
    if (!trees.length) return;
    const tr = pick(trees);
    L.bolt = { x: tr.x, y: tr.y - 40, t: 0.35 }; tr.burnT = 7;
    L.burning = L.burning || []; L.burning.push(tr);
    run.shake = Math.max(run.shake, 0.5);
    for (const it of items) if (!it.held && !it.type.heavy && areaOf(it.x, it.y) === 0 && Math.hypot(it.x - tr.x, it.y - tr.y) < 70) { const a = Math.atan2(it.y - tr.y, it.x - tr.x); Object.assign(it, { air: true, vz: 200, vx: Math.cos(a) * 160, vy: Math.sin(a) * 100, kicker: 'bolt', planted: false }); }
    for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - tr.x, v.y - tr.y) < 160) startleV(v, rpick(['YIKES!', 'That was close!', 'The tree!']));
    const pd = Math.hypot(player.x - tr.x, player.y - tr.y);
    if (pd < 80) { knockPlayer(tr.x, tr.y, 200); player.zapT = 3; player.bubble = { text: 'bzzzt!', t: 1.4 }; }
    if (pd < 220) completeTask('lightning');
  }
  function drawBolt(ctx, top) {
    const B = L.bolt;
    if (!B || B.t <= 0) return;
    ctx.strokeStyle = `rgba(255,255,230,${Math.min(1, B.t * 4)})`; ctx.lineWidth = 3; ctx.beginPath();
    let x = B.x + rr(-30, 30), y = top - 10; ctx.moveTo(x, y);
    while (y < B.y) { y += 18; x += rr(-14, 14); ctx.lineTo(Math.abs(y - B.y) < 18 ? B.x : x, Math.min(y, B.y)); }
    ctx.stroke(); ctx.strokeStyle = 'rgba(200,220,255,0.5)'; ctx.lineWidth = 7; ctx.stroke();
  }
  // Floods: a downpour spreads the pond out over the low ground around it
  const inFlood = (x, y) => { const F = L && L.flood; if (!F || F.k <= 0.05 || areaOf(x, y) !== 0) return false; const dx = (x / TILE - L.pond.cx) / (L.pond.rx * (1 + 0.7 * F.k)), dy = (y / TILE - L.pond.cy) / (L.pond.ry * (1 + 0.7 * F.k)); return dx * dx + dy * dy < 1 && tileAt(x, y) !== WATER; };
  function drawFlood(ctx, t) {
    const F = L.flood;
    if (!F || F.k <= 0.05) return;
    const cx = L.pond.cx * TILE, cy = L.pond.cy * TILE, rx = L.pond.rx * TILE * (1 + 0.7 * F.k), ry = L.pond.ry * TILE * (1 + 0.7 * F.k);
    ctx.fillStyle = `rgba(80,130,170,${0.32 * Math.min(1, F.k * 1.5)})`; ellipse(ctx, cx, cy, rx, ry);
    ctx.strokeStyle = `rgba(220,240,255,${0.4 * F.k})`; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { const s = 0.92 + ((t * 0.05 + k * 0.33) % 0.12); ctx.beginPath(); ctx.ellipse(cx, cy, rx * s, ry * s, 0, 0, Math.PI * 2); ctx.stroke(); }
  }

  // --- Per frame -------------------------------------------------------------------------------------
  function updateRainy(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    // worms come up in the rain
    if (wet() && !isWinter() && outside) {
      L.wormT -= dt;
      if (L.wormT <= 0) {
        L.wormT = rr(2, 4);
        if (critters.filter((c) => c.type === 'worm' && !c.dead).length < 4) for (let n = 0; n < 20; n++) {
          const x = player.x + rr(-220, 220), y = player.y + rr(-160, 160);
          if ([GRASS, SOIL].includes(tileAt(x, y)) && !navBlockedPt(x, y) && areaOf(x, y) === 0) { critters.push({ type: 'worm', x, y, z: 0, dir: 'right', walk: 0, ph: Math.random() * 6, life: rr(6, 10) }); break; }
        }
      }
    }
    // a rain of frogs
    if (L.weather === 'frograin' && outside) {
      L.frogT -= dt;
      if (L.frogT <= 0 && critters.filter((c) => c.type === 'skyfrog').length < 18) {
        L.frogT = rr(0.4, 1);
        const x = player.x + rr(-260, 260), y = player.y + rr(-180, 180);
        if (!navBlockedPt(x, y) && areaOf(x, y) === 0) critters.push({ type: 'skyfrog', x, y, z: 200, vz: 0, dir: Math.random() < 0.5 ? 'left' : 'right', walk: 0, ph: 0, life: rr(14, 22), hopT: rr(0.5, 1.5), tx: null });
      }
    }
    // spider webs: walk through one
    for (const o of L.webs || []) if (!o.broken && outside && Math.hypot(player.x - o.x, player.y - o.y) < 12) { o.broken = true; player.bubble = { text: 'ew! cobwebs!', t: 1.2 }; sfx('rustle'); completeTask('web'); }
    // lightning aftermath
    if (L.bolt) L.bolt.t -= dt;
    for (const tr of L.burning || []) { tr.burnT -= dt; if (tr.burnT > 0 && Math.random() < dt * 8) particles.push({ x: tr.x + rr(-14, 14), y: tr.y - rr(30, 60), r: rr(3, 6), life: 1.4, max: 1.4, vy: -18, soil: true }); }
    if (player.zapT > 0) { player.zapT -= dt; if (Math.random() < dt * 10) particles.push({ kind: 'spark', x: player.x + rr(-8, 8), y: player.y, z: rr(6, 20), vx: rr(-20, 20), vy: 0, vz: rr(20, 50), life: 0.4, max: 0.4 }); }
    // floods during a downpour
    if (L.kind !== 'seaside') {
      L.flood = L.flood || { k: 0 };
      L.flood.k = clamp(L.flood.k + dt * (L.weather === 'downpour' ? 0.025 : -0.01), 0, 1);
      if (inFlood(player.x, player.y) && player.speed > 20) { if (Math.random() < dt * 8) particles.push({ kind: 'drop', x: player.x, y: player.y, z: 1, vx: rr(-30, 30), vy: rr(-15, 15), vz: rr(30, 70), life: 0.5, max: 0.5 }); completeTask('flood'); }
      for (const it of items) if (!it.held && !it.air && !it.type.heavy && inFlood(it.x, it.y)) { it.x += Math.sin(time * 0.5 + it.ph0) * 6 * dt; it.y += Math.cos(time * 0.4 + it.ph0) * 4 * dt; }
    }
    // the wind snatches umbrellas
    if (['rain', 'storm', 'downpour', 'frograin'].includes(L.weather)) {
      L.gustT = (L.gustT === undefined ? rr(8, 16) : L.gustT) - dt;
      if (L.gustT <= 0) {
        L.gustT = rr(18, 30);
        const v = pick(villagers.filter((v) => areaOf(v.x, v.y) === 0 && !v.noBrella && v.state !== 'chase' && Math.hypot(v.x - player.x, v.y - player.y) < 420) || []);
        if (v) {
          v.noBrella = true;
          const a = rr(0, Math.PI * 2), it = addItem('umbrella', v.x, v.y, { owner: v.id });
          Object.assign(it, { z: 40, air: true, vz: 140, vx: Math.cos(a) * 140, vy: Math.sin(a) * 80, spin: 6, kicker: 'wind', blown: true });
          startleV(v, rpick(['My umbrella!', 'Oh no, come back!', 'Blasted wind!']), { state: 'fetch', target: it }); v.stateT = 15;
          sfx('whoosh');
        }
      }
    }
    for (const v of villagers) if (v.noBrella && v.held && v.held.kind === 'umbrella' && v.held.owner === v.id) v.noBrella = false; // got it back
    // overflowing gutters
    if (wet()) for (const h of L.houses) {
      const sx = h.x * TILE + 8, sy = (h.y + h.h) * TILE + 6;
      for (const v of villagers) {
        if (areaOf(v.x, v.y) !== 0 || Math.abs(v.x - sx) > 9 || Math.abs(v.y - sy) > 9 || (v.gutterCD || 0) > time) continue;
        v.gutterCD = time + 4; const chasing = v.state === 'chase';
        for (let k = 0; k < 8; k++) particles.push({ kind: 'drop', x: v.x, y: v.y, z: 30, vx: rr(-30, 30), vy: rr(-10, 10), vz: rr(0, 40), life: 0.6, max: 0.6 });
        say(v, rpick(['EEK! The gutter!', 'Brrr! Right down my neck!']), 1.4);
        if (chasing) { completeTask('gutter'); startleV(v, 'GAH!'); }
      }
      if (outside && Math.abs(player.x - sx) < 9 && Math.abs(player.y - sy) < 9) { player.mud = 0; player.flour = 0; }
    }
    // muddy villagers' footprints on rainy days
    if (wet() && !isWinter()) {
      L.vPrintT = (L.vPrintT || 0) - dt;
      if (L.vPrintT <= 0) { L.vPrintT = 0.3; for (const v of villagers) if (v.moving && areaOf(v.x, v.y) === 0 && Math.hypot(v.x - player.x, v.y - player.y) < 500 && [PATH, GRASS, SOIL].includes(tileAt(v.x, v.y))) particles.push({ kind: 'shoeprint', x: v.x + rr(-3, 3), y: v.y, life: 10, max: 10 }); }
    }
    // the eclipse
    if (L.eclipse && !L.night) {
      const prog = 1 - run.timeLeft / run.timeTotal, E = L.eclipse, on = prog >= E.at && prog < E.at + E.dur / run.timeTotal;
      if (on && !L.eclipseOn) {
        toast('The sun’s going dark... an eclipse!', 'Whoa', true);
        for (const v of villagers) if (areaOf(v.x, v.y) === 0) say(v, rpick(['Ooh, an eclipse!', 'Look at the sun!', 'Goodness, it’s gone dark!']), 2);
      }
      if (!on && L.eclipseOn) toast('The sun’s coming back', 'Eclipse over', true);
      L.eclipseOn = on;
    }
  }
  function drawRainyGround(ctx) {
    for (const q of particles) {
      if (q.kind === 'slime') { ctx.fillStyle = `rgba(220,235,245,${(q.life / q.max) * 0.5})`; ellipse(ctx, q.x, q.y, 2.4, 0.9); }
      else if (q.kind === 'shoeprint') { ctx.fillStyle = `rgba(90,58,30,${(q.life / q.max) * 0.45})`; ellipse(ctx, q.x, q.y, 1.8, 3); }
    }
  }
  function drawGutters(ctx, h) {
    if (!wet()) return;
    const sx = h.x * TILE + 8, top = h.obj.wallTop - 2, by = (h.y + h.h) * TILE + 6;
    ctx.fillStyle = '#7a7f88'; ctx.fillRect(sx - 4, top - 2, 8, 3);
    ctx.fillStyle = 'rgba(190,220,245,0.6)';
    for (let k = 0; k < 3; k++) { const y = top + ((time * 160 + k * 20) % (by - top)); ctx.fillRect(sx - 1.5, y, 3, 8); }
    ctx.fillStyle = 'rgba(190,220,245,0.4)'; ellipse(ctx, sx, by, 7, 2.5);
  }
  // A chitter in a puddle: SPLOSH
  function puddleJump() {
    if (!L.puddles || areaOf(player.x, player.y) !== 0) return;
    for (const p of L.puddles) {
      const dx = (player.x - p.x) / p.rx, dy = (player.y - p.y) / p.ry;
      if (dx * dx + dy * dy > 1) continue;
      for (let k = 0; k < 18; k++) particles.push({ kind: 'drop', x: player.x, y: player.y, z: 2, vx: rr(-80, 80), vy: rr(-40, 40), vz: rr(80, 160), life: 0.7, max: 0.7 });
      sfx('splash'); completeTask('puddlejump');
      player.mud = 0;
      for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - player.x, v.y - player.y) < 60 && startleV(v, rpick(['I’m SOAKED!', 'You little splasher!']))) completeTask('soak');
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Mountain, canal and orchard villages, and funfair days.
  // Rides (cable car, narrowboats, carousel, big wheel) share player.ride.
  // ---------------------------------------------------------------------------
  Object.assign(ITEM, {
    boulder: { name: 'boulder', h: 14, r: 9, heavy: true, draw(c) { c.fillStyle = '#8a8578'; ellipse(c, 0, -7, 9, 7.5); c.fillStyle = '#a8a396'; ellipse(c, -2.5, -9.5, 4, 3); c.fillStyle = '#6a665c'; ellipse(c, 3, -4, 3, 2); } },
    cider: { name: 'jug of cider', h: 13, r: 5, draw(c) { c.fillStyle = '#c9a26a'; roundRect(c, -5, -11, 10, 11, 3, true); c.fillStyle = '#e8b04a'; c.fillRect(-4, -7, 8, 5); c.fillStyle = '#7a5230'; c.fillRect(-1.5, -14, 3, 3); } },
    ring: { name: 'gold ring', h: 5, r: 3, draw(c) { c.strokeStyle = '#f2c14e'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, -3, 3, 2.2, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#5ac8d8'; circle(c, 0, -5.4, 1.3); } },
    candyfloss: { name: 'candyfloss', h: 14, r: 4, draw(c) { c.fillStyle = '#f4f2ee'; c.fillRect(-0.6, -6, 1.2, 6); c.fillStyle = '#f8c4d8'; circle(c, 0, -9, 4.5); circle(c, -2.5, -11, 3); circle(c, 2.5, -11.5, 3); } },
    prizebear: { name: 'prize teddy', h: 14, r: 6, draw(c) { c.fillStyle = '#e8a0b8'; circle(c, 0, -5, 5); circle(c, 0, -11, 4); circle(c, -3.5, -14, 1.6); circle(c, 3.5, -14, 1.6); c.fillStyle = '#1d1d22'; circle(c, -1.3, -11.5, 0.6); circle(c, 1.3, -11.5, 0.6); c.fillStyle = '#4f93c7'; c.fillRect(-3, -8, 6, 1.6); } },
  });
  Object.assign(FOOD, { cider: { bites: 1, fill: 15, drink: true }, candyfloss: { bites: 2, fill: 10, sweet: true } });

  // --- Mountain: a rocky slope, a cave, a cable car to the lookout ------------------------------
  const onSlope = (x, y) => { const S = L && L.slope; return !!S && x > S.x * TILE && x < (S.x + S.w) * TILE && y > S.y * TILE && y < (S.y + S.h) * TILE; };
  function makeSlope(S) {
    const X = S.x * TILE, Y = S.y * TILE, W = S.w * TILE, H = S.h * TILE;
    const rocks = Array.from({ length: 14 }, () => [X + rr(10, W - 10), Y + rr(10, H - 10), rr(4, 9)]);
    return {
      kind: 'slope', x: X + W / 2, y: Y - 60, bounds: { l: X - 20, r: X + W + 20, t: Y - 30, b: Y + H + 10 },
      draw(ctx) {
        const g = ctx.createLinearGradient(0, Y, 0, Y + H);
        g.addColorStop(0, isWinter() ? '#f4f8fb' : '#a8a396'); g.addColorStop(1, isWinter() ? '#d8e4ee' : '#8a9a6a');
        ctx.fillStyle = g; roundRect(ctx, X, Y, W, H, 24, true);
        ctx.strokeStyle = 'rgba(70,60,50,0.3)'; ctx.lineWidth = 1.5;
        for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(X + 12, Y + k * H / 6); ctx.lineTo(X + W * 0.4, Y + k * H / 6 + 6); ctx.lineTo(X + W - 12, Y + k * H / 6 - 3); ctx.stroke(); }
        for (const [rx, ry, r] of rocks) { ctx.fillStyle = '#7a756a'; ellipse(ctx, rx, ry, r, r * 0.6); ctx.fillStyle = '#9a958a'; ellipse(ctx, rx - 1, ry - 1.5, r * 0.6, r * 0.35); }
        ctx.fillStyle = '#5a5248'; ctx.fillRect(X + W / 2 - 1, Y - 2, 2, 22); ctx.fillStyle = '#f4e3b8'; roundRect(ctx, X + W / 2 - 22, Y - 4, 44, 11, 2, true);
        ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LOOKOUT', X + W / 2, Y + 4);
      },
    };
  }
  function makeCave(x, y) {
    const o = {
      kind: 'cave', x, y, r: 22, hitbox: box(x - 40, y - 26, 80, 14), rustle: 0, bounds: { l: x - 50, r: x + 50, t: y - 80, b: y + 6 },
      contains(px, py) { return Math.abs(px - x) < 14 && py > y - 12 && py < y + 2; },
      draw(ctx) {
        ctx.fillStyle = '#7a756a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 48, 52, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#9a958a'; ctx.beginPath(); ctx.ellipse(x - 10, y - 30, 26, 20, 0, Math.PI, 0); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; ellipse(ctx, x, y - 54, 26, 6); }
        ctx.fillStyle = '#14100c'; ctx.beginPath(); ctx.ellipse(x, y, 18, 26, 0, Math.PI, 0); ctx.fill();
        if (player.hidden && player.hidingIn === o) { ctx.fillStyle = '#ffffff'; circle(ctx, x - 3, y - 12, 1.6); circle(ctx, x + 3, y - 12, 1.6); ctx.fillStyle = NOSE; circle(ctx, x - 3, y - 12, 0.8); circle(ctx, x + 3, y - 12, 0.8); }
      },
    };
    return o;
  }
  function makeCableStation(x, y, top) {
    return {
      kind: 'cablestation', x, y, hitbox: box(x - 8, y - 6, 16, 7), bounds: { l: x - 20, r: x + 20, t: y - 80, b: y + 4 },
      draw(ctx) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 3, y - 64, 6, 64); ctx.fillRect(x - 14, y - 66, 28, 4);
        ctx.fillStyle = '#c0392b'; roundRect(ctx, x - 12, y - 18, 24, 18, 3, true); ctx.fillStyle = '#f4e3b8'; ctx.fillRect(x - 9, y - 14, 18, 7);
        ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(top ? 'DOWN' : 'UP', x, y - 9);
      },
    };
  }
  function makeCableLine() {
    const C = L.cable;
    return {
      kind: 'cableline', x: (C.a.x + C.b.x) / 2, y: Math.min(C.a.y, C.b.y) - 1, bounds: { l: Math.min(C.a.x, C.b.x) - 30, r: Math.max(C.a.x, C.b.x) + 30, t: Math.min(C.a.y, C.b.y) - 90, b: Math.max(C.a.y, C.b.y) },
      draw(ctx) {
        ctx.strokeStyle = '#3a3530'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(C.a.x, C.a.y - 64); ctx.lineTo(C.b.x, C.b.y - 64); ctx.stroke();
        if (player.ride && player.ride.kind === 'cable') return;
        const P = C.at === 'b' ? C.b : C.a; drawGondola(ctx, P.x, P.y - 44);
      },
    };
  }
  function drawGondola(ctx, x, y) {
    ctx.strokeStyle = '#3a3530'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 10); ctx.stroke();
    ctx.fillStyle = '#c0392b'; roundRect(ctx, x - 11, y - 10, 22, 16, 4, true);
    ctx.fillStyle = '#bfe4f2'; ctx.fillRect(x - 8, y - 7, 16, 6);
  }

  // --- Canal: a straight canal with a towpath, a lock, narrowboats and humpback bridges ----------
  function buildCanal() {
    if (L.kind !== 'canal') return;
    const south = L.roadY + 14 < MH - 5;
    const cy = south ? L.roadY + 10 : L.roadY - 13;
    if (cy < 4) return;
    for (let x = 2; x < MW - 2; x++) {
      for (let y = cy; y < cy + 3; y++) { const t0 = getT(x, y); setT(x, y, t0 === PATH || t0 === BRIDGE ? BRIDGE : WATER); }
      const tp = getT(x, cy - 1); if (tp === GRASS || tp === SAND) setT(x, cy - 1, PATH);
      reserve(x, cy - 1, 1, 5);
    }
    const lx = L.roadX + (L.roadX + 16 < MW - 4 ? 6 : -11);
    L.canal = { y: cy, mid: (cy + 1.5) * TILE, lock: { x0: lx * TILE, x1: (lx + 5) * TILE, y0: cy * TILE, y1: (cy + 3) * TILE, level: 1, target: 1, lever: { x: (lx + 2.5) * TILE, y: (cy - 0.5) * TILE }, ringOut: false } };
  }
  function makeLockObj() {
    const K = L.canal.lock;
    return {
      kind: 'lock', x: (K.x0 + K.x1) / 2, y: K.y1 + 0.5, bounds: { l: K.x0 - 10, r: K.x1 + 10, t: K.y0 - 40, b: K.y1 + 6 },
      draw(ctx, t) {
        const drop = (1 - K.level) * 14;
        ctx.fillStyle = `rgba(80,65,45,${(1 - K.level) * 0.8})`; ctx.fillRect(K.x0, K.y0, K.x1 - K.x0, K.y1 - K.y0); // the mud floor showing
        ctx.fillStyle = '#9a958a'; ctx.fillRect(K.x0, K.y0, K.x1 - K.x0, drop * 0.6); // wet stone walls
        ctx.fillStyle = 'rgba(79,147,199,0.5)'; if (K.level > 0.05) ctx.fillRect(K.x0, K.y0 + drop * 0.6, K.x1 - K.x0, (K.y1 - K.y0 - drop * 0.6) * K.level);
        for (const gx of [K.x0, K.x1]) { ctx.fillStyle = '#5a3a20'; ctx.fillRect(gx - 4, K.y0 - 8, 8, K.y1 - K.y0 + 8); ctx.fillStyle = '#7a5230'; ctx.fillRect(gx - 22, K.y0 - 12, 26, 5); }
        const lv = K.lever, a = K.target ? -0.6 : 0.6;
        ctx.fillStyle = '#3a3530'; ctx.fillRect(lv.x - 5, lv.y - 4, 10, 5);
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(lv.x, lv.y - 3); ctx.lineTo(lv.x + Math.sin(a) * 14, lv.y - 3 - Math.cos(a) * 14); ctx.stroke();
      },
    };
  }
  function makeNarrowboat(B) {
    return {
      kind: 'narrowboat', get x() { return B.x; }, get y() { return B.y; },
      get bounds() { return { l: B.x - 60, r: B.x + 60, t: B.y - 30, b: B.y + 10 }; },
      draw(ctx) {
        const x = B.x, y = B.y;
        ctx.fillStyle = 'rgba(200,230,255,0.4)'; ellipse(ctx, x, y + 2, 58, 6);
        ctx.fillStyle = '#2b2d33'; roundRect(ctx, x - 56, y - 8, 112, 10, 4, true);
        ctx.fillStyle = B.col; ctx.fillRect(x - 46, y - 22, 80, 14);
        ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 46, y - 10, 80, 2);
        ctx.fillStyle = '#bfe4f2'; for (let k = 0; k < 4; k++) circle(ctx, x - 36 + k * 18, y - 15, 3);
        ctx.fillStyle = '#7a4f3a'; ctx.fillRect(x - 48, y - 24, 84, 3);
        ctx.fillStyle = '#3f7f6a'; for (let k = 0; k < 3; k++) circle(ctx, x - 40 + k * 10, y - 26, 2.5); // pot plants on the roof
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(x + 30, y - 34, 3, 12); // chimney
      },
    };
  }
  function makeHumpBridge(x, y) {
    return {
      kind: 'humpbridge', x, y: y + TILE * 1.6, bounds: { l: x - 40, r: x + 40, t: y - 40, b: y + TILE * 2 },
      draw(ctx) {
        for (const s of [-1, 1]) { ctx.fillStyle = '#9a958a'; ctx.beginPath(); ctx.moveTo(x + s * 34, y + TILE * 1.6); ctx.quadraticCurveTo(x + s * 38, y - 8, x + s * 34, y - TILE * 1.6); ctx.lineTo(x + s * 28, y - TILE * 1.6); ctx.quadraticCurveTo(x + s * 32, y - 8, x + s * 28, y + TILE * 1.6); ctx.fill(); }
      },
    };
  }

  // --- Orchard: fruit trees to shake, a cider press; a hedge maze ---------------------------------
  function makeFruitTree(x, y) {
    const T0 = { x, y, apples: 4, cd: 0 };
    (L.fruitTrees = L.fruitTrees || []).push(T0);
    return {
      kind: 'fruittree', x, y, hitbox: box(x - 6, y - 5, 12, 6), bounds: { l: x - 30, r: x + 30, t: y - 70, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.25)'; ellipse(ctx, x + 8, y, 24, 7); },
      draw(ctx, t) {
        const sh = T0.cd > 4 ? Math.sin(t * 40) * 2 : 0;
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - 4, y - 30, 8, 30);
        const leaf = isWinter() ? null : L.season === 'autumn' ? '#b08a2a' : '#4e8c2f';
        if (leaf) { ctx.fillStyle = leaf; circle(ctx, x - 12 + sh, y - 40, 15); circle(ctx, x + 12 + sh, y - 42, 14); circle(ctx, x + sh, y - 54, 17); }
        else { ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x - 14, y - 50); ctx.moveTo(x, y - 30); ctx.lineTo(x + 12, y - 54); ctx.stroke(); }
        if (leaf && L.season !== 'spring') { ctx.fillStyle = '#e8453c'; for (let k = 0; k < T0.apples; k++) circle(ctx, x - 12 + k * 8 + sh, y - 44 + (k % 2) * 8, 2.6); }
        if (L.season === 'spring') { ctx.fillStyle = '#ffd1e3'; for (let k = 0; k < 7; k++) circle(ctx, x - 16 + k * 5 + sh, y - 46 + (k % 3) * 6, 2); }
      },
    };
  }
  function shakeTree(T0) {
    if (T0.cd > 0) return;
    T0.cd = 5; sfx('rustle'); completeTask('shake');
    const n = Math.min(T0.apples, 2);
    if (L.season === 'spring' || isWinter() || n === 0) { player.bubble = { text: 'no apples...', t: 1 }; return; }
    T0.apples -= n;
    for (let k = 0; k < n; k++) {
      const it = addItem('apple', T0.x + rr(-22, 22), T0.y + rr(4, 26), { owner: 'bertram' });
      Object.assign(it, { z: 50, air: true, vz: 0, vx: 0, vy: 0, kicker: 'tree' });
      for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - it.x, v.y - it.y) < 24) { if (startleV(v, rpick(['OW! Apples!', 'Bonk! My head!', 'Who’s shaking the tree?!']))) completeTask('appleconk'); }
    }
  }
  function makeCiderPress(x, y) {
    const P = { x, y, n: 0 };
    L.press = P;
    return {
      kind: 'press', x, y, hitbox: box(x - 14, y - 8, 28, 9), bounds: { l: x - 22, r: x + 22, t: y - 50, b: y + 4 },
      draw(ctx) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 14, y - 18, 28, 18); ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 3, y - 42, 6, 26); ctx.fillRect(x - 16, y - 44, 32, 4);
        ctx.fillStyle = '#a0703f'; ctx.fillRect(x - 10, y - 26, 20, 8); // the hopper
        ctx.fillStyle = '#e8453c'; for (let k = 0; k < P.n; k++) circle(ctx, x - 6 + k * 6, y - 27, 2.5);
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x - 18, y - 12, 36, 9, 2, true); ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 5.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CIDER PRESS', x, y - 5.8);
      },
    };
  }
  function makeHedge(tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    return {
      kind: 'hedge', x: x + TILE / 2, y: y + TILE, hitbox: box(x, y + 2, TILE, TILE - 2), bounds: { l: x - 4, r: x + TILE + 4, t: y - 24, b: y + TILE + 2 },
      draw(ctx) {
        const c = isWinter() ? ['#3a5a42', '#4a6a52'] : L.season === 'autumn' ? ['#5a6a2a', '#6e7e36'] : ['#2f6b2a', '#3f8a35'];
        ctx.fillStyle = c[0]; ctx.fillRect(x, y - 18, TILE, TILE + 18);
        ctx.fillStyle = c[1]; ctx.fillRect(x, y - 18, TILE, 8);
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; ctx.fillRect(x, y - 18, TILE, 3); }
      },
    };
  }
  function buildMaze(markSolid, place) {
    const r = place(13, 13);
    if (!r) return;
    const n = 5, ox = r.x + 1, oy = r.y + 1, N = 2 * n + 1;
    const wall = Array.from({ length: N }, () => Array(N).fill(true));
    const seen = Array.from({ length: n }, () => Array(n).fill(false));
    const stack = [[2, 2]]; seen[2][2] = true; wall[5][5] = false;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = shuffled([[1, 0], [-1, 0], [0, 1], [0, -1]]).map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && !seen[y][x]);
      if (!nb.length) { stack.pop(); continue; }
      const [x, y, dx, dy] = nb[0];
      seen[y][x] = true; wall[2 * y + 1][2 * x + 1] = false; wall[2 * cy + 1 - 0 + dy][2 * cx + 1 + dx] = false;
      stack.push([x, y]);
    }
    // entrance on the side nearest the plaza
    const south = oy + N / 2 < L.plaza.y + 6;
    const ex = 5; wall[south ? N - 1 : 0][ex] = false;
    L.maze = { ox, oy, N, wall, entrance: { x: ox + ex, y: south ? oy + N : oy - 1 }, center: { x: (ox + 5.5) * TILE, y: (oy + 5.6) * TILE } };
    reserve(r.x, r.y, 13, 13);
    markSolid(ox, oy, N, N);
  }
  const inMaze = (x, y) => { const M = L && L.maze; return !!M && x > M.ox * TILE && x < (M.ox + M.N) * TILE && y > M.oy * TILE && y < (M.oy + M.N) * TILE; };

  // --- Funfair --------------------------------------------------------------------------------------
  function makeCarousel(x, y) {
    return {
      kind: 'carousel', x, y: y + 22, bounds: { l: x - 60, r: x + 60, t: y - 90, b: y + 30 },
      draw(ctx, t) {
        const a0 = t * 0.8;
        ctx.fillStyle = '#c9a33a'; ellipse(ctx, x, y + 6, 54, 24); ctx.fillStyle = '#f2d06a'; ellipse(ctx, x, y + 2, 52, 22);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 3, y - 64, 6, 66);
        for (let k = 0; k < 6; k++) {
          const a = a0 + k * Math.PI / 3, hx = x + Math.cos(a) * 38, hy = y + Math.sin(a) * 16, bob = Math.sin(t * 3 + k) * 4;
          ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx, hy - 54); ctx.lineTo(hx, hy); ctx.stroke();
          ctx.fillStyle = ['#ffffff', '#f2b8c6', '#9ad1ff'][k % 3]; roundRect(ctx, hx - 8, hy - 22 + bob, 16, 8, 4, true); roundRect(ctx, hx + (Math.cos(a) > 0 ? 4 : -9), hy - 28 + bob, 5, 8, 2, true);
        }
        for (let k = 0; k < 12; k++) { ctx.fillStyle = k % 2 ? '#c0392b' : '#f4f2ee'; poly(ctx, [[x, y - 84], [x + Math.cos(k / 12 * Math.PI * 2) * 58, y - 58 + Math.sin(k / 12 * Math.PI * 2) * 12], [x + Math.cos((k + 1) / 12 * Math.PI * 2) * 58, y - 58 + Math.sin((k + 1) / 12 * Math.PI * 2) * 12]]); ctx.fill(); }
        ctx.fillStyle = '#f2c14e'; circle(ctx, x, y - 86, 3);
      },
    };
  }
  function makeBigWheel(x, y) {
    return {
      kind: 'bigwheel', x, y, hitbox: box(x - 24, y - 8, 48, 9), bounds: { l: x - 80, r: x + 80, t: y - 150, b: y + 6 },
      draw(ctx, t) {
        const cx = x, cy = y - 72, R = 58, a0 = t * 0.35;
        ctx.strokeStyle = '#8a8e96'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 24, y); ctx.lineTo(cx, cy); ctx.lineTo(x + 24, y); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#c0392b'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1; for (let k = 0; k < 8; k++) { const a = a0 + k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
        for (let k = 0; k < 8; k++) { const a = a0 + k * Math.PI / 4; ctx.fillStyle = ['#f2c14e', '#4f93c7', '#3fae5a', '#e8453c'][k % 4]; roundRect(ctx, cx + Math.cos(a) * R - 6, cy + Math.sin(a) * R, 12, 10, 3, true); }
        ctx.fillStyle = '#f2c14e'; circle(ctx, cx, cy, 4);
      },
    };
  }
  function makeCoconutShy(x, y) {
    const S = { x, y, nuts: [true, true, true] };
    L.shy = S;
    return {
      kind: 'coconutshy', x, y, hitbox: box(x - 40, y - 34, 80, 10), bounds: { l: x - 48, r: x + 48, t: y - 90, b: y + 4 },
      draw(ctx) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 44, y - 70, 3, 44); ctx.fillRect(x + 41, y - 70, 3, 44);
        for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#f4f2ee' : '#3f7f6a'; ctx.fillRect(x - 46 + k * 11.5, y - 76, 11.5, 8); }
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x - 28, y - 66, 56, 10, 2, true); ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('COCONUT SHY', x, y - 59);
        for (let k = 0; k < 3; k++) { const px = x - 24 + k * 24; ctx.fillStyle = '#c9a26a'; ctx.fillRect(px - 1.5, y - 44, 3, 16); if (S.nuts[k]) { ctx.fillStyle = '#6b4a2e'; circle(ctx, px, y - 48, 5); ctx.fillStyle = '#4a3220'; circle(ctx, px - 1.5, y - 49.5, 0.9); circle(ctx, px + 1.5, y - 49.5, 0.9); } }
        ctx.fillStyle = '#a0703f'; ctx.fillRect(x - 40, y - 30, 80, 6);
      },
    };
  }
  function makeCandyStand(x, y) {
    return {
      kind: 'candystand', x, y, hitbox: box(x - 18, y - 8, 36, 9), bounds: { l: x - 26, r: x + 26, t: y - 60, b: y + 4 },
      draw(ctx) {
        ctx.fillStyle = '#f2b8c6'; ctx.fillRect(x - 18, y - 22, 36, 22); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 18, y - 22, 36, 3);
        for (let k = 0; k < 5; k++) { ctx.fillStyle = k % 2 ? '#ffffff' : '#e8a0b8'; ctx.fillRect(x - 22 + k * 8.8, y - 48, 8.8, 7); }
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 20, y - 48, 2, 26); ctx.fillRect(x + 18, y - 48, 2, 26);
        ctx.fillStyle = '#c0397a'; ctx.font = 'bold 5.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CANDYFLOSS', x, y - 9);
      },
    };
  }
  function makeMirrorTent(x, y) {
    const o = {
      kind: 'mirrortent', x, y, r: 26, hitbox: null, rustle: 0, bounds: { l: x - 46, r: x + 46, t: y - 80, b: y + 6 },
      contains(px, py) { const dx = (px - x) / 26, dy = (py - (y - 8)) / 12; return dx * dx + dy * dy < 1; },
      draw(ctx, t) {
        for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#7a4f8f' : '#f2c14e'; poly(ctx, [[x, y - 74], [x - 40 + k * 10, y], [x - 30 + k * 10, y]]); ctx.fill(); }
        ctx.fillStyle = '#1d1426'; ctx.beginPath(); ctx.ellipse(x, y, 12, 22, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x - 30, y - 42, 60, 10, 2, true); ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 5.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HALL OF MIRRORS', x, y - 35);
        if (player.hidingIn === o) { // reflections everywhere
          ctx.globalAlpha = 0.45;
          for (const [dx, dy, s] of [[-44, 14, -1], [44, 10, 1], [-24, 26, 1], [28, 28, -1]]) { const save = { x: player.x, y: player.y, dir: player.dir }; player.x = x + dx + Math.sin(t * 2 + dx) * 3; player.y = y + dy; player.dir = s > 0 ? 'right' : 'left'; drawRaccoon(ctx, player, t); Object.assign(player, save); }
          ctx.globalAlpha = 1;
        }
      },
    };
    return o;
  }

  // --- Building (early: needs room) -------------------------------------------------------------------
  function buildMoreEarly(markSolid, place) {
    const T = TILE;
    L.slope = null; L.cave = null; L.cable = null; L.orchard = null; L.maze = null;
    if (L.kind === 'mountain') {
      const r = place(8, 11);
      if (r) {
        L.slope = { x: r.x + 1, y: r.y + 1, w: 6, h: 9 };
        L.cable = { a: { x: (r.x + 0.2) * T, y: (r.y + 10.4) * T }, b: { x: (r.x + 4) * T, y: (r.y + 2.2) * T }, at: 'a' };
      }
      const c = place(5, 4);
      if (c) { L.cave = { x: (c.x + 2.5) * T, y: (c.y + 3) * T }; markSolid(c.x + 1, c.y + 1, 3, 1); }
    }
    if (L.kind === 'orchard') {
      const o = place(11, 8);
      if (o) L.orchard = { x: o.x, y: o.y };
      buildMaze(markSolid, place);
    }
  }
  function placeMoreObjects() {
    const T = TILE;
    if (L.slope) {
      objects.push(makeSlope(L.slope));
      objects.push(makeCableStation(L.cable.a.x, L.cable.a.y, false)); objects.push(makeCableStation(L.cable.b.x, L.cable.b.y, true)); objects.push(makeCableLine());
    }
    if (L.cave) { const o = makeCave(L.cave.x, L.cave.y); objects.push(o); }
    if (L.canal) {
      const C = L.canal, K = C.lock;
      objects.push(makeLockObj());
      L.boats = [];
      const pounds = [[3 * T, K.x0 - 70], [K.x1 + 70, WORLD_W - 3 * T]];
      pounds.forEach(([a, b], i) => { if (b - a > 200) { const B = { x: a + (b - a) * rr(0.3, 0.7), y: C.mid + 6, min: a + 60, max: b - 60, dir: i ? -1 : 1, col: ['#2f6b5a', '#7a2e3a'][i] }; L.boats.push(B); objects.push(makeNarrowboat(B)); } });
      objects.push(makeHumpBridge((L.roadX + 1) * T, C.mid));
    }
    if (L.orchard) {
      const O = L.orchard;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) objects.push(makeFruitTree((O.x + 1.5 + i * 2.6) * T, (O.y + 2 + j * 2.4) * T));
      const s = freeSpotNear(O.x + 12, O.y + 4, 2, 1, 4) || freeSpotNear(O.x - 3, O.y + 4, 2, 1, 4);
      if (s) objects.push(makeCiderPress((s[0] + 1) * T, (s[1] + 0.8) * T));
    }
    if (L.maze) { const M = L.maze; for (let y = 0; y < M.N; y++) for (let x = 0; x < M.N; x++) if (M.wall[y][x]) objects.push(makeHedge(M.ox + x, M.oy + y)); }
    if (L.event === 'funfair') {
      const P = L.plaza, at = (w, h, tx, ty) => freeSpotNear(tx, ty, w, h, 9) || randomFreeSpot(w, h);
      L.fair = {};
      const c = at(4, 3, P.x + 15, P.y + 2); if (c) { L.fair.carousel = { x: (c[0] + 2) * T, y: (c[1] + 1.5) * T }; objects.push(makeCarousel(L.fair.carousel.x, L.fair.carousel.y)); }
      const w = at(4, 2, P.x - 5, P.y + 2); if (w) { L.fair.wheel = { x: (w[0] + 2) * T, y: (w[1] + 1.6) * T }; objects.push(makeBigWheel(L.fair.wheel.x, L.fair.wheel.y)); }
      const s = at(3, 2, P.x + 15, P.y + 9); if (s) { objects.push(makeCoconutShy((s[0] + 1.5) * T, (s[1] + 1.6) * T)); }
      const f = at(2, 2, P.x - 4, P.y + 9); if (f) { L.fair.candy = { x: (f[0] + 1) * T, y: (f[1] + 1.6) * T }; objects.push(makeCandyStand(L.fair.candy.x, L.fair.candy.y)); }
      const m = at(3, 2, P.x + 6, P.y + 14); if (m) { const o = makeMirrorTent((m[0] + 1.5) * T, (m[1] + 1.6) * T); objects.push(o); L.fair.tent = o; }
    }
  }
  function placeMoreItems() {
    if (L.slope) for (let k = 0; k < 2; k++) placeFree('boulder', (L.slope.x + 1.5 + k * 3) * TILE, (L.slope.y + 1.5) * TILE);
    if (L.fair && L.fair.candy) for (let k = 0; k < 3; k++) addItem('candyfloss', L.fair.candy.x - 10 + k * 10, L.fair.candy.y - 4, { z: 18, owner: 'rosa' });
  }

  // --- Rides -------------------------------------------------------------------------------------------
  function rideAction() {
    if (!L) return false;
    const T = TILE;
    if (player.ride) {
      const R = player.ride;
      if (R.kind === 'cable' || R.kind === 'wheel') { player.bubble = { text: 'not from up here!', t: 1 }; return true; }
      // hop off onto the nearest land
      let best = null, bd = 1e9; const ride = player.ride; player.ride = null;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) for (const r of [24, 34, 48, 64]) {
        const x = player.x + Math.cos(a) * r, y = player.y + Math.sin(a) * r * 0.8;
        if (collides(x, y) || tileAt(x, y) === WATER || areaOf(x, y) !== 0) continue;
        if (r < bd) { bd = r; best = { x, y }; }
      }
      if (!best) { player.ride = ride; return true; }
      Object.assign(player, { x: best.x, y: best.y, vx: 0, vy: 0, rideZ: 0 }); sfx('tap');
      return true;
    }
    if (player.held && player.held.type.heavy) return false;
    const near = (x, y, r) => Math.hypot(player.x - x, player.y - y) < r;
    if (trainBoardable() && !(target && itemReach(target) < 12)) { player.ride = { kind: 'train', off: clamp(player.x - L.train.x, -L.train.dir * L.train.cars * 66 - 20, 20), start: L.train.x }; sfx('tap'); return true; }
    if (lighthouseNear()) { player.ride = { kind: 'lighthouse' }; sfx('creak'); completeTask('lighthouse'); return true; }
    const C = L.cable;
    if (C && near(C.a.x, C.a.y + 10, 26) && C.at === 'a') { player.ride = { kind: 'cable', t: 0, dir: 1 }; sfx('creak'); return true; }
    if (C && near(C.b.x, C.b.y + 10, 26) && C.at === 'b') { player.ride = { kind: 'cable', t: 1, dir: -1 }; sfx('creak'); return true; }
    for (const B of L.boats || []) if (Math.abs(player.x - B.x) < 64 && Math.abs(player.y - B.y) < 90) { player.ride = { kind: 'boat', B, off: clamp(player.x - B.x, -36, 30), start: B.x }; sfx('tap'); return true; }
    const F = L.fair;
    if (F && F.carousel && near(F.carousel.x, F.carousel.y + 10, 56)) { player.ride = { kind: 'carousel', a: Math.atan2(player.y - F.carousel.y, player.x - F.carousel.x), t: 9 }; completeTask('carousel'); sfx('happy'); return true; }
    if (F && F.wheel && near(F.wheel.x, F.wheel.y + 8, 28)) { player.ride = { kind: 'wheel', a: Math.PI / 2, t: 0 }; sfx('creak'); return true; }
    return false;
  }
  const rideNear = () => {
    if (!L || player.ride) return null;
    const near = (x, y, r) => Math.hypot(player.x - x, player.y - y) < r, C = L.cable, F = L.fair;
    if (trainBoardable()) return 'hop on the train';
    if (lighthouseNear()) return 'climb the lighthouse';
    if (C && ((near(C.a.x, C.a.y + 10, 26) && C.at === 'a') || (near(C.b.x, C.b.y + 10, 26) && C.at === 'b'))) return 'ride the cable car';
    if ((L.boats || []).some((B) => Math.abs(player.x - B.x) < 64 && Math.abs(player.y - B.y) < 90)) return 'hop aboard';
    if (F && F.carousel && near(F.carousel.x, F.carousel.y + 10, 56)) return 'ride the carousel';
    if (F && F.wheel && near(F.wheel.x, F.wheel.y + 8, 28)) return 'ride the big wheel';
    return null;
  };
  function updateRide(dt, input) {
    const R = player.ride;
    player.vx = player.vy = 0; player.speed = 0;
    if (player.bubble) { player.bubble.t -= dt; if (player.bubble.t <= 0) player.bubble = null; }
    if (R.kind === 'cable') {
      const C = L.cable;
      R.t = clamp(R.t + R.dir * dt / 4, 0, 1);
      player.x = lerp(C.a.x, C.b.x, R.t); player.y = lerp(C.a.y, C.b.y, R.t) + 2; player.rideZ = 44;
      player.dir = R.dir > 0 ? (C.b.x > C.a.x ? 'right' : 'left') : (C.b.x > C.a.x ? 'left' : 'right');
      if ((R.dir > 0 && R.t >= 1) || (R.dir < 0 && R.t <= 0)) {
        const P = R.dir > 0 ? C.b : C.a; C.at = R.dir > 0 ? 'b' : 'a';
        player.ride = null; player.rideZ = 0; Object.assign(player, { x: P.x + 18, y: P.y + 16, dir: 'down' });
        if (R.dir > 0) { completeTask('lookout'); toast('What a view!', 'The lookout', true); }
      }
      return;
    }
    if (R.kind === 'train') {
      const T0 = L.train; player.x = T0.x + R.off; player.y = L.rail.y - 2; player.rideZ = 18; player.dir = T0.dir > 0 ? 'right' : 'left';
      if (Math.abs(T0.x - R.start) > 200) completeTask('trainride');
      return;
    }
    if (R.kind === 'lighthouse') { const H = L.lighthouse; player.x = H.x; player.y = H.y + 1; player.rideZ = 138; return; }
    if (R.kind === 'boat') {
      const B = R.B;
      if (Math.abs(input.x) > 0.1) { R.off = clamp(R.off + input.x * 60 * dt, -40, 32); player.dir = input.x > 0 ? 'right' : 'left'; player.walk += dt * 8; player.speed = 40; }
      player.x = B.x + R.off; player.y = B.y + 1; player.rideZ = 10;
      if (Math.abs(B.x - R.start) > 90) completeTask('narrowboat');
      return;
    }
    if (R.kind === 'carousel') {
      const F = L.fair.carousel;
      R.a += dt * 0.8; R.t -= dt;
      player.x = F.x + Math.cos(R.a) * 38; player.y = F.y + Math.sin(R.a) * 16 + 1; player.rideZ = 14 + Math.sin(time * 3) * 4;
      player.dir = Math.sin(R.a) > 0 ? 'left' : 'right';
      if (R.t <= 0) { player.ride = null; player.rideZ = 0; player.y = F.y + 34; player.bubble = { text: 'wheee!', t: 1 }; }
      return;
    }
    if (R.kind === 'wheel') {
      const W = L.fair.wheel;
      R.a -= dt * 0.45; R.t += dt;
      player.x = W.x + Math.cos(R.a) * 58; player.y = W.y + 2; player.rideZ = 72 - Math.sin(R.a) * 58 - 2;
      if (R.t > 1 && Math.sin(R.a) < -0.95) completeTask('bigwheel');
      if (R.t > (Math.PI * 2) / 0.45) { player.ride = null; player.rideZ = 0; player.x = W.x; player.y = W.y + 22; player.bubble = { text: 'wheee!', t: 1 }; }
    }
  }

  // --- Per frame -----------------------------------------------------------------------------------------
  function updateMore(dt) {
    if (!L || !started || paused) return;
    const outside = areaOf(player.x, player.y) === 0;
    // narrowboats glide up and down their stretch of canal (not when it's frozen)
    for (const B of L.boats || []) {
      if (isWinter()) continue;
      B.x += B.dir * 24 * dt;
      if (B.x > B.max) { B.x = B.max; B.dir = -1; } else if (B.x < B.min) { B.x = B.min; B.dir = 1; }
    }
    // the lock
    const K = L.canal && L.canal.lock;
    if (K) {
      K.level += clamp(K.target - K.level, -dt * 0.25, dt * 0.25);
      if (K.level < 0.15 && !K.ringOut) { K.ringOut = true; addItem('ring', K.lever.x + (Math.random() < 0.5 ? -1 : 1) * rr(56, 76), K.lever.y - 2); toast('Something’s glinting in the mud...', 'The lock is empty', true); }
    }
    // rolling things down the mountainside
    if (L.slope) for (const it of items) {
      if (it.held || it.air || it.floating || it.planted) continue;
      if (onSlope(it.x, it.y)) it.rollV = Math.min(220, (it.rollV || 0) + 160 * dt);
      else if (it.rollV) it.rollV = Math.max(0, it.rollV - 220 * dt);
      if (!it.rollV) continue;
      const ny = it.y + it.rollV * dt;
      if (itemBlocked(it, it.x, ny)) { it.rollV = 0; continue; }
      it.y = ny; it.rot = (it.rot || 0) + it.rollV * dt * 0.1;
      if (it.rollV > 70 && it.touched) for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - it.x, v.y - it.y) < 14 && startleV(v, rpick(['WHOA! Rockslide!', 'Look out below!', 'Yikes!']))) { completeTask('roll'); it.rollV *= 0.3; }
    }
    // shaking orchard trees: run into the trunk
    for (const T0 of L.fruitTrees || []) {
      T0.cd = Math.max(0, T0.cd - dt);
      if (outside && Math.hypot(player.x - T0.x, player.y - T0.y) < 20 && Math.max(player.speed, L.lastSpd || 0) > 100) shakeTree(T0);
    }
    L.lastSpd = player.speed;
    // the cider press
    const P = L.press;
    if (P) for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind !== 'apple' || it.held || Math.hypot(it.x - P.x, it.y - P.y) > 22) continue;
      items.splice(i, 1); P.n++; sfx('chomp');
      if (P.n >= 3) { P.n = 0; addItem('cider', P.x + 22, P.y + 6); sfx('gulp'); toast('Fresh cider!', 'The press', true); completeTask('cider'); }
    }
    // the hedge maze
    if (L.maze && outside) {
      if (Math.hypot(player.x - L.maze.center.x, player.y - L.maze.center.y) < 22) completeTask('maze');
      for (const v of villagers) {
        if (v.prevMazeState === 'chase' && v.state !== 'chase' && v.state !== 'startled' && inMaze(player.x, player.y) && run.strikes === v.mazeStrikes) completeTask('mazeescape');
        if (v.state === 'chase' && v.prevMazeState !== 'chase') v.mazeStrikes = run.strikes;
        v.prevMazeState = v.state;
      }
    }
    // the coconut shy
    const S = L.shy;
    if (S) for (const it of items) {
      if (!it.air || it.z > 50) continue;
      for (let k = 0; k < 3; k++) {
        const px = S.x - 24 + k * 24;
        if (S.nuts[k] && Math.abs(it.x - px) < 11 && Math.abs(it.y - (S.y - 22)) < 12 && it.z > 6) {
          S.nuts[k] = false; sfx('bonk'); it.vx *= -0.3; it.vy *= -0.3;
          if (S.nuts.every((n) => !n)) { addItem('prizebear', S.x, S.y + 14); toast('You win a prize!', 'Coconut shy', true); completeTask('coconut'); }
        }
      }
    }
    // hall of mirrors: chasers get confused by the reflections
    const tent = L.fair && L.fair.tent;
    if (tent && player.hidingIn === tent) { completeTask('mirrors'); for (const v of villagers) if (v.state === 'chase' && Math.random() < dt) { v.lastSeen = { x: tent.x + rr(-80, 80), y: tent.y + rr(10, 60) }; v.path = null; } }
  }
  // A chitter in the cave echoes
  function caveEcho() {
    if (!L.cave || !player.hidingIn || player.hidingIn.kind !== 'cave') return;
    for (let k = 1; k <= 3; k++) setTimeout(() => { if (!muted && actx) for (let j = 0; j < 3; j++) tone(1300, 1750, 0.04, 'square', 0.03 / k, j * 0.06); }, k * 380);
    setTimeout(() => { player.bubble = { text: '...chirr! ...chirr!', t: 1.4 }; }, 400);
    lookTowards(L.cave.x, L.cave.y, 260, () => rpick(['Is the cave haunted?!', 'Who’s in there?', 'Spooky...']));
    completeTask('echo');
  }
  // Mountain goats leaping about the slope
  function spawnMoreCritters() {
    if (!L.slope) return;
    const S = L.slope, T = TILE;
    for (let k = 0; k < 3; k++) critters.push({ type: 'mgoat', x: (S.x + 1 + rand() * (S.w - 2)) * T, y: (S.y + 1 + rand() * (S.h - 2)) * T, z: 0, dir: 'left', walk: 0, ph: rand() * 6, tx: null, wait: rr(0, 2), leap: 0, flying: true });
  }
  function updateMGoat(c, dt) {
    const S = L.slope, pd = Math.hypot(player.x - c.x, player.y - c.y);
    const run = player.speed > WALK_SPEED * 1.15 && areaOf(player.x, player.y) === 0;
    if (c.leap > 0) { c.leap -= dt; c.z = Math.sin((1 - c.leap / 0.6) * Math.PI) * 14; critterMove(c, c.tx, c.ty, 110, dt); if (c.leap <= 0) { c.z = 0; c.tx = null; } return; }
    c.wait -= dt;
    const scared = pd < 70 && run;
    if (scared || c.wait <= 0) {
      c.wait = rr(1.5, 4); c.leap = 0.6;
      c.tx = clamp(c.x + rr(-50, 50), (S.x + 0.5) * TILE, (S.x + S.w - 0.5) * TILE);
      c.ty = clamp(scared ? c.y - rr(50, 90) : c.y + rr(-40, 40), (S.y + 0.5) * TILE, (S.y + S.h - 0.5) * TILE);
      c.dir = c.tx > c.x ? 'right' : 'left';
      if (scared) { c.bubble = { text: 'Meh-eh-eh!', t: 1 }; if (pd < 260) sfx('meh'); completeTask('mgoat'); }
    }
  }
  function drawMGoat(ctx, c) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(20,30,10,0.2)'; ellipse(ctx, 0, 0, 7, 2.2);
    ctx.translate(0, -c.z); if (c.dir === 'left') ctx.scale(-1, 1);
    ctx.fillStyle = '#6b6258'; ctx.fillRect(-5, -6, 1.6, 6); ctx.fillRect(3.5, -6, 1.6, 6);
    ctx.fillStyle = '#f4f2ee'; roundRect(ctx, -7, -12, 14, 7, 3.5, true); roundRect(ctx, 5, -16, 6, 6, 2.5, true);
    ctx.strokeStyle = '#6b6258'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(6, -16); ctx.quadraticCurveTo(3, -21, 0, -18); ctx.stroke();
    ctx.fillStyle = '#f4f2ee'; poly(ctx, [[8, -10], [10, -10], [9, -6]]); ctx.fill();
    ctx.fillStyle = '#1d1d22'; circle(ctx, 9, -14, 0.7);
    ctx.restore();
  }

  const leverNear = () => !!(L && L.canal && !player.ride && Math.hypot(player.x - L.canal.lock.lever.x, player.y - L.canal.lock.lever.y) < 24);
  function leverAction() {
    if (!leverNear()) return false;
    const K = L.canal.lock;
    K.target = K.target ? 0 : 1; sfx('creak'); sfx('splash');
    toast(K.target ? 'The lock is filling up...' : 'Draining the lock...', 'Canal lock', true);
    lookTowards(K.lever.x, K.lever.y, 240, () => rpick(['Who’s playing with the lock?!', 'Oi! Leave that lever alone!']));
    completeTask('lock');
    return true;
  }
  // ---------------------------------------------------------------------------
  // Woodland animals (wild boar, a moose, bats, a woodpecker), pets in the
  // houses (a goldfish bowl, a hamster, a kitten, a budgie), the outskirts
  // (a campsite, a scrapyard, a crow field) and quests from animals.
  // ---------------------------------------------------------------------------
  const OK_TYPES = new Set(['boar', 'boarlet', 'moose', 'bat', 'woodpecker', 'goldfish', 'hamster', 'kitten', 'fcrow', 'qcrow', 'qfox', 'qmole']);
  Object.assign(ITEM, {
    fishbowl: { name: 'goldfish bowl', h: 12, r: 6, fragile: true, draw(c) { c.fillStyle = 'rgba(160,210,240,0.7)'; circle(c, 0, -6, 6); c.fillStyle = '#f2913a'; ellipse(c, 1, -5, 2.2, 1.4); poly(c, [[-1, -5], [-3, -6.5], [-3, -3.5]]); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.8; c.beginPath(); c.arc(-2, -8, 2, Math.PI, Math.PI * 1.5); c.stroke(); } },
    marshmallow: { name: 'marshmallow', h: 12, r: 4, draw(c, it) { c.strokeStyle = '#a0703f'; c.lineWidth = 1; c.beginPath(); c.moveTo(-4, 0); c.lineTo(3, -9); c.stroke(); c.fillStyle = it && it.toasted ? '#d9a04a' : '#fbf6ee'; roundRect(c, 1, -13, 5, 5, 2, true); } },
    nuts: { name: 'stash of nuts', h: 6, r: 5, draw(c) { c.fillStyle = '#8a5a2a'; for (const [x, y] of [[-3, -2], [0, -3], [3, -2], [-1.5, -5], [1.5, -5]]) ellipse(c, x, y, 2, 1.7); c.fillStyle = '#5a3a20'; for (const [x, y] of [[-3, -3], [0, -4], [3, -3]]) c.fillRect(x - 1.5, y - 0.8, 3, 1); } },
    gear: { name: 'rusty cog', h: 10, r: 6, draw(c) { c.fillStyle = '#9a6a3a'; circle(c, 0, -5, 5); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; c.fillRect(Math.cos(a) * 5 - 1.2, -5 + Math.sin(a) * 5 - 1.2, 2.4, 2.4); } c.fillStyle = '#5a3a20'; circle(c, 0, -5, 1.8); } },
    kettle: { name: 'old kettle', h: 12, r: 6, draw(c) { c.fillStyle = '#8a8e96'; roundRect(c, -6, -10, 12, 10, 4, true); c.fillRect(5, -8, 4, 2); c.strokeStyle = '#5a5e66'; c.lineWidth = 1.4; c.beginPath(); c.arc(0, -10, 4, Math.PI, 0); c.stroke(); } },
    hubcap: { name: 'hubcap', h: 4, r: 7, draw(c) { c.fillStyle = '#c4c8d0'; ellipse(c, 0, -2, 7, 3); c.fillStyle = '#9aa0aa'; ellipse(c, 0, -2.5, 3, 1.4); } },
  });
  FOOD.marshmallow = { bites: 1, fill: 6, sweet: true }; FOOD.nuts = { bites: 2, fill: 14 };
  const JUNK = ['gear', 'kettle', 'hubcap', 'boot', 'can', 'bucket'];
  const SHINY = new Set(['ring', 'crown', 'gem', 'trophy', 'clock', 'goldvase', 'goldpot', 'hubcap', 'frame', 'teapot']);

  // --- Objects --------------------------------------------------------------------------------
  function makeTent(x, y, col) {
    const o = {
      kind: 'tent', x, y, r: 20, hitbox: null, rustle: 0, bounds: { l: x - 30, r: x + 30, t: y - 40, b: y + 6 },
      contains(px, py) { const dx = (px - x) / 18, dy = (py - (y - 6)) / 10; return dx * dx + dy * dy < 1; },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 6, y, 28, 7); },
      draw(ctx, t) {
        const sh = o.rustle > 0 ? Math.sin(t * 40) : 0;
        ctx.fillStyle = col; poly(ctx, [[x - 26 + sh, y], [x + 26 + sh, y], [x + sh, y - 34]]); ctx.fill();
        ctx.fillStyle = shade(col, -0.25); poly(ctx, [[x - 8 + sh, y], [x + 8 + sh, y], [x + sh, y - 22]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - 8 + sh, y - 25], [x + 8 + sh, y - 25], [x + sh, y - 34]]); ctx.fill(); }
        if (player.hidden && player.hidingIn === o) { ctx.fillStyle = '#ffffff'; circle(ctx, x - 2.5, y - 8, 1.4); circle(ctx, x + 2.5, y - 8, 1.4); }
      },
    };
    return o;
  }
  function makeCampfire(x, y) {
    return {
      kind: 'campfire', x, y, hitbox: box(x - 10, y - 5, 20, 6), bounds: { l: x - 60, r: x + 60, t: y - 40, b: y + 30 },
      shadow(ctx) { const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 50); g.addColorStop(0, `rgba(255,170,60,${0.2 + duskK * 0.3})`); g.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 50, y - 54, 100, 100); },
      draw(ctx, t) {
        ctx.fillStyle = '#8a8578'; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; circle(ctx, x + Math.cos(a) * 10, y - 2 + Math.sin(a) * 4, 2.6); }
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 7, y - 5, 14, 3);
        if (!wet()) for (let k = 0; k < 4; k++) { const fx = x + (k - 1.5) * 3 + Math.sin(t * 6 + k) * 1.5, h = 9 + Math.sin(t * 9 + k) * 3; ctx.fillStyle = k % 2 ? '#f2913a' : '#ffd166'; poly(ctx, [[fx - 3, y - 4], [fx + 3, y - 4], [fx, y - 4 - h]]); ctx.fill(); }
        else if (Math.random() < 0.1 && !paused) particles.push({ x: x + rr(-4, 4), y: y - 6, r: 3, life: 1, max: 1, vy: -14 });
      },
    };
  }
  function makeJunkPile(x, y) {
    const J = { x, y, found: false };
    (L.junk = L.junk || []).push(J);
    const bits = Array.from({ length: 9 }, () => [rr(-16, 16), rr(-14, 0), pick(['#8a8e96', '#9a6a3a', '#5a5e66', '#c0392b', '#4f6fa8']), rr(4, 8)]);
    return {
      kind: 'junkpile', x, y, hitbox: box(x - 16, y - 8, 32, 9), bounds: { l: x - 24, r: x + 24, t: y - 30, b: y + 4 },
      draw(ctx) { ctx.fillStyle = '#6a5a4a'; ellipse(ctx, x, y - 4, 20, 9); for (const [bx, by, col, r] of bits) { ctx.fillStyle = col; roundRect(ctx, x + bx - r / 2, y + by - r / 2 - 4, r, r * 0.7, 1.5, true); } ctx.fillStyle = '#2b2d33'; circle(ctx, x + 10, y - 14, 4); ctx.fillStyle = '#5a5e66'; circle(ctx, x + 10, y - 14, 1.6); },
    };
  }
  function makeHamsterCage(x, y) {
    return {
      kind: 'hamstercage', x, y, hitbox: box(x - 10, y - 6, 20, 7), bounds: { l: x - 14, r: x + 14, t: y - 26, b: y + 3 },
      draw(ctx, t) {
        ctx.fillStyle = '#e6c56a'; ctx.fillRect(x - 11, y - 4, 22, 4);
        ctx.strokeStyle = '#8a8e96'; ctx.lineWidth = 0.8; ctx.strokeRect(x - 10, y - 20, 20, 16); for (let k = -7; k <= 7; k += 3.5) { ctx.beginPath(); ctx.moveTo(x + k, y - 20); ctx.lineTo(x + k, y - 4); ctx.stroke(); }
        if (!L.hamsterOut) { ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 3, y - 11, 5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#e8a050'; circle(ctx, x + 3 + Math.cos(t * 12) * 1.5, y - 7, 2.2); }
      },
    };
  }
  function makeBudgieCage(x, y) {
    return {
      kind: 'budgiecage', x, y, bounds: { l: x - 12, r: x + 12, t: y - 50, b: y + 3 },
      draw(ctx, t) {
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 1, y - 40, 2, 40); ctx.fillRect(x - 6, y - 1, 12, 2);
        ctx.strokeStyle = '#c9a33a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(x, y - 34, 7, 9, 0, Math.PI, 0); ctx.lineTo(x + 7, y - 26); ctx.lineTo(x - 7, y - 26); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#5ac85a'; ellipse(ctx, x, y - 30 + Math.sin(t * 5) * 0.6, 2.2, 3); ctx.fillStyle = '#f2d06a'; circle(ctx, x, y - 33, 1.6);
      },
    };
  }
  function makeMolehill(x, y) { return { kind: 'molehill', x, y: y - 6, bounds: { l: x - 10, r: x + 10, t: y - 10, b: y + 4 }, draw(ctx) { ctx.fillStyle = isWinter() ? '#dfe9f2' : '#6b4a2e'; ellipse(ctx, x, y, 8, 4); ctx.fillStyle = isWinter() ? '#f4f8fb' : '#7a5a3a'; ellipse(ctx, x - 1, y - 2, 5, 2.5); } }; }
  function makeFoxDen(x, y) { return { kind: 'foxden', x, y, bounds: { l: x - 26, r: x + 26, t: y - 26, b: y + 4 }, draw(ctx) { ctx.fillStyle = '#7a756a'; ellipse(ctx, x, y - 8, 24, 14); ctx.fillStyle = '#2a1e14'; ctx.beginPath(); ctx.ellipse(x, y, 9, 10, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#5a8a3a'; circle(ctx, x - 14, y - 18, 5); circle(ctx, x + 16, y - 16, 4); } }; }

  // --- Building: the outskirts (needs room) ------------------------------------------------------
  function buildOutskirts(markSolid, place) {
    const T = TILE;
    L.camp = null; L.scrap = null; L.field = null;
    const c = place(8, 6);
    if (c) L.camp = { x: (c.x + 4) * T, y: (c.y + 3.2) * T, tents: [{ x: (c.x + 1.8) * T, y: (c.y + 2) * T }, { x: (c.x + 6.2) * T, y: (c.y + 2.2) * T }] };
    const s = place(9, 7);
    if (s) { L.scrap = { x: s.x + 1, y: s.y + 1, w: 7, h: 5 }; markSolid(s.x + 1, s.y + 1, 7, 5); }
    const f = place(11, 8);
    if (f) L.field = { x: f.x + 1, y: f.y + 1, w: 9, h: 6 };
  }
  function placeOutskirtsObjects() {
    const T = TILE;
    if (L.camp) {
      objects.push(makeCampfire(L.camp.x, L.camp.y));
      const cols = ['#e8732a', '#3f7f6a'];
      L.camp.tents.forEach((p, i) => { const o = makeTent(p.x, p.y, cols[i]); objects.push(o); });
    }
    if (L.scrap) {
      const S = L.scrap, gx = S.x + Math.floor(S.w / 2);
      for (let x = S.x; x < S.x + S.w; x++) { if (x !== gx) objects.push(makeFence(x, S.y + S.h - 1, 'h')); objects.push(makeFence(x, S.y, 'h')); }
      for (let y = S.y + 1; y < S.y + S.h - 1; y++) { objects.push(makeFence(S.x, y, 'v')); objects.push(makeFence(S.x + S.w - 1, y, 'v')); }
      for (const [u, v] of [[0.25, 0.4], [0.72, 0.4], [0.3, 0.75], [0.72, 0.78]]) objects.push(makeJunkPile((S.x + S.w * u) * T, (S.y + S.h * v) * T));
      objects.push(makeSign((gx + 1.6) * T, (S.y + S.h + 0.4) * T, 'SCRAP', 'YARD'));
    }
    if (L.field) {
      const F = L.field;
      for (let r = 0; r < F.h; r += 2) objects.push(makeWheatRow(F.x * T, (F.x + F.w) * T, (F.y + r + 0.95) * T));
      L.fieldCrows = [];
      for (const u of [0.25, 0.75]) { const o = makeScarecrow((F.x + F.w * u) * T, (F.y + F.h * 0.55) * T); objects.push(o); L.fieldCrows.push(o); }
    }
    // pets in the houses
    const rooms = (L.rooms || []).filter(Boolean);
    const shopless = rooms.filter((h) => !shopOf(h));
    const tobyH = L.houses[L.homes.toby];
    if (tobyH && tobyH.room) { const R = tobyH.room; L.hamster = { x: (R.bedLeft ? R.x0 + 3.7 : R.x0 + 7.3) * T, y: (R.y0 + 6.6) * T, area: tobyH.area, room: R }; objects.push(makeHamsterCage(L.hamster.x, L.hamster.y)); }
    const bh = pick(shopless.filter((h) => h !== tobyH)) || null;
    if (bh) { const R = bh.room; L.budgie = { x: (R.x0 + 5.5) * T, y: (R.y0 + 3.4) * T, area: bh.area, house: bh }; objects.push(makeBudgieCage(L.budgie.x, L.budgie.y)); }
    L.fishHouse = pick(shopless.filter((h) => h !== bh)) || null;
    // quest givers' homes
    const mh = randomFreeSpot(3, 2);
    if (mh) { L.moleHome = { x: (mh[0] + 1.5) * T, y: (mh[1] + 1.2) * T }; for (const [dx, dy] of [[-28, -6], [0, 4], [26, -8], [-12, 16], [16, 18]]) objects.push(makeMolehill(L.moleHome.x + dx, L.moleHome.y + dy)); }
  }
  function placeOutskirtsItems() {
    if (L.camp) for (let k = 0; k < 3; k++) placeFree('marshmallow', L.camp.x - 24 + k * 14, L.camp.y + 24);
    if (L.fishHouse) { const R = L.fishHouse.room; addItem('fishbowl', (R.x0 + 5.5) * TILE, (R.y0 + 5) * TILE + 1, { z: 22, owner: residentsOf(L.fishHouse)[0] || null }); }
    if (L.fieldCrows) for (const o of L.fieldCrows) addItem('hat', o.x, o.y - 2, { z: 54, owner: 'bertram' }).scarehat = true;
  }

  // --- Animals ------------------------------------------------------------------------------------
  function spawnOutskirtsCritters() {
    const T = TILE;
    const mk = (type, x, y, extra) => { const c = Object.assign({ type, x, y, z: 0, dir: 'left', walk: 0, ph: rand() * 6, tx: null, wait: rr(0, 3), cd: 0 }, extra); critters.push(c); return c; };
    // a wild boar sow and her stripy piglets, along the forest edge
    { const e = edgeSpot(rr(0, WORLD_W), rr(0, WORLD_H)); if (e) { const sow = mk('boar', e.x, e.y, { hx: e.x, hy: e.y, charge: 0 }); for (let k = 0; k < 3; k++) mk('boarlet', e.x + rr(-20, 20), e.y + rr(-10, 10), { mum: sow, off: k }); } }
    // a moose standing in the road, somewhere along it
    for (let n = 0; n < 40; n++) { const tx = Math.floor(rr(6, MW - 6)); if (getT(tx, L.roadY) === PATH && Math.abs(tx - L.roadX) > 8 && (tx < L.plaza.x - 2 || tx > L.plaza.x + 14)) { mk('moose', (tx + 0.5) * T, (L.roadY + 1.2) * T, { hx: (tx + 0.5) * T, hy: (L.roadY + 1.2) * T, shoo: 0 }); break; } }
    // bats roosting (they come out at dusk)
    for (let k = 0; k < 6; k++) mk('bat', (L.plaza.x + 6) * T + rr(-200, 200), (L.plaza.y + 6) * T + rr(-150, 150), { flying: true, z: 40, hx: 0, hy: 0, scatter: 0 });
    // a woodpecker drumming on a tree
    { const trees = objects.filter((o) => o.kind === 'tree' && o.y < WORLD_H && o.x > 6 * T && o.x < WORLD_W - 6 * T && o.y > 6 * T && o.y < WORLD_H - 6 * T); if (trees.length) { const tr = pick(trees); mk('woodpecker', tr.x + 6, tr.y, { flying: true, z: 24, tree: tr, hops: 0, flyT: 0 }); } }
    // a kitten near one of the houses
    { const h = pick(L.houses); if (h) mk('kitten', (h.doorX + 2) * T, (h.y + h.h + 1.5) * T, { friend: false, idleNear: 0, mewT: rr(3, 8) }); }
    // crows in the field
    if (L.field && !isWinter()) { const F = L.field; for (let k = 0; k < 6; k++) mk('fcrow', (F.x + rr(1, F.w - 1)) * T, (F.y + rr(1, F.h - 1)) * T, { hx: 0, hy: 0, flyT: 0, flying: false }); for (const c of critters) if (c.type === 'fcrow') { c.hx = c.x; c.hy = c.y; } }
    // quest givers
    { const tr = objects.filter((o) => o.kind === 'tree' && o.y < WORLD_H && Math.hypot(o.x - (L.plaza.x + 6) * T, o.y - (L.plaza.y + 6) * T) < 14 * T); const t0 = tr.length ? pick(tr) : null; if (t0) mk('qcrow', t0.x + 4, t0.y + 1, { flying: true, z: 40, quest: 'crow', askT: 0, done: false }); }
    { const den = edgeSpot((L.plaza.x + 6) * T, (L.plaza.y - 10) * T); L.foxDen = den ? { x: den.x, y: den.y } : null; if (den) objects.push(makeFoxDen(den.x, den.y - 10)); }
    if (L.foxDen) mk('qfox', L.foxDen.x + 18, L.foxDen.y, { quest: 'fox', askT: 0, done: false });
    if (L.moleHome) mk('qmole', L.moleHome.x, L.moleHome.y, { quest: 'mole', askT: 0, done: false, pop: 0 });
  }
  const QUEST_ASK = { crow: 'Caw! Bring me something SHINY, would you?', fox: 'Psst... I’m starving. Fetch me an egg?', mole: 'Squeak! Dig me up 3 worms? (press B on grass)' };
  function questReward(c, text) {
    c.done = true; c.bubble = { text, t: 2 }; sfx('happy'); sparkle(c.x, c.y, 14);
    for (let k = 0; k < 3; k++) particles.push({ kind: 'heart', x: c.x + rr(-6, 6), y: c.y, z: 14 + k * 4, life: 1.2, max: 1.2 });
    run.earned += 2; updateRunBar(); toast('+2 ✦ for helping out', 'Favour done!', true);
    completeTask(c.quest + 'quest');
  }
  function updateOutskirtsCritter(c, dt, near) {
    const pd = Math.hypot(player.x - c.x, player.y - c.y), outside = areaOf(player.x, player.y) === 0;
    const running = player.speed > WALK_SPEED * 1.15;
    c.cd = Math.max(0, (c.cd || 0) - dt);
    switch (c.type) {
      case 'boar': {
        if (c.charge > 0) {
          c.charge -= dt; if (!outside) { c.charge = 0; break; }
          critterMove(c, player.x, player.y, 160, dt);
          if (pd < 15) { knockPlayer(c.x, c.y, 250); c.bubble = { text: 'SNORT!', t: 1 }; sfx('oink'); sfx('bonk'); c.charge = 0; c.cd = 8; completeTask('boar'); }
          break;
        }
        const kids = critters.filter((k) => k.type === 'boarlet' && k.mum === c);
        const nearKids = kids.some((k) => Math.hypot(player.x - k.x, player.y - k.y) < 50);
        if (outside && c.cd <= 0 && !player.hidden && (nearKids || pd < 40)) { c.charge = 2; c.bubble = { text: 'GRUNT!', t: 0.8 }; sfx('growl'); break; }
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.hx + rr(-90, 90); c.ty = c.hy + rr(-60, 60); c.wait = rr(2, 5); }
        if (c.tx && critterMove(c, c.tx, c.ty, 22, dt)) c.tx = null;
        if (Math.random() < dt * 0.3) c.bubble = { text: '*snuffle*', t: 0.8 };
        break;
      }
      case 'boarlet': {
        const m = c.mum, tx = m.x + Math.cos(c.off * 2.1 + c.ph * 0.3) * 18, ty = m.y + 8 + Math.sin(c.off * 2.1) * 8;
        if (Math.hypot(tx - c.x, ty - c.y) > 4) critterMove(c, tx, ty, m.charge > 0 ? 120 : 40, dt);
        break;
      }
      case 'moose': {
        if (outside && pd < 28) { // it doesn't budge: a great big wall of moose
          const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy) || 1, push = 28 - d;
          if (!collides(player.x + dx / d * push, player.y)) player.x += dx / d * push;
          if (!collides(player.x, player.y + dy / d * push)) player.y += dy / d * push;
          if (c.cd <= 0) { c.cd = 4; c.bubble = { text: rpick(['...', '*chews*', 'Mmmrrph.']), t: 1.2 }; }
        }
        if (c.shoo > 0) { c.shoo -= dt; critterMove(c, c.x + c.sdx * 40, c.y + c.sdy * 40, 30, dt); if (c.shoo <= 0) { c.hx = c.x; c.hy = c.y; } }
        break;
      }
      case 'bat': {
        if (duskK < 0.4) break;
        c.scatter = Math.max(0, c.scatter - dt);
        const lamps = L.lights || [];
        if (c.lamp === undefined) { let best = 0, bd = 1e9; lamps.forEach((lp, i) => { const d = Math.hypot(lp.x - c.x, lp.y - c.y) + Math.random() * 200; if (d < bd) { bd = d; best = i; } }); c.lamp = best; }
        const l = lamps[c.lamp] || { x: (L.plaza.x + 6) * TILE, y: (L.plaza.y + 6) * TILE };
        const sp = c.scatter > 0 ? 3 : 1, a = c.ph * 2.3 * sp;
        c.x += (l.x + Math.cos(a) * 40 * sp - c.x) * Math.min(1, dt * 2); c.y += (l.y - 20 + Math.sin(a * 1.3) * 26 * sp - c.y) * Math.min(1, dt * 2);
        c.z = 40 + Math.sin(a * 2) * 10; c.walk += dt * 30; c.dir = Math.cos(a) > 0 ? 'right' : 'left';
        break;
      }
      case 'woodpecker': {
        if (c.flyT > 0) { c.flyT -= dt; critterMove(c, c.tree.x + 6, c.tree.y, 140, dt); c.z = 24 + Math.sin(c.flyT * 4) * 10; c.walk += dt * 25; if (c.flyT <= 0) c.z = 24; break; }
        if (Math.random() < dt * 1.2) { c.peck = 0.25; if (pd < 300) tone(900, 700, 0.03, 'square', 0.03); }
        c.peck = Math.max(0, (c.peck || 0) - dt);
        if (outside && pd < 60 && c.hops < 3) { // off to the next tree; follow it
          const next = objects.filter((o) => o.kind === 'tree' && o !== c.tree && o.y < WORLD_H && Math.hypot(o.x - c.x, o.y - c.y) > 100 && Math.hypot(o.x - c.x, o.y - c.y) < 300 && o.x > 4 * TILE && o.x < WORLD_W - 4 * TILE && o.y > 4 * TILE && o.y < WORLD_H - 4 * TILE);
          if (next.length) { c.tree = pick(next); c.flyT = 1.6; c.hops++; c.bubble = { text: 'tik-tik!', t: 0.8 }; sfx('flutter'); }
          if (c.hops === 3) setTimeout(() => { const it = addItem('nuts', c.tree.x + 4, c.tree.y + 10); it.woodnuts = true; c.bubble = { text: '*tap tap tap*', t: 1.4 }; }, 1700);
        }
        break;
      }
      case 'goldfish': {
        c.life -= dt; c.z = Math.abs(Math.sin(c.ph * 9)) * 6; c.dir = Math.sin(c.ph * 4) > 0 ? 'left' : 'right';
        if (c.life <= 0) { c.dead = true; sparkle(c.x, c.y, 4); } // scooped back into a glass of water, safe and sound
        break;
      }
      case 'hamster': {
        const R = c.room, minX = (R.x0 + 1.4) * TILE, maxX = (R.x0 + 9.6) * TILE, minY = (R.y0 + 3) * TILE, maxY = (R.y0 + 6.8) * TILE;
        c.wait -= dt;
        if (c.wait <= 0 || c.tx === null) { c.tx = rr(minX, maxX); c.ty = rr(minY, maxY); c.wait = rr(0.6, 1.6); }
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d > 1) { c.x += dx / d * Math.min(d, 90 * dt); c.y += dy / d * Math.min(d, 90 * dt); c.dir = dx > 0 ? 'right' : 'left'; c.moving = true; c.walk += dt * 22; }
        for (const v of villagers) if (areaOf(v.x, v.y) === areaOf(c.x, c.y) && Math.hypot(v.x - c.x, v.y - c.y) < 40 && (v.hamCD || 0) < time) { v.hamCD = time + 6; startleV(v, rpick(['The hamster’s loose!', 'Nibbles! Come back!', 'Eek! Under the bed!'])); }
        break;
      }
      case 'kitten': {
        c.mewT -= dt;
        if (c.mewT <= 0) { c.mewT = rr(5, 10); c.bubble = { text: rpick(['mew!', 'mew mew', 'mrrp?']), t: 0.9 }; if (pd < 220) sfx('purr'); }
        if (c.friend) {
          if (!outside || pd > 500) { c.x = player.x - 20; c.y = player.y + 6; break; }
          if (pd > 30) critterMove(c, player.x - 16, player.y + 6, pd > 90 ? 190 : 100, dt);
          for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - c.x, v.y - c.y) < 50 && (v.awwCD || 0) < time && v.state !== 'chase') { v.awwCD = time + 20; say(v, rpick(['Aww, a kitten!', 'Hello, little one!']), 1.6); }
          break;
        }
        if (outside && pd < 40 && player.speed < 5) { c.idleNear += dt; if (c.idleNear > 1.5) { c.friend = true; c.bubble = { text: 'purrrr ♥', t: 1.4 }; sfx('purr'); completeTask('kitten'); } } else c.idleNear = 0;
        c.wait -= dt;
        if (c.wait <= 0) { c.tx = c.x + rr(-40, 40); c.ty = c.y + rr(-30, 30); c.wait = rr(1, 3); }
        if (c.tx && critterMove(c, c.tx, c.ty, 30, dt)) c.tx = null;
        break;
      }
      case 'fcrow': {
        if (c.flyT > 0) { c.flyT -= dt; c.z = Math.min(60, c.z + 60 * dt); c.x += Math.cos(c.fa) * 80 * dt; c.y += Math.sin(c.fa) * 50 * dt; c.walk += dt * 25; if (c.flyT <= 0) { c.x = c.hx + rr(-20, 20); c.y = c.hy + rr(-10, 10); c.z = 0; } break; }
        if (outside && pd < 80 && running) { for (const k of critters) if (k.type === 'fcrow' && !(k.flyT > 0)) { k.flyT = rr(3, 5); k.fa = Math.atan2(k.y - player.y, k.x - player.x) + rr(-0.5, 0.5); } sfx('flutter'); sfx('squawk'); completeTask('crowfield'); break; }
        if (Math.random() < dt * 0.5) c.peck = 0.3; c.peck = Math.max(0, (c.peck || 0) - dt);
        break;
      }
      case 'qcrow': case 'qfox': case 'qmole': {
        if (c.type === 'qmole') { c.pop = Math.max(0, c.pop - dt); if (outside && pd < 80) c.pop = 1; }
        if (c.done) break;
        c.askT -= dt;
        if (outside && pd < 70 && c.askT <= 0) { c.askT = 8; c.bubble = { text: QUEST_ASK[c.quest], t: 3 }; if (c.type === 'qcrow') sfx('squawk'); }
        if (c.quest === 'mole') { if (outside && pd < 40 && (player.worms || 0) >= 3) { player.worms -= 3; questReward(c, 'Squeak! Delicious! Thank you!'); } break; }
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (it.held || it.air || !it.touched || Math.hypot(it.x - c.x, it.y - c.y) > 34) continue;
          if ((c.quest === 'crow' && SHINY.has(it.kind)) || (c.quest === 'fox' && (it.kind === 'egg' || it.kind === 'paintegg'))) {
            items.splice(i, 1); sfx('chomp');
            questReward(c, c.quest === 'crow' ? 'CAW! Ooh, sparkly! Mine!' : 'Mmm, an egg! You’re a pal.');
            break;
          }
        }
        break;
      }
    }
  }
  function okScare(c, x, y, r) {
    const real = r < 9999;
    if (c.type === 'moose' && real && !(c.shoo > 0)) { const a = Math.atan2(c.y - y, c.x - x); c.sdx = Math.cos(a); c.sdy = Math.sin(a); c.shoo = 3; c.bubble = { text: 'HRRMMPH.', t: 1.2 }; sfx('moo'); completeTask('moose'); }
    if (c.type === 'bat' && duskK >= 0.4 && real) { c.scatter = 3; if (c.type === 'bat' && !L.batsDone) { L.batsDone = true; sfx('squeak'); completeTask('bats'); } }
    if (c.type === 'fcrow' && !(c.flyT > 0)) { c.flyT = rr(3, 5); c.fa = Math.atan2(c.y - y, c.x - x); if (real) completeTask('crowfield'); }
    if (c.type === 'boar' && real && c.cd <= 0) { c.charge = 2; c.bubble = { text: 'GRUNT!', t: 0.8 }; sfx('growl'); }
  }
  function drawOutskirtsCritter(ctx, c, t) {
    if (c.dead) return;
    if (c.type === 'bat' && duskK < 0.4) return;
    if (c.type === 'qmole' && c.pop <= 0 && c.done) return;
    ctx.save(); ctx.translate(c.x, c.y);
    if (c.type !== 'bat' && c.type !== 'qcrow' && c.type !== 'woodpecker') { ctx.fillStyle = 'rgba(20,30,10,0.2)'; ellipse(ctx, 0, 0, c.type === 'moose' ? 18 : c.type === 'boar' ? 10 : 5, c.type === 'moose' ? 5 : 2.4); }
    ctx.translate(0, -(c.z || 0)); if (c.dir === 'left') ctx.scale(-1, 1);
    const step = c.moving ? Math.sin(c.walk * 2) * 2 : 0;
    switch (c.type) {
      case 'boar': case 'boarlet': {
        const s = c.type === 'boarlet' ? 0.5 : 1; ctx.scale(s, s);
        ctx.fillStyle = '#4a3a2a'; for (const lx of [-6, 5]) ctx.fillRect(lx + step * 0.4, -5, 2.4, 5);
        ctx.fillStyle = c.type === 'boarlet' ? '#a0703f' : '#5a4532'; ellipse(ctx, 0, -9, 10, 6); ellipse(ctx, 9, -9, 5, 4.5);
        if (c.type === 'boarlet') { ctx.fillStyle = '#e6c56a'; for (let k = -2; k <= 2; k++) ctx.fillRect(-8 + (k + 2) * 3.5, -13, 1.4, 8); }
        else { ctx.fillStyle = '#3a2a1a'; for (let k = 0; k < 6; k++) ctx.fillRect(-7 + k * 2.5, -16, 1.2, 3); }
        ctx.fillStyle = '#8a6a5a'; ellipse(ctx, 13.5, -8, 2, 1.8); ctx.fillStyle = '#f4f2ee'; poly(ctx, [[12, -6], [14, -3], [11, -5.5]]); ctx.fill();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 10, -11, 0.8);
        break;
      }
      case 'moose': {
        ctx.fillStyle = '#4a3a2a'; for (const lx of [-12, -8, 8, 12]) ctx.fillRect(lx, -22, 3, 22);
        ctx.fillStyle = '#6b4a2e'; roundRect(ctx, -16, -36, 34, 16, 7, true); poly(ctx, [[12, -34], [18, -34], [24, -44], [18, -46]]); ctx.fill();
        roundRect(ctx, 20, -50, 14, 9, 4, true); ctx.fillStyle = '#5a3a20'; ellipse(ctx, 32, -44, 3.5, 3);
        ctx.fillStyle = '#c9a26a'; for (const s of [-1, 1]) { poly(ctx, [[24, -50], [16 + s * 2, -62], [12, -58], [18, -54], [14, -66], [22, -52]]); ctx.fill(); }
        ctx.fillStyle = '#1d1d22'; circle(ctx, 25, -47, 1);
        break;
      }
      case 'bat': { const f = Math.sin(c.walk) * 4; ctx.fillStyle = '#2b2d33'; ellipse(ctx, 0, 0, 2.5, 2); poly(ctx, [[-1, 0], [-9, -3 - f], [-6, 1], [-4, 0]]); ctx.fill(); poly(ctx, [[1, 0], [9, -3 - f], [6, 1], [4, 0]]); ctx.fill(); break; }
      case 'woodpecker': { const pk = c.peck > 0 ? 1.5 : 0; ctx.fillStyle = '#2b2d33'; ellipse(ctx, 0, -4, 3, 4.5); ctx.fillStyle = '#f4f2ee'; ellipse(ctx, 0.5, -3, 1.5, 3); ctx.fillStyle = '#e8453c'; circle(ctx, 0.5 + pk, -9, 1.8); ctx.fillStyle = '#2b2d33'; poly(ctx, [[2 + pk, -9], [5 + pk, -8.5], [2 + pk, -8]]); ctx.fill(); break; }
      case 'goldfish': ctx.fillStyle = '#f2913a'; ellipse(ctx, 0, -2, 3.5, 2); poly(ctx, [[-3, -2], [-6, -4], [-6, 0]]); ctx.fill(); ctx.fillStyle = 'rgba(160,210,240,0.6)'; ellipse(ctx, 0, 1, 8, 2.5); break;
      case 'hamster': ctx.fillStyle = '#e8a050'; ellipse(ctx, 0, -2.5, 4, 3); ctx.fillStyle = '#f8e4c4'; ellipse(ctx, 1.5, -2, 2, 1.8); ctx.fillStyle = '#1d1d22'; circle(ctx, 3, -3.5, 0.6); break;
      case 'kitten': {
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(-4 + step * 0.4, -4, 1.4, 4); ctx.fillRect(3 - step * 0.4, -4, 1.4, 4);
        ctx.fillStyle = '#e8923a'; ellipse(ctx, 0, -6, 5.5, 3.6); ctx.fillStyle = '#2b2d33'; ellipse(ctx, -2, -7, 2.4, 1.8); ctx.fillStyle = '#f4f2ee'; ellipse(ctx, 2, -5, 2, 1.4);
        ctx.fillStyle = '#e8923a'; circle(ctx, 5, -9.5, 3.2); poly(ctx, [[3, -12], [3.5, -15], [5, -12.5]]); ctx.fill(); ctx.fillStyle = '#2b2d33'; poly(ctx, [[5.5, -12.5], [7, -15], [7.5, -11.5]]); ctx.fill();
        ctx.strokeStyle = '#e8923a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-5, -7); ctx.quadraticCurveTo(-9, -12 + Math.sin(c.ph * 5), -7, -14); ctx.stroke();
        ctx.fillStyle = '#1d1d22'; circle(ctx, 6.2, -10, 0.6);
        break;
      }
      case 'fcrow': case 'qcrow': {
        const f = c.flyT > 0 ? Math.sin(c.walk) * 3 : 0, pk = c.peck > 0 ? 2 : 0;
        ctx.fillStyle = '#1d1d22'; ellipse(ctx, 0, -4, 4.5, 3.2); circle(ctx, 3.5, -7 + pk, 2.5); poly(ctx, [[-4, -4], [-9, -6], [-8, -2]]); ctx.fill();
        if (f) { poly(ctx, [[-1, -5], [-6, -11 - f], [2, -5]]); ctx.fill(); }
        ctx.fillStyle = '#3a3a40'; poly(ctx, [[5.5, -7.5 + pk], [9, -6.8 + pk], [5.5, -6 + pk]]); ctx.fill();
        if (c.type === 'qcrow' && !c.done) { ctx.scale(c.dir === 'left' ? -1 : 1, 1); ctx.fillStyle = '#f2c14e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -14); }
        break;
      }
      case 'qfox': {
        ctx.fillStyle = '#d9682a'; roundRect(ctx, -7, -9, 14, 7, 3.5, true); poly(ctx, [[4, -8], [11, -9], [12, -6], [6, -4]]); ctx.fill();
        poly(ctx, [[5, -10], [6, -15], [8, -10]]); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(-15, -4, -12, 0); ctx.quadraticCurveTo(-9, -2, -6, -4); ctx.fill();
        ctx.fillStyle = '#f4f2ee'; circle(ctx, -12, -0.5, 1.6); ctx.fillStyle = '#1d1d22'; circle(ctx, 8.5, -8, 0.8); circle(ctx, 12, -7.5, 0.8);
        if (!c.done) { ctx.scale(c.dir === 'left' ? -1 : 1, 1); ctx.fillStyle = '#f2c14e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -18); }
        break;
      }
      case 'qmole': {
        const up = c.pop > 0 || !c.done ? 1 : 0;
        ctx.fillStyle = '#6b4a2e'; ellipse(ctx, 0, 0, 7, 3.5);
        if (up) { ctx.fillStyle = '#3a3036'; ellipse(ctx, 0, -5, 4.5, 4); ctx.fillStyle = '#f2b8c6'; circle(ctx, 3.5, -5, 1.4); ctx.fillStyle = '#f2d0c0'; ellipse(ctx, -4, -2, 2, 1); ellipse(ctx, 4, -2, 2, 1); }
        if (!c.done) { ctx.fillStyle = '#f2c14e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -12); }
        break;
      }
    }
    ctx.restore();
  }

  // --- Per frame ------------------------------------------------------------------------------------
  function updateOutskirts(dt) {
    if (!L || !started || paused) return;
    // toasting a marshmallow: hold it by the campfire
    const it = player.held;
    if (it && it.kind === 'marshmallow' && !it.toasted && L.camp && !wet() && Math.hypot(player.x - L.camp.x, player.y - L.camp.y) < 40) {
      it.toastT = (it.toastT || 0) + dt;
      if (Math.random() < dt * 6) particles.push({ kind: 'spark', x: it.x, y: it.y, z: it.z + 8, vx: 0, vy: 0, vz: 30, life: 0.4, max: 0.4 });
      if (it.toastT > 2) { it.toasted = true; player.bubble = { text: 'perfectly golden!', t: 1.3 }; sfx('happy'); completeTask('marshmallow'); }
    }
    // the hamster cage: walk into it and the door swings open
    const H = L.hamster;
    if (H && !L.hamsterOut && areaOf(player.x, player.y) === H.area && Math.hypot(player.x - H.x, player.y - (H.y + 8)) < 18) {
      L.hamsterOut = true; critters.push({ type: 'hamster', x: H.x, y: H.y + 10, z: 0, dir: 'left', walk: 0, ph: 0, tx: null, wait: 0, room: H.room });
      sfx('squeak'); player.bubble = { text: 'oops! the hamster!', t: 1.4 }; completeTask('hamster');
    }
  }
  // The budgie tells on you: pick something up in its room and it squawks for the owner
  function budgieTattle(it) {
    const B = L.budgie;
    if (!B || areaOf(it.x, it.y) !== B.area || (L.budgieCD || 0) > time) return;
    L.budgieCD = time + 12;
    toast('“BURGLAR! BURGLAR!” squawks the budgie', 'Tattle-tale!', true); sfx('squawk'); sfx('squawk');
    for (const id of residentsOf(B.house)) {
      const v = VILLAGER[id]; if (!v || v.state === 'chase') continue;
      const hi = v.stops.findIndex((s) => s.act === 'home');
      if (hi >= 0) { v.stopIdx = hi; toRoute(v); say(v, 'What’s that bird squawking about?!', 1.8); }
    }
    completeTask('budgie');
  }
  // Rummage through a scrapyard junk pile (E with empty paws next to one)
  function rummageAction() {
    if (!L.junk || player.held) return false;
    const J = L.junk.find((j) => !j.found && Math.hypot(player.x - j.x, player.y - (j.y + 10)) < 26);
    if (!J) return false;
    J.found = true; sfx('rustle'); sfx('bonk');
    const it = addItem(pick(JUNK), J.x + rr(-8, 8), J.y + 14); it.junk = true; Object.assign(it, { air: true, vz: 100 });
    player.bubble = { text: rpick(['ooh, treasure!', 'what’s this?', 'junk! lovely junk!']), t: 1.2 };
    completeTask('rummage');
    return true;
  }
  const junkNear = () => !player.held && L && L.junk && L.junk.some((j) => !j.found && Math.hypot(player.x - j.x, player.y - (j.y + 10)) < 26);

  // ---------------------------------------------------------------------------
  // Railway, harbour and marsh villages, and pranks (knock-and-run, swapped
  // signposts, whoopee cushions, painted fences).
  // ---------------------------------------------------------------------------
  Object.assign(ITEM, {
    suitcase: { name: 'suitcase', h: 12, r: 7, draw(c) { c.fillStyle = '#8a4a2a'; roundRect(c, -7, -11, 14, 11, 2, true); c.fillStyle = '#c9a33a'; c.fillRect(-7, -7, 14, 1.4); c.fillStyle = '#5a3a20'; c.fillRect(-2.5, -13, 5, 2); c.fillStyle = '#f4e3b8'; c.fillRect(2, -10, 4, 3); } },
    fishcrate: { name: 'crate of fish', h: 11, r: 8, draw(c) { c.fillStyle = '#a0703f'; c.fillRect(-8, -9, 16, 9); c.fillStyle = '#7a5230'; c.fillRect(-8, -9, 16, 2); c.fillStyle = '#9ab8c8'; for (let k = 0; k < 3; k++) ellipse(c, -4 + k * 4, -10, 2.4, 1.2); } },
    lobster: { name: 'lobster', h: 6, r: 6, draw(c) { c.fillStyle = '#c0392b'; ellipse(c, 0, -3, 5, 2.4); circle(c, -6, -5, 2); circle(c, 6, -5, 2); c.strokeStyle = '#c0392b'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(4, -4); c.lineTo(8, -8); c.moveTo(-4, -4); c.lineTo(-8, -8); c.stroke(); } },
    wispgem: { name: 'glowing pebble', h: 6, r: 3, draw(c, it, t) { c.fillStyle = `rgba(140,220,255,${0.3 + Math.sin((t || 0) * 4) * 0.15})`; circle(c, 0, -3, 6); c.fillStyle = '#bff1ff'; circle(c, 0, -3, 2.6); } },
    whoopee: { name: 'whoopee cushion', h: 4, r: 6, draw(c) { c.fillStyle = '#e8456a'; ellipse(c, 0, -2.5, 6, 3); c.fillStyle = '#c0304e'; c.fillRect(5, -3.5, 3, 2); } },
    paint: { name: 'pot of pink paint', h: 10, r: 5, draw(c) { c.fillStyle = '#8a8e96'; roundRect(c, -5, -9, 10, 9, 2, true); c.fillStyle = '#f28ab8'; ellipse(c, 0, -9, 5, 1.6); c.fillRect(-5, -6, 10, 2.5); c.strokeStyle = '#5a5e66'; c.lineWidth = 0.8; c.beginPath(); c.arc(0, -9, 5, Math.PI, 0); c.stroke(); } },
  });
  const PAINT = '#f28ab8';

  // --- Railway: a track across the village, a station, a level crossing and a little train --------
  function buildRailway() {
    if (L.kind !== 'railway') return;
    const south = L.roadY + 14 < MH - 5, ry = south ? L.roadY + 10 : L.roadY - 12;
    if (ry < 6) return;
    for (let x = 2; x < MW - 2; x++) { reserve(x, ry - 1, 1, 4); const t0 = getT(x, ry), t1 = getT(x, ry + 1); if (t0 === WATER || t1 === WATER) { setT(x, ry, BRIDGE); setT(x, ry + 1, BRIDGE); } }
    const sx = clamp(L.roadX + (L.roadX + 16 < MW - 6 ? 7 : -12), 6, MW - 14);
    reserve(sx - 1, ry - 4, 10, 4);
    L.rail = { y: (ry + 1) * TILE, row: ry, x0: 4 * TILE, x1: WORLD_W - 4 * TILE, crossX: (L.roadX + 1) * TILE, station: { x: (sx + 4) * TILE, y: (ry - 0.4) * TILE, tx: sx } };
    L.train = { x: (sx + 4) * TILE, dir: 1, stopT: 3, cars: 2, tootCD: 0 };
  }
  function makeTrack() {
    const R = L.rail;
    return {
      kind: 'track', x: WORLD_W / 2, y: R.y - TILE - 30, bounds: { l: 0, r: WORLD_W, t: R.y - TILE - 4, b: R.y + TILE + 4 },
      draw(ctx) {
        ctx.fillStyle = 'rgba(120,110,95,0.55)'; ctx.fillRect(R.x0 - 60, R.y - 22, R.x1 - R.x0 + 120, 30); // ballast
        ctx.fillStyle = '#6b4a2e'; for (let x = R.x0 - 60; x < R.x1 + 60; x += 12) ctx.fillRect(x, R.y - 20, 6, 26);
        ctx.fillStyle = '#8a8e96'; ctx.fillRect(R.x0 - 60, R.y - 16, R.x1 - R.x0 + 120, 2.5); ctx.fillRect(R.x0 - 60, R.y + 1, R.x1 - R.x0 + 120, 2.5);
      },
    };
  }
  function makeStation() {
    const S = L.rail.station, x = S.x, y = S.y;
    return {
      kind: 'station', x, y: y - 40, hitbox: box(x - 40, y - 74, 80, 30), bounds: { l: x - 140, r: x + 140, t: y - 130, b: y + 6 },
      draw(ctx) {
        ctx.fillStyle = '#b5b0a4'; ctx.fillRect(x - 130, y - 14, 260, 14); ctx.fillStyle = '#f2d06a'; ctx.fillRect(x - 130, y - 2, 260, 2); // the platform
        ctx.fillStyle = '#c08a52'; ctx.fillRect(x - 40, y - 96, 80, 52); ctx.fillStyle = '#7a3a2a'; poly(ctx, [[x - 48, y - 94], [x + 48, y - 94], [x + 36, y - 116], [x - 36, y - 116]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - 40, y - 100], [x + 40, y - 100], [x + 34, y - 116], [x - 34, y - 116]]); ctx.fill(); }
        ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 8, y - 70, 16, 26); ctx.fillStyle = duskK > 0.35 ? '#ffd98a' : '#9fd3e8'; ctx.fillRect(x - 32, y - 80, 16, 12); ctx.fillRect(x + 16, y - 80, 16, 12);
        ctx.fillStyle = '#f4e3b8'; roundRect(ctx, x - 30, y - 92, 60, 10, 2, true); ctx.fillStyle = '#5a3a20'; ctx.font = 'bold 6.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(L.name.toUpperCase(), x, y - 85);
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(x + 70, y - 60, 2, 46); ctx.fillStyle = '#f4f2ee'; circle(ctx, x + 71, y - 62, 7); ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 71, y - 62, 7, 0, Math.PI * 2); ctx.moveTo(x + 71, y - 62); ctx.lineTo(x + 71, y - 67); ctx.moveTo(x + 71, y - 62); ctx.lineTo(x + 74, y - 62); ctx.stroke();
      },
    };
  }
  function makeCrossing() {
    const R = L.rail, x = R.crossX;
    return {
      kind: 'crossing', x, y: R.y + TILE, bounds: { l: x - 60, r: x + 60, t: R.y - 80, b: R.y + TILE + 4 },
      draw(ctx, t) {
        const down = L.train && Math.abs(L.train.x - x) < 280;
        for (const s of [-1, 1]) {
          const px = x + s * 44, py = s < 0 ? R.y - TILE - 6 : R.y + TILE;
          ctx.fillStyle = '#f4f2ee'; ctx.fillRect(px - 2, py - 30, 4, 30);
          ctx.fillStyle = down && Math.floor(t * 4) % 2 ? '#ff4040' : '#5a2020'; circle(ctx, px - 4, py - 30, 2.4); ctx.fillStyle = down && Math.floor(t * 4) % 2 === 0 ? '#ff4040' : '#5a2020'; circle(ctx, px + 4, py - 30, 2.4);
          ctx.save(); ctx.translate(px, py - 20); ctx.rotate(down ? 0 : -s * 1.3);
          for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#e8453c' : '#f4f2ee'; ctx.fillRect(-s * k * 7 - (s > 0 ? 7 : 0), -2, 7, 4); }
          ctx.restore();
        }
      },
    };
  }
  function makeTrainObj() {
    const T0 = L.train, R = L.rail;
    return {
      kind: 'train', get x() { return T0.x; }, get y() { return R.y + 2; },
      get bounds() { return { l: T0.x - 180, r: T0.x + 180, t: R.y - 70, b: R.y + 10 }; },
      draw(ctx, t) {
        const d = T0.dir, y = R.y;
        for (let k = T0.cars; k >= 1; k--) { // carriages behind the engine
          const cx = T0.x - d * k * 66;
          ctx.fillStyle = '#2b2d33'; circle(ctx, cx - 18, y + 2, 5); circle(ctx, cx + 18, y + 2, 5);
          ctx.fillStyle = k % 2 ? '#3f7f6a' : '#7a2e3a'; roundRect(ctx, cx - 28, y - 30, 56, 30, 4, true);
          ctx.fillStyle = '#bfe4f2'; for (let w = 0; w < 3; w++) ctx.fillRect(cx - 22 + w * 16, y - 24, 11, 9);
          ctx.fillStyle = '#c9a33a'; ctx.fillRect(cx - 28, y - 32, 56, 3);
        }
        const ex = T0.x;
        ctx.fillStyle = '#2b2d33'; for (const wx of [-16, 0, 16]) circle(ctx, ex + wx, y + 1, 6.5);
        ctx.fillStyle = '#c0392b'; roundRect(ctx, ex - 26, y - 22, 40, 20, 4, true);
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(ex - d * 20 - 8, y - 40, 16, 22); ctx.fillStyle = '#bfe4f2'; ctx.fillRect(ex - d * 20 - 5, y - 36, 10, 7);
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(ex + d * 8 - 3, y - 36, 6, 14);
        ctx.fillStyle = '#c9a33a'; circle(ctx, ex + d * 16, y - 12, 4);
        if (T0.stopT <= 0 && Math.random() < 0.3 && !paused) particles.push({ x: ex + d * 8, y: y - 2, r: rr(4, 7), life: 1.2, max: 1.2, vy: -30 });
      },
    };
  }
  function updateTrain(dt) {
    const T0 = L.train, R = L.rail;
    if (!T0) return;
    T0.tootCD = Math.max(0, T0.tootCD - dt);
    const span = T0.cars * 66 + 30;
    // things thrown onto the train ride along on the roof
    for (const it of items) {
      if (it.trainOff !== undefined && !it.held && !it.air) { it.x = T0.x + it.trainOff; it.y = R.y - 1; it.z = 30; continue; }
      if (it.air && it.z < 40 && Math.abs(it.y - R.y) < 18 && (it.x - T0.x) * T0.dir < 30 && (it.x - T0.x) * T0.dir > -span) { it.air = false; it.vx = it.vy = it.vz = 0; it.trainOff = it.x - T0.x; it.z = 30; completeTask('trainthrow'); }
    }
    if (T0.stopT > 0) { T0.stopT -= dt; return; }
    const st = R.station.x, before = T0.x;
    T0.x += T0.dir * 95 * dt;
    if (before !== st && (before - st) * (T0.x - st) <= 0) { T0.x = st; T0.stopT = 5; sfx('ding'); }
    if (T0.x > R.x1) { T0.x = R.x1; T0.dir = -1; T0.stopT = 2; } else if (T0.x < R.x0) { T0.x = R.x0; T0.dir = 1; T0.stopT = 2; }
    const onTrack = areaOf(player.x, player.y) === 0 && Math.abs(player.y - R.y) < 22 && !player.ride;
    const ahead = (player.x - T0.x) * T0.dir;
    if (onTrack && ahead > 0 && ahead < 160 && T0.tootCD <= 0) { T0.tootCD = 3; sfx('honk'); sfx('honk'); player.bubble = { text: 'TOOT TOOT!', t: 1.2 }; completeTask('traintoot'); }
    if (onTrack && ahead > -span && ahead < 30) knockPlayer(player.x, R.y + (player.y < R.y ? 40 : -40), 260);
  }
  const trainBoardable = () => { const T0 = L && L.train; return !!T0 && T0.stopT > 0 && !player.ride && Math.abs(player.x - T0.x) < T0.cars * 66 + 30 && Math.abs(player.y - L.rail.y) < 60; };

  // --- Harbour: a lighthouse, lobster pots, a fish market and a fishing boat --------------------
  function makeLighthouse(x, y) {
    return {
      kind: 'lighthouse', x, y, hitbox: box(x - 16, y - 12, 32, 13), bounds: { l: x - 30, r: x + 30, t: y - 170, b: y + 6 },
      shadow(ctx) { ctx.fillStyle = 'rgba(20,40,10,0.22)'; ellipse(ctx, x + 14, y, 26, 7); },
      draw(ctx, t) {
        for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#f4f2ee' : '#c0392b'; poly(ctx, [[x - 16 + k * 1.2, y - k * 22], [x + 16 - k * 1.2, y - k * 22], [x + 16 - (k + 1) * 1.2, y - (k + 1) * 22], [x - 16 + (k + 1) * 1.2, y - (k + 1) * 22]]); ctx.fill(); }
        ctx.fillStyle = '#2b2d33'; ctx.fillRect(x - 12, y - 146, 24, 14); ctx.fillStyle = duskK > 0.2 ? '#fff3a8' : '#bfe4f2'; ctx.fillRect(x - 9, y - 144, 18, 10);
        ctx.fillStyle = '#c0392b'; poly(ctx, [[x - 14, y - 146], [x + 14, y - 146], [x, y - 160]]); ctx.fill();
        ctx.fillStyle = '#3a2418'; roundRect(ctx, x - 5, y - 18, 10, 18, 5, true);
        if (duskK > 0.2) { const a = t * 0.9, len = 260; ctx.fillStyle = `rgba(255,243,168,${0.18 * duskK})`; poly(ctx, [[x, y - 140], [x + Math.cos(a - 0.12) * len, y - 140 + Math.sin(a - 0.12) * len * 0.5], [x + Math.cos(a + 0.12) * len, y - 140 + Math.sin(a + 0.12) * len * 0.5]]); ctx.fill(); }
      },
    };
  }
  function makeLobsterPot(x, y) {
    const P = { x, y, raided: false };
    (L.pots = L.pots || []).push(P);
    return {
      kind: 'lobsterpot', x, y, bounds: { l: x - 12, r: x + 12, t: y - 16, b: y + 3 },
      draw(ctx) { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 9, y - 2, 18, 2); ctx.strokeStyle = '#a0703f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 9, 0, Math.PI, 0); ctx.stroke(); for (let k = -6; k <= 6; k += 4) { ctx.beginPath(); ctx.moveTo(x + k, y - 2); ctx.lineTo(x + k * 0.6, y - 10); ctx.stroke(); } if (!P.raided) { ctx.fillStyle = '#c0392b'; ellipse(ctx, x, y - 4, 3, 1.5); } },
    };
  }
  function makeFishingBoat() {
    const B = L.fboat;
    return {
      kind: 'fishingboat', get x() { return B.x; }, get y() { return B.y; }, get bounds() { return { l: B.x - 60, r: B.x + 60, t: B.y - 70, b: B.y + 10 }; },
      draw(ctx, t) {
        const x = B.x, y = B.y + Math.sin(t * 1.4) * 1.2, d = B.dir;
        ctx.fillStyle = 'rgba(200,230,255,0.45)'; ellipse(ctx, x, y + 2, 48, 6);
        ctx.fillStyle = '#2f5a7a'; poly(ctx, [[x - 40, y - 12], [x + 40, y - 12], [x + d * 46, y - 16], [x + 30, y], [x - 30, y]]); ctx.fill();
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(x - d * 14 - 10, y - 30, 20, 18); ctx.fillStyle = '#bfe4f2'; ctx.fillRect(x - d * 14 - 6, y - 26, 12, 6);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x + d * 10 - 1.5, y - 52, 3, 40);
        ctx.strokeStyle = '#3a3530'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + d * 10, y - 52); ctx.lineTo(x + d * 40, y - 14); ctx.stroke();
        ctx.fillStyle = '#c0392b'; poly(ctx, [[x + d * 10, y - 52], [x + d * 22, y - 48], [x + d * 10, y - 44]]); ctx.fill();
      },
    };
  }
  function buildHarbour() {
    if (!L.harbour || !L.pier) return;
    const T = TILE, px = Math.floor(L.pier.x / T);
    const lx = clamp(px + (px + 22 < MW - 6 ? 18 : -18), 6, MW - 7), ly = (L.shore[lx] - 2.2) * T;
    L.lighthouse = { x: (lx + 0.5) * T, y: ly, door: { x: (lx + 0.5) * T, y: ly + 12 } };
    objects.push(makeLighthouse(L.lighthouse.x, L.lighthouse.y));
    for (const dx of [-5, -3.5, 4.5]) { const tx = clamp(px + Math.round(dx), 4, MW - 5); objects.push(makeLobsterPot((tx + 0.5) * T, (L.shore[tx] - 0.8) * T)); }
    const mx = clamp(px - 6, 4, MW - 8), my = L.shore[mx] - 4.2;
    const s = { ...STALLS[2], label: 'FISH MARKET', goods: ['fish', 'fish', 'fish'] };
    objects.push(makeStall((mx + 1) * T, my * T, s));
    L.stalls = [{ ...s, x: (mx + 1) * T, y: my * T, vx: (mx + 1) * T, vy: (my - 0.9) * T }];
    L.fboat = { x: -100, y: L.pier.endY - 6, dir: 1, state: 'in', t: rr(5, 15), dock: L.pier.x - 70 };
    objects.push(makeFishingBoat());
  }
  function updateHarbour(dt) {
    const B = L.fboat;
    if (B) {
      if (B.state === 'wait') { B.t -= dt; if (B.t <= 0) { B.state = 'in'; B.x = -100; B.dir = 1; } }
      else if (B.state === 'in') { B.x += 60 * dt; if (B.x >= B.dock) { B.x = B.dock; B.state = 'docked'; B.t = 9; const it = addItem('fishcrate', L.pier.x - 4, L.pier.endY - 16, { owner: 'ollie' }); it.catch = true; if (Math.hypot(player.x - B.x, player.y - B.y) < 500) sfx('honk'); } }
      else if (B.state === 'docked') { B.t -= dt; if (B.t <= 0) { B.state = 'out'; } }
      else if (B.state === 'out') { B.x += 60 * dt; if (B.x > WORLD_W + 120) { B.state = 'wait'; B.t = rr(25, 45); } }
    }
    for (const P of L.pots || []) if (!P.raided && areaOf(player.x, player.y) === 0 && Math.hypot(player.x - P.x, player.y - P.y) < 14) {
      P.raided = true; const it = addItem('lobster', P.x + 10, P.y + 6); it.touched = true; sfx('splash'); player.bubble = { text: 'a lobster!', t: 1.2 }; completeTask('lobster');
    }
    // lobsters pinch
    const h = player.held;
    if (h && h.kind === 'lobster') { h.pinchT = (h.pinchT || 0) + dt; if (h.pinchT > 1.5) { h.pinchT = 0; player.bubble = { text: 'OW! It pinched me!', t: 1.2 }; player.hopV = 140; player.hop = 0.01; dropHeld(true); } }
  }
  const lighthouseNear = () => L && L.lighthouse && !player.ride && Math.hypot(player.x - L.lighthouse.door.x, player.y - L.lighthouse.door.y) < 22;

  // --- Marsh: a bog of sucking mud with boardwalks, pools, stilt huts, a giant toad, wisps ------------
  function buildMarsh(markSolid, place) {
    if (L.kind !== 'marsh') return;
    const r = place(18, 12);
    if (!r) return;
    const B = { x: r.x + 1, y: r.y + 1, w: 16, h: 10 };
    for (let k = 0; k < 4; k++) { // pools
      const cx = B.x + 2 + rand() * (B.w - 4), cy = B.y + 2 + rand() * (B.h - 4), rr0 = 1.2 + rand() * 1.4;
      for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.3) < rr0) setT(x, y, WATER);
    }
    const my = B.y + Math.floor(B.h / 2), mx = B.x + Math.floor(B.w / 3);
    for (let x = B.x - 1; x <= B.x + B.w; x++) setT(x, my, BRIDGE); // boardwalks
    for (let y = B.y - 1; y <= B.y + B.h; y++) setT(mx, y, BRIDGE);
    L.bog = B; L.boardwalk = { my, mx };
    reserve(r.x, r.y, 18, 12);
  }
  const inBog = (x, y) => { const B = L && L.bog; if (!B || areaOf(x, y) !== 0) return false; const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= B.x && tx < B.x + B.w && ty >= B.y && ty < B.y + B.h && getT(tx, ty) === GRASS; };
  function makeBog() {
    const B = L.bog, reeds = Array.from({ length: 30 }, () => [(B.x + rand() * B.w) * TILE, (B.y + rand() * B.h) * TILE]);
    return {
      kind: 'bog', x: (B.x + B.w / 2) * TILE, y: B.y * TILE - 40, bounds: { l: B.x * TILE - 10, r: (B.x + B.w) * TILE + 10, t: B.y * TILE - 20, b: (B.y + B.h) * TILE + 10 },
      draw(ctx, t) {
        for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) {
          if (getT(x, y) !== GRASS) continue;
          ctx.fillStyle = (x * 7 + y * 3) % 3 ? '#5a5232' : '#4e4a2c'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          if ((x * 5 + y * 11) % 4 === 0) { const b = (t * 0.5 + x * 0.3) % 1; ctx.fillStyle = `rgba(140,130,90,${0.6 - b * 0.6})`; circle(ctx, x * TILE + 12, y * TILE + 14, 1.5 + b * 3); }
        }
        ctx.strokeStyle = '#6a7a3a'; ctx.lineWidth = 1.2;
        for (const [rx, ry] of reeds) { if (getT(Math.floor(rx / TILE), Math.floor(ry / TILE)) === BRIDGE) continue; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry - 12); ctx.moveTo(rx + 2, ry); ctx.lineTo(rx + 3, ry - 10); ctx.stroke(); ctx.fillStyle = '#6b4a2e'; ellipse(ctx, rx - 2, ry - 13, 1.4, 3); }
      },
    };
  }
  function makeStiltHut(x, y) {
    const o = {
      kind: 'stilthut', x, y, r: 16, hitbox: null, rustle: 0, bounds: { l: x - 30, r: x + 30, t: y - 70, b: y + 6 },
      contains(px, py) { return Math.abs(px - x) < 10 && py > y - 8 && py < y + 4; },
      draw(ctx) {
        ctx.fillStyle = '#5a3a20'; for (const lx of [-20, -8, 8, 20]) ctx.fillRect(x + lx - 1.5, y - 24, 3, 26);
        ctx.fillStyle = '#8a6a46'; ctx.fillRect(x - 24, y - 50, 48, 28);
        ctx.fillStyle = '#c9a33a'; poly(ctx, [[x - 30, y - 48], [x + 30, y - 48], [x, y - 70]]); ctx.fill();
        if (isWinter()) { ctx.fillStyle = '#f4f8fb'; poly(ctx, [[x - 16, y - 56], [x + 16, y - 56], [x, y - 70]]); ctx.fill(); }
        ctx.fillStyle = '#2a1e14'; ctx.fillRect(x - 6, y - 40, 12, 18);
        ctx.fillStyle = '#7a5230'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 6, y - 20 + k * 5, 12, 2); // steps down to the boardwalk
        if (player.hidden && player.hidingIn === o) { ctx.fillStyle = '#ffffff'; circle(ctx, x - 2.5, y - 31, 1.4); circle(ctx, x + 2.5, y - 31, 1.4); }
      },
    };
    return o;
  }
  function placeMarsh() {
    const B = L.bog;
    if (!B) return;
    const T = TILE, { my, mx } = L.boardwalk;
    objects.push(makeBog());
    L.huts = [];
    for (const hx of [B.x + B.w - 3, B.x + 2]) { if (Math.abs(hx - mx) < 3) continue; const o = makeStiltHut((hx + 0.5) * T, (my + 0.4) * T); objects.push(o); L.huts.push(o); }
  }
  function spawnMarshCritters() {
    const B = L.bog;
    if (!B) return;
    const T = TILE;
    let pool = null;
    for (let n = 0; n < 200 && !pool; n++) { const x = B.x + Math.floor(rand() * B.w), y = B.y + Math.floor(rand() * B.h); if (getT(x, y) === GRASS && getT(x + 1, y) === WATER) pool = { x: (x + 0.5) * T, y: (y + 0.7) * T }; }
    if (!pool) pool = { x: (B.x + 2) * T, y: (B.y + 2) * T };
    critters.push({ type: 'gtoad', x: pool.x, y: pool.y, z: 0, dir: 'right', walk: 0, ph: 0, croakCD: 0, tongue: 0, flying: true });
    critters.push({ type: 'wisp', x: (B.x + B.w * 0.7) * T, y: (B.y + B.h * 0.3) * T, z: 14, dir: 'left', walk: 0, ph: 0, flying: true, moves: 0, tx: null });
  }
  function updateMarshCritter(c, dt) {
    const pd = Math.hypot(player.x - c.x, player.y - c.y), outside = areaOf(player.x, player.y) === 0;
    if (c.type === 'gtoad') {
      c.croakCD = Math.max(0, c.croakCD - dt); c.tongue = Math.max(0, c.tongue - dt);
      if (outside && pd < 70 && c.croakCD <= 0) {
        c.croakCD = 6; c.bubble = { text: 'RIIIBBIT!!', t: 1.2 }; sfx('ribbit'); sfx('moo');
        for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - c.x, v.y - c.y) < 220) startleV(v, rpick(['What WAS that?!', 'That toad is enormous!', 'Gah!']));
        completeTask('toad');
      }
      const h = player.held;
      if (outside && h && isFood(h) && pd < 80 && c.tongue <= 0) { // SHLURP
        c.tongue = 0.5; c.dir = player.x > c.x ? 'right' : 'left';
        player.held = null; const i = items.indexOf(h); if (i >= 0) items.splice(i, 1);
        player.bubble = { text: 'hey! my snack!', t: 1.3 }; c.bubble = { text: '*SHLURP* gulp.', t: 1.2 }; sfx('gulp');
        completeTask('toadsnack');
      }
      return;
    }
    if (c.type === 'wisp') {
      c.z = 16 + Math.sin(c.ph * 2) * 5;
      if (duskK < 0.3 || c.done) return;
      if (c.tx !== null) { const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy); if (d > 2) { c.x += dx / d * Math.min(d, 70 * dt); c.y += dy / d * Math.min(d, 70 * dt); } else c.tx = null; return; }
      if (outside && pd < 50) {
        if (c.moves >= 3) { c.done = true; const it = addItem('wispgem', c.x, c.y); it.touched = false; sfx('happy'); sparkle(c.x, c.y, 10); return; }
        const B = L.bog; c.moves++; c.tx = clamp(c.x + rr(-160, 160), (B.x - 2) * TILE, (B.x + B.w + 2) * TILE); c.ty = clamp(c.y + rr(-120, 120), (B.y - 2) * TILE, (B.y + B.h + 2) * TILE);
      }
    }
  }
  function drawMarshCritter(ctx, c, t) {
    if (c.type === 'wisp') {
      if (duskK < 0.3 || c.done) return;
      const g = 0.6 + Math.sin(t * 5) * 0.3;
      ctx.fillStyle = `rgba(140,220,255,${0.2 * g})`; circle(ctx, c.x, c.y - c.z, 12);
      ctx.fillStyle = `rgba(200,245,255,${0.7 * g})`; circle(ctx, c.x, c.y - c.z, 3.5);
      return;
    }
    ctx.save(); ctx.translate(c.x, c.y); if (c.dir === 'left') ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(20,30,10,0.25)'; ellipse(ctx, 0, 0, 16, 4);
    const puff = c.croakCD > 5 ? 4 : 0;
    ctx.fillStyle = '#5a7a3a'; ellipse(ctx, 0, -9, 15, 10); ellipse(ctx, -10, -3, 6, 3.5); ellipse(ctx, 10, -3, 6, 3.5);
    ctx.fillStyle = '#e8d8a0'; ellipse(ctx, 6, -5, 6 + puff, 4 + puff * 0.6);
    ctx.fillStyle = '#7a9a4a'; circle(ctx, 4, -18, 4.5); circle(ctx, 12, -16, 4.5);
    ctx.fillStyle = '#f2c14e'; circle(ctx, 4.5, -19, 2.4); circle(ctx, 12.5, -17, 2.4); ctx.fillStyle = '#1d1d22'; ctx.fillRect(3, -19.5, 3, 1); ctx.fillRect(11, -17.5, 3, 1);
    if (c.tongue > 0) { const len = (0.5 - Math.abs(c.tongue - 0.25)) * 160; ctx.strokeStyle = '#e8708a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(14 + len, -12); ctx.stroke(); ctx.fillStyle = '#e8708a'; circle(ctx, 14 + len, -12, 2.4); }
    ctx.restore();
  }

  // --- Pranks -------------------------------------------------------------------------------------------
  function doorNear() {
    if (!L || !L.rooms || areaOf(player.x, player.y) !== 0) return null;
    for (const h of L.rooms) { if (!h) continue; const wall = (h.y + h.h) * TILE; if (Math.abs(player.x - h.doorOut.x) < 16 && player.y - wall > 6 && player.y - wall < 32) return h; }
    return null;
  }
  function knockAction() {
    const h = doorNear();
    if (!h || L.knock) return false;
    for (let k = 0; k < 3; k++) setTimeout(() => sfx('tap'), k * 160);
    player.bubble = { text: 'knock knock!', t: 1 };
    L.knock = { h, t: 2.6 };
    return true;
  }
  function updatePranks(dt) {
    // knock-and-run: someone comes to the door
    const K = L.knock;
    if (K) {
      K.t -= dt;
      if (K.t <= 0 && !K.answered) {
        K.answered = true; K.t = 3;
        const v = villagers.find((x) => areaOf(x.x, x.y) === K.h.area && x.state !== 'chase') || null;
        if (!v) { toast('Nobody’s home...', 'Knock knock', true); L.knock = null; return; }
        Object.assign(v, { x: K.h.doorOut.x, y: K.h.doorOut.y - 2, dir: 'down', path: null, state: 'act', actT: 3 }); K.v = v;
        const seen = canSeePlayer(v) && Math.hypot(player.x - v.x, player.y - v.y) < 150;
        if (seen) { v.cooldown = 0; startleV(v, 'YOU! Knock-knock, is it?!', { state: 'chase', target: null }); v.stateT = 7; }
        else { say(v, rpick(['Hello? ...Who’s there?', 'Hmph. Kids.', 'Is anybody there?']), 2); completeTask('knock'); }
      } else if (K.answered && K.t <= 0) { if (K.v && K.v.state === 'act') toRoute(K.v); L.knock = null; }
    }
    // whoopee cushions where someone sits down
    for (const it of items) {
      if (it.kind !== 'whoopee' || it.held || it.air || it.used) continue;
      for (const v of villagers) {
        const st = v.stops[v.stopIdx];
        if (v.state !== 'act' || !st || st.act !== 'sit' || Math.hypot(v.x - it.x, v.y - it.y) > 26) continue;
        it.used = true; tone(90, 60, 0.5, 'sawtooth', 0.08); noise(0.4, 0.06, 300);
        startleV(v, rpick(['Oh my! I beg your pardon!', 'That WASN’T me!', 'Goodness gracious!'])); completeTask('whoopee');
        lookTowards(v.x, v.y, 200, () => rpick(['Hee hee!', 'Pfft!', 'Excuse YOU!']));
        break;
      }
    }
    // painting fences pink
    if (player.held && player.held.kind === 'paint' && areaOf(player.x, player.y) === 0) for (const o of solidObjects) {
      if (o.kind !== 'fence' || o.paint || Math.hypot(o.x - player.x, o.y - player.y) > 22) continue;
      o.paint = PAINT; run.painted = (run.painted || 0) + 1; setProgress('paint', run.painted);
      if (Math.random() < 0.3) particles.push({ kind: 'shard', col: PAINT, x: o.x, y: o.y, z: 10, vx: rr(-20, 20), vy: rr(-10, 10), vz: rr(20, 50), life: 0.5, max: 0.5 });
      for (const v of villagers) if (areaOf(v.x, v.y) === 0 && Math.hypot(v.x - o.x, v.y - o.y) < 200 && (v.paintCD || 0) < time && canSeePlayer(v)) { v.paintCD = time + 15; say(v, rpick(['Is that... PINK?!', 'Who’s painting my fence?!']), 1.8); }
    }
    // villagers puzzled by the swapped signpost
    if (L.signSwapped) for (const v of villagers) if (!v.signSeen && areaOf(v.x, v.y) === 0 && Math.hypot(v.x - L.signSwapped.x, v.y - L.signSwapped.y) < 70) { v.signSeen = true; say(v, rpick([`Hang on, the ${L.signSwapped.right}’s that way?`, 'Has someone moved the sign?', 'I’m sure the pond was the other way...']), 2); v.dir = rpick(['left', 'right', 'up', 'down']); }
  }
  function signAction() {
    if (!L || areaOf(player.x, player.y) !== 0) return false;
    const s = objects.find((o) => o.kind === 'sign' && o.right !== undefined && Math.hypot(player.x - o.x, player.y - o.y) < 24);
    if (!s) return false;
    [s.left, s.right] = [s.right, s.left]; sfx('creak'); player.bubble = { text: 'hee hee', t: 1 };
    L.signSwapped = s; for (const v of villagers) v.signSeen = false;
    completeTask('signswap');
    return true;
  }
  const signNear = () => L && areaOf(player.x, player.y) === 0 && !player.held && objects.some((o) => o.kind === 'sign' && o.right !== undefined && Math.hypot(player.x - o.x, player.y - o.y) < 24);
  function placePrankItems() {
    for (let k = 0; k < 2; k++) { const s = freeSpotNear(L.plaza.x + (k ? 14 : -3), L.plaza.y + 4 + k * 4, 1, 1, 4); if (s) addItem('whoopee', (s[0] + 0.5) * TILE, (s[1] + 0.6) * TILE); }
    const g = L.garden; if (g) placeFree('paint', (g.x - 2) * TILE, (g.y + 2) * TILE, { owner: 'bertram' });
  }

  function updateRailHarbour(dt) {
    if (!L || !started || paused) return;
    if (L.rail) updateTrain(dt);
    if (L.harbour) updateHarbour(dt);
    updatePranks(dt);
    if (inBog(player.x, player.y) && !player.ride) { player.mud = Math.max(player.mud || 0, 30); if (player.speed > 5) completeTask('bog'); if (Math.random() < 0.08) particles.push({ x: player.x + rr(-5, 5), y: player.y, r: 2, life: 0.5, max: 0.5, vy: -4, soil: true }); }
  }
  function placeRailObjects() {
    if (L.rail) { objects.push(makeTrack()); objects.push(makeStation()); objects.push(makeCrossing()); objects.push(makeTrainObj()); }
    buildHarbour();
    placeMarsh();
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
      case 'bell': tone(520, 515, 1.2, 'triangle', 0.09); tone(1040, 1030, 0.9, 'sine', 0.04); break;
      case 'alarm': tone(880, 660, 0.18, 'square', 0.04); break;
      case 'shopbell': tone(1760, 1750, 0.25, 'triangle', 0.05); tone(2200, 2190, 0.3, 'triangle', 0.04, 0.12); break;
      case 'jingle': [1800, 2200, 2000].forEach((f, k) => tone(f, f * 1.02, 0.07, 'triangle', 0.025, k * 0.05)); break;
      case 'neigh': tone(700, 900, 0.15, 'sawtooth', 0.035); tone(900, 500, 0.35, 'sawtooth', 0.03, 0.14); break;
      case 'peep': tone(2200, 2600, 0.06, 'sine', 0.035); break;
      case 'spit': noise(0.12, 0.12, 2800); tone(300, 120, 0.08, 'square', 0.03); break;
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
    if (e.code === 'KeyG' && !e.repeat) wearToggle();
    if (e.code === 'KeyB' && !e.repeat) buryAction();
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
  const wearBtn = document.getElementById('wear'), digBtn = document.getElementById('dig');
  wearBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!paused) wearToggle(); });
  digBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!paused) buryAction(); });
  function syncTouchButtons() {
    const canWear = !!player.disguise || !!(player.held && WEARABLE.has(player.held.kind));
    if (wearBtn.hidden === canWear) wearBtn.hidden = !canWear;
    const wl = player.disguise ? 'unwear' : 'wear'; if (wearBtn.textContent !== wl) wearBtn.textContent = wl;
    const nearMound = L && L.buried && !player.held && L.buried.some((b) => Math.hypot(b.x - player.x, b.y - player.y) < 20);
    const canDig = nearMound || !!(player.held && !player.held.type.heavy && L && diggable(player.x, player.y));
    if (digBtn.hidden === canDig) digBtn.hidden = !canDig;
    const dl = nearMound ? 'dig up' : 'bury'; if (digBtn.textContent !== dl) digBtn.textContent = dl;
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

    if (!indoors) { drawPuddles(ctx, t); drawFrost(ctx, left, top, viewW, viewH, t); drawMounds(ctx); drawFlood(ctx, t); drawRainyGround(ctx); }
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
      if (o.isPlayer) { if (player.boat) drawRowboat(ctx, player.x, player.y + 2, t, player.speed > 10); if (player.sled) drawSledUnder(ctx, player.x, player.y); if (player.roof) continue; if (player.ride) { ctx.save(); ctx.translate(0, -(player.rideZ || 0)); if (player.ride.kind === 'cable') drawGondola(ctx, player.x, player.y + 4); if (player.ride.kind === 'wheel') { ctx.fillStyle = '#f2c14e'; roundRect(ctx, player.x - 9, player.y - 6, 18, 10, 3, true); } drawPlayerWithHeld(ctx, t); ctx.restore(); continue; } if (player.tree) { ctx.save(); ctx.translate(0, -52); drawPlayerWithHeld(ctx, t); ctx.restore(); } else if (player.swim) { ctx.save(); ctx.beginPath(); ctx.rect(player.x - 40, player.y - 90, 80, 84); ctx.clip(); ctx.translate(0, 4); drawPlayerWithHeld(ctx, t); ctx.restore(); ctx.strokeStyle = 'rgba(230,245,255,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(player.x, player.y - 4, 12, 3.5, 0, 0, Math.PI * 2); ctx.stroke(); } else drawPlayerWithHeld(ctx, t); continue; }
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

    if (!indoors) { drawBolt(ctx, top); drawWhirl(ctx, t); drawSpits(ctx); drawLasers(ctx, t); drawLantern(ctx, t); }
    if (player.roof) drawPlayerWithHeld(ctx, t);
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
    else if (player.roof && started && player.x > roofRect(player.roof).r - 26 && player.y > roofRect(player.roof).b - 24) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'climb down' } }, t);
    else if (player.ride && ['boat', 'carousel', 'train', 'lighthouse'].includes(player.ride.kind) && started) drawPrompt(ctx, { x: player.x, y: player.y - (player.rideZ || 0), z: 0, owner: null, type: { h: 30, name: 'hop off' } }, t);
    else if (leverNear() && started) drawPrompt(ctx, { x: L.canal.lock.lever.x, y: L.canal.lock.lever.y, z: 0, owner: null, type: { h: 20, name: L.canal.lock.target ? 'drain the lock' : 'fill the lock' } }, t);
    else if (signNear() && started && !target) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'swap the signs' } }, t);
    else if (doorNear() && started && !target && !player.held && !L.knock) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'knock (or walk in)' } }, t);
    else if (junkNear() && started && !target) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'rummage' } }, t);
    else if (rideNear() && started && !target) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: rideNear() } }, t);
    else if (pipeNear() && started && !target) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'climb the drainpipe' } }, t);
    else if (player.tree && started && (player.tree.t < 0.15 || player.tree.t > 0.85)) drawPrompt(ctx, { x: player.x, y: player.y - 52, z: 0, owner: null, type: { h: 30, name: 'climb down' } }, t);
    else if (ladderNear() && started) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'climb up' } }, t);
    else if (player.boat && started) drawPrompt(ctx, { x: player.x, y: player.y, z: 0, owner: null, type: { h: 30, name: 'get out' } }, t);
    else if (boatNear() && started && !(target && itemReach(target) < 14)) drawPrompt(ctx, { x: L.boat.x, y: L.boat.y, z: 0, owner: null, type: { h: 16, name: 'row the boat' } }, t);
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
      updateKinds(dt);
      updateSnowWorld(dt);
      updateCastleForest(dt);
      updateTricks(dt);
      updateRainy(dt);
      updateMore(dt);
      updateOutskirts(dt);
      updateRailHarbour(dt);
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
    if (VILLAGER.pest) { const net = addItem('net', VILLAGER.pest.x, VILLAGER.pest.y, { owner: 'pest' }); Object.assign(net, { held: true, heldBy: VILLAGER.pest }); VILLAGER.pest.held = net; }
    spawnDog();
    spawnCat();
    spawnHens();
    placePuddles();
    spawnCritters();
    spawnWeather();
    hideBushes = objects.filter((o) => o.kind === 'hidebush' || o.kind === 'bed' || o.kind === 'leafpile' || o.kind === 'wheat' || o.kind === 'haystack' || o.kind === 'drift' || o.kind === 'igloo' || o.kind === 'armour' || o.kind === 'hollowtree' || o.kind === 'cave' || o.kind === 'mirrortent' || o.kind === 'tent' || o.kind === 'stilthut'); // places to hide
    spawnAmbient();
    Object.assign(player, { x: HIDEOUT.x, y: HIDEOUT.y + 6, vx: 0, vy: 0, held: null, stun: 0, hop: 0, hopV: 0, bubble: null, dir: 'down', speed: 0, hidden: false, hidingIn: null, inWardrobe: null, tummy: 0, stuffed: false, sugar: 0, eating: null, mud: 0, spin: 0, boat: false, boatFrom: null, flour: 0, sled: false, tongueDone: false, tree: null, disguise: null, digging: null, roof: null, caged: 0, swim: false, ride: null, rideZ: 0, worms: 0 });
    target = null;
    cam.x = player.x; cam.y = player.y;
  }

  function boot() {
    loadSave();
    applyFur();
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
