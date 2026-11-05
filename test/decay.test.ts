import { describe, expect, it } from "vitest";
import { AttentionField } from "../src/core/accumulators.js";
import { halfLifeDecay, noDecay } from "../src/core/decay.js";

describe("halfLifeDecay", () => {
  it("halves over one half-life", () => {
    expect(halfLifeDecay(10)(10)).toBeCloseTo(0.5);
    expect(halfLifeDecay(10)(20)).toBeCloseTo(0.25);
  });

  it("gives the same result however time is divided", () => {
    const decay = halfLifeDecay(7);
    let value = 1;
    for (let i = 0; i < 100; i++) value *= decay(0.1);
    expect(value).toBeCloseTo(decay(10), 8);
  });

  it("rejects a half-life that is not positive", () => {
    expect(() => halfLifeDecay(0)).toThrow(RangeError);
    expect(() => halfLifeDecay(-1)).toThrow(RangeError);
  });

  it("ends at exactly zero when applied to a field", () => {
    const field = new AttentionField(1);
    field.addViewer("a");
    field.add("a", 0, 1);
    const decay = halfLifeDecay(1);
    for (let i = 0; i < 20; i++) field.scale(decay(1));
    expect(field.channel("a")[0]).toBe(0);
  });
});

describe("noDecay", () => {
  it("keeps everything", () => expect(noDecay(1000)).toBe(1));
});
