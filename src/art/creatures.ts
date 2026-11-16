// The dead crew. The men who went down with your ship, walking out of the surf in what
// they drowned in. Their bodies are sculpted in code (see body.ts), dressed and weathered
// by a shader, hung with rags and weed, and moved by a small set of procedural motions that
// are always blended, never switched.
import * as THREE from 'three';
import { sculpt, type BoneDef, type Figure, type Lump, type Sculpted } from './body';

type V3 = [number, number, number];

export interface CreatureModel {
  root: THREE.Group;
  /** Pose the body. `t` is the creature's own clock, `move` 0–1 how fast it is walking. */
  animate(t: number, move: number, pose: Pose, poseT: number): void;
  /** Brighten when hurt, 0–1. */
  flash(amount: number): void;
  /** World-space point attacks come from (hands, or mouth). */
  muzzle: THREE.Object3D;
  height: number;
}

export type Pose = 'rise' | 'walk' | 'windup' | 'strike' | 'stagger' | 'air' | 'crouch' | 'dead';

// ---- the figure --------------------------------------------------------------------------

interface Build {
  /** Extra girth at the belly, metres. */
  belly: number;
  /** Thicker or thinner all over. */
  bulk: number;
  cap: boolean;
  /** Which forearm the sleeve has been torn from: 1, -1, or 0 for neither. */
  bare: number;
}

const ARM_DIR: V3 = [0.42, -0.905, 0.05];
const along = (from: V3, d: number, side: number): V3 => [from[0] + ARM_DIR[0] * d * side, from[1] + ARM_DIR[1] * d, from[2] + ARM_DIR[2] * d];

function crew(b: Build): Figure {
  const k = b.bulk;
  const bones: BoneDef[] = [
    { name: 'hips', parent: null, at: [0, 0.98, 0] },
    { name: 'spine', parent: 'hips', at: [0, 1.12, 0], tip: [0, 1.3, 0] },
    { name: 'chest', parent: 'spine', at: [0, 1.3, 0], tip: [0, 1.48, 0] },
    { name: 'neck', parent: 'chest', at: [0, 1.5, 0] },
    { name: 'head', parent: 'neck', at: [0, 1.58, 0.01], tip: [0, 1.78, 0.02] },
  ];
  const lumps: Lump[] = [
    { a: [0, 0.97, 0], b: [0, 1.03, 0], ra: 0.155 * k, rb: 0.15 * k, flat: [1, 1, 0.74], wear: 3 },
    { a: [0, 1.06, 0.012 + b.belly * 0.5], b: [0, 1.2, 0.01 + b.belly * 0.4], ra: 0.14 * k + b.belly, rb: 0.15 * k + b.belly * 0.6, flat: [1, 1, 0.74 + b.belly * 1.2], wear: 1, blend: 0.05 },
    { a: [0, 1.26, 0], b: [0, 1.4, -0.008], ra: 0.165 * k, rb: 0.158 * k, flat: [1.06, 1, 0.68], wear: 2, blend: 0.05 },
    { a: [-0.165, 1.452, -0.005], b: [0.165, 1.452, -0.005], ra: 0.074 * k, rb: 0.074 * k, wear: 2, blend: 0.05 },
    { a: [0, 1.47, 0], b: [0, 1.585, 0.016], ra: 0.054 * k, rb: 0.05 * k, wear: 0 },
    // the head: skull, jaw hanging a little open, brow, nose, hollow eyes
    { a: [0, 1.685, 0.0], b: [0, 1.7, 0.03], ra: 0.099, rb: 0.094, flat: [0.9, 1.08, 1.05], wear: 0 },
    { a: [0, 1.6, 0.045], b: [0, 1.615, 0.078], ra: 0.058, rb: 0.046, flat: [0.92, 1, 1], wear: 0, blend: 0.03 },
    { a: [-0.05, 1.692, 0.094], b: [0.05, 1.692, 0.094], ra: 0.018, rb: 0.018, wear: 0, blend: 0.02 },
    { a: [0, 1.668, 0.112], b: [0, 1.638, 0.128], ra: 0.015, rb: 0.016, wear: 0, blend: 0.016 },
    { a: [-0.05, 1.65, 0.07], b: [-0.058, 1.63, 0.06], ra: 0.03, rb: 0.024, wear: 0, blend: 0.025 },
    { a: [0.05, 1.65, 0.07], b: [0.058, 1.63, 0.06], ra: 0.03, rb: 0.024, wear: 0, blend: 0.025 },
    { a: [-0.039, 1.672, 0.108], b: [-0.039, 1.672, 0.12], ra: 0.021, rb: 0.021, wear: 0, cut: true },
    { a: [0.039, 1.672, 0.108], b: [0.039, 1.672, 0.12], ra: 0.021, rb: 0.021, wear: 0, cut: true },
    { a: [-0.024, 1.598, 0.105], b: [0.024, 1.598, 0.105], ra: 0.013, rb: 0.013, wear: 0, cut: true },
  ];
  if (b.cap) lumps.push({ a: [0, 1.745, -0.005], b: [0, 1.76, -0.02], ra: 0.102, rb: 0.085, flat: [0.93, 0.7, 1.04], wear: 2, blend: 0.012 });

  for (const side of [1, -1]) {
    const s = side === 1 ? 'L' : 'R';
    const shoulder: V3 = [0.2 * side, 1.46, 0];
    const elbow = along(shoulder, 0.29, side), wrist = along(elbow, 0.27, side), knuckle = along(wrist, 0.095, side), tip = along(wrist, 0.18, side);
    bones.push(
      { name: 'arm' + s, parent: 'chest', at: shoulder },
      { name: 'fore' + s, parent: 'arm' + s, at: elbow },
      { name: 'hand' + s, parent: 'fore' + s, at: wrist, tip },
    );
    lumps.push(
      { a: shoulder, b: elbow, ra: 0.06 * k, rb: 0.05 * k, wear: 2 },
      { a: elbow, b: wrist, ra: (b.bare === side ? 0.042 : 0.048) * k, rb: (b.bare === side ? 0.032 : 0.04) * k, wear: b.bare === side ? 0 : 2 },
      { a: wrist, b: knuckle, ra: 0.034, rb: 0.036, flat: [1, 1, 0.5], wear: 0, blend: 0.02 },
    );
    // hooked fingers and a thumb
    for (let f = -1; f <= 1; f++) {
      const base: V3 = [knuckle[0] + 0.905 * f * 0.024 * side, knuckle[1] + 0.42 * f * 0.024, knuckle[2]];
      const end = along(base, 0.075 - Math.abs(f) * 0.012, side);
      lumps.push({ a: base, b: [end[0], end[1], end[2] + 0.028], ra: 0.0125, rb: 0.008, wear: 0, blend: 0.012 });
    }
    lumps.push({ a: [wrist[0] - 0.02 * side, wrist[1] - 0.03, wrist[2] + 0.012], b: [wrist[0] - 0.035 * side, wrist[1] - 0.085, wrist[2] + 0.04], ra: 0.014, rb: 0.009, wear: 0, blend: 0.015 });

    const hip: V3 = [0.1 * side, 0.95, 0], knee: V3 = [0.11 * side, 0.51, 0.015], ankle: V3 = [0.115 * side, 0.09, -0.01], toe: V3 = [0.125 * side, 0.035, 0.17];
    bones.push(
      { name: 'leg' + s, parent: 'hips', at: hip },
      { name: 'shin' + s, parent: 'leg' + s, at: knee },
      { name: 'foot' + s, parent: 'shin' + s, at: ankle, tip: toe },
    );
    lumps.push(
      { a: hip, b: knee, ra: 0.09 * k, rb: 0.066 * k, wear: 3 },
      { a: knee, b: [knee[0], 0.36, knee[2]], ra: 0.066 * k, rb: 0.058 * k, wear: 3 },
      { a: [knee[0], 0.36, knee[2]], b: ankle, ra: 0.052 * k, rb: 0.038, wear: 0 },
      { a: ankle, b: toe, ra: 0.045, rb: 0.04, flat: [1, 0.7, 1], wear: 0, blend: 0.03 },
    );
  }
  return { bones, lumps, min: [-0.6, 0, -0.26], max: [0.6, 1.86, 0.34], cell: 0.02 };
}

const BUILDS: Build[] = [
  { belly: 0, bulk: 0.94, cap: true, bare: 1 },
  { belly: 0.02, bulk: 1.06, cap: false, bare: -1 },
  { belly: 0, bulk: 1, cap: false, bare: 0 },
];
/** The bloated one: weeks in the water. */
const BLOATED: Build = { belly: 0.13, bulk: 1.16, cap: false, bare: 0 };

const sculpted = new Map<Build, Sculpted>();
function figureFor(b: Build): Sculpted {
  let s = sculpted.get(b);
  if (!s) { s = sculpt(crew(b)); sculpted.set(b, s); }
  return s;
}

// ---- what they are made of ---------------------------------------------------------------

const clock = { value: 0 };

interface Garb { shirt: number; coat: number; breeches: number; flesh: number }
const GARB: Garb[] = [
  { shirt: 0x8d8672, coat: 0x34465c, breeches: 0x4a4138, flesh: 0x6f7f78 },
  { shirt: 0x7a7060, coat: 0x5a4130, breeches: 0x38414a, flesh: 0x78857a },
  { shirt: 0x6c7570, coat: 0x3d4a40, breeches: 0x54463a, flesh: 0x67767a },
];

/** Sodden cloth and drowned flesh, from one surface: the sculptor says which is which. */
function crewMaterial(g: Garb, seed: number): THREE.MeshStandardMaterial & { flashU: { value: number } } {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 }) as THREE.MeshStandardMaterial & { flashU: { value: number } };
  m.flashU = { value: 0 };
  const uniforms = {
    uShirt: { value: new THREE.Color(g.shirt) }, uCoat: { value: new THREE.Color(g.coat) }, uBreeches: { value: new THREE.Color(g.breeches) },
    uFlesh: { value: new THREE.Color(g.flesh) }, uSeed: { value: seed % 97 }, uFlash: m.flashU,
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 rest;
        attribute float wear;
        varying vec3 vRest;
        varying float vWear;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = rest;
        vWear = wear;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uShirt, uCoat, uBreeches, uFlesh;
        uniform float uSeed, uFlash;
        varying vec3 vRest;
        varying float vWear;
        float gCrewH, gCrewRough;
        float cHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float cNoise(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        float cFbm(vec3 p) { return cNoise(p) * 0.55 + cNoise(p * 2.1 + 5.0) * 0.3 + cNoise(p * 4.3 + 9.0) * 0.15; }
        vec3 cBump(vec3 n, vec3 viewPos, float h) {
          vec3 dpx = dFdx(viewPos), dpy = dFdy(viewPos);
          float hx = dFdx(h), hy = dFdy(h);
          vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
          float det = dot(dpx, r1);
          return normalize(abs(det) * n - sign(det) * (hx * r1 + hy * r2));
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 rp = vRest + uSeed;
          gCrewH = 0.0;
          // The sculptor's labels are per point, so the hems between cloth and skin are
          // ragged up with noise rather than left as straight seams.
          float w = vWear + (cNoise(rp * 34.0) - 0.5) * 0.7;
          float cloth = smoothstep(0.42, 0.58, w);
          vec3 clothC = w < 1.5 ? uShirt : (w < 2.5 ? uCoat : uBreeches);
          // sodden: dark, with salt drying pale along the folds
          float fold = cFbm(vec3(rp.x * 26.0, rp.y * 9.0, rp.z * 26.0));
          clothC *= 0.8 + fold * 0.5;
          float salt = smoothstep(0.55, 0.8, cNoise(rp * 9.0 + 3.0)) * smoothstep(0.45, 0.7, fold);
          clothC = mix(clothC, vec3(0.4, 0.4, 0.38), salt * 0.35);
          float weave = sin(rp.x * 1500.0) * sin(rp.y * 1500.0);
          clothC *= 1.0 + weave * 0.06 * (1.0 - smoothstep(0.5, 2.0, fwidth(rp.y * 1500.0)));
          gCrewH += fold * 0.006 * cloth;

          // drowned flesh: grey-green, livid where the blood settled, darker in the hollows
          float livid = smoothstep(0.42, 0.72, cFbm(rp * 11.0 + 20.0));
          vec3 fleshC = mix(uFlesh, vec3(0.2, 0.2, 0.27), livid * 0.6);
          fleshC *= 0.8 + cNoise(rp * 60.0) * 0.3;
          float vein = 1.0 - smoothstep(0.0, 0.07, abs(cNoise(vec3(rp.x * 30.0, rp.y * 14.0, rp.z * 30.0) + 40.0) - 0.5));
          fleshC = mix(fleshC, vec3(0.12, 0.16, 0.2), vein * 0.35);

          vec3 col = mix(fleshC, clothC, cloth);
          gCrewRough = mix(0.36, 0.72, cloth);

          // weed hanging from the shoulders and the head, in long dark strands
          float strand = smoothstep(0.56, 0.72, cNoise(vec3(rp.x * 55.0, rp.y * 5.0, rp.z * 55.0) + 60.0));
          float weedy = strand * smoothstep(0.38, 0.62, cNoise(rp * 4.5 + 70.0)) * smoothstep(0.75, 1.25, vRest.y);
          col = mix(col, vec3(0.035, 0.06, 0.03), weedy * 0.9);
          gCrewRough = mix(gCrewRough, 0.22, weedy);
          gCrewH += weedy * 0.004;

          // barnacles in clusters
          vec3 cell = rp * 42.0;
          float d = length(fract(cell) - 0.5 + (vec3(cHash(floor(cell)), cHash(floor(cell) + 7.0), cHash(floor(cell) + 13.0)) - 0.5) * 0.5);
          float far = 1.0 - smoothstep(0.25, 0.9, fwidth(cell.x) + fwidth(cell.y));
          float barn = (1.0 - smoothstep(0.22, 0.38, d)) * smoothstep(0.62, 0.74, cNoise(rp * 6.0 + 90.0)) * far;
          col = mix(col, vec3(0.4, 0.39, 0.34) * (0.45 + smoothstep(0.08, 0.3, d)), barn);
          gCrewRough = mix(gCrewRough, 0.85, barn);
          gCrewH += barn * (0.008 - d * 0.016);

          // sand to the knee
          float sandy = (1.0 - smoothstep(0.05, 0.5, vRest.y)) * (0.4 + 0.6 * cNoise(rp * 25.0));
          col = mix(col, vec3(0.36, 0.3, 0.24), sandy * 0.6);
          gCrewRough = mix(gCrewRough, 0.9, sandy * 0.7);
          diffuseColor.rgb *= col;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gCrewRough;')
      .replace('#include <normal_fragment_maps>', 'normal = cBump(normal, -vViewPosition, gCrewH);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.6) * min(uFlash, 1.5) * 0.22;`);
  };
  m.customProgramCacheKey = () => 'crew';
  return m;
}

/** A torn strip of cloth or a frond of weed, hanging from a bone and swaying. */
const stripMaterials = new Map<number, THREE.MeshStandardMaterial>();
function stripMaterial(color: number, gloss: boolean): THREE.MeshStandardMaterial {
  const key = color * 2 + (gloss ? 1 : 0);
  let m = stripMaterials.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color, roughness: gloss ? 0.3 : 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uClock = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uClock;
        attribute float aPhase;
        varying vec2 vStrip;
        varying float vPhase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vStrip = uv;
        vPhase = aPhase;
        // free at the bottom, fixed at the top
        float loose = (1.0 - uv.y) * (1.0 - uv.y);
        transformed.z += (sin(uClock * 2.1 + aPhase + uv.y * 4.0) * 0.07 + sin(uClock * 3.7 + aPhase * 1.7) * 0.03) * loose;
        transformed.x += sin(uClock * 1.6 + aPhase * 2.3 + uv.y * 3.0) * 0.03 * loose;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vStrip;
        varying float vPhase;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // torn: narrowing unevenly to a ragged end
          float half_ = abs(vStrip.x - 0.5) * 2.0;
          float edge = 0.55 + 0.4 * vStrip.y + 0.22 * sin(vStrip.y * 23.0 + vPhase * 5.0) + 0.12 * sin(vStrip.y * 61.0 + vPhase);
          if (half_ > edge || vStrip.y < 0.04 + 0.08 * sin(vStrip.x * 19.0 + vPhase)) discard;
          diffuseColor.rgb *= 0.55 + 0.45 * vStrip.y;
        }`);
  };
  m.customProgramCacheKey = () => 'strip';
  stripMaterials.set(key, m);
  return m;
}

function strip(width: number, length: number, color: number, gloss: boolean, phase: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, length, 2, 7);
  geo.translate(0, -length / 2, 0);
  geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(phase), 1));
  const m = new THREE.Mesh(geo, stripMaterial(color, gloss));
  m.castShadow = true;
  return m;
}

const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fffd0).multiplyScalar(1.5) });
const eyeGeo = new THREE.SphereGeometry(0.011, 8, 6);
let haloTex: THREE.Texture | null = null;
function halo(): THREE.Sprite {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x7fffc0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.28 }));
  s.scale.setScalar(0.06);
  return s;
}

// ---- the creature -------------------------------------------------------------------------

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'] as const;
type BoneName = (typeof BONES)[number];
const rand = (seed: number, n: number) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

function makeCrew(seed: number, build: Build, garb: Garb, scale: number, bloated: boolean): CreatureModel {
  const figure = figureFor(build);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(scale);

  const material = crewMaterial(garb, seed);
  const mesh = new THREE.SkinnedMesh(figure.geometry, material);
  const { root: rootBone, bones, skeleton } = figure.rig();
  mesh.add(rootBone);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  body.add(mesh);

  // eyes: sea-fire in the sockets
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.039, 0.092, 0.092);
    bones.head.add(eye);
    const glow = halo();
    glow.position.copy(eye.position).add(new THREE.Vector3(0, 0, 0.02));
    bones.head.add(glow);
  }

  // rags and weed
  const hang = (bone: BoneName, at: V3, width: number, length: number, color: number, gloss: boolean, turn: number, n: number) => {
    const s = strip(width, length, color, gloss, rand(seed, n) * 6.28);
    s.position.set(...at);
    s.rotation.y = turn;
    bones[bone].add(s);
  };
  const tails = bloated ? 3 : 5;
  for (let i = 0; i < tails; i++) {
    const a = Math.PI * (0.62 + (i / (tails - 1)) * 0.76) + (rand(seed, i) - 0.5) * 0.2;
    hang('hips', [Math.cos(a) * 0.17, 0.06, Math.sin(a) * 0.13], 0.16 + rand(seed, i + 10) * 0.08, 0.42 + rand(seed, i + 20) * 0.3, garb.coat, false, -a + Math.PI / 2, i);
  }
  hang('armL', [0.05, -0.1, -0.03], 0.09, 0.3 + rand(seed, 31) * 0.2, garb.coat, false, 0.5, 31);
  hang('armR', [-0.05, -0.12, -0.03], 0.08, 0.26 + rand(seed, 32) * 0.2, garb.shirt, false, -0.5, 32);
  hang('chest', [0.12, 0.16, 0.1], 0.07, 0.5 + rand(seed, 33) * 0.25, 0x10200f, true, 0.2, 33);
  hang('chest', [-0.1, 0.17, -0.09], 0.09, 0.6 + rand(seed, 34) * 0.3, 0x0d1a0c, true, 2.8, 34);
  if (rand(seed, 35) > 0.4) hang('head', [-0.07, 0.13, -0.03], 0.06, 0.4, 0x10200f, true, 1.4, 35);
  if (!bloated && rand(seed, 36) > 0.5) hang('shinL', [0, -0.05, 0], 0.1, 0.22, garb.breeches, false, 0.3, 36);

  const muzzle = new THREE.Object3D();
  if (bloated) {
    muzzle.position.set(0, 0.03, 0.16);
    bones.head.add(muzzle);
  } else {
    muzzle.position.set(-0.03, -0.1, 0.02);
    bones.handR.add(muzzle);
  }
  root.traverse((o) => { o.userData.noCollide = true; });

  // Every joint eases toward where the motion wants it, so one motion melts into the next.
  const cur = new Float32Array(BONES.length * 3), want = new Float32Array(BONES.length * 3);
  const at = (name: BoneName) => BONES.indexOf(name) * 3;
  const set = (name: BoneName, x: number, y = 0, z = 0) => { const i = at(name); want[i] = x; want[i + 1] = y; want[i + 2] = z; };
  const add = (name: BoneName, x: number, y = 0, z = 0) => { const i = at(name); want[i] += x; want[i + 1] += y; want[i + 2] += z; };
  const bodyCur = new Float32Array(3), bodyWant = new Float32Array(3); // sink, pitch, roll
  const reach = rand(seed, 1) > 0.5 ? 'L' : 'R', hang_ = reach === 'L' ? 'R' : 'L';
  const drag = rand(seed, 2) > 0.5 ? 'L' : 'R';
  const loll = (rand(seed, 3) - 0.5) * 0.9, lean = (rand(seed, 4) - 0.5) * 0.3, pace = 0.85 + rand(seed, 5) * 0.3;
  let first = true;

  return {
    root,
    muzzle,
    height: (bloated ? 1.9 : 1.84) * scale,
    flash(amount) {
      material.flashU.value = amount;
    },
    animate(t, move, pose, poseT) {
      clock.value = performance.now() / 1000;
      const p = t * 5.4 * pace;
      const s = Math.sin(p);
      want.fill(0);
      bodyWant.fill(0);
      let rate = 0.2;

      // the shamble: a dragging leg, a hunched back, one arm reaching, the head loose
      for (const side of ['L', 'R'] as const) {
        const ph = side === 'L' ? 0 : Math.PI;
        const lame = side === drag ? 0.55 : 1;
        set(('leg' + side) as BoneName, -Math.sin(p + ph) * 0.55 * move * lame - 0.05, 0, side === 'L' ? -0.04 : 0.04);
        set(('shin' + side) as BoneName, Math.max(0, Math.sin(p + ph + 1.1)) * 0.95 * move * lame + 0.14);
        set(('foot' + side) as BoneName, -0.1 + Math.max(0, -Math.sin(p + ph)) * 0.3 * move);
      }
      bodyWant[0] = -Math.abs(Math.cos(p)) * 0.035 * move - 0.02;
      set('hips', 0.05, s * 0.1 * move, s * 0.07 * move);
      set('spine', 0.24 + move * 0.08 + (bloated ? -0.12 : 0), 0, lean - s * 0.05 * move);
      set('chest', 0.2, -s * 0.14 * move, lean * 0.5 + Math.sin(t * 1.3 + seed) * 0.03);
      set('neck', 0.22 + Math.sin(t * 0.9 + seed) * 0.05, Math.sin(t * 0.5 + seed) * 0.22, loll * 0.4);
      set('head', -0.12 + Math.sin(t * 1.7 + seed) * 0.05, Math.sin(t * 0.63 + seed * 2.0) * 0.2, loll + Math.sin(t * 0.8) * 0.05);
      const rs = reach === 'L' ? 1 : -1;
      set(('arm' + reach) as BoneName, -1.25 + Math.sin(p + 1) * 0.1 * move + Math.sin(t * 1.1 + seed) * 0.08, 0, -rs * 0.2);
      set(('fore' + reach) as BoneName, -0.4 + Math.sin(t * 2.3) * 0.1, 0, 0);
      set(('hand' + reach) as BoneName, -0.35, 0, 0);
      set(('arm' + hang_) as BoneName, -0.35 * move + Math.sin(p + (hang_ === 'L' ? Math.PI : 0)) * 0.25 * move + 0.08, 0, rs * 0.3);
      set(('fore' + hang_) as BoneName, -0.2 - move * 0.5, 0, 0);

      if (pose === 'rise') {
        // clawing up out of the ground
        const k = poseT;
        bodyWant[0] = -1.85 * (1 - k) * (1 - k);
        add('spine', 0.6 * (1 - k));
        for (const side of ['L', 'R'] as const) {
          set(('arm' + side) as BoneName, -2.7 + k * 1.2 + Math.sin(t * 6 + (side === 'L' ? 0 : 2)) * 0.25 * (1 - k), 0, (side === 'L' ? -1 : 1) * 0.15);
          set(('fore' + side) as BoneName, -0.5 * (1 - k));
        }
        set('head', -0.5 * (1 - k), 0, loll);
        rate = 0.5;
      } else if (pose === 'windup') {
        const k = Math.min(1, poseT * 1.4);
        add('spine', -0.5 * k);
        add('chest', -0.25 * k);
        set('head', -0.35 * k, 0, loll * 0.5);
        for (const side of ['L', 'R'] as const) {
          set(('arm' + side) as BoneName, -1.25 - 1.55 * k, 0, (side === 'L' ? -1 : 1) * 0.1);
          set(('fore' + side) as BoneName, -0.9 * k);
          set(('hand' + side) as BoneName, -0.5);
        }
        rate = 0.3;
      } else if (pose === 'strike') {
        const k = Math.min(1, poseT * 3);
        add('spine', -0.5 + 1.05 * k);
        add('chest', 0.25 * k);
        set('head', 0.2 * k);
        for (const side of ['L', 'R'] as const) {
          set(('arm' + side) as BoneName, -2.8 + 1.95 * k, 0, (side === 'L' ? -1 : 1) * 0.25);
          set(('fore' + side) as BoneName, -0.9 + 0.8 * k);
          set(('hand' + side) as BoneName, -0.6);
        }
        rate = 0.6;
      } else if (pose === 'crouch') {
        const k = Math.min(1, poseT * 1.6);
        bodyWant[0] = -0.34 * k;
        add('spine', 0.45 * k);
        for (const side of ['L', 'R'] as const) {
          set(('leg' + side) as BoneName, -1.0 * k, 0, 0);
          set(('shin' + side) as BoneName, 1.7 * k);
          set(('arm' + side) as BoneName, 0.6 * k, 0, (side === 'L' ? -1 : 1) * 0.5);
        }
        rate = 0.35;
      } else if (pose === 'stagger') {
        set('spine', -0.32 + Math.sin(t * 9) * 0.06, 0, lean + Math.sin(t * 5) * 0.1);
        set('chest', -0.15);
        set('head', -0.45, 0, loll);
        for (const side of ['L', 'R'] as const) {
          const z = side === 'L' ? 1 : -1;
          set(('arm' + side) as BoneName, -0.4 + Math.sin(t * 7 + z) * 0.2, 0, z * 0.85);
          set(('fore' + side) as BoneName, -0.4);
          set(('leg' + side) as BoneName, Math.sin(t * 8 + z) * 0.25, 0, z * 0.12);
          set(('shin' + side) as BoneName, 0.35);
        }
        rate = 0.35;
      } else if (pose === 'air') {
        bodyWant[1] = -0.55;
        for (const side of ['L', 'R'] as const) {
          const z = side === 'L' ? 1 : -1;
          set(('arm' + side) as BoneName, -2.1 + Math.sin(t * 13 + z * 2) * 0.5, 0, z * 0.75);
          set(('fore' + side) as BoneName, -0.5);
          set(('leg' + side) as BoneName, Math.sin(t * 11 + z * 1.5) * 0.7, 0, z * 0.15);
          set(('shin' + side) as BoneName, 0.8);
        }
        set('head', -0.3);
        rate = 0.4;
      } else if (pose === 'dead') {
        // the legs go, then the rest of it follows backward onto the sand
        const k = Math.min(1, poseT * 2.0);
        const fall = k * k * (3 - 2 * k);
        bodyWant[1] = -1.5 * fall;
        bodyWant[0] = 0.13 * fall;
        bodyWant[2] = lean * fall;
        set('spine', -0.1);
        set('chest', -0.1);
        set('head', 0.3, loll, 0);
        for (const side of ['L', 'R'] as const) {
          const z = side === 'L' ? 1 : -1;
          set(('arm' + side) as BoneName, -0.2 - rand(seed, z + 5) * 0.8, 0, z * (0.5 + rand(seed, z + 7) * 0.7));
          set(('fore' + side) as BoneName, -0.5);
          set(('leg' + side) as BoneName, -0.1 + rand(seed, z + 9) * 0.3, 0, z * 0.2);
          set(('shin' + side) as BoneName, 0.3 * rand(seed, z + 11));
        }
        rate = 0.3;
      }

      if (first) { cur.set(want); bodyCur.set(bodyWant); first = false; }
      for (let i = 0; i < cur.length; i++) cur[i] += (want[i] - cur[i]) * rate;
      for (let i = 0; i < 3; i++) bodyCur[i] += (bodyWant[i] - bodyCur[i]) * (pose === 'rise' ? 1 : rate);
      BONES.forEach((name, i) => bones[name].rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]));
      body.position.y = bodyCur[0];
      body.rotation.set(bodyCur[1], 0, bodyCur[2]);
    },
  };
}

/** THE DROWNED: one of your crew, walking out of the surf. About 1.85 m. */
export function makeDrowned(seed: number): CreatureModel {
  const n = Math.abs(Math.round(seed));
  return makeCrew(seed, BUILDS[n % BUILDS.length], GARB[(n >> 1) % GARB.length], 0.95 + rand(seed, 8) * 0.12, false);
}

/** THE BLOATED: weeks in the water, swollen with it. It heaves brine at you from range. */
export function makeSpitter(seed: number): CreatureModel {
  return makeCrew(seed, BLOATED, GARB[Math.abs(Math.round(seed)) % GARB.length], 1.08, true);
}

/** Sculpt every body now, so the first tide does not hitch. */
export function prepareCreatures() {
  for (const b of [...BUILDS, BLOATED]) figureFor(b);
}
