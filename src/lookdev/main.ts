// Look-dev: concept stills of the world, drawn with the game's own assets and code but none
// of its limits. Driven from tools/lookdev.cjs, which calls window.LOOK.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { loadGlb } from '../art/gltf';
import kitSrc from '../../art/concepts/kit.js?raw';
import commonSrc from '../../art/concepts/common.js?raw';
import { buildBay } from '../world/coast/bay';
import { air, patchFog, stormSky } from '../world/coast/atmosphere';
import { groundHeight } from '../world/coast/layout';

const W = 1920, H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const base = './assets/';
const models = new Map<string, THREE.Object3D>();
async function model(name: string): Promise<THREE.Object3D> {
  let m = models.get(name);
  if (!m) {
    const g = await loadGlb(`${base}models/${name}.glb`);
    m = g.scene;
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    models.set(name, m);
  }
  return m.clone(true);
}
const skies = new Map<string, THREE.Texture>();
async function sky(name: string): Promise<THREE.Texture> {
  let t = skies.get(name);
  if (!t) {
    t = await new RGBELoader().loadAsync(`${base}sky/${name}.hdr`);
    t.mapping = THREE.EquirectangularReflectionMapping;
    skies.set(name, t);
  }
  return t;
}

/** Each model alone under a dusk sky, framed to fill the picture: a contact sheet of the kit. */
async function sheet(names: string[], skyName = 'dusk2'): Promise<string[]> {
  const out: string[] = [];
  const env = await sky(skyName);
  for (const name of names) {
    const scene = new THREE.Scene();
    scene.environment = env;
    scene.background = new THREE.Color(0x2a2a30);
    scene.environmentIntensity = 1;
    const m = await model(name);
    scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const r = size.length() / 2;
    const cam = new THREE.PerspectiveCamera(35, W / H, r / 100, r * 20);
    cam.position.copy(centre).add(new THREE.Vector3(r * 1.3, r * 0.7, r * 1.9));
    cam.lookAt(centre);
    const sun = new THREE.DirectionalLight(0xffe0c0, 2.5);
    sun.position.copy(centre).add(new THREE.Vector3(-r, r * 1.5, r * 0.6));
    sun.target.position.copy(centre);
    scene.add(sun, sun.target);
    renderer.render(scene, cam);
    out.push(renderer.domElement.toDataURL('image/jpeg', 0.85));
  }
  return out;
}

// ---- concept shots of the Wreck Shore ------------------------------------------------------------
let bay: Awaited<ReturnType<typeof buildBay>> | null = null;
let bayScene: THREE.Scene | null = null;
async function bayReady(): Promise<THREE.Scene> {
  if (bayScene) return bayScene;
  patchFog();
  const scene = new THREE.Scene();
  const kit = new Map<string, THREE.Object3D>();
  const names = ['dutch_ship_large_01', 'wooden_barrels_01', 'wooden_crate_01', 'treasure_chest', 'dead_tree_trunk', 'root_cluster_01', 'lambis_shell', 'wooden_lantern_01', 'gothic_statue'];
  await Promise.all(names.map(async (n) => kit.set(n, await model(n))));
  bay = await buildBay((n) => { const m = kit.get(n); if (!m) throw new Error('no model ' + n); return m.clone(true); }, base);
  scene.add(bay.root);
  stormSky(scene, renderer, STORM);
  air.falloff.value = 0.012;
  air.glowPower.value = 3;
  bayScene = scene;
  return scene;
}

const STORM = {
  sunAzimuth: THREE.MathUtils.degToRad(255), sunElevation: THREE.MathUtils.degToRad(14), sunColor: 0xd8d2c8, sunIntensity: 1.5,
  envIntensity: 1.9, fog: 0x7e858c, fogDensity: 0.0045, fogSun: 0xb8b0a6, at: new THREE.Vector3(-50, 0, 0), area: 360, brightness: 1.0, dark: 0.55,
};

interface Shot { pos: [number, number, number]; look: [number, number, number]; fov: number; exposure: number; grade?: Grade }
const SHOTS: Record<string, Shot> = {
  // the first thing you see: the headland on the right, the stacks through the spray, the surf
  waking: { pos: [10, 1.4, 12], look: [-160, 22, 130], fov: 55, exposure: 1.0 },
  // the beach fall, from the sand
  beachfall: { pos: [-22, 1.6, -6], look: [-38, 38, -52], fov: 58, exposure: 1.0 },
  // the arch with the great fall behind it, the river running out toward you
  arch: { pos: [26, 1.6, 6], look: [16, 34, -70], fov: 52, exposure: 1.0 },
  // in the canyon, under the great fall
  canyon: { pos: [19, 3.4, -74], look: [16, 48, -120], fov: 62, exposure: 1.05 },
  // the north wall running away toward the headland
  cliffs: { pos: [62, 1.8, -24], look: [-30, 46, -56], fov: 55, exposure: 1.0 },
  // the whole beach, along the north wall toward the headland and the stacks
  beach: { pos: [95, 2.0, 2], look: [-150, 20, 70], fov: 52, exposure: 1.0 },
  // the wreck, close
  wreck: { pos: [-48, 1.6, 30], look: [-72, 10, 14], fov: 55, exposure: 1.0 },
  // the sea, from the waterline
  sea: { pos: [-30, 1.6, 32], look: [-140, 10, 150], fov: 55, exposure: 1.0 },
};

async function shot(name: string): Promise<string> {
  const scene = await bayReady();
  if (name === 'plan') {
    const cam = new THREE.OrthographicCamera(-260, 260, 146, -146, 1, 2000);
    cam.position.set(-50, 800, 20);
    cam.up.set(0, 0, -1);
    cam.lookAt(-50, 0, 20);
    const grid = new THREE.GridHelper(600, 30, 0xffff00, 0x888800);
    grid.position.set(-50, 60, 20);
    scene.add(grid);
    renderer.toneMappingExposure = 1.2;
    renderer.render(scene, cam);
    scene.remove(grid);
    return renderer.domElement.toDataURL('image/jpeg', 0.92);
  }
  const s = SHOTS[name];
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 40000);
  cam.position.set(s.pos[0], s.pos[1] + Math.max(0, groundHeight(s.pos[0], s.pos[2])), s.pos[2]);
  cam.lookAt(new THREE.Vector3(...s.look));
  renderer.toneMappingExposure = s.exposure;
  bay!.update(3.0);
  renderer.render(scene, cam);
  return paintover(scene, cam, { shafts: 0, contrast: 1.08, saturation: 0.85, vignette: 0.35, bloom: 0.25, warm: -0.01, rain: 1, ...(s.grade ?? {}) });
}

// ---- the paintover: light shafts from the sun, bloom, grade, grain -------------------------------
type KitT = { begin(s: number): void; fromPixels(d: Uint8ClampedArray): void; finish(o: object): HTMLCanvasElement };
type CommonT = { shafts(o: object): void; glow(x: number, y: number, r: number, c: string, p: number, sq?: number): void };
let kit: { K: KitT; C: CommonT } | null = null;
function painting() {
  if (!kit) {
    const K = new Function(kitSrc + '\nreturn K;')() as KitT;
    const C = new Function('K', commonSrc + '\nreturn C;')(K) as CommonT;
    kit = { K, C };
  }
  return kit;
}
function pixels(): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.drawImage(renderer.domElement, 0, 0);
  return x.getImageData(0, 0, W, H).data;
}
interface Grade { shafts?: number; contrast?: number; saturation?: number; vignette?: number; bloom?: number; warm?: number; rain?: number }
/** Drizzle: thin slanted streaks, faint, blown on the wind. */
function rain(amount: number) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1100 * amount; i++) {
    const px = r() * W * 1.2 - W * 0.1, py = r() * H, len = 6 + r() * 18, a = 0.02 + r() * 0.05;
    x.strokeStyle = `rgba(220,226,232,${a})`;
    x.lineWidth = 0.5 + r() * 0.5;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px - len * 0.28, py + len); x.stroke();
  }
  const d = x.getImageData(0, 0, W, H).data;
  const { K } = painting();
  (K as unknown as { paint(m: null, f: (x: number, y: number, o: number[], c: number, i: number) => boolean | void, add?: boolean): void }).paint(null, (_x, _y, o, _c, i) => {
    const al = d[i * 4 + 3] / 255;
    if (al <= 0) return false;
    o[0] = o[1] = o[2] = 0.75 * al;
  }, true);
}

function paintover(scene: THREE.Scene, cam: THREE.PerspectiveCamera, g: Grade): string {
  const main = pixels();
  // where the sky shows: everything solid drawn black against a white sky
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!o.visible) return;
    if ((o as THREE.Sprite).isSprite || (o as THREE.Light).isLight || (m && (m.depthWrite === false || m.blending === THREE.AdditiveBlending))) { o.visible = false; hidden.push(o); }
  });
  const bg = scene.background, fog = scene.fog;
  scene.background = new THREE.Color(1, 1, 1);
  scene.fog = null;
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  renderer.render(scene, cam);
  const sky = pixels();
  scene.overrideMaterial = null;
  scene.background = bg; scene.fog = fog;
  for (const o of hidden) o.visible = true;

  const { K, C } = painting();
  K.begin(1);
  K.fromPixels(main);
  const sun = cam.position.clone().addScaledVector(air.sunDir.value, 5000).project(cam);
  const sx = (sun.x * 0.5 + 0.5) * W, sy = (-sun.y * 0.5 + 0.5) * H;
  if ((g.shafts ?? 0.8) > 0) {
    C.shafts({ x: sx, y: sy, threshold: 0.45, strength: g.shafts ?? 0.8, length: 0.92, color: '#ffc08a',
      source: (x: number, y: number) => sky[(Math.min(H - 1, Math.round(y)) * W + Math.min(W - 1, Math.round(x))) * 4] > 160 });
  }
  if (g.rain) rain(g.rain);
  const out = K.finish({ tonemap: false, contrast: g.contrast ?? 1.12, saturation: g.saturation ?? 1.06, vignette: g.vignette ?? 0.42, grain: 0.02,
    lift: [0.006, 0.006, 0.014], gain: [1.0 + (g.warm ?? 0.02), 1.0, 1.0 - (g.warm ?? 0.02)], aberration: 1.0,
    bloom: { threshold: 0.72, strength: g.bloom ?? 0.35, radii: [6, 22, 70] } });
  return out.toDataURL('image/jpeg', 0.92);
}

async function probe(): Promise<unknown> {
  const scene = await bayReady();
  const out: unknown[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).type === 'ShaderMaterial') {
      const b = new THREE.Box3().setFromObject(m);
      out.push({ name: m.name, min: b.min.toArray().map((v) => +v.toFixed(1)), max: b.max.toArray().map((v) => +v.toFixed(1)), visible: m.visible });
    }
  });
  return out;
}

(window as unknown as { LOOK: unknown }).LOOK = { probe, sheet, shot, model, sky, renderer, THREE };
