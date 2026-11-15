// The Sanctum: a ruined circular arena on a floating rock under a violet night.
// Radius ~24 m. Rifts open just beyond the wall; the Wellspring floats at the centre.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { mat, glowMat, blob, part, limb, spike, lathe, rng, halo, shadows, jitter } from './kit.js';

export const ARENA_RADIUS = 24;

const stoneMats = [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3].map((c) => mat(c, { roughness: 0.95 }));
const darkStone = mat(0x1d1a33, { roughness: 1 });
const iron = mat(PAL.iron, { metalness: 0.5, roughness: 0.5 });
const gold = mat(PAL.gold, { metalness: 0.7, roughness: 0.35 });

function skyDome(colors) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(colors.top) },
      mid: { value: new THREE.Color(colors.mid) },
      horizon: { value: new THREE.Color(colors.horizon) },
      abyss: { value: new THREE.Color(colors.abyss) },
      glowDir: { value: new THREE.Vector3(...colors.glowDir).normalize() },
      glow: { value: new THREE.Color(colors.glow) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, horizon, abyss, glow, glowDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        c = mix(c, top, smoothstep(0.22, 0.9, h));
        c = mix(c, abyss, smoothstep(0.0, -0.18, h));
        float g = pow(max(dot(normalize(vDir), glowDir), 0.0), 10.0);
        c += glow * g * 0.18;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, m);
}

function stars(count, seed) {
  const r = rng(seed);
  const pos = [], col = [];
  for (let i = 0; i < count; i++) {
    const u = r() * Math.PI * 2, v = 0.06 + Math.pow(r(), 0.7) * 0.94;
    const y = v, rad = Math.sqrt(1 - y * y);
    pos.push(Math.cos(u) * rad * 800, y * 800, Math.sin(u) * rad * 800);
    const b = 0.4 + r() * 1.4;
    const tint = r();
    col.push(b * (tint > 0.8 ? 1.0 : 0.8), b * 0.85, b * (tint < 0.3 ? 0.8 : 1.1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
}

function mountains(seed, radius, count, height, color) {
  const g = new THREE.Group();
  const r = rng(seed);
  const m = new THREE.MeshBasicMaterial({ color, fog: false });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.2;
    const h = height * (0.4 + r() * 0.9);
    const geo = new THREE.ConeGeometry(h * (0.9 + r() * 0.8), h, 5 + Math.floor(r() * 3), 2);
    jitter(geo, h * 0.08, seed + i);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(Math.cos(a) * radius, h / 2 - height * 0.55, Math.sin(a) * radius);
    mesh.rotation.y = r() * 3;
    g.add(mesh);
  }
  return g;
}

/** One flagstone: a slightly irregular annular sector. */
function flagstone(r0, r1, a0, a1, depth, seed) {
  const shape = new THREE.Shape();
  const steps = Math.max(2, Math.ceil((a1 - a0) * r1 / 1.2));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const p = [Math.cos(a) * r1, Math.sin(a) * r1];
    i === 0 ? shape.moveTo(...p) : shape.lineTo(...p);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + (a1 - a0) * (i / steps);
    shape.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -depth, 0);
  return geo;
}

function floor(seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  const rings = [[4.2, 6.2, 10], [6.3, 8.6, 14], [8.7, 11.2, 18], [11.3, 14.0, 22], [14.1, 17.0, 26], [17.1, 20.2, 30], [20.3, 23.6, 34]];
  for (const [r0, r1, n] of rings) {
    const off = r() * 1;
    for (let i = 0; i < n; i++) {
      if (r() < 0.03 && r0 > 10) continue; // missing stone
      const a0 = off + (i / n) * Math.PI * 2 + 0.008, a1 = off + ((i + 1) / n) * Math.PI * 2 - 0.008;
      const geo = flagstone(r0 + 0.03, r1 - 0.03, a0, a1, 0.35, seed + i);
      const m = new THREE.Mesh(geo, stoneMats[Math.floor(r() * 4)]);
      m.position.y = (r() - 0.5) * 0.05;
      m.rotation.set((r() - 0.5) * 0.012, 0, (r() - 0.5) * 0.012);
      g.add(m);
    }
  }
  // grout bed beneath the stones and the rock the sanctum sits on
  g.add(part(new THREE.CylinderGeometry(24.2, 24.2, 0.3, 48), mat(PAL.grout), [0, -0.2, 0]));
  const rock = lathe([[24.6, -0.2], [25.4, -1.6], [22, -5], [17, -10], [10, -16], [4, -22], [0.5, -26]], 18, darkStone, seed, 1.2, (x, y) => y < -0.5);
  g.add(rock);
  const inner = part(new THREE.CylinderGeometry(4.15, 4.15, 0.36, 40), stoneMats[3], [0, -0.17, 0]);
  g.add(inner);
  return g;
}

function runeTexture(color) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  const ring = (rad, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke(); };
  ring(500, 6); ring(470, 3); ring(330, 4); ring(300, 2); ring(140, 5);
  const r = rng(77);
  // glyph band
  const glyphs = 28;
  for (let i = 0; i < glyphs; i++) {
    ctx.save();
    ctx.rotate((i / glyphs) * Math.PI * 2);
    ctx.translate(0, -400);
    ctx.lineWidth = 6;
    ctx.beginPath();
    const strokes = 2 + Math.floor(r() * 3);
    for (let s = 0; s < strokes; s++) {
      const x0 = (r() - 0.5) * 40, y0 = (r() - 0.5) * 50, x1 = (r() - 0.5) * 40, y1 = (r() - 0.5) * 50;
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.moveTo(-18, 30); ctx.lineTo(18, 30);
    ctx.stroke();
    ctx.restore();
  }
  // star of the ward
  ctx.lineWidth = 4;
  for (const n of [6]) {
    ctx.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / n) * Math.PI * 2 * 1;
      const p = [Math.sin(a * 2) * 300, -Math.cos(a * 2) * 300];
      i === 0 ? ctx.moveTo(...p) : ctx.lineTo(...p);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(Math.sin(a) * 300, -Math.cos(a) * 300, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(Math.sin(a) * 140, -Math.cos(a) * 140); ctx.lineTo(Math.sin(a) * 300, -Math.cos(a) * 300); ctx.stroke();
  }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const l = i % 6 === 0 ? 26 : 12;
    ctx.lineWidth = i % 6 === 0 ? 5 : 3;
    ctx.beginPath(); ctx.moveTo(Math.sin(a) * 470, -Math.cos(a) * 470); ctx.lineTo(Math.sin(a) * (470 - l), -Math.cos(a) * (470 - l)); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The glowing ward seal in the centre of the floor. */
function wardSeal(color, intensity) {
  const m = new THREE.MeshBasicMaterial({
    map: runeTexture(), color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const seal = new THREE.Mesh(new THREE.CircleGeometry(4.1, 64), m);
  seal.rotation.x = -Math.PI / 2;
  seal.position.y = 0.03;
  return seal;
}

/** Soft additive glow laid flat on the ground. */
function groundGlow(color, size, intensity) {
  const h = halo(color, 1, intensity);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: h.material.map, color: h.material.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

function pillar(seed, height, broken = true) {
  const g = new THREE.Group();
  const r = rng(seed);
  const base = part(new THREE.BoxGeometry(1.9, 0.5, 1.9), stoneMats[1], [0, 0.25, 0]);
  g.add(base);
  g.add(part(new THREE.CylinderGeometry(0.85, 0.95, 0.3, 8), stoneMats[2], [0, 0.65, 0]));
  let y = 0.8;
  const drums = Math.round(height / 1.1);
  for (let i = 0; i < drums; i++) {
    const last = i === drums - 1;
    const geo = new THREE.CylinderGeometry(0.66, 0.7, 1.05, 8, 1);
    if (last && broken) jitter(geo, 0.18, seed + i, (x, yy) => yy > 0);
    const d = part(geo, stoneMats[Math.floor(r() * 4)], [(r() - 0.5) * 0.04, y + 0.53, (r() - 0.5) * 0.04], [0, r() * 0.5, (r() - 0.5) * 0.02]);
    g.add(d);
    y += 1.08;
  }
  if (!broken) {
    g.add(part(new THREE.CylinderGeometry(0.95, 0.72, 0.4, 8), stoneMats[2], [0, y + 0.2, 0]));
    g.add(part(new THREE.BoxGeometry(2.0, 0.45, 2.0), stoneMats[1], [0, y + 0.62, 0]));
  }
  return g;
}

function brazier(seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(limb([[0, 0, 0], [0, 0.6, 0], [0, 1.0, 0]], [0.07, 0.05, 0.06], iron, 6));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(limb([[0, 0.3, 0], [Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32], [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38]], [0.03, 0.025, 0.02], iron, 4));
  }
  g.add(lathe([[0.05, 1.0], [0.38, 1.1], [0.5, 1.32], [0.46, 1.36]], 8, iron));
  g.add(part(new THREE.TorusGeometry(0.48, 0.03, 4, 16), gold, [0, 1.34, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.22;
    const f = spike([Math.cos(a) * d, 1.25, Math.sin(a) * d], [(r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3], 0.35 + r() * 0.45, 0.08 + r() * 0.06, glowMat(i < 3 ? PAL.fireCore : PAL.fire, 2.2), 4);
    g.add(f);
  }
  g.add(halo(PAL.fire, 2.6, 0.55).translateY(1.6));
  const l = new THREE.PointLight(0xff8a3a, 22, 16, 1.7);
  l.position.y = 1.9;
  g.add(l);
  return g;
}

/** A rift: a vertical tear of gloam light where waves spawn. Faces +Z. */
export function rift(seed, height = 5, { light = 30 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  const outer = new THREE.OctahedronGeometry(1, 2);
  outer.scale(height * 0.2, height / 2, 0.12);
  jitter(outer, height * 0.035, seed);
  g.add(part(outer, glowMat(PAL.gloam, 2.2), [0, height / 2 + 0.3, 0]));
  const inner = new THREE.OctahedronGeometry(1, 2);
  inner.scale(height * 0.13, height * 0.42, 0.1);
  jitter(inner, height * 0.02, seed + 1);
  g.add(part(inner, new THREE.MeshBasicMaterial({ color: 0x04020a, fog: false }), [0, height / 2 + 0.3, 0.06]));
  g.add(halo(PAL.gloam, height * 1.6, 0.5).translateY(height / 2 + 0.3));
  g.add(groundGlow(PAL.gloam, height * 2.2, 0.55));
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = height * (0.25 + r() * 0.35);
    g.add(part(new THREE.TetrahedronGeometry(0.06 + r() * 0.14, 0), i % 4 ? darkStone : glowMat(PAL.gloam, 2),
      [Math.cos(a) * d, height * (0.1 + r() * 0.9), Math.sin(a) * d * 0.5], [r() * 6, r() * 6, r() * 6]));
  }
  const l = new THREE.PointLight(PAL.gloam, light, 22, 1.6);
  l.position.set(0, height * 0.5, 1.5);
  g.add(l);
  return g;
}

/** The Wellspring: floating crystal over the ward seal. Between waves it offers boons. */
export function wellspring() {
  const g = new THREE.Group();
  const c = new THREE.OctahedronGeometry(0.55, 0);
  c.scale(1, 1.8, 1);
  g.add(part(c, mat(0xb9cbff, { emissive: PAL.ward, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2 }), [0, 3.2, 0]));
  const core = part(new THREE.OctahedronGeometry(0.26, 0), glowMat(0xe6eeff, 2.4), [0, 3.2, 0]);
  core.scale.set(1, 1.8, 1);
  g.add(core);
  g.add(halo(PAL.ward, 4.5, 0.45).translateY(3.2));
  for (let i = 0; i < 3; i++) {
    const ring = part(new THREE.TorusGeometry(1.0 + i * 0.28, 0.02, 3, 48), glowMat(PAL.ward, 1.8 - i * 0.4), [0, 3.2, 0], [Math.PI / 2 + (i - 1) * 0.35, (i - 1) * 0.4, 0]);
    g.add(ring);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(part(new THREE.OctahedronGeometry(0.09, 0), glowMat(PAL.ward, 2.5), [Math.cos(a) * 1.6, 3.2 + Math.sin(a * 2) * 0.25, Math.sin(a) * 1.6]));
  }
  const l = new THREE.PointLight(PAL.ward, 16, 18, 1.6);
  l.position.y = 3.2;
  g.add(l);
  return g;
}

function wall(seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  const n = 64;
  const gaps = [0, 16, 32, 48]; // openings facing the rifts
  for (let i = 0; i < n; i++) {
    if (gaps.some((k) => Math.abs(i - k) <= 1 || Math.abs(i - k) >= n - 1)) continue;
    const a = (i / n) * Math.PI * 2;
    const h = r() < 0.18 ? 0.4 + r() * 0.4 : 1.0 + r() * 0.35;
    const geo = new THREE.BoxGeometry(2.25, h, 0.8);
    jitter(geo, 0.05, seed + i);
    const b = part(geo, stoneMats[Math.floor(r() * 4)], [Math.cos(a) * 24.4, h / 2, Math.sin(a) * 24.4], [0, -a + Math.PI / 2, (r() - 0.5) * 0.04]);
    g.add(b);
    if (h > 1 && r() < 0.4) g.add(part(new THREE.BoxGeometry(2.3, 0.2, 0.95), stoneMats[2], [Math.cos(a) * 24.4, h + 0.1, Math.sin(a) * 24.4], [0, -a + Math.PI / 2, 0]));
  }
  return g;
}

function rubble(seed, count, rMin, rMax) {
  const g = new THREE.Group();
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = rMin + r() * (rMax - rMin);
    const s = 0.12 + r() * 0.4;
    g.add(part(blob(s, 0, [1, 0.6, 1.2], s * 0.15, seed + i), stoneMats[Math.floor(r() * 4)], [Math.cos(a) * d, s * 0.3, Math.sin(a) * d], [r(), r() * 6, r()]));
  }
  return g;
}

/**
 * Build the whole sanctum into `scene`.
 * Returns handles to the pieces shots like to aim at.
 */
export function buildSanctum(scene, { seed = 1, moonDir = [-0.35, 0.42, -1], wellspringOn = true, rifts = [0, 1, 3] } = {}) {
  scene.background = new THREE.Color(PAL.night);
  scene.fog = new THREE.FogExp2(PAL.fog, 0.014);

  scene.add(skyDome({ top: PAL.skyTop, mid: PAL.skyMid, horizon: PAL.horizon, abyss: PAL.fog, glow: PAL.moon, glowDir: moonDir }));
  scene.add(stars(1600, seed + 3));
  scene.add(mountains(seed + 5, 560, 30, 46, 0x2a1c52));
  scene.add(mountains(seed + 9, 420, 22, 30, 0x1d143e));

  const md = new THREE.Vector3(...moonDir).normalize();
  const moon = new THREE.Group();
  moon.add(new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.moon).multiplyScalar(1.4), fog: false })));
  moon.add(halo(PAL.moon, 150, 0.22, 3.0));
  moon.position.copy(md).multiplyScalar(700);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  scene.add(new THREE.HemisphereLight(0x5d55b8, 0x140e26, 0.6));
  const moonLight = new THREE.DirectionalLight(0xc6d4ff, 1.7);
  moonLight.position.copy(md).multiplyScalar(60);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(4096, 4096);
  Object.assign(moonLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.04;
  scene.add(moonLight);

  const world = new THREE.Group();
  world.add(floor(seed));
  world.add(wardSeal(PAL.ward, 1.6));
  world.add(wall(seed + 2));
  world.add(rubble(seed + 4, 70, 5, 23));

  // 12 pillars at 15° + 30°·i, so every rift gap is flanked by a pair like a gate
  const pillarSpots = [];
  const braziers = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const r = rng(seed + 40 + i);
    const intact = i % 3 === 0;
    const p = pillar(seed + 100 + i, intact ? 7.6 : 2.5 + r() * 5, !intact);
    p.position.set(Math.cos(a) * 19.5, 0, Math.sin(a) * 19.5);
    p.rotation.y = r() * 2;
    world.add(p);
    pillarSpots.push(p.position.clone());
    if (i % 2 === 1) {
      const b = brazier(seed + 200 + i);
      const inward = p.position.clone().multiplyScalar(0.86);
      b.position.copy(inward);
      world.add(b);
      braziers.push(inward.clone());
    }
  }
  // a fallen column
  const fallen = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const d = part(new THREE.CylinderGeometry(0.66, 0.7, 1.05, 8), stoneMats[k % 4], [k * 1.15, 0.6, (k % 2) * 0.1], [0, 0, Math.PI / 2 + (k - 1.5) * 0.06]);
    fallen.add(d);
  }
  fallen.position.set(-13.5, 0, 6);
  fallen.rotation.y = 0.7;
  world.add(fallen);

  shadows(world);
  scene.add(world);

  const riftAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const riftObjs = [];
  for (const k of rifts) {
    const a = riftAngles[k];
    const rf = rift(seed + 300 + k, 5.4);
    rf.position.set(Math.cos(a) * 27.5, 0, Math.sin(a) * 27.5);
    rf.lookAt(0, 0, 0);
    scene.add(rf);
    riftObjs.push(rf);
  }
  // rifts stand on a spur of rock past the wall
  for (const rf of riftObjs) {
    const spur = part(new THREE.CylinderGeometry(4.2, 3, 1, 9), darkStone, [rf.position.x, -0.5, rf.position.z]);
    spur.receiveShadow = true;
    scene.add(spur);
  }

  let well = null;
  if (wellspringOn) {
    well = wellspring();
    scene.add(well);
  }
  return { moonLight, rifts: riftObjs, wellspring: well, pillars: pillarSpots, braziers };
}
