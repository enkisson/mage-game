#!/usr/bin/env python3
"""Download the scanned textures and sky the game uses from Poly Haven (CC0).

Run from the repository root:  python3 tools/fetch-assets.py            (textures and sky)
                               python3 tools/fetch-assets.py models     (scanned models)
Files land in public/assets/. They are committed, so this only needs re-running to change them.
Needs Pillow for resizing:  pip install pillow
"""
import io
import json
import pathlib
import urllib.request

from PIL import Image

API = 'https://api.polyhaven.com/files/'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'assets'
# raw downloads that get optimised before use (see tools/optimize-models.sh); not committed
SRC = pathlib.Path(__file__).resolve().parent.parent / 'assets-src'
UA = {'User-Agent': 'asset-fetch-script'}

# game name -> Poly Haven asset
TEXTURES = {'sand': 'coast_sand_01', 'rock': 'rock_face_03', 'wood': 'weathered_planks'}
SKY = 'qwantani_dusk_2_puresky'
# scanned models, as glTF with 1k textures
MODELS = ['dutch_ship_medium', 'namaqualand_boulder_03', 'rock_09', 'wooden_crate_01', 'wooden_barrels_01',
          'dry_branches_medium_01']


def get(url: str, size: int | None = None) -> bytes:
    """Download a file. If the expected size is known, retry until the whole file arrives."""
    last = b''
    for _ in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                last = r.read()
        except Exception as err:  # a dropped connection: try again
            print(f'  retrying {url.rsplit("/", 1)[-1]}: {err}')
            continue
        if size is None or len(last) == size:
            return last
        print(f'  retrying {url.rsplit("/", 1)[-1]}: got {len(last)} of {size} bytes')
    raise RuntimeError(f'could not download {url} completely')


def save_jpg(data: bytes, path: pathlib.Path, size=None, quality=86):
    img = Image.open(io.BytesIO(data)).convert('RGB')
    if size:
        img = img.resize(size, Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, quality=quality, optimize=True)
    print(f'  {path.relative_to(OUT.parent.parent)}  {path.stat().st_size // 1024} KB')


def fetch_model(name: str):
    """A model is a .gltf file plus the .bin and textures it refers to; keep them together."""
    files = json.loads(get(API + name))
    entry = files['gltf']['1k']['gltf']
    folder = SRC / 'models' / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f'{name}.gltf').write_bytes(get(entry['url'], entry['size']))
    total = entry['size']
    for rel, inc in entry.get('include', {}).items():
        path = folder / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(get(inc['url'], inc['size']))
        total += inc['size']
    print(f'{name}  {total / 1e6:.1f} MB')


def main():
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'models':
        for name in sys.argv[2:] or MODELS:
            fetch_model(name)
        return
    for name, asset in TEXTURES.items():
        files = json.loads(get(API + asset))
        print(asset)
        for key, out in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')):
            url = files[key]['1k']['jpg']['url']
            save_jpg(get(url), OUT / 'textures' / name / f'{out}.jpg')

    files = json.loads(get(API + SKY))
    print(SKY)
    # a tone-mapped picture of the sky, large enough to stay sharp on screen; it also lights the world
    save_jpg(get(files['tonemapped']['url']), OUT / 'sky' / 'night.jpg', size=(4096, 2048), quality=88)


if __name__ == '__main__':
    main()
