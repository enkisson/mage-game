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
        attribute vec2 blend;
        varying vec2 vBlend;
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
        varying vec2 vBlend;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        vec3 gTriWeights;
        float gRock;
        vec4 triplanar(sampler2D tex, float scale) {
          vec4 x = texture2D(tex, vWPos.zy * scale);
          vec4 y = texture2D(tex, vWPos.xz * scale);
          vec4 z = texture2D(tex, vWPos.xy * scale);
          return x * gTriWeights.x + y * gTriWeights.y + z * gTriWeights.z;
        }`)
      .replace('#include <map_fragment>', `
        gTriWeights = pow(abs(normalize(vWNormal)), vec3(6.0));
        gTriWeights /= (gTriWeights.x + gTriWeights.y + gTriWeights.z);
        gRock = smoothstep(0.35, 0.65, vBlend.x);
        vec3 sandC = sandColor;
        vec3 rockC = rockColor;
        if (useMaps > 0.5) {
          sandC = texture2D(sandMap, vWPos.xz * sandScale).rgb;
          // break up tiling with a second, larger sample
          sandC = mix(sandC, texture2D(sandMap, vWPos.xz * sandScale * 0.23 + 0.37).rgb, 0.35);
          rockC = triplanar(rockMap, rockScale).rgb;
        }
        vec3 groundC = mix(sandC, rockC, gRock);
        groundC *= mix(1.0, 0.55, vBlend.y);
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
          vec3 sandN = normalize(vec3(nS.x, 0.0, nS.y) * 0.8 + wn);
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
  water: new THREE.MeshStandardMaterial({ color: 0x0b1820, roughness: 0.1, metalness: 0.35, transparent: true, opacity: 0.93, normalMap: waterRipples, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.6 }),
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
