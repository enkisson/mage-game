// The sea off the beach: sea stacks, a natural arch, the reef the ship struck and the wreckage
// she left on it and downwind of it. Everything is generated here; nothing is loaded.
// World frame: x east, y up, z south (toward the open sea). Sea level is y = 0.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, smoothstep, clamp, rng } from '../../core/math';
import { seaStack } from './cliffs';
import {
  ARCH_BRIDGE, ARCH_LEGS, BOULDERS, HULL_ROCKS, MAST_ROCK, SEA_ROCKS, SKERRIES, STACK_SPECS,
  type Skerry, type StackSpec,
} from './searocks-data';

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---- geometry plumbing ----------------------------------------------------------------------------

/** Replace any NaN or infinite position or normal so a bad vertex never reaches the GPU. */
function sanitize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) p.setXYZ(i, 0, -5, 0);
    if (n) {
      const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
      if (!Number.isFinite(l) || l < 1e-6) n.setXYZ(i, 0, 1, 0);
    }
  }
  return g;
}

/** Rock: position and welded smooth normals only (the rock shader is triplanar in world space). */
function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const w = mergeVertices(g, 1e-4);
  w.computeVertexNormals();
  return sanitize(w);
}

/** Wood, rope: position, normal, and a per-vertex tint. */
function prep(g: THREE.BufferGeometry, tint: (x: number, y: number, z: number, i: number) => number = () => 1): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  if (!g.index) { const n = g.attributes.position.count; g.setIndex(Array.from({ length: n }, (_, i) => i)); }
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = tint(p.getX(i), p.getY(i), p.getZ(i), i);
    c[i * 3] = t; c[i * 3 + 1] = t * 0.97; c[i * 3 + 2] = t * 0.93;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return sanitize(g);
}

const woodTint = (x: number, y: number, z: number) => clamp(0.72 + 0.4 * (fbm(x * 2.1 + z * 0.7, y * 3 + z * 2.3, 2) * 0.5 + 0.5) + 0.12 * Math.sin(x * 31 + z * 17), 0.5, 1.15);
const ropeTint = (x: number, y: number, z: number) => clamp(0.85 + 0.25 * fbm(x * 6, z * 6 + y * 4, 2), 0.6, 1.1);

// ---- rock generators --------------------------------------------------------------------------------

/**
 * A sea stack: tapering, stepped in ledges, leaning, with flat fracture faces sliced down it and
 * an optional sloping cut across the top. Welded and smooth-shaded.
 */
function spire(s: StackSpec, radial = 56, rows = 110): THREE.BufferGeometry {
  const { x, z, h, r, seed } = s;
  const lean = s.lean ?? [0, 0], slope = s.cut ?? 0, dir = s.cutDir ?? 0;
  const geo = new THREE.CylinderGeometry(1, 1, 1, radial, rows, false);
  const planes: { nx: number; nz: number; d: number; y0: number; y1: number }[] = [];
  for (let k = 0; k < 5; k++) {
    const a = hash(seed, k * 5 + 1) * TAU, y0 = h * hash(seed, k * 5 + 3) * 0.65;
    planes.push({ nx: Math.cos(a), nz: Math.sin(a), d: r * (0.55 + 0.3 * hash(seed, k * 5 + 2)), y0, y1: y0 + h * (0.25 + 0.4 * hash(seed, k * 5 + 4)) });
  }
  const p = geo.attributes.position;
  const hh = Math.max(h, 1);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i), t = p.getY(i) + 0.5;
    const a = Math.atan2(vz, vx), rad = Math.hypot(vx, vz);
    const jag = fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 3) * (1.2 + h * 0.02) * rad;
    const top = hh + slope * rad * r * Math.cos(a - dir) + jag;
    const y = -18 + t * (top + 18);
    const hv = clamp(y / hh, 0, 1.2);
    let prof = 1 - 0.36 * Math.pow(hv, 0.8);
    prof *= 1 + 0.5 * Math.exp(-Math.max(y, 0) / (2 + 0.06 * h));
    prof *= 1 + Math.max(-y, 0) * 0.025;
    prof *= 0.9 + 0.2 * fbm(y * 0.08 + seed, seed * 0.7, 3);
    const tier = Math.floor(hv * 9 + fbm(a, seed, 2)), tf = hv * 9 - tier;
    prof *= 1 - (1 - Math.min(1, tf * 4)) * 0.11 * hash(tier, seed);
    const lump = fbm(Math.cos(a) * 1.5 + seed, y * 0.12 + Math.sin(a) * 1.5, 4) * 0.45 + fbm(Math.cos(a) * 5, y * 0.5 + Math.sin(a) * 5, 3) * 0.1;
    const flutes = Math.pow(Math.abs(Math.sin(a * 9 + seed + fbm(y * 0.1, a, 2) * 2)), 0.5) * 0.08;
    const rr = r * Math.max(0.05, prof) * (1 + lump + flutes) * rad;
    let px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
    for (const pl of planes) {
      const w = smoothstep(pl.y0 - 2, pl.y0 + 3, y) * (1 - smoothstep(pl.y1 - 3, pl.y1 + 2, y));
      const dot = px * pl.nx + pz * pl.nz;
      if (w > 0 && dot > pl.d) { px -= pl.nx * (dot - pl.d) * w; pz -= pl.nz * (dot - pl.d) * w; }
    }
    const yy = Math.max(y, 0), bend = 1 + 0.6 * yy / hh;
    p.setXYZ(i, x + px + lean[0] * yy * bend, y, z + pz + lean[1] * yy * bend);
  }
  return weld(geo);
}

/** The bridge of the arch: a swept lump of rock, thick at the abutments and thin at the crown. */
function archBridge(): THREE.BufferGeometry {
  const a = ARCH_LEGS[0], b = ARCH_LEGS[1], B = ARCH_BRIDGE;
  const lx = (leg: StackSpec, y: number) => leg.x + leg.lean![0] * y * (1 + 0.6 * y / leg.h);
  const x0 = lx(a, B.endY) + 1.5, x1 = lx(b, B.endY) - 1.5;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(V(x0 + (x1 - x0) * t, B.endY + (B.crownY - B.endY) * Math.pow(Math.sin(Math.PI * t), 0.75), a.z + (b.z - a.z) * t + Math.sin(t * 3) * 0.6));
  }
  const g = sweep(pts, (t) => {
    const e = Math.pow(Math.abs(t - 0.5) * 2, 1.6);
    return [B.crownThick + (B.endThick - B.crownThick) * e, B.depth * (0.62 + 0.38 * e)];
  }, { radial: 40, samples: 90, up: V(0, 0, 1), noise: 0.2, seed: 77, flatSlice: true });
  return weld(g);
}

/**
 * A skerry or boulder: a displaced, fractured lump. Flat cuts slice it, the highest of them
 * tilted into a shelf; it is rescaled so its top sits exactly h above the sea and it carries on
 * below the surface.
 */
function rockLump(s: { x: number; z: number; rx: number; rz: number; h: number; yaw: number; seed: number }, jaggedness: number, detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, k = s.seed;
  const cuts: { n: THREE.Vector3; c: number }[] = [];
  const nc = 4 + (k % 3);
  for (let f = 0; f < nc; f++) {
    const n = V(hash(k, f * 3 + 11) - 0.5, hash(k, f * 3 + 12) * 0.9 - 0.2, hash(k, f * 3 + 13) - 0.5).normalize();
    cuts.push({ n, c: 0.55 + hash(k, f + 30) * 0.3 });
  }
  cuts.push({ n: V(hash(k, 70) * 0.5 - 0.25, 1, hash(k, 71) * 0.4 - 0.2).normalize(), c: 0.62 + hash(k, 72) * 0.2 });
  let maxY = 0.001;
  const ys = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const ridged = 1 - Math.abs(fbm(vx * 3 + k, vz * 3 + vy * 2, 3) * 2);
    let d = 1 + fbm(vx * 1.4 + k * 3.1, vz * 1.4 + vy * 1.2, 4) * 0.35 + fbm(vx * 4 + k, vy * 4 + vz * 3, 3) * 0.1 + ridged * 0.22 * jaggedness;
    for (const c of cuts) {
      const proj = vx * c.n.x + vy * c.n.y + vz * c.n.z;
      if (proj * d > c.c) d = c.c / Math.max(proj, 1e-3);
    }
    p.setXYZ(i, vx * d * s.rx, vy * d, vz * d * s.rz);
    ys[i] = vy * d;
    if (ys[i] > maxY) maxY = ys[i];
  }
  const sy = s.h / maxY;
  for (let i = 0; i < p.count; i++) {
    const y = ys[i] > 0 ? ys[i] * sy : Math.max(ys[i] * sy * 4, -3);
    p.setY(i, y);
  }
  g.rotateY(-s.yaw);
  g.translate(s.x, 0, s.z);
  return weld(g);
}

// ---- sweeps: spars, ropes, ribs, mast, bridge ----------------------------------------------------------

interface SweepOpts {
  radial?: number; samples?: number; up?: THREE.Vector3; noise?: number; seed?: number;
  /** Ragged break at the far end: how far (metres) the splinters reach along the axis. */
  splinter?: number;
  /** Cut the near end the same way. */
  splinterStart?: number;
  flatSlice?: boolean;
}

/** A tube along a smooth path with a varying elliptical section [across, along up] and noisy rind. */
function sweep(pts: THREE.Vector3[], radius: (t: number) => number | [number, number], o: SweepOpts = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 10, samples = o.samples ?? 24, seed = o.seed ?? 1, noise = o.noise ?? 0;
  const up = o.up ?? V(0, 1, 0);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const rings: { i: number; s: number; cap: boolean }[] = [{ i: 0, s: 0, cap: true }];
  for (let i = 0; i <= samples; i++) rings.push({ i, s: 1, cap: false });
  rings.push({ i: samples, s: 0, cap: true });
  const pos: number[] = [], idx: number[] = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), P = new THREE.Vector3();
  const splinterAt = (a: number) => (fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 3) * 0.5 + 0.5) * (0.5 + 0.5 * Math.abs(Math.sin(a * 3 + seed)));
  for (const ring of rings) {
    const t = ring.i / samples;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    N.copy(up).addScaledVector(T, -up.dot(T));
    if (N.lengthSq() < 1e-4) N.set(1, 0, 0).addScaledVector(T, -T.x);
    N.normalize(); Bn.crossVectors(T, N).normalize();
    const rv = radius(t), rx = Array.isArray(rv) ? rv[0] : rv, ry = Array.isArray(rv) ? rv[1] : rv;
    const endW = ring.i === samples ? 1 : ring.i === 0 ? 2 : 0;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      let ex = ca * rx * ring.s, ey = sa * ry * ring.s;
      const nz = 1 + noise * fbm(P.x * 3.1 + ca * 1.7 + seed, P.z * 3.1 + P.y * 2.3 + sa * 1.7, 3);
      ex *= nz; ey *= nz;
      if (o.flatSlice) { // knock a flat on the underside and the shoulders
        ey = Math.max(ey, -ry * 0.55 * (0.8 + 0.4 * hash(seed, k % 7)));
      }
      let along = 0;
      if (endW === 1 && o.splinter) along = splinterAt(a) * o.splinter * (ring.s ? 0.6 : 1);
      if (endW === 2 && o.splinterStart) along = -splinterAt(a + 1.7) * o.splinterStart * (ring.s ? 0.6 : 1);
      pos.push(P.x + N.x * ex + Bn.x * ey + T.x * along, P.y + N.y * ex + Bn.y * ey + T.y * along, P.z + N.z * ex + Bn.z * ey + T.z * along);
    }
  }
  const nr = rings.length;
  for (let j = 0; j < nr - 1; j++) {
    for (let k = 0; k < radial; k++) {
      const a = j * radial + k, b = j * radial + ((k + 1) % radial), c = (j + 1) * radial + k, d = (j + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return sanitize(g);
}

/** A straight-ish spar from a to b with a gentle bow. */
function spar(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seed: number, splinter = 0.25, splinterStart = 0): THREE.BufferGeometry {
  const mid = a.clone().lerp(b, 0.5); mid.y += 0.04 * hash(seed, 1) * a.distanceTo(b) * 0.1;
  const g = sweep([a, a.clone().lerp(mid, 0.5), mid, mid.clone().lerp(b, 0.5), b], (t) => r0 + (r1 - r0) * t, { radial: 10, samples: 20, noise: 0.07, seed, splinter, splinterStart });
  return prep(g, woodTint);
}

function line(a: THREE.Vector3, b: THREE.Vector3, sag: number, r: number, seed: number, wob = 0.15): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    p.x += Math.sin(t * 7 + seed) * wob * t * (1 - t) * 4; p.z += Math.cos(t * 5 + seed) * wob * t * (1 - t) * 4;
    p.y = Math.max(p.y, 0.04);
    pts.push(p);
  }
  return prep(sweep(pts, () => r, { radial: 6, samples: 36, seed }), ropeTint);
}

// ---- the ship's bow --------------------------------------------------------------------------------

const HULL = { L: 8.6, beam: 3.1, depth: 2.4, planks: 17, thick: 0.2 };

/** A point on the hull's skin. s runs from the broken end (0) to the stem (1); phi from port gunwale (-1) over the keel to starboard (+1). */
function hullAt(s: number, phi: number): THREE.Vector3 {
  const w = HULL.beam * Math.pow(Math.max(1 - Math.pow(s, 2.2), 0), 0.8) + 0.04;
  const D = HULL.depth * (1 - 0.5 * s * s);
  const th = phi * 1.42;
  const flare = 1 + 0.1 * smoothstep(-0.5, 1.4, Math.abs(th)) * (1 - s);
  return V(s * HULL.L + 1.3 * Math.pow(s, 4), -D * Math.cos(th) + 0.9 * s * s, w * Math.sin(th) * flare);
}

/**
 * The broken-off bow of the ship: clinker planking over ribs, curving to the stem. The broken end
 * is ragged plank by plank and the starboard side is stove in high up, leaving the ribs standing
 * bare. Built in a local frame (bow toward +x, keel at the bottom) and placed by the caller.
 */
function hullBow(): { skin: THREE.BufferGeometry; ribs: THREE.BufferGeometry } {
  const nu = 46, nv = 118, W = nv + 1;
  const phiBot = (fu: number) => -1 + 0.1 * (fbm(fu * 6, 3, 2) * 0.5 + 0.5);
  const phiTop = (fu: number) => 1 - 0.62 * (1 - smoothstep(0, 0.75, fu)) * (0.75 + 0.5 * (fbm(fu * 9, 8, 2) * 0.5 + 0.5)) - 0.06 * (fbm(fu * 5, 2, 2) * 0.5 + 0.5);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const outer: THREE.Vector3[] = [], inner: THREE.Vector3[] = [];
  for (let iu = 0; iu <= nu; iu++) {
    for (let iv = 0; iv <= nv; iv++) {
      const fu = iu / nu, fv = iv / nv;
      const phi = phiBot(fu) + (phiTop(fu) - phiBot(fu)) * fv;
      const plank = Math.floor((phi + 1) / 2 * HULL.planks);
      const ph = ((phi + 1) / 2 * HULL.planks) - plank;
      const s0 = 0.03 + 0.2 * hash(plank, 5) + 0.04 * fbm(phi * 5, 1, 2);
      const s = s0 + (1 - s0) * fu;
      const e = 0.01;
      const base = hullAt(s, phi);
      const du = hullAt(Math.min(s + e, 1), phi).sub(hullAt(Math.max(s - e, 0), phi));
      const dp = hullAt(s, phi + e).sub(hullAt(s, phi - e));
      const n = new THREE.Vector3().crossVectors(dp, du);
      if (n.lengthSq() < 1e-10) n.set(0, -1, 0);
      n.normalize();
      // the skin must face outward: away from the hull's axis
      if (n.dot(V(0, base.y + 1.2, base.z)) < 0) n.negate();
      const groove = ph < 0.1 ? -0.04 : 0;
      const off = 0.05 * ph + groove + 0.025 * (hash(plank, 9) - 0.5) + 0.01 * fbm(s * 20, phi * 12, 2);
      const o = base.clone().addScaledVector(n, off);
      const i2 = base.clone().addScaledVector(n, -HULL.thick);
      outer.push(o); inner.push(i2);
      pos.push(o.x, o.y, o.z);
      const tint = clamp(0.62 + 0.38 * hash(plank, 9) + 0.15 * fbm(s * 8, phi * 10, 2), 0.45, 1.1);
      col.push(tint, tint * 0.97, tint * 0.93);
    }
  }
  const nO = outer.length;
  for (const q of inner) { pos.push(q.x, q.y, q.z); col.push(0.5, 0.48, 0.45); }
  const id = (iu: number, iv: number) => iu * W + iv;
  for (let iu = 0; iu < nu; iu++) {
    for (let iv = 0; iv < nv; iv++) {
      const a = id(iu, iv), b = id(iu + 1, iv), c = id(iu, iv + 1), d = id(iu + 1, iv + 1);
      idx.push(a, b, c, c, b, d);
      idx.push(nO + a, nO + c, nO + b, nO + c, nO + d, nO + b);
    }
  }
  // thickness along the four ragged edges
  const e0: [number, number][] = [], e1: [number, number][] = [], e2: [number, number][] = [], e3: [number, number][] = [];
  for (let iv = 0; iv <= nv; iv++) { e0.push([id(0, iv), id(0, iv)]); e1.push([id(nu, iv), id(nu, iv)]); }
  for (let iu = 0; iu <= nu; iu++) { e2.push([id(iu, 0), id(iu, 0)]); e3.push([id(iu, nv), id(iu, nv)]); }
  const stripEdge = (e: [number, number][]) => {
    for (let k = 0; k < e.length - 1; k++) {
      const a = e[k][0], b = e[k + 1][0];
      idx.push(a, b, a + nO, a + nO, b, b + nO);
    }
  };
  [e0, e1, e2, e3].forEach(stripEdge);
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  skin.setIndex(idx);
  skin.computeVertexNormals();
  sanitize(skin);

  // ribs: each one a frame inside the skin, standing past the planking where it was stove in
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const s = 0.04 + k * 0.105 + 0.01 * hash(k, 3);
    const top = k < 6 ? 0.88 + 0.12 * hash(k, 4) : 0.6 + 0.2 * hash(k, 5);
    const pts: THREE.Vector3[] = [];
    const bot = -0.95 + 0.1 * hash(k, 6);
    for (let i = 0; i <= 14; i++) {
      const phi = bot + (top - bot) * (i / 14);
      const q = hullAt(s, phi);
      pts.push(q);
    }
    // shrink toward the axis by the planking thickness plus the rib's half width
    const axis = V(s * HULL.L + 1.3 * Math.pow(s, 4), 0.3, 0);
    const shrunk = pts.map((p) => p.clone().sub(axis).multiplyScalar(1 - 0.42 / Math.max(p.clone().sub(axis).length(), 1)).add(axis));
    const g = sweep(shrunk, () => [0.075, 0.14], { radial: 7, samples: 40, up: V(1, 0, 0), noise: 0.06, seed: 40 + k, splinter: 0.18 });
    parts.push(prep(g, woodTint));
  }
  // keelson along the bottom, sticking out past the broken end
  const keel: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const s = i / 8 * 0.9; const q = hullAt(s, 0); keel.push(V(q.x - (i === 0 ? 0.8 : 0) , q.y + 0.4, 0)); }
  parts.push(prep(sweep(keel, () => [0.13, 0.2], { radial: 8, samples: 30, noise: 0.05, seed: 91, splinterStart: 0.35 }), woodTint));
  // deck beams across, snapped at the stove-in side
  for (let k = 0; k < 3; k++) {
    const s = 0.2 + k * 0.22, q = hullAt(s, -0.9), q2 = hullAt(s, 0.55 + 0.1 * k);
    parts.push(prep(sweep([V(q.x, q.y + 0.2, q.z + 0.25), V(q.x + 0.1, q.y + 0.35, 0), V(q2.x, q2.y + 0.3, q2.z - 0.15)], () => [0.11, 0.13], { radial: 7, samples: 20, noise: 0.05, seed: 120 + k, splinter: 0.3 }), woodTint));
  }
  const ribs = mergeGeometries(parts, false)!;
  return { skin, ribs };
}

// ---- small wreckage ---------------------------------------------------------------------------------

function plank(len: number, wid: number, thick: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(len, thick, wid, 14, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = Math.abs(x) / (len / 2);
    let nx = x;
    if (ex > 0.99) {
      const side = Math.sign(x);
      const brk = side > 0 ? hash(seed, 1) : hash(seed, 2);
      nx = x - side * (0.05 + brk * 0.45) * (0.4 + 0.6 * Math.abs(Math.sin((z / wid + seed) * 9)));
    }
    const warp = 0.05 * Math.sin((x / len) * 3 + seed) * len * 0.1;
    p.setXYZ(i, nx, y + warp + (z > 0 ? 0.0 : 0), z * (1 - 0.12 * Math.max(0, ex - 0.6)));
  }
  g.computeVertexNormals();
  return prep(g, (x, y, z) => woodTint(x + seed, y, z));
}

function barrel(open: boolean, seed: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, -0.44), new THREE.Vector2(0.29, -0.44), new THREE.Vector2(0.305, -0.475)];
  for (let j = 0; j <= 18; j++) {
    const y = -0.475 + 0.95 * (j / 18);
    let r = 0.31 + 0.085 * Math.sin(Math.PI * (j / 18));
    for (const yh of [-0.36, -0.12, 0.12, 0.36]) r += 0.022 * Math.exp(-Math.pow((y - yh) / 0.032, 2));
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(0.31, 0.475));
  if (open) pts.push(new THREE.Vector2(0.295, 0.47), new THREE.Vector2(0.29, 0.05), new THREE.Vector2(0.001, 0.03));
  else pts.push(new THREE.Vector2(0.29, 0.4), new THREE.Vector2(0.001, 0.385));
  const g = new THREE.LatheGeometry(pts, 44);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 0.2) continue;
    const a = Math.atan2(z, x), k = 1 - 0.02 * (0.5 - 0.5 * Math.cos(a * 22)) + 0.012 * fbm(a * 3 + seed, p.getY(i) * 4, 2);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return prep(g, (x, y, z) => woodTint(x + seed * 3, y, z));
}

function crate(seed: number, broken: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const b = new THREE.BoxGeometry(0.86, 0.62, 0.64, 3, 3, 3);
  const bp = b.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setXYZ(i, bp.getX(i) + 0.02 * fbm(bp.getY(i) * 5 + seed, bp.getZ(i) * 5, 2), bp.getY(i), bp.getZ(i));
  b.computeVertexNormals();
  parts.push(b);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const v = new THREE.BoxGeometry(0.07, 0.66, 0.07); v.translate(sx * 0.42, 0, sz * 0.32); parts.push(v);
  }
  for (const sy of [-1, 1]) {
    if (broken && sy > 0) continue;
    const hx = new THREE.BoxGeometry(0.9, 0.07, 0.07); hx.translate(0, sy * 0.31, 0.32); parts.push(hx);
    const hx2 = hx.clone(); hx2.translate(0, 0, -0.64); parts.push(hx2);
    const hz = new THREE.BoxGeometry(0.07, 0.07, 0.68); hz.translate(0.42, sy * 0.31, 0); parts.push(hz);
    const hz2 = hz.clone(); hz2.translate(-0.84, 0, 0); parts.push(hz2);
  }
  parts.forEach((q) => { q.deleteAttribute('uv'); });
  return prep(mergeGeometries(parts, false)!, (x, y, z) => woodTint(x + seed, y, z));
}

function ropeCoil(seed: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const turns = 4.5;
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * turns * TAU, r = 0.4 - 0.025 * (a / TAU) + 0.01 * Math.sin(a * 3 + seed);
    pts.push(V(Math.cos(a) * r, 0.045 + 0.085 * (a / TAU) * 0.35, Math.sin(a) * r));
  }
  // a loose tail trailing off
  pts.push(V(0.6, 0.06, 0.2), V(1.0, 0.03, 0.55), V(1.5, 0.03, 0.5));
  return prep(sweep(pts, () => 0.045, { radial: 6, samples: 180, seed }), ropeTint);
}

function tangle(origin: THREE.Vector3, seed: number, len: number): THREE.BufferGeometry {
  const r = rng(seed);
  const pts: THREE.Vector3[] = [origin.clone()];
  let a = r() * TAU;
  for (let i = 0; i < 11; i++) {
    a += (r() - 0.5) * 3.2;
    const step = len / 11 * (0.5 + r());
    const p = pts[pts.length - 1].clone();
    p.x += Math.cos(a) * step; p.z += Math.sin(a) * step; p.y = 0.04 + r() * 0.07;
    pts.push(p);
  }
  return prep(sweep(pts, () => 0.028, { radial: 5, samples: 110, seed }), ropeTint);
}

/** A torn sail: a plane hung from the yard, each column of it torn off at its own length. */
function tatteredSail(width: number, drop: number, seed: number): THREE.BufferGeometry {
  const cols = 34, rows = 14;
  const g = new THREE.PlaneGeometry(width, drop, cols, rows);
  const p = g.attributes.position;
  const colLen: number[] = [];
  for (let c = 0; c <= cols; c++) colLen.push(clamp(0.3 + 0.75 * Math.pow(hash(Math.floor(c / 2), seed), 0.8) + 0.15 * fbm(c * 0.4, seed, 2), 0.18, 1));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), v = 0.5 - p.getY(i) / drop; // 0 at the yard, 1 at the foot
    const c = Math.round((x / width + 0.5) * cols);
    const v2 = v * colLen[c];
    const taper = 1 - 0.5 * Math.pow(v, 3);
    p.setXYZ(i, x * taper + 0.14 * fbm(x * 1.3 + seed, v * 3, 2) * v, -v2 * drop,
      0.18 * fbm(x * 0.9, v2 * 2.5 + seed, 3) + 0.3 * v2 * Math.sin(x * 1.4 + seed) * 0.4 + 0.25 * v2);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return sanitize(g);
}

// ---- the whole sea ------------------------------------------------------------------------------------

export function buildSeaRocks(mats: { basalt: THREE.Material; columnar: THREE.Material }): THREE.Group {
  const root = new THREE.Group();
  root.name = 'seaRocks';
  root.userData.noCollide = true;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true; m.userData.noCollide = true;
    root.add(m);
    return m;
  };

  // -- stacks --
  const stacks: THREE.BufferGeometry[] = [];
  for (const s of STACK_SPECS) {
    if (s.gen === 'bay') stacks.push(weld(seaStack(s.x, s.z, s.h, s.r, s.seed)));
    else stacks.push(spire(s, s.h > 30 ? 60 : 48, s.h > 30 ? 120 : 90));
  }
  for (const leg of ARCH_LEGS) stacks.push(spire(leg, 56, 100));
  stacks.push(archBridge());
  add(mergeGeometries(stacks, false)!, mats.columnar, 'seaStacks');

  // -- skerries, boulders, and the spikes the hull is impaled on --
  const rocks: THREE.BufferGeometry[] = [];
  for (const s of SKERRIES) rocks.push(rockLump(s, 1.0, 5));
  for (const b of BOULDERS) rocks.push(rockLump({ x: b.x, z: b.z, rx: b.r * (0.9 + 0.3 * hash(b.seed, 1)), rz: b.r * (0.9 + 0.3 * hash(b.seed, 2)), h: b.h, yaw: hash(b.seed, 3) * TAU, seed: b.seed }, 0.5, b.r > 2 ? 4 : 3));

  // -- the wreck: bow section on the reef --
  const hull = hullBow();
  const hullPos = V(-108, 2.3, 84.5);
  const hullM = new THREE.Matrix4().compose(hullPos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, 0.55, 0.3, 'YZX')), V(1, 1, 1));
  // Euler 'YZX' with (x=roll, y=yaw, z=pitch): R = Ry * Rz * Rx
  hull.skin.applyMatrix4(hullM); hull.ribs.applyMatrix4(hullM);
  // two spikes of rock driven up through the planking
  for (const [lx, ly, lz, sd] of [[2.6, -1.9, 0.5, 301], [5.2, -1.2, -0.3, 302]] as const) {
    const w = V(lx, ly, lz).applyMatrix4(hullM);
    rocks.push(rockLump({ x: w.x, z: w.z, rx: 0.9, rz: 0.7, h: w.y + 0.9, yaw: sd, seed: sd }, 1.4, 4));
  }
  add(mergeGeometries(rocks, false)!, mats.basalt, 'seaSkerries');

  const wood: THREE.BufferGeometry[] = [hull.skin, hull.ribs];
  const rope: THREE.BufferGeometry[] = [];
  const cloth: THREE.BufferGeometry[] = [];

  // -- the snapped mast, standing out of the reef at an angle --
  const mb = V(MAST_ROCK.x, MAST_ROCK.h - 0.5, MAST_ROCK.z);
  const m = V(0.34, 1, 0.14).normalize();
  const mastLen = 10.6;
  const mp = (d: number, bend = 0) => mb.clone().addScaledVector(m, d).add(V(bend * 0.25, 0, bend * 0.1));
  wood.push(prep(sweep([mp(0), mp(3.5, 0.2), mp(7, 0.5), mp(mastLen, 1)], (t) => 0.46 - 0.15 * t, { radial: 14, samples: 40, noise: 0.05, seed: 7, up: V(0, 0, 1), splinter: 0.9 }), woodTint));
  // the yard, hanging askew from a remnant of its parting, one end snapped off short
  const yc = mp(6.4, 0.4);
  const yd = new THREE.Vector3().crossVectors(m, V(0, 0, 1)).normalize(); // east and a little down
  yd.y -= 0.08; yd.normalize();
  const yW = yc.clone().addScaledVector(yd, -2.4), yE = yc.clone().addScaledVector(yd, 4.1);
  wood.push(prep(sweep([yW, yc.clone().addScaledVector(yd, 0.8), yE], (t) => 0.17 - 0.06 * t, { radial: 9, samples: 24, noise: 0.06, seed: 9, splinter: 0.5, splinterStart: 0.3 }), woodTint));
  // collar lashing where the yard crosses the mast
  wood.push(prep(sweep([yc.clone().addScaledVector(m, -0.25), yc.clone().addScaledVector(m, 0.25)], () => 0.34, { radial: 12, samples: 4, seed: 11 }), (x, y, z) => woodTint(x, y, z) * 0.8));
  // the sail, mostly gone: streamers hanging from the yard
  const sail = tatteredSail(5.6, 3.3, 5);
  const yardBasis = new THREE.Matrix4().makeBasis(yd, V(0, 1, 0), new THREE.Vector3().crossVectors(yd, V(0, 1, 0)).normalize());
  sail.applyMatrix4(yardBasis.setPosition(yc.clone().addScaledVector(yd, 1.1).add(V(0, -0.2, 0.18))));
  cloth.push(sail);
  const sail2 = tatteredSail(1.4, 2.2, 9);
  sail2.applyMatrix4(yardBasis.clone().setPosition(yc.clone().addScaledVector(yd, -1.5).add(V(0, -0.2, -0.15))));
  cloth.push(sail2);
  // rigging: stays and sheets, some trailing in the sea
  const top = mp(mastLen - 0.4, 1);
  rope.push(line(top, yE, 0.35, 0.036, 1), line(top, yW, 0.5, 0.03, 2));
  rope.push(line(top, V(top.x + 7.5, 0.05, top.z + 3.2), 3.2, 0.04, 3, 0.5));
  rope.push(line(yW, V(yW.x - 2.4, 0.05, yW.z + 2.0), 0.9, 0.03, 4, 0.3));
  rope.push(line(yE, V(yE.x + 1.2, 0.05, yE.z + 0.8), 0.6, 0.032, 5, 0.3));
  rope.push(line(top, V(mb.x - 5.5, 1.0, mb.z - 2.2), 1.2, 0.04, 6, 0.2));
  rope.push(line(yc.clone().addScaledVector(yd, 0.4), V(mb.x + 1.5, 0.9, mb.z + 2.8), 0.8, 0.028, 7, 0.3));

  // -- the trail of debris, from the reef toward the wreck at the headland's foot --
  const r = rng(4242);
  const curve = new THREE.CubicBezierCurve3(V(-97, 0, 90), V(-80, 0, 78), V(-95, 0, 58), V(-76, 0, 48));
  const clear = (x: number, z: number, pad: number) => !SEA_ROCKS.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + pad) && !(HULL_ROCKS.some((q) => Math.hypot(q.x - x, q.z - z) < q.rx + pad));
  const drift = (t: number, spread: number) => {
    const c = curve.getPoint(t);
    const lat = (r() - 0.5) * spread * (0.4 + t * 1.4), lon = (r() - 0.5) * spread * 0.7;
    return V(c.x + lat + lon * 0.5, 0, Math.max(c.z + lon, 47));
  };
  const place = (g: THREE.BufferGeometry, p: THREE.Vector3, yaw: number, y = 0.03, tilt = 0.06, pitch = 0.04) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 2 * tilt, yaw, (r() - 0.5) * 2 * pitch, 'YXZ'));
    g.applyMatrix4(new THREE.Matrix4().compose(V(p.x, y, p.z), q, V(1, 1, 1)));
    return g;
  };
  const free = (spread: number, t0: number, t1: number, pad: number) => {
    for (let k = 0; k < 20; k++) { const p = drift(t0 + (t1 - t0) * r(), spread); if (clear(p.x, p.z, pad)) return p; }
    return drift(t1, spread);
  };
  // spars: long, broken, floating
  for (let i = 0; i < 8; i++) {
    const len = 3.5 + r() * 7, p = free(14, 0, 0.9, 2.5), yaw = r() * Math.PI, rd = 0.11 + r() * 0.13;
    const g = spar(V(-len / 2, 0, 0), V(len / 2, 0, 0), rd, rd * (0.7 + r() * 0.2), 200 + i, 0.2 + r() * 0.25, r() < 0.5 ? 0.2 : 0);
    wood.push(place(g, p, yaw, 0.02 + r() * 0.05, 0.05, 0.05));
  }
  // planks: many, near the reef especially
  for (let i = 0; i < 18; i++) {
    const g = plank(1.2 + r() * 3.2, 0.22 + r() * 0.2, 0.05 + r() * 0.04, 300 + i);
    wood.push(place(g, free(14, 0, 1, 1.5), r() * Math.PI, 0.03 + r() * 0.04, 0.1, 0.1));
  }
  // barrels, some floating on their sides, some upright and low in the water
  for (let i = 0; i < 6; i++) {
    const g = barrel(i % 3 === 1, 500 + i);
    const p = free(12, 0.05, 0.95, 2);
    if (i % 2 === 0) { g.rotateZ(Math.PI / 2 + (r() - 0.5) * 0.3); wood.push(place(g, p, r() * TAU, 0.05, 0.04, 0.04)); }
    else { g.rotateZ((r() - 0.5) * 0.5); wood.push(place(g, p, r() * TAU, 0.12, 0.05, 0.05)); }
  }
  // crates
  for (let i = 0; i < 3; i++) wood.push(place(crate(600 + i, i === 1), free(10, 0.1, 0.9, 2), r() * TAU, 0.08, 0.12, 0.12));
  // coils of rope and tangled rigging line
  for (let i = 0; i < 2; i++) rope.push(place(ropeCoil(700 + i), free(10, 0.15, 0.8, 2), r() * TAU, 0.03, 0.03, 0.03));
  for (let i = 0; i < 5; i++) { const p = free(12, 0, 1, 2); rope.push(tangle(p, 800 + i, 5 + r() * 6)); }
  // hull planks fallen close beside the wreck itself
  for (let i = 0; i < 5; i++) {
    const g = plank(1.5 + r() * 2.5, 0.25 + r() * 0.15, 0.06, 900 + i);
    wood.push(place(g, V(-108 + (r() - 0.5) * 14, 0, 82 + (r() - 0.2) * 9), r() * Math.PI, 0.04, 0.1, 0.1));
  }

  // -- debris stranded on the rocks at the headland's foot --
  const foot = BOULDERS.filter((b) => b.x > -112 && b.x < -80 && b.z > 44 && b.z < 62 && b.h > 0.8).slice(0, 5);
  foot.forEach((b, i) => {
    const top = b.h * 0.7;
    if (i % 3 === 0) {
      const g = spar(V(-2.2, 0, 0), V(2.2, 0, 0), 0.13, 0.1, 950 + i, 0.2, 0.2);
      g.rotateZ(0.22); wood.push(place(g, V(b.x + 0.6, 0, b.z), r() * Math.PI, top - 0.1, 0.04, 0.02));
    } else if (i % 3 === 1) {
      const g = plank(2.4, 0.3, 0.07, 960 + i);
      g.rotateZ(0.3); wood.push(place(g, V(b.x, 0, b.z + 0.4), r() * Math.PI, top, 0.04, 0.02));
    } else {
      const g = barrel(true, 970 + i); g.rotateZ(Math.PI / 2 - 0.25);
      wood.push(place(g, V(b.x, 0, b.z), r() * TAU, top + 0.15, 0.03, 0.03));
    }
  });
  // a line of rope snagged across the reef rocks
  rope.push(line(V(HULL_ROCKS[0].x - 4, HULL_ROCKS[0].h * 0.8, HULL_ROCKS[0].z + 0.4), V(HULL_ROCKS[1].x + 1, 0.6, HULL_ROCKS[1].z + 1.5), 1.1, 0.034, 8, 0.4));

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.7, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2f261b, roughness: 0.85, metalness: 0, vertexColors: true });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  add(mergeGeometries(wood, false)!, woodMat, 'wreckWood');
  add(mergeGeometries(rope, false)!, ropeMat, 'wreckRope');
  add(mergeGeometries(cloth, false)!, clothMat, 'wreckCloth');

  root.traverse((o) => { o.userData.noCollide = true; });
  return root;
}
