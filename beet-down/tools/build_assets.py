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
HUE = {'w_rail': 62, 'i_core': -92, 'i_crown': 92, 'i_chrono': -50}
TINT = {'i_ember': ((90, 20, 0), (255, 120, 20), (255, 232, 130)), 'i_mirror': ((20, 40, 70), (150, 200, 240), (245, 252, 255)), 'i_coffin': ((30, 10, 40), (120, 70, 150), (225, 195, 245)), 'veg_egg': ((110, 96, 80), (238, 230, 214), (255, 253, 247)), 'i_glassball': ((10, 50, 80), (110, 220, 255), (235, 252, 255)), 'i_candle': ((30, 30, 90), (150, 170, 255), (240, 244, 255)), 'i_urn': ((90, 50, 0), (240, 170, 30), (255, 236, 150)), 'i_fshield': ((10, 40, 80), (70, 190, 255), (220, 248, 255))}  # colourise grey models  # hue shift (0-255 scale): purple crystal -> alien green, blue jewel -> ruby red
ROT = {'veg_banana': 58, 'w_hammer': -90, 'w_spear': -90, 'w_axe': -90, 'w_sword': -90, 'w_pan': 90, 'w_pick': -90, 'w_scythe': -90, 'w_cane': -90, 'w_pepper': -90}
FLIP = {'w_pizza', 'w_silencer', 'w_cluster', 'w_tender', 'w_laser', 'w_rail', 'w_mines', 'w_guzi', 'w_knife', 'w_pistol', 'w_smg', 'w_shotgun', 'w_rocket', 'w_zapper', 'w_sniper', 'w_minigun', 'w_bouncer', 'w_lobber', 'w_flamer'}
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
    if n.startswith('veg_') and n in TINT:
        from PIL import ImageOps
        al = im.getchannel('A'); g = ImageOps.autocontrast(im.convert('L'))
        lo, mid, hi = TINT[n]; im = ImageOps.colorize(g, lo, hi, mid=mid).convert('RGBA'); im.putalpha(al)
    if n.startswith('veg_'):
        im = outline(im, 7); im, _ = fit(im, 200, 200)
    elif n.startswith('i_'):
        if n in TINT:
            from PIL import ImageOps
            al = im.getchannel('A'); g = ImageOps.autocontrast(im.convert('L'))
            lo, mid, hi = TINT[n]; im = ImageOps.colorize(g, lo, hi, mid=mid).convert('RGBA'); im.putalpha(al)
        if n in HUE:
            r, g, b, al = im.split(); h, sat, v = Image.merge('RGB', (r, g, b)).convert('HSV').split()
            h = h.point(lambda x: (x + HUE[n]) % 256); sat = sat.point(lambda x: min(255, int(x * 1.15)))
            im = Image.merge('HSV', (h, sat, v)).convert('RGB'); im.putalpha(al)
        im = outline(im, 6); im, _ = fit(im, 96, 96)
    elif n.startswith('w_'):
        if n in HUE:
            r, g, b, al = im.split(); h, sat, v = Image.merge('RGB', (r, g, b)).convert('HSV').split()
            h = h.point(lambda x: (x + HUE[n]) % 256); im = Image.merge('HSV', (h, sat, v)).convert('RGB'); im.putalpha(al)
        im = outline(im, 6); im, _ = fit(im, 160, 110)
    elif n.startswith('d_'):
        im = outline(im, 4); im, _ = fit(im, 90, 90)
    else:
        im = outline(im, 6); im, _ = fit(im, 96, 96)
    put(n, im)

# ---------- drawn icons (no Kenney model fits) ----------
def draw_saw(size=300):
    from PIL import ImageDraw
    import math
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = size / 2; R = size * .46; r = size * .36; teeth = 14; pts = []
    for i in range(teeth * 2):
        a = i / (teeth * 2) * math.tau
        rad = R if i % 2 == 0 else r
        a2 = a + (math.tau / (teeth * 2)) * .35 * (1 if i % 2 == 0 else 0)
        pts.append((c + math.cos(a2) * rad, c + math.sin(a2) * rad))
    d.polygon(pts, fill=(168, 176, 196, 255))
    d.ellipse([c - r * .92, c - r * .92, c + r * .92, c + r * .92], fill=(196, 204, 222, 255))
    d.ellipse([c - r * .55, c - r * .55, c + r * .55, c + r * .55], fill=(150, 158, 178, 255))
    d.ellipse([c - r * .2, c - r * .2, c + r * .2, c + r * .2], fill=(70, 74, 90, 255))
    d.pieslice([c - r * .85, c - r * .85, c + r * .85, c + r * .85], 200, 250, fill=(235, 240, 250, 255))
    return im
im = outline(draw_saw(), 6); im, _ = fit(im, 96, 96); put('i_saws', im)

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

compose('e_gnat', 'body_blueB.png', [
    ('detail_blue_antenna_small.png', -26, -102, 1.3, 20, False, L), ('detail_blue_antenna_small.png', 26, -102, 1.3, -20, True, L),
    ('eye_angry_blue.png', 0, -10, 1.5, 0, False), ('mouth_closed_fangs.png', 0, 50, 1.1, 0, False)], bscale=.85, maxpx=70)
compose('e_oozer', 'body_greenD.png', [
    ('eye_closed_happy.png', -34, -30, 1.1, 0, False), ('eye_closed_happy.png', 34, -30, 1.1, 0, True),
    ('mouthH.png', 0, 30, 1.1, 0, False), ('snot_large.png', 30, 70, 1.1, 0, False), ('snot_small.png', -48, 60, 1.0, 0, False)], maxpx=150)
compose('e_mole', 'body_darkD.png', [
    ('detail_dark_ear_round.png', -62, -80, .9, 0, False, L), ('detail_dark_ear_round.png', 62, -80, .9, 0, True, L),
    ('arm_darkB.png', -88, 40, .45, -40, False, L), ('arm_darkB.png', 88, 40, .45, 40, True, L),
    ('eye_human.png', -30, -38, .55, 0, False), ('eye_human.png', 30, -38, .55, 0, False),
    ('nose_brown.png', 0, 0, .8, 0, False), ('mouthC.png', 0, 52, .9, 0, False)], maxpx=150)
compose('e_medic', 'body_whiteC.png', [
    ('detail_white_antenna_large.png', 0, -122, 1.3, 0, False, L),
    ('arm_whiteA.png', -78, 30, .5, -30, False, L), ('arm_whiteA.png', 78, 30, .5, 30, True, L),
    ('eye_human_green.png', -26, -36, .75, 0, False), ('eye_human_green.png', 26, -36, .75, 0, False),
    ('mouth_closed_happy.png', 0, 30, .8, 0, False)], maxpx=150)
compose('e_hive', 'body_yellowA.png', [
    ('detail_yellow_horn_large.png', -60, -92, 1.4, 20, False, L), ('detail_yellow_horn_large.png', 60, -92, 1.4, -20, True, L),
    ('eye_red.png', 0, -40, .8, 0, False), ('eye_red.png', -45, -5, .6, 0, False), ('eye_red.png', 45, -5, .6, 0, True), ('eye_red.png', -20, 22, .45, 0, False), ('eye_red.png', 22, 22, .45, 0, True),
    ('mouthE.png', 0, 55, 1.0, 0, False)], maxpx=200)

compose('e_bulwark', 'body_darkA.png', [
    ('detail_dark_horn_small.png', -45, -90, 1.2, 15, False, L), ('detail_dark_horn_small.png', 45, -90, 1.2, -15, True, L),
    ('leg_darkC.png', -42, 92, .55, 0, False, L), ('leg_darkC.png', 42, 92, .55, 0, True, L),
    ('eye_angry_blue.png', -34, -24, .9, 0, False), ('eye_angry_blue.png', 34, -24, .9, 0, True), ('mouth_closed_teeth.png', 0, 40, 1.1, 0, False)], maxpx=170)
compose('e_spotter', 'body_redE.png', [
    ('detail_red_antenna_large.png', 0, -150, 1.3, 0, False, L),
    ('eye_red.png', 0, -60, 1.2, 0, False), ('mouth_closed_sad.png', 0, 10, .9, 0, False)], bscale=.85, maxpx=150)
compose('e_blinker', 'body_whiteB.png', [
    ('detail_white_ear.png', -60, -90, 1.1, 20, False, L), ('detail_white_ear.png', 60, -90, 1.1, -20, True, L),
    ('eye_psycho_dark.png', -34, -22, .8, 0, False), ('eye_psycho_dark.png', 34, -22, .8, 0, False), ('mouthF.png', 0, 45, .9, 0, False)], bscale=.85, maxpx=140)
compose('e_phantom', 'body_whiteF.png', [
    ('eye_closed_feminine.png', -32, -50, 1.1, 0, False), ('eye_closed_feminine.png', 32, -50, 1.1, 0, True), ('mouthG.png', 0, 20, .9, 0, False)], bscale=.8, maxpx=150)
compose('e_pulser', 'body_yellowC.png', [
    ('detail_yellow_antenna_large.png', -30, -118, 1.2, 18, False, L), ('detail_yellow_antenna_large.png', 30, -118, 1.2, -18, True, L),
    ('eye_yellow.png', -28, -34, .75, 0, False), ('eye_yellow.png', 28, -34, .75, 0, True), ('mouthG.png', 0, 38, 1.1, 0, False)], maxpx=150)
compose('e_rhino', 'body_darkC.png', [
    ('leg_darkD.png', -40, 100, .6, 0, False, L), ('leg_darkD.png', 40, 100, .6, 0, True, L),
    ('detail_white_horn_large.png', 0, -112, 1.8, 0, False, L),
    ('eye_human_red.png', -30, -40, .7, 0, False), ('eye_human_red.png', 30, -40, .7, 0, False),
    ('nose_brown.png', 0, 4, .7, 0, False), ('mouthI.png', 0, 52, 1.0, 0, False)], maxpx=170)

compose('e_webber', 'body_whiteA.png', [
    ('leg_whiteB.png', -120, 30, .5, -60, False, L), ('leg_whiteB.png', 120, 30, .5, 60, True, L),
    ('leg_whiteB.png', -105, 95, .5, -30, False, L), ('leg_whiteB.png', 105, 95, .5, 30, True, L),
    ('eye_red.png', -40, -40, .5, 0, False), ('eye_red.png', 40, -40, .5, 0, True), ('eye_red.png', -16, -70, .38, 0, False), ('eye_red.png', 16, -70, .38, 0, True),
    ('mouth_closed_fangs.png', 0, 40, .9, 0, False)], bscale=.85, maxpx=160)
compose('e_thief', 'body_yellowD.png', [
    ('detail_yellow_ear.png', -70, -100, 1.0, 20, False, L), ('detail_yellow_ear.png', 70, -100, 1.0, -20, True, L),
    ('arm_yellowC.png', -100, 40, .45, -35, False, L), ('arm_yellowC.png', 100, 40, .45, 35, True, L),
    ('eyebrowA.png', -36, -66, .8, 15, False), ('eyebrowA.png', 36, -66, .8, -15, True),
    ('eye_cute_dark.png', -36, -36, .7, 0, False), ('eye_cute_dark.png', 36, -36, .7, 0, True), ('mouthB.png', 0, 46, .8, 0, False)], bscale=.8, maxpx=140)
compose('e_sentry', 'body_darkE.png', [
    ('detail_dark_antenna_large.png', 0, -195, 1.3, 0, False, L),
    ('leg_darkB.png', -45, 170, .55, 0, False, L), ('leg_darkB.png', 45, 170, .55, 0, True, L),
    ('eye_red.png', 0, -110, 1.25, 0, False), ('mouth_closed_teeth.png', 0, 50, .9, 0, False)], bscale=.7, maxpx=160)
compose('e_roller', 'body_greenC.png', [
    ('detail_green_horn_small.png', -45, -125, 1.0, 20, False, L), ('detail_green_horn_small.png', 0, -140, 1.0, 0, False, L), ('detail_green_horn_small.png', 45, -125, 1.0, -20, True, L),
    ('eye_human_green.png', -38, -50, .7, 0, False), ('eye_human_green.png', 38, -50, .7, 0, False), ('mouthD.png', 0, 50, .9, 0, False)], bscale=.85, maxpx=150)
compose('e_shielder', 'body_blueD.png', [
    ('detail_blue_ear_round.png', -95, -110, 1.0, 0, False, L), ('detail_blue_ear_round.png', 95, -110, 1.0, 0, True, L),
    ('arm_blueB.png', -120, 30, .5, -30, False, L), ('arm_blueB.png', 120, 30, .5, 30, True, L),
    ('eye_human_blue.png', -40, -40, .75, 0, False), ('eye_human_blue.png', 40, -40, .75, 0, False), ('mouth_closed_happy.png', 0, 50, .9, 0, False)], bscale=.85, maxpx=150)
compose('e_berserker', 'body_redF.png', [
    ('detail_red_horn_large.png', -60, -145, 1.4, 25, False, L), ('detail_red_horn_large.png', 60, -145, 1.4, -25, True, L),
    ('arm_redD.png', -128, 30, .6, -40, False, L), ('arm_redD.png', 128, 30, .6, 40, True, L),
    ('leg_redC.png', -55, 150, .6, 0, False, L), ('leg_redC.png', 55, 150, .6, 0, True, L),
    ('eye_angry_red.png', -45, -70, .9, 0, False), ('eye_angry_red.png', 45, -70, .9, 0, True), ('mouth_closed_fangs.png', 0, 50, 1.2, 0, False)], bscale=.75, maxpx=170)

# bosses
compose('e_bking', 'body_darkB.png', [
    ('detail_dark_ear_round.png', -78, -80, 1.2, 0, False, L), ('detail_dark_ear_round.png', 78, -80, 1.2, 0, True, L),
    ('arm_darkD.png', -122, 40, .75, -35, False, L), ('arm_darkD.png', 122, 40, .75, 35, True, L),
    ('detail_yellow_horn_large.png', -40, -102, 1.5, 15, False, L), ('detail_yellow_horn_large.png', 0, -114, 1.5, 0, False, L), ('detail_yellow_horn_large.png', 40, -102, 1.5, -15, True, L),
    ('eye_angry_red.png', -40, -36, 1.0, 0, False), ('eye_angry_red.png', 40, -36, 1.0, 0, True),
    ('nose_brown.png', 0, 8, 1.1, 0, False), ('mouthI.png', 0, 60, 1.4, 0, False)], maxpx=300)
compose('e_otitan', 'body_greenB.png', [
    ('detail_green_antenna_large.png', -40, -118, 1.4, 15, False, L), ('detail_green_antenna_large.png', 40, -118, 1.4, -15, True, L),
    ('eye_yellow.png', 0, -48, 1.0, 0, False), ('eye_yellow.png', -52, -14, .7, 0, False), ('eye_yellow.png', 52, -14, .7, 0, True),
    ('mouthJ.png', 0, 48, 1.5, 0, False), ('snot_large.png', 54, 88, 1.4, 0, False), ('snot_large.png', -60, 80, 1.1, 0, False), ('snot_small.png', 10, 100, 1.2, 0, False)], maxpx=300)
compose('e_slord', 'body_blueF.png', [
    ('arm_blueE.png', -110, -20, .8, -70, False, L), ('arm_blueE.png', 110, -20, .8, 70, True, L),
    ('detail_blue_antenna_large.png', -34, -140, 1.5, 20, False, L), ('detail_blue_antenna_large.png', 34, -140, 1.5, -20, True, L),
    ('eye_angry_blue.png', -34, -60, .95, 0, False), ('eye_angry_blue.png', 34, -60, .95, 0, True), ('eye_angry_blue.png', 0, -22, .8, 0, False),
    ('mouthB.png', 0, 30, 1.3, 0, False)], maxpx=300)

compose('e_warden', 'body_darkA.png', [
    ('arm_darkD.png', -112, 30, .75, -30, False, L), ('arm_darkD.png', 112, 30, .75, 30, True, L),
    ('leg_darkC.png', -45, 100, .6, 0, False, L), ('leg_darkC.png', 45, 100, .6, 0, True, L),
    ('detail_white_horn_large.png', -58, -96, 1.6, 22, False, L), ('detail_white_horn_large.png', 58, -96, 1.6, -22, True, L),
    ('eye_angry_red.png', -38, -30, 1.0, 0, False), ('eye_angry_red.png', 38, -30, 1.0, 0, True),
    ('eyebrowC.png', -38, -64, .9, -12, False), ('eyebrowC.png', 38, -64, .9, 12, True), ('mouthI.png', 0, 42, 1.3, 0, False)], maxpx=300)
compose('e_wraith', 'body_whiteF.png', [
    ('arm_whiteE.png', -100, -10, .7, -60, False, L), ('arm_whiteE.png', 100, -10, .7, 60, True, L),
    ('eye_psycho_dark.png', -36, -62, .95, 0, False), ('eye_psycho_dark.png', 36, -62, .95, 0, False),
    ('eyebrowA.png', -36, -96, .9, 15, False), ('eyebrowA.png', 36, -96, .9, -15, True), ('mouthJ.png', 0, 12, 1.2, 0, False)], maxpx=300)
compose('e_watcher', 'body_blueB.png', [
    ('detail_blue_antenna_large.png', -50, -112, 1.4, 25, False, L), ('detail_blue_antenna_large.png', 0, -128, 1.5, 0, False, L), ('detail_blue_antenna_large.png', 50, -112, 1.4, -25, True, L),
    ('eye_human_red.png', 0, -10, 2.3, 0, False), ('mouth_closed_fangs.png', 0, 70, 1.3, 0, False)], maxpx=300)

compose('e_wmother', 'body_darkF.png', [
    ('leg_whiteB.png', -95, -34, .75, -80, False, L), ('leg_whiteB.png', 95, -34, .75, 80, True, L),
    ('leg_whiteB.png', -98, 11, .75, -60, False, L), ('leg_whiteB.png', 98, 11, .75, 60, True, L),
    ('leg_whiteB.png', -92, 56, .75, -35, False, L), ('leg_whiteB.png', 92, 56, .75, 35, True, L),
    ('leg_whiteB.png', -67, 95, .75, -12, False, L), ('leg_whiteB.png', 67, 95, .75, 12, True, L),
    ('eye_red.png', -28, -62, .8, 0, False), ('eye_red.png', 28, -62, .8, 0, True), ('eye_red.png', -12, -90, .55, 0, False), ('eye_red.png', 12, -90, .55, 0, True),
    ('eye_red.png', -53, -39, .45, 0, False), ('eye_red.png', 53, -39, .45, 0, True),
    ('mouth_closed_fangs.png', 0, -6, 1.4, 0, False)], maxpx=300)
compose('e_fortress', 'body_whiteE.png', [
    ('detail_white_antenna_large.png', -34, -120, 1.3, 25, False, L), ('detail_white_antenna_large.png', 34, -120, 1.3, -25, True, L),
    ('arm_whiteC.png', -70, 22, .75, -20, False, L), ('arm_whiteC.png', 70, 22, .75, 20, True, L),
    ('leg_whiteD.png', -31, 120, .7, 0, False, L), ('leg_whiteD.png', 31, 120, .7, 0, True, L),
    ('eye_red.png', 0, -62, 1.7, 0, False), ('eyebrowC.png', 0, -98, 1.1, 0, False), ('mouth_closed_teeth.png', 0, 34, 1.3, 0, False)], maxpx=300)
compose('e_rampager', 'body_redA.png', [
    ('detail_red_horn_large.png', -48, -70, 1.7, 30, False, L), ('detail_red_horn_large.png', 48, -70, 1.7, -30, True, L),
    ('arm_redE.png', -84, 17, .85, -35, False, L), ('arm_redE.png', 84, 17, .85, 35, True, L),
    ('leg_redB.png', -34, 84, .8, 0, False, L), ('leg_redB.png', 34, 84, .8, 0, True, L),
    ('eye_angry_red.png', -31, -22, 1.0, 0, False), ('eye_angry_red.png', 31, -22, 1.0, 0, True),
    ('eyebrowC.png', -31, -48, 1.0, -15, False), ('eyebrowC.png', 31, -48, 1.0, 15, True), ('mouth_closed_fangs.png', 0, 34, 1.5, 0, False)], maxpx=300)

compose('e_bee', 'body_yellowE.png', [
    ('detail_white_ear.png', -62, -45, 1.7, 55, False, L), ('detail_white_ear.png', 62, -45, 1.7, -55, True, L),
    ('detail_yellow_antenna_small.png', -28, -128, 1.0, 15, False, L), ('detail_yellow_antenna_small.png', 28, -128, 1.0, -15, True, L),
    ('detail_dark_horn_small.png', 0, 128, 1.4, 180, False, L),
    ('eye_cute_dark.png', -26, -45, .5, 0, False), ('eye_cute_dark.png', 26, -45, .5, 0, True), ('mouthA.png', 0, 20, .55, 0, False)], bscale=.75, maxpx=130)
compose('e_hqueen', 'body_yellowA.png', [
    ('detail_white_ear.png', -105, -40, 3.4, 60, False, L), ('detail_white_ear.png', 105, -40, 3.4, -60, True, L),
    ('arm_yellowB.png', -82, 30, .8, -30, False, L), ('arm_yellowB.png', 82, 30, .8, 30, True, L),
    ('detail_dark_horn_large.png', 0, 92, 1.3, 180, False, L),
    ('eyebrowB.png', -36, -52, .7, 10, False), ('eyebrowB.png', 36, -52, .7, -10, True),
    ('eye_human.png', -36, -26, .62, 0, False), ('eye_human.png', 36, -26, .62, 0, True), ('mouthF.png', 0, 30, .8, 0, False)], maxpx=300)

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
