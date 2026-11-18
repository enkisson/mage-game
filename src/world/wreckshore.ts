// The Wreck Shore, played: the storm bay of the concept scenes, with the story and the fight laid
// out on it.
//
// You wake on the black sand beside the dead mage, his journal open in his lap, with your ship
// heeled over against the headland to the west. The first page is in his hands; the second is
// nailed to the foremast the sea drove into the beach; the third lies in the ring of standing
// stones under the north wall. East along the beach the Gloam rise from the surf where the road
// comes down the cliff, and that is the stand: a ward of light closes the beach behind you, and
// another bars the road until the tide is beaten. On an outcrop of columns in the middle of it is
// the fourth page. Then the road climbs the cliff in switchbacks to the ruined gate, and the way on.
import * as THREE from 'three';
import { loadGlb } from '../art/gltf';
import { buildBay } from './coast/bay';
import { air, patchFog, stormSky } from './coast/atmosphere';
import { columns } from './coast/cliffs';
import { groundHeight, shoreAt } from './coast/layout';
import { ROAD } from './coast/road';
import { mergeForCollision } from './world';
import type { JournalDef, Level, SealDef, StandDef } from './level';
import type { NightSky } from '../game/sky';

/** The models the bay is dressed with. */
const KIT = ['dutch_ship_large_01', 'wooden_barrels_01', 'wooden_crate_01', 'treasure_chest', 'dead_tree_trunk', 'root_cluster_01', 'lambis_shell', 'wooden_lantern_01', 'gothic_statue'];

/** Where you can go: the beach, the canyon, the road and the gate. Walls stand at the edges. */
const BOUNDS = { minX: -100, maxX: 205, minZ: -132, maxZ: 42 };

/** A storm at dusk: a low sun in the west-south-west under a lid of cloud. */
const STORM = {
  sunAzimuth: THREE.MathUtils.degToRad(255), sunElevation: THREE.MathUtils.degToRad(14), sunColor: 0xdcc8b0, sunIntensity: 2.3,
  envIntensity: 1.55, fog: 0x6c737b, fogDensity: 0.0028, fogSun: 0x9a948c, at: new THREE.Vector3(0, 0, 0), area: 120, brightness: 1.0, dark: 0.55,
};

/** The stand: on the beach at the foot of the road. */
const STAND = { x: 122, z: -6, r: 20 };
/** The outcrop in the middle of it: a drum of columns 5 m high, climbed by a spiral of shorter ones. */
const OUTCROP = { x: 108, z: -15, r: 6.4, h: 5 };
/** A low shelf of columns, a jump too high for you and not for them. */
const LEDGE = { x: 136, z: 3, r: 2.7, h: 2.2 };

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** The storm sky as the game's night: the same light, darkening and cooling as the night falls. */
function stormNight(scene: THREE.Scene, renderer: THREE.WebGLRenderer): NightSky {
  patchFog();
  const { sun } = stormSky(scene, renderer, { ...STORM, postToned: true });
  air.falloff.value = 0.012;
  air.glowPower.value = 3;
  // One shadow map over the whole bay. The cliffs are 85 m high and the sun is low, so they
  // shade each other and the beach from a long way off; a map that only followed you would
  // leave every far column face in full sun.
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  Object.assign(cam, { left: -205, right: 205, top: 205, bottom: -205, near: 1, far: 1100 });
  cam.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096);
  const keyDir = sun.position.clone().sub(sun.target.position).normalize();
  const fog = scene.fog as THREE.FogExp2;
  const dusk = { sun: sun.intensity, env: scene.environmentIntensity, fog: fog.color.clone(), density: fog.density };
  const darkFog = new THREE.Color(0x2a2f38);
  return {
    key: sun,
    keyDir,
    shadowDistance: 450,
    shadowCentre: new THREE.Vector3(45, 20, -40),
    update() { /* the sky is drawn at infinity; nothing follows the camera */ },
    usePhoto() { /* the storm is its own sky */ },
    setNight(n: number) {
      sun.intensity = dusk.sun * (1 - 0.6 * n);
      scene.environmentIntensity = dusk.env * (1 - 0.45 * n);
      fog.color.copy(dusk.fog).lerp(darkFog, n * 0.7);
      fog.density = dusk.density * (1 + 0.3 * n);
    },
    setShadowSize(size: number) {
      if (sun.shadow.mapSize.x === size) return;
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
  };
}

/** The ground you walk on, sampled exactly as the drawn ground is, but only where you can go. */
function groundCollider(): THREE.BufferGeometry {
  // the drawn ground is a 0.7 m grid from (-300, -170); keep to its vertices so the two agree
  const cell = 0.7, ox = -300, oz = -170;
  const i0 = Math.floor((BOUNDS.minX - 4 - ox) / cell), i1 = Math.ceil((BOUNDS.maxX + 4 - ox) / cell);
  const j0 = Math.floor((BOUNDS.minZ - 4 - oz) / cell), j1 = Math.ceil((BOUNDS.maxZ + 4 - oz) / cell);
  const nx = i1 - i0 + 1, nz = j1 - j0 + 1;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = ox + (i0 + i) * cell, z = oz + (j0 + j) * cell, k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = groundHeight(x, z); pos[k + 2] = z;
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export async function buildWreckShore(assets: string, progress?: (done: number, total: number) => void): Promise<Level> {
  patchFog();
  // ---- the bay itself ---------------------------------------------------------------------------
  const kit = new Map<string, THREE.Object3D>();
  let done = 0;
  await Promise.all(KIT.map(async (n) => {
    const g = await loadGlb(`${assets}models/${n}.glb`);
    g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    kit.set(n, g.scene);
    progress?.(++done, KIT.length + 1);
  }));
  const bay = await buildBay((n) => {
    const m = kit.get(n);
    if (!m) throw new Error('no model ' + n);
    return m.clone(true);
  }, assets);
  progress?.(KIT.length + 1, KIT.length + 1);
  const root = bay.root;
  const marks = bay.marks;
  const solids = [...bay.solids];
  const g = (x: number, z: number) => groundHeight(x, z);
  const at = (x: number, z: number, lift = 0) => new THREE.Vector3(x, g(x, z) + lift, z);

  // ---- the outcrop and the ledge in the stand -------------------------------------------------------
  {
    const O = OUTCROP;
    const outcrop = columns(O.x, O.z, O.r, (x, z) => {
      const dx = x - O.x, dz = z - O.z, r = Math.hypot(dx, dz);
      if (r < 3.4) return O.h + (hash(Math.round(x * 3), Math.round(z * 3)) - 0.5) * 0.12;
      // a spiral of shorter columns round it, rising a step at a time to the top: the long way up
      const t = ((Math.atan2(dz, dx) + Math.PI * 0.35) / (Math.PI * 2) + 1) % 1;
      return 0.45 + t * (O.h - 0.55);
    }, 7, 1.15, true);
    const ledge = columns(LEDGE.x, LEDGE.z, LEDGE.r, () => LEDGE.h, 8, 1.1, true);
    for (const geo of [outcrop, ledge]) {
      const m = new THREE.Mesh(geo, bay.columnar);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      solids.push(m);
    }
  }

  // ---- the story ----------------------------------------------------------------------------------
  const mast = at(-14, 2.4, 1.25);
  const ring = marks.ring ?? new THREE.Vector3(48, 0, -36);
  const ringPage = at(ring.x + 0.6, ring.z + 0.9, 0.25);
  const outcropTop = at(OUTCROP.x, OUTCROP.z, OUTCROP.h);
  const journals: JournalDef[] = [
    {
      id: 'shore-1', teaches: 'fire', title: 'The first page',
      position: marks.book.clone(),
      text: [
        'If you are reading this, the tide has given you to the island as it gave me. I am sorry. It does not give anything back.',
        'You will not last a night here without a word to speak. So: the first one. Every apprentice begins with it, because it is the one that least needs to be understood.',
        'Hold it in your mind like a coal in your hand. Say it once and it flies. Say it twice and it will not stop where you meant it to.',
      ],
    },
    {
      id: 'shore-2', teaches: 'push', title: 'Nailed to the foremast',
      position: mast,
      text: [
        'They cannot climb. I learned that on a deck like the one behind you, with my back to the rail, watching them walk the long way round.',
        'High ground buys you time, never safety. So learn the second word: away. It is not a weapon. A cliff is a weapon. This only introduces them.',
        'A word alone is a gesture. Two together are a thought. Try it beside the first.',
      ],
    },
    {
      id: 'shore-3', teaches: 'stone', title: 'A page weighted with a pebble',
      position: ringPage,
      text: [
        'The island listens. Speak its own word and it answers with itself: thrown, if you ask once.',
        'Ask twice and it rises under your feet. I have stood on a pillar of my own making and watched the tide break against it. It does not last. Nothing I have made here lasts.',
        'Further along, where the road comes down the cliff, is where they gather. Go up before you go in.',
      ],
    },
    {
      id: 'shore-4', teaches: 'wind', title: 'A page pinned under a knife',
      position: outcropTop.clone().add(new THREE.Vector3(0, 0.3, 0)),
      text: [
        'You found a way up. Good. That is the whole of the art: there is always a way up.',
        'The fourth word has no weight at all. Twice, beneath you, and you will go where no stair leads. Beneath them, and the fall will do your work.',
        'Four words are enough to climb the road. They are not enough for what waits at the top. I had eight, and I am what you found on the sand.',
      ],
    },
  ];

  // ---- the stand at the foot of the road ---------------------------------------------------------------
  // the Gloam rise out of the surf, and the spitters take the ledge
  const surf = (x: number) => at(x, shoreAt(x) - 3);
  const [west, east, perch] = [surf(110), surf(138), at(LEDGE.x, LEDGE.z, LEDGE.h)];
  // the ward behind you spans the beach from the cliff foot to the sea; the one ahead bars the road
  const wardX = 86;
  const behind: SealDef = { at: at(wardX, -9), facing: Math.PI / 2, width: 84, height: 12, role: 'entry' };
  const leg = ROAD.pieces.find((p) => p.kind === 'leg')!.pts;
  const bar = leg[8], barNext = leg[9];
  const along = new THREE.Vector2(barNext.x - bar.x, barNext.z - bar.z).normalize();
  const ahead: SealDef = {
    at: new THREE.Vector3(bar.x, bar.y, bar.z),
    // the ward spans across the road: its face turned to look along it
    facing: Math.atan2(along.x, along.y) + Math.PI / 2,
    width: 10, height: 9, role: 'exit',
  };
  const stand: StandDef = {
    id: 'road', name: 'The Foot of the Road',
    center: at(STAND.x, STAND.z), radius: STAND.r,
    seals: [behind, ahead],
    waves: [
      [{ kind: 'drowned', count: 3, at: west, delay: 0.5 }],
      [
        { kind: 'drowned', count: 2, at: east, delay: 0.5 },
        { kind: 'spitter', count: 1, at: perch, delay: 1.5 },
        { kind: 'drowned', count: 2, at: west, delay: 5 },
      ],
      [
        { kind: 'drowned', count: 3, at: east, delay: 0.5 },
        { kind: 'spitter', count: 1, at: perch, delay: 1 },
        { kind: 'spitter', count: 1, at: east, delay: 3 },
        { kind: 'drowned', count: 3, at: west, delay: 6 },
      ],
    ],
  };

  // ---- walls at the edge of the world ------------------------------------------------------------------
  const walls = new THREE.Group();
  {
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const box = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 400, d), hidden);
      m.position.set(x, 100, z);
      walls.add(m);
    };
    const w = BOUNDS.maxX - BOUNDS.minX, d = BOUNDS.maxZ - BOUNDS.minZ;
    const cx = (BOUNDS.minX + BOUNDS.maxX) / 2, cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
    box(w, 1, cx, BOUNDS.minZ);
    box(w, 1, cx, BOUNDS.maxZ);
    box(1, d, BOUNDS.minX, cz);
    box(1, d, BOUNDS.maxX, cz);
  }
  const ground = new THREE.Mesh(groundCollider());
  const collision = mergeForCollision([...solids, ground, walls]);

  // ---- where things are -----------------------------------------------------------------------------
  const spawnAt = at(6.4, 4.4, 0.05);
  const landmarks: Record<string, THREE.Vector3> = {
    book: marks.book.clone(),
    mast,
    ring: ringPage,
    ship: marks.ship.clone(),
    outcrop: outcropTop,
    outcropFoot: at(OUTCROP.x - 9, OUTCROP.z + 6),
    ledge: at(LEDGE.x, LEDGE.z, LEDGE.h),
    ledgeFoot: at(LEDGE.x + 4.2, LEDGE.z + 0.4),
    stand: at(STAND.x, STAND.z),
    open: at(124, 2),
    roadStart: ROAD.start.clone(),
    roadTop: ROAD.end.clone(),
    gate: (marks.gate ?? ROAD.end).clone(),
    exit: (marks.exit ?? ROAD.end).clone(),
  };
  // the way up, as points to walk between: the foot of the causeway, then the end of each piece
  // (way0..wayN the ends of the pieces; path0..pathN every few metres along the paving)
  ROAD.pieces.forEach((piece, i) => {
    if (i === 0) landmarks.way0 = new THREE.Vector3(piece.pts[0].x, piece.pts[0].y, piece.pts[0].z);
    const e = piece.pts[piece.pts.length - 1];
    landmarks[`way${i + 1}`] = new THREE.Vector3(e.x, e.y, e.z);
  });
  ROAD.path.filter((_, i) => i % 4 === 0 || i === ROAD.path.length - 1).forEach((p, i) => { landmarks[`path${i}`] = new THREE.Vector3(p.x, p.y, p.z); });

  return {
    id: 'wreck-shore',
    name: 'The Wreck Shore',
    night: 'Night I',
    root,
    collision,
    spawn: { position: spawnAt, yaw: 1.62 },
    journals,
    stands: [stand],
    bounds: BOUNDS,
    waterLevel: 0,
    landmarks,
    sky: stormNight,
    grade: { contrast: 1.12, saturation: 0.85, vignette: 0.38, bloom: [0.22, 0.32], exposure: [1.0, 1.08] },
    // night falls as you go east toward the road, and climbs on with it
    progress: (p) => THREE.MathUtils.clamp((p.x - 20) / 130, 0, 1) * 0.7 + THREE.MathUtils.clamp((p.y - 10) / 50, 0, 1) * 0.3,
    exit: { at: landmarks.gate, prompt: 'Beyond the gate the land is not built yet. Call the tide again, stronger' },
    update(time) {
      bay.update(time);
    },
  };
}

