// The shape of the Wreck Shore. A black-sand bay open to the sea in the south (+Z), walled by
// basalt cliffs: a headland on the west, where the ship lies broken on the rocks at its foot,
// and a long wall along the north. A canyon cuts back into the north wall under a natural
// arch; the great fall drops at its head, and its river runs out across the beach to the sea.
// Sea stacks stand off the headland. You wake in the middle of the beach.
import { clamp, fbm, smoothstep, distToSegment } from '../../core/math';

export const BAY = {
  wake: { x: 8, z: 8 },
  shoreZ: 24,
  /** Height of the land above the cliffs. */
  plateau: 46,
  canyon: { x: 16, mouthZ: -53, headZ: -121, width: 27 },
  arch: { x: 16, z: -62, thickness: 6, crown: 37 },
  falls: { x: 16, z: -119, top: 47 },
  ship: { x: -70, z: 18, yaw: Math.PI / 2 - 0.35, heel: -0.24, pitch: 0.06, sink: 1.9 },
  /** Sea stacks: where, how tall, how broad at the foot. */
  stacks: [
    { x: -215, z: 140, h: 72, r: 11 },
    { x: -186, z: 168, h: 52, r: 8 },
    { x: -246, z: 178, h: 40, r: 9 },
    { x: -150, z: 104, h: 14, r: 7 },
  ],
  /** The far peak with the tower on it. */
  peak: { x: -2600, z: -3200, height: 1800 },
};

/**
 * The foot of the cliffs, as one line traced with the open ground on its right hand: out at sea
 * along the headland's south face, up its east face, along the north wall, into the canyon
 * and out again, and east to where the cliffs fall away.
 */
const RAW: [number, number][] = [
  [-200, 46], [-160, 41], [-128, 44], [-102, 40], [-93, 26], [-90, 0], [-93, -28], [-87, -52],
  [-50, -50], [-15, -55], [1, -54], [3, -80], [6, -116], [26, -121], [29, -90], [31, -54],
  [50, -50], [90, -48], [130, -38], [170, -20],
];

function catmull(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The cliff foot, every metre or so, wandering in and out in bays and buttresses. */
export const OUTLINE: [number, number][] = (() => {
  const base = catmull(RAW, 1.0);
  let s = 0;
  return base.map((p, i) => {
    const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    if (i > 0) s += Math.hypot(p[0] - base[i - 1][0], p[1] - base[i - 1][1]);
    // keep the canyon walls tight, let the long walls wander
    const inCanyon = p[1] < -60 ? 0.3 : 1;
    const j = (fbm(s * 0.03, 1.3, 3) * 5 + fbm(s * 0.12, 4.1, 2) * 1.2) * inCanyon;
    return [p[0] + (-tz / l) * j, p[1] + (tx / l) * j] as [number, number];
  });
})();

// ---- signed distance to the cliff foot, positive inside the rock --------------------------------

const SDF = { minX: -300, minZ: -170, maxX: 200, maxZ: 230, cell: 1 };
const SDF_W = Math.round((SDF.maxX - SDF.minX) / SDF.cell) + 1;
const SDF_H = Math.round((SDF.maxZ - SDF.minZ) / SDF.cell) + 1;
let sdfGrid: Float32Array | null = null;

function outlineDistance(x: number, z: number): number {
  let best = 1e9, sign = 1;
  for (let i = 0; i < OUTLINE.length - 1; i++) {
    const a = OUTLINE[i], b = OUTLINE[i + 1];
    const [d, t] = distToSegment(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) {
      best = d;
      // which side: open ground lies along (-dz, dx)
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const qx = a[0] + dx * t, qz = a[1] + dz * t;
      sign = (x - qx) * -dz + (z - qz) * dx > 0 ? -1 : 1;
    }
  }
  return best * sign;
}

function buildSdf() {
  const g = new Float32Array(SDF_W * SDF_H);
  for (let j = 0; j < SDF_H; j++) for (let i = 0; i < SDF_W; i++) {
    const x = SDF.minX + i * SDF.cell, z = SDF.minZ + j * SDF.cell;
    let d = outlineDistance(x, z);
    // beyond the line's two ends there is no cliff
    if (x < -199 && z > 40) d = Math.min(d, -5);
    // the sea stacks are rock too
    for (const s of BAY.stacks) d = Math.max(d, s.r - Math.hypot(x - s.x, z - s.z));
    g[j * SDF_W + i] = d;
  }
  return g;
}

/** How far inside the rock a point is (negative: how far out in the open). */
export function rockDistance(x: number, z: number): number {
  if (!sdfGrid) sdfGrid = buildSdf();
  const fx = clamp((x - SDF.minX) / SDF.cell, 0, SDF_W - 1.001), fz = clamp((z - SDF.minZ) / SDF.cell, 0, SDF_H - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const g = sdfGrid;
  const a = g[j * SDF_W + i], b = g[j * SDF_W + i + 1], c = g[(j + 1) * SDF_W + i], d = g[(j + 1) * SDF_W + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** The land on top of the cliffs. */
export function plateauAt(x: number, z: number): number {
  let h = BAY.plateau + fbm(x * 0.008, z * 0.008, 4) * 8 + fbm(x * 0.04, z * 0.04, 3) * 1.5;
  h -= smoothstep(-120, -200, x) * smoothstep(-20, 40, z) * 10; // the headland falls toward its point
  h -= smoothstep(100, 175, x) * 22; // and the cliffs fall away in the east
  return h;
}

/** Where the river runs, from the plunge pool to the sea. */
export const RIVER: [number, number][] = [
  [16, -114], [17, -104], [15, -92], [17, -80], [15, -68], [16, -56], [14, -44], [9, -32], [6, -20], [9, -8], [15, 4], [19, 14], [21, 24], [22, 36],
];

function riverDistance(x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [d] = distToSegment(x, z, RIVER[i][0], RIVER[i][1], RIVER[i + 1][0], RIVER[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** The waterline at x: where the beach meets the sea. */
export function shoreAt(x: number): number {
  return BAY.shoreZ + fbm(x * 0.018 + 3, 1.7, 3) * 7 + smoothstep(-40, -85, x) * 8;
}

/** Height of the ground out in the open: beach, sea floor, canyon floor. */
function openGround(x: number, z: number, d: number): number {
  const shore = shoreAt(x);
  let h = (shore - z) * 0.045;
  if (z > shore) h = -(z - shore) * 0.08 - Math.pow(Math.max(0, z - shore - 25) * 0.05, 2);
  // the storm berm along the top of the beach
  h += Math.exp(-Math.pow((z - (shore - 10)) / 5, 2)) * 0.5;
  h += fbm(x * 0.07, z * 0.07, 3) * 0.3;
  // the canyon floor climbs gently toward the falls
  h += Math.max(0, BAY.canyon.mouthZ - z) * 0.035;
  // scree and turf banked against the foot of the cliffs
  const foot = smoothstep(-16, 0, d);
  h += foot * foot * (5 + fbm(x * 0.05, z * 0.05, 3) * 4) * (z > shore - 4 ? 0.3 : 1);
  // the river's bed, and its pool under the falls
  const rd = riverDistance(x, z);
  h -= Math.exp(-Math.pow(rd / (2 + smoothstep(-50, 30, z) * 3.5), 2)) * 0.7;
  h -= Math.exp(-Math.pow(Math.hypot(x - BAY.falls.x, z - (BAY.falls.z + 6)) / 6, 2)) * 1.6;
  return h;
}

/** Ground height anywhere. Inside the rock it is the land on top of the cliffs. */
export function groundHeight(x: number, z: number): number {
  const d = rockDistance(x, z);
  const open = openGround(x, z, Math.min(d, 0));
  if (d <= 1) return clamp(open, -60, 80);
  const top = plateauAt(x, z);
  return clamp(open + (top - open) * smoothstep(1, 4, d), -60, 80);
}

/** How wet the ground is here: by the sea, along the river. 0 dry, 1 soaked. */
export function wetness(x: number, z: number): number {
  const shore = shoreAt(x);
  const sea = smoothstep(shore - 14, shore - 1, z);
  const river = Math.exp(-Math.pow(riverDistance(x, z) / 3.5, 2));
  const spray = Math.exp(-Math.pow(Math.hypot(x - BAY.falls.x, z - (BAY.falls.z + 6)) / 14, 2));
  return clamp(Math.max(sea, river, spray), 0, 1);
}

/** How much grass and moss grows here: on the scree under the cliffs and on the land above. */
export function greenness(x: number, z: number): number {
  const d = rockDistance(x, z);
  const scree = smoothstep(-14, -4, d) * (1 - smoothstep(-1, 1, d));
  const high = smoothstep(2, 6, d);
  const canyon = z < BAY.canyon.mouthZ - 3 ? 0.9 : 0;
  const patchy = smoothstep(0.25, 0.6, fbm(x * 0.05 + 9, z * 0.05, 3) * 0.5 + 0.5);
  return clamp(Math.max(scree * patchy, high, canyon * (0.6 + 0.4 * patchy)) * (1 - wetness(x, z) * 0.6), 0, 1);
}
