// Surface materials. Textures are optional: every material works as a flat colour first and
// picks up scanned maps when `loadTextures` finds them, so the game runs with or without assets.
import * as THREE from 'three';

export interface TextureSet {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  /** Packed occlusion (r), roughness (g), metalness (b). */
  arm?: THREE.Texture;
}

const groundUniforms = {
  sandMap: { value: null as THREE.Texture | null },
  sandNormal: { value: null as THREE.Texture | null },
  rockMap: { value: null as THREE.Texture | null },
  rockNormal: { value: null as THREE.Texture | null },
  useMaps: { value: 0 },
  sandColor: { value: new THREE.Color(0x8d7f68) },
  rockColor: { value: new THREE.Color(0x4f4b52) },
  sandScale: { value: 0.28 },
  rockScale: { value: 0.11 },
};

/**
 * Ground: sand and rock blended by a per-vertex weight, projected from three sides so cliffs
 * do not smear, and darkened where the tide keeps it wet.
 */
function groundMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, groundUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 blend;
        varying vec3 vBlend;
        varying vec3 vWPos;
        varying vec3 vWNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBlend = blend;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D sandMap, sandNormal, rockMap, rockNormal;
        uniform float useMaps, sandScale, rockScale;
        uniform vec3 sandColor, rockColor;
        varying vec3 vBlend;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        vec3 gTriWeights;
        float gRock;
        float gRipple;   // -1..1 across each wind ripple
        float gRippleAmt; // how strongly the sand here is rippled
        float gNear;      // 1 underfoot, 0 a little way off
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float phaseOf(vec2 p) {
          return dot(p, vec2(0.5, -0.866)) * 17.0 + gNoise(p * 0.45) * 7.0 + gNoise(p * 1.9) * 1.6;
        }
        vec4 triplanar(sampler2D tex, float scale) {
          vec4 x = texture2D(tex, vWPos.zy * scale);
          vec4 y = texture2D(tex, vWPos.xz * scale);
          vec4 z = texture2D(tex, vWPos.xy * scale);
          return x * gTriWeights.x + y * gTriWeights.y + z * gTriWeights.z;
        }`)
      .replace('#include <map_fragment>', `
        gTriWeights = pow(abs(normalize(vWNormal)), vec3(6.0));
        gTriWeights /= (gTriWeights.x + gTriWeights.y + gTriWeights.z);
        // sand gives way to rock along a ragged edge, not a straight one
        float edge = gNoise(vWPos.xz * 0.9) * 0.6 + gNoise(vWPos.xz * 3.7) * 0.4;
        gRock = smoothstep(0.3, 0.7, vBlend.x + (edge - 0.5) * 0.4);
        vec3 sandC = sandColor;
        vec3 rockC = rockColor;
        if (useMaps > 0.5) {
          sandC = texture2D(sandMap, vWPos.xz * sandScale).rgb;
          // break up tiling with a second, larger sample
          sandC = mix(sandC, texture2D(sandMap, vWPos.xz * sandScale * 0.23 + 0.37).rgb, 0.35);
          rockC = triplanar(rockMap, rockScale).rgb;
          // grain: up close the sand is made of something
          gNear = 1.0 - smoothstep(3.0, 13.0, distance(vWPos, cameraPosition));
          float grain = texture2D(sandMap, vWPos.xz * sandScale * 4.7 + 0.11).g;
          sandC *= mix(1.0, 0.72 + grain * 0.75, gNear * 0.8);
        }
        // Wind ripples on the dry sand: crests square to the wind, wandering, in patches,
        // gone where the tide smooths it and where the beach turns to rock.
        float phase = phaseOf(vWPos.xz);
        gRipple = cos(phase);
        float patches = smoothstep(0.32, 0.62, gNoise(vWPos.xz * 0.12 + 5.3));
        float flat_ = smoothstep(0.86, 0.97, normalize(vWNormal).y);
        float dry = smoothstep(0.55, 1.0, vWPos.y) * (1.0 - vBlend.y);
        gRippleAmt = patches * flat_ * dry * (1.0 - gRock) * (1.0 - smoothstep(0.0, 0.5, vBlend.z))
          * (1.0 - smoothstep(0.7, 2.2, fwidth(phase)));
        sandC *= 1.0 - (0.5 - 0.5 * gRipple) * 0.12 * gRippleAmt;
        vec3 groundC = mix(sandC, rockC, gRock);
        groundC *= mix(1.0, 0.55, vBlend.y);
        // damp, shaded sand where it is banked against something
        groundC *= mix(1.0, 0.7, smoothstep(0.0, 0.9, vBlend.z));
        // the wrack line: weed and splinters left along the last high tide
        // (a thin, broken string of it, wandering a little up and down the beach)
        float tide = vWPos.y + (gNoise(vWPos.xz * 0.35) - 0.5) * 0.12;
        float band = smoothstep(0.4, 0.46, tide) * smoothstep(0.56, 0.5, tide);
        float weed = smoothstep(0.52, 0.7, gNoise(vWPos.xz * vec2(1.6, 5.0)) * 0.5 + gNoise(vWPos.xz * 13.0) * 0.5);
        groundC = mix(groundC, vec3(0.07, 0.06, 0.04), band * weed * 0.7 * (1.0 - gRock));
        diffuseColor.rgb *= groundC;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * mix(mix(0.95, 0.85, gRock), 0.3, vBlend.y * 0.8);`)
      .replace('#include <normal_fragment_maps>', `
        if (useMaps > 0.5) {
          vec3 nS = texture2D(sandNormal, vWPos.xz * sandScale).xyz * 2.0 - 1.0;
          vec3 nRx = texture2D(rockNormal, vWPos.zy * rockScale).xyz * 2.0 - 1.0;
          vec3 nRy = texture2D(rockNormal, vWPos.xz * rockScale).xyz * 2.0 - 1.0;
          vec3 nRz = texture2D(rockNormal, vWPos.xy * rockScale).xyz * 2.0 - 1.0;
          vec3 wn = normalize(vWNormal);
          // whiteout blend: tilt the world normal by each projection's detail
          vec3 rockN = normalize(
            vec3(0.0, nRx.y, nRx.x) * gTriWeights.x + vec3(nRy.x, 0.0, nRy.y) * gTriWeights.y + vec3(nRz.x, nRz.y, 0.0) * gTriWeights.z + wn);
          vec3 nG = texture2D(sandNormal, vWPos.xz * sandScale * 4.7 + 0.11).xyz * 2.0 - 1.0;
          vec3 sandTilt = vec3(nS.x, 0.0, nS.y) * 0.8 + vec3(nG.x, 0.0, nG.y) * 0.7 * gNear;
          // each ripple leans its lee face away from the wind
          sandTilt.xz += vec2(0.5, -0.866) * sin(phaseOf(vWPos.xz)) * 0.55 * gRippleAmt;
          vec3 sandN = normalize(sandTilt + wn);
          vec3 worldN = normalize(mix(sandN, rockN, gRock));
          normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
        }`);
  };
  return m;
}

/** A tileable ripple normal map, built from a handful of sine waves so it wraps exactly. */
function rippleNormals(size = 256): THREE.DataTexture {
  const waves = [[1, 2, 0.5, 0.3], [-2, 3, 0.3, 1.7], [4, -1, 0.22, 2.9], [5, 6, 0.12, 0.4], [-7, 4, 0.1, 4.1], [9, -8, 0.06, 5.3]];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let dx = 0, dy = 0;
      for (const [kx, ky, amp, phase] of waves) {
        const c = Math.cos(Math.PI * 2 * (kx * u + ky * v) + phase) * amp;
        dx += c * kx;
        dy += c * ky;
      }
      const n = new THREE.Vector3(-dx * 0.22, -dy * 0.22, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.repeat.set(70, 70);
  tex.needsUpdate = true;
  return tex;
}

export const waterRipples = rippleNormals();

/** What objects need to know about the ground they sit on: its height everywhere, and its sand. */
export const seat = {
  height: { value: null as THREE.Texture | null },
  min: { value: new THREE.Vector2() },
  size: { value: new THREE.Vector2(1, 1) },
  on: { value: 0 },
};

/**
 * Bed a material into the ground. Wherever the surface comes within `reach` metres of the
 * sand it takes on the sand itself, raggedly, with a damp margin above; so a hull or a rock
 * looks half swallowed instead of resting on top.
 */
export function seatInGround<T extends THREE.MeshStandardMaterial>(m: T, reach: number): T {
  if (m.userData.seated) return m;
  m.userData.seated = true;
  const uReach = { value: reach };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSeatHeight = seat.height;
    shader.uniforms.uSeatMin = seat.min;
    shader.uniforms.uSeatSize = seat.size;
    shader.uniforms.uSeatOn = seat.on;
    shader.uniforms.uSeatSand = groundUniforms.sandMap;
    shader.uniforms.uSeatSandColor = groundUniforms.sandColor;
    shader.uniforms.uSeatSandScale = groundUniforms.sandScale;
    shader.uniforms.uSeatUseMap = groundUniforms.useMaps;
    shader.uniforms.uSeatReach = uReach;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeatPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vSeatPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vSeatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uSeatHeight, uSeatSand;
        uniform vec2 uSeatMin, uSeatSize;
        uniform vec3 uSeatSandColor;
        uniform float uSeatOn, uSeatReach, uSeatSandScale, uSeatUseMap;
        varying vec3 vSeatPos;
        float seatSandy;
        float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        seatSandy = 0.0;
        if (uSeatOn > 0.5) {
          float groundY = texture2D(uSeatHeight, (vSeatPos.xz - uSeatMin) / uSeatSize).r;
          float above = vSeatPos.y - groundY;
          // irregular in every direction, so the sand's edge is blotched and not combed into streaks
          vec2 face = vec2(vSeatPos.x + vSeatPos.z * 0.7, vSeatPos.y * 1.6 + vSeatPos.z * 0.4);
          float ragged = (sNoise(face * 2.6) - 0.5) * 0.9 + (sNoise(face * 8.5 + 3.1) - 0.5) * 0.4 + (sNoise(vSeatPos.xz * 3.3) - 0.5) * 0.3;
          float h = above / uSeatReach + ragged * 0.55;
          seatSandy = smoothstep(1.0, 0.25, h);
          vec3 sand = uSeatSandColor;
          if (uSeatUseMap > 0.5) {
            sand = texture2D(uSeatSand, vSeatPos.xz * uSeatSandScale).rgb;
            sand = mix(sand, texture2D(uSeatSand, vSeatPos.xz * uSeatSandScale * 0.23 + 0.37).rgb, 0.35);
          }
          // a damp, stained margin just above the sand, then the sand itself
          diffuseColor.rgb *= mix(1.0, 0.62, smoothstep(2.6, 1.0, h) * (1.0 - seatSandy));
          diffuseColor.rgb = mix(diffuseColor.rgb, sand * 0.9, seatSandy);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, seatSandy);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= 1.0 - seatSandy;`);
  };
  m.needsUpdate = true;
  return m;
}

export const seaUniforms = { uTime: { value: 0 } };

/**
 * The sea. Each vertex knows how deep the water is under it, so the edge can be clear and
 * shallow, the open water dark, and a line of foam can ride the swell up and down the sand.
 */
function seaMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.1, metalness: 0.3, transparent: true, normalMap: waterRipples,
    normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.6,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float depth;
        attribute float shoal;
        uniform float uTime;
        varying float vDepth;
        varying float vShoal;
        varying vec2 vShore;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // the swell: the whole surface breathes, and with it the waterline moves on the sand
        float swell = sin(uTime * 0.55 + position.x * 0.05) * 0.07 + sin(uTime * 0.9 + position.x * 0.13 + 1.7) * 0.035;
        transformed.z += swell;
        vDepth = depth + swell;
        vShoal = shoal;
        vShore = position.xy;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying float vDepth;
        varying float vShoal;
        varying vec2 vShore;
        float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float seaNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `
        float d = vDepth;
        if (d < 0.0) discard;
        vec3 shallow = vec3(0.16, 0.2, 0.2);
        vec3 deep = vec3(0.012, 0.03, 0.045);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 1.6, d));
        // foam: a bright lip at the very edge, and broken streaks behind it
        float lace = seaNoise(vShore * 1.7 + vec2(uTime * 0.25, -uTime * 0.4)) * 0.6 + seaNoise(vShore * 5.0 - vec2(uTime * 0.5, 0.0)) * 0.4;
        float lip = smoothstep(0.1, 0.0, d);
        float streaks = smoothstep(0.55, 0.05, d) * smoothstep(0.52, 0.8, lace);
        // and white water where the swell meets a rock standing in it
        float wash = smoothstep(0.12, 0.6, vShoal + (lace - 0.5) * 0.6) * (0.7 + 0.3 * sin(uTime * 0.9 + vShore.x * 0.3));
        float foam = clamp(lip * 0.9 + streaks * 0.7 + wash, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.66, 0.7), foam);
        diffuseColor.a = mix(smoothstep(0.0, 0.5, d) * 0.5 + smoothstep(0.2, 1.4, d) * 0.45, 0.9, foam);`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(roughness, 0.85, foam);`);
  };
  return m;
}

export const MATERIALS = {
  ground: groundMaterial(),
  rock: new THREE.MeshStandardMaterial({ color: 0x57535a, roughness: 0.92 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b5644, roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3d3129, roughness: 0.92 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 1 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x9a7359, roughness: 0.62 }),
  linen: new THREE.MeshStandardMaterial({ color: 0x8f8672, roughness: 0.95 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x3a2b22, roughness: 0.8 }),
  conjuredStone: new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.9, emissive: 0xd9a35a, emissiveIntensity: 0.05 }),
  water: seaMaterial(),
};

function prep(tex: THREE.Texture, srgb: boolean, anisotropy: number) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Load scanned texture sets from `assets/textures/<name>/{diff,nor,arm}.jpg`.
 * Missing files are skipped quietly and the flat colours stay.
 */
export async function loadTextures(base: string, anisotropy: number): Promise<void> {
  const loader = new THREE.TextureLoader();
  const load = (path: string, srgb: boolean) =>
    new Promise<THREE.Texture | null>((resolve) => {
      loader.load(base + path, (t) => resolve(prep(t, srgb, anisotropy)), undefined, () => resolve(null));
    });
  const set = async (name: string): Promise<TextureSet> => {
    const [map, normalMap, arm] = await Promise.all([
      load(`textures/${name}/diff.jpg`, true), load(`textures/${name}/nor.jpg`, false), load(`textures/${name}/arm.jpg`, false),
    ]);
    return { map: map ?? undefined, normalMap: normalMap ?? undefined, arm: arm ?? undefined };
  };
  const apply = (m: THREE.MeshStandardMaterial, t: TextureSet, tint = 0xffffff) => {
    if (!t.map) return;
    m.map = t.map;
    m.color.set(tint);
    if (t.normalMap) m.normalMap = t.normalMap;
    if (t.arm) {
      m.roughnessMap = t.arm;
      m.aoMap = t.arm;
      m.roughness = 1;
    }
    m.needsUpdate = true;
  };

  const [sand, rock, wood] = await Promise.all([set('sand'), set('rock'), set('wood')]);
  if (sand.map && rock.map) {
    groundUniforms.sandMap.value = sand.map;
    groundUniforms.sandNormal.value = sand.normalMap ?? null;
    groundUniforms.rockMap.value = rock.map;
    groundUniforms.rockNormal.value = rock.normalMap ?? null;
    groundUniforms.useMaps.value = sand.normalMap && rock.normalMap ? 1 : 0;
  }
  apply(MATERIALS.rock, rock, 0xb9b4b0);
  apply(MATERIALS.wood, wood, 0xc9b8a6);
  apply(MATERIALS.woodDark, wood, 0x7c6a5c);
  apply(MATERIALS.conjuredStone, rock, 0xd8cdbe);
}
