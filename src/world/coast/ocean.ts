// The sea. The sky in it, moving; deep green-black out in the bay, clear over the sand in the
// shallows; sets of waves coming in and breaking white along the beach and round the rocks,
// leaving lace on the water behind them. At night the broken water glows with sea-fire.
import * as THREE from 'three';
import { fogUniforms } from './atmosphere';
import type { Ground } from './terrain';

function waveNormals(size = 512): THREE.DataTexture {
  // a tileable chop: a few dozen waves of random direction and length, summed
  const r = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const waves: [number, number, number, number][] = [];
  for (let k = 0; k < 90; k++) {
    const kx = Math.round((r() - 0.5) * 46), ky = Math.round((r() - 0.5) * 46);
    if (kx === 0 && ky === 0) continue;
    waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.3), r() * 6.283]);
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, a, p] of waves) {
      const c = Math.cos(Math.PI * 2 * (kx * x + ky * y) / size + p) * a;
      dx += c * kx; dy += c * ky;
    }
    const n = new THREE.Vector3(-dx * 0.07, -dy * 0.07, 1).normalize();
    const i = (y * size + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export const oceanUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uSand: { value: new THREE.Color(0x8a7c66) },
};

export function buildOcean(ground: Ground, opts: { level?: number; size?: number; deep?: number; shallow?: number } = {}): THREE.Mesh {
  const level = opts.level ?? 0;
  const size = opts.size ?? 40000;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, level, 0);
  const m = new THREE.MeshPhysicalMaterial({ color: opts.deep ?? 0x061418, roughness: 0.05, metalness: 0, transparent: true, clearcoat: 0, ior: 1.33 });
  const nor = waveNormals();
  const u = {
    uNor: { value: nor }, uHeights: { value: ground.heights },
    uGround: { value: new THREE.Vector3(ground.bounds.minX, ground.bounds.minZ, ground.bounds.size) },
    uShallow: { value: new THREE.Color(opts.shallow ?? 0x123230) }, uLevel: { value: level },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, oceanUniforms);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vOPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vOPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNor, uHeights;
        uniform vec3 uGround, uShallow, uSand;
        uniform float uTime, uNight, uLevel;
        varying vec3 vOPos;
        float oFoam, oDepth;
        vec3 oN;
        float oh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float on(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(oh(i), oh(i + vec2(1, 0)), f.x), mix(oh(i + vec2(0, 1)), oh(i + vec2(1, 1)), f.x), f.y); }
        float ofbm(vec2 p) { return on(p) * 0.55 + on(p * 2.1 + 3.1) * 0.3 + on(p * 4.3 + 7.7) * 0.15; }`)
      .replace('#include <map_fragment>', `
        vec2 hp = (vOPos.xz - uGround.xy) / uGround.z;
        float ground = (hp.x > 0.0 && hp.y > 0.0 && hp.x < 1.0 && hp.y < 1.0) ? texture2D(uHeights, hp).r : -40.0;
        oDepth = uLevel - ground;
        // the surface: long swell from the south, chop on it, finer near at hand
        vec2 p = vOPos.xz;
        mat2 r1 = mat2(0.8, -0.6, 0.6, 0.8), r2 = mat2(0.28, 0.96, -0.96, 0.28);
        vec3 n1 = texture2D(uNor, p * 0.011 + vec2(0.0, uTime * 0.008)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNor, (r1 * p) * 0.037 + vec2(uTime * 0.011, -uTime * 0.006)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uNor, (r2 * p) * 0.13 - vec2(uTime * 0.02, uTime * 0.014)).xyz * 2.0 - 1.0;
        // calmer in patches, as wind lies on the water unevenly
        float gust = 0.55 + 0.45 * ofbm(p * 0.006 + uTime * 0.003);
        vec2 slope = (n1.xy * 1.8 + n2.xy * 1.1 + n3.xy * 0.55) * gust;
        // sets of waves rolling in toward the beach, steepening as the water shallows
        float shoal = smoothstep(9.0, 0.5, oDepth);
        float ph = p.y * 0.55 - uTime * 1.1 + ofbm(p * 0.03) * 6.0;
        slope.y += cos(ph) * 0.55 * shoal;
        oN = normalize(vec3(-slope.x, 1.0, -slope.y));
        // foam: the breaking crest in the shallows, its lace behind, a line where it meets the sand
        float crest = smoothstep(0.45, 1.0, sin(ph)) * smoothstep(4.5, 0.6, oDepth) * smoothstep(0.0, 0.25, oDepth) * (0.5 + 0.5 * on(p * vec2(0.08, 0.5)));
        float lace = smoothstep(0.52, 0.75, ofbm(p * vec2(0.35, 0.9) + vec2(0.0, -uTime * 0.25))) * smoothstep(5.0, 0.8, oDepth);
        float edge = smoothstep(0.35, 0.0, oDepth) * (0.6 + 0.4 * on(p * 3.0 + uTime));
        oFoam = clamp(crest * (0.75 + 0.25 * on(p * 2.0)) * 1.3 + lace * 0.65 + edge, 0.0, 1.0);
        // body: dark and green in the deep, the sand showing through in the shallows
        float clear = smoothstep(2.5, 0.0, oDepth);
        vec3 body = mix(diffuseColor.rgb, uShallow, smoothstep(14.0, 2.0, oDepth));
        body = mix(body, uSand * 0.4, clear * 0.7);
        diffuseColor.rgb = mix(body, vec3(0.85, 0.88, 0.9), oFoam);
        diffuseColor.a = mix(smoothstep(0.0, 0.9, oDepth) * 0.9 + 0.1, 1.0, oFoam) * smoothstep(-0.05, 0.05, oDepth);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.035 + (1.0 - smoothstep(0.0, 400.0, length(vOPos.xz - cameraPosition.xz))) * 0.03, 0.75, oFoam);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(normalize(mix(oN, vec3(0.0, 1.0, 0.0), oFoam * 0.7)), 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.05, 0.6, 0.75) * oFoam * oFoam * uNight * (0.6 + 0.4 * on(p * 0.7 + uTime * 0.3));`);
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return mesh;
}
