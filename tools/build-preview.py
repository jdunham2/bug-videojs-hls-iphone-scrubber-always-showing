#!/usr/bin/env python3
"""Build a preview page for sandboxed hosts (e.g. the claude.ai artifact viewer).

The page embeds the built JS/CSS and the sound samples. Each model and outfit
texture goes in its own JSON file ({ "b64": ... }) under pmodels/ next to the page,
fetched by relative URL and parsed without data:/blob: requests (which such hosts
block). Models use uncompressed geometry and WebP textures, so no WebAssembly
decoder is needed. Run `npm run build` first.

    python3 tools/build-preview.py OUTPUT.html
"""
import base64, glob, json, os, re, subprocess, sys

out_path = sys.argv[1]
cache = os.path.join(os.path.dirname(out_path) or '.', 'preview-models')
os.makedirs(cache, exist_ok=True)

manifest = json.load(open('public/models/manifest.json'))
model_files, extra = {}, {}
for k, v in manifest.items():
    if v['kind'] == 'outfit':
        extra[v['texture']] = base64.b64encode(open('public/' + v['texture'], 'rb').read()).decode()
        continue
    raw, dst = f'tools/meshy/raw/{k}.glb', f'{cache}/{k}.glb'
    src = raw if os.path.exists(raw) else f'public/models/{k}.glb'
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        # Playable heroes keep 1024px textures; enemies 512px; props 256px (keeps the page under 16 MB).
        size = '1024' if k in ('hero', 'huntress', 'dwarf') else '512' if v['kind'] == 'character' else '256'
        subprocess.run(['npx', 'gltf-transform', 'optimize', src, dst, '--compress', 'false',
                        '--texture-compress', 'webp', '--texture-size', size, '--simplify', 'false'],
                       check=True, capture_output=True)
    model_files[v['file']] = base64.b64encode(open(dst, 'rb').read()).decode()

amanifest = json.load(open('public/audio/manifest.json'))
audio_files = {f: base64.b64encode(open('public/' + f, 'rb').read()).decode() for v in amanifest.values() for f in v}

html = open('dist/index.html').read()
css = open(glob.glob('dist/assets/*.css')[0]).read()
js = open(glob.glob('dist/assets/*.js')[0]).read()
body = re.sub(r'<script[^>]*src="[^"]*"[^>]*></script>', '', re.search(r'<body>(.*)</body>', html, re.S).group(1))
# Write each bundled file as pmodels/<name>.json next to the page.
pdir = os.path.join(os.path.dirname(out_path) or '.', 'pmodels')
os.makedirs(pdir, exist_ok=True)
remote = {}
for path, b64 in {**model_files, **extra}.items():
    name = os.path.basename(path).rsplit('.', 1)[0] + '.json'
    with open(os.path.join(pdir, name), 'w') as f:
        json.dump({'b64': b64}, f)
    remote[path] = f'pmodels/{name}'
models_json = json.dumps({'manifest': manifest, 'remote': remote}, separators=(',', ':'))
audio_json = json.dumps({'manifest': amanifest, 'files': audio_files}, separators=(',', ':'))
for chunk in (js, models_json, audio_json):
    assert '</script' not in chunk.lower()
page = (f'<title>Draw &amp; Release</title>\n<style>\n:root {{ color-scheme: dark; }}\n{css}\n</style>\n{body.strip()}\n'
        f'<script>window.__EMBEDDED_MODELS = {models_json};\nwindow.__EMBEDDED_AUDIO = {audio_json};</script>\n'
        f'<script type="module">\n{js}\n</script>\n')
open(out_path, 'w').write(page)
print(f'{out_path}: {len(page) / 1e6:.1f} MB')
