// Loads the Meshy-generated models listed in public/models/manifest.json and
// gives each character an animation controller. If the manifest or a file is
// missing, the game keeps its built-in placeholder shapes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** id → { kind, scene, clips: { logicalName: AnimationClip }, height } */
export const models = {};

/** id → { base, name, texture } for character outfits (retextures on the same UVs). */
export const outfits = {};

/** Loading progress, shown on the title screen so problems are visible. */
export const modelStatus = { state: 'loading', loaded: 0, total: 0, errors: [] };

/**
 * Models come from one of two places:
 * - window.__EMBEDDED_MODELS = { manifest, files: { path: base64 GLB } }, baked into the page
 *   for sandboxed hosts (like the claude.ai preview) that block fetching data:/blob: URLs.
 * - otherwise public/models/manifest.json and the GLB files next to it.
 */
export async function loadModels() {
  const embedded = window.__EMBEDDED_MODELS;
  let manifest;
  try {
    if (embedded) {
      manifest = embedded.manifest;
    } else {
      const res = await fetch('models/manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      manifest = await res.json();
    }
  } catch (e) {
    modelStatus.state = 'none';
    modelStatus.errors.push(String(e.message || e));
    return models;
  }
  // Outfits are textures for an existing character, not models; keep them for the wardrobe.
  const entries = Object.entries(manifest).filter(([id, e]) => {
    if (e.kind === 'outfit') {
      outfits[id] = { ...e, id };
      return false;
    }
    return true;
  });
  modelStatus.total = entries.length;
  if (!entries.length) {
    modelStatus.state = 'none';
    return models;
  }
  const loader = new GLTFLoader();
  if (!embedded) loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(
    entries.map(async ([id, entry]) => {
      try {
        const gltf = embedded ? await parseEmbedded(loader, await embeddedFile(embedded, entry.file)) : await loader.loadAsync(entry.file);
        gltf.animations.forEach(stripRootMotion);
        const clips = {};
        for (const [logical, ref] of Object.entries(entry.clips || {})) {
          // Match by the library name first; fall back to position in the file.
          clips[logical] = gltf.animations.find((c) => c.name === ref.name) || gltf.animations[ref.index] || null;
        }
        models[id] = { kind: entry.kind, scene: gltf.scene, clips };
        modelStatus.loaded++;
      } catch (e) {
        modelStatus.errors.push(`${id}: ${e?.message || e}`);
        console.warn(`Model "${id}" failed to load; using the placeholder.`, e);
      }
    }),
  );
  modelStatus.state = modelStatus.loaded === modelStatus.total ? 'ready' : modelStatus.loaded ? 'partial' : 'failed';
  return models;
}

/**
 * Base64 for a bundled file: inline in the page, or (for big bundles) in a JSON
 * file published next to the page ({ b64 }) that we fetch by relative URL.
 */
export async function embeddedFile(embedded, path) {
  if (embedded.files?.[path]) return embedded.files[path];
  const url = embedded.remote?.[path];
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()).b64;
}

/** Parse a base64 GLB without any network request. */
function parseEmbedded(loader, b64) {
  if (!b64) return Promise.reject(new Error('missing embedded file'));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Promise((resolve, reject) => {
    // GLTFLoader loads embedded textures with fetch(blob:) via ImageBitmapLoader when
    // createImageBitmap exists. Sandboxed pages may block that, so hide it while the
    // parser is created; it then uses <img> with a blob URL, which those pages allow.
    const cib = window.createImageBitmap;
    try {
      window.createImageBitmap = undefined;
      loader.parse(bytes.buffer, '', resolve, reject);
    } finally {
      window.createImageBitmap = cib;
    }
  });
}

/**
 * Keep animations in place: the game moves characters itself, so drop the hips'
 * horizontal travel (a roll or leap would otherwise slide the body off its spot).
 * Vertical motion stays, so jumps and crouches still read.
 */
function stripRootMotion(clip) {
  const track = clip.tracks.find((t) => /(^|\W)hips\.position$/i.test(t.name));
  if (!track) return;
  const v = track.values;
  const x0 = v[0];
  const z0 = v[2];
  for (let i = 0; i < v.length; i += 3) {
    v[i] = x0;
    v[i + 2] = z0;
  }
}

const textureCache = {};

/**
 * Load a texture by path (or from the embedded bundle in sandboxed previews),
 * set up for glTF UVs. Calls back with the same cached texture on repeat calls.
 */
export function loadTexture(path, cb) {
  if (textureCache[path]?.tex) return cb(textureCache[path].tex);
  if (textureCache[path]) return textureCache[path].waiting.push(cb);
  textureCache[path] = { waiting: [cb] };
  const done = (tex) => {
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache[path].tex = tex;
    for (const fn of textureCache[path].waiting) fn(tex);
  };
  const embedded = window.__EMBEDDED_MODELS;
  if (!embedded) return new THREE.TextureLoader().load(path, done);
  embeddedFile(embedded, path).then((b64) => {
    if (b64) new THREE.TextureLoader().load(`data:image/webp;base64,${b64}`, done);
  });
}

/** Find a bone whose name matches all the given patterns (e.g. [/hand/i, /left|_l\b/i]). */
export function findBone(root, patterns) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isBone && patterns.every((p) => p.test(o.name))) found = o;
  });
  return found;
}

/**
 * Clone a loaded model for one character: scaled to `height` meters, feet at y=0,
 * casting shadows, with its own materials (so tints and hit flashes stay per-instance).
 */
export function instantiate(id, height) {
  const src = models[id];
  if (!src) return null;
  const root = SkeletonUtils.clone(src.scene);
  const materials = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false; // skinned bounds don't follow animation
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) {
      if (m.emissive) materials.push(m);
    }
  });
  // Bones must be posed before measuring, or a skinned mesh measures as near-zero.
  root.updateMatrixWorld(true);
  root.traverse((o) => o.isSkinnedMesh && o.skeleton.update());
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 0.01 ? height / size.y : 1;
  const holder = new THREE.Group();
  root.scale.setScalar(scale);
  root.position.y = -box.min.y * scale;
  holder.add(root);
  return { holder, root, materials, animator: src.clips ? new Animator(root, src.clips) : null };
}

/**
 * Place a copy of a static prop: scaled so its height (or `axis` extent) is `size`,
 * standing on y=0 and centered on its footprint. Returns null if not loaded.
 */
export function spawnProp(id, size, { axis = 'y', shadows = true } = {}) {
  const src = models[id];
  if (!src) return null;
  const obj = src.scene.clone(true);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const dims = box.getSize(new THREE.Vector3());
  // axis 'h': size is the longest horizontal side (for flat things like a dock or a boat).
  const s = size / ((axis === 'h' ? Math.max(dims.x, dims.z) : dims[axis]) || 1);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  obj.scale.setScalar(s);
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = shadows;
      o.receiveShadow = true;
    }
  });
  const holder = new THREE.Group();
  holder.add(obj);
  holder.userData.size = dims.clone().multiplyScalar(s);
  return holder;
}

/** Attach a prop model (bow, club) to a bone, sized to `length` meters along its longest side. */
export function attachProp(id, bone, length) {
  const src = models[id];
  if (!src || !bone) return null;
  const prop = src.scene.clone(true);
  prop.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  prop.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(prop, true);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  // Bones inherit the character's scale, so undo it to keep the prop at world size.
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  const holder = new THREE.Group();
  holder.scale.setScalar(length / longest / (ws.x || 1));
  prop.position.sub(box.getCenter(new THREE.Vector3())); // center on the grip
  holder.add(prop);
  bone.add(holder);
  // Local axes sorted by extent: [longest, middle, shortest] (0=x, 1=y, 2=z).
  const ext = [size.x, size.y, size.z];
  holder.userData.axes = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
  return holder;
}

/**
 * Small animation state helper around AnimationMixer.
 * - play(name): crossfade to a looping or one-shot clip.
 * - scrub(name, t): hold a clip at a time we control (used to sync the bow draw with charge).
 * - Upper/lower variants (name + ':upper' / ':lower') let the legs run while the arms aim.
 */
export class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {};
    this.actions = {};
    this.current = new Set();
    const upper = upperBodyBones(root);
    for (const [name, clip] of Object.entries(clips)) {
      if (!clip) continue;
      this.clips[name] = clip;
      if (upper.size) {
        this.clips[`${name}:upper`] = filterClip(clip, (bone) => upper.has(bone), `${name}:upper`);
        this.clips[`${name}:lower`] = filterClip(clip, (bone) => !upper.has(bone), `${name}:lower`);
      }
    }
  }

  has(name) {
    return !!this.clips[name];
  }

  duration(name) {
    return this.clips[name]?.duration || 0;
  }

  action(name) {
    if (!this.clips[name]) return null;
    return (this.actions[name] ||= this.mixer.clipAction(this.clips[name]));
  }

  /**
   * Make exactly `names` the active set, fading everything else out.
   * opts: { fade, once, timeScale, restart }
   */
  set(names, opts = {}) {
    const { fade = 0.18, once = false, timeScale = 1, restart = false } = opts;
    const want = new Set(names.filter((n) => this.clips[n]));
    for (const n of this.current) {
      if (!want.has(n)) this.actions[n]?.fadeOut(fade);
    }
    for (const n of want) {
      const a = this.action(n);
      a.timeScale = timeScale;
      if (!this.current.has(n) || restart) {
        a.reset();
        a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        a.clampWhenFinished = once;
        a.fadeIn(fade).play();
      }
    }
    this.current = want;
  }

  /** Pin a clip at `time` seconds (timeScale 0) so game code drives it. */
  scrub(name, time) {
    const a = this.actions[name];
    if (!a) return;
    a.time = Math.min(time, this.duration(name) - 1e-3);
  }

  isFinished(name) {
    const a = this.actions[name];
    return !a || (a.loop === THREE.LoopOnce && a.time >= this.duration(name) - 1e-3);
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

/** Bones from the first spine bone upward (spine, arms, head). Legs and hips stay out. */
function upperBodyBones(root) {
  const set = new Set();
  let spine = null;
  root.traverse((o) => {
    if (!spine && o.isBone && /spine/i.test(o.name)) spine = o;
  });
  spine?.traverse((o) => {
    if (o.isBone) set.add(o.name);
  });
  return set;
}

function filterClip(clip, keepBone, name) {
  const tracks = clip.tracks.filter((t) => keepBone(t.name.split('.')[0]));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

// ------------------------------------------------------------ freeing GPU memory

const TEX_KEYS = ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap'];
let shared = null;
let sharedCount = -1;

/** Everything owned by the loaded models (clones share these, so they must never be freed). */
function sharedResources() {
  const n = Object.keys(models).length;
  if (shared && n === sharedCount) return shared;
  shared = new Set();
  sharedCount = n;
  for (const m of Object.values(models)) {
    m.scene.traverse((o) => {
      if (o.geometry) shared.add(o.geometry);
      for (const mat of [].concat(o.material || [])) {
        shared.add(mat);
        for (const k of TEX_KEYS) if (mat[k]) shared.add(mat[k]);
      }
    });
  }
  return shared;
}

/**
 * Free the GPU memory of everything under `root` that was made for it (canvas
 * textures, materials, geometry), leaving anything shared with the loaded models.
 * Call when tearing a scene part down for good (arena rebuilds, hazards).
 */
export function disposeTree(root, keep = null) {
  const sh = sharedResources();
  const skip = (x) => sh.has(x) || keep?.has(x);
  const done = new Set();
  root.traverse((o) => {
    if (o.geometry && !skip(o.geometry) && !done.has(o.geometry)) {
      done.add(o.geometry);
      o.geometry.dispose();
    }
    if (o.isInstancedMesh) o.dispose?.();
    for (const mat of [].concat(o.material || [])) {
      if (skip(mat) || done.has(mat)) continue;
      done.add(mat);
      for (const k of TEX_KEYS) {
        const t = mat[k];
        if (t && !skip(t) && !done.has(t)) {
          done.add(t);
          t.dispose();
        }
      }
      mat.dispose();
    }
  });
}

/** Free a character instance: its skeletons' bone textures and its own materials. */
export function disposeInstance(inst) {
  if (!inst) return;
  inst.root.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.dispose();
  });
  for (const m of inst.materials) m.dispose();
}
