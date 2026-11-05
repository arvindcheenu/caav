import { button, Leva, useControls } from "leva";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACCUMULATOR_KINDS } from "caav";
import { PRESENTATION_KINDS } from "caav/three";
import { changedLines, generateCode } from "./code";
import { Playground } from "./engine";
import { highlightLines } from "./highlight";
import type { Instance } from "./instance";
import { PEOPLE, START_COLOURS, START_GROUP, START_PRESENTATIONS, type GroupSettings, type Person, type PersonSettings, type TooltipEvent } from "./settings";

const PRESENTATION_LABELS: Record<string, string> = {
  "World, embedded": PRESENTATION_KINDS[0],
  "World, separated": PRESENTATION_KINDS[1],
  "Camera, embedded": PRESENTATION_KINDS[2],
  "Camera, separated": PRESENTATION_KINDS[3],
};

const TRIGGER_LABELS = { "Always on": "always", Explicit: "explicit", Implicit: "implicit" };

const ACCUMULATOR_LABELS = { Sum: ACCUMULATOR_KINDS[0], Maximum: ACCUMULATOR_KINDS[1], Difference: ACCUMULATOR_KINDS[2], Count: ACCUMULATOR_KINDS[3] };

const TOOLTIP_LABELS: Record<string, TooltipEvent> = { Off: "off", "On dwell": "dwell", "On joint gaze": "jointstart", "On gaze landing": "gazeenter" };

/** One person's Leva folder and view. Each person's settings live here, independent of everyone else's. */
function PersonView({ engine, person, index, onChange }: { engine: Playground; person: Person; index: number; onChange: (id: string, settings: PersonSettings) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const instanceRef = useRef<Instance | null>(null);

  const [values, set] = useControls(
    person.label,
    () => ({
      colour: { label: "Colour", value: START_COLOURS[person.id] },
      presentation: { label: "Presentation", value: START_PRESENTATIONS[person.id], options: PRESENTATION_LABELS },
      trigger: { label: "Trigger", value: "always", options: TRIGGER_LABELS },
      show: { label: "Show attention", value: false, render: (get) => get(`${person.label}.trigger`) === "explicit" },
      hold: { label: "Hold (s)", value: 2, min: 0, max: 6, step: 0.5, render: (get) => get(`${person.label}.trigger`) === "implicit" },
      accumulator: { label: "Accumulator", value: "sum", options: ACCUMULATOR_LABELS },
      threshold: { label: "Threshold", value: 0.05, min: 0.01, max: 0.9, step: 0.01 },
      tooltip: { label: "Tooltip", value: "off", options: TOOLTIP_LABELS },
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
    if (latest.current.trigger === "explicit") set({ show: !latest.current.show });
  }, [set]);

  useEffect(() => {
    const element = canvas.current!;
    return wireInput(element, () => instanceRef.current!, ask);
  }, [ask]);

  return (
    <article className="view" style={{ "--person": settings.colour } as React.CSSProperties}>
      <h3 className="who">
        <span className="dot" aria-hidden="true" />
        {person.label}
      </h3>
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
      people: { label: "People", value: 2, min: 1, max: 4, step: 1 },
      object: { label: "Object", value: START_GROUP.object, options: { "Terrain (one mesh)": "terrain", "Bars (a group)": "bars" } },
      wander: { label: "Look around", value: engine.wandering },
      "Look at the same spot": button(() => engine.meet()),
      "Clear attention": button(() => engine.clearAttention()),
    },
    { order: 0 },
  );
  const recording = useControls(
    "Recording",
    {
      voxelSize: { label: "Voxel size", value: START_GROUP.voxelSize, min: 0.04, max: 0.24, step: 0.01 },
      influenceRadius: { label: "Radius (voxels)", value: START_GROUP.influenceRadius, min: 0, max: 4, step: 0.1 },
      gain: { label: "Gain (per s)", value: START_GROUP.gain, min: 0.1, max: 2, step: 0.1 },
      captureRate: { label: "Capture (Hz)", value: START_GROUP.captureRate, min: 1, max: 30, step: 1 },
      decay: { label: "Decay", value: START_GROUP.decay },
      halfLife: { label: "Half-life (s)", value: START_GROUP.halfLife, min: 5, max: 120, step: 5, render: (get) => get("Recording.decay") },
      dwellTime: { label: "Dwell (s)", value: START_GROUP.dwellTime, min: 0.5, max: 5, step: 0.1 },
    },
    { order: 1 },
  );
  const shared = useControls(
    "Shared colour",
    {
      chooseShared: { label: "Choose a colour", value: START_GROUP.chooseShared },
      sharedColour: { label: "Colour", value: START_GROUP.sharedColour, render: (get) => get("Shared colour.chooseShared") },
    },
    { order: 6 },
  );
  const group: GroupSettings = { object: scene.object as GroupSettings["object"], ...recording, ...shared };
  return { people: scene.people, wander: scene.wander, group };
}

function CodePanel({ code }: { code: string }) {
  const previous = useRef(code);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (code === previous.current) return;
    setMarked(changedLines(previous.current, code));
    previous.current = code;
  }, [code]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="code-panel">
      <div className="code-head">
        <p>The code for these settings. Lines from your last change are tinted.</p>
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy code"}</button>
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

/** Leva in the HeedVision palette. It takes colours as values, so they are read from the page's tokens. */
function levaTheme() {
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return {
    colors: {
      elevation1: token("--surface-2"),
      elevation2: token("--surface-2"),
      elevation3: token("--bg"),
      accent1: token("--accent"),
      accent2: token("--accent"),
      accent3: token("--accent"),
      highlight1: token("--quiet"),
      highlight2: token("--fg"),
      highlight3: token("--fg"),
      vivid1: token("--title"),
      folderWidgetColor: token("--quiet"),
      folderTextColor: token("--fg"),
      toolTipBackground: token("--fg"),
      toolTipText: token("--bg"),
    },
    sizes: { rootWidth: "100%", controlWidth: "58%", rowHeight: "28px" },
    fonts: { mono: "ui-monospace, SFMono-Regular, Menlo, monospace", sans: token("--f-text") },
    fontSizes: { root: "12px" },
    radii: { xs: "4px", sm: "6px", lg: "14px" },
  };
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

  const present = people.filter((person) => settings[person.id]).map((person) => ({ person, settings: settings[person.id] }));
  const code = generateCode({ ...group, voxelSize: settled }, present);

  return (
    <>
      <div className="playground" data-count={count}>
        <div className="views">
          {people.map((person, index) => (
            <PersonView key={person.id} engine={engine} person={person} index={index} onChange={onChange} />
          ))}
        </div>
        <aside className="controls" aria-label="Settings">
          <Leva fill flat titleBar={false} hideCopyButton theme={levaTheme()} />
        </aside>
      </div>
      <CodePanel code={code} />
    </>
  );
}

createRoot(document.querySelector("#playground")!).render(<App engine={new Playground()} />);
