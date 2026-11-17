// Setting things in the world: scanned rocks and cliffs bedded into the ground, the wreck with
// her sails in rags and lit through from behind, the far peak and the tower on it.
import * as THREE from 'three';
import { air, fogUniforms } from './atmosphere';
import { groundHeight } from './layout';
import type { TextureSet } from './terrain';

export type ModelSource = (name: string) => THREE.Object3D;

export interface Placement {
  x: number; z: number;
  /** Turn about the vertical, radians. */
  yaw?: number;
  /** Lean: about x and z, radians, applied after the turn. */
  tilt?: [number, number];
  scale?: number | [number, number, number];
  /** How far the base goes into the ground, metres. Negative lifts it. */
  sink?: number;
  /** Set the height outright instead of resting it on the ground. */
  y?: number;
}

/** Put a copy of a model in the world, resting on (and sunk into) the ground. */
export function place(source: ModelSource, name: string, p: Placement): THREE.Object3D {
  const m = source(name);
  const s = p.scale ?? 1;
  if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2]); else m.scale.setScalar(s);
  m.rotation.order = 'YXZ';
  m.rotation.set(p.tilt?.[0] ?? 0, p.yaw ?? 0, p.tilt?.[1] ?? 0);
  m.position.set(p.x, 0, p.z);
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m);
  const centre = box.getCenter(new THREE.Vector3());
  const ground = p.y ?? Math.min(groundHeight(centre.x, centre.z), groundHeight(box.min.x, centre.z), groundHeight(box.max.x, centre.z), groundHeight(centre.x, box.min.z), groundHeight(centre.x, box.max.z));
  m.position.y = (p.y !== undefined ? p.y : ground) - box.min.y - (p.sink ?? 0);
  m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return m;
}

/**
 * Canvas in rags: torn away in holes and tongues, more toward the edges and the foot; stained;
 * and when the sun is behind it, glowing with the light coming through.
 */
export function tatter(m: THREE.MeshStandardMaterial, amount = 0.45, seed = 1) {
  const mat = m.clone();
  mat.side = THREE.DoubleSide;
  mat.alphaTest = 0.5;
  mat.transparent = false;
  const u = { uTear: { value: amount }, uSeed: { value: seed } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.uniforms.uSunDir = air.sunDir;
    shader.uniforms.uSunCol = air.sunColor;
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vSailW;\n varying vec2 vSailUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSailW = (modelMatrix * vec4(position, 1.0)).xyz;\n vSailUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTear, uSeed;
        uniform vec3 uSunDir, uSunCol;
        varying vec3 vSailW;
        varying vec2 vSailUv;
        float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(th(i), th(i + vec2(1, 0)), f.x), mix(th(i + vec2(0, 1)), th(i + vec2(1, 1)), f.x), f.y); }
        float tf(vec2 p) { return tn(p) * 0.5 + tn(p * 2.3) * 0.3 + tn(p * 5.1) * 0.2; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 q = vSailW.xz * 0.35 + vSailW.y * vec2(0.13, 0.31) + uSeed * 13.1;
          float rot = tf(q) * 0.75 + tf(vSailW.xy * 1.4 + uSeed) * 0.25;
          // long tears hang down from the holes: stretch the noise along the vertical
          float tongue = tf(vec2(vSailW.x * 1.7 + vSailW.z * 1.7, vSailW.y * 0.25) + uSeed * 3.0);
          float tear = max(rot, tongue * 0.95);
          if (tear < uTear) discard;
          float stain = smoothstep(0.35, 0.75, tf(q * 2.0 + 9.0));
          diffuseColor.rgb *= mix(vec3(0.62, 0.55, 0.45), vec3(0.32, 0.27, 0.2), stain);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // light through the canvas when it stands between you and the sun
          vec3 toEye = normalize(cameraPosition - vSailW);
          float behind = pow(max(dot(-toEye, uSunDir), 0.0), 3.0);
          float thin = 0.6 + 0.4 * tf(vSailW.xy * 3.0);
          totalEmissiveRadiance += uSunCol * diffuseColor.rgb * behind * thin * 2.2;
        }`);
  };
  mat.customProgramCacheKey = () => 'tatter' + seed;
  return mat;
}

/** Weather a scanned material toward the island's stone: a tint, and a little more roughness. */
export function weather(o: THREE.Object3D, tint: THREE.ColorRepresentation, rough = 0) {
  const c = new THREE.Color(tint);
  const done = new Map<THREE.Material, THREE.Material>();
  o.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    let m = done.get(src) as THREE.MeshStandardMaterial | undefined;
    if (!m) { m = src.clone(); m.color.multiply(c); m.roughness = Math.min(1, m.roughness + rough); done.set(src, m); }
    mesh.material = m;
  });
}

// ---- far off --------------------------------------------------------------------------------------

/**
 * The peak inland: a great mountain built from noise, rock in the gullies, snow on the ledges,
 * and the range it stands in.
 */
/** Set by buildPeak: the highest point of the last peak built. */
export const summitOf = new THREE.Vector3();

export function buildPeak(rock: TextureSet, at: { x: number; z: number; height: number }): THREE.Mesh {
  const R = at.height * 2.4, n = 260;
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x: number, y: number) => {
    const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(X, Y) * (1 - u) + hash(X + 1, Y) * u) * (1 - v) + (hash(X, Y + 1) * (1 - u) + hash(X + 1, Y + 1) * u) * v;
  };
  const ridged = (x: number, y: number) => { let s = 0, a = 1, f = 1, t = 0; for (let k = 0; k < 7; k++) { const r = 1 - Math.abs(vn(x * f, y * f) * 2 - 1); s += a * r * r; t += a; a *= 0.5; f *= 2.07; } return s / t; };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z) / R;
    // a main summit and its shoulders, carved by ridges
    const cone = Math.max(0, 1 - Math.pow(r, 0.85));
    const shoulders = Math.max(0, 1 - Math.hypot(x / R - 0.35, z / R + 0.2) * 1.8) * 0.55 + Math.max(0, 1 - Math.hypot(x / R + 0.4, z / R - 0.1) * 2.0) * 0.45;
    const rid = ridged(x / R * 3 + 11, z / R * 3 + 5);
    let h = (Math.pow(cone, 2.2) * 0.9 + shoulders * 0.4) * (0.45 + 0.55 * rid) * at.height;
    h += Math.pow(Math.max(0, 1 - r * 6), 1.5) * at.height * 0.22; // the summit horn
    pos.setY(i, h - at.height * 0.04);
  }
  geo.translate(at.x, 0, at.z);
  geo.computeVertexNormals();
  // where the summit actually is, for the tower
  let top = 0, tx = at.x, tz = at.z;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top) { top = pos.getY(i); tx = pos.getX(i); tz = pos.getZ(i); }
  summitOf.set(tx, top, tz);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rockMap = { value: rock.diff };
    shader.uniforms.uTop = { value: at.height };
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vPW;\n varying vec3 vPN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPW = (modelMatrix * vec4(position, 1.0)).xyz;\n vPN = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n uniform sampler2D rockMap;\n uniform float uTop;\n varying vec3 vPW;\n varying vec3 vPN;')
      .replace('#include <map_fragment>', `
        vec3 w = pow(abs(vPN), vec3(4.0)); w /= w.x + w.y + w.z;
        vec3 rc = texture2D(rockMap, vPW.zy * 0.004).rgb * w.x + texture2D(rockMap, vPW.xz * 0.004).rgb * w.y + texture2D(rockMap, vPW.xy * 0.004).rgb * w.z;
        rc = mix(vec3(dot(rc, vec3(0.3, 0.5, 0.2))), rc, 0.25) * vec3(0.8, 0.8, 0.88);
        float snow = smoothstep(0.55, 0.8, vPN.y) * smoothstep(uTop * 0.35, uTop * 0.6, vPW.y);
        diffuseColor.rgb *= mix(rc, vec3(0.82, 0.84, 0.9), snow);`);
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

/** The tower on the summit: a black needle, a window burning violet at its top. */
export function buildTower(at: THREE.Vector3, height: number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x1a1820, roughness: 0.9 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.05, height * 0.08, height, 12, 1), stone);
  shaft.position.y = height / 2;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.075, height * 0.05, height * 0.1, 12, 1), stone);
  crown.position.y = height * 0.93;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(height * 0.045, height * 0.35, 12), stone);
  spire.position.y = height * 1.15;
  const light = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.052, height * 0.052, height * 0.05, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.55, 2.4), fog: false }));
  light.position.y = height * 0.86;
  g.add(shaft, crown, spire, light);
  g.position.copy(at);
  return g;
}

/**
 * The wheel of cloud round the summit: a slow spiral, dark at its rim, lit violet from the
 * tower at its heart, with a thread of light rising into it.
 */
export function buildVortex(at: THREE.Vector3, radius: number): THREE.Group {
  const g = new THREE.Group();
  // three layers of slow storm cloud, each its own noise, stacked so the wheel has depth
  for (const [k, lift, seed, alpha] of [[1, 0, 1.3, 0.3], [0.78, -radius * 0.06, 5.1, 0.28], [0.55, -radius * 0.11, 9.7, 0.3]]) {
    const r = radius * k;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform float uTime;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
        void main(){
          vec2 p = vUv / ${r.toFixed(1)};
          float r = length(p);
          // a gentle turn, broken up by billowing noise so no clean arm survives
          float a = atan(p.y, p.x) + log(r + 0.05) * 1.1;
          vec2 q = vec2(cos(a), sin(a)) * (1.0 + r * 3.0) + ${seed.toFixed(1)};
          float billow = fbm(p * 5.0 + ${seed.toFixed(1)});
          float d = fbm(q * 1.6 + billow * 2.4);
          d = smoothstep(0.4, 0.78, d) * smoothstep(0.04, 0.3, r) * smoothstep(1.0, 0.35, r);
          float inner = exp(-r * 3.5);
          vec3 c = mix(vec3(0.06, 0.055, 0.085), vec3(0.42, 0.24, 0.8), inner) * (0.7 + billow * 0.5);
          gl_FragColor = vec4(c, d * ${alpha.toFixed(2)});
        }`,
    }));
    disc.rotation.x = -Math.PI / 2 + 0.1;
    disc.position.y = lift;
    g.add(disc);
  }
  g.position.copy(at);
  return g;
}
