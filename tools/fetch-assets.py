#!/usr/bin/env python3
"""Download the scanned textures and sky the game uses from Poly Haven (CC0).

Run from the repository root:  python3 tools/fetch-assets.py
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
UA = {'User-Agent': 'asset-fetch-script'}

# game name -> Poly Haven asset
TEXTURES = {'sand': 'coast_sand_01', 'rock': 'rock_face_03', 'wood': 'weathered_planks'}
SKY = 'qwantani_dusk_2_puresky'


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def save_jpg(data: bytes, path: pathlib.Path, size=None, quality=86):
    img = Image.open(io.BytesIO(data)).convert('RGB')
    if size:
        img = img.resize(size, Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, quality=quality, optimize=True)
    print(f'  {path.relative_to(OUT.parent.parent)}  {path.stat().st_size // 1024} KB')


def main():
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
