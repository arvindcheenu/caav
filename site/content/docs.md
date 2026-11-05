# caav docs

caav attaches attention to 3D objects, records it separately for each person, and shows it back to them. It is the toolkit from the IEEE VIS 2026 paper *HeedVision: Attention Awareness in Collaborative Immersive Analytics Environments*. CAAV stands for collaborative attention-aware visualization, the term the paper introduces.

The library has three layers. `caav` is the core and has no dependencies. `caav/three` connects it to three.js. `caav/react` adds hooks for React Three Fiber.

## Install

The library is not on npm yet, and the source is [on GitHub](https://github.com/arvindcheenu/caav) under the MIT License. You can load it directly from this site using an import map, with no build step:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
      "three-mesh-bvh": "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.18/build/index.module.js",
      "caav": "https://heedvision.arvindchee.nu/toolkit/lib/core/index.js",
      "caav/three": "https://heedvision.arvindchee.nu/toolkit/lib/three/index.js"
    }
  }
</script>
```

The [one-file example](../examples/quickstart.html) is a complete page built this way. Save it, change the paths to the absolute ones above, and open it through any local server.

The React hooks are at `lib/react/index.js`. They also need `react` and `@react-three/fiber`, which is easiest with a bundler.

It has been tested with three 0.180, three-mesh-bvh 0.9.18 and @react-three/fiber 9.8. Type declarations sit next to each file under `lib/`.

## Quickstart

This sets up two people looking at one object, each rendering their own view. `object`, `scene`, the two cameras and the two renderers are your own.

```ts
import { alwaysOn, createSession, interpolatedColours } from "caav";
import { attachAttention, createAttentionView, headRaySource } from "caav/three";

const session = createSession({ captureRate: 10, influenceRadius: 1.5 });
const attached = attachAttention(session, object, { voxelSize: 0.05 });
const colour = interpolatedColours();

session.registerViewer({ id: "a", colour: "#3d8bff", source: headRaySource(cameraA) });
session.registerViewer({ id: "b", colour: "#f08a3c", source: headRaySource(cameraB) });

const viewA = createAttentionView({
  session, attached, viewer: "a", camera: cameraA, scene, layer: 1,
  presentation: "world-embedded", trigger: alwaysOn(), colour,
});
const viewB = createAttentionView({
  session, attached, viewer: "b", camera: cameraB, scene, layer: 2,
  presentation: "world-separated", trigger: alwaysOn(), colour,
});

let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  session.tick(dt);
  viewA.update(dt);
  viewB.update(dt);
  rendererA.render(scene, cameraA);
  rendererB.render(scene, cameraB);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

The playground on the [home page](../) writes this code for whatever settings you choose, so it is often the quickest way to get a setup you can copy.

## How it works

The paper splits attention awareness into three parts, and so does the library.

**Capture** finds what each person is looking at. Ten times a second by default, a ray goes out from each person's head and finds the nearest voxel it hits.

**Recording** adds to that voxel's value for that person. Each person has their own value at every voxel, between 0 and 1, and those values fade over time. Keeping them separate is what makes this collaborative: you can always ask who attended what, and combine the values however you like.

**Revisualizing** shows it. Each person has a view that decides how to combine the values, what colour they become, where they are drawn and when.

Capture and recording never stop, whatever a view is showing. A trigger only controls what a person sees.

## Attaching to objects

`attachAttention(session, object, options)` works on any object with at least one mesh under it, including groups and instanced meshes. It merges the meshes into the object's local space and voxelizes the result with a bounding volume hierarchy, keeping only cells that touch the surface.

```ts
import { attachAttention } from "caav/three";

const attached = attachAttention(session, object, {
  id: "terrain",   // defaults to the object's uuid
  voxelSize: 0.05, // in the object's local units, defaults to 1/32 of its longest side
});
```

Attention is stored in the object's local space, so it stays on the object when the object moves, rotates or scales.

### Voxel resolution

Smaller voxels show finer detail, but each view does more work and each voxel takes longer to fill, since a gaze spends less time in any one of them. Sparse objects need bigger voxels: a head ray mostly passes between the points of a scatterplot, and a voxel only exists where it touches geometry. The playground uses 0.08 for its surfaces and 0.1 for its scatterplot of 100 points, spheres of radius 0.05 in a box 2 wide. Change the size at any time:

```ts
attached.setVoxelSize(0.1);
```

Views rebuild themselves on their next update. Recorded attention for that object starts again from zero, because the old values belong to voxels that no longer exist. A miniature that someone moved stays where they put it.

### Several objects

Attach as many as you like. Each person's attention goes only to the nearest voxel along their gaze, so one object can block the view of another. Each object needs its own view for each person.

## People and sources

`session.registerViewer` adds a person. The library calls them viewers.

```ts
import { headRaySource } from "caav/three";

session.registerViewer({
  id: "a",
  colour: "#3d8bff",
  label: "Arvind",                  // optional display name
  source: headRaySource(camera),
});
```

Nothing limits the number of people. The paper notes that telling people apart by colour works well for 2 to 4, and gets harder beyond that.

Change a person's colour by assigning `session.viewers.get("a").colour`. Calling `session.removeViewer(id)` forgets that person and everything they recorded.

### Other sources of attention

A source is anything with a `sample()` method that returns a world-space ray, or `null` when there is none, for instance when tracking is lost. This is how you would connect an eye tracker:

```ts
session.registerViewer({
  id: "eyes",
  colour: "#17a67e",
  source: { sample: () => eyeTracker.gazeRay() },
});
```

## Recording

These options go to `createSession`, and any of them can change later through `session.configure`. Changing them keeps recorded attention.

| Option | Default | What it does |
| --- | --- | --- |
| `captureRate` | `10` | Samples per second. The paper uses 10. |
| `gain` | `0.4` | Attention gained per second of steady gaze. At 0.4 a voxel fills in 2.5 seconds. It does not depend on the capture rate. |
| `influenceRadius` | `0` | How far each sample spreads, in voxels. 0 is the single voxel the paper uses. Above that, the centre gets the most, falling to a quarter at the edge. |
| `decay` | `halfLifeDecay(30)` | How attention fades. Use `noDecay` to keep it for good. |
| `regionRadius` | `2` | Gazes within this many voxels count as the same region, for dwell and joint attention. |
| `dwellTime` | `1.5` | Seconds of steady gaze before a `dwell` event fires. |

```ts
import { halfLifeDecay, noDecay } from "caav";

session.configure({ influenceRadius: 2, decay: halfLifeDecay(60) });
session.configure({ decay: noDecay });
session.reset(); // clears recorded attention and keeps everyone registered
```

You can read the values directly. Each one is a `Float32Array` with one number per voxel:

```ts
const values = attached.target.field.channel("a");
const gaze = session.gaze("a"); // { target, voxel, distance, point }, or null
```

## Accumulators

An accumulator combines everyone's values at a voxel into one number, which sets how opaque that voxel is. Each view chooses its own.

| Accumulator | Value at a voxel | Good for seeing |
| --- | --- | --- |
| `sum` | Total across people, shown up to 1 | Everything the group has looked at |
| `max` | The highest single person | Where anyone looked hard |
| `difference` | Highest minus lowest. With one person, their value | Division of labour. Places everyone looked at equally fade out |
| `count` | How many people reached the threshold, as a share of the group | Where people overlap |

`threshold` on a view sets the point below which a voxel stays transparent, and defaults to 0.05.

## Presentations

Each person's view draws attention in one of four ways, following the paper's design space. Switch with `view.setPresentation(kind)`.

| `presentation` | Situatedness | Presentation | What it draws |
| --- | --- | --- | --- |
| `world-embedded` | World | Embedded | Translucent voxels on the object. This is HeedVision itself. |
| `world-separated` | World | Separated | A small replica beside the object, which can be moved. |
| `camera-embedded` | Camera | Embedded | Attention flattened onto the faces of the bounding box that face the person. |
| `camera-separated` | Camera | Separated | A 2D panel over the view, turning with the person's angle. |

World-space presentations stay put in the shared space, so people can point at them. Camera-space ones stay readable from wherever a person stands, at the cost of that shared reference.

The miniature starts to the person's right and stays fixed in the world until moved:

```ts
view.setPresentation("world-separated");
view.miniature?.moveTo(1.5, 1, 0);
```

To let people drag it, raycast against `view.miniature.object`. The [playground's source](https://github.com/arvindcheenu/caav/blob/main/site/playground/instance.ts) does this.

`camera-separated` draws into an element you provide. Pass it as `overlay`, and give that element its own positioning context, for example `position: relative`. The panel has the class `caav-panel`, so you can restyle it, and a text description for screen readers.

```ts
import { createAttentionView } from "caav/three";

const view = createAttentionView({
  session, attached, viewer: "a", camera, scene,
  overlay: stage,
  presentation: "camera-separated",
  style: { surface: "#10131a", ink: "#8a93a6" }, // the neutrals drawn around attention
});
```

## Giving each person their own view

Everything about a view belongs to that person: presentation, trigger, accumulator, colour policy and threshold. This reflects the paper's point that the presentation can be left to each collaborator.

If every person has their own scene, or their own headset, no setup is needed. If several views render one shared scene, as the playground does, give each view a `layer`. That puts its objects on a three.js layer that only its camera can see, so Person A's voxels do not appear in Person B's view. Keep your shared content on layer 0, which cameras see by default.

```ts
import { alwaysOn, explicitTrigger } from "caav";
import { createAttentionView } from "caav/three";

const viewA = createAttentionView({
  session, attached, viewer: "a", camera: cameraA, scene, layer: 1,
  presentation: "world-embedded",
  trigger: explicitTrigger(),
  accumulator: "sum",
});

const viewB = createAttentionView({
  session, attached, viewer: "b", camera: cameraB, scene, layer: 2, overlay: stageB,
  presentation: "camera-separated",
  trigger: alwaysOn(),
  accumulator: "difference",
});
```

Changing a setting affects one view only:

```ts
viewB.setPresentation("world-embedded");
viewB.setAccumulator("max");
viewB.setThreshold(0.2);
```

## Triggers

A trigger decides when a person sees attention. Each view has its own, and `view.setTrigger` swaps it.

**Always on** shows attention all the time. The paper warns that this risks the Midas touch, where people's own gaze keeps setting things off, and reinforcing loops.

```ts
import { alwaysOn } from "caav";

view.setTrigger(alwaysOn());
```

**Explicit** shows it when the person asks. HeedVision uses this, with a controller button. Connect `request` to whatever input you have:

```ts
import { explicitTrigger } from "caav";

view.setTrigger(explicitTrigger());
button.onclick = () => view.trigger.request();     // toggles
holdStart.onclick = () => view.trigger.request(true);
holdEnd.onclick = () => view.trigger.request(false);
```

**Implicit** lets the system decide. By default attention appears once a person's gaze has rested for `dwell` seconds or someone else looks at the same region, and stays for `hold` seconds after that ends, so it does not flicker.

```ts
import { implicitTrigger } from "caav";

view.setTrigger(implicitTrigger({ dwell: 1.5, hold: 2 }));
```

Pass `when` to write your own rule. It receives how long the gaze has rested and how many others share the region:

```ts
import { implicitTrigger } from "caav";

// Only when at least two other people are looking at the same spot.
view.setTrigger(implicitTrigger({ when: (context) => context.joint >= 2 }));
```

### Triggering from events

An explicit trigger can also be driven by the [events](#events-and-spatial-tooltips) below. This shows attention to Person A for as long as they are sharing a region with someone:

```ts
import { explicitTrigger } from "caav";

view.setTrigger(explicitTrigger());
session.on("jointstart", (event) => {
  if (event.viewer === "a") view.trigger.request(true);
});
session.on("jointend", (event) => {
  if (event.viewer === "a") view.trigger.request(false);
});
```

## Shared colour

Each person has a colour. A voxel only one person attended takes that person's exact colour. When two or more overlap, the view's colour policy decides.

**Interpolated is the default.** The colours blend, weighted by how much attention each person gave, so the result shifts as attention shifts. Blue and orange at equal attention make the pink `#db6cc2`.

```ts
import { interpolatedColours } from "caav";

view.setColourPolicy(interpolatedColours());
```

The blend happens in OKLab, a colour space built around how colours look. Lightness and chroma are averaged, and hue takes the circular mean, which goes the short way round the colour wheel. Averaging RGB directly would turn blue and orange into grey. Three or four people use the same formula, and the order of people makes no difference. If their hues cancel out, the result fades to a neutral grey instead of jumping to an arbitrary hue. A blend does not tell you how many people overlapped, so use the `count` accumulator if that matters.

**Choosing a colour is optional.** Any overlap, however many people, takes the colour you give:

```ts
import { explicitColours } from "caav";

view.setColourPolicy(explicitColours({ shared: "#ec4f9c" }));
```

Both policies count a person as attending a voxel when their value is at least 0.05. Pass `threshold` to change that.

You can write your own policy: an object with a `kind` and a `resolve(viewers)` method that returns an sRGB colour or `null`.

## Events and spatial tooltips

The session reports what people do as events, so your code can react to attention in space. `session.on` returns a function that stops listening.

| Event | When it fires | Extra fields |
| --- | --- | --- |
| `gazeenter` | A person's gaze lands on an object | |
| `gazeleave` | A person's gaze leaves an object | |
| `dwell` | Their gaze has rested in one region for `dwellTime`. Fires once until they look away | `seconds` |
| `jointstart` | Someone else starts looking at the same region as this person | `others` |
| `jointend` | This person is no longer sharing a region with anyone | `others` |

Every event also has `viewer`, `target`, `voxel`, `point` in world space, and `localPoint`, the voxel's centre in the object's own space. Joint events fire once for each person involved, so each person can react separately.

### Spatial tooltips

`createSpatialTooltip` pins a text label to a point in space. It follows the point as the camera moves, and hides when the point is off screen. Together with an event, that makes a tooltip triggered by attention.

```ts
import { createSpatialTooltip } from "caav/three";

const tooltip = createSpatialTooltip({ camera, overlay: stage });

session.on("dwell", (event) => {
  if (event.viewer === "a") tooltip.show(event.point, `Rested here for ${event.seconds.toFixed(1)} s`, { seconds: 3 });
});
session.on("gazeleave", (event) => {
  if (event.viewer === "a") tooltip.hide();
});

// In your frame loop:
tooltip.update(dt);
```

It is a DOM element with the class `caav-tooltip`, added to the `overlay` you give it, so restyle it with CSS. It has `role="status"`, so screen readers announce it.

### Tooltips for specific places

To react only to certain places on your data, check `localPoint`. Because it is in the object's own space, this keeps working when the object moves.

```ts
const peak = [0.1, 0.9, -0.2];

session.on("dwell", (event) => {
  const [x, y, z] = event.localPoint;
  if (Math.hypot(x - peak[0], y - peak[1], z - peak[2]) < 0.3) {
    tooltip.show(event.point, "The highest peak: 2,400 m", { seconds: 4 });
  }
});
```

## React Three Fiber

`caav/react` wraps the same calls in hooks. It needs React 19 and @react-three/fiber 9. There is a [working example](../examples/react/).

```tsx
import { useRef } from "react";
import type { Mesh } from "three";
import { useAttachAttention, useAttentionSession, useAttentionView, useHeadTrackedViewer } from "caav/react";

function Terrain() {
  const mesh = useRef<Mesh>(null);
  const session = useAttentionSession({ captureRate: 10, influenceRadius: 1.5 });
  const attached = useAttachAttention(session, mesh, { voxelSize: 0.05 });
  useHeadTrackedViewer(session, { id: "you", colour: "#3d8bff" });
  useAttentionView(session, attached, "you", { presentation: "world-embedded" });

  return (
    <mesh ref={mesh}>
      <torusKnotGeometry />
      <meshStandardMaterial color="#6c7078" />
    </mesh>
  );
}
```

Pass new values to `useAttentionView` and the view updates in place. Keep trigger objects stable between renders, for example by creating them outside the component or with `useState`, because a new one resets its state.

## API reference

### `caav`

| Name | What it is |
| --- | --- |
| `createSession(options?)` | Creates an `AttentionSession` |
| `session.registerViewer({ id, colour, source, label? })` | Adds a person |
| `session.removeViewer(id)` | Removes a person and what they recorded |
| `session.registerTarget({ id, grid, toLocal })` | Adds a voxel grid directly. `attachAttention` does this for three.js |
| `session.removeTarget(id)` | Removes an object |
| `session.replaceGrid(id, grid)` | Swaps an object's voxels and clears its attention |
| `session.tick(dt)` | Advances time, capturing and decaying. Call once per frame |
| `session.configure(options)` | Changes settings while running |
| `session.on(type, listener)` | Listens for an event, and returns a function that stops |
| `session.gaze(id)` | A person's latest gaze, or `null` |
| `session.triggerContext(id, dt)` | The `dt`, `dwell` and `joint` values triggers read |
| `session.reset()` | Clears recorded attention |
| `alwaysOn()`, `explicitTrigger(initial?)`, `implicitTrigger({ dwell?, hold?, when? })` | Trigger policies |
| `interpolatedColours({ threshold? })`, `explicitColours({ shared, threshold? })` | Colour policies |
| `halfLifeDecay(seconds)`, `noDecay` | Decay functions |
| `aggregate(kind, values, threshold?)`, `normalised(kind, value, viewerCount)` | The accumulators as plain functions |
| `AttentionField` | Per-person values for one object |
| `VoxelGrid` | Sparse voxels, with `raycast(ray)`, `centre(voxel)`, `at(i, j, k)` |
| `createShading(count)`, `shade(session, target, shading, options)` | One colour and opacity per voxel, for drawing your own presentation |

The core has no rendering dependency, so you can use it with another engine by building a `VoxelGrid` yourself and passing a `toLocal` function that moves rays into the grid's space.

### `caav/three`

| Name | What it is |
| --- | --- |
| `attachAttention(session, object, { id?, voxelSize? })` | Returns an `AttachedTarget` |
| `attached.setVoxelSize(size)` | Voxelizes again at a new resolution |
| `attached.detach()` | Stops tracking the object |
| `headRaySource(camera)` | A source from a camera's view direction |
| `createAttentionView(options)` | Returns an `AttentionView` |
| `view.update(dt)` | Runs the trigger and redraws. Call once per frame, after `session.tick` |
| `view.setPresentation(kind)`, `setTrigger(trigger)`, `setAccumulator(kind)`, `setColourPolicy(policy)`, `setThreshold(value)` | Change one view |
| `view.setStyle({ surface, ink })` | Changes the neutrals drawn around attention, for a theme switch |
| `view.visible`, `view.shading`, `view.presentation`, `view.trigger` | Its current state |
| `view.miniature` | The miniature, when that presentation is active, with `object` and `moveTo(x, y, z)` |
| `view.dispose()` | Removes its objects from the scene |
| `createSpatialTooltip({ camera, overlay })` | Returns a tooltip with `show(point, text, { seconds? })`, `hide()`, `update(dt)`, `dispose()` |
| `voxelize(geometry, size)`, `mergeGeometry(object)` | The steps `attachAttention` uses |

`createAttentionView` takes `session`, `attached`, `viewer`, `camera` and `scene`, and optionally `presentation`, `trigger`, `accumulator`, `colour`, `threshold`, `layer`, `overlay` and `style`. With nothing else set, you get HeedVision's own configuration: world-space, embedded, and explicitly triggered.

### `caav/react`

| Name | What it is |
| --- | --- |
| `useAttentionSession(options?)` | A session that ticks with the render loop |
| `useAttachAttention(session, ref, options?)` | Attaches to the object in a ref |
| `useHeadTrackedViewer(session, { id, colour, label? })` | Registers this canvas's camera as a person |
| `useAttentionView(session, attached, viewer, settings?)` | One person's view in this canvas |

## Limits

- **No network sync.** All people share one session in one page. To connect headsets, send gaze rays or recorded values over your own connection.
- **Not yet run on a headset.** Head rays come from a three.js camera and an XR camera should fit, but WebXR has not been tested.
- **No eye tracking built in.** The source interface is ready for it.
- **Fixed geometry.** Voxels are computed from the geometry when you attach. For an object that changes shape, call `setVoxelSize` again, which also clears its attention.
- **One attention region per sample.** The paper's data-agnostic capture, which would record every voxel a ray passes through, is not implemented.

## Where this differs from the paper

- The paper blends colours additively. Here the default blend is the OKLab one described above, and you can choose a fixed colour instead.
- The paper's region of influence is a single voxel, which is the default here too. `influenceRadius` lets you widen it.
- The paper's system uses Spatialstrates for syncing and was evaluated in world-space, embedded, explicit mode. The other three quadrants were proofs of concept there, and they are unevaluated here too.
