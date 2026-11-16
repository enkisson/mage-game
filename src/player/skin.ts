// Skin: a smoother surface for the rigged hand, and a material that shades it as living
// skin rather than painted plastic.
//
// Everything the shader draws (nails, knuckle folds, tendons, the lines of the palm) is worked
// out from where a point sits on the hand at rest, so it needs no texture and stays put as
// the fingers bend.
import * as THREE from 'three';

// ---- geometry ----------------------------------------------------------------------------

type Verts = Float64Array;

/** One round of Loop subdivision. Each vertex carries `C` numbers: a position, then weights. */
function loop(v: Verts, tris: number[], C: number): [Verts, number[]] {
  const n = v.length / C;
  interface Edge { a: number; b: number; opp: number[]; id: number }
  const edges = new Map<number, Edge>();
  const edge = (a: number, b: number, c: number) => {
    const k = a < b ? a * n + b : b * n + a;
    let e = edges.get(k);
    if (!e) { e = { a, b, opp: [], id: 0 }; edges.set(k, e); }
    e.opp.push(c);
    return e;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    edge(a, b, c); edge(b, c, a); edge(c, a, b);
  }
  const near: number[][] = Array.from({ length: n }, () => []);
  const rim: number[][] = Array.from({ length: n }, () => []);
  let id = n;
  for (const e of edges.values()) {
    e.id = id++;
    near[e.a].push(e.b); near[e.b].push(e.a);
    if (e.opp.length === 1) { rim[e.a].push(e.b); rim[e.b].push(e.a); }
  }
  const out = new Float64Array(id * C);
  const add = (to: number, from: number, w: number) => {
    for (let c = 0; c < C; c++) out[to * C + c] += v[from * C + c] * w;
  };
  for (let i = 0; i < n; i++) {
    if (rim[i].length >= 2) {
      add(i, i, 0.75); add(i, rim[i][0], 0.125); add(i, rim[i][1], 0.125);
    } else {
      const k = near[i].length;
      const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
      add(i, i, 1 - k * beta);
      for (const j of near[i]) add(i, j, beta);
    }
  }
  for (const e of edges.values()) {
    if (e.opp.length >= 2) {
      add(e.id, e.a, 0.375); add(e.id, e.b, 0.375); add(e.id, e.opp[0], 0.125); add(e.id, e.opp[1], 0.125);
    } else {
      add(e.id, e.a, 0.5); add(e.id, e.b, 0.5);
    }
  }
  const next: number[] = [];
  const mid = (a: number, b: number) => edges.get(a < b ? a * n + b : b * n + a)!.id;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return [out, next];
}

/**
 * Smooth a skinned mesh by subdividing it, carrying the skin weights along so it still
 * bends with its skeleton. Vertices that share a place are welded first, so the result has
 * no seams; texture coordinates are dropped.
 */
export function refineSkinned(src: THREE.BufferGeometry, boneCount: number, levels = 1): THREE.BufferGeometry {
  const P = src.attributes.position, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  const C = 3 + boneCount;
  const seen = new Map<string, number>();
  const remap = new Uint32Array(P.count);
  const data: number[] = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const key = `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
    let at = seen.get(key);
    if (at === undefined) {
      at = data.length / C;
      seen.set(key, at);
      const row = new Array(C).fill(0);
      row[0] = x; row[1] = y; row[2] = z;
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += SW.getComponent(i, k);
      for (let k = 0; k < 4; k++) row[3 + SI.getComponent(i, k)] += SW.getComponent(i, k) / (sum || 1);
      data.push(...row);
    }
    remap[i] = at;
  }
  let tris: number[] = [];
  const count = src.index ? src.index.count : P.count;
  for (let t = 0; t < count; t += 3) {
    const a = remap[src.index ? src.index.getX(t) : t], b = remap[src.index ? src.index.getX(t + 1) : t + 1], c = remap[src.index ? src.index.getX(t + 2) : t + 2];
    if (a !== b && b !== c && c !== a) tris.push(a, b, c);
  }
  let verts: Verts = Float64Array.from(data);
  for (let l = 0; l < levels; l++) [verts, tris] = loop(verts, tris, C);

  const n = verts.length / C;
  const pos = new Float32Array(n * 3), idx = new Uint16Array(n * 4), wgt = new Float32Array(n * 4);
  const order = new Array(boneCount).fill(0).map((_, i) => i);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = verts[i * C]; pos[i * 3 + 1] = verts[i * C + 1]; pos[i * 3 + 2] = verts[i * C + 2];
    const w = verts.subarray(i * C + 3, i * C + C);
    const top = order.slice().sort((a, b) => w[b] - w[a]).slice(0, 4);
    let sum = 0;
    for (const b of top) sum += w[b];
    top.forEach((b, k) => { idx[i * 4 + k] = b; wgt[i * 4 + k] = w[b] / (sum || 1); });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
  geo.setIndex(tris);
  geo.computeVertexNormals();
  return geo;
}

// ---- material ----------------------------------------------------------------------------

export interface SkinUniforms {
  /** Rest position to each nail's own frame: thumb, then index to pinky. */
  uNail: { value: THREE.Matrix4[] };
  /** The four knuckles the tendons run to, in the hand's frame. */
  uTendon: { value: THREE.Vector3[] };
  /** A light held in the hand (view space) and its colour: it shows red through the fingers. */
  uGlowPos: { value: THREE.Vector3 };
  uGlowColor: { value: THREE.Color };
  /** How quickly that light dies away with distance. */
  uGlowFall: { value: number };
  uTone: { value: THREE.Color };
  /** How big a metre of skin is drawn (the hands are drawn small and close). */
  uUnit: { value: number };
  /** Where along the arm the wrist is, so the cords can be tied just behind it. */
  uWristY: { value: number };
  /** +1 for the right hand, -1 for the left: which way the palm's lines run. */
  uSide: { value: number };
}

export type SkinMaterial = THREE.MeshStandardMaterial & { skin: SkinUniforms };

const SKIN_PARS = /* glsl */ `
  uniform mat4 uNail[5];
  uniform vec3 uTendon[4];
  uniform vec3 uGlowPos;
  uniform vec3 uGlowColor;
  uniform float uGlowFall;
  uniform vec3 uTone;
  uniform float uSide;
  uniform float uUnit;
  uniform float uWristY;
  float gSkinCord;   // 1 on the cords tied round the wrist
  varying vec3 vRest;
  varying vec4 vSkinA;
  float gSkinH;      // surface height in metres, for the fine relief
  float gSkinNail;   // 1 on a fingernail
  float gSkinRough;
  float skHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float skNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skHash(i), skHash(i + vec3(1, 0, 0)), f.x), mix(skHash(i + vec3(0, 1, 0)), skHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(skHash(i + vec3(0, 0, 1)), skHash(i + vec3(1, 0, 1)), f.x), mix(skHash(i + vec3(0, 1, 1)), skHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float skFbm(vec3 p) { return skNoise(p) * 0.55 + skNoise(p * 2.03 + 7.1) * 0.3 + skNoise(p * 4.1 + 3.7) * 0.15; }
  // a soft line: 1 on it, falling off over 'width'
  float skLine(float d, float width) { return 1.0 - smoothstep(0.0, width, abs(d)); }
  float skSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  vec3 skBump(vec3 n, vec3 viewPos, float h) {
    vec3 dpx = dFdx(viewPos), dpy = dFdy(viewPos);
    float hx = dFdx(h), hy = dFdy(h);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    return normalize(abs(det) * n - grad);
  }`;

const SKIN_COLOR = /* glsl */ `
  {
    vec3 rp = vRest;
    float fing = vSkinA.x, joint = vSkinA.y, dorsal = smoothstep(0.3, 0.7, vSkinA.z), hand = vSkinA.w;
    gSkinH = 0.0;
    gSkinNail = 0.0;
    float blotch = skFbm(rp * 60.0);
    float grain = skNoise(rp * 700.0);

    // palm paler and pinker than the weathered back
    vec3 back = uTone * (0.9 + blotch * 0.2);
    vec3 palm = uTone * vec3(1.2, 1.07, 1.03) + vec3(0.035, 0.012, 0.01);
    vec3 col = mix(palm, back, dorsal);
    // blood close under the skin at the fingertips and over the knuckles
    col *= mix(vec3(1.0), vec3(1.1, 0.84, 0.8), fing * fing * mix(0.75, 0.4, dorsal) * hand);
    col *= mix(vec3(1.0), vec3(1.06, 0.8, 0.76), joint * dorsal * 0.6 * hand);
    // freckles and old sun on the back of the hand and arm
    float freckle = smoothstep(0.7, 0.82, skNoise(rp * 380.0)) * smoothstep(0.45, 0.7, skNoise(rp * 45.0 + 9.0));
    col *= mix(vec3(1.0), vec3(0.72, 0.6, 0.54), freckle * dorsal * mix(0.25, 0.55, hand));
    col *= 0.96 + grain * 0.08;

    // knuckle folds: fine creases across each joint on the back
    float foldPhase = rp.y * 2600.0 + skNoise(rp * 260.0) * 4.0;
    float foldFade = 1.0 - smoothstep(0.9, 2.4, fwidth(foldPhase));
    float fold = (0.5 + 0.5 * sin(foldPhase)) * smoothstep(0.25, 0.9, joint) * dorsal * foldFade * hand * (0.4 + 0.6 * skNoise(rp * 190.0));
    gSkinH -= fold * 0.00022;
    col *= 1.0 - fold * 0.09;
    // the crease on the palm side of each joint
    float crease = smoothstep(0.62, 0.96, joint) * (1.0 - dorsal) * hand;
    gSkinH -= crease * 0.0005;
    col *= 1.0 - crease * 0.22;

    // tendons fanning from the wrist to the knuckles, and the veins lying between them
    float tendon = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 k = uTendon[i].xy;
      float d = skSegment(rp.xy, vec2(k.x * 0.28, 0.012), k);
      float ridge = 1.0 - smoothstep(0.0, 0.0055, d);
      tendon = max(tendon, ridge * ridge * smoothstep(0.0, 0.035, rp.y) * smoothstep(k.y + 0.002, k.y - 0.025, rp.y));
    }
    tendon *= dorsal * hand;
    gSkinH += tendon * 0.0005;
    float veinN = skNoise(vec3(rp.x * 70.0, rp.y * 22.0, rp.z * 24.0) + 2.3);
    float vein = smoothstep(0.1, 0.0, abs(veinN - 0.5)) * dorsal * (1.0 - fing) * (1.0 - tendon) * smoothstep(0.35, 0.65, skNoise(rp * 20.0));
    gSkinH += vein * 0.00025;
    col = mix(col, col * vec3(0.86, 0.93, 1.0), vein * 0.22);

    // the lines of the palm
    vec2 pp = vec2(rp.x * uSide, rp.y);
    float palmMask = (1.0 - dorsal) * (1.0 - smoothstep(0.1, 0.35, fing)) * hand;
    float wob = (skNoise(rp * 150.0) - 0.5) * 0.0016;
    float heart = skLine(pp.y + wob - (0.079 - 14.0 * (pp.x + 0.012) * (pp.x + 0.012) + pp.x * 0.12), 0.0024) * smoothstep(-0.047, -0.04, pp.x) * smoothstep(0.022, 0.014, pp.x);
    float head = skLine(pp.y + wob - (0.062 + pp.x * 0.45 - 9.0 * pp.x * pp.x), 0.0022) * smoothstep(-0.038, -0.03, pp.x) * smoothstep(0.032, 0.024, pp.x);
    float life = skLine(length(pp - vec2(0.046, 0.036)) + wob - 0.036, 0.0025) * smoothstep(0.036, 0.028, pp.x) * smoothstep(0.006, 0.016, pp.y);
    float lines = max(max(heart, head), life) * palmMask;
    lines *= lines;
    gSkinH -= lines * 0.0004;
    col *= 1.0 - lines * 0.2;
    // callus: paler, drier pads at the base of the fingers
    float pad = smoothstep(0.55, 0.75, skNoise(rp * 55.0 + 4.0)) * palmMask * smoothstep(0.06, 0.085, pp.y);
    col = mix(col, col * vec3(1.08, 1.04, 0.94), pad * 0.5);

    // fingernails
    vec2 nq = vec2(0.0);
    for (int i = 0; i < 5; i++) {
      vec3 q = (uNail[i] * vec4(rp, 1.0)).xyz;
      float m = (1.0 - smoothstep(0.26, 0.4, length(max(abs(q.xz) - vec2(0.56, 0.6), 0.0)))) * smoothstep(-0.1, 0.3, q.y);
      if (m > gSkinNail) { gSkinNail = m; nq = q.xz; }
    }
    gSkinNail *= hand;
    if (gSkinNail > 0.0) {
      // a pink bed, a paler half-moon at the root, a horn-coloured free edge with dirt under it
      vec3 nail = uTone * vec3(1.32, 1.06, 1.0) + vec3(0.07, 0.02, 0.02);
      nail = mix(nail, nail * 1.1 + 0.05, smoothstep(0.35, 0.75, nq.y) * (1.0 - smoothstep(0.2, 0.7, abs(nq.x))) * 0.7);
      float edge = smoothstep(-0.7, -0.8, nq.y);
      nail = mix(nail, uTone * vec3(1.3, 1.24, 1.1) + 0.05, edge * 0.7);
      nail = mix(nail, vec3(0.16, 0.12, 0.1), skLine(nq.y + 0.72, 0.05) * 0.35);
      // faint ridges along the nail
      nail *= 0.96 + 0.04 * sin(nq.x * 34.0);
      col = mix(col, nail, gSkinNail);
      gSkinH += smoothstep(0.0, 0.6, gSkinNail) * 0.0007;
    }
    // grime worked into the creases and round the nails
    float grime = smoothstep(0.15, 0.5, gSkinNail) * (1.0 - smoothstep(0.5, 0.9, gSkinNail));
    col *= 1.0 - grime * 0.45;

    // cords tied behind the wrist: two of tarred hemp, one paler, each of twisted strands
    gSkinCord = 0.0;
    if (hand < 0.5) {
      float d = uWristY - rp.y;
      vec3 cordC = vec3(0.0);
      float round_ = 0.0;
      for (int i = 0; i < 3; i++) {
        float at = i == 0 ? 0.0165 : i == 1 ? 0.0205 : 0.0262;
        float lay = d - at + sin(atan(rp.z, rp.x) * 2.0 + float(i) * 2.0) * 0.0007;
        float x = lay / 0.0021;
        if (abs(x) < 1.0) {
          round_ = sqrt(1.0 - x * x);
          float strand = 0.5 + 0.5 * sin(atan(rp.z, rp.x) * 46.0 + x * 2.6 + float(i));
          cordC = (i == 2 ? vec3(0.2, 0.16, 0.1) : vec3(0.05, 0.04, 0.034)) * (0.55 + 0.6 * strand);
          gSkinCord = 1.0;
          gSkinH += (round_ + strand * 0.12) * 0.0017;
        }
      }
      // skin pinched dark where a cord presses in
      float press = (1.0 - smoothstep(0.0, 0.004, abs(d - 0.0125))) + (1.0 - smoothstep(0.0, 0.004, abs(d - 0.0295)));
      col *= 1.0 - press * 0.22 * (1.0 - gSkinCord);
      col = mix(col, cordC, gSkinCord);
    }

    gSkinRough = mix(mix(mix(0.62, 0.5, dorsal), 0.26, gSkinNail), 0.88, gSkinCord) + (grain - 0.5) * 0.12 * (1.0 - gSkinNail) + pad * 0.12;
    diffuseColor.rgb *= col;
  }`;

/** Rewrite a standard material's shader so it shades as skin. */
function patchSkin(m: THREE.MeshStandardMaterial, uniforms: SkinUniforms) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 rest;
        attribute vec4 skinA;
        varying vec3 vRest;
        varying vec4 vSkinA;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = rest;
        vSkinA = skinA;`);
    // light wraps round skin, further in red than in blue, so the shadow edge is warm
    const lights = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `vec3 skWrap = vec3(0.15, 0.08, 0.045);
       vec3 skLit = saturate((dot(geometryNormal, directLight.direction) + skWrap) / (1.0 + skWrap));
       reflectedLight.directDiffuse += skLit * directLight.color * BRDF_Lambert( material.diffuseColor );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + SKIN_PARS)
      .replace('#include <lights_physical_pars_fragment>', lights)
      .replace('#include <map_fragment>', '#include <map_fragment>' + SKIN_COLOR)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gSkinRough;')
      .replace('#include <normal_fragment_maps>', 'normal = skBump(normal, -vViewPosition, gSkinH * uUnit);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // a light cupped in the hand shows through the thin parts of it
          vec3 toGlow = uGlowPos + vViewPosition;
          float reach = 1.0 / (1.0 + dot(toGlow, toGlow) * uGlowFall);
          float thin = mix(0.05, 1.0, vSkinA.x * vSkinA.x) * (1.0 - gSkinNail * 0.5) * (1.0 - gSkinCord);
          totalEmissiveRadiance += uGlowColor * vec3(1.0, 0.16, 0.05) * thin * reach;
        }`);
  };
  m.customProgramCacheKey = () => 'skin';
}

/** A skin material. Each one has its own uniforms, so each hand can hold its own light. */
export function skinMaterial(tone: number, side: 1 | -1): SkinMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 }) as SkinMaterial;
  m.skin = {
    uNail: { value: Array.from({ length: 5 }, () => new THREE.Matrix4().makeScale(0, 0, 0)) },
    uTendon: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, 1, 0)) },
    uGlowPos: { value: new THREE.Vector3() },
    uGlowColor: { value: new THREE.Color(0, 0, 0) },
    uGlowFall: { value: 420 },
    uTone: { value: new THREE.Color(tone) },
    uUnit: { value: 1 },
    uWristY: { value: 0 },
    uSide: { value: side },
  };
  patchSkin(m, m.skin);
  return m;
}
