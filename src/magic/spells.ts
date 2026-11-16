// What sentences do once spoken. Each spell is one of a few delivery shapes (see grammar.ts)
// carried out here against the world, the creatures and the player.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Enemy } from '../enemies/enemies';
import type { Effect, SpellDef, Status, Visual, Zone } from './grammar';
import { FX_COLORS } from '../fx/effects';
import { MATERIALS } from '../art/materials';

type BoltEffect = Extract<Effect, { kind: 'bolt' }>;

interface Bolt {
  effect: BoltEffect;
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  travelled: number;
  light?: THREE.PointLight;
}

interface ActiveZone {
  zone: Zone;
  at: THREE.Vector3;
  life: number;
  tick: number;
  mesh?: THREE.Mesh;
  light?: THREE.PointLight;
}

interface Pillar {
  mesh: THREE.Mesh;
  collider: THREE.Mesh;
  baseY: number;
  height: number;
  radius: number;
  age: number;
  duration: number;
  settled: boolean;
}

interface Updraft {
  at: THREE.Vector3;
  radius: number;
  life: number;
  kick: number;
  lift: number;
  kicked: Set<object>;
}

const VISUAL_COLOR: Record<Visual, number> = { fire: 0xff7a1a, stone: 0xd9a35a, wind: 0xcfe3ee, force: 0xb69cff };
const RISE_TIME = 0.5;
const MAX_PILLARS = 3;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Spells {
  private bolts: Bolt[] = [];
  private zones: ActiveZone[] = [];
  private pillars: Pillar[] = [];
  private updrafts: Updraft[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private boltGeo = new THREE.IcosahedronGeometry(1, 1);
  private rockGeo = new THREE.DodecahedronGeometry(1, 0);

  constructor(private game: Game) {}

  /** Where the casting hand is, roughly: just ahead of and below the eye. */
  private hand(): THREE.Vector3 {
    const { player } = this.game;
    const aim = player.aim;
    const right = _v.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    return player.eye.addScaledVector(aim, 0.7).addScaledVector(right, -0.22).add(_w.set(0, -0.2, 0));
  }

  /** The point on the ground the player is looking at, within `range`. Null if there is none. */
  private groundTarget(range: number): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const { player, world } = this.game;
    const eye = player.eye, aim = player.aim;
    const hit = world.raycast(eye, aim, range);
    if (!hit) {
      const below = world.groundBelow(eye.clone().addScaledVector(aim, range), 40);
      return below && below.normal.y >= 0.6 ? { point: below.point, normal: below.normal } : null;
    }
    if (hit.normal.y > 0.6) return { point: hit.point, normal: hit.normal };
    // Looking at a wall or the side of a rock: take the nearest level ground at its foot,
    // feeling a little further out each time.
    for (const out of [0.6, 1.3, 2.2]) {
      const below = world.groundBelow(hit.point.clone().addScaledVector(hit.normal, out), 40);
      if (below && below.normal.y >= 0.6) return { point: below.point, normal: below.normal };
    }
    return null;
  }

  /** Why a sentence could not take shape where the player is looking, or null if it could. */
  problem(spell: SpellDef): string | null {
    const e = spell.effect;
    if (e.kind === 'zone') return this.groundTarget(e.range) ? null : 'There is no ground there for it to settle on.';
    if (e.kind === 'pillar') return this.groundTarget(e.range) ? null : 'The stone will not rise there.';
    if (e.kind === 'updraft') return this.groundTarget(e.range) ? null : 'The air has nothing to rise from there.';
    return null;
  }

  /**
   * Carry out a sentence. Returns a reason if it could not take shape (nothing is spent then).
   */
  cast(spell: SpellDef): string | null {
    const e = spell.effect;
    switch (e.kind) {
      case 'bolt': return this.castBolt(e);
      case 'lance': return this.castLance(e);
      case 'cone': return this.castCone(e);
      case 'ring': return this.castRing(e);
      case 'zone': {
        const t = this.groundTarget(e.range);
        if (!t) return 'There is no ground there for it to settle on.';
        this.addZone(e.zone, t.point);
        return null;
      }
      case 'pillar': return this.castPillar(e);
      case 'updraft': {
        const t = this.groundTarget(e.range);
        if (!t) return 'The air has nothing to rise from there.';
        this.updrafts.push({ at: t.point.clone(), radius: e.radius, life: e.duration, kick: e.kick, lift: e.lift, kicked: new Set() });
        this.game.fx.ring(t.point, 0xcfe3ee, e.radius * 1.2, 0.6);
        return null;
      }
    }
  }

  // ---- bolts -----------------------------------------------------------------------------

  private castBolt(e: BoltEffect): string | null {
    const { game } = this;
    const eye = game.player.eye, aim = game.player.aim;
    const from = this.hand();
    // converge on what the reticle is over
    const hit = game.world.raycast(eye, aim, e.range);
    const focus = eye.clone().addScaledVector(aim, hit ? Math.max(3, hit.distance) : 40);
    const dir = focus.sub(from).normalize();
    const velocity = dir.multiplyScalar(e.speed);
    if (e.gravity > 0) velocity.y += e.gravity * 0.12; // a little loft so it lands where you look

    const stone = e.visual === 'stone';
    const mat = stone
      ? MATERIALS.conjuredStone
      : new THREE.MeshBasicMaterial({ color: new THREE.Color(e.visual === 'fire' ? 0xffc27a : VISUAL_COLOR[e.visual]).multiplyScalar(2.4) });
    const mesh = new THREE.Mesh(stone ? this.rockGeo : this.boltGeo, mat);
    mesh.scale.setScalar(e.size);
    mesh.position.copy(from);
    mesh.castShadow = stone;
    mesh.userData.noCollide = true;
    game.world.scene.add(mesh);
    const bolt: Bolt = { effect: e, mesh, velocity, travelled: 0 };
    if (!stone) {
      bolt.light = new THREE.PointLight(VISUAL_COLOR[e.visual], 8 + e.size * 40, 9 + e.size * 10, 1.8);
      mesh.add(bolt.light);
    }
    this.bolts.push(bolt);
    game.fx.spark(from, e.visual === 'fire' ? FX_COLORS.fire : e.visual === 'stone' ? FX_COLORS.sand : FX_COLORS.wind, 10, 4);
    return null;
  }

  private updateBolts(dt: number) {
    const { game } = this;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const e = b.effect;
      b.velocity.y -= e.gravity * dt;
      const from = b.mesh.position.clone();
      const step = b.velocity.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().multiplyScalar(1 / (len || 1));
      const to = from.clone().add(step);

      const wall = game.world.raycast(from, dir, len + e.size * 0.5);
      const struck = game.enemies.sweep(from, to, e.size + 0.12);
      let impact: THREE.Vector3 | null = null;
      let target: Enemy | null = null;
      if (struck && (!wall || struck.t * len <= wall.distance)) {
        impact = from.clone().addScaledVector(step, struck.t);
        target = struck.enemy;
      } else if (wall) {
        impact = wall.point.clone().addScaledVector(wall.normal, 0.05);
      }

      b.travelled += len;
      if (!impact && b.travelled < e.range && to.y > game.world.waterLevel - 2) {
        b.mesh.position.copy(to);
        if (e.visual === 'fire') {
          game.fx.embers(to, e.size > 0.3 ? 4 : 2);
        } else if (e.visual === 'stone') {
          b.mesh.rotation.x += dt * 7;
          b.mesh.rotation.z += dt * 4;
        }
        continue;
      }

      this.land(b, impact ?? to, target, dir);
      game.world.scene.remove(b.mesh);
      if (!(b.mesh.material === MATERIALS.conjuredStone)) (b.mesh.material as THREE.Material).dispose();
      this.bolts.splice(i, 1);
    }
  }

  private land(b: Bolt, at: THREE.Vector3, target: Enemy | null, dir: THREE.Vector3) {
    const { game } = this;
    const e = b.effect;
    const hitSomeone = new Set<Enemy>();
    if (target) {
      target.hurt(e.damage, game);
      target.apply(e.status);
      if (e.knock) target.knock(_v.set(dir.x, 0, dir.z).normalize().multiplyScalar(e.knock).setY(e.knock * 0.3));
      hitSomeone.add(target);
    }
    if (e.blast) {
      for (const other of game.enemies.inRadius(at, e.blast.radius, e.blast.radius)) {
        const away = other.chest.sub(at);
        const d = away.length();
        if (other !== target) {
          other.hurt(e.blast.damage * (1 - Math.min(1, d / e.blast.radius) * 0.5), game);
          other.apply(e.status);
        } else {
          other.hurt(e.blast.damage * 0.5, game);
        }
        away.y = 0;
        if (away.lengthSq() < 1e-6) away.set(dir.x, 0, dir.z);
        other.knock(away.normalize().multiplyScalar(e.blast.knock).setY(e.blast.lift ?? e.blast.knock * 0.3));
        hitSomeone.add(other);
      }
    }
    if (e.chain && target) {
      const near = game.enemies.inRadius(target.chest, e.chain.radius, 4).filter((o) => o !== target)
        .sort((a, c) => a.position.distanceToSquared(target.position) - c.position.distanceToSquared(target.position))
        .slice(0, e.chain.count);
      near.forEach((o, i) => {
        const fromP = target.chest, toP = o.chest;
        this.timers.push({
          t: 0.08 + i * 0.07,
          fn: () => {
            if (!o.alive) return;
            // a line of flame leaping across
            for (let k = 0; k <= 10; k++) game.fx.embers(fromP.clone().lerp(toP, k / 10), 2);
            o.hurt(e.chain!.damage, game);
            o.apply(e.status);
            game.fx.flash(toP, 0xff8a3a, 20, 7, 0.25);
          },
        });
        hitSomeone.add(o);
      });
    }

    if (e.visual === 'fire') {
      game.fx.explosion(at, e.blast ? Math.max(0.8, e.blast.radius * 0.55) : 0.7);
    } else if (e.visual === 'stone') {
      game.fx.rubble(at, 1.6, 4);
      game.fx.ring(at, 0xd9a35a, 1.6, 0.3, 0.8);
    } else {
      game.fx.spark(at, FX_COLORS.wind, 14, 6);
    }
    if (e.leaves) {
      const below = game.world.groundBelow(at.clone().setY(at.y + 0.5), 6);
      if (below) this.addZone(e.leaves, below.point);
    }
    if (hitSomeone.size) game.hud.hitMarker();
  }

  // ---- instant shapes --------------------------------------------------------------------

  private castLance(e: Extract<Effect, { kind: 'lance' }>): string | null {
    const { game } = this;
    const eye = game.player.eye, aim = game.player.aim;
    const wall = game.world.raycast(eye, aim, e.range);
    const reach = wall ? wall.distance : e.range;
    const end = eye.clone().addScaledVector(aim, reach);
    let any = false;
    for (const en of game.enemies.list) {
      if (!en.alive) continue;
      const c = en.chest.sub(eye);
      const along = c.dot(aim);
      if (along < 0 || along > reach) continue;
      const off = c.addScaledVector(aim, -along);
      const dy = Math.max(0, Math.abs(off.y) - en.stats.chest * 0.7);
      if (Math.hypot(off.x, off.z, dy) > e.width + en.stats.radius) continue;
      en.hurt(e.damage, game);
      en.apply(e.status);
      en.knock(_v.set(aim.x, 0, aim.z).normalize().multiplyScalar(e.knock).setY(1));
      any = true;
    }
    const from = this.hand();
    const steps = Math.ceil(reach / 0.8);
    for (let k = 0; k <= steps; k++) {
      game.fx.glow.emit(from.clone().lerp(end, k / steps), { count: 2, color: FX_COLORS.wind, speed: [0.2, 1.5], life: [0.12, 0.4], size: [0.12, 0.34], drag: 4, brightness: 0.9 });
    }
    game.fx.gust(from, aim, 24, 40);
    if (wall) game.fx.spark(end, FX_COLORS.wind, 10, 5);
    if (any) game.hud.hitMarker();
    return null;
  }

  private castCone(e: Extract<Effect, { kind: 'cone' }>): string | null {
    const { game } = this;
    const eye = game.player.eye, aim = game.player.aim;
    const origin = eye.clone().add(_v.set(0, -0.35, 0));
    let any = false;
    for (const en of game.enemies.inCone(origin, aim, e.length, e.halfAngle)) {
      if (!game.world.clearLine(eye, en.chest)) continue;
      if (e.damage > 0) en.hurt(e.damage, game);
      en.apply(e.status);
      const away = _v.set(en.position.x - eye.x, 0, en.position.z - eye.z);
      if (away.lengthSq() < 1e-6) away.set(aim.x, 0, aim.z);
      en.knock(away.normalize().multiplyScalar(e.knock).setY(e.lift));
      any = true;
    }

    // the wave itself
    const flat = new THREE.Vector3(aim.x, 0, aim.z).normalize();
    const hand = this.hand();
    if (e.visual === 'fire') {
      // start the fire a stride ahead, so it rolls away from you instead of filling your eyes
      const mouth = hand.clone().addScaledVector(aim, 1.3);
      game.fx.glow.emit(mouth, { count: 110, color: FX_COLORS.fire, speed: [e.length * 0.9, e.length * 2.3], life: [0.25, 0.6], size: [0.35, 1.0], dir: aim, spread: e.halfAngle, drag: 2.6, gravity: -3, brightness: 1.0, radius: 0.5 });
      game.fx.glow.emit(hand, { count: 16, color: FX_COLORS.ember, speed: [2, 9], life: [0.2, 0.5], size: [0.05, 0.14], dir: aim, spread: e.halfAngle, drag: 2, brightness: 2 });
      game.fx.dust.emit(mouth, { count: 20, color: FX_COLORS.smoke, speed: [e.length * 0.5, e.length * 1.4], life: [0.6, 1.2], size: [1, 2.4], dir: aim, spread: e.halfAngle, drag: 2.4, gravity: -1, grow: 2.4 });
      game.fx.flash(hand.clone().addScaledVector(aim, 4), 0xff8a3a, 45, 16, 0.4);
    } else if (e.visual === 'stone') {
      // spikes erupt in a line, a beat apart
      const n = Math.ceil(e.length / 1.6);
      for (let k = 1; k <= n; k++) {
        const p = game.player.position.clone().addScaledVector(flat, k * 1.6);
        this.timers.push({
          t: k * 0.035,
          fn: () => {
            const g = game.world.groundBelow(p.clone().setY(p.y + 2.5), 8);
            if (!g) return;
            game.fx.rubble(g.point, 1.2, 6);
            this.spike(g.point, 0.5 + Math.random() * 0.25, 1.1 + Math.random() * 0.7);
          },
        });
      }
    } else if (e.visual === 'wind') {
      game.fx.dust.emit(hand, { count: 110, color: FX_COLORS.wind, speed: [e.length * 1.2, e.length * 3], life: [0.3, 0.7], size: [0.3, 0.9], dir: aim, spread: e.halfAngle, drag: 2.5, grow: 2.2 });
      game.fx.dust.emit(game.player.position.clone().addScaledVector(flat, 2), { count: 40, color: FX_COLORS.sand, speed: [e.length * 0.8, e.length * 2], life: [0.4, 0.9], size: [0.6, 1.6], dir: flat, spread: e.halfAngle, drag: 2.5, radius: 1.5, flat: 0.1, grow: 2 });
    } else {
      game.fx.glow.emit(hand, { count: 60, color: FX_COLORS.force, speed: [e.length * 1.2, e.length * 2.6], life: [0.15, 0.4], size: [0.15, 0.5], dir: aim, spread: e.halfAngle, drag: 3, brightness: 1.4 });
      game.fx.dust.emit(game.player.position.clone().addScaledVector(flat, 1.5), { count: 26, color: FX_COLORS.sand, speed: [e.length * 0.6, e.length * 1.5], life: [0.4, 0.8], size: [0.5, 1.3], dir: flat, spread: e.halfAngle, drag: 3, grow: 2 });
      game.fx.flash(hand, 0xb69cff, 30, 10, 0.25);
    }
    if (any) game.hud.hitMarker();
    return null;
  }

  private castRing(e: Extract<Effect, { kind: 'ring' }>): string | null {
    const { game } = this;
    const c = game.player.position.clone().setY(game.player.position.y + 0.9);
    let any = false;
    for (const en of game.enemies.inRadius(c, e.radius, 3)) {
      if (e.damage > 0) en.hurt(e.damage, game);
      en.apply(e.status);
      const away = _v.set(en.position.x - c.x, 0, en.position.z - c.z);
      if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
      en.knock(away.normalize().multiplyScalar(e.knock).setY(e.lift));
      any = true;
    }
    const feet = game.player.position;
    game.fx.ring(feet, 0xb69cff, e.radius, 0.5, 2);
    game.fx.ring(feet, 0xe6dcff, e.radius * 0.7, 0.35, 1.2);
    game.fx.dust.emit(feet, { count: 70, color: FX_COLORS.sand, speed: [e.radius * 0.8, e.radius * 2.2], life: [0.4, 0.9], size: [0.5, 1.5], dir: new THREE.Vector3(0, 1, 0), spread: Math.PI / 2 * 1.02, drag: 3, radius: 0.8, flat: 0.05, grow: 2.2 });
    game.fx.flash(c, 0xb69cff, 60, 14, 0.35);
    if (any) game.hud.hitMarker();
    return null;
  }

  /** A short-lived shard of stone thrust out of the ground. */
  private spike(at: THREE.Vector3, radius: number, height: number) {
    const geo = new THREE.ConeGeometry(radius, height, 5);
    geo.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geo, MATERIALS.conjuredStone.clone());
    mesh.position.copy(at);
    mesh.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
    mesh.castShadow = true;
    this.game.fx.addTransient(mesh, 1.6, (t, m) => {
      const up = t < 0.08 ? t / 0.08 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      m.scale.set(1, Math.max(0.01, up), 1);
    });
  }

  // ---- lingering things ------------------------------------------------------------------

  private addZone(zone: Zone, at: THREE.Vector3) {
    const { game } = this;
    const z: ActiveZone = { zone, at: at.clone(), life: zone.duration, tick: 0 };
    if (zone.visual === 'magma') {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a10).multiplyScalar(1.7), transparent: true, opacity: 0.9, depthWrite: false });
      z.mesh = new THREE.Mesh(new THREE.CircleGeometry(zone.radius, 28), mat);
      z.mesh.rotation.x = -Math.PI / 2;
      z.mesh.position.copy(at).setY(at.y + 0.07);
      z.mesh.userData.noCollide = true;
      game.world.scene.add(z.mesh);
      game.fx.rubble(at, 1.5, 3);
    }
    if (zone.visual === 'magma' || zone.visual === 'fire') {
      z.light = new THREE.PointLight(0xff7a2a, 26, zone.radius * 4, 1.8);
      z.light.position.copy(at).setY(at.y + 1.2);
      game.world.scene.add(z.light);
    }
    if (zone.visual === 'sand') game.fx.ring(at, 0xd9a35a, zone.radius, 0.6, 0.7);
    this.zones.push(z);
  }

  private updateZones(dt: number) {
    const { game } = this;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      z.tick -= dt;
      const fade = Math.min(1, z.life / 0.8);
      const r = z.zone.radius;
      if (z.zone.visual === 'sand') {
        // grit whirling round the centre
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
          const p = _v.set(z.at.x + Math.cos(a) * rr, z.at.y + Math.random() * 3.2, z.at.z + Math.sin(a) * rr);
          game.fx.dust.emit(p, { count: 1, color: FX_COLORS.sand, speed: [5, 9], life: [0.5, 1.0], size: [0.9, 2.2], dir: _w.set(-Math.sin(a), 0.05, Math.cos(a)), spread: 0.2, drag: 0.8, grow: 1.6 });
        }
      } else if (Math.random() < dt * 60) {
        game.fx.flames(z.at, r * 0.9, z.zone.visual === 'magma' ? 2 : 4);
      }
      if (z.mesh) (z.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      if (z.light) z.light.intensity = 26 * fade * (0.85 + Math.random() * 0.3);

      if (z.tick <= 0) {
        z.tick = 0.25;
        for (const en of game.enemies.inRadius(z.at, r, 2.6)) {
          if (z.zone.dps > 0) en.hurt(z.zone.dps * 0.25, game, 'burn');
          en.apply(z.zone.status);
        }
      }
      if (z.life <= 0) {
        if (z.mesh) { game.world.scene.remove(z.mesh); (z.mesh.material as THREE.Material).dispose(); z.mesh.geometry.dispose(); }
        if (z.light) game.world.scene.remove(z.light);
        this.zones.splice(i, 1);
      }
    }
  }

  // ---- pillars ---------------------------------------------------------------------------

  private castPillar(e: Extract<Effect, { kind: 'pillar' }>): string | null {
    const { game } = this;
    const t = this.groundTarget(e.range);
    if (!t) return 'The stone will not rise there.';
    if (this.pillars.length >= MAX_PILLARS) this.pillars[0].age = Math.max(this.pillars[0].age, this.pillars[0].duration);

    const full = e.height + 1.2;
    const geo = new THREE.CylinderGeometry(e.radius * 0.9, e.radius * 1.05, full, 9, 1);
    geo.translate(0, -full / 2, 0); // origin at the top face
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.5);
    const mesh = new THREE.Mesh(geo, MATERIALS.conjuredStone);
    mesh.position.copy(t.point).setY(t.point.y - 0.1);
    mesh.rotation.y = Math.random() * 6;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noCollide = true;
    game.world.scene.add(mesh);

    const colGeo = new THREE.CylinderGeometry(e.radius * 0.9, e.radius * 1.05, full, 9, 1).toNonIndexed();
    colGeo.translate(0, -full / 2, 0);
    const collider = game.world.addCollider(colGeo, mesh.position);

    // whatever stood there is thrown off
    for (const en of game.enemies.inRadius(t.point, e.radius + 0.2, 2.5)) {
      en.hurt(e.damage, game);
      en.apply({ stagger: 0.9 });
      const away = _v.set(en.position.x - t.point.x, 0, en.position.z - t.point.z);
      if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      en.knock(away.normalize().multiplyScalar(3.5).setY(e.lift));
    }
    game.fx.rubble(t.point, 2.2, 6);
    game.fx.ring(t.point, 0xd9a35a, e.radius * 1.8, 0.5, 0.9);
    this.pillars.push({ mesh, collider, baseY: t.point.y, height: e.height, radius: e.radius, age: 0, duration: e.duration, settled: false });
    return null;
  }

  private updatePillars(dt: number) {
    const { game } = this;
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const p = this.pillars[i];
      p.age += dt;
      let up: number;
      if (p.age < RISE_TIME) {
        const k = p.age / RISE_TIME;
        up = 1 - (1 - k) * (1 - k);
      } else if (p.age < p.duration) {
        up = 1;
        if (!p.settled) {
          p.settled = true;
          this.refreshNav(p);
        }
        if (p.duration - p.age < 2 && Math.random() < dt * 14) {
          game.fx.rubble(_v.copy(p.mesh.position).add(_w.set((Math.random() - 0.5) * p.radius * 2, -Math.random() * p.height, (Math.random() - 0.5) * p.radius * 2)), 0.25, 0);
        }
      } else {
        const k = Math.min(1, (p.age - p.duration) / 0.6);
        up = 1 - k * k;
        if (k >= 1) {
          game.world.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          game.world.removeCollider(p.collider);
          this.pillars.splice(i, 1);
          this.refreshNav(p);
          game.fx.rubble(_v.set(p.mesh.position.x, p.baseY, p.mesh.position.z), 2, 3);
          continue;
        }
      }
      p.mesh.position.y = p.baseY - 0.1 + p.height * up;
      p.collider.position.copy(p.mesh.position);
      p.collider.updateMatrixWorld(true);
    }
  }

  private refreshNav(p: Pillar) {
    const pad = p.radius + 1.5;
    this.game.nav.resample(p.mesh.position.x - pad, p.mesh.position.x + pad, p.mesh.position.z - pad, p.mesh.position.z + pad);
  }

  // ---- updrafts --------------------------------------------------------------------------

  private updateUpdrafts(dt: number) {
    const { game } = this;
    for (let i = this.updrafts.length - 1; i >= 0; i--) {
      const u = this.updrafts[i];
      u.life -= dt;
      const inside = (p: THREE.Vector3) => Math.hypot(p.x - u.at.x, p.z - u.at.z) < u.radius && p.y > u.at.y - 1 && p.y < u.at.y + 9;

      const pl = game.player;
      if (inside(pl.position)) {
        if (!u.kicked.has(pl)) {
          u.kicked.add(pl);
          pl.launch(u.kick);
        } else {
          pl.velocity.y += u.lift * dt;
        }
      }
      for (const en of game.enemies.list) {
        if (!en.alive || !inside(en.position)) continue;
        if (!u.kicked.has(en)) {
          u.kicked.add(en);
          en.apply({ stagger: 1.4 });
          en.knock(_v.set((Math.random() - 0.5) * 3, u.kick + 2, (Math.random() - 0.5) * 3));
        } else if (en.velocity.y > 0) {
          // it carries them up, but does nothing to break their fall
          en.velocity.y += u.lift * 0.5 * dt;
        }
      }
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * u.radius;
        game.fx.dust.emit(_v.set(u.at.x + Math.cos(a) * rr, u.at.y + Math.random() * 1.5, u.at.z + Math.sin(a) * rr), {
          count: 1, color: FX_COLORS.wind, speed: [9, 15], life: [0.35, 0.7], size: [0.25, 0.7], dir: _w.set(-Math.sin(a) * 0.35, 1, Math.cos(a) * 0.35), spread: 0.08, drag: 1, grow: 1.8,
        });
      }
      if (u.life <= 0) this.updrafts.splice(i, 1);
    }
  }

  update(dt: number) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    this.updateBolts(dt);
    this.updateZones(dt);
    this.updatePillars(dt);
    this.updateUpdrafts(dt);
  }

  /** Remove everything conjured (on death, or when the level resets). */
  clear() {
    const { game } = this;
    for (const b of this.bolts) game.world.scene.remove(b.mesh);
    for (const z of this.zones) {
      if (z.mesh) game.world.scene.remove(z.mesh);
      if (z.light) game.world.scene.remove(z.light);
    }
    for (const p of this.pillars) {
      game.world.scene.remove(p.mesh);
      game.world.removeCollider(p.collider);
      this.refreshNav(p);
    }
    this.bolts.length = this.zones.length = this.pillars.length = this.updrafts.length = this.timers.length = 0;
  }
}
