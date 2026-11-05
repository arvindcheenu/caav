import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as core from "../src/core/index.js";
import * as adapter from "../src/three/index.js";
import { changedLines, generateCode } from "../site/playground/code";
import { highlightLines } from "../site/playground/highlight";
import { PEOPLE, START_GROUP, type GroupSettings, type PersonSettings } from "../site/playground/settings";

const root = join(__dirname, "..");

/** What samples assume you already have. */
const PRELUDE = `
  import type { Camera, Object3D, Scene, WebGLRenderer } from "three";
  import type { AttentionSession, TriggerPolicy } from "caav";
  import type { AttachedTarget, AttentionView, SpatialTooltip } from "caav/three";
  declare global {
    const object: Object3D, scene: Scene;
    const camera: Camera, cameraA: Camera, cameraB: Camera, cameraC: Camera, cameraD: Camera;
    const rendererA: WebGLRenderer, rendererB: WebGLRenderer;
    const stage: HTMLElement, stageA: HTMLElement, stageB: HTMLElement, stageC: HTMLElement, stageD: HTMLElement;
    const session: AttentionSession, attached: AttachedTarget;
    const view: AttentionView, viewA: AttentionView, viewB: AttentionView;
    const tooltip: SpatialTooltip;
    const dt: number;
    const button: HTMLElement, holdStart: HTMLElement, holdEnd: HTMLElement;
    const eyeTracker: { gazeRay(): { origin: [number, number, number]; direction: [number, number, number] } | null };
    const unused: TriggerPolicy;
  }
  export {};
`;

/** Typechecks source files against the real library, and returns any errors as text. */
function typecheck(files: Record<string, string>): string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    noImplicitAny: false, // generated code writes plain JavaScript, such as function update(dt)
    skipLibCheck: true,
    noEmit: true,
    baseUrl: root,
    paths: { caav: ["src/core/index.ts"], "caav/three": ["src/three/index.ts"], "caav/react": ["src/react/index.ts"] },
    types: [],
  };
  const virtual = new Map(Object.entries(files).map(([name, text]) => [join(root, "__samples__", name), text]));
  const host = ts.createCompilerHost(options);
  const { fileExists, readFile, getSourceFile } = host;
  host.fileExists = (name) => virtual.has(name) || fileExists(name);
  host.readFile = (name) => virtual.get(name) ?? readFile(name);
  host.getSourceFile = (name, version) =>
    virtual.has(name) ? ts.createSourceFile(name, virtual.get(name)!, version) : getSourceFile(name, version);
  const program = ts.createProgram([...virtual.keys()], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file && virtual.has(d.file.fileName))
    .map((d) => {
      const line = d.file!.getLineAndCharacterOfPosition(d.start ?? 0).line;
      return `${d.file!.fileName.split("/").pop()}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}\n    ${d.file!.text.split("\n")[line]}`;
    });
}

/** Every ts and tsx code block in a Markdown file. */
function codeBlocks(path: string) {
  const text = readFileSync(join(root, path), "utf8");
  return [...text.matchAll(/```(ts|tsx)\n([\s\S]*?)```/g)].map((match, index) => ({ lang: match[1], code: match[2], index }));
}

function person(overrides: Partial<PersonSettings> = {}): PersonSettings {
  return {
    colour: "#3d8bff",
    presentation: "world-embedded",
    trigger: "always",
    show: false,
    hold: 2,
    accumulator: "sum",
    threshold: 0.05,
    tooltip: "off",
    ...overrides,
  };
}

/** A spread of settings that together reach every branch of the generator. */
const SETTINGS: Array<{ group: GroupSettings; people: PersonSettings[] }> = [
  { group: START_GROUP, people: [person()] },
  {
    group: { ...START_GROUP, chooseShared: true, decay: false },
    people: [
      person({ presentation: "world-separated", trigger: "explicit", accumulator: "count" }),
      person({ presentation: "camera-embedded", trigger: "implicit", accumulator: "difference", tooltip: "dwell" }),
      person({ presentation: "camera-separated", trigger: "explicit", show: true, accumulator: "max", tooltip: "jointstart" }),
      person({ presentation: "camera-separated", tooltip: "gazeenter" }),
    ],
  },
];

const generate = ({ group, people }: (typeof SETTINGS)[number]) =>
  generateCode(group, people.map((settings, i) => ({ person: PEOPLE[i], settings })));

describe("code samples", () => {
  it("every code block in the docs and landing page compiles against the library", () => {
    const files: Record<string, string> = { "prelude.ts": PRELUDE };
    for (const page of ["site/content/docs.md", "site/content/landing.md", "AGENTS.md"]) {
      const blocks = codeBlocks(page);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        const name = `${page.split("/").pop()!.replace(/\W/g, "_")}_${block.index}.${block.lang}`;
        files[name] = `${block.code}\nexport {};\n`;
      }
    }
    expect(typecheck(files)).toEqual([]);
  }, 60_000);

  it("the playground's generated code compiles, for settings across every branch", () => {
    const files: Record<string, string> = { "prelude.ts": PRELUDE };
    SETTINGS.forEach((settings, i) => (files[`generated_${i}.ts`] = `${generate(settings)}\nexport {};\n`));
    expect(typecheck(files)).toEqual([]);
  }, 60_000);

  it("the playground's generated code runs and records attention", () => {
    // Camera-separated and tooltips need a DOM, so this runs the rest for real in Node.
    const code = generate({
      group: { ...START_GROUP, chooseShared: true },
      people: [person({ presentation: "world-separated" }), person({ presentation: "camera-embedded", trigger: "implicit" })],
    });
    const body = code
      .replace(/import \{([^}]*)\} from "caav";/, "const {$1} = core;")
      .replace(/import \{([^}]*)\} from "caav\/three";/, "const {$1} = adapter;");
    const javascript = ts.transpile(`${body}\nreturn { session, attached, viewA, viewB, update };`);
    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const makeCamera = () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 5);
      camera.lookAt(0, 0, 0);
      return camera;
    };
    const run = new Function("core", "adapter", "object", "scene", "cameraA", "cameraB", javascript);
    const { attached, viewA, update } = run(core, adapter, object, new THREE.Scene(), makeCamera(), makeCamera());
    for (let i = 0; i < 60; i++) update(1 / 60);
    expect(attached.target.field.channel("a").some((v: number) => v > 0)).toBe(true);
    expect(attached.target.field.channel("b").some((v: number) => v > 0)).toBe(true);
    expect(viewA.shading.shared).toBeGreaterThan(0);
  });

  it("imports only what it uses", () => {
    const simple = generate(SETTINGS[0]);
    expect(simple).toContain("alwaysOn");
    expect(simple).not.toContain("implicitTrigger");
    expect(simple).not.toContain("createSpatialTooltip");
    expect(simple).toContain("interpolatedColours");
    expect(simple).not.toContain("explicitColours");
  });

  it("gives each person their own settings", () => {
    const code = generate(SETTINGS[1]);
    expect(code).toContain('presentation: "world-separated"');
    expect(code).toContain('presentation: "camera-embedded"');
    expect(code).toContain("overlay: stageC");
    expect(code).not.toContain("overlay: stageA");
  });
});

describe("changedLines", () => {
  it("marks new and edited lines, and nothing when unchanged", () => {
    expect([...changedLines("a\nb\nc", "a\nb\nc")]).toEqual([]);
    expect([...changedLines("a\nb\nc", "a\nx\nc")]).toEqual([1]);
    expect([...changedLines("a\nb", "a\nb\nc")]).toEqual([2]);
  });

  it("counts repeated lines", () => {
    expect([...changedLines("a", "a\na")]).toEqual([1]);
  });
});

describe("highlightLines", () => {
  it("escapes HTML and marks tokens", () => {
    const [line] = highlightLines('const a = "<b>"; // 1');
    expect(line).toContain("&lt;b&gt;");
    expect(line).not.toContain("<b>");
    expect(line).toContain('class="c-keyword"');
    expect(line).toContain('class="c-comment"');
  });

  it("does not change the text", () => {
    const code = 'import { a } from "caav";\nconst b = 1.5;';
    const stripped = highlightLines(code).join("\n").replace(/<[^>]+>/g, "");
    expect(stripped).toBe(code);
  });
});
