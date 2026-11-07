// The developer tuning panel (lil-gui), toggled with `.
import GUI from 'lil-gui';
import { config, saveConfig, resetConfig } from './config.js';

/** Methods mixed into Game (see game.js). */
export class TuningMethods {
  setupGui() {
    const gui = (this.gui = new GUI({ title: 'Tuning  ( ` to hide )' }));
    // Developer tuning panel starts hidden; ` toggles it.
    this.guiHidden = true;
    gui.show(false);
    const b = gui.addFolder('Bow');
    b.add(config.bow, 'drawTime', 0.2, 2, 0.01).name('Draw time (s)');
    b.add(config.bow, 'perfectWindow', 0.03, 0.5, 0.01).name('Perfect window (s)');
    b.add(config.bow, 'minDamage', 1, 40, 1).name('Min damage');
    b.add(config.bow, 'maxDamage', 5, 80, 1).name('Max damage');
    b.add(config.bow, 'perfectMultiplier', 1, 4, 0.1).name('Perfect multiplier');
    b.add(config.bow, 'minArrowSpeed', 5, 60, 1).name('Min arrow speed');
    b.add(config.bow, 'maxArrowSpeed', 10, 100, 1).name('Max arrow speed');
    b.add(config.bow, 'range', 8, 40, 1).name('Range');
    b.add(config.bow, 'drawMoveMultiplier', 0, 1, 0.05).name('Move speed while drawing');
    b.add(config.bow, 'fireCooldown', 0, 1, 0.01).name('Fire cooldown (s)');

    const pl = gui.addFolder('Player');
    pl.add(config.player, 'moveSpeed', 2, 14, 0.1).name('Move speed');
    pl.add(config.player, 'maxHp', 20, 400, 10).name('Max HP');
    pl.add(config.player, 'iFrames', 0, 2, 0.05).name('Invuln after hit (s)');
    pl.add(config.player, 'healPerWave', 0, 100, 5).name('Heal per wave');

    const dg = gui.addFolder('Dodge');
    dg.add(config.dodge, 'distance', 1, 10, 0.1).name('Distance');
    dg.add(config.dodge, 'duration', 0.1, 0.8, 0.01).name('Duration (s)');
    dg.add(config.dodge, 'iFrameStart', 0, 0.5, 0.01).name('Invuln starts (s)');
    dg.add(config.dodge, 'iFrameEnd', 0, 0.8, 0.01).name('Invuln ends (s)');
    dg.add(config.dodge, 'cooldown', 0, 3, 0.05).name('Cooldown (s)');
    dg.add(config.dodge, 'cancelsDraw').name('Rolling cancels draw');
    dg.add(config.dodge, 'slowmoTime', 0, 2, 0.05).name('Perfect: slow-mo (s)');
    dg.add(config.dodge, 'slowmoScale', 0.05, 1, 0.05).name('Perfect: slow-mo speed');
    dg.add(config.dodge, 'counterWindow', 0, 5, 0.1).name('Perfect: counter window (s)');

    const sk = gui.addFolder('Bandit Archer');
    sk.add(config.archer, 'baseHp', 5, 100, 1).name('Base HP');
    sk.add(config.archer, 'aimTime', 0.3, 2, 0.05).name('Aim telegraph (s)');
    sk.add(config.archer, 'cooldown', 0.3, 5, 0.1).name('Shot cooldown (s)');
    sk.add(config.archer, 'arrowSpeed', 5, 40, 0.5).name('Arrow speed');
    sk.add(config.archer, 'damage', 1, 60, 1).name('Damage');
    sk.add(config.archer, 'firstWave', 1, 10, 1).name('First wave');
    sk.close();

    const g = gui.addFolder('Brute');
    g.add(config.grunt, 'baseHp', 5, 200, 1).name('Base HP');
    g.add(config.grunt, 'speed', 0.5, 10, 0.1).name('Speed');
    g.add(config.grunt, 'attackRange', 1, 6, 0.1).name('Attack range');
    g.add(config.grunt, 'windupTime', 0.1, 1.5, 0.01).name('Windup (s)');
    g.add(config.grunt, 'lungeSpeed', 4, 30, 0.5).name('Lunge speed');
    g.add(config.grunt, 'lungeTime', 0.05, 0.6, 0.01).name('Lunge time (s)');
    g.add(config.grunt, 'recoverTime', 0, 2, 0.05).name('Recover (s)');
    g.add(config.grunt, 'damage', 1, 100, 1).name('Damage');
    g.add(config.grunt, 'staggerCharge', 0, 1, 0.05).name('Charge to stagger');

    const w = gui.addFolder('Waves');
    w.add(config.waves, 'baseCount', 1, 20, 1).name('Wave 1 count');
    w.add(config.waves, 'countPerWave', 0, 10, 1).name('+ per wave');
    w.add(config.waves, 'hpGrowth', 0, 1, 0.01).name('HP growth / wave');
    w.add(config.waves, 'speedGrowth', 0, 0.5, 0.01).name('Speed growth / wave');
    w.add(config.waves, 'spawnInterval', 0.1, 3, 0.05).name('Spawn interval (s)');
    w.add(config.waves, 'breakTime', 0.5, 10, 0.5).name('Break between waves');

    const mdl = gui.addFolder('Models (Meshy)');
    mdl.add(config.models, 'heroHeight', 1, 3, 0.05).name('Hero height (m)');
    mdl.add(config.models, 'gruntHeight', 1, 3, 0.05).name('Brute height (m)');
    mdl.add(config.models, 'heroAimYaw', -180, 180, 1).name('Hero aim turn (°)');
    mdl.add(config.models, 'shootStartAt', 0, 0.95, 0.01).name('Bow clip: nocked');
    mdl.add(config.models, 'shootFullAt', 0.05, 0.95, 0.01).name('Bow clip: full draw');
    mdl.add(config.models, 'shootReleaseAt', 0.05, 0.95, 0.01).name('Bow clip: release');
    mdl.add(config.models, 'attackWindupEnd', 0, 0.95, 0.01).name('Brute clip: crouch end');
    mdl.add(config.models, 'attackHitAt', 0.05, 0.95, 0.01).name('Brute clip: landing');
    mdl.add(config.models, 'runAnimSpeed', 1, 12, 0.1).name('Run anim speed ref');
    mdl.close();

    const f = gui.addFolder('Feel');
    f.add(config.feel, 'hitStop', 0, 0.2, 0.005).name('Hit-stop (s)');
    f.add(config.feel, 'perfectHitStop', 0, 0.3, 0.005).name('Perfect hit-stop (s)');
    f.add(config.feel, 'shake', 0, 3, 0.05).name('Screen shake');
    f.add(config.feel, 'knockback', 0, 20, 0.5).name('Knockback');
    f.add(config.feel, 'cameraZoom', 0.6, 1.6, 0.05).name('Camera distance');
    f.add(config.feel, 'bloom').name('Bloom').onChange((v) => (this.bloom.enabled = v));
    f.add(config.feel, 'bloomStrength', 0, 2, 0.05).name('Bloom strength').onChange((v) => (this.bloom.strength = v));
    f.add(config.feel, 'ambientOcclusion').name('Ambient occlusion').onChange((v) => (this.ao.enabled = v));
    f.add(config.feel, 'vignette', 0, 1, 0.05).name('Vignette').onChange((v) => (this.grade.uniforms.uVignette.value = v));
    f.add(config.feel, 'grade', 0, 1, 0.05).name('Color grade').onChange((v) => (this.grade.uniforms.uGrade.value = v));

    const actions = {
      restart: () => {
        this.sfx.unlock();
        this.start();
      },
      copy: async () => {
        const json = JSON.stringify(config, null, 2);
        console.log(json);
        try {
          await navigator.clipboard.writeText(json);
          this.banner('Settings copied', 'Paste them to share your tuning', 1.2);
        } catch {
          this.banner('Copy failed', 'Settings were printed to the console', 1.5);
        }
      },
      reset: () => {
        resetConfig();
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
        this.bloom.enabled = config.feel.bloom;
        this.bloom.strength = config.feel.bloomStrength;
      },
    };
    gui.add(actions, 'restart').name('↻ Restart run');
    gui.add(actions, 'copy').name('⧉ Copy settings JSON');
    gui.add(actions, 'reset').name('⟲ Reset to defaults');

    for (const folder of [pl, g, w, f]) folder.close();
    dg.open();
    gui.onFinishChange(() => saveConfig());
  }
}
