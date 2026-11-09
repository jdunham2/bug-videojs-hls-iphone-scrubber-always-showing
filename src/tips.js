// First-run tips: one short hint at a time, shown when it's relevant and
// dismissed for good once you've done the thing it describes.

import { profile, saveProfile } from './profile.js';

export const TIPS = {
  camp: 'Practice on the training dummy: hold left mouse to draw, release to shoot',
  draw: 'Hold left mouse to draw your bow, release to fire',
  perfect: 'Release in the gold flash for a perfect shot: double damage that pierces',
  dodge: 'A brute is winding up! Press Space to roll through its leap',
  ult: 'Arrow Volley is ready: press Q to loose a volley onto your cursor',
  draft: 'Pick a skill card to power up (keys 1-3)',
  gadget: 'Press 1 or 2 to use your gadgets: a Healing Tonic and a Bear Trap to start',
  portal: 'The gate is open: walk through it to march on',
};

// The same tips for touch screens and touchpads.
const TOUCH = {
  camp: 'Practice on the training dummy: hold the right side of the screen to draw, lift to shoot',
  draw: 'Hold the right side of the screen to draw, drag to aim, lift to shoot',
  perfect: 'Lift your finger in the gold flash for a perfect shot: double damage that pierces',
  dodge: 'A brute is winding up! Tap ROLL to roll through its leap',
  ult: 'Arrow Volley is ready: tap VOLLEY',
  draft: 'Tap a skill card to power up',
  gadget: 'Tap your gadgets (bottom right) to use them: a Healing Tonic and a Bear Trap to start',
};
const TOUCHPAD = {
  camp: 'Practice on the training dummy: click once to draw, click again to shoot',
  draw: 'Click once to start drawing your bow, click again to shoot',
  perfect: 'Click in the gold flash for a perfect shot: double damage that pierces',
  dodge: 'A brute is winding up! Press Space (or two-finger tap) to roll through its leap',
};
const tipText = (key) => {
  const b = document.body.classList;
  return (b.contains('touch') && TOUCH[key]) || (b.contains('touchpad') && TOUCHPAD[key]) || TIPS[key];
};

export class Tips {
  constructor() {
    this.el = document.getElementById('tip');
    this.current = null;
    profile.tips ||= {};
  }

  /** Show a tip unless it's already been learned (or another is showing). */
  show(key) {
    if (profile.tips[key] || this.current === key) return;
    if (this.current && this.current !== key) return;
    this.current = key;
    this.el.textContent = tipText(key);
    this.el.classList.add('show');
  }

  done(key) {
    if (!profile.tips[key]) {
      profile.tips[key] = true;
      saveProfile();
    }
    if (this.current === key) this.hide();
  }

  hide() {
    this.current = null;
    this.el.classList.remove('show');
  }
}
