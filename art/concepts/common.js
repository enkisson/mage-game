// Shared painters for the Wreck Shore concepts: sky, cloud, stone, sea, sand, the wreck,
// figures, light and air. Everything is in the 1920x1080 design space; the ground is a plane
// seen from eye height, so things sit at the right size for how far off they are.
'use strict';
const C = (() => {
  const { clamp, mix, smooth, lin, noise, fbm, ridged, hash, dot } = K;
  /** Focal length in design pixels: about a 60 degree vertical view. */
  const F = 935;
  const EYE = 1.6;

  const v3 = () => [0, 0, 0];
  const add3 = (o, c, k) => { o[0] += c[0] * k; o[1] += c[1] * k; o[2] += c[2] * k; };

  // ---- paths -----------------------------------------------------------------------------------
  function poly(ctx, pts, close = true) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) { ctx.closePath(); ctx.fill(); }
  }
  /** A smooth closed path through points. */
  function blob(ctx, pts) {
    const n = pts.length;
    ctx.beginPath();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = mid(p, pts[(i + 1) % n]); ctx.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
    ctx.closePath();
  }
  /** A ridge line from x0 to x1, its height given by fy(x). */
  function ridge(x0, x1, step, fy) {
    const pts = [];
    for (let x = x0; x <= x1 + 0.001; x += step) pts.push([x, fy(x)]);
    return pts;
  }
  /** A ribbon of varying width along a centre line (rivers, ropes, roots). */
  function ribbon(ctx, pts, width) {
    const L = [], Rr = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = width(i / (pts.length - 1), pts[i]) / 2;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
      Rr.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    poly(ctx, [...L, ...Rr.reverse()]);
  }
  /** A catmull-rom curve through points, sampled. */
  function curve(pts, n = 12) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // ---- sky ---------------------------------------------------------------------------------------
  /**
   * A twilight sky: a gradient by height, the glow of a sun just under the horizon, and the
   * same sky seen in water below the horizon. Returns sky(x, y, out).
   */
  function sky(cfg) {
    const { hy, sun, stops, glow, glow2, moon } = cfg;
    const st = stops.map(([t, c]) => [t, lin(c)]);
    const g1 = lin(glow), g2 = lin(glow2);
    const mc = moon ? lin(moon.color) : null;
    return (x, y, out) => {
      const t = clamp(Math.abs(hy - y) / hy, 0, 1);
      let k = 0;
      while (k < st.length - 2 && t > st[k + 1][0]) k++;
      const a = st[k], b = st[k + 1];
      const f = smooth(a[0], b[0], t);
      out[0] = mix(a[1][0], b[1][0], f); out[1] = mix(a[1][1], b[1][1], f); out[2] = mix(a[1][2], b[1][2], f);
      if (sun) {
        const dx = (x - sun.x) / sun.w, dy = t / sun.h;
        const e1 = Math.exp(-(dx * dx + dy * dy)), e2 = Math.exp(-(dx * dx / 9 + (dy * dy) / 5));
        add3(out, g1, e1 * sun.power);
        add3(out, g2, e2 * sun.power * 0.45);
      }
      if (moon && y < hy) {
        const d = Math.hypot(x - moon.x, y - moon.y);
        add3(out, mc, Math.exp(-d / (moon.r * 7)) * 0.05 + Math.exp(-d / (moon.r * 2.2)) * 0.08);
      }
      return out;
    };
  }
  function paintSky(skyFn, hy) {
    const m = K.mask((c) => c.fillRect(0, 0, 1920, hy + 40));
    K.paint(m, (x, y, o) => { skyFn(x, y, o); });
  }
  /** The moon: a disc with its seas, and a halo in the haze. */
  function moon(cfg) {
    const c = lin(cfg.color);
    const m = K.mask((ctx) => { ctx.beginPath(); ctx.arc(cfg.x, cfg.y, cfg.r, 0, Math.PI * 2); ctx.fill(); });
    K.paint(m, (x, y, o) => {
      const u = (x - cfg.x) / cfg.r, v = (y - cfg.y) / cfg.r;
      const seas = smooth(0.05, 0.45, fbm(u * 1.6 + 3, v * 1.6 - 2, 4) + 0.15);
      const limb = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const k = cfg.power * (0.75 + 0.25 * limb) * (1 - seas * 0.32) * (0.93 + 0.07 * noise(u * 9, v * 9));
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    });
  }
  function stars(hy, density, cover) {
    const m = K.mask((c) => c.fillRect(0, 0, 1920, hy - 40));
    K.paint(m, (x, y, o) => {
      const cx = Math.floor(x / 2), cy = Math.floor(y / 2);
      const h = hash(cx, cy);
      if (h < 1 - density) return false;
      const t = smooth(0.15, 0.6, (hy - y) / hy);
      const b = Math.pow((h - (1 - density)) / density, 3) * 3 * t * (cover ? 1 - cover(x, y) : 1);
      const warm = hash(cx + 7, cy) > 0.8;
      o[0] = b * (warm ? 1 : 0.75); o[1] = b * 0.85; o[2] = b * (warm ? 0.7 : 1);
    }, true);
  }
  /**
   * Cloud banks on a plane above, thinning toward the horizon. Lit from the low sun: bright
   * on the edges facing it, dark violet away from it.
   */
  function clouds(cfg) {
    const { hy, sun, lit, dark, rim, top = 0, bottom = hy - 6, scale = 1, cover = 0.1, stretch = 5, seed = 0, alpha = 1 } = cfg;
    const L = lin(lit), D = lin(dark), RIM = lin(rim);
    const density = (x, y) => {
      const z = 260 / (hy - y + 30);
      const u = ((x - 960) * z) / 900 * scale + seed, v = z * 1.2 * scale;
      const w = fbm(u * 0.7 + 4.1, v * 2.3, 3) * 0.9;
      const d = fbm(u * 1.2 + w, v * stretch + w * 0.6, 6);
      return smooth(cover, cover + 0.32, d + 0.08);
    };
    const m = K.mask((c) => c.fillRect(0, top, 1920, bottom - top));
    K.paint(m, (x, y, o) => {
      const d = density(x, y);
      if (d <= 0.002) return false;
      // light from the sun's side: compare with the cloud a step toward it
      const tx = sun.x - x, ty = sun.y - y, tl = Math.hypot(tx, ty) || 1;
      const s = density(x + (tx / tl) * 9, y + (ty / tl) * 9);
      const facing = clamp(0.55 + (d - s) * 2.2);
      const near = Math.exp(-Math.abs(x - sun.x) / sun.spread) * Math.exp(-(hy - y) / sun.lift);
      const thin = 4 * d * (1 - d);
      const k = facing * (0.25 + near * 1.6);
      o[0] = D[0] + L[0] * k + RIM[0] * thin * near * 2.4;
      o[1] = D[1] + L[1] * k + RIM[1] * thin * near * 2.4;
      o[2] = D[2] + L[2] * k + RIM[2] * thin * near * 2.4;
      o[3] = d * alpha * smooth(0, 40, hy - y);
    });
    return density;
  }

  // ---- air ---------------------------------------------------------------------------------------
  /** A soft glow of light added at a point. */
  function glow(x, y, r, color, power, squash = 1) {
    const c = lin(color);
    const m = K.mask((ctx) => ctx.fillRect(x - r * 3, y - r * 3 * squash, r * 6, r * 6 * squash));
    K.paint(m, (px, py, o) => {
      const d = Math.hypot(px - x, (py - y) / squash) / r;
      const k = power * (Math.exp(-d * d * 4) * 0.7 + Math.exp(-d * 1.6) * 0.3);
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    }, true);
  }
  /** Low banks of mist, lit warmer toward the light. */
  function mist(cfg) {
    const { y0, y1, color, warm, sunX = 0, spread = 600, alpha = 0.5, scale = 1, seed = 0, x0 = 0, x1 = 1920 } = cfg;
    const c = lin(color), w = lin(warm || color);
    const m = K.mask((ctx) => ctx.fillRect(x0, y0, x1 - x0, y1 - y0));
    K.paint(m, (x, y, o) => {
      const t = (y - y0) / (y1 - y0);
      const band = Math.sin(Math.PI * clamp(t)) ** 1.5;
      const n = fbm(x * 0.0022 * scale + seed, y * 0.012 * scale, 5);
      const d = smooth(-0.15, 0.45, n + 0.1) * band;
      if (d <= 0.003) return false;
      const k = Math.exp(-Math.abs(x - sunX) / spread);
      o[0] = mix(c[0], w[0], k); o[1] = mix(c[1], w[1], k); o[2] = mix(c[2], w[2], k);
      o[3] = d * alpha;
    });
  }
  /**
   * Shafts of light: the bright parts of the picture smeared out from the light, so that
   * anything in front of it casts rays. Only what `source` allows is a source.
   */
  function shafts(cfg) {
    const { x: sx, y: sy, threshold = 0.6, strength = 0.5, length = 0.85, color = '#ffffff', source, fade = () => 1 } = cfg;
    const W = K.W, H = K.H, S = K.S, d = 2, w = Math.ceil(W / d), h = Math.ceil(H / d);
    const src = new Float32Array(w * h), tmp = [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = (x * d + 1) / S, Y = (y * d + 1) / S;
      if (source && !source(X, Y)) continue;
      K.read(X, Y, tmp);
      const l = 0.2126 * tmp[0] + 0.7152 * tmp[1] + 0.0722 * tmp[2];
      src[y * w + x] = Math.max(0, l - threshold);
    }
    const out = new Float32Array(w * h);
    const N = 72, cx = (sx * S) / d, cy = (sy * S) / d;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, wt = 1;
      const dx = (cx - x) * length / N, dy = (cy - y) * length / N;
      let px = x, py = y;
      for (let k = 0; k < N; k++) {
        const ix = px | 0, iy = py | 0;
        if (ix >= 0 && iy >= 0 && ix < w && iy < h) s += src[iy * w + ix] * wt;
        wt *= 0.975; px += dx; py += dy;
      }
      out[y * w + x] = s / N;
    }
    const c = lin(color);
    K.paint(null, (X, Y, o) => {
      const v = out[Math.min(h - 1, ((Y * S) / d) | 0) * w + Math.min(w - 1, ((X * S) / d) | 0)] * strength * fade(X, Y);
      if (v <= 0.0005) return false;
      o[0] = c[0] * v; o[1] = c[1] * v; o[2] = c[2] * v;
    }, true);
  }
  /** Birds far off: small swept wings. */
  function birds(list, color = '#151520') {
    const m = K.mask((ctx) => {
      ctx.lineWidth = 1.6;
      for (const [x, y, s, flap] of list) {
        ctx.beginPath();
        ctx.moveTo(x - 9 * s, y - 2 * s * flap);
        ctx.quadraticCurveTo(x - 4 * s, y - 5 * s * flap, x, y);
        ctx.quadraticCurveTo(x + 4 * s, y - 5 * s * flap, x + 9 * s, y - 2 * s * flap);
        ctx.lineWidth = 1.4 * Math.max(0.7, s);
        ctx.stroke();
      }
    });
    const c = lin(color);
    K.paint(m, (x, y, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  }
  /** Motes of light drifting up: embers, spores, sea-fire. */
  function motes(cfg) {
    const { x, y, w, h, n, color, size = 2, power = 2, seed = 3 } = cfg;
    const r = K.rng(seed), c = lin(color);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([x + (r() - 0.5) * w, y - r() * h, size * (0.4 + r()), power * (0.3 + r() * r())]);
    const m = K.mask((ctx) => { for (const p of pts) ctx.fillRect(p[0] - p[2] * 4, p[1] - p[2] * 4, p[2] * 8, p[2] * 8); });
    K.paint(m, (px, py, o) => {
      let k = 0;
      for (const p of pts) { const d = Math.hypot(px - p[0], py - p[1]) / p[2]; if (d < 4) k += p[3] * Math.exp(-d * d); }
      if (k <= 0.001) return false;
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    }, true);
  }

  // ---- stone -------------------------------------------------------------------------------------
  /** Light falling on a surface: sun (often from behind), sky from above, bounce from below. */
  function light(n, L, out, rimN = n, vis = 1) {
    const { sun, sunC, sky, skyC, bounceC, rim = 1.2, wrap = 0 } = L;
    const ns = clamp((dot(n, sun) + wrap) / (1 + wrap)) * vis;
    const up = clamp(-n[1] * 0.5 + 0.5), down = clamp(n[1] * 0.5 + 0.5);
    // a back light: the edges of the silhouette turned toward it catch it
    const edge = Math.pow(clamp(1 - rimN[2]), 1.6) * clamp(rimN[0] * sun[0] + rimN[1] * sun[1] + 0.15) * rim;
    out[0] = sunC[0] * (ns + edge) + skyC[0] * up * sky + bounceC[0] * down;
    out[1] = sunC[1] * (ns + edge) + skyC[1] * up * sky + bounceC[1] * down;
    out[2] = sunC[2] * (ns + edge) + skyC[2] * up * sky + bounceC[2] * down;
    return out;
  }
  function lights(cfg) {
    const s = cfg.sun.slice(); K.norm(s);
    return { sun: s, sunC: lin(cfg.sunC).map((v) => v * (cfg.sunK ?? 1)), sky: cfg.sky ?? 1, skyC: lin(cfg.skyC).map((v) => v * (cfg.skyK ?? 1)), bounceC: lin(cfg.bounceC).map((v) => v * (cfg.bounceK ?? 1)), rim: cfg.rim ?? 1.2, wrap: cfg.wrap ?? 0 };
  }
  const haze3 = (o, hc, k) => { o[0] = mix(o[0], hc[0], k); o[1] = mix(o[1], hc[1], k); o[2] = mix(o[2], hc[2], k); };

  /**
   * A wall of columnar basalt: six-sided columns seen side on, each a few flat faces, broken
   * by joints, darker and slick where the sea reaches, pale with salt above it.
   */
  function basaltColumns(cfg) {
    const { x0, x1, top, base, colW, seed = 0, step = 26, lean = 0 } = cfg;
    const r = K.rng(seed + 11);
    const cols = [];
    let x = x0;
    // columns come in clusters: a run of slender ones, then a few massive ones
    let cluster = 1, left = 0;
    while (x < x1) {
      if (left-- <= 0) { cluster = 0.55 + r() * 1.2; left = 2 + Math.floor(r() * 6); }
      const w = colW * cluster * (0.75 + r() * 0.5);
      const depth = r() * 2 - 1;
      cols.push({ x, w, top: top(x + w / 2) + (r() - 0.5) * step + (depth < -0.6 ? step * 0.8 : 0), r: r(), depth, tint: r() });
      x += w;
    }
    const pts = [[x0, base(x0)]];
    for (const c of cols) {
      const tilt = (c.r - 0.5) * c.w * 0.5;
      pts.push([c.x, c.top + tilt]);
      pts.push([c.x + c.w * 0.5, c.top - Math.abs(tilt) * 0.3]);
      pts.push([c.x + c.w, c.top - tilt]);
    }
    pts.push([x1, base(x1)]);
    for (let xx = x1; xx >= x0; xx -= 8) pts.push([xx, base(xx)]);
    return { cols, outline: (ctx) => poly(ctx, pts), lean, pts };
  }
  /**
   * Columnar basalt. Each column is a prism of three visible faces, standing a little in front
   * of or behind its neighbours, cracked across into blocks; the whole wall bulges and falls
   * back in large forms; water stains run down it, salt and lichen crust it, and it is black
   * and slick where the sea reaches.
   */
  function basalt(m, wall, cfg) {
    const { L, hazeC, haze = () => 0, tint = '#3a3c44', wetLine = () => 9999, colW, seed = 0, salt = 0.6, warmth = 0, vis = () => 1, contrast = 1 } = cfg;
    const base = lin(tint), warmT = lin('#4a3e34'), wet = lin('#0e1014'), saltC = lin('#8a8c88'), algae = lin('#16241a'), lichen = lin('#7a7650');
    const hc = lin(hazeC);
    const pil = K.pillow(m, colW * 3);
    const n = [0, 0, 1], li = [0, 0, 0], macro = [0, 0, 1];
    const cols = wall.cols;
    let ci = 0;
    K.paint(m, (x, y, o, cov, i) => {
      const edge = pil(i, macro, 1);
      const xs = x + (y - 600) * wall.lean + fbm(y * 0.004 + seed, x * 0.002, 3) * colW * 0.45;
      while (ci > 0 && xs < cols[ci].x) ci--;
      while (ci < cols.length - 1 && xs >= cols[ci].x + cols[ci].w) ci++;
      const c = cols[ci], f = clamp((xs - c.x) / c.w);
      const turn = (c.r - 0.5) * 0.6;
      const b1 = 0.28 + turn * 0.25, b2 = 0.7 + turn * 0.25;
      let fx, fz;
      if (f < b1) { fx = -0.82 * contrast; fz = 1; } else if (f < b2) { fx = turn * 0.35 * contrast; fz = 1; } else { fx = 0.85 * contrast; fz = 1; }
      // blocks: each column cracked across, every block a little out of true
      const jh = (26 + c.r * 46) * (colW / 30 + 0.4);
      const jy = (y + c.r * 517) / jh, jb = Math.floor(jy), jf = jy - jb;
      const crack = smooth(0.07, 0.0, jf);
      const ledge = smooth(0.0, 0.05, jf) * smooth(0.14, 0.05, jf) * (hash(jb, ci) > 0.7 ? 1 : 0);
      const bt = (hash(jb, ci + 0.5) - 0.5);
      // the wall's large forms: bays and buttresses
      const big = fbm(x * 0.0025 + seed, y * 0.003, 4);
      n[0] = fx + bt * 0.25 + macro[0] * 0.6 + big * 0.5 + fbm(x * 0.06, y * 0.06, 3) * 0.22;
      n[1] = -ledge * 1.6 + crack * 0.4 + macro[1] * 0.5 + fbm(x * 0.05 + 5, y * 0.08, 3) * 0.2;
      n[2] = fz;
      K.norm(n);
      light(n, L, li, macro, vis(x, y));
      // shadow in the cracks and between the columns; the ones set back are darker
      const crev = smooth(0.0, 0.07, f) * smooth(1.0, 0.93, f);
      const ao = (0.3 + 0.7 * crev) * (1 - crack * 0.6) * (0.78 + c.depth * 0.22) * (0.6 + 0.4 * smooth(0, 0.5, edge));
      const above = y - wetLine(x);
      const streak = smooth(0.2, 0.7, fbm(x * 0.09 + seed, y * 0.0045, 3) + 0.25);
      const sal = salt * smooth(-220, -50, above) * smooth(20, -20, above) * smooth(0.1, 0.6, fbm(x * 0.02, y * 0.01, 3) + 0.4)
        + ledge * 0.6 + streak * 0.12 * salt;
      const wetness = smooth(-26, 12, above);
      const lich = smooth(0.3, 0.65, fbm(x * 0.015 + 9, y * 0.022, 4)) * 0.45 * (1 - wetness);
      const v = (0.7 + 0.45 * fbm(x * 0.03 + c.r * 10, y * 0.006, 3)) * (0.85 + (c.tint - 0.5) * 0.35) * (1 - streak * 0.25);
      const w = (c.tint * 0.6 + 0.2) * warmth;
      let a0 = mix(base[0], warmT[0], w) * v, a1 = mix(base[1], warmT[1], w) * v, a2 = mix(base[2], warmT[2], w) * v;
      const sa = clamp(sal);
      a0 = mix(a0, saltC[0], sa); a1 = mix(a1, saltC[1], sa); a2 = mix(a2, saltC[2], sa);
      a0 = mix(a0, lichen[0], lich); a1 = mix(a1, lichen[1], lich); a2 = mix(a2, lichen[2], lich);
      const alg = smooth(-10, 20, above + 30);
      a0 = mix(a0, mix(wet[0], algae[0], alg), wetness); a1 = mix(a1, mix(wet[1], algae[1], alg), wetness); a2 = mix(a2, mix(wet[2], algae[2], alg), wetness);
      o[0] = a0 * li[0] * ao; o[1] = a1 * li[1] * ao; o[2] = a2 * li[2] * ao;
      if (wetness > 0.01) {
        const sheen = wetness * Math.pow(clamp(fz * 0.6 + 0.4), 2) * 0.3 * (0.4 + 0.6 * smooth(-0.2, 0.5, noise(x * 0.06, y * 0.012)));
        add3(o, L.skyC, sheen);
      }
      haze3(o, hc, haze(x, y));
    });
  }
  /** Turf and grass along the top of a cliff, its blades against the sky. */
  function turf(pts, cfg) {
    const { L, tint = '#2c3320', depth = 7, blades = 1, seed = 1, hazeC = '#000', haze = () => 0 } = cfg;
    const r = K.rng(seed);
    const m = K.mask((ctx) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] + depth);
      for (const p of pts) ctx.lineTo(p[0], p[1] - 1);
      for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1] + depth * (0.6 + 0.8 * Math.abs(noise(k * 0.3, seed))));
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.1;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (Math.abs(b[1] - a[1]) > len * 0.8) continue; // not on sheer faces
        for (let q = 0; q < len * 0.35 * blades; q++) {
          const t = r(), x = mix(a[0], b[0], t), y = mix(a[1], b[1], t);
          const h = 3 + r() * 9, lean = (r() - 0.35) * 6;
          ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); ctx.stroke();
        }
      }
    });
    const c = lin(tint), n = [0, -0.4, 0.9], li = [0, 0, 0];
    K.norm(n);
    K.paint(m, (x, y, o) => {
      light(n, L, li);
      const v = 0.6 + 0.6 * noise(x * 0.3, y * 0.3);
      o[0] = c[0] * li[0] * v; o[1] = c[1] * li[1] * v; o[2] = c[2] * li[2] * v;
      haze3(o, lin(hazeC), haze(x, y));
    });
    return m;
  }
  /**
   * Any rock: a shape swelled into a mass and broken into flat facets, the way stone fractures,
   * with cracks and grain on the faces. Wet where `wet` says, and mossed on the tops.
   */
  function rock(m, cfg) {
    const { L, tint = '#3b3d45', hazeC = '#000000', haze = () => 0, radius = 40, rough = 1, seed = 0, wet = () => 0, moss = 0, k = 1.4, facet = 1, vis = () => 1 } = cfg;
    const pil = K.pillow(m, radius);
    const base = lin(tint), wetC = lin('#0e1014'), mossC = lin('#2b3a1c'), hc = lin(hazeC), saltC = lin('#7a7a74');
    const n = [0, 0, 1], li = [0, 0, 0], sil = [0, 0, 1];
    const cell = radius * 1.4 / Math.max(0.2, facet);
    K.paint(m, (x, y, o, cov, i) => {
      const f = pil(i, n, k);
      sil[0] = n[0]; sil[1] = n[1]; sil[2] = n[2];
      // facets: the nearest of a scatter of points decides which way this bit of face is turned
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      let best = 1e9, bx = 0, by = 0, second = 1e9;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const cx = (gx + a + K.hash(gx + a + seed, gy + b)) * cell, cy = (gy + b + K.hash(gx + a, gy + b + seed)) * cell;
        const d = Math.hypot(x - cx, y - cy);
        if (d < best) { second = best; best = d; bx = gx + a; by = gy + b; } else if (d < second) second = d;
      }
      const edgeF = 0.85 + 0.15 * smooth(0, cell * 0.06, second - best);
      n[0] += (K.hash(bx, by + 3) - 0.5) * 0.55 * facet + fbm(x * 0.05 * rough, y * 0.05 * rough, 3) * 0.35;
      n[1] += (K.hash(bx + 5, by) - 0.5) * 0.55 * facet - 0.1 + fbm(x * 0.05 * rough + 7, y * 0.05 * rough, 3) * 0.35;
      K.norm(n);
      light(n, L, li, sil, vis(x, y));
      const cr = ridged(x * 0.02 * rough + seed, y * 0.026 * rough, 4);
      const ao = (0.4 + 0.6 * smooth(0.0, 0.55, f)) * (1 - Math.pow(cr, 8) * 0.7) * (0.55 + 0.45 * edgeF);
      const v = (0.75 + 0.45 * fbm(x * 0.015 + seed, y * 0.015, 3)) * (0.9 + (K.hash(bx, by) - 0.5) * 0.3);
      const w = clamp(wet(x, y));
      const ms = moss * smooth(0.0, 0.45, fbm(x * 0.02 + 3, y * 0.02, 4)) * clamp(-n[1] * 1.5 + 0.1) * (1 - w);
      const salt = smooth(0.35, 0.6, fbm(x * 0.04, y * 0.04, 3) + 0.3) * 0.3 * (1 - w);
      let a0 = base[0] * v, a1 = base[1] * v, a2 = base[2] * v;
      a0 = mix(a0, saltC[0], salt); a1 = mix(a1, saltC[1], salt); a2 = mix(a2, saltC[2], salt);
      a0 = mix(a0, wetC[0], w); a1 = mix(a1, wetC[1], w); a2 = mix(a2, wetC[2], w);
      a0 = mix(a0, mossC[0], ms); a1 = mix(a1, mossC[1], ms); a2 = mix(a2, mossC[2], ms);
      o[0] = a0 * li[0] * ao; o[1] = a1 * li[1] * ao; o[2] = a2 * li[2] * ao;
      if (w > 0) { const sh = w * Math.pow(clamp(-n[1] * 0.7 + 0.35), 4) * 0.25 * edgeF; add3(o, L.skyC, sh); }
      haze3(o, hc, haze(x, y));
    });
  }
  /** A far range: silhouette, gullies, strata, snow in the clefts, and aerial haze. */
  function range(m, cfg) {
    const { L, tint, hazeC, haze, gully = 1, seed = 0, snow = 0, ridgeY, relief = 1 } = cfg;
    const base = lin(tint), hc = lin(hazeC), snowC = lin('#b8bccc');
    const n = [0, 0, 1], li = [0, 0, 0];
    const h = (x, y) => (ridged(x * 0.009 * gully + seed, y * 0.004 * gully, 6) * 26 + ridged(x * 0.03 * gully, y * 0.012 * gully + seed, 4) * 7 + fbm(x * 0.003 + seed, y * 0.003, 3) * 40) * relief;
    K.paint(m, (x, y, o) => {
      K.bump(h, x, y, 1.2, 1, n);
      light(n, L, li);
      const below = ridgeY ? y - ridgeY(x) : 100;
      const gl = ridged(x * 0.009 * gully + seed, y * 0.004 * gully, 6);
      const sn = snow * smooth(0.5, 0.75, gl) * smooth(180, 20, below) * smooth(-0.1, 0.3, n[1] * -1 + 0.2);
      const strata = 0.85 + 0.15 * Math.sin(y * 0.35 + fbm(x * 0.01, y * 0.01, 2) * 8);
      o[0] = mix(base[0] * strata, snowC[0], sn) * li[0]; o[1] = mix(base[1] * strata, snowC[1], sn) * li[1]; o[2] = mix(base[2] * strata, snowC[2], sn) * li[2];
      if (ridgeY) add3(o, L.sunC, smooth(5, 0, below) * 0.12);
      haze3(o, hc, haze(x, y));
    });
  }
  // ---- water -------------------------------------------------------------------------------------
  /**
   * The sea, seen from the beach: the sky and whatever stands over the water given back by a
   * moving surface, a path of light under the sun, the body of the water near at hand, and
   * surf where it breaks, glowing faintly blue where the sea-fire is in it.
   */
  function sea(m, cfg) {
    const { hy, sky: skyFn, snap, mirror = () => hy, sun, deep = '#0b1b24', shore, foamC = '#d8e4ea', fire = 0, fireC = '#3ef0ff', calm = 1, rocks = null } = cfg;
    let near = null;
    if (rocks) { near = K.boxBlur(rocks.a, K.W, K.H, Math.round(14 * K.S)); near = K.boxBlur(near, K.W, K.H, Math.round(14 * K.S)); }
    const dc = lin(deep), fc = lin(foamC), fic = lin(fireC);
    const c = [0, 0, 0];
    K.paint(m, (x, y, o, cov, i) => {
      const dy = Math.max(0.5, y - hy);
      const D = (F * EYE) / dy; // metres away
      const wx = ((x - 960) * D) / F;
      // the surface: long swell, chop on it
      const sx = fbm(wx * 0.08, D * 0.25, 4) * 0.6 + fbm(wx * 0.5, D * 1.4, 4) * 0.4;
      const sy = fbm(wx * 0.08 + 31, D * 0.25 + 7, 4) * 0.6 + fbm(wx * 0.5 + 9, D * 1.4, 4) * 0.4;
      const amp = calm * Math.min(1, 14 / dy + 0.05);
      const rx = x + sx * 60 * amp, ry = 2 * mirror(x) - y - Math.abs(sy) * 120 * amp - 2;
      if (snap) snap(rx, ry, c); else skyFn(rx, ry, c);
      // fresnel: far off it is a mirror, close up you see into it
      const fr = 0.25 + 0.75 * Math.pow(clamp(1 - dy / 520), 4);
      o[0] = mix(dc[0], c[0], fr); o[1] = mix(dc[1], c[1], fr); o[2] = mix(dc[2], c[2], fr);
      if (sun) {
        const gx = (rx - sun.x) / (sun.w * (1 + dy / 300)), gy = (ry - sun.y) / sun.h;
        const glint = Math.exp(-gx * gx - gy * gy) * Math.pow(clamp(fbm(wx * 1.6, D * 6, 3) * 2 + 0.3), 3) * sun.power;
        add3(o, sun.c, glint);
      }
      // white water broken on rock, and the lace it leaves on the swell
      if (near) {
        const r = near[i];
        const swirl = fbm(wx * 0.6, D * 2.2, 4);
        const foam = smooth(0.02, 0.35, r + swirl * 0.25) * smooth(0.2, 0.75, swirl + 0.55 + r);
        o[0] = mix(o[0], fc[0] * 0.4, foam); o[1] = mix(o[1], fc[1] * 0.4, foam); o[2] = mix(o[2], fc[2] * 0.4, foam);
        if (fire) add3(o, fic, foam * foam * fire * 0.8);
      }
      const lace = smooth(0.45, 0.7, fbm(wx * 0.35, D * 1.6, 5) + 0.25) * 0.25;
      o[0] = mix(o[0], fc[0] * 0.25, lace); o[1] = mix(o[1], fc[1] * 0.25, lace); o[2] = mix(o[2], fc[2] * 0.25, lace);
      if (shore) {
        const ds = shore(x) - y; // pixels from the waterline
        if (ds < 260 && ds > -4) {
          const dist = ((F * EYE) / Math.max(1, shore(x) - hy)); // metres to the waterline here
          const along = ((x - 960) * dist) / F;
          let foam = 0;
          for (const [at, wdt, k] of [[2, 3, 1], [22, 10, 0.7], [60, 18, 0.45], [120, 26, 0.25]]) {
            const p = (ds - at * (dy / 120) - fbm(along * 0.2 + at, 3, 3) * 10 * (dy / 120)) / (wdt * (dy / 120) + 1);
            foam += Math.exp(-p * p) * k * smooth(-0.3, 0.3, fbm(along * 0.3 + at * 3, at, 4) + 0.15);
          }
          const lace = smooth(0.2, 0.6, fbm(along * 2.2, ds * 0.08, 4) + 0.3) * smooth(80, 0, ds);
          foam = clamp(foam + lace * 0.35);
          o[0] = mix(o[0], fc[0] * 0.35, foam); o[1] = mix(o[1], fc[1] * 0.35, foam); o[2] = mix(o[2], fc[2] * 0.35, foam);
          if (fire) add3(o, fic, foam * foam * fire * (0.6 + 0.4 * noise(along * 0.5, ds * 0.05)));
        }
      }
    });
  }
  /** Still water lying in sand or rock: a near-perfect mirror with a dark rim. */
  function pool(m, cfg) {
    const { snap, mirror, tint = '#0c1418', fire = 0, fireC = '#3ef0ff' } = cfg;
    const t = lin(tint), fc = lin(fireC), c = [0, 0, 0];
    const pil = K.pillow(m, 14);
    const n = [0, 0, 1];
    K.paint(m, (x, y, o, cov, i) => {
      const f = pil(i, n, 1);
      snap(x + noise(x * 0.05, y * 0.2) * 3, 2 * mirror(x) - y, c);
      const edge = smooth(0.05, 0.6, f);
      o[0] = mix(t[0], c[0] * 0.8, edge); o[1] = mix(t[1], c[1] * 0.8, edge); o[2] = mix(t[2], c[2] * 0.8, edge);
      if (fire) add3(o, fc, (1 - edge) * fire * 0.4);
    });
  }

  // ---- sand ----------------------------------------------------------------------------------------
  /**
   * The beach as a plane from eye height: wind ripples raked by the low light, darker and
   * glassy where the last wave left it wet, shells and grit near at hand.
   */
  function sand(m, cfg) {
    const { hy, L, tint = '#9a8a74', hazeC, haze = () => 0, wet = () => 0, snap, mirror = () => hy, ripple = 1, debris = 1 } = cfg;
    const base = lin(tint), wetC = lin('#2e2a26'), hc = lin(hazeC), weedC = lin('#141a10');
    const c = [0, 0, 0], n = [0, 0, 1], li = [0, 0, 0];
    K.paint(m, (x, y, o) => {
      const dy = Math.max(0.5, y - hy), D = (F * EYE) / dy, wx = ((x - 960) * D) / F;
      // ripples a hand's width apart, square to the wind, wandering; they fade before they
      // are too fine for a pixel to show
      const ph = (wx * 0.35 + D * 0.95) * 22 + fbm(wx * 0.25, D * 0.25, 3) * 14;
      const fine = clamp(1.4 - D / 18);
      const s = (Math.sin(ph) * 0.7 + Math.sin(ph * 2.1 + 1) * 0.15) * ripple * fine;
      const pr = smooth(0.0, 0.4, fbm(wx * 0.05 + 3, D * 0.08, 4)) * 0.55; // ripples in patches, flats between
      n[0] = s * 0.5 * pr + fbm(wx * 3, D * 3, 3) * 0.15 * fine; n[1] = -0.92 + s * 0.45 * pr; n[2] = 0.3;
      K.norm(n);
      light(n, L, li);
      const v = 0.85 + 0.3 * fbm(wx * 0.4, D * 0.4, 4);
      const grit = hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) > 0.985 && D < 12 ? 0.6 : 1;
      const w = clamp(wet(x, y));
      // wrack: strands of weed and dark grit the tide has strewn, in drifts
      const wrack = debris * smooth(0.55, 0.75, fbm(wx * 0.9, D * 2.5, 4) * 0.5 + 0.5 + fbm(wx * 0.05, D * 0.3, 2) * 0.4) * smooth(40, 6, D);
      const dark = 1 - wrack * 0.8;
      o[0] = mix(mix(base[0] * v, wetC[0], w), weedC[0], wrack) * li[0] * grit * dark;
      o[1] = mix(mix(base[1] * v, wetC[1], w), weedC[1], wrack) * li[1] * grit * dark;
      o[2] = mix(mix(base[2] * v, wetC[2], w), weedC[2], wrack) * li[2] * grit * dark;
      if (w > 0.02 && snap) {
        snap(x + fbm(wx, D * 2, 3) * 6, 2 * mirror(x) - y, c);
        const k = w * 0.55 * (0.6 + 0.4 * clamp(1 - dy / 500));
        o[0] += c[0] * k; o[1] += c[1] * k; o[2] += c[2] * k;
      }
      haze3(o, hc, haze(x, y));
    });
  }

  // ---- the wreck ---------------------------------------------------------------------------------
  /**
   * The ship, side on: bow to the left, stern to the right, the sand at y = 0 in its own
   * frame. Her back is broken behind the mainmast and the hull is torn open at the sand.
   * Returns masks of her parts, so the scene can light, reflect and bury them.
   */
  function wreck(cfg) {
    const { x, y, scale, rot, flip = false } = cfg;
    const c = Math.cos(rot), s = Math.sin(rot), fx = flip ? -1 : 1;
    const T = [scale * c * fx, scale * s * fx, -scale * s, scale * c, x, y];
    const det = T[0] * T[3] - T[1] * T[2];
    const local = (X, Y, out) => { const dx = X - T[4], dy = Y - T[5]; out[0] = (T[3] * dx - T[2] * dy) / det; out[1] = (-T[1] * dx + T[0] * dy) / det; return out; };
    const at = (ctx) => ctx.transform(T[0], T[1], T[2], T[3], T[4], T[5]);
    const w = (lw) => lw / scale;

    const deck = [[-18, -118], [40, -112], [95, -106], [150, -92], [230, -86], [282, -76], [300, -60], [318, -70], [345, -82], [420, -92], [470, -108], [520, -128], [575, -148], [606, -156]];
    const hullPath = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(deck[0][0], deck[0][1]);
      for (const p of deck) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(614, -146); ctx.lineTo(606, -96); ctx.quadraticCurveTo(600, -30, 584, 6);
      ctx.lineTo(40, 8);
      ctx.quadraticCurveTo(-12, -30, -18, -118);
      ctx.closePath();
    };
    const hull = K.mask((ctx) => { at(ctx); hullPath(ctx); ctx.fill(); });
    // the breach: a ragged hole in her side at the sand, wide enough to walk into
    const breachPts = [[236, 8], [240, -22], [252, -40], [266, -36], [276, -58], [292, -50], [300, -66], [316, -48], [334, -56], [344, -34], [356, -38], [362, -14], [372, 8]];
    const breach = K.mask((ctx) => { at(ctx); poly(ctx, breachPts); ctx.fill(); });
    const spars = K.mask((ctx) => {
      at(ctx);
      const mast = (bx, by, len, ang, w0, w1, broken) => {
        const ex = bx + Math.sin(ang) * len, ey = by - Math.cos(ang) * len;
        const nx = Math.cos(ang), ny = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(bx - nx * w0, by - ny * w0); ctx.lineTo(bx + nx * w0, by + ny * w0);
        if (broken) { ctx.lineTo(ex + nx * w1, ey + ny * w1 + 14); ctx.lineTo(ex + nx * w1 * 0.2, ey + 4); ctx.lineTo(ex - nx * w1 * 0.4, ey + 18); ctx.lineTo(ex - nx * w1, ey + 10); }
        else { ctx.lineTo(ex + nx * w1, ey + ny * w1); ctx.lineTo(ex - nx * w1, ey - ny * w1); }
        ctx.closePath(); ctx.fill();
        return [ex, ey];
      };
      const yard = (cx, cy, half, ang, wd) => {
        ctx.lineWidth = wd; ctx.beginPath();
        ctx.moveTo(cx - Math.cos(ang) * half, cy - Math.sin(ang) * half); ctx.lineTo(cx + Math.cos(ang) * half, cy + Math.sin(ang) * half); ctx.stroke();
      };
      mast(92, -104, 250, -0.05, 7, 5, true);              // foremast, snapped
      mast(248, -86, 470, -0.07, 8, 3.5, false);           // mainmast
      mast(470, -106, 330, 0.11, 6.5, 3, false);           // mizzen, leaning aft
      ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-10, -112); ctx.lineTo(-175, -196); ctx.stroke(); // bowsprit
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-100, -158); ctx.lineTo(-210, -214); ctx.stroke();
      yard(222, -390, 120, 0.13, 7);   // main yard, hanging askew
      yard(232, -486, 78, 0.05, 5);    // main topsail yard
      yard(510, -330, 70, -0.32, 5);   // mizzen yard
      yard(130, -250, 86, 0.62, 6);    // fore yard, fallen against the stump
      // her broken frames stand up out of the break like ribs
      ctx.lineWidth = 4;
      for (const [fx0, h, lean] of [[284, 30, -0.3], [296, 44, -0.15], [309, 36, 0.1], [322, 26, 0.3], [334, 18, 0.35]]) { ctx.beginPath(); ctx.moveTo(fx0, -64); ctx.lineTo(fx0 + lean * h, -64 - h); ctx.stroke(); }
      // the rail and the stern lantern's bracket
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(600, -156); ctx.lineTo(618, -178); ctx.stroke();
    });
    const rigging = K.mask((ctx) => {
      at(ctx);
      ctx.lineWidth = w(1.3);
      const line = (a, b, sag = 0) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag, b[0], b[1]); ctx.stroke(); };
      const shrouds = (top, foot0, foot1, n) => {
        for (let k = 0; k <= n; k++) { const t = k / n; line(top, [mix(foot0[0], foot1[0], t), mix(foot0[1], foot1[1], t)]); }
        ctx.lineWidth = w(0.9);
        for (let r = 0.25; r < 0.95; r += 0.07) {
          const a = [mix(top[0], foot0[0], r), mix(top[1], foot0[1], r)], b = [mix(top[0], foot1[0], r), mix(top[1], foot1[1], r)];
          line(a, b);
        }
        ctx.lineWidth = w(1.3);
      };
      shrouds([216, -500], [200, -90], [276, -84], 5);
      shrouds([505, -420], [470, -104], [520, -116], 4);
      line([216, -548], [-205, -212], 26);        // forestay to the bowsprit
      line([216, -548], [505, -425], 30);         // stay between the masts
      line([505, -425], [612, -160], 18);         // backstay
      line([-175, -196], [80, -330], 40);         // jib stay to the broken foremast, slack
      line([102, -348], [140, -96], 30);          // loose halyard
      line([340, -381], [430, -100], 60);         // a sheet hanging from the yard
      line([110, -390], [60, -110], 40);
      line([160, -250], [40, -112], 20);
    });
    const sails = K.mask((ctx) => {
      at(ctx);
      const r = K.rng(5);
      const rag = (pts, tear) => {
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const n = tear ? 6 : 1;
          for (let k = 1; k <= n; k++) { const t = k / n; ctx.lineTo(mix(a[0], b[0], t) + (tear && i === pts.length - 2 ? (r() - 0.5) * 18 : 0), mix(a[1], b[1], t) + (tear && i === pts.length - 2 ? r() * 30 : 0)); }
        }
        ctx.closePath(); ctx.fill();
      };
      // main course: torn, hanging in tongues from the crooked yard
      rag([[106, -405], [338, -374], [326, -300], [300, -200], [250, -250], [200, -170], [168, -260], [120, -300]], true);
      // the topsail, mostly gone: a few strips
      for (const [x0, len] of [[178, 70], [214, 110], [252, 60], [286, 90]]) rag([[x0, -490], [x0 + 22, -489], [x0 + 18 + r() * 8, -490 + len], [x0 + 4, -490 + len * 0.8]], false);
      // the fore course, fallen with its yard and draped over the rail
      rag([[66, -296], [190, -206], [180, -150], [140, -110], [96, -118], [70, -200]], true);
      // mizzen lateen, slashed
      rag([[456, -352], [566, -308], [540, -250], [500, -200], [470, -260]], true);
    });
    // holes in the canvas
    const holes = K.mask((ctx) => {
      at(ctx);
      const r = K.rng(9);
      for (let i = 0; i < 7; i++) { const x0 = 120 + r() * 200, y0 = -370 + r() * 140; poly(ctx, [[x0, y0], [x0 + 4 + r() * 10, y0 + 6 + r() * 20], [x0 + 2, y0 + 30 + r() * 30], [x0 - 3 - r() * 6, y0 + 12]]); }
    });
    // the stern: its windows, and the lantern
    const windows = K.mask((ctx) => { at(ctx); for (let k = 0; k < 4; k++) ctx.fillRect(540 + k * 16, -128 - k * 3, 9, 13); });
    return {
      hull, breach, spars, rigging, sails: K.minus(sails, holes), windows, local, at,
      point: (lx, ly) => [T[0] * lx + T[2] * ly + T[4], T[1] * lx + T[3] * ly + T[5]],
      deck,
    };
  }
  function paintWreck(wk, cfg) {
    const { L, hazeC = '#000', haze = () => 0, lantern = '#ffb060', inside = '#ff9a4a', sail = '#d9a070' } = cfg;
    const hc = lin(hazeC), wood = lin('#2b2219'), bleached = lin('#6a5d4e'), algae = lin('#1b2618'), lc = lin(lantern), ic = lin(inside), sc = lin(sail);
    const n = [0, 0, 1], li = [0, 0, 0], lp = [0, 0];
    const pil = K.pillow(wk.hull, 46);
    K.paint(wk.hull, (x, y, o, cov, i) => {
      pil(i, n, 1.3);
      wk.local(x, y, lp);
      const lx = lp[0], ly = lp[1];
      // strakes run along her, curving up toward bow and stern
      const sheer = 0.0004 * (lx - 300) * (lx - 300);
      const v = (ly + sheer) / 11;
      const fv = v - Math.floor(v);
      const seam = smooth(0.1, 0.0, fv) + smooth(0.9, 1.0, fv) * 0.4;
      const wale = (Math.abs(ly + sheer + 64) < 6 ? 1 : 0) + (Math.abs(ly + sheer + 30) < 5 ? 1 : 0);
      const plank = Math.floor(v) * 13.7;
      const butt = (lx + hash(plank, 1) * 300) % 95 < 2 ? 1 : 0;
      n[1] += (fv - 0.5) * 0.35 + wale * -0.2;
      K.norm(n);
      light(n, L, li);
      const grain = 0.75 + 0.5 * fbm(lx * 0.03, ly * 0.4 + plank, 3) + (hash(plank, 3) - 0.5) * 0.25;
      const bleach = smooth(-40, -130, ly) * 0.5 * smooth(0.0, 0.5, fbm(lx * 0.01, ly * 0.02, 3) + 0.3);
      const low = smooth(-30, 0, ly);
      let a0 = mix(wood[0], bleached[0], bleach) * grain, a1 = mix(wood[1], bleached[1], bleach) * grain, a2 = mix(wood[2], bleached[2], bleach) * grain;
      a0 = mix(a0, algae[0], low * 0.8); a1 = mix(a1, algae[1], low * 0.8); a2 = mix(a2, algae[2], low * 0.8);
      const dark = (1 - seam * 0.6) * (1 - wale * 0.35) * (1 - butt * 0.5);
      o[0] = a0 * li[0] * dark; o[1] = a1 * li[1] * dark; o[2] = a2 * li[2] * dark;
      // gunports: dark squares along her side, one or two gaping
      const gx = (lx - 40) / 62, gi = Math.floor(gx), gf = gx - gi;
      if (lx > 30 && lx < 560 && gf > 0.38 && gf < 0.6 && ly + sheer > -74 && ly + sheer < -60 && hash(gi, 2) > 0.25) { o[0] *= 0.15; o[1] *= 0.15; o[2] *= 0.15; }
      haze3(o, hc, haze(x, y));
    });
    // the dark of the hold through the breach: her ribs against a lamp somewhere inside
    K.paint(wk.breach, (x, y, o) => {
      wk.local(x, y, lp);
      const d = Math.hypot((lp[0] - 318) / 60, (lp[1] + 22) / 34);
      const lamp = Math.exp(-d * d * 2.2) * 0.22 + 0.008;
      const rib = Math.abs(((lp[0] + 6) % 24) - 12) < 3.2 ? 0.25 : 1;
      const floor = smooth(-6, 4, lp[1]);
      o[0] = (ic[0] * lamp * rib + 0.004) * (1 - floor * 0.6); o[1] = (ic[1] * lamp * rib + 0.003) * (1 - floor * 0.6); o[2] = (ic[2] * lamp * rib + 0.004) * (1 - floor * 0.6);
    });
    const sp = K.pillow(wk.spars, 6);
    K.paint(wk.spars, (x, y, o, cov, i) => {
      sp(i, n, 2);
      light(n, L, li);
      const g = 0.7 + 0.3 * fbm(x * 0.2, y * 0.02, 3);
      o[0] = wood[0] * li[0] * g; o[1] = wood[1] * li[1] * g; o[2] = wood[2] * li[2] * g;
      haze3(o, hc, haze(x, y));
    });
    K.paint(wk.rigging, (x, y, o) => { o[0] = 0.012; o[1] = 0.01; o[2] = 0.01; haze3(o, hc, haze(x, y) * 0.8); });
    // sails: thin and lit through from behind, darker where they fold and where they are doubled
    const sailPil = K.pillow(wk.sails, 10);
    K.paint(wk.sails, (x, y, o, cov, i) => {
      wk.local(x, y, lp);
      const edge = sailPil(i, n, 1);
      // hanging canvas: long vertical folds, seams between the cloths, salt stains and rot
      const fold = fbm(lp[0] * 0.05, lp[1] * 0.006, 4);
      const seam = smooth(0.05, 0.0, Math.abs(((lp[0] + 1000) % 22) / 22 - 0.5) - 0.44);
      const stain = smooth(0.0, 0.5, fbm(lp[0] * 0.02 + 3, lp[1] * 0.02, 4) + 0.1);
      const thin = 1 - edge * 0.5;
      const toward = cfg.light ? Math.exp(-Math.hypot(x - cfg.light[0], y - cfg.light[1]) / cfg.light[2]) : 1;
      const k = (0.12 + 0.55 * smooth(-0.4, 0.5, fold)) * (1 - seam * 0.4) * (1 - stain * 0.6) * cfg.sailK * (0.5 + thin * 0.6) * (0.3 + toward);
      o[0] = sc[0] * k; o[1] = sc[1] * k; o[2] = sc[2] * k;
      o[3] = 0.7 + stain * 0.25;
      haze3(o, hc, haze(x, y) * 0.6);
    });
    K.paint(wk.windows, (x, y, o) => { o[0] = lc[0] * 0.5; o[1] = lc[1] * 0.4; o[2] = lc[2] * 0.25; });
  }

  // ---- people ------------------------------------------------------------------------------------
  /**
   * Cloth: a silhouette swelled into folds. Wet cloth clings, so the folds are many and small,
   * and it shines a little where it turns to the light.
   */
  function cloth(m, cfg) {
    const { L, tint, radius = 18, folds = 1, sheen = 0.2, seed = 0, flow = 0 } = cfg;
    const pil = K.pillow(m, radius);
    const base = lin(tint);
    const n = [0, 0, 1], li = [0, 0, 0];
    K.paint(m, (x, y, o, cov, i) => {
      const f = pil(i, n, 1.4);
      const s0 = n[0], s1 = n[1], s2 = n[2];
      const u = x * Math.cos(flow) + y * Math.sin(flow), v = -x * Math.sin(flow) + y * Math.cos(flow);
      const fl = fbm(u * 0.012 * folds + seed, v * 0.05 * folds, 4);
      n[0] += Math.cos(fl * 9) * 0.35; n[1] += Math.sin(fl * 7) * 0.25;
      K.norm(n);
      light(n, L, li, [s0, s1, s2]);
      const ao = 0.35 + 0.65 * smooth(0, 0.7, f);
      const g = 0.8 + 0.35 * fbm(x * 0.05, y * 0.05, 3);
      o[0] = base[0] * li[0] * ao * g; o[1] = base[1] * li[1] * ao * g; o[2] = base[2] * li[2] * ao * g;
      const sh = Math.pow(clamp(dot(n, L.sun) + 0.2), 6) * sheen;
      add3(o, L.sunC, sh);
    });
  }
  /** Skin, cold. */
  function skin(m, cfg) {
    const { L, tint = '#8f8a80', radius = 8 } = cfg;
    const pil = K.pillow(m, radius);
    const base = lin(tint), n = [0, 0, 1], li = [0, 0, 0];
    K.paint(m, (x, y, o, cov, i) => {
      pil(i, n, 1.2); light(n, L, li);
      o[0] = base[0] * li[0]; o[1] = base[1] * li[1]; o[2] = base[2] * li[2];
    });
  }

  return {
    F, EYE, poly, blob, ridge, ribbon, curve, sky, paintSky, moon, stars, clouds, glow, mist, shafts, birds, motes,
    light, lights, basaltColumns, basalt, turf, rock, range, sea, pool, sand, wreck, paintWreck, cloth, skin,
    /** Screen y of the ground at a distance, and the distance at a screen y. */
    groundY: (hy, d) => hy + (F * EYE) / d,
    depth: (hy, y) => (F * EYE) / Math.max(0.5, y - hy),
  };
})();
