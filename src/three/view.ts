import type { Camera, Scene, Vector3 } from "three";
import {
  createShading,
  explicitTrigger,
  interpolatedColours,
  shade,
  type AccumulatorKind,
  type AttentionSession,
  type ColourPolicy,
  type Shading,
  type TriggerPolicy,
  type ViewerId,
  type VoxelGrid,
} from "../core/index.js";
import type { AttachedTarget } from "./attach.js";
import { createCameraEmbedded } from "./presentations/camera-embedded.js";
import { createCameraSeparated } from "./presentations/camera-separated.js";
import { DEFAULT_STYLE, type Presentation, type PresentationContext, type PresentationKind, type PresentationStyle } from "./presentations/types.js";
import { createWorldEmbedded } from "./presentations/world-embedded.js";
import { createWorldSeparated, type Miniature } from "./presentations/world-separated.js";

export interface AttentionViewOptions {
  session: AttentionSession;
  attached: AttachedTarget;
  /** Whose view this is: their trigger context drives it, and their camera renders it. */
  viewer: ViewerId;
  camera: Camera;
  scene: Scene;
  /** Holds screen-space panels. Only the camera-separated presentation needs it. */
  overlay?: HTMLElement;
  /** Keeps this view's objects to one three.js layer, when several views render one scene. */
  layer?: number;
  presentation?: PresentationKind;
  trigger?: TriggerPolicy;
  accumulator?: AccumulatorKind;
  colour?: ColourPolicy;
  /** Voxels below this display value stay transparent. */
  threshold?: number;
  style?: PresentationStyle;
}

/**
 * One viewer's display of one target. It ties a trigger policy, an accumulator,
 * a colour policy and a presentation together, and each can be swapped at any
 * time. The defaults are the paper's HeedVision: world-space, embedded,
 * explicitly triggered.
 */
export class AttentionView {
  private shadingBuffers: Shading;
  private readonly options: AttentionViewOptions;
  private readonly context: PresentationContext;
  private readonly presentations = new Map<PresentationKind, Presentation>();

  private active!: Presentation;
  private kind!: PresentationKind;
  private grid: VoxelGrid;
  private movedMiniatureTo: Vector3 | null = null;
  private shown = false;
  private stale = true;
  private lastSample = -1;

  trigger: TriggerPolicy;
  accumulator: AccumulatorKind;
  colour: ColourPolicy;
  threshold: number | undefined;

  constructor(options: AttentionViewOptions) {
    this.options = options;
    this.trigger = options.trigger ?? explicitTrigger();
    this.accumulator = options.accumulator ?? "sum";
    this.colour = options.colour ?? interpolatedColours();
    this.threshold = options.threshold;
    this.grid = options.attached.target.grid;
    this.shadingBuffers = createShading(this.grid.count);
    this.context = {
      attached: options.attached,
      scene: options.scene,
      overlay: options.overlay,
      layer: options.layer,
      style: options.style ?? DEFAULT_STYLE,
    };
    if (options.layer !== undefined) options.camera.layers.enable(options.layer);
    this.setPresentation(options.presentation ?? "world-embedded");
  }

  /** The latest colour, opacity and counts for each voxel. */
  get shading(): Shading {
    return this.shadingBuffers;
  }

  get presentation(): PresentationKind {
    return this.kind;
  }

  /** Whether the viewer currently sees attention. */
  get visible() {
    return this.shown;
  }

  /** The movable miniature, when the world-separated presentation is active. */
  get miniature(): Miniature | null {
    return this.kind === "world-separated" ? (this.active as Miniature) : null;
  }

  setPresentation(kind: PresentationKind) {
    this.active?.setVisible(false);
    let next = this.presentations.get(kind);
    if (!next) {
      next = PRESENTATIONS[kind](this.context);
      if (kind === "world-separated" && this.movedMiniatureTo) (next as Miniature).moveTo(...this.movedMiniatureTo.toArray());
      this.presentations.set(kind, next); // kept, so a moved miniature stays where it was put
    }
    this.active = next;
    this.kind = kind;
    this.active.setVisible(this.shown);
    this.stale = true;
  }

  setTrigger(trigger: TriggerPolicy) {
    this.trigger = trigger;
  }

  setAccumulator(accumulator: AccumulatorKind) {
    this.accumulator = accumulator;
    this.stale = true;
  }

  setColourPolicy(colour: ColourPolicy) {
    this.colour = colour;
    this.stale = true;
  }

  setThreshold(threshold: number | undefined) {
    this.threshold = threshold;
    this.stale = true;
  }

  /** Changes the neutrals drawn around attention, for a theme switch. A moved miniature keeps its place. */
  setStyle(style: PresentationStyle) {
    this.context.style = style;
    this.rebuild();
  }

  /** Runs the trigger and redraws what changed. Call once per frame, after `session.tick`. */
  update(dt: number) {
    const { session, viewer, attached, camera } = this.options;
    if (attached.target.grid !== this.grid) this.rebuild();

    const visible = this.trigger.update(session.triggerContext(viewer, dt));
    if (visible !== this.shown) {
      this.shown = visible;
      this.active.setVisible(visible);
      this.stale = true;
    }
    if (!visible) return;

    if (this.stale || session.sampleCount !== this.lastSample) {
      shade(session, attached.target, this.shadingBuffers, { accumulator: this.accumulator, colour: this.colour, threshold: this.threshold });
      this.active.draw(this.shadingBuffers);
      this.stale = false;
      this.lastSample = session.sampleCount;
    }
    this.active.follow(camera, dt);
  }

  /** The voxels changed, so everything built from them is rebuilt. A moved miniature keeps its place. */
  private rebuild() {
    const miniature = this.presentations.get("world-separated") as Miniature | undefined;
    if (miniature) this.movedMiniatureTo = miniature.object.position.clone();
    this.disposePresentations();
    this.grid = this.options.attached.target.grid;
    this.shadingBuffers = createShading(this.grid.count);
    this.setPresentation(this.kind);
  }

  private disposePresentations() {
    for (const presentation of this.presentations.values()) presentation.dispose();
    this.presentations.clear();
  }

  dispose() {
    this.disposePresentations();
  }
}

const PRESENTATIONS: Record<PresentationKind, (context: PresentationContext) => Presentation> = {
  "world-embedded": createWorldEmbedded,
  "world-separated": createWorldSeparated,
  "camera-embedded": createCameraEmbedded,
  "camera-separated": createCameraSeparated,
};

export function createAttentionView(options: AttentionViewOptions) {
  return new AttentionView(options);
}
