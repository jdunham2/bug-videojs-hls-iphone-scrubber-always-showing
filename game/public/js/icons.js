// Hand-drawn SVG iconography (24×24 grid, two-tone: stroke + soft fill) for skills, finishers and HUD actions.
const P = {
  sword: '<path d="M19 3l2 2-10.5 10.5-2-2z"/><path d="M6.5 13.5l4 4M5 19l3-3M3.5 20.5l1.5-1.5" class="s"/><path d="M8 15l-2.5 2.5 1 1L9 16z"/>',
  bolt: '<circle cx="15" cy="9" r="4.2"/><path d="M11.5 12.5L4 20M13 15l-5 5M9 11l-5 5" class="s"/>',
  bow: '<path d="M7 3c8 2 12 8 10 18" class="s w"/><path d="M7 3v18" class="s"/><path d="M5 12h14M17 10l2 2-2 2" class="s"/>',
  bash: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M12 7v10M8 11h8" class="s"/>',
  taunt: '<path d="M4 9h3l7-5v16l-7-5H4z"/><path d="M17 8c1.5 1 1.5 7 0 8M19.5 6c3 2 3 10 0 12" class="s"/>',
  block: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 15h16M10 5v5M14 10v5M10 15v4" class="s"/>',
  quake: '<path d="M2 20h20" class="s"/><path d="M12 4l2 6 5-2-3 5 4 3h-6l-2 4-2-4H4l4-3-3-5 5 2z"/>',
  blink: '<path d="M13 2L5 13h6l-2 9 9-12h-6z"/>',
  whirl: '<path d="M12 12c0-3 3-5 6-4M12 12c3 0 5 3 4 6M12 12c0 3-3 5-6 4M12 12c-3 0-5-3-4-6" class="s w"/><circle cx="12" cy="12" r="2.2"/>',
  flurry: '<path d="M4 20L14 6M8 20l10-14M12 20l8-11" class="s w"/><path d="M14 6l2-3M18 6l2-3" class="s"/>',
  execute: '<path d="M12 3c4.4 0 7 3 7 7 0 2.4-1 3.8-2 4.6V18H7v-3.4C6 13.8 5 12.4 5 10c0-4 2.6-7 7-7z"/><circle cx="9.5" cy="10.5" r="1.6" class="h"/><circle cx="14.5" cy="10.5" r="1.6" class="h"/><path d="M9 18v3M12 18v3M15 18v3" class="s"/>',
  firebolt: '<path d="M14 3c1 3 5 5 5 10a7 7 0 01-14 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 1-5 4-7z"/><path d="M12 14c1 1 2 2 2 3.5A2 2 0 0110 17.5c0-1.2 1-2 2-3.5z" class="h"/>',
  chain: '<path d="M3 6l5 4-3 3 6 3-2 5 8-8-5-2 3-4z"/>',
  spirit: '<path d="M12 3c4 0 6 3 6 7v9l-2-2-2 2-2-2-2 2-2-2-2 2v-9c0-4 2-7 6-7z"/><circle cx="10" cy="10" r="1.3" class="h"/><circle cx="14" cy="10" r="1.3" class="h"/>',
  meteor: '<circle cx="15" cy="15" r="5"/><path d="M11 11L3 3M13 9L7 3M9 13L3 7" class="s w"/>',
  volley: '<path d="M3 21L15 9M7 21L19 9M11 21L21 11" class="s"/><path d="M15 9l-1-4 4 1zM19 9l-1-4 4 1z"/>',
  trap: '<path d="M3 17h18" class="s"/><path d="M5 17l2-7 2 7 2-7 2 7 2-7 2 7 2-7 1 7"/>',
  hawk: '<path d="M2 10c4 0 7 1 10 4 3-3 6-4 10-4-2 3-5 5-8 5l-2 4-2-4c-3 0-6-2-8-5z"/>',
  rain: '<path d="M6 10a6 6 0 0112 0 4 4 0 010 8H6a4 4 0 010-8z"/><path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2" class="s"/>',
  dodge: '<path d="M12 4a8 8 0 108 8" class="s w"/><path d="M20 4v6h-6"/>',
  potion: '<path d="M9 3h6M10 3v5L5 17a3 3 0 003 4h8a3 3 0 003-4l-5-9V3" class="s"/><path d="M7 15h10l1.5 3A2 2 0 0116.7 21H7.3a2 2 0 01-1.8-3z"/>',
  slam: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M3 22h18M6 19l-2 3M18 19l2 3" class="s"/>',
  overload: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" class="s"/>',
  stormarrow: '<path d="M2 12h16" class="s w"/><path d="M18 8l4 4-4 4zM8 7l-3 5h4l-2 5" />',
};
/** inline SVG string for an icon key (falls back to a diamond) */
export function icon(key, color = 'currentColor') {
  const body = P[key] || '<path d="M12 3l8 9-8 9-8-9z"/>';
  return `<svg class="ico-svg" viewBox="0 0 24 24" style="--ic:${color}" aria-hidden="true">${body}</svg>`;
}
export const SKILL_ICON = { warden: ['sword', 'bash', 'taunt', 'block', 'quake', 'slam'], emberblade: ['sword', 'blink', 'whirl', 'flurry', 'execute', 'firebolt'], hexcaller: ['bolt', 'firebolt', 'chain', 'spirit', 'meteor', 'overload'], ranger: ['bow', 'volley', 'trap', 'hawk', 'rain', 'stormarrow'] };
