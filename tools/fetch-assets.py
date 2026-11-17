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


COAST = ['coastal_cliff_01', 'coastal_cliff_02', 'coastal_cliff_04', 'coast_rocks_01', 'coast_rocks_02', 'coast_rocks_03',
         'coast_rocks_05', 'coast_land_rocks_02', 'coast_land_rocks_03', 'coast_line_01', 'coast_line_02', 'sand_rocks_small_01',
         'rock_face_01', 'mountainside', 'dutch_ship_large_01', 'ship_pinnace', 'wooden_lantern_01', 'treasure_chest',
         'modular_fort_01', 'gothic_statue', 'root_cluster_01', 'dead_tree_trunk', 'fern_02', 'grass_bermuda_01',
         'lambis_shell']
COAST_TEXTURES = {'beach': 'coast_sand_01', 'damp': 'damp_beach_sand', 'cliff': 'cliff_side'}
COAST_SKIES = {'dusk': 'the_sky_is_on_fire', 'dusk2': 'kiara_9_dusk', 'moon': 'qwantani_moonrise_puresky'}
# then: python3 tools/clean-sky.py composite assets-src/the_sky_is_on_fire.hdr assets-src/kiara_9_dusk.hdr public/assets/sky/dusk.hdr
#       cp assets-src/qwantani_moonrise_puresky.hdr public/assets/sky/moon.hdr


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


def fetch_model(name: str, res: str = '1k'):
    """A model is a .gltf file plus the .bin and textures it refers to; keep them together."""
    files = json.loads(get(API + name))
    entry = files['gltf'][res]['gltf']
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
    if len(sys.argv) > 1 and sys.argv[1] == 'coast':
        # the Wreck Shore rebuild: Poly Haven's coastal scans, and the props that go with them
        for name in COAST:
            if not (SRC / 'models' / name / f'{name}.gltf').exists():
                fetch_model(name)
        for name, asset in COAST_TEXTURES.items():
            files = json.loads(get(API + asset))
            print(asset)
            for key, out in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')):
                url = files[key]['2k']['jpg']['url']
                save_jpg(get(url), OUT / 'textures' / name / f'{out}.jpg')
        for name, asset in COAST_SKIES.items():
            files = json.loads(get(API + asset))
            # raw: the dusk sky is cleaned and composited from these by tools/clean-sky.py
            path = SRC / f'{asset}.hdr'
            path.write_bytes(get(files['hdri']['2k']['hdr']['url'], files['hdri']['2k']['hdr']['size']))
            print(f'  {path}  {path.stat().st_size // 1024} KB')
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
