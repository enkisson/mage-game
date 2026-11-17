// The shape of the Wreck Shore. A black-sand bay open to the sea in the south (+Z), walled by
// basalt cliffs: a headland on the west, where the ship lies broken on the rocks at its foot,
// and a long wall along the north. A canyon cuts back into the north wall under a natural
// arch; the great fall drops at its head, and its river runs out across the beach to the sea.
// Sea stacks stand off the headland. You wake in the middle of the beach.
import { clamp, fbm, smoothstep, distToSegment } from '../../core/math';
import { SEA_ROCKS } from './searocks-data';

export const BAY = {
  wake: { x: 8, z: 8 },
  shoreZ: 24,
  /** Height of the land above the cliffs. */
  plateau: 84,
  canyon: { x: 16, mouthZ: -53, headZ: -121, width: 27 },
  arch: { x: 16, z: -62, thickness: 10, crown: 58 },
  falls: { x: 16, z: -119, top: 86 },
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

/**
 * The falls, each where it comes over the cliff edge: the lip, the way the face looks there,
 * how wide the water is, and where it lands. `nx, nz` point out from the face.
 */
export interface Fall { name: string; x: number; z: number; nx: number; nz: number; width: number; pool: [number, number] }
export const FALLS: Fall[] = [
  { name: 'great', x: 16, z: -121, nx: 0, nz: 1, width: 15, pool: [16, -110] },
  { name: 'beach', x: -38, z: -52, nx: 0.05, nz: 1, width: 11, pool: [-37.5, -42] },
  { name: 'headland', x: -91, z: -12, nx: 1, nz: 0.05, width: 6, pool: [-82, -11.5] },
  { name: 'east', x: 92, z: -48, nx: -0.1, nz: 1, width: 7, pool: [91, -39] },
];

const lhash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * The cliff foot: straight runs broken at angles, the way a basalt wall breaks along its joints
 * into buttresses and bays. Each leg of the plan is cut into pieces 9-23 m long whose corners
 * are pushed out or in, so the wall faces a little differently every few columns. The lips of
 * the falls stay where they are, and the canyon walls stay tight.
 */
export const OUTLINE: [number, number][] = (() => {
  const out: [number, number][] = [RAW[0]];
  let k = 0;
  for (let i = 0; i < RAW.length - 1; i++) {
    const a = RAW[i], b = RAW[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
    const canyon = a[1] < -60 || b[1] < -60 ? 0.35 : 1;
    let t = 0;
    for (;;) {
      t += 9 + lhash(k++, 1) * 14;
      if (t > len - 7) break;
      const x = a[0] + tx * t, z = a[1] + tz * t;
      let calm = 1;
      for (const f of FALLS) calm = Math.min(calm, smoothstep(7, 20, Math.hypot(x - f.x, z - f.z)));
      const j = (lhash(k, 2) - 0.5) * 7 * canyon * calm;
      out.push([x - tz * j, z + tx * j]);
    }
    out.push(b);
  }
  return out;
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

function buildSdf(): [Float32Array, Float32Array] {
  const land = new Float32Array(SDF_W * SDF_H), sea = new Float32Array(SDF_W * SDF_H);
  for (let j = 0; j < SDF_H; j++) for (let i = 0; i < SDF_W; i++) {
    const x = SDF.minX + i * SDF.cell, z = SDF.minZ + j * SDF.cell;
    let d = outlineDistance(x, z);
    // beyond the line's two ends there is no cliff
    if (x < -199 && z > 40) d = Math.min(d, -5);
    land[j * SDF_W + i] = d;
    // the rocks out in the sea: stacks, skerries, boulders
    let r = -1e3;
    for (const st of BAY.stacks) r = Math.max(r, st.r - Math.hypot(x - st.x, z - st.z));
    for (const st of SEA_ROCKS) r = Math.max(r, st.r - Math.hypot(x - st.x, z - st.z));
    sea[j * SDF_W + i] = r;
  }
  return [land, sea];
}

let seaGrid: Float32Array | null = null;
function sample(g: Float32Array, x: number, z: number): number {
  const fx = clamp((x - SDF.minX) / SDF.cell, 0, SDF_W - 1.001), fz = clamp((z - SDF.minZ) / SDF.cell, 0, SDF_H - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = g[j * SDF_W + i], b = g[j * SDF_W + i + 1], c = g[(j + 1) * SDF_W + i], d = g[(j + 1) * SDF_W + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function grids() {
  if (!sdfGrid) [sdfGrid, seaGrid] = buildSdf();
}

/** How far inside the cliffs' land a point is (negative: how far out in the open). */
export function landDistance(x: number, z: number): number {
  grids();
  return sample(sdfGrid!, x, z);
}

/** How far inside any rock a point is, the cliffs or the rocks out at sea. */
export function rockDistance(x: number, z: number): number {
  grids();
  return Math.max(sample(sdfGrid!, x, z), sample(seaGrid!, x, z));
}

/** How far inside the rocks out at sea a point is. */
export function seaRockDistance(x: number, z: number): number {
  grids();
  return sample(seaGrid!, x, z);
}

/** Behind the cliff face the cliff mesh carries the land for this far; the ground lies low under it. */
export const CAP = 40;

/** The land on top of the cliffs. */
export function plateauAt(x: number, z: number): number {
  let h = BAY.plateau + fbm(x * 0.008, z * 0.008, 4) * 9 + fbm(x * 0.04, z * 0.04, 3) * 1.5;
  h -= smoothstep(-120, -200, x) * smoothstep(-20, 40, z) * 22; // the headland falls toward its point
  h -= smoothstep(100, 180, x) * 40; // and the cliffs fall away in the east
  // the land keeps rising inland in long grassy slopes
  h += smoothstep(4, 110, landDistance(x, z)) * 30;
  // each fall comes over the edge in a notch, fed by a stream cut into the slope above
  for (const f of FALLS) {
    const dx = x - f.x, dz = z - f.z;
    const along = dx * -f.nx + dz * -f.nz, across = Math.abs(dx * -f.nz + dz * f.nx);
    if (along < -8 || along > 120) continue;
    const w = f.width * 0.8 + along * 0.05;
    h -= Math.exp(-Math.pow(across / w, 2)) * (6 + f.width * 0.4) * smoothstep(120, 0, along);
  }
  return h;
}

/** The streams, each from a plunge pool to the sea. The first is the canyon river. */
export const RIVERS: [number, number][][] = [
  [[16, -114], [17, -104], [15, -92], [17, -80], [15, -68], [16, -56], [14, -44], [9, -32], [6, -20], [9, -8], [15, 4], [19, 14], [21, 24], [22, 36]],
  [[-37.5, -42], [-36, -32], [-39, -20], [-43, -8], [-41, 4], [-44, 16], [-46, 28], [-47, 40]],
  [[-82, -11.5], [-80, -2], [-82, 8], [-86, 20], [-88, 34]],
  [[91, -39], [89, -28], [92, -16], [96, -4], [94, 10], [97, 24], [99, 38]],
];
/** The canyon river, kept under its old name. */
export const RIVER = RIVERS[0];

function riverDistance(x: number, z: number): number {
  let best = 1e9;
  for (const r of RIVERS) for (let i = 0; i < r.length - 1; i++) {
    const [d] = distToSegment(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Distance to the nearest plunge pool, scaled by how big its fall is (1 = the pool's edge). */
function poolDistance(x: number, z: number): number {
  let best = 1e9;
  for (const f of FALLS) best = Math.min(best, Math.hypot(x - f.pool[0], z - f.pool[1]) / (f.width * 0.7 + 2));
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
  // in some stretches a long grassed talus slope climbs the wall, elsewhere the columns
  // stand straight out of the sand
  const foot = smoothstep(-16, 0, d);
  const talus = 1.5 + smoothstep(0.05, 0.4, fbm(x * 0.012 + 4.2, z * 0.012, 2)) * 9;
  h += foot * foot * (talus + fbm(x * 0.05, z * 0.05, 3) * 2) * (z > shore - 4 ? 0.3 : 1);
  // the streams' beds, and the pools the falls have dug
  const rd = riverDistance(x, z);
  h -= Math.exp(-Math.pow(rd / (1.6 + smoothstep(-50, 30, z) * 3), 2)) * 0.7;
  h -= Math.exp(-Math.pow(poolDistance(x, z), 2)) * 2.2;
  return h;
}

/** Ground height anywhere. Inside the rock it is the land on top of the cliffs. */
export function groundHeight(x: number, z: number): number {
  const d = landDistance(x, z);
  const open = openGround(x, z, Math.min(d, 0));
  if (d <= 1) return clamp(open, -60, 80);
  // a few metres behind the face (deep enough for the bays and the caves) the ground ducks out of sight under the cliff and its cap of turf,
  // and comes up again as the land on top once it is clear of every buttress and bay
  const top = plateauAt(x, z);
  const low = open - 10 * smoothstep(8, 11, d);
  return clamp(low + (top - low) * smoothstep(CAP, CAP + 4, d), -60, 100);
}

/** How wet the ground is here: by the sea, along the river. 0 dry, 1 soaked. */
export function wetness(x: number, z: number): number {
  const shore = shoreAt(x);
  const sea = smoothstep(shore - 14, shore - 1, z);
  const river = Math.exp(-Math.pow(riverDistance(x, z) / 3.5, 2));
  const spray = Math.exp(-Math.pow(poolDistance(x, z) / 2.6, 2));
  return clamp(Math.max(sea, river, spray), 0, 1);
}

/** How much grass and moss grows here: on the scree under the cliffs and on the land above. */
export function greenness(x: number, z: number): number {
  const d = rockDistance(x, z);
  const scree = smoothstep(-14, -4, d) * (1 - smoothstep(-1, 1, d));
  const high = smoothstep(2, 6, d);
  const canyon = z < BAY.canyon.mouthZ - 3 ? 0.9 : 0;
  // the spray off the falls keeps everything near them green
  const lush = Math.exp(-Math.pow(poolDistance(x, z) / 3.5, 2)) * smoothstep(-1, -6, d);
  const patchy = smoothstep(0.25, 0.6, fbm(x * 0.05 + 9, z * 0.05, 3) * 0.5 + 0.5);
  return clamp(Math.max(scree * patchy, high, canyon * (0.6 + 0.4 * patchy), lush) * (1 - wetness(x, z) * 0.5), 0, 1);
}
