import type { TargetId, Vec3, ViewerId } from "./types.js";

/** Where in space something happened, for placing a tooltip or checking a region. */
export interface AttentionEvent {
  viewer: ViewerId;
  target: TargetId;
  voxel: number;
  /** World-space point on the object. */
  point: Vec3;
  /** Centre of the voxel, in the object's local space. It stays valid when the object moves. */
  localPoint: Vec3;
}

export interface DwellEvent extends AttentionEvent {
  /** How long the gaze had rested in this region when the event fired. */
  seconds: number;
}

export interface JointEvent extends AttentionEvent {
  /** The other viewers looking at the same region. */
  others: ViewerId[];
}

export interface AttentionEventMap {
  /** The viewer's gaze landed on an object. */
  gazeenter: AttentionEvent;
  /** The viewer's gaze left an object. */
  gazeleave: AttentionEvent;
  /** The gaze rested in one region for the session's `dwellTime`. Fires once until the gaze moves away. */
  dwell: DwellEvent;
  /** Someone else started looking at the same region as this viewer. */
  jointstart: JointEvent;
  /** This viewer is no longer sharing a region with anyone. */
  jointend: JointEvent;
}

export type AttentionEventType = keyof AttentionEventMap;

/** A small typed event emitter. */
export class AttentionEmitter {
  private readonly listeners = new Map<AttentionEventType, Set<(event: never) => void>>();

  /** Starts listening, and returns a function that stops. */
  on<T extends AttentionEventType>(type: T, listener: (event: AttentionEventMap[T]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener as (event: never) => void);
    return () => set.delete(listener as (event: never) => void);
  }

  emit<T extends AttentionEventType>(type: T, event: AttentionEventMap[T]) {
    for (const listener of this.listeners.get(type) ?? []) (listener as (event: AttentionEventMap[T]) => void)(event);
  }
}
