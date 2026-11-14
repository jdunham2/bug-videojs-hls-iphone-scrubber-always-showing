#!/usr/bin/env python3
"""Inline the sprite assets and game script into one self-contained index.html."""
import base64, json, pathlib
root = pathlib.Path(__file__).parent
assets = {p.stem: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
          for p in sorted((root / 'assets').glob('*.png'))}
atlas = json.loads((root / 'assets' / 'kenney_atlas.json').read_text())
authors = (root / 'assets' / 'LPC_AUTHORS.txt').read_text().strip()
game = (root / 'src' / 'game.js').read_text()
game = game.replace('__ASSETS__', json.dumps(assets)).replace('__ATLAS__', json.dumps(atlas)).replace('__LPC_AUTHORS__', authors)
html = (root / 'src' / 'shell.html').read_text().replace('/*__GAME__*/', game)
(root / 'index.html').write_text(html)
print(f'index.html: {len(html) // 1024} KB')
