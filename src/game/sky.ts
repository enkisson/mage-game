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

  return {
    key,
    keyDir,
    update(camera) {
      dome.position.copy(camera.position);
    },
    usePhoto() {
      dome.visible = false;
      hemi.intensity *= 0.35;
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
