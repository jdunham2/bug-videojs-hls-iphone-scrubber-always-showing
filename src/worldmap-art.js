// The painted world map behind the mission nodes: parchment, a coast with the
// Grey Sea, the Frostpeaks around the keep, the Ashlands and their smoking
// mountain by the forge, forests, a river, the siege wall in the south, a
// compass rose and region names. Drawn once (seeded, so nothing jumps between
// redraws) in a 500x300 box that matches the map's 5:3 frame.

const cached = {}; // per region: the map's HTML
const bitmap = {}; // per region: the baked JPEG

/**
 * Turn the painted SVG into a JPEG once. An SVG <img> is vector: the browser
 * re-rasterises it (paper-grain filters and all) whenever anything near it
 * animates, which made the map screen crawl. A bitmap never does.
 */
function bakeBitmap(url, region) {
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = 1500;
      c.height = 900;
      const g = c.getContext('2d');
      // JPEG has no transparency: lay the parchment down first (as the map's CSS does).
      const grad = g.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, '#ead8a8');
      grad.addColorStop(0.55, '#d8bf86');
      grad.addColorStop(1, '#c4a468');
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      const hl = g.createRadialGradient(c.width * 0.3, c.height * 0.3, 0, c.width * 0.3, c.height * 0.3, c.width * 0.6);
      hl.addColorStop(0, 'rgba(255,245,210,0.35)');
      hl.addColorStop(1, 'rgba(255,245,210,0)');
      g.fillStyle = hl;
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      bitmap[region] = c.toDataURL('image/jpeg', 0.88);
      const el = document.querySelector(`.wmap[data-region="${region}"] img.wart`);
      if (el) el.src = bitmap[region];
    } catch {
      // Keep the SVG if the canvas can't be read back.
    }
  };
  img.src = url;
}

/** Start baking early (camp build) so the map is ready the first time it opens. */
export function prepareMapArt() {
  mapArt(1);
  setTimeout(() => mapArt(2), 600);
  setTimeout(() => mapArt(3), 1200);
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Map art for a region as an HTML string; once baked, the painted layer is a plain bitmap. */
export function mapArt(region = 1) {
  if (cached[region] && bitmap[region]) return cached[region].replace(/<img class="wart" alt="" src="[^"]*">/, `<img class="wart" alt="" src="${bitmap[region]}">`);
  if (cached[region]) return cached[region];
  const { s, anim } = region === 3 ? northernWilds() : region === 2 ? farReaches() : borderlands();
  // The painted layers go into an <img>: the browser rasterises it once, so its
  // paper-grain filters never re-run. Only the light animated bits stay live SVG.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.replace('<svg class="wart"', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
  bakeBitmap(url, region);
  cached[region] = `<img class="wart" alt="" src="${url}"><svg class="wart wanim" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="wm-lava" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb04a" stop-opacity=".9"/><stop offset=".5" stop-color="#e0501a" stop-opacity=".35"/><stop offset="1" stop-color="#e0501a" stop-opacity="0"/></radialGradient></defs>${anim}</svg>`;
  return cached[region];
}

function borderlands() {
  const r = seeded(7);
  const R = (a, b) => a + r() * (b - a);

  // A clump of trees: little round crowns with trunks and a shadow side.
  const forest = (cx, cy, n, spread) => {
    let g = '';
    const pts = Array.from({ length: n }, () => [cx + R(-spread, spread), cy + R(-spread * 0.55, spread * 0.55)]).sort((a, b) => a[1] - b[1]);
    for (const [x, y] of pts) {
      const s = R(3.2, 4.6);
      g += `<rect x="${x - 0.5}" y="${y}" width="1" height="${s * 0.7}" fill="#4a3a22"/><circle cx="${x}" cy="${y}" r="${s}" fill="#5f7a3e"/><path d="M${x} ${y - s} A ${s} ${s} 0 0 1 ${x} ${y + s} Z" fill="#46602c"/><circle cx="${x - s * 0.35}" cy="${y - s * 0.35}" r="${s * 0.35}" fill="#7f9a52" opacity=".8"/>`;
    }
    return g;
  };
  // A mountain with a lit and a shaded face, optional snow cap and hatching.
  const peak = (x, base, w, h, snow, tint = '#9a8a6a', shade = '#6e6048') => {
    const tx = x + R(-w * 0.08, w * 0.08);
    let g = `<path d="M${x - w / 2} ${base} L ${tx} ${base - h} L ${x + w / 2} ${base} Z" fill="${tint}"/>`;
    g += `<path d="M${tx} ${base - h} L ${x + w / 2} ${base} L ${tx + w * 0.05} ${base} Z" fill="${shade}"/>`;
    for (let i = 1; i < 4; i++) g += `<line x1="${tx + (w / 2) * (i / 4)}" y1="${base - h + h * (i / 4)}" x2="${tx + w * 0.05 + (w / 2 - w * 0.05) * (i / 4) - 2}" y2="${base}" stroke="#4a3e2c" stroke-width=".5" opacity=".5"/>`;
    if (snow) g += `<path d="M${tx} ${base - h} L ${tx - w * 0.17} ${base - h * 0.66} L ${tx - w * 0.06} ${base - h * 0.72} L ${tx + w * 0.02} ${base - h * 0.62} L ${tx + w * 0.17} ${base - h * 0.66} Z" fill="#f4f1e8"/>`;
    return g + `<path d="M${x - w / 2} ${base} L ${tx} ${base - h} L ${x + w / 2} ${base}" fill="none" stroke="#3a2e1e" stroke-width=".8" stroke-linejoin="round"/>`;
  };
  const hills = (x, y, n) => {
    let g = '';
    for (let i = 0; i < n; i++) g += `<path d="M${x + i * 9 - 6} ${y + (i % 2) * 3} q 6 -7 12 0" fill="#b49a62" stroke="#6b5434" stroke-width=".7"/>`;
    return g;
  };

  // Coast of the Grey Sea (bottom-left), with ripple lines following the shore.
  const coast = 'M0 128 C 22 132, 40 150, 52 168 S 80 196, 92 214 S 126 244, 150 262 S 182 288, 196 300 L 0 300 Z';
  let s = `<svg class="wart" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <filter id="wm-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .24  0 0 0 0 .12  0 0 0 .22 0"/></filter>
    <filter id="wm-stain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .28  0 0 0 0 .1  0 0 0 -1.6 .9"/></filter>
    <filter id="wm-soft"><feGaussianBlur stdDeviation="6"/></filter>
    <radialGradient id="wm-edge" cx="50%" cy="50%" r="65%"><stop offset=".62" stop-color="#2a1606" stop-opacity="0"/><stop offset=".9" stop-color="#3a2008" stop-opacity=".45"/><stop offset="1" stop-color="#1a0c02" stop-opacity=".85"/></radialGradient>
    <linearGradient id="wm-sea" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#8fb0a8"/><stop offset="1" stop-color="#5e8a8c"/></linearGradient>
    <radialGradient id="wm-lava" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb04a" stop-opacity=".9"/><stop offset=".5" stop-color="#e0501a" stop-opacity=".35"/><stop offset="1" stop-color="#e0501a" stop-opacity="0"/></radialGradient>
    <radialGradient id="wm-snow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f4f6fa" stop-opacity=".75"/><stop offset="1" stop-color="#f4f6fa" stop-opacity="0"/></radialGradient>
    <radialGradient id="wm-green" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8aa45a" stop-opacity=".55"/><stop offset="1" stop-color="#8aa45a" stop-opacity="0"/></radialGradient>
    <radialGradient id="wm-ash" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#5a2e1e" stop-opacity=".55"/><stop offset="1" stop-color="#5a2e1e" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="500" height="300" filter="url(#wm-stain)"/>
  <ellipse cx="110" cy="120" rx="130" ry="90" fill="url(#wm-green)"/>
  <ellipse cx="330" cy="250" rx="110" ry="50" fill="url(#wm-green)"/>
  <ellipse cx="250" cy="80" rx="120" ry="70" fill="url(#wm-snow)"/>
  <ellipse cx="420" cy="150" rx="110" ry="95" fill="url(#wm-ash)"/>
  <g fill="none" stroke="#5e8a8c">
    <path d="${coast.replace(' L 0 300 Z', '')}" transform="translate(6 -6)" stroke-width="1" opacity=".55"/>
    <path d="${coast.replace(' L 0 300 Z', '')}" transform="translate(12 -12)" stroke-width=".8" opacity=".3"/>
    <path d="${coast.replace(' L 0 300 Z', '')}" transform="translate(18 -18)" stroke-width=".6" opacity=".16"/>
  </g>
  <path d="${coast}" fill="url(#wm-sea)" stroke="#3e5e5c" stroke-width="1.4"/>
`;
  let anim = `<g class="wm-waves" fill="none" stroke="#e8f0e8" stroke-width=".9" stroke-linecap="round" opacity=".7">`;
  for (let i = 0; i < 14; i++) {
    const x = R(6, 120);
    const y = R(Math.max(170, 175 + x * 0.6), 292);
    anim += `<path d="M${x} ${y} q 3 -3 6 0 q 3 -3 6 0" style="animation-delay:-${R(0, 4).toFixed(1)}s"/>`;
  }
  anim += `</g>`;
  s += `<g fill="#3e5e5c" opacity=".5"><path d="M40 250 q 6 -10 12 0 q -6 -3 -12 0 Z" /><path d="M30 268 l 10 -4 l -2 8 Z"/></g>
  <path class="wm-river" d="M232 104 C 222 124, 236 136, 214 150 S 188 160, 178 178 S 150 196, 138 222" fill="none" stroke="#6f97a0" stroke-width="2.6" stroke-linecap="round"/>
  <g>`;
  // The Frostpeaks: a ridge of snowy mountains around the keep (keep sits at 250,90).
  const ridge = [
    [178, 104, 34, 38],
    [204, 92, 40, 50],
    [292, 92, 42, 52],
    [318, 104, 34, 40],
    [226, 74, 30, 34],
    [276, 72, 30, 36],
    [196, 116, 26, 24],
    [306, 118, 26, 24],
    [340, 96, 22, 22],
    [160, 96, 22, 20],
  ].sort((a, b) => a[1] - b[1]);
  for (const [x, y, w, h] of ridge) s += peak(x, y, w, h, h > 30);
  s += `</g>`;
  // The Ashlands: the smoking mountain north-east of the forge (forge sits at 390,174).
  anim += `<path class="wm-river flow" d="M232 104 C 222 124, 236 136, 214 150 S 188 160, 178 178 S 150 196, 138 222" fill="none" stroke="#d8ecef" stroke-width="1" stroke-dasharray="3 9" stroke-linecap="round"/>`;
  anim += `<circle cx="438" cy="104" r="40" fill="url(#wm-lava)" class="wm-lavaglow"/>`;
  s += peak(412, 128, 30, 26, false, '#6e4a38', '#4a2e22') + peak(470, 132, 28, 24, false, '#6e4a38', '#4a2e22');
  s += `<path d="M406 132 L 432 92 L 444 92 L 470 132 Z" fill="#5a3a2c" stroke="#2a160e" stroke-width=".9"/><path d="M438 92 L 444 92 L 470 132 L 446 132 Z" fill="#3e2418"/>`;
  s += `<path d="M432 92 L 444 92 L 441 96 L 435 96 Z" fill="#ffb04a"/><path d="M437 96 C 434 108, 440 116, 432 126" stroke="#ff8a2a" stroke-width="1.6" fill="none" class="wm-lavaflow"/>`;
  anim += `<g class="wm-smoke" fill="#4a3a32">`;
  for (let i = 0; i < 5; i++) anim += `<circle cx="438" cy="86" r="${4 + i}" style="animation-delay:-${(i * 1.2).toFixed(1)}s"/>`;
  anim += `</g>`;
  s += `<g stroke="#e0602a" stroke-width="1.1" fill="none" opacity=".65"><path d="M396 196 l 8 6 l 12 -2"/><path d="M360 186 l 6 4"/><path d="M420 200 l 6 -6 l 8 2"/></g>`;
  // Hills and forests.
  s += hills(40, 210, 3) + hills(200, 200, 3) + hills(320, 150, 4) + hills(150, 140, 2) + hills(455, 205, 3);
  s += forest(70, 120, 16, 22) + forest(150, 112, 9, 14) + forest(40, 80, 8, 12) + forest(312, 232, 12, 18) + forest(200, 236, 8, 12) + forest(360, 270, 7, 11) + forest(180, 160, 6, 9);
  // The newer dungeons' lands.
  // Whispering Marsh (60,132): still pools and reeds.
  for (const [x, y, rx] of [[52, 128, 14], [72, 140, 10], [44, 146, 8], [80, 124, 7]]) {
    s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.45}" fill="#6f8f80" opacity=".75" stroke="#3e5e50" stroke-width=".6"/>`;
    for (let k = 0; k < 4; k++) s += `<path d="M${x - rx + R(0, rx * 2)} ${y - rx * 0.2} l ${R(-1, 1)} -5" stroke="#4a5a2a" stroke-width=".7"/>`;
  }
  // Autumn Hollow (180,141): woods in red and gold.
  const autumn = (cx, cy, n, spread) => {
    let g = '';
    const pts = Array.from({ length: n }, () => [cx + R(-spread, spread), cy + R(-spread * 0.55, spread * 0.55)]).sort((a, b) => a[1] - b[1]);
    for (const [x, y] of pts) {
      const sz = R(3, 4.4);
      const col = ['#c8602a', '#d8902a', '#a8401e', '#e0a83a'][Math.floor(R(0, 4))];
      g += `<rect x="${x - 0.5}" y="${y}" width="1" height="${sz * 0.7}" fill="#4a3a22"/><circle cx="${x}" cy="${y}" r="${sz}" fill="${col}"/><path d="M${x} ${y - sz} A ${sz} ${sz} 0 0 1 ${x} ${y + sz} Z" fill="#000" opacity=".15"/>`;
    }
    return g;
  };
  s += autumn(170, 128, 12, 16) + autumn(204, 150, 7, 10);
  // Deepdelve Mines (330,39): a timbered entrance in the mountainside, with cart rails.
  s += peak(338, 50, 34, 26, true) + peak(318, 52, 26, 18, false);
  s += `<path d="M323 52 L 323 44 Q 330 37 337 44 L 337 52 Z" fill="#1a120a"/><path d="M322 52 L 322 43 L 338 43 L 338 52" fill="none" stroke="#6a4a24" stroke-width="1.6"/>`;
  s += `<path d="M330 52 L 326 66 M 334 52 L 338 66" stroke="#5a4a3a" stroke-width=".7"/><g stroke="#5a4a3a" stroke-width=".5">${[55, 58, 61, 64].map((y) => `<line x1="${327 - (y - 52) * 0.1}" y1="${y}" x2="${337 + (y - 52) * 0.1}" y2="${y}"/>`).join('')}</g>`;
  // Stormwatch Harbor (145,264): piers into the bay and a couple of longships.
  s += `<g stroke="#5a3a1e" stroke-width="2.2" stroke-linecap="square"><line x1="140" y1="258" x2="124" y2="272"/><line x1="152" y1="266" x2="138" y2="282"/></g>`;
  s += `<g fill="#6a4a2a" stroke="#2e2010" stroke-width=".5"><path d="M110 280 q 8 5 16 0 l -2 3 q -6 3 -12 0 Z"/><path d="M122 290 q 8 5 16 0 l -2 3 q -6 3 -12 0 Z"/></g><g fill="#efe2c4"><path d="M118 279 l 0 -9 l 5 6 Z"/><path d="M130 289 l 0 -9 l 5 6 Z"/></g>`;
  // Sunscorch Canyon (365,258): flat-topped mesas in red rock.
  for (const [x, y, w, h] of [[352, 266, 22, 12], [378, 262, 16, 15], [396, 272, 18, 9], [336, 276, 14, 8]]) {
    s += `<path d="M${x - w / 2} ${y} L ${x - w / 2 + 3} ${y - h} L ${x + w / 2 - 3} ${y - h} L ${x + w / 2} ${y} Z" fill="#c8703a" stroke="#6a3014" stroke-width=".7"/><path d="M${x + w / 2 - 3} ${y - h} L ${x + w / 2} ${y} L ${x + 1} ${y} Z" fill="#8a4422"/><line x1="${x - w / 2 + 2}" y1="${y - h * 0.5}" x2="${x + w / 2 - 2}" y2="${y - h * 0.5}" stroke="#6a3014" stroke-width=".4" opacity=".6"/>`;
  }

  // The siege wall across the southern plain (Endless Siege at 250,246).
  s += `<path d="M196 262 L 304 262" stroke="#6b5434" stroke-width="3"/>`;
  for (const x of [196, 222, 278, 304]) s += `<rect x="${x - 3.5}" y="255" width="7" height="11" fill="#8a7454" stroke="#4a3a22" stroke-width=".7"/><path d="M${x - 4.5} 255 h 9 v -2 h -2 v 1 h -2 v -1 h -1 v 1 h -2 v -1 h -2 Z" fill="#8a7454"/>`;
  // Compass rose (bottom-right).
  s += `<g transform="translate(462 252)" class="wm-compass">
    <circle r="24" fill="none" stroke="#5a3a18" stroke-width=".8" opacity=".7"/><circle r="19" fill="none" stroke="#5a3a18" stroke-width=".5" opacity=".6"/>
    <g fill="#5a3a18" opacity=".55"><path d="M0 -15 L 3 0 L 0 15 L -3 0 Z" transform="rotate(45)"/><path d="M-15 0 L 0 3 L 15 0 L 0 -3 Z" transform="rotate(45)"/></g>
    <path d="M0 -26 L 5 0 L 0 26 L -5 0 Z" fill="#7a1e1a"/><path d="M0 -26 L 5 0 L -5 0 Z" fill="#b8342a"/><path d="M-26 0 L 0 5 L 26 0 L 0 -5 Z" fill="#3a2410"/>
    <circle r="2.4" fill="#d8a23a"/><text y="-30" text-anchor="middle" font-size="9" fill="#5a3a18" font-family="Cinzel, serif" font-weight="800">N</text></g>`;
  // Region names in an old hand.
  const label = (x, y, t, size = 9, rot = 0, extra = '') => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" font-size="${size}" ${extra}>${t}</text>`;
  s += `<g class="wm-labels" fill="#4a2e14" font-family="'IM Fell English', Georgia, serif" font-style="italic" opacity=".78">
    ${label(52, 248, 'The Grey Sea', 11, -28, 'fill="#2e4a4a" letter-spacing="1.5"')}
    ${label(196, 52, 'The Frostpeaks', 9, -8, 'letter-spacing="2"')}
    ${label(456, 226, 'The Ashlands', 10, 0, 'letter-spacing="1.5"')}
    ${label(132, 118, 'Greenwood', 9, -8)}
    ${label(40, 108, 'The Marshes', 8, -6, 'fill="#3a4a2a"')}
    ${label(392, 286, 'Sunscorch', 8, 0, 'fill="#7a3a14"')}
    ${label(330, 214, 'Low Meadows', 8, 6)}
    ${label(172, 196, 'River Wend', 7, -38, 'fill="#3e5e64"')}
  </g>`;
  // Sea serpent doodle and a little ship: old-map charm.
  anim += `<g transform="translate(70 276)"><g fill="none" stroke="#2e4a4a" stroke-width="1" opacity=".55" class="wm-ship"><path d="M-10 0 L 10 0 L 7 5 L -7 5 Z" fill="#6a4a2a"/><path d="M0 0 L 0 -14 M 0 -13 L 8 -4 L 0 -4" /><path d="M0 -13 L 8 -4 L 0 -4 Z" fill="#efe2c4"/></g></g>`;
  s += `<rect width="500" height="300" filter="url(#wm-paper)"/>
  <rect width="500" height="300" fill="url(#wm-edge)"/>
  <rect x="4" y="4" width="492" height="292" fill="none" stroke="#5a3a18" stroke-width="1.2" opacity=".6"/><rect x="7" y="7" width="486" height="286" fill="none" stroke="#5a3a18" stroke-width=".5" opacity=".5"/>
</svg>`;
  return { s, anim };
}

/**
 * The Far Reaches, over the mountains: the Emerald Jungle and its temple in
 * the north-west, a mushroom wood in the west, desert dunes and an oasis in
 * the south, a smoking foundry in the middle, misty peaks in the north-east
 * and the Shimmering Sea along the east coast with a wreck on the beach.
 */
function farReaches() {
  const r = seeded(31);
  const R = (a, b) => a + r() * (b - a);
  const tree = (x, y, sz, col, shade) =>
    `<rect x="${x - 0.5}" y="${y}" width="1" height="${sz * 0.7}" fill="#4a3a22"/><circle cx="${x}" cy="${y}" r="${sz}" fill="${col}"/><path d="M${x} ${y - sz} A ${sz} ${sz} 0 0 1 ${x} ${y + sz} Z" fill="${shade}"/>`;
  const wood = (cx, cy, n, spread, cols) => {
    let g = '';
    const pts = Array.from({ length: n }, () => [cx + R(-spread, spread), cy + R(-spread * 0.55, spread * 0.55)]).sort((a, b) => a[1] - b[1]);
    for (const [x, y] of pts) g += tree(x, y, R(3, 4.6), cols[Math.floor(R(0, cols.length))], 'rgba(0,0,0,.18)');
    return g;
  };
  const peak = (x, base, w, h, snow) => {
    const tx = x + R(-w * 0.08, w * 0.08);
    let g = `<path d="M${x - w / 2} ${base} L ${tx} ${base - h} L ${x + w / 2} ${base} Z" fill="#8a8a7a"/><path d="M${tx} ${base - h} L ${x + w / 2} ${base} L ${tx + w * 0.05} ${base} Z" fill="#62625a"/>`;
    if (snow) g += `<path d="M${tx} ${base - h} L ${tx - w * 0.17} ${base - h * 0.66} L ${tx + w * 0.02} ${base - h * 0.62} L ${tx + w * 0.17} ${base - h * 0.66} Z" fill="#f4f1e8"/>`;
    return g + `<path d="M${x - w / 2} ${base} L ${tx} ${base - h} L ${x + w / 2} ${base}" fill="none" stroke="#3a3a2e" stroke-width=".8" stroke-linejoin="round"/>`;
  };
  const label = (x, y, t, size = 9, rot = 0, extra = '') => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" font-size="${size}" ${extra}>${t}</text>`;
  // The Shimmering Sea along the east and south-east.
  const coast = 'M500 120 C 470 130, 452 150, 446 172 S 420 206, 404 214 S 372 246, 352 262 S 328 286, 322 300 L 500 300 Z';
  let s = `<svg class="wart" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <filter id="fr-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .24  0 0 0 0 .12  0 0 0 .22 0"/></filter>
    <filter id="fr-stain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="17"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .28  0 0 0 0 .1  0 0 0 -1.6 .9"/></filter>
    <radialGradient id="fr-edge" cx="50%" cy="50%" r="65%"><stop offset=".62" stop-color="#2a1606" stop-opacity="0"/><stop offset=".9" stop-color="#3a2008" stop-opacity=".45"/><stop offset="1" stop-color="#1a0c02" stop-opacity=".85"/></radialGradient>
    <linearGradient id="fr-sea" x1="1" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#8fbcc0"/><stop offset="1" stop-color="#5a90a0"/></linearGradient>
    <radialGradient id="fr-jungle" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3f7a3a" stop-opacity=".6"/><stop offset="1" stop-color="#3f7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="fr-sand" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e8c070" stop-opacity=".75"/><stop offset="1" stop-color="#e8c070" stop-opacity="0"/></radialGradient>
    <radialGradient id="fr-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#5a6aa8" stop-opacity=".5"/><stop offset="1" stop-color="#5a6aa8" stop-opacity="0"/></radialGradient>
    <radialGradient id="fr-mist" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f4f6fa" stop-opacity=".7"/><stop offset="1" stop-color="#f4f6fa" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="500" height="300" filter="url(#fr-stain)"/>
  <ellipse cx="120" cy="80" rx="140" ry="85" fill="url(#fr-jungle)"/>
  <ellipse cx="230" cy="240" rx="150" ry="70" fill="url(#fr-sand)"/>
  <ellipse cx="70" cy="190" rx="80" ry="60" fill="url(#fr-glow)"/>
  <ellipse cx="380" cy="60" rx="120" ry="60" fill="url(#fr-mist)"/>
  <g fill="none" stroke="#5a90a0">
    <path d="${coast.replace(' L 500 300 Z', '')}" transform="translate(-6 -6)" stroke-width="1" opacity=".55"/>
    <path d="${coast.replace(' L 500 300 Z', '')}" transform="translate(-12 -12)" stroke-width=".8" opacity=".3"/>
  </g>
  <path d="${coast}" fill="url(#fr-sea)" stroke="#3e6470" stroke-width="1.4"/>`;
  let anim = `<g class="wm-waves" fill="none" stroke="#eef6f6" stroke-width=".9" stroke-linecap="round" opacity=".7">`;
  for (let i = 0; i < 14; i++) {
    const x = R(380, 492);
    const y = R(Math.max(150, 330 - (x - 330) * 0.9), 292);
    if (y < 140 + (500 - x) * 0.3) continue;
    anim += `<path d="M${x} ${y} q 3 -3 6 0 q 3 -3 6 0" style="animation-delay:-${R(0, 4).toFixed(1)}s"/>`;
  }
  anim += `</g>`;
  // A river from the highlands down through the foundry to the sea.
  s += `<path d="M352 78 C 330 100, 300 110, 280 132 S 300 180, 340 196 S 380 214, 404 214" fill="none" stroke="#6f97a0" stroke-width="2.4" stroke-linecap="round"/>`;
  anim += `<path class="wm-river flow" d="M352 78 C 330 100, 300 110, 280 132 S 300 180, 340 196 S 380 214, 404 214" fill="none" stroke="#d8ecef" stroke-width="1" stroke-dasharray="3 9" stroke-linecap="round"/>`;
  // Emerald Jungle and the Verdant Temple (temple at 120,90): a stepped stone pyramid.
  s += wood(70, 70, 22, 34, ['#2f6a2a', '#3f7a32', '#4f8a3a']) + wood(170, 60, 12, 22, ['#2f6a2a', '#3f7a32']) + wood(110, 125, 10, 18, ['#3f7a32', '#4f8a3a']);
  s += `<g transform="translate(120 98)"><path d="M-18 0 L 18 0 L 14 -6 L -14 -6 Z M -14 -6 L 14 -6 L 10 -12 L -10 -12 Z M -10 -12 L 10 -12 L 6 -18 L -6 -18 Z" fill="#a8a48a" stroke="#5a5a44" stroke-width=".7"/><rect x="-3" y="-23" width="6" height="5" fill="#8a8670"/><path d="M-2 0 L 2 0 L 2 -18 L -2 -18 Z" fill="#7a7660" opacity=".6"/><path d="M-16 -2 q 6 -4 10 0 M 6 -8 q 4 -3 8 0" stroke="#3f7a32" stroke-width="1.4" fill="none"/></g>`;
  // Glowcap Grove (70,186): tall mushrooms with glowing caps.
  for (let i = 0; i < 12; i++) {
    const x = R(36, 108);
    const y = R(164, 214);
    const h = R(6, 11);
    const c = ['#c84a3a', '#8a5ab8', '#3aa8a0'][i % 3];
    s += `<rect x="${x - 0.8}" y="${y - h}" width="1.6" height="${h}" fill="#e8dcc0"/><path d="M${x - h * 0.55} ${y - h} Q ${x} ${y - h * 1.6} ${x + h * 0.55} ${y - h} Z" fill="${c}" stroke="#2e2a3a" stroke-width=".5"/><circle cx="${x - 1.5}" cy="${y - h * 1.2}" r=".8" fill="#fff" opacity=".8"/>`;
  }
  // Dunes, the oasis pool and palms (oasis at 220,234).
  for (let i = 0; i < 7; i++) {
    const x = R(150, 310);
    const y = R(250, 290);
    s += `<path d="M${x - 16} ${y} Q ${x} ${y - 9} ${x + 16} ${y}" fill="#e2b868" stroke="#a87a38" stroke-width=".7"/>`;
  }
  s += `<ellipse cx="226" cy="236" rx="14" ry="6" fill="#6fa8b0" stroke="#3e6470" stroke-width=".7"/>`;
  for (const [x, y] of [[208, 232], [244, 232], [234, 244], [214, 244]]) s += `<path d="M${x} ${y} q 1 -6 0 -11" stroke="#7a5a2a" stroke-width="1.2" fill="none"/><path d="M${x} ${y - 11} q -5 -1 -7 3 M ${x} ${y - 11} q 5 -1 7 3 M ${x} ${y - 11} q -3 -4 -6 -3 M ${x} ${y - 11} q 3 -4 6 -3" stroke="#4f8a3a" stroke-width="1.4" fill="none"/>`;
  // Clockwork Foundry (260,126): brick halls and chimneys.
  s += `<g transform="translate(260 132)"><rect x="-20" y="-10" width="16" height="10" fill="#8a5a3a" stroke="#4a2a1a" stroke-width=".7"/><rect x="-2" y="-14" width="22" height="14" fill="#9a6a44" stroke="#4a2a1a" stroke-width=".7"/><path d="M-2 -14 L 9 -20 L 20 -14 Z" fill="#6a3a24"/><rect x="-16" y="-22" width="3" height="12" fill="#5a3a2a"/><rect x="12" y="-28" width="3" height="14" fill="#5a3a2a"/><circle cx="4" cy="-6" r="3" fill="none" stroke="#d8a23a" stroke-width="1"/></g>`;
  anim += `<g class="wm-smoke" fill="#5a5048">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${i % 2 ? 273 : 246}" cy="${i % 2 ? 104 : 110}" r="${3 + i}" style="animation-delay:-${(i * 1.2).toFixed(1)}s"/>`).join('')}</g>`;
  // Misty Highlands (380,66): peaks, bamboo, a watchtower.
  for (const [x, y, w, h, sn] of [[350, 70, 32, 34, true], [384, 62, 40, 44, true], [420, 70, 30, 30, true], [452, 76, 24, 20, false], [330, 80, 22, 16, false]].sort((a, b) => a[1] - b[1])) s += peak(x, y, w, h, sn);
  for (let i = 0; i < 9; i++) {
    const x = R(340, 440);
    const y = R(84, 100);
    s += `<path d="M${x} ${y} l 0 -9 M ${x + 2} ${y} l 0 -11 M ${x - 2} ${y} l 0 -8" stroke="#5f9a4a" stroke-width=".9"/>`;
  }
  // Shipwreck Cove (400,222): a wreck on the beach.
  s += `<g transform="translate(404 226) rotate(-14)"><path d="M-16 0 Q 0 8 16 0 L 13 -5 L -13 -5 Z" fill="#6a4a2a" stroke="#2e2010" stroke-width=".7"/><path d="M-4 -5 L 2 -22" stroke="#4a3a22" stroke-width="1.4"/><path d="M2 -21 L 10 -12 L 1 -12 Z" fill="#efe2c4" opacity=".8"/></g>`;
  anim += `<g transform="translate(450 270)"><g fill="none" stroke="#2e4a4a" stroke-width="1" opacity=".55" class="wm-ship"><path d="M-10 0 L 10 0 L 7 5 L -7 5 Z" fill="#6a4a2a"/><path d="M0 0 L 0 -14" /><path d="M0 -13 L 8 -4 L 0 -4 Z" fill="#efe2c4"/></g></g>`;
  // Compass rose (bottom-left this time) and names.
  s += `<g transform="translate(36 258)"><circle r="22" fill="none" stroke="#5a3a18" stroke-width=".8" opacity=".7"/><path d="M0 -24 L 5 0 L 0 24 L -5 0 Z" fill="#7a1e1a"/><path d="M0 -24 L 5 0 L -5 0 Z" fill="#b8342a"/><path d="M-24 0 L 0 5 L 24 0 L 0 -5 Z" fill="#3a2410"/><circle r="2.4" fill="#d8a23a"/><text y="-28" text-anchor="middle" font-size="9" fill="#5a3a18" font-family="Cinzel, serif" font-weight="800">N</text></g>`;
  s += `<g fill="#4a2e14" font-family="'IM Fell English', Georgia, serif" font-style="italic" opacity=".78">
    ${label(70, 30, 'The Emerald Jungle', 10, -4, 'fill="#2e4a22" letter-spacing="1.5"')}
    ${label(460, 230, 'The Shimmering Sea', 10, -48, 'fill="#2e4a4a" letter-spacing="1.5"')}
    ${label(190, 292, 'The Golden Dunes', 9, 0, 'fill="#7a4a14"')}
    ${label(420, 24, 'Cloudpeak', 9, 0, 'letter-spacing="2"')}
    ${label(60, 228, 'Glowcap Wood', 8, -6, 'fill="#3a3a6a"')}
  </g>`;
  s += `<rect width="500" height="300" filter="url(#fr-paper)"/>
  <rect width="500" height="300" fill="url(#fr-edge)"/>
  <rect x="4" y="4" width="492" height="292" fill="none" stroke="#5a3a18" stroke-width="1.2" opacity=".6"/><rect x="7" y="7" width="486" height="286" fill="none" stroke="#5a3a18" stroke-width=".5" opacity=".5"/>
</svg>`;
  return { s, anim };
}

/**
 * The Northern Wilds, over the high pass: the Frozen Sea along the top with ice
 * floes, Glacier Lake, dark pine woods, an old battlefield, cave mouths in the
 * southern cliffs, a dwarven hall cut into a mountain, and the red cliffs of
 * the bandit fort.
 */
function northernWilds() {
  const r = seeded(53);
  const R = (a, b) => a + r() * (b - a);
  const label = (x, y, t, size = 9, rot = 0, extra = '') => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" font-size="${size}" ${extra}>${t}</text>`;
  const pine = (x, y, h, snow) =>
    `<path d="M${x} ${y - h} L ${x - h * 0.42} ${y} L ${x + h * 0.42} ${y} Z" fill="#2f4a32"/><path d="M${x} ${y - h} L ${x + h * 0.42} ${y} L ${x} ${y} Z" fill="#22382a"/>${snow ? `<path d="M${x} ${y - h} L ${x - h * 0.18} ${y - h * 0.55} L ${x + h * 0.18} ${y - h * 0.55} Z" fill="#f4f6fa"/>` : ''}<rect x="${x - 0.6}" y="${y}" width="1.2" height="${h * 0.18}" fill="#4a3a22"/>`;
  const peak = (x, base, w, h, tint = '#8a8a86', shade = '#5e5e5a') => {
    const tx = x + R(-w * 0.08, w * 0.08);
    return `<path d="M${x - w / 2} ${base} L ${tx} ${base - h} L ${x + w / 2} ${base} Z" fill="${tint}"/><path d="M${tx} ${base - h} L ${x + w / 2} ${base} L ${tx + w * 0.05} ${base} Z" fill="${shade}"/><path d="M${tx} ${base - h} L ${tx - w * 0.17} ${base - h * 0.62} L ${tx + w * 0.17} ${base - h * 0.62} Z" fill="#f4f1e8"/><path d="M${x - w / 2} ${base} L ${tx} ${base - h} L ${x + w / 2} ${base}" fill="none" stroke="#3a3a36" stroke-width=".8"/>`;
  };
  const sea = 'M0 0 L 500 0 L 500 34 C 440 46, 380 30, 320 40 S 200 30, 150 42 S 60 36, 0 46 Z';
  let s = `<svg class="wart" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <filter id="nw-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .24  0 0 0 0 .12  0 0 0 .22 0"/></filter>
    <filter id="nw-stain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="21"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .28  0 0 0 0 .1  0 0 0 -1.6 .9"/></filter>
    <radialGradient id="nw-edge" cx="50%" cy="50%" r="65%"><stop offset=".62" stop-color="#2a1606" stop-opacity="0"/><stop offset=".9" stop-color="#3a2008" stop-opacity=".45"/><stop offset="1" stop-color="#1a0c02" stop-opacity=".85"/></radialGradient>
    <radialGradient id="nw-snow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f6f8fc" stop-opacity=".85"/><stop offset="1" stop-color="#f6f8fc" stop-opacity="0"/></radialGradient>
    <radialGradient id="nw-red" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#b8583a" stop-opacity=".55"/><stop offset="1" stop-color="#b8583a" stop-opacity="0"/></radialGradient>
    <radialGradient id="nw-pine" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3a5a3a" stop-opacity=".55"/><stop offset="1" stop-color="#3a5a3a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="500" height="300" filter="url(#nw-stain)"/>
  <ellipse cx="200" cy="70" rx="260" ry="80" fill="url(#nw-snow)"/>
  <ellipse cx="90" cy="200" rx="110" ry="70" fill="url(#nw-pine)"/>
  <ellipse cx="400" cy="90" rx="90" ry="60" fill="url(#nw-red)"/>
  <path d="${sea}" fill="#8fb0c4" stroke="#4a6a7a" stroke-width="1.2"/>`;
  let anim = `<g class="wm-waves" fill="none" stroke="#f0f6fa" stroke-width=".9" stroke-linecap="round" opacity=".7">`;
  for (let i = 0; i < 10; i++) anim += `<path d="M${R(10, 480)} ${R(8, 26)} q 3 -3 6 0 q 3 -3 6 0" style="animation-delay:-${R(0, 4).toFixed(1)}s"/>`;
  anim += `</g>`;
  // Ice floes on the Frozen Sea.
  for (let i = 0; i < 9; i++) {
    const x = R(20, 480);
    const y = R(6, 28);
    s += `<path d="M${x} ${y} l ${R(6, 12)} ${R(-2, 2)} l ${R(-2, 3)} ${R(4, 6)} l ${R(-12, -6)} ${R(0, 2)} Z" fill="#f4f8fc" stroke="#9ab4c4" stroke-width=".5"/>`;
  }
  // Glacier Lake (110,90): a frozen oval with cracks.
  s += `<ellipse cx="112" cy="96" rx="34" ry="16" fill="#cfe4ee" stroke="#7a9aaa" stroke-width="1"/><path d="M90 92 l 10 4 l 8 -3 l 12 6 M 118 88 l 4 8 l 10 2" stroke="#9ab8c8" stroke-width=".7" fill="none"/>`;
  for (let i = 0; i < 9; i++) s += pine(R(60, 170), R(70, 130), R(7, 10), true);
  // Whisperpine Woods (80,198).
  const pts = Array.from({ length: 30 }, () => [R(30, 140), R(160, 240)]).sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pts) s += pine(x, y, R(8, 12), false);
  // Field of Banners (230,156): pennants, a broken cart, crossed spears.
  for (let i = 0; i < 6; i++) {
    const x = R(200, 262);
    const y = R(140, 178);
    s += `<path d="M${x} ${y} l 0 -10" stroke="#4a3a22" stroke-width=".9"/><path d="M${x} ${y - 10} l 6 2 l -6 2 Z" fill="${['#9a2a22', '#2a4a8a', '#c8a03a'][i % 3]}"/>`;
  }
  s += `<path d="M222 172 l 14 -10 M 224 162 l 12 10" stroke="#5a5a5a" stroke-width="1"/>`;
  // Glimmer Caverns (210,252): cliffs with glowing cave mouths.
  s += `<path d="M150 268 Q 200 236 270 262 L 270 280 L 150 280 Z" fill="#8a7a6a" stroke="#4a3e30" stroke-width=".8"/>`;
  for (const x of [180, 212, 244]) s += `<path d="M${x - 6} 266 Q ${x} 254 ${x + 6} 266 Z" fill="#2a1a3a"/><circle cx="${x}" cy="262" r="2" fill="#b89aff" opacity=".9"/>`;
  // Ironhold (370,210): a mountain with great doors.
  s += peak(352, 228, 40, 40) + peak(392, 226, 50, 56) + peak(430, 230, 36, 34);
  s += `<path d="M384 226 L 384 212 Q 392 204 400 212 L 400 226 Z" fill="#3a2a1a" stroke="#d8a23a" stroke-width="1"/><path d="M392 226 L 392 208" stroke="#d8a23a" stroke-width=".6"/>`;
  // Redcliff Fort (390,78): red cliffs and a palisade fort.
  s += `<path d="M340 100 L 360 64 L 400 58 L 440 66 L 460 100 Z" fill="#b8583a" stroke="#6a2a14" stroke-width="1"/><path d="M360 64 L 400 58 L 380 100 Z" fill="#8a3a22" opacity=".7"/>`;
  s += `<g fill="#6a4a2a" stroke="#3a2410" stroke-width=".5">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${376 + i * 4} 60 l 0 -8 l 2 -2 l 2 2 l 0 8 Z"/>`).join('')}</g><path d="M388 50 l 0 -10 l 6 2 l -6 2" stroke="#3a2410" stroke-width=".8" fill="#9a2a22"/>`;
  // A frozen river from the lake to the sea.
  s += `<path d="M120 80 C 130 60, 150 54, 160 40" fill="none" stroke="#c4dce8" stroke-width="2.2"/>`;
  // Compass (bottom-right) and names.
  s += `<g transform="translate(466 262)"><circle r="20" fill="none" stroke="#5a3a18" stroke-width=".8" opacity=".7"/><path d="M0 -22 L 4 0 L 0 22 L -4 0 Z" fill="#7a1e1a"/><path d="M-22 0 L 0 4 L 22 0 L 0 -4 Z" fill="#3a2410"/><circle r="2.2" fill="#d8a23a"/><text y="-25" text-anchor="middle" font-size="8" fill="#5a3a18" font-family="Cinzel, serif" font-weight="800">N</text></g>`;
  s += `<g fill="#4a2e14" font-family="'IM Fell English', Georgia, serif" font-style="italic" opacity=".8">
    ${label(250, 16, 'The Frozen Sea', 10, 0, 'fill="#2e4a5a" letter-spacing="2"')}
    ${label(70, 252, 'Whisperpine', 9, -6, 'fill="#2e4a2e"')}
    ${label(232, 132, 'The Old Battlefield', 8, 0)}
    ${label(410, 116, 'Redcliffs', 9, 0, 'fill="#6a2a14"')}
    ${label(392, 246, 'Ironhold Peaks', 8, 0)}
  </g>`;
  s += `<rect width="500" height="300" filter="url(#nw-paper)"/>
  <rect width="500" height="300" fill="url(#nw-edge)"/>
  <rect x="4" y="4" width="492" height="292" fill="none" stroke="#5a3a18" stroke-width="1.2" opacity=".6"/><rect x="7" y="7" width="486" height="286" fill="none" stroke="#5a3a18" stroke-width=".5" opacity=".5"/>
</svg>`;
  return { s, anim };
}
