// The cliffs of the bay: a wall of basalt about 85 m tall traced along the foot of the cliffs,
// after Reynisfjara.
//
// It is columns nearly to the top: hexagonal prisms a metre or so across, straight up, packed
// side by side like organ pipes. Where the wall is tall they stand in two flows, the lower of
// big columns and the upper of thinner ones a little back, with a thin red-brown contact of
// rubble between. Here and there a column has broken off short, and in places they step down
// onto the beach as a stair. Sea caves open in their foot, and they line the hollows the falls
// have scoured. Over the last of them, flush with them, lies the cap: the rough top of the last
// flow, the columns running up into it thinner and fanning until they lose themselves in it,
// and over that a shoulder of turf, 3-10 m of rock in all.
//
// The plan is angular, never smoothly curved. The outline is cut into straight legs (see
// layout.ts), and the face is broken again into blocks a few metres wide that stand forward or
// back of each other with sharp vertical corners.
//
// Each part is one mesh with its own shader for the joints, weathering, moss and wet.
import * as THREE from 'three';
import { fbm, smoothstep } from '../../core/math';
import { fogUniforms } from './atmosphere';
import type { TextureSet } from './terrain';
import { FALLS, OUTLINE, groundHeight, plateauAt, type Fall } from './layout';

/** Rows of turf behind the edge, spaced wider as they go back, reaching about 70 m. */
const CAP_ROWS = 22;

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- the plan --------------------------------------------------------------------------------

const SEG = (() => {
  const cum = [0];
  for (let i = 1; i < OUTLINE.length; i++) cum.push(cum[i - 1] + Math.hypot(OUTLINE[i][0] - OUTLINE[i - 1][0], OUTLINE[i][1] - OUTLINE[i - 1][1]));
  return cum;
})();
const LENGTH = SEG[SEG.length - 1];

interface Foot { x: number; z: number; s: number; nx: number; nz: number; tx: number; tz: number }

/** The point `s` metres along the foot, and which way the face looks there. */
function footAt(s: number, corner = false): Foot {
  let i = 0;
  while (i < SEG.length - 2 && SEG[i + 1] <= s) i++;
  const a = OUTLINE[i], b = OUTLINE[i + 1];
  const len = SEG[i + 1] - SEG[i], t = Math.min(1, Math.max(0, (s - SEG[i]) / len));
  const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
  let nx = -tz, nz = tx;
  // at a corner the two legs share one line of vertices, set on the mitre so both faces stay flat
  if (corner && i > 0 && Math.abs(s - SEG[i]) < 1e-6) {
    const p = OUTLINE[i - 1], pl = SEG[i] - SEG[i - 1];
    const px = -(a[1] - p[1]) / pl, pz = (a[0] - p[0]) / pl;
    const mx = px + nx, mz = pz + nz, ml = Math.hypot(mx, mz) || 1;
    const k = Math.min(2, 1 / Math.max(0.5, (mx * nx + mz * nz) / ml));
    nx = (mx / ml) * k; nz = (mz / ml) * k;
  }
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s, nx, nz, tx, tz };
}

// ---- the blocks ------------------------------------------------------------------------------

/** One block of the wall: a few metres of face that stands forward or back of its neighbours. */
interface Block {
  s0: number; s1: number;
  /** How far forward of the foot line it stands. */
  depth: number;
  /** Radius of the columns in the lower flow, and in the upper. */
  colA: number; colA2: number;
  /** How far the upper flow stands back of the lower. */
  back2: number;
  /** This block's nudges to where the flows meet, how thick the contact is, and the cap. */
  splitJ: number; band: number; capJ: number;
  /** A stair of columns stepping down onto the beach in front: rows, and the tallest step. */
  stair: { rows: number; h: number } | null;
}

const BLOCKS: Block[] = (() => {
  const out: Block[] = [];
  let s = 0, k = 0;
  while (s < LENGTH) {
    const len = 3.5 + hash(k, 1) * 9;
    const mid = footAt(s + len / 2);
    const canyon = mid.z < -57;
    const seaward = mid.x < -85 || mid.z > 20;
    out.push({
      s0: s, s1: s + len,
      // whole buttresses of columns stand forward of the wall, others are recessed into it
      depth: ((hash(k, 3) - 0.5) * 2.8 + fbm(s * 0.03, 2.2, 2) * 1.2 + (hash(k, 16) < 0.15 ? 2.5 + hash(k, 17) * 2.5 : 0)) * (canyon ? 0.5 : seaward ? 1.5 : 1),
      colA: 0.45 + hash(Math.floor(s / 40), 4) * 0.22 + hash(k, 5) * 0.05,
      colA2: 0.34 + hash(Math.floor(s / 33), 6) * 0.2 + hash(k, 7) * 0.04,
      back2: 0.2 + Math.pow(hash(k, 8), 2) * 2.6,
      splitJ: (hash(k, 9) - 0.5) * 2.5,
      band: 0.5 + hash(k, 10) * 1.1,
      capJ: (hash(k, 11) - 0.5) * 2,
      stair: !canyon && hash(k, 13) < (seaward ? 0.45 : 0.18) ? { rows: 1 + Math.floor(hash(k, 14) * 4), h: 3 + hash(k, 15) * 8 } : null,
    });
    s += len; k++;
  }
  return out;
})();

function blockAt(s: number): Block {
  let lo = 0, hi = BLOCKS.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (BLOCKS[m].s0 <= s) lo = m; else hi = m - 1; }
  return BLOCKS[lo];
}

/** Sea caves under the headland: where, how wide, how high. */
const CAVES = [
  { x: -117, z: 42.5, w: 10, h: 15 },
  { x: -146, z: 43.5, w: 5.5, h: 8 },
  { x: -91.5, z: 24, w: 4.5, h: 7 },
];

/**
 * The rock breaks along joints into flat faces with sharp creases between, not smooth folds:
 * heights picked at knots a couple of metres apart along the wall, joined by straight lines,
 * each knot wandering slowly with height so the faces run up the wall as long planes.
 */
function facets(s: number, y: number): number {
  const q = s / 2.4 + fbm(y * 0.012, s * 0.01, 2) * 0.8;
  const k = Math.floor(q), f = q - k;
  const h = (i: number) => fbm(i * 0.71 + 3.3, y * 0.017 + i * 0.37, 2) * 2.4 + (hash(i, 77) - 0.5) * 0.8;
  return h(k) + (h(k + 1) - h(k)) * f;
}

/** How far the wall is cut back behind a fall. */
export function fallRecess(f: Fall): number {
  return 2.5 + f.width * 0.2;
}

interface Here { alcove: number; cave: { h: number } | null; noCols: boolean; calm: number }

function hereAt(p: Foot): Here {
  let alcove = 0, noCols = false, calm = 0, cave: { h: number } | null = null;
  for (const f of FALLS) {
    const df = Math.hypot(p.x - f.x, p.z - f.z), hw = f.width * 0.6 + 1;
    const k = 1 - smoothstep(hw, hw + 1.2, df);
    alcove = Math.max(alcove, k * fallRecess(f));
    calm = Math.max(calm, 1 - smoothstep(hw + 1, hw + 6, df));
  }
  for (const c of CAVES) {
    const u = Math.hypot(p.x - c.x, p.z - c.z) / (c.w / 2);
    if (u < 1) cave = { h: c.h * Math.sqrt(1 - u * u) * (0.85 + 0.15 * fbm(p.s * 0.4, 1, 2)) };
  }
  return { alcove, cave, noCols, calm };
}

// ---- the profile ------------------------------------------------------------------------------

/**
 * How the wall is built at one place along it. Columns run from the beach nearly to the top,
 * in one flow, or where the wall is tall in two: the lower of big columns, a thin rubbly
 * contact, and the upper of thinner ones standing a little back. Over them, flush with them,
 * is the cap: the rough top of the last flow, 3-10 m of it, under the turf.
 */
interface Tier { y0: number; y1: number; a: number; back: number; lower: boolean }
interface Profile {
  p: Foot; nx: number; nz: number; ground: number; top: number; foot: number;
  blk: Block; bi: number; here: Here; wild: number;
  colTop: number; tiers: Tier[]; band: [number, number] | null;
}

function profile(s: number, corner = false): Profile {
  const p = footAt(s, corner);
  const nl = Math.hypot(p.nx, p.nz), nx = p.nx / nl, nz = p.nz / nl;
  const ground = groundHeight(p.x + nx * 5, p.z + nz * 5);
  const top = plateauAt(p.x - nx * 6, p.z - nz * 6) + 0.6;
  const foot = Math.min(ground - 5, top - 6);
  const blk = blockAt(s), bi = BLOCKS.indexOf(blk);
  const here = hereAt(p);
  const capH = 3.5 + (fbm(s * 0.015, 3.1, 2) * 0.5 + 0.5) * 6 + blk.capJ;
  const colTop = top - capH;
  const base = ground + (here.cave ? here.cave.h + 0.3 : 0);
  const tiers: Tier[] = [];
  let band: [number, number] | null = null;
  if (colTop - base > 8) {
    if (colTop - ground > 42) {
      const split = ground + (colTop - ground) * (0.47 + fbm(s * 0.02, 5.5, 2) * 0.12) + blk.splitJ;
      band = [split, split + blk.band];
      if (split > base + 3) tiers.push({ y0: base, y1: split, a: blk.colA, back: 0, lower: true });
      tiers.push({ y0: split + blk.band, y1: colTop, a: blk.colA2, back: blk.back2, lower: false });
    } else tiers.push({ y0: base, y1: colTop, a: blk.colA, back: 0, lower: true });
  }
  return { p, nx, nz, ground, top, foot, blk, bi, here, wild: 1 - here.calm, colTop: tiers.length ? colTop : -1e3, tiers, band };
}

// ---- the face --------------------------------------------------------------------------------

/**
 * The rock behind the columns, the contact between flows, the cap above, the caves, and the
 * turf on top. Attributes: `faceA` = (s, top, ground, colTop), `faceB` = (kind, block id,
 * cave, alcove), `faceC` = the way the foot line faces. Kind: 0 the cap, 1 behind the columns,
 * 2 a cave, 3 the turf on top, 4 the contact between two flows.
 */
export function cliffFace(hstep = 0.4, vstep = 0.8): THREE.BufferGeometry {
  // where to put a line of vertices: evenly, plus every corner, plus both sides of every
  // block's edge so the step between blocks is a clean vertical
  const ss: { s: number; corner: boolean }[] = [];
  for (let i = 0; i < SEG.length - 1; i++) {
    const n = Math.max(1, Math.round((SEG[i + 1] - SEG[i]) / hstep));
    for (let k = 0; k < n; k++) ss.push({ s: SEG[i] + ((SEG[i + 1] - SEG[i]) * k) / n, corner: k === 0 });
  }
  ss.push({ s: LENGTH - 1e-4, corner: false });
  for (const b of BLOCKS) if (b.s0 > 0.1) ss.push({ s: b.s0 - 0.03, corner: false }, { s: b.s0 + 0.03, corner: false });
  ss.sort((a, b) => a.s - b.s);

  const pos: number[] = [], A: number[] = [], B: number[] = [], C: number[] = [];
  const cols: { start: number; key: number[] }[] = [];
  let vi = 0;
  for (const { s, corner } of ss) {
    const P = profile(s, corner);
    const { p, nx, nz, ground, top, foot, blk, bi, here, wild, colTop, tiers, band } = P;
    // the heights of this line's vertices: even steps, plus a pair at every sharp change
    const ys: number[] = [];
    const nRows = Math.max(3, Math.ceil((top - foot) / vstep));
    for (let j = 0; j <= nRows; j++) ys.push(foot + ((top - foot) * j) / nRows);
    const sharp = [colTop, ...(band ?? [])];
    for (const t of tiers) sharp.push(t.y0);
    for (const y of sharp) if (y > foot + 0.2 && y < top - 0.2) ys.push(y - 0.03, y + 0.03);
    ys.sort((a, b) => a - b);
    const upperBack = tiers.length ? tiers[tiers.length - 1].back : 0;

    const start = vi, key: number[] = [];
    for (const y of ys) {
      let d = blk.depth * wild, kind = 0;
      const h01 = (y - foot) / (top - foot);
      const tier = tiers.find((t) => y >= t.y0 && y < t.y1);
      if (tier) {
        // behind the columns: a dark back wall
        d += -2.6 - tier.back + fbm(s * 0.5, y * 0.2, 2) * 0.3;
        kind = 1;
      } else if (band && y >= band[0] && y < band[1]) {
        // the contact between two flows: rubble, weathered back a little behind the columns
        d += -1.25 + fbm(s * 0.6, y * 0.6, 2) * 0.25;
        kind = 4;
      } else if (y < colTop) {
        // below the lowest columns (over a cave): plain rock
        d += -0.9 + facets(s, y) * 0.3;
      } else {
        // the cap: flush with the columns below, the columns breaking up into it
        d += -0.85 - upperBack + (facets(s, y) * 0.45 + fbm(s * 0.21 + bi * 0.37, y * 0.03, 2) * 0.5) * smoothstep(colTop, colTop + 4, y) * (0.4 + 0.6 * wild);
        d += fbm(s * 2.2, y * 0.2, 2) * 0.12;
        // the shoulder of turf at the top, rounding back, and its lip hanging over
        d -= Math.pow(smoothstep(top - 3.5, top, y), 2) * 1.6 * wild;
        d += smoothstep(top - 0.8, top - 0.15, y) * 0.5 * wild;
      }
      // the alcove behind each fall, sheer-sided, scoured deeper at its foot
      d -= here.alcove * (1 + 0.35 * (1 - h01));
      // the sea caves
      if (here.cave && y < ground + here.cave.h) { d -= 7 + fbm(s * 0.3, y * 0.3, 2) * 1.2; kind = 2; }
      // grain
      d += fbm(s * 2.6, y * 2.6, 2) * 0.05;
      pos.push(p.x + p.nx * d, y, p.z + p.nz * d);
      A.push(s, top, ground, colTop);
      B.push(kind, bi, here.cave ? here.cave.h : 0, here.alcove);
      C.push(nx, nz);
      key.push(y);
      vi++;
    }
    // the cap: the land on top, carried back from the edge until the ground takes over
    const ex = pos[pos.length - 3], ez = pos[pos.length - 1];
    for (let k = 1; k <= CAP_ROWS; k++) {
      const back = k * k * 0.12 + k * 0.35;
      const qx = ex - nx * back, qz = ez - nz * back;
      const y = plateauAt(qx, qz) + 0.05;
      pos.push(qx, y, qz);
      A.push(s, y + 0.4, ground, -1e3);
      B.push(3, bi, 0, 0);
      C.push(nx, nz);
      key.push(1000 + k);
      vi++;
    }
    cols.push({ start, key });
  }
  // stitch neighbouring lines of vertices, matching their rows by height
  const idx: number[] = [];
  for (let i = 0; i < cols.length - 1; i++) {
    const L = cols[i], R = cols[i + 1];
    let ja = 0, jb = 0;
    while (ja < L.key.length - 1 || jb < R.key.length - 1) {
      const na = ja < L.key.length - 1 ? L.key[ja + 1] : Infinity, nb = jb < R.key.length - 1 ? R.key[jb + 1] : Infinity;
      if (na <= nb) { idx.push(L.start + ja, R.start + jb, L.start + ja + 1); ja++; }
      else { idx.push(L.start + ja, R.start + jb, R.start + jb + 1); jb++; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('faceA', new THREE.Float32BufferAttribute(A, 4));
  geo.setAttribute('faceB', new THREE.Float32BufferAttribute(B, 4));
  geo.setAttribute('faceC', new THREE.Float32BufferAttribute(C, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---- the columns -----------------------------------------------------------------------------

/**
 * The colonnade at the foot of the wall: hexagonal prisms standing straight up, flat face to the
 * sea, in a honeycomb two deep, with a stair of shorter ones in front here and there.
 * Attributes: `colA` = (column id, metres across the face, face width, kind), `colB` = (base,
 * top, colonnade top, under-overhang), `colT` = the face's horizontal direction. Kind: 0 a
 * front face, 1 a face that meets a neighbour at its start, 2 at its end, 3 a back face, 4 the top.
 */
export function colonnade(): THREE.BufferGeometry {
  const P: number[] = [], A: number[] = [], B: number[] = [], T: number[] = [];
  let id = 0;
  const prism = (cx: number, cz: number, tx: number, tz: number, a: number, base: number, top: number, colTop: number, under: number, lean = 0) => {
    id++;
    const nx = -tz, nz = tx;
    // a slightly irregular hexagon, flat face to the front
    const vx: number[] = [], vz: number[] = [];
    for (let j = 0; j < 6; j++) {
      const th = (j * Math.PI) / 3, r = a * (0.9 + hash(id, j) * 0.18);
      vx.push(cx + (tx * Math.cos(th) + nx * Math.sin(th)) * r);
      vz.push(cz + (tz * Math.cos(th) + nz * Math.sin(th)) * r);
    }
    // the top is broken off at a slant
    const sx = (hash(id, 7) - 0.5) * 0.5, sz = (hash(id, 8) - 0.5) * 0.5;
    const ty = (j: number) => top + (vx[j] - cx) * sx + (vz[j] - cz) * sz;
    const kinds = [1, 0, 2, 3, 3, 3];
    for (let j = 0; j < 6; j++) {
      if (j === 4) continue; // the back face is never seen
      const k = (j + 1) % 6;
      const w = Math.hypot(vx[k] - vx[j], vz[k] - vz[j]);
      const ex = (vx[k] - vx[j]) / w, ez = (vz[k] - vz[j]) / w;
      const lx = (y: number) => tx * lean * (y - base), lz = (y: number) => tz * lean * (y - base);
      const quad = [[vx[j], base, vz[j], 0], [vx[k], base, vz[k], w], [vx[k] + lx(ty(k)), ty(k), vz[k] + lz(ty(k)), w], [vx[j], base, vz[j], 0], [vx[k] + lx(ty(k)), ty(k), vz[k] + lz(ty(k)), w], [vx[j] + lx(ty(j)), ty(j), vz[j] + lz(ty(j)), 0]];
      // wind the triangles so they face out
      const order = [0, 2, 1, 3, 5, 4];
      for (const q of order) {
        const v = quad[q];
        P.push(v[0], v[1], v[2]);
        A.push(id, v[3], w, kinds[j]);
        B.push(base, top, colTop, under);
        T.push(ex, 0, ez);
      }
    }
    for (const [i0, i1, i2] of [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 5, 4]]) {
      for (const j of [i0, i1, i2]) {
        P.push(vx[j] + tx * lean * (ty(j) - base), ty(j), vz[j] + tz * lean * (ty(j) - base));
        A.push(id, 0.5, 1, 4);
        B.push(base, top, colTop, under);
        T.push(1, 0, 0);
      }
    }
  };
  for (const blk of BLOCKS) {
    // each flow is laid out on its own, with its own size of column
    for (const lower of [true, false]) {
      const a = lower ? blk.colA : blk.colA2, step = 1.5 * a;
      const n = Math.floor((blk.s1 - blk.s0) / step);
      for (let i = 0; i < n; i++) {
        const s = blk.s0 + a * 0.75 + i * step;
        const P = profile(s);
        const tier = P.tiers.find((t) => t.lower === lower);
        if (!tier) continue;
        const { p, nx, nz } = P;
        // the honeycomb: every other column sits half a row back, and none quite in line
        const zig = i & 1 ? -0.866 * a : 0;
        const at = (row: number) => {
          const d = blk.depth * P.wild - 1.25 - tier.back - P.here.alcove + zig + row * 1.732 * a + (hash(i + blk.s0, row + 31) - 0.5) * 0.5;
          return [p.x + nx * d, p.z + nz * d];
        };
        // a flow's columns lean together, a degree or two, swinging slowly along the wall
        const lean = fbm(s * 0.025, lower ? 1.5 : 6.5, 2) * 0.05;
        const ar = (row: number) => a * (0.85 + hash(i + blk.s0 * 1.3, row + 61) * 0.3);
        const baseAt = (x: number, z: number) => (tier.lower && !P.here.cave ? groundHeight(x, z) - 2.5 : tier.y0 - 0.2);
        // where the tops end: under the contact, the lower flow's columns stop short of it; at
        // the cap, the upper flow's run raggedly up into it, some standing proud of it
        const topOf = (row: number) => {
          const j = hash(i + blk.s0 * 3.1, row + 43);
          if (tier.lower && P.band) return row < 0 ? tier.y1 + 0.6 : tier.y1 - j * 0.9;
          return row < 0 ? tier.y1 + 3 : tier.y1 + (j - 0.62) * 4.5;
        };
        // the back rows, up into the rock above
        { const [x, z] = at(-2); prism(x, z, p.tx, p.tz, ar(-2), baseAt(x, z), topOf(-1), tier.y1, 0, lean); }
        { const [x, z] = at(-1); prism(x, z, p.tx, p.tz, ar(-1), baseAt(x, z), topOf(-1), tier.y1, 0, lean); }
        // the front row: many have lost their upper lengths, broken off along a joint, so the
        // face steps in and out where the frost has worked; the taller the flow, the more
        {
          const [x, z] = at(0);
          const tall = tier.y1 - tier.y0;
          const broken = hash(i + blk.s0, lower ? 41 : 44) < Math.min(0.55, 0.08 + tall * 0.008);
          const h = broken ? tier.y0 + tall * Math.pow(hash(i + blk.s0, 42), 0.7) * 0.95 : topOf(0);
          prism(x, z, p.tx, p.tz, ar(0), baseAt(x, z), h, tier.y1, tier.lower && P.band ? 0.5 : 0, lean);
          // and in front of a few, the stump of one more, a step or two high
          if (hash(i + blk.s0, 45) < 0.12 && tier.lower) {
            const [fx, fz] = at(1);
            const g = baseAt(fx, fz);
            prism(fx, fz, p.tx, p.tz, ar(1), g, tier.y0 + 1 + hash(i, 46) * Math.min(12, tall * 0.3), tier.y1, 0, lean);
          }
        }
        // the stair
        if (blk.stair && tier.lower && !P.here.cave && P.here.alcove < 0.5) {
          const t = (s - blk.s0) / (blk.s1 - blk.s0);
          const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.5);
          for (let r = 1; r <= blk.stair.rows; r++) {
            const [x, z] = at(r);
            const g = groundHeight(x, z);
            const h = blk.stair.h * (1 - (r - 1) / (blk.stair.rows + 0.5)) * env * (0.55 + hash(i, r + 50) * 0.6);
            if (h < 0.6) continue;
            prism(x, z, p.tx, p.tz, a, g - 2.5, g + h, tier.y1, 0);
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('colA', new THREE.Float32BufferAttribute(A, 4));
  geo.setAttribute('colB', new THREE.Float32BufferAttribute(B, 4));
  geo.setAttribute('colT', new THREE.Float32BufferAttribute(T, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---- shading ---------------------------------------------------------------------------------

/** Noise, triplanar lookups and the weathering both cliff shaders share. */
const COMMON = /* glsl */ `
  uniform sampler2D rMap, rNor;
  uniform vec4 uFalls[${FALLS.length}];
  varying vec3 vCW;
  varying vec3 vCN;
  float cRough, cAO;
  vec3 cN;
  float ch(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 437.585); }
  float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
  float cf(vec2 p) { return cn(p) * 0.5 + cn(p * 2.03 + 7.1) * 0.27 + cn(p * 4.1 + 3.3) * 0.15 + cn(p * 8.3 + 1.7) * 0.08; }
  vec3 ctw;
  vec3 ctri(sampler2D t, float s) {
    return texture2D(t, vCW.zy * s).rgb * ctw.x + texture2D(t, vCW.xz * s).rgb * ctw.y + texture2D(t, vCW.xy * s).rgb * ctw.z;
  }
  // how wet the spray of the falls keeps a point, 0..1
  float fallWet() {
    float w = 0.0;
    for (int i = 0; i < ${FALLS.length}; i++) {
      float d = length(vCW.xz - uFalls[i].xy);
      w = max(w, exp(-pow(d / (uFalls[i].z * 1.3 + 5.0), 2.0)));
    }
    return w;
  }
  // moss: deep green-black in the shade, brighter on top, varied
  vec3 mossColour(vec3 p) {
    vec3 m = mix(vec3(0.03, 0.045, 0.014), vec3(0.1, 0.14, 0.035), cn(p.xz * 0.5 + p.y * 0.2));
    return m * (0.6 + cf(p.xy * 3.1 + p.zy * 2.3) * 0.5 + cn(p.xz * 17.0 + p.y * 9.0) * 0.25);
  }
`;

const VERT_COMMON = /* glsl */ `
  varying vec3 vCW;
  varying vec3 vCN;
`;

function baseMaterial(rock: TextureSet, key: string, attrs: string, vert: string, frag: string, fragHead: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const falls = FALLS.map((f) => new THREE.Vector4(f.x, f.z, f.width, 0));
  const u = { rMap: { value: rock.diff }, rNor: { value: rock.nor }, uFalls: { value: falls } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_COMMON}\n${attrs}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCW = (modelMatrix * vec4(position, 1.0)).xyz;
        vCN = normalize(mat3(modelMatrix) * normal);
        ${vert}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${fragHead}\n${attrs.split('\n').filter((l) => l.includes('varying')).join('\n')}`)
      .replace('#include <map_fragment>', frag)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(cN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= cAO; reflectedLight.indirectSpecular *= cAO;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** The wall above and behind the columns: sheer rough basalt, fractured, mossed and wet. */
export function cliffMaterial(rock: TextureSet): THREE.MeshStandardMaterial {
  return baseMaterial(rock, 'cliffface2',
    'attribute vec4 faceA;\n attribute vec4 faceB;\n attribute vec2 faceC;\n varying vec4 vA;\n varying vec4 vB;\n varying vec2 vOut;',
    'vA = faceA; vB = faceB; vOut = faceC;',
    /* glsl */ `
      vec3 gn = normalize(vCN) * (gl_FrontFacing ? 1.0 : -1.0);
      vec3 up = vec3(0.0, 1.0, 0.0);
      ctw = pow(abs(gn), vec3(5.0)); ctw /= ctw.x + ctw.y + ctw.z;
      float sAlong = vA.x, top = vA.y, ground = vA.z, colTop = vA.w;
      float kind = floor(vB.x + 0.5), blockId = vB.y;
      float y = vCW.y;
      vec3 a = ctri(rMap, 0.08), b = ctri(rMap, 0.31);
      float tl = dot(mix(a, b, 0.5), vec3(0.3, 0.55, 0.15));
      // ---- the rock: dark basalt, some blocks browner or greyer with weathering ----
      float bh = ch(vec2(blockId, 3.0));
      vec3 base = mix(vec3(0.068, 0.068, 0.072), vec3(0.095, 0.083, 0.072), bh * 0.6);
      vec3 c = base * (0.5 + tl * 1.25);
      // the weathered rind: paler grey patches on the dry rock
      float rind = smoothstep(0.5, 0.75, cf(vec2(sAlong * 0.12, y * 0.05) + blockId));
      c = mix(c, vec3(0.14, 0.14, 0.138) * (0.7 + tl * 0.6), rind * 0.3);
      // vertical fractures splitting the face into blocks and pillars, and a few cross joints
      float fq = sAlong * 0.38 + (cn(vec2(y * 0.03, sAlong * 0.07)) - 0.5) * 2.2 + (cn(vec2(y * 0.2, sAlong * 0.5)) - 0.5) * 0.25;
      float fr = abs(fract(fq) - 0.5) * 2.0;
      // each fracture runs a long way down, fading in and out
      float frac = (1.0 - smoothstep(0.0, 0.045, 1.0 - fr)) * smoothstep(0.35, 0.6, cn(vec2(floor(fq) * 3.1, y * 0.025)));
      float xj = (1.0 - smoothstep(0.0, 0.03, abs(fract(y * 0.21 + (cn(vec2(sAlong * 0.3, 0.0)) - 0.5) * 0.6) - 0.5) * 2.0 - 0.95)) * smoothstep(0.65, 0.8, cn(vec2(sAlong * 0.25, y * 0.1)));
      c *= 1.0 - frac * 0.6 - xj * 0.25;
      // just above the columns they do not stop at a line: they run on up into the cap,
      // thinner and fanning, losing their edges and their joints as they go
      float entab = (1.0 - smoothstep(colTop + 0.5, colTop + 6.0 + cn(vec2(sAlong * 0.2, 2.0)) * 6.0, y)) * step(-500.0, colTop) * (kind < 0.5 ? 1.0 : 0.0);
      float eq = (sAlong + (y - colTop) * sin(sAlong * 0.09 + blockId) * 0.3) / (0.55 + ch(vec2(blockId, 8.0)) * 0.3);
      float ef = fract(eq);
      float ejoint = (1.0 - smoothstep(0.0, 0.06, min(ef, 1.0 - ef))) * smoothstep(0.3, 0.6, cn(vec2(floor(eq) * 1.7, y * 0.3)) + entab * 0.3);
      float ecross = (1.0 - smoothstep(0.0, 0.04, abs(fract(y * 1.3 + ch(vec2(floor(eq), 2.0))) - 0.5) * 2.0 - 0.93)) * step(0.55, ch(vec2(floor(eq), floor(y * 1.3))));
      c *= 1.0 - (ejoint * 0.65 + ecross * 0.4) * entab;
      // water streaks running down from every ledge and crack
      float streak = smoothstep(0.5, 0.85, cn(vec2(sAlong * 0.9, y * 0.015)) * 0.7 + cn(vec2(sAlong * 3.1, y * 0.04)) * 0.3);
      c *= 1.0 - streak * 0.4 * (1.0 - abs(gn.y));
      // pale salt-and-lime drips on the sea-facing walls, thin
      float drip = smoothstep(0.72, 0.93, cn(vec2(sAlong * 4.0, y * 0.05))) * smoothstep(0.4, 0.75, cn(vec2(sAlong * 9.0, y * 0.4)));
      c = mix(c, vec3(0.3, 0.3, 0.29), drip * smoothstep(-30.0, 20.0, vCW.z) * smoothstep(colTop + 4.0, colTop + 20.0, y) * 0.25);
      // yellow-grey lichen crusts
      float lichen = smoothstep(0.62, 0.8, cf(vCW.xy * 0.33 + vCW.zy * 0.21));
      c = mix(c, vec3(0.19, 0.18, 0.1), lichen * 0.4);
      // the contact between two flows: red-brown rubble, the old flow top baked by the next
      float contact = kind > 3.5 ? 1.0 : 0.0;
      c = mix(c, vec3(0.13, 0.085, 0.062) * (0.55 + tl * 0.9) * (0.65 + cn(vCW.xz * 3.0 + y * 2.5) * 0.7), contact);
      // ---- moss and turf ----
      float wetFall = fallWet();
      float canyon = vCW.z < -58.0 ? 1.0 : 0.0;
      float upish = gn.y;
      float ledge = smoothstep(0.3, 0.7, upish + (cf(vCW.xz * 0.4 + y * 0.1) - 0.5) * 0.5);
      // moss hangs down the face in curtains where water seeps, thickest in the canyon
      float curtain = smoothstep(0.6, 0.8, cf(vec2(sAlong * 0.22, y * 0.02)) * 0.7 + cn(vec2(sAlong * 0.9, y * 0.03)) * 0.3 + canyon * 0.06 + wetFall * 0.12 + streak * 0.12);
      float inCrack = (frac + xj) * smoothstep(0.45, 0.7, cn(vec2(sAlong * 0.6, y * 0.3))) * (0.4 + wetFall + canyon * 0.6);
      float moss = max(max(ledge, curtain * smoothstep(-0.6, 0.1, upish)), max(inCrack, contact * smoothstep(0.35, 0.7, cn(vec2(sAlong * 0.4, 1.0))) * 0.85));
      moss = max(moss, smoothstep(4.5, 0.5, top - y + (cn(vec2(sAlong * 0.3, 1.0)) - 0.5) * 3.0));   // the turf shoulder at the top
      // turf and grass hang in tongues down the cap, the rubbly top of the last flow
      moss = max(moss, step(colTop, y) * smoothstep(0.5, 0.75, cf(vec2(sAlong * 0.15, y * 0.1)) + smoothstep(colTop + 2.0, top, y) * 0.35) * (kind < 0.5 ? 1.0 : 0.0));
      moss *= smoothstep(1.5, 6.0, y - ground + 2.0);                                          // not where the sea scours
      if (kind > 2.5) moss = 1.0;                                                             // the cap
      vec3 mossC = mossColour(vCW);
      mossC = mix(mossC, vec3(0.12, 0.14, 0.055) * (0.75 + cn(vCW.xz * 0.9) * 0.4), smoothstep(3.0, 0.5, top - y) * 0.7);
      moss = clamp(moss, 0.0, 1.0);
      c = mix(c, mossC, moss);
      // behind the columns and inside the caves it is dark and dripping
      float hidden = kind > 0.5 && kind < 2.5 ? 1.0 : 0.0;
      c *= mix(1.0, 0.45, hidden);
      // wet: by the falls, inside the caves, and low down where the sea reaches
      float seaWet = 1.0 - smoothstep(0.5, 5.0, y - min(ground, 2.0) + (cn(vCW.xz * 0.3) - 0.5) * 2.0);
      float wet = max(max(seaWet, wetFall * 0.85), kind > 1.5 && kind < 2.5 ? 0.7 : 0.0);
      c *= mix(1.0, 0.5, wet * (1.0 - moss * 0.5));
      diffuseColor.rgb *= c;
      cRough = mix(mix(0.88 - streak * 0.1, 0.2, wet), 0.93, moss);
      cAO = mix(1.0, 0.35, hidden) * (1.0 - frac * 0.4 * (1.0 - moss)) * mix(1.0, 0.6, smoothstep(-0.1, -0.6, gn.y));
      // under the overhang over the columns the rock is shaded
      cAO *= kind < 0.5 ? mix(0.6, 1.0, smoothstep(colTop, colTop + 1.2, y)) : 1.0;
      cAO *= mix(1.0, 0.7, contact);
      // ---- normal ----
      vec3 tn = ctri(rNor, 0.08) * 2.0 - 1.0, tn2 = ctri(rNor, 0.31) * 2.0 - 1.0;
      vec3 tilt3 = (tn + tn2 * 0.7) * 0.4;
      // the fractures are grooves: the face turns in at either side of each
      vec3 tg = normalize(cross(up, gn) + vec3(1e-4, 0.0, 0.0));
      float side = (fract(fq) - 0.5) * 2.0;
      vec3 nn = normalize(gn + tg * (ef - 0.5) * 1.1 * entab * (1.0 - moss) + vec3(tilt3.x, tilt3.y * 0.5, tilt3.x) * (1.0 - moss * 0.6) + tg * sign(side) * smoothstep(0.75, 1.0, abs(side)) * 0.5 * smoothstep(0.35, 0.6, cn(vec2(floor(fq) * 3.1, y * 0.025))));
      cN = nn;`,
    '');
}

/** The columns: dark prisms with cracked joints, rounded edges, moss on the tops and in the cracks. */
export function columnMaterial(rock: TextureSet): THREE.MeshStandardMaterial {
  return baseMaterial(rock, 'colonnade',
    'attribute vec4 colA;\n attribute vec4 colB;\n attribute vec3 colT;\n varying vec4 vA;\n varying vec4 vB;\n varying vec3 vT;',
    'vA = colA; vB = colB; vT = normalize(mat3(modelMatrix) * colT);',
    /* glsl */ `
      vec3 gn = normalize(vCN) * (gl_FrontFacing ? 1.0 : -1.0);
      ctw = pow(abs(gn), vec3(5.0)); ctw /= ctw.x + ctw.y + ctw.z;
      float id = vA.x, um = vA.y, fw = vA.z, kind = floor(vA.w + 0.5);
      float base = vB.x, ctop = vB.y, colTop = vB.z, under = vB.w;
      float y = vCW.y;
      float cid = ch(vec2(id, 1.7));
      float isTop = kind > 3.5 ? 1.0 : 0.0;
      vec3 a = ctri(rMap, 0.11), b = ctri(rMap, 0.43);
      float tl = dot(mix(a, b, 0.5), vec3(0.3, 0.55, 0.15));
      // ---- the stone: near-black basalt, each column its own shade ----
      vec3 c = vec3(0.075, 0.076, 0.08) * (0.55 + tl * 1.2) * (0.68 + cid * 0.64);
      // and every few metres up, the shade shifts: a band of paler, drier stone, a wetter one
      c *= 0.85 + 0.3 * cn(vec2(id * 0.37, y * 0.12));
      // a paler grey weathered skin in patches, more on the dry upper columns
      float skin = smoothstep(0.45, 0.75, cf(vec2(um * 0.8 + id * 3.7, y * 0.12)));
      c = mix(c, vec3(0.13, 0.13, 0.128) * (0.7 + tl * 0.5), skin * 0.4 * smoothstep(1.0, 6.0, y - base - 2.5));
      // joints: each column cracked across every half metre to metre and a half, never in line
      // with its neighbours, the cracks a little tilted and not all the way across
      float sp = 0.45 + ch(vec2(id, 5.1)) * 1.0;
      float jy = (y + cid * 11.0 + (um - fw * 0.5) * (ch(vec2(id, 6.3)) - 0.5) * 0.3) / sp;
      float jd = abs(fract(jy + 0.5) - 0.5) * sp;
      float joint = (1.0 - smoothstep(0.012, 0.045, jd)) * step(0.2, ch(vec2(id, floor(jy + 0.5)))) * (1.0 - isTop);
      // the stone just under each joint is chipped paler
      float chip = smoothstep(0.03, 0.06, jd) * (1.0 - smoothstep(0.06, 0.12, jd)) * step(0.5, cn(vec2(um * 6.0, y * 3.0))) * (1.0 - isTop);
      c *= 1.0 - joint * 0.75;
      c += chip * 0.025;
      // each block between joints weathers on its own: a mosaic of shades, not a stripe
      c *= 0.78 + 0.44 * ch(vec2(id, floor(jy + 0.5) + 17.0));
      // ---- weathering across the whole wall, over many columns at once ----
      float wallU = vCW.x * 0.8 + vCW.z * 0.6;
      // dark streaks where water runs down off the top, metres wide
      float runoff = smoothstep(0.52, 0.78, cf(vec2(wallU * 0.09, y * 0.008)) * 0.75 + cn(vec2(wallU * 0.5, y * 0.02)) * 0.25);
      c *= 1.0 - runoff * 0.45;
      // pale grey-green lichen and salt in broad patches on the dry stone
      float pale = smoothstep(0.58, 0.8, cf(vec2(wallU * 0.05, y * 0.035) + 4.1)) * (1.0 - runoff);
      c = mix(c, vec3(0.16, 0.165, 0.15) * (0.7 + tl * 0.6), pale * 0.45);
      // and a few columns stained rust-brown where iron seeps out of a joint
      c = mix(c, vec3(0.13, 0.08, 0.05) * (0.6 + tl), smoothstep(0.86, 0.95, ch(vec2(id, 9.1))) * smoothstep(0.4, 0.7, cn(vec2(id, y * 0.05))) * 0.6);
      // the edges are worn round: a thin lit line down each, and chipped here and there
      float e0 = um, e1 = fw - um;
      float edge = (1.0 - smoothstep(0.0, 0.07, min(e0, e1))) * (1.0 - isTop);
      c *= 1.0 + edge * 0.25 * step(0.3, cn(vec2(id, y * 0.8)));
      // vertical water streaks
      float streak = smoothstep(0.55, 0.85, cn(vec2(um * 2.5 + id, y * 0.05)));
      c *= 1.0 - streak * 0.35;
      // ---- moss: on the tops, in the joints, and in curtains where water drips off the rock above ----
      float wetFall = fallWet();
      float drips = under * smoothstep(colTop - 9.0, colTop - 1.0, y) * smoothstep(0.45, 0.7, cf(vec2(um * 1.5 + id * 2.1, y * 0.15)));
      float mossJ = joint * smoothstep(0.4, 0.65, cn(vec2(id, y * 0.4))) * (0.4 + wetFall);
      // moss in long streaks down the wet runs, more in the damp canyon
      float canyonC = vCW.z < -58.0 ? 1.0 : 0.0;
      float mossRun = smoothstep(0.62, 0.82, cf(vec2(wallU * 0.13, y * 0.012) + 9.3) + runoff * 0.15 + canyonC * 0.18 + wetFall * 0.2) * smoothstep(0.3, 0.6, cn(vec2(um * 3.0 + id, y * 0.5)));
      float moss = max(max(isTop * smoothstep(0.35, 0.55, cn(vCW.xz * 1.3) + 0.25), drips), max(mossJ, mossRun));
      moss *= smoothstep(1.0, 4.0, y - base - 2.5) * (1.0 - smoothstep(-20.0, 30.0, vCW.z) * 0.5 * (1.0 - isTop));
      moss = clamp(moss + wetFall * 0.3 * cf(vec2(um, y) * 1.3), 0.0, 1.0);
      c = mix(c, mossColour(vCW), moss);
      // ---- wet low down by the sea, and by the falls: black and glossy ----
      float seaWet = (1.0 - smoothstep(1.5, 6.0, y - base - 2.5 + (cn(vec2(um * 2.0 + id, 0.0)) - 0.5) * 2.0)) * smoothstep(-20.0, 30.0, vCW.z);
      float wet = max(seaWet, wetFall * 0.8);
      c *= mix(1.0, 0.45, wet * (1.0 - moss * 0.5));
      // a crust of salt just above the reach of the swash
      float salt = smoothstep(0.65, 0.85, cn(vec2(um * 3.0 + id, y * 1.5))) * smoothstep(2.0, 3.5, y - base - 2.5) * (1.0 - smoothstep(4.0, 7.0, y - base - 2.5)) * smoothstep(0.0, 30.0, vCW.z);
      c = mix(c, vec3(0.32, 0.32, 0.31), salt * 0.35 * (1.0 - moss));
      diffuseColor.rgb *= c;
      cRough = mix(mix(0.85, 0.18, wet), 0.93, moss);
      // ---- occlusion: where a column meets its neighbour, at its foot, and under the overhang ----
      float crev = kind > 0.5 && kind < 1.5 ? smoothstep(0.0, 0.35, e0) : (kind > 1.5 && kind < 2.5 ? smoothstep(0.0, 0.35, e1) : 1.0);
      if (kind > 2.5 && kind < 3.5) crev = 0.45;
      cAO = mix(0.25, 1.0, crev) * mix(0.5, 1.0, smoothstep(0.0, 2.5, y - base - 2.5));
      cAO *= mix(1.0, mix(0.35, 1.0, smoothstep(colTop - 0.5, colTop - 8.0, y)), under);
      cAO *= 1.0 - joint * 0.5;
      // ---- normal: rounded edges, the lips of the joints, a little texture ----
      vec3 tn = ctri(rNor, 0.11) * 2.0 - 1.0;
      vec3 nn = gn + tn * 0.18 * (1.0 - moss * 0.6);
      nn += -vT * (1.0 - smoothstep(0.0, 0.08, e0)) * 0.9 * (1.0 - isTop) + vT * (1.0 - smoothstep(0.0, 0.08, e1)) * 0.9 * (1.0 - isTop);
      nn += vec3(0.0, 1.0, 0.0) * smoothstep(0.02, 0.04, jd) * (1.0 - smoothstep(0.04, 0.09, jd)) * 0.6 * step(fract(jy + 0.5), 0.5) * (1.0 - isTop);
      cN = normalize(nn);`,
    '');
}
