import { DEFAULT_ATTENDED_THRESHOLD } from "./accumulators.js";
import type { ColourInput, Rgb, ViewerId } from "./types.js";

/** One viewer's colour and attention at a voxel. */
export interface Attending {
  id: ViewerId;
  colour: ColourInput;
  value: number;
}

/**
 * Decides a voxel's colour from who attended it. Returns null when no one did,
 * so a presentation can leave the voxel out.
 */
export interface ColourPolicy {
  readonly kind: string;
  /** `viewers` lists every viewer with their value at this voxel, attended or not. */
  resolve(viewers: readonly Attending[]): Rgb | null;
}

/**
 * Shared colour by interpolation: the voxel's colour is the attention-weighted
 * mean of its viewers' colours, for any number of viewers.
 *
 * Averaging in sRGB or OKLab turns opposite hues such as blue and orange into
 * grey, which is hard to read as "both of you". So lightness and chroma are
 * averaged, and hue takes the weighted circular mean, which travels the short
 * way round the wheel: the paper's blue and orange meet at a pink.
 *
 * Three or four viewers use the same formula. If their hues cancel out exactly,
 * the hue is undefined and the result fades to a neutral grey of their mean
 * lightness, rather than jumping to an arbitrary hue.
 */
export function interpolatedColours(options: { threshold?: number } = {}): ColourPolicy {
  const threshold = options.threshold ?? DEFAULT_ATTENDED_THRESHOLD;
  const lab = new OklabCache();
  return {
    kind: "interpolated",
    resolve(viewers) {
      let weight = 0;
      let lightness = 0;
      let chroma = 0;
      let a = 0;
      let b = 0;
      let only: Attending | undefined;
      let attending = 0;
      for (const viewer of viewers) {
        if (viewer.value < threshold) continue;
        attending++;
        only = viewer;
        const [L, labA, labB] = lab.get(viewer.colour);
        const c = Math.hypot(labA, labB);
        weight += viewer.value;
        lightness += viewer.value * L;
        chroma += viewer.value * c;
        if (c > 0) {
          a += (viewer.value * labA) / c;
          b += (viewer.value * labB) / c;
        }
      }
      if (attending === 0) return null;
      if (attending === 1) return parseColour(only!.colour);
      // How much the hues agree, from 0 (they cancel) to 1 (they match).
      const agreement = Math.hypot(a, b) / weight;
      const fade = Math.min(1, agreement / HUE_FADE_BELOW);
      const scale = agreement > 0 ? ((chroma / weight) * fade) / (agreement * weight) : 0;
      return oklabToSrgb(lightness / weight, a * scale, b * scale);
    },
  };
}

/** Below this hue agreement the interpolated colour fades towards grey. */
const HUE_FADE_BELOW = 0.15;

export interface ExplicitColourOptions {
  /** The one colour for any voxel that two or more viewers attended. */
  shared: ColourInput;
  threshold?: number;
}

/**
 * Shared colour chosen by the author, for when a fixed colour reads better than
 * a blend. A voxel attended by one viewer keeps that viewer's colour, and any
 * overlap, however many people, takes `shared`.
 */
export function explicitColours(options: ExplicitColourOptions): ColourPolicy {
  const threshold = options.threshold ?? DEFAULT_ATTENDED_THRESHOLD;
  const shared = parseColour(options.shared);
  return {
    kind: "explicit",
    resolve(viewers) {
      const attending = viewers.filter((v) => v.value >= threshold);
      if (attending.length === 0) return null;
      return attending.length === 1 ? parseColour(attending[0].colour) : shared;
    },
  };
}

/** Reads `#rgb`, `#rrggbb` or an sRGB triple. */
export function parseColour(colour: ColourInput): Rgb {
  if (typeof colour !== "string") return colour;
  const hex = colour.replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: "${colour}"`);
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex([r, g, b]: Rgb): string {
  const channel = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Colour resolution runs per voxel, so a viewer's colour is converted only once. */
class OklabCache {
  private readonly known = new Map<ColourInput, readonly [number, number, number]>();
  get(colour: ColourInput) {
    let lab = this.known.get(colour);
    if (!lab) this.known.set(colour, (lab = srgbToOklab(parseColour(colour))));
    return lab;
  }
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => {
  const clipped = Math.min(1, Math.max(0, c));
  return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
};

/** Björn Ottosson's OKLab, from https://bottosson.github.io/posts/oklab/ */
function srgbToOklab([sr, sg, sb]: Rgb): readonly [number, number, number] {
  const r = toLinear(sr);
  const g = toLinear(sg);
  const b = toLinear(sb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToSrgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
