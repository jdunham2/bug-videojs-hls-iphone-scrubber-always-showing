// Localisation scaffolding: string tables keyed by the English source text. translateDOM() swaps matching text
// nodes (remembering the original so languages can switch back), t() translates dynamic strings.
export const LANGS = { en: 'English', es: 'Español' };
const ES = {
  // lobby
  'Enter Emberhold': 'Entrar en Emberhold', 'Choose your hero': 'Elige tu héroe', 'Party code': 'Código de grupo', 'List my new party publicly': 'Hacer pública mi nueva partida', 'Public parties': 'Partidas públicas', 'Servers': 'Servidores', 'Join': 'Unirse', 'Play': 'Jugar',
  // HUD + prompts
  'Click to look around': 'Haz clic para mirar', 'Copy invite link': 'Copiar invitación', 'Settings': 'Ajustes', 'Depth': 'Profundidad',
  // panels
  'Inventory': 'Inventario', 'Talents': 'Talentos', 'Quest Log': 'Diario de misiones', 'Social': 'Social', 'Mystic Forge': 'Forja mística', 'The Blacksmith': 'El herrero', 'Ember Rifts': 'Fallas de Ascua', 'Hall of Embers': 'Salón de las Ascuas', 'Wardrobe': 'Vestuario', 'War Table': 'Mesa de guerra', 'Waypoint': 'Portal de viaje', 'Stash': 'Alijo', 'The Hollow Merchant': 'El mercader hueco',
  'Friends': 'Amigos', 'Guild': 'Gremio', 'Bounties': 'Contratos', 'Season': 'Temporada', 'Legendary recipes': 'Recetas legendarias', 'Enchant': 'Encantar', 'Transmute sets': 'Transmutar conjuntos',
  'Open the rift': 'Abrir la falla', 'Enter the Trial': 'Entrar en la prueba', '▶ Watch the top run': '▶ Ver la mejor partida', 'Difficulty': 'Dificultad', 'Weekly Rift Trial': 'Prueba semanal de falla',
  'Continue ▸': 'Continuar ▸', 'Claim': 'Reclamar', 'Claimed': 'Reclamado', 'Forge': 'Forjar', 'Transmute': 'Transmutar', 'Whisper': 'Susurrar', 'Add friend': 'Añadir amigo', 'Copy': 'Copiar', 'Found': 'Fundar', 'Invite': 'Invitar', 'Leave guild': 'Abandonar gremio',
  // settings
  'Graphics': 'Gráficos', 'Audio': 'Sonido', 'Controls': 'Controles', 'Accessibility': 'Accesibilidad', 'Graphics quality': 'Calidad gráfica', 'Master volume': 'Volumen general', 'Music': 'Música', 'Sound effects': 'Efectos de sonido', 'Mouse sensitivity': 'Sensibilidad del ratón', 'Invert Y axis': 'Invertir eje Y', 'Key bindings': 'Teclas', 'Reset': 'Restablecer', 'Controller rumble': 'Vibración del mando', 'Language': 'Idioma',
  'Reduce motion': 'Reducir movimiento', 'High contrast': 'Alto contraste', 'Subtitle size': 'Tamaño de subtítulos', 'Sound captions': 'Subtítulos de sonidos', 'Gamepad buttons': 'Botones del mando', 'Normal': 'Normal', 'Large': 'Grande', 'Extra large': 'Muy grande',
  // dynamic text
  'QUEST COMPLETE': 'MISIÓN COMPLETADA', 'DUNGEON CLEARED': 'MAZMORRA DESPEJADA', 'NIGHTFALL': 'ANOCHECER', 'DAWN BREAKS': 'AMANECE', 'Purchased!': '¡Comprado!', 'Not enough gold.': 'No tienes suficiente oro.',
  '[A monster roars]': '[Un monstruo ruge]', '[War horn]': '[Cuerno de guerra]', '[Bell tolls]': '[Repica una campana]', '[The ground shakes]': '[La tierra tiembla]', '[Explosion]': '[Explosión]', '[Portal hums]': '[Zumba un portal]', '[Ominous music swells]': '[Crece una música ominosa]', '[Goblin cackles]': '[Un goblin se ríe]', '[Stone grinds]': '[Cruje la piedra]', '[Lightning crackles]': '[Crepitan los rayos]',
};
const TABLES = { es: ES };
let lang = 'en';
export const setLang = (l) => { lang = LANGS[l] ? l : 'en'; document.documentElement.lang = lang; };
export const getLang = () => lang;
export const t = (s) => (lang !== 'en' && TABLES[lang]?.[s]) || s;
/** translate every text node under root whose trimmed text is a known source string */
export function translateDOM(root = document.body) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const src = n.__i18n ?? n.nodeValue.trim(); if (!src) continue;
    if (n.__i18n === undefined) { if (!(src in ES)) continue; n.__i18n = src; }
    const out = t(src); n.nodeValue = n.nodeValue.replace(n.nodeValue.trim() || src, out);
  }
  for (const el of root.querySelectorAll('[placeholder]')) { el.dataset.ph ??= el.placeholder; el.placeholder = t(el.dataset.ph); }
}
