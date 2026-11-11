// Builds artifact/index.html: the page body of public/index.html in the shape a claude.ai artifact expects
// (no doctype/html/head/body). The scripts, stylesheet and three.js are published next to it as files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(dir, 'public/index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).trim();
const page = `<title>Dusk Hollow</title>
<link rel="stylesheet" href="style.css">
<style>html, body { height: 100%; background: #120d1f; color: #f4efff; }</style>
${body}
`;
fs.writeFileSync(path.join(dir, 'artifact/index.html'), page);
console.log('wrote artifact/index.html', page.length, 'bytes');
