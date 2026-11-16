// Sentences. A sentence is one to three sigils; what it means is looked up here.
// This file is pure data and logic (no rendering), so it can be tested on its own.
import { SIGILS, SIGIL_ORDER, type SigilId } from './sigils';

export type Visual = 'fire' | 'stone' | 'wind' | 'force';

export interface Status {
  /** Damage per second and for how long. */
  burn?: { dps: number; time: number };
  /** Seconds unable to act. */
  stagger?: number;
  /** Seconds unable to find the player. */
  blind?: number;
  /** Movement multiplier and for how long. */
  slow?: { factor: number; time: number };
}

export type Effect =
  /** Something thrown along the aim. */
  | {
      kind: 'bolt'; visual: Visual; speed: number; gravity: number; size: number; range: number;
      damage: number; status?: Status; knock?: number;
      /** Burst on impact. */
      blast?: { radius: number; damage: number; knock: number; lift?: number };
      /** On hit, leap to this many other creatures nearby. */
      chain?: { count: number; radius: number; damage: number };
      /** Leaves this behind where it lands. */
      leaves?: Zone;
    }
  /** An instant line through everything in front of you. */
  | { kind: 'lance'; visual: Visual; range: number; width: number; damage: number; knock: number; status?: Status }
  /** A wave in a cone in front of you. */
  | { kind: 'cone'; visual: Visual; length: number; halfAngle: number; damage: number; knock: number; lift: number; status?: Status }
  /** A ring around you. */
  | { kind: 'ring'; visual: Visual; radius: number; damage: number; knock: number; lift: number; status?: Status }
  /** A lingering area conjured where you aim. */
  | { kind: 'zone'; range: number; zone: Zone }
  /** Solid ground raised where you aim. */
  | { kind: 'pillar'; range: number; radius: number; height: number; duration: number; damage: number; lift: number }
  /** A column of rising air where you aim. */
  | { kind: 'updraft'; range: number; radius: number; duration: number; kick: number; lift: number };

export interface Zone {
  visual: Visual | 'magma' | 'sand';
  radius: number;
  duration: number;
  dps: number;
  status?: Status;
}

export interface SpellDef {
  /** Canonical sentence, e.g. "fire+push". */
  key: string;
  name: string;
  words: SigilId[];
  cost: number;
  /** Seconds before you can speak again. */
  recovery: number;
  /** What it does, as the player's own journal records it. */
  text: string;
  /** Written in the mage's journals. The Hollow Warden turns these aside. */
  authored: boolean;
  effect: Effect;
}

export const MAX_WORDS = 3;
const COST = [0, 15, 35, 60];

/** Sentences are stored in a fixed sigil order, so "push fire" and "fire push" are the same thought. */
export function sentenceKey(words: SigilId[]): string {
  return [...words].sort((a, b) => SIGIL_ORDER.indexOf(a) - SIGIL_ORDER.indexOf(b)).join('+');
}

type Entry = Omit<SpellDef, 'key' | 'words' | 'cost'> & { cost?: number };

const BURN = { dps: 6, time: 4 };

const BOOK: Record<string, Entry> = {
  // ---- one word ------------------------------------------------------------------------
  fire: {
    name: 'Firebolt', authored: true, recovery: 0.35,
    text: 'A bolt of flame. Sets what it strikes alight.',
    effect: { kind: 'bolt', visual: 'fire', speed: 42, gravity: 0, size: 0.16, range: 70, damage: 34, status: { burn: BURN }, blast: { radius: 1.6, damage: 10, knock: 2 } },
  },
  stone: {
    name: 'Boulder', authored: true, recovery: 0.5,
    text: 'A thrown rock, heavy enough to put a creature on its back.',
    effect: { kind: 'bolt', visual: 'stone', speed: 26, gravity: 14, size: 0.34, range: 60, damage: 52, status: { stagger: 1.4 }, knock: 9 },
  },
  wind: {
    name: 'Gust Blade', authored: true, recovery: 0.3,
    text: 'A cutting line of air that passes through everything in its way.',
    effect: { kind: 'lance', visual: 'wind', range: 34, width: 0.9, damage: 24, knock: 4 },
  },
  push: {
    name: 'Shove', authored: true, recovery: 0.35,
    text: 'Throws back whatever stands in front of you. Does no harm itself; the landing does.',
    effect: { kind: 'cone', visual: 'force', length: 8, halfAngle: 0.55, damage: 0, knock: 15, lift: 4, status: { stagger: 0.6 } },
  },

  // ---- the same word twice ---------------------------------------------------------------
  'fire+fire': {
    name: 'Fireball', authored: true, recovery: 0.75,
    text: 'A slow, heavy blast that burns a wide circle and leaves the ground alight.',
    effect: {
      kind: 'bolt', visual: 'fire', speed: 24, gravity: 5, size: 0.42, range: 70, damage: 30, status: { burn: BURN },
      blast: { radius: 4.2, damage: 46, knock: 7, lift: 3 },
      leaves: { visual: 'fire', radius: 3, duration: 3, dps: 8, status: { burn: { dps: 6, time: 2 } } },
    },
  },
  'stone+stone': {
    name: 'Pillar', authored: true, recovery: 0.7,
    text: 'The ground rises where you look, or under your own feet. It throws off whatever stood there, and stands for a while.',
    effect: { kind: 'pillar', range: 20, radius: 1.5, height: 3.3, duration: 14, damage: 12, lift: 9 },
  },
  'wind+wind': {
    name: 'Updraft', authored: true, recovery: 0.6,
    text: 'A column of rising air. Step into it to be carried up; put it under them and let them fall.',
    effect: { kind: 'updraft', range: 20, radius: 2.6, duration: 1.8, kick: 12.5, lift: 20 },
  },
  'push+push': {
    name: 'Shockwave', authored: false, recovery: 0.85,
    text: 'Everything near you is thrown outward and off its feet.',
    effect: { kind: 'ring', visual: 'force', radius: 7.5, damage: 8, knock: 17, lift: 6, status: { stagger: 1.1 } },
  },

  // ---- two words -------------------------------------------------------------------------
  'fire+push': {
    name: 'Flame Wave', authored: false, recovery: 0.7,
    text: 'A wall of fire rolls out from your hands, burning and hurling back all it reaches.',
    effect: { kind: 'cone', visual: 'fire', length: 10, halfAngle: 0.6, damage: 30, knock: 11, lift: 3, status: { burn: BURN, stagger: 0.4 } },
  },
  'fire+stone': {
    name: 'Magma', authored: false, recovery: 0.75,
    text: 'A pool of molten rock where you look. Whatever wades through it burns and slows.',
    effect: { kind: 'zone', range: 22, zone: { visual: 'magma', radius: 3.6, duration: 8, dps: 16, status: { burn: { dps: 6, time: 2 }, slow: { factor: 0.5, time: 0.6 } } } },
  },
  'fire+wind': {
    name: 'Wildfire', authored: false, recovery: 0.6,
    text: 'A fast flame that leaps from the creature it strikes to those around it.',
    effect: { kind: 'bolt', visual: 'fire', speed: 60, gravity: 0, size: 0.14, range: 70, damage: 26, status: { burn: BURN }, chain: { count: 4, radius: 7.5, damage: 20 } },
  },
  'stone+push': {
    name: 'Rockslide', authored: false, recovery: 0.8,
    text: 'A ram of stone bursts forward along the ground, breaking whatever is lined up before you.',
    effect: { kind: 'cone', visual: 'stone', length: 13, halfAngle: 0.3, damage: 44, knock: 16, lift: 4, status: { stagger: 1.5 } },
  },
  'stone+wind': {
    name: 'Sandstorm', authored: false, recovery: 0.7,
    text: 'A whirling cloud of grit. Creatures inside it cannot find you.',
    effect: { kind: 'zone', range: 24, zone: { visual: 'sand', radius: 5.5, duration: 7, dps: 5, status: { blind: 1.0, slow: { factor: 0.7, time: 0.6 } } } },
  },
  'wind+push': {
    name: 'Gale', authored: false, recovery: 0.75,
    text: 'A great wind that lifts and carries off everything before you. Harmless, unless there is an edge.',
    effect: { kind: 'cone', visual: 'wind', length: 15, halfAngle: 0.8, damage: 0, knock: 23, lift: 7, status: { stagger: 0.9 } },
  },
};

export type Resolution =
  | { ok: true; spell: SpellDef }
  | { ok: false; reason: 'empty' | 'too-long' | 'unformed' };

/** What does this sentence mean? `maxWords` is how many words the speaker can hold at once. */
export function resolve(words: SigilId[], maxWords = 2): Resolution {
  if (words.length === 0) return { ok: false, reason: 'empty' };
  if (words.length > maxWords || words.length > MAX_WORDS) return { ok: false, reason: 'too-long' };
  if (words.some((w) => !SIGILS[w].ready)) return { ok: false, reason: 'unformed' };
  const key = sentenceKey(words);
  const entry = BOOK[key];
  if (!entry) return { ok: false, reason: 'unformed' };
  return { ok: true, spell: { ...entry, key, words: key.split('+') as SigilId[], cost: entry.cost ?? COST[words.length] } };
}

/** Every sentence that can be formed from a set of known sigils. */
export function sentencesFor(known: SigilId[], maxWords = 2): SpellDef[] {
  const out: SpellDef[] = [];
  const seen = new Set<string>();
  const ordered = SIGIL_ORDER.filter((s) => known.includes(s));
  const visit = (words: SigilId[]) => {
    if (words.length > 0) {
      const r = resolve(words, maxWords);
      if (r.ok && !seen.has(r.spell.key)) {
        seen.add(r.spell.key);
        out.push(r.spell);
      }
    }
    if (words.length >= maxWords) return;
    for (const s of ordered) visit([...words, s]);
  };
  visit([]);
  return out.sort((a, b) => a.words.length - b.words.length || a.key.localeCompare(b.key));
}
