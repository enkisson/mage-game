// The game: owns every system, runs the loop, and holds the rules of a run.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Input, SIGIL_KEYS } from '../core/input';
import { World } from '../world/world';
import { NavGrid } from '../world/nav';
import type { Level, JournalDef, StandDef, SpawnGroup } from '../world/level';
import { buildShore } from '../world/shore';
import { journalProp, sealProp, type JournalProp, type SealProp } from '../world/props';
import { Player } from '../player/player';
import { View } from '../player/view';
import { Enemies, type Enemy } from '../enemies/enemies';
import { Spells } from '../magic/spells';
import { Caster } from '../magic/caster';
import { SIGILS, type SigilId } from '../magic/sigils';
import { Effects } from '../fx/effects';
import { Hud } from '../ui/hud';
import { createSky, loadPhotoSky, type NightSky } from './sky';
import type { Models } from '../art/models';
import { emptyKnowledge, learnSigil, loadKnowledge, saveKnowledge, type Knowledge } from './save';
import { GESTURES, HOLD, IDLE, type GestureName } from '../player/poses';
import type { ArmPose } from '../player/hands';

type Mode = 'title' | 'playing' | 'paused' | 'reading' | 'book' | 'dead';

const STEP = 1 / 60;
const SENSITIVITY = 0.0023;

interface StandRun {
  def: StandDef;
  phase: 'waiting' | 'fighting' | 'lull' | 'won';
  wave: number;
  clock: number;
  queue: SpawnGroup[];
  seals: { prop: SealProp; collider: THREE.Mesh | null; role: 'entry' | 'exit'; def: StandDef['seals'][number] }[];
  /** Extra creatures per group each time the tide is called again. */
  tide: number;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly world = new World();
  readonly input: Input;
  readonly player = new Player();
  readonly view: View;
  readonly hud: Hud;
  readonly fx: Effects;
  readonly enemies: Enemies;
  readonly spells: Spells;
  readonly caster: Caster;
  readonly level: Level;
  readonly nav: NavGrid;
  knowledge: Knowledge = loadKnowledge();
  mode: Mode = 'title';
  time = 0;

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sky: NightSky;
  private journals: { def: JournalDef; prop: JournalProp }[] = [];
  private stands: StandRun[] = [];
  private accumulator = 0;
  private last = 0;
  private deadClock = 0;
  private sensitivity = SENSITIVITY;
  private nearJournal: JournalDef | null = null;
  private atExit = false;
  private reading: JournalDef | null = null;
  private seaClock = 0;
  private exitSpot: THREE.Vector3;
  /** When true the loop idles and tests drive the game step by step. */
  private manual = false;
  /** Resolves once the hand models are in. */
  handsReady: Promise<boolean> = Promise.resolve(false);

  constructor(private container: HTMLElement, models: Models) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    container.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    const scene = this.world.scene;
    this.view = new View(1);
    scene.add(this.view.camera);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container, this.view.camera);
    this.fx = new Effects(scene);

    // the level
    this.level = buildShore(models);
    scene.add(this.level.root);
    this.world.waterLevel = this.level.waterLevel;
    this.world.addCollider(this.level.collision);
    this.sky = createSky(scene, {
      top: 0x060a1a, mid: 0x15233f, horizon: 0x40506b, glow: 0xd97a3a, glowDir: [-0.75, 0, 0.66],
      fog: 0x18212f, fogDensity: 0.0075,
      keyColor: 0xb9cbff, keyIntensity: 1.25, keyDir: [0.55, 0.55, 0.3], ambient: 0.7,
    });

    this.nav = new NavGrid(this.level.bounds, { cell: 1, stepUp: 0.85, dropMax: 7, minHeight: this.level.waterLevel - 0.35 },
      (x, z) => this.world.groundAt(x, z));

    this.enemies = new Enemies(this);
    this.spells = new Spells(this);
    this.caster = new Caster(this);

    for (const def of this.level.journals) {
      const prop = journalProp();
      prop.root.position.copy(def.position);
      prop.setRead(this.knowledge.journals.includes(def.id));
      scene.add(prop.root);
      this.journals.push({ def, prop });
    }
    for (const def of this.level.stands) {
      const seals = def.seals.map((s) => {
        const prop = sealProp(s);
        scene.add(prop.mesh);
        return { prop, collider: null as THREE.Mesh | null, role: s.role, def: s };
      });
      this.stands.push({ def, phase: 'waiting', wave: 0, clock: 0, queue: [], seals, tide: 0 });
    }
    const exit = this.level.stands[0].seals.find((s) => s.role === 'exit')!;
    this.exitSpot = exit.at.clone();
    this.resetStands();

    // post
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(scene, this.view.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.player.onHurt = (amount) => {
      this.hud.hurt();
      this.view.hurt(amount);
    };
    this.player.onDeath = () => this.die();
    this.input.onLockChange = (locked) => this.onLock(locked);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.player.spawn(this.level.spawn.position, this.level.spawn.yaw);
    this.syncKeys();
    this.hud.setMaxWords(this.caster.maxWords);
    this.hud.showTitle(this.knowledge, () => this.begin());
    this.view.update(0, this.player, false);

    // the sky and the hands arrive a moment later; nothing waits on them
    const assets = import.meta.env.BASE_URL + 'assets/';
    this.handsReady = this.view.loadHands(assets + 'hands/');
    void loadPhotoSky(scene, this.renderer, this.sky, { url: assets + 'sky/night.jpg', rotation: 2.2, backgroundIntensity: 0.26, lightIntensity: 0.5, fog: 0x211f2b });
  }

  /** The HUD keys and the marks on the hands both show which sigils are bound. */
  private syncKeys() {
    this.hud.setKeys(this.knowledge);
    this.view.setBound(this.knowledge.bound);
  }

  // ---- flow --------------------------------------------------------------------------------

  private begin() {
    this.hud.hideOverlay();
    this.mode = 'playing';
    this.input.requestLock();
    this.announce();
  }

  private announce() {
    this.hud.banner(this.level.name, this.level.night, 4);
    if (!this.knowledge.sigils.length) this.hud.whisper('Something glints in the dead hand beside you.');
  }

  private onLock(locked: boolean) {
    if (locked) {
      if (this.mode === 'paused') {
        this.hud.hideOverlay();
        this.mode = 'playing';
      }
    } else if (this.mode === 'playing' || this.mode === 'reading' || this.mode === 'book') {
      this.pause();
    }
  }

  private pause() {
    this.mode = 'paused';
    this.reading = null;
    this.hud.showPaused(this.knowledge, {
      resume: () => {
        if (this.input.lockUnavailable) {
          this.hud.hideOverlay();
          this.mode = 'playing';
        } else {
          this.input.requestLock();
        }
      },
      learnAll: () => {
        for (const id of ['fire', 'push', 'stone', 'wind'] as SigilId[]) learnSigil(this.knowledge, id);
        saveKnowledge(this.knowledge);
        this.syncKeys();
        this.pause();
      },
      forget: () => {
        this.knowledge = emptyKnowledge();
        saveKnowledge(this.knowledge);
        this.syncKeys();
        for (const j of this.journals) j.prop.setRead(false);
        this.respawn();
        this.pause();
      },
    });
  }

  private die() {
    this.mode = 'dead';
    this.deadClock = 0;
    this.caster.drop();
    this.knowledge.deaths++;
    saveKnowledge(this.knowledge);
    this.hud.showDeath(this.knowledge, this.player.cause);
  }

  /** Back to the body on the shore. The island forgets; you do not. */
  private respawn() {
    this.enemies.clear();
    this.spells.clear();
    this.caster.drop();
    this.resetStands();
    this.player.spawn(this.level.spawn.position, this.level.spawn.yaw);
    this.hud.setPlace('', '');
  }

  // ---- journals ----------------------------------------------------------------------------

  private read(def: JournalDef) {
    let learned: { id: SigilId; slot: number } | null = null;
    if (def.teaches) {
      const slot = learnSigil(this.knowledge, def.teaches);
      if (slot >= 0) learned = { id: def.teaches, slot };
      else if (!this.knowledge.journals.includes(def.id)) learned = null;
    }
    if (!this.knowledge.journals.includes(def.id)) this.knowledge.journals.push(def.id);
    saveKnowledge(this.knowledge);
    this.journals.find((j) => j.def === def)?.prop.setRead(true);
    this.syncKeys();
    this.caster.drop();
    this.reading = def;
    this.mode = 'reading';
    this.hud.showJournal(def, learned);
    if (learned) this.fx.flash(def.position.clone().setY(def.position.y + 0.6), SIGILS[learned.id].color, 30, 8, 1.2);
  }

  // ---- stands ------------------------------------------------------------------------------

  private setSeal(s: StandRun['seals'][number], up: boolean) {
    if (up && !s.collider) {
      s.collider = this.world.addCollider(s.prop.collision.clone());
      s.prop.mesh.visible = true;
    } else if (!up && s.collider) {
      this.world.removeCollider(s.collider);
      s.collider = null;
    }
    const pad = s.def.width / 2 + 2;
    this.nav.resample(s.def.at.x - pad, s.def.at.x + pad, s.def.at.z - pad, s.def.at.z + pad);
  }

  private resetStands() {
    for (const st of this.stands) {
      st.phase = 'waiting';
      st.wave = 0;
      st.queue = [];
      st.tide = 0;
      for (const s of st.seals) this.setSeal(s, s.role === 'exit');
    }
  }

  private startWave(st: StandRun) {
    st.phase = 'fighting';
    st.clock = 0;
    st.queue = st.def.waves[st.wave].map((g) => ({ ...g, count: g.count + (g.kind === 'drowned' ? st.tide : Math.floor(st.tide / 2)) }));
    this.hud.banner(st.wave === 0 ? 'The way is sealed' : `The tide returns`, `${st.def.name} · tide ${st.wave + 1} of ${st.def.waves.length}`, 2.6);
  }

  private updateStand(st: StandRun, dt: number) {
    const pl = this.player.position;
    const total = st.def.waves.length;
    if (st.phase === 'waiting') {
      if (Math.hypot(pl.x - st.def.center.x, pl.z - st.def.center.z) < st.def.radius) {
        for (const s of st.seals) this.setSeal(s, true);
        this.startWave(st);
      }
    } else if (st.phase === 'fighting') {
      st.clock += dt;
      for (let i = st.queue.length - 1; i >= 0; i--) {
        const g = st.queue[i];
        if (st.clock >= g.delay) {
          for (let k = 0; k < g.count; k++) this.enemies.spawn(g.kind, g.at);
          st.queue.splice(i, 1);
        }
      }
      const left = this.enemies.alive + st.queue.reduce((n, g) => n + g.count, 0);
      this.hud.setPlace(st.def.name, '', `${left} ${left === 1 ? 'remains' : 'remain'}`, Array.from({ length: total }, (_, i) => i < st.wave));
      if (left === 0) {
        st.wave++;
        st.clock = 0;
        if (st.wave >= total) {
          st.phase = 'won';
          for (const s of st.seals) this.setSeal(s, false);
          this.knowledge.standsWon++;
          saveKnowledge(this.knowledge);
          this.player.heal(35);
          this.hud.banner('The tide recedes', 'The way north is open', 4.5);
          this.hud.setPlace('', '');
        } else {
          st.phase = 'lull';
          this.hud.setPlace(st.def.name, '', 'The tide draws back…', Array.from({ length: total }, (_, i) => i < st.wave));
        }
      }
    } else if (st.phase === 'lull') {
      st.clock += dt;
      if (st.clock > 3.2) this.startWave(st);
    }
    // wards fade in and out
    for (const s of st.seals) {
      const m = s.prop.material;
      const want = s.collider ? 0.5 : 0;
      m.opacity += (want - m.opacity) * Math.min(1, dt * 3);
      if (m.map) m.map.offset.y = this.time * 0.05;
      if (!s.collider && m.opacity < 0.01) s.prop.mesh.visible = false;
    }
  }

  /** Call the tide again, harder: a way to keep fighting until the next biome exists. */
  private recall(st: StandRun) {
    st.tide++;
    st.wave = 0;
    this.player.position.copy(st.def.center).setY(st.def.center.y + 0.2);
    this.player.velocity.set(0, 0, 0);
    for (const s of st.seals) this.setSeal(s, true);
    this.startWave(st);
  }

  onEnemyDeath(_e: Enemy) {
    // charms will drop here
  }

  // ---- per-frame ---------------------------------------------------------------------------

  private handleInput() {
    const pressed = this.input.takePressed();
    const clicks = this.input.takeClicks();
    const [lx, ly] = this.input.takeLook();

    for (const code of pressed) {
      if (this.mode === 'reading') {
        if (code === 'KeyE' || code === 'Enter' || code === 'Space') {
          this.hud.hideOverlay();
          this.mode = 'playing';
          const st = this.stands[0];
          if (this.reading && this.knowledge.sigils.length === 1 && this.reading.teaches === 'fire') {
            this.hud.whisper('Press ↑ to speak it. Click to let it go.');
          } else if (st.phase === 'waiting' && this.reading?.teaches) {
            this.hud.whisper('Try the new word beside the ones you know.');
          }
          this.reading = null;
        }
        continue;
      }
      if (this.mode === 'book') {
        if (code === 'Tab' || code === 'KeyE') {
          this.hud.hideOverlay();
          this.mode = 'playing';
        }
        continue;
      }
      if (code === 'Escape' && this.input.lockUnavailable) {
        if (this.mode === 'playing') this.pause();
        else if (this.mode === 'paused') { this.hud.hideOverlay(); this.mode = 'playing'; }
        continue;
      }
      if (this.mode !== 'playing') continue;

      if (code in SIGIL_KEYS) {
        const slot = SIGIL_KEYS[code];
        this.hud.pressKey(slot);
        this.caster.speak(slot);
      } else if (code === 'Enter') {
        this.caster.cast();
      } else if (code === 'Backspace') {
        this.caster.drop();
      } else if (code === 'Tab') {
        this.mode = 'book';
        this.hud.showBook(this.knowledge);
      } else if (code === 'KeyE') {
        if (this.nearJournal) this.read(this.nearJournal);
        else if (this.atExit) this.recall(this.stands[0]);
      } else if (code === 'BracketLeft' || code === 'BracketRight') {
        this.sensitivity *= code === 'BracketLeft' ? 0.87 : 1.15;
        this.hud.whisper(`Look speed ${Math.round((this.sensitivity / SENSITIVITY) * 100)}%`);
      }
    }
    if (this.mode === 'playing') {
      if (clicks > 0) this.caster.cast();
      this.player.look(lx, ly, this.sensitivity);
    }
  }

  private step(dt: number) {
    this.time += dt;
    const playing = this.mode === 'playing';
    this.player.update(dt, this.input, this.world, playing);
    this.nav.setTarget(this.player.position.x, this.player.position.z);
    this.caster.update(dt);
    this.spells.update(dt);
    this.enemies.update(dt);
    for (const st of this.stands) this.updateStand(st, dt);

    // the sea does not let you leave
    if (this.player.alive && this.player.position.y < this.world.waterLevel - 1.15) {
      this.seaClock += dt;
      if (this.seaClock > 0.5) {
        this.seaClock = 0;
        this.player.position.copy(this.player.lastSafe);
        this.player.velocity.set(0, 0, 0);
        this.player.damage(12, 'The sea kept you.');
        this.hud.whisper('The sea throws you back onto the sand.');
      }
    } else {
      this.seaClock = 0;
    }

    // what can be used from here
    let near: JournalDef | null = null;
    for (const j of this.journals) {
      j.prop.update(this.time);
      const d = j.def.position.distanceTo(this.player.position);
      if (d < 2.7) near = j.def;
    }
    this.nearJournal = near;
    const st = this.stands[0];
    this.atExit = st.phase === 'won' && this.player.position.distanceTo(this.exitSpot) < 5;
    if (!playing) this.hud.setPrompt('');
    else if (near) this.hud.setPrompt(`<kbd>E</kbd> ${this.knowledge.journals.includes(near.id) ? 'Read the page again' : 'Read the journal'}`);
    else if (this.atExit) this.hud.setPrompt('<kbd>E</kbd> The Salt Marsh is not built yet. Call the tide again, stronger');
    else this.hud.setPrompt('');

    if (this.mode === 'dead') {
      this.deadClock += dt;
      if (this.deadClock > 3.4) {
        this.respawn();
        this.hud.hideOverlay();
        this.mode = 'playing';
        this.announce();
      }
    }
  }

  private frame(dt: number) {
    this.handleInput();
    const simulate = this.mode === 'playing' || this.mode === 'dead';
    if (simulate) {
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator >= STEP) {
        this.step(STEP);
        this.accumulator -= STEP;
      }
    }
    this.present(dt);
  }

  private present(dt: number) {
    const cam = this.view.camera;
    this.view.update(dt, this.player, this.caster.sentence.length > 0);
    this.fx.update(this.mode === 'playing' || this.mode === 'dead' ? dt : 0);
    this.level.update?.(this.time, dt);
    this.sky.update(cam);
    const p = this.player.position;
    this.sky.key.position.copy(p).addScaledVector(this.sky.keyDir, 90);
    this.sky.key.target.position.copy(p);
    this.hud.update(dt, this.player.health, this.player.focus);
    this.composer.render();
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.view.camera.aspect = w / h;
    this.view.camera.updateProjectionMatrix();
    this.fx.resize(h * this.renderer.getPixelRatio(), this.view.baseFov);
  }

  run() {
    const tick = (now: number) => {
      const dt = this.last ? (now - this.last) / 1000 : STEP;
      this.last = now;
      if (!this.manual) this.frame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---- hooks for tests and tuning ----------------------------------------------------------

  readonly debug = {
    /** Advance the simulation by this many seconds, ignoring real time. */
    advance: (seconds: number) => {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) {
        this.handleInput();
        if (this.mode === 'playing' || this.mode === 'dead') this.step(STEP);
        this.view.update(STEP, this.player, this.caster.sentence.length > 0);
        this.fx.update(STEP);
      }
    },
    /** Draw one frame now. */
    render: () => this.present(0),
    /** Draw one frame and hand it back as a JPEG data URL (3D view only, no HUD). */
    capture: (): string => {
      this.present(0);
      return this.renderer.domElement.toDataURL('image/jpeg', 0.86);
    },
    start: () => {
      this.manual = true;
      this.input.lockUnavailable = true;
      this.hud.hideOverlay();
      this.mode = 'playing';
    },
    learnAll: () => {
      for (const id of ['fire', 'push', 'stone', 'wind'] as SigilId[]) learnSigil(this.knowledge, id);
      this.syncKeys();
    },
    teleport: (x: number, z: number, yaw?: number, pitch?: number) => {
      const y = this.world.groundAt(x, z) ?? 0;
      this.player.position.set(x, y + 0.05, z);
      this.player.velocity.set(0, 0, 0);
      if (yaw !== undefined) this.player.yaw = yaw;
      if (pitch !== undefined) this.player.pitch = pitch;
    },
    lookAt: (x: number, y: number, z: number) => {
      const e = this.player.eye;
      const dx = x - e.x, dy = y - e.y, dz = z - e.z;
      this.player.yaw = Math.atan2(-dx, -dz);
      this.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    spawn: (kind: 'drowned' | 'spitter', x: number, z: number) => {
      const y = this.world.groundAt(x, z) ?? 0;
      return this.enemies.spawn(kind, new THREE.Vector3(x, y, z));
    },
    /**
     * Freeze the hands in named poses: "idle", "hold:fire", or "beat:thrust:0" (a gesture and
     * which of its beats). Used to draw the pose sheet.
     */
    hands: (left: string, right: string) => {
      const find = (key: string, lead: boolean): { pose: ArmPose; held: SigilId | null } => {
        const [kind, name, n] = key.split(':');
        if (kind === 'hold') return { pose: HOLD[name as SigilId], held: name as SigilId };
        if (kind === 'beat') {
          const b = GESTURES[name as GestureName][Number(n)];
          return { pose: (lead ? b.lead : b.other) ?? b.lead ?? IDLE, held: null };
        }
        return { pose: IDLE, held: null };
      };
      const l = find(left, true), r = find(right, false);
      this.view.debugPose(l.pose, r.pose, l.held, r.held);
    },
    say: (...words: SigilId[]) => {
      for (const w of words) {
        const slot = this.knowledge.bound.indexOf(w);
        this.caster.busy = 0;
        this.caster.speak(slot);
      }
      this.caster.busy = 0;
      this.caster.cast();
    },
  };
}
