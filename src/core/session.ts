import { AttentionField } from "./accumulators.js";
import { createSampleClock, type AttentionSource } from "./capture.js";
import { halfLifeDecay, type Decay } from "./decay.js";
import { AttentionEmitter, type AttentionEvent, type AttentionEventMap, type AttentionEventType } from "./events.js";
import type { TriggerContext } from "./trigger.js";
import type { ColourInput, Ray, TargetId, Vec3, ViewerId } from "./types.js";
import type { VoxelGrid } from "./voxel-grid.js";

export interface SessionOptions {
  /** Attention samples per second. The paper uses 10. */
  captureRate?: number;
  /** Attention gained per second of steady gaze. The default saturates a voxel in 2.5 s. */
  gain?: number;
  /** Radius of the region of influence, in voxels. 0 is the paper's single voxel. */
  influenceRadius?: number;
  decay?: Decay;
  /** Gazes within this many voxels count as the same region, for dwell and joint attention. */
  regionRadius?: number;
  /** Seconds of steady gaze before a `dwell` event fires. */
  dwellTime?: number;
}

export interface ViewerOptions {
  id: ViewerId;
  colour: ColourInput;
  source: AttentionSource;
  /** Display name. Defaults to the id. */
  label?: string;
}

export interface Viewer extends ViewerOptions {
  label: string;
}

export interface TargetOptions {
  id: TargetId;
  grid: VoxelGrid;
  /** Moves a world-space ray into the grid's local space without normalising it, so `t` stays a world distance. */
  toLocal: (ray: Ray) => Ray;
}

export interface Target extends TargetOptions {
  field: AttentionField;
}

/** Where a viewer is looking, once a sample has hit something. */
export interface Gaze {
  target: Target;
  voxel: number;
  distance: number;
  /** World-space hit point. */
  point: Vec3;
}

interface ViewerState {
  gaze: Gaze | null;
  anchor: { target: Target; voxel: number } | null;
  dwell: number;
  dwellFired: boolean;
  others: ViewerId[];
}

/** The hub: viewers and targets register here, and `tick` runs capture, recording and decay. */
export class AttentionSession {
  readonly viewers = new Map<ViewerId, Viewer>();
  readonly targets = new Map<TargetId, Target>();

  private clock;
  private gain: number;
  private influenceRadius: number;
  private regionRadius: number;
  private dwellTime: number;
  private decay: Decay;
  private readonly states = new Map<ViewerId, ViewerState>();
  private readonly emitter = new AttentionEmitter();
  private samples = 0;

  constructor(options: SessionOptions = {}) {
    this.clock = createSampleClock(options.captureRate ?? 10);
    this.gain = options.gain ?? 0.4;
    this.influenceRadius = options.influenceRadius ?? 0;
    this.regionRadius = options.regionRadius ?? 2;
    this.dwellTime = options.dwellTime ?? 1.5;
    this.decay = options.decay ?? halfLifeDecay(30);
  }

  /** Changes any setting while running. Recorded attention is kept. */
  configure(options: SessionOptions) {
    if (options.captureRate !== undefined) this.clock = createSampleClock(options.captureRate);
    if (options.gain !== undefined) this.gain = options.gain;
    if (options.influenceRadius !== undefined) this.influenceRadius = options.influenceRadius;
    if (options.regionRadius !== undefined) this.regionRadius = options.regionRadius;
    if (options.dwellTime !== undefined) this.dwellTime = options.dwellTime;
    if (options.decay !== undefined) this.decay = options.decay;
  }

  /** Listens for attention events, and returns a function that stops listening. */
  on<T extends AttentionEventType>(type: T, listener: (event: AttentionEventMap[T]) => void): () => void {
    return this.emitter.on(type, listener);
  }

  registerViewer(options: ViewerOptions): Viewer {
    if (this.viewers.has(options.id)) throw new Error(`viewer "${options.id}" is already registered`);
    const viewer = { ...options, label: options.label ?? options.id };
    this.viewers.set(viewer.id, viewer);
    this.states.set(viewer.id, { gaze: null, anchor: null, dwell: 0, dwellFired: false, others: [] });
    for (const target of this.targets.values()) target.field.addViewer(viewer.id);
    return viewer;
  }

  /** Forgets a viewer and their recorded attention. */
  removeViewer(id: ViewerId) {
    this.viewers.delete(id);
    this.states.delete(id);
    for (const target of this.targets.values()) target.field.removeViewer(id);
    for (const state of this.states.values()) state.others = state.others.filter((other) => other !== id);
  }

  registerTarget(options: TargetOptions): Target {
    if (this.targets.has(options.id)) throw new Error(`target "${options.id}" is already registered`);
    const target = { ...options, field: this.createField(options.grid) };
    this.targets.set(target.id, target);
    return target;
  }

  removeTarget(id: TargetId) {
    this.targets.delete(id);
    this.forgetGazeOn(id);
  }

  /** Swaps a target's voxels, for a new resolution. Its recorded attention starts again from zero. */
  replaceGrid(id: TargetId, grid: VoxelGrid) {
    const target = this.targets.get(id);
    if (!target) throw new Error(`unknown target "${id}"`);
    target.grid = grid;
    target.field = this.createField(grid);
    this.forgetGazeOn(id);
  }

  private createField(grid: VoxelGrid) {
    const field = new AttentionField(grid.count);
    for (const id of this.viewers.keys()) field.addViewer(id);
    return field;
  }

  private forgetGazeOn(id: TargetId) {
    for (const state of this.states.values()) {
      if (state.gaze?.target.id === id) state.gaze = null;
      if (state.anchor?.target.id === id) state.anchor = null;
    }
  }

  /** Clears all recorded attention and keeps everyone registered. */
  reset() {
    for (const target of this.targets.values()) target.field.clear();
  }

  /** Counts samples taken, so a view can repaint only when something changed. */
  get sampleCount() {
    return this.samples;
  }

  /** Advances by `dt` seconds. Call it once per frame. */
  tick(dt: number) {
    const due = this.clock.advance(dt);
    for (let i = 0; i < due; i++) this.sample();
  }

  private sample() {
    const period = this.clock.period;
    const factor = this.decay(period);
    if (factor !== 1) for (const target of this.targets.values()) target.field.scale(factor);

    const previous = new Map<ViewerId, Gaze | null>();
    for (const viewer of this.viewers.values()) {
      const state = this.states.get(viewer.id)!;
      previous.set(viewer.id, state.gaze);
      const ray = viewer.source.sample();
      state.gaze = ray ? this.nearestHit(ray) : null;
      if (state.gaze) this.record(viewer.id, state.gaze, this.gain * period);
      this.updateDwell(state, period);
    }
    this.samples++;

    // Events go out once everyone has moved, so joint attention sees this sample's gazes.
    for (const [id, state] of this.states) {
      this.emitGazeEvents(id, state, previous.get(id) ?? null);
      this.emitJointEvents(id, state, previous.get(id) ?? null);
    }
  }

  /** The nearest voxel across all targets, so one object can occlude another. */
  private nearestHit(ray: Ray): Gaze | null {
    let best: Gaze | null = null;
    for (const target of this.targets.values()) {
      const hit = target.grid.raycast(target.toLocal(ray));
      if (hit && (!best || hit.t < best.distance)) {
        const { origin: o, direction: d } = ray;
        best = {
          target,
          voxel: hit.voxel,
          distance: hit.t,
          point: [o[0] + hit.t * d[0], o[1] + hit.t * d[1], o[2] + hit.t * d[2]],
        };
      }
    }
    return best;
  }

  private record(viewer: ViewerId, gaze: Gaze, amount: number) {
    const { grid, field } = gaze.target;
    const radius = this.influenceRadius;
    if (radius === 0) {
      field.add(viewer, gaze.voxel, amount);
      return;
    }
    // The centre gets the most, falling off linearly to a quarter at the edge.
    grid.forEachNear(gaze.voxel, radius, (voxel, distance) => {
      field.add(viewer, voxel, amount * (1 - 0.75 * (distance / radius)));
    });
  }

  private updateDwell(state: ViewerState, period: number) {
    const { gaze, anchor } = state;
    if (gaze && anchor && this.sameRegion(anchor, gaze)) {
      state.dwell += period;
      return;
    }
    state.anchor = gaze && { target: gaze.target, voxel: gaze.voxel };
    state.dwell = 0;
    state.dwellFired = false;
  }

  private sameRegion(a: { target: Target; voxel: number }, b: { target: Target; voxel: number }) {
    return a.target === b.target && a.target.grid.cellDistance(a.voxel, b.voxel) <= this.regionRadius;
  }

  private othersInRegion(viewer: ViewerId, gaze: Gaze | null): ViewerId[] {
    if (!gaze) return [];
    const others: ViewerId[] = [];
    for (const [other, state] of this.states) {
      if (other !== viewer && state.gaze && this.sameRegion(gaze, state.gaze)) others.push(other);
    }
    return others;
  }

  private describe(viewer: ViewerId, gaze: Gaze): AttentionEvent {
    return { viewer, target: gaze.target.id, voxel: gaze.voxel, point: gaze.point, localPoint: gaze.target.grid.centre(gaze.voxel) };
  }

  private emitGazeEvents(id: ViewerId, state: ViewerState, previous: Gaze | null) {
    const { gaze } = state;
    if (previous && previous.target !== gaze?.target) this.emitter.emit("gazeleave", this.describe(id, previous));
    if (gaze && previous?.target !== gaze.target) this.emitter.emit("gazeenter", this.describe(id, gaze));
    if (gaze && !state.dwellFired && state.dwell >= this.dwellTime) {
      state.dwellFired = true;
      this.emitter.emit("dwell", { ...this.describe(id, gaze), seconds: state.dwell });
    }
  }

  private emitJointEvents(id: ViewerId, state: ViewerState, previous: Gaze | null) {
    const before = state.others;
    state.others = this.othersInRegion(id, state.gaze);
    if (before.length === 0 && state.others.length > 0) {
      this.emitter.emit("jointstart", { ...this.describe(id, state.gaze!), others: state.others });
    } else if (before.length > 0 && state.others.length === 0) {
      const last = state.gaze ?? previous;
      if (last) this.emitter.emit("jointend", { ...this.describe(id, last), others: before });
    }
  }

  /** The viewer's latest gaze, or null when they are looking at nothing registered. */
  gaze(viewer: ViewerId): Gaze | null {
    return this.states.get(viewer)?.gaze ?? null;
  }

  /** The measurements an implicit trigger bases its decision on. */
  triggerContext(viewer: ViewerId, dt: number): TriggerContext {
    const state = this.states.get(viewer);
    return { dt, dwell: state?.dwell ?? 0, joint: state ? this.othersInRegion(viewer, state.gaze).length : 0 };
  }
}

export function createSession(options?: SessionOptions) {
  return new AttentionSession(options);
}
