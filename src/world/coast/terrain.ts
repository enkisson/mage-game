// The ground: one surface from the sea floor to the dunes, painted from scanned sand. Dry sand
// is pale and dull; where the sea or the stream has wet it, it darkens and shines; ripples and
// grit up close.
import * as THREE from 'three';
import { fogUniforms } from './atmosphere';
import { greenness, groundHeight, rockDistance, wetness } from './layout';

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
  const wet = new Float32Array(pos.count), green = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    wet[i] = wetness(x, z);
    green[i] = greenness(x, z);
  }
  geo.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
  geo.setAttribute('green', new THREE.BufferAttribute(green, 1));
  geo.computeVertexNormals();

  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const u = {
    dryMap: { value: dry.diff }, dryNor: { value: dry.nor },
    dampMap: { value: damp.diff }, dampNor: { value: damp.nor },
    rockMap: { value: rock.diff }, rockNor: { value: rock.nor },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float wet;
        attribute float green;
        varying float vWet;
        varying float vGreen;
        varying vec3 vGPos;
        varying vec3 vGNor;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWet = wet;
        vGreen = green;
        vGPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vGNor = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D dryMap, dryNor, dampMap, dampNor, rockMap, rockNor;
        varying float vWet;
        varying float vGreen;
        varying vec3 vGPos;
        varying vec3 vGNor;
        float gWet, gRough, gPuddle;
        vec3 gN;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
        float gf(vec2 p) { return gn(p) * 0.5 + gn(p * 2.1 + 3.0) * 0.3 + gn(p * 4.3 + 7.0) * 0.2; }
        vec4 untiled(sampler2D t, vec2 p, float mixer) {
          vec4 a = texture2D(t, p);
          vec2 q = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) * 0.71 + 0.37;
          return mix(a, texture2D(t, q), mixer);
        }`)
      .replace('#include <map_fragment>', `
        vec2 guv = vGPos.xz / 2.2;
        float mixer = smoothstep(0.3, 0.7, gn(vGPos.xz * 0.08));
        vec3 wn = normalize(vGNor);
        // black volcanic sand: the scanned grains, greyed and darkened
        vec3 sc = untiled(dryMap, guv, mixer).rgb;
        float sl = dot(sc, vec3(0.3, 0.55, 0.15));
        vec3 sandC = mix(vec3(sl), sc, 0.12) * vec3(0.27, 0.27, 0.29);
        sandC *= 0.8 + 0.4 * gf(vGPos.xz * 0.05);
        // wet where the sea and the river reach: darker still, and glassy
        gWet = smoothstep(0.12, 0.85, vWet + (gn(vGPos.xz * 0.5) - 0.5) * 0.25);
        vec3 wetC = sandC * 0.45;
        vec3 c = mix(sandC, wetC, gWet);
        // shingle: drifts of black pebbles along the storm berm
        float shingle = smoothstep(0.62, 0.8, gf(vGPos.xz * vec2(0.08, 0.25))) * (1.0 - gWet);
        float peb = gn(vGPos.xz * 9.0);
        c = mix(c, vec3(0.025, 0.026, 0.028) * (0.6 + peb), shingle * 0.8);
        // grass and moss on the scree and the land above
        float g = smoothstep(0.15, 0.75, vGreen + (gf(vGPos.xz * 0.3) - 0.5) * 0.45);
        vec3 grassC = mix(vec3(0.045, 0.06, 0.02), vec3(0.1, 0.12, 0.04), gf(vGPos.xz * 0.15)) * (0.7 + gn(vGPos.xz * 6.0) * 0.6);
        c = mix(c, grassC, g);
        // bare rock where it is steep
        float steep = smoothstep(0.75, 0.5, wn.y);
        if (steep > 0.0) {
          vec3 tw = pow(abs(wn), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
          vec3 rc = texture2D(rockMap, vGPos.zy * 0.08).rgb * tw.x + texture2D(rockMap, vGPos.xz * 0.08).rgb * tw.y + texture2D(rockMap, vGPos.xy * 0.08).rgb * tw.z;
          rc = vec3(dot(rc, vec3(0.3, 0.55, 0.15))) * 0.32;
          c = mix(c, rc, steep);
        }
        diffuseColor.rgb *= c;
        // wet sand is not one mirror: saturated matte sand, with glassy sheets of standing water
        // and rills left by the backwash running down to the sea
        float rill = smoothstep(0.55, 0.8, gf(vGPos.xz * vec2(0.6, 0.09) + vec2(0.0, gn(vGPos.xz * 0.2) * 2.0)));
        gPuddle = max(smoothstep(0.52, 0.72, gf(vGPos.xz * vec2(0.09, 0.22) + 3.7)), rill * 0.8) * gWet;
        gRough = mix(mix(0.92, mix(0.62 + gn(vGPos.xz * 1.3) * 0.2, 0.1, gPuddle), gWet), 0.95, max(g, steep));
        gRough = mix(gRough, 0.35, shingle * 0.5);
        vec3 nD = untiled(dryNor, guv, mixer).xyz * 2.0 - 1.0;
        vec3 nW = untiled(dampNor, guv * 1.1, mixer).xyz * 2.0 - 1.0;
        vec3 nT = normalize(mix(nD, nW * vec3(0.35, 0.35, 1.0), gWet));
        nT.xy += (vec2(gn(vGPos.xz * 9.0 + 1.0), gn(vGPos.xz * 9.0 + 5.0)) - 0.5) * shingle * 1.4;
        nT = normalize(nT);
        vec3 tx = normalize(vec3(1.0, 0.0, 0.0) - wn * wn.x);
        vec3 tz = normalize(cross(wn, tx));
        gN = normalize(tx * nT.x + tz * nT.y + wn * nT.z);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectSpecular *= mix(1.0, 0.55, gWet * (1.0 - gPuddle));');
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // the heights and the distance to rock, on a grid the sea reads its depth and surf from
  const hn = 1024, size = Math.max(maxX - minX, maxZ - minZ);
  const data = new Float32Array(hn * hn * 2);
  for (let j = 0; j < hn; j++) for (let i = 0; i < hn; i++) {
    const x = minX + ((i + 0.5) / hn) * size, z = minZ + ((j + 0.5) / hn) * size;
    data[(j * hn + i) * 2] = groundHeight(x, z);
    data[(j * hn + i) * 2 + 1] = rockDistance(x, z);
  }
  const heights = new THREE.DataTexture(data, hn, hn, THREE.RGFormat, THREE.FloatType);
  heights.magFilter = THREE.LinearFilter;
  heights.minFilter = THREE.LinearFilter;
  heights.needsUpdate = true;
  return { mesh, heights, bounds: { minX, minZ, size } };
}
