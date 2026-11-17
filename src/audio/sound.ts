// Sound, all of it made here: there are no audio files. Everything is built from filtered
// noise and a few oscillators, shaped by envelopes, placed left or right and nearer or
// farther by where it happens in the world.
//
// Browsers only allow sound after the player has done something, so nothing exists until
// `wake` is called from a click or key press. Before that every call does nothing.
import type * as THREE from 'three';
import type { SigilId } from '../magic/sigils';
import type { SpellDef } from '../magic/grammar';

type Place = THREE.Vector3 | null;

interface NoiseShot {
  /** Seconds. */
  dur: number;
  type?: BiquadFilterType;
  /** Filter frequency at the start and at the end. */
  f0: number;
  f1?: number;
  q?: number;
  gain: number;
  attack?: number;
  /** Seconds from now. */
  when?: number;
  at?: Place;
}

interface ToneShot {
  dur: number;
  wave?: OscillatorType;
  f0: number;
  f1?: number;
  gain: number;
  attack?: number;
  when?: number;
  at?: Place;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private sea!: { gain: GainNode; filter: BiquadFilterNode };
  private wind!: { gain: GainNode; filter: BiquadFilterNode };
  private hum!: { gain: GainNode; osc: OscillatorNode; filter: BiquadFilterNode };
  private ear = { x: 0, y: 0, z: 0, yaw: 0 };
  private clock = 0;
  private swell = 0;
  muted = false;

  /** Start the sound. Call from a click or a key press. Safe to call again. */
  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      this.ctx = ctx;
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -16;
      squash.ratio.value = 5;
      squash.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(squash);

      // two seconds of noise, shared by everything that hisses, roars or rumbles
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        // a little weight toward the low end, so it is surf and not static
        last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = last * 1.8;
      }
      const bed = (freq: number, q: number, type: BiquadFilterType) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(this.master);
        src.start();
        return { gain, filter };
      };
      this.sea = bed(480, 0.4, 'lowpass');
      this.wind = bed(520, 1.6, 'bandpass');
      // the low note a held word makes
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.hum = { gain, osc, filter };
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Where the listener is, how near the sea, how exposed to the wind, and what is held. */
  update(dt: number, ear: THREE.Vector3, yaw: number, shore: number, height: number, held: number) {
    this.ear.x = ear.x; this.ear.y = ear.y; this.ear.z = ear.z; this.ear.yaw = yaw;
    if (!this.ctx) return;
    this.clock += dt;
    const t = this.ctx.currentTime;
    // waves come in sets: a long slow swell with a quicker one riding it
    this.swell = 0.55 + 0.3 * Math.sin(this.clock * 0.52) + 0.15 * Math.sin(this.clock * 1.37 + 1);
    this.sea.gain.gain.setTargetAtTime(0.4 * shore * this.swell, t, 0.25);
    this.sea.filter.frequency.setTargetAtTime(300 + 500 * this.swell, t, 0.3);
    const gust = 0.5 + 0.3 * Math.sin(this.clock * 0.31 + 2) + 0.2 * Math.sin(this.clock * 0.83);
    this.wind.gain.gain.setTargetAtTime((0.035 + 0.07 * height) * gust, t, 0.4);
    this.wind.filter.frequency.setTargetAtTime(380 + 420 * gust, t, 0.5);
    this.hum.gain.gain.setTargetAtTime(0.05 * held, t, 0.12);
    this.hum.filter.frequency.setTargetAtTime(160 + 240 * held, t, 0.2);
  }

  /** Left or right, and how loud, for a sound made at a place in the world. */
  private place(at: Place | undefined): { pan: number; level: number } {
    if (!at) return { pan: 0, level: 1 };
    const dx = at.x - this.ear.x, dy = at.y - this.ear.y, dz = at.z - this.ear.z;
    const d = Math.hypot(dx, dy, dz);
    // to the listener's right is +x after undoing their turn
    const right = dx * Math.cos(this.ear.yaw) - dz * Math.sin(this.ear.yaw);
    return { pan: Math.max(-1, Math.min(1, (right / Math.max(d, 1)) * 0.85)), level: 1 / (1 + d * d * 0.012) };
  }

  private out(at: Place | undefined, gain: number): { node: AudioNode; level: number } {
    const ctx = this.ctx!;
    const p = this.place(at);
    const pan = ctx.createStereoPanner();
    pan.pan.value = p.pan;
    pan.connect(this.master);
    return { node: pan, level: gain * p.level };
  }

  private noise(n: NoiseShot) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (n.when ?? 0);
    const { node, level } = this.out(n.at, n.gain);
    if (level < 0.002) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = n.type ?? 'bandpass';
    filter.Q.value = n.q ?? 0.8;
    filter.frequency.setValueAtTime(n.f0, t);
    if (n.f1) filter.frequency.exponentialRampToValueAtTime(n.f1, t + n.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + (n.attack ?? 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    src.connect(filter).connect(gain).connect(node);
    src.start(t, Math.random() * 1.5);
    src.stop(t + n.dur + 0.05);
  }

  private tone(n: ToneShot) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (n.when ?? 0);
    const { node, level } = this.out(n.at, n.gain);
    if (level < 0.002) return;
    const osc = ctx.createOscillator();
    osc.type = n.wave ?? 'sine';
    osc.frequency.setValueAtTime(n.f0, t);
    if (n.f1) osc.frequency.exponentialRampToValueAtTime(n.f1, t + n.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + (n.attack ?? 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    osc.connect(gain).connect(node);
    osc.start(t);
    osc.stop(t + n.dur + 0.05);
  }

  // ---- the words -------------------------------------------------------------------------

  /** A sigil forms in the hand. Each has its own voice. */
  speak(id: SigilId, second: boolean) {
    const up = second ? 1.26 : 1;
    switch (id) {
      case 'fire':
        this.noise({ dur: 0.35, f0: 500, f1: 3200, q: 0.9, gain: 0.3, attack: 0.02 });
        for (let i = 0; i < 5; i++) this.noise({ dur: 0.03, type: 'highpass', f0: 2500 + Math.random() * 3000, gain: 0.2, when: 0.05 + Math.random() * 0.3 });
        this.tone({ dur: 0.5, f0: 196 * up, f1: 262 * up, gain: 0.07, attack: 0.03 });
        break;
      case 'stone':
        this.tone({ dur: 0.4, f0: 92, f1: 52, gain: 0.5, attack: 0.005 });
        this.noise({ dur: 0.3, type: 'lowpass', f0: 500, f1: 120, gain: 0.5, attack: 0.01 });
        this.tone({ dur: 0.5, f0: 110 * up, gain: 0.07, wave: 'triangle' });
        break;
      case 'wind':
        this.noise({ dur: 0.5, f0: 900, f1: 4200, q: 3, gain: 0.3, attack: 0.08 });
        this.tone({ dur: 0.5, f0: 392 * up, f1: 523 * up, gain: 0.05, attack: 0.08 });
        break;
      case 'push':
        this.tone({ dur: 0.35, f0: 150, f1: 62, gain: 0.5, attack: 0.004 });
        this.noise({ dur: 0.18, type: 'lowpass', f0: 900, f1: 200, gain: 0.25 });
        this.tone({ dur: 0.5, f0: 147 * up, gain: 0.06, wave: 'triangle' });
        break;
      default:
        this.tone({ dur: 0.4, f0: 220 * up, gain: 0.08 });
    }
  }

  /** An unfinished sentence let go. */
  drop() {
    this.noise({ dur: 0.25, f0: 1800, f1: 400, q: 1, gain: 0.12 });
  }

  /** The spell leaves the hands. */
  cast(spell: SpellDef) {
    const e = spell.effect;
    const fire = spell.words.includes('fire'), stone = spell.words.includes('stone');
    switch (e.kind) {
      case 'bolt':
        if (stone && !fire) {
          this.noise({ dur: 0.3, type: 'lowpass', f0: 700, f1: 150, gain: 0.6 });
          this.tone({ dur: 0.25, f0: 120, f1: 55, gain: 0.5 });
        } else {
          this.noise({ dur: 0.5, f0: 2400, f1: 300, q: 0.7, gain: 0.55, attack: 0.01 });
          this.tone({ dur: 0.3, f0: 180, f1: 70, gain: 0.35 });
        }
        break;
      case 'lance':
        this.noise({ dur: 0.35, type: 'highpass', f0: 1200, f1: 5000, gain: 0.45, attack: 0.005 });
        this.noise({ dur: 0.5, f0: 2600, f1: 600, q: 4, gain: 0.3 });
        break;
      case 'cone':
        this.noise({ dur: 0.8, f0: fire ? 1400 : 900, f1: 180, q: 0.5, gain: 0.8, attack: 0.02 });
        this.tone({ dur: 0.5, f0: 110, f1: 40, gain: 0.6 });
        if (fire) this.noise({ dur: 1.1, type: 'lowpass', f0: 900, f1: 200, gain: 0.4, attack: 0.1 });
        break;
      case 'ring':
        this.tone({ dur: 0.9, f0: 95, f1: 30, gain: 0.9, attack: 0.004 });
        this.noise({ dur: 0.9, type: 'lowpass', f0: 1600, f1: 90, gain: 0.7 });
        this.tone({ dur: 1.2, f0: 440, f1: 220, gain: 0.07, wave: 'triangle' });
        break;
      case 'zone':
        this.noise({ dur: 1.0, type: 'lowpass', f0: 300, f1: 1100, gain: 0.5, attack: 0.15 });
        this.tone({ dur: 0.8, f0: 70, f1: 48, gain: 0.5, attack: 0.05 });
        break;
      case 'pillar':
        this.noise({ dur: 1.3, type: 'lowpass', f0: 180, f1: 420, gain: 0.9, attack: 0.08 });
        this.tone({ dur: 1.1, f0: 46, f1: 62, gain: 0.7, attack: 0.1 });
        for (let i = 0; i < 6; i++) this.noise({ dur: 0.06, f0: 1200 + Math.random() * 1500, q: 2, gain: 0.25, when: 0.1 + Math.random() * 0.9 });
        break;
      case 'updraft':
        this.noise({ dur: 1.4, f0: 300, f1: 3200, q: 1.5, gain: 0.6, attack: 0.2 });
        break;
    }
  }

  // ---- the world -------------------------------------------------------------------------

  /** Something bursts. `power` is roughly its radius in metres. */
  blast(at: Place, power: number) {
    const p = Math.min(1.6, 0.5 + power * 0.35);
    this.tone({ dur: 0.7 * p, f0: 140, f1: 32, gain: 0.9 * p, attack: 0.003, at });
    this.noise({ dur: 0.9 * p, type: 'lowpass', f0: 2600, f1: 80, gain: 0.9 * p, attack: 0.003, at });
    this.noise({ dur: 1.6 * p, type: 'lowpass', f0: 400, f1: 60, gain: 0.3 * p, attack: 0.2, at });
  }

  /** A footfall. */
  step(wood: boolean, hard: number) {
    if (wood) {
      this.tone({ dur: 0.09, f0: 130 + Math.random() * 30, f1: 80, gain: 0.16 * hard, wave: 'triangle' });
      this.noise({ dur: 0.05, f0: 900, q: 1.5, gain: 0.1 * hard });
    } else {
      this.noise({ dur: 0.13, f0: 1500 + Math.random() * 500, f1: 600, q: 0.7, gain: 0.11 * hard, attack: 0.012 });
      this.noise({ dur: 0.07, type: 'lowpass', f0: 220, gain: 0.12 * hard });
    }
  }

  /** Landing from a jump or a fall. */
  land(speed: number) {
    const h = Math.min(1, speed / 14);
    this.tone({ dur: 0.18, f0: 90, f1: 45, gain: 0.3 + h * 0.5 });
    this.noise({ dur: 0.2, type: 'lowpass', f0: 800, f1: 200, gain: 0.2 + h * 0.4 });
  }

  /** The player is struck. */
  hurt(amount: number) {
    const h = Math.min(1, 0.4 + amount / 40);
    this.tone({ dur: 0.22, f0: 160, f1: 60, gain: 0.7 * h, attack: 0.002 });
    this.noise({ dur: 0.12, type: 'lowpass', f0: 1500, f1: 300, gain: 0.5 * h });
  }

  /** The dead crew: rising, groaning, striking, struck, falling. */
  creature(what: 'rise' | 'groan' | 'strike' | 'hit' | 'die' | 'spit', at: Place) {
    switch (what) {
      case 'rise':
        // wet sand giving way, and the breath it has not drawn in weeks
        this.noise({ dur: 0.9, type: 'lowpass', f0: 300, f1: 900, gain: 0.5, attack: 0.1, at });
        this.tone({ dur: 1.1, wave: 'sawtooth', f0: 58, f1: 82, gain: 0.12, attack: 0.3, at });
        break;
      case 'groan': {
        const f = 62 + Math.random() * 30;
        this.tone({ dur: 1.2, wave: 'sawtooth', f0: f, f1: f * 0.8, gain: 0.1, attack: 0.25, at });
        this.noise({ dur: 1.0, f0: 420, f1: 300, q: 5, gain: 0.12, attack: 0.3, at });
        break;
      }
      case 'strike':
        this.noise({ dur: 0.22, f0: 700, f1: 2400, q: 1.2, gain: 0.4, attack: 0.03, at });
        this.tone({ dur: 0.3, wave: 'sawtooth', f0: 110, f1: 70, gain: 0.12, at });
        break;
      case 'hit':
        this.tone({ dur: 0.14, f0: 170, f1: 70, gain: 0.5, attack: 0.002, at });
        this.noise({ dur: 0.1, type: 'lowpass', f0: 1800, f1: 400, gain: 0.4, at });
        break;
      case 'die':
        this.tone({ dur: 0.9, wave: 'sawtooth', f0: 95, f1: 38, gain: 0.16, attack: 0.02, at });
        this.noise({ dur: 0.5, type: 'lowpass', f0: 500, f1: 120, gain: 0.5, when: 0.35, at });
        break;
      case 'spit':
        this.noise({ dur: 0.3, f0: 500, f1: 1800, q: 2.5, gain: 0.5, attack: 0.04, at });
        this.tone({ dur: 0.25, wave: 'sawtooth', f0: 80, f1: 130, gain: 0.1, at });
        break;
    }
  }

  // ---- the journals and the tide -------------------------------------------------------------

  /** A page is turned. */
  page() {
    this.noise({ dur: 0.28, type: 'highpass', f0: 1800, f1: 4500, gain: 0.16, attack: 0.05 });
    this.noise({ dur: 0.1, type: 'highpass', f0: 3000, gain: 0.12, when: 0.22 });
  }

  /** A new word, or a sentence of your own: a few rising notes. */
  discovery() {
    [262, 330, 392, 523].forEach((f, i) => {
      this.tone({ dur: 1.2, f0: f, gain: 0.09, attack: 0.02, when: i * 0.09, wave: 'triangle' });
      this.tone({ dur: 1.2, f0: f * 2.005, gain: 0.03, attack: 0.02, when: i * 0.09 });
    });
  }

  /** The wards close: the way is sealed, and the tide is coming. */
  seal() {
    this.tone({ dur: 2.6, f0: 73, gain: 0.5, attack: 0.01 });
    this.tone({ dur: 2.2, f0: 110.4, gain: 0.25, attack: 0.01, wave: 'triangle' });
    this.tone({ dur: 1.8, f0: 219, gain: 0.08, attack: 0.02 });
    this.noise({ dur: 1.5, type: 'lowpass', f0: 600, f1: 100, gain: 0.3, attack: 0.02 });
  }

  /** The tide is beaten and the way opens. */
  release() {
    [196, 247, 294, 392].forEach((f, i) => this.tone({ dur: 1.8, f0: f, gain: 0.1, attack: 0.05, when: i * 0.16, wave: 'triangle' }));
  }

  /** You died. */
  death() {
    this.tone({ dur: 2.4, f0: 110, f1: 36, gain: 0.6, attack: 0.02, wave: 'triangle' });
    this.noise({ dur: 2.0, type: 'lowpass', f0: 900, f1: 60, gain: 0.5, attack: 0.05 });
  }
}
