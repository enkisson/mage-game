// Placement data for the rocks and reef standing out of the sea off the Wreck Shore. Pure data:
// no imports, so the surf can read it without pulling in any geometry. Everything here that
// breaks the surface is also listed in SEA_ROCKS with its footprint radius r and height h above
// sea level, so the surf can raise foam around it.
// World frame: x east, y up, z south (toward the open sea).

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export interface StackSpec {
  x: number; z: number;
  /** Height above the sea, metres. */
  h: number;
  /** Radius at the waterline, before the foot flares. */
  r: number;
  seed: number;
  /** Lean in metres sideways per metre of height (x, z). */
  lean?: [number, number];
  /** Slope of a flat fracture cut across the top (m per m), and the direction it falls. */
  cut?: number;
  cutDir?: number;
  /** Which builder: the bay's own seaStack, or the local spire with fracture faces. */
  gen: 'bay' | 'spire';
  note: string;
}

/** Every new sea stack. The two legs of the arch are the last two entries. */
export const STACK_SPECS: StackSpec[] = [
  { x: -122, z: 128, h: 38, r: 6.5, seed: 11, lean: [0.03, -0.02], gen: 'spire', note: 'pair, tall' },
  { x: -134, z: 138, h: 24, r: 5, seed: 12, lean: [-0.05, 0.03], gen: 'spire', note: 'pair, short; a few metres from the tall one' },
  { x: -172, z: 128, h: 8.5, r: 7.5, seed: 13, cut: 0.38, cutDir: 0.9, gen: 'spire', note: 'stub broken off low, sloping fracture' },
  { x: -205, z: 215, h: 50, r: 7, seed: 14, lean: [0.2, 0.05], gen: 'spire', note: 'leaning needle' },
  { x: -35, z: 150, h: 16, r: 5, seed: 16, lean: [-0.04, 0.05], gen: 'spire', note: 'low tooth, east of the arch' },
  { x: 35, z: 215, h: 30, r: 6, seed: 17, lean: [0.05, -0.04], gen: 'spire', note: 'lone stack, east' },
  { x: -285, z: 230, h: 42, r: 8, seed: 18, lean: [-0.06, 0.02], gen: 'spire', note: 'far west' },
  { x: -50, z: 275, h: 58, r: 9, seed: 19, gen: 'bay', note: 'far tower (cliffs.seaStack)' },
  { x: 95, z: 300, h: 44, r: 8, seed: 20, gen: 'bay', note: 'far east (cliffs.seaStack)' },
];

/** The natural arch stack: two legs and a bridge of rock between them, sky showing through. */
export const ARCH_LEGS: StackSpec[] = [
  { x: -98, z: 175, h: 31, r: 7, seed: 21, lean: [0.045, 0.01], gen: 'spire', note: 'arch, west leg' },
  { x: -73, z: 175, h: 27, r: 6.5, seed: 22, lean: [-0.05, -0.01], gen: 'spire', note: 'arch, east leg' },
];
/** Centre line of the bridge: height at the ends and at the crown, and its half thickness. */
export const ARCH_BRIDGE = { endY: 21.5, crownY: 26, endThick: 4.4, crownThick: 1.9, depth: 5.2 };

export interface Skerry {
  x: number; z: number;
  /** Half length and half width, metres. */
  rx: number; rz: number;
  /** Top above the sea. */
  h: number;
  yaw: number;
  seed: number;
}

/** The reef the ship struck, running from the west toward the beach. */
export const REEF_LINE: [number, number][] = [
  [-160, 70], [-146, 74], [-132, 77], [-118, 80], [-104, 84], [-90, 87], [-75, 90], [-58, 92], [-40, 95],
];

/** Pieces of the reef the wreckage is fixed to. */
export const MAST_ROCK: Skerry = { x: -132, z: 77.5, rx: 3.4, rz: 1.9, h: 2.3, yaw: 0.25, seed: 101 };
export const HULL_ROCKS: Skerry[] = [
  { x: -111, z: 82, rx: 5.2, rz: 2.4, h: 2.0, yaw: 0.22, seed: 102 },
  { x: -98.5, z: 86.5, rx: 4, rz: 1.8, h: 2.7, yaw: 0.3, seed: 103 },
];

function reefPoint(s: number): { x: number; z: number; ang: number } {
  const n = REEF_LINE.length - 1;
  const f = Math.min(0.9999, Math.max(0, s)) * n, i = Math.floor(f), t = f - i;
  const a = REEF_LINE[i], b = REEF_LINE[i + 1];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** Low jagged rock that barely breaks the surface. The reef is broken into pieces with gaps. */
export const SKERRIES: Skerry[] = (() => {
  const out: Skerry[] = [MAST_ROCK, ...HULL_ROCKS];
  const keep = [MAST_ROCK, ...HULL_ROCKS];
  let s = 0.0, k = 0;
  while (s < 1) {
    const p = reefPoint(s);
    const rx = 2.4 + hash(k, 5) * 5.5, rz = 1.2 + hash(k, 6) * 2.2;
    const off = (hash(k, 7) - 0.5) * 10;
    const x = p.x - Math.sin(p.ang) * off, z = p.z + Math.cos(p.ang) * off;
    const near = keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.rx + rx + 3);
    if (!near && hash(k, 8) > 0.18) {
      out.push({ x, z, rx, rz, h: 0.5 + hash(k, 9) * 1.9, yaw: p.ang + (hash(k, 10) - 0.5) * 0.9, seed: 110 + k });
    }
    s += (rx * 1.7 + 2 + hash(k, 11) * 5) / 135;
    k++;
  }
  // a few lone teeth well off the line, where the ship scraped before she struck
  out.push({ x: -176, z: 82, rx: 2.6, rz: 1.3, h: 0.7, yaw: 0.4, seed: 160 });
  out.push({ x: -150, z: 92, rx: 3.2, rz: 1.5, h: 1.1, yaw: 0.2, seed: 161 });
  out.push({ x: -70, z: 104, rx: 2.8, rz: 1.4, h: 0.6, yaw: 0.0, seed: 162 });
  out.push({ x: -24, z: 108, rx: 3.5, rz: 1.8, h: 1.4, yaw: -0.1, seed: 163 });
  return out;
})();

export interface Boulder { x: number; z: number; r: number; h: number; seed: number }

/** Half-submerged boulders, wet and black: round the stacks, along the reef, under the headland. */
export const BOULDERS: Boulder[] = (() => {
  const out: Boulder[] = [];
  const add = (x: number, z: number, r: number, k: number) => {
    out.push({ x, z, r, h: Math.max(0.2, Math.min(3, 0.25 + r * (0.35 + hash(k, 3) * 0.55))), seed: 200 + out.length });
  };
  const all = [...STACK_SPECS, ...ARCH_LEGS];
  all.forEach((st, si) => {
    const n = 5 + Math.floor(st.r * 0.9);
    for (let i = 0; i < n; i++) {
      const a = hash(si, i * 3 + 1) * 6.283, d = st.r * (1.3 + hash(si, i * 3 + 2) * 1.4 + (i % 3) * 0.35);
      add(st.x + Math.cos(a) * d, st.z + Math.sin(a) * d, 0.6 + Math.pow(hash(si, i * 3 + 3), 1.6) * 3.2, si * 31 + i);
    }
  });
  for (let i = 0; i < 44; i++) {
    const p = reefPoint(hash(i, 41));
    const off = (hash(i, 42) - 0.5) * 20;
    add(p.x - Math.sin(p.ang) * off, p.z + Math.cos(p.ang) * off, 0.6 + Math.pow(hash(i, 43), 1.7) * 2.8, 400 + i);
  }
  // at the headland's foot: its sea face runs from (-200, 46) to (-102, 40)
  for (let i = 0; i < 34; i++) {
    const x = -200 + hash(i, 51) * 100;
    const face = 46 - (x + 200) * 0.06;
    add(x, face + 6 + hash(i, 52) * 12, 0.7 + Math.pow(hash(i, 53), 1.5) * 3.3, 500 + i);
  }
  // and round the corner, toward the ship, where the debris comes ashore
  for (let i = 0; i < 12; i++) {
    add(-106 + hash(i, 61) * 22, 47 + hash(i, 62) * 11, 0.6 + Math.pow(hash(i, 63), 1.4) * 2.2, 600 + i);
  }
  // scattered thin across the open water to the east and far out
  for (let i = 0; i < 16; i++) {
    const x = -30 + hash(i, 71) * 200, z = 100 + hash(i, 72) * 200;
    if (x > 40 && x < 120 && z < 120) continue;
    add(x, z, 0.8 + Math.pow(hash(i, 73), 1.5) * 2.4, 700 + i);
  }
  return out;
})();

/** Every rock that breaks the surface: footprint radius r and height h above sea level. */
export const SEA_ROCKS: { x: number; z: number; r: number; h: number }[] = (() => {
  const out: { x: number; z: number; r: number; h: number }[] = [];
  for (const s of [...STACK_SPECS, ...ARCH_LEGS]) out.push({ x: s.x, z: s.z, r: s.r * 1.15, h: s.h });
  for (const s of SKERRIES) {
    // a long reef piece is a chain of circles along its length
    const n = Math.max(1, Math.round(s.rx / Math.max(s.rz, 0.5) * 0.8));
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * (s.rx - s.rz * 0.9);
      out.push({ x: s.x + Math.cos(s.yaw) * u, z: s.z + Math.sin(s.yaw) * u, r: Math.max(s.rz, 0.8) * 1.1, h: s.h });
    }
  }
  for (const b of BOULDERS) out.push({ x: b.x, z: b.z, r: b.r, h: b.h });
  return out;
})();
