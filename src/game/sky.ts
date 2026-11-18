// Sky, light and fog for a night. Uses an HDR sky photo when one is present, and a painted
// gradient when it is not.
import * as THREE from 'three';

export interface NightSky {
  /** Key light that casts shadows; the game keeps it centred on the player. */
  key: THREE.DirectionalLight;
  /** Direction the key light comes from. */
  keyDir: THREE.Vector3;
  update(camera: THREE.Camera): void;
  /** A photographed sky has taken over: hide the painted one and ease off the fill light. */
  usePhoto(): void;
  /** How far the night has fallen: 0 the last of the dusk, 1 full dark under the moon. */
  setNight(n: number): void;
  /** Shadow detail: the full-size map, or a quarter of it for slower machines. */
  setShadowSize(size: number): void;
  /** How far back toward the light the shadow camera stands (default 90 m). */
  shadowDistance?: number;
  /** If set, the shadow map covers the whole level from here and never follows the player. */
  shadowCentre?: THREE.Vector3;
}

export interface SkyOptions {
  top: number;
  mid: number;
  horizon: number;
  /** Colour of the last light on the horizon, and where it sits (compass direction as a vector). */
  glow: number;
  glowDir: [number, number, number];
  fog: number;
  fogDensity: number;
  keyColor: number;
  keyIntensity: number;
  keyDir: [number, number, number];
  ambient: number;
}

export function createSky(scene: THREE.Scene, o: SkyOptions): NightSky {
  scene.fog = new THREE.FogExp2(o.fog, o.fogDensity);
  scene.background = new THREE.Color(o.fog);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(o.top) },
        mid: { value: new THREE.Color(o.mid) },
        horizon: { value: new THREE.Color(o.horizon) },
        glow: { value: new THREE.Color(o.glow) },
        glowDir: { value: new THREE.Vector3(...o.glowDir).normalize() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top, mid, horizon, glow, glowDir; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.9, h));
          // last light, hugging the horizon on one side of the sky
          float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(glowDir.x, 0.0, glowDir.z))), 0.0);
          c += glow * pow(toward, 3.0) * exp(-abs(h) * 9.0);
          // stars, fading in above the haze
          vec2 uv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 180.0;
          vec2 cell = floor(uv);
          float star = step(0.985, hash(cell)) * smoothstep(0.35, 0.0, length(fract(uv) - 0.5));
          c += vec3(0.8, 0.85, 1.0) * star * smoothstep(0.08, 0.5, h) * (0.4 + hash(cell + 7.0));
          c = mix(c, horizon * 0.35, smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(o.mid, 0x0b0a10, o.ambient);
  scene.add(hemi);

  const keyDir = new THREE.Vector3(...o.keyDir).normalize();
  const key = new THREE.DirectionalLight(o.keyColor, o.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  const s = 46;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 220 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.06;
  scene.add(key);
  scene.add(key.target);

  // The night sky proper: stars and the moon, laid over whatever sky is behind them and
  // brought up as the dusk goes. The moon sits where the key light comes from.
  const night = { value: 0 };
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(880, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, transparent: true, blending: THREE.AdditiveBlending,
      uniforms: { uNight: night, uMoon: { value: keyDir.clone() }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uNight, uTime; uniform vec3 uMoon; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = vec3(0.0);
          // stars: points scattered through space near the dome, so none is stretched; two
          // sizes, a few of them warm, all of them unsteady
          for (int k = 0; k < 2; k++) {
            vec3 p = d * (k == 0 ? 170.0 : 70.0);
            vec3 cell = floor(p);
            float r = hash(cell.xy + cell.z * 17.3);
            vec3 at = cell + 0.5 + (vec3(hash(cell.yz + 3.0), hash(cell.zx + 5.0), hash(cell.xy + 7.0)) - 0.5) * 0.6;
            float s = step(k == 0 ? 0.55 : 0.82, r) * smoothstep(k == 0 ? 0.2 : 0.16, 0.0, length(p - at));
            float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + r * 4.0) + r * 40.0);
            c += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), step(0.8, hash(cell.xz + 9.0))) * s * twinkle * (k == 0 ? 0.55 : 1.3);
          }
          // the long cloud of the galaxy
          float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.3, -0.8))) * 3.2, 2.0));
          c += vec3(0.1, 0.12, 0.18) * band * (0.4 + 0.6 * noise(d.xz * 9.0 + d.y * 5.0));
          c *= smoothstep(0.02, 0.35, d.y);
          // the moon: a disc with the faint seas on it, and its halo in the haze
          float m = dot(d, uMoon);
          float disc = smoothstep(0.99972, 0.99982, m);
          vec3 right = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
          vec2 face = vec2(dot(d, right), dot(d, cross(right, uMoon))) * 42.0;
          c = mix(c, vec3(1.25, 1.2, 1.05) * (0.72 + 0.28 * noise(face * 3.0 + 4.0)), disc);
          c += vec3(0.5, 0.58, 0.75) * (pow(max(m, 0.0), 900.0) * 0.5 + pow(max(m, 0.0), 60.0) * 0.1);
          gl_FragColor = vec4(c * uNight, 1.0);
        }`,
    }),
  );
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  stars.userData.noShade = true;
  scene.add(stars);

  const fog = scene.fog as THREE.FogExp2;
  const dusk = { key: key.color.clone(), keyI: o.keyIntensity, fog: fog.color.clone(), density: o.fogDensity, hemi: o.ambient, bg: 1, env: 1 };
  const dark = { key: new THREE.Color(0x86a4ee), fog: new THREE.Color(0x0a1020) };
  let photo = false;

  return {
    key,
    keyDir,
    update(camera) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      (stars.material as THREE.ShaderMaterial).uniforms.uTime.value = performance.now() / 1000;
    },
    usePhoto() {
      dome.visible = false;
      photo = true;
      dusk.hemi *= 0.35;
      dusk.fog.copy(fog.color);
      dusk.bg = scene.backgroundIntensity;
      dusk.env = scene.environmentIntensity;
      this.setNight(night.value);
    },
    setNight(n) {
      night.value = n;
      // the sky's own light goes first; the moon, already up, is left to do the work
      const sky = Math.pow(1 - n, 1.6);
      key.color.copy(dusk.key).lerp(dark.key, n);
      key.intensity = THREE.MathUtils.lerp(dusk.keyI, 1.9, n);
      hemi.intensity = THREE.MathUtils.lerp(dusk.hemi, dusk.hemi * 0.55, n);
      fog.color.copy(dusk.fog).lerp(dark.fog, n);
      fog.density = dusk.density * (1 + n * 0.35);
      if (photo) {
        scene.backgroundIntensity = THREE.MathUtils.lerp(0.035, dusk.bg, sky);
        scene.environmentIntensity = THREE.MathUtils.lerp(dusk.env * 0.34, dusk.env, sky);
      }
    },
    setShadowSize(size) {
      if (key.shadow.mapSize.x === size) return;
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    },
  };
}

export interface PhotoSky {
  /** The sky photograph (an equirectangular JPEG). */
  url: string;
  /** Turn the photograph so its bright side faces this compass angle (radians about Y). */
  rotation: number;
  /** How bright the visible sky is, and how strongly it lights the world. */
  backgroundIntensity: number;
  lightIntensity: number;
  /** Fog takes this colour so distant ground melts into the horizon. */
  fog: number;
}

/**
 * Swap the painted sky for a photographed one, which also lights the scene.
 * Resolves false if the file is missing, leaving the painted sky in place.
 */
export async function loadPhotoSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer, sky: NightSky, o: PhotoSky): Promise<boolean> {
  const view = await new Promise<THREE.Texture | null>((resolve) => {
    new THREE.TextureLoader().load(o.url, (t) => resolve(t), undefined, () => resolve(null));
  });
  if (!view) return false;
  view.mapping = THREE.EquirectangularReflectionMapping;
  view.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(view).texture;
  pmrem.dispose();
  scene.environmentIntensity = o.lightIntensity;
  scene.environmentRotation.y = o.rotation;

  scene.background = view;
  scene.backgroundIntensity = o.backgroundIntensity;
  scene.backgroundRotation.y = o.rotation;
  (scene.fog as THREE.FogExp2).color.set(o.fog);
  sky.usePhoto();
  return true;
}
