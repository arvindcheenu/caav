import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { defineConfig, type Plugin } from "vite";
import { escapeHtml, highlightLines } from "./playground/highlight";

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

/** The contents list down the side of the docs. */
function contents(headings: Array<{ level: number; text: string; id: string }>) {
  const items = headings.filter((h) => h.level === 2).map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`);
  return `<nav class="contents" aria-label="On this page"><ul>${items.join("")}</ul></nav>`;
}

/** Fills the pages from Markdown, and emits the files that sit beside them. */
function sitePages(): Plugin {
  return {
    name: "caav-site-pages",
    transformIndexHtml(html) {
      return html
        .replace("<!-- landing -->", () => renderMarkdown(read("content/landing.md")).html)
        .replace("<!-- docs -->", () => {
          const { html: body, headings } = renderMarkdown(read("content/docs.md"));
          return `${contents(headings)}<article class="prose">${body}</article>`;
        });
    },
    generateBundle() {
      const docs = read("content/docs.md");
      this.emitFile({ type: "asset", fileName: "llms.txt", source: read("content/llms.txt") });
      this.emitFile({ type: "asset", fileName: "llms-full.txt", source: docs });
      this.emitFile({ type: "asset", fileName: "AGENTS.md", source: readFileSync(join(root, "AGENTS.md"), "utf8") });
      this.emitFile({ type: "asset", fileName: "LICENSE.txt", source: readFileSync(join(root, "LICENSE"), "utf8") });
      this.emitFile({ type: "asset", fileName: "fonts/OFL.txt", source: read("fonts/OFL.txt") });
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
