// The sky, the light it gives, and the air: a photographed sky for background and lighting,
// a low sun matched to it, and fog that warms toward the sun and thins with height, so the far
// peak is blue and soft and the air over the sea glows where the sun is.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** Shared by every material that takes fog. Set before anything is first drawn. */
export const air = {
  sunDir: { value: new THREE.Vector3(-0.94, 0.04, 0.34).normalize() },
  sunColor: { value: new THREE.Color(1.0, 0.55, 0.3) },
  /** How fast the fog thins with height, per metre. */
  falloff: { value: 0.012 },
  /** How tight the warm glow round the sun is. */
  glowPower: { value: 6 },
};

let patched = false;
/**
 * Make three.js fog directional and layered: it takes the sun's colour when you look toward
 * the sun, and lies thicker low down than high up.
 */
export function patchFog() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG\n  varying float vFogDepth;\n  varying vec3 vFogWorld;\n#endif`;
  C.fog_vertex = `#ifdef USE_FOG\n  vFogDepth = - mvPosition.z;\n  vFogWorld = (inverse(viewMatrix) * mvPosition).xyz;\n#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  uniform float fogFalloff;
  uniform float fogGlowPower;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  vec3 fogRay = vFogWorld - cameraPosition;
  float fogLen = length(fogRay);
  vec3 fogDir = fogRay / max(fogLen, 1e-4);
  // fog lies low: integrate an exponential falloff with height along the ray
  float h0 = max(cameraPosition.y, 0.0), dh = fogRay.y;
  float k = fogFalloff;
  float layer = abs(dh) > 0.01 ? (exp(-k * h0) - exp(-k * (h0 + dh))) / (k * dh) : exp(-k * h0);
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogLen * fogLen * 0.0 - fogDensity * fogLen * layer);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  float sunK = pow(max(dot(fogDir, fogSunDir), 0.0), fogGlowPower);
  vec3 fogC = mix(fogColor, fogSunColor, sunK);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, clamp(fogFactor, 0.0, 1.0));
#endif`;
  for (const key of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
    const u = THREE.ShaderLib[key].uniforms as Record<string, THREE.IUniform>;
    if (!u || !('fogColor' in u)) continue;
    u.fogSunDir = air.sunDir;
    u.fogSunColor = air.sunColor;
    u.fogFalloff = air.falloff;
    u.fogGlowPower = air.glowPower;
  }
}

/** A material made with onBeforeCompile still needs the fog uniforms handed over. */
export function fogUniforms(shader: { uniforms: Record<string, THREE.IUniform> }) {
  shader.uniforms.fogSunDir = air.sunDir;
  shader.uniforms.fogSunColor = air.sunColor;
  shader.uniforms.fogFalloff = air.falloff;
  shader.uniforms.fogGlowPower = air.glowPower;
}

export interface Sky {
  texture: THREE.Texture;
  /** Where the sun is in the photograph, as an angle round the horizon (three.js equirect u). */
  sunU: number;
}

/** Load an HDR sky and find its sun. */
export async function loadSky(url: string, sunU: number): Promise<Sky> {
  const texture = await new RGBELoader().loadAsync(url);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return { texture, sunU };
}

/**
 * Light the scene with the sky, turned so its sun stands at `sunAzimuth` (radians, clockwise
 * from north, -Z), and add a matching low sun that casts shadows over `area` metres round `at`.
 */
export function applySky(scene: THREE.Scene, renderer: THREE.WebGLRenderer, sky: Sky, opts: {
  sunAzimuth: number; sunElevation: number; sunColor: THREE.ColorRepresentation; sunIntensity: number;
  envIntensity: number; backgroundIntensity: number; fog: THREE.ColorRepresentation; fogDensity: number; fogSun: THREE.ColorRepresentation;
  at: THREE.Vector3; area: number;
}): THREE.DirectionalLight {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(sky.texture).texture;
  pmrem.dispose();
  // three.js equirect: u = atan(dir.z, dir.x) / 2pi + 0.5. Turn the sky so the sun's u lands on
  // the direction we want.
  const dir = new THREE.Vector3(Math.sin(opts.sunAzimuth), 0, -Math.cos(opts.sunAzimuth));
  const want = Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5;
  const turn = (want - sky.sunU) * Math.PI * 2;
  scene.environment = env;
  scene.background = sky.texture;
  scene.environmentRotation.set(0, -turn, 0);
  scene.backgroundRotation.set(0, -turn, 0);
  scene.environmentIntensity = opts.envIntensity;
  scene.backgroundIntensity = opts.backgroundIntensity;
  scene.fog = new THREE.FogExp2(opts.fog, opts.fogDensity);
  const sunDir = new THREE.Vector3(Math.sin(opts.sunAzimuth) * Math.cos(opts.sunElevation), Math.sin(opts.sunElevation), -Math.cos(opts.sunAzimuth) * Math.cos(opts.sunElevation));
  air.sunDir.value.copy(sunDir);
  air.sunColor.value.set(opts.fogSun);
  const sun = new THREE.DirectionalLight(opts.sunColor, opts.sunIntensity);
  sun.position.copy(opts.at).addScaledVector(sunDir, 300);
  sun.target.position.copy(opts.at);
  sun.castShadow = true;
  sun.shadow.mapSize.set(8192, 8192);
  const s = opts.area / 2;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return sun;
}

// ---- a storm sky, painted in the shader --------------------------------------------------------

const STORM_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSun;
  uniform float uDark;
  float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
  float sf(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 7; i++) { s += a * sn(p); p = p * 2.02 + 3.7; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sd = normalize(vec3(uSun.x, 0.0, uSun.z));
    vec3 hd = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
    float toward = max(dot(hd, sd), 0.0);
    // the overcast itself: pale grey at the horizon, heavier overhead
    vec3 hor = vec3(0.6, 0.62, 0.65), zen = vec3(0.3, 0.32, 0.35);
    vec3 c = mix(hor, zen, smoothstep(-0.02, 0.55, h));
    // a brighter, faintly warm patch low in the west where the sun is buried
    c += vec3(0.42, 0.36, 0.3) * pow(toward, 5.0) * exp(-max(h, 0.0) * 7.0);
    if (h > -0.02) {
      // the cloud deck, seen on a plane overhead: rolls of dark cloud, scud below them
      vec2 p = d.xz / (max(h, 0.0) + 0.06);
      float big = sf(p * 0.18 + vec2(3.1, 1.7));
      float rolls = sf(p * vec2(0.5, 0.9) + big * 2.2);
      float dark = smoothstep(0.35, 0.75, rolls) * (0.55 + 0.45 * big);
      c *= 1.0 - dark * uDark * smoothstep(-0.02, 0.12, h);
      // scud: ragged low cloud, darker, moving across
      float scud = smoothstep(0.55, 0.8, sf(p * vec2(1.2, 2.4) + 9.0)) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.3, 0.6, h));
      c = mix(c, c * 0.55, scud * 0.7);
      // the edges of the clouds take a little of the buried sun
      c += vec3(0.25, 0.2, 0.16) * (1.0 - dark) * pow(toward, 3.0) * exp(-h * 4.0) * 0.6;
      // curtains of rain hanging from the deck far out to sea
      float az = atan(d.z, d.x);
      float curtain = smoothstep(0.55, 0.85, sn(vec2(az * 9.0, 0.5))) * smoothstep(0.12, 0.0, h);
      c = mix(c, c * 0.7 + vec3(0.03), curtain * 0.6 * smoothstep(-0.2, 0.3, -dot(hd, sd)));
    }
    if (h < 0.0) c = mix(c, hor * 0.35, smoothstep(0.0, -0.08, h));
    gl_FragColor = vec4(c, 1.0);
  }`;

/**
 * An overcast storm sky: a dome painted in the shader, which also lights the scene, and a soft
 * key light from where the sun is buried in the cloud.
 */
export function stormSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer, opts: {
  sunAzimuth: number; sunElevation: number; sunColor: THREE.ColorRepresentation; sunIntensity: number;
  envIntensity: number; fog: THREE.ColorRepresentation; fogDensity: number; fogSun: THREE.ColorRepresentation;
  at: THREE.Vector3; area: number; brightness?: number; dark?: number;
}): { dome: THREE.Mesh; sun: THREE.DirectionalLight } {
  const sunDir = new THREE.Vector3(Math.sin(opts.sunAzimuth) * Math.cos(opts.sunElevation), Math.sin(opts.sunElevation), -Math.cos(opts.sunAzimuth) * Math.cos(opts.sunElevation));
  const mat = (radius: number) => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uDark: { value: opts.dark ?? 0.55 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: STORM_FRAG.replace('gl_FragColor = vec4(c, 1.0);', `gl_FragColor = vec4(c * ${(opts.brightness ?? 1).toFixed(3)}, 1.0);`),
  });
  // light from the sky
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat(50)));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyScene, 0, 0.1, 200).texture;
  pmrem.dispose();
  scene.environmentIntensity = opts.envIntensity;
  scene.background = null;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 64, 32), mat(30000));
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.userData.sky = true;
  scene.add(dome);
  scene.fog = new THREE.FogExp2(opts.fog, opts.fogDensity);
  air.sunDir.value.copy(sunDir);
  air.sunColor.value.set(opts.fogSun);
  const sun = new THREE.DirectionalLight(opts.sunColor, opts.sunIntensity);
  sun.position.copy(opts.at).addScaledVector(sunDir, 400);
  sun.target.position.copy(opts.at);
  sun.castShadow = true;
  sun.shadow.mapSize.set(8192, 8192);
  const s = opts.area / 2;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 1000 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);
  return { dome, sun };
}
