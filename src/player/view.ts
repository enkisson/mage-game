// What the ship hand sees: the camera, and their own two hands shaping the words.
import * as THREE from 'three';
import { SIGILS, type SigilId } from '../magic/sigils';
import { MATERIALS } from '../art/materials';
import { PLAYER, type Player } from './player';

interface ArmPose {
  wrist: THREE.Vector3;
  /** Direction the fingers point. */
  axis: THREE.Vector3;
  /** Direction the palm faces. */
  palm: THREE.Vector3;
}

// Poses for the right arm, in camera space (x right, y up, -z forward). The left arm mirrors x.
const POSES: Record<'rest' | 'speak' | 'cast', ArmPose> = {
  rest: { wrist: new THREE.Vector3(0.3, -0.42, -0.42), axis: new THREE.Vector3(-0.12, 0.5, -0.85), palm: new THREE.Vector3(-1, 0.1, 0) },
  speak: { wrist: new THREE.Vector3(0.25, -0.24, -0.54), axis: new THREE.Vector3(-0.25, 0.82, -0.5), palm: new THREE.Vector3(-0.85, 0, -0.5) },
  cast: { wrist: new THREE.Vector3(0.15, -0.2, -0.66), axis: new THREE.Vector3(-0.1, 0.86, -0.48), palm: new THREE.Vector3(0, -0.45, -0.9) },
};

function buildArm(side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const skin = MATERIALS.skin;
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.26, 4, 10), skin);
  forearm.position.y = -0.17;
  forearm.scale.set(1.1, 1, 0.9);
  g.add(forearm);
  // rolled linen sleeve, running off the bottom of the screen
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.085, 0.5, 12, 1, true), MATERIALS.linen);
  sleeve.position.y = -0.52;
  g.add(sleeve);
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.018, 6, 14), MATERIALS.linen);
  roll.rotation.x = Math.PI / 2;
  roll.position.y = -0.28;
  g.add(roll);
  // a twist of tarred cord at the wrist
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.007, 5, 12), MATERIALS.leather);
  cord.rotation.x = Math.PI / 2;
  cord.position.y = -0.03;
  g.add(cord);

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
  palm.position.set(0, 0.045, 0);
  palm.scale.set(1, 1.15, 0.42);
  g.add(palm);
  const lengths = [0.04, 0.046, 0.043, 0.034];
  for (let i = 0; i < 4; i++) {
    const x = side * (0.03 - i * 0.02);
    const curl = 0.28 + i * 0.05;
    const base = new THREE.Group();
    base.position.set(x, 0.088, 0.004);
    base.rotation.set(curl, 0, side * (i - 1.5) * -0.07);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.0092, lengths[i], 3, 6), skin);
    a.position.y = lengths[i] / 2;
    base.add(a);
    const tip = new THREE.Group();
    tip.position.y = lengths[i] + 0.004;
    tip.rotation.x = curl * 1.5;
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0082, lengths[i] * 0.85, 3, 6), skin);
    b.position.y = lengths[i] * 0.42;
    tip.add(b);
    base.add(tip);
    g.add(base);
  }
  const thumb = new THREE.Group();
  thumb.position.set(side * 0.04, 0.03, 0.012);
  thumb.rotation.set(0.5, 0, side * -0.9);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 6), skin);
  t1.position.y = 0.025;
  thumb.add(t1);
  g.add(thumb);
  g.traverse((o) => { o.userData.noCollide = true; });
  return g;
}

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

interface Glyph { sprite: THREE.Sprite; age: number; leaving: number; cast: boolean; home: THREE.Vector3 }

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _pose: ArmPose = { wrist: new THREE.Vector3(), axis: new THREE.Vector3(), palm: new THREE.Vector3() };

export class View {
  readonly camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group();
  private arms: THREE.Group[] = [];
  private glyphs: Glyph[] = [];
  private glow = new THREE.PointLight(0xffffff, 0, 1.6, 2);
  private speakAmount = 0;
  private castKick = 0;
  private bobT = 0;
  private dip = 0;
  private dipV = 0;
  private shake = 0;
  private clock = 0;
  readonly baseFov = 72;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.05, 1500);
    this.camera.rotation.order = 'YXZ';
    this.camera.add(this.rig);
    for (const side of [1, -1] as const) {
      const arm = buildArm(side);
      this.rig.add(arm);
      this.arms.push(arm);
    }
    this.glow.position.set(0, -0.08, -0.6);
    this.rig.add(this.glow);
  }

  /** A sigil appears between the hands. */
  speak(id: SigilId, index: number) {
    const mat = new THREE.SpriteMaterial({
      map: glyphTexture(id), color: new THREE.Color(SIGILS[id].color).multiplyScalar(2.2),
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 50;
    this.rig.add(sprite);
    this.glyphs.push({ sprite, age: 0, leaving: -1, cast: false, home: new THREE.Vector3() });
    this.layoutGlyphs();
    this.glow.color.set(SIGILS[id].color);
    void index;
  }

  private layoutGlyphs() {
    const live = this.glyphs.filter((g) => g.leaving < 0);
    live.forEach((g, i) => g.home.set((i - (live.length - 1) / 2) * 0.125, -0.07, -0.62));
  }

  /** The sentence leaves the hands: thrown forward if cast, let fall if not. */
  release(cast: boolean) {
    for (const g of this.glyphs) {
      if (g.leaving < 0) {
        g.leaving = 0;
        g.cast = cast;
      }
    }
    if (cast) this.castKick = 1;
  }

  hurt(amount: number) {
    this.shake = Math.min(1, this.shake + 0.25 + amount / 60);
  }

  private poseArm(arm: THREE.Group, side: 1 | -1, speak: number, cast: number, sway: THREE.Vector3) {
    const a = POSES.rest, b = POSES.speak, c = POSES.cast;
    _pose.wrist.copy(a.wrist).lerp(b.wrist, speak).lerp(c.wrist, cast);
    _pose.axis.copy(a.axis).lerp(b.axis, speak).lerp(c.axis, cast);
    _pose.palm.copy(a.palm).lerp(b.palm, speak).lerp(c.palm, cast);
    _pose.wrist.x *= side;
    _pose.axis.x *= side;
    _pose.palm.x *= side;
    _y.copy(_pose.axis).normalize();
    _z.copy(_pose.palm).addScaledVector(_y, -_pose.palm.dot(_y)).normalize();
    _x.crossVectors(_y, _z);
    arm.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    arm.position.copy(_pose.wrist).add(sway);
  }

  update(dt: number, player: Player, speaking: boolean) {
    this.clock += dt;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.onGround ? Math.min(1, speed / PLAYER.speed) : 0;
    this.bobT += dt * (6 + moving * 5) * moving;

    // landing dip: a damped spring
    if (player.landed > 0) this.dipV -= Math.min(2.2, player.landed * 0.12);
    this.dipV += (-this.dip * 110 - this.dipV * 14) * dt;
    this.dip += this.dipV * dt;
    this.shake = Math.max(0, this.shake - dt * 2.4);

    const bobY = Math.sin(this.bobT * 2) * 0.035 * moving;
    const bobX = Math.cos(this.bobT) * 0.02 * moving;
    this.camera.position.set(player.position.x, player.position.y + PLAYER.eye + bobY + this.dip, player.position.z);
    const sh = this.shake * this.shake * 0.035;
    this.camera.rotation.set(player.pitch + (Math.random() - 0.5) * sh, player.yaw + (Math.random() - 0.5) * sh, bobX * 0.4 + (Math.random() - 0.5) * sh);
    const wantFov = this.baseFov + (player.dodging ? 7 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }

    // hands
    this.speakAmount += ((speaking ? 1 : 0) - this.speakAmount) * Math.min(1, dt * 12);
    this.castKick = Math.max(0, this.castKick - dt * 3.2);
    const cast = Math.sin(Math.min(1, this.castKick) * Math.PI) * 0.9 + (this.castKick > 0.5 ? 0.1 : 0);
    const sway = _x.set(bobX * 0.4, -Math.abs(bobY) * 0.5 + Math.sin(this.clock * 1.3) * 0.004 - player.velocity.y * 0.004, 0).clone();
    sway.y = THREE.MathUtils.clamp(sway.y, -0.08, 0.08);
    this.poseArm(this.arms[0], 1, Math.max(this.speakAmount, cast * 0.6), cast, sway);
    this.poseArm(this.arms[1], -1, Math.max(this.speakAmount, cast * 0.6), cast, sway);

    // glyphs
    let lit = 0;
    for (let i = this.glyphs.length - 1; i >= 0; i--) {
      const g = this.glyphs[i];
      g.age += dt;
      const m = g.sprite.material;
      if (g.leaving >= 0) {
        g.leaving += dt;
        const t = g.leaving / (g.cast ? 0.22 : 0.35);
        if (t >= 1) {
          this.rig.remove(g.sprite);
          m.dispose();
          this.glyphs.splice(i, 1);
          continue;
        }
        if (g.cast) {
          g.sprite.position.copy(g.home).add(_y.set(0, 0.06 * t, -0.9 * t));
          g.sprite.scale.setScalar(0.1 * (1 + t * 2.5));
        } else {
          g.sprite.position.copy(g.home).add(_y.set(0, -0.12 * t, 0));
          g.sprite.scale.setScalar(0.1 * (1 - t * 0.5));
        }
        m.opacity = 1 - t;
      } else {
        const pop = Math.min(1, g.age / 0.14);
        g.sprite.position.copy(g.home).add(_y.set(0, Math.sin(this.clock * 3 + i * 1.7) * 0.006, 0)).add(sway);
        g.sprite.scale.setScalar(0.1 * (0.4 + 0.6 * pop) * (1 + (1 - pop) * 0.6));
        m.opacity = pop;
        lit++;
      }
    }
    this.glow.intensity += ((lit ? 0.05 + lit * 0.035 : 0) - this.glow.intensity) * Math.min(1, dt * 10);
  }
}
