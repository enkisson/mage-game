// The road out of the bay. When the stand on the beach is won, the way on is up: a road cut into
// the column mass of the north wall's east end, climbing in four switchbacks from the sand to the
// clifftop, where a ruined gatehouse opens onto the land above and the next level.
//
// Each leg is a ledge cut into the cliff, the next one up set further back into the rock, with
// the turn between them cut straight back into the wall. The columns ARE the road bed (the cliff
// builder cuts them off flush under the paving), so the road reads as made from the cliff, with a
// low masonry parapet along its sea edge.
//
// The layout is worked out in the cliff's own terms: `s` metres along the cliff foot and `d`
// metres back into the rock from it. It is then traced into the world along a smoothed foot, so
// the legs run straight and true even where the foot breaks at angles.
import * as THREE from 'three';
import { OUTLINE, groundHeight, plateauAt } from './layout';
import { fogUniforms } from './atmosphere';
import type { TextureSet } from './terrain';

const SEG = (() => {
  const cum = [0];
  for (let i = 1; i < OUTLINE.length; i++) cum.push(cum[i - 1] + Math.hypot(OUTLINE[i][0] - OUTLINE[i - 1][0], OUTLINE[i][1] - OUTLINE[i - 1][1]));
  return cum;
})();

function footRaw(s: number): { x: number; z: number; nx: number; nz: number } {
  let i = 0;
  while (i < SEG.length - 2 && SEG[i + 1] <= s) i++;
  const a = OUTLINE[i], b = OUTLINE[i + 1], len = SEG[i + 1] - SEG[i], t = Math.min(1, Math.max(0, (s - SEG[i]) / len));
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx: -(b[1] - a[1]) / len, nz: (b[0] - a[0]) / len };
}

/** The cliff foot at `s`, smoothed over sixteen metres: where, and which way is out to sea. */
function foot(s: number): { x: number; z: number; nx: number; nz: number } {
  let x = 0, z = 0, nx = 0, nz = 0, n = 0;
  for (let k = -8; k <= 8; k++) { const f = footRaw(s + k); x += f.x; z += f.z; nx += f.nx; nz += f.nz; n++; }
  const l = Math.hypot(nx, nz);
  return { x: x / n, z: z / n, nx: nx / l, nz: nz / l };
}

/** A point of the road: where, how high its paving is, and which way its sea edge faces. */
export interface RoadPoint { x: number; z: number; y: number; nx: number; nz: number }
/** One piece of the road: a leg along the cliff, or a turn cut back into it. */
export interface RoadPiece { kind: 'leg' | 'turn' | 'apron'; pts: RoadPoint[] }

/** Half the road's width, and the parapet's width on its sea edge. */
export const ROAD_HALF = 2.4;
export const PARAPET = 0.8;

/** The legs, in the cliff's terms: from s0 to s1, d back into the rock, paving from y0 to y1. */
const LEGS = [
  { s0: 660, s1: 606, d: 1.5 },
  { s0: 606, s1: 652, d: 9.5 },
  { s0: 652, s1: 606, d: 17.5 },
  { s0: 606, s1: 640, d: 25.5 },
];

const at = (s: number, d: number) => { const f = foot(s); return { x: f.x - f.nx * d, z: f.z - f.nz * d, nx: f.nx, nz: f.nz }; };

export const ROAD: { pieces: RoadPiece[]; path: RoadPoint[]; start: THREE.Vector3; end: THREE.Vector3; endDir: THREE.Vector3 } = (() => {
  // the climb is shared evenly over the whole length, the turns included
  const startY = groundHeight(at(LEGS[0].s0, LEGS[0].d).x, at(LEGS[0].s0, LEGS[0].d).z) + 0.25;
  const last = LEGS[LEGS.length - 1], endP = at(last.s1, last.d);
  const endY = plateauAt(endP.x, endP.z) + 0.2;
  const raw: { kind: 'leg' | 'turn'; sd: [number, number][] }[] = [];
  // the approach: a causeway of broken columns climbing from the open beach at the bay's east
  // end, over the cliff's last stumps, to where the first leg starts (about one in three)
  const A = { x: 195, z: -2 };
  LEGS.forEach((l, k) => {
    const sd: [number, number][] = [];
    const n = Math.ceil(Math.abs(l.s1 - l.s0));
    for (let i = 0; i <= n; i++) sd.push([l.s0 + ((l.s1 - l.s0) * i) / n, l.d]);
    raw.push({ kind: 'leg', sd });
    const nx = LEGS[k + 1];
    if (nx) {
      // the turn: past the end of this leg, cut straight back into the rock to the next
      const sT = l.s1 + Math.sign(l.s1 - l.s0) * ROAD_HALF;
      const tsd: [number, number][] = [];
      for (let i = 0; i <= 8; i++) tsd.push([sT, l.d + ((nx.d - l.d) * i) / 8]);
      raw.push({ kind: 'turn', sd: tsd });
    }
  });
  // the length of each piece, for the climb
  const beachY = groundHeight(A.x, A.z) + 0.2;
  const lengths = raw.map((p) => p.sd.reduce((acc, v, i) => (i ? acc + Math.hypot(v[0] - p.sd[i - 1][0], v[1] - p.sd[i - 1][1]) : 0), 0));
  const total = lengths.reduce((a, b) => a + b, 0);
  let run = 0;
  const pieces: RoadPiece[] = raw.map((p, pi) => {
    const pts: RoadPoint[] = [];
    let acc = 0;
    p.sd.forEach(([s, d], i) => {
      if (i) acc += Math.hypot(s - p.sd[i - 1][0], d - p.sd[i - 1][1]);
      const w = at(s, d);
      const t = (run + acc) / total;
      // ease the climb in at the bottom and out at the top
      const e = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      pts.push({ x: w.x, z: w.z, y: startY + (endY - startY) * e, nx: w.nx, nz: w.nz });
    });
    run += lengths[pi];
    return { kind: p.kind, pts };
  });
  {
    const b = at(LEGS[0].s0, LEGS[0].d), N = 30, pts: RoadPoint[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // eased into the leg at the top, so the turn onto it is smooth
      const u = t < 0.8 ? t / 0.8 * 0.85 : 0.85 + (t - 0.8) / 0.2 * 0.15;
      pts.push({ x: A.x + (b.x - A.x) * u, z: A.z + (b.z - A.z) * u, y: beachY + (startY - beachY) * t, nx: b.nx, nz: b.nz });
    }
    pieces.unshift({ kind: 'turn', pts });
  }
  const top = pieces[pieces.length - 1].pts;
  const e = top[top.length - 1], e1 = top[top.length - 4];
  const ed = new THREE.Vector3(e.x - e1.x, 0, e.z - e1.z).normalize();
  // the apron: the paving carried on level from the top of the road into the gatehouse
  {
    const pts: RoadPoint[] = [];
    for (let i = 0; i <= 8; i++) pts.push({ x: e.x + ed.x * i, z: e.z + ed.z * i, y: e.y, nx: e.nx, nz: e.nz });
    pieces.push({ kind: 'apron', pts });
  }
  const path = pieces.flatMap((p, i) => (i ? p.pts.slice(1) : p.pts));
  return {
    pieces, path,
    start: new THREE.Vector3(path[0].x, path[0].y, path[0].z),
    end: new THREE.Vector3(e.x, e.y, e.z),
    endDir: ed,
  };
})();

/** The road's bounding box in plan, with a margin, to skip the work far from it. */
const BOX = (() => {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of ROAD.path) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  return { minX: minX - 12, maxX: maxX + 12, minZ: minZ - 12, maxZ: maxZ + 12 };
})();

/**
 * What the road asks of the rock at (x, z). `bed`: the paving's height, where a column must be cut
 * off flush beneath it (or built up to it); `cap`: the most a column may stand here, so the road
 * has open air above it and the leg below has a wall behind; `near`: close enough to the road that
 * the columns should be small and fit its edges.
 */
export function roadAt(x: number, z: number): { bed: number | null; cap: number; near: boolean } {
  const out = { bed: null as number | null, cap: Infinity, near: false };
  if (x < BOX.minX || x > BOX.maxX || z < BOX.minZ || z > BOX.maxZ) return out;
  for (const piece of ROAD.pieces) {
    const pts = piece.pts;
    let best = 1e9, bo = 0, by = 0, bt = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      const tc = Math.max(0, Math.min(1, t));
      const qx = a.x + dx * tc, qz = a.z + dz * tc, dist = Math.hypot(x - qx, z - qz);
      if (dist < best) {
        best = dist;
        by = a.y + (b.y - a.y) * tc;
        // which side: the sea side of a leg; for a turn, across it either way
        bo = piece.kind === 'leg' ? (x - qx) * a.nx + (z - qz) * a.nz : dist;
        bt = (i + t) / (pts.length - 1);
      }
    }
    const inSpan = bt >= -0.02 && bt <= 1.02;
    const half = ROAD_HALF + PARAPET;
    if (best < half + 3.5) out.near = true;
    if (piece.kind !== 'leg') {
      if (best < half + 0.4) out.bed = Math.max(out.bed ?? -Infinity, by);
      continue;
    }
    if (!inSpan) continue;
    if (Math.abs(bo) < half) out.bed = Math.max(out.bed ?? -Infinity, by);
    else if (bo >= half) out.cap = Math.min(out.cap, by - 0.6);
  }
  return out;
}

// ---- the paving and the parapet ------------------------------------------------------------------

function ribbon(pts: RoadPoint[], left: (p: RoadPoint) => [number, number, number], right: (p: RoadPoint) => [number, number, number], P: number[], U: number[], I: number[], run0: number) {
  const base = P.length / 3;
  let run = run0;
  pts.forEach((p, i) => {
    if (i) run += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    P.push(...left(p), ...right(p));
    U.push(0, run, 1, run);
    if (i < pts.length - 1) { const a = base + i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  return run;
}

/** The paving: the whole road as one strip, with skirts down its two edges. */
export function roadDeck(): THREE.BufferGeometry {
  const P: number[] = [], U: number[] = [], I: number[] = [];
  let run = 0;
  for (const piece of ROAD.pieces) {
    const pts = piece.pts;
    // across the road: for a leg, along the sea normal; for a turn, sideways to its run
    const across = (p: RoadPoint, i: number): [number, number] => {
      if (piece.kind === 'leg') return [p.nx, p.nz];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    };
    const hw = piece.kind === 'leg' ? ROAD_HALF : ROAD_HALF + 0.3;
    const L = (p: RoadPoint): [number, number, number] => { const i = pts.indexOf(p), [ax, az] = across(p, i); return [p.x - ax * hw, p.y + 0.06, p.z - az * hw]; };
    const R = (p: RoadPoint): [number, number, number] => { const i = pts.indexOf(p), [ax, az] = across(p, i); return [p.x + ax * hw, p.y + 0.06, p.z + az * hw]; };
    run = ribbon(pts, L, R, P, U, I, run);
    // skirts, so the paving has a thickness at its edges
    for (const side of [L, R]) {
      const base = P.length / 3;
      pts.forEach((p, i) => {
        const [x, y, z] = side(p);
        P.push(x, y, z, x, y - 0.45, z);
        U.push(0, 0, 0, 0);
        if (i < pts.length - 1) { const a = base + i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/** The parapet on each leg's sea edge: rough-cut blocks, gapped here and there where it has fallen. */
export function roadParapet(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  let k = 0;
  for (const piece of ROAD.pieces) {
    if (piece.kind !== 'leg') continue;
    const pts = piece.pts;
    // lay blocks a metre or so long along the edge
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let u = acc > 0 ? 1.15 - acc : 0; u < len; u += 1.15) {
        k++;
        const t = u / len;
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
        if (hash(k, 1) < 0.08) continue; // fallen
        const h = 1.05 + (hash(k, 2) - 0.5) * 0.25 - (hash(k, 3) < 0.07 ? 0.5 : 0);
        const g = new THREE.BoxGeometry(1.08, h + 0.9, 0.62);
        // bevel the top a little by pulling its top corners in
        const p = g.attributes.position;
        for (let j = 0; j < p.count; j++) if (p.getY(j) > 0) { p.setX(j, p.getX(j) * 0.96); p.setZ(j, p.getZ(j) * 0.86); }
        g.translate(0, (h + 0.9) / 2 - 0.9, 0);
        g.rotateZ((hash(k, 4) - 0.5) * 0.03);
        g.rotateY(Math.atan2(-(b.z - a.z), b.x - a.x) + (hash(k, 5) - 0.5) * 0.04);
        g.translate(x + a.nx * (ROAD_HALF + 0.35), y, z + a.nz * (ROAD_HALF + 0.35));
        parts.push(g.toNonIndexed());
      }
      acc = (acc + len) % 1.15;
    }
  }
  const merged = new THREE.BufferGeometry();
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { p.computeVertexNormals(); P.set(p.attributes.position.array as Float32Array, o * 3); N.set(p.attributes.normal.array as Float32Array, o * 3); o += p.attributes.position.count; }
  merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return merged;
}

/** Old dressed stone: flags and blocks of dark basalt, worn, wet, the joints full of moss. */
export function masonryMaterial(rock: TextureSet, paving: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const u = { rMap: { value: rock.diff } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vMW; varying vec3 vMN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vMW = (modelMatrix * vec4(position, 1.0)).xyz; vMN = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D rMap;
        varying vec3 vMW; varying vec3 vMN;
        float mRough, mAO;
        float mh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 437.585); }
        float mn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }
        // irregular flags: the distance to the nearest edge of a jittered cell, and the cell's id
        vec2 flags(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          float d1 = 8.0, d2 = 8.0; float id = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y)), o = vec2(mh(i + g), mh(i + g + 7.3)) * 0.8 + 0.1;
            float d = length(g + o - f);
            if (d < d1) { d2 = d1; d1 = d; id = mh(i + g + 3.1); } else if (d < d2) d2 = d;
          }
          return vec2(d2 - d1, id);
        }`)
      .replace('#include <map_fragment>', `
        vec3 n = normalize(vMN);
        vec3 tw = pow(abs(n), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
        vec3 tex = texture2D(rMap, vMW.zy * 0.25).rgb * tw.x + texture2D(rMap, vMW.xz * 0.25).rgb * tw.y + texture2D(rMap, vMW.xy * 0.25).rgb * tw.z;
        float tl = dot(tex, vec3(0.3, 0.55, 0.15));
        vec2 fl = ${paving ? 'flags(vMW.xz * 0.85)' : 'flags(vec2(dot(vMW.xz, normalize(vec2(1.0, 0.7))) * 1.2, vMW.y * 2.2))'};
        float joint = 1.0 - smoothstep(0.03, 0.09, fl.x);
        vec3 c = vec3(0.105, 0.095, 0.085) * (0.55 + tl * 1.1) * (0.75 + fl.y * 0.5);
        // worn smooth and paler down the middle where feet went, wet in the low places
        float wear = ${paving ? 'smoothstep(0.35, 0.8, mn(vMW.xz * 0.5))' : '0.0'};
        c *= 1.0 + wear * 0.25;
        float moss = joint * smoothstep(0.35, 0.65, mn(vMW.xz * 1.7 + vMW.y));
        c = mix(c * (1.0 - joint * 0.6), vec3(0.04, 0.055, 0.02) * (0.7 + mn(vMW.xz * 9.0) * 0.5), moss * 0.8);
        float wet = smoothstep(0.55, 0.8, mn(vMW.xz * 0.23 + 4.0));
        c *= mix(1.0, 0.6, wet * (1.0 - joint));
        diffuseColor.rgb *= c;
        mRough = mix(mix(0.8, 0.25, wet), 0.95, max(joint, moss));
        mAO = 1.0 - joint * 0.5;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mRough;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= mAO;');
  };
  m.customProgramCacheKey = () => (paving ? 'paving' : 'parapet');
  return m;
}
