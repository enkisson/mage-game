#!/usr/bin/env python3
"""Make a usable sky from a panorama that has buildings on part of its horizon.

The clear stretch of the panorama (columns c0..c1 as fractions of its width) is laid round the
whole circle, there and back again, so every direction shows clear sky and sea. The seams are
blended. Reads and writes Radiance .hdr.

    python3 tools/clean-sky.py in.hdr out.hdr 0.43 0.89
    python3 tools/clean-sky.py composite sunset.hdr twilight.hdr out.hdr
"""
import struct
import sys

import numpy as np


def read_hdr(path):
    data = open(path, 'rb').read()
    pos = 0
    header = []
    while True:
        end = data.index(b'\n', pos)
        line = data[pos:end]
        pos = end + 1
        if line.startswith(b'-Y') or line.startswith(b'+Y'):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
        header.append(line)
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        if data[pos] == 2 and data[pos + 1] == 2 and ((data[pos + 2] << 8) | data[pos + 3]) == w:
            pos += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = data[pos]
                    pos += 1
                    if n > 128:
                        n -= 128
                        img[y, x:x + n, c] = data[pos]
                        pos += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(data[pos:pos + n], np.uint8)
                        pos += n
                    x += n
        else:
            img[y] = np.frombuffer(data[pos:pos + w * 4], np.uint8).reshape(w, 4)
            pos += w * 4
    e = img[..., 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float64) * f[..., None]


def write_hdr(path, rgb):
    h, w, _ = rgb.shape
    m = rgb.max(axis=2)
    mant, ex = np.frexp(m)
    scale = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
        f.write(f'-Y {h} +X {w}\n'.encode())
        f.write(out.tobytes())


def composite(sunset_path, twilight_path, dst, near=70.0, far=110.0):
    """The half of the sky round the sun from one panorama, the half away from it from another."""
    A = read_hdr(sunset_path)
    B = read_hdr(twilight_path)
    h, w, _ = A.shape
    if B.shape != A.shape:
        raise SystemExit('both skies must be the same size')
    horizon = h // 2

    def sun_column(img):
        band = img[horizon - h // 12:horizon].mean(axis=(0, 2))
        return int(np.argmax(band))
    sa, sb = sun_column(A), sun_column(B)
    out = np.zeros_like(A)
    # match brightness where the two meet
    ref = lambda img, s, d: img[horizon - h // 6:horizon, int((s + d / 360 * w) % w)].mean()
    gain = (ref(A, sa, 90) + ref(A, sa, -90)) / max(1e-6, ref(B, sb, 90) + ref(B, sb, -90))
    band = int(h * 10 / 180)
    warm = np.array([1.05, 0.98, 0.95])

    def clear_band(col):
        """Rebuild the lowest ten degrees of a column as clear sky brightening to the horizon:
        the photographs have hills and towers there."""
        col = col.copy()
        top = col[horizon - band].copy()
        for r in range(band):
            t = r / band
            col[horizon - band + r] = top * (1 + 0.6 * t * t) * (1 + (warm - 1) * t)
        return col
    for x in range(w):
        d = ((x - sa) / w * 360 + 540) % 360 - 180  # degrees from the sun
        t = min(1.0, max(0.0, (abs(d) - near) / (far - near)))
        t = t * t * (3 - 2 * t)
        ca = A[:, x]
        if abs(d) > 62:
            ca = clear_band(ca)
        cb = clear_band(B[:, int((sb + d / 360 * w) % w)] * gain)
        out[:, x] = ca * (1 - t) + cb * t
    # where the band was rebuilt, smooth it sideways so no column's cloud streaks down it
    rad = w // 48
    for r in range(horizon - band, horizon):
        row = out[r]
        padded = np.concatenate([row[-rad:], row, row[:rad]])
        csum = np.cumsum(np.concatenate([np.zeros((1, 3)), padded]), axis=0)
        blurred = (csum[2 * rad + 1:] - csum[:-2 * rad - 1]) / (2 * rad + 1)
        for x in range(w):
            d = ((x - sa) / w * 360 + 540) % 360 - 180
            m = min(1.0, max(0.0, (abs(d) - 55) / 15))
            row[x] = row[x] * (1 - m) + blurred[x] * m
    # below the horizon: dark ground, lit faintly by the sky's colour, smooth round the circle
    rim = out[horizon - 1].copy()
    kernel = w // 8
    padded = np.concatenate([rim[-kernel:], rim, rim[:kernel]])
    csum = np.cumsum(padded, axis=0)
    smooth = ((csum[2 * kernel:] - csum[:-2 * kernel]) / (2 * kernel))[:w]
    for y in range(horizon, h):
        f = 0.1 * np.exp(-(y - horizon) / (h * 0.02)) + 0.025
        out[y] = smooth * f
    write_hdr(dst, out)
    print(f'{dst}: sunset sky round column {sa}, twilight from column {sb} (scaled {gain:.2f})')


def main():
    if sys.argv[1] == 'composite':
        composite(sys.argv[2], sys.argv[3], sys.argv[4])
        return
    src, dst, a, b = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    img = read_hdr(src)
    h, w, _ = img.shape
    c0, c1 = int(a * w), int(b * w)
    span = c1 - c0
    out = np.zeros_like(img)
    blend = max(4, span // 12)
    for x in range(w):
        # there and back: 0..span..0 round the circle
        t = (x / w) * 2 * span
        s = t if t <= span else 2 * span - t
        col = c0 + int(min(span - 1, s))
        out[:, x] = img[:, col]
    # soften the two turning points by mixing with a shifted copy
    for x0 in (0, w // 2):
        for k in range(-blend, blend):
            x = (x0 + k) % w
            wgt = 0.5 - 0.5 * np.cos(np.pi * (k + blend) / (2 * blend))
            out[:, x] = out[:, x] * (1 - 0.5 * wgt) + out[:, (x + blend) % w] * 0.5 * wgt
    write_hdr(dst, out)
    print(f'{dst}: {w}x{h}, clear stretch {c0}..{c1}')


if __name__ == '__main__':
    main()
