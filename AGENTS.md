# caav: notes for coding agents

caav attaches attention to three.js objects, records it per person, and shows it in every mode of the HeedVision design space. Full docs: https://heedvision.arvindchee.nu/toolkit/llms-full.txt. Source: https://github.com/arvindcheenu/caav. MIT License.

## Using the library

The usual setup, in order:

```ts
import { alwaysOn, createSession } from "caav";
import { attachAttention, createAttentionView, headRaySource } from "caav/three";

const session = createSession({ captureRate: 10 });
const attached = attachAttention(session, object, { voxelSize: 0.05 });
session.registerViewer({ id: "a", colour: "#3d8bff", source: headRaySource(camera) });
const view = createAttentionView({ session, attached, viewer: "a", camera, scene, trigger: alwaysOn() });

// Once per frame, before rendering. The order matters.
session.tick(dt);
view.update(dt);
```

Things that catch people out:

- **It is not on npm.** Load it through the import map in the docs' Install section. `npm install caav` will not work.
- **The default trigger is explicit**, so a view shows nothing until `view.trigger.request()` is called. If attention seems missing, check this first, or pass `alwaysOn()`.
- **"Viewer" means a person.** Each person needs a `registerViewer` call and their own view, per object.
- **Several views in one scene need a `layer` each.** Without it, every camera sees every person's presentation.
- **`camera-separated` needs an `overlay` element** with its own positioning context, and throws without one. `createSpatialTooltip` needs one too.
- **`setVoxelSize` clears that object's attention.** `session.configure` does not.
- **Interpolated colour is the default.** Use `explicitColours({ shared })` only when someone asks for a fixed shared colour. It takes one colour.
- **The default `influenceRadius` is 0**, the single voxel the paper uses, which leaves thin trails. Raise it to about 1.5 to make overlaps visible.
- **Do not claim** headset support, network sync or eye tracking. None of them exist or have been tested yet.

## Changing the library

```bash
npm install
npm test            # unit tests, including typechecks of every code sample
npm run typecheck
npm run demo        # the site and playground on a dev server
npm run build:site  # static site in site-dist/, working from any folder
```

Layout:

- `src/core`: capture, voxel grid, accumulators, decay, colour, trigger, events, session, shading. No dependencies, and no DOM or three.js.
- `src/three`: voxelize, attach, tooltip, view, and `presentations/` with one file per quadrant.
- `src/react`: thin hooks over `src/three`.
- `site`: landing page, docs, playground and examples.
- `site/public/shared`: unchanged copies of the HeedVision paper site's `shared/` (theme, buttons, scroll progress, sound, hold-for-keys, fonts). Copy new versions over them rather than editing them here, and put toolkit changes in `site/public/style.css`.
- Font Awesome Pro icons and institution logos are deliberately not in this repository. Pages load them from the paper site's `/shared/` when hosted at `/toolkit/`, and do without them elsewhere.
- `site/content`: `docs.md` and `landing.md` become the pages. `docs.md` is also published as `llms-full.txt`.
- `test`: Vitest. `test/samples.test.ts` typechecks the code blocks in the docs and landing page, and the playground's generated code.

Rules:

- Dependencies point one way: `react` to `three` to `core`. Nothing in `core` may import three.js or touch the DOM.
- No global state. Everything hangs off a session.
- Do not hard-code a limit on the number of people. Only the demo stops at four.
- A viewer's colour must reach the screen exactly, so colours are sRGB throughout and presentations skip tone mapping.
- When you change the API, update `site/content/docs.md`. The sample tests will fail if its code no longer compiles, but they cannot catch wrong prose.
- If you change what the playground does, update `site/playground/code.ts` to match, so the code it shows stays true.
- The site must not shift as it loads. `playgroundShell` in `site/vite.config.ts` writes the playground's first layout into the page, so if you change that layout or the starting settings, keep the shell the same height. Page text stays hidden behind a skeleton until SN Pro has loaded (`waitForFonts`), because text wraps differently in the fallback font.

Writing style for the docs: plain and direct, no em dashes, and only claim what was actually tested.
