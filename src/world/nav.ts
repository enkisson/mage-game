// Height-aware navigation.
// The level is sampled into a grid of surface heights. Creatures may step up small rises and
// drop down ledges, but cannot climb cliffs, so reaching high ground means finding a ramp.
// A flow field toward the player is recomputed as the player moves.

export interface NavOptions {
  cell: number;
  /** Tallest rise a creature can walk up between neighbouring cells. */
  stepUp: number;
  /** Deepest drop a creature will walk off. */
  dropMax: number;
  /** Cells whose surface is below this are impassable (the sea). */
  minHeight: number;
}

export interface NavBounds { minX: number; maxX: number; minZ: number; maxZ: number }

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Binary min-heap of (cost, cell). */
class Heap {
  private cost: number[] = [];
  private cell: number[] = [];
  get size() { return this.cost.length; }
  push(cost: number, cell: number) {
    let i = this.cost.length;
    this.cost.push(cost);
    this.cell.push(cell);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= cost) break;
      this.cost[i] = this.cost[p];
      this.cell[i] = this.cell[p];
      i = p;
    }
    this.cost[i] = cost;
    this.cell[i] = cell;
  }
  pop(): [number, number] {
    const topCost = this.cost[0], topCell = this.cell[0];
    const lastCost = this.cost.pop()!, lastCell = this.cell.pop()!;
    const n = this.cost.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && this.cost[c + 1] < this.cost[c]) c++;
        if (this.cost[c] >= lastCost) break;
        this.cost[i] = this.cost[c];
        this.cell[i] = this.cell[c];
        i = c;
      }
      this.cost[i] = lastCost;
      this.cell[i] = lastCell;
    }
    return [topCost, topCell];
  }
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  /** Surface height per cell; NaN where there is nothing to stand on. */
  readonly height: Float32Array;
  /** Cost to walk to the player; Infinity where no route exists. */
  readonly field: Float64Array;
  /** Cost to get close to the player (within a few metres), for when no route exists. */
  readonly near: Float64Array;
  private nearValid = false;
  private targetCell = -1;
  private targetX = 0;
  private targetZ = 0;

  constructor(
    readonly bounds: NavBounds,
    readonly opts: NavOptions,
    private sampler: (x: number, z: number) => number | null,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / opts.cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / opts.cell);
    this.height = new Float32Array(this.cols * this.rows);
    this.field = new Float64Array(this.cols * this.rows).fill(Infinity);
    this.near = new Float64Array(this.cols * this.rows).fill(Infinity);
    this.resample(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  }

  cellX(i: number) { return this.bounds.minX + (i + 0.5) * this.opts.cell; }
  cellZ(j: number) { return this.bounds.minZ + (j + 0.5) * this.opts.cell; }
  col(x: number) { return Math.floor((x - this.bounds.minX) / this.opts.cell); }
  row(z: number) { return Math.floor((z - this.bounds.minZ) / this.opts.cell); }
  inside(i: number, j: number) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows; }
  index(x: number, z: number) {
    const i = this.col(x), j = this.row(z);
    return this.inside(i, j) ? j * this.cols + i : -1;
  }

  /** Re-read surface heights in a region, after the terrain changed there. */
  resample(minX: number, maxX: number, minZ: number, maxZ: number) {
    const i0 = Math.max(0, this.col(minX)), i1 = Math.min(this.cols - 1, this.col(maxX));
    const j0 = Math.max(0, this.row(minZ)), j1 = Math.min(this.rows - 1, this.row(maxZ));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h = this.sampler(this.cellX(i), this.cellZ(j));
        this.height[j * this.cols + i] = h === null || h < this.opts.minHeight ? NaN : h;
      }
    }
    this.targetCell = -1; // force the next field update
  }

  walkable(c: number) {
    return c >= 0 && !Number.isNaN(this.height[c]);
  }

  /** Can a creature walk from cell a directly to neighbouring cell b? */
  canStep(a: number, b: number): boolean {
    const ha = this.height[a], hb = this.height[b];
    if (Number.isNaN(ha) || Number.isNaN(hb)) return false;
    const rise = hb - ha;
    return rise <= this.opts.stepUp && -rise <= this.opts.dropMax;
  }

  private canMove(i: number, j: number, di: number, dj: number): boolean {
    const ni = i + di, nj = j + dj;
    if (!this.inside(ni, nj)) return false;
    const a = j * this.cols + i, b = nj * this.cols + ni;
    if (!this.canStep(a, b)) return false;
    if (di !== 0 && dj !== 0) {
      // no cutting corners past a wall or a cliff edge
      const s1 = j * this.cols + ni, s2 = nj * this.cols + i;
      if (!this.canStep(a, s1) || !this.canStep(a, s2)) return false;
    }
    return true;
  }

  private flood(out: Float64Array, seeds: [number, number][]) {
    out.fill(Infinity);
    const heap = new Heap();
    for (const [cell, cost] of seeds) {
      if (cost < out[cell]) {
        out[cell] = cost;
        heap.push(cost, cell);
      }
    }
    while (heap.size) {
      const [cost, cell] = heap.pop();
      if (cost > out[cell]) continue;
      const i = cell % this.cols, j = (cell - i) / this.cols;
      // walk the edges backwards: which neighbours could step *into* this cell?
      for (const [di, dj, len] of NEIGHBOURS) {
        const ni = i + di, nj = j + dj;
        if (!this.inside(ni, nj)) continue;
        if (!this.canMove(ni, nj, -di, -dj)) continue;
        const n = nj * this.cols + ni;
        const next = cost + len * this.opts.cell;
        if (next < out[n]) {
          out[n] = next;
          heap.push(next, n);
        }
      }
    }
  }

  /** Point the flow field at a position. Cheap to call every frame; recomputes only when the cell changes. */
  setTarget(x: number, z: number) {
    this.targetX = x;
    this.targetZ = z;
    const cell = this.index(x, z);
    if (cell === this.targetCell) return;
    this.targetCell = cell;
    this.nearValid = false;
    if (cell < 0 || !this.walkable(cell)) {
      this.field.fill(Infinity);
      return;
    }
    this.flood(this.field, [[cell, 0]]);
  }

  private ensureNear() {
    if (this.nearValid) return;
    this.nearValid = true;
    const seeds: [number, number][] = [];
    const reach = 8;
    const ci = this.col(this.targetX), cj = this.row(this.targetZ);
    const span = Math.ceil(reach / this.opts.cell);
    for (let j = cj - span; j <= cj + span; j++) {
      for (let i = ci - span; i <= ci + span; i++) {
        if (!this.inside(i, j)) continue;
        const c = j * this.cols + i;
        if (!this.walkable(c) || c === this.targetCell) continue;
        const d = Math.hypot(this.cellX(i) - this.targetX, this.cellZ(j) - this.targetZ);
        if (d <= reach) seeds.push([c, d * 2]);
      }
    }
    this.flood(this.near, seeds);
  }

  /** Is there a walking route from this position to the player? */
  reachable(x: number, z: number): boolean {
    const c = this.index(x, z);
    return c >= 0 && this.field[c] < Infinity;
  }

  /** Walking distance to the player, or Infinity. */
  cost(x: number, z: number): number {
    const c = this.index(x, z);
    return c >= 0 ? this.field[c] : Infinity;
  }

  heightAt(x: number, z: number): number {
    const c = this.index(x, z);
    return c >= 0 ? this.height[c] : NaN;
  }

  /** Can a creature walk the straight line between two points without meeting a cliff or a wall? */
  private clearWalk(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(d / (this.opts.cell * 0.4)));
    let prev = this.index(x0, z0);
    if (prev < 0) return false;
    for (let s = 1; s <= n; s++) {
      const c = this.index(x0 + ((x1 - x0) * s) / n, z0 + ((z1 - z0) * s) / n);
      if (c < 0) return false;
      if (c !== prev) {
        if (!this.canStep(prev, c)) return false;
        prev = c;
      }
    }
    return true;
  }

  /**
   * Where should a creature at (x, z) walk to next? Writes the centre of a nearby cell on its
   * route into `out` and returns true, or returns false if it has nowhere to go. Follows the
   * route to the player if there is one, otherwise the route to the nearest ground beside the
   * player. Looks a few cells ahead, but only as far as the creature could walk in a straight line.
   */
  waypoint(x: number, z: number, out: { x: number; z: number }, lookAhead = 3): boolean {
    let i = this.col(x), j = this.row(z);
    if (!this.inside(i, j)) return false;
    let cell = j * this.cols + i;
    let field = this.field;
    if (!(field[cell] < Infinity)) {
      this.ensureNear();
      field = this.near;
      if (!(field[cell] < Infinity)) return false;
    }
    let found = false;
    for (let step = 0; step < lookAhead; step++) {
      let best = -1, bestCost = field[cell], bi = 0, bj = 0;
      for (const [di, dj, len] of NEIGHBOURS) {
        if (!this.canMove(i, j, di, dj)) continue;
        const n = (j + dj) * this.cols + (i + di);
        const c = field[n] + len * this.opts.cell * 0.001;
        if (c < bestCost) {
          bestCost = c;
          best = n;
          bi = i + di;
          bj = j + dj;
        }
      }
      if (best < 0) break;
      const cx = this.cellX(bi), cz = this.cellZ(bj);
      if (found && !this.clearWalk(x, z, cx, cz)) break;
      i = bi;
      j = bj;
      cell = best;
      out.x = cx;
      out.z = cz;
      found = true;
    }
    return found;
  }

  /** Unit direction toward the next waypoint. Convenience for callers that do not keep one. */
  direction(x: number, z: number, out: { x: number; z: number }, lookAhead = 3): boolean {
    if (!this.waypoint(x, z, out, lookAhead)) return false;
    const dx = out.x - x, dz = out.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return false;
    out.x = dx / d;
    out.z = dz / d;
    return true;
  }
}
