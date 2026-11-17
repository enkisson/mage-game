// The dead mage, sitting where the tide left him: a heavy hooded cloak over a slumped body,
// one knee drawn up, the other leg stretched out on the sand, head bowed over the journal open
// in his lap. Sculpted in his pose, not posed after, so the cloth falls as cloth does.
import * as THREE from 'three';
import { sculpt, type Lump } from './body';

type V3 = [number, number, number];
const cloak = 2, skin = 0, boot = 3;

function figure(): Lump[] {
  const L: Lump[] = [];
  const add = (a: V3, b: V3, ra: number, rb: number, wear: number, flat?: V3, blend = 0.05) => L.push({ a, b, ra, rb, wear, flat, blend });
  // seat and slumped back
  add([0, 0.14, -0.06], [0, 0.17, 0.06], 0.18, 0.17, cloak, [1.15, 1, 1]);
  add([0, 0.24, -0.04], [0, 0.6, 0.1], 0.19, 0.2, cloak, [1.08, 1, 0.82], 0.08);
  // shoulders, rounded forward
  add([-0.19, 0.63, 0.1], [0.19, 0.63, 0.1], 0.1, 0.1, cloak, undefined, 0.07);
  // the cloak falling from the shoulders behind him to the sand
  add([0, 0.6, -0.06], [0, 0.08, -0.26], 0.17, 0.3, cloak, [1.15, 1, 0.65], 0.08);
  // the hood, the head bowed inside it, its point fallen back
  add([0, 0.79, 0.15], [0, 0.73, 0.27], 0.135, 0.12, cloak, [1, 1.08, 1], 0.05);
  add([0, 0.86, 0.08], [0, 0.95, -0.02], 0.08, 0.035, cloak, undefined, 0.04);
  // the knee drawn up, cloak over it
  add([0.1, 0.17, 0.02], [0.12, 0.46, 0.34], 0.095, 0.085, cloak);
  add([0.12, 0.46, 0.34], [0.13, 0.1, 0.5], 0.08, 0.065, cloak);
  add([0.13, 0.06, 0.52], [0.14, 0.05, 0.64], 0.06, 0.055, boot, [1, 0.8, 1], 0.03);
  // the other leg out along the sand
  add([-0.1, 0.13, 0.02], [-0.13, 0.12, 0.46], 0.095, 0.085, cloak);
  add([-0.13, 0.12, 0.46], [-0.15, 0.09, 0.82], 0.075, 0.06, cloak);
  add([-0.15, 0.08, 0.86], [-0.16, 0.13, 0.95], 0.06, 0.05, boot, [1, 1, 1], 0.03);
  // arms in wide sleeves, hands on the book in his lap and on his knee
  add([-0.2, 0.6, 0.1], [-0.22, 0.42, 0.22], 0.075, 0.08, cloak);
  add([-0.22, 0.42, 0.22], [-0.07, 0.33, 0.32], 0.08, 0.085, cloak);
  add([-0.06, 0.32, 0.34], [0.0, 0.31, 0.38], 0.034, 0.03, skin, [1, 0.6, 1], 0.02);
  add([0.2, 0.6, 0.1], [0.22, 0.44, 0.27], 0.075, 0.08, cloak);
  add([0.22, 0.44, 0.27], [0.15, 0.45, 0.36], 0.08, 0.085, cloak);
  add([0.13, 0.46, 0.39], [0.08, 0.44, 0.42], 0.033, 0.03, skin, [1, 0.6, 1], 0.02);
  // the skirts of the cloak spread round him on the sand
  add([-0.05, 0.035, -0.02], [0.05, 0.035, 0.18], 0.4, 0.36, cloak, [1.25, 0.14, 1.1], 0.1);
  return L;
}

/** A robe of heavy wool, wet and sand-crusted toward its hem, the hands grey. */
function robeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n attribute float wear;\n varying float vWear;\n varying vec3 vRP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWear = wear;\n vRP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWear;
        varying vec3 vRP;
        float rh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float rn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(rh(i), rh(i + vec3(1, 0, 0)), f.x), mix(rh(i + vec3(0, 1, 0)), rh(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(rh(i + vec3(0, 0, 1)), rh(i + vec3(1, 0, 1)), f.x), mix(rh(i + vec3(0, 1, 1)), rh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
        float gRobeRough, gRobeH;
        vec3 rBump(vec3 n, vec3 v, float h) { vec3 dpx = dFdx(v), dpy = dFdy(v); float hx = dFdx(h), hy = dFdy(h);
          vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); return normalize(abs(det) * n - sign(det) * (hx * r1 + hy * r2)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float w = vWear + (rn(vRP * 60.0) - 0.5) * 0.6;
          // folds: long ones falling down the cloth, finer creases across
          float folds = rn(vec3(vRP.x * 22.0, vRP.y * 3.0, vRP.z * 22.0)) * 0.6 + rn(vRP * 70.0) * 0.4;
          vec3 wool = vec3(0.022, 0.024, 0.032) * (0.7 + folds * 0.6);
          // the hem is wet and crusted with sand
          float hem = smoothstep(0.22, 0.02, vRP.y);
          wool = mix(wool, vec3(0.12, 0.1, 0.08), hem * smoothstep(0.35, 0.7, rn(vRP * 25.0)) * 0.8);
          wool *= 1.0 - hem * 0.35;
          vec3 skinC = vec3(0.2, 0.2, 0.19) * (0.85 + rn(vRP * 120.0) * 0.2);
          vec3 leather = vec3(0.025, 0.018, 0.014);
          vec3 c = w < 0.5 ? skinC : (w < 2.5 ? wool : leather);
          diffuseColor.rgb = c;
          gRobeRough = w < 0.5 ? 0.55 : (0.8 - (1.0 - hem) * 0.0 - hem * 0.25);
          gRobeH = folds * 0.008;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRobeRough;')
      .replace('#include <normal_fragment_maps>', 'normal = rBump(normal, -vViewPosition, gRobeH);');
  };
  return m;
}

/** The seated dead mage. Seat at the origin, facing +Z. Returns where the book lies. */
export function makeSeatedMage(): { group: THREE.Group; book: THREE.Vector3 } {
  const s = sculpt({ bones: [{ name: 'root', parent: null, at: [0, 0, 0], tip: [0, 1, 0] }], lumps: figure(), min: [-0.6, -0.05, -0.55], max: [0.6, 1.05, 1.1], cell: 0.014 });
  const mesh = new THREE.Mesh(s.geometry, robeMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.traverse((o) => { o.userData.noCollide = true; });
  return { group: g, book: new THREE.Vector3(0.02, 0.36, 0.36) };
}
