// Loads the Meshy-generated models listed in public/models/manifest.json and
// gives each character an animation controller. If the manifest or a file is
// missing, the game keeps its built-in placeholder shapes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** id → { kind, scene, clips: { logicalName: AnimationClip }, height } */
export const models = {};

export async function loadModels() {
  let manifest;
  try {
    const res = await fetch('models/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return models;
    manifest = await res.json();
  } catch {
    return models;
  }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(
    Object.entries(manifest).map(async ([id, entry]) => {
      try {
        const gltf = await loader.loadAsync(entry.file);
        const clips = {};
        for (const [logical, ref] of Object.entries(entry.clips || {})) {
          // Match by the library name first; fall back to position in the file.
          clips[logical] = gltf.animations.find((c) => c.name === ref.name) || gltf.animations[ref.index] || null;
        }
        models[id] = { kind: entry.kind, scene: gltf.scene, clips };
      } catch (e) {
        console.warn(`Model "${id}" failed to load; using the placeholder.`, e);
      }
    }),
  );
  return models;
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
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 0 ? height / size.y : 1;
  const holder = new THREE.Group();
  root.scale.setScalar(scale);
  root.position.y = -box.min.y * scale;
  holder.add(root);
  return { holder, root, materials, animator: src.clips ? new Animator(root, src.clips) : null };
}

/** Attach a prop model (bow, club) to a bone, sized to `length` meters along its longest side. */
export function attachProp(id, bone, length) {
  const src = models[id];
  if (!src || !bone) return null;
  const prop = src.scene.clone(true);
  prop.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const box = new THREE.Box3().setFromObject(prop);
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
