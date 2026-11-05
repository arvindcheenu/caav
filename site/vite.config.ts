import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { defineConfig, type Plugin } from "vite";
import { generateCode } from "./playground/code";
import { escapeHtml, highlightLines } from "./playground/highlight";
import { PEOPLE, START_GROUP, START_PEOPLE, startPerson } from "./playground/settings";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = (path: string) => join(root, "src", path);
const read = (path: string) => readFileSync(join(here, path), "utf8");

const slug = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Markdown to HTML, with anchors on headings and the same highlighter as the live code panel. */
function renderMarkdown(markdown: string) {
  const headings: Array<{ level: number; text: string; id: string }> = [];
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = slug(text);
    headings.push({ level: depth, text, id });
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  renderer.code = ({ text, lang }) => {
    const body = lang === "html" ? escapeHtml(text) : highlightLines(text).join("\n");
    return `<pre tabindex="0"><code>${body}</code></pre>\n`;
  };
  const html = marked.parse(markdown, { renderer, async: false }) as string;
  return { html, headings };
}

/** Contents for screens too narrow for the rail. The rail itself is built in the browser by page.ts. */
function inlineContents(headings: Array<{ level: number; text: string; id: string }>) {
  const items = headings.filter((h) => h.level === 2).map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`);
  return `<ol class="inline-toc" role="list" aria-label="On this page">${items.join("")}</ol>`;
}

/**
 * The playground as it will first draw, written into the page, so nothing moves when its heavy module arrives.
 * The views pulse until then, and the code is already the real code.
 */
function playgroundShell() {
  const people = PEOPLE.slice(0, START_PEOPLE).map((person) => ({ person, settings: startPerson(person.id) }));
  const views = people.map(({ person, settings }) => `<article class="view" style="--person:${settings.colour}">
        <div class="view-head"><h3 class="who"><span class="dot" aria-hidden="true"></span>${person.label}</h3></div>
        <div class="stage skel"></div>
        <p class="status"></p>
      </article>`);
  const lines = highlightLines(generateCode(START_GROUP, people)).map((html) => `<span class="line">${html}</span>`);
  return `<div class="actions playground-actions"><button type="button" class="btn" disabled>Look at the same spot</button><button type="button" class="btn" disabled>Clear attention</button></div>
    <div class="playground" data-count="${START_PEOPLE}"><div class="views">${views.join("")}</div></div>
    <div class="code-panel"><div class="code-head"><button type="button" class="btn" disabled>Copy code</button><p>The code for these settings. Lines from your last change are tinted.</p></div>
    <pre tabindex="0" aria-label="Code for the current settings"><code>${lines.join("")}</code></pre></div>`;
}

/**
 * Text wraps differently in the fallback font, so lines would jump when SN Pro arrives. Until it does, a pulsing
 * skeleton stands in for the page, whose own text stays hidden, for at most four seconds. Once the font is cached
 * this ends before anything is drawn. Without scripts, the class is never set and the page shows as usual.
 */
function waitForFonts(needsItalic: boolean) {
  const faces = [`'420 17px "SN Pro"'`, ...(needsItalic ? [`'italic 420 17px "SN Pro"'`] : [])];
  return `<script>
      (function () {
        var root = document.documentElement;
        if (!document.fonts || !document.fonts.load) return;
        root.classList.add("fonts-pending");
        function ready() { root.classList.remove("fonts-pending"); }
        Promise.race([
          Promise.all([${faces.map((face) => `document.fonts.load(${face})`).join(", ")}]),
          new Promise(function (done) { setTimeout(done, 4000); }),
        ]).then(ready, ready);
      })();
    </script>`;
}

/**
 * The paper site's look, on every page. `shared/` next to the page is our unchanged copy of its files. Its
 * Font Awesome icons and institution logos are deliberately not in this repository: `parent` reaches the paper
 * site's own copies, so at /toolkit/ they appear, and anywhere else the pages keep their plain icons and drop the logos.
 */
function chrome(pagePath: string) {
  const depth = pagePath.split("/").filter(Boolean).length - 1;
  const here = depth ? "../".repeat(depth) : "./";
  const parent = `${"../".repeat(depth + 1)}shared`;
  const isDocs = pagePath.includes("/docs/");
  return {
    head: `<link rel="icon" href="${parent}/logos/mark.svg" type="image/svg+xml">
    <link rel="preload" href="${here}shared/fonts/sn-pro-latin.woff2" as="font" type="font/woff2" crossorigin>
    ${isDocs ? `<link rel="preload" href="${here}shared/fonts/sn-pro-latin-italic.woff2" as="font" type="font/woff2" crossorigin>` : ""}
    <link rel="stylesheet" href="${here}shared/theme.css">
    <link rel="stylesheet" href="${here}shared/hv.css">
    <link rel="stylesheet" href="${here}style.css">
    ${waitForFonts(isDocs)}
    <script src="${here}shared/site.js"></script>
    <script src="${here}shared/tactile.js" defer></script>
    <script src="${parent}/icons.js"></script>
    <script src="${here}shared/keys.js"></script>
    <script src="${here}shared/progress.js"></script>`,
    top: `<a class="btn skip" href="#main">Skip to the page</a>
    <div class="page-tools"><span data-sound-toggle></span></div>
    <div class="page-bar" aria-hidden="true"><i></i></div>
    <div class="page-skel" aria-hidden="true"><span class="skel skel-page-title"></span><span class="skel skel-line"></span><span class="skel skel-line"></span><span class="skel skel-page-actions"></span><span class="skel skel-head"></span><span class="skel skel-line"></span><span class="skel skel-line"></span><span class="skel skel-line"></span><span class="skel skel-line"></span></div>`,
    foot: `<div class="edge-blur top" aria-hidden="true"></div>
    <div class="edge-blur foot" aria-hidden="true"></div>
    <footer class="site-foot">
      <div class="foot-end"><span data-theme-picker></span></div>
      <div class="logos" role="group" aria-label="IEEE VIS 2026, Aarhus University and the Center for Anytime Anywhere Analytics">
        <img src="${parent}/logos/vis2026.png" width="2000" height="458" alt="IEEE VIS 2026" onerror="this.remove()">
        <img class="mono" src="${parent}/logos/au.svg" width="201" height="41" alt="Aarhus University" onerror="this.remove()">
        <img class="mono" src="${parent}/logos/ca3.svg" width="108" height="84" alt="Center for Anytime Anywhere Analytics" onerror="this.remove()">
      </div>
      <p>Code under the <a href="${here}LICENSE.txt">MIT License</a>. <a href="https://github.com/arvindcheenu/caav">Source on GitHub</a>.<br>SN Pro under the <a href="${here}shared/fonts/OFL.txt">SIL Open Font License</a>.<br>Hold ⌘ (Ctrl on Windows) to see a key for every control.</p>
      <p class="made">Made with <svg data-fa="heart" role="img" aria-label="love" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.6-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.4-9 9-9 9z"/></svg> by <a href="https://arvindchee.nu" target="_blank" rel="noopener">Arvindcheenu</a></p>
    </footer>`,
  };
}

/** Fills the pages from Markdown, and emits the files that sit beside them. */
function sitePages(): Plugin {
  return {
    name: "caav-site-pages",
    transformIndexHtml(html, context) {
      const parts = chrome(context.path);
      return html
        .replace("<!-- chrome-head -->", () => parts.head)
        .replace("<!-- chrome-top -->", () => parts.top)
        .replace("<!-- chrome-foot -->", () => parts.foot)
        .replace("<!-- playground -->", () => playgroundShell())
        .replace("<!-- landing -->", () => renderMarkdown(read("content/landing.md")).html)
        .replace("<!-- docs -->", () => {
          const { html: body, headings } = renderMarkdown(read("content/docs.md"));
          return body.replace("<h2", () => `${inlineContents(headings)}\n<h2`);
        });
    },
    generateBundle() {
      const docs = read("content/docs.md");
      this.emitFile({ type: "asset", fileName: "llms.txt", source: read("content/llms.txt") });
      this.emitFile({ type: "asset", fileName: "llms-full.txt", source: docs });
      this.emitFile({ type: "asset", fileName: "AGENTS.md", source: readFileSync(join(root, "AGENTS.md"), "utf8") });
      this.emitFile({ type: "asset", fileName: "LICENSE.txt", source: readFileSync(join(root, "LICENSE"), "utf8") });
      // The compiled library, so a page can import it from this site without npm.
      const dist = join(root, "dist");
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
          const path = join(dir, name);
          return statSync(path).isDirectory() ? walk(path) : [path];
        });
      for (const file of walk(dist)) {
        if (file.endsWith(".js") || file.endsWith(".d.ts")) {
          this.emitFile({ type: "asset", fileName: `lib/${relative(dist, file)}`, source: readFileSync(file) });
        }
      }
    },
  };
}

export default defineConfig({
  // Relative URLs, so the build works from /toolkit/ or any other folder.
  base: "./",
  plugins: [sitePages()],
  resolve: {
    alias: [
      { find: /^caav$/, replacement: src("core/index.ts") },
      { find: /^caav\/three$/, replacement: src("three/index.ts") },
      { find: /^caav\/react$/, replacement: src("react/index.ts") },
    ],
    // One copy of three, whichever package imports it.
    dedupe: ["three"],
  },
  server: { fs: { allow: [".."] } },
  build: {
    outDir: join(root, "site-dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: join(here, "index.html"),
        docs: join(here, "docs/index.html"),
        react: join(here, "examples/react/index.html"),
      },
    },
  },
});
