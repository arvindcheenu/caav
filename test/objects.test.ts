import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { noDecay, createSession } from "../src/core/index.js";
import { attachAttention, headRaySource, mergeGeometry, voxelize } from "../src/three/index.js";
import { random } from "../site/playground/pilot";
import { createProtein, createScatter, LIGHT_THEME, SCATTER_POINTS } from "../site/playground/scene";
import { OBJECTS } from "../site/playground/settings";

const triangles = (object: Parameters<typeof mergeGeometry>[0]) => mergeGeometry(object).getAttribute("position").count / 3;

/** How often a head ray lands on the object, from the playground's viewing distance and spread of glances. */
function hitRate(object: Parameters<typeof mergeGeometry>[0], voxelSize: number) {
  const session = createSession({ decay: noDecay });
  object.updateWorldMatrix(true, true);
  const attached = attachAttention(session, object, { voxelSize });
  const centre = attached.bounds.getCenter(new Vector3()).applyMatrix4(object.matrixWorld);
  const reach = attached.bounds.getSize(new Vector3()).length() / 2;
  const camera = new PerspectiveCamera();
  const source = headRaySource(camera);
  const rand = random(7);
  let hits = 0;
  const rays = 2000;
  for (let i = 0; i < rays; i++) {
    const yaw = rand() * Math.PI * 2;
    const pitch = 0.2 + rand();
    const distance = reach * 2.2;
    camera.position.set(centre.x + distance * Math.cos(pitch) * Math.sin(yaw), centre.y + distance * Math.sin(pitch), centre.z + distance * Math.cos(pitch) * Math.cos(yaw));
    const angle = rand() * Math.PI * 2;
    const radius = reach * 0.55 * Math.sqrt(rand());
    camera.lookAt(centre.x + Math.cos(angle) * radius, centre.y + (rand() - 0.6) * reach * 0.4, centre.z + Math.sin(angle) * radius);
    camera.updateMatrixWorld();
    if (attached.target.grid.raycast(attached.target.toLocal(source.sample()!))) hits++;
  }
  return { rate: hits / rays, voxels: attached.target.grid.count };
}

describe("scatterplot", () => {
  it("has 100 points and is the same on every load", () => {
    const first = mergeGeometry(createScatter(LIGHT_THEME)).getAttribute("position").array;
    const second = mergeGeometry(createScatter(LIGHT_THEME)).getAttribute("position").array;
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(SCATTER_POINTS).toBe(100);
  });

  it("gets attention only on its points, not its axes", () => {
    // Axes are lines, and merged geometry only takes meshes: 100 spheres of 180 triangles.
    expect(triangles(createScatter(LIGHT_THEME))).toBe(SCATTER_POINTS * 180);
  });

  it("is hit often enough at its default voxel size to record attention", () => {
    const { rate, voxels } = hitRate(createScatter(LIGHT_THEME), OBJECTS.scatter.voxelSize);
    expect(rate).toBeGreaterThan(0.7);
    expect(voxels).toBeGreaterThanOrEqual(SCATTER_POINTS);
    expect(voxels).toBeLessThan(SCATTER_POINTS * 9);
  });
});

describe("protein-like surface", () => {
  it("is the same on every load", () => {
    const first = mergeGeometry(createProtein(LIGHT_THEME)).getAttribute("position").array;
    const second = mergeGeometry(createProtein(LIGHT_THEME)).getAttribute("position").array;
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it("stays small enough to voxelize while the page is interactive", () => {
    const merged = mergeGeometry(createProtein(LIGHT_THEME));
    const count = merged.getAttribute("position").count / 3;
    expect(count).toBeGreaterThan(20_000);
    expect(count).toBeLessThan(60_000);
    const started = performance.now();
    const grid = voxelize(merged, OBJECTS.protein.voxelSize);
    const elapsed = performance.now() - started;
    expect(grid.count).toBeLessThan(12_000);
    expect(elapsed).toBeLessThan(1500);
    console.log(`protein: ${count} triangles, ${grid.count} voxels, voxelized in ${Math.round(elapsed)} ms`);
  });

  it("is hit by most head rays", () => {
    const { rate } = hitRate(createProtein(LIGHT_THEME), OBJECTS.protein.voxelSize);
    console.log(`protein hit rate ${rate}`);
    expect(rate).toBeGreaterThan(0.7);
  });

  it("keeps its inhibitor's colour across a theme change", () => {
    const protein = createProtein(LIGHT_THEME);
    const kept = protein.children.filter((child) => child.userData.keepsColour);
    expect(kept).toHaveLength(1);
  });
});
