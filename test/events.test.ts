import { describe, expect, it } from "vitest";
import { halfLifeDecay, noDecay } from "../src/core/decay.js";
import type { AttentionEventType } from "../src/core/events.js";
import { createSession, type SessionOptions } from "../src/core/session.js";
import type { Ray } from "../src/core/types.js";
import { VoxelGrid } from "../src/core/voxel-grid.js";

/** A row of ten voxels along x. Each person looks at `spots[id]`, or at nothing when it is null. */
function setup(options: SessionOptions = {}) {
  const cells = Array.from({ length: 10 }, (_, i) => [i, 0, 0]).flat();
  const grid = new VoxelGrid([0, 0, 0], 1, [10, 1, 1], Uint32Array.from(cells));
  const session = createSession({ decay: noDecay, ...options });
  const target = session.registerTarget({ id: "row", grid, toLocal: (r) => r });
  const spots: Record<string, number | null> = {};
  const add = (id: string, x: number | null) => {
    spots[id] = x;
    session.registerViewer({
      id,
      colour: "#3d8bff",
      source: { sample: (): Ray | null => (spots[id] === null ? null : { origin: [spots[id]!, 0.5, -5], direction: [0, 0, 1] }) },
    });
  };
  const log: Array<{ type: AttentionEventType; viewer: string; voxel: number }> = [];
  for (const type of ["gazeenter", "gazeleave", "dwell", "jointstart", "jointend"] as const) {
    session.on(type, (event) => log.push({ type, viewer: event.viewer, voxel: event.voxel }));
  }
  const run = (s: number) => {
    for (let t = 0; t < s; t += 1 / 60) session.tick(1 / 60);
  };
  return { session, target, spots, add, log, run };
}

const types = (log: Array<{ type: string }>) => log.map((e) => e.type);

describe("attention events", () => {
  it("fires gazeenter once, and gazeleave when the gaze goes away", () => {
    const { add, spots, log, run } = setup();
    add("a", 2.5);
    run(0.5);
    expect(types(log)).toEqual(["gazeenter"]);
    spots.a = null;
    run(0.2);
    expect(types(log)).toEqual(["gazeenter", "gazeleave"]);
    expect(log[1].voxel).toBe(2);
  });

  it("reports the point in world space and in the object's own space", () => {
    const { session, add, run } = setup();
    let point: readonly number[] = [];
    let local: readonly number[] = [];
    session.on("gazeenter", (e) => {
      point = e.point;
      local = e.localPoint;
    });
    add("a", 2.5);
    run(0.2);
    expect(point[0]).toBeCloseTo(2.5);
    expect(point[2]).toBeCloseTo(0);
    expect(local).toEqual([2.5, 0.5, 0.5]);
  });

  it("fires dwell once per fixation, after dwellTime", () => {
    const { session, add, spots, run } = setup({ dwellTime: 1 });
    const seconds: number[] = [];
    session.on("dwell", (e) => seconds.push(e.seconds));
    add("a", 0.5);
    run(0.8);
    expect(seconds).toEqual([]);
    run(3);
    expect(seconds).toHaveLength(1);
    expect(seconds[0]).toBeCloseTo(1, 0);
    // Moving within the region is the same fixation; moving away starts a new one.
    spots.a = 1.5;
    run(3);
    expect(seconds).toHaveLength(1);
    spots.a = 9.5;
    run(2);
    expect(seconds).toHaveLength(2);
  });

  it("fires jointstart and jointend for each viewer in the group", () => {
    const { add, spots, log, run } = setup();
    add("a", 0.5);
    add("b", 9.5);
    run(0.5);
    log.length = 0;
    spots.b = 1.5; // two cells from a, so the same region
    run(0.3);
    const started = log.filter((e) => e.type === "jointstart").map((e) => e.viewer).sort();
    expect(started).toEqual(["a", "b"]);
    log.length = 0;
    spots.b = 9.5;
    run(0.3);
    const ended = log.filter((e) => e.type === "jointend").map((e) => e.viewer).sort();
    expect(ended).toEqual(["a", "b"]);
  });

  it("does not fire jointstart again when a third person joins", () => {
    const { add, spots, log, run } = setup();
    add("a", 0.5);
    add("b", 0.5);
    add("c", 9.5);
    run(0.3);
    log.length = 0;
    spots.c = 0.5;
    run(0.3);
    const started = log.filter((e) => e.type === "jointstart").map((e) => e.viewer);
    expect(started).toEqual(["c"]);
  });

  it("stops calling a listener once it has unsubscribed", () => {
    const { session, add, spots, run } = setup();
    let calls = 0;
    const stop = session.on("gazeenter", () => calls++);
    add("a", 0.5);
    run(0.2);
    expect(calls).toBe(1);
    stop();
    spots.a = null;
    run(0.2);
    spots.a = 0.5;
    run(0.2);
    expect(calls).toBe(1);
  });

  it("agrees with the trigger context on joint attention", () => {
    const { session, add, run } = setup();
    add("a", 0.5);
    add("b", 1.5);
    run(0.3);
    expect(session.triggerContext("a", 0.1).joint).toBe(1);
  });
});

describe("configure", () => {
  it("changes gain, radius and decay while running, and keeps attention", () => {
    const { session, target, add, run } = setup();
    add("a", 5.5);
    run(1);
    const before = target.field.channel("a")[5];
    expect(before).toBeCloseTo(0.4, 1);
    expect(target.field.channel("a")[4]).toBe(0);

    session.configure({ influenceRadius: 1, gain: 0.8 });
    run(0.5);
    expect(target.field.channel("a")[5]).toBeCloseTo(before + 0.4, 1);
    expect(target.field.channel("a")[4]).toBeGreaterThan(0);

    session.configure({ gain: 0, decay: halfLifeDecay(0.5) });
    const held = target.field.channel("a")[5];
    run(0.5);
    expect(target.field.channel("a")[5]).toBeCloseTo(held / 2, 1);
  });

  it("changes the capture rate", () => {
    const { session, add, run } = setup({ captureRate: 10 });
    add("a", 0.5);
    let start = session.sampleCount;
    run(1);
    expect(session.sampleCount - start).toBeGreaterThanOrEqual(9);
    expect(session.sampleCount - start).toBeLessThanOrEqual(11);
    session.configure({ captureRate: 30 });
    start = session.sampleCount;
    run(1);
    expect(session.sampleCount - start).toBeGreaterThanOrEqual(28);
    expect(session.sampleCount - start).toBeLessThanOrEqual(32);
  });

  it("changes dwellTime for later fixations", () => {
    const { session, add, run } = setup({ dwellTime: 100 });
    let fired = 0;
    session.on("dwell", () => fired++);
    add("a", 0.5);
    run(0.5);
    session.configure({ dwellTime: 0.2 });
    run(0.2);
    expect(fired).toBe(1);
  });
});

describe("replaceGrid", () => {
  it("swaps voxels, starts attention again and forgets old gazes", () => {
    const { session, target, add, run } = setup();
    add("a", 0.5);
    run(0.5);
    expect(session.gaze("a")).not.toBeNull();
    const finer = new VoxelGrid([0, 0, 0], 0.5, [20, 2, 2], Uint32Array.from([0, 1, 0, 1, 1, 0])); // the ray is at y = 0.5, in row 1
    session.replaceGrid("row", finer);
    expect(target.grid).toBe(finer);
    expect(target.field.voxelCount).toBe(2);
    expect(target.field.channel("a")[0]).toBe(0);
    expect(session.gaze("a")).toBeNull();
    run(0.5);
    expect(target.field.channel("a")[1]).toBeGreaterThan(0);
  });

  it("rejects an unknown target", () => {
    const { session, target } = setup();
    expect(() => session.replaceGrid("nope", target.grid)).toThrow(/unknown target/);
  });
});
