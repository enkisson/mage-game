// Night I: the Wreck Shore.
// A beach under a bluff with your ship aground on it, a ravine, and a cove with a ledge and
// an outcrop where the first stand is fought.
//
// Axes: +x east, +z south (out to sea), -z inland. Sea level is y = 0.
import * as THREE from 'three';
import { clamp, smoothstep, fbm, rng, distToSegment } from '../core/math';
import { mergeForCollision } from './world';
import type { Level, JournalDef, StandDef } from './level';
import { MATERIALS, waterRipples, seaUniforms, seat, seatInGround } from '../art/materials';
import { centred, type Models } from '../art/models';
import { HandRig, SHAPES, shapeToArray } from '../player/hands';
import { makeCorpse } from '../art/creatures';

export const COVE = { x: 0, z: -70, r: 26 };
const BOUNDS = { minX: -62, maxX: 62, minZ: -112, maxZ: 62 };
const MESA = { x: 13, z: -82, r: 5.6, h: 5.0 };
const MESA_RAMP = { ax: -1.5, az: -91, bx: 9.5, bz: -86.5 };

/** Where the ravine runs as it winds inland. */
export function pathX(z: number) {
  return 7 * Math.sin((z + 22) * 0.065);
}

/** The wind off the sea. Sand banks up on the sheltered side of whatever stands in it. */
const WIND = { x: 0.5, z: -0.866 };

/** Sand heaped round something standing on the beach, with a longer tail downwind. */
interface Mound { x: number; z: number; r: number; h: number }
/** Sand banked along the length of a hull lying on the beach. */
interface Berm { ax: number; az: number; bx: number; bz: number; halfWidth: number; left: number; right: number; reachLeft: number; reachRight: number }

const mounds: Mound[] = [];
const berms: Berm[] = [];

function moundShape(m: Mound, x: number, z: number): number {
  const dx = x - m.x, dz = z - m.z;
  if (Math.abs(dx) > m.r * 3.2 || Math.abs(dz) > m.r * 3.2) return 0;
  const along = dx * WIND.x + dz * WIND.z, across = dx * -WIND.z + dz * WIND.x;
  const d = Math.hypot(along * (along > 0 ? 0.55 : 1.2), across) / m.r;
  return Math.exp(-d * d * 0.9);
}

/** How strongly the hull's sandbank is felt here (0–1), and which side of the hull this is. */
function bermShape(b: Berm, x: number, z: number): [number, number] {
  const dx = b.bx - b.ax, dz = b.bz - b.az;
  const len2 = dx * dx + dz * dz;
  const t = clamp(((x - b.ax) * dx + (z - b.az) * dz) / len2, 0, 1);
  const px = b.ax + dx * t, pz = b.az + dz * t;
  const d = Math.hypot(x - px, z - pz);
  const side = (x - b.ax) * dz - (z - b.az) * dx > 0 ? 1 : -1; // +1 = left of a→b
  // a hull is widest amidships and tapers to bow and stern
  const width = b.halfWidth * (1 - 0.72 * Math.pow(Math.abs(t * 2 - 1), 2.4));
  const out = d - width;
  const reach = side > 0 ? b.reachLeft : b.reachRight;
  // banked highest against the planking, falling away outside; under the hull it drops off quickly
  const shape = out > 0 ? Math.exp(-out / reach) : Math.max(0, 1 + out / 1.1);
  return [shape, side];
}

/** How much higher the sand lies here because of what is standing on the beach. */
function driftHeight(x: number, z: number): number {
  let h = 0;
  for (const m of mounds) h += m.h * moundShape(m, x, z);
  for (const b of berms) {
    const [shape, side] = bermShape(b, x, z);
    if (shape > 0.002) {
      const wave = 0.78 + 0.34 * fbm(x * 0.21 + 7, z * 0.21, 2);
      h += shape * (side > 0 ? b.left : b.right) * wave;
    }
  }
  return h;
}

/** How closely something presses on the sand here (0–1): damp, shaded ground at its foot. */
function contact(x: number, z: number): number {
  let c = 0;
  for (const m of mounds) {
    const dx = x - m.x, dz = z - m.z;
    c = Math.max(c, Math.exp(-(dx * dx + dz * dz) / (m.r * m.r * 0.55)) * 0.9);
  }
  for (const b of berms) c = Math.max(c, Math.pow(bermShape(b, x, z)[0], 1.6) * 0.85);
  return Math.min(1, c);
}

/** Ground height of the shore, with the sand drifted round whatever stands on it. */
export function shoreHeight(x: number, z: number): number {
  return bedHeight(x, z) + driftHeight(x, z);
}

/** Ground height of the bare shore, before anything is set down on it. */
function bedHeight(x: number, z: number): number {
  // beach: rises gently inland, falls away under the sea
  let h = clamp((30 - z) * 0.06, -7, 3.0);
  if (z > 30) h -= (z - 30) * 0.06;
  h += fbm(x * 0.06, z * 0.06, 3) * 0.45 * smoothstep(34, 18, z) * smoothstep(-24, -16, z);

  // headlands closing the beach to east and west
  const side = smoothstep(40, 50, Math.abs(x)) * smoothstep(56, 34, z);
  h += side * (9 + fbm(x * 0.05 + 3, z * 0.05, 3) * 4);

  // the bluff, cut by the ravine and opened by the cove
  const inland = smoothstep(-19, -27, z);
  const ravine = 1 - smoothstep(3.2, 7.5, Math.abs(x - pathX(z)));
  const dCove = Math.hypot(x - COVE.x, z - COVE.z);
  const bowl = 1 - smoothstep(COVE.r - 3.5, COVE.r + 1.5, dCove);
  const open = Math.max(ravine, bowl);
  const bluff = 9.5 + fbm(x * 0.045 + 10, z * 0.045 - 4, 4) * 5;
  const floorRise = clamp((-22 - z) * 0.035, 0, 2.6);
  h += inland * (1 - side) * ((1 - open) * bluff + floorRise);

  // inside the cove: a western ledge reached by a ramp at its south end…
  const ring = smoothstep(11.6, 12.8, dCove) * bowl;
  const west = smoothstep(-3, -6, x - COVE.x);
  const ledgeRamp = smoothstep(COVE.z + 15, COVE.z + 5, z);
  const ledge = ring * west * 2.6 * ledgeRamp;

  // …and an outcrop in the north-east with a steep ramp along the north wall
  const dMesa = Math.hypot(x - MESA.x, z - MESA.z);
  const mesa = (1 - smoothstep(MESA.r - 0.6, MESA.r + 0.6, dMesa)) * MESA.h;
  const [dRamp, t] = distToSegment(x, z, MESA_RAMP.ax, MESA_RAMP.az, MESA_RAMP.bx, MESA_RAMP.bz);
  const ramp = (1 - smoothstep(2.0, 3.0, dRamp)) * MESA.h * t;

  h += bowl * inland * Math.max(ledge, mesa, ramp);
  return h;
}

function terrain(cell: number): THREE.Mesh {
  const nx = Math.round((BOUNDS.maxX - BOUNDS.minX) / cell);
  const nz = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / cell);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = BOUNDS.minX + i * cell, z = BOUNDS.minZ + j * cell;
      const k = j * (nx + 1) + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = shoreHeight(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / 6;
      uv[k * 2 + 1] = z / 6;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // blend weights for the ground material: x = rock (steep or high), y = wet (near the tide line),
  // z = pressed on by something (damp and shaded)
  const normal = geo.attributes.normal;
  const blend = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let k = 0; k < (nx + 1) * (nz + 1); k++) {
    const y = pos[k * 3 + 1], z = pos[k * 3 + 2], x = pos[k * 3];
    const steep = smoothstep(0.86, 0.62, normal.getY(k));
    const inland = smoothstep(-20, -26, z) * 0.75;
    const patch = smoothstep(0.1, 0.5, fbm(x * 0.09 + 20, z * 0.09, 3)) * 0.5 * inland;
    blend[k * 3] = clamp(Math.max(steep, inland * 0.55 + patch), 0, 1);
    blend[k * 3 + 1] = smoothstep(1.1, -0.2, y);
    blend[k * 3 + 2] = contact(x, z);
  }
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 3));

  const mesh = new THREE.Mesh(geo, MATERIALS.ground);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** A weathered boulder: a sphere pushed around by noise. */
function rock(seed: number, radius: number, stretch: [number, number, number] = [1, 0.8, 1]): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 0.9 / radius * 2 + seed * 7.1, v.y * 0.9 / radius * 2 + v.z * 1.3 / radius * 2 - seed * 3.7, 3);
    const big = fbm(v.x / radius + seed, v.z / radius - seed, 2);
    v.multiplyScalar(1 + n * 0.16 + big * 0.2);
    p.setXYZ(i, v.x * stretch[0], v.y * stretch[1], v.z * stretch[2]);
  }
  geo.computeVertexNormals();
  // all rock, no sand; `place` marks the wet part once it knows where the boulder sits
  const blend = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) blend[i * 3] = 1;
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 3));
  const mesh = new THREE.Mesh(geo, MATERIALS.ground);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w: number, h: number, d: number, material: THREE.Material, at: [number, number, number], rot: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  // scale texture coordinates with size so planks do not stretch
  const uv = geo.attributes.uv;
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sizes[f][0] / 2.5, uv.getY(i) * sizes[f][1] / 2.5);
    }
  }
  const m = new THREE.Mesh(geo, material);
  m.position.set(...at);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The stern half of the ship: a tilted deck with a raised quarterdeck, reached by a fallen plank ramp. */
function sternWreck(): { group: THREE.Group; journalSpot: THREE.Vector3 } {
  const g = new THREE.Group();
  const wood = MATERIALS.wood, dark = MATERIALS.woodDark;
  g.add(box(13, 0.35, 6.2, wood, [0, 3.2, 0]));
  g.add(box(13, 3.6, 0.4, dark, [0, 1.6, 3.2], [0.12, 0, 0]));
  g.add(box(13, 3.6, 0.4, dark, [0, 1.6, -3.2], [-0.12, 0, 0]));
  g.add(box(0.45, 3.8, 6.4, dark, [-6.5, 1.7, 0]));
  // quarterdeck with a step up
  g.add(box(4.4, 1.25, 6.2, wood, [-4.3, 4.0, 0]));
  g.add(box(1.0, 0.62, 3.0, wood, [-1.6, 3.68, 0]));
  // rail stumps and the snapped mast
  for (const z of [-3.0, 3.0]) {
    for (let i = 0; i < 5; i++) g.add(box(0.18, 0.9, 0.18, dark, [-6 + i * 2.6, 3.8, z]));
    g.add(box(11, 0.14, 0.2, dark, [-0.8, 4.25, z]));
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 4.6, 10), dark);
  mast.position.set(2.2, 5.6, 0.2);
  mast.rotation.z = 0.08;
  mast.castShadow = true;
  g.add(mast);
  // ribs where the hull tore open
  for (let i = 0; i < 4; i++) {
    g.add(box(0.3, 3.4 - i * 0.5, 0.3, dark, [6.8 + i * 0.2, 1.5 - i * 0.2, -2.8 + i * 1.9], [0, 0, -0.15 - i * 0.05]));
  }
  // the plank ramp from the sand up to the deck
  const rise = 3.25, run = 8.2;
  g.add(box(Math.hypot(rise, run) + 0.4, 0.22, 2.4, wood, [6.5 + run / 2, rise / 2 - 0.02, 0.4], [0, 0, -Math.atan2(rise, run)]));
  g.add(box(Math.hypot(rise, run), 0.3, 0.3, dark, [6.5 + run / 2, rise / 2 - 0.3, -0.7], [0, 0, -Math.atan2(rise, run)]));
  g.add(box(Math.hypot(rise, run), 0.3, 0.3, dark, [6.5 + run / 2, rise / 2 - 0.3, 1.5], [0, 0, -Math.atan2(rise, run)]));
  return { group: g, journalSpot: new THREE.Vector3(-4.6, 4.75, 0.6) };
}

/** The bow half, rolled on its side: a slanted hull you can run up. */
function bowWreck(): THREE.Group {
  const g = new THREE.Group();
  const wood = MATERIALS.wood, dark = MATERIALS.woodDark;
  g.add(box(10, 0.4, 5.6, wood, [0, 1.9, 0], [0.62, 0, 0]));
  g.add(box(10, 0.4, 3.2, dark, [0, 3.2, -2.9], [-0.35, 0, 0]));
  for (let i = 0; i < 6; i++) g.add(box(0.28, 0.5, 5.4, dark, [-4.4 + i * 1.75, 2.15, 0], [0.62, 0, 0]));
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 7, 8), dark);
  sprit.position.set(7.4, 3.2, -1.4);
  sprit.rotation.z = -1.15;
  sprit.castShadow = true;
  g.add(sprit);
  return g;
}

/**
 * The robed body at the waterline: face down, one arm thrown forward, the journal under its
 * hand. Returns where the journal lies, in the body's own frame.
 */
function body(handModel: THREE.Object3D | null): { group: THREE.Group; journalAt: THREE.Vector3 } {
  const g = new THREE.Group();
  const robe = seatInGround(new THREE.MeshStandardMaterial({ color: 0x232a3d, roughness: 1 }), 0.07);
  /** A rounded mass of wet cloth, creased by noise so it does not look turned on a lathe. */
  const drape = (size: [number, number, number], at: [number, number, number], seed: number, rot: [number, number, number] = [0, 0, 0]) => {
    const geo = new THREE.SphereGeometry(1, 28, 18);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const fold = fbm(v.x * 3.1 + seed, v.z * 4.3 - seed, 3) * 0.16 + fbm(v.x * 9 + seed, v.z * 11, 2) * 0.05;
      v.multiplyScalar(1 + fold);
      if (v.y < 0) v.y *= 0.25; // flat where it lies on the sand
      pos.setXYZ(i, v.x * size[0], v.y * size[1], v.z * size[2]);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, robe);
    m.position.set(...at);
    m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // lying along -Z, head inland, face down: a sculpted body, with the wide sleeve of the
  // reaching arm laid over where it meets the hand
  const figure = makeCorpse();
  figure.position.set(0.02, 0, 1.0);
  g.add(figure);
  drape([0.11, 0.07, 0.2], [0.63, 0.02, -1.0], 5, [0, -0.5, 0]);

  const wrist = new THREE.Vector3(0.7, 0.05, -1.12);
  if (handModel) {
    const skin = new THREE.MeshStandardMaterial({ color: 0x8b9088, roughness: 0.6 });
    const rig = new HandRig(handModel, 'right', skin);
    const shape = new Float32Array(16);
    shapeToArray(SHAPES.relaxed, shape);
    rig.setShape(shape);
    // palm down on the sand, fingers pointing inland past the journal
    rig.root.position.copy(wrist);
    rig.root.rotation.order = 'YXZ';
    rig.root.rotation.set(-Math.PI / 2 + 0.1, -0.45, 0);
    rig.mesh.castShadow = true;
    g.add(rig.root);
  }
  g.traverse((o) => { o.userData.noCollide = true; });
  return { group: g, journalAt: new THREE.Vector3(wrist.x + 0.13, 0.035, wrist.z - 0.27) };
}

/** A soft additive glow that always faces the camera. */
function glowSprite(color: number, size: number, brightness: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(brightness), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  s.userData.noCollide = true;
  return s;
}

/** A dark pool the Gloam rise out of: black water with a sick light in it, lying in a hollow. */
function tidePool(radius: number): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(1,4,3,1)');
  grad.addColorStop(0.55, 'rgba(2,8,5,0.98)');
  grad.addColorStop(0.8, 'rgba(22,60,12,0.9)');
  grad.addColorStop(0.92, 'rgba(70,150,30,0.45)');
  grad.addColorStop(1, 'rgba(70,150,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.05, metalness: 0.2, emissive: 0x2a6a10, emissiveIntensity: 0.25, depthWrite: false,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = 1;
  g.add(pool);
  const light = new THREE.PointLight(0x8dff3a, 6, 9, 1.8);
  light.position.y = 0.9;
  g.add(light);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

/** A plank laid from one point to another. */
function plank(from: THREE.Vector3, to: THREE.Vector3, width: number, material: THREE.Material): THREE.Mesh {
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, dir);
  const m = box(len, 0.16, width, material, [0, 0, 0]);
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, side));
  return m;
}

const grassTime = { value: 0 };

/** A clump of marram grass painted onto a card: pale straw blades fanning from the root. */
function grassTexture(seed: number): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rnd = rng(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const lean = (rnd() - 0.5) * 1.5;
    const len = S * (0.45 + rnd() * 0.5);
    const x0 = S / 2 + (rnd() - 0.5) * S * 0.28;
    const x1 = x0 + lean * len * 0.55, y1 = S - len;
    const tone = rnd();
    const g = ctx.createLinearGradient(x0, S, x1, y1);
    g.addColorStop(0, `rgb(${40 + tone * 18}, ${42 + tone * 18}, ${26 + tone * 10})`);
    g.addColorStop(0.55, `rgb(${88 + tone * 30}, ${88 + tone * 26}, ${52 + tone * 16})`);
    g.addColorStop(1, `rgb(${128 + tone * 32}, ${122 + tone * 28}, ${82 + tone * 20})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.2 + rnd() * 2.6;
    ctx.beginPath();
    ctx.moveTo(x0, S);
    ctx.quadraticCurveTo(x0 + lean * len * 0.1, S - len * 0.6, x1, y1);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Three crossed cards rooted at the origin, lit as if they were part of the ground. */
function grassGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5;
    const o = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let n = 0; n < 4; n++) nor.push(0, 1, 0);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Grass that leans with the wind: the higher up the blade, the further it moves. */
function grassMaterial(seed: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: grassTexture(seed), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 swayAt = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float swayPhase = uTime * 1.6 + swayAt.x * 0.45 + swayAt.z * 0.6;
        float gust = sin(swayPhase) * 0.6 + sin(swayPhase * 2.3 + 1.3) * 0.25 + sin(uTime * 0.4 + swayAt.x * 0.05) * 0.5;
        float lift = position.y * position.y;
        transformed.x += gust * lift * 0.22;
        transformed.z += gust * lift * 0.13;`);
    // both faces of a blade catch the sky the same way
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n        normal = normalize(vNormal);');
  };
  return m;
}

export function buildShore(models: Models): Level {
  const root = new THREE.Group();
  const solid = new THREE.Group(); // everything you can stand on or bump into
  root.add(solid);
  const r = rng(11);
  const ground = (x: number, z: number) => shoreHeight(x, z);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });

  // The sand is shaped by what stands on it, so things are declared first and set down
  // afterwards: `later` holds the steps that need the finished ground.
  mounds.length = 0;
  berms.length = 0;
  const later: (() => void)[] = [];
  // the pools the Gloam rise from lie in hollows
  const POOLS: [number, number][] = [[-13, -51], [21, -66], [-15.5, -81]];
  for (const [x, z] of POOLS) mounds.push({ x, z, r: 2.7, h: -0.3 });
  // the body has lain long enough for the sand to gather against it
  mounds.push({ x: 4.3, z: 22.2, r: 1.5, h: 0.07 });

  /**
   * Set a scanned object on the ground, with a simple shape wrapped round it to bump into.
   * The sand drifts against it (`drift` scales how much) and creeps `reach` metres up it.
   */
  const prop = (src: THREE.Mesh, key: string, x: number, z: number, scale: number | [number, number, number], yaw: number,
    { sink = 0.2, tilt = 0, collide = true, parent = root as THREE.Object3D, y = NaN, drift = 1, reach = 0.2 } = {}): THREE.Mesh => {
    const onGround = parent === root;
    const material = onGround ? seatInGround(src.material as THREE.MeshStandardMaterial, reach) : src.material;
    const m = new THREE.Mesh(src.geometry, material);
    const sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
    m.scale.set(sc[0], sc[1], sc[2]);
    const height = src.geometry.boundingBox!.max.y * sc[1];
    m.position.set(x, Number.isNaN(y) ? 0 : y - height * sink, z);
    m.rotation.set(tilt, yaw, tilt * 0.6);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.noCollide = true;
    parent.add(m);
    let proxy: THREE.Mesh | null = null;
    if (collide) {
      proxy = new THREE.Mesh(models.hull(src, key), hidden);
      proxy.position.copy(m.position);
      proxy.rotation.copy(m.rotation);
      proxy.scale.copy(m.scale);
      (onGround ? solid : parent).add(proxy);
    }
    if (onGround) {
      // heap sand round it, more on the open beach than on the stony ground inland
      const b = src.geometry.boundingBox!;
      const across = Math.max((b.max.x - b.min.x) * sc[0], (b.max.z - b.min.z) * sc[2]) * 0.5;
      const own = drift > 0 ? clamp(0.05 + across * 0.2, 0.05, 0.6) * drift * (z < -24 ? 0.55 : 1) : 0;
      if (own > 0) mounds.push({ x, z, r: across * 1.3 + 0.35, h: own });
      later.push(() => {
        m.position.y = ground(x, z) - own - height * sink;
        proxy?.position.copy(m.position);
      });
    }
    return m;
  };

  // --- rocks -----------------------------------------------------------------------------
  const boulder = models.piece('boulder', 'boulder');
  const slab = models.piece('slab', 'rock');
  // one kind of stone: pull the scanned rocks toward the colour of the bluff they fell from
  if (boulder) (boulder.material as THREE.MeshStandardMaterial).color.setRGB(0.66, 0.6, 0.62);
  if (slab) (slab.material as THREE.MeshStandardMaterial).color.setRGB(1.5, 1.25, 1.15);
  /** A boulder about `radius` across. Scanned if the model loaded, otherwise built from noise. */
  const stone = (seed: number, x: number, z: number, radius: number, stretch: [number, number, number] = [1, 0.8, 1], sink = 0.25, yaw = 0) => {
    if (boulder) {
      const k = radius / 1.25;
      prop(boulder, 'boulder', x, z, [k * stretch[0], k * stretch[1] * 1.35, k * stretch[2]], yaw + seed, { sink, reach: 0.24 });
      return;
    }
    const m = rock(seed, radius, stretch);
    m.geometry.computeBoundingSphere();
    m.rotation.y = yaw;
    solid.add(m);
    later.push(() => {
      m.position.set(x, ground(x, z) - sink * m.geometry.boundingSphere!.radius, z);
      const blend = m.geometry.attributes.blend, pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) blend.setY(i, smoothstep(1.3, 0.1, pos.getY(i) + m.position.y));
    });
  };

  // sea stacks
  stone(1, -31, 9, 3.2, [1, 1.7, 1], 0.1);
  stone(2, 24, 31, 3.0, [1, 1.9, 0.9], 0.2, 1);
  stone(3, -10, 46, 4.2, [1.1, 1.5, 1], 0.2, 2);
  stone(4, 31, 12, 2.6, [1, 1.2, 1.2], 0.3, 0.5);
  stone(5, 12, 37, 2.2, [1.3, 0.9, 1], 0.3, 4);
  // along the foot of the bluff, with the ravine mouth left open
  for (let i = 0; i < 16; i++) {
    const x = -44 + i * 5.8 + (r() - 0.5) * 3;
    if (Math.abs(x - pathX(-22)) < 6.5) continue;
    stone(10 + i, x, -19 + (r() - 0.5) * 5, 0.9 + r() * 1.5, [1 + r() * 0.4, 0.7 + r() * 0.4, 1 + r() * 0.3], 0.3, r() * 6);
  }
  // scattered on the beach
  for (let i = 0; i < 9; i++) stone(40 + i, -36 + r() * 72, -9 + r() * 30, 0.35 + r() * 0.6, [1, 0.8, 1], 0.4, r() * 6);
  // cover inside the cove
  stone(60, 2, -68, 2.4, [1.1, 0.9, 1], 0.25, 1.2);
  stone(61, -6.5, -79, 1.5, [1, 0.8, 1], 0.3, 2.2);
  stone(62, 11, -59.5, 1.7, [1.2, 0.8, 1], 0.3, 0.4);
  stone(63, -3, -56, 1.2, [1, 0.8, 1], 0.35, 3);
  // in the ravine
  stone(64, pathX(-33) + 3.4, -33, 1.1, [1, 0.8, 1], 0.3, 1);
  stone(65, pathX(-38) - 3.2, -38.5, 0.9, [1, 0.8, 1], 0.3, 2);
  // flat slabs of slate lying about
  if (slab) {
    const slabs: [number, number, number][] = [[-22, -12, 22], [19, -14, 18], [9, 20, 14], [-16, 21, 16], [pathX(-28) - 2.6, -28, 13], [16, -52, 20], [-9, -62, 15], [27, -6, 24], [-38, 2, 20]];
    slabs.forEach(([x, z, k], i) => prop(slab, 'slab', x, z, [k, k * 1.3, k], i * 1.9, { sink: 0.3, tilt: (r() - 0.5) * 0.2, reach: 0.14 }));
  }

  // --- the wreck -------------------------------------------------------------------------
  let deckJournal: THREE.Vector3;
  let lantern: THREE.PointLight | null = null;
  const landmarks: Record<string, THREE.Vector3> = {};
  const shipModel = models.clone('ship');
  if (shipModel) {
    // your ship, driven broadside onto the sand and heeled toward the sea
    const ship = new THREE.Group();
    ship.add(shipModel);
    ship.scale.setScalar(1.25);
    ship.rotation.order = 'YXZ';
    ship.rotation.set(-0.25, Math.PI + 0.1, 0.03);
    ship.position.set(-5, bedHeight(-5, 6) - 1.1, 6);
    shipModel.traverse((o) => {
      if (!o.name.includes('hull')) o.userData.noCollide = true;
      else if ((o as THREE.Mesh).isMesh) seatInGround((o as THREE.Mesh).material as THREE.MeshStandardMaterial, 0.8);
    });
    solid.add(ship);
    ship.updateMatrixWorld(true);
    const onShip = (x: number, y: number, z: number) => ship.localToWorld(new THREE.Vector3(x, y, z));

    // The sea has been burying her since she struck: sand banked high along the landward
    // side, where the wind drops it, and a lower bank on the side the waves reach.
    const sternAt = onShip(-9.2, 0, 0), bowAt = onShip(9.8, 0, 0);
    berms.push({ ax: sternAt.x, az: sternAt.z, bx: bowAt.x, bz: bowAt.z, halfWidth: 3.25, left: 0.55, right: 1.15, reachLeft: 1.7, reachRight: 2.8 });

    // a hatch cover, torn loose, makes a gangway from the sand up over the low rail
    const top = onShip(-0.4, 2.02, -2.5);
    const foot = new THREE.Vector3(top.x + 0.6, 0, top.z + 6.2);
    seatInGround(MATERIALS.wood, 0.16);
    // its foot has worked down into the sand, and a little has drifted over the end
    mounds.push({ x: foot.x, z: foot.z + 0.4, r: 2.1, h: 0.14 });
    later.push(() => {
      foot.y = ground(foot.x, foot.z) - 0.2;
      solid.add(plank(foot, top.clone().add(new THREE.Vector3(-0.05, 0.02, -0.45)), 2.3, MATERIALS.wood));
    });
    landmarks.gangwayFoot = foot;
    landmarks.gangwayTop = top.clone();
    landmarks.deck = onShip(0.6, 1.75, 0);

    // the stern lantern is still burning
    const lampAt = onShip(-10.15, 5.72, 0);
    lantern = new THREE.PointLight(0xffb060, 26, 30, 1.6);
    lantern.position.copy(lampAt);
    root.add(lantern);
    const lampGlow = glowSprite(0xffb060, 1.5, 2.2);
    lampGlow.position.copy(lampAt);
    root.add(lampGlow);
    landmarks.lantern = lampAt;

    // sea chests lashed on deck: steps up to the quarterdeck
    const crate = models.piece('crate', 'wooden_crate_01');
    if (crate) {
      prop(crate, 'crate', -2.2, 1.2, 1.55, Math.PI / 2, { sink: 0, parent: ship, y: 1.7 });
      prop(crate, 'crate', -3.05, 1.2, 1.55, Math.PI / 2, { sink: 0, parent: ship, y: 1.7 });
      prop(crate, 'crate', -3.05, 1.2, 1.55, Math.PI / 2 + 0.2, { sink: 0, parent: ship, y: 2.24 });
    }
    deckJournal = onShip(1.9, 1.86, 0.55);
  } else {
    // no ship model: a wreck of planks instead
    const stern = sternWreck();
    stern.group.position.set(-13, ground(-13, 3) - 0.35, 3);
    stern.group.rotation.set(0.03, 0.3, 0.05);
    solid.add(stern.group);
    stern.group.updateMatrixWorld(true);
    deckJournal = stern.group.localToWorld(stern.journalSpot.clone());
    const bow = bowWreck();
    bow.position.set(13, ground(13, -7) - 0.4, -7);
    bow.rotation.set(0, -0.5, 0.04);
    solid.add(bow);
  }

  // --- what the sea threw up the beach -----------------------------------------------------
  const barrelA = models.piece('barrels', 'barrel01');
  const barrelB = models.piece('barrels', 'barrel02');
  if (barrelA) {
    prop(barrelA, 'barrelA', 6.5, 16.5, 1.15, 0.4, { sink: 0.12, tilt: 0.12, reach: 0.13 });
    prop(barrelA, 'barrelA', -15, 17, 1.15, 2.1, { sink: 0.3, tilt: -0.2, reach: 0.13 });
  }
  if (barrelB) prop(barrelB, 'barrelB', 10.5, 21.5, 1.15, 1.2, { sink: 0.35, tilt: 1.35, reach: 0.13 });
  const staves = models.pieces('barrels').filter((m) => m.name.includes('piece')).map((m) => centred(m));
  staves.forEach((s2, i) => {
    const a = i * 2.4, d = 2 + (i % 5) * 1.3;
    prop(s2, `stave${i}`, 4 + Math.cos(a) * d * 1.6, 18.5 + Math.sin(a) * d, 1.2, a * 1.7, { sink: 0.3, tilt: (i % 3 - 1) * 0.25, collide: false, drift: 0.5, reach: 0.045 });
  });
  const chest = models.piece('crate', 'wooden_crate_01');
  if (chest) {
    prop(chest, 'crate', 8.6, 13.2, 1.5, 0.7, { sink: 0.25, tilt: 0.16, reach: 0.12 });
    prop(chest, 'crate', -20, 13.5, 1.5, 2.6, { sink: 0.4, tilt: -0.3, reach: 0.12 });
  }
  const branches = models.pieces('branches').map((m) => centred(m));
  if (branches.length) {
    const wood: [number, number, number][] = [[-7, 27.2, 2.2], [14, 26.4, 1.8], [-24, 25.5, 2.4], [27, 23, 2], [1, 28.6, 1.6], [-33, 18, 2.2], [20, -15, 2.4], [-13, -16, 2], [pathX(-30) + 2, -30, 1.8], [-8, -55, 2.2], [15, -73, 2]];
    wood.forEach(([x, z, k], i) => prop(branches[i % branches.length], `branch${i}`, x, z, k, i * 2.3, { sink: 0.15, collide: false, drift: 0.6, reach: 0.05 }));
  }

  // --- the ground itself, now that it knows what stands on it -------------------------------
  solid.add(terrain(0.5));
  for (const step of later) step();
  {
    // objects read the height of the sand under them from this, to bed themselves into it
    const cell = 0.5;
    const nx = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / cell) + 1, nz = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / cell) + 1;
    const data = new Uint16Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) data[j * nx + i] = THREE.DataUtils.toHalfFloat(ground(BOUNDS.minX + i * cell, BOUNDS.minZ + j * cell));
    }
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    seat.height.value = tex;
    seat.min.value.set(BOUNDS.minX - cell / 2, BOUNDS.minZ - cell / 2);
    seat.size.value.set(nx * cell, nz * cell);
    seat.on.value = 1;
    seatInGround(MATERIALS.conjuredStone, 0.3);
  }

  /** Is the ground here close enough to level for loose things to lie on it? */
  const level = (x: number, z: number) => Math.abs(ground(x + 0.6, z) - ground(x - 0.6, z)) + Math.abs(ground(x, z + 0.6) - ground(x, z - 0.6)) < 0.5;

  // pebbles and broken rock where the bluff sheds them, and round the bigger stones
  {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const k = 1 + fbm(gp.getX(i) * 2.1, gp.getY(i) * 2.1 + gp.getZ(i) * 1.7, 2) * 0.35;
      gp.setXYZ(i, gp.getX(i) * k, gp.getY(i) * k * 0.62, gp.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const spots: [number, number, number][] = [];
    const big = mounds.filter((m) => m.h > 0.12);
    for (let i = 0; i < 2400 && spots.length < 620; i++) {
      let x: number, z: number;
      const kind = r();
      if (kind < 0.4) {
        x = -46 + r() * 92;
        z = -22.5 + Math.pow(r(), 2.2) * 9;
      } else if (kind < 0.75 && big.length) {
        const m = big[Math.floor(r() * big.length)];
        const a = r() * Math.PI * 2, d = m.r * (0.5 + r() * 0.9);
        x = m.x + Math.cos(a) * d;
        z = m.z + Math.sin(a) * d;
      } else if (kind < 0.88) {
        z = -24 - r() * 20;
        x = pathX(z) + (r() - 0.5) * 9;
      } else {
        const a = r() * Math.PI * 2, d = 6 + r() * 16;
        x = COVE.x + Math.cos(a) * d;
        z = COVE.z + Math.sin(a) * d;
      }
      if (ground(x, z) < 0.4 || !level(x, z)) continue;
      spots.push([x, z, 0.04 + Math.pow(r(), 2.5) * 0.24]);
    }
    const pebbles = new THREE.InstancedMesh(geo, seatInGround(MATERIALS.rock.clone(), 0.05), spots.length);
    const d3 = new THREE.Object3D();
    spots.forEach(([x, z, k], i) => {
      d3.position.set(x, ground(x, z) - k * 0.2, z);
      d3.rotation.set(r() * 0.5, r() * 6.28, r() * 0.5);
      d3.scale.set(k * (0.8 + r() * 0.6), k, k * (0.8 + r() * 0.6));
      d3.updateMatrix();
      pebbles.setMatrixAt(i, d3.matrix);
    });
    pebbles.castShadow = false;
    pebbles.receiveShadow = true;
    pebbles.userData.noCollide = true;
    root.add(pebbles);
  }

  // --- what grows here ---------------------------------------------------------------------
  // marram grass in clumps: thick at the foot of the bluff, along the ravine, round the cove
  const flat = level;
  const clumpCentre = (): [number, number] | null => {
    const kind = r();
    let x: number, z: number;
    if (kind < 0.55) {
      x = -42 + r() * 84;
      z = -21 + Math.pow(r(), 1.6) * 25;
      if (Math.abs(x - pathX(-22)) < 4 && z < -13) return null;
    } else if (kind < 0.72) {
      z = -24 - r() * 20;
      x = pathX(z) + (r() < 0.5 ? -1 : 1) * (2.6 + r() * 1.4);
    } else {
      const a = r() * Math.PI * 2, d = r() < 0.7 ? 18.5 + r() * 4.5 : 5 + r() * 14;
      x = COVE.x + Math.cos(a) * d;
      z = COVE.z + Math.sin(a) * d;
    }
    if (z > 2.5 && z < 10.5 && x > -22 && x < 10) return null; // not under the ship
    return [x, z];
  };
  const tufts: [number, number, number][][] = [[], [], []];
  for (let c = 0; c < 190; c++) {
    const centre = clumpCentre();
    if (!centre) continue;
    const n = 4 + Math.floor(r() * 9);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.5;
      const x = centre[0] + Math.cos(a) * d, z = centre[1] + Math.sin(a) * d;
      if (ground(x, z) < 1.3 || !flat(x, z)) continue;
      tufts[Math.floor(r() * 3)].push([x, z, 0.38 + r() * 0.45]);
    }
  }
  const grassGeo = grassGeometry();
  const dummy = new THREE.Object3D();
  tufts.forEach((list, v) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(grassGeo, grassMaterial(31 + v * 7), list.length);
    list.forEach(([x, z, k], n) => {
      dummy.position.set(x, ground(x, z) - 0.03, z);
      dummy.rotation.set(0, r() * 6.28, 0);
      dummy.scale.set(k * 1.25, k, k * 1.25);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
    });
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.userData.noCollide = true;
    inst.userData.noShade = true;
    root.add(inst);
  });

  // --- story objects ---------------------------------------------------------------------
  const bodySpot = new THREE.Vector3(4.2, ground(4.2, 22.5), 22.5);
  const corpse = body(models.take('hand'));
  corpse.group.position.copy(bodySpot).setY(bodySpot.y - 0.03);
  corpse.group.rotation.y = -0.45;
  root.add(corpse.group);
  corpse.group.updateMatrixWorld(true);
  const firstPage = corpse.group.localToWorld(corpse.journalAt.clone());

  const ravineSpot = new THREE.Vector3(pathX(-37) + 0.6, ground(pathX(-37) + 0.6, -37), -37);
  const mesaSpot = new THREE.Vector3(MESA.x + 0.5, ground(MESA.x + 0.5, MESA.z - 0.5), MESA.z - 0.5);

  const journals: JournalDef[] = [
    {
      id: 'shore-1', teaches: 'fire', title: 'The first page',
      position: firstPage,
      text: [
        'If you are reading this, the tide has given you to the island as it gave me. I am sorry. It does not give anything back.',
        'You will not last a night here without a word to speak. So: the first one. Every apprentice begins with it, because it is the one that least needs to be understood.',
        'Hold it in your mind like a coal in your hand. Say it once and it flies. Say it twice and it will not stop where you meant it to.',
      ],
    },
    {
      id: 'shore-2', teaches: 'push', title: 'Nailed to the mainmast',
      position: deckJournal,
      text: [
        'They cannot climb. I learned that on a deck like this one, with my back to the rail, watching them walk the long way round.',
        'High ground buys you time, never safety. So learn the second word: away. It is not a weapon. A cliff is a weapon. This only introduces them.',
        'A word alone is a gesture. Two together are a thought. Try it beside the first.',
      ],
    },
    {
      id: 'shore-3', teaches: 'stone', title: 'A page weighted with a pebble',
      position: ravineSpot.clone().add(new THREE.Vector3(0, 0.35, 0)),
      text: [
        'The island listens. Speak its own word and it answers with itself: thrown, if you ask once.',
        'Ask twice and it rises under your feet. I have stood on a pillar of my own making and watched the tide break against it. It does not last. Nothing I have made here lasts.',
        'There is a cove ahead where they gather. Go up before you go in.',
      ],
    },
    {
      id: 'shore-4', teaches: 'wind', title: 'A page pinned under a knife',
      position: mesaSpot.clone().add(new THREE.Vector3(0, 0.3, 0)),
      text: [
        'You found a way up. Good. That is the whole of the art: there is always a way up.',
        'The fourth word has no weight at all. Twice, beneath you, and you will go where no stair leads. Beneath them, and the fall will do your work.',
        'Four words are enough to cross the marsh. They are not enough for what waits at the top. I had eight, and I am what you found on the sand.',
      ],
    },
  ];

  // --- the stand in the cove -------------------------------------------------------------
  const at = (x: number, z: number) => new THREE.Vector3(x, ground(x, z), z);
  const [sw, east, perch] = POOLS.map(([x, z]) => at(x, z));
  for (const p of [sw, east, perch]) {
    // the pool stands a little above the bottom of its hollow, so its edge follows the sand
    const pool = tidePool(3.4);
    pool.position.copy(p).setY(p.y + 0.14);
    root.add(pool);
  }
  const stand: StandDef = {
    id: 'cove', name: 'The Cove',
    center: at(COVE.x, COVE.z), radius: 19,
    seals: [
      { at: at(pathX(-43.5), -43.5), facing: 0, width: 18, height: 10, role: 'entry' },
      { at: at(pathX(-99.5), -99.5), facing: 0, width: 18, height: 10, role: 'exit' },
    ],
    waves: [
      [{ kind: 'drowned', count: 3, at: sw, delay: 0.5 }],
      [
        { kind: 'drowned', count: 2, at: east, delay: 0.5 },
        { kind: 'spitter', count: 1, at: perch, delay: 1.5 },
        { kind: 'drowned', count: 2, at: sw, delay: 5 },
      ],
      [
        { kind: 'drowned', count: 3, at: east, delay: 0.5 },
        { kind: 'spitter', count: 1, at: perch, delay: 1 },
        { kind: 'spitter', count: 1, at: east, delay: 3 },
        { kind: 'drowned', count: 3, at: sw, delay: 6 },
      ],
    ],
  };

  // --- walls at the edge of the world ----------------------------------------------------
  const walls = new THREE.Group();
  const w = BOUNDS.maxX - BOUNDS.minX, d = BOUNDS.maxZ - BOUNDS.minZ;
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2, cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
  walls.add(box(w, 80, 1, hidden, [cx, 20, BOUNDS.minZ + 1]));
  walls.add(box(w, 80, 1, hidden, [cx, 20, BOUNDS.maxZ - 6]));
  walls.add(box(1, 80, d, hidden, [BOUNDS.minX + 1, 20, cz]));
  walls.add(box(1, 80, d, hidden, [BOUNDS.maxX - 1, 20, cz]));
  walls.traverse((o) => { (o as THREE.Mesh).castShadow = false; });

  const collision = mergeForCollision([solid, walls]);

  // --- the sea ---------------------------------------------------------------------------
  // fine near the beach, where the depth changes and the foam runs; coarse out to the horizon
  const seaGeo = (() => {
    const xs: number[] = [], zs: number[] = [];
    for (let x = -150; x <= 150; x += 1.25) xs.push(x);
    for (let z = 16; z <= 70; z += 1.25) zs.push(z);
    for (const z of [80, 100, 140, 220, 400, 900]) zs.push(z);
    xs.unshift(-900, -400);
    xs.push(400, 900);
    const pos: number[] = [], depth: number[] = [], shoal: number[] = [], uv: number[] = [], idx: number[] = [];
    const inSea = mounds.filter((m) => m.h > 0.2 && ground(m.x, m.z) - m.h < 0.2);
    for (const z of zs) {
      for (const x of xs) {
        // laid in the XY plane and turned flat afterwards, so "up" for the swell is +Z
        pos.push(x, -z, 0);
        depth.push(Math.min(12, -ground(Math.max(-70, Math.min(70, x)), Math.min(z, 60)) + (z > 60 ? (z - 60) * 0.1 : 0)));
        uv.push(x / 900, z / 900);
        let near = 0;
        for (const m of inSea) near = Math.max(near, smoothstep(m.r * 1.25, m.r * 0.55, Math.hypot(x - m.x, z - m.z)));
        shoal.push(near);
      }
    }
    const w = xs.length;
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d2 = c + 1;
        idx.push(a, c, b, b, c, d2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('shoal', new THREE.Float32BufferAttribute(shoal, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const sea = new THREE.Mesh(seaGeo, MATERIALS.water);
  sea.rotation.x = -Math.PI / 2;
  sea.renderOrder = 2;
  sea.userData.noCollide = true;
  sea.userData.noShade = true;
  sea.receiveShadow = true;
  root.add(sea);

  return {
    id: 'shore',
    name: 'The Wreck Shore',
    night: 'Night I',
    root,
    collision,
    spawn: { position: new THREE.Vector3(2.4, ground(2.4, 25) + 0.05, 25), yaw: 0.25 },
    journals,
    stands: [stand],
    bounds: BOUNDS,
    waterLevel: 0,
    landmarks,
    update(time) {
      // the swell drifts shoreward, and the grass leans with the wind
      waterRipples.offset.set(time * 0.012, -time * 0.02);
      grassTime.value = time;
      seaUniforms.uTime.value = time;
      if (lantern) lantern.intensity = 26 * (0.82 + Math.sin(time * 11) * 0.06 + Math.sin(time * 23.7) * 0.05 + Math.sin(time * 3.1) * 0.07);
    },
  };
}
