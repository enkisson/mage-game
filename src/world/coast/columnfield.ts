// The cliffs of the bay, built the way the painting has them: not a wall wearing columns, but a
// mass of columns that is the cliff.
//
// Every column is a cell of a Voronoi tiling laid over the rock, so each has its own width (two
// to five metres) and its own number of sides, packed edge to edge as real basalt cracks as it
// cools. Each is pushed up to its own height:
//
//  - the wall: the columns well back in the rock run up to the land on top, ragged at the rim,
//    some standing proud of it, some broken down. Where the wall is tall it is two flows, the
//    upper columns narrower and set back on the lower, with a baked red contact between.
//  - the terrace: in front of the wall a lower mass of columns, a third to two thirds of its
//    height, so the cliff steps down toward the sea in great blocks.
//  - the stumps: at the foot, columns broken off a few metres up, stepping down onto the sand and
//    out into the surf.
//
// The wall comes forward and steps back massif by massif along the shore. In a few places the
// columns curve together in a great sweep (the swirls). Up the east end a road is cut into them. Where a fall comes over the edge a slot is cut
// in the mass, and under the arch and in the sea caves the columns hang from the rock above.
import * as THREE from 'three';
import { distToSegment, fbm, smoothstep } from '../../core/math';
import { fogUniforms } from './atmosphere';
import type { TextureSet } from './terrain';
import { BAY, FALLS, OUTLINE, RIVERS, groundHeight, landDistance, plateauAt } from './layout';
import { fallRecess } from './cliffface';
import { roadAt } from './road';

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- along the shore ---------------------------------------------------------------------------

const SEG = (() => {
  const cum = [0];
  for (let i = 1; i < OUTLINE.length; i++) cum.push(cum[i - 1] + Math.hypot(OUTLINE[i][0] - OUTLINE[i - 1][0], OUTLINE[i][1] - OUTLINE[i - 1][1]));
  return cum;
})();
const LENGTH = SEG[SEG.length - 1];

/** The nearest point on the cliff foot: how far along it, and which way the face looks there. */
function nearestFoot(x: number, z: number): { s: number; nx: number; nz: number; fx: number; fz: number } {
  let best = 1e9, out = { s: 0, nx: 0, nz: 1, fx: x, fz: z };
  for (let i = 0; i < OUTLINE.length - 1; i++) {
    const a = OUTLINE[i], b = OUTLINE[i + 1];
    const [d, t] = distToSegment(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) {
      best = d;
      const len = SEG[i + 1] - SEG[i];
      out = { s: SEG[i] + t * len, nx: -(b[1] - a[1]) / len, nz: (b[0] - a[0]) / len, fx: a[0] + (b[0] - a[0]) * t, fz: a[1] + (b[1] - a[1]) * t };
    }
  }
  return out;
}

/** A stretch of cliff with its own shape. */
interface Massif {
  s0: number; s1: number;
  /** How far back from the foot the main wall stands. */
  face: number;
  /** How high the terrace in front of it reaches, as a share of the wall; 0 for none. */
  terrace: number;
  /** How far out onto the beach the stumps reach. */
  talus: number;
  /** How far its columns bow outward, in metres; 0 for straight. */
  bow: number;
  /** Which way, and how far, its columns lean. */
  lean: number;
}

const MASSIFS: Massif[] = (() => {
  const out: Massif[] = [];
  let s = 0, k = 0;
  while (s < LENGTH) {
    const len = 16 + hash(k, 1) * 30;
    const mid = s + len / 2;
    // where the massif is, roughly, to know if it faces the sea or lines the canyon
    let mx = 0, mz = 0;
    for (let i = 0; i < SEG.length - 1; i++) if (SEG[i + 1] >= mid) { const t = (mid - SEG[i]) / (SEG[i + 1] - SEG[i]); mx = OUTLINE[i][0] + (OUTLINE[i + 1][0] - OUTLINE[i][0]) * t; mz = OUTLINE[i][1] + (OUTLINE[i + 1][1] - OUTLINE[i][1]) * t; break; }
    const canyon = mz < -57;
    const seaward = mx < -93 || mz > 25;
    const r = hash(k, 2);
    out.push({
      s0: s, s1: s + len,
      face: canyon ? 1 + hash(k, 3) * 2.5 : seaward ? 2 + hash(k, 3) * 6 : 3 + hash(k, 3) * 11,
      terrace: canyon ? (r < 0.5 ? 0 : 0.15 + hash(k, 4) * 0.2) : r < 0.2 ? 0 : 0.28 + hash(k, 4) * 0.4,
      talus: canyon ? 1.5 + hash(k, 5) * 2 : 3 + hash(k, 5) * 9,
      // the old per-column bow, replaced by the swirls below
      bow: 0,
      lean: (hash(k, 8) - 0.5) * 0.07,
    });
    s += len; k++;
  }
  return out;
})();

function massifAt(s: number): { m: Massif; i: number } {
  let lo = 0, hi = MASSIFS.length - 1;
  while (lo < hi) { const md = (lo + hi + 1) >> 1; if (MASSIFS[md].s0 <= s) lo = md; else hi = md - 1; }
  return { m: MASSIFS[lo], i: lo };
}

/** Sea caves under the headland: where, how wide, how high. */
const CAVES = [
  { x: -117, z: 42.5, w: 11, h: 15 },
  { x: -146, z: 43.5, w: 6.5, h: 9 },
  { x: -91.5, z: 24, w: 5, h: 7 },
];

function riverDistance(x: number, z: number): number {
  let best = 1e9;
  for (const r of RIVERS) for (let i = 0; i < r.length - 1; i++) best = Math.min(best, distToSegment(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1])[0]);
  return best;
}

// ---- the tiling ----------------------------------------------------------------------------------

/** How far apart columns stand here, centre to centre. */
function spacing(x: number, z: number, d: number): number {
  const big = fbm(x * 0.018 + 3.3, z * 0.018, 2) * 0.5 + 0.5;
  let sp = 2.3 + big * 2.9;
  // the broken stuff at the foot is smaller, and so are the canyon's damp columns
  if (d < 0) sp *= 0.75;
  if (z < -57) sp *= 0.8;
  return sp;
}

interface Site { x: number; z: number; sp: number; d: number; arch: boolean }

/** Columns scattered over the rock as evenly as their size allows (dart throwing). */
function sites(): Site[] {
  const out: Site[] = [];
  const cell = 2.5, grid = new Map<number, number[]>();
  const key = (i: number, j: number) => i * 100003 + j;
  const A = BAY.arch, archHalf = BAY.canyon.width / 2 + 3;
  const r = rng(1234);
  const minX = -290, maxX = 200, minZ = -135, maxZ = 62;
  for (let n = 0; n < 420000; n++) {
    const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
    const d = landDistance(x, z);
    const inArch = Math.abs(x - A.x) < archHalf && Math.abs(z - A.z) < A.thickness * 0.6 + 1;
    const nearRoad = roadAt(x, z).near;
    if (!inArch && !nearRoad && (d < -15 || d > 48)) continue;
    const sp = spacing(x, z, inArch ? 5 : d) * (inArch && d < 2 ? 0.5 : 1) * (nearRoad ? 0.42 : 1);
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let ok = true;
    for (let i = ci - 3; i <= ci + 3 && ok; i++) for (let j = cj - 3; j <= cj + 3 && ok; j++) {
      const list = grid.get(key(i, j));
      if (!list) continue;
      for (const q of list) {
        const o = out[q];
        if (Math.hypot(o.x - x, o.z - z) < 0.5 * (o.sp + sp) * 0.88) { ok = false; break; }
      }
    }
    if (!ok) continue;
    const k = key(ci, cj);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(out.length);
    out.push({ x, z, sp, d, arch: inArch && d < 2 });
  }
  // neighbours for the cells
  (out as (Site & { nb?: number[] })[]).forEach((p) => {
    const ci = Math.floor(p.x / cell), cj = Math.floor(p.z / cell), nb: number[] = [];
    for (let i = ci - 4; i <= ci + 4; i++) for (let j = cj - 4; j <= cj + 4; j++) {
      const list = grid.get(key(i, j));
      if (list) for (const q of list) if (out[q] !== p && Math.hypot(out[q].x - p.x, out[q].z - p.z) < (p.sp + out[q].sp) * 1.3) nb.push(q);
    }
    (p as Site & { nb?: number[] }).nb = nb;
  });
  return out;
}

/** The cell of one column: everything nearer it than its neighbours, weighted by size. */
function cellOf(p: Site & { nb?: number[] }, all: Site[]): [number, number][] {
  const h = p.sp * 0.9;
  let poly: [number, number][] = [[p.x - h, p.z - h], [p.x + h, p.z - h], [p.x + h, p.z + h], [p.x - h, p.z + h]];
  for (const qi of p.nb ?? []) {
    const q = all[qi];
    const dx = q.x - p.x, dz = q.z - p.z;
    const w = p.sp / (p.sp + q.sp);
    const mx = p.x + dx * w, mz = p.z + dz * w;
    const next: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const fa = (a[0] - mx) * dx + (a[1] - mz) * dz, fb = (b[0] - mx) * dx + (b[1] - mz) * dz;
      if (fa <= 0) next.push(a);
      if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    poly = next;
    if (poly.length < 3) return [];
  }
  // drop slivers of edges, so the columns read as clean polygons
  const clean: [number, number][] = [];
  for (const v of poly) if (!clean.length || Math.hypot(v[0] - clean[clean.length - 1][0], v[1] - clean[clean.length - 1][1]) > 0.25) clean.push(v);
  if (clean.length > 2 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) < 0.25) clean.pop();
  // a crack between each column and the next
  let cx = 0, cz = 0;
  for (const v of clean) { cx += v[0]; cz += v[1]; }
  cx /= clean.length; cz /= clean.length;
  return clean.map(([x, z]) => {
    const l = Math.hypot(x - cx, z - cz) || 1, k = Math.max(0.5, 1 - 0.07 / l);
    return [cx + (x - cx) * k, cz + (z - cz) * k] as [number, number];
  });
}

// ---- the swirls -------------------------------------------------------------------------------------

/**
 * Where the columns curve. In a few places a flow cooled round a hollow and its columns grew in a
 * great curve: up from the beach straight, then sweeping out over the beach and fanning apart,
 * then back in to the rim. The bend is one smooth field over space, applied to every corner of
 * every column, so neighbours bend together and stay packed edge to edge.
 */
interface Swirl { x: number; z: number; nx: number; nz: number; tx: number; tz: number; r: number; out: number; fan: number; twist: number; ylo: number; yhi: number }
const SWIRLS: Swirl[] = ([
  [-17, -55, 15, 8, 0.7, 4],
  [-66, -51, 20, 10, -0.8, -5],
  [62, -50, 21, 10, 0.75, 4.5],
  [-168, 43, 24, 11, -0.8, 5],
  [-232, 49, 19, 9, 0.7, -4],
] as const).map(([x, z, r, out, fan, twist]) => {
  const f = nearestFoot(x, z);
  const land = plateauAt(f.fx - f.nx * 12, f.fz - f.nz * 12), g = Math.max(0, groundHeight(f.fx + f.nx * 4, f.fz + f.nz * 4));
  return { x: f.fx - f.nx * 9, z: f.fz - f.nz * 9, nx: f.nx, nz: f.nz, tx: -f.nz, tz: f.nx, r, out, fan, twist, ylo: g + (land - g) * 0.22, yhi: land + 4 };
});

/** How far the swirls move a point, and how strongly any swirl touches it. */
function swirlAt(x: number, z: number, y: number): [number, number, number] {
  let dx = 0, dz = 0, wmax = 0;
  for (const w of SWIRLS) {
    const ox = x - w.x, oz = z - w.z;
    const k = Math.exp(-(ox * ox + oz * oz) / (w.r * w.r));
    if (k < 0.01) continue;
    wmax = Math.max(wmax, k);
    const t = Math.min(1, Math.max(0, (y - w.ylo) / (w.yhi - w.ylo)));
    const rise = Math.pow(Math.sin(Math.PI * t), 1.2);
    // out over the beach; fanning apart along the wall; and a sideways sweep that turns over
    const along = (ox * w.tx + oz * w.tz) / w.r;
    const o = w.out * k * rise;
    const side = (w.fan * along * w.r * 0.25 * rise + w.twist * Math.sin(Math.PI * 2 * t) * 0.5) * k;
    dx += w.nx * o + w.tx * side;
    dz += w.nz * o + w.tz * side;
  }
  return [dx, dz, wmax];
}

// ---- the geometry ---------------------------------------------------------------------------------

/**
 * Attributes: `colA` = (column id, metres along the face, face width, kind), `colB` = (base,
 * top, land height, contact height), `colC` = (out x, out z, canyon, bow). Kind: 0 a side, 4 a
 * top, 5 an underside.
 */
export function columnField(): THREE.BufferGeometry {
  const all = sites();
  const P: number[] = [], A: number[] = [], B: number[] = [], C: number[] = [];
  let id = 0;
  const A0 = BAY.arch;
  const shipX = BAY.ship.x, shipZ = BAY.ship.z;

  /**
   * One prism from `y0` to `y1` over the polygon, bent sideways by `bend(y)`. Its top is broken
   * at a slant; a hanging one has an underside.
   */
  const prism = (poly: [number, number][], y0: number, y1: number, bend: (y: number) => [number, number], meta: { land: number; contact: number; ox: number; oz: number; canyon: number; bow: number; under: boolean; top: boolean; flat?: boolean }) => {
    id++;
    let cx = 0, cz = 0;
    for (const v of poly) { cx += v[0]; cz += v[1]; }
    cx /= poly.length; cz /= poly.length;
    const sx = meta.flat ? 0 : (hash(id, 7) - 0.5) * 0.3, sz = meta.flat ? 0 : (hash(id, 8) - 0.5) * 0.3;
    const ty = (x: number, z: number) => y1 + (x - cx) * sx + (z - cz) * sz;
    // a column in a swirl is cut into short lengths, so it can curve
    const curving = swirlAt(cx, cz, (y0 + y1) / 2)[2] > 0.03;
    const segs = curving ? Math.max(2, Math.ceil((y1 - y0) / 2.2)) : 1;
    const n = poly.length;
    const push = (x: number, y: number, z: number, um: number, fw: number, kind: number) => {
      if (curving) { const [wx, wz] = swirlAt(x, z, y); x += wx; z += wz; }
      P.push(x, y, z); A.push(id, um, fw, kind); B.push(y0, y1, meta.land, meta.contact); C.push(meta.ox, meta.oz, meta.canyon, meta.bow);
    };
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let k = 0; k < segs; k++) {
        const ya0 = y0 + ((y1 - y0) * k) / segs, ya1 = k === segs - 1 ? ty(a[0], a[1]) : y0 + ((y1 - y0) * (k + 1)) / segs;
        const yb1 = k === segs - 1 ? ty(b[0], b[1]) : ya1;
        const [p0x, p0z] = bend(ya0), [p1x, p1z] = bend(ya1), [q1x, q1z] = bend(yb1);
        // outward winding: the polygon runs counter-clockwise seen from above
        push(a[0] + p0x, ya0, a[1] + p0z, 0, w, 0);
        push(b[0] + p0x, ya0, b[1] + p0z, w, w, 0);
        push(b[0] + q1x, yb1, b[1] + q1z, w, w, 0);
        push(a[0] + p0x, ya0, a[1] + p0z, 0, w, 0);
        push(b[0] + q1x, yb1, b[1] + q1z, w, w, 0);
        push(a[0] + p1x, ya1, a[1] + p1z, 0, w, 0);
      }
    }
    const [tx, tz] = bend(y1);
    if (meta.top) for (let i = 1; i < n - 1; i++) for (const v of [poly[0], poly[i + 1], poly[i]]) push(v[0] + tx, ty(v[0], v[1]), v[1] + tz, 0.5, 1, 4);
    const [bx, bz] = bend(y0);
    if (meta.under) for (let i = 1; i < n - 1; i++) for (const v of [poly[0], poly[i], poly[i + 1]]) push(v[0] + bx, y0, v[1] + bz, 0.5, 1, 5);
  };

  for (const site of all) {
    let poly = cellOf(site as Site & { nb?: number[] }, all);
    if (poly.length < 3) continue;
    // the Voronoi clip keeps the vertices in the square's order: counter-clockwise in x, z; make
    // the sides face out, whichever way round that is
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area > 0) poly = poly.reverse();
    const { x, z, d } = site;
    const ft = nearestFoot(x, z);
    const { m } = massifAt(ft.s);
    const canyon = z < -57 ? 1 : 0;
    const land = plateauAt(x, z);
    const gOut = groundHeight(ft.fx + ft.nx * 4, ft.fz + ft.nz * 4);
    const g = groundHeight(x, z);
    const r1 = hash(x * 3.1, z * 2.7), r2 = hash(z * 1.9, x * 4.3), r3 = hash(x + z, x - z);

    // the road: columns cut off flush under its paving, or built up to it
    const road = roadAt(x, z);
    if (road.bed !== null) {
      prism(poly, Math.min(g, gOut) - 3, road.bed - 0.25, () => [0, 0], { land, contact: -1e3, ox: ft.nx, oz: ft.nz, canyon, bow: 0, under: false, top: true, flat: true });
      continue;
    }

    // the arch: columns hanging from the rock that spans the canyon's mouth
    if (site.arch) {
      // the opening is narrower than the canyon, so the arch stands on legs of whole columns
      const u = (x - A0.x) / (BAY.canyon.width / 2 - 3);
      const floor = groundHeight(A0.x, A0.z) - 1;
      const under = Math.abs(u) < 1 ? floor + (A0.crown - floor) * Math.pow(1 - u * u, 0.32) + (r1 - 0.5) * 0.4 : floor - 2;
      const top = land - r2 * 2.5;
      if (top - under > 3) prism(poly, under, top, () => [0, 0], { land, contact: -1e3, ox: 0, oz: 1, canyon: 0, bow: 0, under: Math.abs(u) < 1, top: true });
      continue;
    }

    // a fall: a slot cut back into the mass, and the wall brought forward to its lip
    // the front of the wall zigzags in and out, a few columns at a time
    let face = m.face + fbm(ft.s * 0.14, 3.7, 2) * 3.5 + (r3 - 0.5) * 1.6, slot = false, nearFall = 0;
    for (const f of FALLS) {
      const ox = x - f.x, oz = z - f.z;
      const along = ox * f.nx + oz * f.nz, across = Math.abs(-ox * f.nz + oz * f.nx);
      const hw = f.width * 0.6 + 1;
      if (across < hw + 10 && along > -30) { face = Math.min(face, fallRecess(f)); nearFall = Math.max(nearFall, 1 - smoothstep(hw, hw + 10, across)); }
      if (across < hw + 0.5 && along > -fallRecess(f) - 0.3) slot = true;
    }
    if (slot) continue;
    // a cave: columns hanging over the water, a back wall of whole ones behind
    let cave = 0;
    for (const c of CAVES) {
      const u = Math.hypot(x - c.x, z - c.z) / (c.w / 2);
      if (u < 1.3 && d < face + 9) cave = Math.max(cave, c.h * Math.sqrt(Math.max(0, 1 - Math.min(1, u) ** 2)));
    }

    // the wall's height here: the land on top, the rim ragged
    let wall = land - r1 * 2.2;
    if (d < face + 6) {
      if (r2 < 0.1) wall += 1 + r3 * 4;                    // standing proud of the rim
      else if (r2 > 0.86) wall -= 3 + r3 * 10;             // broken down
    }
    // the front of the wall is a jagged stair: column after column broken off at its own height,
    // so the face steps up and back in blocks rather than standing as one sheet
    if (d >= face && d < face + 9 && nearFall < 0.6) {
      const k = hash(x * 0.7 + 11, z * 0.9);
      const drop = (1 - (d - face) / 9) * 0.7;
      if (k < 0.45) wall -= (wall - gOut) * drop * Math.pow(hash(z * 0.6, x * 1.3 + 5), 1.5);
    }
    const base0 = Math.min(g, gOut) - 3;
    let y0 = base0, y1: number, bow = 0, contact = -1e3;
    if (d >= face) {
      y1 = wall;
    } else {
      // keep the beach clear where it is needed: the streams, the wreck
      if (d < 0 && (riverDistance(x, z) < 3 || Math.hypot(x - shipX, z - shipZ) < 24)) continue;
      const gEff = Math.max(g, -0.6);
      const terraceD = face * 0.45;
      if (d >= terraceD && m.terrace > 0 && nearFall < 0.5) {
        y1 = gEff + (wall - gEff) * m.terrace * (0.82 + r1 * 0.32);
      } else {
        if (d < -m.talus) continue;
        const t = Math.max(0, (d + m.talus) / (Math.max(terraceD, 1) + m.talus));
        y1 = gEff + (0.6 + Math.pow(t, 1.4) * (canyon ? 5 : 12)) * (0.35 + r1 * 0.9);
        if (r2 < 0.18) y1 = gEff + 0.3 + r3 * 0.9;           // broken to a stub
      }
      y0 = Math.min(g, gEff) - 2.5;
    }
    // open air over the road, and the wall behind the leg below it
    y1 = Math.min(y1, road.cap);
    if (cave > 0) {
      if (d < face) { y1 = Math.min(y1, Math.max(g, -0.6) + 1.5); }
      else y0 = Math.max(g, 0) + cave;
    }
    if (y1 - y0 < 0.5) continue;
    // the lean of the massif, and its bow, carried by every column in it
    const lean = m.lean, lx = -ft.nz * lean, lz = ft.nx * lean;
    // the bow is one curve shared by the whole bundle, set by the land's height, not the column's,
    // so neighbours bend together and the short ones do not overhang their own feet
    const bowLo = gOut + (land - gOut) * 0.2, bowHi = land;
    const bend = (y: number): [number, number] => {
      const b = bow > 0 ? bow * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (y - bowLo) / (bowHi - bowLo)))), 1.3) : 0;
      return [lx * (y - y0) + ft.nx * b, lz * (y - y0) + ft.nz * b];
    };
    const meta = { land, contact, ox: ft.nx, oz: ft.nz, canyon, bow, under: cave > 0 && d >= face, top: true };
    // where the wall is tall it is two flows: the upper columns narrower, set back on the lower
    if (d >= face && y1 - base0 > 45 && bow === 0) {
      const split = gOut + (y1 - gOut) * (0.42 + fbm(ft.s * 0.02, 5.5, 2) * 0.1) + (r3 - 0.5) * 2.5;
      if (split > y0 + 4) {
        prism(poly, y0, split, bend, { ...meta, contact: split });
        let cx = 0, cz = 0;
        for (const v of poly) { cx += v[0]; cz += v[1]; }
        cx /= poly.length; cz /= poly.length;
        const k = 0.78 + r2 * 0.14, back = 0.2 + r1 * 0.5;
        const upper = poly.map(([px, pz]) => [cx + (px - cx) * k - ft.nx * back, cz + (pz - cz) * k - ft.nz * back] as [number, number]);
        prism(upper, split, y1, bend, { ...meta, under: false });
        continue;
      }
    }
    prism(poly, y0, y1, bend, meta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('colA', new THREE.Float32BufferAttribute(A, 4));
  geo.setAttribute('colB', new THREE.Float32BufferAttribute(B, 4));
  geo.setAttribute('colC', new THREE.Float32BufferAttribute(C, 4));
  geo.computeVertexNormals();
  return geo;
}

// ---- the stone -------------------------------------------------------------------------------------

/**
 * Basalt as the painting has it: dark umber-grey, the lit faces warm, every column its own shade,
 * cracked across at its joints, its edges worn, wet and black low down and by the falls, a little
 * moss in the damp, turf on the tops at the level of the land.
 */
export function columnFieldMaterial(rock: TextureSet): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const falls = FALLS.map((f) => new THREE.Vector4(f.x, f.z, f.width, 0));
  const u = { rMap: { value: rock.diff }, rNor: { value: rock.nor }, uFalls: { value: falls } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 colA; attribute vec4 colB; attribute vec4 colC;
        varying vec4 vA; varying vec4 vB; varying vec4 vC;
        varying vec3 vCW; varying vec3 vCN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vA = colA; vB = colB; vC = colC;
        vCW = (modelMatrix * vec4(position, 1.0)).xyz;
        vCN = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D rMap, rNor;
        uniform vec4 uFalls[${falls.length}];
        varying vec4 vA; varying vec4 vB; varying vec4 vC;
        varying vec3 vCW; varying vec3 vCN;
        float cRough, cAO;
        vec3 cN;
        float ch(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 437.585); }
        float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
        float cf(vec2 p) { return cn(p) * 0.5 + cn(p * 2.03 + 7.1) * 0.27 + cn(p * 4.1 + 3.3) * 0.15 + cn(p * 8.3 + 1.7) * 0.08; }
        vec3 ctw;
        vec3 ctri(sampler2D t, float s) {
          return texture2D(t, vCW.zy * s).rgb * ctw.x + texture2D(t, vCW.xz * s).rgb * ctw.y + texture2D(t, vCW.xy * s).rgb * ctw.z;
        }`)
      .replace('#include <map_fragment>', /* glsl */ `
        vec3 gn = normalize(vCN) * (gl_FrontFacing ? 1.0 : -1.0);
        ctw = pow(abs(gn), vec3(5.0)); ctw /= ctw.x + ctw.y + ctw.z;
        float id = vA.x, um = vA.y, fw = vA.z, kind = floor(vA.w + 0.5);
        float base = vB.x, ctop = vB.y, land = vB.z, contactY = vB.w;
        vec2 outN = vC.xy; float canyon = vC.z;
        float y = vCW.y;
        float isTop = kind > 3.5 && kind < 4.5 ? 1.0 : 0.0;
        float isUnder = kind > 4.5 ? 1.0 : 0.0;
        float side = 1.0 - isTop - isUnder;
        float cid = ch(vec2(id, 1.7)), cid2 = ch(vec2(id, 4.9));
        vec3 a = ctri(rMap, 0.07), b = ctri(rMap, 0.29);
        float tl = dot(mix(a, b, 0.55), vec3(0.3, 0.55, 0.15));
        // ---- the stone: dark umber-grey, each column its own shade, some cooler, some browner ----
        vec3 warm = vec3(0.118, 0.096, 0.078), cool = vec3(0.092, 0.09, 0.09);
        vec3 c = mix(warm, cool, smoothstep(0.55, 0.85, cid2)) * (0.5 + tl * 1.25) * (0.66 + cid * 0.6);
        // broad bands of tone across the wall: some flows lighter, some stained darker
        float wallU = vCW.x * 0.8 + vCW.z * 0.6;
        c *= 0.8 + 0.4 * cf(vec2(wallU * 0.012, y * 0.018) + 2.0);
        // ---- joints: cracked across every one to four metres, the crack not quite level,
        //      not always all the way across; the big columns crack further apart ----
        float sp = (1.0 + cid * 2.2) * (0.7 + 0.3 * fw);
        float jy = (y + cid * 13.0 + (um - fw * 0.5) * (ch(vec2(id, 6.3)) - 0.5) * 0.35 + (cn(vec2(um * 1.3, id)) - 0.5) * 0.25) / sp;
        float jd = abs(fract(jy + 0.5) - 0.5) * sp;
        float jOn = step(0.22, ch(vec2(id, floor(jy + 0.5)))) * smoothstep(0.15, 0.4, cn(vec2(um * 0.7 + id, floor(jy + 0.5))));
        float joint = (1.0 - smoothstep(0.015, 0.055, jd)) * jOn * side;
        // each block between joints weathers on its own
        c *= mix(1.0, 0.8 + 0.4 * ch(vec2(id, floor(jy + 0.5) + 17.0)), side);
        // a vertical crack down the middle of some broad faces
        float vcr = (1.0 - smoothstep(0.01, 0.04, abs(um - fw * (0.35 + 0.3 * ch(vec2(id, 2.2)))))) * step(1.6, fw) * step(0.6, ch(vec2(id, floor(y / 6.0)))) * side;
        c *= 1.0 - joint * 0.75 - vcr * 0.6;
        // chipped pale under a joint
        float chip = smoothstep(0.05, 0.08, jd) * (1.0 - smoothstep(0.08, 0.16, jd)) * step(0.55, cn(vec2(um * 5.0, y * 3.0))) * jOn * side;
        c += chip * vec3(0.05, 0.042, 0.035);
        // ---- the edges: worn round and catching the light, dark in the cracks between ----
        float e0 = um, e1 = fw - um;
        // never thinner than a pixel or so, so the columns still read far off
        float px = fwidth(um) * 1.2;
        float edge = (1.0 - smoothstep(0.0, max(0.12, px * 2.0), min(e0, e1))) * side;
        float crack = (1.0 - smoothstep(0.0, max(0.04, px), min(e0, e1))) * side;
        c *= 1.0 + edge * 0.35 * step(0.35, cn(vec2(id, y * 0.6))) - crack * 0.5;
        // ---- weather: runoff streaks off the rim, pale lichen, a few rust stains ----
        float runoff = smoothstep(0.55, 0.8, cf(vec2(wallU * 0.07, y * 0.007)) * 0.75 + cn(vec2(wallU * 0.4, y * 0.02)) * 0.25);
        c *= 1.0 - runoff * 0.4 * side;
        float lichen = smoothstep(0.6, 0.8, cf(vec2(wallU * 0.05, y * 0.03) + 4.1)) * (1.0 - runoff) * smoothstep(-0.5, 0.5, dot(gn.xz, outN));
        c = mix(c, vec3(0.17, 0.165, 0.145) * (0.7 + tl * 0.6), lichen * 0.35);
        c = mix(c, vec3(0.14, 0.085, 0.05) * (0.6 + tl), smoothstep(0.9, 0.97, ch(vec2(id, 9.1))) * smoothstep(0.35, 0.7, cn(vec2(id, y * 0.05))) * 0.55 * side);
        // the baked red contact on top of a lower flow
        float contact = (1.0 - smoothstep(0.0, 1.4, abs(y - contactY))) * step(-500.0, contactY);
        c = mix(c, vec3(0.15, 0.085, 0.06) * (0.6 + tl * 0.9), contact * 0.75);
        // ---- moss and turf ----
        float wetFall = 0.0;
        for (int i = 0; i < ${falls.length}; i++) {
          float d = length(vCW.xz - uFalls[i].xy);
          wetFall = max(wetFall, exp(-pow(d / (uFalls[i].z * 1.4 + 6.0), 2.0)));
        }
        // the tops: turf at the level of the land, moss and grass in tufts on the steps below
        float turf = smoothstep(4.0, 1.0, land - y);
        float topMoss = isTop * max(turf, smoothstep(0.35, 0.65, cn(vCW.xz * 0.9) + 0.15 + canyon * 0.3 + wetFall * 0.3));
        float mossRun = smoothstep(0.66, 0.85, cf(vec2(wallU * 0.11, y * 0.012) + 9.3) + canyon * 0.22 + wetFall * 0.28 + runoff * 0.1) * smoothstep(0.3, 0.6, cn(vec2(um * 2.0 + id, y * 0.4))) * side;
        float mossJ = joint * smoothstep(0.45, 0.7, cn(vec2(id, y * 0.3))) * (0.3 + wetFall + canyon);
        float moss = clamp(max(max(topMoss, mossRun), mossJ + contact * 0.3) * smoothstep(1.0, 4.0, y - max(base, 0.0) - 1.0 + isTop * 4.0), 0.0, 1.0);
        vec3 mossC = mix(vec3(0.03, 0.04, 0.014), vec3(0.09, 0.115, 0.035), cn(vCW.xz * 0.5 + y * 0.2)) * (0.6 + cf(vCW.xy * 3.1 + vCW.zy * 2.3) * 0.5);
        vec3 turfC = mix(vec3(0.07, 0.08, 0.035), vec3(0.11, 0.12, 0.05), cn(vCW.xz * 0.3)) * (0.7 + cn(vCW.xz * 6.0) * 0.4);
        c = mix(c, mix(mossC, turfC, turf * isTop), moss);
        // ---- wet: low down by the sea, by the falls; black and glossy ----
        float seaWet = 1.0 - smoothstep(1.0, 5.5, y + (cn(vec2(um * 2.0 + id, 0.0)) - 0.5) * 2.0);
        float wet = max(seaWet, wetFall * 0.85) * (1.0 - moss * 0.5);
        c *= mix(1.0, 0.45, wet);
        // a crust of salt just above the reach of the swash
        float salt = smoothstep(0.62, 0.85, cn(vec2(um * 3.0 + id, y * 1.5))) * smoothstep(2.5, 4.0, y) * (1.0 - smoothstep(5.0, 9.0, y)) * (1.0 - canyon) * side;
        c = mix(c, vec3(0.3, 0.3, 0.29), salt * 0.3 * (1.0 - moss));
        // the undersides of hanging columns: dark, dripping
        c *= mix(1.0, 0.7, isUnder);
        diffuseColor.rgb *= c;
        cRough = mix(mix(0.86, 0.16, wet), 0.93, moss);
        // ---- occlusion: low on each column, in the cracks, on faces turned into the cliff ----
        float inward = smoothstep(0.1, -0.6, dot(normalize(gn.xz + vec2(1e-4)), outN)) * side;
        cAO = mix(0.5, 1.0, smoothstep(0.0, 4.0, y - max(base, -1.0) - 2.5)) * (1.0 - crack * 0.6) * (1.0 - joint * 0.4) * mix(1.0, 0.55, inward) * mix(1.0, 0.4, isUnder);
        // ---- normal: rounded edges, the lips of the joints, the grain of the stone ----
        vec3 tn = ctri(rNor, 0.07) * 2.0 - 1.0, tn2 = ctri(rNor, 0.29) * 2.0 - 1.0;
        vec3 tg = normalize(cross(vec3(0.0, 1.0, 0.0), gn) + vec3(1e-4, 0.0, 0.0));
        vec3 nn = gn + (tn + tn2 * 0.6) * 0.22 * (1.0 - moss * 0.6);
        nn += (-tg * (1.0 - smoothstep(0.0, 0.14, e0)) + tg * (1.0 - smoothstep(0.0, 0.14, e1))) * 0.8 * side;
        nn += vec3(0.0, 1.0, 0.0) * smoothstep(0.03, 0.06, jd) * (1.0 - smoothstep(0.06, 0.13, jd)) * 0.7 * jOn * side;
        cN = normalize(nn);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(cN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= cAO; reflectedLight.indirectSpecular *= cAO;');
  };
  m.customProgramCacheKey = () => 'columnfield';
  return m;
}
