import { Box3, BufferAttribute, BufferGeometry, Matrix4, Vector3, type InstancedMesh, type Mesh, type Object3D } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { VoxelGrid } from "../core/index.js";

/**
 * Copies every mesh under `object` into one position-only geometry, in the
 * local space of `object`. Attention is stored in that space, so it stays on
 * the object when the object moves.
 */
export function mergeGeometry(object: Object3D): BufferGeometry {
  object.updateWorldMatrix(true, true);
  const toObject = new Matrix4().copy(object.matrixWorld).invert();
  const triangles: number[] = [];
  const vertex = new Vector3();
  const relative = new Matrix4();
  const instance = new Matrix4();

  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const vertices = index ? index.count : position.count;
    const copies = (mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : 1;
    for (let c = 0; c < copies; c++) {
      relative.multiplyMatrices(toObject, mesh.matrixWorld);
      if (copies > 1 || (mesh as InstancedMesh).isInstancedMesh) {
        (mesh as InstancedMesh).getMatrixAt(c, instance);
        relative.multiply(instance);
      }
      for (let v = 0; v < vertices; v++) {
        vertex.fromBufferAttribute(position, index ? index.getX(v) : v).applyMatrix4(relative);
        triangles.push(vertex.x, vertex.y, vertex.z);
      }
    }
  });

  if (triangles.length === 0) throw new Error("attachAttention needs an object with at least one mesh under it");
  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(new Float32Array(triangles), 3));
  return merged;
}

/**
 * Finds the grid cells that touch the geometry's surface. A bounding volume
 * hierarchy over the triangles makes each box test cheap, and whole empty
 * blocks of cells are ruled out with one test by splitting recursively.
 */
export function voxelize(geometry: BufferGeometry, voxelSize: number): VoxelGrid {
  if (!(voxelSize > 0)) throw new RangeError(`voxelSize must be positive, got ${voxelSize}`);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const extent = bounds.getSize(new Vector3());
  const dims = [extent.x, extent.y, extent.z].map((e) => Math.max(1, Math.ceil(e / voxelSize))) as [number, number, number];
  // Centre the grid on the geometry, so a loose fit is even on both sides.
  const origin = [
    bounds.min.x - (dims[0] * voxelSize - extent.x) / 2,
    bounds.min.y - (dims[1] * voxelSize - extent.y) / 2,
    bounds.min.z - (dims[2] * voxelSize - extent.z) / 2,
  ] as const;

  const bvh = new MeshBVH(geometry);
  const identity = new Matrix4();
  const box = new Box3();
  const cells: number[] = [];

  const visit = (i0: number, j0: number, k0: number, i1: number, j1: number, k1: number) => {
    box.min.set(origin[0] + i0 * voxelSize, origin[1] + j0 * voxelSize, origin[2] + k0 * voxelSize);
    box.max.set(origin[0] + i1 * voxelSize, origin[1] + j1 * voxelSize, origin[2] + k1 * voxelSize);
    if (!bvh.intersectsBox(box, identity)) return;
    const di = i1 - i0;
    const dj = j1 - j0;
    const dk = k1 - k0;
    if (di === 1 && dj === 1 && dk === 1) {
      cells.push(i0, j0, k0);
    } else if (di >= dj && di >= dk) {
      const m = i0 + (di >> 1);
      visit(i0, j0, k0, m, j1, k1);
      visit(m, j0, k0, i1, j1, k1);
    } else if (dj >= dk) {
      const m = j0 + (dj >> 1);
      visit(i0, j0, k0, i1, m, k1);
      visit(i0, m, k0, i1, j1, k1);
    } else {
      const m = k0 + (dk >> 1);
      visit(i0, j0, k0, i1, j1, m);
      visit(i0, j0, m, i1, j1, k1);
    }
  };
  visit(0, 0, 0, dims[0], dims[1], dims[2]);

  return new VoxelGrid(origin, voxelSize, dims, Uint32Array.from(cells));
}
