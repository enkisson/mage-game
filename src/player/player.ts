// The ship hand: a capsule that walks, jumps, dodges and falls through real 3D geometry.
import * as THREE from 'three';
import type { World } from '../world/world';
import type { Input } from '../core/input';

export const PLAYER = {
  radius: 0.36,
  height: 1.76,
  eye: 1.62,
  gravity: 24,
  speed: 6.0,
  groundAccel: 60,
  airAccel: 16,
  friction: 48,
  jump: 7.6,
  coyote: 0.12,
  dodgeSpeed: 15,
  dodgeTime: 0.2,
  dodgeInvulnerable: 0.32,
  dodgeCooldown: 1.0,
  /** Landing faster than this hurts. 15 m/s is about a 4.7 m drop. */
  safeFallSpeed: 15,
  fallDamagePerSpeed: 6,
  maxHealth: 100,
  maxFocus: 100,
  focusRegen: 18,
  focusDelay: 1.0,
  substeps: 3,
  /** The highest edge you walk up without jumping: a kerb, a step, the top of a broken column. */
  stepUp: 0.45,
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _n = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();

export class Player {
  /** Feet. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  health = PLAYER.maxHealth;
  focus = PLAYER.maxFocus;
  alive = true;

  /** Last dry, solid place we stood, for when the sea takes us. */
  readonly lastSafe = new THREE.Vector3();

  private airTime = 0;
  private dodgeLeft = 0;
  private dodgeCooldown = 0;
  private invulnerable = 0;
  private sinceCast = 99;
  private safeTimer = 0;
  private readonly dodgeDir = new THREE.Vector3();

  /** Seconds since last hurt, for the HUD flash. */
  sinceHurt = 99;
  /** Speed of the most recent landing, consumed by the camera for a dip. */
  landed = 0;
  onHurt: (amount: number) => void = () => {};
  onDeath: () => void = () => {};

  get eye(): THREE.Vector3 {
    return _a.set(this.position.x, this.position.y + PLAYER.eye, this.position.z).clone();
  }

  /** Unit vector the player is looking along. */
  get aim(): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  get dodging() {
    return this.dodgeLeft > 0;
  }

  get dodgeReady() {
    return this.dodgeCooldown <= 0;
  }

  spawn(at: THREE.Vector3, yaw = 0) {
    this.position.copy(at);
    this.lastSafe.copy(at);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = PLAYER.maxHealth;
    this.focus = PLAYER.maxFocus;
    this.alive = true;
    this.invulnerable = 1.5;
    this.dodgeLeft = 0;
    this.dodgeCooldown = 0;
  }

  look(dx: number, dy: number, sensitivity: number) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  spendFocus(amount: number): boolean {
    if (this.focus < amount) return false;
    this.focus -= amount;
    this.sinceCast = 0;
    return true;
  }

  /** What finished us, for the death screen. */
  cause = '';

  damage(amount: number, cause = 'The Gloam dragged you down.') {
    if (!this.alive || this.invulnerable > 0 || amount <= 0) return;
    this.health -= amount;
    this.cause = cause;
    this.sinceHurt = 0;
    this.onHurt(amount);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.onDeath();
    }
  }

  heal(amount: number) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  /** Shove from a spell or a creature. */
  impulse(v: THREE.Vector3) {
    this.velocity.add(v);
    if (v.y > 0.5) {
      this.onGround = false;
      this.airTime = PLAYER.coyote;
    }
  }

  /** Carried by an updraft: the air sets you down gently, so the next landing does no harm. */
  private borne = false;

  /** Thrown upward by an updraft. */
  launch(vy: number) {
    this.velocity.y = Math.max(this.velocity.y, vy);
    this.onGround = false;
    this.airTime = PLAYER.coyote;
    this.borne = true;
  }

  update(dt: number, input: Input, world: World, canMove: boolean) {
    this.sinceHurt += dt;
    this.sinceCast += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    if (this.sinceCast > PLAYER.focusDelay) this.focus = Math.min(PLAYER.maxFocus, this.focus + PLAYER.focusRegen * dt);
    if (!this.alive) canMove = false;

    // wish direction on the ground plane
    let f = 0, s = 0;
    if (canMove) {
      if (input.isDown('KeyW')) f += 1;
      if (input.isDown('KeyS')) f -= 1;
      if (input.isDown('KeyD')) s += 1;
      if (input.isDown('KeyA')) s -= 1;
    }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    _wish.set(-sin * f + cos * s, 0, -cos * f - sin * s);
    const wishLen = _wish.length();
    if (wishLen > 1e-3) _wish.multiplyScalar(1 / wishLen);

    if (canMove && input.isDown('ShiftLeft') && this.dodgeCooldown <= 0 && this.dodgeLeft <= 0) {
      this.dodgeDir.copy(wishLen > 1e-3 ? _wish : _wish.set(-sin, 0, -cos));
      this.dodgeLeft = PLAYER.dodgeTime;
      this.dodgeCooldown = PLAYER.dodgeCooldown;
      this.invulnerable = Math.max(this.invulnerable, PLAYER.dodgeInvulnerable);
    }

    const wantJump = canMove && input.isDown('Space');
    const h = dt / PLAYER.substeps;
    this.landed = 0;

    for (let i = 0; i < PLAYER.substeps; i++) {
      const v = this.velocity;

      if (this.dodgeLeft > 0) {
        this.dodgeLeft -= h;
        v.x = this.dodgeDir.x * PLAYER.dodgeSpeed;
        v.z = this.dodgeDir.z * PLAYER.dodgeSpeed;
      } else if (this.onGround) {
        const tx = _wish.x * PLAYER.speed * (wishLen > 1e-3 ? 1 : 0);
        const tz = _wish.z * PLAYER.speed * (wishLen > 1e-3 ? 1 : 0);
        const rate = (wishLen > 1e-3 ? PLAYER.groundAccel : PLAYER.friction) * h;
        const dx = tx - v.x, dz = tz - v.z;
        const d = Math.hypot(dx, dz);
        if (d <= rate) { v.x = tx; v.z = tz; } else { v.x += (dx / d) * rate; v.z += (dz / d) * rate; }
      } else if (wishLen > 1e-3) {
        // in the air you can steer, but not gain speed past a run
        const along = v.x * _wish.x + v.z * _wish.z;
        const add = Math.min(PLAYER.airAccel * h, Math.max(0, PLAYER.speed - along));
        v.x += _wish.x * add;
        v.z += _wish.z * add;
      }

      if (wantJump && (this.onGround || this.airTime < PLAYER.coyote) && v.y <= 0.1) {
        v.y = PLAYER.jump;
        this.onGround = false;
        this.airTime = PLAYER.coyote;
      }

      v.y -= PLAYER.gravity * h;
      const fallSpeed = -v.y;
      _prev.copy(this.position);
      this.position.addScaledVector(v, h);

      _a.set(this.position.x, this.position.y + PLAYER.radius, this.position.z);
      _b.set(this.position.x, this.position.y + PLAYER.height - PLAYER.radius, this.position.z);
      const res = world.resolveCapsule(_a, _b, PLAYER.radius);
      this.position.set(_a.x, _a.y - PLAYER.radius, _a.z);

      // Walking into a low edge: try the same step from a little higher, and set down on top of
      // it, if there is walkable ground there and it gets you further than the edge allowed.
      if (this.onGround && this.dodgeLeft <= 0 && res.hit) {
        const wantX = v.x * h, wantZ = v.z * h, want = Math.hypot(wantX, wantZ);
        // progress in the direction you meant to go (sliding along the edge does not count)
        const got = want > 1e-4 ? ((this.position.x - _prev.x) * wantX + (this.position.z - _prev.z) * wantZ) / want : 0;
        if (want > 1e-4 && got < want * 0.6) {
          _sa.set(_prev.x + wantX, _prev.y + PLAYER.stepUp + PLAYER.radius, _prev.z + wantZ);
          _sb.set(_sa.x, _prev.y + PLAYER.stepUp + PLAYER.height - PLAYER.radius, _sa.z);
          world.resolveCapsule(_sa, _sb, PLAYER.radius);
          const stepped = ((_sa.x - _prev.x) * wantX + (_sa.z - _prev.z) * wantZ) / want;
          if (stepped > got + want * 0.3) {
            _n.set(_sa.x, _sa.y - PLAYER.radius, _sa.z);
            const below = world.groundBelow(_n, PLAYER.stepUp + 0.1);
            if (below && below.normal.y > 0.7 && below.point.y > _prev.y - 0.05) {
              this.position.set(_n.x, below.point.y, _n.z);
              res.groundY = 1;
            }
          }
        }
      }

      const grounded = res.hit && res.groundY > 0.7;
      if (grounded) {
        if (!this.onGround && fallSpeed > 4) this.landed = Math.max(this.landed, fallSpeed);
        if (v.y < 0) v.y = 0;
        this.onGround = true;
        this.airTime = 0;
      } else {
        if (res.hit && res.push.lengthSq() > 1e-10) {
          // slide along whatever we ran into
          _n.copy(res.push).normalize();
          const into = v.dot(_n);
          if (into < 0) v.addScaledVector(_n, -into);
        }
        // stay glued to the ground when walking down slopes and steps
        let snapped = false;
        if (this.onGround && v.y <= 0 && this.dodgeLeft <= 0) {
          const below = world.groundBelow(this.position, 0.35);
          if (below && below.normal.y > 0.7) {
            this.position.y = below.point.y;
            v.y = 0;
            snapped = true;
          }
        }
        if (!snapped) {
          this.onGround = false;
          this.airTime += h;
        }
      }
    }

    if (this.landed > PLAYER.safeFallSpeed && !this.borne) {
      this.damage((this.landed - PLAYER.safeFallSpeed) * PLAYER.fallDamagePerSpeed, 'The fall broke you.');
    }
    if (this.onGround) this.borne = false;

    this.safeTimer += dt;
    if (this.onGround && this.safeTimer > 0.4 && this.position.y > world.waterLevel + 0.25) {
      this.safeTimer = 0;
      this.lastSafe.copy(this.position);
    }
  }
}
