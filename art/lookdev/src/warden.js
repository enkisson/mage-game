// The Warden (player): staves, first-person hands, spells, and a full figure for scale.
// Staves stand on y = 0 and are ~1.7 m tall. Spells are centred on the origin.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { mat, glowMat, blob, part, limb, spike, lathe, rng, halo, bolt, shadows } from './kit.js';

const wood = mat(PAL.wood, { roughness: 0.9 });
const gold = mat(PAL.gold, { metalness: 0.7, roughness: 0.35 });
const iron = mat(PAL.iron, { metalness: 0.6, roughness: 0.45 });
const silver = mat(PAL.silver, { metalness: 0.75, roughness: 0.3 });
const leather = mat(PAL.leather);
const robe = mat(PAL.robe, { side: THREE.DoubleSide });
const robeDark = mat(PAL.robeDark, { side: THREE.DoubleSide });
const skin = mat(PAL.skin, { roughness: 0.75 });

export const SCHOOLS = {
  ember: { color: PAL.fire, core: PAL.fireCore, staff: 'Cinderbrand', spell: 'Ember Bolt' },
  rime: { color: PAL.frost, core: PAL.frostCore, staff: 'Rimefang', spell: 'Frost Lance' },
  tempest: { color: PAL.storm, core: PAL.stormCore, staff: 'Thundercoil', spell: 'Chain Lightning' },
};

function band(y, r, material = gold) {
  return part(new THREE.CylinderGeometry(r, r, 0.045, 8), material, [0, y, 0]);
}

/** Glowing focus crystal with its own light and halo. */
function focus(color, core, size, { light = true, haloSize = 1.4 } = {}) {
  const g = new THREE.Group();
  const shell = part(new THREE.OctahedronGeometry(size, 0), glowMat(color, 1.6));
  shell.scale.y = 1.6;
  g.add(shell);
  const heart = part(new THREE.OctahedronGeometry(size * 0.55, 0), glowMat(core, 3));
  heart.scale.y = 1.6;
  g.add(heart);
  g.add(halo(color, haloSize, 0.6));
  if (light) {
    const l = new THREE.PointLight(color, 4, 6, 1.6);
    g.add(l);
  }
  return g;
}

/** Floating rune ring around a staff head. */
function runeRing(color, radius, ticks = 10, tilt = 0.4) {
  const g = new THREE.Group();
  g.add(part(new THREE.TorusGeometry(radius, 0.008, 3, 40), glowMat(color, 2.2)));
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const t = part(new THREE.BoxGeometry(0.035, 0.012, 0.012), glowMat(color, 2.6), [Math.cos(a) * radius, Math.sin(a) * radius, 0], [0, 0, a]);
    g.add(t);
  }
  g.rotation.x = Math.PI / 2 - tilt;
  return g;
}

/** CINDERBRAND. Gnarled wood, gold bands, an iron claw holding an ember crystal. */
function emberStaff() {
  const g = new THREE.Group();
  g.add(limb([[0, 0, 0], [0.02, 0.45, 0.01], [-0.015, 0.9, -0.01], [0.015, 1.3, 0.01], [0, 1.52, 0]], [0.022, 0.026, 0.028, 0.03, 0.036], wood, 6));
  g.add(band(0.32, 0.031), band(0.36, 0.031), band(1.36, 0.037), band(1.49, 0.042));
  g.add(part(new THREE.CylinderGeometry(0.036, 0.03, 0.2, 7), leather, [0, 0.98, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const c = Math.cos(a), s = Math.sin(a);
    g.add(limb([[c * 0.03, 1.5, s * 0.03], [c * 0.1, 1.6, s * 0.1], [c * 0.09, 1.72, s * 0.09], [c * 0.03, 1.8, s * 0.03]], [0.016, 0.014, 0.011, 0.005], iron, 4));
  }
  const f = focus(PAL.fire, PAL.fireCore, 0.06);
  f.position.y = 1.66;
  g.add(f);
  g.add(spike([0, 0, 0], [0, -1, 0], 0.08, 0.022, iron, 5));
  return g;
}

/** RIMEFANG. Silver shaft crowned with a fan of ice shards. */
function rimeStaff() {
  const g = new THREE.Group();
  g.add(limb([[0, 0, 0], [0, 0.8, 0], [0, 1.45, 0]], [0.02, 0.024, 0.028], silver, 6));
  g.add(band(0.5, 0.03, mat(PAL.robeDark)), band(1.0, 0.03, mat(PAL.robeDark)), band(1.42, 0.04, silver));
  g.add(part(new THREE.CylinderGeometry(0.032, 0.028, 0.22, 6), leather, [0, 0.9, 0]));
  const ice = mat(0x9fe6ff, { emissive: PAL.frost, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1 });
  const r = rng(4);
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.32;
    const len = 0.32 - Math.abs(i - 3) * 0.05 + r() * 0.04;
    g.add(spike([0, 1.45, 0], [Math.sin(a) * 0.8, 1, (r() - 0.5) * 0.4], len, 0.03, ice, 4));
  }
  const f = focus(PAL.frost, PAL.frostCore, 0.05);
  f.position.y = 1.56;
  g.add(f);
  g.add(spike([0, 0, 0], [0, -1, 0], 0.12, 0.02, silver, 4));
  return g;
}

/** THUNDERCOIL. Dark iron shaft wound with a copper coil around a storm orb. */
function tempestStaff() {
  const g = new THREE.Group();
  g.add(limb([[0, 0, 0], [0, 0.8, 0], [0, 1.4, 0]], [0.022, 0.025, 0.03], iron, 6));
  g.add(band(1.38, 0.04), band(0.2, 0.03));
  g.add(part(new THREE.CylinderGeometry(0.034, 0.03, 0.22, 7), leather, [0, 0.9, 0]));
  const coil = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, a = t * Math.PI * 5;
    const rad = 0.03 + Math.sin(t * Math.PI) * 0.09;
    coil.push([Math.cos(a) * rad, 1.4 + t * 0.4, Math.sin(a) * rad]);
  }
  g.add(limb(coil, coil.map(() => 0.008), gold, 4));
  const orb = new THREE.Group();
  orb.add(part(new THREE.IcosahedronGeometry(0.065, 1), glowMat(PAL.storm, 2)));
  orb.add(part(new THREE.IcosahedronGeometry(0.035, 1), glowMat(PAL.stormCore, 3.5)));
  orb.add(halo(PAL.storm, 1.3, 0.6));
  orb.add(new THREE.PointLight(PAL.storm, 4, 6, 1.6));
  orb.position.y = 1.6;
  g.add(orb);
  const arcMat = glowMat(PAL.stormCore, 3);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    g.add(bolt([0, 1.6, 0], [Math.cos(a) * 0.12, 1.5 + i * 0.08, Math.sin(a) * 0.12], arcMat, { segments: 4, sway: 0.03, radius: 0.004, seed: 20 + i }));
  }
  g.add(spike([0, 0, 0], [0, -1, 0], 0.08, 0.024, gold, 5));
  return g;
}

export const STAVES = { ember: emberStaff, rime: rimeStaff, tempest: tempestStaff };

export function staff(school, { rune = true, ringRadius = 0.16 } = {}) {
  const g = STAVES[school]();
  if (rune) {
    const ring = runeRing(SCHOOLS[school].color, ringRadius, 10, 0.25);
    ring.position.y = school === 'ember' ? 1.66 : school === 'rime' ? 1.56 : 1.6;
    g.add(ring);
  }
  return shadows(g);
}

/** A gloved/bare hand. Palm faces -X for side = 1 (right hand) when posed 'grip'. */
function hand(side, pose) {
  const g = new THREE.Group();
  const palm = part(blob(0.045, 1, [1.0, 1.15, 0.45], 0.004, 3), skin);
  g.add(palm);
  const curl = pose === 'grip' ? 1 : pose === 'cast' ? 0.25 : 0.5;
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.022;
    const len = [0.042, 0.048, 0.045, 0.036][i];
    const k = curl * (1 + i * 0.1);
    const spread = pose === 'cast' ? (i - 1.5) * 0.12 : 0;
    const p0 = [x, 0.045, 0];
    const p1 = [x + Math.sin(spread) * len, p0[1] + Math.cos(k) * len, Math.sin(k) * len];
    const p2 = [p1[0] + Math.sin(spread) * len * 0.8, p1[1] + Math.cos(k * 2) * len * 0.8, p1[2] + Math.sin(k * 2) * len * 0.8];
    const p3 = [p2[0], p2[1] + Math.cos(k * 2.6) * len * 0.6, p2[2] + Math.sin(k * 2.6) * len * 0.6];
    g.add(limb([p0, p1, p2, p3], [0.013, 0.012, 0.011, 0.009], skin, 5));
  }
  const tk = pose === 'grip' ? 1.2 : 0.5;
  g.add(limb([[-side * -0.03, 0.0, 0.01], [-side * -0.06, 0.03, 0.03 + tk * 0.01], [-side * -0.065, 0.06, 0.04 + tk * 0.02]], [0.013, 0.011, 0.009], skin, 5));
  // leather bracer with a gold rune stud
  g.add(part(new THREE.CylinderGeometry(0.04, 0.042, 0.1, 8), leather, [0, -0.075, 0]));
  g.add(part(new THREE.OctahedronGeometry(0.012, 0), gold, [0, -0.07, 0.042]));
  return g;
}

/** Forearm in a robe sleeve, wrist at origin, elbow pointing -Y. */
function arm(side, pose) {
  const g = new THREE.Group();
  const h = hand(side, pose);
  g.add(h);
  const sleeve = lathe([[0.05, -0.12], [0.075, -0.2], [0.09, -0.45], [0.1, -0.6]], 9, robe, side + 10, 0.006);
  g.add(sleeve);
  g.add(part(new THREE.TorusGeometry(0.068, 0.009, 4, 12), gold, [0, -0.17, 0], [Math.PI / 2, 0, 0]));
  return g;
}

/**
 * First-person viewmodel. Add to the camera. Right hand holds the staff,
 * left hand is raised mid-cast with a spell sigil.
 */
export function viewmodel(school = 'ember', { casting = 'ember' } = {}) {
  const g = new THREE.Group();

  // staff hand: fist closed around the grip, forearm coming in from the lower right
  const right = new THREE.Group();
  const st = staff(school, { ringRadius: 0.11 });
  st.position.y = -0.98; // leather grip at the origin
  // close to the eye, glows have to be much smaller than in the world
  st.traverse((o) => {
    if (o.isSprite) o.scale.multiplyScalar(0.4);
    if (o.isPointLight) { o.intensity *= 0.35; o.distance = 3; }
  });
  right.add(st);
  const fore = new THREE.Vector3(-0.45, 0.35, -0.85).normalize();
  const palmIn = new THREE.Vector3(-1, 0, 0.35).projectOnPlane(fore).normalize();
  const ra = arm(1, 'grip');
  ra.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(fore, palmIn), fore, palmIn));
  ra.position.copy(palmIn).multiplyScalar(-0.045).addScaledVector(fore, -0.055);
  right.add(ra);
  right.position.set(0.33, -0.36, -0.62);
  right.rotation.set(-0.5, 0.1, -0.28);
  g.add(right);

  // casting hand: forearm rising from bottom-left, palm pushed toward the target
  const wrist = new THREE.Vector3(-0.27, -0.2, -0.56);
  const axis = new THREE.Vector3(0.28, 0.72, -0.62).normalize();
  const palm = new THREE.Vector3(0.05, 0.1, -1).projectOnPlane(axis).normalize();
  const side = new THREE.Vector3().crossVectors(axis, palm);
  const la = arm(-1, 'cast');
  la.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, axis, palm));
  la.position.copy(wrist);
  g.add(la);

  const c = SCHOOLS[casting];
  const sigil = new THREE.Group();
  sigil.add(runeRing(c.color, 0.075, 12, Math.PI / 2));
  const inner = runeRing(c.core, 0.045, 6, Math.PI / 2);
  inner.rotation.z = 0.3;
  sigil.add(inner);
  sigil.add(halo(c.color, 0.26, 0.4));
  sigil.add(part(new THREE.IcosahedronGeometry(0.016, 1), glowMat(c.core, 2.6)));
  const l = new THREE.PointLight(c.color, 0.35, 1.0, 2);
  sigil.add(l);
  sigil.position.copy(wrist).addScaledVector(axis, 0.09).addScaledVector(palm, 0.16);
  sigil.lookAt(sigil.position.clone().addScaledVector(palm, -1));
  g.add(sigil);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

/** Ember Bolt in flight. Travels along +Z. */
export function emberBolt(seed = 2) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(part(new THREE.IcosahedronGeometry(0.1, 1), glowMat(PAL.fireCore, 2.2)));
  g.add(part(new THREE.IcosahedronGeometry(0.17, 0), glowMat(PAL.fire, 1.3, { transparent: true, opacity: 0.8 })));
  g.add(halo(PAL.fire, 1.1, 0.55));
  for (let i = 1; i < 9; i++) {
    const s = 0.16 * (1 - i / 10);
    g.add(part(new THREE.TetrahedronGeometry(s, 0), glowMat(i < 3 ? PAL.fireCore : PAL.fire, 2.2 - i * 0.18),
      [(r() - 0.5) * 0.12 * i * 0.3, (r() - 0.5) * 0.12 * i * 0.3, -i * 0.17], [r() * 6, r() * 6, r() * 6]));
  }
  for (let i = 0; i < 10; i++) {
    g.add(part(new THREE.OctahedronGeometry(0.015, 0), glowMat(PAL.fireCore, 4), [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5, -r() * 1.4]));
  }
  g.add(new THREE.PointLight(PAL.fire, 6, 8, 1.6));
  return g;
}

/** Frost Lance in flight. Travels along +Z. */
export function frostLance() {
  const g = new THREE.Group();
  const lance = part(new THREE.OctahedronGeometry(0.1, 0), glowMat(PAL.frostCore, 2.6));
  lance.scale.set(0.8, 0.8, 6);
  g.add(lance);
  const sheath = part(new THREE.OctahedronGeometry(0.14, 0), glowMat(PAL.frost, 1.4, { transparent: true, opacity: 0.6 }));
  sheath.scale.set(0.8, 0.8, 5);
  g.add(sheath);
  for (let i = 1; i < 6; i++) {
    const ring = part(new THREE.TorusGeometry(0.1 + i * 0.015, 0.006, 3, 16), glowMat(PAL.frost, 2.2 - i * 0.3), [0, 0, -0.3 - i * 0.28]);
    g.add(ring);
  }
  g.add(halo(PAL.frost, 1.2, 0.6));
  g.add(new THREE.PointLight(PAL.frost, 4, 6, 1.6));
  return g;
}

/** Chain lightning through a list of points. */
export function chainLightning(points, seed = 30, { intensity = 1 } = {}) {
  const g = new THREE.Group();
  const core = glowMat(PAL.stormCore, 2.4 * intensity);
  const outer = glowMat(PAL.storm, 1.4 * intensity);
  for (let i = 0; i < points.length - 1; i++) {
    const len = new THREE.Vector3(...points[i]).distanceTo(new THREE.Vector3(...points[i + 1]));
    g.add(bolt(points[i], points[i + 1], core, { segments: 8, sway: len * 0.18, radius: 0.008, seed: seed + i }));
    g.add(bolt(points[i], points[i + 1], outer, { segments: 6, sway: len * 0.28, radius: 0.004, seed: seed + 50 + i }));
    const h = halo(PAL.storm, 0.6, 0.45 * intensity);
    h.position.set(...points[i + 1]);
    g.add(h);
  }
  return g;
}

/** Ice spikes erupting from the ground, as left by a Frost Lance impact. */
export function iceBurst(seed = 8, scale = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  const ice = mat(0x9fe6ff, { emissive: PAL.frost, emissiveIntensity: 0.5, roughness: 0.12, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.6 * scale;
    g.add(spike([Math.cos(a) * d, 0, Math.sin(a) * d], [Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6], (0.5 + r() * 0.9) * scale, (0.08 + r() * 0.06) * scale, ice, 4));
  }
  g.add(halo(PAL.frost, 2.5 * scale, 0.35).translateY(0.3));
  return g;
}

/** Explosion bloom where an Ember Bolt lands. */
export function emberBurst(seed = 6, scale = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(part(new THREE.IcosahedronGeometry(0.35 * scale, 1), glowMat(PAL.fireCore, 3)));
  g.add(halo(PAL.fire, 3.2 * scale, 0.9));
  for (let i = 0; i < 18; i++) {
    const v = new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).normalize();
    const d = (0.3 + r() * 0.6) * scale;
    g.add(spike([v.x * d * 0.4, v.y * d * 0.4, v.z * d * 0.4], [v.x, v.y, v.z], 0.25 * scale + r() * 0.2 * scale, 0.05 * scale, glowMat(i % 3 ? PAL.fire : PAL.fireCore, 2.6), 3));
  }
  g.add(new THREE.PointLight(PAL.fire, 14, 10, 1.6));
  return g;
}

/** The Warden, as seen in the codex and on the title screen. ~1.85 m with hood. */
export function wardenFigure(school = 'ember') {
  const g = new THREE.Group();
  g.add(lathe([[0.34, 0], [0.3, 0.3], [0.23, 0.9], [0.2, 1.15], [0.24, 1.38], [0.2, 1.5], [0.08, 1.56]], 10, robe, 2, 0.03, (x, y) => y < 0.35));
  g.add(lathe([[0.35, 0.02], [0.3, 0.32], [0.24, 0.9]], 10, robeDark, 3, 0.04, (x, y) => y < 0.35).translateZ(0.01));
  g.add(part(new THREE.TorusGeometry(0.21, 0.02, 4, 12), gold, [0, 0.95, 0], [Math.PI / 2, 0, 0]));
  g.add(part(new THREE.CylinderGeometry(0.24, 0.3, 0.05, 10), gold, [0, 0.02, 0]));
  // mantle and hood
  g.add(lathe([[0.1, 1.62], [0.3, 1.5], [0.36, 1.32], [0.3, 1.2]], 10, robeDark, 4, 0.02));
  const hood = part(blob(0.15, 1, [1, 1.25, 1.1], 0.01, 5), robeDark, [0, 1.73, -0.02]);
  g.add(hood);
  g.add(spike([0, 1.86, -0.08], [0, 0.4, -1], 0.22, 0.08, robeDark, 6));
  g.add(part(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshBasicMaterial({ color: 0x07060f }), [0, 1.72, 0.07]));
  for (const s of [1, -1]) {
    const e = part(new THREE.OctahedronGeometry(0.014, 0), glowMat(SCHOOLS[school].color, 4), [s * 0.04, 1.73, 0.15]);
    e.scale.x = 1.8;
    g.add(e);
  }
  for (const s of [1, -1]) {
    g.add(limb([[s * 0.28, 1.42, 0], [s * 0.36, 1.12, 0.08], [s * 0.34, 0.92, 0.22]], [0.075, 0.07, 0.065], robe, 7));
    g.add(part(blob(0.04, 0, [1, 1.2, 1], 0.004, 6), skin, [s * 0.34, 0.88, 0.24]));
  }
  const st = staff(school);
  st.position.set(0.36, 0, 0.26);
  st.rotation.z = -0.05;
  g.add(st);
  return shadows(g);
}
