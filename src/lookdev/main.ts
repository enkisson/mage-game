// Look-dev: concept stills of the world, drawn with the game's own assets and code but none
// of its limits. Driven from tools/lookdev.cjs, which calls window.LOOK.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { loadGlb } from '../art/gltf';
import kitSrc from '../../art/concepts/kit.js?raw';
import commonSrc from '../../art/concepts/common.js?raw';
import { buildBay } from '../world/coast/bay';
import { oceanUniforms } from '../world/coast/ocean';
import { air, applySky, loadSky, patchFog } from '../world/coast/atmosphere';
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
let sunLight: THREE.DirectionalLight | null = null;
const DUSK = {
  sunAzimuth: THREE.MathUtils.degToRad(250), sunElevation: THREE.MathUtils.degToRad(2.5), sunColor: 0xff8a50, sunIntensity: 2.2,
  envIntensity: 0.9, backgroundIntensity: 0.9, fog: 0x6a5a78, fogDensity: 0.0006, fogSun: 0xff9a60, at: new THREE.Vector3(-30, 0, 0), area: 220,
};
const NIGHT = {
  sunAzimuth: THREE.MathUtils.degToRad(232), sunElevation: THREE.MathUtils.degToRad(14), sunColor: 0x9ab8ff, sunIntensity: 0.32,
  envIntensity: 0.12, backgroundIntensity: 0.1, fog: 0x0c1220, fogDensity: 0.0008, fogSun: 0x2a3858, at: new THREE.Vector3(-30, 0, 0), area: 220,
};
let mood = 'dusk';
/** Dusk, or the same bay under the moon. */
async function setMood(scene: THREE.Scene, want: 'dusk' | 'night') {
  if (mood === want) return;
  mood = want;
  if (sunLight) { scene.remove(sunLight, sunLight.target); sunLight.dispose(); }
  if (want === 'night') {
    // the moon in this sky stands at its brightest column
    sunLight = applySky(scene, renderer, await loadSky(base + 'sky/moon.hdr', MOON_U), NIGHT);
    oceanUniforms.uNight.value = 1;
  } else {
    sunLight = applySky(scene, renderer, await loadSky(base + 'sky/dusk.hdr', 1301 / 2048), DUSK);
    oceanUniforms.uNight.value = 0;
  }
}
const MOON_U = 0.6;
let bayScene: THREE.Scene | null = null;
async function bayReady(): Promise<THREE.Scene> {
  if (bayScene) return bayScene;
  patchFog();
  const scene = new THREE.Scene();
  const kit = new Map<string, THREE.Object3D>();
  const names = ['coastal_cliff_01', 'coastal_cliff_02', 'coastal_cliff_04', 'coast_rocks_01', 'coast_rocks_03', 'coast_rocks_05', 'coast_land_rocks_02', 'coast_land_rocks_03',
    'coast_line_02', 'sand_rocks_small_01', 'rock_face_01', 'mountainside', 'dutch_ship_large_01', 'wooden_barrels_01', 'wooden_crate_01', 'treasure_chest',
    'dead_tree_trunk', 'root_cluster_01', 'lambis_shell', 'wooden_lantern_01'];
  await Promise.all(names.map(async (n) => kit.set(n, await model(n))));
  bay = await buildBay((n) => { const m = kit.get(n); if (!m) throw new Error('no model ' + n); return m.clone(true); }, base);
  scene.add(bay.root);
  sunLight = applySky(scene, renderer, await loadSky(base + 'sky/dusk.hdr', 1301 / 2048), DUSK);
  air.falloff.value = 0.0022;
  bayScene = scene;
  return scene;
}

const SHOTS: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number; exposure: number; grade?: Grade; night?: boolean }> = {
  waking: { pos: [-13.5, 1.2, 5.5], look: [-64, 10, -5], fov: 50, exposure: 0.9, grade: { shafts: 1.4 } },
  mage: { pos: [-16.6, 1.0, 3.2], look: [-20.4, 0.6, 0.4], fov: 45, exposure: 0.9 },
  falls: { pos: [-14, 1.7, -12], look: [-30, 12, -44], fov: 55, exposure: 0.9 },
  arrival: { pos: [-30, 4, 58], look: [-58, 11, -8], fov: 48, exposure: 0.9, grade: { shafts: 1.2 } },
  hull: { pos: [-52, 1.0, 12], look: [-70, 7, -2], fov: 58, exposure: 0.95, grade: { shafts: 1.0 } },
  night: { pos: [-6, 1.4, 8], look: [-70, 6, 30], fov: 55, exposure: 1.1, night: true, grade: { shafts: 0.4, warm: -0.04, bloom: 0.5 } },
};

async function shot(name: string): Promise<string> {
  const scene = await bayReady();
  if (name === 'plan') {
    // straight down over the bay, with a grid every 20 m, for laying things out
    const cam = new THREE.OrthographicCamera(-160, 160, 90, -90, 1, 2000);
    cam.position.set(-30, 600, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(-30, 0, 0);
    const grid = new THREE.GridHelper(400, 20, 0xffff00, 0x888800);
    grid.position.set(-30, 40, 0);
    scene.add(grid);
    renderer.toneMappingExposure = 1.4;
    renderer.render(scene, cam);
    scene.remove(grid);
    return renderer.domElement.toDataURL('image/jpeg', 0.92);
  }
  const s = SHOTS[name];
  await setMood(scene, s.night ? 'night' : 'dusk');
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 40000);
  cam.position.set(s.pos[0], s.pos[1] + Math.max(0, groundHeight(s.pos[0], s.pos[2])), s.pos[2]);
  cam.lookAt(new THREE.Vector3(...s.look));
  renderer.toneMappingExposure = s.exposure;
  bay!.update(3.0);
  renderer.render(scene, cam);
  return paintover(scene, cam, s.grade ?? {});
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
interface Grade { shafts?: number; contrast?: number; saturation?: number; vignette?: number; bloom?: number; warm?: number }
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
