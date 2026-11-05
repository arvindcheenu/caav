import { Leva, useControls } from "leva";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACCUMULATOR_KINDS } from "caav";
import { PRESENTATION_KINDS } from "caav/three";
import { changedLines, generateCode } from "./code";
import { Playground } from "./engine";
import { highlightLines } from "./highlight";
import type { Instance } from "./instance";
import { OBJECTS, PEOPLE, START_GROUP, START_PEOPLE, startPerson, type GroupSettings, type Person, type PersonSettings, type TooltipEvent } from "./settings";

const PRESENTATION_LABELS: Record<string, string> = {
  "World, embedded": PRESENTATION_KINDS[0],
  "World, separated": PRESENTATION_KINDS[1],
  "Camera, embedded": PRESENTATION_KINDS[2],
  "Camera, separated": PRESENTATION_KINDS[3],
};

const TRIGGER_LABELS = { "Always on": "always", Explicit: "explicit", Implicit: "implicit" };

const ACCUMULATOR_LABELS = { Sum: ACCUMULATOR_KINDS[0], Maximum: ACCUMULATOR_KINDS[1], Difference: ACCUMULATOR_KINDS[2], Count: ACCUMULATOR_KINDS[3] };

const TOOLTIP_LABELS: Record<string, TooltipEvent> = { Off: "off", "On dwell": "dwell", "On joint gaze": "jointstart", "On gaze landing": "gazeenter" };

declare global {
  interface Window {
    /** shared/tactile.js: the paper site's sounds. */
    HVTactile?: { play(name: "press" | "on" | "off"): void };
  }
}

/** One person's Leva folder and view. Each person's settings live here, independent of everyone else's. */
function PersonView({ engine, person, index, onChange }: { engine: Playground; person: Person; index: number; onChange: (id: string, settings: PersonSettings) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const instanceRef = useRef<Instance | null>(null);

  const start = startPerson(person.id);
  const [values, set] = useControls(
    person.label,
    () => ({
      colour: { label: "Colour", value: start.colour },
      presentation: { label: "Presentation", value: start.presentation, options: PRESENTATION_LABELS },
      trigger: { label: "Trigger", value: start.trigger, options: TRIGGER_LABELS },
      show: { label: "Show attention", value: start.show, render: (get) => get(`${person.label}.trigger`) === "explicit" },
      hold: { label: "Hold (s)", value: start.hold, min: 0, max: 6, step: 0.5, render: (get) => get(`${person.label}.trigger`) === "implicit" },
      accumulator: { label: "Accumulator", value: start.accumulator, options: ACCUMULATOR_LABELS },
      threshold: { label: "Threshold", value: start.threshold, min: 0.01, max: 0.9, step: 0.01 },
      tooltip: { label: "Tooltip", value: start.tooltip, options: TOOLTIP_LABELS },
    }),
    { order: 2 + index },
    [person.id],
  );
  const settings = values as unknown as PersonSettings;
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    const instance = engine.addPerson(person, index, canvas.current!, stage.current!, status.current!, latest.current);
    instanceRef.current = instance;
    return () => engine.removePerson(person.id);
  }, [engine, person, index]);

  useEffect(() => {
    engine.applyPerson(person.id, settings);
    onChange(person.id, settings);
  }, [engine, person.id, onChange, ...Object.values(settings)]);

  /** A click or the space key means asking, as in the paper. It only counts under an explicit trigger. */
  const ask = useCallback(() => {
    if (latest.current.trigger !== "explicit") return;
    const show = !latest.current.show;
    set({ show });
    window.HVTactile?.play(show ? "on" : "off");
  }, [set]);

  useEffect(() => {
    const element = canvas.current!;
    return wireInput(element, () => instanceRef.current!, ask);
  }, [ask]);

  return (
    <article className="view" style={{ "--person": settings.colour } as React.CSSProperties}>
      <div className="view-head">
        <h3 className="who">
          <span className="dot" aria-hidden="true" />
          {person.label}
        </h3>
        {settings.trigger === "explicit" && (
          <button type="button" className="btn" aria-pressed={settings.show} onClick={() => set({ show: !settings.show })}>
            Show attention
          </button>
        )}
      </div>
      <div className="stage" ref={stage}>
        <canvas
          ref={canvas}
          tabIndex={0}
          role="application"
          aria-label={`${person.label}'s view. Arrow keys look around, plus and minus move closer or further, space asks for attention under an explicit trigger, shift and arrow keys move the miniature.`}
        />
        <span className="reticle" aria-hidden="true" />
      </div>
      <p className="status" ref={status} />
    </article>
  );
}

/** Pointer and keyboard control of one person's view. */
function wireInput(canvas: HTMLCanvasElement, instance: () => Instance, ask: () => void) {
  let last: { x: number; y: number } | null = null;
  let travelled = 0;
  let grabbed: ReturnType<Instance["pickMiniature"]> = null;

  const down = (event: PointerEvent) => {
    canvas.setPointerCapture(event.pointerId);
    last = { x: event.clientX, y: event.clientY };
    travelled = 0;
    grabbed = instance().pickMiniature(event.clientX, event.clientY);
  };
  const move = (event: PointerEvent) => {
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    travelled += Math.abs(dx) + Math.abs(dy);
    last = { x: event.clientX, y: event.clientY };
    if (grabbed) instance().dragMiniature(event.clientX, event.clientY, grabbed);
    else instance().pilot.steer(-dx * 0.007, dy * 0.005);
  };
  const up = () => {
    if (last && travelled < 5 && !grabbed) ask();
    last = null;
    grabbed = null;
  };
  const cancel = () => {
    last = null;
    grabbed = null;
  };
  const wheel = (event: WheelEvent) => {
    // Only once the view has focus: otherwise a page of views could not be scrolled.
    if (document.activeElement !== canvas) return;
    event.preventDefault();
    instance().pilot.steer(0, 0, Math.exp(event.deltaY * 0.001));
  };
  const LOOK: Record<string, [number, number]> = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] };
  const key = (event: KeyboardEvent) => {
    const look = LOOK[event.key];
    if (look && event.shiftKey) instance().nudgeMiniature(-look[0] * 0.6, look[1] * 0.9);
    else if (look) instance().pilot.steer(look[0], look[1]);
    else if (event.key === "+" || event.key === "=") instance().pilot.steer(0, 0, 0.92);
    else if (event.key === "-") instance().pilot.steer(0, 0, 1.08);
    else if (event.key === " ") ask();
    else return;
    event.preventDefault();
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", key);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("keydown", key);
  };
}

/** The settings everyone shares. */
function useGroupControls(engine: Playground) {
  const scene = useControls(
    "Scene",
    {
      people: { label: "People", value: START_PEOPLE, min: 1, max: 4, step: 1 },
      object: { label: "Object", value: START_GROUP.object, options: Object.fromEntries(Object.entries(OBJECTS).map(([name, { label }]) => [label, name])) },
      wander: { label: "Look around", value: engine.wandering },
    },
    { order: 0 },
  );
  const [recording, setRecording] = useControls(
    "Recording",
    () => ({
      voxelSize: { label: "Voxel size", value: START_GROUP.voxelSize, min: 0.04, max: 0.24, step: 0.01 },
      influenceRadius: { label: "Radius (voxels)", value: START_GROUP.influenceRadius, min: 0, max: 4, step: 0.1 },
      gain: { label: "Gain (per s)", value: START_GROUP.gain, min: 0.1, max: 2, step: 0.1 },
      captureRate: { label: "Capture (Hz)", value: START_GROUP.captureRate, min: 1, max: 30, step: 1 },
      decay: { label: "Decay", value: START_GROUP.decay },
      halfLife: { label: "Half-life (s)", value: START_GROUP.halfLife, min: 5, max: 120, step: 5, render: (get) => get("Recording.decay") },
      dwellTime: { label: "Dwell (s)", value: START_GROUP.dwellTime, min: 0.5, max: 5, step: 0.1 },
    }),
    { order: 1, collapsed: true },
    [],
  );
  // Each object starts at the voxel size that suits it, and you can change it from there.
  useEffect(() => setRecording({ voxelSize: OBJECTS[scene.object as GroupSettings["object"]].voxelSize }), [scene.object, setRecording]);
  const shared = useControls(
    "Shared colour",
    {
      chooseShared: { label: "Choose a colour", value: START_GROUP.chooseShared },
      sharedColour: { label: "Colour", value: START_GROUP.sharedColour, render: (get) => get("Shared colour.chooseShared") },
    },
    { order: 6, collapsed: true },
  );
  const group: GroupSettings = { object: scene.object as GroupSettings["object"], ...recording, ...shared };
  return { people: scene.people, wander: scene.wander, group };
}

function CodePanel({ code }: { code: string }) {
  const previous = useRef(code);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (code === previous.current) return;
    setMarked(changedLines(previous.current, code));
    previous.current = code;
  }, [code]);

  const copy = async () => {
    const worked = await navigator.clipboard.writeText(code).then(
      () => true,
      () => false,
    );
    setCopied(worked ? "Copied" : "Couldn't copy, select the code instead");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="code-panel">
      <div className="code-head">
        <button type="button" className="btn" onClick={copy} aria-live="polite">{copied ?? "Copy code"}</button>
        <p>The code for these settings. Lines from your last change are tinted.</p>
      </div>
      <pre tabIndex={0} aria-label="Code for the current settings">
        <code>
          {highlightLines(code).map((html, index) => (
            <span key={index} className={marked.has(index) ? "line changed" : "line"} dangerouslySetInnerHTML={{ __html: html }} />
          ))}
        </code>
      </pre>
    </div>
  );
}

/** Leva in the HeedVision palette. Its colours are the page's own variables, so the theme switch reaches them. */
const LEVA_THEME = {
  colors: {
    elevation1: "var(--bg)",
    elevation2: "var(--surface-2)",
    elevation3: "var(--bg)",
    accent1: "var(--accent)",
    accent2: "var(--accent)",
    accent3: "var(--accent)",
    highlight1: "var(--fg-3)",
    highlight2: "var(--fg-2)",
    highlight3: "var(--fg)",
    vivid1: "var(--title)",
    folderWidgetColor: "var(--fg-3)",
    folderTextColor: "var(--fg)",
    toolTipBackground: "var(--fg)",
    toolTipText: "var(--bg)",
  },
  shadows: { level1: "var(--plate)", level2: "var(--raised-more)" },
  sizes: { rootWidth: "304px", controlWidth: "170px", rowHeight: "28px", titleBarHeight: "36px" },
  fonts: { mono: "var(--f-text)", sans: "var(--f-text)" },
  fontSizes: { root: "12.5px" },
  radii: { xs: "4px", sm: "6px", lg: "var(--r)" },
};

/** Leva's panel, floating over the page. Dragged by its title bar, and only around while the playground is on screen. */
function FloatingPanel() {
  // Below the sound switch to start. Leva restarts each drag from this, so it has to follow the panel.
  const [position, setPosition] = useState({ x: 0, y: 54 });
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(document.querySelector("#playground")!);
    return () => observer.disconnect();
  }, []);

  // Leva's controls make the same press sound as every other control on the site.
  useEffect(() => {
    const press = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest?.('[class*="leva-c-"]') && target.closest("input, select, label, button")) window.HVTactile?.play("press");
    };
    window.addEventListener("pointerdown", press, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", press, { capture: true });
  }, []);

  return (
    <Leva
      hidden={!onScreen}
      collapsed={window.innerWidth < 1100}
      hideCopyButton
      theme={LEVA_THEME}
      titleBar={{ title: "Settings", drag: true, filter: false, position, onDrag: setPosition as (point: { x?: number; y?: number }) => void }}
    />
  );
}

function App({ engine }: { engine: Playground }) {
  const { people: count, wander, group } = useGroupControls(engine);
  const [settings, setSettings] = useState<Record<string, PersonSettings>>({});
  const people = PEOPLE.slice(0, count);

  const onChange = useCallback((id: string, next: PersonSettings) => {
    setSettings((all) => ({ ...all, [id]: next }));
  }, []);

  useEffect(() => engine.setWander(wander), [engine, wander]);

  // Rebuilding voxels on every step of a drag would be wasteful, so voxel size waits for a pause.
  const [settled, setSettled] = useState(group.voxelSize);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(group.voxelSize), 150);
    return () => clearTimeout(timer);
  }, [group.voxelSize]);
  useEffect(() => engine.applyGroup({ ...group, voxelSize: settled }), [engine, settled, ...Object.values({ ...group, voxelSize: 0 })]);

  // Everyone has settings from the first render, so the code panel never appears late or changes height.
  const present = people.map((person) => ({ person, settings: settings[person.id] ?? startPerson(person.id) }));
  const code = generateCode({ ...group, voxelSize: settled }, present);

  return (
    <>
      <FloatingPanel />
      <div className="actions playground-actions">
        <button type="button" className="btn" onClick={() => engine.meet()}>Look at the same spot</button>
        <button type="button" className="btn" onClick={() => engine.clearAttention()}>Clear attention</button>
      </div>
      <div className="playground" data-count={count}>
        <div className="views">
          {people.map((person, index) => (
            <PersonView key={person.id} engine={engine} person={person} index={index} onChange={onChange} />
          ))}
        </div>
      </div>
      <CodePanel code={code} />
    </>
  );
}

createRoot(document.querySelector("#playground")!).render(<App engine={new Playground()} />);
