// On-screen touch controls: virtual stick, camera drag, attack/skill/dodge buttons. Feeds Input's touch channel.
export function setupTouch(input, onToggle) {
  const root = document.createElement('div'); root.id = 'touch';
  root.innerHTML = `<div class="tstick"><div class="tknob"></div></div>
    <div class="tbtns"><button data-a="attack" class="tb big">⚔️</button><button data-a="skill1" class="tb">1</button><button data-a="skill2" class="tb">2</button><button data-a="skill3" class="tb">3</button><button data-a="skill4" class="tb">4</button><button data-a="dodge" class="tb">🌀</button><button data-a="jump" class="tb">⤒</button><button data-a="potion" class="tb">🧪</button><button data-a="interact" class="tb">E</button><button data-a="inventory" class="tb">🎒</button></div>`;
  document.body.appendChild(root);
  const T = input.touch;
  const stick = root.querySelector('.tstick'), knob = root.querySelector('.tknob');
  let sid = null, sx = 0, sy = 0, cid = null, cx = 0, cy = 0;
  stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) { let dx = (t.clientX - sx) / 50, dy = (t.clientY - sy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } T.moveX = dx; T.moveY = -dy; knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`; }
      if (t.identifier === cid) { input.dx += (t.clientX - cx) * 1.6 * input.sens; input.dy += (t.clientY - cy) * 1.6 * input.sens; cx = t.clientX; cy = t.clientY; }
    }
  }, { passive: true });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; T.moveX = T.moveY = 0; knob.style.transform = ''; } if (t.identifier === cid) cid = null; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  document.getElementById('c').addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; if (t.clientX > innerWidth * 0.35 && cid === null) { cid = t.identifier; cx = t.clientX; cy = t.clientY; } }, { passive: true });
  root.querySelectorAll('.tb').forEach((b) => {
    const a = b.dataset.a;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); if (!T.down.has(a)) T.pressed.add(a); T.down.add(a); b.classList.add('on'); }, { passive: false });
    const up = (e) => { e.preventDefault(); T.down.delete(a); b.classList.remove('on'); };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  });
  return { show(on) { root.style.display = on ? '' : 'none'; onToggle?.(on); } };
}
