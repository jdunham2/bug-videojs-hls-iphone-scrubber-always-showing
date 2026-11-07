// A little 3D display stand for the camp screens: the hero, outfit or bow you're
// looking at, turning slowly on a pedestal under warm light. It draws with the
// game's own renderer into an offscreen target and copies the picture into a
// <canvas> in the panel, so no second 3D context is needed.

import * as THREE from 'three';
import { models, outfits, instantiate, loadTexture, disposeInstance, disposeTree } from './models.js';
import { config } from './config.js';
import { makeBowParts } from './bow.js';
import { BOWS } from './gear.js';

const W = 300;
const H = 380;

export class Preview {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.pixels = new Uint8Array(W * H * 4);
    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    // Lighting: warm key, cool rim, soft fill.
    const key = new THREE.DirectionalLight(0xffe2b8, 2.4);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(0x8fb6ff, 2.2);
    rim.position.set(-3, 3, -3);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xc8d4ff, 0x3a2a1c, 0.9));
    // Pedestal with a glowing rim.
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.85 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.18, 40), stone);
    ped.position.y = -0.09;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.02, 8, 64).rotateX(Math.PI / 2), this.ringMat);
    ring.position.y = 0.005;
    this.scene.add(ped, ring);
    this.key = null;
    this.t = 0;
    this.acc = 0;
  }

  /** Point at a canvas element and pick what to show. `what` = { kind:'character', id, outfit } | { kind:'bow', item } */
  show(canvas, what, accent = '#ffc860') {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d');
    if (canvas) {
      canvas.width = W;
      canvas.height = H;
    }
    this.ringMat.color.set(accent);
    const key = JSON.stringify(what);
    if (key === this.key) return;
    this.key = key;
    this.clearSubject();
    if (what.kind === 'character') this.showCharacter(what.id, what.outfit);
    else if (what.kind === 'bow') this.showBow(what.item);
    this.acc = 1; // draw straight away
  }

  clearSubject() {
    if (this.inst) {
      this.inst.animator?.mixer.stopAllAction();
      disposeInstance(this.inst);
      this.inst = null;
    }
    if (this.subject) {
      this.subject.removeFromParent();
      if (this.disposeSubject) disposeTree(this.subject);
    }
    this.subject = null;
    this.anim = null;
  }

  showCharacter(id, outfitId) {
    if (!models[id]) return;
    const h = id === 'dwarf' ? config.models.heroHeight * 0.82 : config.models.heroHeight;
    const inst = instantiate(id, h);
    this.inst = inst;
    this.subject = inst.holder;
    this.disposeSubject = false;
    this.turn.add(inst.holder);
    this.anim = inst.animator;
    if (this.anim?.has('idle')) this.anim.set(['idle'], { fade: 0 });
    const o = outfits[outfitId];
    if (o && o.base === id) {
      loadTexture(o.texture, (tex) => {
        if (this.inst !== inst) return;
        for (const m of inst.materials) {
          m.map = tex;
          m.color.set(0xffffff);
          m.needsUpdate = true;
        }
      });
    }
    this.frame(h * 0.5, h * 1.8);
  }

  showBow(item) {
    const base = BOWS[item.base] || BOWS.longbow;
    const parts = makeBowParts(base.color);
    const g = new THREE.Group();
    g.add(parts.limbs, parts.grip);
    const tip = parts.tip;
    const string = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, tip.y, tip.z), new THREE.Vector3(0, -tip.y, tip.z)]),
      new THREE.LineBasicMaterial({ color: 0xf3ead2 }),
    );
    g.add(string);
    if (item.rarity !== 'common') {
      parts.grip.material = parts.grip.material.clone();
      parts.grip.material.color.set(item.rarity === 'unique' ? 0xd8a23a : 0x2c5a8a);
      parts.grip.material.metalness = item.rarity === 'unique' ? 0.7 : 0;
    }
    g.scale.setScalar(1.5 * base.scale);
    g.position.y = 0.95;
    g.rotation.z = 0.12;
    this.subject = g;
    this.disposeSubject = true;
    this.turn.add(g);
    this.frame(0.95, 3.2);
  }

  /** Aim the camera at height y from distance d. */
  frame(y, d) {
    this.camera.position.set(0, y + d * 0.12, d);
    this.camera.lookAt(0, y, 0);
  }

  /** Spin, animate, and redraw the panel canvas (~20 fps). */
  update(dt) {
    if (!this.canvas || !this.subject || !this.canvas.isConnected) return;
    this.t += dt;
    // Turn a little either side of facing you, never round to the back.
    this.turn.rotation.y = Math.sin(this.t * 0.5) * 0.55;
    this.anim?.update(dt);
    this.acc += dt;
    if (this.acc < 0.05) return;
    this.acc = 0;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const clear = r.getClearAlpha();
    r.setClearAlpha(0);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.rt, 0, 0, W, H, this.pixels);
    r.setRenderTarget(prev);
    r.setClearAlpha(clear);
    // WebGL rows run bottom-up; flip into the canvas.
    const img = this.ctx.createImageData(W, H);
    const row = W * 4;
    for (let y = 0; y < H; y++) img.data.set(this.pixels.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    this.ctx.putImageData(img, 0, 0);
  }

  hide() {
    this.canvas = null;
    this.key = null;
    this.clearSubject();
  }
}
