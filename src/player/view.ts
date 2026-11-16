// What the ship hand sees: the camera, and their own two hands shaping the words.
// The first word of a sentence forms in the left hand, the second in the right. Casting
// plays a gesture that fits the spell. Springs carry the arms between poses, and a few
// small layered motions (breath, footfall, the lag of a turning head) keep them alive.
import * as THREE from 'three';
import { SIGILS, type SigilId } from '../magic/sigils';
import type { SpellDef } from '../magic/grammar';
import { PLAYER, type Player } from './player';
import { ARM_SIZE, HandRig, Spring, buildForearm, loadHands, poseToArray, type ArmPose, type Beat } from './hands';
import { GESTURES, GESTURE_TAIL, HOLD, IDLE, gestureFor } from './poses';

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

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _shape = new Float32Array(16);

interface Glyph { sprite: THREE.Sprite; age: number; leaving: number; cast: boolean; from: THREE.Vector3 }

/** A sigil marked on the back of the hand. It smoulders while known and flares when spoken. */
interface Mark { mesh: THREE.Mesh; id: SigilId; heat: number }

const markGeo = new THREE.PlaneGeometry(0.019, 0.019);
const MARK_DIM = 0.3;
const MARK_LIT = 3.2;

class Arm {
  readonly holder = new THREE.Group();
  readonly forearm = buildForearm();
  readonly light = new THREE.PointLight(0xffffff, 0, 1.1, 2);
  readonly spring = new Spring(ARM_SIZE);
  readonly target = new Float32Array(ARM_SIZE);
  readonly mirror: boolean;
  rig: HandRig | null = null;
  ease = 0.2;
  held: SigilId | null = null;
  heldAge = 0;
  glyph: Glyph | null = null;
  marks: Mark[] = [];
  /** Where the held sigil floats, in camera space. */
  readonly glyphAt = new THREE.Vector3();

  constructor(readonly side: 'left' | 'right', parent: THREE.Object3D) {
    this.mirror = side === 'left';
    parent.add(this.holder, this.forearm, this.light);
    this.holder.visible = false;
    this.forearm.visible = false;
    poseToArray(IDLE, this.mirror, this.target);
    this.spring.snap(this.target);
  }

  attach(rig: HandRig) {
    this.rig = rig;
    this.holder.add(rig.root);
    this.holder.visible = true;
    this.forearm.visible = true;
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
      this.rig!.root.add(mesh);
      this.marks.push({ mesh, id, heat: 0 });
    });
  }

  aim(pose: ArmPose, ease: number) {
    poseToArray(pose, this.mirror, this.target);
    this.ease = ease;
  }

  update(dt: number, clock: number, offset: THREE.Vector3) {
    this.spring.step(this.target, this.ease, dt);
    const v = this.spring.value;

    // hand frame from the two directions: fingers along +Y, palm along +Z
    _y.set(v[3], v[4], v[5]).normalize();
    _z.set(v[6], v[7], v[8]);
    _z.addScaledVector(_y, -_z.dot(_y)).normalize();
    _x.crossVectors(_y, _z);
    this.holder.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    this.holder.position.set(v[0], v[1], v[2]).add(offset);
    this.glyphAt.copy(GLYPH_AT).applyQuaternion(this.holder.quaternion).add(this.holder.position);

    // forearm reaches back from the wrist to an elbow that stays put, twisting with the palm
    _y.set(ELBOW.x * (this.mirror ? -1 : 1), ELBOW.y, ELBOW.z).sub(this.holder.position).negate().normalize();
    _z.addScaledVector(_y, -_z.dot(_y)).normalize();
    _x.crossVectors(_y, _z);
    this.forearm.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    this.forearm.position.copy(this.holder.position);

    // fingers: the sprung shape, plus a little life
    if (this.rig) {
      _shape.set(v.subarray(9, 25));
      const phase = this.mirror ? 1.7 : 0;
      if (this.held === 'fire') {
        // fingers lick like the flame they hold
        for (let f = 0; f < 4; f++) _shape[5 + f * 3] += Math.sin(clock * 9 + f * 1.3 + phase) * 0.05;
      } else if (this.held === 'wind') {
        _shape[4] += Math.sin(clock * 3 + phase) * 0.04;
        _shape[7] += Math.sin(clock * 3 + 0.6 + phase) * 0.04;
      } else if (this.held === 'stone') {
        for (let f = 0; f < 4; f++) _shape[4 + f * 3] += Math.sin(clock * 31 + f) * 0.008;
      } else if (!this.held) {
        for (let f = 0; f < 4; f++) _shape[5 + f * 3] += Math.sin(clock * 0.9 + f * 0.8 + phase) * 0.025;
      }
      this.rig.setShape(_shape);
    }
    for (const m of this.marks) {
      const want = this.held === m.id ? 1 : 0;
      m.heat += (want - m.heat) * Math.min(1, dt * (want ? 14 : 3));
      const pulse = this.held === m.id ? 0.85 + Math.sin(clock * 7) * 0.15 : 1;
      (m.mesh.material as THREE.MeshBasicMaterial).color.set(SIGILS[m.id].color).multiplyScalar((MARK_DIM + (MARK_LIT - MARK_DIM) * m.heat) * pulse);
    }
    this.heldAge += dt;
    const want = this.held ? 0.06 : 0;
    this.light.intensity += (want - this.light.intensity) * Math.min(1, dt * 10);
    this.light.position.copy(this.glyphAt);
  }
}

export class View {
  readonly camera: THREE.PerspectiveCamera;
  readonly baseFov = 72;
  private rig = new THREE.Group();
  private left: Arm;
  private right: Arm;
  private glyphs: Glyph[] = [];
  private gesture: { beats: Beat[]; t: number; next: number; both: boolean } | null = null;
  /** Head-turn lag, in camera space. */
  private sway = new Spring(2);
  private recoil = new Spring(1);
  private offset = new THREE.Vector3();
  private lastYaw = 0;
  private lastPitch = 0;
  private bobT = 0;
  private dip = 0;
  private dipV = 0;
  private shake = 0;
  private clock = 0;
  /** Tests set this to hold whatever pose they have put the hands in. */
  frozen = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.05, 1500);
    this.camera.rotation.order = 'YXZ';
    this.camera.add(this.rig);
    this.left = new Arm('left', this.rig);
    this.right = new Arm('right', this.rig);
  }

  /** Bring in the rigged hands. Until this resolves there are no hands on screen. */
  async loadHands(base: string): Promise<boolean> {
    const hands = await loadHands(base);
    if (!hands) return false;
    this.left.attach(hands.left);
    this.right.attach(hands.right);
    this.setBound(this.bound);
    return true;
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
    this.gesture = null;
    arm.held = id;
    arm.heldAge = 0;
    arm.aim(HOLD[id], 0.085);
    arm.light.color.set(SIGILS[id].color);
    // a small flick as the word arrives
    const k = new Float32Array(ARM_SIZE);
    k[1] = 0.5;
    k[2] = -0.35;
    arm.spring.kick(k);

    if (arm.glyph) arm.glyph.leaving = 0;
    const mat = new THREE.SpriteMaterial({
      map: glyphTexture(id), color: new THREE.Color(SIGILS[id].color).multiplyScalar(2.2),
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 50;
    this.rig.add(sprite);
    arm.glyph = { sprite, age: 0, leaving: -1, cast: false, from: new THREE.Vector3() };
    this.glyphs.push(arm.glyph);
  }

  /**
   * The sentence leaves the hands. Cast: the gesture for that spell plays. Not cast: the
   * hands simply let it go.
   */
  release(cast: boolean, spell?: SpellDef) {
    for (const g of this.glyphs) {
      if (g.leaving < 0) {
        g.leaving = 0;
        g.cast = cast;
        g.from.copy(g.sprite.position);
      }
    }
    const both = this.right.held !== null;
    this.left.held = this.right.held = null;
    this.left.glyph = this.right.glyph = null;
    if (cast && spell) {
      this.gesture = { beats: GESTURES[gestureFor(spell.effect)], t: 0, next: 0, both };
      const r = new Float32Array(1);
      r[0] = 0.25 + spell.cost * 0.012;
      this.recoil.kick(r);
    } else {
      this.gesture = null;
      this.left.aim(IDLE, 0.2);
      this.right.aim(IDLE, 0.2);
    }
  }

  hurt(amount: number) {
    this.shake = Math.min(1, this.shake + 0.25 + amount / 60);
  }

  private runGesture(dt: number) {
    const g = this.gesture;
    if (!g) return;
    while (g.next < g.beats.length && g.t >= g.beats[g.next].t) {
      const b = g.beats[g.next++];
      if (b.lead) this.left.aim(b.lead, b.ease);
      if (b.other && g.both) this.right.aim(b.other, b.ease);
    }
    g.t += dt;
    const last = g.beats[g.beats.length - 1];
    if (g.next >= g.beats.length && g.t > last.t + last.ease + GESTURE_TAIL) {
      this.gesture = null;
      this.left.aim(IDLE, 0.2);
      this.right.aim(IDLE, 0.2);
    }
  }

  update(dt: number, player: Player, _speaking: boolean) {
    this.clock += dt;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.onGround ? Math.min(1, speed / PLAYER.speed) : 0;
    this.bobT += dt * (6 + moving * 5) * moving;

    // landing dip: a damped spring
    if (player.landed > 0) this.dipV -= Math.min(2.2, player.landed * 0.12);
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
      this.sway.step([0, 0], 0.16, dt);
    }

    this.offset.set(
      this.sway.value[0] + bobX * 0.6,
      this.sway.value[1] - Math.abs(Math.sin(this.bobT)) * 0.012 * moving + Math.sin(this.clock * 1.5) * 0.003
        - THREE.MathUtils.clamp(player.velocity.y * 0.0035, -0.05, 0.05) + this.dip * 0.5,
      this.recoil.value[0] * 0.03,
    );

    if (!this.frozen) this.runGesture(dt);
    this.left.update(dt, this.clock, this.offset);
    this.right.update(dt, this.clock, this.offset);

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
    this.gesture = null;
    const set = (arm: Arm, pose: ArmPose | null, held: SigilId | null) => {
      arm.aim(pose ?? IDLE, 0.05);
      arm.spring.snap(arm.target);
      arm.held = held;
    };
    set(this.left, left, leftHeld);
    set(this.right, right, rightHeld);
  }
}
