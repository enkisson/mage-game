// The cliffs of the bay: a wall of basalt about 85 m tall traced along the foot of the cliffs,
// after Reynisfjara.
//
// There are two parts. At the foot stands a colonnade of real columns: hexagonal prisms a metre
// or so across, straight up, packed side by side like organ pipes. Here and there one has broken
// off short, and in places they step down onto the beach as a stair. Above them, overhanging
// them a little, rises the rest of the wall. That part is vertical, rough rock split by vertical
// fractures into blocks, with a few ledges, clefts and caves, and a shoulder of turf at the top.
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
  /** How tall its columns are, over the ground; 0 for none. */
  colH: number;
  /** Radius of its columns. */
  colA: number;
  /** How far the rock above overhangs the columns. */
  over: number;
  /** Where the face steps back at a ledge, and by how much. */
  ledges: { y: number; back: number }[];
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
    // the columns run in long stretches, taller on the sea-facing headland
    const run = fbm(s * 0.012, 7.7, 2);
    const colH = canyon ? 0 : Math.max(8, (seaward ? 26 : 18) + run * 12 + (hash(k, 2) - 0.5) * 1.5);
    out.push({
      s0: s, s1: s + len,
      depth: (hash(k, 3) - 0.5) * 2.8 + fbm(s * 0.03, 2.2, 2) * 1.2,
      colH,
      colA: 0.42 + hash(Math.floor(s / 40), 4) * 0.22 + hash(k, 5) * 0.05,
      over: 0.4 + hash(k, 6) * 1.5,
      ledges: [0, 1].filter((j) => hash(k, 7 + j) < 0.45).map((j) => ({ y: 0.3 + hash(k, 9 + j) * 0.55, back: 0.5 + hash(k, 11 + j) * 1.4 })),
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

/** Clefts cut down from the top of the wall, with straight sides. */
const CLEFTS = (() => {
  const out: { s: number; w: number; d: number; low: number }[] = [];
  for (let s = 25, k = 0; s < LENGTH; s += 35 + hash(k, 21) * 60, k++) out.push({ s, w: 1.2 + hash(k, 22) * 3, d: 2 + hash(k, 23) * 4, low: 0.2 + hash(k, 24) * 0.5 });
  return out;
})();

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
    if (df < hw + 3) noCols = true;
    calm = Math.max(calm, 1 - smoothstep(hw + 1, hw + 6, df));
  }
  for (const c of CAVES) {
    const u = Math.hypot(p.x - c.x, p.z - c.z) / (c.w / 2);
    if (u < 1) cave = { h: c.h * Math.sqrt(1 - u * u) * (0.85 + 0.15 * fbm(p.s * 0.4, 1, 2)) };
    if (u < 1.6) noCols = true;
  }
  return { alcove, cave, noCols, calm };
}

// ---- the face --------------------------------------------------------------------------------

/**
 * The wall above the columns (and behind them, and inside the caves), with its turf cap.
 * Attributes: `faceA` = (s, top, ground, colTop), `faceB` = (kind, block id, cave, alcove),
 * `faceC` = the way the foot line faces. Kind: 0 the open face, 1 behind the columns, 2 a cave,
 * 3 the turf cap.
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
    const p = footAt(s, corner);
    const nl = Math.hypot(p.nx, p.nz);
    const ground = groundHeight(p.x + (p.nx / nl) * 5, p.z + (p.nz / nl) * 5);
    const top = plateauAt(p.x - (p.nx / nl) * 6, p.z - (p.nz / nl) * 6) + 0.6;
    const foot = Math.min(ground - 5, top - 6);
    const blk = blockAt(s), bi = BLOCKS.indexOf(blk);
    const here = hereAt(p);
    // the underside of the rock over the columns is ragged, not a ruled line
    const colTop = blk.colH > 0 && !here.noCols ? Math.min(ground + blk.colH, top - 14) + fbm(s * 0.45, bi * 0.7, 2) * 1.8 : -1e3;
    // the heights of this line's vertices: even steps, plus a pair at every sharp change
    const ys: number[] = [];
    const nRows = Math.max(3, Math.ceil((top - foot) / vstep));
    for (let j = 0; j <= nRows; j++) ys.push(foot + ((top - foot) * j) / nRows);
    // the rock is quieter round the falls, where the water has worn it
    const wild = 1 - here.calm;
    const lowY = colTop > -1e3 ? colTop : ground;
    const ledgeY = (l: { y: number }) => lowY + 6 + (top - lowY - 16) * l.y;
    const lipH = 1.5 + hash(bi, 61) * 3.5;
    const sharp = [colTop, colTop + lipH, ...blk.ledges.map(ledgeY)];
    if (here.cave) sharp.push(ground + here.cave.h);
    for (const c of CLEFTS) if (Math.abs(s - c.s) < c.w) sharp.push(top - (top - ground) * (1 - c.low));
    for (const y of sharp) if (y > foot + 0.2 && y < top - 0.2) ys.push(y - 0.03, y + 0.03);
    ys.sort((a, b) => a - b);

    const start = vi, key: number[] = [];
    for (const y of ys) {
      let d = blk.depth * wild, kind = 0;
      const h01 = (y - foot) / (top - foot);
      if (y < colTop) {
        // behind the columns: a dark back wall
        d += -2.6 + fbm(s * 0.5, y * 0.2, 2) * 0.3;
        kind = 1;
      } else {
        // the rock over the columns juts out at its foot, then rises sheer
        const above = y - Math.max(colTop, foot);
        // as a block with a flat front and a square shoulder, not a rolled lip
        d += blk.over * wild * (colTop > -1e3 ? 1 - smoothstep(lipH - 0.03, lipH + 0.03, above) * (0.4 + hash(bi, 62) * 0.5) : 0.4);
        // vertical fractures: long grooves and ribs, split into blocks
        d += (facets(s, y) + fbm(s * 0.21 + bi * 0.37, y * 0.016, 2) * 1.2 + fbm(s * 2.2, y * 0.2, 2) * 0.15) * (0.3 + 0.7 * wild);
        // a few ledges where the face steps back
        for (const l of blk.ledges) d -= l.back * wild * smoothstep(-0.02, 0.02, y - ledgeY(l));
        // clefts cut down from the top, straight-sided
        for (const c of CLEFTS) {
          const dc = Math.abs(s - c.s);
          if (dc < c.w) d -= c.d * (1 - smoothstep(c.w * 0.5, c.w * 0.5 + 0.35, dc)) * smoothstep(-0.02, 0.02, y - (top - (top - ground) * (1 - c.low)));
        }
        // the shoulder of turf at the top, rounding back, and its lip hanging over
        d -= Math.pow(smoothstep(top - 6, top, y), 2) * 2.6 * wild;
        d += smoothstep(top - 0.9, top - 0.15, y) * 0.7 * wild;
      }
      // the alcove behind each fall, sheer-sided, scoured deeper at its foot
      d -= here.alcove * (1 + 0.35 * (1 - h01));
      // the sea caves
      if (here.cave && y < ground + here.cave.h) { d -= 7 + fbm(s * 0.3, y * 0.3, 2) * 1.2; kind = 2; }
      // grain
      d += fbm(s * 2.6, y * 2.6, 2) * 0.07;
      pos.push(p.x + p.nx * d, y, p.z + p.nz * d);
      A.push(s, top, ground, colTop);
      B.push(kind, bi, here.cave ? here.cave.h : 0, here.alcove);
      C.push(p.nx / nl, p.nz / nl);
      key.push(y);
      vi++;
    }
    // the cap: the land on top, carried back from the edge until the ground takes over
    const ex = pos[pos.length - 3], ez = pos[pos.length - 1];
    for (let k = 1; k <= CAP_ROWS; k++) {
      const back = k * k * 0.12 + k * 0.35;
      const qx = ex - (p.nx / nl) * back, qz = ez - (p.nz / nl) * back;
      const y = plateauAt(qx, qz) + 0.05;
      pos.push(qx, y, qz);
      A.push(s, y + 0.4, ground, -1e3);
      B.push(3, bi, 0, 0);
      C.push(p.nx / nl, p.nz / nl);
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
  const prism = (cx: number, cz: number, tx: number, tz: number, a: number, base: number, top: number, colTop: number, under: number) => {
    id++;
    const nx = -tz, nz = tx;
    // a slightly irregular hexagon, flat face to the front
    const vx: number[] = [], vz: number[] = [];
    for (let j = 0; j < 6; j++) {
      const th = (j * Math.PI) / 3, r = a * (0.92 + hash(id, j) * 0.14);
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
      const quad = [[vx[j], base, vz[j], 0], [vx[k], base, vz[k], w], [vx[k], ty(k), vz[k], w], [vx[j], base, vz[j], 0], [vx[k], ty(k), vz[k], w], [vx[j], ty(j), vz[j], 0]];
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
        P.push(vx[j], ty(j), vz[j]);
        A.push(id, 0.5, 1, 4);
        B.push(base, top, colTop, under);
        T.push(1, 0, 0);
      }
    }
  };
  for (const blk of BLOCKS) {
    if (blk.colH <= 0) continue;
    const a = blk.colA, step = 1.5 * a;
    const n = Math.floor((blk.s1 - blk.s0) / step);
    for (let i = 0; i < n; i++) {
      const s = blk.s0 + a * 0.75 + i * step;
      const p = footAt(s);
      const here = hereAt(p);
      if (here.noCols) continue;
      const nl = Math.hypot(p.nx, p.nz), nx = p.nx / nl, nz = p.nz / nl;
      const ground = groundHeight(p.x + nx * 5, p.z + nz * 5);
      const top = plateauAt(p.x - nx * 6, p.z - nz * 6) + 0.6;
      const colTop = Math.min(ground + blk.colH, top - 14);
      if (colTop < ground + 4) continue;
      // the honeycomb: every other column sits half a row back
      const zig = i & 1 ? -0.866 * a : 0;
      const at = (row: number) => {
        const d = blk.depth - 1.25 + zig + row * 1.732 * a + (hash(i, row + 31) - 0.5) * 0.18;
        return [p.x + nx * d, p.z + nz * d];
      };
      const baseAt = (x: number, z: number) => groundHeight(x, z) - 2.5;
      // the back row, up into the rock above
      {
        const [x, z] = at(-1);
        prism(x, z, p.tx, p.tz, a, baseAt(x, z), colTop + 2.5, colTop, 1);
      }
      // the front row: most reach the overhang, some have broken off short
      {
        const [x, z] = at(0);
        const broken = hash(i + blk.s0, 41) < 0.1;
        const h = broken ? ground + (colTop - ground) * (0.35 + hash(i, 42) * 0.5) : colTop + (hash(i, 43) - 0.6) * 3.2;
        prism(x, z, p.tx, p.tz, a, baseAt(x, z), h, colTop, broken ? 0 : 1);
      }
      // the stair
      if (blk.stair) {
        const t = (s - blk.s0) / (blk.s1 - blk.s0);
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.5);
        for (let r = 1; r <= blk.stair.rows; r++) {
          const [x, z] = at(r);
          const g = groundHeight(x, z);
          const h = blk.stair.h * (1 - (r - 1) / (blk.stair.rows + 0.5)) * env * (0.55 + hash(i, r + 50) * 0.6);
          if (h < 0.6) continue;
          prism(x, z, p.tx, p.tz, a, g - 2.5, g + h, colTop, 0);
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
      // water streaks running down from every ledge and crack
      float streak = smoothstep(0.5, 0.85, cn(vec2(sAlong * 0.9, y * 0.015)) * 0.7 + cn(vec2(sAlong * 3.1, y * 0.04)) * 0.3);
      c *= 1.0 - streak * 0.4 * (1.0 - abs(gn.y));
      // pale salt-and-lime drips on the sea-facing walls, thin
      float drip = smoothstep(0.72, 0.93, cn(vec2(sAlong * 4.0, y * 0.05))) * smoothstep(0.4, 0.75, cn(vec2(sAlong * 9.0, y * 0.4)));
      c = mix(c, vec3(0.3, 0.3, 0.29), drip * smoothstep(-30.0, 20.0, vCW.z) * smoothstep(colTop + 4.0, colTop + 20.0, y) * 0.25);
      // yellow-grey lichen crusts
      float lichen = smoothstep(0.62, 0.8, cf(vCW.xy * 0.33 + vCW.zy * 0.21));
      c = mix(c, vec3(0.19, 0.18, 0.1), lichen * 0.4);
      // ---- moss and turf ----
      float wetFall = fallWet();
      float canyon = vCW.z < -58.0 ? 1.0 : 0.0;
      float upish = gn.y;
      float ledge = smoothstep(0.3, 0.7, upish + (cf(vCW.xz * 0.4 + y * 0.1) - 0.5) * 0.5);
      // moss hangs down the face in curtains where water seeps, thickest in the canyon
      float curtain = smoothstep(0.6, 0.8, cf(vec2(sAlong * 0.22, y * 0.02)) * 0.7 + cn(vec2(sAlong * 0.9, y * 0.03)) * 0.3 + canyon * 0.06 + wetFall * 0.12 + streak * 0.12);
      float inCrack = (frac + xj) * smoothstep(0.45, 0.7, cn(vec2(sAlong * 0.6, y * 0.3))) * (0.4 + wetFall + canyon * 0.6);
      float moss = max(max(ledge, curtain * smoothstep(-0.6, 0.1, upish)), inCrack);
      moss = max(moss, smoothstep(5.0, 1.0, top - y + (cn(vec2(sAlong * 0.3, 1.0)) - 0.5) * 3.0));   // the turf shoulder at the top
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
      cAO *= mix(0.55, 1.0, smoothstep(colTop, colTop + 5.0, y));
      // ---- normal ----
      vec3 tn = ctri(rNor, 0.08) * 2.0 - 1.0, tn2 = ctri(rNor, 0.31) * 2.0 - 1.0;
      vec3 tilt3 = (tn + tn2 * 0.7) * 0.4;
      // the fractures are grooves: the face turns in at either side of each
      vec3 tg = normalize(cross(up, gn) + vec3(1e-4, 0.0, 0.0));
      float side = (fract(fq) - 0.5) * 2.0;
      vec3 nn = normalize(gn + vec3(tilt3.x, tilt3.y * 0.5, tilt3.x) * (1.0 - moss * 0.6) + tg * sign(side) * smoothstep(0.75, 1.0, abs(side)) * 0.5 * smoothstep(0.35, 0.6, cn(vec2(floor(fq) * 3.1, y * 0.025))));
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
      vec3 c = vec3(0.075, 0.076, 0.08) * (0.55 + tl * 1.2) * (0.8 + cid * 0.4);
      // a paler grey weathered skin in patches, more on the dry upper columns
      float skin = smoothstep(0.45, 0.75, cf(vec2(um * 0.8 + id * 3.7, y * 0.12)));
      c = mix(c, vec3(0.13, 0.13, 0.128) * (0.7 + tl * 0.5), skin * 0.4 * smoothstep(1.0, 6.0, y - base - 2.5));
      // joints: each column cracked across every half metre to metre and a half, never in line
      // with its neighbours, the cracks a little tilted and not all the way across
      float sp = 0.45 + ch(vec2(id, 5.1)) * 1.0;
      float jy = (y + cid * 11.0 + (um - fw * 0.5) * (ch(vec2(id, 6.3)) - 0.5) * 0.3) / sp;
      float jd = abs(fract(jy + 0.5) - 0.5) * sp;
      float joint = (1.0 - smoothstep(0.008, 0.03, jd)) * step(0.25, ch(vec2(id, floor(jy + 0.5)))) * (1.0 - isTop);
      // the stone just under each joint is chipped paler
      float chip = smoothstep(0.03, 0.06, jd) * (1.0 - smoothstep(0.06, 0.12, jd)) * step(0.5, cn(vec2(um * 6.0, y * 3.0))) * (1.0 - isTop);
      c *= 1.0 - joint * 0.7;
      c += chip * 0.025;
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
      float moss = max(max(isTop * smoothstep(0.35, 0.55, cn(vCW.xz * 1.3) + 0.25), drips), mossJ);
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
