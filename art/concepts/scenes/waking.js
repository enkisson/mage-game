// 1. Waking. You come to on the beach at the last of the dusk. The ship is broken on the foot
// of a basalt headland, the sunset behind her; a waterfall comes down the cliffs into a
// stream across the sand; the gorge that leads inland opens in the cliffs to the right; far
// off, on the peak, a light burns in a tower inside a slow wheel of cloud. The dead mage lies
// where the tide left him, his hand on his journal.
window.SCENE = async () => {
  const { lin, fbm, noise, smooth, clamp, mix, ridged } = K;
  const HY = 600;
  const SUN = { x: 470, y: 640 };
  const skyFn = C.sky({
    hy: HY, sun: { x: SUN.x, w: 300, h: 0.16, power: 2.6 },
    stops: [[0, '#8c7690'], [0.07, '#6e5a86'], [0.2, '#463f78'], [0.42, '#252a5a'], [0.7, '#141a40'], [1, '#090c22']],
    glow: '#ffb06a', glow2: '#ff6a58',
  });
  C.paintSky(skyFn, HY);
  C.stars(HY, 0.006);
  C.clouds({ hy: HY, sun: { ...SUN, spread: 520, lift: 420 }, lit: '#ff8a66', dark: '#2a2648', rim: '#ffc890', top: 0, bottom: 360, cover: 0.12, stretch: 7, scale: 0.8, seed: 3, alpha: 0.85 });
  C.clouds({ hy: HY, sun: { ...SUN, spread: 380, lift: 160 }, lit: '#ffa070', dark: '#3a2f52', rim: '#ffd8a0', top: 380, bottom: HY - 4, cover: 0.2, stretch: 4, scale: 1.4, seed: 11, alpha: 0.9 });

  // ---- the peak, and the tower on it, in its wheel of cloud ----------------------------------
  const PX = 1360, PY = 236;
  const cone = (x, cx, cy, k) => cy + Math.pow(Math.abs(x - cx), 1.12) * k;
  const peakY = (x) => Math.min(cone(x, PX, PY, 0.62), cone(x, 1590, 330, 0.66), cone(x, 1150, 352, 0.7), cone(x, 1790, 392, 0.6), cone(x, 960, 430, 0.5))
    + fbm(x * 0.012, 3, 4) * 18 - (ridged(x * 0.018, 1, 3) - 0.5) * 26;
  // the wheel of cloud: a slow spiral round the summit, lit from inside
  const vMask = K.mask((c) => c.fillRect(PX - 560, 0, 1120, 470));
  K.paint(vMask, (x, y, o) => {
    const dx = x - PX, dy = (y - (PY - 60)) * 2.6, r = Math.hypot(dx, dy) + 1;
    const a = Math.atan2(dy, dx) - Math.log(r) * 1.9;
    const warp = fbm(x * 0.004, y * 0.006, 3) * 1.4;
    const arms = fbm(Math.cos(a + warp) * 1.6 + r * 0.002, Math.sin(a + warp) * 1.6 - r * 0.003, 6);
    const d = smooth(-0.05, 0.45, arms + 0.1) * smooth(50, 140, r) * smooth(560, 280, r) * (0.6 + 0.4 * fbm(x * 0.01, y * 0.02, 4));
    if (d < 0.003) return false;
    const inner = Math.exp(-r / 170);
    o[0] = mix(0.03, 0.26, inner); o[1] = mix(0.028, 0.11, inner); o[2] = mix(0.06, 0.42, inner);
    o[3] = d * 0.8;
  });
  const peak = K.mask((c) => C.poly(c, [...C.ridge(820, 1920, 3, (x) => Math.min(peakY(x), 560)), [1920, 640], [820, 640]]));
  const Lfar = C.lights({ sun: [-0.9, 0.05, -0.2], sunC: '#ff8a7a', sunK: 2.2, skyC: '#5a5f90', skyK: 1.3, bounceC: '#000000', rim: 0.6 });
  C.range(peak, { L: Lfar, tint: '#565262', hazeC: '#4a4470', haze: (x, y) => 0.32 + smooth(260, 580, y) * 0.45, gully: 1.1, seed: 4, snow: 0.9, ridgeY: peakY, relief: 1.3 });
  // the tower: a dark needle, one window alight
  const tower = K.mask((c) => C.poly(c, [[PX - 8, PY + 8], [PX - 5, PY - 44], [PX - 8, PY - 48], [PX - 3, PY - 56], [PX, PY - 70], [PX + 3, PY - 56], [PX + 8, PY - 48], [PX + 5, PY - 44], [PX + 8, PY + 8]]));
  K.paint(tower, (x, y, o) => { o[0] = 0.018; o[1] = 0.016; o[2] = 0.03; });
  C.glow(PX, PY - 40, 6, '#d0a8ff', 7);
  C.glow(PX, PY - 40, 70, '#8a5aff', 0.3);
  K.paint(K.mask((c) => c.fillRect(PX - 30, 0, 60, PY - 40)), (x, y, o) => {
    const k = (Math.exp(-Math.pow((x - PX) / 1.6, 2)) * 0.45 + Math.exp(-Math.pow((x - PX) / 12, 2)) * 0.05) * smooth(0, PY - 40, y);
    o[0] = 0.55 * k; o[1] = 0.35 * k; o[2] = 1.0 * k;
  }, true);

  // ---- the plateau and the north cliffs, the falls and the gorge in them ------------------------
  const plateauY = (x) => 452 + fbm(x * 0.004, 7, 4) * 30 - smooth(900, 1500, x) * 16;
  const plateau = K.mask((c) => C.poly(c, [...C.ridge(700, 1920, 6, plateauY), [1920, 640], [700, 640]]));
  C.range(plateau, { L: { ...Lfar, sunC: Lfar.sunC.map((v) => v * 0.15) }, tint: '#3b3a46', hazeC: '#3d3858', haze: () => 0.5, gully: 2, seed: 9, ridgeY: plateauY, relief: 0.6 });
  const FALL = 1488, GORGE = 1704;
  const northTop = (x) => 430 + fbm(x * 0.006, 2, 4) * 24 - smooth(1580, 1920, x) * 34 + Math.exp(-Math.pow((x - FALL) / 30, 2)) * 22;
  const northBase = (x) => 608 + (x - 900) * 0.003;
  const north = C.basaltColumns({ x0: 880, x1: 1930, top: northTop, base: northBase, colW: 15, seed: 2, step: 16, lean: 0.03 });
  const northM = K.mask((c) => north.outline(c));
  const Lcliff = C.lights({ sun: [-0.95, -0.1, -0.1], sunC: '#d07a6a', sunK: 0.9, wrap: 0.8, skyC: '#5a6698', skyK: 1.6, bounceC: '#4a3a30', bounceK: 0.6, rim: 0.4 });
  C.basalt(northM, north, { L: Lcliff, hazeC: '#3a3656', haze: (x, y) => 0.36 + smooth(520, 610, y) * 0.2, colW: 15, wetLine: () => 640, tint: '#4a4b55', salt: 0.08, warmth: 0.5, contrast: 0.45 });
  C.turf(north.pts.slice(1, north.cols.length * 3 + 1), { L: Lcliff, tint: '#2e3622', depth: 4, blades: 0.7, seed: 4, hazeC: '#3a3656', haze: () => 0.4 });
  // the gorge: a dark cleft running back into the island, mist in it, a far light where the path goes
  const gorge = K.mask((c) => C.poly(c, [[GORGE - 44, 612], [GORGE - 30, 520], [GORGE - 20, 452], [GORGE - 4, 420], [GORGE + 12, 430], [GORGE + 26, 470], [GORGE + 34, 540], [GORGE + 46, 614]]), 1.5);
  K.paint(gorge, (x, y, o) => {
    const depthK = 1 - Math.abs(x - GORGE) / 46;
    const g = 0.5 + 0.5 * fbm(x * 0.05, y * 0.02, 3);
    o[0] = mix(0.03, 0.06, depthK) * g; o[1] = mix(0.03, 0.055, depthK) * g; o[2] = mix(0.05, 0.1, depthK) * g;
  });
  C.mist({ y0: 470, y1: 610, color: '#4a4a6a', alpha: 0.6, scale: 4, seed: 5, x0: GORGE - 40, x1: GORGE + 40 });
  K.paint(K.mask((c) => c.fillRect(GORGE - 12, 420, 24, 180)), (x, y, o) => {
    const k = Math.exp(-Math.pow((x - GORGE - 2) / 1.4, 2)) * smooth(600, 470, y) * smooth(430, 520, y) * 0.9;
    o[0] = 1.2 * k; o[1] = 0.85 * k; o[2] = 0.4 * k;
  }, true);
  // the waterfall: white water falling in strands, and its spray
  const fallM = K.mask((c) => C.poly(c, [[FALL - 12, northTop(FALL) - 2], [FALL + 13, northTop(FALL) - 2], [FALL + 26, 609], [FALL - 24, 609]]));
  K.paint(fallM, (x, y, o) => {
    const s = fbm((x - FALL) * 0.3, y * 0.012 - 3, 4);
    const k = smooth(-0.35, 0.4, s) * (0.6 + 0.4 * smooth(440, 600, y));
    o[0] = 0.3 * k + 0.02; o[1] = 0.34 * k + 0.025; o[2] = 0.44 * k + 0.04;
    o[3] = 0.3 + 0.7 * smooth(-0.6, 0.2, s);
  });
  C.mist({ y0: 560, y1: 630, color: '#8a96b8', alpha: 0.55, scale: 5, seed: 8, x0: FALL - 70, x1: FALL + 70 });

  // ---- the headland, west, the sun just behind its last shoulder ---------------------------------
  const headTop = (x) => (x < 360 ? 100 + x * 0.17 + fbm(x * 0.01, 1, 3) * 30 : 100 + 360 * 0.17 + Math.pow((x - 360) / 160, 2.2) * 420 + fbm(x * 0.02, 5, 3) * 16);
  const headBase = (x) => 640 + fbm(x * 0.02, 9, 3) * 14 + noise(x * 0.08, 2) * 5;
  const head = C.basaltColumns({ x0: -20, x1: 530, top: (x) => Math.min(headTop(x), 646), base: headBase, colW: 36, seed: 6, step: 44, lean: -0.05 });
  const headM = K.mask((c) => head.outline(c));
  const Lhead = C.lights({ sun: [-0.95, 0.05, -0.25], sunC: '#ff8a50', sunK: 2.6, wrap: 0.3, skyC: '#5a6698', skyK: 1.5, bounceC: '#4a3a30', bounceK: 0.6, rim: 2.6 });
  C.basalt(headM, head, { L: Lhead, hazeC: '#3a3352', haze: (x, y) => 0.1 + smooth(500, 640, y) * 0.12, colW: 36, wetLine: () => 604, tint: '#41424a', salt: 0.7, seed: 4, warmth: 0.6, contrast: 0.6, vis: (x) => smooth(360, 520, x) });
  C.turf(head.pts.slice(1, head.cols.length * 3 + 1), { L: Lhead, tint: '#2c331f', depth: 10, blades: 1.3, seed: 7 });
  // the edge of the headland nearest the sun burns
  K.paint(headM, (x, y, o) => {
    const k = Math.exp(-Math.max(0, y - headTop(x)) / 7) * smooth(280, 520, x) * 0.8;
    if (k < 0.01) return false;
    o[0] = 1.0 * k; o[1] = 0.45 * k; o[2] = 0.2 * k;
  }, true);

  // ---- the wreck ---------------------------------------------------------------------------------
  const wk = C.wreck({ x: 368, y: 594, scale: 1.08, rot: 0.085 });
  const Lship = C.lights({ sun: [-0.9, 0.1, -0.4], sunC: '#ff9058', sunK: 1.2, wrap: 0.4, skyC: '#5a6698', skyK: 1.8, bounceC: '#5a4434', bounceK: 0.8, rim: 2.4 });
  const footRocks = K.mask((c) => {
    const r = K.rng(4);
    for (let i = 0; i < 24; i++) {
      const x = 230 + r() * 360, y = 604 + r() * 48, w = 20 + r() * 56, h = 14 + r() * 30, t = (r() - 0.5) * 0.6;
      C.poly(c, [[x - w / 2, y], [x - w / 2 + Math.cos(t) * 6, y - h], [x + w / 2 - 6, y - h + Math.sin(t) * w * 0.4], [x + w / 2, y]]);
    }
  });
  C.paintWreck(wk, { L: Lship, hazeC: '#2e2a44', haze: () => 0.08, sailK: 1.0, sail: '#d08a5a', light: [SUN.x, SUN.y, 260] });
  C.rock(footRocks, { L: Lhead, tint: '#3a3b42', radius: 10, rough: 2.5, seed: 3, wet: (x, y) => smooth(600, 636, y), k: 1.8, facet: 1.2, vis: (x) => smooth(380, 560, x) * 0.6 });

  // ---- the sea, between the headland and the beach --------------------------------------------
  const shore = (x) => (x < 820 ? 836 - x * 0.24 + fbm(x * 0.01, 2, 3) * 10 : HY);
  const seaM = K.minus(K.mask((c) => C.poly(c, [[0, HY], [830, HY], ...C.ridge(830, 0, 10, shore).reverse().slice(1)])), K.union(headM, wk.hull, footRocks));
  const snap = K.snapshot();
  C.sea(seaM, { hy: HY, sky: skyFn, snap, sun: { x: SUN.x + 40, y: 560, w: 60, h: 120, power: 0.9, c: lin('#ffb070') }, deep: '#0a1820', shore, fire: 1.6, calm: 0.9, rocks: K.union(headM, footRocks, K.mask((c) => C.poly(c, [[-20, 1090], [-20, 900], [40, 866], [120, 858], [190, 884], [250, 950], [276, 1090]]))) });

  // ---- the beach ---------------------------------------------------------------------------------
  const beachM = K.minus(K.mask((c) => C.poly(c, [[830, HY - 2], [1930, HY - 2], [1930, 1090], [-10, 1090], [-10, shore(0)], ...C.ridge(0, 830, 10, shore)])), K.union(wk.hull, northM, footRocks));
  const Lsand = C.lights({ sun: [-0.9, -0.3, -0.1], sunC: '#ff8a62', sunK: 0.9, wrap: 0.5, skyC: '#5e6a9c', skyK: 1.6, bounceC: '#000000', rim: 0 });
  const snap2 = K.snapshot();
  const streamPts = C.curve([[FALL, 609], [1430, 626], [1330, 646], [1200, 668], [1060, 690], [920, 704], [780, 702], [640, 690]], 14);
  const streamM = K.mask((c) => C.ribbon(c, streamPts, (t, p) => 5 + (p[1] - HY) * 0.55 + noise(t * 30, 1) * 4));
  const streamWet = K.mask((c) => C.ribbon(c, streamPts, (t, p) => 12 + (p[1] - HY) * 1.6), 6);
  C.sand(beachM, { hy: HY, L: Lsand, tint: '#8f7f6a', hazeC: '#4a4060', haze: (x, y) => smooth(700, 610, y) * 0.45,
    wet: (x, y) => Math.max(smooth(80, 0, y - shore(x)) * (x < 900 ? 1 : 0), streamWet.a[Math.min(K.H - 1, Math.round(y * K.S)) * K.W + Math.min(K.W - 1, Math.round(x * K.S))] * 0.85), snap: snap2, ripple: 1 });
  // sand banked against her side, and over the foot of her hull
  const drift = K.mask((c) => {
    const pts = [];
    for (let lx = 360; lx <= 600; lx += 10) { const [px, py] = wk.point(lx, 8); pts.push([px, py - 20 - noise(lx * 0.03, 4) * 14]); }
    const [ex, ey] = wk.point(600, 10);
    C.poly(c, [...pts, [ex + 70, ey + 14], [pts[0][0] - 40, pts[0][1] + 44]]);
  }, 6);
  C.sand(drift, { hy: HY, L: Lsand, tint: '#8a7a66', hazeC: '#4a4060', haze: () => 0.1, snap: snap2, debris: 0.4 });
  const snap3 = K.snapshot();
  C.pool(streamM, { snap: snap3, mirror: () => HY, tint: '#18222a' });

  const shadow = (pts, blur, k) => K.multiply(K.mask((c) => { C.blob(c, pts); c.fill(); }, blur), k);
  const Lnear = C.lights({ sun: [-0.9, -0.1, -0.35], sunC: '#ff9058', sunK: 1.2, wrap: 0.5, skyC: '#6a76a8', skyK: 1.9, bounceC: '#6a5a48', bounceK: 0.7, rim: 2.2 });

  // ---- a standing stone of the mage's, half fallen, the first sign of him ------------------------
  shadow([[1238, 662], [1300, 668], [1340, 676], [1262, 674]], 4, 0.5);
  const stone = K.mask((c) => { C.poly(c, [[1224, 664], [1230, 610], [1240, 566], [1256, 556], [1272, 568], [1270, 626], [1266, 666]]); C.poly(c, [[1272, 668], [1290, 650], [1328, 652], [1340, 666]]); });
  C.rock(stone, { L: Lnear, tint: '#4a4a4e', radius: 10, rough: 2, seed: 5, moss: 0.8, k: 1.4, facet: 0.6, hazeC: '#3a3654', haze: () => 0.15 });
  const glyph = K.mask((c) => { c.lineWidth = 1.6; c.beginPath(); c.moveTo(1240, 600); c.lineTo(1250, 588); c.lineTo(1258, 600); c.moveTo(1249, 590); c.lineTo(1249, 616); c.moveTo(1242, 610); c.lineTo(1256, 610); c.stroke(); }, 0.5);
  K.paint(glyph, (x, y, o) => { o[0] = 1.4; o[1] = 0.9; o[2] = 0.4; }, true);
  C.glow(1249, 602, 14, '#ffb060', 0.25);

  // ---- what the sea gave back ------------------------------------------------------------------
  shadow([[1040, 668], [1150, 676], [1190, 690], [1060, 692]], 6, 0.45);
  shadow([[1420, 640], [1470, 646], [1480, 652], [1430, 652]], 3, 0.5);
  const debris = K.mask((c) => {
    c.beginPath(); c.ellipse(1062, 660, 16, 20, 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(1112, 674, 23, 14, -0.1, 0, Math.PI * 2); c.fill();
    C.poly(c, [[896, 682], [900, 656], [936, 652], [938, 680]]);
    c.save(); c.translate(780, 712); c.rotate(-0.12); c.fillRect(-130, -6, 260, 12); c.restore();
    C.poly(c, [[1416, 646], [1418, 630], [1440, 628], [1442, 646]]);
    c.beginPath(); c.ellipse(1560, 652, 9, 7, 0, 0, Math.PI * 2); c.fill();
  });
  C.rock(debris, { L: Lnear, tint: '#4c3c2c', radius: 8, rough: 3, seed: 2, k: 1.4, facet: 0.3 });
  // right: a bank of broken columns, a torn sail washed up over it
  const rocksR = K.mask((c) => {
    C.poly(c, [[1700, 1090], [1690, 960], [1716, 840], [1760, 748], [1820, 704], [1888, 690], [1930, 700], [1930, 1090]]);
    C.poly(c, [[1556, 772], [1566, 716], [1612, 692], [1668, 690], [1712, 716], [1708, 770], [1630, 784]]);
    C.poly(c, [[1640, 860], [1660, 790], [1720, 770], [1736, 860]]);
  });
  C.rock(rocksR, { L: Lnear, tint: '#3a3c45', radius: 60, rough: 0.9, seed: 7, wet: (x, y) => smooth(0.2, 0.6, fbm(x * 0.01, y * 0.01, 3) + 0.3) * 0.5, moss: 0.5, k: 1.5, facet: 1 });
  const sailR = K.mask((c) => { C.blob(c, [[1586, 708], [1650, 694], [1702, 704], [1744, 748], [1730, 800], [1700, 830], [1650, 790], [1600, 768]]); c.fill(); });
  C.cloth(sailR, { L: Lnear, tint: '#8a7a64', radius: 12, folds: 2, sheen: 0.3, seed: 2, flow: 0.9 });
  // left: a black rock in the shallows, the last of the surf round it
  const rockL = K.mask((c) => C.poly(c, [[-20, 1090], [-20, 900], [40, 866], [120, 858], [190, 884], [250, 950], [276, 1090]]));
  C.rock(rockL, { L: { ...Lnear, skyC: Lnear.skyC.map((v) => v * 0.6) }, tint: '#26282e', radius: 70, rough: 0.8, seed: 13, wet: () => 0.85, k: 1.6, facet: 1 });
  // a bleached log, roots and all, on the sand in front of you
  shadow([[300, 1040], [560, 1012], [620, 1030], [340, 1066]], 8, 0.5);
  const log = K.mask((c) => {
    c.save(); c.translate(430, 1012); c.rotate(-0.1);
    C.blob(c, [[-170, -10], [-80, -18], [60, -16], [150, -10], [170, 4], [140, 16], [40, 18], [-90, 16], [-170, 10]]); c.fill();
    c.lineWidth = 7;
    for (const [a, l] of [[-2.6, 60], [-2.1, 50], [2.5, 55], [-3.0, 40]]) { c.beginPath(); c.moveTo(-160, 0); c.quadraticCurveTo(-160 + Math.cos(a) * l * 0.5, Math.sin(a) * l * 0.4, -160 + Math.cos(a) * l, Math.sin(a) * l); c.stroke(); }
    c.restore();
  });
  const logPil = K.pillow(log, 22), n = [0, 0, 1], li = [0, 0, 0], bone = lin('#6e685e');
  K.paint(log, (x, y, o, cov, i) => {
    logPil(i, n, 1.8);
    const sil = n.slice();
    const u = x * 0.995 + y * 0.1, v = -x * 0.1 + y * 0.995;
    const grain = 0.65 + 0.35 * fbm(u * 0.01, v * 0.35, 4) - Math.pow(K.ridged(u * 0.004, v * 0.12, 3), 6) * 0.4;
    n[1] += (grain - 0.65) * 0.8; K.norm(n);
    C.light(n, Lnear, li, sil);
    o[0] = bone[0] * grain * li[0]; o[1] = bone[1] * grain * li[1]; o[2] = bone[2] * grain * li[2];
  });
  // a pool on the sand, the sky in it
  const poolM = K.mask((c) => { C.blob(c, [[640, 980], [740, 960], [880, 964], [950, 986], [880, 1012], [720, 1014]]); c.fill(); }, 2);
  const snap4 = K.snapshot();
  C.pool(poolM, { snap: snap4, mirror: () => HY, tint: '#141b20' });

  // ---- the dead mage, sitting where the tide left him, against a rock, his book in his lap ---------
  const Lfig = C.lights({ sun: [-0.9, -0.1, -0.35], sunC: '#ff9058', sunK: 1.2, wrap: 0.5, skyC: '#6a76a8', skyK: 1.6, bounceC: '#9a7040', bounceK: 1.2, rim: 2.6 });
  const BK = [1318, 848]; // the book
  shadow([[1250, 930], [1460, 926], [1560, 950], [1300, 960]], 12, 0.5);
  // the rock he leans on
  const seat = K.mask((c) => C.poly(c, [[1380, 940], [1388, 840], [1420, 760], [1480, 730], [1540, 742], [1570, 800], [1580, 940]]));
  C.rock(seat, { L: Lnear, tint: '#363841', radius: 40, rough: 1, seed: 21, moss: 0.6, k: 1.5, facet: 1, wet: () => 0.2 });
  // the leg stretched out along the sand, under the cloak
  const leg = K.mask((c) => { C.ribbon(c, C.curve([[1368, 922], [1310, 928], [1250, 934], [1208, 936]], 8), (t) => 34 - t * 16); });
  C.cloth(leg, { L: Lfig, tint: '#2f2b28', radius: 10, folds: 2.5, sheen: 0.2, seed: 2, flow: 0.05 });
  const cloak = K.mask((c) => {
    // hunched back and slumped shoulders, falling into a cloak spread on the sand
    C.blob(c, [[1340, 790], [1352, 772], [1378, 764], [1404, 770], [1420, 790], [1428, 826], [1436, 868], [1452, 904], [1478, 934], [1470, 944], [1404, 946], [1352, 942], [1318, 934], [1302, 916], [1300, 890], [1312, 862], [1326, 826]]); c.fill();
    // the knee drawn up, the cloak hanging off it in a long fold
    C.blob(c, [[1300, 880], [1304, 850], [1318, 836], [1340, 840], [1350, 862], [1344, 900], [1326, 918], [1306, 912]]); c.fill();
    // the arm that has fallen to his side
    C.ribbon(c, C.curve([[1410, 800], [1424, 846], [1434, 888], [1440, 918]], 6), (t) => 20 - t * 6);
  });
  C.cloth(cloak, { L: Lfig, tint: '#363b4c', radius: 16, folds: 1.8, sheen: 0.45, seed: 5, flow: 1.35 });
  const hood = K.mask((c) => { C.blob(c, [[1324, 794], [1318, 764], [1330, 734], [1356, 716], [1386, 716], [1402, 736], [1404, 768], [1388, 790], [1356, 800]]); c.fill(); });
  C.cloth(hood, { L: Lfig, tint: '#30354a', radius: 15, folds: 2.2, sheen: 0.4, seed: 9, flow: 1.0 });
  // the dark inside the hood, the bowed head in it
  const hollow = K.mask((c) => { C.blob(c, [[1322, 768], [1334, 748], [1352, 746], [1356, 770], [1348, 794], [1328, 792]]); c.fill(); }, 1.5);
  K.paint(hollow, (x, y, o) => { const k = Math.exp(-Math.hypot(x - BK[0], y - BK[1]) / 70); o[0] = 0.01 + 0.3 * k; o[1] = 0.008 + 0.17 * k; o[2] = 0.006 + 0.07 * k; });
  // the hand on the sand, the hands on the book, and the book open on his knee
  const hands = K.mask((c) => {
    C.blob(c, [[1294, 852], [1310, 844], [1318, 856], [1304, 864]]); c.fill();
    C.blob(c, [[1330, 846], [1346, 842], [1350, 856], [1336, 860]]); c.fill();
    C.blob(c, [[1432, 916], [1452, 914], [1462, 926], [1444, 932], [1430, 928]]); c.fill();
  });
  C.skin(hands, { L: Lfig, tint: '#aaa69c', radius: 3 });
  const book = K.mask((c) => C.poly(c, [[1290, 852], [1316, 840], [1346, 846], [1342, 858], [1316, 854], [1294, 862]]));
  K.paint(book, (x, y, o) => { const k = 0.6 + 0.4 * noise(x * 0.5, y * 0.5); o[0] = 1.6 * k; o[1] = 1.15 * k; o[2] = 0.6 * k; });
  K.paint(K.union(cloak, hood, hands, leg), (x, y, o) => {
    const d = Math.hypot(x - BK[0], (y - BK[1]) * 1.2);
    const k = Math.exp(-d / 34) * 0.5 * (y < BK[1] + 10 ? 1 : 0.4);
    o[0] = 0.9 * k; o[1] = 0.55 * k; o[2] = 0.22 * k;
  }, true);
  const trim = K.mask((c) => { c.lineWidth = 2; c.beginPath(); c.moveTo(1302, 930); c.quadraticCurveTo(1390, 950, 1474, 938); c.stroke(); }, 0.4);
  K.paint(trim, (x, y, o) => { const k = 0.4 + 0.6 * smooth(-0.2, 0.4, noise(x * 0.2, 1)); o[0] = 0.5 * k; o[1] = 0.33 * k; o[2] = 0.12 * k; });
  const boots = K.mask((c) => { c.beginPath(); c.ellipse(1206, 934, 13, 8, 0.2, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(1300, 918, 11, 8, -0.3, 0, Math.PI * 2); c.fill(); });
  C.rock(boots, { L: Lfig, tint: '#2a2018', radius: 5, rough: 2, k: 1.2, facet: 0.2 });
  const weed = K.mask((c) => { c.lineWidth = 2.2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(1372 + i * 9, 772 + i * 4); c.bezierCurveTo(1392 + i * 6, 806, 1386 + i * 8, 846 + i * 6, 1404 + i * 6, 886 + i * 8); c.stroke(); } }, 0.4);
  K.paint(weed, (x, y, o) => { o[0] = 0.012; o[1] = 0.03; o[2] = 0.012; o[3] = 0.85; });
  // the light that rises from the book
  K.paint(K.mask((c) => c.fillRect(BK[0] - 90, 0, 180, BK[1])), (x, y, o) => {
    const up = BK[1] - y;
    const k = (Math.exp(-Math.pow((x - BK[0]) / (3 + up * 0.004), 2)) * 0.7 + Math.exp(-Math.pow((x - BK[0]) / (18 + up * 0.03), 2)) * 0.1) * smooth(0, 60, up) * smooth(BK[1] - 140, 680, y) * smooth(120, 600, y);
    o[0] = 1.3 * k; o[1] = 0.9 * k; o[2] = 0.45 * k;
  }, true);
  C.glow(BK[0], BK[1], 26, '#ffc070', 1.3, 0.6);
  C.motes({ x: BK[0], y: BK[1] - 20, w: 80, h: 420, n: 46, color: '#ffd090', size: 1.5, power: 2.0, seed: 8 });

  // ---- light and air -----------------------------------------------------------------------------
  const [lx, ly] = wk.point(618, -182);
  C.glow(lx, ly, 6, '#ffd090', 5);
  C.glow(lx, ly, 46, '#ff9a4a', 0.45);
  const [bx, by] = wk.point(318, -24);
  C.glow(bx, by, 40, '#ff8a3a', 0.12, 0.6);
  C.mist({ y0: 560, y1: 660, color: '#3a3858', warm: '#d08070', sunX: SUN.x, spread: 420, alpha: 0.5, scale: 1, seed: 2 });
  C.mist({ y0: 600, y1: 720, color: '#2e2e48', warm: '#a06a6a', sunX: SUN.x, spread: 300, alpha: 0.28, scale: 1.6, seed: 9, x0: 700 });
  C.mist({ y0: 560, y1: 646, color: '#8a90a8', warm: '#ffb090', sunX: SUN.x, spread: 200, alpha: 0.35, scale: 3, seed: 4, x0: 200, x1: 620 });
  const solid = K.union(headM, wk.hull, wk.spars, wk.sails, wk.rigging, peak, northM, plateau);
  C.shafts({ x: SUN.x + 30, y: SUN.y - 10, threshold: 0.35, strength: 1.0, length: 0.9, color: '#ffb080',
    source: (x, y) => y < HY && solid.a[Math.min(K.H - 1, Math.round(y * K.S)) * K.W + Math.min(K.W - 1, Math.round(x * K.S))] < 0.5,
    fade: (x, y) => smooth(HY + 90, HY - 40, y) });
  C.birds([[1180, 300, 1.4, 1], [1222, 286, 1.1, 0.6], [1250, 318, 1.2, 1.2], [880, 250, 0.8, 1], [905, 240, 0.7, 0.4], [1540, 380, 0.9, 0.8]]);
  C.motes({ x: 500, y: 640, w: 500, h: 120, n: 60, color: '#ffb080', size: 1.2, power: 0.6, seed: 2 });

  return K.finish({ exposure: 1.2, bloom: { threshold: 0.75, strength: 0.55, radii: [6, 24, 80] }, vignette: 0.45, grain: 0.03, lift: [0.012, 0.012, 0.03], saturation: 1.05 });
};
