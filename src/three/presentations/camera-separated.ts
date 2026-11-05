import { Matrix4, Vector3, type Camera } from "three";
import { toHex, type Shading } from "../../core/index.js";
import type { Presentation, PresentationContext } from "./types.js";

/** How often the panel redraws, at most. Attention itself only changes at the capture rate. */
const REPAINT_EVERY = 1 / 20;

/**
 * Camera space, separated: a 2D panel over the view, beside the data. It shows
 * the object from the viewer's own angle, so it stays in step as they move,
 * with the data as a faint silhouette and attention on top.
 *
 * It adds a `<canvas class="caav-panel">` to the view's overlay element, which
 * it places at the bottom right. Style `.caav-panel` to change that.
 */
export function createCameraSeparated({ attached, overlay, style }: PresentationContext): Presentation {
  if (!overlay) throw new Error('the "camera-separated" presentation needs an `overlay` element to hold its panel');
  const grid = attached.target.grid;

  const canvas = document.createElement("canvas");
  canvas.className = "caav-panel";
  canvas.setAttribute("role", "img");
  canvas.style.cssText = "position:absolute;right:12px;bottom:12px;width:min(34%,240px);aspect-ratio:1;pointer-events:none;";
  canvas.hidden = true;
  overlay.append(canvas);
  const context = canvas.getContext("2d")!;

  // Voxel centres relative to the box centre, ready to rotate.
  const centre = attached.bounds.getCenter(new Vector3());
  const points = new Float32Array(grid.count * 3);
  for (let v = 0; v < grid.count; v++) {
    const [x, y, z] = grid.centre(v);
    points.set([x - centre.x, y - centre.y, z - centre.z], v * 3);
  }
  const reach = attached.bounds.getSize(new Vector3()).length() / 2;

  const projected = new Float32Array(grid.count * 3);
  const order: number[] = [];
  const rotation = new Matrix4();
  const objectRotation = new Matrix4();
  let shading: Shading | null = null;
  let sinceRepaint = Infinity;

  function repaint(camera: Camera) {
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const side = Math.round(canvas.clientWidth * pixelRatio);
    if (side === 0 || !shading) return;
    if (canvas.width !== side) canvas.width = canvas.height = side;

    objectRotation.extractRotation(attached.object.matrixWorld);
    rotation.extractRotation(camera.matrixWorldInverse).multiply(objectRotation);
    const e = rotation.elements;
    for (let v = 0; v < grid.count; v++) {
      const x = points[3 * v];
      const y = points[3 * v + 1];
      const z = points[3 * v + 2];
      projected[3 * v] = e[0] * x + e[4] * y + e[8] * z;
      projected[3 * v + 1] = e[1] * x + e[5] * y + e[9] * z;
      projected[3 * v + 2] = e[2] * x + e[6] * y + e[10] * z;
    }

    const scale = (side * 0.46) / reach;
    const half = side / 2;
    const cell = Math.max(1, grid.size * scale * 1.15); // a little over, so a rotated grid has no gaps
    const square = (v: number) =>
      context.fillRect(half + projected[3 * v] * scale - cell / 2, half - projected[3 * v + 1] * scale - cell / 2, cell, cell);

    context.globalAlpha = 1;
    context.fillStyle = style.surface;
    context.fillRect(0, 0, side, side);

    context.globalAlpha = 0.22;
    context.fillStyle = style.ink;
    for (let v = 0; v < grid.count; v++) square(v);

    // Far voxels first, so nearer attention sits on top.
    order.length = 0;
    for (let v = 0; v < grid.count; v++) if (shading.alpha[v] > 0) order.push(v);
    order.sort((a, b) => projected[3 * a + 2] - projected[3 * b + 2]);
    for (const v of order) {
      context.globalAlpha = 0.45 + 0.55 * shading.alpha[v];
      context.fillStyle = toHex([shading.rgb[3 * v], shading.rgb[3 * v + 1], shading.rgb[3 * v + 2]]);
      square(v);
    }
    context.globalAlpha = 1;

    canvas.setAttribute("aria-label", `Attention panel: ${shading.attended} voxels attended, ${shading.shared} shared.`);
  }

  return {
    setVisible(visible) {
      canvas.hidden = !visible;
      sinceRepaint = Infinity;
    },
    draw(next) {
      shading = next;
    },
    follow(camera, dt) {
      sinceRepaint += dt;
      if (sinceRepaint < REPAINT_EVERY) return;
      sinceRepaint = 0;
      camera.updateMatrixWorld();
      repaint(camera);
    },
    dispose() {
      canvas.remove();
    },
  };
}
