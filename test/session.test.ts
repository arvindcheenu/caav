import { describe, expect, it } from "vitest";
import { createSampleClock, type AttentionSource } from "../src/core/capture.js";
import { interpolatedColours } from "../src/core/colour.js";
import { halfLifeDecay, noDecay } from "../src/core/decay.js";
import { createSession, type SessionOptions } from "../src/core/session.js";
import { createShading, shade } from "../src/core/shading.js";
import type { Ray } from "../src/core/types.js";
import { VoxelGrid } from "../src/core/voxel-grid.js";

const lookingAt = (x: number): AttentionSource => ({
  sample: (): Ray => ({ origin: [x, 0.5, -5], direction: [0, 0, 1] }),
});

/** A row of five voxels along x, at z = 0. */
function row() {
  return new VoxelGrid([0, 0, 0], 1, [5, 1, 1], Uint32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0]));
}

function setup(options: SessionOptions = {}) {
  const session = createSession({ decay: noDecay, ...options });
  const target = session.registerTarget({ id: "row", grid: row(), toLocal: (r) => r });
  return { session, target };
}

const seconds = (session: ReturnType<typeof createSession>, s: number, dt = 1 / 60) => {
  for (let t = 0; t < s; t += dt) session.tick(dt);
};

describe("createSampleClock", () => {
  it("samples at the configured rate whatever the frame rate", () => {
    for (const fps of [30, 60, 144]) {
      const clock = createSampleClock(10);
      let due = 0;
      for (let i = 0; i < fps * 3; i++) due += clock.advance(1 / fps);
      expect(due).toBeGreaterThanOrEqual(29);
      expect(due).toBeLessThanOrEqual(31);
    }
  });

  it("does not credit a long stall", () => {
    const clock = createSampleClock(10);
    expect(clock.advance(600)).toBe(2);
    expect(clock.advance(0.01)).toBe(0);
  });

  it("rejects a rate that is not positive", () => {
    expect(() => createSampleClock(0)).toThrow(RangeError);
  });
});

describe("AttentionSession", () => {
  it("records into the voxel each viewer's ray hits, per viewer", () => {
    const { session, target } = setup();
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(1.5) });
    session.registerViewer({ id: "b", colour: "#f08a3c", source: lookingAt(3.5) });
    seconds(session, 1);
    expect(target.field.channel("a")[1]).toBeCloseTo(0.4, 1);
    expect(target.field.channel("a")[3]).toBe(0);
    expect(target.field.channel("b")[3]).toBeCloseTo(0.4, 1);
    expect(target.field.channel("b")[1]).toBe(0);
  });

  it("accepts any source through the same interface", () => {
    const { session, target } = setup();
    let ray: Ray | null = null; // an eye tracker that has lost the eyes
    session.registerViewer({ id: "eyes", colour: "#3d8bff", source: { sample: () => ray } });
    seconds(session, 1);
    expect(target.field.channel("eyes").every((v) => v === 0)).toBe(true);
    ray = { origin: [2.5, 0.5, -5], direction: [0, 0, 1] };
    seconds(session, 1);
    expect(target.field.channel("eyes")[2]).toBeGreaterThan(0);
  });

  it("gains the same per second at any capture rate", () => {
    for (const captureRate of [5, 10, 30]) {
      const { session, target } = setup({ captureRate });
      session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) });
      seconds(session, 1);
      expect(target.field.channel("a")[0]).toBeCloseTo(0.4, 1);
    }
  });

  it("decays attention that is no longer being renewed", () => {
    const { session, target } = setup({ decay: halfLifeDecay(1) });
    let looking = true;
    session.registerViewer({ id: "a", colour: "#3d8bff", source: { sample: () => (looking ? lookingAt(0.5).sample() : null) } });
    seconds(session, 1);
    const peak = target.field.channel("a")[0];
    looking = false;
    seconds(session, 1);
    expect(target.field.channel("a")[0]).toBeCloseTo(peak / 2, 1);
  });

  it("spreads attention over the region of influence, most at the centre", () => {
    const { session, target } = setup({ influenceRadius: 1 });
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(2.5) });
    seconds(session, 1);
    const values = target.field.channel("a");
    expect(values[2]).toBeGreaterThan(values[1]);
    expect(values[1]).toBeGreaterThan(0);
    expect(values[1]).toBeCloseTo(values[3]);
    expect(values[0]).toBe(0);
  });

  it("sends attention only to the nearest target when one occludes another", () => {
    const session = createSession({ decay: noDecay });
    const behind = (z: number) => (ray: Ray): Ray => ({ origin: [ray.origin[0], ray.origin[1], ray.origin[2] - z], direction: ray.direction });
    const near = session.registerTarget({ id: "near", grid: row(), toLocal: behind(0) });
    const far = session.registerTarget({ id: "far", grid: row(), toLocal: behind(4) });
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(1.5) });
    seconds(session, 1);
    expect(near.field.channel("a")[1]).toBeGreaterThan(0);
    expect(far.field.channel("a")[1]).toBe(0);
  });

  it("gives a viewer who joins late a channel on existing targets, and the reverse", () => {
    const { session, target } = setup();
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) });
    const later = session.registerTarget({ id: "later", grid: row(), toLocal: (r) => r });
    expect(later.field.viewers).toEqual(["a"]);
    session.registerViewer({ id: "b", colour: "#f08a3c", source: lookingAt(0.5) });
    expect(target.field.viewers).toEqual(["a", "b"]);
  });

  it("rejects duplicate ids", () => {
    const { session } = setup();
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) });
    expect(() => session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) })).toThrow(/already/);
    expect(() => session.registerTarget({ id: "row", grid: row(), toLocal: (r) => r })).toThrow(/already/);
  });

  it("has no built-in limit on viewers", () => {
    const { session, target } = setup();
    for (let i = 0; i < 8; i++) session.registerViewer({ id: `v${i}`, colour: "#3d8bff", source: lookingAt(0.5) });
    seconds(session, 1);
    for (let i = 0; i < 8; i++) expect(target.field.channel(`v${i}`)[0]).toBeGreaterThan(0);
  });

  it("measures dwell and joint attention for triggers", () => {
    const { session } = setup();
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) });
    session.registerViewer({ id: "b", colour: "#f08a3c", source: lookingAt(1.5) });
    session.registerViewer({ id: "c", colour: "#17a67e", source: lookingAt(4.5) });
    seconds(session, 2);
    const a = session.triggerContext("a", 0.1);
    expect(a.dwell).toBeGreaterThan(1.5);
    expect(a.joint).toBe(1); // b is one voxel away, c is four
    expect(session.triggerContext("c", 0.1).joint).toBe(0);
    expect(session.gaze("a")?.voxel).toBe(0);
  });

  it("resets dwell when the gaze moves to another region", () => {
    const { session } = setup({ regionRadius: 0 });
    let x = 0.5;
    session.registerViewer({ id: "a", colour: "#3d8bff", source: { sample: () => lookingAt(x).sample() } });
    seconds(session, 1);
    expect(session.triggerContext("a", 0.1).dwell).toBeGreaterThan(0.5);
    x = 3.5;
    seconds(session, 0.15);
    expect(session.triggerContext("a", 0.1).dwell).toBeLessThan(0.2);
  });

  it("clears on reset and keeps viewers registered", () => {
    const { session, target } = setup();
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) });
    seconds(session, 1);
    session.reset();
    expect(target.field.channel("a")[0]).toBe(0);
    expect(session.viewers.has("a")).toBe(true);
  });
});

describe("shade", () => {
  function shaded(accumulator: "sum" | "max" | "difference" | "count") {
    const { session, target } = setup();
    session.registerViewer({ id: "a", colour: "#3d8bff", source: lookingAt(0.5) });
    session.registerViewer({ id: "b", colour: "#f08a3c", source: lookingAt(0.5) });
    target.field.add("a", 0, 0.6);
    target.field.add("b", 0, 0.6);
    target.field.add("a", 1, 0.5);
    const shading = createShading(target.grid.count);
    shade(session, target, shading, { accumulator, colour: interpolatedColours() });
    return shading;
  }

  it("uses the accumulator for opacity and leaves empty voxels transparent", () => {
    expect(shaded("sum").alpha[0]).toBe(1);
    expect(shaded("max").alpha[0]).toBeCloseTo(0.6);
    expect(shaded("difference").alpha[0]).toBe(0);
    expect(shaded("difference").alpha[1]).toBeCloseTo(0.5);
    expect(shaded("count").alpha[0]).toBe(1);
    expect(shaded("count").alpha[1]).toBe(0.5);
    expect(shaded("sum").alpha[4]).toBe(0);
  });

  it("counts attended and shared voxels", () => {
    const { attended, shared } = shaded("sum");
    expect(attended).toBe(2);
    expect(shared).toBe(1);
  });

  it("sets a lone viewer's colour on their voxels", () => {
    const shading = shaded("sum");
    expect(shading.rgb[3]).toBeCloseTo(0x3d / 255);
    expect(shading.rgb[5]).toBeCloseTo(1);
  });
});
