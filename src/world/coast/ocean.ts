// The sea in a storm. Swell rolls in from the south and steepens as the water shallows; the
// crests break into whitewater that covers the shallows, churns against the cliffs and the
// stacks, and drains back down the black sand. Beyond the surf the water is dark slate,
// streaked with old foam and carrying the grey of the sky.
import * as THREE from 'three';
import { fogUniforms } from './atmosphere';
import type { Ground } from './terrain';

function waveNormals(size = 512): THREE.DataTexture {
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
  uSand: { value: new THREE.Color(0x15151a) },
};

const SWELL = /* glsl */ `
  uniform sampler2D uHeights;
  uniform vec3 uGround;
  uniform float uTime, uLevel, uSwell;
  vec2 groundAt(vec2 xz) {
    vec2 hp = (xz - uGround.xy) / uGround.z;
    if (hp.x < 0.0 || hp.y < 0.0 || hp.x > 1.0 || hp.y > 1.0) return vec2(-60.0, -200.0);
    return texture2D(uHeights, hp).rg;
  }
  // the long swell: a few trains from the south and south-west, their crests bending toward
  // the beach as they feel the bottom
  float swellPhase(vec2 p, float depth, int k) {
    vec2 dir = k == 0 ? normalize(vec2(0.12, -1.0)) : k == 1 ? normalize(vec2(0.45, -1.0)) : normalize(vec2(-0.2, -1.0));
    float len = k == 0 ? 34.0 : k == 1 ? 21.0 : 13.0;
    // in shallow water the waves slow and crowd together
    float slow = mix(0.55, 1.0, smoothstep(1.0, 14.0, depth));
    return dot(dir, p) * 6.2832 / (len * slow) - uTime * (k == 0 ? 0.9 : k == 1 ? 1.15 : 1.5) + float(k) * 2.1;
  }
  float swellHeight(vec2 p, float depth, out float crest) {
    float grow = smoothstep(0.3, 2.5, depth) * (1.0 + 0.5 * (1.0 - smoothstep(2.5, 12.0, depth)));
    float h = 0.0;
    crest = 0.0;
    for (int k = 0; k < 3; k++) {
      float ph = swellPhase(p, depth, k);
      float a = (k == 0 ? 1.0 : k == 1 ? 0.55 : 0.25) * uSwell;
      // peaked crests, broad troughs
      float s = sin(ph) * 0.5 + 0.5;
      float w = pow(s, 2.2) * 2.0 - 0.6;
      h += w * a * grow;
      crest += pow(s, 6.0) * (k == 0 ? 1.0 : 0.6);
    }
    return h;
  }`;

export function buildOcean(ground: Ground, opts: { level?: number; deep?: number; shallow?: number; centre?: [number, number]; size?: [number, number]; step?: number } = {}): THREE.Group {
  const level = opts.level ?? 0;
  const nor = waveNormals();
  const u = {
    uNor: { value: nor }, uHeights: { value: ground.heights },
    uGround: { value: new THREE.Vector3(ground.bounds.minX, ground.bounds.minZ, ground.bounds.size) },
    uShallow: { value: new THREE.Color(opts.shallow ?? 0x2a3a38) }, uLevel: { value: level }, uSwell: { value: 0.42 },
  };
  const make = (displace: boolean) => {
    const m = new THREE.MeshPhysicalMaterial({ color: opts.deep ?? 0x0a1214, roughness: 0.08, metalness: 0, transparent: true, ior: 1.33 });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u, oceanUniforms);
      fogUniforms(shader);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n varying vec3 vOPos;\n varying float vCrest;\n${SWELL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ow = modelMatrix * vec4(position, 1.0);
          vCrest = 0.0;
          ${displace ? `
          vec2 g = groundAt(ow.xz);
          float depth = uLevel - g.x;
          float crest;
          float h = swellHeight(ow.xz, depth, crest);
          // the surf zone collapses into a churning sheet that runs up the sand
          h *= smoothstep(0.0, 1.2, depth);
          transformed.y += h;
          vCrest = crest;` : ''}
          vOPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uNor;
          uniform vec3 uShallow, uSand;
          uniform float uNight;
          varying vec3 vOPos;
          varying float vCrest;
          ${SWELL}
          float oFoam, oDepth;
          vec3 oN;
          float oh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float on(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(oh(i), oh(i + vec2(1, 0)), f.x), mix(oh(i + vec2(0, 1)), oh(i + vec2(1, 1)), f.x), f.y); }
          // cellular lace: x = distance to the nearest cell wall (0 on the web, grows into the cell)
          float ovor(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            float d1 = 8.0, d2 = 8.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
              vec2 o = vec2(float(x), float(y));
              vec2 c = vec2(oh(i + o), oh(i + o + 17.3));
              c = 0.5 + 0.45 * sin(uTime * 0.6 + 6.2832 * c);
              float d = length(o + c - f);
              if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
            }
            return d2 - d1;
          }
          float ofbm(vec2 p) { return on(p) * 0.5 + on(p * 2.1 + 3.1) * 0.27 + on(p * 4.3 + 7.7) * 0.15 + on(p * 8.7 + 1.3) * 0.08; }`)
        .replace('#include <map_fragment>', `
          vec2 p = vOPos.xz;
          vec2 g = groundAt(p);
          oDepth = uLevel - g.x;
          float rock = g.y; // > 0 inside rock, the distance to it outside
          // slope from the swell, sampled either side, and chop on top
          float c0, c1, c2;
          float e = 0.6;
          float sh0 = swellHeight(p, oDepth, c0);
          float shx = swellHeight(p + vec2(e, 0.0), oDepth, c1);
          float shz = swellHeight(p + vec2(0.0, e), oDepth, c2);
          vec2 slope = vec2(shx - sh0, shz - sh0) / e * smoothstep(0.0, 1.2, oDepth);
          mat2 r1 = mat2(0.8, -0.6, 0.6, 0.8), r2 = mat2(0.28, 0.96, -0.96, 0.28);
          vec3 n1 = texture2D(uNor, p * 0.021 + vec2(0.0, uTime * 0.012)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNor, (r1 * p) * 0.07 + vec2(uTime * 0.016, -uTime * 0.01)).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNor, (r2 * p) * 0.23 - vec2(uTime * 0.03, uTime * 0.02)).xyz * 2.0 - 1.0;
          slope += n1.xy * 0.5 + n2.xy * 0.4 + n3.xy * 0.25;
          // foam
          float crest = c0;
          float churn = ofbm(p * vec2(0.22, 0.4) + vec2(0.0, -uTime * 0.2)) + ofbm(p * 1.1 + uTime * 0.1) * 0.35 + 0.06;
          float lace = ofbm(p * vec2(0.7, 1.4) + churn * 1.5);
          // breaker lines run parallel to the shore (depth contours): a sharp white front on each
          // wave that decays seaward into a trailing band of lace, with dark troughs between
          float wob = (ofbm(vec2(p.x * 0.035, p.y * 0.012)) - 0.5) * 1.6 + (on(p * 0.18) - 0.5) * 0.25;
          float q = fract(oDepth / 5.5 + uTime * 0.075 + wob);
          float band = (1.0 - smoothstep(0.0, 0.62, q)) * smoothstep(1.0, 0.965, q);
          float zone = smoothstep(11.0, 5.0, oDepth) * smoothstep(0.35, 1.6, oDepth);
          float web = 1.0 - smoothstep(0.0, 0.3, ovor(p * vec2(0.5, 0.9) + churn * 0.8));
          float web2 = 1.0 - smoothstep(0.0, 0.22, ovor(p * vec2(1.2, 2.0) + 9.0 - vec2(0.0, uTime * 0.2)));
          float body0 = band * zone;
          float breaking = smoothstep(0.42, 0.62, body0 * (0.55 + 0.6 * lace) + web * body0 * 0.45 + web2 * body0 * 0.2 - 0.12);
          // whitewater tumbling in over the last metres: only a thin web, lots of holes
          float inner = smoothstep(2.6, 0.9, oDepth) * smoothstep(0.35, 0.9, oDepth) * band;
          float surf = inner * smoothstep(0.5, 0.75, web * 0.7 + web2 * 0.4 + lace * 0.3 - 0.2) * 0.8;
          // foam round the cliffs and the stacks, thrown up where the water meets rock
          float atRock = smoothstep(-12.0, 0.0, rock) * smoothstep(0.55, 0.78, churn + smoothstep(-4.0, 0.0, rock) * 0.35) * smoothstep(0.3, 0.5, lace);
          // old foam left on the surface in long streaks, pulled by the wind
          float streaks = smoothstep(0.6, 0.8, ofbm(p * vec2(0.05, 0.22) + vec2(ofbm(p * 0.02) * 2.0, 0.0))) * 0.55 * (1.0 - smoothstep(30.0, 90.0, oDepth));
          // the last of a wave sliding up the sand: a bright lacy lip at the leading edge only,
          // dark glassy water behind it
          float lip = smoothstep(0.0, 0.03, oDepth) * smoothstep(0.2, 0.05, oDepth);
          float swash = lip * smoothstep(0.25, 0.55, web * 0.6 + web2 * 0.5 + lace * 0.35 - 0.1);
          float trail = smoothstep(0.7, 0.25, oDepth) * smoothstep(0.2, 0.4, oDepth) * smoothstep(0.62, 0.8, web2 * 0.6 + lace * 0.5) * 0.45;
          oFoam = clamp(max(max(breaking, surf), max(max(atRock, swash), trail)) + streaks, 0.0, 1.0);
          // body: dark slate out in the bay, turbid grey-green where the sand is stirred up
          vec3 body = mix(diffuseColor.rgb, uShallow * 0.55, smoothstep(16.0, 2.0, oDepth));
          body = mix(body, uSand, smoothstep(1.2, 0.0, oDepth) * 0.6);
          // foam has body: brighter where it heaps up, grey and thin at its edges
          float heap = ofbm(p * 2.2 + uTime * 0.2);
          vec3 foamC = mix(vec3(0.27, 0.3, 0.32), vec3(0.8, 0.83, 0.85), smoothstep(0.25, 0.8, heap) * smoothstep(0.1, 0.6, oFoam));
          diffuseColor.rgb = mix(body, foamC, oFoam);
          diffuseColor.a = mix(smoothstep(0.0, 0.6, oDepth) * 0.5 + 0.5, 1.0, smoothstep(0.0, 0.5, oFoam)) * smoothstep(-0.05, 0.03, oDepth);
          slope += (vec2(on(p * 3.5), on(p * 3.5 + 5.0)) - 0.5) * oFoam * 1.4;
          oN = normalize(vec3(-slope.x, 1.0, -slope.y));`)
        // the open water gives back only a dull slate of the sky; foam scatters light properly
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          reflectedLight.indirectSpecular *= mix(0.28, 1.0, oFoam);`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.07, 0.85, oFoam);')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(oN, 0.0)).xyz);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.05, 0.6, 0.75) * oFoam * oFoam * uNight * (0.6 + 0.4 * on(p * 0.7 + uTime * 0.3));`);
    };
    m.customProgramCacheKey = () => 'ocean' + displace;
    return m;
  };
  const g = new THREE.Group();
  // near: finely divided so the swell can be in its shape
  const [cx, cz] = opts.centre ?? [-60, 180], [sx, sz] = opts.size ?? [640, 420], step = opts.step ?? 0.8;
  const near = new THREE.PlaneGeometry(sx, sz, Math.round(sx / step), Math.round(sz / step));
  near.rotateX(-Math.PI / 2);
  near.translate(cx, level, cz);
  const nearMesh = new THREE.Mesh(near, make(true));
  nearMesh.receiveShadow = true;
  nearMesh.renderOrder = 2;
  nearMesh.frustumCulled = false;
  // far: flat, out to the horizon, just under the near sheet
  const farGeo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  farGeo.rotateX(-Math.PI / 2);
  farGeo.translate(cx, level - 0.6, cz);
  const farPlane = new THREE.Mesh(farGeo, make(false));
  farPlane.renderOrder = 1;
  g.add(nearMesh, farPlane);
  return g;
}
