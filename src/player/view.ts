// What the ship hand sees: the camera, and their own two hands shaping the words.
// The first word of a sentence forms in the left hand, the second in the right. Casting
// plays a gesture that fits the spell.
//
// Nothing here ever jumps. Each arm follows its own short list of beats; springs carry the
// wrist, the turn of the hand and every finger toward the current beat at slightly different
// rates, so the wrist leads, the fingers trail and settle after it, and a new motion always
// starts from wherever the last one had got to. On top of that sit breath, footfall, the lag
// of a turning head, and the small restlessness of hands with nothing to do.
import * as THREE from 'three';
import { SIGILS, type SigilId } from '../magic/sigils';
import type { SpellDef } from '../magic/grammar';
import { PLAYER, type Player } from './player';
import { ARM_SIZE, Forearm, HandRig, Spring, loadHands, poseToArray, skinOf, type ArmBeat, type ArmPose } from './hands';
import { BRACE, GESTURES, GESTURE_TAIL, HOLD, IDLE, LET_GO, PLANTED, SPRAWLED, STRIKE, forming, gestureFor } from './poses';
import { HandMagic, type HandState } from './handfx';
import { skinMaterial, type SkinMaterial } from './skin';

const glyphTextures = new Map<SigilId, THREE.Texture>();
function glyphTexture(id: SigilId): THREE.Texture {
  let tex = glyphTextures.get(id);
  if (tex) return tex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.translate(S * 0.15, S * 0.15);
  ctx.scale((S * 0.7) / 64, (S * 0.7) / 64);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'miter';
  ctx.shadowColor = '#fff';
  const path = new Path2D(SIGILS[id].glyph);
  ctx.shadowBlur = 26;
  ctx.stroke(path);
  ctx.shadowBlur = 8;
  ctx.stroke(path);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glyphTextures.set(id, tex);
  return tex;
}

/** Where the elbow sits, off the bottom of the screen (right arm; the left mirrors x). */
const ELBOW = new THREE.Vector3(0.37, -0.62, -0.03);
/** Where a held sigil floats, in the hand's own frame: out from the middle of the palm. */
const GLYPH_AT = new THREE.Vector3(0, 0.072, 0.1);
const PALM_AT = new THREE.Vector3(0, 0.078, 0.05);
const FIST_AT = new THREE.Vector3(0, 0.06, 0.012);
/**
 * The hands are drawn small and close, which looks the same but keeps them inside the body,
 * so they never poke through a wall you are standing against.
 */
const VIEW_SCALE = 0.3;
const SKIN_TONE = 0xa47c64;

/** How much later each part arrives: across, up, forward for the wrist... */
const WRIST_LAG = [1, 0.86, 1.12];
/** ...and for the fingers: thumb first, little finger last, the far joints after the near ones. */
const FINGER_LAG = [0.9, 0.9, 1, 1.1, 1, 1.12, 1, 1.08, 1.2, 1.08, 1.18, 1.32, 1.18, 1.3, 1.45, 1.3];
const FINGER_WEIGHT = [0.8, 0.9, 1, 1.15];
/** How brightly each held word lights the hand and the ground. */
const GLOW: Partial<Record<SigilId, { hand: number; skin: number; world: number }>> = {
  fire: { hand: 0.016, skin: 0.9, world: 1.8 },
  wind: { hand: 0.012, skin: 0.25, world: 0.4 },
  push: { hand: 0.014, skin: 0.3, world: 0.5 },
  stone: { hand: 0.006, skin: 0.1, world: 0.2 },
};

/** A slow, never-repeating wander between -1 and 1. */
const wander = (t: number, k: number) => Math.sin(t + k * 1.7) * 0.6 + Math.sin(t * 1.618 + k * 2.9) * 0.4;

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _shape = new Float32Array(16);
const _col = new THREE.Color();

interface Glyph { sprite: THREE.Sprite; age: number; leaving: number; cast: boolean; from: THREE.Vector3 }

/** A sigil marked on the back of the hand. It smoulders while known and flares when spoken. */
interface Mark { mesh: THREE.Mesh; id: SigilId; heat: number }

const markGeo = new THREE.PlaneGeometry(0.019, 0.019);
const MARK_DIM = 0.3;
const MARK_LIT = 3.2;

class Arm {
  readonly holder = new THREE.Group();
  readonly forearm: Forearm;
  readonly light = new THREE.PointLight(0xffffff, 0, 0.9 * VIEW_SCALE, 2);
  readonly pos = new Spring(3);
  readonly aimed = new Spring(6);
  readonly fingers = new Spring(16);
  private target = new Float32Array(ARM_SIZE);
  private tPos = this.target.subarray(0, 3);
  private tAim = this.target.subarray(3, 9);
  private tFingers = this.target.subarray(9, 25);
  private ease = 0.2;
  private track: { beats: ArmBeat[]; t: number; next: number } | null = null;
  readonly mirror: boolean;
  readonly sign: number;
  private armSkin: SkinMaterial;
  private handSkin: SkinMaterial | null = null;
  rig: HandRig | null = null;
  held: SigilId | null = null;
  /** The word last held, so its light can fade rather than cut. */
  private last: SigilId | null = null;
  /** 0 to 1: how fully the held word has formed. */
  amount = 0;
  /** Flares when a spell leaves this hand. */
  flash = 0;
  /** 0 to 1: drawn toward the other hand while both hold a word. */
  together = 0;
  glyph: Glyph | null = null;
  marks: Mark[] = [];
  private restless = 4 + Math.random() * 5;
  private fidget = -1;
  /** Where the held sigil floats, in the hands' space. */
  readonly glyphAt = new THREE.Vector3();
  readonly state: HandState = { id: null, amount: 0, palmAt: new THREE.Vector3(), fistAt: new THREE.Vector3(), palm: new THREE.Vector3(0, 0, 1), fingers: new THREE.Vector3(0, 1, 0) };

  constructor(readonly side: 'left' | 'right', parent: THREE.Object3D) {
    this.mirror = side === 'left';
    this.sign = this.mirror ? -1 : 1;
    this.armSkin = skinMaterial(SKIN_TONE, this.mirror ? -1 : 1);
    this.forearm = new Forearm(side, this.armSkin);
    parent.add(this.holder, this.forearm.group, this.light);
    this.holder.visible = false;
    this.forearm.group.visible = false;
    poseToArray(IDLE, this.mirror, this.target);
    this.snap();
  }

  attach(rig: HandRig) {
    this.rig = rig;
    this.holder.add(rig.root);
    this.forearm.fit(rig);
    this.handSkin = skinOf(rig);
    if (this.handSkin) {
      // one light shows through hand and arm alike
      this.armSkin.skin.uGlowPos = this.handSkin.skin.uGlowPos;
      this.armSkin.skin.uGlowColor = this.handSkin.skin.uGlowColor;
      this.handSkin.skin.uGlowFall.value = this.armSkin.skin.uGlowFall.value = 420 / (VIEW_SCALE * VIEW_SCALE);
      this.handSkin.skin.uUnit.value = this.armSkin.skin.uUnit.value = VIEW_SCALE;
      this.armSkin.skin.uWristY.value = this.forearm.wristY;
    }
    this.holder.visible = true;
    this.forearm.group.visible = true;
  }

  /** Put the four bound sigils on the back of the hand, one behind each knuckle. */
  setMarks(bound: (SigilId | null)[]) {
    if (!this.rig) return;
    for (const m of this.marks) {
      this.rig.root.remove(m.mesh);
      (m.mesh.material as THREE.Material).dispose();
    }
    this.marks = [];
    bound.forEach((id, i) => {
      if (!id) return;
      const mat = new THREE.MeshBasicMaterial({
        map: glyphTexture(id), color: new THREE.Color(SIGILS[id].color).multiplyScalar(MARK_DIM), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4,
      });
      const mesh = new THREE.Mesh(markGeo, mat);
      mesh.position.copy(this.rig!.knuckles[i]);
      // faces out of the back of the hand, reading upright toward the fingers
      mesh.rotation.set(0, Math.PI, 0);
      mesh.userData.noCollide = true;
      mesh.userData.noShade = true;
      this.rig!.root.add(mesh);
      this.marks.push({ mesh, id, heat: 0 });
    });
  }

  /** Head for a pose, arriving in about `ease` seconds. */
  aim(pose: ArmPose, ease: number) {
    poseToArray(pose, this.mirror, this.target);
    this.ease = ease;
  }

  /** Follow a list of beats, starting now, from wherever the arm is. */
  begin(beats: ArmBeat[]) {
    this.track = { beats, t: 0, next: 0 };
    this.fidget = -1;
  }

  /** Be exactly at the target, at rest. */
  snap() {
    this.pos.snap(this.tPos);
    this.aimed.snap(this.tAim);
    this.fingers.snap(this.tFingers);
    this.forearm.reset();
    this.track = null;
    this.fidget = -1;
  }

  /** Thrown off for a moment: a blow, a hard landing. */
  jolt(x: number, y: number, z: number, clench: number) {
    this.pos.kick([x * this.sign, y, z]);
    const k = new Float32Array(16);
    for (let f = 0; f < 4; f++) { k[4 + f * 3] = clench * FINGER_WEIGHT[f]; k[5 + f * 3] = clench * 0.8; k[6 + f * 3] = clench < 0 ? 4 : 0; }
    this.fingers.kick(k);
  }

  private follow(dt: number) {
    const tr = this.track;
    if (!tr) return;
    while (tr.next < tr.beats.length && tr.t >= tr.beats[tr.next].t) {
      const b = tr.beats[tr.next++];
      this.aim(b.pose, b.ease);
    }
    tr.t += dt;
    const last = tr.beats[tr.beats.length - 1];
    if (tr.next >= tr.beats.length && tr.t > last.t + last.ease + GESTURE_TAIL) {
      this.track = null;
      // a hand that is not holding a word drifts back to rest
      if (!this.held) this.aim(IDLE, 0.26);
    }
  }

  update(dt: number, clock: number, offset: THREE.Vector3, live: boolean) {
    if (live) this.follow(dt);
    this.pos.stepDamped(this.tPos, this.ease, 0.7, dt, WRIST_LAG);
    this.aimed.stepDamped(this.tAim, this.ease * 1.12 + 0.01, 0.86, dt);
    this.fingers.stepDamped(this.tFingers, this.ease * 1.2 + 0.015, 0.72, dt, FINGER_LAG);
    const p = this.pos.value, a = this.aimed.value, seed = this.mirror ? 3.1 : 0;
    const busy = this.held !== null || this.track !== null;

    // how fast the wrist is going, for everything that trails behind it
    _v.set(this.pos.velocity[0], this.pos.velocity[1], this.pos.velocity[2]);
    const speed = _v.length();
    if (speed > 5) _v.multiplyScalar(5 / speed);

    // hand frame from the two directions: fingers along +Y, palm along +Z.
    // The fingers point a little behind where the wrist is going.
    _y.set(a[0], a[1], a[2]);
    _z.set(a[3], a[4], a[5]);
    if (live) {
      _y.addScaledVector(_v, -0.034);
      _z.addScaledVector(_v, -0.012);
      if (this.held === 'wind') {
        // the raised fingers stir the air
        _y.x += Math.cos(clock * 4.2 + seed) * 0.045;
        _y.z += Math.sin(clock * 4.2 + seed) * 0.045;
      }
      const calm = busy ? 0.35 : 1;
      _y.x += wander(clock * 0.37, seed + 1) * 0.02 * calm;
      _y.z += wander(clock * 0.29, seed + 2) * 0.02 * calm;
      _z.y += wander(clock * 0.33, seed + 4) * 0.03 * calm + Math.sin(clock * 1.45) * 0.012;
    }
    _y.normalize();
    _z.addScaledVector(_y, -_z.dot(_y)).normalize();
    _x.crossVectors(_y, _z);
    this.holder.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    this.holder.position.set(p[0] - this.sign * 0.035 * this.together, p[1] + 0.012 * this.together, p[2]).add(offset);
    if (live) {
      const calm = busy ? 0.4 : 1;
      this.holder.position.x += wander(clock * 0.31, seed) * 0.0035 * calm;
      this.holder.position.y += wander(clock * 0.27, seed + 3) * 0.003 * calm + Math.sin(clock * 1.45) * 0.0035;
      this.holder.position.z += wander(clock * 0.23, seed + 5) * 0.003 * calm;
      if (this.held === 'push') this.holder.position.z += Math.sin(clock * 5.5) * 0.003;
    }
    const s = this.state;
    s.palm.copy(_z);
    s.fingers.copy(_y);
    s.palmAt.copy(PALM_AT).applyQuaternion(this.holder.quaternion).add(this.holder.position);
    s.fistAt.copy(FIST_AT).applyQuaternion(this.holder.quaternion).add(this.holder.position);
    this.glyphAt.copy(GLYPH_AT).applyQuaternion(this.holder.quaternion).add(this.holder.position);

    // the forearm follows from an elbow that gives a little
    _e.set(ELBOW.x * this.sign, ELBOW.y, ELBOW.z).addScaledVector(offset, 0.35);
    this.forearm.update(this.holder.position, this.holder.quaternion, _e);

    // fingers: the sprung shape, what the motion does to it, and a little life
    if (this.rig) {
      _shape.set(this.fingers.value);
      if (live) {
        // moving palm-first the air holds the fingers back; moving away they curl after it
        const drag = THREE.MathUtils.clamp(-_v.dot(_z) * 0.09, -0.12, 0.3);
        for (let f = 0; f < 4; f++) {
          _shape[4 + f * 3] += drag * FINGER_WEIGHT[f];
          _shape[5 + f * 3] += drag * 0.6 * FINGER_WEIGHT[f];
        }
        if (this.held === 'fire') {
          // fingers lick like the flame they hold
          for (let f = 0; f < 4; f++) _shape[5 + f * 3] += wander(clock * 7 + f * 1.3, seed + f) * 0.06;
          _shape[2] += wander(clock * 5, seed + 9) * 0.05;
        } else if (this.held === 'stone') {
          // a slow squeeze, and the tremor of holding something heavy
          const squeeze = Math.sin(clock * 2.1 + seed) * 0.03;
          for (let f = 0; f < 4; f++) _shape[4 + f * 3] += squeeze + Math.sin(clock * 31 + f) * 0.008;
        } else if (this.held === 'wind') {
          _shape[4] += Math.sin(clock * 3 + seed) * 0.05;
          _shape[7] += Math.sin(clock * 3 + 0.6 + seed) * 0.05;
        } else if (this.held === 'push') {
          for (let f = 0; f < 4; f++) _shape[6 + f * 3] += 0.25 + Math.sin(clock * 5.5) * 0.08;
        } else {
          for (let f = 0; f < 4; f++) {
            _shape[4 + f * 3] += wander(clock * 0.6, seed + f * 2) * 0.04;
            _shape[5 + f * 3] += wander(clock * 0.5, seed + f * 2 + 1) * 0.05;
          }
          _shape[0] += wander(clock * 0.45, seed + 11) * 0.05;
        }
        // hands with nothing to do: now and then the fingers roll closed and open again
        if (!busy) {
          this.restless -= dt;
          if (this.restless <= 0 && this.fidget < 0) { this.fidget = 0; this.restless = 7 + Math.random() * 8; }
        }
        if (this.fidget >= 0) {
          this.fidget += dt;
          for (let f = 0; f < 4; f++) {
            const t = THREE.MathUtils.clamp((this.fidget - (3 - f) * 0.07) / 0.85, 0, 1);
            const bump = Math.sin(Math.PI * t) ** 2;
            _shape[4 + f * 3] += bump * 0.55;
            _shape[5 + f * 3] += bump * 0.75;
          }
          const t = THREE.MathUtils.clamp(this.fidget / 1.05, 0, 1);
          _shape[0] += Math.sin(Math.PI * t) ** 2 * 0.35;
          _shape[2] += Math.sin(Math.PI * t) ** 2 * 0.25;
          if (this.fidget > 1.1) this.fidget = -1;
        }
      }
      this.rig.setShape(_shape);
    }

    for (const m of this.marks) {
      const want = this.held === m.id ? 1 : 0;
      m.heat += (want - m.heat) * Math.min(1, dt * (want ? 14 : 3));
      const pulse = this.held === m.id ? 0.85 + Math.sin(clock * 7) * 0.15 : 1;
      (m.mesh.material as THREE.MeshBasicMaterial).color.set(SIGILS[m.id].color).multiplyScalar((MARK_DIM + (MARK_LIT - MARK_DIM) * m.heat) * pulse);
    }

    // the word's light: on the skin, through the fingers, and from the hand's own lamp
    if (this.held) this.last = this.held;
    const want = this.held ? 1 : 0;
    this.amount += (want - this.amount) * Math.min(1, dt * (want ? 7 : 9));
    this.flash = Math.max(0, this.flash - dt * 5);
    this.together += ((this.held ? this.togetherWant : 0) - this.together) * Math.min(1, dt * 7);
    s.id = this.last;
    s.amount = this.amount;
    const glow = this.last ? GLOW[this.last] : undefined;
    const flicker = this.last === 'fire' ? 0.82 + wander(clock * 17, seed) * 0.12 + wander(clock * 31, seed + 2) * 0.06 : 0.92 + Math.sin(clock * 4 + seed) * 0.08;
    const lit = this.amount * flicker + this.flash * 1.6;
    if (this.last) this.light.color.set(SIGILS[this.last].color);
    this.light.intensity = (glow?.hand ?? 0.03) * lit * VIEW_SCALE * VIEW_SCALE;
    this.light.position.copy(s.palmAt).addScaledVector(_z, 0.03);
    if (this.handSkin) {
      this.handSkin.skin.uGlowPos.value.copy(this.light.position).multiplyScalar(VIEW_SCALE);
      _col.set(this.last ? SIGILS[this.last].color : 0);
      this.handSkin.skin.uGlowColor.value.copy(_col).multiplyScalar((glow?.skin ?? 0.2) * lit);
    }
  }

  /** Whether the other hand is holding a word too. Set by the view. */
  togetherWant = 0;

  /** How much light this hand's word throws on the world, and in what colour. */
  worldLight(into: THREE.Color): number {
    if (!this.last) return 0;
    const power = (GLOW[this.last]?.world ?? 0.3) * (this.amount + this.flash * 2);
    into.set(SIGILS[this.last].color);
    return power;
  }
}

export class View {
  readonly camera: THREE.PerspectiveCamera;
  readonly baseFov = 72;
  private rig = new THREE.Group();
  private left: Arm;
  private right: Arm;
  private magic = new HandMagic();
  /** The light a held word throws on the ground and walls around you. */
  private spellLight = new THREE.PointLight(0xffffff, 0, 15, 1.7);
  private glyphs: Glyph[] = [];
  /** Head-turn lag, in camera space. */
  private sway = new Spring(2);
  private recoil = new Spring(1);
  /** Sideways and forward speed, smoothed: the hands lean against the way you move. */
  private lean = new Spring(2);
  private tuck = 0;
  private offset = new THREE.Vector3();
  private armOffset = new THREE.Vector3();
  private lastYaw = 0;
  private lastPitch = 0;
  private bobT = 0;
  private dip = 0;
  private dipV = 0;
  private shake = 0;
  private clock = 0;
  /** Tests set this to hold whatever pose they have put the hands in. */
  frozen = false;
  /** How far ahead the nearest wall is, so the spell light can stay this side of it. */
  reach = 99;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.03, 1500);
    this.camera.rotation.order = 'YXZ';
    this.rig.scale.setScalar(VIEW_SCALE);
    this.camera.add(this.rig, this.spellLight);
    this.left = new Arm('left', this.rig);
    this.right = new Arm('right', this.rig);
    this.rig.add(this.magic.group);
  }

  /** Bring in the rigged hands. Until this resolves there are no hands on screen. */
  async loadHands(base: string): Promise<boolean> {
    const hands = await loadHands(base, SKIN_TONE);
    if (!hands) return false;
    this.left.attach(hands.left);
    this.right.attach(hands.right);
    this.setBound(this.bound);
    return true;
  }

  /** Tell the sparks how tall the picture is, in pixels. */
  setViewport(heightPx: number) {
    this.magic.setPixels(heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(this.baseFov) / 2)));
  }

  private bound: (SigilId | null)[] = [null, null, null, null];

  /** Tell the hands which sigils are bound to the arrow keys, so their marks can be drawn. */
  setBound(bound: (SigilId | null)[]) {
    this.bound = [...bound];
    this.left.setMarks(this.bound);
    this.right.setMarks(this.bound);
  }

  private arm(index: number): Arm {
    return index === 0 ? this.left : this.right;
  }

  /** A sigil forms in a hand: the first word in the left, the second in the right. */
  speak(id: SigilId, index: number) {
    const arm = this.arm(index);
    arm.held = id;
    arm.begin(forming(id));

    if (arm.glyph) arm.glyph.leaving = 0;
    const mat = new THREE.SpriteMaterial({
      map: glyphTexture(id), color: new THREE.Color(SIGILS[id].color).multiplyScalar(2.2),
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 50;
    sprite.userData.noShade = true;
    this.rig.add(sprite);
    arm.glyph = { sprite, age: 0, leaving: -1, cast: false, from: new THREE.Vector3() };
    this.glyphs.push(arm.glyph);
  }

  /**
   * The sentence is let go. Cast: the gesture for that spell begins, and this returns how
   * many seconds until its strike, when `strike` should be called and the spell made.
   * Not cast: the hands simply let the words fall.
   */
  release(cast: boolean, spell?: SpellDef): number {
    if (cast && spell) {
      const name = gestureFor(spell.effect);
      const beats = GESTURES[name];
      const both = this.right.held !== null;
      const lead: ArmBeat[] = [], other: ArmBeat[] = [];
      for (const b of beats) {
        if (b.lead) lead.push({ t: b.t, ease: b.ease, pose: b.lead });
        if (b.other) other.push({ t: b.t, ease: b.ease, pose: b.other });
      }
      this.left.begin(lead);
      if (both && other.length) this.right.begin(other);
      // a hand with no part in it braces while the other throws
      else this.right.begin([{ t: 0, ease: 0.09, pose: BRACE }, { t: STRIKE[name] + 0.14, ease: 0.26, pose: IDLE }]);
      return STRIKE[name];
    }
    for (const arm of [this.left, this.right]) {
      if (!arm.held) continue;
      arm.held = null;
      arm.glyph = null;
      arm.begin([{ t: 0, ease: 0.07, pose: LET_GO }, { t: 0.11, ease: 0.24, pose: IDLE }]);
    }
    this.dropGlyphs(false);
    return 0;
  }

  private dropGlyphs(cast: boolean) {
    for (const g of this.glyphs) {
      if (g.leaving < 0) {
        g.leaving = 0;
        g.cast = cast;
        g.from.copy(g.sprite.position);
      }
    }
  }

  /** The moment of the cast: the words leave the hands. `made` is false if the spell failed to take shape. */
  strike(spell: SpellDef | null, made = true) {
    for (const arm of [this.left, this.right]) {
      if (!arm.held) continue;
      if (made) {
        this.magic.burst(arm.state.palmAt, arm.held, _v.set(-arm.state.palmAt.x * 0.5, 0.1, -1).normalize());
        arm.flash = 1;
      }
      arm.held = null;
      arm.glyph = null;
    }
    this.dropGlyphs(made);
    if (made && spell) this.recoil.kick([0.25 + spell.cost * 0.012]);
  }

  /** Seconds since waking began, or past the end if awake. */
  private wakeT = 99;
  /** How far the eyes are open, 0 to 1. */
  eyesOpen = 1;

  /**
   * Come to on the sand: the eyes open, close, open; a hand finds the ground; you push
   * yourself up. It takes a few seconds and does not stop you moving.
   */
  wake() {
    this.wakeT = 0;
    this.eyesOpen = 0;
    for (const arm of [this.left, this.right]) {
      arm.aim(SPRAWLED, 0.05);
      arm.snap();
      arm.begin([{ t: arm.mirror ? 1.0 : 0.75, ease: 0.34, pose: PLANTED }, { t: 2.35, ease: 0.42, pose: IDLE }]);
    }
  }

  /** The ground or the air jumps: a blast nearby, a heavy cast. No flinch, only the shake. */
  rumble(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  hurt(amount: number) {
    this.shake = Math.min(1, this.shake + 0.25 + amount / 60);
    const k = Math.min(1, 0.4 + amount / 40);
    this.left.jolt(0.25 * k, 0.9 * k, 0.8 * k, 7 * k);
    this.right.jolt(0.25 * k, 0.9 * k, 0.8 * k, 7 * k);
  }

  update(dt: number, player: Player, _speaking: boolean) {
    this.clock += dt;
    const live = !this.frozen;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.onGround ? Math.min(1, speed / PLAYER.speed) : 0;
    this.bobT += dt * (6 + moving * 5) * moving;

    // landing dip: a damped spring; the fingers splay as the weight comes down
    if (player.landed > 0) {
      this.dipV -= Math.min(2.2, player.landed * 0.12);
      const hard = Math.min(1, player.landed / 12);
      this.left.jolt(0.1 * hard, -0.5 * hard, 0, -5 * hard);
      this.right.jolt(0.1 * hard, -0.5 * hard, 0, -5 * hard);
    }
    this.dipV += (-this.dip * 110 - this.dipV * 14) * dt;
    this.dip += this.dipV * dt;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.recoil.step([0], 0.12, dt);

    const bobY = Math.sin(this.bobT * 2) * 0.035 * moving;
    const bobX = Math.cos(this.bobT) * 0.02 * moving;
    this.camera.position.set(player.position.x, player.position.y + PLAYER.eye + bobY + this.dip, player.position.z);
    const sh = this.shake * this.shake * 0.035;
    this.camera.rotation.set(
      player.pitch + this.recoil.value[0] * 0.02 + (Math.random() - 0.5) * sh,
      player.yaw + (Math.random() - 0.5) * sh,
      bobX * 0.4 + (Math.random() - 0.5) * sh,
    );
    if (this.wakeT < 3.2) {
      this.wakeT += dt;
      const t = this.wakeT;
      // lying on your side, then up onto hands and knees, then standing
      const up = THREE.MathUtils.smootherstep(t, 1.3, 3.0);
      this.camera.position.y -= 1.38 * (1 - up);
      this.camera.rotation.z += 1.1 * (1 - THREE.MathUtils.smootherstep(t, 0.9, 2.5));
      this.camera.rotation.x += 0.22 * (1 - up) + Math.sin(up * Math.PI) * -0.18;
      // the eyes: a first look, a slow blink, then open
      this.eyesOpen = Math.min(1, THREE.MathUtils.smoothstep(t, 0.25, 0.9) * 0.75 - Math.exp(-(((t - 1.2) / 0.16) ** 2)) * 0.7 + THREE.MathUtils.smoothstep(t, 1.4, 2.2) * 0.25);
      this.eyesOpen = Math.max(0, this.eyesOpen);
    } else {
      this.eyesOpen = 1;
    }
    const wantFov = this.baseFov + (player.dodging ? 7 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }

    // the hands trail a turning head, and settle
    let dYaw = player.yaw - this.lastYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const dPitch = player.pitch - this.lastPitch;
    this.lastYaw = player.yaw;
    this.lastPitch = player.pitch;
    if (dt > 0) {
      const s = this.sway.value;
      s[0] = THREE.MathUtils.clamp(s[0] + dYaw * 0.06, -0.07, 0.07);
      s[1] = THREE.MathUtils.clamp(s[1] - dPitch * 0.06, -0.07, 0.07);
      this.sway.stepDamped([0, 0], 0.17, 0.62, dt);
      // and lean against the way the body is going
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      this.lean.stepDamped([player.velocity.x * cos - player.velocity.z * sin, -player.velocity.x * sin - player.velocity.z * cos], 0.2, 0.8, dt);
      this.tuck += ((player.dodging ? 1 : 0) - this.tuck) * Math.min(1, dt * (player.dodging ? 18 : 7));
    }

    this.offset.set(
      this.sway.value[0] + bobX * 0.6 - this.lean.value[0] * 0.004,
      this.sway.value[1] + Math.sin(this.clock * 1.5) * 0.003
        - THREE.MathUtils.clamp(player.velocity.y * 0.0035, -0.05, 0.05) + this.dip * 0.5 - this.tuck * 0.07 - Math.abs(this.lean.value[1]) * 0.0025,
      this.recoil.value[0] * 0.03 + this.lean.value[1] * 0.003 + this.tuck * 0.06,
    );

    const both = this.left.held !== null && this.right.held !== null ? 1 : 0;
    this.left.togetherWant = this.right.togetherWant = both;
    // the arms swing against each other with each step
    for (const arm of [this.left, this.right]) {
      const ph = this.bobT + (arm.mirror ? 0 : Math.PI);
      this.armOffset.copy(this.offset);
      this.armOffset.y += Math.sin(ph) * 0.011 * moving - Math.abs(Math.sin(this.bobT)) * 0.008 * moving;
      this.armOffset.z += Math.cos(ph) * 0.012 * moving;
      arm.update(dt, this.clock, this.armOffset, live);
    }

    // which way is up, as the hands see it, for flames to lean toward
    this.magic.up.set(0, Math.cos(player.pitch), -Math.sin(player.pitch));
    this.magic.hold(0, this.left.state, dt, this.clock);
    this.magic.hold(1, this.right.state, dt, this.clock);
    this.magic.update(dt);

    // light thrown on the world by what the hands hold
    const pl = this.left.worldLight(_col);
    const lr = _col.r, lg = _col.g, lb = _col.b;
    const pr = this.right.worldLight(_col);
    const total = pl + pr;
    if (total > 0.001) this.spellLight.color.setRGB((lr * pl + _col.r * pr) / total, (lg * pl + _col.g * pr) / total, (lb * pl + _col.b * pr) / total);
    this.spellLight.intensity = total * (0.9 + wander(this.clock * 13, 7) * 0.1);
    this.spellLight.position.set(0, -0.12, -THREE.MathUtils.clamp(this.reach - 0.3, 0.12, 0.85));

    // sigils floating over the hands that hold them
    for (let i = this.glyphs.length - 1; i >= 0; i--) {
      const g = this.glyphs[i];
      g.age += dt;
      const m = g.sprite.material;
      if (g.leaving >= 0) {
        g.leaving += dt;
        const t = g.leaving / (g.cast ? 0.2 : 0.3);
        if (t >= 1) {
          this.rig.remove(g.sprite);
          m.dispose();
          this.glyphs.splice(i, 1);
          continue;
        }
        if (g.cast) {
          g.sprite.position.copy(g.from).add(_v.set(-g.from.x * 0.7 * t, 0.05 * t, -0.9 * t));
          g.sprite.scale.setScalar(0.085 * (1 + t * 2.6));
        } else {
          g.sprite.position.copy(g.from).add(_v.set(0, -0.1 * t, 0));
          g.sprite.scale.setScalar(0.085 * (1 - t * 0.5));
        }
        m.opacity = 1 - t;
      } else {
        const arm = this.left.glyph === g ? this.left : this.right;
        const pop = Math.min(1, g.age / 0.16);
        const ease = 1 - (1 - pop) * (1 - pop);
        g.sprite.position.copy(arm.glyphAt).add(_v.set(0, Math.sin(this.clock * 3 + i * 1.7) * 0.004, 0));
        g.sprite.scale.setScalar(0.085 * (0.3 + 0.7 * ease) * (1 + (1 - ease) * 0.5));
        m.opacity = ease;
      }
    }
  }

  /** Put the arms straight into given poses (for the pose sheet and tests). */
  debugPose(left: ArmPose | null, right: ArmPose | null, leftHeld: SigilId | null = null, rightHeld: SigilId | null = null) {
    this.frozen = true;
    const set = (arm: Arm, pose: ArmPose | null, held: SigilId | null) => {
      arm.aim(pose ?? IDLE, 0.05);
      arm.snap();
      arm.held = held;
    };
    set(this.left, left, leftHeld);
    set(this.right, right, rightHeld);
  }
}
