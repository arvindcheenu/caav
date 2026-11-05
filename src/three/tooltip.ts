import { Vector3, type Camera } from "three";
import type { Vec3 } from "../core/index.js";

export interface SpatialTooltipOptions {
  camera: Camera;
  /** The element over the canvas that holds the tooltip. It needs its own positioning context. */
  overlay: HTMLElement;
}

export interface SpatialTooltip {
  /** Shows text anchored to a world-space point. With `seconds`, it hides itself after that long. */
  show(point: Vec3, text: string, options?: { seconds?: number }): void;
  hide(): void;
  /** Keeps the tooltip on its point as the camera moves. Call once per frame. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * A label pinned to a point in space, drawn as a DOM element so it stays sharp
 * and screen readers can read it. Pair it with a session event to get an
 * event-driven tooltip. Style it through `.caav-tooltip`.
 */
export function createSpatialTooltip({ camera, overlay }: SpatialTooltipOptions): SpatialTooltip {
  const element = document.createElement("div");
  element.className = "caav-tooltip";
  element.setAttribute("role", "status");
  element.style.cssText =
    "position:absolute;z-index:1;left:0;top:0;transform:translate(-50%,calc(-100% - 10px));padding:4px 10px;border-radius:8px;" +
    "background:#000000d9;color:#fff;font-size:13px;white-space:nowrap;pointer-events:none;";
  element.hidden = true;
  overlay.append(element);

  const anchor = new Vector3();
  let active = false;
  let remaining = Infinity;

  const hide = () => {
    active = false;
    element.hidden = true;
  };

  return {
    show(point, text, options = {}) {
      anchor.set(point[0], point[1], point[2]);
      element.textContent = text;
      remaining = options.seconds ?? Infinity;
      active = true;
    },
    hide,
    update(dt) {
      if (!active) return;
      remaining -= dt;
      if (remaining <= 0) {
        hide();
        return;
      }
      camera.updateMatrixWorld();
      const projected = anchor.clone().project(camera);
      const onScreen = projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
      element.hidden = !onScreen;
      if (onScreen) {
        element.style.left = `${((projected.x + 1) / 2) * overlay.clientWidth}px`;
        element.style.top = `${((1 - projected.y) / 2) * overlay.clientHeight}px`;
      }
    },
    dispose() {
      element.remove();
    },
  };
}
