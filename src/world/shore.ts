// Night I: the Wreck Shore.
// A beach under a bluff, the broken hull as ramps and decks, a ravine, and a cove with a ledge
// and an outcrop where the first stand is fought.
//
// Axes: +x east, +z south (out to sea), -z inland. Sea level is y = 0.
import * as THREE from 'three';
import { clamp, smoothstep, fbm, rng, distToSegment } from '../core/math';
import { mergeForCollision } from './world';
import type { Level, JournalDef, StandDef } from './level';
import { MATERIALS, waterRipples } from '../art/materials';

export const COVE = { x: 0, z: -70, r: 26 };
const BOUNDS = { minX: -62, maxX: 62, minZ: -112, maxZ: 62 };
const MESA = { x: 13, z: -82, r: 5.6, h: 5.0 };
const MESA_RAMP = { ax: -1.5, az: -91, bx: 9.5, bz: -86.5 };

/** Where the ravine runs as it winds inland. */
export function pathX(z: number) {
  return 7 * Math.sin((z + 22) * 0.065);
}

/** Ground height of the shore before props are placed. */
export function shoreHeight(x: number, z: number): number {
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

  // blend weights for the ground material: x = rock (steep or high), y = wet (near the tide line)
  const normal = geo.attributes.normal;
  const blend = new Float32Array((nx + 1) * (nz + 1) * 2);
  for (let k = 0; k < (nx + 1) * (nz + 1); k++) {
    const y = pos[k * 3 + 1], z = pos[k * 3 + 2], x = pos[k * 3];
    const steep = smoothstep(0.86, 0.62, normal.getY(k));
    const inland = smoothstep(-20, -26, z) * 0.75;
    const patch = smoothstep(0.1, 0.5, fbm(x * 0.09 + 20, z * 0.09, 3)) * 0.5 * inland;
    blend[k * 2] = clamp(Math.max(steep, inland * 0.55 + patch), 0, 1);
    blend[k * 2 + 1] = smoothstep(1.1, -0.2, y);
  }
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 2));

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
  const blend = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) blend[i * 2] = 1;
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 2));
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

function beam(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const len = from.distanceTo(to);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, len, 10), material);
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The robed body at the waterline. */
function body(): THREE.Group {
  const g = new THREE.Group();
  const robe = MATERIALS.cloth;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 6, 12), robe);
  torso.rotation.z = Math.PI / 2;
  torso.position.set(0, 0.2, 0);
  torso.scale.set(1, 1, 1.25);
  g.add(torso);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.8, 6, 10), robe);
  legs.rotation.z = Math.PI / 2;
  legs.rotation.y = 0.25;
  legs.position.set(-0.95, 0.14, 0.1);
  legs.scale.set(1, 1, 1.5);
  g.add(legs);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), robe);
  hood.position.set(0.82, 0.2, 0.02);
  hood.scale.set(1.15, 0.9, 1);
  g.add(hood);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.6, 4, 8), robe);
  arm.rotation.set(0, 0.9, Math.PI / 2);
  arm.position.set(0.35, 0.1, 0.5);
  g.add(arm);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; o.userData.noCollide = true; });
  return g;
}

/** A dark pool the Gloam rise out of. */
function tidePool(radius: number): THREE.Group {
  const g = new THREE.Group();
  const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), new THREE.MeshBasicMaterial({ color: 0x030806 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.04;
  g.add(pool);
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius * 1.05, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8dff3a).multiplyScalar(1.5), transparent: true, opacity: 0.5 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.05;
  g.add(rim);
  const light = new THREE.PointLight(0x8dff3a, 6, 9, 1.8);
  light.position.y = 0.9;
  g.add(light);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

export function buildShore(): Level {
  const root = new THREE.Group();
  const solid = new THREE.Group(); // everything you can stand on or bump into
  root.add(solid);
  const r = rng(11);
  const ground = (x: number, z: number) => shoreHeight(x, z);

  solid.add(terrain(0.8));

  // --- the wreck -------------------------------------------------------------------------
  const stern = sternWreck();
  stern.group.position.set(-13, ground(-13, 3) - 0.35, 3);
  stern.group.rotation.set(0.03, 0.3, 0.05);
  solid.add(stern.group);
  stern.group.updateMatrixWorld(true);
  const deckJournal = stern.group.localToWorld(stern.journalSpot.clone());

  const bow = bowWreck();
  bow.position.set(13, ground(13, -7) - 0.4, -7);
  bow.rotation.set(0, -0.5, 0.04);
  solid.add(bow);

  // --- rocks -----------------------------------------------------------------------------
  const place = (m: THREE.Mesh, x: number, z: number, sink = 0.35, yaw = 0) => {
    m.geometry.computeBoundingSphere();
    m.position.set(x, ground(x, z) - sink * m.geometry.boundingSphere!.radius, z);
    m.rotation.y = yaw;
    // darken whatever sits in the tide
    const blend = m.geometry.attributes.blend, pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) blend.setY(i, smoothstep(1.3, 0.1, pos.getY(i) + m.position.y));
    solid.add(m);
    return m;
  };
  // sea stacks
  const stack = place(rock(1, 3.4, [1, 1.7, 1]), -29, 7, 0.1);
  place(rock(2, 3.0, [1, 1.9, 0.9]), 24, 31, 0.2, 1);
  place(rock(3, 4.2, [1.1, 1.5, 1]), -10, 46, 0.2, 2);
  place(rock(4, 2.6, [1, 1.2, 1.2]), 31, 12, 0.3, 0.5);
  place(rock(5, 2.2, [1.3, 0.9, 1]), 9, 36, 0.3, 4);
  // the fallen mast is a bridge from the quarterdeck to the western sea stack
  const mastFrom = stern.group.localToWorld(new THREE.Vector3(-6.2, 4.72, -1.4));
  const mastTo = new THREE.Vector3(-27.6, stack.position.y + 3.4 * 1.7 * 0.93, 6.4);
  solid.add(beam(mastFrom, mastTo, 0.42, MATERIALS.woodDark));

  // boulders along the foot of the bluff, with the ravine mouth left open
  for (let i = 0; i < 16; i++) {
    const x = -44 + i * 5.8 + (r() - 0.5) * 3;
    if (Math.abs(x - pathX(-22)) < 6.5) continue;
    place(rock(10 + i, 0.9 + r() * 1.5, [1 + r() * 0.4, 0.7 + r() * 0.4, 1 + r() * 0.3]), x, -19 + (r() - 0.5) * 5, 0.3, r() * 6);
  }
  // scattered on the beach
  for (let i = 0; i < 9; i++) place(rock(40 + i, 0.4 + r() * 0.7), -34 + r() * 68, -8 + r() * 30, 0.4, r() * 6);
  // cover inside the cove
  place(rock(60, 2.4, [1.1, 0.9, 1]), 2, -68, 0.25, 1.2);
  place(rock(61, 1.5), -6.5, -79, 0.3, 2.2);
  place(rock(62, 1.7, [1.2, 0.8, 1]), 11, -59.5, 0.3, 0.4);
  place(rock(63, 1.2), -3, -56, 0.35, 3);
  // in the ravine
  place(rock(64, 1.1), pathX(-33) + 3.4, -33, 0.3, 1);
  place(rock(65, 0.9), pathX(-38) - 3.2, -38.5, 0.3, 2);

  // --- story objects ---------------------------------------------------------------------
  const bodySpot = new THREE.Vector3(4.2, ground(4.2, 22.5), 22.5);
  const corpse = body();
  corpse.position.copy(bodySpot);
  corpse.rotation.y = 0.5;
  root.add(corpse);

  const ravineSpot = new THREE.Vector3(pathX(-37) + 0.6, ground(pathX(-37) + 0.6, -37), -37);
  const mesaSpot = new THREE.Vector3(MESA.x + 0.5, ground(MESA.x + 0.5, MESA.z - 0.5), MESA.z - 0.5);

  const journals: JournalDef[] = [
    {
      id: 'shore-1', teaches: 'fire', title: 'The first page',
      position: bodySpot.clone().add(new THREE.Vector3(0.75, 0.05, 0.75)),
      text: [
        'If you are reading this, the tide has given you to the island as it gave me. I am sorry. It does not give anything back.',
        'You will not last a night here without a word to speak. So: the first one. Every apprentice begins with it, because it is the one that least needs to be understood.',
        'Hold it in your mind like a coal in your hand. Say it once and it flies. Say it twice and it will not stop where you meant it to.',
      ],
    },
    {
      id: 'shore-2', teaches: 'push', title: 'Written on the quarterdeck',
      position: deckJournal,
      text: [
        'They cannot climb. I learned that on this deck, with my back to the rail, watching them walk the long way round.',
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
  const sw = at(-13, -51), east = at(21, -66), perch = at(-15.5, -81);
  for (const p of [sw, east, perch]) {
    const pool = tidePool(2.2);
    pool.position.copy(p);
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
  const wallMat = new THREE.MeshBasicMaterial({ visible: false });
  const w = BOUNDS.maxX - BOUNDS.minX, d = BOUNDS.maxZ - BOUNDS.minZ;
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2, cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
  walls.add(box(w, 80, 1, wallMat, [cx, 20, BOUNDS.minZ + 1]));
  walls.add(box(w, 80, 1, wallMat, [cx, 20, BOUNDS.maxZ - 6]));
  walls.add(box(1, 80, d, wallMat, [BOUNDS.minX + 1, 20, cz]));
  walls.add(box(1, 80, d, wallMat, [BOUNDS.maxX - 1, 20, cz]));
  walls.traverse((o) => { (o as THREE.Mesh).castShadow = false; });

  const collision = mergeForCollision([solid, walls]);

  // --- the sea ---------------------------------------------------------------------------
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), MATERIALS.water);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, 200);
  sea.userData.noCollide = true;
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
    update(time) {
      // the swell drifts shoreward
      waterRipples.offset.set(time * 0.012, -time * 0.02);
    },
  };
}
