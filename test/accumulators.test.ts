import { describe, expect, it } from "vitest";
import { AttentionField, aggregate, normalised } from "../src/core/accumulators.js";

describe("aggregate", () => {
  const values = [0.6, 0.2, 0, 0.9];

  it("sums", () => expect(aggregate("sum", values)).toBeCloseTo(1.7));
  it("takes the maximum", () => expect(aggregate("max", values)).toBe(0.9));
  it("takes highest minus lowest as the difference", () => expect(aggregate("difference", values)).toBeCloseTo(0.9));
  it("counts viewers at or above the threshold", () => {
    expect(aggregate("count", values)).toBe(3);
    expect(aggregate("count", values, 0.5)).toBe(2);
    expect(aggregate("count", [0.5], 0.5)).toBe(1);
  });

  it("shows zero difference when the group is balanced", () => {
    expect(aggregate("difference", [0.4, 0.4, 0.4])).toBe(0);
  });

  it("treats a lone viewer's difference as their own value", () => {
    expect(aggregate("difference", [0.7])).toBe(0.7);
  });

  it("is zero with no viewers", () => {
    for (const kind of ["sum", "max", "difference", "count"] as const) expect(aggregate(kind, [])).toBe(0);
  });
});

describe("normalised", () => {
  it("clamps sum to 1", () => expect(normalised("sum", 2.5, 4)).toBe(1));
  it("divides count by the group size", () => expect(normalised("count", 3, 4)).toBe(0.75));
  it("leaves max and difference alone", () => {
    expect(normalised("max", 0.3, 4)).toBe(0.3);
    expect(normalised("difference", 0.3, 4)).toBe(0.3);
  });
});

describe("AttentionField", () => {
  it("keeps each viewer's attention separate", () => {
    const field = new AttentionField(3);
    field.addViewer("a");
    field.addViewer("b");
    field.add("a", 1, 0.25);
    expect(field.channel("a")[1]).toBeCloseTo(0.25);
    expect(field.channel("b")[1]).toBe(0);
  });

  it("saturates at the ceiling", () => {
    const field = new AttentionField(1, 0.5);
    field.addViewer("a");
    field.add("a", 0, 0.4);
    field.add("a", 0, 0.4);
    expect(field.channel("a")[0]).toBe(0.5);
  });

  it("keeps what a viewer has when they are added twice", () => {
    const field = new AttentionField(1);
    field.addViewer("a");
    field.add("a", 0, 0.5);
    field.addViewer("a");
    expect(field.channel("a")[0]).toBe(0.5);
  });

  it("does not limit the number of viewers", () => {
    const field = new AttentionField(1);
    for (let i = 0; i < 12; i++) field.addViewer(`v${i}`);
    expect(field.viewers).toHaveLength(12);
  });

  it("rejects an unknown viewer", () => {
    expect(() => new AttentionField(1).add("nobody", 0, 1)).toThrow(/unknown viewer/);
  });

  it("forgets a removed viewer", () => {
    const field = new AttentionField(1);
    field.addViewer("a");
    field.removeViewer("a");
    expect(field.viewers).toEqual([]);
  });

  it("scales every viewer and flushes tiny values to exactly zero", () => {
    const field = new AttentionField(2);
    field.addViewer("a");
    field.add("a", 0, 1);
    field.add("a", 1, 0.0015);
    field.scale(0.5);
    expect(field.channel("a")[0]).toBe(0.5);
    expect(field.channel("a")[1]).toBe(0);
  });

  it("clears", () => {
    const field = new AttentionField(1);
    field.addViewer("a");
    field.add("a", 0, 1);
    field.clear();
    expect(field.channel("a")[0]).toBe(0);
    expect(field.viewers).toEqual(["a"]);
  });
});
