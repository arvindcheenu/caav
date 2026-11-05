import { createFollower, createVoxelCloud, setLayer } from "./parts.js";
import type { Presentation, PresentationContext } from "./types.js";

/** World space, embedded: voxels on the object itself, the configuration HeedVision evaluates. */
export function createWorldEmbedded({ attached, scene, layer }: PresentationContext): Presentation {
  const follower = createFollower(attached.object);
  const cloud = createVoxelCloud(attached.target.grid);
  follower.group.add(cloud.object);
  setLayer(follower.group, layer);
  follower.group.visible = false;
  scene.add(follower.group);

  return {
    setVisible: (visible) => (follower.group.visible = visible),
    draw: cloud.draw,
    follow: follower.follow,
    dispose() {
      scene.remove(follower.group);
      cloud.dispose();
    },
  };
}
