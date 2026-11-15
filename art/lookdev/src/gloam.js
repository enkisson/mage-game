// The Gloam: dusk-coloured hide, pale bone masks, toxic green light.
// Every model stands on y = 0 and faces +Z. Sizes are in metres.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { mat, glowMat, blob, part, limb, spike, lathe, rng, shadows, halo } from './kit.js';

const hide = mat(PAL.hide);
const hideDark = mat(PAL.hideDark);
const cloth = mat(PAL.hideDark, { side: THREE.DoubleSide });
const bone = mat(PAL.bone, { roughness: 0.6 });
const boneShade = mat(PAL.boneShade, { roughness: 0.7 });
const eyeMat = glowMat(PAL.gloam, 3.4);
const coreMat = glowMat(PAL.gloam, 1.7);
const sacMat = mat(0x3d7a1c, { emissive: PAL.gloam, emissiveIntensity: 0.55, roughness: 0.4 });
const voidMat = new THREE.MeshBasicMaterial({ color: 0x050308 });

/** The diamond mask every Gloam creature wears. Returns a group centred on the mask. */
function mask(w, h, d, eyeR = 0.035, material = bone) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), material);
  m.scale.set(w, h, d);
  g.add(m);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.IcosahedronGeometry(eyeR, 1), eyeMat);
    e.position.set(s * w * 0.36, h * 0.2, d * 0.46);
    e.scale.set(1.25, 0.8, 0.8);
    e.rotation.z = s * 0.45;
    g.add(e);
  }
  return g;
}

function claws(group, wrist, dir, length, radius, spread = 0.4, count = 3) {
  const d = new THREE.Vector3(...dir).normalize();
  const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
  for (let c = 0; c < count; c++) {
    const t = count === 1 ? 0 : c / (count - 1) - 0.5;
    const v = d.clone().addScaledVector(side, t * 2 * spread);
    group.add(spike(wrist, [v.x, v.y, v.z], length, radius, bone));
  }
}

/** HUSK. Swarm melee. Small, fast, fragile; arrives in packs. ~1.2 m. */
export function husk(seed = 1, { reach = 0.2, stride = 1 } = {}) {
  const g = new THREE.Group();
  g.add(part(blob(0.28, 1, [1, 1.3, 0.9], 0.035, seed), hide, [0, 0.84, 0.04], [0.6, 0, 0]));
  g.add(part(blob(0.2, 0, [1, 0.9, 0.95], 0.02, seed + 1), hideDark, [0, 0.56, -0.1]));

  const head = new THREE.Group();
  head.position.set(0, 1.06, 0.33);
  head.rotation.x = 0.2;
  head.add(part(blob(0.14, 0, [1, 1, 1.15], 0.01, seed + 2), hideDark, [0, 0.03, -0.1]));
  head.add(mask(0.15, 0.25, 0.16, 0.036));
  for (const s of [1, -1]) head.add(spike([s * 0.08, 0.12, -0.04], [s * 0.75, 0.85, -0.55], 0.34, 0.038, bone));
  g.add(head);

  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    g.add(spike([0, 1.0 - t * 0.32, -0.13 - t * 0.1], [0, 0.55, -1], 0.2 - t * 0.04, 0.035, boneShade));
  }

  for (const s of [1, -1]) {
    const lift = s === 1 ? reach : reach * 0.35;
    const sh = [s * 0.26, 0.98, 0.12];
    const el = [s * 0.47, 0.72 + lift * 0.25, 0.26];
    const wr = [s * 0.4, 0.5 + lift * 0.75, 0.62 + lift * 0.2];
    g.add(limb([sh, el, wr], [0.06, 0.045, 0.034], hide));
    claws(g, wr, [wr[0] - el[0] - s * 0.05, wr[1] - el[1] - 0.1, wr[2] - el[2]], 0.22, 0.024, 0.34);

    const step = s * stride * 0.16;
    g.add(limb(
      [[s * 0.14, 0.55, -0.08], [s * 0.21, 0.33, 0.14 + step], [s * 0.18, 0.12, -0.08 + step], [s * 0.18, 0.02, 0.1 + step]],
      [0.075, 0.055, 0.04, 0.03], hideDark));
    claws(g, [s * 0.18, 0.02, 0.1 + step], [0, -0.05, 1], 0.1, 0.02, 0.5);
  }
  return shadows(g);
}

/** SPITTER. Ranged. Keeps its distance and lobs slow gloam bolts. ~2.2 m. */
export function spitter(seed = 3) {
  const g = new THREE.Group();
  g.add(part(blob(0.3, 1, [1, 0.8, 1.25], 0.03, seed), hide, [0, 1.02, 0]));

  for (const a of [Math.PI * 0.2, Math.PI * 0.8, Math.PI * 1.5]) {
    const c = Math.cos(a), s = Math.sin(a);
    const pts = [[c * 0.18, 1.0, s * 0.18], [c * 0.62, 1.42, s * 0.62], [c * 0.86, 0.5, s * 0.86], [c * 0.95, 0.0, s * 0.95]];
    g.add(limb(pts, [0.06, 0.05, 0.035, 0.012], hideDark));
    g.add(spike(pts[1], [c * 0.5, 1, s * 0.5], 0.16, 0.035, boneShade));
  }

  g.add(limb([[0, 1.1, 0.12], [0, 1.52, 0.3], [0, 1.9, 0.24], [0, 2.08, 0.36]], [0.11, 0.085, 0.07, 0.065], hide));

  g.add(part(blob(0.27, 1, [1, 1, 1.15], 0.02, seed + 1), sacMat, [0, 2.14, 0.44]));
  g.add(part(blob(0.29, 0, [1.04, 0.62, 1.1], 0.02, seed + 2), hideDark, [0, 2.3, 0.36]));
  const face = mask(0.11, 0.17, 0.24, 0.03);
  face.position.set(0, 2.0, 0.68);
  face.rotation.x = 0.55;
  g.add(face);
  g.add(halo(PAL.gloam, 1.1, 0.16).translateY(2.14).translateZ(0.44));

  for (let i = 0; i < 3; i++) g.add(part(new THREE.IcosahedronGeometry(0.07 - i * 0.012, 1), sacMat, [0, 1.24 - i * 0.05, -0.08 - i * 0.14]));
  const tail = [[0, 1.0, -0.3], [0, 1.22, -0.72], [0, 1.62, -0.9]];
  g.add(limb(tail, [0.07, 0.045, 0.03], hideDark));
  g.add(spike(tail[2], [0, 1, 0.5], 0.26, 0.04, bone));
  return shadows(g);
}

/** BRUTE. Tank. Slow, armoured; winds up a telegraphed charge. ~3 m. */
export function brute(seed = 7) {
  const g = new THREE.Group();
  g.add(part(blob(0.78, 1, [1.25, 1.0, 0.92], 0.06, seed), hide, [0, 1.78, 0], [0.25, 0, 0]));
  g.add(part(blob(0.56, 1, [1.1, 1.0, 0.9], 0.04, seed + 1), hideDark, [0, 1.12, -0.06]));

  // furnace of gloam behind a bone ribcage
  g.add(part(new THREE.IcosahedronGeometry(0.24, 1), coreMat, [0, 1.66, 0.56]));
  g.add(halo(PAL.gloam, 1.6, 0.2).translateY(1.66).translateZ(0.7));
  for (let i = 0; i < 4; i++) {
    for (const s of [1, -1]) {
      const y = 1.98 - i * 0.2;
      g.add(limb([[s * 0.52, y, 0.5], [s * 0.3, y - 0.03, 0.78], [s * 0.05, y - 0.1, 0.84]], [0.05, 0.045, 0.02], bone, 4));
    }
  }

  const head = mask(0.22, 0.22, 0.2, 0.04);
  head.position.set(0, 2.42, 0.46);
  head.rotation.x = 0.25;
  g.add(head);
  for (const s of [1, -1]) {
    g.add(limb([[s * 0.2, 2.5, 0.34], [s * 0.56, 2.76, 0.3], [s * 0.72, 3.12, 0.52]], [0.1, 0.07, 0.012], bone));
    g.add(part(blob(0.44, 0, [1.1, 0.62, 1.05], 0.03, seed + 4), bone, [s * 0.98, 2.36, -0.02], [0, 0, -s * 0.35]));
    for (let k = 0; k < 3; k++) g.add(spike([s * (0.82 + k * 0.17), 2.55 - k * 0.05, -0.05], [s * (0.2 + k * 0.3), 1, -0.1], 0.36, 0.07, boneShade));

    const sh = [s * 0.98, 2.14, 0.05], el = [s * 1.34, 1.4, 0.24], wr = [s * 1.18, 0.62, 0.58];
    g.add(limb([sh, el, wr], [0.24, 0.2, 0.27], hide, 6));
    g.add(part(blob(0.36, 0, [1, 0.92, 1.1], 0.03, seed + 5), hideDark, [wr[0], 0.38, wr[2] + 0.06]));
    for (let k = 0; k < 3; k++) g.add(spike([wr[0] + (k - 1) * 0.17, 0.5, wr[2] + 0.32], [(k - 1) * 0.2, 0.25, 1], 0.2, 0.07, bone));

    g.add(limb([[s * 0.4, 0.95, -0.05], [s * 0.58, 0.52, 0.16], [s * 0.52, 0.12, 0.0]], [0.24, 0.19, 0.2], hideDark, 6));
    g.add(part(blob(0.24, 0, [1.05, 0.5, 1.4], 0.02, seed + 6), hideDark, [s * 0.52, 0.11, 0.12]));
  }
  for (let i = 0; i < 5; i++) g.add(spike([0, 2.38 - i * 0.26, -0.5 - Math.sin(i / 4 * Math.PI) * 0.22], [0, 0.5, -1], 0.42 - i * 0.04, 0.09, boneShade));
  return shadows(g);
}

/** WRAITH. Flyer. Drifts above the fight, then dives. Hovers at ~2.5 m. */
export function wraith(seed = 5) {
  const g = new THREE.Group();
  const r = rng(seed);
  const robe = lathe(
    [[0.02, 0.1], [0.16, 0.5], [0.3, 0.95], [0.27, 1.4], [0.46, 1.7], [0.23, 1.86], [0.31, 2.06], [0.21, 2.3], [0.02, 2.48]],
    9, cloth, seed, 0.07, (x, y) => y < 1.2);
  // sweep the tail back so it trails behind the body
  const pos = robe.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 1.3) pos.setZ(i, pos.getZ(i) - Math.pow(1.3 - y, 1.7) * 0.75);
  }
  robe.geometry.computeVertexNormals();
  g.add(robe);

  g.add(part(new THREE.IcosahedronGeometry(0.2, 1), voidMat, [0, 2.07, 0.1]));
  const face = mask(0.11, 0.22, 0.1, 0.03);
  face.position.set(0, 2.05, 0.25);
  g.add(face);
  g.add(spike([0, 2.42, -0.02], [0, 0.55, -1], 0.5, 0.1, hideDark));

  for (const s of [1, -1]) {
    const sh = [s * 0.4, 1.72, 0.04], el = [s * 0.95, 1.62, 0.22], wr = [s * 1.02, 2.12, 0.62];
    g.add(limb([sh, el, wr], [0.055, 0.042, 0.032], boneShade, 4));
    claws(g, wr, [-s * 0.35, 0.3, 1], 0.42, 0.026, 0.5, 4);
    // torn sleeve hanging from the arm
    for (let k = 0; k < 3; k++) {
      const t = 0.15 + k * 0.33 + r() * 0.1;
      const base = [sh[0] + (el[0] - sh[0]) * t, sh[1] + (el[1] - sh[1]) * t + 0.02, sh[2] + (el[2] - sh[2]) * t];
      const rag = spike(base, [s * (0.1 + r() * 0.4), -1, -0.3 - r() * 0.5], 0.3 + r() * 0.5, 0.07 + r() * 0.05, cloth, 3);
      rag.scale.z = 0.35;
      g.add(rag);
    }
    g.add(part(blob(0.17, 0, [1.2, 0.55, 1], 0.01, seed + 3), hideDark, [s * 0.4, 1.74, 0], [0, 0, -s * 0.4]));
  }

  g.add(part(new THREE.IcosahedronGeometry(0.11, 1), coreMat, [0, 1.3, 0.3]));
  g.add(halo(PAL.gloam, 1.5, 0.22).translateY(0.75));
  for (let i = 0; i < 8; i++) {
    const t = r();
    g.add(part(new THREE.TetrahedronGeometry(0.04 + r() * 0.06, 0), hideDark,
      [(r() - 0.5) * 0.5, 0.05 + t * 0.7, -0.45 - (1 - t) * 0.6 + (r() - 0.5) * 0.3], [r() * 6, r() * 6, r() * 6]));
  }
  return shadows(g);
}

/** BLOATER. Walking bomb. Detonates on death, hurting everything nearby. ~1.5 m. */
export function bloater(seed = 9) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(part(blob(0.62, 1, [1.02, 0.94, 1], 0.05, seed), hide, [0, 0.9, 0]));
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2, e = 0.15 + r() * 1.1;
    const d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
    const rad = 0.07 + r() * 0.1;
    g.add(part(new THREE.IcosahedronGeometry(rad, 1), sacMat, [d[0] * 0.58, 0.9 + d[1] * 0.54, d[2] * 0.58]));
  }
  g.add(halo(PAL.gloam, 2.0, 0.1).translateY(1.0));
  const face = mask(0.12, 0.15, 0.1, 0.03);
  face.position.set(0, 0.74, 0.6);
  face.rotation.x = -0.15;
  g.add(face);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      g.add(limb([[sx * 0.3, 0.45, sz * 0.25], [sx * 0.52, 0.34, sz * 0.4], [sx * 0.5, 0.02, sz * 0.46]], [0.1, 0.075, 0.05], hideDark));
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.42;
    g.add(spike([Math.cos(a) * 0.36, 1.36, Math.sin(a) * 0.36 - 0.05], [Math.cos(a) * 0.5, 1, Math.sin(a) * 0.6], 0.26, 0.05, boneShade));
  }
  return shadows(g);
}

/** THE TIDECALLER. Boss. Crowned colossus that opens new rifts mid-fight. ~7 m. */
export function tidecaller(seed = 11) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(lathe(
    [[1.75, 0], [1.5, 0.5], [1.12, 1.7], [0.95, 2.7], [1.22, 3.45], [1.46, 4.05], [0.92, 4.4], [0.42, 4.58]],
    10, cloth, seed, 0.16, (x, y) => y < 1.2));

  // the rift it carries in its chest
  const slit = part(new THREE.IcosahedronGeometry(1, 1), coreMat, [0, 3.35, 1.02]);
  slit.scale.set(0.2, 0.82, 0.16);
  g.add(slit);
  g.add(halo(PAL.gloam, 3.6, 0.22).translateY(3.35).translateZ(1.3));
  for (let i = 0; i < 5; i++) {
    for (const s of [1, -1]) {
      const y = 4.0 - i * 0.3;
      g.add(limb([[s * 0.72, y, 0.86], [s * 0.42, y - 0.06, 1.2], [s * 0.1, y - 0.2, 1.22]], [0.08, 0.06, 0.02], bone, 4));
    }
  }

  g.add(part(blob(0.56, 1, [1, 1.1, 1], 0.03, seed + 1), hideDark, [0, 5.02, 0]));
  const face = mask(0.42, 0.72, 0.44, 0.085);
  face.position.set(0, 4.98, 0.34);
  face.rotation.x = 0.12;
  g.add(face);
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.3;
    g.add(spike([Math.sin(a) * 0.42, 5.42 + Math.cos(a) * 0.1, 0.12], [Math.sin(a) * 0.9, 1, 0.08], 1.25 - Math.abs(i - 3) * 0.2, 0.09, bone));
  }
  const ring = part(new THREE.TorusGeometry(1.55, 0.05, 4, 28, Math.PI * 1.62), glowMat(PAL.gloam, 3.2), [0, 5.3, -0.55], [0, 0, Math.PI * 0.69]);
  g.add(ring);

  for (const s of [1, -1]) {
    g.add(limb([[s * 0.45, 5.15, 0], [s * 1.15, 5.55, -0.1], [s * 1.5, 6.3, 0.2], [s * 1.28, 7.0, 0.55]], [0.2, 0.16, 0.1, 0.015], bone, 5));
    g.add(part(blob(0.72, 0, [1.15, 0.6, 1.0], 0.04, seed + 2), bone, [s * 1.55, 4.18, 0], [0, 0, -s * 0.3]));
    for (let k = 0; k < 3; k++) g.add(spike([s * (1.3 + k * 0.28), 4.48 - k * 0.08, -0.05], [s * (0.15 + k * 0.3), 1, -0.1], 0.66, 0.12, boneShade));

    const raised = s === -1;
    const sh = [s * 1.55, 3.95, 0.1];
    const el = raised ? [s * 2.45, 3.5, 0.7] : [s * 2.3, 2.85, 0.6];
    const wr = raised ? [s * 2.25, 4.45, 1.45] : [s * 1.9, 2.55, 1.6];
    g.add(limb([sh, el, wr], [0.3, 0.2, 0.15], hide, 6));
    claws(g, wr, raised ? [0.15, 1, 0.35] : [-s * 0.2, -0.15, 1], 0.8, 0.07, 0.5, 4);
    if (raised) {
      g.add(part(new THREE.IcosahedronGeometry(0.34, 1), coreMat, [wr[0] + 0.1, wr[1] + 1.05, wr[2] + 0.25]));
      g.add(halo(PAL.gloam, 2.6, 0.3).translateX(wr[0] + 0.1).translateY(wr[1] + 1.05).translateZ(wr[2] + 0.25));
    }
  }

  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, rad = 2.1 + r() * 0.9;
    g.add(part(new THREE.TetrahedronGeometry(0.1 + r() * 0.16, 0), i % 3 ? hideDark : boneShade, [Math.cos(a) * rad, 0.3 + r() * 2.2, Math.sin(a) * rad], [r() * 6, r() * 6, r() * 6]));
  }
  return shadows(g);
}

/** Lobbed gloam bolt, as thrown by a spitter. */
export function gloamBolt() {
  const g = new THREE.Group();
  g.add(part(new THREE.IcosahedronGeometry(0.16, 1), eyeMat));
  g.add(halo(PAL.gloam, 1.6, 0.8));
  for (let i = 1; i < 6; i++) g.add(part(new THREE.IcosahedronGeometry(0.13 - i * 0.02, 0), coreMat, [0, i * 0.05, -i * 0.2]));
  return g;
}

export const BESTIARY = [
  { id: 'husk', name: 'Husk', role: 'Swarm', build: () => husk(1), height: 1.3 },
  { id: 'spitter', name: 'Spitter', role: 'Ranged', build: () => spitter(3), height: 2.4 },
  { id: 'brute', name: 'Brute', role: 'Tank', build: () => brute(7), height: 3.2 },
  { id: 'wraith', name: 'Wraith', role: 'Flyer', build: () => wraith(5), height: 2.5, hover: 0.7 },
  { id: 'bloater', name: 'Bloater', role: 'Bomb', build: () => bloater(9), height: 1.6 },
  { id: 'tidecaller', name: 'The Tidecaller', role: 'Boss', build: () => tidecaller(11), height: 7.1 },
];
