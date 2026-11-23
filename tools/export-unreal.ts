// Exports the Wreck Shore for the Unreal version of the game: the ground as a heightmap for a
// Landscape, the solid pieces (column cliffs, sea stacks and rocks, road, ruins, gameplay rocks)
// as .glb models, and everything that is placed rather than modelled as one JSON file.
//
// Coordinates. The web game is metres, y up, the sea toward +z. Unreal is centimetres, z up.
// Positions in placement.json are given in Unreal's frame: X = x, Y = z, Z = y, times 100.
// The .glb files keep glTF's own convention (metres, y up) with the web game's coordinates, so
// the importer's conversion decides their frame; the import script checks it against a marker.
//
// Usage: node tools/export-unreal.cjs <outDir>   (built from this file by esbuild)
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BAY, FALLS, OUTLINE, RIVERS, groundHeight, plateauAt, shoreAt } from '../src/world/coast/layout';
import { columnField } from '../src/world/coast/columnfield';
import { ROAD, roadDeck, roadParapet } from '../src/world/coast/road';
import { columns, seaStack } from '../src/world/coast/cliffs';
import { buildSeaRocks } from '../src/world/coast/searocks';
import { buildRuins } from '../src/world/coast/ruins';

const out = process.argv[2] ?? 'export/unreal';
fs.mkdirSync(out, { recursive: true });

// ---- .glb writer: positions, normals, indices; one node per named mesh --------------------------

function writeGlb(file: string, parts: { name: string; geo: THREE.BufferGeometry }[]) {
  const chunks: Buffer[] = [];
  let offset = 0;
  const bufferViews: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: number[] = [], nodeList: object[] = [];
  const pushView = (data: Buffer, target: number) => {
    const pad = (4 - (data.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target });
    chunks.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
    return bufferViews.length - 1;
  };
  for (const { name, geo: g0 } of parts) {
    // share corners between triangles wherever position and normal agree: a third of the size
    let geo = g0.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo = mergeVertices(geo, 1e-4);
    const pos = geo.attributes.position.array as Float32Array;
    const nor = geo.attributes.normal.array as Float32Array;
    const count = geo.attributes.position.count;
    let index: Uint32Array;
    if (geo.index) index = Uint32Array.from(geo.index.array as ArrayLike<number>);
    else { index = new Uint32Array(count); for (let i = 0; i < count; i++) index[i] = i; }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    const pv = pushView(Buffer.from(new Float32Array(pos).buffer), 34962);
    const nv = pushView(Buffer.from(new Float32Array(nor).buffer), 34962);
    const iv = pushView(Buffer.from(index.buffer), 34963);
    accessors.push({ bufferView: pv, componentType: 5126, count, type: 'VEC3', min, max });
    accessors.push({ bufferView: nv, componentType: 5126, count, type: 'VEC3' });
    accessors.push({ bufferView: iv, componentType: 5125, count: index.length, type: 'SCALAR' });
    const a = accessors.length - 3;
    meshes.push({ name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: 0 }] });
    nodeList.push({ name, mesh: meshes.length - 1 });
    nodes.push(nodeList.length - 1);
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'gloamtide export-unreal' },
    scene: 0, scenes: [{ nodes }], nodes: nodeList, meshes,
    materials: [{ name: 'Basalt', pbrMetallicRoughness: { baseColorFactor: [0.1, 0.1, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    accessors, bufferViews, buffers: [{ byteLength: bin.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(path.join(out, file), Buffer.concat([header, jh, jsonBuf, bh, bin]));
  const tris = parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  console.log(file, parts.length, 'meshes', Math.round(tris / 1000) + 'k triangles');
}

/** Everything under a group, baked into world space, merged into one geometry per material name. */
function bakeGroup(group: THREE.Object3D): THREE.BufferGeometry[] {
  group.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.Sprite).isSprite) return;
    let g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(m.matrixWorld);
    g.computeVertexNormals();
    geos.push(g);
  });
  return geos;
}

// ---- the ground: a 16-bit heightmap for an Unreal Landscape -------------------------------------

function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function png16(file: string, w: number, h: number, data: Uint16Array) {
  const raw = Buffer.alloc((w * 2 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 2 + 1)] = 0; for (let x = 0; x < w; x++) raw.writeUInt16BE(data[y * w + x], y * (w * 2 + 1) + 1 + x * 2); }
  const chunk = (type: string, body: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb)); return Buffer.concat([len, tb, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path.join(out, file), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// a square 540 m on a side from (-320, -180): the bay, its cliffs, the road, and sea to the stacks
const LAND = { x0: -320, z0: -180, size: 540, n: 1009 };
{
  const { x0, z0, size, n } = LAND, step = size / (n - 1);
  const data = new Uint16Array(n * n);
  let lo = Infinity, hi = -Infinity;
  // Unreal reads a 16-bit landscape as (value - 32768) / 128 * Z scale (cm): with a Z scale of 100,
  // one unit is 1/128 m and the range is +-256 m
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = groundHeight(x0 + i * step, z0 + j * step);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    data[j * n + i] = Math.max(0, Math.min(65535, Math.round(32768 + h * 128)));
  }
  png16('landscape_height.png', n, n, data);
  console.log('landscape_height.png', n + 'x' + n, 'spacing', step.toFixed(4), 'm, heights', lo.toFixed(1), 'to', hi.toFixed(1));
}

// ---- solids -----------------------------------------------------------------------------------------

// the ground as a model too, every 0.75 m over the same square, for Nanite (the heightmap above is
// for a Landscape, if one is wanted later)
{
  const { x0, z0, size } = LAND, n = Math.round(size / 0.75) + 1, step = size / (n - 1);
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = (j * n + i) * 3;
    pos[k] = x; pos[k + 1] = groundHeight(x, z); pos[k + 2] = z;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  writeGlb('terrain.glb', [{ name: 'Terrain', geo: g }]);
}

writeGlb('cliffs.glb', [{ name: 'ColumnCliffs', geo: columnField() }]);
writeGlb('stacks.glb', [{ name: 'SeaStacksNear', geo: mergeGeometries(BAY.stacks.map((s, i) => seaStack(s.x, s.z, s.h, s.r, i + 1)))! }]);
{
  const dummy = new THREE.MeshStandardMaterial();
  const geos = bakeGroup(buildSeaRocks({ basalt: dummy, columnar: dummy }));
  writeGlb('searocks.glb', [{ name: 'SeaRocks', geo: mergeGeometries(geos)! }]);
}
writeGlb('road.glb', [{ name: 'RoadDeck', geo: roadDeck() }, { name: 'RoadParapet', geo: roadParapet() }]);
{
  const tex = { diff: new THREE.Texture(), nor: new THREE.Texture(), arm: new THREE.Texture() };
  const ruins = buildRuins({ rock: tex as never });
  const geos = bakeGroup(ruins.group);
  writeGlb('ruins.glb', [{ name: 'Ruins', geo: mergeGeometries(geos)! }]);
}
// the outcrop and ledge in the stand (wreckshore.ts)
{
  const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const O = { x: 108, z: -15, r: 6.4, h: 5 }, L = { x: 136, z: 3, r: 2.7, h: 2.2 };
  const outcrop = columns(O.x, O.z, O.r, (x, z) => {
    const dx = x - O.x, dz = z - O.z, r = Math.hypot(dx, dz);
    if (r < 3.4) return O.h + (hash(Math.round(x * 3), Math.round(z * 3)) - 0.5) * 0.12;
    const t = ((Math.atan2(dz, dx) + Math.PI * 0.35) / (Math.PI * 2) + 1) % 1;
    return 0.45 + t * (O.h - 0.55);
  }, 7, 1.15, true);
  const ledge = columns(L.x, L.z, L.r, () => L.h, 8, 1.1, true);
  writeGlb('standrocks.glb', [{ name: 'Outcrop', geo: outcrop }, { name: 'Ledge', geo: ledge }]);
}
// a marker: a 1 m cube at web (10, 5, 20), so the import can check which way the .glb frame lands
writeGlb('marker.glb', [{ name: 'Marker', geo: new THREE.BoxGeometry(1, 1, 1).translate(10, 5, 20) }]);

// ---- placement ----------------------------------------------------------------------------------------

const ue = (x: number, y: number, z: number) => [+(x * 100).toFixed(1), +(z * 100).toFixed(1), +(y * 100).toFixed(1)];
const sunAz = THREE.MathUtils.degToRad(255), sunEl = THREE.MathUtils.degToRad(14);
const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl));
const s = BAY.ship;
const placement = {
  note: 'Unreal frame: X = web x, Y = web z, Z = web y, centimetres. Yaw in degrees about Unreal Z.',
  landscape: { file: 'landscape_height.png', origin: ue(LAND.x0, 0, LAND.z0), sizeM: LAND.size, samples: LAND.n, spacingCm: +(LAND.size / (LAND.n - 1) * 100).toFixed(4), zScale: 100 },
  waterLevel: 0,
  sun: { towardSun: ue(sunDir.x, sunDir.y, sunDir.z).map((v) => v / 100), azimuthDeg: 255, elevationDeg: 14 },
  ship: { model: 'dutch_ship_large_01', at: ue(s.x, groundHeight(s.x, s.z) - s.sink, s.z), webRotation: { order: 'YXZ', x: s.pitch, y: s.yaw, z: s.heel } },
  spawn: { at: ue(6.4, groundHeight(6.4, 4.4) + 0.05, 4.4), webYaw: 1.62 },
  falls: FALLS.map((f) => ({ name: f.name, lip: ue(f.x, plateauAt(f.x - f.nx * 3, f.z - f.nz * 3), f.z), towardOpen: ue(f.nx, 0, f.nz).map((v) => v / 100), widthM: f.width, pool: ue(f.pool[0], groundHeight(f.pool[0], f.pool[1]), f.pool[1]) })),
  rivers: RIVERS.map((r) => r.map(([x, z]) => ue(x, groundHeight(x, z), z))),
  stacks: BAY.stacks.map((t) => ({ at: ue(t.x, 0, t.z), heightM: t.h, radiusM: t.r })),
  road: { path: ROAD.path.filter((_, i) => i % 3 === 0).map((p) => ue(p.x, p.y, p.z)), start: ue(ROAD.start.x, ROAD.start.y, ROAD.start.z), top: ue(ROAD.end.x, ROAD.end.y, ROAD.end.z) },
  stand: { center: ue(122, groundHeight(122, -6), -6), radiusM: 20 },
  journals: {
    book: ue(3.2, groundHeight(3.2, 2.6) + 0.5, 2.6),
    mast: ue(-14, groundHeight(-14, 2.4) + 1.25, 2.4),
    ring: ue(48.6, groundHeight(48.6, -35.1) + 0.25, -35.1),
    outcrop: ue(108, groundHeight(108, -15) + 5.3, -15),
  },
  shore: Array.from({ length: 41 }, (_, i) => { const x = -100 + i * 7.5; return ue(x, 0, shoreAt(x)); }),
  cliffFoot: OUTLINE.filter((_, i) => i % 4 === 0).map(([x, z]) => ue(x, 0, z)),
  marker: { webCentre: [10, 5, 20], ueExpected: ue(10, 5, 20) },
};
fs.writeFileSync(path.join(out, 'placement.json'), JSON.stringify(placement, null, 1));
console.log('placement.json written');

// ---- dressing: where the scanned rock goes --------------------------------------------------------
// Cladding: every ~14 m along the cliff foot, a slab of scanned cliff facing the open ground, as tall
// as the wall there. Skipped at the falls (their slots stay open), the road, and the canyon's arch.
{
  const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const seg = [0];
  for (let i = 1; i < OUTLINE.length; i++) seg.push(seg[i - 1] + Math.hypot(OUTLINE[i][0] - OUTLINE[i - 1][0], OUTLINE[i][1] - OUTLINE[i - 1][1]));
  const at = (s: number) => {
    let i = 0; while (i < seg.length - 2 && seg[i + 1] <= s) i++;
    const a = OUTLINE[i], b = OUTLINE[i + 1], l = seg[i + 1] - seg[i] || 1, t = (s - seg[i]) / l;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx: -(b[1] - a[1]) / l, nz: (b[0] - a[0]) / l };
  };
  const nearFall = (x: number, z: number) => FALLS.some((f) => Math.hypot(x - f.x, z - f.z) < f.width * 0.7 + 4);
  const nearRoad = (x: number, z: number) => ROAD.path.some((p) => Math.hypot(x - p.x, z - p.z) < 9);
  const inArch = (x: number, z: number) => Math.abs(x - BAY.arch.x) < BAY.canyon.width / 2 + 2 && Math.abs(z - BAY.arch.z) < 10;
  const clad: object[] = [], foot: object[] = [], tops: object[] = [], drift: object[] = [];
  let k = 0;
  for (let s = 0; s < seg[seg.length - 1]; s += 7 + hash(k, 1) * 3, k++) {
    const p = at(s), smooth = [at(s - 6), at(s + 6)];
    const nx = (smooth[0].nx + smooth[1].nx + p.nx), nz = (smooth[0].nz + smooth[1].nz + p.nz), nl = Math.hypot(nx, nz);
    const ox = nx / nl, oz = nz / nl;
    const g = groundHeight(p.x + ox * 4, p.z + oz * 4), top = plateauAt(p.x - ox * 8, p.z - oz * 8);
    if (nearFall(p.x, p.z) || nearRoad(p.x, p.z) || inArch(p.x, p.z) || top - g < 6) continue;
    const yaw = Math.atan2(oz, ox) * 180 / Math.PI;   // Unreal yaw of the outward direction (X = web x, Y = web z)
    // a slab sits a little proud of the column wall, its foot buried in the scree
    clad.push({ at: ue(p.x + ox * 1.5, g - 3, p.z + oz * 1.5), yaw, heightM: top - g + 5, widthM: 16 + hash(k, 2) * 8, pick: Math.floor(hash(k, 3) * 5), flip: hash(k, 4) < 0.5 });
    // rubble at its foot, and a ledge or two
    for (let r = 0; r < 3; r++) {
      const a = (hash(k, 10 + r) - 0.5) * 12, out = 2 + hash(k, 20 + r) * 7;
      const x = p.x + ox * out - oz * a, z = p.z + oz * out + ox * a;
      if (nearRoad(x, z) || nearFall(x, z) || groundHeight(x, z) < 0.3) continue;
      foot.push({ at: ue(x, groundHeight(x, z) - 0.3, z), yaw: hash(k, 30 + r) * 360, scale: 0.8 + hash(k, 40 + r) * 1.6, pick: Math.floor(hash(k, 50 + r) * 6) });
    }
    // moss on the rim
    const tx = p.x - ox * (4 + hash(k, 60) * 10), tz = p.z - oz * (4 + hash(k, 61) * 10);
    tops.push({ at: ue(tx, plateauAt(tx, tz) - 0.1, tz), yaw: hash(k, 62) * 360, scale: 1 + hash(k, 63) * 2, pick: Math.floor(hash(k, 64) * 14) });
  }
  // driftwood and logs along the tideline
  for (let i = 0; i < 40; i++) {
    const x = -90 + hash(i, 70) * 260, z = shoreAt(x) - 6 - hash(i, 71) * 8;
    if (groundHeight(x, z) < 0.2) continue;
    drift.push({ at: ue(x, groundHeight(x, z) - 0.05, z), yaw: hash(i, 72) * 360, scale: 0.8 + hash(i, 73) * 0.8, pick: Math.floor(hash(i, 74) * 5) });
  }
  fs.writeFileSync(path.join(out, 'dressing.json'), JSON.stringify({ clad, foot, tops, drift }, null, 0));
  console.log('dressing.json', clad.length, 'cliff slabs,', foot.length, 'foot rocks,', tops.length, 'moss,', drift.length, 'driftwood');
}

// ---- talus: the bank of black sand and scree piled against the cliff foot -------------------------
// A strip along the foot: from 16 m out on the beach (flush with the ground) up the rock to 3 m in,
// 4-7 m above the beach, a little lumpy. Lower where a stream or a fall's pool runs out.
{
  const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const seg = [0];
  for (let i = 1; i < OUTLINE.length; i++) seg.push(seg[i - 1] + Math.hypot(OUTLINE[i][0] - OUTLINE[i - 1][0], OUTLINE[i][1] - OUTLINE[i - 1][1]));
  const at = (s: number) => {
    let i = 0; while (i < seg.length - 2 && seg[i + 1] <= s) i++;
    const a = OUTLINE[i], b = OUTLINE[i + 1], l = seg[i + 1] - seg[i] || 1, t = (s - seg[i]) / l;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
  };
  const water = (x: number, z: number) => {
    let d = 1e9;
    for (const r of RIVERS) for (const [rx, rz] of r) d = Math.min(d, Math.hypot(x - rx, z - rz));
    for (const f of FALLS) d = Math.min(d, Math.hypot(x - f.pool[0], z - f.pool[1]) - f.width * 0.6);
    return d;
  };
  const near = (x: number, z: number) => ROAD.path.some((p) => Math.hypot(x - p.x, z - p.z) < 6);
  const ACROSS = [-16, -12, -9, -6.5, -4.5, -3, -1.5, 0, 1.5, 3];
  const step = 1.5, L = seg[seg.length - 1], rows = Math.floor(L / step) + 1;
  const pos: number[] = [], idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    const s = r * step, p = at(s), a = at(Math.max(0, s - 4)), b = at(Math.min(L, s + 4));
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const ox = -tz, oz = tx; // out to the open ground
    const g0 = groundHeight(p.x + ox * 5, p.z + oz * 5);
    const wet = Math.min(1, Math.max(0, (water(p.x, p.z) - 3) / 10));
    const peak = (4 + hash(Math.floor(s / 9), 1) * 3 + Math.sin(s * 0.21) * 0.8) * (0.25 + 0.75 * wet);
    for (const d of ACROSS) {
      const x = p.x - ox * d, z = p.z - oz * d;
      const base = groundHeight(x, z) > g0 + 3 ? g0 : groundHeight(x, z); // under the rock, use the beach
      const t = Math.min(1, Math.max(0, (d + 16) / 19));                     // 0 out on the beach, 1 at the rock
      let h = base + peak * Math.pow(t, 1.7) - 0.15 + (hash(Math.round(x * 2), Math.round(z * 2)) - 0.5) * 0.25 * t;
      if (near(x, z)) h = Math.min(h, base - 0.3);
      pos.push(x, h, z);
    }
  }
  const n = ACROSS.length;
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < n - 1; k++) {
    const a = r * n + k, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // wound so the top faces up: flip if the first triangle faces down
  const nrm = g.attributes.normal;
  let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  writeGlb('talus.glb', [{ name: 'Talus', geo: g }]);
}
