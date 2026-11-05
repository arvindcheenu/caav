### 1. Attach attention to an object

Any three.js object with meshes under it works, including a group. It is split into voxels, keeping only the ones that touch its surface.

```ts
import { createSession } from "caav";
import { attachAttention } from "caav/three";

const session = createSession({ captureRate: 10 });
const attached = attachAttention(session, object, { voxelSize: 0.05 });
```

### 2. Register each person

A person has a colour and a source of attention. Here it is the direction their head points. Each person's attention is recorded separately.

```ts
import { headRaySource } from "caav/three";

session.registerViewer({ id: "a", colour: "#3d8bff", source: headRaySource(cameraA) });
session.registerViewer({ id: "b", colour: "#f08a3c", source: headRaySource(cameraB) });
```

### 3. Give each person their own view

Person A can see voxels on the object while Person B sees a small panel beside it. These are the four quadrants of the paper's design space, and each person chooses their own.

```ts
import { alwaysOn, explicitTrigger } from "caav";
import { createAttentionView } from "caav/three";

const viewA = createAttentionView({
  session, attached, viewer: "a", camera: cameraA, scene, layer: 1,
  presentation: "world-embedded",
  trigger: explicitTrigger(),
});

const viewB = createAttentionView({
  session, attached, viewer: "b", camera: cameraB, scene, layer: 2, overlay: stageB,
  presentation: "camera-separated",
  trigger: alwaysOn(),
  accumulator: "count",
});

function update(dt: number) {
  session.tick(dt);
  viewA.update(dt);
  viewB.update(dt);
}
```

### 4. Choose when attention shows

It can always be on, appear when a person asks, or appear when the system decides. By default the system shows it when someone's gaze rests on a spot, or when someone else looks at the same spot.

```ts
import { implicitTrigger } from "caav";

viewA.setTrigger(implicitTrigger({ dwell: 1.5, hold: 2 }));
```

### 5. Colour for shared attention

When people overlap, their colours blend, weighted by how much attention each gave. Blue and orange meet at a pink. If you would rather pick the colour yourself, you can.

```ts
import { explicitColours } from "caav";

viewA.setColourPolicy(explicitColours({ shared: "#ec4f9c" }));
```

### 6. Tooltips that follow attention

The session reports what people do as events, each with a point in space. Pin a label to that point and you have a tooltip triggered by attention.

```ts
import { createSpatialTooltip } from "caav/three";

const tooltip = createSpatialTooltip({ camera: cameraA, overlay: stageA });

session.on("dwell", (event) => {
  if (event.viewer === "a") tooltip.show(event.point, "You rested here", { seconds: 3 });
});
```

### 7. Change anything while it runs

Radius, gain, capture rate and decay can all change on the fly. Voxel resolution can too, though recorded attention starts again because the voxels themselves change.

```ts
session.configure({ influenceRadius: 2, gain: 0.8 });
attached.setVoxelSize(0.1);
```

The [docs](./docs/) cover all of this in detail, including [how to load the library](./docs/#install), the [API](./docs/#api-reference), and [React Three Fiber hooks](./docs/#react-three-fiber). There is also a [one-file example](./examples/quickstart.html) you can save and open.
