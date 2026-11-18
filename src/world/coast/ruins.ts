// The ruined fortress on the clifftop: the gatehouse where the road comes out of the rock, the
// curtain walls along the rim, a turret at each hairpin, and the great keep brooding inland. All of it is built
// from boxes, extrusions, lathes and cones, merged by material into a handful of meshes.
//
// Everything is placed from the road's own numbers: the gate sits just past ROAD.end on the axis of
// ROAD.endDir (`f`), with `r` (to the right of f, which is toward the sea) across it. Tops are broken by
// a ruin profile rather than cut clean, and every footing is sunk well below the ground it stands on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD, ROAD_HALF, masonryMaterial } from './road';
import { fogUniforms } from './atmosphere';
import { plateauAt, groundHeight, landDistance } from './layout';
import type { TextureSet } from './terrain';

type V2 = [number, number];
type GL = THREE.BufferGeometry[];
interface Kit { stone: GL; paving: GL; slate: GL; dark: GL; glow: GL; iron: GL }
const mk = (): Kit => ({ stone: [], paving: [], slate: [], dark: [], glow: [], iron: [] });
let S: Kit = mk();

// ---- small tools ----------------------------------------------------------------------------------
let seed = 20240611;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const vnoise = (x: number, z: number) => {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (hash(i, j) * (1 - su) + hash(i + 1, j) * su) * (1 - sv) + (hash(i, j + 1) * (1 - su) + hash(i + 1, j + 1) * su) * sv;
};

function add(list: GL, g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  list.push(n);
}
function xf(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
/** A box standing on y0, w across its local x, d along its local z, turned ry about the vertical. */
function box(list: GL, cx: number, y0: number, cz: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  add(list, xf(g, cx, y0, cz, ry, rx, rz));
}
/** A box whose sides lean: the bottom grows by eb = [-x, +x, -z, +z], the top by et. */
function frustum(list: GL, cx: number, cz: number, ry: number, wx: number, wz: number, y0: number, y1: number, eb: number[], et: number[] = [0, 0, 0, 0]) {
  const g = new THREE.BoxGeometry(wx, 1, wz), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), bot = p.getY(i) < 0, e = bot ? eb : et;
    p.setX(i, x + (x < 0 ? -e[0] : e[1]));
    p.setZ(i, z + (z < 0 ? -e[2] : e[3]));
    p.setY(i, bot ? y0 : y1);
  }
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  n.rotateY(ry);
  n.translate(cx, 0, cz);
  add(list, n);
}
const rotXZ = (x: number, z: number, ry: number): V2 => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];

// ---- walls made of cells ------------------------------------------------------------------------
interface CellOpts {
  s0?: number; step?: number; found?: number;
  bottom: (x: number, z: number) => number;
  top: (x: number, z: number, s: number) => number;
  lean?: (s: number) => number;
}
/**
 * A wall of thickness T along a→b, cut into short cells whose tops follow `top`, so a ruin profile
 * gives a ragged skyline. `side` says which way the left-hand perpendicular faces (+1: out).
 */
function cells(list: GL, a: V2, b: V2, T: number, side: 1 | -1, o: CellOpts) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.05) return;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, ry = Math.atan2(-dz, dx);
  const n = Math.max(1, Math.round(L / (o.step ?? 1.5))), cl = L / n, s0 = o.s0 ?? 0, found = o.found ?? 5;
  for (let i = 0; i < n; i++) {
    const u0 = i * cl, u1 = u0 + cl, um = (u0 + u1) / 2;
    const p0: V2 = [a[0] + dx * u0, a[1] + dz * u0], p1: V2 = [a[0] + dx * u1, a[1] + dz * u1], pc: V2 = [a[0] + dx * um, a[1] + dz * um];
    const yb = Math.min(o.bottom(p0[0], p0[1]), o.bottom(p1[0], p1[1]), o.bottom(pc[0], pc[1]));
    const hL = Math.max(0.4, o.top(p0[0], p0[1], s0 + u0) - yb), hR = Math.max(0.4, o.top(p1[0], p1[1], s0 + u1) - yb);
    const g = new THREE.BoxGeometry(cl * 1.04, 1, T), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) > 0 ? (p.getX(k) < 0 ? hL : hR) : 0);
    const m = g.toNonIndexed();
    m.computeVertexNormals();
    const lean = o.lean ? o.lean(s0 + um) : 0;
    if (lean) { m.translate(0, -found, 0); m.rotateX(lean * side); m.translate(0, found, 0); }
    m.rotateY(ry);
    m.translate(pc[0], yb, pc[1]);
    add(list, m);
  }
}
/** Merlons along a→b on the outward edge, left out where the wall has fallen. */
function merlons(a: V2, b: V2, off: number, side: 1 | -1, o: { s0?: number; top: (x: number, z: number, s: number) => number; ruin: (s: number, x: number, z: number) => number; w?: number; gap?: number; h?: number; th?: number }) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, ry = Math.atan2(-dz, dx), nx = -dz * side, nz = dx * side;
  const w = o.w ?? 1.15, gap = o.gap ?? 1.0, s0 = o.s0 ?? 0;
  for (let u = 0.5; u + w < L; u += w + gap) {
    const s = s0 + u + w / 2;
    const x = a[0] + dx * (u + w / 2) + nx * off, z = a[1] + dz * (u + w / 2) + nz * off;
    if (o.ruin(s, x, z) > 0.05 || rnd() < 0.06) continue;
    const h = (o.h ?? 1.35) * (rnd() < 0.12 ? 0.55 : 1) * (0.92 + rnd() * 0.14);
    box(S.stone, x, o.top(x, z, s) - 0.3, z, w, h + 0.3, o.th ?? 0.9, ry, 0, (rnd() - 0.5) * 0.03);
  }
}

// ---- windows, slits, rubble ----------------------------------------------------------------------
function archGeo(w: number, h: number, depth: number) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(-w / 2, h * 0.55);
  sh.bezierCurveTo(-w / 2, h * 0.78, -w * 0.2, h * 0.93, 0, h);
  sh.bezierCurveTo(w * 0.2, h * 0.93, w / 2, h * 0.78, w / 2, h * 0.55);
  sh.lineTo(w / 2, 0);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 5 });
}
/** A pointed window sitting on the wall at (x, y, z), facing (nx, nz): dark, or lit from within. */
function winAt(x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, lit: boolean) {
  const ry = Math.atan2(nx, nz);
  add(S.dark, xf(archGeo(w, h, 0.12), x, y, z, ry));
  if (!lit) return;
  add(S.glow, xf(archGeo(w * 0.8, h * 0.9, 0.2), x - nx * 0.01, y + h * 0.04, z - nz * 0.01, ry));
  // the mullion and a transom
  box(S.iron, x + nx * 0.22, y + h * 0.04, z + nz * 0.22, 0.1, h * 0.86, 0.06, ry);
  box(S.iron, x + nx * 0.22, y + h * 0.5, z + nz * 0.22, w * 0.78, 0.09, 0.06, ry);
}
function slitAt(x: number, y: number, z: number, nx: number, nz: number, h = 1.5) {
  box(S.dark, x + nx * 0.08, y, z + nz * 0.08, 0.3, h, 0.3, Math.atan2(nx, nz));
}
/** A scatter of fallen masonry. */
function rubble(cx: number, cz: number, n: number, spread: number, size: number, ground: (x: number, z: number) => number = plateauAt) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, d = Math.sqrt(rnd()) * spread, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const sx = size * (0.35 + rnd() * 0.65), sy = size * (0.25 + rnd() * 0.5), sz = size * (0.35 + rnd() * 0.65);
    box(S.stone, x, ground(x, z) - sy * 0.3, z, sx, sy, sz, rnd() * 3.14, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
  }
}

// ---- square towers ------------------------------------------------------------------------------------
interface Win { f: number; y: number; at?: number; w?: number; h?: number; lit?: boolean; slit?: boolean }
interface TowerOpts {
  bottom?: number; ext?: number[]; T?: number; ground?: (x: number, z: number) => number;
  drop?: (lx: number, lz: number) => number; wins?: Win[]; merlon?: boolean; floorTop?: number;
}
/**
 * A battered square tower. Local x is `wx` wide, local z `wz`, turned ry. `base` is its floor level
 * and H the height above it; the shell above the batter is a ring of cells so the top can break.
 */
function sqTower(cx: number, cz: number, ry: number, wx: number, wz: number, base: number, H: number, o: TowerOpts = {}) {
  const ex: V2 = [Math.cos(ry), -Math.sin(ry)], ez: V2 = [Math.sin(ry), Math.cos(ry)];
  const W = (lx: number, lz: number): V2 => [cx + lx * ex[0] + lz * ez[0], cz + lx * ex[1] + lz * ez[1]];
  const Lc = (x: number, z: number): V2 => [(x - cx) * ex[0] + (z - cz) * ex[1], (x - cx) * ez[0] + (z - cz) * ez[1]];
  const gnd = o.ground ?? plateauAt;
  let gMin = 1e9;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const p = W(a * wx / 2, b * wz / 2); gMin = Math.min(gMin, gnd(p[0], p[1])); }
  const bottom = o.bottom ?? gMin - 5, ext = o.ext ?? [1.3, 1.3, 1.3, 1.3], T = o.T ?? 1.6;
  const yt = base + 3.5, yb = Math.min(yt - 0.5, Math.max(bottom + 0.5, Math.min(gMin - 0.3, base + 1)));
  frustum(S.stone, cx, cz, ry, wx, wz, bottom, yb, ext, ext);
  frustum(S.stone, cx, cz, ry, wx, wz, yb, yt, ext, [0, 0, 0, 0]);
  const drop = o.drop ?? (() => 0);
  const topF = (x: number, z: number) => { const l = Lc(x, z); return base + H - drop(l[0], l[1]) * H * 0.55; };
  box(S.stone, cx, yt - 0.2, cz, wx - 0.1, Math.max(0.1, base + H * (o.drop ? 0.45 : 0.55) - yt + 0.2), wz - 0.1, ry);
  const sides: [V2, V2, number, number][] = [
    [W(-wx / 2, wz / 2 - T / 2), W(wx / 2, wz / 2 - T / 2), 0, wx],
    [W(wx / 2 - T / 2, wz / 2), W(wx / 2 - T / 2, -wz / 2), 1, wz],
    [W(wx / 2, -wz / 2 + T / 2), W(-wx / 2, -wz / 2 + T / 2), 2, wx],
    [W(-wx / 2 + T / 2, -wz / 2), W(-wx / 2 + T / 2, wz / 2), 3, wz],
  ];
  for (const [a, b] of sides) {
    cells(S.stone, a, b, T, 1, { step: 1.4, bottom: () => yt - 0.3, top: (x, z) => topF(x, z), found: 0 });
    if (o.merlon !== false) merlons(a, b, T / 2 - 0.45, 1, { top: (x, z) => topF(x, z), ruin: (_s, x, z) => { const l = Lc(x, z); return drop(l[0], l[1]); }, h: 1.3 });
  }
  // courses: a band at mid-height and a corbel table under the parapet
  const out: V2[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  out.forEach(([ox, oz], f) => {
    const len = f % 2 === 0 ? wx : wz, c = W(ox * (wx / 2), oz * (wz / 2));
    const lx0 = ox * (wx / 2), lz0 = oz * (wz / 2);
    const ok = drop(lx0, lz0) < 0.04 && drop(lx0 + oz * len * 0.35, lz0 + ox * len * 0.35) < 0.04 && drop(lx0 - oz * len * 0.35, lz0 - ox * len * 0.35) < 0.04;
    const nxw = ox * ex[0] + oz * ez[0], nzw = ox * ex[1] + oz * ez[1];
    box(S.stone, c[0] + nxw * 0.15, base + H * 0.5, c[1] + nzw * 0.15, f % 2 === 0 ? wx + 0.5 : 0.5, 0.35, f % 2 === 0 ? 0.5 : wz + 0.5, ry);
    if (ok) box(S.stone, c[0] + nxw * 0.2, base + H - 2.7, c[1] + nzw * 0.2, f % 2 === 0 ? wx + 0.7 : 0.7, 0.6, f % 2 === 0 ? 0.7 : wz + 0.7, ry);
  });
  for (const w of o.wins ?? []) {
    const [ox, oz] = out[w.f], len = w.f % 2 === 0 ? wx : wz, at = (w.at ?? 0) * len;
    const lx = ox * (wx / 2) + oz * at, lz = oz * (wz / 2) + ox * at, p = W(lx, lz);
    const nx = ox * ex[0] + oz * ez[0], nz = ox * ex[1] + oz * ez[1];
    if (w.slit) slitAt(p[0], base + w.y, p[1], nx, nz, w.h ?? 1.5);
    else winAt(p[0], base + w.y, p[1], nx, nz, w.w ?? 1.1, w.h ?? 3.2, !!w.lit);
  }
  return { W, topF };
}

// ---- round turrets -----------------------------------------------------------------------------------
function spire(cx: number, y0: number, cz: number, r: number, h: number, segs = 8, rot = Math.PI / 8, cut = 0) {
  const pts = [[r, 0], [r * 0.78, h * 0.1], [r * 0.5, h * 0.34], [r * 0.26, h * 0.66], [0.04, h]].filter((p) => p[1] <= h * (1 - cut));
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.03, 0), ...pts.map((p) => new THREE.Vector2(p[0], p[1]))], segs).toNonIndexed();
  g.computeVertexNormals();
  g.rotateY(rot);
  g.translate(cx, y0, cz);
  add(S.slate, g);
}
function turret(cx: number, cz: number, r: number, deck: number, H: number, bottom: number, o: { roof?: boolean; broken?: boolean }) {
  const cyl = (rt: number, rb: number, y0: number, y1: number, list: GL = S.stone, seg = 12) => {
    const g = new THREE.CylinderGeometry(rt, rb, y1 - y0, seg).toNonIndexed();
    g.computeVertexNormals();
    g.translate(cx, (y0 + y1) / 2, cz);
    add(list, g);
  };
  cyl(r + 0.9, r * 0.6, bottom, deck + 2.2); // corbelled out and tapered down to the rock
  cyl(r + 0.1, r + 0.1, deck + 2.2, deck + H - 2.3);
  cyl(r + 0.55, r + 0.3, deck + H - 2.3, deck + H - 1.2); // the corbel table
  cyl(r + 0.35, r + 0.35, deck + H - 1.2, deck + H);
  const n = 10;
  for (let i = 0; i < n; i++) {
    if (o.broken && (i % 10 < 3 || rnd() < 0.2)) continue;
    if (o.roof) break;
    if (rnd() < 0.08) continue;
    const a = (i / n) * 6.283;
    box(S.stone, cx + Math.sin(a) * (r + 0.1), deck + H - 0.2, cz + Math.cos(a) * (r + 0.1), 1.25, 1.4, 0.8, a);
  }
  if (o.roof) {
    cyl(r + 0.9, r + 0.5, deck + H, deck + H + 0.7, S.stone, 10);
    spire(cx, deck + H + 0.6, cz, r + 0.95, 6.5, 10, 0);
  }
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 2.1 + rnd() * 0.4;
    slitAt(cx + Math.sin(a) * (r + 0.1), deck + 3.4 + (i % 2) * 2.2, cz + Math.cos(a) * (r + 0.1), Math.sin(a), Math.cos(a), 1.4);
  }
}

/** Push a point away from the road until it clears `need` metres, in plan. */
function clearRoad(p: V2, need: number): V2 {
  const q: V2 = [p[0], p[1]];
  for (let it = 0; it < 16; it++) {
    let best = 1e9, bx = 0, bz = 0;
    for (const r of ROAD.path) { const d = Math.hypot(q[0] - r.x, q[1] - r.z); if (d < best) { best = d; bx = r.x; bz = r.z; } }
    if (best >= need) break;
    const k = (need - best + 0.05) / Math.max(best, 0.01);
    q[0] += (q[0] - bx) * k; q[1] += (q[1] - bz) * k;
  }
  return q;
}


/**
 * Coursed ashlar in the road's style: dark basalt blocks in rows, the joints mossy, the faces
 * streaked wet. The courses run along each face (not along a fixed world direction), so walls
 * at any angle read the same.
 */
function ashlar(rock: TextureSet): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
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
          return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec3 n = normalize(vMN);
        vec3 tw = pow(abs(n), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
        vec3 tex = texture2D(rMap, vMW.zy * 0.25).rgb * tw.x + texture2D(rMap, vMW.xz * 0.25).rgb * tw.y + texture2D(rMap, vMW.xy * 0.25).rgb * tw.z;
        float tl = dot(tex, vec3(0.3, 0.55, 0.15));
        // courses run along the face; on tops, over the ground plan
        bool top = abs(n.y) > 0.75;
        vec2 tg = normalize(vec2(-n.z, n.x) + vec2(1e-4, 0.0));
        float along = top ? vMW.x : dot(vMW.xz, tg);
        float up = top ? vMW.z : vMW.y;
        // courses of uneven height, a little out of level
        float up2 = up + (mn(vec2(along * 0.08, 1.0)) - 0.5) * 0.35;
        float rowH = 0.42 + mh(vec2(floor(up2 / 0.55), 5.3)) * 0.3;
        float vv = up2 / rowH, row = floor(vv), fv = fract(vv);
        float bl = 1.0 + mh(vec2(row, 3.7)) * 1.3;
        float uu = along / bl + mh(vec2(row, 9.1)) * 17.0, col = floor(uu), fu = fract(uu);
        float d = min(min(fu * bl, (1.0 - fu) * bl), min(fv * rowH, (1.0 - fv) * rowH)) + (mn(vMW.xz * 4.3 + vMW.y * 3.1) - 0.5) * 0.045;
        // thin, worn joints, fading out with distance so the wall reads as mass, not a grid
        float far = smoothstep(18.0, 70.0, length(vViewPosition));
        float joint = (1.0 - smoothstep(0.012, 0.045, d)) * (1.0 - far * 0.7);
        float bid = mh(vec2(row * 1.7 + 2.0, col));
        vec3 c = vec3(0.072, 0.066, 0.06) * (0.5 + tl * 1.2) * (0.72 + bid * 0.5);
        // broad weathering over many blocks: sooty and black in bands, a little paler where dry
        float soot = mn(vec2(along * 0.09, up * 0.05) + 3.0) * 0.6 + mn(vec2(along * 0.31, up * 0.17)) * 0.4;
        c *= 0.62 + soot * 0.6;
        // chipped, spalled block faces
        c *= 1.0 - smoothstep(0.62, 0.8, mn(vec2(along, up) * 2.3 + bid * 9.0)) * 0.3;
        // the face of each block a little rounded, lighter on its upper edge
        c *= 1.0 + 0.1 * smoothstep(0.7, 0.93, fv) * (1.0 - joint) * (1.0 - far);
        float moss = joint * smoothstep(0.35, 0.65, mn(vMW.xz * 1.3 + vMW.y * 0.7));
        c = mix(c * (1.0 - joint * 0.55), vec3(0.03, 0.042, 0.016) * (0.7 + mn(vMW.xz * 9.0) * 0.5), moss * 0.75);
        // moss creeping up from the foot and over the tops
        float creep = smoothstep(0.45, 0.75, mn(vMW.xz * 0.6 + vMW.y * 0.25)) * max(float(top), smoothstep(0.6, 0.2, fract(vMW.y * 0.02)));
        c = mix(c, vec3(0.035, 0.045, 0.018), creep * 0.5);
        // rain streaks running down the faces, and damp low down
        float streak = smoothstep(0.5, 0.85, mn(vec2(along * 1.7, up * 0.07 + 3.0)));
        float damp = smoothstep(0.55, 0.8, mn(vMW.xz * 0.23 + 4.0));
        c *= mix(1.0, 0.5, max(streak * 0.8, damp) * (1.0 - joint));
        diffuseColor.rgb *= c;
        mRough = mix(mix(0.85, 0.5, max(streak, damp) * 0.7), 0.95, max(joint, moss));
        mAO = 1.0 - joint * 0.5;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mRough;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= mAO;');
  };
  m.customProgramCacheKey = () => 'ruin-ashlar';
  return m;
}

// ---- the whole thing ---------------------------------------------------------------------------------
export function buildRuins(opts: { rock: TextureSet }): { group: THREE.Group; marks: { gate: THREE.Vector3; exit: THREE.Vector3 } } {
  seed = 20240611;
  S = mk();
  const E = ROAD.end, f = ROAD.endDir;
  const fx = f.x, fz = f.z, rx = -f.z, rz = f.x; // r is to the right: toward the sea
  const FL = E.y + 0.06; // the gate floor: road level
  const P = (t: number, lat: number): V2 => [E.x + fx * t + rx * lat, E.z + fz * t + rz * lat];
  const gateRy = Math.atan2(-fz, fx);
  const TC = 4.7, GD = 7.8; // the gatehouse centre along f, and its depth

  // ---- 1. the gatehouse ------------------------------------------------------------------------
  {
    // the north tower (inland), tall and with its far corner fallen in
    const nc = P(TC, -6);
    sqTower(nc[0], nc[1], gateRy, GD, 7, FL, 21, {
      ext: [1.4, 1.4, 1.4, 0],
      drop: (lx, lz) => 0.9 * sstep(7.5, 1.2, Math.hypot(lx - GD / 2, lz + 3.5)) + 0.12 * vnoise(lx * 0.8 + 3, lz * 0.8),
      wins: [
        { f: 3, y: 8.5, at: 0.12, w: 1.2, h: 3.4, lit: true }, { f: 3, y: 14.5, at: -0.12, slit: true, h: 1.6 },
        { f: 3, y: 4.0, at: -0.2, slit: true, h: 1.5 }, { f: 2, y: 9.0, at: 0.0, w: 1.2, h: 3.4, lit: true },
        { f: 0, y: 10, at: 0, slit: true, h: 1.8 }, { f: 2, y: 15, at: 0.2, slit: true, h: 1.5 },
      ],
    });
    // the south tower (sea side), shorter, hung out over the drop on a deep corbelled foot
    const sc = P(TC, 5.5);
    sqTower(sc[0], sc[1], gateRy, GD, 6, FL, 16.5, {
      ext: [1.4, 1.4, 0, 1.4], bottom: FL - 9.2,
      drop: (lx, lz) => 0.4 * sstep(0.5, 0.8, vnoise(lx * 0.45 + 9, lz * 0.45)) * sstep(-2, 2, lx) + 0.1 * vnoise(lx, lz),
      wins: [
        { f: 3, y: 9, at: 0.0, w: 1.1, h: 3.2, lit: true }, { f: 3, y: 4.5, at: 0.22, slit: true },
        { f: 2, y: 6, at: 0.1, slit: true }, { f: 2, y: 11, at: -0.15, w: 1.1, h: 3.2 }, { f: 0, y: 6.5, at: 0.1, slit: true },
      ],
    });
    // the arch block over the passage: a pointed arch 5 m wide, 7.5 m high, floor and all
    const sh = new THREE.Shape();
    sh.moveTo(-3.0, -0.55); sh.lineTo(3.0, -0.55); sh.lineTo(3.0, 12.5); sh.lineTo(-3.0, 12.5); sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-2.5, 0); hole.lineTo(-2.5, 3.1);
    hole.bezierCurveTo(-2.5, 5.4, -1.3, 6.7, 0, 7.5);
    hole.bezierCurveTo(1.3, 6.7, 2.5, 5.4, 2.5, 3.1);
    hole.lineTo(2.5, 0); hole.closePath();
    sh.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: GD, bevelEnabled: false, curveSegments: 8 });
    eg.translate(0, 0, -GD / 2);
    // local x must run opposite to r (the shape is symmetric, so only the extrusion axis matters)
    eg.rotateY(Math.atan2(fx, fz));
    { const gp = P(TC, 0); eg.translate(gp[0], FL, gp[1]); }
    add(S.stone, eg);
    // wall walk over the arch: a broken parapet front and back, a stone-flagged walk
    const wa = P(TC - GD / 2, -2.6), wb = P(TC - GD / 2, 2.6);
    const wa2 = P(TC + GD / 2, 2.6), wb2 = P(TC + GD / 2, -2.6);
    const flat = (x: number, z: number) => 0 * x + 0 * z + FL + 12.5;
    merlons(wa, wb, -0.5, 1, { top: flat, ruin: () => 0, h: 1.3 });
    merlons(wa2, wb2, -0.5, 1, { top: flat, ruin: (s) => (s > 3.5 ? 0.5 : 0), h: 1.3 });
    // a corbel table under the walk and a string course across the face
    { const c = P(TC - GD / 2 - 0.2, 0); box(S.stone, c[0], FL + 12.0, c[1], 0.7, 0.6, 6.0, gateRy); }
    // the portcullis: half raised in its slot, bent; a few bars gone
    const slot = P(TC - 1.2, 0);
    for (let i = -4; i <= 4; i++) {
      const lat = i * 0.55, ceil = 3.4 + 4.2 * Math.sqrt(Math.max(0, 1 - (lat / 2.6) ** 2));
      if (i === -3 || i === 2) continue;
      const bottom = FL + 3.2 + (i === 1 ? 1.5 : 0), top = FL + ceil;
      if (top - bottom < 0.5) continue;
      const q = P(TC - 1.2, lat);
      box(S.iron, q[0], bottom, q[1], 0.14, top - bottom, 0.14, gateRy, 0, 0);
      box(S.iron, q[0], bottom - 0.5, q[1], 0.1, 0.55, 0.1, gateRy, 0, 0.0); // the spike
    }
    for (const y of [3.7, 4.9, 6.1]) box(S.iron, slot[0], FL + y, slot[1], 0.18, 0.16, 5.0, gateRy);
    // the other half lies fallen in the verge outside
    for (let i = 0; i < 5; i++) {
      const q = P(-1.3, -3.3 - i * 0.5);
      box(S.iron, q[0], plateauAt(q[0], q[1]) + 0.12, q[1], 0.13, 0.18, 2.4, gateRy + 0.3, 0, 0.25);
    }
    for (const t of [-0.6, -1.4, -2.2]) { const q = P(t, -4.6); box(S.iron, q[0], plateauAt(q[0], q[1]) + 0.2, q[1], 0.16, 0.16, 2.8, gateRy + 0.3 + 1.57, 0, 0.25); }
    // lanterns on iron arms either side of the front arch
    for (const lat of [-2.45, 2.45]) {
      const q = P(TC - GD / 2 + 0.5, lat);
      box(S.iron, q[0], FL + 3.9, q[1], 0.7, 0.07, 0.07, gateRy + 1.57);
      box(S.iron, q[0] - rx * Math.sign(lat) * 0.3, FL + 3.1, q[1] - rz * Math.sign(lat) * 0.3, 0.34, 0.7, 0.34, gateRy);
      box(S.glow, q[0] - rx * Math.sign(lat) * 0.3, FL + 3.2, q[1] - rz * Math.sign(lat) * 0.3, 0.22, 0.5, 0.22, gateRy);
    }
    // paving: the road carries on through and out, stepping down to the land beyond
    for (let t = TC + GD / 2; t < 34; t += 0.9) {
      const q = P(t + 0.45, 0), step = Math.ceil((t - (TC + GD / 2)) / 0.9);
      const y = Math.max(plateauAt(q[0], q[1]) + 0.06, FL - 0.07 - 0.3 * step);
      box(S.paving, q[0], y - 2.2, q[1], 0.96, 2.2, 5.1, gateRy);
    }
    for (let t = 0.6; t < TC + GD / 2; t += 0.9) {
      const q = P(t, 0);
      box(S.paving, q[0], FL - 1.0, q[1], 0.96, 1.0, 5.0, gateRy);
    }
  }
  const gm = P(TC, 0);
  const gate = new THREE.Vector3(gm[0], FL, gm[1]);
  const ex = P(TC + GD / 2 + 25, 0);
  const exit = new THREE.Vector3(ex[0], plateauAt(ex[0], ex[1]) + 0.1, ex[1]);

  // ---- 2. the curtain walls -----------------------------------------------------------------------
  const contour = (x0: number, x1: number, ld: number, dx: number): V2[] => {
    const out: V2[] = [];
    for (let x = x0; dx > 0 ? x <= x1 : x >= x1; x += dx) {
      let z = 40;
      while (z > -150 && landDistance(x, z) < ld) z -= 0.5;
      out.push([x, z]);
    }
    return out;
  };
  const smooth = (p: V2[]): V2[] => p.map((q, i) => (i === 0 || i === p.length - 1 ? q : [(p[i - 1][0] + 2 * q[0] + p[i + 1][0]) / 4, (p[i - 1][1] + 2 * q[1] + p[i + 1][1]) / 4] as V2));
  const arcOf = (p: V2[]) => { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; };
  const sample = (p: V2[], s: number): { x: number; z: number; dx: number; dz: number } => {
    const c = arcOf(p);
    let i = 0;
    while (i < p.length - 2 && c[i + 1] < s) i++;
    const t = Math.min(1, Math.max(0, (s - c[i]) / (c[i + 1] - c[i]))), dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1], l = Math.hypot(dx, dz);
    return { x: p[i][0] + dx * t, z: p[i][1] + dz * t, dx: dx / l, dz: dz / l };
  };
  /** A run of curtain wall with a ruin profile, towers where asked. */
  function wallRun(poly: V2[], o: { H: number; T: number; ruin: (s: number) => number; lean?: (s: number) => number; towers?: { s: number; H: number; w: number; broken?: boolean }[]; slits?: boolean; step?: number }) {
    // which way is out: toward the lower land distance
    const m = sample(poly, 3), px = -m.dz, pz = m.dx;
    const side: 1 | -1 = landDistance(m.x + px * 3, m.z + pz * 3) < landDistance(m.x - px * 3, m.z - pz * 3) ? 1 : -1;
    const topF = (x: number, z: number, s: number) => {
      const ru = o.ruin(s);
      return plateauAt(x, z) + o.H - ru * (o.H - 1.5) * (0.7 + 0.3 * vnoise(s * 0.8, 3)) - (ru > 0.02 ? 0.7 * vnoise(s * 2.3, 9) : 0);
    };
    let s0 = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      cells(S.stone, a, b, o.T, side, { s0, step: o.step ?? 1.5, bottom: (x, z) => plateauAt(x, z) - 6, top: topF, lean: o.lean, found: 6 });
      merlons(a, b, o.T / 2 - 0.45, side, { s0, top: topF, ruin: (s) => Math.max(o.ruin(s), Math.abs(o.lean ? o.lean(s) : 0) > 0.03 ? 1 : 0) });
      if (o.slits !== false) {
        const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = -dz * side, nz = dx * side;
        for (let u = 3.5; u < len - 1.5; u += 7.5) {
          const s = s0 + u;
          if (o.ruin(s) > 0.04 || Math.abs(o.lean ? o.lean(s) : 0) > 0.01) continue;
          const x = a[0] + dx * u + nx * o.T / 2, z = a[1] + dz * u + nz * o.T / 2;
          slitAt(x, plateauAt(x, z) + o.H * 0.5, z, nx, nz, 1.5);
        }
      }
      // fallen stone where it is down
      for (let u = 1; u < len; u += 2.4) {
        const s = s0 + u, ru = o.ruin(s);
        if (ru < 0.4) continue;
        const x = a[0] + (b[0] - a[0]) * (u / len), z = a[1] + (b[1] - a[1]) * (u / len);
        rubble(x - (-(b[1] - a[1]) / len) * side * 1.2, z - ((b[0] - a[0]) / len) * side * 1.2, 2 + Math.floor(ru * 4), 2.6, 1.3 + ru);
      }
      s0 += len;
    }
    for (const t of o.towers ?? []) {
      const q = sample(poly, t.s), ry = Math.atan2(-q.dz, q.dx), nx = -q.dz * side, nz = q.dx * side;
      const c: V2 = [q.x + nx * 1.4, q.z + nz * 1.4];
      const g0 = plateauAt(c[0], c[1]);
      sqTower(c[0], c[1], ry, t.w, t.w, g0, t.H, {
        drop: t.broken ? (lx, lz) => 0.78 * sstep(6, 1.0, Math.hypot(lx - t.w / 2, lz - (side > 0 ? t.w / 2 : -t.w / 2))) + 0.15 * vnoise(lx + 5, lz) : undefined,
        wins: [{ f: side > 0 ? 0 : 2, y: t.H * 0.55, at: 0.15, slit: true, h: 1.6 }, { f: side > 0 ? 0 : 2, y: t.H * 0.35, at: -0.2, slit: true }, { f: 1, y: t.H * 0.5, slit: true }, { f: 3, y: t.H * 0.5, slit: true }],
      });
    }
  }

  // the west run, along the north rim of the road's cutting
  const wStart: V2 = P(0.8, -6);
  const westC = smooth(smooth(contour(156, 84, 33, -4)));
  const west: V2[] = [wStart, ...westC];
  wallRun(west, {
    H: 9, T: 3.4,
    ruin: (s) => {
      const bump = (a: number, b: number, c: number, d: number, v: number) => v * sstep(a, b, s) * sstep(d, c, s);
      return Math.min(1, 0.04 * vnoise(s * 0.3, 1) + bump(10, 14, 22, 26, 0.3) + bump(29, 31, 35, 37, 0.95) + bump(38, 41, 52, 55, 0.22) + bump(55, 58, 66, 69, 0.3) + bump(68, 69.5, 72, 73.5, 0.95) + sstep(76, 79, s) * 0.8);
    },
    lean: (s) => 0.15 * sstep(53, 58, s) * sstep(68, 63, s),
    towers: [{ s: 22, H: 15.5, w: 6.8 }, { s: 49, H: 14, w: 6.8, broken: true }, { s: 76, H: 13, w: 6.8, broken: true }],
  });
  // the shorter run east: along the sea edge of the lane out of the gate, then the rim
  {
    const need = ROAD_HALF + 0.8 + 1.1 + 0.4;
    const a = P(TC + GD / 2 - 0.5, 4.1), b = P(TC + GD / 2 + 12, 4.4);
    const rim = contour(174, 178, 9, 4)[0];
    const east: V2[] = [a, b];
    for (let k = 1; k <= 4; k++) east.push(clearRoad([b[0] + (rim[0] - b[0]) * k / 4, b[1] + (rim[1] - b[1]) * k / 4], need));
    east.push([rim[0] + 3, rim[1] + 4]);
    wallRun(east, {
      H: 7.5, T: 2.2,
      ruin: (s) => 0.03 * vnoise(s * 0.3, 5) + 0.4 * sstep(9, 12, s) * sstep(20, 17, s) + 0.85 * sstep(26, 29, s),
      step: 1.4,
      towers: [{ s: 20, H: 11, w: 5.4, broken: true }],
    });
  }

  // ---- 3. the hairpin turrets ------------------------------------------------------------------------
  // (the hairpins are the turns that follow a leg; the approach ramp at the start is a turn too)
  let k = -1;
  ROAD.pieces.forEach((pc, i) => {
    if (pc.kind !== 'turn' || i === 0 || ROAD.pieces[i - 1].kind !== 'leg') return;
    k++;
    const A = ROAD.pieces[i - 1].pts, last = A[A.length - 1], prev = A[A.length - 4];
    const tl = Math.hypot(last.x - prev.x, last.z - prev.z), tx = (last.x - prev.x) / tl, tz = (last.z - prev.z) / tl;
    const r = k === 1 ? 2.5 : 2.7;
    const c = clearRoad([last.x + tx * (ROAD_HALF + 0.8 + 3.2 + r) + last.nx * 0.5, last.z + tz * (ROAD_HALF + 0.8 + 3.2 + r) + last.nz * 0.5], 3.2 + r + 0.4);
    const deck = last.y, bottom = Math.max(deck - 14, Math.min(deck - 6, groundHeight(c[0], c[1]) - 1.5));
    if (k === 1) sqTower(c[0], c[1], Math.atan2(-tz, tx), 5, 5, deck, 7.5, { ext: [0.5, 0.5, 0.5, 0.5], bottom, ground: () => deck - 0.5, drop: (lx, lz) => 0.7 * sstep(4, 0.5, Math.hypot(lx - 2.5, lz + 2.5)), T: 1.3 });
    else turret(c[0], c[1], r, deck, k === 0 ? 8 : 9, bottom, { roof: k === 0, broken: k === 2 });
  });

  // ---- 4. the keep ----------------------------------------------------------------------------------
  buildKeep(P(TC, 0));

  // ---- fallen blocks round the gate -----------------------------------------------------------------
  { const q = P(-1.5, 5.2); rubble(q[0], q[1], 7, 2.4, 1.6); const q2 = P(TC + 9, -5.5); rubble(q2[0], q2[1], 8, 3.5, 1.5); const q3 = P(TC + 4, -11); rubble(q3[0], q3[1], 6, 3, 1.5); }

  // ---- assemble ----------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'ruins';
  const stoneM = ashlar(opts.rock), pavingM = masonryMaterial(opts.rock, true);
  pavingM.color.setScalar(0.8);
  const slateM = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.6, metalness: 0.15 });
  const darkM = new THREE.MeshBasicMaterial({ color: 0x050403, fog: true });
  const glowM = new THREE.MeshBasicMaterial({ color: 0xe0802e, fog: true });
  const ironM = new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.55, metalness: 0.6 });
  const mats: [GL, THREE.Material, string][] = [[S.stone, stoneM, 'stone'], [S.paving, pavingM, 'paving'], [S.slate, slateM, 'slate'], [S.dark, darkM, 'windows'], [S.glow, glowM, 'glow'], [S.iron, ironM, 'iron']];
  for (const [list, mat, name] of mats) {
    if (!list.length) continue;
    const geo = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'ruins-' + name;
    mesh.castShadow = mesh.receiveShadow = true;
    if (name === 'windows' || name === 'glow') mesh.castShadow = false;
    group.add(mesh);
  }
  const lamp = new THREE.PointLight(0xff9a44, 38, 22, 2);
  { const q = P(TC - GD / 2 + 1.2, 0); lamp.position.set(q[0], FL + 3.6, q[1]); }
  group.add(lamp);
  return { group, marks: { gate, exit } };
}

// ---- the keep ----------------------------------------------------------------------------------------
function buildKeep(gate: V2) {
  const K: V2 = [138, -100];
  const nf: V2 = [gate[0] - K[0], gate[1] - K[1]];
  const nl = Math.hypot(nf[0], nf[1]);
  const th = Math.atan2(nf[0] / nl, nf[1] / nl); // local +z (front) faces the gate
  const toW = (u: number, v: number): V2 => [K[0] + u * Math.cos(th) + v * Math.sin(th), K[1] - u * Math.sin(th) + v * Math.cos(th)];
  let gMin = 1e9, gMax = -1e9;
  for (let u = -26; u <= 26; u += 6.5) for (let v = -17; v <= 17; v += 8.5) { const p = toW(u, v), h = plateauAt(p[0], p[1]); gMin = Math.min(gMin, h); gMax = Math.max(gMax, h); }
  const base = gMin + (gMax - gMin) * 0.45 + 1.2;
  const prev = S;
  S = mk();

  // the terrace: a battered podium of stone that levels the slope
  const pb = gMin - 6, ext = Math.min(2.4, 0.12 * (base - pb));
  frustum(S.stone, 0, 0, 0, 52, 34, pb - base, 0, [ext, ext, ext, ext], [0, 0, 0, 0]);
  box(S.stone, 0, -0.1, 0, 52.2, 0.4, 34.2);
  // a low parapet and string course on the terrace edge
  for (let u = -25; u < 25; u += 2.4) for (const v of [-16.4, 16.4]) { if (rnd() < 0.3) continue; box(S.stone, u + 1, 0, v, 1.8, 0.9 + rnd() * 0.5, 0.9); }
  for (let v = -15; v < 15; v += 2.4) for (const u of [-25.4, 25.4]) { if (rnd() < 0.3) continue; box(S.stone, u, 0, v + 1, 0.9, 0.9 + rnd() * 0.5, 1.8); }

  // the hall: a long gutted block with a steep roof, half of it gone
  const HU = 17, HV = 9, HH = 22, T = 2.2;
  const hallDrop = (lu: number, lv: number) => {
    const front = lv > 0 ? 1 : 0, back = lv < 0 ? 1 : 0;
    return Math.min(0.9, 0.78 * front * sstep(5.5, 1.5, Math.abs(lu - 6.5)) + 0.55 * back * sstep(5, 1.5, Math.abs(lu + 8)) + 0.1 * vnoise(lu * 0.7, lv * 0.7 + 4));
  };
  const hallTop = (x: number, z: number) => HH - hallDrop(x, z) * 0.6 * HH;
  const hs: [V2, V2][] = [
    [[-HU, HV - T / 2], [HU, HV - T / 2]], [[HU - T / 2, HV], [HU - T / 2, -HV]],
    [[HU, -HV + T / 2], [-HU, -HV + T / 2]], [[-HU + T / 2, -HV], [-HU + T / 2, HV]],
  ];
  for (const [a, b] of hs) {
    cells(S.stone, a, b, T, 1, { step: 1.6, found: 0, bottom: () => -0.3, top: hallTop });
  }
  // string courses and the cornice
  box(S.stone, 0, 9.5, HV + 0.15, 2 * HU + 0.4, 0.4, 0.5);
  box(S.stone, 0, 10.5, -HV - 0.15, 2 * HU + 0.4, 0.4, 0.5);
  box(S.stone, 0, HH - 1.4, -HV - 0.2, 2 * HU + 0.6, 0.7, 0.7);
  // the gable ends: jagged triangles of stone
  for (const sgn of [1, -1]) {
    const sh = new THREE.Shape();
    const apex = sgn > 0 ? [[-9, 0], [9, 0], [9, 1.5], [5.5, 5], [3, 7.2], [1.4, 9.4], [0, 10.4], [-1.5, 9], [-4, 6.5], [-9, 1.5]] : [[-9, 0], [9, 0], [9, 0.6], [6, 2.5], [3, 3.8], [1.5, 6.2], [0.3, 5.0], [-2, 3.1], [-6, 2.0], [-9, 1.2]];
    apex.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(sgn > 0 ? HU - T : -HU, HH - 0.2, 0);
    add(S.stone, g);
  }
  // roof: slate bays on steep rafters, with the front-left half stripped to the ribs
  const RISE = 10.5, RUN = HV + 1.2, SL = Math.hypot(RISE, RUN), ANG = Math.atan2(RISE, RUN), NB = 10, BW = (2 * HU) / NB;
  const slab = (list: GL, u: number, sg: number, w: number, th: number) => {
    const g = new THREE.BoxGeometry(w, th, SL);
    g.translate(0, th / 2 - 0.15, sg * SL / 2);
    g.rotateX(sg * ANG);
    g.translate(u, HH + RISE, 0);
    add(list, g);
  };
  for (const sg of [1, -1]) {
    for (let i = 0; i < NB; i++) {
      const gone = sg > 0 ? [2, 3, 4, 5, 6].includes(i) : [0, 1, 8].includes(i);
      if (!gone) slab(S.slate, -HU + BW * (i + 0.5), sg, BW + 0.05, 0.5);
    }
    for (let i = 0; i <= NB; i++) slab(S.iron, -HU + BW * i, sg, 0.4, 0.55);
  }
  box(S.iron, 0, HH + RISE - 0.5, 0, 2 * HU, 0.6, 0.6);
  box(S.iron, -4, HH + 3.2, 0, 0.4, 0.4, 2 * HV);

  // the central tower and its dome
  const CT = 34;
  sqTower(0, 1, 0, 13, 13, 0, CT, { ground: () => 0, bottom: -3, ext: [0, 0, 0, 0], T: 1.8, merlon: false,
    drop: (lx, lz) => 0.05 * vnoise(lx, lz),
    wins: [
      { f: 0, y: 11, at: -0.28, w: 1.6, h: 5.2 }, { f: 0, y: 11, at: 0.28, w: 1.6, h: 5.2, lit: true }, { f: 0, y: 21, at: 0, w: 1.8, h: 5.8, lit: true },
      { f: 0, y: 28.5, at: -0.3, slit: true, h: 2 }, { f: 0, y: 28.5, at: 0.3, slit: true, h: 2 },
      { f: 1, y: 20, at: 0, w: 1.6, h: 5.4, lit: true }, { f: 3, y: 22, at: 0, w: 1.6, h: 5.4 },
    ] });
  box(S.stone, 0, CT - 0.4, 1, 13.6, 0.5, 13.6);
  const drum = new THREE.CylinderGeometry(5.4, 5.7, 6.2, 8).toNonIndexed();
  drum.computeVertexNormals();
  drum.translate(0, CT + 3.1, 1);
  add(S.stone, drum);
  const cor = new THREE.CylinderGeometry(6.2, 6.0, 0.9, 8).toNonIndexed();
  cor.computeVertexNormals();
  cor.translate(0, CT + 6.4, 1);
  add(S.stone, cor);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4, r = 5.3 * Math.cos(Math.PI / 8) + 0.02;
    winAt(Math.sin(a) * r, CT + 1.2, 1 + Math.cos(a) * r, Math.sin(a), Math.cos(a), 1.3, 4.2, i === 1);
  }
  {
    // the dome, a lathe in sixteen gores with the front-right ones torn out
    const R = 5.9, DH = 7.2, DY = CT + 6.8, NG = 16;
    for (let k = 0; k < NG; k++) {
      const amax = [1, 2].includes(k) ? 0.38 : [0, 3].includes(k) ? 0.95 : [15, 4].includes(k) ? 1.25 : Math.PI / 2;
      const pts: THREE.Vector2[] = [];
      for (let j = 0; j <= 8; j++) { const a = (amax * j) / 8; pts.push(new THREE.Vector2(R * Math.cos(a) + 0.01, DH * Math.sin(a) * (0.9 + 0.1 * Math.cos(a)))); }
      if (amax > 1.5) pts[8].x = 0.0;
      const g = new THREE.LatheGeometry(pts, 2, (k / NG) * Math.PI * 2, (Math.PI * 2) / NG);
      g.translate(0, DY, 1);
      add(S.slate, g);
    }
    // ribs standing in the hole
    for (const ph of [0.35, 0.8, 1.25]) {
      const r1 = new THREE.BoxGeometry(0.35, 0.4, 7.4);
      r1.translate(0, 0, 3.7);
      r1.rotateX(-1.05);
      r1.rotateY(ph);
      r1.translate(0, DY + 0.2, 1);
      add(S.iron, r1);
    }
    box(S.stone, 0, DY + DH - 0.4, 1, 0.5, 0.5, 0.5);
    const fin = new THREE.CylinderGeometry(0.1, 0.2, 4.2, 6);
    fin.translate(0, DY + DH + 1.7, 1);
    add(S.iron, fin);
    for (const [px, pz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) spire(px * 6.0, CT - 0.2, 1 + pz * 6.0, 1.15, 5, 6, 0);
  }

  // corner towers with their spires
  const towers: { u: number; v: number; H: number; sp: number; cut: number; broken?: boolean; lit?: boolean }[] = [
    { u: 17.5, v: 9.5, H: 34, sp: 14, cut: 0, lit: true },
    { u: -17.5, v: 9.5, H: 29, sp: 13, cut: 0.52, lit: true },
    { u: 17.5, v: -9.5, H: 36, sp: 12, cut: 0 },
    { u: -17.5, v: -9.5, H: 27, sp: 0, cut: 0, broken: true },
  ];
  for (const t of towers) {
    sqTower(t.u, t.v, 0, 8, 8, 0, t.H, {
      ground: () => 0, bottom: -3, ext: [0.9, 0.9, 0.9, 0.9], T: 1.5, merlon: !!t.broken,
      drop: t.broken ? (lx, lz) => 0.8 * sstep(8, 1, Math.hypot(lx + 3.5, lz - 3.5)) + 0.2 * vnoise(lx, lz) : undefined,
      wins: [
        { f: 0, y: t.H * 0.42, at: 0.08, w: 1.2, h: 3.6, lit: !!t.lit }, { f: 1, y: t.H * 0.5, at: 0, w: 1.2, h: 3.6 },
        { f: 0, y: t.H * 0.75, at: -0.15, slit: true, h: 1.8 }, { f: 3, y: t.H * 0.6, at: 0, slit: true, h: 1.8 }, { f: 1, y: t.H * 0.8, at: 0.2, slit: true, h: 1.8 },
      ],
    });
    if (t.sp) {
      box(S.stone, t.u, t.H - 0.9, t.v, 8.3, 1.0, 8.3);
      spire(t.u, t.H, t.v, 5.9, t.sp, 8, Math.PI / 8, t.cut);
      if (!t.cut) { const fin = new THREE.CylinderGeometry(0.08, 0.18, 3.2, 6); fin.translate(t.u, t.H + t.sp + 1.0, t.v); add(S.iron, fin); }
    }
  }
  // buttresses with pinnacles along the hall front
  for (const u of [-12.6, -8.2, 8.2, 12.6]) {
    frustum(S.stone, u, HV + 0.7, 0, 1.5, 1.4, -0.5, 15, [0, 0, 0, 2.3], [0, 0, 0, 0.4]);
    const c = new THREE.ConeGeometry(1.05, 3.6, 4).toNonIndexed();
    c.computeVertexNormals();
    c.rotateY(Math.PI / 4);
    c.translate(u, 16.8, HV + 0.9);
    add(S.stone, c);
  }
  // hall windows
  for (const [u, lit] of [[-15.2, false], [-10.4, true], [-5.9, false], [5.9, true], [10.4, false], [15.2, true]] as [number, boolean][]) {
    if (hallTop(u, HV) < 14.5) continue;
    winAt(u, 7.6, HV + 0.02, 0, 1, 1.7, 6.2, lit);
  }
  for (const u of [-12, 0, 12]) winAt(u, 7.6, -HV - 0.02, 0, -1, 1.7, 6.2, false);
  // rubble heaps at the foot of the breaches
  for (const [u, v, n] of [[6.5, HV + 4, 9], [-8, -HV - 4, 7], [-17, -14, 6]] as [number, number, number][]) rubble(u, v, n, 3.2, 1.9, () => 0);

  // move it into place
  const M = new THREE.Matrix4().makeRotationY(th).setPosition(K[0], base, K[1]);
  const kit = S;
  S = prev;
  for (const key of Object.keys(kit) as (keyof Kit)[]) for (const g of kit[key]) { g.applyMatrix4(M); S[key].push(g); }
}
