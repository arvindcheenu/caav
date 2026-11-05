import { BackSide, BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from "three";
import { createReplicaMaterial, createVoxelCloud, setLayer } from "./parts.js";
import type { Presentation, PresentationContext } from "./types.js";

export interface MiniatureOptions {
  /** Size relative to the object. */
  scale?: number;
}

export interface Miniature extends Presentation {
  /** Everything in the miniature. Raycast against it to pick it up. */
  readonly object: Object3D;
  /** Moves the miniature to a world position. It then stays there. */
  moveTo(x: number, y: number, z: number): void;
}

/**
 * World space, separated: a small replica that floats beside the object and
 * mirrors its attention. It starts to the viewer's right the first time it
 * appears, and then stays fixed in the world until moved.
 */
export function createWorldSeparated(
  { attached, scene, layer, style }: PresentationContext,
  { scale = 0.4 }: MiniatureOptions = {},
): Miniature {
  const { object, bounds, geometry } = attached;
  const centre = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());

  // The inner group puts the box centre at the miniature's origin.
  const root = new Group();
  const inner = new Group();
  inner.position.copy(centre).negate();
  root.add(inner);
  root.scale.setScalar(scale);

  const replicaMaterial = createReplicaMaterial(style.ink);
  inner.add(new Mesh(geometry, replicaMaterial));
  const cloud = createVoxelCloud(attached.target.grid);
  inner.add(cloud.object);

  // A faint container, which also gives the miniature something to grab.
  const boxGeometry = new BoxGeometry(size.x, size.y, size.z);
  const boxMaterial = new MeshBasicMaterial({ color: style.ink, transparent: true, opacity: 0.14, side: BackSide, depthWrite: false, toneMapped: false });
  root.add(new Mesh(boxGeometry, boxMaterial));

  setLayer(root, layer);
  root.visible = false;
  scene.add(root);

  let placed = false;
  const right = new Vector3();
  const objectRotation = new Quaternion();

  function placeBeside(camera: Parameters<Presentation["follow"]>[0]) {
    object.updateWorldMatrix(true, false);
    const world = centre.clone().applyMatrix4(object.matrixWorld);
    const worldSize = size.clone().multiply(object.getWorldScale(new Vector3())).length();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();
    root.position.copy(world).addScaledVector(right, worldSize * 0.5);
    placed = true;
  }

  return {
    object: root,
    moveTo(x, y, z) {
      root.position.set(x, y, z);
      placed = true;
    },
    setVisible: (visible) => (root.visible = visible),
    draw: cloud.draw,
    follow(camera) {
      if (!placed) placeBeside(camera);
      // A replica faces the way the original does.
      root.quaternion.copy(object.getWorldQuaternion(objectRotation));
    },
    dispose() {
      scene.remove(root);
      cloud.dispose();
      replicaMaterial.dispose();
      boxGeometry.dispose();
      boxMaterial.dispose();
    },
  };
}
