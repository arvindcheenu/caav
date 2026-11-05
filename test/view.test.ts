import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { alwaysOn, createSession, explicitColours, explicitTrigger, noDecay } from "../src/core/index.js";
import { attachAttention, createAttentionView, headRaySource } from "../src/three/index.js";

function setup() {
  const session = createSession({ decay: noDecay, influenceRadius: 1 });
  const scene = new Scene();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  scene.add(mesh);
  const attached = attachAttention(session, mesh, { voxelSize: 0.2 });
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  session.registerViewer({ id: "a", colour: "#3d8bff", source: headRaySource(camera) });
  const view = createAttentionView({ session, attached, viewer: "a", camera, scene, trigger: alwaysOn() });
  const run = (s: number) => {
    for (let t = 0; t < s; t += 1 / 60) {
      session.tick(1 / 60);
      view.update(1 / 60);
    }
  };
  return { session, scene, attached, camera, view, run };
}

describe("AttentionView", () => {
  it("defaults to HeedVision's explicit trigger, hidden until asked", () => {
    const { session, attached, camera, scene } = setup();
    const view = createAttentionView({ session, attached, viewer: "a", camera, scene });
    expect(view.presentation).toBe("world-embedded");
    expect(view.trigger.kind).toBe("explicit");
    view.update(0.1);
    expect(view.visible).toBe(false);
    view.trigger.request();
    view.update(0.1);
    expect(view.visible).toBe(true);
  });

  it("reports what it shows", () => {
    const { view, run } = setup();
    run(1);
    expect(view.shading.attended).toBeGreaterThan(0);
    expect(view.shading.shared).toBe(0);
  });

  it("gives two people's views different settings over one target", () => {
    const { session, attached, scene, view, run } = setup();
    const cameraB = new PerspectiveCamera();
    cameraB.position.set(0, 0, 5);
    cameraB.lookAt(0, 0, 0);
    session.registerViewer({ id: "b", colour: "#f08a3c", source: headRaySource(cameraB) });
    const viewB = createAttentionView({
      session,
      attached,
      viewer: "b",
      camera: cameraB,
      scene,
      presentation: "camera-embedded",
      trigger: explicitTrigger(),
      accumulator: "count",
      colour: explicitColours({ shared: "#ec4f9c" }),
    });
    run(1);
    viewB.update(0.1);
    expect(view.visible).toBe(true);
    expect(viewB.visible).toBe(false);
    expect(view.presentation).toBe("world-embedded");
    expect(viewB.presentation).toBe("camera-embedded");
    viewB.trigger.request(true);
    viewB.update(0.1);
    expect(viewB.shading.shared).toBeGreaterThan(0);
  });

  it("rebuilds itself after a voxel size change", () => {
    const { attached, view, run } = setup();
    const before = attached.target.grid.count;
    run(1);
    attached.setVoxelSize(0.1);
    expect(attached.voxelSize).toBe(0.1);
    expect(attached.target.grid.count).toBeGreaterThan(before);
    run(1);
    expect(view.shading.alpha.length).toBe(attached.target.grid.count);
    expect(view.shading.attended).toBeGreaterThan(0);
    expect(attached.bounds.getSize(new (attached.bounds.min.constructor as new () => typeof attached.bounds.min)()).x).toBeCloseTo(1);
  });

  it("keeps a moved miniature in place across a voxel size change", () => {
    const { attached, view, run } = setup();
    view.setPresentation("world-separated");
    run(0.2);
    view.miniature!.moveTo(3, 2, 1);
    attached.setVoxelSize(0.1);
    run(0.2);
    expect(view.miniature!.object.position.toArray()).toEqual([3, 2, 1]);
  });

  it("keeps a moved miniature and what it shows across a style change", () => {
    const { view, run } = setup();
    view.setPresentation("world-separated");
    run(0.5);
    view.miniature!.moveTo(3, 2, 1);
    view.setStyle({ surface: "#ffffff", ink: "#111111" });
    run(0.2);
    expect(view.presentation).toBe("world-separated");
    expect(view.miniature!.object.position.toArray()).toEqual([3, 2, 1]);
    expect(view.shading.attended).toBeGreaterThan(0);
  });

  it("removes its objects from the scene when disposed", () => {
    const { scene, view, run } = setup();
    view.setPresentation("world-separated");
    run(0.2);
    expect(scene.children.length).toBeGreaterThan(1);
    view.dispose();
    expect(scene.children.length).toBe(1);
  });

  it("applies a threshold to what it shows", () => {
    const { view, run } = setup();
    run(1);
    const all = view.shading.attended;
    view.setThreshold(0.9);
    run(0.1);
    expect(view.shading.attended).toBeLessThan(all);
  });
});
