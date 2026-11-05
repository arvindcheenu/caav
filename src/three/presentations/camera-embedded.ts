import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from "three";
import { parseColour, type Shading, type VoxelGrid } from "../../core/index.js";
import { createFollower, setLayer } from "./parts.js";
import type { Presentation, PresentationContext } from "./types.js";

/** Each box axis looks at the grid along that axis: `u` and `v` are the two it keeps. */
const PROJECTIONS = [
  { axis: 0, u: 2, v: 1 },
  { axis: 1, u: 0, v: 2 },
  { axis: 2, u: 0, v: 1 },
] as const;

type Projection = (typeof PROJECTIONS)[number];

/** How strongly attention covers the face: a faint voxel still shows. */
const coverage = (alpha: number) => 0.35 + 0.65 * alpha;

/** One image of the grid flattened along an axis: the data's silhouette, with attention on top. */
function createFaceImage(grid: VoxelGrid, { axis, u, v }: Projection, surface: string, ink: string) {
  const width = grid.dims[u];
  const height = grid.dims[v];
  const base = new Uint8Array(width * height * 4);
  const [sr, sg, sb] = parseColour(surface);
  const [ir, ig, ib] = parseColour(ink);
  for (let p = 0; p < width * height; p++) {
    base.set([sr * 255, sg * 255, sb * 255, 235], p * 4);
  }
  for (let voxel = 0; voxel < grid.count; voxel++) {
    const p = 4 * (grid.cells[3 * voxel + u] + width * grid.cells[3 * voxel + v]);
    base.set([ir * 255, ig * 255, ib * 255, 235], p);
  }

  const pixels = base.slice();
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  const strongest = new Float32Array(width * height);

  return {
    texture,
    axis,
    draw(shading: Shading) {
      pixels.set(base);
      strongest.fill(0);
      for (let voxel = 0; voxel < grid.count; voxel++) {
        const alpha = shading.alpha[voxel];
        if (alpha <= 0) continue;
        const p = grid.cells[3 * voxel + u] + width * grid.cells[3 * voxel + v];
        if (alpha <= strongest[p]) continue;
        strongest[p] = alpha;
        const c = coverage(alpha);
        for (let channel = 0; channel < 3; channel++) {
          pixels[4 * p + channel] = base[4 * p + channel] * (1 - c) + 255 * shading.rgb[3 * voxel + channel] * c;
        }
      }
      texture.needsUpdate = true;
    },
  };
}

/** A quad on one side of the box, with texture coordinates that line up with the grid's cells. */
function createFaceGeometry(grid: VoxelGrid, { axis, u, v }: Projection, high: boolean) {
  const position = (cu: number, cv: number) => {
    const point = [0, 0, 0];
    point[axis] = grid.origin[axis] + (high ? grid.dims[axis] * grid.size : 0);
    point[u] = grid.origin[u] + cu * grid.dims[u] * grid.size;
    point[v] = grid.origin[v] + cv * grid.dims[v] * grid.size;
    return point;
  };
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([...position(0, 0), ...position(1, 0), ...position(1, 1), ...position(0, 1)]), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/**
 * Camera space, embedded: attention flattened onto the faces of the object's
 * bounding box. Only the faces turned towards the viewer's camera show, so it
 * stays in view from anywhere, at the cost of depth.
 */
export function createCameraEmbedded({ attached, scene, layer, style }: PresentationContext): Presentation {
  const grid = attached.target.grid;
  const follower = createFollower(attached.object);
  const images = PROJECTIONS.map((projection) => createFaceImage(grid, projection, style.surface, style.ink));

  const faces = PROJECTIONS.flatMap((projection, index) =>
    [false, true].map((high) => {
      const mesh = new Mesh(
        createFaceGeometry(grid, projection, high),
        new MeshBasicMaterial({ map: images[index].texture, side: DoubleSide, transparent: true, depthWrite: false, toneMapped: false }),
      );
      mesh.renderOrder = 3;
      mesh.raycast = () => {};
      follower.group.add(mesh);
      return { mesh, axis: projection.axis, high };
    }),
  );

  setLayer(follower.group, layer);
  follower.group.visible = false;
  scene.add(follower.group);

  const toLocal = new Matrix4();
  const eye = new Vector3();
  const min = attached.bounds.min;
  const max = attached.bounds.max;

  return {
    setVisible: (visible) => (follower.group.visible = visible),
    draw(shading) {
      for (const image of images) image.draw(shading);
    },
    follow(camera: Camera) {
      follower.follow();
      toLocal.copy(attached.object.matrixWorld).invert();
      camera.getWorldPosition(eye).applyMatrix4(toLocal);
      for (const face of faces) {
        const a = face.axis;
        face.mesh.visible = face.high ? eye.getComponent(a) > max.getComponent(a) : eye.getComponent(a) < min.getComponent(a);
      }
    },
    dispose() {
      scene.remove(follower.group);
      for (const image of images) image.texture.dispose();
      for (const { mesh } of faces) {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
    },
  };
}
