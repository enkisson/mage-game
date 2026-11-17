// The Wreck Shore, assembled: black sand and a storm sea, basalt cliffs with moss on every
// ledge, the arch and the great fall in the canyon, thin falls torn to spray, the wreck on the
// rocks, what the sea threw up after her, the ruins of whoever lived here, and the birds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BAY, OUTLINE, RIVER, greenness, groundHeight, plateauAt, rockDistance, shoreAt } from './layout';
import { buildGround, loadTextureSet } from './terrain';
import { buildOcean, oceanUniforms } from './ocean';
import { place, tatter, weather, buildPeak, buildTower, buildVortex, summitOf, type ModelSource } from './dressing';
import { mistBank, glow, beam, falls } from './airfx';
import { marram } from './grass';
import { arch, boulders, cliffFace, columns, rockMaterial, scatterNear, seaStack } from './cliffs';
import { makeSeatedMage } from '../../art/mage';

export interface Bay {
  root: THREE.Group;
  marks: Record<string, THREE.Vector3>;
  update(time: number): void;
}

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** The point on the cliff foot nearest (x, z), and which way the face looks there. */
function faceNear(x: number, z: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  let best = 1e9, k = 0;
  OUTLINE.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - z); if (d < best) { best = d; k = i; } });
  const a = OUTLINE[Math.max(0, k - 3)], b = OUTLINE[Math.min(OUTLINE.length - 1, k + 3)];
  const t = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
  return { p: new THREE.Vector3(OUTLINE[k][0], 0, OUTLINE[k][1]), n: new THREE.Vector3(-t.y, 0, t.x) };
}

export async function buildBay(source: ModelSource, assets: string): Promise<Bay> {
  const root = new THREE.Group();
  const marks: Record<string, THREE.Vector3> = {};
  const [sand, damp, rockTex, cliffTex] = await Promise.all([
    loadTextureSet(assets + 'textures/beach'), loadTextureSet(assets + 'textures/damp'), loadTextureSet(assets + 'textures/rock'), loadTextureSet(assets + 'textures/cliff'),
  ]);
  const ground = buildGround(sand, damp, rockTex, { minX: -300, maxX: 200, minZ: -170, maxZ: 230, cell: 0.7 });
  root.add(ground.mesh);
  root.add(buildOcean(ground));

  // ---- rock -------------------------------------------------------------------------------
  const basalt = rockMaterial(rockTex, { columnar: 0 });
  const columnar = rockMaterial(rockTex, { columnar: 1, moss: 0.8 });
  const solid = (geo: THREE.BufferGeometry, m: THREE.Material) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh; };
  solid(cliffFace(), basalt);
  solid(mergeGeometries(BAY.stacks.map((s, i) => seaStack(s.x, s.z, s.h, s.r, i + 1)))!, columnar);
  solid(arch(), basalt);
  // columns: the giant's stair at the headland's corner, and organ pipes along its sea face
  const stair = (cx: number, cz: number, rad: number, tall: number, seed: number) => (x: number, z: number) => {
    const d = rockDistance(x, z);
    const near = Math.max(0, 1 + d / rad);
    return Math.max(0, near * tall * (0.55 + 0.45 * hash(Math.round(x * 3), Math.round(z * 3) + seed)) + (hash(x, z) < 0.2 ? -3 : 0));
  };
  solid(columns(-98, 32, 13, stair(-98, 32, 13, 16, 1), 1), columnar);
  solid(columns(-135, 47, 9, stair(-135, 47, 9, 22, 2), 2), columnar);
  solid(columns(-60, -48, 7, stair(-60, -48, 7, 9, 3), 3, 1.2), columnar);
  // boulders: along the river, in the canyon, on the scree, and black and wet at the headland's foot
  const river: { x: number; z: number; r: number; sink?: number }[] = [];
  RIVER.forEach(([x, z], i) => {
    for (let k = 0; k < 6; k++) {
      const a = hash(i, k) * 6.28, d = 1 + hash(k, i) * 6;
      river.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, r: 0.4 + Math.pow(hash(i + k, 9), 2) * 1.8, sink: 0.2 });
    }
  });
  const spots = [
    ...river,
    ...scatterNear(16, -90, 26, 50, 0.6, 3.2, 4),
    ...scatterNear(-40, -42, 40, 40, 0.5, 2.6, 5),
    ...scatterNear(70, -42, 40, 30, 0.5, 2.4, 6),
    ...scatterNear(-82, 20, 16, 40, 0.6, 3.0, 7),
  ];
  solid(boulders(spots), basalt);

  // ---- the wreck ------------------------------------------------------------------------------
  const ship = source('dutch_ship_large_01');
  const s = BAY.ship;
  ship.rotation.order = 'YXZ';
  ship.rotation.set(s.pitch, s.yaw, s.heel);
  ship.position.set(s.x, groundHeight(s.x, s.z) - s.sink, s.z);
  ship.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (mesh.name.includes('sails')) mesh.material = tatter(mesh.material as THREE.MeshStandardMaterial, 0.56, 3);
  });
  weather(ship, 0x8a8078, 0.15);
  root.add(ship);
  ship.updateMatrixWorld(true);
  marks.ship = ship.position.clone();
  const stern = new THREE.Vector3(14.5, 9.5, 0).applyMatrix4(ship.matrixWorld);
  const sternLight = new THREE.PointLight(0xffa050, 18, 26, 1.8);
  sternLight.position.copy(stern);
  root.add(sternLight, glow(stern, 2.2, 0xffb060, 1.2));

  // ---- what the sea threw up after her --------------------------------------------------------
  const put = (name: string, p: Parameters<typeof place>[2], tint: number = 0xb0a8a0) => { const m = place(source, name, p); weather(m, tint, 0.1); root.add(m); return m; };
  put('wooden_barrels_01', { x: -44, z: 12, yaw: 0.6, sink: 0.3 });
  put('wooden_barrels_01', { x: -20, z: 18, yaw: 2.1, tilt: [0.3, 0.2], sink: 0.4 });
  put('wooden_crate_01', { x: -36, z: 16, yaw: 1.1, tilt: [0.25, 0.1], sink: 0.35 });
  put('wooden_crate_01', { x: -52, z: 4, yaw: 0.3, tilt: [0.0, 0.4], sink: 0.45 });
  put('treasure_chest', { x: -26, z: 10, yaw: 2.2, tilt: [0.1, 0.18], sink: 0.25 });
  put('dead_tree_trunk', { x: -6, z: 14, yaw: 0.9, scale: 2.2, sink: 0.1 }, 0x9a9088);
  put('root_cluster_01', { x: 38, z: -6, yaw: 2.5, scale: 1.4, sink: 0.15 }, 0x8a8078);
  for (let i = 0; i < 22; i++) put('lambis_shell', { x: -20 + hash(i, 1) * 40, z: 8 + hash(i, 2) * 12, yaw: i, scale: 1.4, sink: 0.01 }, 0xffffff);
  const lantern = put('wooden_lantern_01', { x: -1.5, z: 6.5, yaw: 0.4, tilt: [0, 1.2], sink: 0.02 }, 0xffffff);
  const lamp = new THREE.PointLight(0xff9a40, 2.2, 6, 2);
  lamp.position.copy(lantern.position).add(new THREE.Vector3(0, 0.15, 0));
  root.add(lamp, glow(lamp.position, 0.5, 0xffa040, 1.0));
  // her ship's boat, stove in and turned over by the surf
  {
    const hull = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    hull.scale(1.25, 0.9, 4.2);
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.85, side: THREE.DoubleSide });
    const boat = new THREE.Mesh(hull, wood);
    boat.rotation.set(0, 0.7, 0.15);
    boat.position.set(-30, groundHeight(-30, 22) - 0.2, 22);
    boat.castShadow = boat.receiveShadow = true;
    root.add(boat);
    // the keel and a few ribs showing through the hole in her
    for (let k = 0; k < 7; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 20, Math.PI), wood);
      rib.position.set(0, 0, -2.4 + k * 0.8);
      rib.scale.set(1, 0.8, 1);
      boat.add(rib);
    }
  }
  // the foremast, snapped off and driven into the sand like a marker
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e261f, roughness: 0.8 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 14, 10), wood);
    mast.position.set(-14, groundHeight(-14, 2) + 5.5, 2);
    mast.rotation.set(0.28, 0, -0.32);
    mast.castShadow = true;
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), wood);
    yard.rotation.z = Math.PI / 2 + 0.35;
    yard.position.y = 4;
    yard.castShadow = true;
    mast.add(yard);
    const rag = new THREE.Mesh(new THREE.PlaneGeometry(6, 5, 12, 10), tatter(new THREE.MeshStandardMaterial({ color: 0xb0a490, roughness: 0.9 }), 0.5, 9));
    const rp = rag.geometry.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setZ(i, Math.sin(rp.getX(i) * 0.9) * 0.4 + Math.sin(rp.getY(i) * 1.3) * 0.3);
    rag.geometry.computeVertexNormals();
    rag.position.set(0, 1.4, 0.2);
    rag.castShadow = true;
    yard.add(rag);
    rag.rotation.z = -Math.PI / 2;
    root.add(mast);
  }
  // planks and spars strewn along the tideline
  {
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.85 });
    for (let i = 0; i < 26; i++) {
      const len = 1 + hash(i, 4) * 3;
      const p = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.24), plankMat);
      const x = -60 + hash(i, 5) * 80, z = shoreAt(x) - 12 + hash(i, 6) * 10;
      p.position.set(x, groundHeight(x, z) + 0.01, z);
      p.rotation.set((hash(i, 7) - 0.5) * 0.15, hash(i, 8) * 3.14, (hash(i, 9) - 0.5) * 0.2);
      p.castShadow = p.receiveShadow = true;
      root.add(p);
    }
    // weed strewn along the last high tide, glossy and dark
    const weed = new THREE.MeshStandardMaterial({ color: 0x0c1008, roughness: 0.55 });
    for (let i = 0; i < 140; i++) {
      const x = -80 + hash(i, 10) * 160, z = shoreAt(x) - 11 + hash(i, 11) * 4;
      const pts: THREE.Vector3[] = [];
      let a = hash(i, 12) * 6.28, px = x, pz = z;
      for (let k = 0; k < 6; k++) { pts.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.02, pz)); a += (hash(i, k) - 0.5) * 1.2; px += Math.cos(a) * 0.35; pz += Math.sin(a) * 0.35; }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 4, false);
      root.add(new THREE.Mesh(tube, weed));
    }
  }

  // ---- ruins of whoever was here before -----------------------------------------------------
  // a ring of standing stones on the turf under the north wall, one fallen, one carved
  {
    const ring = new THREE.Vector3(48, 0, -36);
    const stones: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const x = ring.x + Math.cos(a) * 7, z = ring.z + Math.sin(a) * 5;
      const h = 2.2 + hash(k, 20) * 2.4;
      const g = new THREE.CylinderGeometry(0.45, 0.6, h, 6, 4);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * (1 + (hash(i, k) - 0.5) * 0.25), pp.getY(i), pp.getZ(i) * (1 + (hash(k, i) - 0.5) * 0.25));
      if (k === 6) { g.rotateX(Math.PI / 2 - 0.1); g.translate(x, groundHeight(x, z) + 0.4, z); }
      else { g.rotateZ((hash(k, 21) - 0.5) * 0.25); g.translate(x, groundHeight(x, z) + h / 2 - 0.4, z); }
      stones.push(g.toNonIndexed());
    }
    solid(mergeGeometries(stones)!, columnar);
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 0.35), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    const a0 = 0;
    sigil.position.set(ring.x + Math.cos(a0) * 7 - 0.62, groundHeight(ring.x + 7, ring.z) + 1.6, ring.z);
    sigil.rotation.y = -Math.PI / 2;
    root.add(sigil);
    marks.ring = ring;
  }
  // the head of a fallen statue, half drowned in the black sand by the river
  {
    const head = put('gothic_statue', { x: 30, z: -18, yaw: 2.4, tilt: [0.5, 0.3], scale: 3.2, sink: 1.4 }, 0x707070);
    marks.statue = head.position.clone();
  }

  // ---- water: the great fall, the thin falls, the river ---------------------------------------
  const F = BAY.falls;
  root.add(falls(new THREE.Vector3(F.x, F.top, F.z - 1), new THREE.Vector3(F.x, groundHeight(F.x, F.z + 5), F.z + 3), 11, { bright: 0.85, mist: 0x9aa2aa }));
  for (const [x, z, w] of [[-50, -50, 3.2], [92, -46, 2.6], [-90, -18, 3], [-20, -54, 2]] as [number, number, number][]) {
    const f = faceNear(x, z);
    const top = plateauAt(f.p.x - f.n.x * 3, f.p.z - f.n.z * 3);
    const foot = f.p.clone().addScaledVector(f.n, 3);
    root.add(falls(new THREE.Vector3(foot.x, top, foot.z), new THREE.Vector3(foot.x, groundHeight(foot.x, foot.z), foot.z), w, { bright: 0.65, spray: 1, mist: 0x8a9298 }));
  }
  {
    const pts = RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const N = 300, P: number[] = [], UV: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPoint(t), d = curve.getTangent(t);
      const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
      const w = 2.2 + Math.max(0, p.z + 40) * 0.05;
      for (const k of [-1, 1]) P.push(p.x + side.x * w * k, groundHeight(p.x, p.z) + 0.28, p.z + side.z * w * k), UV.push((k + 1) / 2, t * 160);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const water = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.1, transparent: true, opacity: 0.92 });
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = oceanUniforms.uTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n varying vec2 vRv;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vRv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; varying vec2 vRv;
          float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          // white water where it runs over the stones, in streaks along the flow
          float rap = wn(vec2(vRv.x * 7.0, vRv.y * 0.6 - uTime * 2.0)) * 0.6 + wn(vec2(vRv.x * 18.0, vRv.y * 2.0 - uTime * 3.0)) * 0.4;
          float white = smoothstep(0.55, 0.8, rap) * (0.6 + 0.4 * wn(vec2(vRv.y * 0.08, 1.0)));
          float edge = smoothstep(0.35, 0.5, abs(vRv.x - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.74, 0.76), max(white, edge * 0.5));`);
    };
    const r = new THREE.Mesh(geo, water);
    r.receiveShadow = true;
    root.add(r);
  }

  // ---- grass and moss on the scree --------------------------------------------------------------
  {
    const spots: { x: number; z: number; size: number }[] = [];
    for (let i = 0; i < 4000 && spots.length < 1400; i++) {
      const x = -95 + hash(i, 40) * 280, z = -125 + hash(i, 41) * 110;
      if (rockDistance(x, z) > -0.5 || greenness(x, z) < 0.45) continue;
      spots.push({ x, z, size: 0.6 + hash(i, 42) * 0.7 });
    }
    root.add(marram(spots, 11, [0x5e6a34, 0x3e4a22, 0x6a6040]));
  }

  // ---- the dead mage, sitting against a rock with his journal open in his lap -----------------
  const mx = 3.2, mz = 2.6;
  root.add(new THREE.Mesh(boulders([{ x: mx - 0.6, z: mz - 1.2, r: 1.2 }], 31), basalt));
  const mage = makeSeatedMage();
  mage.group.position.set(mx, groundHeight(mx, mz) - 0.04, mz);
  mage.group.rotation.set(-0.12, 0.35, 0);
  root.add(mage.group);
  mage.group.updateMatrixWorld(true);
  const book = mage.book.clone().applyMatrix4(mage.group.matrixWorld);
  marks.book = book;
  const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2418, emissive: new THREE.Color(1.0, 0.7, 0.35), emissiveIntensity: 0.6 }));
  bookMesh.position.copy(book);
  bookMesh.rotation.set(-0.35, 0.35, 0);
  root.add(bookMesh);
  const bookLight = new THREE.PointLight(0xffb060, 0.25, 3, 2);
  bookLight.position.copy(book).add(new THREE.Vector3(0, 0.2, 0));
  root.add(bookLight, glow(book.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.6, 0xffc070, 1.0), beam(book, 9, 0.05, 0xffc070, 0.35));

  // ---- birds -----------------------------------------------------------------------------------
  {
    const gull = (() => {
      const g = new THREE.BufferGeometry();
      const v = [0, 0, 0, -0.9, 0.18, -0.15, -0.35, 0.05, 0.12, 0, 0, 0, 0.9, 0.18, -0.15, 0.35, 0.05, 0.12, 0, 0, 0.25, 0, 0.02, -0.35, 0.06, 0, 0];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      return g;
    })();
    const parts: THREE.BufferGeometry[] = [];
    const flock = (cx: number, cy: number, cz: number, n: number, spread: number, seed: number, scale: number) => {
      for (let k = 0; k < n; k++) {
        const g = gull.clone();
        g.scale(scale, scale * (0.6 + hash(k, seed) * 0.8), scale);
        g.rotateY(hash(k, seed + 1) * 6.28);
        g.rotateZ((hash(k, seed + 2) - 0.5) * 0.6);
        g.translate(cx + (hash(k, seed + 3) - 0.5) * spread, cy + (hash(k, seed + 4) - 0.5) * spread * 0.3, cz + (hash(k, seed + 5) - 0.5) * spread);
        parts.push(g);
      }
    };
    flock(-120, 40, 60, 14, 60, 1, 0.7);
    flock(-40, 52, -40, 10, 40, 2, 0.7);
    flock(-200, 60, 150, 8, 40, 3, 0.8);
    flock(20, 30, -100, 6, 20, 4, 0.6);
    const birds = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.8, side: THREE.DoubleSide }));
    root.add(birds);
    // crows on the wreck's yards and rail
    const crowParts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const body = new THREE.SphereGeometry(0.16, 8, 6);
      body.scale(0.8, 0.9, 1.4);
      const at = new THREE.Vector3(-10 + k * 2.6, 6 + (k % 3) * 0.2, (k % 2) * 0.6 - 2.8).applyMatrix4(ship.matrixWorld);
      body.translate(at.x, at.y, at.z);
      crowParts.push(body);
    }
    root.add(new THREE.Mesh(mergeGeometries(crowParts)!, new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5 })));
  }

  // ---- far off: the peak, the tower, the wheel of cloud -----------------------------------------
  const P = BAY.peak;
  root.add(buildPeak(cliffTex, P));
  const summit = summitOf.clone().add(new THREE.Vector3(0, -8, 0));
  root.add(buildTower(summit, 180));
  root.add(buildVortex(summit.clone().add(new THREE.Vector3(0, 420, 0)), 1200));
  root.add(glow(summit.clone().add(new THREE.Vector3(0, 140, 0)), 240, 0xa070ff, 0.9));
  marks.summit = summit;

  // ---- spray and mist ----------------------------------------------------------------------------
  // spray hanging over the surf all along the beach, thick where it breaks on rock
  for (let k = 0; k < 9; k++) {
    const x = -70 + k * 20, z = shoreAt(x) + 14;
    root.add(mistBank(new THREE.Vector3(x, 1.5, z), 34, 10, 0xc8ccd0, 0.3, 6, 40 + k));
  }
  for (const s2 of BAY.stacks) root.add(mistBank(new THREE.Vector3(s2.x, 2, s2.z), s2.r * 5, 18, 0xd0d4d8, 0.45, 7, s2.h));
  root.add(mistBank(new THREE.Vector3(-110, 2, 48), 80, 22, 0xd0d4d8, 0.45, 10, 77));
  root.add(mistBank(new THREE.Vector3(-94, 2, 10), 30, 16, 0xc8ccd0, 0.35, 6, 78));
  // mist lying in the canyon
  root.add(mistBank(new THREE.Vector3(16, 6, -95), 28, 20, 0xa8aeb4, 0.4, 8, 90));
  root.add(mistBank(new THREE.Vector3(16, 30, -105), 34, 30, 0xb8bec4, 0.35, 8, 91));

  return {
    root, marks,
    update(time) {
      oceanUniforms.uTime.value = time;
    },
  };
}
