// Waterfalls. A fall here is a whole system, not a sheet:
//
//  - the stream on the land above, running down its notch to the lip;
//  - at the lip, a smooth dark tongue of water curving over the edge before it breaks;
//  - the body: several sheets of white water one behind another, each with its own streaks,
//    spreading as they drop, the water splitting into strands and then into falling clumps;
//  - ragged side curtains where the edges tear away, and a faint veil of spray round it all;
//  - at the foot, a pool churned white where it lands, and a cloud of spray rising and
//    drifting off on the wind, wetting the rock round the alcove.
//
// The fall follows the real arc of water leaving a lip, so a tall fall lands well out from
// the foot of the cliff.
import * as THREE from 'three';
import { air } from './atmosphere';
import { mistTexture } from './airfx';
import { groundHeight, plateauAt, type Fall } from './layout';

export const fallUniforms = { uTime: { value: 0 }, uLight: { value: 1 } };

const fogU = () => ({ ...THREE.UniformsLib.fog, fogSunDir: air.sunDir, fogSunColor: air.sunColor, fogFalloff: air.falloff, fogGlowPower: air.glowPower });

const VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vVn;
varying vec3 vWn;
void main() {
  vUv = uv;
  vec3 transformed = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vWp = (modelMatrix * vec4(position, 1.0)).xyz;
  vVn = normalize(normalMatrix * normal);
  vWn = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;

const NOISE = /* glsl */ `
float wh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
float wf(vec2 p) { return wn(p) * 0.5 + wn(p * 2.07 + 3.1) * 0.27 + wn(p * 4.13 + 7.3) * 0.15 + wn(p * 8.4 + 1.9) * 0.08; }
// white water scatters light like snow: a soft wrap of the low sun on the side that faces it,
// the grey sky from above, and a shadowed side that falls off into blue-grey
vec3 waterLight(vec3 n, vec3 sunDir, vec3 sunCol) {
  float sun = clamp(dot(n, sunDir) * 0.75 + 0.25, 0.0, 1.0);
  float sky = 0.4 + 0.6 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  return vec3(0.46, 0.5, 0.55) * sky + sunCol * sun * 0.7;
}`;

/**
 * A falling sheet. u runs across it, v from the lip (0) to the foot (1). `uKind`: 0 the body,
 * 1 a side curtain, 2 the spray veil.
 */
function sheetMaterial(seed: number, width: number, height: number, kind: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...fogU(), ...fallUniforms, uSeed: { value: seed }, uW: { value: width }, uH: { value: height }, uKind: { value: kind }, uOpacity: { value: opacity } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vVn;
varying vec3 vWn;
uniform float uTime, uLight, uSeed, uW, uH, uKind, uOpacity;
${NOISE}
void main() {
  float u = vUv.x, v = vUv.y;
  float x = u * uW, y = v * uH;
  // water accelerates as it falls, so the pattern runs faster lower down
  float run = sqrt(max(y, 0.0) * 19.6);
  float t = uTime;
  // long vertical streaks, a hand to an arm wide
  float streak = wf(vec2(x * 1.3 + uSeed * 7.0, y * 0.035 - t * 0.9 * (1.0 + v)));
  float fine = wn(vec2(x * 5.0 + uSeed, y * 0.12 - t * 2.4));
  // lower down it breaks into falling clumps
  float clumps = wf(vec2(x * 0.9 + uSeed * 3.0, y * 0.22 - t * 2.0 * (0.5 + v)));
  float breakup = smoothstep(0.15, 0.95, v);
  float dens = streak * 0.75 + fine * 0.25;
  dens = mix(dens, dens * (0.3 + clumps * 1.3), breakup);
  // broad slow bands of thicker and thinner water, so the body is not one even sheet
  dens *= 0.75 + 0.5 * wn(vec2(x * 0.18 + uSeed, y * 0.01 - t * 0.3));
  // ragged edges, worse further down
  float edgeN = wn(vec2(y * 0.08 + uSeed * 11.0, uSeed)) * 0.25 + wn(vec2(y * 0.3 - t, uSeed * 2.0)) * 0.12;
  float edge = smoothstep(0.0, 0.09 + edgeN + breakup * 0.1, u) * smoothstep(1.0, 0.91 - edgeN - breakup * 0.1, u);
  float a;
  vec3 c;
  if (uKind < 0.5) {
    a = smoothstep(0.28 - breakup * 0.05, 0.62, dens) * edge;
    // the glassy tongue at the lip: dark and smooth, then whitening
    float tongue = 1.0 - smoothstep(0.0, 0.05, v);
    vec3 white = vec3(0.86, 0.89, 0.9);
    vec3 grey = vec3(0.42, 0.47, 0.5);
    c = mix(grey, white, smoothstep(0.35, 0.75, dens));
    c = mix(c, vec3(0.14, 0.17, 0.17) + vec3(0.25) * fine, tongue);
    a = mix(a, 0.85 * edge, tongue);
  } else if (uKind > 2.5) {
    // a rope of water peeled off the sheet: solid and white near the top, breaking into beads
    a = smoothstep(0.2 + breakup * 0.25, 0.55, dens) * edge * (1.0 - breakup * 0.35);
    c = mix(vec3(0.45, 0.5, 0.53), vec3(0.9, 0.92, 0.93), smoothstep(0.3, 0.7, dens));
  } else if (uKind < 1.5) {
    // a side curtain: strands tearing away
    a = smoothstep(0.45, 0.8, dens) * edge * (0.6 + 0.4 * breakup);
    c = mix(vec3(0.5, 0.55, 0.58), vec3(0.82, 0.85, 0.87), dens);
  } else {
    // the veil of spray, thickening toward the bottom
    float mist = wf(vec2(x * 0.25 + uSeed, y * 0.04 - t * 0.5));
    a = smoothstep(0.3, 0.8, mist) * edge * (0.2 + 0.8 * v * v);
    c = vec3(0.72, 0.76, 0.79);
  }
  // light it: the normal of the lobed sheet, turned to face the eye, with the streaks
  // bending it so every rope of water catches the light on one side
  vec3 V = normalize(cameraPosition - vWp);
  vec3 N = normalize(vWn);
  if (dot(N, V) < 0.0) N = -N;
  vec3 sideAx = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4, 0.0, 0.0));
  float sd = wn(vec2(x * 1.3 + uSeed * 7.0 + 0.05, y * 0.035 - t * 0.9 * (1.0 + v))) - streak;
  N = normalize(N + sideAx * sd * 6.0 * (abs(uKind - 2.0) > 0.5 ? 1.0 : 0.0));
  #ifdef USE_FOG
    vec3 lit = waterLight(N, fogSunDir, fogSunColor);
  #else
    vec3 lit = waterLight(N, normalize(vec3(-0.6, 0.25, 0.3)), vec3(0.9, 0.8, 0.7));
  #endif
  c *= lit * 1.15;
  // seen edge-on the sheet is thicker: denser, and a little darker where the eye looks through the body
  float graze = pow(1.0 - abs(dot(normalize(vWn), V)), 2.0);
  a = clamp(a * (1.0 + graze * 0.8), 0.0, 1.0);
  c *= 1.0 - graze * 0.15;
  c *= uLight;
  // the last metres vanish into the spray
  a *= smoothstep(1.0, 0.9, v) * uOpacity;
  gl_FragColor = vec4(c, a);
#include <fog_fragment>
}`,
  });
}

/** The pool where a fall lands: dark water churned white round the point of impact. */
function plungeMaterial(radius: number, impact: THREE.Vector2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...fogU(), ...fallUniforms, uR: { value: radius }, uImpact: { value: impact } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vVn;
varying vec3 vWn;
uniform float uTime, uLight, uR;
uniform vec2 uImpact;
${NOISE}
void main() {
  vec2 p = vWp.xz;
  float d = length(p - uImpact) / uR;
  float ang = atan(p.y - uImpact.y, p.x - uImpact.x);
  // foam boiling out in rings from where the water lands
  float boil = wf(vec2(ang * 2.0, d * 6.0 - uTime * 0.8)) * 0.6 + wf(p * 0.9 + uTime * 0.3) * 0.4;
  float foam = smoothstep(0.42, 0.7, boil + (1.0 - d) * 0.45) * smoothstep(1.0, 0.55, d);
  float rim = smoothstep(1.0, 0.85, length(vUv - 0.5) * 2.0);
  vec3 water = vec3(0.04, 0.06, 0.065);
  vec3 c = mix(water, vec3(0.84, 0.87, 0.88), foam) * uLight;
  float a = mix(0.82, 1.0, foam) * rim;
  gl_FragColor = vec4(c, a);
#include <fog_fragment>
}`,
  });
}

function rnd(seed: number) {
  let s = Math.floor(seed * 9973) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** A ribbon following the fall's arc: `off` sideways and `depth` out from the centre line. */
function arcRibbon(path: (v: number) => THREE.Vector3, side: THREE.Vector3, out: THREE.Vector3, width: (v: number) => number, rows: number, cols: number, off = 0, depth = 0, lobes: { c: number; w: number; a: number }[] = []): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const c = path(v);
    const w = width(v);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      // the sheet bows outward in the middle as the water spreads
      // and is gathered into lobes, a ridge of water down each with a groove between,
      // standing further out as they spread toward the foot
      let bow = Math.sin(u * Math.PI) * w * 0.07 * (0.3 + v);
      for (const l of lobes) bow += l.a * Math.exp(-Math.pow((u - l.c) / l.w, 2)) * (0.35 + v * 0.9);
      const p = c.clone().addScaledVector(side, (u - 0.5) * w + off).addScaledVector(out, depth + bow);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c2 = a + cols + 1, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A spray cloud: soft billows piled over the point of impact, drifting off on the wind. */
function sprayCloud(at: THREE.Vector3, size: number, height: number, wind: THREE.Vector3, seed: number, count: number): THREE.Group {
  const g = new THREE.Group();
  const r = rnd(seed);
  for (let i = 0; i < count; i++) {
    const t = Math.pow(r(), 1.4); // most of it low down
    const m = new THREE.SpriteMaterial({ map: mistTexture(), color: new THREE.Color(0.8, 0.83, 0.86), transparent: true, depthWrite: false, fog: true,
      opacity: (0.5 - t * 0.35) * (0.55 + r() * 0.45) });
    m.rotation = r() * 6.28;
    const s = new THREE.Sprite(m);
    const spread = size * (0.4 + t * 1.2);
    s.position.set(at.x + (r() - 0.5) * spread + wind.x * t * height * 0.6, at.y + t * height, at.z + (r() - 0.5) * spread + wind.z * t * height * 0.6);
    const k = size * (0.5 + t * 1.3) * (0.7 + r() * 0.6);
    s.scale.set(k * 1.3, k, 1);
    s.renderOrder = 8;
    g.add(s);
  }
  return g;
}

export interface FallBuild { group: THREE.Group; lip: THREE.Vector3; impact: THREE.Vector3 }

/**
 * Build one waterfall. `faceSetback` is how far the cliff face behind the lip is cut back from
 * the outline (the alcove), so the water leaves from the real edge.
 */
export function waterfall(f: Fall, opts: { faceSetback: number; seed: number; wind?: THREE.Vector3 }): FallBuild {
  const g = new THREE.Group();
  const out = new THREE.Vector3(f.nx, 0, f.nz).normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const wind = opts.wind ?? new THREE.Vector3(0.35, 0, -0.2);
  // the lip: where the notch floor meets the face
  const lipXZ = new THREE.Vector3(f.x, 0, f.z).addScaledVector(out, -opts.faceSetback + 0.6);
  const lipY = plateauAt(lipXZ.x - out.x * 3, lipXZ.z - out.z * 3) + 0.4;
  const lip = lipXZ.clone().setY(lipY);
  // the arc of water leaving the lip
  const v0 = 2.2 + f.width * 0.08;
  const floor = groundHeight(f.pool[0], f.pool[1]);
  const H = lipY - floor;
  const T = Math.sqrt((2 * H) / 9.8);
  const path = (v: number) => {
    const t = v * T;
    // wind leans the lower fall a little
    return lip.clone().addScaledVector(out, v0 * t).addScaledVector(wind, 0.15 * t * t).add(new THREE.Vector3(0, -4.9 * t * t, 0));
  };
  const impact = path(1);
  const W = f.width;
  const spread = (k: number) => (v: number) => W * k * (1 + 0.45 * v + 0.25 * v * v);
  const rows = Math.max(80, Math.round(H * 1.6));
  const cols = Math.max(16, Math.round(W * 2.4));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    m.frustumCulled = false;
    m.userData.noCollide = true;
    g.add(m);
  };
  // the body: three sheets, back to front, each gathered into its own lobes
  const r = rnd(opts.seed * 13.7);
  const lobes = (n: number) => Array.from({ length: n }, () => ({ c: 0.08 + r() * 0.84, w: 0.06 + r() * 0.1, a: (r() * 0.7 + 0.3) * (0.4 + W * 0.09) }));
  const nl = Math.max(3, Math.round(W / 2.5));
  add(arcRibbon(path, side, out, spread(0.92), rows, cols * 2, 0, -0.9, lobes(nl)), sheetMaterial(opts.seed + 0.1, W, H, 0, 0.9), 9);
  add(arcRibbon(path, side, out, spread(1.0), rows, cols * 2, W * 0.04, 0, lobes(nl)), sheetMaterial(opts.seed + 0.2, W, H, 0, 0.95), 10);
  add(arcRibbon(path, side, out, spread(0.85), rows, cols * 2, -W * 0.05, 0.7, lobes(nl)), sheetMaterial(opts.seed + 0.3, W, H, 0, 0.8), 11);
  // ropes of water peeling away from the face of the sheet: each leaves the lip a little faster
  // or slower than the rest, so they stand off it and drift apart as they fall
  const ropes = Math.round(4 + W * 0.6);
  for (let k = 0; k < ropes; k++) {
    const kv = 0.85 + r() * 0.5, lat = (r() - 0.5) * W * 0.9, drift = (r() - 0.5) * 0.5;
    const rp = (v: number) => {
      const t = v * T;
      return lip.clone().addScaledVector(out, v0 * kv * t + 0.3).addScaledVector(side, lat + drift * t * t).addScaledVector(wind, 0.15 * t * t).add(new THREE.Vector3(0, -4.9 * t * t, 0));
    };
    const rw = 0.35 + r() * 0.9;
    add(arcRibbon(rp, side, out, (v) => rw * (1 + 1.5 * v), Math.round(rows * 0.8), 4, 0, 0.9 + r() * 0.8), sheetMaterial(opts.seed + 2 + k * 0.37, rw * 2, H, 3, 0.85), 12);
  }
  // ragged curtains torn off each edge
  for (const k of [-1, 1]) add(arcRibbon(path, side, out, spread(0.28), rows, Math.max(8, cols / 3), k * W * 0.55, 0.2), sheetMaterial(opts.seed + 0.5 + k, W * 0.3, H, 1, 0.75), 12);
  // the veil of spray round it all
  add(arcRibbon(path, side, out, spread(1.7), Math.round(rows / 2), Math.round(cols / 2), 0, 1.4), sheetMaterial(opts.seed + 0.9, W * 1.7, H, 2, 0.6), 13);

  // the pool, churned white where the water lands
  const poolR = W * 0.95 + 3;
  const poolGeo = new THREE.CircleGeometry(poolR, 64);
  poolGeo.rotateX(-Math.PI / 2);
  const rimY = groundHeight(f.pool[0] + poolR * 1.1, f.pool[1]) - 0.35;
  poolGeo.translate(impact.x, Math.min(rimY, floor + 1.6), impact.z);
  add(poolGeo, plungeMaterial(poolR, new THREE.Vector2(impact.x, impact.z)), 7);

  // the boil: a mound of white water heaving up where the fall hits the pool
  {
    const br = W * 0.55 + 1.5;
    const dome = new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dp = dome.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
      const bump = 1 + 0.25 * Math.sin(x * 7 + opts.seed) * Math.cos(z * 6 - opts.seed) + 0.15 * Math.sin(x * 15 + z * 11);
      dp.setXYZ(i, x * br * (1 + 0.15 * y), y * (W * 0.12 + 1.2) * bump, z * br * 0.8 * (1 + 0.15 * y));
    }
    dome.computeVertexNormals();
    const uv = dome.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - uv.getY(i));
    dome.translate(impact.x, Math.min(groundHeight(f.pool[0] + (W * 0.95 + 3) * 1.1, f.pool[1]) - 0.35, floor + 1.6) - 0.3, impact.z);
    add(dome, sheetMaterial(opts.seed + 9, br * 6, br * 3, 2, 0.9), 12);
  }

  // spray: a towering cloud at the foot, drifting off on the wind, and mist clinging to the face
  g.add(sprayCloud(impact.clone().setY(floor + 1), W * 1.3 + 4, Math.min(H * 0.55, 40), wind, opts.seed + 3, 26 + Math.round(W * 2.5)));
  g.add(sprayCloud(path(0.75), W * 0.9 + 2, H * 0.2, wind, opts.seed + 7, 10));

  // the stream above, running down its notch to the lip
  {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 30; k++) {
      const p = lipXZ.clone().addScaledVector(out, -k * 2.2);
      pts.push(p.setY(plateauAt(p.x, p.z) + 0.35));
    }
    pts[0].y = lipY;
    const curve = new THREE.CatmullRomCurve3(pts);
    const P: number[] = [], UV: number[] = [], I: number[] = [];
    const N = 90;
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPoint(t);
      const w = W * (0.55 - t * 0.25);
      P.push(p.x + side.x * w * 0.5, p.y, p.z + side.z * w * 0.5, p.x - side.x * w * 0.5, p.y, p.z - side.z * w * 0.5);
      UV.push(0, t * 40, 1, t * 40);
      if (i < N) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    sg.setIndex(I);
    sg.computeVertexNormals();
    add(sg, new THREE.MeshStandardMaterial({ color: 0x0c1416, roughness: 0.08, transparent: true, opacity: 0.9 }), 6);
  }
  g.traverse((o) => { o.userData.noCollide = true; });
  return { group: g, lip, impact };
}
