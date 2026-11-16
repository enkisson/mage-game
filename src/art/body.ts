// Bodies sculpted in code. A figure is described as a set of soft rounded shapes hung on a
// skeleton; this turns that description into one smooth skinned surface, the way clay over
// an armature becomes a figure. No model files are needed, and every proportion is a number.
import * as THREE from 'three';

type V3 = [number, number, number];

/** A rounded shape: a capsule from a to b whose radius runs from ra to rb, squashed by `flat`. */
export interface Lump {
  a: V3;
  b: V3;
  ra: number;
  rb: number;
  /** Scale across, up and through, to flatten a chest or broaden a foot. */
  flat?: V3;
  /** How softly it melts into its neighbours (metres). */
  blend?: number;
  /** What it is made of: 0 flesh, 1 shirt, 2 coat, 3 breeches. */
  wear: number;
  /** Carve this shape out instead of adding it (eye sockets, a slack mouth). */
  cut?: boolean;
}

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Where the joint is, in the figure's own space. */
  at: V3;
  /** Where the bone ends, if it has no child to say so. */
  tip?: V3;
}

export interface Figure {
  bones: BoneDef[];
  lumps: Lump[];
  /** The box to sculpt inside, and how fine. */
  min: V3;
  max: V3;
  cell: number;
}

function lumpDistance(l: Lump, x: number, y: number, z: number): number {
  const f = l.flat ?? [1, 1, 1];
  // measure in the lump's squashed space, about its own midpoint
  const mx = (l.a[0] + l.b[0]) / 2, my = (l.a[1] + l.b[1]) / 2, mz = (l.a[2] + l.b[2]) / 2;
  const px = (x - mx) / f[0], py = (y - my) / f[1], pz = (z - mz) / f[2];
  const ax = (l.a[0] - mx) / f[0], ay = (l.a[1] - my) / f[1], az = (l.a[2] - mz) / f[2];
  const bx = (l.b[0] - mx) / f[0], by = (l.b[1] - my) / f[1], bz = (l.b[2] - mz) / f[2];
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2)) : 0;
  const qx = px - ax - dx * t, qy = py - ay - dy * t, qz = pz - az - dz * t;
  return (Math.sqrt(qx * qx + qy * qy + qz * qz) - (l.ra + (l.rb - l.ra) * t)) * Math.min(f[0], f[1], f[2]);
}

/** Distance to the whole figure, and what it is wearing at that point. */
function figureDistance(lumps: Lump[], x: number, y: number, z: number): [number, number] {
  let d = 1e9, wear = 0, best = 1e9;
  for (const l of lumps) {
    if (l.cut) continue;
    const dl = lumpDistance(l, x, y, z);
    if (dl < best) { best = dl; wear = l.wear; }
    const k = l.blend ?? 0.035;
    const h = Math.max(k - Math.abs(d - dl), 0) / k;
    d = Math.min(d, dl) - h * h * k * 0.25;
  }
  for (const l of lumps) {
    if (!l.cut) continue;
    const dl = -lumpDistance(l, x, y, z);
    const k = l.blend ?? 0.012;
    const h = Math.max(k - Math.abs(d - dl), 0) / k;
    d = Math.max(d, dl) + h * h * k * 0.25;
  }
  return [d, wear];
}

export interface Sculpted {
  geometry: THREE.BufferGeometry;
  /** A fresh skeleton for this geometry. Call once per figure that is to move. */
  rig(): { root: THREE.Bone; bones: Record<string, THREE.Bone>; skeleton: THREE.Skeleton };
}

/** Turn a figure into a skinned surface. */
export function sculpt(fig: Figure): Sculpted {
  const { min, max, cell, lumps } = fig;
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const val = new Float32Array(nx * ny * nz);
  const at = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    val[at(x, y, z)] = figureDistance(lumps, min[0] + x * cell, min[1] + y * cell, min[2] + z * cell)[0];
  }

  // Surface nets: one point in every cell the surface passes through, joined across each
  // edge of the grid that it crosses.
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      cv[c] = val[at(x + corner[c][0], y + corner[c][1], z + corner[c][2])];
      if (cv[c] < 0) inside++;
    }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
      sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
      sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
      n++;
    }
    vid[at(x, y, z)] = pos.length / 3;
    pos.push(min[0] + (x + sx / n) * cell, min[1] + (y + sy / n) * cell, min[2] + (z + sz / n) * cell);
  }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const v0 = val[at(x, y, z)] < 0;
    if (v0 !== (val[at(x + 1, y, z)] < 0)) quad(vid[at(x, y - 1, z - 1)], vid[at(x, y, z - 1)], vid[at(x, y, z)], vid[at(x, y - 1, z)], !v0);
    if (v0 !== (val[at(x, y + 1, z)] < 0)) quad(vid[at(x - 1, y, z - 1)], vid[at(x - 1, y, z)], vid[at(x, y, z)], vid[at(x, y, z - 1)], !v0);
    if (v0 !== (val[at(x, y, z + 1)] < 0)) quad(vid[at(x - 1, y - 1, z)], vid[at(x, y - 1, z)], vid[at(x, y, z)], vid[at(x - 1, y, z)], !v0);
  }

  // Normals from the shape itself, so the surface is smooth however coarse the grid.
  const count = pos.length / 3;
  const nor = new Float32Array(count * 3), wear = new Float32Array(count);
  const e = cell * 0.5;
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const [, w] = figureDistance(lumps, x, y, z);
    const gx = figureDistance(lumps, x + e, y, z)[0] - figureDistance(lumps, x - e, y, z)[0];
    const gy = figureDistance(lumps, x, y + e, z)[0] - figureDistance(lumps, x, y - e, z)[0];
    const gz = figureDistance(lumps, x, y, z + e)[0] - figureDistance(lumps, x, y, z - e)[0];
    const len = Math.hypot(gx, gy, gz) || 1;
    nor[i * 3] = gx / len; nor[i * 3 + 1] = gy / len; nor[i * 3 + 2] = gz / len;
    wear[i] = w;
  }
  // make sure every face looks outward
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * nor[a * 3] + fy * nor[a * 3 + 1] + fz * nor[a * 3 + 2] < 0) { index[t + 1] = c; index[t + 2] = b; }
  }

  // Skin: each point follows the bones it lies nearest.
  const bones = fig.bones;
  const ends = bones.map((b) => {
    const kids = bones.filter((k) => k.parent === b.name);
    if (b.tip) return b.tip;
    if (kids.length === 1) return kids[0].at;
    return b.at;
  });
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  const dist = new Float32Array(bones.length);
  const order = bones.map((_, i) => i);
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    for (let b = 0; b < bones.length; b++) {
      const a = bones[b].at, c = ends[b];
      const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
      const len2 = dx * dx + dy * dy + dz * dz;
      const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / len2)) : 0;
      dist[b] = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t);
    }
    order.sort((p, q) => dist[p] - dist[q]);
    let sum = 0;
    const nearest = dist[order[0]];
    for (let k = 0; k < 3; k++) {
      const w = Math.exp(-(((dist[order[k]] - nearest) / 0.035) ** 2));
      skinIndex[i * 4 + k] = order[k];
      skinWeight[i * 4 + k] = w;
      sum += w;
    }
    for (let k = 0; k < 3; k++) skinWeight[i * 4 + k] /= sum;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('rest', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('wear', new THREE.BufferAttribute(wear, 1));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  return {
    geometry,
    rig() {
      const made: Record<string, THREE.Bone> = {};
      const list: THREE.Bone[] = [];
      let root: THREE.Bone | null = null;
      for (const b of bones) {
        const bone = new THREE.Bone();
        bone.name = b.name;
        const parent = b.parent ? bones.find((p) => p.name === b.parent)! : null;
        bone.position.set(b.at[0] - (parent ? parent.at[0] : 0), b.at[1] - (parent ? parent.at[1] : 0), b.at[2] - (parent ? parent.at[2] : 0));
        if (parent) made[parent.name].add(bone); else root = bone;
        made[b.name] = bone;
        list.push(bone);
      }
      root!.updateMatrixWorld(true);
      return { root: root!, bones: made, skeleton: new THREE.Skeleton(list) };
    },
  };
}
