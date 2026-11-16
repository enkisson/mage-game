// Creature bodies, built in code and animated by posing their joints.
// These are placeholders until proper models replace them: the shapes and sizes are right,
// the surface detail is not.
import * as THREE from 'three';

const hide = new THREE.MeshStandardMaterial({ color: 0x566461, roughness: 0.5 });
const hideDark = new THREE.MeshStandardMaterial({ color: 0x2c3534, roughness: 0.6 });
const rags = new THREE.MeshStandardMaterial({ color: 0x1b2226, roughness: 0.95, side: THREE.DoubleSide });
const bone = new THREE.MeshStandardMaterial({ color: 0xcfc8b4, roughness: 0.6 });
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8dff3a).multiplyScalar(3) });

const UP = new THREE.Vector3(0, 1, 0);

/** A rounded limb segment hanging down from the origin of its own group, so the group is the joint. */
function limb(length: number, r0: number, r1: number, material: THREE.Material): THREE.Group {
  const joint = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r0, r1, length, 8, 1);
  geo.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(geo, material);
  joint.add(m);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.05, 8, 6), material);
  joint.add(knob);
  return joint;
}

function between(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, material: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 7, 1), material);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return m;
}

function shadows(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).type.includes('Basic')) m.castShadow = true;
    o.userData.noCollide = true;
  });
}

export interface CreatureModel {
  root: THREE.Group;
  /** Pose the body. `t` is the creature's own clock, `move` 0–1 how fast it is walking. */
  animate(t: number, move: number, pose: Pose, poseT: number): void;
  /** Brighten when hurt, 0–1. */
  flash(amount: number): void;
  /** World-space point attacks come from (hands, or mouth). */
  muzzle: THREE.Object3D;
  height: number;
}

export type Pose = 'rise' | 'walk' | 'windup' | 'strike' | 'stagger' | 'air' | 'crouch' | 'dead';

/** THE DROWNED: a sailor the tide kept. About 1.85 m. */
export function makeDrowned(seed: number): CreatureModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const s = 0.94 + ((seed * 9301 + 49297) % 233280) / 233280 * 0.14;
  root.scale.setScalar(s);

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), rags);
  pelvis.scale.set(1.1, 0.8, 0.85);
  hips.add(pelvis);

  const spine = new THREE.Group();
  hips.add(spine);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 5, 12), rags);
  torso.position.y = 0.32;
  torso.scale.set(1.1, 1, 0.8);
  spine.add(torso);
  // torn coat hanging off the shoulders
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 1.4 + Math.PI * 0.8;
    const strip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55 + (i % 2) * 0.2, 3), rags);
    strip.position.set(Math.cos(a) * 0.2, 0.0, Math.sin(a) * 0.16);
    strip.rotation.x = Math.PI;
    strip.scale.z = 0.3;
    spine.add(strip);
  }

  const neck = new THREE.Group();
  neck.position.y = 0.62;
  spine.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), hide);
  head.position.set(0, 0.11, 0.03);
  head.scale.set(0.92, 1.1, 1);
  neck.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), hideDark);
  jaw.position.set(0, 0.02, 0.075);
  jaw.scale.set(0.9, 0.7, 0.9);
  neck.add(jaw);
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeMat);
    eye.position.set(sx * 0.048, 0.13, 0.135);
    neck.add(eye);
  }

  const arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  let muzzle: THREE.Object3D = new THREE.Object3D();
  for (const sx of [1, -1]) {
    const shoulder = limb(0.32, 0.06, 0.05, hide);
    shoulder.position.set(sx * 0.25, 0.55, 0);
    spine.add(shoulder);
    const elbow = limb(0.32, 0.048, 0.038, hide);
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), hideDark);
    hand.position.y = -0.34;
    hand.scale.set(0.8, 1.3, 0.6);
    elbow.add(hand);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 4), bone);
      claw.position.set((c - 1) * 0.022, -0.42, 0.01);
      claw.rotation.x = Math.PI;
      elbow.add(claw);
    }
    arms.push({ shoulder, elbow });
    if (sx === 1) muzzle = hand;

    const hip = limb(0.44, 0.095, 0.07, rags);
    hip.position.set(sx * 0.1, -0.05, 0);
    hips.add(hip);
    const knee = limb(0.44, 0.065, 0.045, hide);
    knee.position.y = -0.44;
    hip.add(knee);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), hideDark);
    foot.position.set(0, -0.45, 0.05);
    foot.scale.set(0.9, 0.6, 1.8);
    knee.add(foot);
    legs.push({ hip, knee });
  }
  shadows(root);

  const emissive = [hide, hideDark, rags];
  const own = emissive.map((m) => m.clone());
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const i = emissive.indexOf(m.material as THREE.MeshStandardMaterial);
    if (i >= 0) m.material = own[i];
  });

  return {
    root,
    muzzle,
    height: 1.85 * s,
    flash(amount) {
      for (const m of own) {
        m.emissive.setRGB(amount, amount * 0.9, amount * 0.7);
      }
    },
    animate(t, move, pose, poseT) {
      const stride = t * 7.5;
      const swing = Math.sin(stride) * 0.75 * move;
      body.position.y = Math.abs(Math.cos(stride)) * 0.035 * move;
      body.rotation.set(0, 0, 0);
      hips.rotation.z = Math.sin(stride) * 0.05 * move;
      spine.rotation.set(0.32 + move * 0.12, Math.sin(stride) * 0.12 * move, Math.sin(t * 1.3 + seed) * 0.04);
      neck.rotation.set(-0.2 + Math.sin(t * 2.1 + seed) * 0.08, Math.sin(t * 0.9 + seed) * 0.15, 0);
      legs[0].hip.rotation.x = -swing;
      legs[1].hip.rotation.x = swing;
      legs[0].knee.rotation.x = Math.max(0, Math.sin(stride + 1.2)) * 1.0 * move + 0.1;
      legs[1].knee.rotation.x = Math.max(0, Math.sin(stride + 1.2 + Math.PI)) * 1.0 * move + 0.1;
      // arms reach for you, swaying
      for (let i = 0; i < 2; i++) {
        const sgn = i === 0 ? 1 : -1;
        arms[i].shoulder.rotation.set(-1.15 + Math.sin(stride + i * Math.PI) * 0.25 * move, 0, sgn * 0.12);
        arms[i].elbow.rotation.set(-0.5 + Math.sin(t * 2.3 + i) * 0.12, 0, 0);
      }
      if (pose === 'rise') {
        body.position.y = -1.9 * (1 - poseT) * (1 - poseT);
        spine.rotation.x = 0.9 - poseT * 0.5;
      } else if (pose === 'windup') {
        const k = Math.min(1, poseT * 1.4);
        spine.rotation.x = 0.32 - 0.45 * k;
        for (let i = 0; i < 2; i++) {
          arms[i].shoulder.rotation.x = -1.15 - 1.5 * k;
          arms[i].elbow.rotation.x = -1.0 * k;
        }
      } else if (pose === 'strike') {
        const k = Math.min(1, poseT * 3);
        spine.rotation.x = -0.13 + 0.95 * k;
        for (let i = 0; i < 2; i++) {
          arms[i].shoulder.rotation.x = -2.65 + 2.1 * k;
          arms[i].elbow.rotation.x = -1.0 + 0.9 * k;
        }
      } else if (pose === 'crouch') {
        const k = Math.min(1, poseT * 1.6);
        body.position.y = -0.3 * k;
        spine.rotation.x = 0.32 + 0.5 * k;
        for (const l of legs) { l.hip.rotation.x = -0.9 * k; l.knee.rotation.x = 1.5 * k; }
      } else if (pose === 'stagger') {
        spine.rotation.x = -0.35 + Math.sin(t * 9) * 0.06;
        neck.rotation.x = -0.5;
        for (let i = 0; i < 2; i++) arms[i].shoulder.rotation.set(-0.2, 0, (i === 0 ? 1 : -1) * 0.9);
      } else if (pose === 'air') {
        body.rotation.x = -0.5;
        for (let i = 0; i < 2; i++) {
          arms[i].shoulder.rotation.set(-2.2 + Math.sin(t * 14 + i * 2) * 0.5, 0, (i === 0 ? 1 : -1) * 0.7);
          legs[i].hip.rotation.x = Math.sin(t * 12 + i * 3) * 0.7;
          legs[i].knee.rotation.x = 0.8;
        }
      } else if (pose === 'dead') {
        const k = Math.min(1, poseT * 2.2);
        body.rotation.x = -1.45 * k;
        body.position.y = -0.55 * k;
      }
    },
  };
}

/** SPITTER: three-legged thing with a glowing sac. Lobs gloam from range. About 2.2 m. */
export function makeSpitter(seed: number): CreatureModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const sac = new THREE.MeshStandardMaterial({ color: 0x35661c, emissive: 0x8dff3a, emissiveIntensity: 0.6, roughness: 0.35 });
  const hideOwn = hide.clone(), darkOwn = hideDark.clone();

  const trunk = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), hideOwn);
  trunk.position.y = 1.0;
  trunk.scale.set(1, 0.75, 1.2);
  body.add(trunk);

  const legPivots: THREE.Group[] = [];
  for (const a of [Math.PI * 0.2, Math.PI * 0.8, Math.PI * 1.5]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, 0);
    const c = Math.cos(a), sn = Math.sin(a);
    const hipP = new THREE.Vector3(c * 0.2, 0, sn * 0.2), kneeP = new THREE.Vector3(c * 0.66, 0.42, sn * 0.66), footP = new THREE.Vector3(c * 0.98, -1.0, sn * 0.98);
    pivot.add(between(hipP, kneeP, 0.06, 0.05, darkOwn));
    pivot.add(between(kneeP, footP, 0.05, 0.015, darkOwn));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), bone);
    knob.position.copy(kneeP);
    pivot.add(knob);
    body.add(pivot);
    legPivots.push(pivot);
  }

  const neck = new THREE.Group();
  neck.position.set(0, 1.1, 0.12);
  body.add(neck);
  neck.add(between(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0.16), 0.11, 0.085, hideOwn));
  neck.add(between(new THREE.Vector3(0, 0.45, 0.16), new THREE.Vector3(0, 0.85, 0.1), 0.085, 0.07, hideOwn));
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.98, 0.26);
  neck.add(headGroup);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), sac);
  bulb.scale.set(1, 1, 1.15);
  headGroup.add(bulb);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.285, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), darkOwn);
  cap.position.y = 0.02;
  cap.scale.set(1.02, 1, 1.17);
  headGroup.add(cap);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 5), bone);
  beak.position.set(0, -0.1, 0.3);
  beak.rotation.x = Math.PI / 2 + 0.4;
  headGroup.add(beak);
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eye.position.set(sx * 0.07, -0.02, 0.3);
    headGroup.add(eye);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.1, 0.5);
  headGroup.add(muzzle);
  shadows(root);

  return {
    root,
    muzzle,
    height: 2.3,
    flash(amount) {
      hideOwn.emissive.setRGB(amount, amount * 0.9, amount * 0.7);
      darkOwn.emissive.setRGB(amount, amount * 0.9, amount * 0.7);
    },
    animate(t, move, pose, poseT) {
      const step = t * 6;
      body.position.y = Math.sin(step * 2) * 0.03 * move;
      body.rotation.set(0, 0, 0);
      legPivots.forEach((p, i) => { p.rotation.y = Math.sin(step + i * 2.1) * 0.22 * move; });
      neck.rotation.set(Math.sin(t * 1.4 + seed) * 0.06, Math.sin(t * 0.8 + seed) * 0.12, 0);
      headGroup.scale.setScalar(1);
      sac.emissiveIntensity = 0.55 + Math.sin(t * 3) * 0.1;
      if (pose === 'rise') {
        body.position.y = -2.4 * (1 - poseT) * (1 - poseT);
      } else if (pose === 'windup') {
        const k = Math.min(1, poseT);
        neck.rotation.x = -0.45 * k;
        headGroup.scale.setScalar(1 + 0.3 * k);
        sac.emissiveIntensity = 0.6 + 2.6 * k;
      } else if (pose === 'strike') {
        neck.rotation.x = 0.5 * (1 - Math.min(1, poseT * 2));
      } else if (pose === 'stagger' || pose === 'air') {
        body.rotation.z = Math.sin(t * 10) * 0.12;
        neck.rotation.x = -0.6;
      } else if (pose === 'dead') {
        const k = Math.min(1, poseT * 2);
        body.rotation.z = 1.3 * k;
        body.position.y = -0.7 * k;
        sac.emissiveIntensity = 0.6 * (1 - k);
      }
    },
  };
}
