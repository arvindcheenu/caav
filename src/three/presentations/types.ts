import type { Camera, Scene } from "three";
import type { Shading } from "../../core/index.js";
import type { AttachedTarget } from "../attach.js";

/** The four quadrants of the design space: situatedness, then presentation. */
export type PresentationKind = "world-embedded" | "world-separated" | "camera-embedded" | "camera-separated";

export const PRESENTATION_KINDS: readonly PresentationKind[] = [
  "world-embedded",
  "world-separated",
  "camera-embedded",
  "camera-separated",
];

/** Neutral colours a presentation draws around the attention, as CSS hex. */
export interface PresentationStyle {
  /** Backgrounds: bounding-box faces and the panel. */
  surface: string;
  /** The data itself: the replica and silhouettes. */
  ink: string;
}

export const DEFAULT_STYLE: PresentationStyle = { surface: "#10131a", ink: "#8a93a6" };

export interface PresentationContext {
  attached: AttachedTarget;
  scene: Scene;
  /** Element for screen-space panels. It needs its own positioning context. */
  overlay?: HTMLElement;
  /** three.js layer for this view's objects, when several views share a scene. */
  layer?: number;
  style: PresentationStyle;
}

/** How one quadrant draws attention. A view owns one per kind and shows one at a time. */
export interface Presentation {
  setVisible(visible: boolean): void;
  /** Attention changed. */
  draw(shading: Shading): void;
  /** Called every frame while visible, for anything that depends on the camera or the object's pose. */
  follow(camera: Camera, dt: number): void;
  dispose(): void;
}
