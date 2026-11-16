// The ship hand's hands: a rigged model with every finger joint, posed from a small library
// of shapes and moved by springs so that every transition is smooth.
//
// A hand lives in its own frame: wrist at the origin, fingers along +Y, palm facing +Z,
// thumb toward +X on the right hand and -X on the left.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MATERIALS } from '../art/materials';

export type Side = 'left' | 'right';

/**
 * How the fingers are held. Angles in radians.
 * thumb: [swing toward the palm, swing away from the hand, knuckle bend, tip bend]
 * each finger: [knuckle bend, middle-joint bend, fan (0 = together, 1 = spread wide)]
 */
export interface Shape {
  thumb: [number, number, number, number];
  index: [number, number, number];
  middle: [number, number, number];
  ring: [number, number, number];
  pinky: [number, number, number];
}

const all = (mcp: number, pip: number, fan: number): Pick<Shape, 'index' | 'middle' | 'ring' | 'pinky'> => ({
  index: [mcp, pip, fan], middle: [mcp * 1.05, pip * 1.05, fan], ring: [mcp * 1.1, pip * 1.1, fan], pinky: [mcp * 1.15, pip * 1.12, fan],
});

export const SHAPES = {
  /** Hanging loose at your side. */
  relaxed: { thumb: [0.2, 0.15, 0.2, 0.25], ...all(0.38, 0.52, 0.1) },
  /** Flat palm, fingers together: "away". */
  flat: { thumb: [0.15, 0.0, 0.1, 0.1], ...all(0.02, 0.04, 0) },
  /** Wide open, every finger spread: the moment of release. */
  splay: { thumb: [-0.1, 0.55, 0.0, 0.0], ...all(-0.08, 0.06, 1) },
  /** Closed tight: stone. */
  fist: { thumb: [1.25, -0.25, 0.75, 1.0], ...all(1.5, 1.72, 0) },
  /** Cupped upward as if holding a coal: fire. */
  cup: { thumb: [0.15, 0.5, 0.3, 0.35], ...all(0.5, 0.8, 0.55) },
  /** First two fingers raised together, the rest folded under the thumb: wind. */
  two: {
    thumb: [0.85, -0.05, 0.55, 0.7],
    index: [0.02, 0.04, 0.15], middle: [0.03, 0.05, 0.15], ring: [1.45, 1.7, 0], pinky: [1.5, 1.7, 0],
  },
  /** Fingers hooked and tense, dragging something up out of the ground. */
  claw: { thumb: [0.1, 0.5, 0.45, 0.6], ...all(0.25, 1.05, 0.8) },
} satisfies Record<string, Shape>;

export type ShapeName = keyof typeof SHAPES;

const SHAPE_SIZE = 16;
export function shapeToArray(s: Shape, out: Float32Array, offset = 0) {
  out.set(s.thumb, offset);
  out.set(s.index, offset + 4);
  out.set(s.middle, offset + 7);
  out.set(s.ring, offset + 10);
  out.set(s.pinky, offset + 13);
  return out;
}

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
/** How far each finger swings sideways at full fan, and which way (toward the thumb is negative). */
const FAN = [-0.2, -0.04, 0.12, 0.27];

const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

interface Joint { bone: THREE.Bone; rest: THREE.Quaternion }

/** One rigged hand, normalised into the frame described at the top of this file. */
export class HandRig {
  readonly root = new THREE.Group();
  /** Centre of the palm and of the back of the hand, in the hand's frame. */
  readonly palm = new THREE.Vector3(0, 0.07, 0.02);
  readonly back = new THREE.Vector3(0, 0.07, -0.016);
  /** A spot on the back of the hand behind each knuckle (index to pinky), for the sigil marks. */
  readonly knuckles: THREE.Vector3[] = [];
  private thumb: Joint[] = [];
  private fingers: Joint[][] = [];
  private sign: number;
  readonly mesh: THREE.SkinnedMesh;

  constructor(scene: THREE.Object3D, readonly side: Side, material: THREE.Material) {
    this.sign = side === 'right' ? 1 : -1;
    scene.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    let mesh: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    });
    if (!mesh) throw new Error('hand model has no skinned mesh');
    this.mesh = mesh as THREE.SkinnedMesh;
    this.mesh.material = material;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    const bone = (name: string) => {
      const b = bones.get(name);
      if (!b) throw new Error(`hand model is missing the joint "${name}"`);
      return b;
    };

    // The model stores every joint as a sibling. Chain them, keeping their places, so that
    // bending a knuckle carries the rest of the finger with it.
    const wrist = bone('wrist');
    const chain = (names: string[]) => {
      let parent: THREE.Bone = wrist;
      const out: THREE.Bone[] = [];
      for (const n of names) {
        const b = bone(n);
        parent.attach(b);
        parent = b;
        out.push(b);
      }
      return out;
    };
    const t = chain(['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']);
    this.thumb = t.slice(0, 3).map((b) => ({ bone: b, rest: b.quaternion.clone() }));
    for (const f of FINGERS) {
      const c = chain([`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]);
      this.fingers.push(c.slice(1, 4).map((b) => ({ bone: b, rest: b.quaternion.clone() })));
    }

    // Find the hand's natural frame from where its joints are, then turn the whole model so
    // that frame lines up with ours.
    const p = (name: string) => bone(name).getWorldPosition(new THREE.Vector3());
    const w = p('wrist');
    const up = p('middle-finger-phalanx-proximal').sub(w).normalize();
    const across = p('pinky-finger-phalanx-proximal').sub(p('index-finger-phalanx-proximal'));
    const palmN = new THREE.Vector3().crossVectors(up, across).normalize();
    if (palmN.dot(p('thumb-tip').sub(w)) < 0) palmN.negate();
    const xAxis = new THREE.Vector3().crossVectors(up, palmN).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, up).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, up, zAxis).setPosition(w);
    const inv = basis.clone().invert();
    const holder = new THREE.Group();
    holder.add(scene);
    holder.applyMatrix4(inv);
    this.root.add(holder);
    for (const f of FINGERS) {
      const k = p(`${f}-phalanx-proximal`).applyMatrix4(inv);
      this.knuckles.push(new THREE.Vector3(k.x, k.y - 0.024, k.z - 0.0125));
    }
    this.root.traverse((o) => { o.userData.noCollide = true; });
  }

  /** Bend the fingers into a shape given as 16 numbers (see `shapeToArray`). */
  setShape(v: Float32Array) {
    // WebXR joints: -Z runs along the bone toward the fingertip and +Y is the back of the
    // hand, so bending toward the palm is a negative turn about X.
    const [swing, away, mcp, ip] = [v[0], v[1], v[2], v[3]];
    this.thumb[0].bone.quaternion.copy(this.thumb[0].rest)
      .multiply(_qy.setFromAxisAngle(Y, -away * this.sign))
      .multiply(_qz.setFromAxisAngle(Z, swing * 0.6 * this.sign))
      .multiply(_qx.setFromAxisAngle(X, -swing * 0.5));
    this.thumb[1].bone.quaternion.copy(this.thumb[1].rest).multiply(_qx.setFromAxisAngle(X, -mcp));
    this.thumb[2].bone.quaternion.copy(this.thumb[2].rest).multiply(_qx.setFromAxisAngle(X, -ip));
    for (let f = 0; f < 4; f++) {
      const o = 4 + f * 3;
      const j = this.fingers[f];
      j[0].bone.quaternion.copy(j[0].rest)
        .multiply(_qy.setFromAxisAngle(Y, -v[o + 2] * FAN[f] * this.sign))
        .multiply(_qx.setFromAxisAngle(X, -v[o]));
      j[1].bone.quaternion.copy(j[1].rest).multiply(_qx.setFromAxisAngle(X, -v[o + 1]));
      j[2].bone.quaternion.copy(j[2].rest).multiply(_qx.setFromAxisAngle(X, -v[o + 1] * 0.65));
    }
  }
}

/** Skin, tinted warmer toward the fingertips and knuckles where blood shows through. */
export function skinMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58, metalness: 0, vertexColors: true });
}

function tintSkin(mesh: THREE.SkinnedMesh, base: THREE.Color) {
  const geo = mesh.geometry;
  const index = geo.attributes.skinIndex, weight = geo.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const colors = new Float32Array(index.count * 3);
  const warm = base.clone().lerp(new THREE.Color(0xb5584a), 0.4);
  const c = new THREE.Color();
  for (let i = 0; i < index.count; i++) {
    let tip = 0;
    for (let k = 0; k < 4; k++) {
      const n = names[index.getComponent(i, k)] ?? '';
      const wgt = weight.getComponent(i, k);
      if (n.includes('tip') || n.includes('distal')) tip += wgt;
      else if (n.includes('intermediate')) tip += wgt * 0.35;
    }
    c.copy(base).lerp(warm, Math.min(1, tip));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Load both hands. Resolves null if the model files are missing. */
export async function loadHands(base: string, skinTone = 0xa9795a): Promise<{ left: HandRig; right: HandRig } | null> {
  const loader = new GLTFLoader();
  try {
    const [l, r] = await Promise.all([loader.loadAsync(base + 'left.glb'), loader.loadAsync(base + 'right.glb')]);
    const material = skinMaterial();
    const left = new HandRig(l.scene, 'left', material);
    const right = new HandRig(r.scene, 'right', material);
    const tone = new THREE.Color(skinTone);
    tintSkin(left.mesh, tone);
    tintSkin(right.mesh, tone);
    return { left, right };
  } catch {
    return null;
  }
}

/** Forearm, rolled sleeve and wrist cord. Its origin is the wrist; it reaches back along -Y. */
export function buildForearm(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xa9795a, roughness: 0.6 });
  // an oval limb that widens toward the elbow
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.043, 0.3, 14, 1, true), skin);
  arm.position.y = -0.15;
  arm.scale.set(1, 1, 0.8);
  g.add(arm);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.0285, 12, 8), skin);
  heel.scale.set(1, 0.9, 0.8);
  g.add(heel);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.0305, 0.0052, 6, 18), MATERIALS.leather);
  cord.rotation.x = Math.PI / 2;
  cord.position.y = -0.022;
  cord.scale.set(1, 0.8, 1);
  g.add(cord);
  const cord2 = cord.clone();
  cord2.position.y = -0.034;
  cord2.rotation.z = 0.12;
  g.add(cord2);
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.014, 7, 18), MATERIALS.linen);
  roll.rotation.x = Math.PI / 2;
  roll.position.y = -0.235;
  roll.scale.set(1, 0.85, 1);
  g.add(roll);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.55, 14, 1, true), MATERIALS.linen);
  sleeve.position.y = -0.5;
  sleeve.scale.set(1, 1, 0.85);
  g.add(sleeve);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

// ---- motion ------------------------------------------------------------------------------

/**
 * Critically damped spring toward a target: reaches it smoothly in roughly `time` seconds
 * with no overshoot, whatever the frame rate.
 */
export class Spring {
  value: Float32Array;
  velocity: Float32Array;
  constructor(size: number) {
    this.value = new Float32Array(size);
    this.velocity = new Float32Array(size);
  }
  snap(target: ArrayLike<number>) {
    this.value.set(target);
    this.velocity.fill(0);
  }
  step(target: ArrayLike<number>, time: number, dt: number) {
    const omega = 2 / Math.max(time, 1e-4);
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    for (let i = 0; i < this.value.length; i++) {
      const change = this.value[i] - target[i];
      const temp = (this.velocity[i] + omega * change) * dt;
      this.velocity[i] = (this.velocity[i] - omega * temp) * decay;
      this.value[i] = target[i] + (change + temp) * decay;
    }
  }
  /** Give it a shove, for recoil and flinches. */
  kick(impulse: ArrayLike<number>) {
    for (let i = 0; i < this.velocity.length; i++) this.velocity[i] += impulse[i] ?? 0;
  }
}

/**
 * Where an arm is and how the hand is held, written for the RIGHT arm in camera space
 * (x right, y up, -z forward). The left arm mirrors x.
 */
export interface ArmPose {
  /** Wrist position. */
  at: [number, number, number];
  /** Direction the fingers point. */
  fingers: [number, number, number];
  /** Direction the palm faces. */
  palm: [number, number, number];
  shape: ShapeName;
}

/** One beat of a gesture: move toward these poses, arriving in about `ease` seconds. */
export interface Beat {
  /** Seconds after the gesture begins. */
  t: number;
  ease: number;
  /** Pose for the hand that leads the gesture, and for the other hand (omit to leave it be). */
  lead?: ArmPose;
  other?: ArmPose;
}

export const ARM_SIZE = 9 + SHAPE_SIZE;

/** Flatten a pose into spring channels: position, finger direction, palm direction, finger shape. */
export function poseToArray(p: ArmPose, mirror: boolean, out: Float32Array) {
  const m = mirror ? -1 : 1;
  out[0] = p.at[0] * m; out[1] = p.at[1]; out[2] = p.at[2];
  out[3] = p.fingers[0] * m; out[4] = p.fingers[1]; out[5] = p.fingers[2];
  out[6] = p.palm[0] * m; out[7] = p.palm[1]; out[8] = p.palm[2];
  shapeToArray(SHAPES[p.shape], out, 9);
  return out;
}
