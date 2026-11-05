import type { Ray, Vec3 } from "./types.js";

export interface VoxelHit {
  voxel: number;
  /** Ray parameter at entry. It is a world distance when the ray came from a unit world direction. */
  t: number;
}

/**
 * A sparse set of occupied cells in a regular grid. Voxels are numbered 0 to
 * count - 1. Only occupied cells exist, so an attention value is stored only
 * where there is geometry.
 */
export class VoxelGrid {
  readonly count: number;
  private readonly byCell = new Map<number, number>();

  constructor(
    /** Minimum corner of cell (0, 0, 0). */
    readonly origin: Vec3,
    readonly size: number,
    readonly dims: Vec3,
    /** Occupied cells as a flat list of i, j, k triples. */
    readonly cells: Uint32Array,
  ) {
    this.count = cells.length / 3;
    for (let v = 0; v < this.count; v++) {
      this.byCell.set(this.key(cells[3 * v], cells[3 * v + 1], cells[3 * v + 2]), v);
    }
  }

  private key(i: number, j: number, k: number) {
    return i + this.dims[0] * (j + this.dims[1] * k);
  }

  /** The voxel at a cell, or -1 when that cell is empty or outside the grid. */
  at(i: number, j: number, k: number): number {
    const [nx, ny, nz] = this.dims;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
    return this.byCell.get(this.key(i, j, k)) ?? -1;
  }

  /** Centre of a voxel, in the grid's local space. */
  centre(voxel: number): Vec3 {
    const { origin: o, size: s, cells: c } = this;
    return [
      o[0] + (c[3 * voxel] + 0.5) * s,
      o[1] + (c[3 * voxel + 1] + 0.5) * s,
      o[2] + (c[3 * voxel + 2] + 0.5) * s,
    ];
  }

  /** Distance between two voxels in cells (Chebyshev: a cube, not a sphere). */
  cellDistance(a: number, b: number): number {
    const c = this.cells;
    return Math.max(
      Math.abs(c[3 * a] - c[3 * b]),
      Math.abs(c[3 * a + 1] - c[3 * b + 1]),
      Math.abs(c[3 * a + 2] - c[3 * b + 2]),
    );
  }

  /** Calls `visit` with each voxel within `radius` cells of `voxel` (Euclidean) and its distance. */
  forEachNear(voxel: number, radius: number, visit: (voxel: number, distance: number) => void) {
    const c = this.cells;
    const ci = c[3 * voxel];
    const cj = c[3 * voxel + 1];
    const ck = c[3 * voxel + 2];
    const r = Math.ceil(radius);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (let k = -r; k <= r; k++) {
          const distance = Math.hypot(i, j, k);
          if (distance > radius) continue;
          const near = this.at(ci + i, cj + j, ck + k);
          if (near >= 0) visit(near, distance);
        }
      }
    }
  }

  /** The nearest occupied voxel along a ray (Amanatides and Woo grid traversal), or null. */
  raycast(ray: Ray): VoxelHit | null {
    const { origin: o, size: s, dims } = this;
    const p = ray.origin;
    const d = ray.direction;

    // Clip the ray to the grid's bounding box.
    let t0 = 0;
    let t1 = Infinity;
    for (let a = 0; a < 3; a++) {
      const min = o[a];
      const max = o[a] + dims[a] * s;
      if (d[a] === 0) {
        if (p[a] < min || p[a] > max) return null;
        continue;
      }
      const near = (min - p[a]) / d[a];
      const far = (max - p[a]) / d[a];
      t0 = Math.max(t0, Math.min(near, far));
      t1 = Math.min(t1, Math.max(near, far));
    }
    if (t0 > t1) return null;

    // Walk cell by cell from the entry point.
    const cell = [0, 0, 0];
    const step = [0, 0, 0];
    const tNext = [Infinity, Infinity, Infinity];
    const tDelta = [Infinity, Infinity, Infinity];
    for (let a = 0; a < 3; a++) {
      const entry = p[a] + t0 * d[a];
      cell[a] = Math.min(dims[a] - 1, Math.max(0, Math.floor((entry - o[a]) / s)));
      if (d[a] === 0) continue;
      step[a] = d[a] > 0 ? 1 : -1;
      const boundary = o[a] + (d[a] > 0 ? cell[a] + 1 : cell[a]) * s;
      tNext[a] = (boundary - p[a]) / d[a];
      tDelta[a] = s / Math.abs(d[a]);
    }

    let t = t0;
    while (t <= t1) {
      const voxel = this.at(cell[0], cell[1], cell[2]);
      if (voxel >= 0) return { voxel, t };
      const a = tNext[0] < tNext[1] ? (tNext[0] < tNext[2] ? 0 : 2) : tNext[1] < tNext[2] ? 1 : 2;
      t = tNext[a];
      tNext[a] += tDelta[a];
      cell[a] += step[a];
      if (cell[a] < 0 || cell[a] >= dims[a]) return null;
    }
    return null;
  }
}
