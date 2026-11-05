/** Plain value types shared by every module. Nothing here depends on a rendering engine. */

export type ViewerId = string;
export type TargetId = string;

export type Vec3 = readonly [x: number, y: number, z: number];

/** A ray. `direction` need not be unit length: `t` along the ray is `origin + t * direction`. */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** sRGB colour with channels from 0 to 1. */
export type Rgb = readonly [r: number, g: number, b: number];

/** A CSS hex colour such as `#3d8bff`, or the same colour as channels. */
export type ColourInput = string | Rgb;
