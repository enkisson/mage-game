// The Gloam. Creatures walk the nav grid, are thrown around by spells, take damage from
// falls and from being slammed into things, and know two tricks each.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { EnemyKind } from '../world/level';
import type { Status } from '../magic/grammar';
import { makeDrowned, makeSpitter, type CreatureModel, type Pose } from '../art/creatures';
import { FX_COLORS } from '../fx/effects';

const GRAVITY = 22;
const STEP_UP = 0.9;
/** Landing or hitting a wall faster than this hurts. */
const SAFE_IMPACT = 10;
const FALL_DAMAGE = 7;
const SLAM_SPEED = 7;
const SLAM_DAMAGE = 4;

interface Stats {
  hp: number; speed: number; radius: number; mass: number; chest: number;
}

const STATS: Record<EnemyKind, Stats> = {
  drowned: { hp: 80, speed: 3.5, radius: 0.42, mass: 1, chest: 1.2 },
  spitter: { hp: 55, speed: 2.6, radius: 0.55, mass: 0.9, chest: 1.5 },
};

type State = 'rise' | 'hunt' | 'windup' | 'strike' | 'recover' | 'crouch' | 'leap' | 'dead';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _dir = { x: 0, z: 0 };

export class Enemy {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly stats: Stats;
  readonly model: CreatureModel;
  yaw = 0;
  hp: number;
  alive = true;
  onGround = true;
  /** Being carried by an impulse; ignores its own legs until it settles. */
  knocked = false;
  state: State = 'rise';
  stateT = 0;
  gone = false;

  private clock = Math.random() * 10;
  private move = 0;
  private flashT = 0;
  private cooldown = 0.6 + Math.random() * 0.8;
  private leapCooldown = 2 + Math.random() * 2;
  private wanderYaw = Math.random() * 6.28;
  private burnTime = 0;
  private burnDps = 0;
  private burnShown = 0;
  private stagger = 0;
  private blind = 0;
  private slowTime = 0;
  private slowFactor = 1;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  /** The spot on its route this creature is walking to, and how long it has been trying. */
  private way = { x: 0, z: 0, age: 99 };
  private baseScale = 1;

  constructor(readonly kind: EnemyKind, at: THREE.Vector3, seed: number) {
    this.stats = STATS[kind];
    this.hp = this.stats.hp;
    this.model = kind === 'drowned' ? makeDrowned(seed) : makeSpitter(seed);
    this.position.copy(at);
    this.model.root.position.copy(at);
    this.baseScale = this.model.root.scale.x;
  }

  get chest(): THREE.Vector3 {
    return _q.set(this.position.x, this.position.y + this.stats.chest, this.position.z).clone();
  }

  get burning() { return this.burnTime > 0; }
  get staggered() { return this.stagger > 0; }

  hurt(amount: number, game: Game, kind: 'hit' | 'burn' | 'fall' = 'hit') {
    if (!this.alive || amount <= 0) return;
    this.hp -= amount;
    if (kind !== 'burn') this.flashT = 0.18;
    if (kind === 'burn') {
      this.burnShown += amount;
      if (this.burnShown >= 6) {
        game.hud.number(this.chest, Math.round(this.burnShown), 'burn');
        this.burnShown = 0;
      }
    } else {
      game.hud.number(this.chest, Math.round(amount), kind);
    }
    if (this.hp <= 0) this.die(game);
  }

  apply(status: Status | undefined) {
    if (!status || !this.alive) return;
    if (status.burn) {
      this.burnTime = Math.max(this.burnTime, status.burn.time);
      this.burnDps = Math.max(this.burnDps, status.burn.dps);
    }
    if (status.stagger) this.stagger = Math.max(this.stagger, status.stagger);
    if (status.blind) this.blind = Math.max(this.blind, status.blind);
    if (status.slow) {
      this.slowTime = Math.max(this.slowTime, status.slow.time);
      this.slowFactor = Math.min(this.slowTime > 0 ? this.slowFactor : 1, status.slow.factor);
    }
  }

  /** Throw the creature. Anything with real upward force lifts it off its feet. */
  knock(impulse: THREE.Vector3) {
    if (!this.alive) return;
    this.velocity.addScaledVector(impulse, 1 / this.stats.mass);
    this.knocked = true;
    if (impulse.y > 1.5) this.onGround = false;
    if (this.state === 'windup' || this.state === 'crouch') this.setState('hunt');
  }

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  private die(game: Game) {
    this.alive = false;
    this.hp = 0;
    this.setState('dead');
    game.fx.gloamPuff(this.chest, 1.2);
    game.onEnemyDeath(this);
  }

  /** Try to move horizontally. Returns true if something solid was in the way. */
  private tryMove(dx: number, dz: number, game: Game): boolean {
    const p = this.position;
    const g = game.world.groundBelow(_p.set(p.x + dx, p.y + 1.0, p.z + dz), 60);
    if (!g) return true;
    const rise = g.point.y - p.y;
    if (rise > STEP_UP) return true;
    if (this.onGround && !this.knocked && g.point.y < game.world.waterLevel - 0.5) return true;
    p.x += dx;
    p.z += dz;
    if (this.onGround) {
      if (rise < -0.8) this.onGround = false;
      else p.y = g.point.y;
    }
    return false;
  }

  update(dt: number, game: Game) {
    this.clock += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.model.flash(this.flashT * 4);

    if (!this.alive) {
      this.stateT += dt;
      this.fall(dt, game);
      this.model.root.position.copy(this.position);
      this.model.animate(this.clock, 0, 'dead', this.stateT);
      // sink away once it has fallen
      const fade = THREE.MathUtils.clamp(1 - (this.stateT - 0.7) / 0.6, 0.02, 1);
      this.model.root.scale.setScalar(this.baseScale * fade);
      if (this.stateT > 1.3) this.gone = true;
      return;
    }

    // statuses
    this.cooldown -= dt;
    this.leapCooldown -= dt;
    this.stagger = Math.max(0, this.stagger - dt);
    this.blind = Math.max(0, this.blind - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    if (this.slowTime <= 0) this.slowFactor = 1;
    if (this.burnTime > 0) {
      this.burnTime -= dt;
      this.hurt(this.burnDps * dt, game, 'burn');
      if (Math.random() < dt * 14) game.fx.embers(this.chest.add(_p.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.5)), 2);
      if (!this.alive) return;
    }

    // decide
    let wishX = 0, wishZ = 0;
    const canAct = this.onGround && !this.knocked && this.stagger <= 0;
    if (this.state === 'rise') {
      this.stateT += dt / 1.1;
      if (this.stateT >= 1) this.setState('hunt');
    } else if (canAct) {
      [wishX, wishZ] = this.kind === 'drowned' ? this.thinkDrowned(dt, game) : this.thinkSpitter(dt, game);
    } else if (this.state === 'leap' && this.onGround && !this.knocked) {
      this.setState('recover');
    }

    // move
    const v = this.velocity;
    if (this.onGround && !this.knocked) {
      const slow = this.slowFactor;
      v.x = wishX * slow;
      v.z = wishZ * slow;
    } else if (this.onGround && this.knocked) {
      const sp = Math.hypot(v.x, v.z);
      const drop = 20 * dt;
      if (sp <= drop + 0.4) {
        v.x = v.z = 0;
        this.knocked = false;
      } else {
        v.x *= (sp - drop) / sp;
        v.z *= (sp - drop) / sp;
      }
    }
    const speed = Math.hypot(v.x, v.z);
    if (speed > 1e-3) {
      const dx = v.x * dt, dz = v.z * dt;
      if (this.tryMove(dx, dz, game)) {
        const bx = this.tryMove(dx, 0, game), bz = bx ? this.tryMove(0, dz, game) : false;
        if (this.knocked && speed > SLAM_SPEED) {
          this.hurt((speed - SLAM_SPEED) * SLAM_DAMAGE, game, 'fall');
          this.stagger = Math.max(this.stagger, 0.8);
          game.fx.rubble(this.chest, 0.5, 2);
          v.x *= 0.2;
          v.z *= 0.2;
        } else if (bx && bz && this.knocked) {
          v.x = v.z = 0;
        }
      }
    }
    this.fall(dt, game);
    if (!this.alive) return;

    // pose
    this.move += ((this.onGround && !this.knocked ? Math.min(1, speed / this.stats.speed) : 0) - this.move) * Math.min(1, dt * 8);
    let pose: Pose = 'walk';
    let poseT = this.stateT;
    if (this.state === 'rise') pose = 'rise';
    else if (!this.onGround) pose = 'air';
    else if (this.stagger > 0 || this.knocked) pose = 'stagger';
    else if (this.state === 'windup') pose = 'windup';
    else if (this.state === 'strike') pose = 'strike';
    else if (this.state === 'crouch') pose = 'crouch';
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    this.model.animate(this.clock, this.move, pose, poseT);
  }

  private fall(dt: number, game: Game) {
    if (this.onGround) return;
    const p = this.position, v = this.velocity;
    v.y -= GRAVITY * dt;
    p.y += v.y * dt;
    const g = game.world.groundBelow(_p.set(p.x, p.y + 1.0, p.z), 80);
    const floor = g ? g.point.y : -50;
    if (p.y <= floor && v.y <= 0) {
      const impact = -v.y;
      p.y = floor;
      v.y = 0;
      v.x *= 0.35;
      v.z *= 0.35;
      this.onGround = true;
      if (this.alive && impact > SAFE_IMPACT) {
        this.hurt((impact - SAFE_IMPACT) * FALL_DAMAGE, game, 'fall');
        this.stagger = Math.max(this.stagger, 0.9);
        game.fx.rubble(p, 0.6, 2);
      }
    }
    if (p.y < game.world.waterLevel - 3 || p.y < -40) {
      // the sea takes it
      if (this.alive) this.hurt(9999, game, 'fall');
    }
  }

  /**
   * Walk the route toward the player. Commits to one waypoint at a time so the creature does
   * not dither where the route bends. Returns false if there is no route at all.
   */
  private route(dt: number, game: Game, out: { x: number; z: number }): boolean {
    const p = this.position;
    this.way.age += dt;
    const reached = Math.hypot(this.way.x - p.x, this.way.z - p.z) < 0.4;
    if (reached || this.way.age > 0.9) {
      if (!game.nav.waypoint(p.x, p.z, this.way)) {
        this.way.age = 99;
        return false;
      }
      this.way.age = 0;
    }
    const dx = this.way.x - p.x, dz = this.way.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return false;
    out.x = dx / d;
    out.z = dz / d;
    return true;
  }

  private face(tx: number, tz: number, dt: number, rate = 8) {
    const want = Math.atan2(tx - this.position.x, tz - this.position.z);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  private wander(dt: number): [number, number] {
    this.wanderYaw += (Math.random() - 0.5) * dt * 6;
    const s = this.stats.speed * 0.45;
    this.yaw = this.wanderYaw;
    return [Math.sin(this.wanderYaw) * s, Math.cos(this.wanderYaw) * s];
  }

  private thinkDrowned(dt: number, game: Game): [number, number] {
    const pl = game.player;
    const p = this.position;
    const dx = pl.position.x - p.x, dz = pl.position.z - p.z;
    const d = Math.hypot(dx, dz), dy = pl.position.y - p.y;
    const speed = this.stats.speed * (this.burning ? 1.15 : 1);

    switch (this.state) {
      case 'hunt': {
        if (this.blind > 0 || !pl.alive) return this.wander(dt);
        if (d < 1.9 && Math.abs(dy) < 1.5 && this.cooldown <= 0) {
          this.setState('windup');
          return [0, 0];
        }
        const routed = game.nav.reachable(p.x, p.z);
        const detour = game.nav.cost(p.x, p.z);
        if (this.leapCooldown <= 0 && d < 5.5 && dy > 0.9 && dy < 2.9 && (!routed || detour > d * 3 + 12)
          && game.world.clearLine(this.chest, pl.eye)) {
          this.setState('crouch');
          return [0, 0];
        }
        if (this.route(dt, game, _dir)) {
          this.face(p.x + _dir.x, p.z + _dir.z, dt, 7);
          return [_dir.x * speed, _dir.z * speed];
        }
        this.face(pl.position.x, pl.position.z, dt);
        if (d > 1.2 && Math.abs(dy) < 1.5) return [(dx / d) * speed, (dz / d) * speed];
        return [0, 0];
      }
      case 'windup':
        this.face(pl.position.x, pl.position.z, dt, 10);
        this.stateT += dt / 0.45;
        if (this.stateT >= 1) {
          this.setState('strike');
          if (d < 2.5 && Math.abs(dy) < 1.8) {
            pl.damage(16);
            pl.impulse(_p.set((dx / (d || 1)) * 4, 1.5, (dz / (d || 1)) * 4));
          }
          this.cooldown = 1.0 + Math.random() * 0.5;
        }
        // lunge the last half-step
        return [(dx / (d || 1)) * speed * 0.6, (dz / (d || 1)) * speed * 0.6];
      case 'strike':
        this.stateT += dt / 0.35;
        if (this.stateT >= 1) this.setState('recover');
        return [0, 0];
      case 'recover':
        this.stateT += dt / 0.45;
        if (this.stateT >= 1) this.setState('hunt');
        return [0, 0];
      case 'crouch':
        this.face(pl.position.x, pl.position.z, dt, 10);
        this.stateT += dt / 0.55;
        if (this.stateT >= 1) {
          const T = 0.72;
          const hx = Math.min(12, d / T);
          this.velocity.set((dx / (d || 1)) * hx, (dy + 0.25 + 0.5 * GRAVITY * T * T) / T, (dz / (d || 1)) * hx);
          this.onGround = false;
          this.knocked = true;
          this.leapCooldown = 5 + Math.random() * 2;
          this.setState('leap');
        }
        return [0, 0];
      case 'leap': {
        // landed (we only think while on the ground)
        if (d < 2.3 && Math.abs(dy) < 1.6) pl.damage(12);
        this.cooldown = 0.8;
        this.setState('recover');
        return [0, 0];
      }
    }
    return [0, 0];
  }

  private thinkSpitter(dt: number, game: Game): [number, number] {
    const pl = game.player;
    const p = this.position;
    const dx = pl.position.x - p.x, dz = pl.position.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = this.stats.speed;

    switch (this.state) {
      case 'hunt': {
        if (this.blind > 0 || !pl.alive) return this.wander(dt);
        this.face(pl.position.x, pl.position.z, dt, 5);
        const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
        const sight = game.world.clearLine(muzzle, pl.eye);
        if (sight && d < 30 && this.cooldown <= 0) {
          this.setState('windup');
          return [0, 0];
        }
        if (d < 7) return [(-dx / d) * speed, (-dz / d) * speed];
        if ((d > 18 || !sight) && this.route(dt, game, _dir)) return [_dir.x * speed, _dir.z * speed];
        // hold range, drifting sideways
        if (Math.random() < dt * 0.3) this.strafe *= -1;
        return [(-dz / d) * speed * 0.4 * this.strafe, (dx / d) * speed * 0.4 * this.strafe];
      }
      case 'windup':
        this.face(pl.position.x, pl.position.z, dt, 8);
        this.stateT += dt / 0.85;
        if (this.stateT >= 1) {
          this.setState('strike');
          const from = this.model.muzzle.getWorldPosition(new THREE.Vector3());
          game.enemies.spit(from, pl);
          this.cooldown = 2.4 + Math.random() * 1.2;
        }
        return [0, 0];
      case 'strike':
        this.stateT += dt / 0.4;
        if (this.stateT >= 1) this.setState('hunt');
        return [0, 0];
      default:
        this.setState('hunt');
    }
    return [0, 0];
  }
}

interface Spit {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

const SPIT_GRAVITY = 12;
const SPIT_RADIUS = 2.3;
const SPIT_DAMAGE = 14;

export class Enemies {
  readonly list: Enemy[] = [];
  private spits: Spit[] = [];
  private seed = 1;
  private spitGeo = new THREE.IcosahedronGeometry(0.22, 1);
  private spitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8dff3a).multiplyScalar(2.6) });

  constructor(private game: Game) {}

  get alive(): number {
    let n = 0;
    for (const e of this.list) if (e.alive) n++;
    return n;
  }

  spawn(kind: EnemyKind, at: THREE.Vector3): Enemy {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
    const pos = new THREE.Vector3(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
    const g = this.game.world.groundBelow(_p.set(pos.x, pos.y + 2, pos.z), 20);
    if (g) pos.y = g.point.y;
    const e = new Enemy(kind, pos, this.seed++);
    const pl = this.game.player.position;
    e.yaw = Math.atan2(pl.x - pos.x, pl.z - pos.z);
    this.game.world.scene.add(e.model.root);
    this.list.push(e);
    this.game.fx.gloamPuff(pos.clone().setY(pos.y + 0.4), 1);
    this.game.fx.ring(pos, 0x8dff3a, 2.2, 0.7);
    return e;
  }

  /** Lob a bolt of gloam at where the player is about to be. */
  spit(from: THREE.Vector3, player: { position: THREE.Vector3; velocity: THREE.Vector3 }) {
    const target = _p.copy(player.position).setY(player.position.y + 0.3);
    const flat = Math.hypot(target.x - from.x, target.z - from.z);
    const T = THREE.MathUtils.clamp(flat / 13, 0.75, 1.9);
    target.x += player.velocity.x * T * 0.55;
    target.z += player.velocity.z * T * 0.55;
    const v = new THREE.Vector3((target.x - from.x) / T, (target.y - from.y + 0.5 * SPIT_GRAVITY * T * T) / T, (target.z - from.z) / T);
    const mesh = new THREE.Mesh(this.spitGeo, this.spitMat);
    mesh.position.copy(from);
    mesh.userData.noCollide = true;
    this.game.world.scene.add(mesh);
    this.spits.push({ mesh, velocity: v, life: 5 });
    this.game.fx.spark(from, FX_COLORS.gloam, 12, 4);
  }

  private burst(at: THREE.Vector3) {
    const { game } = this;
    game.fx.gloamPuff(at, 1.6);
    game.fx.ring(at, 0x8dff3a, SPIT_RADIUS, 0.4);
    game.fx.flash(at, 0x8dff3a, 30, 9, 0.3);
    const d = at.distanceTo(_q.copy(game.player.position).setY(game.player.position.y + 0.9));
    if (d < SPIT_RADIUS) game.player.damage(Math.max(6, SPIT_DAMAGE * (1 - d / SPIT_RADIUS * 0.6)), 'Gloam spit ate through you.');
  }

  inRadius(center: THREE.Vector3, radius: number, tall = 3): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.position.x - center.x, dz = e.position.z - center.z;
      const reach = radius + e.stats.radius;
      if (dx * dx + dz * dz > reach * reach) continue;
      const mid = e.position.y + e.stats.chest;
      if (mid < center.y - tall || e.position.y > center.y + tall) continue;
      out.push(e);
    }
    return out;
  }

  /** Creatures inside a cone leaving `origin` along `dir` (horizontal spread, generous vertically). */
  inCone(origin: THREE.Vector3, dir: THREE.Vector3, length: number, halfAngle: number): Enemy[] {
    const out: Enemy[] = [];
    const cos = Math.cos(halfAngle);
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = e.chest.sub(origin);
      const dist = c.length();
      if (dist > length + e.stats.radius) continue;
      if (dist > 1.2 && c.dot(dir) / dist < cos) continue;
      out.push(e);
    }
    return out;
  }

  /** First creature struck by a moving point (a sphere swept from a to b). */
  sweep(a: THREE.Vector3, b: THREE.Vector3, radius: number, ignore?: Set<Enemy>): { enemy: Enemy; t: number } | null {
    let best: { enemy: Enemy; t: number } | null = null;
    const ab = _p.subVectors(b, a);
    const len2 = ab.lengthSq() || 1e-9;
    for (const e of this.list) {
      if (!e.alive || ignore?.has(e)) continue;
      const c = e.chest;
      const t = THREE.MathUtils.clamp(c.clone().sub(a).dot(ab) / len2, 0, 1);
      const closest = a.clone().addScaledVector(ab, t);
      const dx = closest.x - c.x, dz = closest.z - c.z;
      const dy = Math.max(0, Math.abs(closest.y - c.y) - e.stats.chest * 0.75);
      const reach = radius + e.stats.radius;
      if (dx * dx + dz * dz + dy * dy <= reach * reach && (!best || t < best.t)) best = { enemy: e, t };
    }
    return best;
  }

  update(dt: number) {
    const { game } = this;
    for (const e of this.list) e.update(dt, game);

    // keep bodies from stacking inside each other, and out of the player
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b.alive || Math.abs(a.position.y - b.position.y) > 1.5) continue;
        const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz), min = a.stats.radius + b.stats.radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) * 0.5 * Math.min(1, dt * 12);
          a.position.x -= (dx / d) * push; a.position.z -= (dz / d) * push;
          b.position.x += (dx / d) * push; b.position.z += (dz / d) * push;
        }
      }
      const pl = game.player.position;
      if (Math.abs(a.position.y - pl.y) < 1.6) {
        const dx = a.position.x - pl.x, dz = a.position.z - pl.z;
        const d = Math.hypot(dx, dz), min = a.stats.radius + 0.4;
        if (d < min && d > 1e-4) {
          const push = Math.min(min - d, 3 * dt);
          a.position.x += (dx / d) * push;
          a.position.z += (dz / d) * push;
        }
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].gone) {
        game.world.scene.remove(this.list[i].model.root);
        this.list.splice(i, 1);
      }
    }

    // spit in flight
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.life -= dt;
      s.velocity.y -= SPIT_GRAVITY * dt;
      const from = s.mesh.position.clone();
      const step = s.velocity.clone().multiplyScalar(dt);
      const len = step.length();
      const hit = game.world.raycast(from, step.clone().multiplyScalar(1 / (len || 1)), len + 0.2);
      const to = from.clone().add(step);
      const pc = _q.copy(game.player.position).setY(game.player.position.y + 0.9);
      const nearPlayer = to.distanceTo(pc) < 0.9;
      if (hit || nearPlayer || s.life <= 0) {
        this.burst(hit ? hit.point : to);
        game.world.scene.remove(s.mesh);
        this.spits.splice(i, 1);
        continue;
      }
      s.mesh.position.copy(to);
      if (Math.random() < dt * 40) game.fx.glow.emit(to, { count: 1, color: FX_COLORS.gloam, speed: [0, 0.4], life: [0.25, 0.5], size: [0.25, 0.45], brightness: 1.2 });
    }
  }

  clear() {
    for (const e of this.list) this.game.world.scene.remove(e.model.root);
    this.list.length = 0;
    for (const s of this.spits) this.game.world.scene.remove(s.mesh);
    this.spits.length = 0;
  }
}
