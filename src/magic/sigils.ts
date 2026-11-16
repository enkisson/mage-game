// The words of magic. Four are matter (what a spell is made of), four are intent (what it does).

export type SigilId = 'fire' | 'ice' | 'stone' | 'wind' | 'push' | 'pull' | 'bind' | 'break';

export interface SigilDef {
  id: SigilId;
  name: string;
  kind: 'matter' | 'intent';
  color: number;
  /** One line in the mage's voice, shown when the word is learned. */
  meaning: string;
  /** Rune drawn on a 64×64 grid, as SVG path data. */
  glyph: string;
  /** Built into the game yet? The plan describes all eight; the first slice has four. */
  ready: boolean;
}

export const SIGILS: Record<SigilId, SigilDef> = {
  fire: {
    id: 'fire', name: 'Fire', kind: 'matter', color: 0xff7a1a, ready: true,
    meaning: 'The first word. It wants to spread; let it.',
    glyph: 'M32 6 L52 52 L32 40 L12 52 Z M32 24 L38 40 L32 36 L26 40 Z',
  },
  ice: {
    id: 'ice', name: 'Ice', kind: 'matter', color: 0x62d8ff, ready: false,
    meaning: 'Stillness, given an edge.',
    glyph: 'M32 6 L32 58 M9.5 19 L54.5 45 M9.5 45 L54.5 19 M24 10 L32 18 L40 10 M24 54 L32 46 L40 54',
  },
  stone: {
    id: 'stone', name: 'Stone', kind: 'matter', color: 0xd9a35a, ready: true,
    meaning: 'The island itself answers, slowly, and does not take it back.',
    glyph: 'M14 50 L10 28 L26 10 L44 12 L54 30 L48 50 Z M26 10 L30 30 L54 30 M30 30 L22 50',
  },
  wind: {
    id: 'wind', name: 'Wind', kind: 'matter', color: 0xcfe3ee, ready: true,
    meaning: 'Nothing to hold, and so nothing can hold it.',
    glyph: 'M8 20 L42 20 L52 10 M8 32 L56 32 M8 44 L38 44 L48 54',
  },
  push: {
    id: 'push', name: 'Push', kind: 'intent', color: 0xb69cff, ready: true,
    meaning: 'Away. The simplest thing you can ask of the world.',
    glyph: 'M12 12 L32 32 L12 52 M32 12 L52 32 L32 52',
  },
  pull: {
    id: 'pull', name: 'Pull', kind: 'intent', color: 0xb69cff, ready: false,
    meaning: 'Toward. Be sure you want what arrives.',
    glyph: 'M10 12 L28 32 L10 52 M54 12 L36 32 L54 52',
  },
  bind: {
    id: 'bind', name: 'Bind', kind: 'intent', color: 0xb69cff, ready: false,
    meaning: 'Stay. A promise made on something else’s behalf.',
    glyph: 'M32 8 L56 32 L32 56 L8 32 Z M32 22 L42 32 L32 42 L22 32 Z',
  },
  break: {
    id: 'break', name: 'Break', kind: 'intent', color: 0xb69cff, ready: false,
    meaning: 'What is held too tightly comes apart.',
    glyph: 'M34 6 L24 26 L40 34 L28 58 M10 22 L20 28 M54 40 L44 36',
  },
};

export const SIGIL_ORDER: SigilId[] = ['fire', 'ice', 'stone', 'wind', 'push', 'pull', 'bind', 'break'];

export const hexColor = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function glyphSvg(id: SigilId, strokeWidth = 4): string {
  const s = SIGILS[id];
  return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="miter" stroke-linecap="square"><path d="${s.glyph}"/></svg>`;
}
