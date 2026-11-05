import { describe, expect, it } from "vitest";
import { VoxelGrid } from "../src/core/voxel-grid.js";

/** A 4 x 4 x 4 grid of unit cells with two occupied cells along the x axis at y = z = 0. */
function grid() {
  return new VoxelGrid([0, 0, 0], 1, [4, 4, 4], Uint32Array.from([1, 0, 0, 3, 0, 0]));
}

describe("VoxelGrid", () => {
  it("numbers occupied cells only", () => {
    const g = grid();
    expect(g.count).toBe(2);
    expect(g.at(1, 0, 0)).toBe(0);
    expect(g.at(3, 0, 0)).toBe(1);
    expect(g.at(0, 0, 0)).toBe(-1);
    expect(g.at(-1, 0, 0)).toBe(-1);
    expect(g.at(4, 0, 0)).toBe(-1);
  });

  it("gives voxel centres", () => expect(grid().centre(1)).toEqual([3.5, 0.5, 0.5]));

  it("hits the nearest occupied voxel from outside", () => {
    const hit = grid().raycast({ origin: [-2, 0.5, 0.5], direction: [1, 0, 0] });
    expect(hit?.voxel).toBe(0);
    expect(hit?.t).toBeCloseTo(3);
  });

  it("hits from the other side", () => {
    const hit = grid().raycast({ origin: [10, 0.5, 0.5], direction: [-1, 0, 0] });
    expect(hit?.voxel).toBe(1);
    expect(hit?.t).toBeCloseTo(6);
  });

  it("hits from inside the grid", () => {
    const hit = grid().raycast({ origin: [2.5, 0.5, 0.5], direction: [1, 0, 0] });
    expect(hit?.voxel).toBe(1);
    expect(hit?.t).toBeCloseTo(0.5);
  });

  it("follows a diagonal", () => {
    const g = new VoxelGrid([0, 0, 0], 1, [4, 4, 4], Uint32Array.from([2, 2, 2]));
    expect(g.raycast({ origin: [-1, -1, -1], direction: [1, 1, 1] })?.voxel).toBe(0);
    expect(g.raycast({ origin: [-1, -1, -1], direction: [1, 1, 0.1] })).toBeNull();
  });

  it("misses when the ray points away or passes outside", () => {
    const g = grid();
    expect(g.raycast({ origin: [-2, 0.5, 0.5], direction: [-1, 0, 0] })).toBeNull();
    expect(g.raycast({ origin: [-2, 5, 0.5], direction: [1, 0, 0] })).toBeNull();
    expect(g.raycast({ origin: [-2, 2.5, 0.5], direction: [1, 0, 0] })).toBeNull();
  });

  it("keeps t in the units of a scaled ray", () => {
    // A ray moved into a grid scaled by 2: the local direction has length 0.5,
    // so t still counts world units.
    const hit = grid().raycast({ origin: [-2, 0.5, 0.5], direction: [0.5, 0, 0] });
    expect(hit?.t).toBeCloseTo(6);
  });

  it("works away from the origin and with other cell sizes", () => {
    const g = new VoxelGrid([10, 10, 10], 0.25, [4, 4, 4], Uint32Array.from([3, 0, 0]));
    const hit = g.raycast({ origin: [9, 10.1, 10.1], direction: [1, 0, 0] });
    expect(hit?.voxel).toBe(0);
    expect(hit?.t).toBeCloseTo(1.75);
  });

  it("finds neighbours within a radius", () => {
    const g = new VoxelGrid([0, 0, 0], 1, [5, 1, 1], Uint32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 4, 0, 0]));
    const near: Array<[number, number]> = [];
    g.forEachNear(1, 1, (voxel, distance) => near.push([voxel, distance]));
    expect(near.sort()).toEqual([[0, 1], [1, 0], [2, 1]]);
  });

  it("measures cell distance", () => {
    expect(grid().cellDistance(0, 1)).toBe(2);
  });
});
