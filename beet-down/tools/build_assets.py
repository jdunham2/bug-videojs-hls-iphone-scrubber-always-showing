"""Builds beet-down/assets.js from Kenney CC0 packs (https://kenney.nl).

Steps:
  1. Render the 3D models listed in tools/jobs.json to PNG (tools/render.html + tools/run.js, three.js in headless Chromium).
  2. Run this script:  python3 build_assets.py <kenney_root> <render_out_dir> <assets.js>
It mirrors/rotates the renders, adds a cartoon outline, assembles alien enemies from
Monster Builder Pack parts, downsizes Particle Pack textures and writes everything as
data URIs into one JS file.
"""
import sys, os, io, json, base64
from PIL import Image, ImageFilter, ImageChops

KEN, RAW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MB = os.path.join(KEN, '2d/Monster Builder Pack')
PP = os.path.join(KEN, '2d/Particle Pack/PNG (Transparent)')
OUTLINE = (34, 14, 30, 255)
assets = {}


def load(p):
    return Image.open(p).convert('RGBA')


def trim(im, pad=0):
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(bb) if bb else im
    if pad:
        c = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        c.alpha_composite(im, (pad, pad))
        im = c
    return im, bb


def outline(im, px):
    im, _ = trim(im, px + 2)
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    for _ in range(px):
        a = a.filter(ImageFilter.MaxFilter(3))
    a = a.filter(ImageFilter.GaussianBlur(0.7))
    base = Image.new('RGBA', im.size, OUTLINE)
    base.putalpha(a)
    base.alpha_composite(im)
    return base


def fit(im, mw, mh):
    s = min(mw / im.width, mh / im.height, 1.0)
    if s < 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im, s


def put(name, im, q=82, **meta):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=q, method=6)
    assets[name] = dict(src='data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(), w=im.width, h=im.height, **meta)


# ---------- 3D renders ----------
ROT = {'w_hammer': -90, 'w_spear': -90, 'w_axe': -90, 'w_sword': -90, 'w_pan': 90}
FLIP = {'w_knife', 'w_pistol', 'w_smg', 'w_shotgun', 'w_rocket', 'w_zapper', 'w_sniper', 'w_minigun', 'w_bouncer', 'w_lobber', 'w_flamer'}
for f in sorted(os.listdir(RAW)):
    n = f[:-4]
    im = load(os.path.join(RAW, f))
    im, _ = trim(im)
    if n in ROT:
        im = im.rotate(ROT[n], expand=True)
    if n in FLIP:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if n == 'veg_beet':  # Kenney's beet is turnip-pink; push the bulb to deep beet magenta
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a and r > g + 25 and b > g:
                    px[x, y] = (min(255, int(r * 1.0)), int(g * .35), int(b * .62), a)
    if n.startswith('veg_'):
        im = outline(im, 7); im, _ = fit(im, 200, 200)
    elif n.startswith('w_'):
        im = outline(im, 6); im, _ = fit(im, 160, 110)
    elif n.startswith('d_'):
        im = outline(im, 4); im, _ = fit(im, 90, 90)
    else:
        im = outline(im, 6); im, _ = fit(im, 96, 96)
    put(n, im)

# ---------- Monster Builder aliens ----------
def mb(n):
    return load(os.path.join(MB, n))


def compose(name, body, parts, bscale=1.0, size=520, maxpx=150):
    """parts: list of (file, x, y, scale, rot, flip, layer) ; layer<0 behind body. coords relative to body centre, in body px."""
    C = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    cx = cy = size // 2
    bim = mb(body)
    bim = bim.resize((round(bim.width * bscale), round(bim.height * bscale)), Image.LANCZOS)

    def paste(im, x, y):
        C.alpha_composite(im, (round(cx + x - im.width / 2), round(cy + y - im.height / 2)))

    def prep(p):
        f, x, y, s, r, fl = p[:6]
        im = mb(f)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        if fl:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if r:
            im = im.rotate(r, expand=True, resample=Image.BICUBIC)
        return im, x * bscale, y * bscale

    for p in parts:
        if len(p) > 6 and p[6] < 0:
            im, x, y = prep(p); paste(im, x, y)
    paste(bim, 0, 0)
    for p in parts:
        if not (len(p) > 6 and p[6] < 0):
            im, x, y = prep(p); paste(im, x, y)
    # outline + trim, tracking body centre
    a = C.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    bb = a.getbbox()
    pad = 9
    C = C.crop((bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad))
    bcx, bcy = cx - (bb[0] - pad), cy - (bb[1] - pad)
    al = C.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    for _ in range(6):
        al = al.filter(ImageFilter.MaxFilter(3))
    base = Image.new('RGBA', C.size, OUTLINE); base.putalpha(al.filter(ImageFilter.GaussianBlur(.8))); base.alpha_composite(C)
    im, s = fit(base, maxpx, maxpx)
    put(name, im, cx=round(bcx * s, 1), cy=round(bcy * s, 1), br=round(bim.width / 2 * s, 1))


L = -1
compose('e_grub', 'body_greenB.png', [
    ('leg_greenD.png', -45, 92, .55, 0, False, L), ('leg_greenD.png', 45, 92, .55, 0, True, L),
    ('detail_green_antenna_large.png', 0, -118, 1.3, 0, False, L),
    ('eye_human_green.png', 0, -18, 1.55, 0, False), ('mouthA.png', 0, 50, 1.0, 0, False)], bscale=.9)
compose('e_dasher', 'body_redD.png', [
    ('leg_redC.png', -42, 92, .5, 0, False, L), ('leg_redC.png', 42, 92, .5, 0, True, L),
    ('detail_red_horn_large.png', -45, -88, 1.1, 20, False, L), ('detail_red_horn_large.png', 45, -88, 1.1, -20, True, L),
    ('eye_angry_red.png', -34, -18, 1.0, 0, False), ('eye_angry_red.png', 34, -18, 1.0, 0, True),
    ('mouthB.png', 0, 42, 1.0, 0, False)])
compose('e_spitter', 'body_blueC.png', [
    ('arm_blueA.png', -78, 25, .5, -35, False, L), ('arm_blueA.png', 78, 25, .5, 35, True, L),
    ('detail_blue_antenna_small.png', -30, -108, 1.2, 15, False, L), ('detail_blue_antenna_small.png', 30, -108, 1.2, -15, True, L),
    ('eye_human_blue.png', -28, -30, .8, 0, False), ('eye_human_blue.png', 28, -30, .8, 0, False),
    ('mouthG.png', 0, 35, 1.1, 0, False)])
compose('e_brute', 'body_darkA.png', [
    ('arm_darkD.png', -98, 30, .6, -25, False, L), ('arm_darkD.png', 98, 30, .6, 25, True, L),
    ('leg_darkC.png', -42, 92, .55, 0, False, L), ('leg_darkC.png', 42, 92, .55, 0, True, L),
    ('detail_dark_horn_large.png', -52, -90, 1.4, 15, False, L), ('detail_dark_horn_large.png', 52, -90, 1.4, -15, True, L),
    ('eye_red.png', -34, -28, .75, 0, False), ('eye_red.png', 34, -28, .75, 0, True),
    ('eyebrowB.png', -34, -58, .8, -10, False), ('eyebrowB.png', 34, -58, .8, 10, True),
    ('mouthI.png', 0, 35, 1.2, 0, False)], maxpx=190)
compose('e_splitter', 'body_yellowF.png', [
    ('detail_yellow_ear_round.png', -70, -95, 1.0, 0, False, L), ('detail_yellow_ear_round.png', 70, -95, 1.0, 0, True, L),
    ('eye_human.png', -30, -45, .75, 0, False), ('eye_human.png', 30, -45, .75, 0, False),
    ('mouthD.png', 0, 10, 1.0, 0, False)], bscale=.8)
compose('e_mini', 'body_yellowB.png', [
    ('eye_cute_dark.png', 0, -20, 1.4, 0, False), ('mouth_closed_happy.png', 0, 45, .9, 0, False)], bscale=.9, maxpx=90)
compose('e_lootbug', 'body_whiteD.png', [
    ('detail_white_ear.png', -55, -90, 1.2, 15, False, L), ('detail_white_ear.png', 55, -90, 1.2, -15, True, L),
    ('leg_whiteD.png', -40, 90, .5, 0, False, L), ('leg_whiteD.png', 40, 90, .5, 0, True, L),
    ('eye_cute_light.png', -32, -15, .85, 0, False), ('eye_cute_light.png', 32, -15, .85, 0, True),
    ('mouthH.png', 0, 45, .9, 0, False)], bscale=.9)
compose('e_boss', 'body_redB.png', [
    ('arm_redC.png', -120, 40, .8, -30, False, L), ('arm_redC.png', 120, 40, .8, 30, True, L),
    ('leg_redA.png', -50, 110, .6, 0, False, L), ('leg_redA.png', 50, 110, .6, 0, True, L),
    ('detail_red_horn_large.png', -62, -92, 1.6, 25, False, L), ('detail_red_horn_large.png', 62, -92, 1.6, -25, True, L),
    ('detail_red_antenna_large.png', 0, -128, 1.5, 0, False, L),
    ('eye_yellow.png', 0, -45, 1.15, 0, False), ('eye_yellow.png', -52, -5, .75, 0, False), ('eye_yellow.png', 52, -5, .75, 0, True),
    ('mouthJ.png', 0, 52, 1.4, 0, False)], maxpx=300)
# brood eggs/new enemies
compose('e_bomber', 'body_redC.png', [
    ('detail_red_antenna_large.png', 0, -112, 1.2, 0, False, L),
    ('eye_psycho_light.png', -26, -30, .7, 0, False), ('eye_psycho_light.png', 26, -30, .7, 0, False),
    ('mouthF.png', 0, 35, .9, 0, False)], bscale=.85)
compose('e_hopper', 'body_greenE.png', [
    ('leg_greenA.png', -42, 115, .55, 10, False, L), ('leg_greenA.png', 42, 115, .55, -10, True, L),
    ('eye_cute_dark.png', 0, -60, 1.0, 0, False), ('mouth_closed_teeth.png', 0, 0, .9, 0, False)], bscale=.8)

# ---------- particles ----------
PART = {'smoke': ('smoke_07.png', 128), 'puff': ('smoke_04.png', 96), 'fire': ('fire_01.png', 96), 'flame': ('flame_05.png', 64),
        'muzzle': ('muzzle_02.png', 64), 'slash': ('slash_03.png', 128), 'scorch': ('scorch_02.png', 128), 'splat': ('dirt_02.png', 128),
        'ring': ('circle_02.png', 128), 'glow': ('circle_05.png', 64), 'star': ('star_06.png', 64), 'glint': ('star_09.png', 64),
        'bolt': ('spark_06.png', 128), 'magic': ('magic_05.png', 96), 'heart': ('symbol_01.png', 48), 'twirl': ('twirl_02.png', 128),
        'trace': ('trace_06.png', 64)}
for k, (f, s) in PART.items():
    im = load(os.path.join(PP, f))
    im, _ = trim(im)
    im, _ = fit(im, s, s)
    # store as white with alpha = luminance*alpha so it tints cleanly
    r, g, b, a = im.split()
    lum = Image.merge('RGB', (r, g, b)).convert('L')
    al = ImageChops.multiply(lum, a)
    white = Image.new('RGBA', im.size, (255, 255, 255, 0)); white.putalpha(al)
    put('fx_' + k, white, q=80)

js = '/* Generated by tools/build_assets.py from Kenney CC0 assets (www.kenney.nl). */\nwindow.BD_ASSETS=' + json.dumps(assets, separators=(',', ':')) + ';\n'
open(OUT, 'w').write(js)
print(len(assets), 'assets,', round(len(js) / 1024), 'KB')
