import { describe, expect, it } from 'vitest';
import { NavGrid } from '../src/world/nav';

// A 20 × 20 m yard: flat ground, with a 3 m high platform in the middle (x 8–12, z 8–12)
// that can only be reached by a ramp on its east side (x 12–18, z 9–11).
function yard(x: number, z: number): number | null {
  if (x >= 8 && x <= 12 && z >= 8 && z <= 12) return 3;
  if (x > 12 && x <= 18 && z >= 9 && z <= 11) return 3 * (1 - (x - 12) / 6);
  return 0;
}

const make = () => new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, { cell: 1, stepUp: 0.7, dropMax: 6, minHeight: -0.5 }, yard);

describe('navigation', () => {
  it('cannot climb a cliff but can drop off one', () => {
    const nav = make();
    const top = nav.index(8.5, 10.5), below = nav.index(7.5, 10.5);
    expect(nav.canStep(below, top)).toBe(false);
    expect(nav.canStep(top, below)).toBe(true);
  });

  it('routes around to the ramp to reach high ground', () => {
    const nav = make();
    nav.setTarget(10.5, 10.5); // player on the platform
    // a creature just west of the platform is 2 m away in a straight line, but must walk round
    const straight = 2;
    expect(nav.cost(7.5, 10.5)).toBeGreaterThan(straight * 5);
    expect(nav.reachable(7.5, 10.5)).toBe(true);
    const dir = { x: 0, z: 0 };
    expect(nav.direction(7.5, 10.5, dir)).toBe(true);
    expect(Math.abs(dir.z)).toBeGreaterThan(0.5); // heads north or south around the platform, not into the wall
  });

  it('walks straight off the platform toward a target below', () => {
    const nav = make();
    nav.setTarget(4.5, 10.5);
    const dir = { x: 0, z: 0 };
    expect(nav.direction(9.5, 10.5, dir)).toBe(true);
    expect(dir.x).toBeLessThan(-0.7);
  });

  it('gathers beside the player when there is no way up', () => {
    // same yard without the ramp
    const nav = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, { cell: 1, stepUp: 0.7, dropMax: 6, minHeight: -0.5 },
      (x, z) => (x >= 8 && x <= 12 && z >= 8 && z <= 12 ? 3 : 0));
    nav.setTarget(10.5, 10.5);
    expect(nav.reachable(2.5, 2.5)).toBe(false);
    const dir = { x: 0, z: 0 };
    expect(nav.direction(2.5, 2.5, dir)).toBe(true);
    expect(dir.x).toBeGreaterThan(0.3);
    expect(dir.z).toBeGreaterThan(0.3);
  });

  it('notices when the ground changes', () => {
    let pillar = false;
    const nav = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, { cell: 1, stepUp: 0.7, dropMax: 6, minHeight: -0.5 },
      (x, z) => (pillar && Math.hypot(x - 10, z - 10) < 1.6 ? 3.3 : 0));
    nav.setTarget(10.5, 10.5);
    expect(nav.reachable(2.5, 2.5)).toBe(true);
    pillar = true;
    nav.resample(8, 12, 8, 12);
    nav.setTarget(10.5, 10.5);
    expect(nav.reachable(2.5, 2.5)).toBe(false);
  });
});
