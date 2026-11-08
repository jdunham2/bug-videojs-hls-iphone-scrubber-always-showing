// The painted world map behind the mission nodes: parchment, a coast with the
// Grey Sea, the Frostpeaks around the keep, the Ashlands and their smoking
// mountain by the forge, forests, a river, the siege wall in the south, a
// compass rose and region names. Drawn once (seeded, so nothing jumps between
// redraws) in a 500x300 box that matches the map's 5:3 frame.

let cached = null;
let bitmap = null;

/**
 * Turn the painted SVG into a JPEG once. An SVG <img> is vector: the browser
 * re-rasterises it (paper-grain filters and all) whenever anything near it
 * animates, which made the map screen crawl. A bitmap never does.
 */
function bakeBitmap(url) {
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
      bitmap = c.toDataURL('image/jpeg', 0.88);
      const el = document.querySelector('.wmap img.wart');
      if (el) el.src = bitmap;
    } catch {
      // Keep the SVG if the canvas can't be read back.
    }
  };
  img.src = url;
}

/** Start baking early (camp build) so the map is ready the first time it opens. */
export function prepareMapArt() {
  mapArt();
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Map art as an HTML string; once baked, the painted layer is a plain bitmap. */
export function mapArt() {
  if (cached && bitmap) return cached.replace(/<img class="wart" alt="" src="[^"]*">/, `<img class="wart" alt="" src="${bitmap}">`);
  if (cached) return cached;
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
  // The painted layers go into an <img>: the browser rasterises it once, so its
  // paper-grain filters never re-run. Only the light animated bits stay live SVG.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.replace('<svg class="wart"', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
  bakeBitmap(url);
  cached = `<img class="wart" alt="" src="${url}"><svg class="wart wanim" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="wm-lava" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb04a" stop-opacity=".9"/><stop offset=".5" stop-color="#e0501a" stop-opacity=".35"/><stop offset="1" stop-color="#e0501a" stop-opacity="0"/></radialGradient></defs>${anim}</svg>`;
  return cached;
}
