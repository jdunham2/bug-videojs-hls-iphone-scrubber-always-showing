#!/usr/bin/env node
// Meshy asset pipeline: text → 3D model → texture → (rig → animations) → optimized GLB.
//
//   npm run meshy -- --dry-run            show what would be created and the credit cost
//   npm run meshy -- --balance            show your Meshy credit balance
//   npm run meshy -- hero grunt           generate (or resume) specific assets
//   npm run meshy                         generate (or resume) everything in assets.json
//
// The API key comes from MESHY_API_KEY. In the Claude Code cloud environment the
// network proxy attaches the key for api.meshy.ai, so no variable is needed there.
//
// Task IDs are saved to state.json as soon as a task is created, so re-running the
// script resumes polling instead of creating (and paying for) a task twice.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RAW_DIR = path.join(HERE, 'raw'); // untouched downloads (gitignored)
const OUT_DIR = path.join(ROOT, 'public/models'); // optimized files the game loads
const STATE_FILE = path.join(HERE, 'state.json');
const MANIFEST_FILE = path.join(OUT_DIR, 'manifest.json');
const API = 'https://api.meshy.ai/openapi';
const LIBRARY_URL = 'https://api.meshy.ai/web/public/animations/resources';

const COST = { preview: 5, refine: 10, rig: 5, perAction: 3, retexture: 10 };

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const only = args.filter((a) => !a.startsWith('--'));

const config = JSON.parse(fs.readFileSync(path.join(HERE, 'assets.json'), 'utf8'));
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

// Key lookup: MESHY_API_KEY, else tools/meshy/.env (gitignored), else a placeholder
// that the cloud environment's proxy replaces when a network secret is configured.
function readEnvFile() {
  const file = path.join(HERE, '.env');
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(/^MESHY_API_KEY=(.+)$/m);
  return m ? m[1].trim() : null;
}
const KEY = process.env.MESHY_API_KEY || readEnvFile() || 'msy_placeholder_replaced_by_proxy';
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const log = (id, msg) => console.log(`[${id}] ${msg}`);

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const err = new Error(`${method} ${route} → ${res.status}: ${json?.message || text.slice(0, 300)}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 5;
    throw err;
  }
  return { json, retryAfter: Number(res.headers.get('retry-after')) || 5 };
}

/** Create a task once. A create that fails with 5xx/network may still have gone through, so we stop rather than resend. */
async function createTask(route, body) {
  try {
    const { json } = await api('POST', route, body);
    return json.result;
  } catch (e) {
    if (e.status === 401) throw new Error('Meshy rejected the API key (401). Set MESHY_API_KEY, or add the key to the cloud environment.');
    if (e.status && e.status < 500) throw e;
    throw new Error(
      `${e.message}\nThe task may have been created anyway. Check your Meshy dashboard before re-running; this script did not resend it.`,
    );
  }
}

async function waitFor(id, route, taskId) {
  let last = '';
  for (;;) {
    let task;
    let wait = 5;
    try {
      const { json, retryAfter } = await api('GET', `${route}/${taskId}`);
      task = json;
      wait = retryAfter;
    } catch (e) {
      if (e.status === 429 || !e.status || e.status >= 500) {
        await sleep(e.retryAfter || 5);
        continue;
      }
      throw e;
    }
    const line = `${task.status} ${task.progress ?? 0}%`;
    if (line !== last) log(id, `${route.split('/').pop()} ${line}`);
    last = line;
    if (task.status === 'SUCCEEDED') return task;
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      const err = new Error(`${route} task ${taskId} ${task.status}: ${task.task_error?.message || 'no message'}`);
      err.failed = true;
      throw err;
    }
    await sleep(Math.max(3, wait));
  }
}

/** Run one pipeline step, resuming a saved task if there is one. Only a FAILED task is recreated. */
async function step(asset, name, route, body) {
  const s = (state[asset.id] ||= {});
  if (s[name]?.status === 'SUCCEEDED' && s[name].task) return s[name].task;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!s[name]?.taskId) {
      const taskId = await createTask(route, body());
      s[name] = { taskId, createdAt: Date.now() };
      saveState();
      log(asset.id, `${name}: created task ${taskId}`);
    } else {
      log(asset.id, `${name}: resuming task ${s[name].taskId}`);
    }
    try {
      const task = await waitFor(asset.id, route, s[name].taskId);
      s[name] = { taskId: s[name].taskId, status: 'SUCCEEDED', task };
      saveState();
      return task;
    } catch (e) {
      if (!e.failed || attempt === 1) throw e;
      log(asset.id, `${name}: ${e.message}. Retrying once (failed tasks are refunded).`);
      delete s[name];
      saveState();
    }
  }
}

async function download(url, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${file}. Meshy keeps files for 3 days; re-run the step if they expired.`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function optimize(input, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(
    'npx',
    ['gltf-transform', 'optimize', input, output, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'],
    { stdio: 'inherit', cwd: ROOT },
  );
}

function previewBody(asset) {
  return () => ({
    mode: 'preview',
    prompt: `${asset.prompt}, ${config.style}`.slice(0, 800),
    model_type: 'smart-topology',
    ai_model: 'meshy-t2.5',
    target_polycount: asset.polycount,
    pose_mode: asset.kind === 'character' ? 'a-pose' : '',
    target_formats: ['glb'],
    origin_at: 'bottom',
  });
}

function refineBody(asset) {
  return () => ({
    mode: 'refine',
    preview_task_id: state[asset.id].preview.taskId,
    texture_prompt: `${asset.texturePrompt}, ${config.textureStyle}`.slice(0, 800),
    target_formats: ['glb'],
  });
}

async function animationNames() {
  const res = await fetch(LIBRARY_URL);
  const data = await res.json();
  const list = data.result?.list || data.list || data.result || data;
  if (!Array.isArray(list)) throw new Error('Unexpected animation library format');
  return new Map(list.map((a) => [a.id, a.name]));
}

/** Outfit: a new texture painted onto an existing character's UV layout (keeps its rig and animations). */
async function generateOutfit(asset, manifest) {
  const baseRefine = state[asset.base]?.refine?.taskId;
  if (!baseRefine) throw new Error(`Generate "${asset.base}" before its outfit "${asset.id}"`);
  const task = await step(asset, 'retexture', '/v1/retexture', () => ({
    input_task_id: baseRefine,
    text_style_prompt: `${asset.texturePrompt}, ${config.textureStyle}`.slice(0, 600),
    enable_original_uv: true,
    target_formats: ['glb'],
  }));
  const url = task.texture_urls?.[0]?.base_color;
  if (!url) throw new Error('Retexture returned no base color texture');
  const raw = await download(url, path.join(RAW_DIR, `${asset.id}.png`));
  const out = path.join(OUT_DIR, 'outfits', `${asset.id}.webp`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', 'scale=1024:1024', '-quality', '85', out]);
  manifest[asset.id] = { kind: 'outfit', base: asset.base, name: asset.name, texture: `models/outfits/${asset.id}.webp` };
}

async function generate(asset, manifest, library) {
  if (asset.kind === 'outfit') return generateOutfit(asset, manifest);
  await step(asset, 'preview', '/v2/text-to-3d', previewBody(asset));
  const refined = await step(asset, 'refine', '/v2/text-to-3d', refineBody(asset));

  if (asset.kind === 'prop') {
    const raw = await download(refined.model_urls.glb, path.join(RAW_DIR, `${asset.id}.glb`));
    optimize(raw, path.join(OUT_DIR, `${asset.id}.glb`));
    manifest[asset.id] = { kind: 'prop', file: `models/${asset.id}.glb` };
    return;
  }

  const rig = await step(asset, 'rig', '/v1/rigging', () => ({
    input_task_id: state[asset.id].refine.taskId,
    height_meters: asset.heightMeters,
  }));
  const names = Object.keys(asset.animations);
  const ids = Object.values(asset.animations);
  const anim = await step(asset, 'animate', '/v1/animations', () => ({
    rig_task_id: state[asset.id].rig.taskId,
    action_ids: ids,
  }));

  // Keep the plain rigged model as a backup; the game loads the animation file,
  // which holds the skinned mesh plus one clip per action, in action_ids order.
  if (rig.result?.rigged_character_glb_url) {
    await download(rig.result.rigged_character_glb_url, path.join(RAW_DIR, `${asset.id}-rigged.glb`));
  }
  const raw = await download(anim.result.animation_glb_url, path.join(RAW_DIR, `${asset.id}.glb`));
  optimize(raw, path.join(OUT_DIR, `${asset.id}.glb`));

  const clips = {};
  names.forEach((n, i) => (clips[n] = { index: i, name: library.get(ids[i]) || null, actionId: ids[i] }));
  manifest[asset.id] = { kind: 'character', file: `models/${asset.id}.glb`, heightMeters: asset.heightMeters, clips };
}

function plan(assets) {
  let total = 0;
  for (const a of assets) {
    const actions = a.kind === 'character' ? Object.keys(a.animations).length : 0;
    const cost =
      a.kind === 'outfit' ? COST.retexture : COST.preview + COST.refine + (a.kind === 'character' ? COST.rig + actions * COST.perAction : 0);
    total += cost;
    const done = Object.entries(state[a.id] || {})
      .filter(([, v]) => v.status === 'SUCCEEDED')
      .map(([k]) => k);
    console.log(`${a.id.padEnd(8)} ${a.kind.padEnd(10)} ~${cost} credits${actions ? ` (${actions} animations)` : ''}${done.length ? `  done: ${done.join(', ')}` : ''}`);
    if (flags.has('--verbose')) console.log(JSON.stringify(previewBody(a)(), null, 2));
  }
  console.log(`Total if nothing is done yet: ~${total} credits`);
}

async function main() {
  const assets = config.assets.filter((a) => !only.length || only.includes(a.id));
  if (!assets.length) throw new Error(`No assets match: ${only.join(', ')}`);

  if (flags.has('--balance')) {
    const { json } = await api('GET', '/v1/balance');
    console.log('Meshy balance:', json);
    return;
  }
  plan(assets);
  if (flags.has('--dry-run')) return;

  const manifest = fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) : {};
  const library = await animationNames();
  // Assets are independent, so run them side by side (Meshy allows several concurrent tasks).
  const results = await Promise.allSettled(assets.map((a) => generate(a, manifest, library)));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed++;
      console.error(`[${assets[i].id}] FAILED: ${r.reason.message}`);
    } else {
      const m = manifest[assets[i].id];
      console.log(`[${assets[i].id}] done → public/${m.file || m.texture}`);
    }
  });
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
