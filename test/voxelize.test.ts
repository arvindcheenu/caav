import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createSession, noDecay } from "../src/core/index.js";
import { attachAttention, headRaySource, mergeGeometry, voxelize } from "../src/three/index.js";

const material = new MeshBasicMaterial();

describe("voxelize", () => {
  it("keeps only voxels that touch the surface: a box's middle stays empty", () => {
    const grid = voxelize(new BoxGeometry(1, 1, 1), 0.1);
    expect(grid.dims).toEqual([10, 10, 10]);
    // Every voxel must be on the outer shell of the grid.
    for (let v = 0; v < grid.count; v++) {
      const cell = [grid.cells[3 * v], grid.cells[3 * v + 1], grid.cells[3 * v + 2]];
      expect(cell.some((c) => c <= 1 || c >= 8)).toBe(true);
    }
    expect(grid.at(5, 5, 5)).toBe(-1);
    // A 10 x 10 x 10 shell has 488 cells; touching at boundaries can only add the next layer in.
    expect(grid.count).toBeGreaterThanOrEqual(488);
    expect(grid.count).toBeLessThan(1000);
  });

  it("handles flat geometry, which has no extent along one axis", () => {
    const flat = new BoxGeometry(1, 0, 1);
    const grid = voxelize(flat, 0.25);
    expect(grid.dims[1]).toBe(1);
    expect(grid.count).toBe(16);
  });

  it("rejects a voxel size that is not positive", () => {
    expect(() => voxelize(new BoxGeometry(), 0)).toThrow(RangeError);
  });
});

describe("mergeGeometry", () => {
  it("merges a hierarchy into the object's local space", () => {
    const group = new Group();
    group.position.set(100, 0, 0); // must not matter: the result is local
    const child = new Mesh(new BoxGeometry(1, 1, 1), material);
    child.position.set(2, 0, 0);
    group.add(child);
    const merged = mergeGeometry(group);
    merged.computeBoundingBox();
    expect(merged.boundingBox!.min.x).toBeCloseTo(1.5);
    expect(merged.boundingBox!.max.x).toBeCloseTo(2.5);
    expect(merged.getAttribute("position").count).toBe(36);
  });

  it("expands instanced meshes", () => {
    const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), material, 2);
    instanced.setMatrixAt(0, new Matrix4().makeTranslation(-5, 0, 0));
    instanced.setMatrixAt(1, new Matrix4().makeTranslation(5, 0, 0));
    const merged = mergeGeometry(instanced);
    merged.computeBoundingBox();
    expect(merged.boundingBox!.min.x).toBeCloseTo(-5.5);
    expect(merged.boundingBox!.max.x).toBeCloseTo(5.5);
  });

  it("explains an object with no meshes", () => {
    expect(() => mergeGeometry(new Group())).toThrow(/at least one mesh/);
  });
});

describe("attachAttention", () => {
  function setup() {
    const session = createSession({ decay: noDecay });
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
    const attached = attachAttention(session, mesh, { voxelSize: 0.1 });
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    session.registerViewer({ id: "a", colour: "#3d8bff", source: headRaySource(camera) });
    return { session, mesh, attached, camera };
  }
  const attentionOf = (attached: ReturnType<typeof setup>["attached"]) =>
    attached.target.field.channel("a").reduce((total, v) => total + v, 0);

  it("records from a camera's head ray, at the front of the object", () => {
    const { session, attached } = setup();
    for (let i = 0; i < 60; i++) session.tick(1 / 60);
    expect(attentionOf(attached)).toBeCloseTo(0.4, 1);
    const gaze = session.gaze("a")!;
    expect(gaze.distance).toBeCloseTo(4.5, 1);
    expect(gaze.point[2]).toBeCloseTo(0.5, 1);
  });

  it("follows the object when it moves, keeping distance in world units", () => {
    const { session, mesh, attached } = setup();
    mesh.position.set(0, 0, 2);
    mesh.scale.setScalar(2); // now 2 wide, its front at z = 3
    for (let i = 0; i < 12; i++) session.tick(1 / 60);
    expect(session.gaze("a")!.distance).toBeCloseTo(2, 1);
    expect(attentionOf(attached)).toBeGreaterThan(0);
  });

  it("stops recording when the object moves out of the ray", () => {
    const { session, mesh, attached } = setup();
    mesh.position.set(10, 0, 0);
    for (let i = 0; i < 60; i++) session.tick(1 / 60);
    expect(attentionOf(attached)).toBe(0);
    expect(session.gaze("a")).toBeNull();
  });

  it("detaches", () => {
    const { session, attached } = setup();
    for (let i = 0; i < 12; i++) session.tick(1 / 60);
    attached.detach();
    expect(session.targets.size).toBe(0);
    expect(session.gaze("a")).toBeNull();
    expect(() => session.tick(1)).not.toThrow();
  });

  it("gives bounds that contain the object", () => {
    const { attached } = setup();
    expect(attached.bounds.containsPoint(new Vector3(0.49, 0.49, 0.49))).toBe(true);
  });
});
