// The ground: one surface from the sea floor to the dunes, painted from scanned sand. Dry sand
// is pale and dull; where the sea or the stream has wet it, it darkens and shines; ripples and
// grit up close.
import * as THREE from 'three';
import { fogUniforms } from './atmosphere';
import { groundHeight, wetness } from './layout';

export interface TextureSet { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture }

export async function loadTextureSet(base: string, anisotropy = 8): Promise<TextureSet> {
  const loader = new THREE.TextureLoader();
  const [diff, nor, arm] = await Promise.all(['diff', 'nor', 'arm'].map((n) => loader.loadAsync(`${base}/${n}.jpg`)));
  diff.colorSpace = THREE.SRGBColorSpace;
  for (const t of [diff, nor, arm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy; }
  return { diff, nor, arm };
}

export interface Ground {
  mesh: THREE.Mesh;
  /** Heights on a grid, for the sea's depth and for anything that must sit on the ground. */
  heights: THREE.DataTexture;
  bounds: { minX: number; minZ: number; size: number };
}

export function buildGround(dry: TextureSet, damp: TextureSet, rock: TextureSet, opts: { minX: number; maxX: number; minZ: number; maxZ: number; cell: number }): Ground {
  const { minX, maxX, minZ, maxZ, cell } = opts;
  const nx = Math.round((maxX - minX) / cell), nz = Math.round((maxZ - minZ) / cell);
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position;
  const wet = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    wet[i] = wetness(x, z);
  }
  geo.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
  geo.computeVertexNormals();

  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const u = {
    dryMap: { value: dry.diff }, dryNor: { value: dry.nor }, dryArm: { value: dry.arm },
    dampMap: { value: damp.diff }, dampNor: { value: damp.nor }, dampArm: { value: damp.arm },
    rockMap: { value: rock.diff }, rockNor: { value: rock.nor },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float wet;
        varying float vWet;
        varying vec3 vGPos;
        varying vec3 vGNor;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWet = wet;
        vGPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vGNor = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D dryMap, dryNor, dryArm, dampMap, dampNor, dampArm, rockMap, rockNor;
        varying float vWet;
        varying vec3 vGPos;
        varying vec3 vGNor;
        float gWet, gAO, gRough;
        vec3 gN;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
        // two lookups at different scales and turns, mixed by a slow noise, so the tiling never shows
        vec4 untiled(sampler2D t, vec2 p, float mixer) {
          vec4 a = texture2D(t, p);
          vec2 q = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) * 0.71 + 0.37;
          vec4 b = texture2D(t, q);
          return mix(a, b, mixer);
        }`)
      .replace('#include <map_fragment>', `
        vec2 guv = vGPos.xz / 2.6;
        float mixer = smoothstep(0.3, 0.7, gn(vGPos.xz * 0.08));
        // wet where the sea and the stream reach, broken at its edge
        gWet = smoothstep(0.15, 0.85, vWet + (gn(vGPos.xz * 0.6) - 0.5) * 0.3);
        vec3 dryC = untiled(dryMap, guv, mixer).rgb;
        vec3 dampC = untiled(dampMap, guv * 1.1, mixer).rgb * 0.75;
        vec4 armD = untiled(dryArm, guv, mixer), armW = untiled(dampArm, guv * 1.1, mixer);
        vec3 nD = untiled(dryNor, guv, mixer).xyz * 2.0 - 1.0;
        vec3 nW = untiled(dampNor, guv * 1.1, mixer).xyz * 2.0 - 1.0;
        // large patches of lighter and darker sand
        float sandPatch = 0.86 + 0.28 * gn(vGPos.xz * 0.05) + 0.1 * gn(vGPos.xz * 0.3);
        diffuseColor.rgb *= mix(dryC * sandPatch, dampC, gWet);
        gAO = mix(armD.r, armW.r, gWet);
        gRough = mix(armD.g, mix(0.55, 0.32, smoothstep(0.7, 1.0, gWet)), gWet);
        vec3 nT = normalize(mix(nD, nW * vec3(0.6, 0.6, 1.0), gWet));
        // the texture's frame: x east, y north (-z), up out of the ground
        vec3 wn = normalize(vGNor);
        vec3 tx = normalize(vec3(1.0, 0.0, 0.0) - wn * wn.x);
        vec3 tz = normalize(cross(wn, tx));
        gN = normalize(tx * nT.x + tz * nT.y + wn * nT.z);
        // where the ground is steep it is bare rock, the same pale stone as the cliffs
        float steep = smoothstep(0.82, 0.6, wn.y + (gn(vGPos.xz * 0.3 + vGPos.y * 0.2) - 0.5) * 0.15);
        if (steep > 0.0) {
          vec3 tw = pow(abs(wn), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
          vec3 rc = texture2D(rockMap, vGPos.zy * 0.06).rgb * tw.x + texture2D(rockMap, vGPos.xz * 0.06).rgb * tw.y + texture2D(rockMap, vGPos.xy * 0.06).rgb * tw.z;
          rc = mix(vec3(dot(rc, vec3(0.3, 0.55, 0.15))), rc, 0.3) * vec3(1.05, 1.0, 0.95);
          diffuseColor.rgb = mix(diffuseColor.rgb, rc, steep);
          vec3 rn = (texture2D(rockNor, vGPos.zy * 0.06).xyz * 2.0 - 1.0);
          gN = normalize(mix(gN, normalize(wn + vec3(rn.x, rn.y, 0.0) * 0.6), steep));
          gRough = mix(gRough, 0.85, steep);
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= gAO;
        reflectedLight.indirectSpecular *= mix(gAO, 1.0, gWet);`);
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // a height grid the sea can read its depth from
  const hn = 512, size = Math.max(maxX - minX, maxZ - minZ);
  const data = new Float32Array(hn * hn);
  for (let j = 0; j < hn; j++) for (let i = 0; i < hn; i++) data[j * hn + i] = groundHeight(minX + ((i + 0.5) / hn) * size, minZ + ((j + 0.5) / hn) * size);
  const heights = new THREE.DataTexture(data, hn, hn, THREE.RedFormat, THREE.FloatType);
  heights.magFilter = THREE.LinearFilter;
  heights.minFilter = THREE.LinearFilter;
  heights.needsUpdate = true;
  return { mesh, heights, bounds: { minX, minZ, size } };
}
