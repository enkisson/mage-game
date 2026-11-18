// The rock of the bay: one long cliff face traced along the foot of the cliffs, sea stacks, the
// arch over the canyon, clusters of columnar basalt, and boulders. All share one material:
// dark basalt in layers, streaked by water, crusted white with salt and birds on the ledges,
// green with moss wherever moss can hold on.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, smoothstep, clamp } from '../../core/math';
import { fogUniforms } from './atmosphere';
import type { TextureSet } from './terrain';
import { BAY, OUTLINE, groundHeight, plateauAt, rockDistance } from './layout';

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- the material ------------------------------------------------------------------------------

export function rockMaterial(rock: TextureSet, opts: { moss?: number; salt?: number; columnar?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const u = {
    rMap: { value: rock.diff }, rNor: { value: rock.nor },
    uMoss: { value: opts.moss ?? 1 }, uSalt: { value: opts.salt ?? 1 }, uCols: { value: opts.columnar ?? 0 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vRW;\n varying vec3 vRN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 rw = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          rw = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #endif
        vRW = rw.xyz;
        vRN = normalize(mat3(modelMatrix) * normal);
        #ifdef USE_INSTANCING
          vRN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D rMap, rNor;
        uniform float uMoss, uSalt, uCols;
        varying vec3 vRW;
        varying vec3 vRN;
        vec3 rTw;
        float rRough, rWet;
        vec3 rN;
        float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y); }
        float rfbm(vec2 p) { return rn(p) * 0.5 + rn(p * 2.03 + 7.1) * 0.27 + rn(p * 4.1 + 3.3) * 0.15 + rn(p * 8.3 + 1.7) * 0.08; }
        vec3 tri(sampler2D t, float s) {
          return texture2D(t, vRW.zy * s).rgb * rTw.x + texture2D(t, vRW.xz * s).rgb * rTw.y + texture2D(t, vRW.xy * s).rgb * rTw.z;
        }`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vRN);
        rTw = pow(abs(wn), vec3(5.0)); rTw /= rTw.x + rTw.y + rTw.z;
        // two scales of scanned rock, greyed and darkened to basalt
        vec3 a = tri(rMap, 0.07), b = tri(rMap, 0.31);
        vec3 rc = mix(a, b, 0.45);
        float lum = dot(rc, vec3(0.3, 0.55, 0.15));
        rc = mix(vec3(lum), rc, 0.22) * vec3(0.6, 0.6, 0.63);
        // layers: bands of slightly different stone, wandering
        float hz = vRW.x * 0.7 + vRW.z * 0.7;
        float band = rn(vec2(vRW.y * 0.45 + rfbm(vec2(hz * 0.02, 1.0)) * 3.0, 0.5));
        rc *= 0.72 + band * 0.5;
        // columns: a fine vertical rhythm where the rock is columnar
        float colW = 1.1;
        float colA = fract(hz / colW + rn(vec2(floor(hz / colW), floor(vRW.y / 2.6))) * 0.2);
        float colLine = (1.0 - smoothstep(0.0, 0.06, colA)) * uCols * (1.0 - abs(wn.y));
        rc *= 1.0 - colLine * 0.6;
        // water stains running down from every ledge
        float streak = smoothstep(0.5, 0.85, rn(vec2(hz * 0.9, vRW.y * 0.025)) * 0.7 + rn(vec2(hz * 3.1, vRW.y * 0.06)) * 0.3);
        rc *= 1.0 - streak * 0.45 * (1.0 - abs(wn.y));
        // moss and grass: thick on ledges and tops, creeping down the faces in tongues, more
        // in the damp canyon
        float up = wn.y;
        float tongues = smoothstep(0.55, 0.78, rfbm(vec2(hz * 0.12, vRW.y * 0.05)) + (vRW.z < -58.0 ? 0.14 : 0.0));
        float moss = max(smoothstep(0.3, 0.72, up + (rn(vRW.xz * 0.9) - 0.5) * 0.3), tongues * smoothstep(-0.4, 0.1, up) * 0.9);
        moss *= uMoss * smoothstep(1.0, 5.0, vRW.y);
        vec3 mossC = mix(vec3(0.07, 0.1, 0.035), vec3(0.16, 0.2, 0.07), rn(vRW.xz * 0.4 + vRW.y * 0.3)) * (0.75 + rfbm(vRW.xz * 2.0 + vRW.y) * 0.5);
        rc = mix(rc, mossC, moss);
        // salt and birds: pale crust on the ledges near the sea
        float salt = smoothstep(0.35, 0.8, up) * smoothstep(0.55, 0.8, rn(vRW.xz * 1.7 + vRW.y)) * uSalt * smoothstep(-40.0, 10.0, vRW.z) * (1.0 - moss);
        rc = mix(rc, vec3(0.42, 0.42, 0.4), salt * 0.7);
        // wet and black where the sea reaches
        rWet = 1.0 - smoothstep(0.5, 4.5, vRW.y + (rn(vRW.xz * 0.3) - 0.5) * 2.0);
        rc *= mix(1.0, 0.45, rWet);
        diffuseColor.rgb *= rc;
        rRough = mix(0.88 - streak * 0.15, 0.28, rWet);
        rRough = mix(rRough, 0.95, moss);
        vec3 nn = tri(rNor, 0.07) * 2.0 - 1.0;
        vec3 nf = tri(rNor, 0.31) * 2.0 - 1.0;
        vec3 tilt = (nn + nf * 0.6);
        rN = normalize(wn + vec3(tilt.x * (rTw.y + rTw.z), tilt.y * (rTw.x + rTw.z), tilt.x * rTw.x) * 0.55 - wn * colLine * 0.0);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(rN, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'basalt' + (opts.columnar ?? 0) + (opts.moss ?? 1);
  return m;
}

// ---- sea stacks -------------------------------------------------------------------------------

/** A sea stack: a ragged spire of columnar rock rising out of the surf. */
export function seaStack(x: number, z: number, h: number, r: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 140, false);
  const p = geo.attributes.position;
  const leanX = (hash(seed, 1) - 0.5) * 0.12, leanZ = (hash(seed, 2) - 0.5) * 0.12;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i) + 0.5, vz = p.getZ(i);
    const a = Math.atan2(vz, vx);
    const rad = Math.hypot(vx, vz);
    // broad foot, a waist, a shoulder, then the needle
    const t = vy;
    // a broad shoulder partway up, then a narrower spire leaning off it
    const shoulder = 0.35 + hash(seed, 6) * 0.25;
    let prof = t < shoulder ? 1 - t * 0.5 : (1 - shoulder * 0.5) * Math.pow(1 - (t - shoulder) / (1 - shoulder), 0.75) * 0.68;
    prof *= 0.85 + 0.3 * fbm(t * 3 + seed, 1, 3);
    // ledges: the rock steps in where layers have fallen away
    const tier = Math.floor(t * 9 + fbm(a, seed, 2)), tf = t * 9 - tier;
    prof *= 1 - (1 - Math.min(1, tf * 4)) * 0.12 * hash(tier, seed);
    const flutes = Math.pow(Math.abs(Math.sin(a * 11 + seed + fbm(t * 4, a, 2))), 0.5) * 0.09;
    const lump = fbm(Math.cos(a) * 1.5 + seed, t * 6 + Math.sin(a) * 1.5, 4) * 0.5 + fbm(Math.cos(a) * 5, t * 20 + Math.sin(a) * 5, 3) * 0.12;
    const rr = r * Math.max(0.02, prof) * (1 + lump + flutes) * rad;
    const y = -8 + t * (h + 8) + (t > 0.97 ? (hash(i, seed) - 0.5) * 2 : 0);
    // the spire is offset from the foot, so the stack is not a cone
    const off = Math.max(0, t - shoulder) * r * 0.9;
    p.setXYZ(i, x + Math.cos(a) * rr + leanX * y + off * Math.cos(seed * 2.3), y, z + Math.sin(a) * rr + leanZ * y + off * Math.sin(seed * 2.3));
  }
  geo.computeVertexNormals();
  return geo;
}

// ---- the arch -----------------------------------------------------------------------------------

/** The arch across the canyon mouth: a great bridge of rock with the sky and the falls under it. */
export function arch(): THREE.BufferGeometry {
  const A = BAY.arch, W = BAY.canyon.width;
  const span = W + 14;
  const geo = new THREE.BoxGeometry(1, 1, 1, 90, 50, 18);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i) + 0.5, pz = p.getZ(i);
    const x = A.x + px * span, u = (x - A.x) / (W / 2 + 1.5);
    const z = A.z + pz * A.thickness * (1 + 0.3 * Math.abs(px));
    const floor = groundHeight(A.x, A.z) - 1;
    const open = Math.abs(u) < 1 ? floor + (A.crown - floor) * Math.pow(1 - u * u, 0.42) : floor - 2;
    const top = plateauAt(x, z - 6) + 1.2;
    const y = open + (top - open) * py;
    const n1 = fbm(x * 0.12, y * 0.12 + z * 0.05, 4), n2 = fbm(y * 0.11 + 4, z * 0.13, 4), n3 = fbm(x * 0.1 + 8, z * 0.1 + y * 0.05, 4);
    const k = 1 - smoothstep(0.42, 0.5, Math.abs(py - 0.5)) * 0.5;
    p.setXYZ(i, x + n1 * 1.5 * k, y + n2 * 1.2, z + n3 * 2.2 + (pz > 0 ? fbm(x * 0.05, y * 0.05, 3) * 2 : 0));
  }
  geo.computeVertexNormals();
  return geo;
}

// ---- columnar basalt -----------------------------------------------------------------------------

/**
 * A cluster of basalt columns: six-sided prisms packed edge to edge, their tops broken off at
 * different heights so they step down like a giant's stair.
 */
export function columns(cx: number, cz: number, radius: number, height: (x: number, z: number) => number, seed = 1, a = 1.05, flat = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const R = a / Math.sqrt(3);
  for (let row = -Math.ceil(radius / (a * 0.866)); row <= Math.ceil(radius / (a * 0.866)); row++) {
    for (let col = -Math.ceil(radius / a); col <= Math.ceil(radius / a); col++) {
      const x = cx + col * a + (row & 1 ? a / 2 : 0), z = cz + row * a * 0.866;
      if (Math.hypot(x - cx, z - cz) > radius || rockDistance(x, z) > -0.3) continue;
      const h = height(x, z);
      if (h <= 0.2) continue;
      const base = groundHeight(x, z) - 3;
      const top = groundHeight(x, z) + h;
      const g = new THREE.CylinderGeometry(R * 0.97, R * 0.99, top - base, 6, 1, false);
      g.rotateY(Math.PI / 6 + (hash(x, z) - 0.5) * 0.05);
      // a broken, tilted top
      const pp = g.attributes.position;
      // (or worn flat, where they are to be walked on)
      if (!flat) for (let i = 0; i < pp.count; i++) if (pp.getY(i) > 0) pp.setY(i, pp.getY(i) + (hash(x + i, z + seed) - 0.5) * 0.25 + (pp.getX(i) * (hash(x, seed) - 0.5) + pp.getZ(i) * (hash(z, seed) - 0.5)) * 0.4);
      g.translate(x, (top + base) / 2, z);
      parts.push(g.toNonIndexed());
    }
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

// ---- boulders ----------------------------------------------------------------------------------

/** Rounded boulders, each one its own lump, all one mesh. */
export function boulders(spots: { x: number; z: number; r: number; sink?: number }[], seed = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  spots.forEach((b, k) => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    const sx = 0.8 + hash(k, seed) * 0.6, sy = 0.55 + hash(k, seed + 1) * 0.35, sz = 0.8 + hash(k, seed + 2) * 0.5;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      let d = 1 + fbm(vx * 1.4 + k * 3.1, vz * 1.4 + vy * 1.2, 4) * 0.35 + fbm(vx * 4 + k, vy * 4 + vz * 3, 3) * 0.1;
      // fractured: a few flat faces cut through it
      for (let f = 0; f < 5; f++) {
        const nx = hash(k, f * 3 + 11) - 0.5, ny = hash(k, f * 3 + 12) - 0.3, nz = hash(k, f * 3 + 13) - 0.5;
        const l = Math.hypot(nx, ny, nz);
        const proj = (vx * nx + vy * ny + vz * nz) / l;
        const cut = 0.62 + hash(k, f + 30) * 0.25;
        if (proj * d > cut) d = cut / Math.max(proj, 1e-3);
      }
      const yy = vy * d * sy * b.r;
      p.setXYZ(i, vx * d * sx * b.r, Math.max(yy, -sy * b.r * 0.35), vz * d * sz * b.r);
    }
    g.rotateY(hash(k, seed + 3) * 6.28);
    g.translate(b.x, groundHeight(b.x, b.z) + b.r * sy * (0.45 - (b.sink ?? 0)), b.z);
    parts.push(g);
  });
  const merged = mergeVertices(mergeGeometries(parts.map((g) => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; }), false)!, 0.0001);
  merged.computeVertexNormals();
  return merged;
}

/** Where the ground is open and dry enough for a boulder, near a given point. */
export function scatterNear(cx: number, cz: number, spread: number, n: number, rmin: number, rmax: number, seed: number, ok: (x: number, z: number) => boolean = () => true) {
  const out: { x: number; z: number; r: number }[] = [];
  for (let i = 0; out.length < n && i < n * 20; i++) {
    const a = hash(i, seed) * 6.283, d = Math.sqrt(hash(seed, i)) * spread;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (rockDistance(x, z) > -1.5 || !ok(x, z)) continue;
    out.push({ x, z, r: rmin + (rmax - rmin) * Math.pow(hash(i + 7, seed), 2) });
  }
  return out;
}

export { clamp };
