// The birds of the Wreck Shore: gulls wheeling round the stacks and riding the cliff-top wind,
// crows on the wreck's yards and circling over her, cormorants drying their wings on the low stack.
//
// Each species is ONE InstancedMesh. Every bit of motion (path, banking, flapping, hopping, head
// turns) is computed in the vertex shader from per-instance attributes and a single uTime
// uniform, so a given time always gives the same picture. No Math.random anywhere.
//
// Bird local frame: forward is -Z, wings along +-X, up is +Y.
import * as THREE from 'three';
import { groundHeight, BAY } from './layout';
import { seaStack } from './cliffs';

type RGB = [number, number, number];

interface Spec {
  /** Body rings from tail to beak: z, half-width, half-height, centre height, kind (0 body, 1 head, 2 beak, 3 tail). */
  rings: number[][];
  half: number;
  wingLE: number[];
  wingTE: number[];
  shoulderZ: number;
  wingY: number;
  neckZ: number;
  bodyW: number;
  tail: { z0: number; z1: number; w0: number; w1: number };
  tailEndZ: number;
  pal: { back: RGB; belly: RGB; head: RGB; beak: RGB; tail: RGB; wing: RGB; tip: RGB; leg: RGB };
}

const WING_T = [0, 0.25, 0.47, 0.65, 0.82, 1];
const ELBOW_T = 0.47;

const GULL: Spec = {
  rings: [
    [0.30, 0.010, 0.010, 0.012, 3], [0.20, 0.032, 0.030, 0.012, 3], [0.10, 0.066, 0.058, 0.004, 0],
    [-0.02, 0.088, 0.080, 0, 0], [-0.12, 0.080, 0.076, 0.006, 0], [-0.20, 0.058, 0.058, 0.028, 1],
    [-0.25, 0.052, 0.052, 0.040, 1], [-0.30, 0.036, 0.035, 0.040, 1], [-0.325, 0.020, 0.019, 0.036, 2],
    [-0.375, 0.012, 0.012, 0.028, 2], [-0.40, 0.002, 0.002, 0.026, 2],
  ],
  half: 0.6,
  wingLE: [-0.10, -0.14, -0.15, -0.10, -0.02, 0.22],
  wingTE: [0.22, 0.20, 0.17, 0.17, 0.17, 0.28],
  shoulderZ: -0.05,
  wingY: 0.03,
  neckZ: -0.17,
  bodyW: 0.088,
  tail: { z0: 0.2, z1: 0.38, w0: 0.03, w1: 0.07 },
  tailEndZ: 0.38,
  pal: {
    back: [0.52, 0.55, 0.6], belly: [0.93, 0.93, 0.92], head: [0.94, 0.94, 0.93], beak: [0.85, 0.62, 0.08],
    tail: [0.9, 0.9, 0.9], wing: [0.86, 0.87, 0.88], tip: [0.05, 0.05, 0.06], leg: [0.75, 0.45, 0.3],
  },
};

const CROW: Spec = {
  rings: [
    [0.28, 0.010, 0.010, 0, 3], [0.20, 0.030, 0.028, 0, 3], [0.10, 0.058, 0.050, 0, 0],
    [-0.01, 0.072, 0.066, 0, 0], [-0.09, 0.066, 0.064, 0.010, 0], [-0.15, 0.048, 0.050, 0.030, 1],
    [-0.20, 0.046, 0.046, 0.042, 1], [-0.245, 0.032, 0.032, 0.040, 1], [-0.27, 0.026, 0.026, 0.036, 2],
    [-0.31, 0.016, 0.018, 0.030, 2], [-0.335, 0.002, 0.003, 0.022, 2],
  ],
  half: 0.5,
  wingLE: [-0.10, -0.16, -0.16, -0.12, -0.06, 0.06],
  wingTE: [0.25, 0.28, 0.28, 0.30, 0.32, 0.28],
  shoulderZ: -0.04,
  wingY: 0.03,
  neckZ: -0.14,
  bodyW: 0.072,
  tail: { z0: 0.2, z1: 0.42, w0: 0.03, w1: 0.075 },
  tailEndZ: 0.42,
  pal: {
    back: [0.03, 0.03, 0.04], belly: [0.04, 0.04, 0.05], head: [0.03, 0.03, 0.04], beak: [0.05, 0.05, 0.05],
    tail: [0.025, 0.025, 0.03], wing: [0.03, 0.03, 0.04], tip: [0.025, 0.025, 0.03], leg: [0.04, 0.04, 0.04],
  },
};

const CORMORANT: Spec = {
  rings: [
    [0.36, 0.010, 0.010, -0.01, 3], [0.26, 0.030, 0.030, 0, 3], [0.14, 0.060, 0.055, 0, 0],
    [0, 0.075, 0.070, 0, 0], [-0.12, 0.062, 0.062, 0.020, 0], [-0.22, 0.035, 0.035, 0.070, 0],
    [-0.30, 0.026, 0.026, 0.130, 0], [-0.38, 0.025, 0.025, 0.190, 0], [-0.44, 0.036, 0.034, 0.220, 1],
    [-0.50, 0.022, 0.022, 0.215, 1], [-0.55, 0.014, 0.014, 0.205, 2], [-0.60, 0.008, 0.010, 0.190, 2],
    [-0.625, 0.002, 0.002, 0.170, 2],
  ],
  half: 0.5,
  wingLE: [-0.12, -0.16, -0.17, -0.14, -0.08, 0.0],
  wingTE: [0.28, 0.30, 0.30, 0.30, 0.28, 0.18],
  shoulderZ: -0.02,
  wingY: 0.04,
  neckZ: -0.4,
  bodyW: 0.075,
  tail: { z0: 0.26, z1: 0.5, w0: 0.03, w1: 0.06 },
  tailEndZ: 0.5,
  pal: {
    back: [0.06, 0.07, 0.07], belly: [0.05, 0.05, 0.05], head: [0.05, 0.055, 0.055], beak: [0.5, 0.46, 0.3],
    tail: [0.04, 0.04, 0.04], wing: [0.09, 0.08, 0.07], tip: [0.04, 0.04, 0.04], leg: [0.04, 0.04, 0.04],
  },
};

const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The bird, built once: body spindle, tail, two-segment wings and two little legs. */
function buildGeometry(sp: Spec): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], seg: number[] = [], idx: number[] = [];
  const vtx = (x: number, y: number, z: number, c: RGB, kind: number, d: number, head: number, outer: number) => {
    pos.push(x, y, z);
    col.push(c[0], c[1], c[2]);
    seg.push(kind, d, head, outer);
    return pos.length / 3 - 1;
  };
  const P = sp.pal;
  // body
  const N = 6;
  const ringIdx: number[][] = [];
  let firstHead = true;
  for (const r of sp.rings) {
    const [z, rx, ry, cy, kind] = r;
    let head = 0;
    if (kind === 1) {
      head = firstHead ? 0.5 : 1;
      firstHead = false;
    } else if (kind === 2) head = 1;
    const row: number[] = [];
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2 + Math.PI / 6;
      const s = Math.sin(th);
      let c: RGB;
      if (kind === 3) c = P.tail;
      else if (kind === 2) c = P.beak;
      else if (kind === 1) c = mix3(P.head, P.back, smooth(0.3, 0.9, s) * 0.5);
      else c = mix3(P.belly, P.back, smooth(-0.25, 0.55, s));
      row.push(vtx(Math.cos(th) * rx, cy + s * ry, z, c, 0, 0, head, 0));
    }
    ringIdx.push(row);
  }
  for (let i = 0; i + 1 < ringIdx.length; i++) {
    for (let k = 0; k < N; k++) {
      const a = ringIdx[i][k], b = ringIdx[i][(k + 1) % N], c = ringIdx[i + 1][k], d = ringIdx[i + 1][(k + 1) % N];
      idx.push(a, c, b, b, c, d);
    }
  }
  // tail wedge
  {
    const t = sp.tail, y = 0.012;
    const a = vtx(-t.w0, y, t.z0, P.tail, 0, 0, 0, 0), b = vtx(t.w0, y, t.z0, P.tail, 0, 0, 0, 0);
    const c = vtx(t.w1, y, t.z1, P.tail, 0, 0, 0, 0), d = vtx(-t.w1, y, t.z1, P.tail, 0, 0, 0, 0);
    idx.push(a, b, c, a, c, d);
  }
  // wings: stations from root to tip, leading and trailing edge, mirrored
  for (const s of [-1, 1]) {
    let prev: [number, number] | null = null;
    WING_T.forEach((t, i) => {
      const d = t * sp.half;
      const outer = t >= ELBOW_T - 1e-4 ? 1 : 0;
      const c = mix3(P.wing, P.tip, smooth(0.6, 0.95, t));
      const camber = 0.012 * Math.sin(Math.min(1, t * 1.4) * Math.PI);
      const le = vtx(s * d, sp.wingY + camber, sp.wingLE[i] * sp.half, c, 1, d, 0, outer);
      const te = vtx(s * d, sp.wingY + camber * 0.4, sp.wingTE[i] * sp.half, c, 1, d, 0, outer);
      if (prev) idx.push(prev[0], prev[1], le, prev[1], te, le);
      prev = [le, te];
    });
  }
  // legs
  for (const s of [-1, 1]) {
    const top: number[] = [], bot: number[] = [];
    for (let k = 0; k < 3; k++) {
      const th = (k / 3) * Math.PI * 2;
      top.push(vtx(s * 0.035 + Math.cos(th) * 0.008, -0.05, 0.02 + Math.sin(th) * 0.008, P.leg, 2, 0, 0, 0));
      bot.push(vtx(s * 0.04 + Math.cos(th) * 0.006, -0.16, 0.0 + Math.sin(th) * 0.006, P.leg, 2, 0, 0, 0));
    }
    for (let k = 0; k < 3; k++) {
      const n = (k + 1) % 3;
      idx.push(top[k], bot[k], top[n], top[n], bot[k], bot[n]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- instances ----------------------------------------------------------------------------------

interface Inst {
  kind: 0 | 1 | 2; // circle, figure of eight, perched
  c: [number, number, number];
  yaw: number;
  a: number;
  b: number;
  phase: number;
  omega: number;
  flap: number;
  scale: number;
  bias: number;
  bob: number;
  fold: number; // 0 flying, 1 wings folded, 2 half open
  seed: number;
  pitch: number;
  tint: RGB;
}

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(5);

function makeMesh(name: string, sp: Spec, insts: Inst[], uTime: { value: number }): THREE.InstancedMesh {
  const geo = buildGeometry(sp);
  const n = insts.length;
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 4), D = new Float32Array(n * 4);
  insts.forEach((q, i) => {
    A.set([q.c[0], q.c[1], q.c[2], q.yaw], i * 4);
    B.set([q.a, q.b, q.phase, q.omega], i * 4);
    C.set([q.kind, q.flap, q.scale, q.bias], i * 4);
    D.set([q.bob, q.fold, q.seed, q.pitch], i * 4);
  });
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  geo.setAttribute('aD', new THREE.InstancedBufferAttribute(D, 4));

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
  const defs =
    `const float HALF = ${f(sp.half)}; const float ELB = ${f(sp.half * ELBOW_T)}; const float WY = ${f(sp.wingY)};\n` +
    `const float NECKZ = ${f(sp.neckZ)}; const float BW = ${f(sp.bodyW)}; const float SHZ = ${f(sp.shoulderZ)};\n` +
    `const float FK = ${f((sp.tailEndZ - 0.04 - sp.shoulderZ) / sp.half)};\n`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
attribute vec4 aSeg; attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aD;
${defs}
vec3 rz(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
vec3 pathPos(float u) {
  float a = aB.x, b = aB.y;
  vec3 l;
  if (aC.x < 0.5) l = vec3(a * cos(u), 0.0, b * sin(u));
  else l = vec3(a * sin(u), 0.0, b * sin(2.0 * u) * 0.5);
  l.y = aD.x * sin(u * 1.7 + aD.z * 6.2832);
  float c = cos(aA.w), s = sin(aA.w);
  return aA.xyz + vec3(l.x * c + l.z * s, l.y, -l.x * s + l.z * c);
}`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `
float t = uTime;
float kind = aC.x, scl = aC.z, seed = aD.z, fold = aD.y;
bool flying = kind < 1.5;
vec3 bP; vec3 Xa; vec3 Ya; vec3 Za;
float hop = 0.0;
if (flying) {
  float sg = aB.w < 0.0 ? -1.0 : 1.0;
  float u = aB.z + aB.w * t;
  vec3 pa = pathPos(u - sg * 0.06), p1 = pathPos(u), pc = pathPos(u + sg * 0.06);
  vec3 v = pc - pa, d1 = p1 - pa, d2 = pc - p1;
  float turn = d1.z * d2.x - d1.x * d2.z;
  float rate = (turn / max(length(d1) * length(d2), 1e-4)) * abs(aB.w) / 0.06;
  float spd = length(v) / 0.12 * abs(aB.w);
  float bank = clamp(atan(spd * rate / 9.8) * 1.5, -0.75, 0.75);
  vec3 fw = normalize(v);
  Za = -fw;
  Xa = normalize(cross(vec3(0.0, 1.0, 0.0), Za));
  Ya = cross(Za, Xa);
  float cb = cos(bank), sb = sin(bank);
  vec3 X2 = Xa * cb + Ya * sb;
  vec3 Y2 = Ya * cb - Xa * sb;
  Xa = X2; Ya = Y2;
  bP = p1;
} else {
  float yaw = aA.w;
  float pitch = aD.w;
  if (fold > 1.5) {
    yaw += 0.03 * sin(t * 0.5 + seed * 9.0);
    pitch += 0.025 * sin(t * 0.7 + seed * 5.0);
  } else {
    float per = 3.5 + 4.0 * fract(seed * 5.1);
    float ph = fract((t + seed * 50.0) / per);
    if (ph < 0.07) hop = 0.09 * sin(ph / 0.07 * 3.14159);
    // an occasional turn on the spot
    float tp = fract((t + seed * 31.0) / (9.0 + 6.0 * fract(seed * 3.7)));
    yaw += smoothstep(0.0, 0.03, tp) * 0.0 + (tp < 0.05 ? sin(tp / 0.05 * 3.14159) * 0.5 : 0.0);
  }
  Xa = vec3(cos(yaw), 0.0, -sin(yaw));
  Za = vec3(sin(yaw), 0.0, cos(yaw));
  Ya = vec3(0.0, 1.0, 0.0);
  vec3 Z2 = Za * cos(pitch) - Ya * sin(pitch);
  vec3 Y2 = Ya * cos(pitch) + Za * sin(pitch);
  Za = Z2; Ya = Y2;
  bP = aA.xyz + vec3(0.0, hop, 0.0);
}
// wing angles: bent glide with the odd burst of flapping, outer segment lagging the inner
float a1, a2;
if (fold > 1.5) {
  a1 = 0.08 + 0.03 * sin(t * 0.8 + seed * 30.0);
  a2 = -0.35 + 0.04 * sin(t * 1.1 + seed * 17.0);
} else {
  float burst = sin(t * (0.30 + 0.2 * fract(seed * 7.31)) + seed * 40.0);
  float env = smoothstep(0.62 - aC.w, 0.9 - aC.w, burst);
  float w = (t * aC.y + fract(seed * 13.7)) * 6.2832;
  float g1 = 0.16 + 0.04 * sin(t * 1.3 + seed * 20.0);
  float g2 = -0.25 + 0.06 * sin(t * 1.9 + seed * 11.0);
  a1 = g1 + env * 0.62 * sin(w);
  a2 = g2 + env * 0.85 * sin(w - 1.1);
}
vec3 pb = position;
vec3 nb = normal;
float side = pb.x < 0.0 ? -1.0 : 1.0;
if (aSeg.x > 0.5 && aSeg.x < 1.5) {
  float d = aSeg.y;
  vec3 q = vec3(d, pb.y - WY, pb.z);
  vec3 n = vec3(nb.x * side, nb.y, nb.z);
  if (aSeg.w > 0.5) { q.x -= ELB; q = rz(q, a2); q.x += ELB; n = rz(n, a2); }
  q = rz(q, a1); n = rz(n, a1);
  q.y += WY;
  if (fold > 0.5 && fold < 1.5) {
    q = vec3(BW + 0.004, WY - pb.z * 0.4, SHZ + d * FK);
    n = vec3(1.0, 0.15, 0.0);
  }
  pb = vec3(q.x * side, q.y, q.z);
  nb = vec3(n.x * side, n.y, n.z);
}
if (aSeg.x > 1.5) {
  float tuck = flying ? 1.0 : 0.0;
  pb.y = mix(pb.y, -0.045, tuck * 0.85);
  pb.z = mix(pb.z, pb.z + 0.12, tuck);
}
if (aSeg.z > 0.0) {
  float look = flying ? 0.0 : smoothstep(0.3, 0.6, sin(t * 0.37 + seed * 13.0)) * sin(t * 1.9 + seed * 7.0) * 0.9 + 0.15 * sin(t * 0.6 + seed * 3.0);
  float ang = aSeg.z * look;
  float cs = cos(ang), sn = sin(ang);
  vec2 r = pb.xz - vec2(0.0, NECKZ);
  pb.xz = vec2(r.x * cs - r.y * sn, r.x * sn + r.y * cs) + vec2(0.0, NECKZ);
  nb.xz = vec2(nb.x * cs - nb.z * sn, nb.x * sn + nb.z * cs);
}
mat3 bM = mat3(Xa, Ya, Za);
vec3 bPos = bM * (pb * scl) + bP;
vec3 objectNormal = normalize(bM * nb);
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = bPos;');
  };
  mat.customProgramCacheKey = () => 'birds-' + name;

  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const ident = new THREE.Matrix4();
  const colour = new THREE.Color();
  insts.forEach((q, i) => {
    mesh.setMatrixAt(i, ident);
    colour.setRGB(q.tint[0], q.tint[1], q.tint[2]);
    mesh.setColorAt(i, colour);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.noCollide = true;
  mesh.name = name;
  return mesh;
}

// ---- the flocks ---------------------------------------------------------------------------------

export function buildBirds(opts: { shipMatrix: THREE.Matrix4 }): { group: THREE.Group; update(time: number): void } {
  const rnd = rngFrom(0xb12d5);
  const uni = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const group = new THREE.Group();
  group.name = 'birds';
  group.userData.noCollide = true;
  const uTime = { value: 0 };

  // ---- gulls and fulmars ----
  const gulls: Inst[] = [];
  const gull = (o: Partial<Inst> & { c: [number, number, number]; a: number; b: number; speed: number; dir?: number }) => {
    const dir = o.dir ?? (rnd() < 0.82 ? 1 : -1);
    const fulmar = rnd() < 0.3;
    const t = fulmar ? uni(0.78, 0.9) : uni(0.9, 1.0);
    gulls.push({
      kind: 0,
      yaw: 0,
      phase: uni(0, Math.PI * 2),
      flap: uni(2.2, 3.0),
      scale: uni(0.95, 1.2),
      bias: 0,
      bob: uni(1.5, 3.5),
      fold: 0,
      seed: rnd(),
      pitch: 0,
      tint: [t, t, t * (fulmar ? 1.02 : 1)],
      ...o,
      omega: (dir * o.speed) / Math.max(o.a, o.b),
    } as Inst);
  };
  // wheeling round the stacks (circles, kept clear of the rock)
  const wheel = (st: { x: number; z: number; h: number }, n: number, lo: number, hi: number) => {
    for (let k = 0; k < n; k++) {
      const a = uni(17, 32);
      gull({
        c: [st.x + uni(-4, 4), uni(lo, Math.min(hi, st.h - 4)) , st.z + uni(-4, 4)],
        yaw: uni(0, Math.PI * 2),
        a,
        b: a * uni(0.8, 1),
        speed: uni(7, 10),
      });
    }
  };
  const S = BAY.stacks;
  wheel(S[0], 14, 15, 62);
  wheel(S[1], 10, 14, 48);
  wheel(S[2], 8, 12, 36);
  // loose, riding the wind along the north cliff top
  for (let k = 0; k < 10; k++) {
    const cx = [-50, 0, 50][k % 3] + uni(-12, 12);
    gull({ c: [cx, uni(57, 70), uni(-46, -43)], a: uni(25, 40), b: uni(4, 7), speed: uni(8, 11), dir: k % 4 === 0 ? -1 : 1, bias: 0.05 });
  }
  // and along the west cliff top
  for (let k = 0; k < 6; k++) {
    gull({ c: [uni(-84, -79), uni(58, 68), uni(-8, 22)], yaw: Math.PI / 2, a: uni(18, 30), b: uni(4, 6), speed: uni(8, 10) });
  }
  // low over the surf near the wreck
  for (let k = 0; k < 6; k++) {
    gull({ c: [uni(-58, -20), uni(3, 8), uni(36, 60)], yaw: uni(-0.4, 0.4), a: uni(10, 20), b: uni(8, 14), speed: uni(6, 8), bob: uni(0.6, 1.2), bias: 0.2, flap: uni(2.6, 3.2) });
    gulls[gulls.length - 1].kind = 1;
  }
  // far specks out to sea
  for (let k = 0; k < 8; k++) {
    gull({ c: [uni(-400, 300), uni(25, 90), uni(350, 700)], yaw: uni(0, 6.28), a: uni(40, 90), b: uni(40, 80), speed: uni(9, 12), scale: uni(1.4, 1.9), bob: uni(3, 6) });
  }
  group.add(makeMesh('gulls', GULL, gulls, uTime));

  // ---- crows ----
  const crows: Inst[] = [];
  const crowBase = (): Inst => ({
    kind: 2, c: [0, 0, 0], yaw: 0, a: 0, b: 0, phase: 0, omega: 0, flap: 3.4, scale: uni(0.95, 1.1), bias: 0, bob: 0,
    fold: 1, seed: rnd(), pitch: uni(0.2, 0.35), tint: [1, 1, 1],
  });
  // on the yards and rail of the wreck
  for (let k = 0; k < 8; k++) {
    const q = crowBase();
    const local = new THREE.Vector3(-9 + k * 2.9 + uni(-0.4, 0.4), 6.2 + (k % 4) * 0.9, uni(-2.8, 2.8)).applyMatrix4(opts.shipMatrix);
    q.c = [local.x, local.y + 0.15 * q.scale, local.z];
    q.yaw = uni(0, Math.PI * 2);
    crows.push(q);
  }
  // on the rocks under the headland
  const rockSpots: [number, number][] = [[-88, 10], [-85, 28], [-92, -12], [-80, 40], [-100, 30], [-96, 44]];
  let onRock = 0;
  for (const [x, z] of rockSpots) {
    if (onRock >= 3) break;
    const h = groundHeight(x, z);
    if (h < 0.4) continue;
    const q = crowBase();
    q.c = [x, h + 0.15 * q.scale, z];
    q.yaw = uni(0, Math.PI * 2);
    crows.push(q);
    onRock++;
  }
  // circling over the wreck
  for (let k = 0; k < 3; k++) {
    const q = crowBase();
    q.kind = 0;
    q.fold = 0;
    q.pitch = 0;
    q.c = [-70 + uni(-4, 4), 12 + k * 3.5 + uni(-1, 1), 25 + uni(-4, 4)];
    q.a = uni(14, 18);
    q.b = q.a * uni(0.65, 0.85);
    q.yaw = uni(0, Math.PI * 2);
    q.phase = uni(0, Math.PI * 2);
    q.omega = (k === 1 ? -1 : 1) * uni(6, 8) / q.a;
    q.bias = 0.45;
    q.bob = uni(1.5, 2.5);
    crows.push(q);
  }
  group.add(makeMesh('crows', CROW, crows, uTime));

  // ---- cormorants on the low stack ----
  const st = S[3];
  const stackGeo = seaStack(st.x, st.z, st.h, st.r, 4);
  const sp = stackGeo.attributes.position, sn = stackGeo.attributes.normal;
  const cand: THREE.Vector3[] = [];
  for (let i = 0; i < sp.count; i++) {
    if (sn.getY(i) > 0.55 && sp.getY(i) > 4) cand.push(new THREE.Vector3(sp.getX(i), sp.getY(i), sp.getZ(i)));
  }
  stackGeo.dispose();
  cand.sort((p, q) => q.y - p.y || p.x - q.x || p.z - q.z);
  const spots: THREE.Vector3[] = [];
  for (const sep of [1.7, 1.2, 0.8]) {
    for (const c of cand) {
      if (spots.length >= 4) break;
      if (spots.every((s) => s.distanceTo(c) > sep)) spots.push(c);
    }
    if (spots.length >= 4) break;
  }
  while (spots.length < 4) spots.push(new THREE.Vector3(st.x + uni(-1.5, 1.5), st.h - 1, st.z + uni(-1.5, 1.5)));
  const corm: Inst[] = spots.map((s, k) => ({
    kind: 2, c: [s.x, s.y + 0.2, s.z], yaw: -0.5 + k * 1.3 + uni(-0.3, 0.3), a: 0, b: 0, phase: 0, omega: 0, flap: 0, scale: uni(1.0, 1.15), bias: 0,
    bob: 0, fold: 2, seed: rnd(), pitch: 0.55, tint: [1, 1, 1],
  }));
  group.add(makeMesh('cormorants', CORMORANT, corm, uTime));

  group.traverse((o) => {
    o.userData.noCollide = true;
  });
  return {
    group,
    update(time: number) {
      uTime.value = time;
    },
  };
}
