# caav

Attach attention to any 3D object, record it per person, and show it back, in every mode of the HeedVision design space. CAAV stands for collaborative attention-aware visualization, from the IEEE VIS 2026 paper *HeedVision: Attention Awareness in Collaborative Immersive Analytics Environments*.

The core has no dependencies. three.js is an adapter on top, and React Three Fiber is a thin optional layer on that.

**Site and playground:** https://heedvision.arvindchee.nu/toolkit/

**Docs:** https://heedvision.arvindchee.nu/toolkit/docs/, from [`site/content/docs.md`](site/content/docs.md)

## Run it

```bash
npm install && npm run demo
```

This opens the site with the playground. Each person gets their own Leva folder, and the code for the current settings updates beside it.

```bash
npm test
```

```bash
npm run build:site
```

That writes a static site to `site-dist/`, with relative URLs so it works from `/toolkit/` or any other folder.

## Quickstart

```ts
import { alwaysOn, createSession } from "caav";
import { attachAttention, createAttentionView, headRaySource } from "caav/three";

const session = createSession({ captureRate: 10, influenceRadius: 1.5 });
const attached = attachAttention(session, object, { voxelSize: 0.05 });
session.registerViewer({ id: "a", colour: "#3d8bff", source: headRaySource(camera) });
const view = createAttentionView({ session, attached, viewer: "a", camera, scene, trigger: alwaysOn() });

function update(dt) {
  session.tick(dt);
  view.update(dt);
}
```

## What's in it

- **Capture:** head rays to the nearest voxel at a configurable rate, behind a source interface so other trackers can plug in.
- **Voxels:** BVH voxelization keeping only cells that touch the surface, with resolution changeable at runtime.
- **Recording:** per-person values with sum, maximum, difference and count, plus decay, radius and gain.
- **Presentations:** world embedded, world separated (a movable miniature), camera embedded (bounding-box faces), camera separated (a 2D panel). Each person chooses their own.
- **Triggers:** always on, explicit, implicit, or driven by events.
- **Colour:** interpolated by default, with one chosen shared colour as an option.
- **Events and tooltips:** `gazeenter`, `gazeleave`, `dwell`, `jointstart` and `jointend`, each with a point in space, and a tooltip you can pin to that point.

## Architecture

```
src/core   capture, voxel-grid, accumulators, decay, colour, trigger, events, session, shading
src/three  voxelize, attach, tooltip, view, presentations/ (one file per quadrant)
src/react  hooks over src/three
site       landing page, docs, playground, examples
```

Dependencies point one way: `react` to `three` to `core`. There is no global state, so everything hangs off a session you create. See [AGENTS.md](AGENTS.md) for the rules when changing it.

## Not included

Network sync, eye tracking and data-agnostic capture are not built, and nothing has been run on a headset yet. The docs list the details and where this differs from the paper.

## Licence

The code is under the [MIT License](LICENSE). The demo bundles the SN Pro font, which is under the [SIL Open Font License](site/public/shared/fonts/OFL.txt).
