// The Wreck Shore, assembled: ground and sea, cliffs and rocks, the wreck, what the sea gave
// back, the far peak, and the air. Used by the game and by the look-dev stills.
import * as THREE from 'three';
import { BAY, STREAM, groundHeight, shoreAt as shoreLine } from './layout';
import { buildGround, loadTextureSet } from './terrain';
import { buildOcean, oceanUniforms } from './ocean';
import { place, tatter, weather, buildPeak, buildTower, buildVortex, summitOf, type ModelSource } from './dressing';
import { mistBank, glow, beam, falls } from './airfx';
import { marram } from './grass';
import { makeSeatedMage } from '../../art/mage';

export interface Bay {
  root: THREE.Group;
  /** Named points for cameras and gameplay. */
  marks: Record<string, THREE.Vector3>;
  update(time: number): void;
}

export async function buildBay(source: ModelSource, assets: string): Promise<Bay> {
  const root = new THREE.Group();
  const marks: Record<string, THREE.Vector3> = {};
  const [dry, damp, cliffTex] = await Promise.all([
    loadTextureSet(assets + 'textures/beach'), loadTextureSet(assets + 'textures/damp'), loadTextureSet(assets + 'textures/cliff'),
  ]);
  const ground = buildGround(dry, damp, cliffTex, { minX: -200, maxX: 160, minZ: -160, maxZ: 200, cell: 0.6 });
  root.add(ground.mesh);
  const sea = buildOcean(ground);
  root.add(sea);

  // ---- cliffs: the headland on the west, the long wall along the north ------------------------
  // The scans are facades: each is turned so its face looks into the bay, and set back so its
  // top meets the high ground behind.
  const stone = 0xd8d0c4;
  const put = (name: string, p: Parameters<typeof place>[2], tint = stone) => { const m = place(source, name, p); weather(m, tint, 0.05); root.add(m); return m; };
  const H = BAY.headX, N = BAY.northZ;
  // each scan's face is on the bay side of its bounds: set its centre half its depth behind the line
  const wall = (name: string, depth: number, along: number, across: 'x' | 'z', line: number, yaw: number, scale: [number, number, number], sink = 1.5) => {
    const d = depth * scale[2] * 0.5;
    return across === 'x' ? put(name, { x: line - d, z: along, yaw, scale, sink }) : put(name, { x: along, z: line - d, yaw, scale, sink });
  };
  wall('coastal_cliff_02', 8.6, -14, 'x', H + 3, Math.PI / 2, [2.4, 2.7, 1.6]);
  wall('coastal_cliff_04', 24.2, 34, 'x', H - 2, Math.PI / 2 + 0.2, [0.9, 2.5, 0.8], 3);
  wall('coastal_cliff_01', 11, -58, 'z', N + 3, 0.02, [0.9, 2.6, 1.4]);
  wall('coastal_cliff_02', 8.6, 6, 'z', N + 2, -0.03, [1.3, 2.6, 1.6]);
  wall('coastal_cliff_04', 24.2, 92, 'z', N - 2, 0.03, [1.2, 2.4, 0.7], 2);
  // rock at the foot of the headland, where she struck
  put('coast_rocks_01', { x: -78, z: -14, yaw: 1.5, scale: 1.0, sink: 0.5 });
  put('coast_rocks_03', { x: -74, z: 22, yaw: 0.2, scale: 1.0, sink: 1.4 });
  put('coast_line_02', { x: -58, z: 26, yaw: 0.1, scale: 1.0, sink: 1.0 });
  put('coast_land_rocks_03', { x: -76, z: -28, yaw: 0.6, scale: 2.0, sink: 0.4 });
  put('coast_land_rocks_02', { x: -48, z: -36, yaw: 1.6, scale: 1.8, sink: 0.4 });
  put('coast_land_rocks_03', { x: 14, z: -36, yaw: 2.6, scale: 1.6, sink: 0.4 });
  put('coast_rocks_05', { x: 26, z: -32, yaw: 1.0, scale: 1.6, sink: 0.3 });
  put('coast_land_rocks_02', { x: 44, z: -34, yaw: 0.3, scale: 1.6, sink: 0.4 });
  // sea stacks out in the bay
  put('mountainside', { x: -150, z: 110, yaw: 0.8, scale: [3.5, 4.5, 3.5], sink: 6, y: -6 });
  put('rock_face_01', { x: -112, z: 150, yaw: 2.4, scale: [5, 6, 5], sink: 0, y: -8 });
  put('mountainside', { x: -60, z: 190, yaw: 2.0, scale: [2.5, 3.2, 2.5], sink: 6, y: -5 });

  // ---- the wreck ---------------------------------------------------------------------------
  const ship = source('dutch_ship_large_01');
  const s = BAY.ship;
  ship.rotation.order = 'YXZ';
  ship.rotation.set(s.pitch, s.yaw, s.heel);
  ship.position.set(s.x, groundHeight(s.x, s.z) - s.sink, s.z);
  ship.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (mesh.name.includes('sails')) mesh.material = tatter(mesh.material as THREE.MeshStandardMaterial, 0.48, 3);
  });
  weather(ship, 0xb8aa98, 0.1);
  root.add(ship);
  ship.updateMatrixWorld(true);
  marks.ship = ship.position.clone();

  // ---- what the sea gave back ----------------------------------------------------------------
  put('wooden_barrels_01', { x: -40, z: 6, yaw: 0.6, sink: 0.25 }, 0xffffff);
  put('wooden_crate_01', { x: -33, z: 12, yaw: 1.1, tilt: [0.25, 0.1], sink: 0.3 }, 0xffffff);
  put('wooden_crate_01', { x: -46, z: -6, yaw: 0.3, tilt: [0.0, 0.4], sink: 0.4 }, 0xffffff);
  put('treasure_chest', { x: -27, z: 9, yaw: 2.2, tilt: [0.1, 0.18], sink: 0.2 }, 0xffffff);
  put('dead_tree_trunk', { x: -15.5, z: 9.5, yaw: 0.9, scale: 1.6, sink: 0.08 }, 0xd8d0c0);
  put('root_cluster_01', { x: -30, z: -16, yaw: 2.5, scale: 1.2, sink: 0.1 }, 0xd0c8b8);
  put('coast_rocks_05', { x: -21.6, z: -1.4, yaw: 0.4, scale: 1.0, sink: 0.3 });
  for (const [x, z, yaw] of [[-5, 11, 0.5], [6, 3, 2.0], [-18, -6, 1.1], [-36, 14, 0.2], [12, 12, 1.5], [-52, 10, 2.2], [-28, -24, 0.9]]) put('sand_rocks_small_01', { x, z, yaw, sink: 0.12 });
  for (let i = 0; i < 14; i++) put('lambis_shell', { x: -8 + Math.sin(i * 7.1) * 10, z: 6 + Math.cos(i * 3.3) * 9, yaw: i, scale: 1.4, sink: 0.01 }, 0xffffff);
  const lantern = put('wooden_lantern_01', { x: -22.5, z: 6.5, yaw: 0.4, tilt: [0, 1.2], sink: 0.02 }, 0xffffff);
  const lamp = new THREE.PointLight(0xff9a40, 2.5, 6, 2);
  lamp.position.copy(lantern.position).add(new THREE.Vector3(0, 0.15, 0));
  root.add(lamp, glow(lamp.position, 0.6, 0xffa040, 1.2));

  // ---- dune grass along the back of the beach and on the berm; weed and wreckage on the wrack line
  {
    const rnd = (() => { let q = 12345; return () => ((q = (q * 16807) % 2147483647) / 2147483647); })();
    const spots: { x: number; z: number; size: number }[] = [];
    // thick on the dunes at the back, in drifts; a few tufts on the berm
    for (let i = 0; i < 520; i++) {
      const x = -72 + rnd() * 150, z = -41 + rnd() * 22;
      if (Math.abs(x - BAY.gorge.x) < 6 || Math.abs(x - BAY.falls.x) < 7) continue;
      if (rnd() > 0.35 + 0.65 * Math.max(0, Math.sin(x * 0.11) * Math.cos(z * 0.2 + 1))) continue;
      spots.push({ x, z, size: 0.8 + rnd() * 0.8 });
    }
    for (let i = 0; i < 60; i++) spots.push({ x: -50 + rnd() * 100, z: 5 + rnd() * 7, size: 0.5 + rnd() * 0.5 });
    for (const [x, z] of [[-17.5, -1.5], [-18.5, -3.5], [-13, -2], [-12, -4.5], [-23, -2.5]]) spots.push({ x, z, size: 1.1 });
    root.add(marram(spots));
    // weed strewn along the last high tide, glossy and dark
    const weed = new THREE.MeshStandardMaterial({ color: 0x1c2412, roughness: 0.3, metalness: 0 });
    for (let i = 0; i < 90; i++) {
      const x = -60 + rnd() * 120, z = shoreLine(x) - 7 + rnd() * 3;
      const pts: THREE.Vector3[] = [];
      let a = rnd() * 6.28, px = x, pz = z;
      for (let k = 0; k < 6; k++) { pts.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.02, pz)); a += (rnd() - 0.5) * 1.2; px += Math.cos(a) * 0.35; pz += Math.sin(a) * 0.35; }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.025, 4, false);
      tube.scale(1, 0.35, 1);
      const m = new THREE.Mesh(tube, weed);
      m.position.y = 0;
      m.receiveShadow = true;
      root.add(m);
    }
    // planks torn from her, half buried along the tideline
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.85 });
    for (let i = 0; i < 16; i++) {
      const len = 1 + rnd() * 2.6;
      const p = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.22), plankMat);
      const x = -52 + rnd() * 50, z = -8 + rnd() * 26;
      p.position.set(x, groundHeight(x, z) + 0.01, z);
      p.rotation.set((rnd() - 0.5) * 0.15, rnd() * 3.14, (rnd() - 0.5) * 0.2);
      p.castShadow = p.receiveShadow = true;
      root.add(p);
    }
    // a coil of rope that came ashore with them
    const coil: THREE.Vector3[] = [];
    for (let k = 0; k < 200; k++) { const t = k / 200, a = t * Math.PI * 10, r = 0.18 + t * 0.2; coil.push(new THREE.Vector3(-20 + Math.cos(a) * r, groundHeight(-20, 9) + 0.03 + Math.sin(t * 40) * 0.01, 9 + Math.sin(a) * r)); }
    for (let k = 0; k < 20; k++) coil.push(new THREE.Vector3(-19.6 + k * 0.12, groundHeight(-19, 9) + 0.03, 9.2 + Math.sin(k * 0.6) * 0.2));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 600, 0.025, 6, false), new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.9 })));
  }

  // ---- the dead mage, sitting against the rock with his journal open in his lap ----------------
  const mage = makeSeatedMage();
  const mx = -20.2, mz = 0.6;
  mage.group.position.set(mx, groundHeight(mx, mz) - 0.04, mz);
  mage.group.rotation.set(-0.12, 0.55, 0);
  root.add(mage.group);
  mage.group.updateMatrixWorld(true);
  const book = mage.book.clone().applyMatrix4(mage.group.matrixWorld);
  marks.book = book;
  const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2418, emissive: new THREE.Color(1.0, 0.7, 0.35), emissiveIntensity: 0.6 }));
  bookMesh.position.copy(book);
  bookMesh.rotation.set(-0.35, 0.55, 0);
  root.add(bookMesh);
  const bookLight = new THREE.PointLight(0xffb060, 0.08, 2.5, 2);
  bookLight.position.copy(book).add(new THREE.Vector3(0, 0.2, 0));
  root.add(bookLight, glow(book.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.7, 0xffc070, 1.0), beam(book, 9, 0.05, 0xffc070, 0.3));

  // ---- the stern lantern ----------------------------------------------------------------------
  const stern = new THREE.Vector3(14.5, 9.5, 0).applyMatrix4(ship.matrixWorld);
  const sternLight = new THREE.PointLight(0xffa050, 30, 30, 1.8);
  sternLight.position.copy(stern);
  root.add(sternLight, glow(stern, 2.5, 0xffb060, 1.4));
  marks.stern = stern;

  // ---- the stream: water running in its bed from the falls to the sea ----------------------------
  {
    const pts = STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const N = 160, L: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPoint(t), d = curve.getTangent(t);
      const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
      const w = 1.4 + t * 3.2;
      for (const k of [-1, 1]) {
        const x = p.x + side.x * w * k, z = p.z + side.z * w * k;
        L.push(x, groundHeight(p.x, p.z) + 0.16, z);
      }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const water = new THREE.MeshPhysicalMaterial({ color: 0x0c1a1e, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.88 });
    const stream = new THREE.Mesh(geo, water);
    stream.receiveShadow = true;
    root.add(stream);
  }

  // ---- the falls ------------------------------------------------------------------------------
  const F = BAY.falls;
  const fall = falls(new THREE.Vector3(F.x, 19, F.z + 4), new THREE.Vector3(F.x, groundHeight(F.x, F.z + 8), F.z + 6), 9);
  root.add(fall);

  // ---- far off: the peak, the tower, the wheel of cloud ------------------------------------------
  const P = BAY.peak;
  root.add(buildPeak(cliffTex, P));
  const summit = summitOf.clone().add(new THREE.Vector3(0, -8, 0));
  root.add(buildTower(summit, 160));
  root.add(buildVortex(summit.clone().add(new THREE.Vector3(0, 420, 0)), 1100));
  root.add(glow(summit.clone().add(new THREE.Vector3(0, 120, 0)), 220, 0xa070ff, 1.0));
  marks.summit = summit;

  // ---- air ----------------------------------------------------------------------------------------
  root.add(mistBank(new THREE.Vector3(-70, 1.5, 10), 70, 12, 0xd8b0a0, 0.28, 8, 2));
  root.add(mistBank(new THREE.Vector3(-40, 1, -48), 90, 10, 0xb8b0c8, 0.3, 8, 5));
  root.add(mistBank(new THREE.Vector3(-90, 0.5, 60), 120, 16, 0xe0b8a0, 0.25, 8, 9));

  return {
    root, marks,
    update(time) {
      oceanUniforms.uTime.value = time;
    },
  };
}
