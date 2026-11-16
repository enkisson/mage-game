// What survives death: the words you know and the sentences you have found.
import type { SigilId } from '../magic/sigils';

export interface Knowledge {
  /** Sigils learned, in the order they were learned. */
  sigils: SigilId[];
  /** Canonical keys of sentences spoken at least once. */
  sentences: string[];
  /** Journal pages read. */
  journals: string[];
  /** Which sigil sits on each arrow key: up, left, right, down. */
  bound: (SigilId | null)[];
  deaths: number;
  standsWon: number;
}

const KEY = 'gloamtide.knowledge.v1';

/** Where a sigil prefers to sit, so the keys feel the same from run to run. */
const PREFERRED_SLOT: Partial<Record<SigilId, number>> = { fire: 0, wind: 1, push: 2, stone: 3 };

export function emptyKnowledge(): Knowledge {
  return { sigils: [], sentences: [], journals: [], bound: [null, null, null, null], deaths: 0, standsWon: 0 };
}

export function loadKnowledge(): Knowledge {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyKnowledge();
    return { ...emptyKnowledge(), ...JSON.parse(raw) };
  } catch {
    return emptyKnowledge();
  }
}

export function saveKnowledge(k: Knowledge) {
  try {
    localStorage.setItem(KEY, JSON.stringify(k));
  } catch {
    // storage can be unavailable (private windows, embedded views); the run still works
  }
}

/** Learn a sigil and put it on a free arrow key. Returns the slot, or -1 if it was already known. */
export function learnSigil(k: Knowledge, id: SigilId): number {
  if (k.sigils.includes(id)) return -1;
  k.sigils.push(id);
  let slot = PREFERRED_SLOT[id] ?? -1;
  if (slot < 0 || k.bound[slot]) slot = k.bound.indexOf(null);
  if (slot >= 0) k.bound[slot] = id;
  return slot;
}
