// Performance budget (CI): boots the server, loads the game in headless Chromium and fails if the page ships too
// much JavaScript or takes too long to reach the lobby / the first in-game frame. Run: node tools/perf-budget.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BUDGET = { ownJsKB: 1400, totalJsKB: 3200, lobbyMs: 10000, inGameMs: 20000, longTasks: 80 }; // times are for software (SwiftShader) rendering on CI
const PORT = 3055, url = `http://localhost:${PORT}/`;
const srv = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), EMBERFALL_DB: path.join(root, 'data', 'perf-db.json') }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(url + 'healthz')).ok) break; } catch { /* booting */ } await wait(150); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let ownJs = 0, totalJs = 0;
page.on('response', async (r) => { if (!r.url().endsWith('.js')) return; try { const n = (await r.body()).length; totalJs += n; if (!r.url().includes('/lib/three/')) ownJs += n; } catch { /* redirect */ } });
await page.addInitScript(() => { try { localStorage.setItem('emberfall_settings_v2', JSON.stringify({ intro: false, quality: 'low' })); } catch (e) { /* storage */ } window.__long = 0; new PerformanceObserver((l) => (window.__long += l.getEntries().length)).observe({ type: 'longtask', buffered: true }); });
const t0 = Date.now();
await page.goto(url); await page.waitForSelector('#playBtn', { state: 'visible' });
const lobbyMs = Date.now() - t0;
await page.click('#playBtn');
await page.waitForFunction(() => window.__emberfall?.G?.inGame && window.__emberfall.G.zone, null, { timeout: 30000 });
const inGameMs = Date.now() - t0;
await wait(1500);
const longTasks = await page.evaluate(() => window.__long);
await browser.close(); srv.kill();
const res = { ownJsKB: Math.round(ownJs / 1024), totalJsKB: Math.round(totalJs / 1024), lobbyMs, inGameMs, longTasks };
const over = Object.entries(BUDGET).filter(([k, v]) => res[k] > v);
console.table(Object.entries(BUDGET).map(([k, v]) => ({ metric: k, value: res[k], budget: v, ok: res[k] <= v ? '✓' : '✗' })));
if (over.length) { console.error('Performance budget exceeded:', over.map(([k]) => k).join(', ')); process.exit(1); }
