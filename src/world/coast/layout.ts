// The shape of the new Wreck Shore. A bay open to the sea in the south (+Z): a tall headland
// on the west where the ship lies broken on the rocks at its foot, cliffs along the north with
// a waterfall coming down them, the beach between, and the gorge inland in the north-east.
// You wake near the middle of the beach, looking west into the sunset.
import { clamp, fbm, smoothstep, distToSegment } from '../../core/math';

export const BAY = {
  /** Where you wake. */
  wake: { x: 0, z: 0 },
  /** The waterline runs roughly along this z, wandering. */
  shoreZ: 20,
  /** The headland's face runs north-south along this x; the land behind it is high. */
  headX: -84,
  /** The north cliffs' face runs east-west along this z. */
  northZ: -42,
  /** Height of the land above the cliffs. */
  plateau: 26,
  /** The wreck: centre of her keel, her heading, and how she lies. */
  ship: { x: -68, z: 0, yaw: Math.PI / 2 + 0.08, heel: -0.22, pitch: 0.07, sink: 1.6 },
  /** The falls come over the north cliffs here; their stream runs to the sea. */
  falls: { x: -30, z: -42, top: 25 },
  /** The gorge cuts back through the north cliffs here. */
  gorge: { x: 34, z: -42, width: 9 },
  /** The far peak with the tower on it. */
  peak: { x: -3600, z: -1500, height: 1700 },
};

/** Where the stream runs, from the foot of the falls to the sea. */
export const STREAM: [number, number][] = [
  [-30, -32], [-28, -27], [-23, -22], [-19, -12], [-20, -2], [-24, 8], [-25, 16], [-23, 24], [-21, 34],
];

function streamDistance(x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [d] = distToSegment(x, z, STREAM[i][0], STREAM[i][1], STREAM[i + 1][0], STREAM[i + 1][1]);
    best = Math.min(best, d);
  }
  return best;
}

/** The waterline at x: where the beach meets the sea. */
export function shoreAt(x: number): number {
  return BAY.shoreZ + fbm(x * 0.02 + 3, 1.7, 3) * 6 + smoothstep(-40, -75, x) * -6;
}

/**
 * Ground height. The beach rises gently from the sea to the foot of the cliffs, dunes along
 * its back; the sea floor falls away; the stream has cut a shallow bed across the sand. Behind
 * the cliffs the land is high; the gorge cuts back into it.
 */
export function groundHeight(x: number, z: number): number {
  const shore = shoreAt(x);
  let h = (shore - z) * 0.05;
  if (z > shore) h = -(z - shore) * 0.09 - Math.pow(Math.max(0, z - shore - 20) * 0.04, 2);
  // a berm along the top of the beach where the storms piled sand
  h += Math.exp(-Math.pow((z - (shore - 8)) / 4, 2)) * 0.3;
  // dunes along the back, banked against the cliff foot
  const back = smoothstep(-22, -40, z);
  h += back * (1.0 + fbm(x * 0.06, z * 0.06, 4) * 1.4);
  h += fbm(x * 0.08, z * 0.08, 3) * 0.22;
  // the stream's bed, the pool under the falls, and the wet fan where it meets the sea
  const sd = streamDistance(x, z);
  h -= Math.exp(-Math.pow(sd / (1.8 + smoothstep(0, 30, z) * 3), 2)) * 0.5;
  h -= Math.exp(-Math.pow(Math.hypot(x - BAY.falls.x, z - (BAY.falls.z + 10)) / 5, 2)) * 1.2;
  // rising toward the rocks at the headland's foot
  h += smoothstep(-62, -80, x) * 1.6 * smoothstep(30, 0, z);
  // the high land: west of the headland, north of the cliffs, the gorge cut back into it
  const cliffNoise = fbm(x * 0.02, z * 0.02, 3) * 2.5;
  // (the slope up to the high land lies behind the scanned cliff faces, which stand in front of it)
  const west = smoothstep(BAY.headX - 12, BAY.headX - 22, x + fbm(z * 0.03, 4, 3) * 3) * smoothstep(48, 30, z);
  const gorgeX = BAY.gorge.x + Math.sin((z - BAY.northZ) * 0.05) * 6;
  const inGorge = Math.exp(-Math.pow((x - gorgeX) / BAY.gorge.width, 4));
  const north = smoothstep(BAY.northZ - 12, BAY.northZ - 22, z + fbm(x * 0.03, 8, 3) * 3) * (1 - inGorge);
  const high = BAY.plateau + cliffNoise;
  h = Math.max(h, high * Math.max(west, north));
  // the gorge floor climbs gently inland
  if (z < BAY.northZ + 4) h = Math.max(h, inGorge * (2.5 + (BAY.northZ - z) * 0.09) * smoothstep(BAY.northZ + 4, BAY.northZ - 4, z));
  return clamp(h, -40, 60);
}

/** How wet the sand is here: by the sea, along the stream. 0 dry, 1 soaked. */
export function wetness(x: number, z: number): number {
  const shore = shoreAt(x);
  const sea = smoothstep(shore - 9, shore - 1, z);
  const sd = streamDistance(x, z);
  const stream = Math.exp(-Math.pow(sd / 3.2, 2));
  return clamp(Math.max(sea, stream), 0, 1);
}
