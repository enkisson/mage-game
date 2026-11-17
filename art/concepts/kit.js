// Gloamtide concept painting kit.
//
// A small software renderer for matte paintings. The picture is held in floating point, so
// light can be brighter than white until the end. Shapes are drawn as masks with the 2D
// canvas; every surface inside a mask is shaded per pixel by a function (rock, sand, sea,
// sky, cloth), and the finish is photographic: bloom, tone mapping, grade, vignette, grain.
//
// Scenes are written in a 1920x1080 design space and can be rendered at any scale.
'use strict';
const K = (() => {
  const DW = 1920, DH = 1080;
  let S = 1, W = DW, H = DH;
  let R, G, B; // the picture, linear light
  let mc, mx;  // the canvas masks are drawn on

  // ---- numbers and colour ------------------------------------------------------------------
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const lin = (hex) => {
    const c = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return [f((c >> 16) & 255), f((c >> 8) & 255), f(c & 255)];
  };
  const mix3 = (a, b, t, o = [0, 0, 0]) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- noise ---------------------------------------------------------------------------------
  const perm = new Uint8Array(512);
  {
    const r = rng(1337), a = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = a[i & 255];
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const gr = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  /** Gradient noise, about -1..1. */
  function noise(x, y) {
    const X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y;
    const xi = X & 255, yi = Y & 255, u = fade(x), v = fade(y);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1], ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    const x1 = gr(aa, x, y) + (gr(ba, x - 1, y) - gr(aa, x, y)) * u;
    const x2 = gr(ab, x, y - 1) + (gr(bb, x - 1, y - 1) - gr(ab, x, y - 1)) * u;
    return (x1 + (x2 - x1) * v) * 0.72;
  }
  function fbm(x, y, oct = 5, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= gain; f *= 2.03; }
    return s / n;
  }
  /** Sharp-crested noise, 0..1: ridges, cracks, veins. */
  function ridged(x, y, oct = 5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise(x * f + i * 31.7, y * f + i * 7.3)); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
    return s / n;
  }
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---- the picture -----------------------------------------------------------------------------
  function begin(scale = 1) {
    S = scale; W = Math.round(DW * S); H = Math.round(DH * S);
    R = new Float32Array(W * H); G = new Float32Array(W * H); B = new Float32Array(W * H);
    mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    mx = mc.getContext('2d', { willReadFrequently: true });
  }

  /** Draw a shape (in design space) and keep its coverage as a mask. */
  function mask(draw, blur = 0) {
    mx.setTransform(1, 0, 0, 1, 0, 0);
    mx.clearRect(0, 0, W, H);
    mx.filter = blur ? `blur(${blur * S}px)` : 'none';
    mx.setTransform(S, 0, 0, S, 0, 0);
    mx.fillStyle = '#fff'; mx.strokeStyle = '#fff'; mx.lineCap = 'round'; mx.lineJoin = 'round';
    draw(mx);
    mx.filter = 'none';
    const d = mx.getImageData(0, 0, W, H).data;
    const a = new Float32Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = d[(y * W + x) * 4 + 3] / 255;
      if (v > 0.002) { a[y * W + x] = v; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { a, x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
  /** Coverage of `m` where `cut` does not cover. */
  function minus(m, cut) {
    const a = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = m.a[i] * (1 - cut.a[i]);
    return { a, x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
  }
  function union(...ms) {
    const a = new Float32Array(W * H);
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const m of ms) { x0 = Math.min(x0, m.x0); y0 = Math.min(y0, m.y0); x1 = Math.max(x1, m.x1); y1 = Math.max(y1, m.y1); for (let i = 0; i < a.length; i++) a[i] = Math.max(a[i], m.a[i]); }
    return { a, x0, y0, x1, y1 };
  }

  const o = [0, 0, 0, 1];
  /**
   * Shade every pixel of a mask (or the whole picture) with fn(x, y, o, coverage, i):
   * x, y in design space; write linear colour into o[0..2] and opacity into o[3].
   * Return false to leave the pixel alone. `add` adds light instead of covering.
   */
  function paint(m, fn, add = false) {
    const x0 = m ? m.x0 : 0, y0 = m ? m.y0 : 0, x1 = m ? m.x1 : W, y1 = m ? m.y1 : H;
    for (let py = y0; py < y1; py++) {
      const y = (py + 0.5) / S;
      for (let px = x0; px < x1; px++) {
        const i = py * W + px;
        const cov = m ? m.a[i] : 1;
        if (cov <= 0.002) continue;
        o[0] = o[1] = o[2] = 0; o[3] = 1;
        if (fn((px + 0.5) / S, y, o, cov, i) === false) continue;
        const a = cov * o[3];
        if (add) { R[i] += o[0] * a; G[i] += o[1] * a; B[i] += o[2] * a; }
        else { R[i] += (o[0] - R[i]) * a; G[i] += (o[1] - G[i]) * a; B[i] += (o[2] - B[i]) * a; }
      }
    }
  }
  /** Darken (or tint) what is already there through a mask: shadows, wetness. */
  function multiply(m, k) {
    const c = typeof k === 'number' ? [k, k, k] : k;
    for (let py = m.y0; py < m.y1; py++) for (let px = m.x0; px < m.x1; px++) {
      const i = py * W + px, a = m.a[i];
      if (a <= 0.002) continue;
      R[i] *= 1 - a * (1 - c[0]); G[i] *= 1 - a * (1 - c[1]); B[i] *= 1 - a * (1 - c[2]);
    }
  }
  /** The picture as it stands, at a point in design space (for reflections). */
  function read(x, y, out) {
    const px = clamp(Math.round(x * S - 0.5), 0, W - 1), py = clamp(Math.round(y * S - 0.5), 0, H - 1);
    const i = py * W + px;
    out[0] = R[i]; out[1] = G[i]; out[2] = B[i];
    return out;
  }
  /** A copy of the picture as it stands, to read back while painting over it. */
  function snapshot() {
    const r = R.slice(), g = G.slice(), b = B.slice();
    return (x, y, out) => {
      const px = clamp(Math.round(x * S - 0.5), 0, W - 1), py = clamp(Math.round(y * S - 0.5), 0, H - 1);
      const i = py * W + px;
      out[0] = r[i]; out[1] = g[i]; out[2] = b[i];
      return out;
    };
  }

  // ---- shape as relief -----------------------------------------------------------------------
  function boxBlur(src, w, h, r) {
    if (r < 1) return src.slice();
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const pass = (a, b, horizontal) => {
      const n = horizontal ? w : h, m = horizontal ? h : w;
      for (let j = 0; j < m; j++) {
        let s = 0;
        const at = (k) => (horizontal ? j * w + clamp(k, 0, w - 1) : clamp(k, 0, h - 1) * w + j);
        for (let k = -r; k <= r; k++) s += a[at(k)];
        for (let k = 0; k < n; k++) {
          b[horizontal ? j * w + k : k * w + j] = s / (2 * r + 1);
          s += a[at(k + r + 1)] - a[at(k - r)];
        }
      }
    };
    pass(src, tmp, true); pass(tmp, out, false);
    return out;
  }
  /**
   * Treat a mask as a soft swelling: its blurred edge gives every pixel a slope, so a flat
   * silhouette shades like a rounded thing. Returns a function giving the normal at a pixel.
   */
  function pillow(m, radius) {
    const r = Math.max(1, Math.round(radius * S / 2));
    let f = boxBlur(m.a, W, H, r); f = boxBlur(f, W, H, r);
    return (i, n, k = 1) => {
      const px = i % W, py = (i - px) / W;
      const gx = (f[i + (px < W - 1 ? 1 : 0)] - f[i - (px > 0 ? 1 : 0)]) * S * radius * 0.5 * k;
      const gy = (f[i + (py < H - 1 ? W : 0)] - f[i - (py > 0 ? W : 0)]) * S * radius * 0.5 * k;
      n[0] = -gx; n[1] = -gy; n[2] = 1;
      const l = Math.hypot(n[0], n[1], n[2]);
      n[0] /= l; n[1] /= l; n[2] /= l;
      return f[i];
    };
  }
  /** Normal of a height function h(x, y) in design space; x right, y down, z toward the eye. */
  function bump(h, x, y, e, k, n) {
    const dx = (h(x + e, y) - h(x - e, y)) / (2 * e) * k;
    const dy = (h(x, y + e) - h(x, y - e)) / (2 * e) * k;
    n[0] = -dx; n[1] = -dy; n[2] = 1;
    const l = Math.hypot(n[0], n[1], 1);
    n[0] /= l; n[1] /= l; n[2] /= l;
    return n;
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; };

  // ---- finish ----------------------------------------------------------------------------------
  function bloom(threshold, strength, radii) {
    const d = 4, w = Math.ceil(W / d), h = Math.ceil(H / d);
    const br = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = 0; j < d; j++) for (let k = 0; k < d; k++) {
        const px = Math.min(W - 1, x * d + k), py = Math.min(H - 1, y * d + j), i = py * W + px;
        r += R[i]; g += G[i]; b += B[i]; n++;
      }
      r /= n; g /= n; b /= n;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b, k = Math.max(0, l - threshold) / Math.max(l, 1e-4);
      br[0][y * w + x] = r * k; br[1][y * w + x] = g * k; br[2][y * w + x] = b * k;
    }
    const sum = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
    for (const rad of radii) {
      for (let c = 0; c < 3; c++) {
        let f = boxBlur(br[c], w, h, Math.max(1, Math.round(rad * S / d)));
        f = boxBlur(f, w, h, Math.max(1, Math.round(rad * S / d)));
        for (let i = 0; i < f.length; i++) sum[c][i] += f[i] / radii.length;
      }
    }
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const fx = Math.min(w - 1.001, px / d), fy = Math.min(h - 1.001, py / d);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const i = py * W + px;
      const at = (arr) => mix(mix(arr[y0 * w + x0], arr[y0 * w + x0 + 1], tx), mix(arr[(y0 + 1) * w + x0], arr[(y0 + 1) * w + x0 + 1], tx), ty);
      R[i] += at(sum[0]) * strength; G[i] += at(sum[1]) * strength; B[i] += at(sum[2]) * strength;
    }
  }

  /** Start from a finished picture (RGBA bytes, sRGB) instead of a blank one: a paintover. */
  function fromPixels(data) {
    const dec = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const v = i / 255; dec[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    for (let i = 0; i < W * H; i++) { R[i] = dec[data[i * 4]]; G[i] = dec[data[i * 4 + 1]]; B[i] = dec[data[i * 4 + 2]]; }
  }

  /** Tone map, grade and print to a canvas. */
  function finish(opts = {}) {
    const { exposure = 1, bloom: bl = { threshold: 0.9, strength: 0.6, radii: [8, 30, 90] }, vignette = 0.35, grain = 0.025,
      lift = [0.01, 0.012, 0.022], gain = [1, 1, 1], saturation = 1, aberration = 1.2, tonemap = true, contrast = 1 } = opts;
    if (bl) bloom(bl.threshold, bl.strength, bl.radii);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const cx = out.getContext('2d');
    const img = cx.createImageData(W, H), d = img.data;
    const r = rng(99);
    const aces = tonemap ? (x) => clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)) : (x) => clamp(x);
    // an S-curve in display space, for contrast round the middle
    const curve = (v) => (contrast === 1 ? v : v < 0.5 ? 0.5 * Math.pow(2 * v, contrast) : 1 - 0.5 * Math.pow(2 * (1 - v), contrast));
    const enc = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const ab = Math.round(aberration * S);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px;
      // a little colour fringing toward the corners, as old glass does
      const dx = (px - W / 2) / (W / 2), dy = (py - H / 2) / (H / 2), rr = dx * dx + dy * dy;
      const off = Math.round(ab * rr);
      const ir = py * W + clamp(px + off, 0, W - 1), ib = py * W + clamp(px - off, 0, W - 1);
      let c0 = R[ir] * exposure, c1 = G[i] * exposure, c2 = B[ib] * exposure;
      const l = 0.2126 * c0 + 0.7152 * c1 + 0.0722 * c2;
      c0 = l + (c0 - l) * saturation; c1 = l + (c1 - l) * saturation; c2 = l + (c2 - l) * saturation;
      c0 = aces(Math.max(0, c0)) * gain[0]; c1 = aces(Math.max(0, c1)) * gain[1]; c2 = aces(Math.max(0, c2)) * gain[2];
      const v = 1 - vignette * Math.pow(rr * 0.5, 1.4);
      c0 = c0 * v + lift[0] * (1 - c0); c1 = c1 * v + lift[1] * (1 - c1); c2 = c2 * v + lift[2] * (1 - c2);
      const n = (r() - 0.5) * grain;
      d[i * 4] = clamp(curve(enc(clamp(c0))) + n) * 255;
      d[i * 4 + 1] = clamp(curve(enc(clamp(c1))) + n) * 255;
      d[i * 4 + 2] = clamp(curve(enc(clamp(c2))) + n) * 255;
      d[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return out;
  }

  return {
    get W() { return W; }, get H() { return H; }, get S() { return S; }, DW, DH,
    clamp, mix, smooth, lin, mix3, rng, noise, fbm, ridged, hash, dot, norm,
    begin, mask, minus, union, paint, multiply, read, snapshot, pillow, bump, boxBlur, finish, fromPixels,
  };
})();
