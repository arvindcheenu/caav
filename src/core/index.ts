export type { ColourInput, Ray, Rgb, TargetId, Vec3, ViewerId } from "./types.js";
export { createSampleClock, type AttentionSource } from "./capture.js";
export { VoxelGrid, type VoxelHit } from "./voxel-grid.js";
export {
  ACCUMULATOR_KINDS,
  AttentionField,
  DEFAULT_ATTENDED_THRESHOLD,
  aggregate,
  normalised,
  type AccumulatorKind,
} from "./accumulators.js";
export { halfLifeDecay, noDecay, type Decay } from "./decay.js";
export {
  explicitColours,
  interpolatedColours,
  parseColour,
  toHex,
  type Attending,
  type ColourPolicy,
  type ExplicitColourOptions,
} from "./colour.js";
export {
  alwaysOn,
  explicitTrigger,
  implicitTrigger,
  type ImplicitOptions,
  type TriggerContext,
  type TriggerPolicy,
} from "./trigger.js";
export type { AttentionEvent, AttentionEventMap, AttentionEventType, DwellEvent, JointEvent } from "./events.js";
export {
  AttentionSession,
  createSession,
  type Gaze,
  type SessionOptions,
  type Target,
  type TargetOptions,
  type Viewer,
  type ViewerOptions,
} from "./session.js";
export { createShading, shade, type ShadeOptions, type Shading } from "./shading.js";
