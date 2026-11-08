// Painted interiors shown behind a camp screen once you step inside a
// building: the hall's banners and torches, the tailor's fabrics, the armory's
// racks, the merchant's shelves, the forge's glow and sparks, the trophy wall
// and the map table at the gate. Each scene is one SVG (1600x900, scaled to
// cover the screen) with light CSS animation: flames flicker, cloth sways,
// sparks and dust drift.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Shared paint: wall patterns, floor, light pools.
const DEFS = `
<defs>
  <pattern id="in-brick" width="120" height="60" patternUnits="userSpaceOnUse">
    <rect width="120" height="60" fill="#3a332c"/>
    <g fill="#4a4137" stroke="#231e19" stroke-width="3">
      <rect x="2" y="2" width="56" height="26" rx="3"/><rect x="62" y="2" width="56" height="26" rx="3"/>
      <rect x="-28" y="32" width="56" height="26" rx="3"/><rect x="32" y="32" width="56" height="26" rx="3"/><rect x="92" y="32" width="56" height="26" rx="3"/>
    </g>
    <g fill="#000" opacity=".12"><rect x="10" y="8" width="20" height="6"/><rect x="70" y="40" width="14" height="5"/></g>
  </pattern>
  <pattern id="in-plank" width="90" height="900" patternUnits="userSpaceOnUse">
    <rect width="90" height="900" fill="#4b3322"/>
    <rect x="0" width="86" height="900" fill="#5a3d28"/>
    <path d="M20 0 C 26 200, 14 400, 22 600 S 18 800, 24 900 M58 0 C 52 250, 64 450, 56 700" stroke="#3e2a1b" stroke-width="2" fill="none" opacity=".7"/>
    <circle cx="44" cy="300" r="5" fill="#3a2618"/><circle cx="30" cy="720" r="4" fill="#3a2618"/>
  </pattern>
  <pattern id="in-canvas" width="160" height="900" patternUnits="userSpaceOnUse">
    <rect width="160" height="900" fill="#b89a6c"/>
    <rect width="80" height="900" fill="#c8ab7c"/>
    <rect x="76" width="8" height="900" fill="#8a6e48" opacity=".5"/>
  </pattern>
  <linearGradient id="in-floorShade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".4" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
  </linearGradient>
  <radialGradient id="in-warm" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffb35a" stop-opacity=".55"/><stop offset=".5" stop-color="#ff8a30" stop-opacity=".18"/><stop offset="1" stop-color="#ff8a30" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="in-cool" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#a8c8ff" stop-opacity=".4"/><stop offset="1" stop-color="#a8c8ff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="in-flame" cx="50%" cy="80%" r="60%">
    <stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#ffc24a"/><stop offset=".75" stop-color="#ff6a1a"/><stop offset="1" stop-color="#c8300a" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="in-coals" cx="50%" cy="100%" r="80%">
    <stop offset="0" stop-color="#fff0a0"/><stop offset=".3" stop-color="#ffa22a"/><stop offset=".7" stop-color="#c8360c"/><stop offset="1" stop-color="#3a0c04"/>
  </radialGradient>
  <linearGradient id="in-shaft" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bcd4ff" stop-opacity=".28"/><stop offset="1" stop-color="#bcd4ff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="in-vig" cx="50%" cy="48%" r="72%">
    <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/>
  </radialGradient>
  <linearGradient id="in-gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffe8a0"/><stop offset=".5" stop-color="#d8a23a"/><stop offset="1" stop-color="#8a5a18"/>
  </linearGradient>
</defs>`;

/** Stone or wooden floor in perspective, vanishing toward the middle of the wall. */
function floor(y, color, lines = '#00000055', vx = 800) {
  let g = `<rect x="0" y="${y}" width="1600" height="${900 - y}" fill="${color}"/>`;
  for (let i = -10; i <= 10; i++) g += `<line x1="${vx + i * 40}" y1="${y}" x2="${vx + i * 260}" y2="900" stroke="${lines}" stroke-width="3"/>`;
  for (let k = 1; k < 6; k++) {
    const yy = y + (900 - y) * Math.pow(k / 6, 1.6);
    g += `<line x1="0" y1="${yy}" x2="1600" y2="${yy}" stroke="${lines}" stroke-width="2"/>`;
  }
  return g + `<rect x="0" y="${y}" width="1600" height="${900 - y}" fill="url(#in-floorShade)"/>`;
}

/** A wall torch with a flickering flame and a warm pool of light. */
function torch(x, y, s = 1) {
  const d = rnd(0, 1).toFixed(2);
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="0" cy="-30" r="260" fill="url(#in-warm)" class="in-glow" style="animation-delay:-${d}s"/>
    <path d="M-8 40 L 8 40 L 14 -4 L -14 -4 Z" fill="#2a1d14" stroke="#120c08" stroke-width="3"/>
    <path d="M-20 -4 L 20 -4 L 16 6 L -16 6 Z" fill="#5a4a3a"/>
    <path d="M0 -70 C 18 -44, 22 -20, 12 -6 C 6 0, -6 0, -12 -6 C -22 -20, -16 -44, 0 -70 Z" fill="url(#in-flame)" class="in-flame" style="animation-delay:-${d}s"/>
    <path d="M0 -42 C 8 -30, 9 -18, 4 -10 C 1 -7, -1 -7, -4 -10 C -9 -18, -8 -30, 0 -42 Z" fill="#fffbe0" class="in-flame" style="animation-delay:-${d}s"/>
  </g>`;
}

/** A candle with a small flame. */
function candle(x, y, h = 40) {
  const d = rnd(0, 1).toFixed(2);
  return `<g transform="translate(${x} ${y})">
    <circle cx="0" cy="${-h - 14}" r="70" fill="url(#in-warm)" class="in-glow" style="animation-delay:-${d}s"/>
    <rect x="-7" y="${-h}" width="14" height="${h}" rx="3" fill="#efe2c4"/><path d="M-7 ${-h + 4} q 4 10 0 16" stroke="#d8c8a0" stroke-width="3" fill="none"/>
    <path d="M0 ${-h - 24} C 6 ${-h - 14}, 6 ${-h - 6}, 0 ${-h - 3} C -6 ${-h - 6}, -6 ${-h - 14}, 0 ${-h - 24} Z" fill="url(#in-flame)" class="in-flame" style="animation-delay:-${d}s"/>
  </g>`;
}

/** A hanging cloth banner that sways. */
function banner(x, y, w, h, color, trim = '#d8a23a', motif = 'chevron') {
  const m =
    motif === 'chevron'
      ? `<path d="M${w * 0.2} ${h * 0.35} L ${w / 2} ${h * 0.55} L ${w * 0.8} ${h * 0.35}" stroke="${trim}" stroke-width="${w * 0.09}" fill="none"/>`
      : motif === 'bow'
        ? `<path d="M${w * 0.3} ${h * 0.2} Q ${w * 0.75} ${h * 0.42} ${w * 0.3} ${h * 0.64}" stroke="${trim}" stroke-width="${w * 0.06}" fill="none"/><line x1="${w * 0.3}" y1="${h * 0.2}" x2="${w * 0.3}" y2="${h * 0.64}" stroke="${trim}" stroke-width="3"/><line x1="${w * 0.2}" y1="${h * 0.42}" x2="${w * 0.78}" y2="${h * 0.42}" stroke="${trim}" stroke-width="4"/>`
        : `<circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.22}" fill="none" stroke="${trim}" stroke-width="${w * 0.06}"/><path d="M${w / 2} ${h * 0.28} L ${w / 2} ${h * 0.56} M ${w * 0.36} ${h * 0.42} L ${w * 0.64} ${h * 0.42}" stroke="${trim}" stroke-width="${w * 0.05}"/>`;
  return `<g transform="translate(${x} ${y})"><rect x="-10" y="-8" width="${w + 20}" height="10" rx="5" fill="#3a2a1a"/>
    <g class="in-sway" style="animation-delay:-${rnd(0, 4).toFixed(1)}s">
      <path d="M0 0 L ${w} 0 L ${w} ${h} L ${w / 2} ${h * 0.86} L 0 ${h} Z" fill="${color}"/>
      <path d="M${w * 0.08} 0 L ${w * 0.08} ${h * 0.95} M ${w * 0.92} 0 L ${w * 0.92} ${h * 0.95}" stroke="${trim}" stroke-width="5" opacity=".9"/>
      ${m}
      <path d="M0 0 L ${w} 0 L ${w} ${h} L ${w / 2} ${h * 0.86} L 0 ${h} Z" fill="url(#in-floorShade)" opacity=".5"/>
    </g></g>`;
}

/** A tall arched window with moonlight streaming in. */
function window_(x, y, w, h) {
  return `<g transform="translate(${x} ${y})">
    <path d="M0 ${h} L 0 ${w / 2} A ${w / 2} ${w / 2} 0 0 1 ${w} ${w / 2} L ${w} ${h} Z" fill="#16233a" stroke="#1d1813" stroke-width="16"/>
    <path d="M0 ${h} L 0 ${w / 2} A ${w / 2} ${w / 2} 0 0 1 ${w} ${w / 2} L ${w} ${h} Z" fill="url(#in-cool)"/>
    <path d="M${w / 2} 0 L ${w / 2} ${h} M 0 ${h * 0.55} L ${w} ${h * 0.55}" stroke="#1d1813" stroke-width="8"/>
    <circle cx="${w * 0.7}" cy="${h * 0.3}" r="${w * 0.12}" fill="#e8f0ff" opacity=".85"/>
    <polygon points="0,${h} ${w},${h} ${w * 2.6},${h + 520} ${-w * 0.4},${h + 520}" fill="url(#in-shaft)" class="in-shaft"/>
  </g>`;
}

/** A bow on a rack, drawn as a curved stave with a string. */
function bowShape(x, y, h, color = '#7a4a24', rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 ${-h / 2} Q ${h * 0.28} 0 0 ${h / 2}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <line x1="0" y1="${-h / 2}" x2="0" y2="${h / 2}" stroke="#e8dcc0" stroke-width="2"/><rect x="${h * 0.1}" y="-12" width="10" height="24" rx="3" fill="#2a1a10"/></g>`;
}

/** A quiver full of arrows. */
function quiver(x, y, s = 1) {
  let a = '';
  for (let i = 0; i < 6; i++) a += `<line x1="${-14 + i * 6}" y1="0" x2="${-18 + i * 7}" y2="-46" stroke="#c8b48a" stroke-width="3"/><path d="M${-22 + i * 7} -46 l 4 -16 l 4 16 z" fill="${pick(['#e8e0d0', '#c84a3a', '#3a6aa8'])}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${a}<path d="M-22 0 L 22 0 L 16 110 L -16 110 Z" fill="#6a3e22" stroke="#2a180c" stroke-width="3"/><rect x="-22" y="16" width="44" height="8" fill="#a8783a"/><rect x="-18" y="84" width="36" height="8" fill="#a8783a"/></g>`;
}

/** A round wooden shield with a metal rim. */
function shield(x, y, r, color) {
  return `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#5a5048" /><circle r="${r * 0.9}" fill="${color}"/>
    <path d="M${-r * 0.9} 0 L ${r * 0.9} 0 M 0 ${-r * 0.9} L 0 ${r * 0.9}" stroke="#00000044" stroke-width="${r * 0.12}"/>
    <circle r="${r * 0.22}" fill="url(#in-gold)"/><circle r="${r}" fill="none" stroke="#2a2420" stroke-width="4"/></g>`;
}

/** A stone pedestal holding a hero statue: an archer at rest, lit from the side by torchlight. */
function statue(x, y, s, flip = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s * flip} ${s})">
    <rect x="-64" y="-4" width="128" height="70" fill="#3e3a34"/><rect x="-74" y="-16" width="148" height="16" fill="#4c4740"/><rect x="-74" y="60" width="148" height="16" fill="#2e2a26"/>
    <rect x="-64" y="-4" width="20" height="70" fill="#5a544a" opacity=".6"/>
    <g fill="#4a453e" stroke="#2a2622" stroke-width="2">
      <path d="M-30 -16 L 30 -16 L 24 -60 L 34 -150 C 30 -176, 18 -186, 0 -188 C -18 -186, -30 -176, -34 -150 L -24 -60 Z"/>
      <path d="M-18 -188 C -22 -214, -12 -238, 0 -240 C 12 -238, 22 -214, 18 -188 Z"/>
      <path d="M-22 -220 C -30 -250, 30 -250, 22 -220 L 26 -196 L -26 -196 Z"/>
      <path d="M30 -170 C 46 -150, 52 -120, 50 -96 L 40 -96 C 40 -120, 34 -140, 24 -150 Z"/>
      <path d="M-30 -170 C -44 -150, -48 -126, -42 -104 L -32 -106 C -36 -126, -32 -146, -24 -156 Z"/>
    </g>
    <path d="M-34 -150 C -30 -176, -18 -186, 0 -188 L -4 -150 L -24 -60 L -30 -16" fill="#6e665a" opacity=".55"/>
    <path d="M-22 -220 C -26 -240, -6 -246, 0 -246 L -2 -200 Z" fill="#6e665a" opacity=".5"/>
    <path d="M58 -236 Q 96 -150 58 -60" stroke="#4a453e" stroke-width="10" fill="none" stroke-linecap="round"/><line x1="58" y1="-236" x2="58" y2="-60" stroke="#6e665a" stroke-width="2"/>
    <path d="M58 -236 Q 96 -150 58 -60" stroke="#ffb35a" stroke-width="2" fill="none" opacity=".35"/>
    <path d="M-30 -16 L -24 -60 L -34 -150" stroke="#ffb35a" stroke-width="2" fill="none" opacity=".3"/>
  </g>`;
}

/** Shelf of jars, bottles and boxes for the merchant. */
function shelf(x, y, w) {
  let items = '';
  let cx = 10;
  while (cx < w - 40) {
    const t = Math.random();
    const c = pick(['#7a9a5a', '#a85a3a', '#5a7aa8', '#c8a050', '#8a6aa0', '#b8b0a0']);
    if (t < 0.35) items += `<g transform="translate(${cx} 0)"><rect x="0" y="-52" width="34" height="52" rx="8" fill="${c}" opacity=".9"/><rect x="4" y="-62" width="26" height="12" rx="3" fill="#6a4a2a"/><rect x="6" y="-46" width="6" height="34" rx="3" fill="#fff" opacity=".25"/></g>`;
    else if (t < 0.6) items += `<g transform="translate(${cx} 0)"><path d="M10 0 L 10 -40 L 14 -48 L 14 -66 L 20 -66 L 20 -48 L 24 -40 L 24 0 Z" fill="${c}"/><rect x="13" y="-72" width="8" height="8" fill="#6a4a2a"/></g>`;
    else if (t < 0.85) items += `<g transform="translate(${cx} 0)"><rect x="0" y="-44" width="54" height="44" fill="#8a6038" stroke="#4a3018" stroke-width="3"/><path d="M0 -22 L 54 -22" stroke="#4a3018" stroke-width="3"/></g>`;
    else items += `<g transform="translate(${cx} 0)"><ellipse cx="22" cy="-6" rx="24" ry="8" fill="#c8a050"/><ellipse cx="22" cy="-14" rx="20" ry="7" fill="#e0b860"/><ellipse cx="22" cy="-21" rx="15" ry="6" fill="#f0c870" class="in-glint"/></g>`;
    cx += t < 0.6 ? rnd(40, 52) : rnd(62, 76);
  }
  return `<g transform="translate(${x} ${y})">${items}<rect x="-10" y="0" width="${w + 20}" height="18" fill="#5a3a20" stroke="#2a1a0c" stroke-width="3"/><path d="M10 18 L 30 50 L 10 50 Z M ${w - 10} 18 L ${w - 30} 50 L ${w - 10} 50 Z" fill="#4a2e18"/></g>`;
}

/** A hanging lantern on a chain that swings gently. */
function lantern(x, y, len = 120) {
  return `<g transform="translate(${x} ${y})"><g class="in-swing" style="animation-delay:-${rnd(0, 3).toFixed(1)}s">
    <line x1="0" y1="0" x2="0" y2="${len}" stroke="#2a2420" stroke-width="4"/>
    <circle cx="0" cy="${len + 40}" r="180" fill="url(#in-warm)" class="in-glow"/>
    <path d="M-22 ${len} L 22 ${len} L 26 ${len + 70} L -26 ${len + 70} Z" fill="#ffcf7a" opacity=".85" class="in-glow"/>
    <path d="M-22 ${len} L 22 ${len} L 26 ${len + 70} L -26 ${len + 70} Z M 0 ${len} L 0 ${len + 70}" fill="none" stroke="#2a2420" stroke-width="5"/>
    <path d="M-30 ${len} L 30 ${len} L 14 ${len - 16} L -14 ${len - 16} Z M -30 ${len + 70} L 30 ${len + 70} L 26 ${len + 80} L -26 ${len + 80} Z" fill="#2a2420"/>
  </g></g>`;
}

/** Hanging fabric bolt for the tailor (drapes and sways). */
function drape(x, y, w, h, color) {
  return `<g transform="translate(${x} ${y})"><g class="in-sway" style="animation-delay:-${rnd(0, 4).toFixed(1)}s">
    <path d="M0 0 C ${w * 0.1} ${h * 0.5}, ${-w * 0.05} ${h * 0.8}, ${w * 0.05} ${h} L ${w * 0.95} ${h} C ${w * 1.05} ${h * 0.8}, ${w * 0.9} ${h * 0.5}, ${w} 0 Z" fill="${color}"/>
    <path d="M${w * 0.3} 0 C ${w * 0.35} ${h * 0.5}, ${w * 0.25} ${h * 0.8}, ${w * 0.3} ${h} M ${w * 0.65} 0 C ${w * 0.6} ${h * 0.5}, ${w * 0.7} ${h * 0.8}, ${w * 0.66} ${h}" stroke="#00000033" stroke-width="10" fill="none"/>
    <path d="M${w * 0.45} 0 C ${w * 0.5} ${h * 0.5}, ${w * 0.42} ${h * 0.8}, ${w * 0.47} ${h}" stroke="#ffffff22" stroke-width="8" fill="none"/>
  </g></g>`;
}

/** A tailor's dress form. */
function mannequin(x, y, s, color) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-4" y="-60" width="8" height="60" fill="#3a2a1a"/><path d="M-40 0 L 40 0 L 30 -8 L -30 -8 Z" fill="#3a2a1a"/>
    <path d="M-44 -230 C -60 -200, -40 -150, -34 -120 C -40 -100, -46 -80, -40 -60 L 40 -60 C 46 -80, 40 -100, 34 -120 C 40 -150, 60 -200, 44 -230 C 20 -246, -20 -246, -44 -230 Z" fill="${color}"/>
    <path d="M-34 -120 L 34 -120" stroke="#d8a23a" stroke-width="6"/><rect x="-8" y="-262" width="16" height="22" fill="#3a2a1a"/><circle cx="0" cy="-268" r="9" fill="#3a2a1a"/>
    <path d="M-10 -230 C -6 -190, -14 -150, -8 -120" stroke="#00000033" stroke-width="8" fill="none"/>
  </g>`;
}

/** Drifting dust motes or rising sparks as HTML spans (cheap CSS animation). */
function motes(kind, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const st = `left:${rnd(0, 100).toFixed(1)}%;top:${rnd(kind === 'spark' ? 55 : 10, 95).toFixed(1)}%;--dx:${rnd(-60, 60).toFixed(0)}px;--dy:${rnd(kind === 'spark' ? -500 : -120, kind === 'spark' ? -250 : -40).toFixed(0)}px;animation-duration:${rnd(kind === 'spark' ? 1.4 : 6, kind === 'spark' ? 3 : 12).toFixed(1)}s;animation-delay:-${rnd(0, 12).toFixed(1)}s`;
    s += `<i class="in-${kind}" style="${st}"></i>`;
  }
  return s;
}

const SCENES = {
  hall() {
    let s = `<rect width="1600" height="640" fill="url(#in-brick)"/>`;
    s += `<rect width="1600" height="640" fill="#0a0806" opacity=".25"/>`;
    for (const x of [230, 650, 1070]) s += window_(x + 60, 120, 180, 330);
    s += `<rect x="0" y="560" width="1600" height="80" fill="#2a241e"/><rect x="0" y="556" width="1600" height="10" fill="#4a4036"/>`;
    s += floor(640, '#3a342c');
    s += `<path d="M680 640 L 920 640 L 1180 900 L 420 900 Z" fill="#7a1e1a"/><path d="M700 640 L 900 640 L 1140 900 L 460 900 Z" fill="none" stroke="#d8a23a" stroke-width="6"/>`;
    s += banner(140, 80, 110, 300, '#7a1e1a', '#d8a23a', 'bow') + banner(540, 80, 90, 260, '#1e3a6a', '#d8c070') + banner(960, 80, 90, 260, '#2a5a2a', '#d8c070') + banner(1360, 80, 110, 300, '#7a1e1a', '#d8a23a', 'bow');
    s += torch(470, 330) + torch(890, 330) + torch(1310, 330);
    s += statue(150, 600, 1.15) + statue(1450, 600, 1.15, -1);
    return { svg: s, motes: motes('dust', 26), tone: 'warm' };
  },
  wardrobe() {
    let s = `<rect width="1600" height="900" fill="url(#in-canvas)"/>`;
    s += `<path d="M0 0 L 800 -40 L 1600 0 L 1600 160 C 1200 120, 400 120, 0 160 Z" fill="#8a6e48"/>`;
    s += `<rect x="784" y="0" width="32" height="900" fill="#5a3a20"/><rect x="784" y="0" width="10" height="900" fill="#7a5230"/>`;
    s += floor(660, '#6a5236', '#00000033');
    s += `<ellipse cx="800" cy="780" rx="520" ry="90" fill="#7a2a24" opacity=".85"/><ellipse cx="800" cy="780" rx="480" ry="76" fill="none" stroke="#d8a23a" stroke-width="5" opacity=".8"/>`;
    s += `<path d="M60 170 Q 400 230 760 175" stroke="#3a2a1a" stroke-width="5" fill="none"/><path d="M840 175 Q 1200 230 1540 170" stroke="#3a2a1a" stroke-width="5" fill="none"/>`;
    const cols = ['#c8443a', '#7fc4ff', '#6a5a8a', '#ffc04d', '#5f8f4a', '#d87a3a'];
    [100, 230, 360, 500, 630].forEach((x, i) => (s += drape(x, 190 + Math.sin(i) * 8, 100, rnd(260, 360), cols[i])));
    [880, 1010, 1150, 1290, 1420].forEach((x, i) => (s += drape(x, 190 + Math.cos(i) * 8, 100, rnd(260, 360), cols[(i + 3) % 6])));
    s += mannequin(260, 760, 1.2, '#c8443a') + mannequin(1340, 760, 1.2, '#2a5a8a');
    s += `<rect x="560" y="640" width="480" height="24" fill="#5a3a20"/><rect x="580" y="664" width="20" height="120" fill="#3a2414"/><rect x="1000" y="664" width="20" height="120" fill="#3a2414"/>`;
    for (let i = 0; i < 6; i++) s += `<g transform="translate(${620 + i * 70} 640)"><rect x="-14" y="-40" width="28" height="40" rx="4" fill="${cols[i]}"/><rect x="-18" y="-44" width="36" height="8" rx="2" fill="#6a4a2a"/><rect x="-18" y="-4" width="36" height="6" rx="2" fill="#6a4a2a"/></g>`;
    s += lantern(520, 0, 140) + lantern(1080, 0, 140);
    return { svg: s, motes: motes('dust', 22), tone: 'warm' };
  },
  armory() {
    let s = `<rect width="1600" height="640" fill="url(#in-plank)"/><rect width="1600" height="640" fill="#0a0604" opacity=".2"/>`;
    s += `<rect x="0" y="0" width="1600" height="40" fill="#2a1a10"/><rect x="0" y="40" width="1600" height="12" fill="#4a2e1a"/>`;
    for (const x of [0, 520, 1060, 1580]) s += `<rect x="${x}" y="0" width="30" height="640" fill="#3a2414"/>`;
    s += floor(640, '#4a3626', '#00000044');
    // Bow racks.
    for (const [rx, n] of [
      [90, 4],
      [1140, 4],
    ]) {
      s += `<rect x="${rx}" y="170" width="380" height="16" fill="#3a2414"/><rect x="${rx}" y="470" width="380" height="16" fill="#3a2414"/>`;
      for (let i = 0; i < n; i++) s += bowShape(rx + 50 + i * 90, 320, 300, pick(['#7a4a24', '#5a3418', '#8a5a2a', '#4a3a2a']));
    }
    s += shield(780, 200, 70, '#7a1e1a') + shield(640, 330, 56, '#1e3a6a') + shield(920, 330, 56, '#2a5a2a');
    s += `<g stroke="#9aa0a8" stroke-width="10" stroke-linecap="round"><line x1="700" y1="420" x2="860" y2="560"/><line x1="860" y1="420" x2="700" y2="560"/></g><g fill="#3a2414"><rect x="684" y="404" width="22" height="22" rx="4"/><rect x="854" y="404" width="22" height="22" rx="4"/></g>`;
    s += quiver(220, 640, 1.3) + quiver(330, 650, 1.1) + quiver(1300, 640, 1.3) + quiver(1410, 650, 1.1);
    s += `<g transform="translate(780 700)"><ellipse cx="0" cy="120" rx="90" ry="20" fill="#000" opacity=".4"/><path d="M-80 0 L 80 0 L 70 120 L -70 120 Z" fill="#6a4426" stroke="#2a180c" stroke-width="4"/><rect x="-84" y="20" width="168" height="10" fill="#8a8a8a"/><rect x="-78" y="90" width="156" height="10" fill="#8a8a8a"/></g>`;
    for (let i = 0; i < 9; i++) s += `<line x1="${730 + i * 12}" y1="700" x2="${720 + i * 14}" y2="620" stroke="#c8b48a" stroke-width="4"/><path d="M${714 + i * 14} 620 l 6 -20 l 6 20 z" fill="#e8e0d0"/>`;
    s += torch(560, 300) + torch(1040, 300);
    return { svg: s, motes: motes('dust', 22), tone: 'warm' };
  },
  merchant() {
    let s = `<rect width="1600" height="640" fill="url(#in-plank)"/><rect width="1600" height="640" fill="#1a0e06" opacity=".25"/>`;
    s += `<path d="M0 0 L 1600 0 L 1600 70 Q 1500 110 1400 70 Q 1300 110 1200 70 Q 1100 110 1000 70 Q 900 110 800 70 Q 700 110 600 70 Q 500 110 400 70 Q 300 110 200 70 Q 100 110 0 70 Z" fill="#7a1e1a"/>`;
    s += `<path d="M0 70 Q 100 110 200 70 Q 300 110 400 70 Q 500 110 600 70 Q 700 110 800 70 Q 900 110 1000 70 Q 1100 110 1200 70 Q 1300 110 1400 70 Q 1500 110 1600 70" stroke="#d8a23a" stroke-width="6" fill="none"/>`;
    s += floor(650, '#4a3424', '#00000044');
    for (const y of [250, 400, 550]) s += shelf(60, y, 420) + shelf(1120, y, 420);
    s += `<g transform="translate(560 140)"><rect width="480" height="300" fill="#2a5a6a"/><rect x="14" y="14" width="452" height="272" fill="none" stroke="#d8a23a" stroke-width="6"/>
      <path d="M40 150 L 120 60 L 200 150 L 280 60 L 360 150 L 440 60 M 40 240 L 120 150 L 200 240 L 280 150 L 360 240 L 440 150" stroke="#c8443a" stroke-width="10" fill="none"/></g>`;
    s += `<rect x="480" y="610" width="640" height="40" fill="#6a4426"/><rect x="460" y="600" width="680" height="16" fill="#8a5a32"/><rect x="480" y="650" width="640" height="250" fill="#4a2e18"/>`;
    s += `<g transform="translate(700 600)"><line x1="0" y1="0" x2="0" y2="-120" stroke="#8a6a3a" stroke-width="8"/><line x1="-80" y1="-110" x2="80" y2="-110" stroke="#8a6a3a" stroke-width="6"/>
      <path d="M-110 -60 L -50 -60 L -80 -110 Z M 50 -60 L 110 -60 L 80 -110 Z" fill="none" stroke="#8a6a3a" stroke-width="3"/><ellipse cx="-80" cy="-60" rx="34" ry="8" fill="url(#in-gold)"/><ellipse cx="80" cy="-60" rx="34" ry="8" fill="url(#in-gold)"/></g>`;
    for (let i = 0; i < 14; i++) s += `<ellipse cx="${900 + rnd(-40, 60)}" cy="${596 - i * 5}" rx="20" ry="6" fill="${i % 2 ? '#e0b860' : '#c8a050'}" stroke="#8a5a18" stroke-width="1.5" ${i === 13 ? 'class="in-glint"' : ''}/>`;
    s += `<g transform="translate(1010 560)"><path d="M0 40 C -40 40, -46 -10, -20 -30 L 20 -30 C 46 -10, 40 40, 0 40 Z" fill="#a88a5a"/><path d="M-20 -30 Q 0 -40 20 -30" stroke="#5a3a20" stroke-width="5" fill="none"/></g>`;
    s += lantern(300, 70, 90) + lantern(800, 70, 50) + lantern(1300, 70, 90);
    return { svg: s, motes: motes('dust', 20), tone: 'warm' };
  },
  blacksmith() {
    let s = `<rect width="1600" height="660" fill="url(#in-brick)"/><rect width="1600" height="660" fill="#0a0402" opacity=".45"/>`;
    s += floor(660, '#2a2420', '#00000066');
    // Forge hearth with glowing coals.
    s += `<circle cx="800" cy="460" r="640" fill="url(#in-warm)" class="in-glow fast"/>`;
    s += `<path d="M560 0 L 1040 0 L 1100 230 L 500 230 Z" fill="#2a2420" stroke="#120e0c" stroke-width="6"/><path d="M520 230 L 1080 230 L 1080 260 L 520 260 Z" fill="#3a332c"/>`;
    s += `<path d="M540 660 L 540 400 Q 540 300 800 300 Q 1060 300 1060 400 L 1060 660 Z" fill="#4a4137" stroke="#1a1612" stroke-width="10"/>`;
    s += `<path d="M620 560 L 620 430 Q 620 360 800 360 Q 980 360 980 430 L 980 560 Z" fill="#120806"/>`;
    s += `<path d="M630 560 L 630 500 Q 800 460 970 500 L 970 560 Z" fill="url(#in-coals)" class="in-coals"/>`;
    s += `<path d="M660 520 C 690 470, 700 440, 720 420 C 730 450, 760 470, 750 520 Z M 780 520 C 800 450, 820 410, 840 390 C 850 430, 880 470, 860 520 Z M 880 520 C 900 480, 910 460, 930 440 C 935 470, 950 490, 940 520 Z" fill="url(#in-flame)" class="in-flame big"/>`;
    s += `<rect x="580" y="560" width="440" height="40" fill="#3a332c"/>`;
    // Anvil in front.
    s += `<g transform="translate(330 760)"><ellipse cx="0" cy="110" rx="170" ry="24" fill="#000" opacity=".5"/><path d="M-60 110 L 60 110 L 40 40 L -40 40 Z" fill="#2a2a2e"/>
      <path d="M-150 -20 L 120 -20 C 170 -20, 200 -10, 220 0 C 180 10, 140 10, 110 10 L 70 40 L -70 40 L -110 10 L -150 10 Z" fill="#3a3a40"/><path d="M-150 -20 L 120 -20 C 170 -20, 200 -10, 220 0" stroke="#ff9a4a" stroke-width="4" fill="none" opacity=".6"/></g>`;
    s += `<g transform="translate(400 690) rotate(-24)"><rect x="-6" y="-10" width="12" height="130" rx="4" fill="#5a3a20"/><rect x="-34" y="-34" width="68" height="34" rx="4" fill="#4a4a50"/></g>`;
    s += `<g transform="translate(1300 760)"><ellipse cx="0" cy="110" rx="130" ry="22" fill="#000" opacity=".5"/><path d="M-110 -40 L 110 -40 L 100 110 L -100 110 Z" fill="#5a3a20" stroke="#2a180c" stroke-width="4"/>
      <ellipse cx="0" cy="-40" rx="110" ry="20" fill="#1a2a34"/><rect x="-114" y="0" width="228" height="12" fill="#6a6a6a"/><rect x="-108" y="70" width="216" height="12" fill="#6a6a6a"/></g>`;
    s += `<rect x="1180" y="180" width="300" height="12" fill="#3a2414"/>`;
    for (let i = 0; i < 5; i++) s += `<g transform="translate(${1210 + i * 60} 192)"><line x1="0" y1="0" x2="0" y2="${110 + (i % 2) * 40}" stroke="#4a4a50" stroke-width="7"/><rect x="-12" y="${100 + (i % 2) * 40}" width="24" height="${i % 2 ? 14 : 30}" fill="#5a5a60"/></g>`;
    s += torch(170, 330);
    return { svg: s, motes: motes('spark', 46) + motes('dust', 10), tone: 'hot' };
  },
  shrine() {
    let s = `<rect width="1600" height="640" fill="url(#in-plank)"/><rect width="1600" height="640" fill="#0a0604" opacity=".3"/>`;
    s += floor(640, '#3a2a1e', '#00000044');
    const plaque = (x, y, w, h, gold) =>
      `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="10" fill="#4a2e18" stroke="#2a180c" stroke-width="5"/><rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="6" fill="none" stroke="${gold ? 'url(#in-gold)' : '#8a6a3a'}" stroke-width="5"/>
      <g fill="${gold ? 'url(#in-gold)' : '#8a6a3a'}"><rect x="${w * 0.2}" y="${h * 0.32}" width="${w * 0.6}" height="8" rx="4"/><rect x="${w * 0.28}" y="${h * 0.5}" width="${w * 0.44}" height="6" rx="3"/><rect x="${w * 0.24}" y="${h * 0.64}" width="${w * 0.52}" height="6" rx="3"/></g></g>`;
    s += plaque(160, 120, 220, 160, false) + plaque(160, 330, 220, 160, true) + plaque(1220, 120, 220, 160, true) + plaque(1220, 330, 220, 160, false);
    s += shield(800, 200, 90, '#7a1e1a') + banner(600, 60, 80, 240, '#1e3a6a') + banner(920, 60, 80, 240, '#1e3a6a');
    s += `<g stroke="#9aa0a8" stroke-width="12" stroke-linecap="round"><line x1="680" y1="120" x2="920" y2="320"/><line x1="920" y1="120" x2="680" y2="320"/></g>`;
    s += `<rect x="420" y="540" width="760" height="24" fill="#5a3a20"/><rect x="420" y="564" width="760" height="10" fill="#2a180c"/>`;
    for (let i = 0; i < 9; i++) s += candle(470 + i * 82, 540, rnd(26, 60));
    s += `<g transform="translate(800 500)"><path d="M-40 40 L 40 40 L 30 20 L -30 20 Z" fill="url(#in-gold)"/><path d="M-10 20 L 10 20 L 6 -10 L -6 -10 Z" fill="url(#in-gold)"/><path d="M-50 -70 L 50 -70 C 50 -20, 20 -10, 0 -10 C -20 -10, -50 -20, -50 -70 Z" fill="url(#in-gold)" class="in-glint"/></g>`;
    return { svg: s, motes: motes('dust', 24), tone: 'warm' };
  },
  gate() {
    // A war-room table seen from above: wood, candles, a dagger and rolled scrolls.
    let s = `<rect width="1600" height="900" fill="#3a2414"/>`;
    for (let i = 0; i < 12; i++) s += `<rect x="0" y="${i * 76}" width="1600" height="72" fill="${i % 2 ? '#5a3a22' : '#62402a'}"/><path d="M0 ${i * 76 + 30} C 400 ${i * 76 + 20}, 800 ${i * 76 + 46}, 1600 ${i * 76 + 28}" stroke="#3e2818" stroke-width="3" fill="none" opacity=".6"/>`;
    s += `<rect width="1600" height="900" fill="url(#in-floorShade)" opacity=".4"/>`;
    s += candle(110, 220, 70) + candle(170, 260, 44) + candle(1480, 230, 66) + candle(1420, 760, 50) + candle(130, 780, 58);
    s += `<g transform="translate(1440 520) rotate(-70)"><path d="M0 -160 L 12 -20 L -12 -20 Z" fill="#c8ccd4"/><rect x="-40" y="-22" width="80" height="12" rx="4" fill="url(#in-gold)"/><rect x="-7" y="-10" width="14" height="60" fill="#3a2414"/><circle cy="56" r="10" fill="url(#in-gold)"/></g>`;
    s += `<g transform="translate(160 520) rotate(20)"><rect x="-30" y="-110" width="60" height="220" rx="28" fill="#e2cf9e"/><ellipse cy="-110" rx="30" ry="12" fill="#c8ad74"/><rect x="-32" y="-10" width="64" height="12" fill="#7a1e1a"/></g>`;
    s += `<g transform="translate(240 600) rotate(-8)"><rect x="-26" y="-90" width="52" height="180" rx="24" fill="#d8c08a"/><ellipse cy="-90" rx="26" ry="10" fill="#b89a64"/></g>`;
    s += `<g transform="translate(1450 330)"><circle r="56" fill="#8a6a3a"/><circle r="46" fill="#e2cf9e"/><path d="M0 -40 L 8 0 L 0 40 L -8 0 Z" fill="#7a1e1a"/><path d="M-40 0 L 0 -6 L 40 0 L 0 6 Z" fill="#2a2a2a"/></g>`;
    return { svg: s, motes: motes('dust', 16), tone: 'warm' };
  },
};

// Each room is painted once into a JPEG: a live full-screen SVG with flickering
// flames under a camp screen made the browser repaint everything every frame.
const baked = {};
const baking = {};

function sceneSvg(kind) {
  const { svg } = SCENES[kind]();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" preserveAspectRatio="xMidYMid slice">${DEFS}${svg}<rect width="1600" height="900" fill="url(#in-vig)"/></svg>`;
}

function bake(kind) {
  if (baked[kind] || baking[kind] || !SCENES[kind]) return;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sceneSvg(kind))}`;
  baking[kind] = url;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 900;
      c.getContext('2d').drawImage(img, 0, 0);
      baked[kind] = c.toDataURL('image/jpeg', 0.85);
      const el = document.querySelector(`#camp-interior.k-${kind} img.in-scene`);
      if (el) el.src = baked[kind];
    } catch {
      baked[kind] = url;
    }
  };
  img.src = url;
}

/** Paint every room ahead of time (a little at a time) so they're ready to show. */
export function prepareInteriors() {
  Object.keys(SCENES).forEach((k, i) => setTimeout(() => bake(k), 300 + i * 250));
}

const TONE = { hall: 'warm', wardrobe: 'warm', armory: 'warm', merchant: 'warm', blacksmith: 'hot', shrine: 'warm', gate: 'warm' };

/** Full-screen interior markup for a camp building, or '' for none. */
export function interiorHtml(kind) {
  if (!SCENES[kind]) return '';
  bake(kind);
  const src = baked[kind] || baking[kind];
  const tone = TONE[kind] || 'warm';
  const motes = kind === 'blacksmith' ? motesHtml('spark', 22) + motesHtml('dust', 6) : motesHtml('dust', 14);
  return `<img class="in-scene" alt="" src="${src}"><div class="in-light ${tone}"></div><div class="in-motes ${tone}">${motes}</div>`;
}

const motesHtml = (kind, n) => motes(kind, n);
