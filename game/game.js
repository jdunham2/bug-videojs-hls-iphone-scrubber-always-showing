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
  const WALK_SPEED = 105;   // px / s
  const RUN_SPEED = 185;
  const ACCEL = 900;
  const FRICTION = 1100;

  // Tile types
  const GRASS = 0, PATH = 1, WATER = 2, SAND = 3, SOIL = 4, STONE = 5, BRIDGE = 6;

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
  const rand = mulberry32(20261114);
  const rr = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------------------
  const map = new Uint8Array(MW * MH);
  const used = new Uint8Array(MW * MH); // tiles reserved by objects / features
  const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const idx = (x, y) => y * MW + x;
  const getT = (x, y) => (inb(x, y) ? map[idx(x, y)] : WATER);
  const setT = (x, y, t) => { if (inb(x, y)) map[idx(x, y)] = t; };
  const rectT = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setT(i, j, t); };
  const reserve = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inb(i, j)) used[idx(i, j)] = 1; };
  const isUsed = (x, y) => !inb(x, y) || used[idx(x, y)] === 1;

  const objects = [];

  function buildMap() {
    // Pond
    const pond = { cx: 54, cy: 40, rx: 9, ry: 6 };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const dx = (x + 0.5 - pond.cx) / pond.rx, dy = (y + 0.5 - pond.cy) / pond.ry;
      const d = dx * dx + dy * dy + Math.sin(x * 1.7 + y * 0.9) * 0.08;
      if (d < 1) setT(x, y, WATER);
      else if (d < 1.5) setT(x, y, SAND);
    }
    // Stream flowing from the north edge into the pond
    for (let y = 0; y <= 36; y++) {
      const cx = 60 + Math.round(Math.sin(y * 0.25) * 1.5);
      for (let x = cx - 1; x <= cx + 1; x++) setT(x, y, WATER);
      for (const x of [cx - 2, cx + 2]) if (getT(x, y) === GRASS) setT(x, y, SAND);
    }
    // Main roads
    for (let x = 2; x < MW - 2; x++) for (let y = 25; y <= 26; y++) {
      setT(x, y, getT(x, y) === WATER ? BRIDGE : PATH);
    }
    for (let y = 3; y < MH - 3; y++) for (let x = 31; x <= 32; x++) setT(x, y, PATH);

    // Village plaza
    rectT(26, 20, 12, 12, STONE);

    // Garden plot with fence (fence line sits one tile outside the soil)
    rectT(9, 32, 11, 10, SOIL);
    reserve(8, 31, 13, 12);
    for (let y = 27; y <= 31; y++) setT(14, y, PATH); // gate path to road

    // Houses: [x, y, w, h, roof color]
    const houses = [
      [9, 11, 6, 4, '#b5523b'],
      [17, 10, 5, 4, '#4f6fa8'],
      [39, 11, 6, 4, '#7a4f8f'],
      [47, 12, 5, 4, '#b5523b'],
      [38, 33, 6, 4, '#3f7f6a'],
      [22, 38, 5, 4, '#c08a2e'],
    ];
    for (const [hx, hy, hw, hh, roof] of houses) {
      reserve(hx - 1, hy - 2, hw + 2, hh + 3);
      const doorX = hx + Math.floor(hw / 2);
      if (hy < 25) {
        for (let y = hy + hh; y < 25; y++) setT(doorX, y, PATH);
      } else {
        // houses south of the road connect sideways to the north–south road
        const y = hy + hh;
        setT(doorX, y, PATH);
        const dir = doorX < 31 ? 1 : -1;
        for (let x = doorX; x !== (dir > 0 ? 31 : 32); x += dir) setT(x, y, PATH);
      }
      objects.push(makeHouse(hx, hy, hw, hh, roof));
      objects.push(makeMailbox((doorX + 1.2) * TILE, (hy + hh + 0.7) * TILE));
    }

    // Reserve roads and plaza so nothing grows on them
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = getT(x, y);
      if (t !== GRASS) used[idx(x, y)] = 1;
    }

    // Plaza props
    objects.push(makeWell(32 * TILE, 24.2 * TILE));
    objects.push(makeBench(28 * TILE, 21.4 * TILE));
    objects.push(makeBench(36 * TILE, 21.4 * TILE));
    objects.push(makeBench(28 * TILE, 30.6 * TILE));
    objects.push(makeBench(36 * TILE, 30.6 * TILE));
    for (const [lx, ly] of [[26.5, 20.6], [37.5, 20.6], [26.5, 31.6], [37.5, 31.6]]) {
      objects.push(makeLamp(lx * TILE, ly * TILE));
    }
    objects.push(makeSign(34.2 * TILE, 27.4 * TILE));

    // Garden: fence + crops
    for (let x = 8; x <= 20; x++) {
      if (x !== 14) objects.push(makeFence(x, 31, 'h'));
      objects.push(makeFence(x, 42, 'h'));
    }
    for (let y = 32; y <= 41; y++) {
      objects.push(makeFence(8, y, 'v'));
      objects.push(makeFence(20, y, 'v'));
    }
    objects.push(makeScarecrow(17.5 * TILE, 36.9 * TILE));
    // (crops, crates, barrels and other loose things are pickable items: see placeItems)

    // Picnic spot by the pond
    objects.push(makePicnicTable(47 * TILE, 31 * TILE));
    reserve(45, 29, 4, 3);

    // Forest border: dense trees around the edge
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const edge = Math.min(x, y, MW - 1 - x, MH - 1 - y);
      if (edge > 2) continue;
      if (getT(x, y) !== GRASS) continue;
      if (rand() < (edge === 0 ? 0.9 : edge === 1 ? 0.7 : 0.35)) {
        objects.push(makeTree((x + rr(0.2, 0.8)) * TILE, (y + rr(0.4, 0.9)) * TILE));
        used[idx(x, y)] = 1;
      }
    }
    // Close the road ends with trees so the world edge feels solid
    for (const [x, y] of [[1, 25], [1, 26], [MW - 2, 25], [MW - 2, 26], [31, 1], [32, 1], [31, MH - 2], [32, MH - 2], [0, 25], [0, 26], [MW - 1, 25], [MW - 1, 26], [31, 0], [32, 0], [31, MH - 1], [32, MH - 1]]) {
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
    // Reeds along the pond sand
    for (let y = 0; y < MH; y++) for (let x = 40; x < MW; x++) {
      if (getT(x, y) === SAND && rand() < 0.18) objects.push(makeReeds((x + rr(0.2, 0.8)) * TILE, (y + rr(0.5, 0.9)) * TILE));
    }
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

  function makeSign(x, y) {
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
        ctx.fillText('POND', x + 13, y - 36);
        ctx.fillText('GARDEN', x - 13, y - 21);
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
  function renderGround() {
    ground = document.createElement('canvas');
    ground.width = WORLD_W; ground.height = WORLD_H;
    const g = ground.getContext('2d');
    const grng = mulberry32(99);
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
    g.fillStyle = 'rgba(30,80,130,0.35)';
    ellipse(g, 54 * TILE, 40 * TILE, 6 * TILE, 3.5 * TILE);
    // lily pads
    for (let i = 0; i < 14; i++) {
      const a = gr(0, Math.PI * 2), d = gr(0.2, 0.75);
      const lx = 54 * TILE + Math.cos(a) * 9 * TILE * d, ly = 40 * TILE + Math.sin(a) * 6 * TILE * d;
      g.fillStyle = '#4f9a3c';
      g.beginPath(); g.moveTo(lx, ly); g.arc(lx, ly, gr(6, 10), a + 0.4, a + Math.PI * 2 - 0.1); g.closePath(); g.fill();
      if (grng() < 0.35) { g.fillStyle = '#ffc6dd'; circle(g, lx + 2, ly - 2, 3); }
    }

    // Garden soil with furrows
    g.fillStyle = '#7a5434';
    g.fillRect(9 * TILE, 32 * TILE, 11 * TILE, 10 * TILE);
    g.fillStyle = '#6a462a';
    for (let y = 32 * TILE + 10; y < 42 * TILE; y += 16) g.fillRect(9 * TILE + 4, y, 11 * TILE - 8, 5);

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
    g.fillStyle = '#9b9688';
    roundRect(g, 26 * TILE - 4, 20 * TILE - 4, 12 * TILE + 8, 12 * TILE + 8, 14, true);
    g.fillStyle = '#b7b2a3';
    roundRect(g, 26 * TILE, 20 * TILE, 12 * TILE, 12 * TILE, 10, true);
    for (let y = 20 * TILE; y < 32 * TILE; y += 12) {
      const row = (y - 20 * TILE) / 12;
      for (let x = 26 * TILE + (row % 2) * 8; x < 38 * TILE - 4; x += 16) {
        g.fillStyle = grng() < 0.5 ? '#c4bfb0' : '#aaa596';
        roundRect(g, x + 1, y + 1, 14, 10, 3, true);
      }
    }
    // Plaza mosaic circle
    g.strokeStyle = '#8f8a7c'; g.lineWidth = 4;
    g.beginPath(); g.arc(32 * TILE, 26 * TILE, 3.3 * TILE, 0, Math.PI * 2); g.stroke();

    // Bridge
    forTiles(BRIDGE, (x, y) => {
      const X = x * TILE, Y = y * TILE;
      g.fillStyle = '#9c6b3e';
      g.fillRect(X - 2, Y, TILE + 4, TILE);
      g.fillStyle = '#b8834f';
      for (let px = X; px < X + TILE; px += 8) g.fillRect(px + 1, Y, 6, TILE);
    });
    // Bridge rails along the top and bottom of the crossing
    for (let x = 0; x < MW; x++) {
      if (map[idx(x, 25)] === BRIDGE) {
        g.fillStyle = '#6b4a2e';
        g.fillRect(x * TILE - 2, 25 * TILE - 3, TILE + 4, 4);
        g.fillRect(x * TILE - 2, 27 * TILE - 1, TILE + 4, 4);
        g.fillRect(x * TILE, 25 * TILE - 9, 4, 8);
        g.fillRect(x * TILE, 27 * TILE - 7, 4, 8);
      }
    }

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

    // Minimap
    mini = document.createElement('canvas');
    mini.width = MW * 3; mini.height = MH * 3;
    const m = mini.getContext('2d');
    m.imageSmoothingEnabled = true;
    m.drawImage(ground, 0, 0, mini.width, mini.height);
    for (const o of objects) {
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
    speed: 0,
  };
  const PLAYER_HB = { w: 16, h: 9 };

  function solidAt(px, py) {
    return getT(Math.floor(px / TILE), Math.floor(py / TILE)) === WATER;
  }
  function collides(x, y) {
    const l = x - PLAYER_HB.w / 2, r = x + PLAYER_HB.w / 2, t = y - PLAYER_HB.h, b = y;
    if (l < 0 || t < 0 || r > WORLD_W || b > WORLD_H) return true;
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
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const heavy = player.held && player.held.type.heavy;
    const running = input.run && !heavy;
    const maxSpd = heavy ? WALK_SPEED * 0.62 : running ? RUN_SPEED : WALK_SPEED;
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
    if (!p.bubble) return;
    const a = Math.min(1, p.bubble.t / 0.25);
    const x = p.x, y = p.y - p.hop - 42;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '700 10px Nunito, sans-serif';
    const w = Math.max(22, ctx.measureText(p.bubble.text).width + 12);
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, x - w / 2, y - 9, w, 18, 8, true);
    ctx.beginPath(); ctx.moveTo(x - 4, y + 8); ctx.lineTo(x + 4, y + 8); ctx.lineTo(x, y + 14); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.bubble.text, x, y + 0.5);
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
      else if (q.kind === 'drop' || q.kind === 'spark') {
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
  };

  const items = [];
  let target = null; // item the raccoon would grab right now
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const LOW_KINDS = new Set(['fence', 'bench', 'rock', 'bush', 'mailbox', 'picnic', 'reeds']);
  const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const tileAt = (x, y) => getT(Math.floor(x / TILE), Math.floor(y / TILE));

  function addItem(kind, x, y, opts = {}) {
    const it = {
      isItem: true, kind, type: ITEM[kind], x, y, z: opts.z || 0,
      vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, roll: 0, ph0: rand() * 6,
      air: false, held: false, ghost: false, floating: false, planted: !!opts.planted,
    };
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
    if (x - r < 0 || y - 5 < 0 || x + r > WORLD_W || y > WORLD_H) return true;
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
    if (tileAt(x, y) === WATER) return false;
    const b = box(x - r, y - 7, r * 2, 8);
    for (const o of solidObjects) if (boxesOverlap(b, o.hitbox)) return false;
    for (const it of items) if (it.type.heavy && boxesOverlap(b, itemBox(it))) return false;
    return true;
  }
  function placeFree(kind, x, y, opts) {
    const r = ITEM[kind].r;
    for (let ring = 0; ring < 8; ring++) {
      for (let k = 0; k < Math.max(1, ring * 6); k++) {
        const a = (k / Math.max(1, ring * 6)) * Math.PI * 2;
        const px = x + Math.cos(a) * ring * 8, py = y + Math.sin(a) * ring * 8;
        if (spotFree(px, py, r)) return addItem(kind, px, py, opts);
      }
    }
    return null;
  }

  function placeItems() {
    const T = TILE;
    // Garden crops (planted until pulled)
    for (let y = 33; y <= 40; y += 2) for (let x = 10; x <= 18; x += 1.5) {
      addItem(y % 4 === 1 ? 'cabbage' : 'carrot', (x + 0.5) * T, (y + 0.6) * T, { planted: true });
    }
    // Heavy things
    placeFree('crate', 15.6 * T, 14.6 * T);
    placeFree('crate', 16.4 * T, 15.3 * T);
    placeFree('crate', 37.2 * T, 37.4 * T);
    placeFree('barrel', 45.7 * T, 14.4 * T);
    placeFree('barrel', 44.6 * T, 37.6 * T);
    // Things resting on furniture
    addItem('pie', 47 * T + 16, 31 * T + 1, { z: 19 });
    addItem('hat', 36 * T - 6, 30.6 * T + 1, { z: 12 });
    addItem('sandwich', 28 * T + 8, 21.4 * T + 1, { z: 12 });
    // Loose stuff around the village
    placeFree('bucket', 32 * T + 30, 24.2 * T + 4);
    placeFree('ball', 30 * T, 28.5 * T);
    placeFree('newspaper', 12.5 * T - 18, 15.5 * T);
    placeFree('newspaper', 42.5 * T - 18, 15.5 * T);
    placeFree('newspaper', 49.5 * T - 18, 16.5 * T);
    placeFree('gnome', 22.6 * T, 13.8 * T);
    placeFree('gnome', 21 * T, 33 * T);
    placeFree('duck', 44.4 * T, 40.5 * T);
    placeFree('can', 9.8 * T, 32.8 * T);
    placeFree('boot', 36.4 * T, 36.4 * T);
    placeFree('pot', 8.3 * T, 15.6 * T);
    placeFree('pot', 21.8 * T, 14.6 * T);
    placeFree('pot', 44.2 * T, 15.8 * T);
    // Apples fallen under some trees
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
    if (target) pickUp(target);
  }

  function pickUp(it) {
    if (it.planted) { puff(it.x, it.y, 5, 'soil'); sfx('pop'); } else sfx(it.type.heavy ? 'heave' : 'pick');
    Object.assign(it, { held: true, air: false, floating: false, planted: false, ghost: false, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0 });
    player.held = it;
    sparkle(it.x, it.y, it.z + it.type.h * 0.5);
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
    Object.assign(it, { x, y, z: it.type.heavy ? 10 : 8, air: true, ghost: true, vz: pop ? 110 : 0, vx: player.vx * 0.3, vy: player.vy * 0.3, spin: pop ? (Math.random() - 0.5) * 10 : 0 });
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
      air: true, ghost: true,
      spin: heavy ? (d[0] || 1) * 4 : (Math.random() - 0.5) * 18 + d[0] * 8,
    });
    sfx('throw');
  }

  function updateItems(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.held) { const hp = heldPos(time); it.x = hp.x; it.y = hp.y; it.z = hp.z; continue; }
      if (it.ghost && !overlapsPlayer(it)) it.ghost = false;

      // Beach balls get kicked when you run into them
      if (it.kind === 'ball' && !it.floating && it.z < 6 && player.speed > 20 && Math.hypot(it.x - player.x, it.y - player.y) < 13) {
        const a = Math.atan2(it.y - player.y, it.x - player.x);
        const k = 60 + player.speed * 1.2;
        it.vx = Math.cos(a) * k; it.vy = Math.sin(a) * k; it.vz = 70 + player.speed * 0.3; it.air = true;
        sfx('bounce');
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

      if (it.z <= 0) {
        it.z = 0;
        if (tileAt(it.x, it.y) === WATER) {
          splash(it.x, it.y, it.type.heavy);
          if (it.type.floats) Object.assign(it, { floating: true, air: false, vz: 0, rot: 0, spin: 0, vx: it.vx * 0.3, vy: it.vy * 0.3 });
          else items.splice(i, 1); // glub glub
          continue;
        }
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
    const w = ctx.measureText(it.type.name).width + 8 + keyW;
    const lx = x - w / 2, ly = y0 - 17;
    ctx.fillStyle = 'rgba(28,36,24,0.85)'; roundRect(ctx, lx, ly, w, 11, 4, true);
    if (!isTouch) {
      ctx.fillStyle = '#ffb547'; roundRect(ctx, lx + 2, ly + 1.5, 8, 8, 2, true);
      ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center'; ctx.fillText('E', lx + 6, ly + 5.8);
    }
    ctx.fillStyle = '#fff4d6'; ctx.textAlign = 'left';
    ctx.fillText(it.type.name, lx + 4 + keyW, ly + 5.8);
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
    if (!started) return { x: 0, y: 0, run: false };
    return { x, y, run };
  }

  function start() {
    audioInit();
    if (started) return;
    started = true;
    document.getElementById('start').hidden = true;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!started) { start(); return; }
    keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) chitter();
    if (e.code === 'KeyM' && !e.repeat) showMap = !showMap;
    if (e.code === 'KeyE' && !e.repeat) grabOrDrop();
    if (e.code === 'KeyF' && !e.repeat) throwHeld();
    if (e.code === 'KeyN' && !e.repeat) muted = !muted;
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
  document.getElementById('chitter').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); start(); chitter(); });
  const grabBtn = document.getElementById('grab');
  const throwBtn = document.getElementById('throw');
  grabBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); start(); grabOrDrop(); });
  throwBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); start(); throwHeld(); });
  function syncTouchButtons() {
    const label = player.held ? 'drop' : 'grab';
    if (grabBtn.textContent !== label) grabBtn.textContent = label;
    grabBtn.classList.toggle('ready', !!(player.held || target));
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
    cam.x = clamp(cam.x, viewW / 2, WORLD_W - viewW / 2);
    cam.y = clamp(cam.y, viewH / 2, WORLD_H - viewH / 2);
    if (viewW >= WORLD_W) cam.x = WORLD_W / 2;
    if (viewH >= WORLD_H) cam.y = WORLD_H / 2;
    const left = cam.x - viewW / 2, top = cam.y - viewH / 2;
    const s = dpr * zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2f5a28';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, -Math.round(left * s), -Math.round(top * s));
    ctx.imageSmoothingEnabled = true;

    // Ground (only the visible slice)
    const sx = Math.max(0, Math.floor(left)), sy = Math.max(0, Math.floor(top));
    const sw = Math.min(WORLD_W - sx, Math.ceil(viewW) + 2), sh = Math.min(WORLD_H - sy, Math.ceil(viewH) + 2);
    ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);

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

    // Y-sorted draw: objects + items + player
    const playerEntry = { y: player.y, isPlayer: true };
    vis.push(playerEntry);
    vis.sort((a, b) => a.y - b.y);
    for (const o of vis) {
      if (o.isPlayer) { drawPlayerWithHeld(ctx, t); continue; }
      if (o.isItem) { drawItem(ctx, o, t); continue; }
      let fade = false;
      if (o.canopy && player.y < o.y && player.y > o.canopy.cy - o.canopy.r && Math.abs(player.x - o.x) < o.canopy.r + 6) fade = true;
      o.draw(ctx, t, fade);
    }

    for (const b of butterflies) {
      if (b.x > left - 20 && b.x < left + viewW + 20 && b.y > top - 20 && b.y < top + viewH + 80) drawButterfly(ctx, b);
    }
    // Airborne effects: splashes and sparkles
    for (const q of particles) {
      if (q.kind !== 'drop' && q.kind !== 'spark') continue;
      ctx.fillStyle = q.kind === 'drop' ? `rgba(200,230,255,${q.life / q.max})` : `rgba(255,236,160,${q.life / q.max})`;
      circle(ctx, q.x, q.y - q.z, q.kind === 'drop' ? 1.8 : 1.4);
    }
    if (target && started) drawPrompt(ctx, target, t);
    drawBubble(ctx, player);

    // Drifting cloud shadows
    ctx.fillStyle = 'rgba(20,35,60,0.07)';
    for (const c of clouds) {
      ellipse(ctx, c.x, c.y, c.rx, c.ry);
      ellipse(ctx, c.x + c.rx * 0.5, c.y - c.ry * 0.3, c.rx * 0.6, c.ry * 0.7);
    }

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
      ctx.strokeRect(mx + left / WORLD_W * mw, my + top / WORLD_H * mh, viewW / WORLD_W * mw, viewH / WORLD_H * mh);
      ctx.restore();
      ctx.fillStyle = '#ffb547';
      circle(ctx, mx + player.x / WORLD_W * mw, my + player.y / WORLD_H * mh, 3);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx + player.x / WORLD_W * mw, my + player.y / WORLD_H * mh, 3, 0, Math.PI * 2); ctx.stroke();
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
    updatePlayer(dt, readInput());
    updateItems(dt);
    updateAmbient(dt);
    target = findTarget();
    syncTouchButtons();
    // camera eases toward the player, with a little look-ahead
    const lx = player.x + player.vx * 0.25, ly = player.y - 10 + player.vy * 0.25;
    cam.x = lerp(cam.x, lx, 1 - Math.pow(0.002, dt));
    cam.y = lerp(cam.y, ly, 1 - Math.pow(0.002, dt));
    render(time);
    requestAnimationFrame(frame);
  }

  function boot(data) {
    buildMap();
    solidObjects = objects.filter((o) => o.hitbox);
    renderGround();
    placeItems();
    spawnAmbient();
    if (data && data.player && !collides(data.player.x, data.player.y)) {
      player.x = data.player.x; player.y = data.player.y; player.dir = data.player.dir || 'down';
      if (data.started) start();
    }
    cam.x = player.x; cam.y = player.y;
    resize();
    requestAnimationFrame((n) => { last = n; frame(n); });
  }

  // Handy for poking at the game from the browser console
  window.mischief = { player, items, objects };

  // Keep the raccoon where it was when the page hot-reloads in the viewer
  try { window.claude?.hot?.snapshot?.(() => ({ player: { x: player.x, y: player.y, dir: player.dir }, started })); } catch (_) { /* optional */ }
  const hot = window.claude?.hot;
  if (hot?.ready) hot.ready(boot); else boot(hot?.data ?? {});
})();
