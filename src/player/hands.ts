// The ship hand's hands: a rigged model with every finger joint, posed from a small library
// of shapes and moved by springs so that every transition is smooth.
//
// A hand lives in its own frame: wrist at the origin, fingers along +Y, palm facing +Z,
// thumb toward +X on the right hand and -X on the left.
import * as THREE from 'three';
import { loadGlb } from '../art/gltf';
import { MATERIALS } from '../art/materials';
import { refineSkinned, skinMaterial, type SkinMaterial } from './skin';

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
  /** Fingers drawn in and tense, the moment before a throw. */
  gather: { thumb: [0.6, 0.2, 0.4, 0.5], ...all(0.9, 1.1, 0.2) },
  /** Thumb to the first two fingertips, as if about to snap them. */
  pinch: {
    thumb: [0.8, 0.3, 0.35, 0.3],
    index: [0.78, 0.9, 0.1], middle: [0.84, 0.95, 0.1], ring: [1.05, 1.25, 0.05], pinky: [1.15, 1.35, 0.05],
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
/** How many points go round the arm. */
const RING = 28;

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
  /** Rest position to each nail's frame (thumb, then index to pinky), for the skin shader. */
  readonly nails: THREE.Matrix4[] = [];
  /** The four finger knuckles, in the hand's frame. */
  readonly mcp: THREE.Vector3[] = [];
  /** The open edge of the wrist, in the hand's frame: its centre and its radius round the arm. */
  readonly wrist = { centre: new THREE.Vector3(), radius: new Float32Array(RING) };

  /**
   * @param refine  smooth the surface and work out what the skin shader needs to know
   */
  constructor(scene: THREE.Object3D, readonly side: Side, material: THREE.Material, refine = false) {
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
    if (refine) this.mesh.geometry = refineSkinned(this.mesh.geometry, this.mesh.skeleton.bones.length, 1);
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
      // the model now sits inside our frame, so joint positions are already in it
      const k = p(`${f}-phalanx-proximal`);
      this.knuckles.push(new THREE.Vector3(k.x, k.y - 0.024, k.z - 0.0125));
    }
    for (const f of FINGERS) this.mcp.push(p(`${f}-phalanx-proximal`));
    if (refine) this.describe(inv, p);
    this.root.traverse((o) => { o.userData.noCollide = true; });
  }

  /**
   * Work out, for every vertex, where it sits on the hand at rest and what kind of skin is
   * there; find the nails; and trace the open edge of the wrist for the forearm to join.
   */
  private describe(toHand: THREE.Matrix4, joint: (name: string) => THREE.Vector3) {
    const geo = this.mesh.geometry;
    const P = geo.attributes.position, N = geo.attributes.normal, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const m = toHand.clone().multiply(this.mesh.bindMatrix);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const names = this.mesh.skeleton.bones.map((b) => b.name);
    const thin = names.map((n) => {
      if (n.includes('tip') || n.includes('distal')) return 1;
      if (n.includes('intermediate')) return 0.75;
      if (n === 'thumb-phalanx-proximal') return 0.6;
      if (n.includes('phalanx-proximal')) return 0.5;
      if (n === 'thumb-metacarpal') return 0.2;
      return 0;
    });
    const joints: { at: THREE.Vector3; r: number }[] = [];
    for (const f of FINGERS) {
      joints.push({ at: joint(`${f}-phalanx-proximal`), r: 0.012 }, { at: joint(`${f}-phalanx-intermediate`), r: 0.0095 }, { at: joint(`${f}-phalanx-distal`), r: 0.008 });
    }
    joints.push({ at: joint('thumb-phalanx-proximal'), r: 0.011 }, { at: joint('thumb-phalanx-distal'), r: 0.009 });

    const rest = new Float32Array(P.count * 3), info = new Float32Array(P.count * 4);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const at: THREE.Vector3[] = [];
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      at.push(v.clone());
      rest.set([v.x, v.y, v.z], i * 3);
      let t = 0;
      for (let k = 0; k < 4; k++) t += thin[SI.getComponent(i, k)] * SW.getComponent(i, k);
      let j = 0;
      for (const q of joints) j = Math.max(j, Math.exp(-v.distanceToSquared(q.at) / (q.r * q.r)));
      info.set([t, j, THREE.MathUtils.clamp(0.5 - n.z * 0.9, 0, 1), 1], i * 4);
    }
    geo.setAttribute('rest', new THREE.BufferAttribute(rest, 3));
    geo.setAttribute('skinA', new THREE.BufferAttribute(info, 4));

    // nails: a frame on the back of each last finger joint, scaled so the nail is about a unit square
    const palmFront = new THREE.Vector3(0, 0.06, 0.04);
    for (const f of ['thumb', ...FINGERS]) {
      const base = joint(`${f}-phalanx-distal`), tip = joint(`${f}-tip`);
      const along = tip.clone().sub(base).normalize();
      // the model's tip joint sits inside the fingertip, so measure to the end of the skin itself
      const mine = names.map((n) => n === `${f}-phalanx-distal` || n === `${f}-tip`);
      let len = base.distanceTo(tip);
      for (let i = 0; i < P.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (mine[SI.getComponent(i, k)]) w += SW.getComponent(i, k);
        if (w > 0.6) len = Math.max(len, at[i].clone().sub(base).dot(along));
      }
      const bone = this.mesh.skeleton.bones.find((b) => b.name === `${f}-phalanx-distal`)!;
      const up = new THREE.Vector3(0, 1, 0).transformDirection(bone.matrixWorld);
      up.addScaledVector(along, -up.dot(along)).normalize();
      if (up.dot(base.clone().sub(palmFront)) < 0) up.negate();
      const across = new THREE.Vector3().crossVectors(along, up);
      const wide = f === 'thumb' ? 0.0088 : f === 'pinky-finger' ? 0.0062 : 0.0072;
      const origin = base.clone().addScaledVector(along, len * 0.66);
      const frame = new THREE.Matrix4().makeBasis(across.multiplyScalar(wide), up.multiplyScalar(0.004), along.multiplyScalar(-len * 0.3)).setPosition(origin);
      this.nails.push(frame.invert());
    }

    // Where the arm joins: a ring round the wrist, a little above the end of the mesh.
    let low = Infinity;
    for (const q of at) low = Math.min(low, q.y);
    const y0 = low + 0.003;
    const band = at.filter((q) => Math.abs(q.y - (low + 0.013)) < 0.008);
    if (band.length >= 8) {
      const c = this.wrist.centre.set(0, 0, 0);
      for (const q of band) c.add(q);
      c.divideScalar(band.length);
      c.y = y0;
      const polar = band.map((q) => ({ a: Math.atan2(q.z - c.z, q.x - c.x), r: Math.hypot(q.x - c.x, q.z - c.z) }));
      for (let k = 0; k < RING; k++) {
        const a = -Math.PI + (k / RING) * Math.PI * 2;
        // the outermost of the nearby points, weighted toward those at this angle
        let sum = 0, weight = 0;
        for (const q of polar) {
          let d = Math.abs(q.a - a);
          if (d > Math.PI) d = Math.PI * 2 - d;
          const w = Math.exp(-((d / 0.28) ** 2));
          sum += q.r * w; weight += w;
        }
        this.wrist.radius[k] = weight > 1e-6 ? sum / weight : 0.027;
      }
    } else {
      this.wrist.radius.fill(0.027);
      this.wrist.centre.set(0, -0.01, 0);
    }
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

const SKIN_TONE = 0xa67656;

/** Load both hands, smoothed and skinned. Resolves null if the model files are missing. */
export async function loadHands(base: string, skinTone = SKIN_TONE): Promise<{ left: HandRig; right: HandRig } | null> {
  try {
    const [l, r] = await Promise.all([loadGlb(base + 'left.glb'), loadGlb(base + 'right.glb')]);
    const make = (scene: THREE.Object3D, side: Side) => {
      const material = skinMaterial(skinTone, side === 'right' ? 1 : -1);
      const rig = new HandRig(scene, side, material, true);
      material.skin.uNail.value = rig.nails;
      material.skin.uTendon.value = rig.mcp;
      rig.mesh.receiveShadow = true;
      return rig;
    };
    return { left: make(l.scene, 'left'), right: make(r.scene, 'right') };
  } catch {
    return null;
  }
}

/** The skin material a hand was given, if it has one. */
export function skinOf(rig: HandRig): SkinMaterial | null {
  const m = rig.mesh.material as SkinMaterial;
  return m.skin ? m : null;
}

const ARM_RINGS = 18;
const ARM_LENGTH = 0.36;
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _ay = new THREE.Vector3();
const _az = new THREE.Vector3();
const _mm = new THREE.Matrix4();

/**
 * The forearm: one surface that begins at the hand's own wrist edge, bends where the wrist
 * bends, and takes up the turn of the palm gradually toward the elbow, as a real one does.
 * It is rebuilt each frame from the hand's place and the elbow's.
 */
export class Forearm {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private pos: Float32Array;
  private cuff = new THREE.Group();
  private twist = 0;
  private sign: number;
  private loopR = new Float32Array(RING).fill(0.027);
  private loopC = new THREE.Vector3(0, -0.01, 0);

  constructor(side: Side, material: THREE.Material) {
    this.sign = side === 'right' ? 1 : -1;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(ARM_RINGS * RING * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('rest', new THREE.BufferAttribute(new Float32Array(ARM_RINGS * RING * 3), 3));
    geo.setAttribute('skinA', new THREE.BufferAttribute(new Float32Array(ARM_RINGS * RING * 4), 4));
    const index: number[] = [];
    for (let i = 0; i < ARM_RINGS - 1; i++) {
      for (let k = 0; k < RING; k++) {
        const a = i * RING + k, b = i * RING + ((k + 1) % RING), c = a + RING, d = b + RING;
        index.push(a, b, c, b, d, c);
      }
    }
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    // the shirt sleeve, rolled to the elbow: creased, not turned on a lathe
    const crease = (geo: THREE.BufferGeometry, depth: number) => {
      const P = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const a = Math.atan2(v.z, v.x);
        const f = Math.sin(a * 5 + v.y * 40) * 0.5 + Math.sin(a * 11 - v.y * 23 + 1.3) * 0.3 + Math.sin(a * 2 + v.y * 9) * 0.4;
        const r = 1 + f * depth;
        P.setXYZ(i, v.x * r, v.y, v.z * r);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const rollGeo = new THREE.TorusGeometry(0.049, 0.015, 10, 32);
    rollGeo.rotateX(Math.PI / 2);
    const roll = new THREE.Mesh(crease(rollGeo, 0.05), MATERIALS.linen);
    roll.scale.set(1, 1.5, 0.9);
    const roll2 = new THREE.Mesh(crease(rollGeo.clone(), 0.07), MATERIALS.linen);
    roll2.scale.set(1.05, 1.3, 0.94);
    roll2.position.y = -0.03;
    roll2.rotation.y = 1.1;
    const sleeveGeo = new THREE.CylinderGeometry(0.052, 0.08, 0.6, 24, 12, true);
    sleeveGeo.translate(0, -0.33, 0);
    const sleeve = new THREE.Mesh(crease(sleeveGeo, 0.06), MATERIALS.linen);
    sleeve.scale.set(1, 1, 0.9);
    this.cuff.add(roll, roll2, sleeve);
    this.cuff.traverse((o) => { o.frustumCulled = false; o.receiveShadow = true; });
    this.group.add(this.cuff);
    this.group.traverse((o) => { o.userData.noCollide = true; });
    this.shape();
  }

  /** Where the wrist is, along the arm's own length. */
  get wristY(): number { return this.loopC.y; }

  /** Take the shape of a hand's wrist edge, so the two surfaces meet. */
  fit(rig: HandRig) {
    this.loopR.set(rig.wrist.radius);
    this.loopC.copy(rig.wrist.centre);
    this.shape();
  }

  /** How far out the surface is, at `s` along the arm (0 wrist, 1 elbow) and angle `k` round it. */
  private radius(s: number, k: number): number {
    const a = -Math.PI + (k / RING) * Math.PI * 2;
    const grow = THREE.MathUtils.smoothstep(s, 0, 0.8);
    const wide = THREE.MathUtils.lerp(0.0285, 0.045, grow), deep = THREE.MathUtils.lerp(0.021, 0.04, grow);
    const c = Math.cos(a), sn = Math.sin(a);
    let r = (wide * deep) / Math.hypot(deep * c, wide * sn);
    // the knob of bone on the little-finger side of the wrist
    const knob = Math.max(0, c * -this.sign * 0.75 + sn * -0.66);
    r += Math.exp(-(((s - 0.075) / 0.04) ** 2)) * knob ** 4 * 0.0032;
    // the muscle on the thumb side, below the elbow
    r += THREE.MathUtils.smoothstep(s, 0.3, 0.85) * Math.max(0, c * this.sign * 0.8 + sn * -0.6) ** 2 * 0.004;
    const join = THREE.MathUtils.smoothstep(s, 0.02, 0.2);
    return THREE.MathUtils.lerp(this.loopR[k], r, join);
  }

  private at(i: number): number {
    return (i <= 0 ? -0.055 : ((i - 1) / (ARM_RINGS - 2)) ** 1.35);
  }

  /** Fill in what does not change from frame to frame: where each point sits on the arm at rest. */
  private shape() {
    const rest = this.mesh.geometry.attributes.rest as THREE.BufferAttribute;
    const info = this.mesh.geometry.attributes.skinA as THREE.BufferAttribute;
    for (let i = 0; i < ARM_RINGS; i++) {
      const s = this.at(i);
      for (let k = 0; k < RING; k++) {
        const a = -Math.PI + (k / RING) * Math.PI * 2;
        const r = this.radius(Math.max(s, 0), k);
        rest.setXYZ(i * RING + k, this.loopC.x + Math.cos(a) * r, this.loopC.y - s * ARM_LENGTH, this.loopC.z + Math.sin(a) * r);
        info.setXYZW(i * RING + k, 0, 0, THREE.MathUtils.clamp(0.5 - Math.sin(a) * 0.9, 0, 1), 0);
      }
    }
    rest.needsUpdate = true;
    info.needsUpdate = true;
  }

  /** Forget which way the arm was last turned (after the hands are put somewhere outright). */
  reset() { this.twist = NaN; }

  /**
   * @param wrist  the hand's origin    @param hand  the hand's turn
   * @param elbow  where the elbow is   (all in the same space as this group)
   */
  update(wrist: THREE.Vector3, hand: THREE.Quaternion, elbow: THREE.Vector3) {
    // the arm's own frame: along the bone, palm turned as the hand's is
    _ay.copy(wrist).sub(elbow).normalize();
    _az.set(0, 0, 1).applyQuaternion(hand);
    _az.addScaledVector(_ay, -_az.dot(_ay));
    if (_az.lengthSq() < 1e-6) _az.set(0, 0, 1);
    _az.normalize();
    // how far the palm is turned from where it rests, about the bone; followed without jumps
    _rest.set(-this.sign * 0.85, -0.5, 0.1);
    _rest.addScaledVector(_ay, -_rest.dot(_ay)).normalize();
    _ax.crossVectors(_rest, _az);
    let turn = Math.atan2(_ax.dot(_ay), _rest.dot(_az));
    if (Number.isNaN(this.twist)) this.twist = turn;
    while (turn - this.twist > Math.PI) turn -= Math.PI * 2;
    while (turn - this.twist < -Math.PI) turn += Math.PI * 2;
    // if it has wound right round, let it go the short way
    if (Math.abs(turn) > Math.PI * 1.25) turn -= Math.sign(turn) * Math.PI * 2;
    this.twist = turn;

    const frame = (s: number, out: THREE.Quaternion) => {
      // at the elbow the arm has only a little of the palm's turn
      const t = turn * (1 - 0.8 * THREE.MathUtils.clamp(s, 0, 1));
      _az.copy(_rest).applyAxisAngle(_ay, t);
      _ax.crossVectors(_ay, _az);
      out.setFromRotationMatrix(_mm.makeBasis(_ax, _ay, _az));
      // close to the hand, the wrist's bend (the first of it runs straight on from the hand)
      const bend = 1 - THREE.MathUtils.smoothstep(s, 0.035, 0.24);
      if (bend > 0) out.slerp(hand, bend);
      return out;
    };

    _c.copy(this.loopC).applyQuaternion(hand).add(wrist);
    let prev = this.at(0);
    for (let i = 0; i < ARM_RINGS; i++) {
      const s = this.at(i);
      frame(Math.max(s, 0), _q);
      if (i > 0) {
        frame(Math.max((s + prev) / 2, 0), _qa);
        _c.addScaledVector(_p.set(0, -1, 0).applyQuaternion(_qa), (s - prev) * ARM_LENGTH);
      } else {
        _c.addScaledVector(_ax.set(0, 1, 0).applyQuaternion(hand), -s * ARM_LENGTH);
      }
      prev = s;
      // it begins inside the hand and comes out through the skin a shade larger, so the two
      // surfaces cross cleanly and the end of the hand is hidden
      const shrink = i === 0 ? 0.8 : 1.04;
      for (let k = 0; k < RING; k++) {
        const a = -Math.PI + (k / RING) * Math.PI * 2;
        const r = this.radius(Math.max(s, 0), k) * shrink;
        _ax.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(_q).add(_c);
        this.pos.set([_ax.x, _ax.y, _ax.z], (i * RING + k) * 3);
      }
    }
    this.cuff.position.copy(_c);
    this.cuff.quaternion.copy(_q);
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
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
  /**
   * Step toward a target as a damped spring. `zeta` below 1 lets it carry a little past and
   * settle, which reads as follow-through; `scale` stretches the time of each channel, so some
   * arrive later than others. Exact for any frame time.
   */
  stepDamped(target: ArrayLike<number>, time: number, zeta: number, dt: number, scale?: ArrayLike<number>) {
    for (let i = 0; i < this.value.length; i++) {
      const omega = 2 / Math.max(time * (scale ? scale[i] : 1), 1e-4);
      const x0 = this.value[i] - target[i], v0 = this.velocity[i];
      if (zeta >= 0.999) {
        const e = Math.exp(-omega * dt), k = v0 + omega * x0;
        this.value[i] = target[i] + (x0 + k * dt) * e;
        this.velocity[i] = (v0 - omega * k * dt) * e;
      } else {
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        const b = (v0 + zeta * omega * x0) / wd;
        const e = Math.exp(-zeta * omega * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt);
        this.value[i] = target[i] + e * (x0 * c + b * sn);
        this.velocity[i] = e * ((b * wd - zeta * omega * x0) * c - (x0 * wd + zeta * omega * b) * sn);
      }
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

/** One beat of a single arm's motion. */
export interface ArmBeat {
  t: number;
  ease: number;
  pose: ArmPose;
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
