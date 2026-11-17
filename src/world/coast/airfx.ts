// What hangs in the air: mist banks, spray, glows, the falls, the light from the journal.
import * as THREE from 'three';
import { air } from './atmosphere';

let mistTex: THREE.Texture | null = null;
/** A soft, ragged cloud on a canvas, for mist and spray. */
function mistTexture(): THREE.Texture {
  if (mistTex) return mistTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const h = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const n = (x: number, y: number) => {
    const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (h(X, Y) * (1 - u) + h(X + 1, Y) * u) * (1 - v) + (h(X, Y + 1) * (1 - u) + h(X + 1, Y + 1) * u) * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    let f = 0, a = 0.5, fr = 4;
    for (let k = 0; k < 5; k++) { f += a * n(x / S * fr + k * 7, y / S * fr); a *= 0.5; fr *= 2; }
    const fall = Math.max(0, 1 - Math.hypot(dx, dy * 1.3));
    const v = Math.max(0, Math.min(1, (f - 0.35) * 2.2)) * fall * fall;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v * 255;
  }
  ctx.putImageData(img, 0, 0);
  mistTex = new THREE.CanvasTexture(c);
  return mistTex;
}

/** A bank of mist: several soft sheets facing the camera, lying low. */
export function mistBank(at: THREE.Vector3, width: number, height: number, color: THREE.ColorRepresentation, opacity: number, count = 6, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = (() => { let s = seed * 9973; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: mistTexture(), color, transparent: true, opacity: opacity * (0.5 + r() * 0.5), depthWrite: false, fog: true });
    m.rotation = (r() - 0.5) * 0.4;
    const s = new THREE.Sprite(m);
    s.position.set(at.x + (r() - 0.5) * width, at.y + r() * height * 0.4, at.z + (r() - 0.5) * width * 0.4);
    s.scale.set(width * (0.35 + r() * 0.4), height * (0.6 + r() * 0.6), 1);
    s.renderOrder = 5;
    g.add(s);
  }
  return g;
}

/** A glow: an additive sprite, for lamps and the light in windows. */
export function glow(at: THREE.Vector3, size: number, color: THREE.ColorRepresentation, intensity = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.position.copy(at);
  s.scale.setScalar(size);
  s.renderOrder = 6;
  return s;
}

/** A column of light rising from a point, soft at its edges and fading as it rises. */
export function beam(at: THREE.Vector3, height: number, radius: number, color: THREE.ColorRepresentation, intensity = 1): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.5, radius, height, 24, 1, true);
  geo.translate(0, height / 2, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uH: { value: height } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uH; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float t = vY / uH; float k = edge * (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.02, t); gl_FragColor = vec4(uColor * k, 1.0); }',
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.copy(at);
  mesh.renderOrder = 7;
  return mesh;
}

/**
 * The falls: white water in strands coming down a face, thickening and breaking into spray
 * toward the foot.
 */
export function falls(top: THREE.Vector3, bottom: THREE.Vector3, width: number, opts: { bright?: number; spray?: number; mist?: THREE.ColorRepresentation } = {}): THREE.Group {
  const bright = opts.bright ?? 1, spray = opts.spray ?? 0;
  const g = new THREE.Group();
  const height = top.y - bottom.y;
  const geo = new THREE.PlaneGeometry(1, 1, 16, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i) + 0.5; // v: 0 at the foot, 1 at the top
    const t = 1 - v;
    // water leaves the lip and falls away from the face in a curve, spreading as it goes
    const out = Math.sin(t * Math.PI * 0.5) * 1.2 + t * t * 0.8;
    pos.setXYZ(i, u * width * (0.7 + t * 0.6), v * height, out);
  }
  geo.computeVertexNormals();
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { uTime: { value: 0 }, uBright: { value: bright }, uSpray: { value: spray }, ...THREE.UniformsLib.fog, fogSunDir: air.sunDir, fogSunColor: air.sunColor, fogFalloff: air.falloff, fogGlowPower: air.glowPower },
    vertexShader: `
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 transformed = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `
#include <fog_pars_fragment>
      varying vec2 vUv; uniform float uTime, uBright, uSpray;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float strands = n(vec2(vUv.x * 9.0, vUv.y * 1.2 + uTime * 1.6)) * 0.55 + n(vec2(vUv.x * 22.0, vUv.y * 3.0 + uTime * 2.4)) * 0.3 + n(vec2(vUv.x * 60.0, vUv.y * 9.0 + uTime * 3.0)) * 0.15;
        float body = smoothstep(0.2, 0.62, strands);
        float sides = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float foot = smoothstep(0.25, 0.0, vUv.y);
        float a = (0.35 + body * 0.6 + foot * 0.4) * sides;
        // thin falls are torn to spray by the wind before they reach the ground
        a *= mix(1.0, smoothstep(0.0, 0.7, vUv.y) * (0.35 + 0.65 * n(vec2(vUv.x * 8.0, vUv.y * 6.0 + uTime))), uSpray);
        vec3 c = mix(vec3(0.42, 0.46, 0.52), vec3(0.78, 0.8, 0.84), body) * uBright;
        gl_FragColor = vec4(c, a);
#include <fog_fragment>
      }`,
  });
  const sheet = new THREE.Mesh(geo, m);
  g.add(sheet);
  g.position.copy(bottom);
  g.lookAt(new THREE.Vector3(bottom.x, bottom.y, bottom.z + 1));
  g.add(mistBank(new THREE.Vector3(0, 1, 2), width * 3, width * 1.4, opts.mist ?? 0xc8d0dc, 0.55, 7, 4));
  return g;
}
