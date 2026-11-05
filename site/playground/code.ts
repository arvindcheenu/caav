import type { GroupSettings, Person, PersonSettings } from "./settings";

/**
 * Writes the code for the current settings. It is what the playground itself
 * does, with the page's own wiring left out. Tests typecheck and run the output,
 * so it stays a setup that works when copied.
 */
export function generateCode(group: GroupSettings, people: ReadonlyArray<{ person: Person; settings: PersonSettings }>): string {
  const core = new Set(["createSession"]);
  const three = new Set(["attachAttention", "createAttentionView", "headRaySource"]);
  const lines: string[] = [];
  const write = (line = "") => lines.push(line);

  core.add(group.chooseShared ? "explicitColours" : "interpolatedColours");
  if (group.decay) core.add("halfLifeDecay");
  else core.add("noDecay");

  write("const session = createSession({");
  write(`  captureRate: ${group.captureRate},`);
  write(`  gain: ${group.gain},`);
  write(`  influenceRadius: ${group.influenceRadius},`);
  write(`  dwellTime: ${group.dwellTime},`);
  write(`  decay: ${group.decay ? `halfLifeDecay(${group.halfLife})` : "noDecay"},`);
  write("});");
  write(`const attached = attachAttention(session, object, { voxelSize: ${group.voxelSize} });`);
  write(`const sharedColour = ${group.chooseShared ? `explicitColours({ shared: "${group.sharedColour}" })` : "interpolatedColours()"};`);

  const updates: string[] = [];
  people.forEach(({ person, settings }, index) => {
    const name = person.id.toUpperCase();
    const { trigger, presentation, tooltip } = settings;
    write();
    write(`// ${person.label}`);
    write(`session.registerViewer({ id: "${person.id}", colour: "${settings.colour}", source: headRaySource(camera${name}) });`);
    write(`const view${name} = createAttentionView({`);
    write(`  session, attached, viewer: "${person.id}", camera: camera${name}, scene,`);
    write(`  layer: ${index + 1},`);
    if (presentation === "camera-separated") write(`  overlay: stage${name},`);
    write(`  presentation: "${presentation}",`);
    if (trigger === "always") {
      core.add("alwaysOn");
      write("  trigger: alwaysOn(),");
    } else if (trigger === "explicit") {
      core.add("explicitTrigger");
      write(`  trigger: explicitTrigger(${settings.show}),`);
    } else {
      core.add("implicitTrigger");
      write(`  trigger: implicitTrigger({ dwell: ${group.dwellTime}, hold: ${settings.hold} }),`);
    }
    write(`  accumulator: "${settings.accumulator}",`);
    write(`  threshold: ${settings.threshold},`);
    write("  colour: sharedColour,");
    write("});");
    if (trigger === "explicit") write(`// Call view${name}.trigger.request() when ${person.label} asks to see attention.`);
    updates.push(`  view${name}.update(dt);`);

    if (tooltip !== "off") {
      three.add("createSpatialTooltip");
      write(`const tooltip${name} = createSpatialTooltip({ camera: camera${name}, overlay: stage${name} });`);
      write(`session.on("${tooltip}", (event) => {`);
      write(`  if (event.viewer === "${person.id}") tooltip${name}.show(event.point, "${TOOLTIP_TEXT[tooltip]}", { seconds: 3 });`);
      write("});");
      updates.push(`  tooltip${name}.update(dt);`);
    }
  });

  write();
  write("// Call this once per frame, before rendering each camera.");
  write("function update(dt) {");
  write("  session.tick(dt);");
  for (const line of updates) write(line);
  write("}");

  const imports = [
    `import { ${[...core].sort().join(", ")} } from "caav";`,
    `import { ${[...three].sort().join(", ")} } from "caav/three";`,
    "",
  ];
  return [...imports, ...lines].join("\n");
}

const TOOLTIP_TEXT = {
  dwell: "Looked here for a while",
  jointstart: "Someone else is looking here too",
  gazeenter: "Started looking at the object",
} as const;

/** Which lines of `next` are new or changed since `previous`, as line indexes. */
export function changedLines(previous: string, next: string): Set<number> {
  const remaining = new Map<string, number>();
  for (const line of previous.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  const changed = new Set<number>();
  next.split("\n").forEach((line, index) => {
    const left = remaining.get(line) ?? 0;
    if (left > 0) remaining.set(line, left - 1);
    else changed.add(index);
  });
  return changed;
}
