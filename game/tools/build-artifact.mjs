// Builds a static, offline (solo) version of Emberfall for hosting as a claude.ai Artifact or any static host.
// Output: dist-artifact/ — the game server simulation runs inside the page; progress is saved in localStorage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-artifact');
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.170.0';
fs.rmSync(out, { recursive: true, force: true });
const copyDir = (src, dst, map = (s) => s) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const a = path.join(src, f), b = path.join(dst, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b, map);
    else fs.writeFileSync(b, map(fs.readFileSync(a, 'utf8'), f));
  }
};
copyDir(path.join(root, 'public/js'), path.join(out, 'js'));
copyDir(path.join(root, 'public/shared'), path.join(out, 'shared'));
fs.copyFileSync(path.join(root, 'public/style.css'), path.join(out, 'style.css'));
fs.mkdirSync(path.join(out, 'server'));
for (const f of ['game.js', 'zone.js', 'defense.js', 'profile.js']) {
  fs.writeFileSync(path.join(out, 'server', f), fs.readFileSync(path.join(root, 'server', f), 'utf8').replaceAll("'../public/shared/", "'../shared/"));
}
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
html = html.replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/g, '').replace(/<\/?head>\s*/g, '').replace(/<\/?body>\s*/g, '')
  .replace(/<meta charset="utf-8" \/>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '<meta name="claude:viewport-fit-sides" content="cover" />\n  ')
  .replace('href="/style.css"', 'href="style.css"')
  .replace('"three": "/lib/three/build/three.module.js", "three/addons/": "/lib/three/examples/jsm/"', `"three": "${THREE}/build/three.module.js", "three/addons/": "${THREE}/examples/jsm/"`)
  .replace('<script type="module" src="/js/main.js"></script>', '<script>window.EMBERFALL_OFFLINE = true;</script>\n  <script type="module" src="js/main.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f !== 'index.html' || d !== out) files.push(path.relative(out, p)); } };
walk(out);
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(files, null, 1));
console.log(`Built ${files.length + 1} files into dist-artifact/`);
