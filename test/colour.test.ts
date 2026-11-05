import { describe, expect, it } from "vitest";
import { explicitColours, interpolatedColours, parseColour, toHex, type Attending } from "../src/core/colour.js";

const BLUE = "#3d8bff";
const ORANGE = "#f08a3c";
const GREEN = "#17a67e";
const PURPLE = "#8e5bd6";
const PINK = "#ec4f9c";

const viewer = (id: string, colour: string, value: number): Attending => ({ id, colour, value });

/** Hue in degrees of an sRGB colour, for checking where a blend lands. */
function hue([r, g, b]: readonly number[]) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

const saturation = (c: readonly number[]) => Math.max(...c) - Math.min(...c);

describe("parseColour and toHex", () => {
  it("round-trips", () => expect(toHex(parseColour(BLUE))).toBe(BLUE));
  it("expands short hex", () => expect(toHex(parseColour("#f80"))).toBe("#ff8800"));
  it("passes triples through", () => expect(parseColour([1, 0, 0])).toEqual([1, 0, 0]));
  it("rejects anything else", () => expect(() => parseColour("rebeccapurple")).toThrow(/not a hex/));
});

describe("interpolatedColours", () => {
  const policy = interpolatedColours();

  it("returns null when no one attended", () => {
    expect(policy.resolve([viewer("a", BLUE, 0), viewer("b", ORANGE, 0.01)])).toBeNull();
  });

  it("gives a lone viewer exactly their own colour, whatever the value", () => {
    expect(toHex(policy.resolve([viewer("a", BLUE, 0.3), viewer("b", ORANGE, 0)])!)).toBe(BLUE);
  });

  it("blends blue and orange into a saturated pink, not grey", () => {
    const blend = policy.resolve([viewer("a", BLUE, 1), viewer("b", ORANGE, 1)])!;
    expect(hue(blend)).toBeGreaterThan(290);
    expect(hue(blend)).toBeLessThan(350);
    expect(saturation(blend)).toBeGreaterThan(0.3);
  });

  it("does not depend on the order of viewers, for two, three or four", () => {
    const people = [viewer("a", BLUE, 0.9), viewer("b", ORANGE, 0.4), viewer("c", GREEN, 0.7), viewer("d", PURPLE, 0.2)];
    for (const n of [2, 3, 4]) {
      const some = people.slice(0, n);
      const forward = policy.resolve(some)!;
      const backward = policy.resolve([...some].reverse())!;
      forward.forEach((c, i) => expect(c).toBeCloseTo(backward[i], 6));
    }
  });

  it("leans towards the viewer with more attention", () => {
    const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    const blue = hue(parseColour(BLUE));
    const towardsBlue = policy.resolve([viewer("a", BLUE, 1), viewer("b", ORANGE, 0.2)])!;
    const even = policy.resolve([viewer("a", BLUE, 1), viewer("b", ORANGE, 1)])!;
    expect(hueDistance(hue(towardsBlue), blue)).toBeLessThan(hueDistance(hue(even), blue));
  });

  it("stays in gamut and fades to grey as three hues cancel out", () => {
    // Search the weights of three hues spread around the wheel for the point
    // where they cancel. The blend must get close to grey there, and never
    // leave the valid range on the way.
    let leastSaturated = 1;
    for (let w1 = 0.1; w1 <= 1; w1 += 0.02) {
      for (let w2 = 0.1; w2 <= 1; w2 += 0.02) {
        const blend = policy.resolve([viewer("a", "#e0446a", 0.6), viewer("b", "#6fa51c", w1), viewer("c", "#4a7ae6", w2)])!;
        blend.forEach((c) => {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        });
        leastSaturated = Math.min(leastSaturated, saturation(blend));
      }
    }
    expect(leastSaturated).toBeLessThan(0.05);
  });

  it("returns the grey itself for viewers whose colours have no hue", () => {
    expect(toHex(policy.resolve([viewer("a", "#808080", 1), viewer("b", "#808080", 1)])!)).toBe("#808080");
  });

  it("respects a custom threshold", () => {
    const strict = interpolatedColours({ threshold: 0.5 });
    expect(toHex(strict.resolve([viewer("a", BLUE, 0.6), viewer("b", ORANGE, 0.4)])!)).toBe(BLUE);
  });
});

describe("explicitColours", () => {
  it("returns null when no one attended", () => {
    expect(explicitColours({ shared: PINK }).resolve([viewer("a", BLUE, 0)])).toBeNull();
  });

  it("gives a lone viewer their own colour", () => {
    const rgb = explicitColours({ shared: PINK }).resolve([viewer("a", BLUE, 1), viewer("b", ORANGE, 0)])!;
    expect(toHex(rgb)).toBe(BLUE);
  });

  it("uses the one shared colour for any overlap, however many people", () => {
    const policy = explicitColours({ shared: PINK });
    const overlap = (n: number) => [viewer("a", BLUE, 1), viewer("b", ORANGE, 1), viewer("c", GREEN, 1), viewer("d", PURPLE, 1)].slice(0, n);
    for (const n of [2, 3, 4]) expect(toHex(policy.resolve(overlap(n))!)).toBe(PINK);
  });

  it("ignores viewers below the threshold when counting an overlap", () => {
    const rgb = explicitColours({ shared: PINK }).resolve([viewer("a", BLUE, 1), viewer("b", ORANGE, 0.01)])!;
    expect(toHex(rgb)).toBe(BLUE);
  });

  it("accepts a colour as channels", () => {
    const rgb = explicitColours({ shared: [0, 1, 0] }).resolve([viewer("a", BLUE, 1), viewer("b", ORANGE, 1)])!;
    expect(toHex(rgb)).toBe("#00ff00");
  });
});
