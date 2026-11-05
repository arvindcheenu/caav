import { Vector3, type Object3D } from "three";
import {
  alwaysOn,
  createSession,
  explicitColours,
  explicitTrigger,
  halfLifeDecay,
  implicitTrigger,
  interpolatedColours,
  noDecay,
  type AttentionEvent,
  type TriggerPolicy,
} from "caav";
import { attachAttention, type AttachedTarget } from "caav/three";
import { Instance } from "./instance";
import { createBars, createScene, createTerrain, DARK_THEME, LIGHT_THEME } from "./scene";
import { START_GROUP, type GroupSettings, type Person, type PersonSettings } from "./settings";

const TOOLTIP_LEAD = { dwell: "Rested here", jointstart: "Looking together", gazeenter: "Looking at the object" };

const PRESENTATION_NAMES = {
  "world-embedded": "world, embedded",
  "world-separated": "world, separated",
  "camera-embedded": "camera, embedded",
  "camera-separated": "camera, separated",
};

const TRIGGER_NAMES = { always: "always on", explicit: "explicit", implicit: "implicit" };

interface Member {
  instance: Instance;
  settings: PersonSettings;
  status: HTMLElement;
  sinceStatus: number;
  lastStatus: string;
}

/** The playground's three.js side. React owns the controls and the page; this owns the scene and the library calls. */
export class Playground {
  readonly session = createSession({ captureRate: START_GROUP.captureRate, influenceRadius: START_GROUP.influenceRadius, gain: START_GROUP.gain, dwellTime: START_GROUP.dwellTime, decay: halfLifeDecay(START_GROUP.halfLife) });
  private readonly theme = matchMedia("(prefers-color-scheme: dark)").matches ? DARK_THEME : LIGHT_THEME;
  private readonly scene = createScene(this.theme);
  private readonly members = new Map<string, Member>();
  private group = START_GROUP;
  private model!: Object3D;
  private attached!: AttachedTarget;
  private wander = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  private frameId = 0;
  private last = performance.now();

  constructor() {
    this.loadModel(this.group.object);
    for (const type of ["dwell", "jointstart", "gazeenter"] as const) {
      this.session.on(type, (event) => this.showTooltip(type, event));
    }
    this.frameId = requestAnimationFrame(this.frame);
  }

  get wandering() {
    return this.wander;
  }

  private loadModel(name: GroupSettings["object"]) {
    this.model = name === "bars" ? createBars(this.theme) : createTerrain(this.theme);
    this.scene.add(this.model);
    this.attached = attachAttention(this.session, this.model, { id: name, voxelSize: this.group.voxelSize });
  }

  private unloadModel() {
    this.attached.detach();
    this.scene.remove(this.model);
    this.model.traverse((child) => (child as { geometry?: { dispose(): void } }).geometry?.dispose());
  }

  addPerson(person: Person, index: number, canvas: HTMLCanvasElement, overlay: HTMLElement, status: HTMLElement, settings: PersonSettings) {
    const instance = new Instance(person, index, settings.colour, canvas, overlay, this.session, this.scene, this.attached);
    instance.pilot.wander = this.wander;
    this.createView(instance, settings);
    this.members.set(person.id, { instance, settings, status, sinceStatus: Infinity, lastStatus: "" });
    this.refreshAvatars();
    return instance;
  }

  removePerson(id: string) {
    this.members.get(id)?.instance.dispose();
    this.members.delete(id);
    this.refreshAvatars();
  }

  private refreshAvatars() {
    const layers = [...this.members.values()].map((member) => member.instance.layer);
    for (const { instance } of this.members.values()) instance.showTo(layers);
  }

  private createView(instance: Instance, settings: PersonSettings) {
    instance.createView(this.attached, {
      presentation: settings.presentation,
      trigger: this.createTrigger(settings),
      accumulator: settings.accumulator,
      threshold: settings.threshold,
      colour: this.colourPolicy(),
      style: { surface: this.theme.surface, ink: this.theme.ink },
    });
  }

  private createTrigger(settings: PersonSettings): TriggerPolicy {
    if (settings.trigger === "always") return alwaysOn();
    if (settings.trigger === "explicit") return explicitTrigger(settings.show);
    return implicitTrigger({ dwell: this.group.dwellTime, hold: settings.hold });
  }

  private colourPolicy() {
    return this.group.chooseShared ? explicitColours({ shared: this.group.sharedColour }) : interpolatedColours();
  }

  /** Applies one person's settings, touching only what changed. */
  applyPerson(id: string, next: PersonSettings) {
    const member = this.members.get(id);
    if (!member) return;
    const previous = member.settings;
    const { view } = member.instance;
    member.settings = next;
    member.sinceStatus = Infinity;
    if (next.colour !== previous.colour) member.instance.setColour(next.colour);
    if (next.presentation !== previous.presentation) view.setPresentation(next.presentation);
    if (next.accumulator !== previous.accumulator) view.setAccumulator(next.accumulator);
    if (next.threshold !== previous.threshold) view.setThreshold(next.threshold);
    if (next.trigger !== previous.trigger || next.hold !== previous.hold) view.setTrigger(this.createTrigger(next));
    else if (next.show !== previous.show) view.trigger.request(next.show);
    if (next.tooltip !== previous.tooltip) member.instance.tooltip.hide();
  }

  /** Applies the settings everyone shares, touching only what changed. */
  applyGroup(next: GroupSettings) {
    const previous = this.group;
    this.group = next;
    this.session.configure({
      captureRate: next.captureRate !== previous.captureRate ? next.captureRate : undefined,
      gain: next.gain,
      influenceRadius: next.influenceRadius,
      dwellTime: next.dwellTime,
      decay: next.decay ? halfLifeDecay(next.halfLife) : noDecay,
    });
    if (next.object !== previous.object) this.swapModel(next.object);
    else if (next.voxelSize !== previous.voxelSize) this.attached.setVoxelSize(next.voxelSize);
    if (next.chooseShared !== previous.chooseShared || next.sharedColour !== previous.sharedColour) {
      for (const { instance } of this.members.values()) instance.view.setColourPolicy(this.colourPolicy());
    }
    if (next.dwellTime !== previous.dwellTime) {
      for (const { instance, settings } of this.members.values()) {
        if (settings.trigger === "implicit") instance.view.setTrigger(this.createTrigger(settings));
      }
    }
  }

  private swapModel(name: GroupSettings["object"]) {
    for (const { instance } of this.members.values()) instance.view.dispose();
    this.unloadModel();
    this.loadModel(name);
    for (const { instance, settings } of this.members.values()) this.createView(instance, settings);
  }

  setWander(wander: boolean) {
    this.wander = wander;
    for (const { instance } of this.members.values()) instance.pilot.wander = wander;
  }

  clearAttention() {
    this.session.reset();
  }

  /** Sends everyone to the highest voxel, which nothing hides from anyone. */
  meet() {
    const { grid } = this.attached.target;
    let highest = 0;
    for (let v = 1; v < grid.count; v++) if (grid.centre(v)[1] > grid.centre(highest)[1]) highest = v;
    const point = new Vector3(...grid.centre(highest)).applyMatrix4(this.attached.object.matrixWorld);
    for (const { instance } of this.members.values()) instance.pilot.meet(point, 5);
  }

  private showTooltip(type: "dwell" | "jointstart" | "gazeenter", event: AttentionEvent) {
    const member = this.members.get(event.viewer);
    if (!member || member.settings.tooltip !== type) return;
    // Say who has attended this spot, using the same numbers the display shows.
    const field = this.session.targets.get(event.target)!.field;
    const values = [...this.session.viewers.values()]
      .map((viewer) => `${viewer.label.replace("Person ", "")} ${field.channel(viewer.id)[event.voxel].toFixed(2)}`)
      .join(", ");
    member.instance.tooltip.show(event.point, `${TOOLTIP_LEAD[type]}: ${values}`, { seconds: 3 });
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    for (const { instance } of this.members.values()) instance.pilot.update(dt);
    this.session.tick(dt);
    for (const member of this.members.values()) {
      member.instance.view.update(dt);
      member.instance.updateAvatar();
      member.instance.tooltip.update(dt);
      this.updateStatus(member, dt);
    }
    for (const { instance } of this.members.values()) instance.render();
    this.frameId = requestAnimationFrame(this.frame);
  };

  /** Text for the same information the view shows, a few times a second. */
  private updateStatus(member: Member, dt: number) {
    member.sinceStatus += dt;
    if (member.sinceStatus < 0.25) return;
    member.sinceStatus = 0;
    const { view, person } = member.instance;
    const gaze = this.session.gaze(person.id);
    const looking = gaze ? `Looking at voxel ${gaze.voxel}.` : "Looking at nothing tracked.";
    const state = view.visible ? "shown" : "hidden";
    const counts = view.visible ? ` ${view.shading.attended} voxels attended, ${view.shading.shared} shared.` : "";
    const text = `${looking} Trigger ${TRIGGER_NAMES[view.trigger.kind]}: ${PRESENTATION_NAMES[view.presentation]}, ${state}.${counts}`;
    if (text !== member.lastStatus) member.status.textContent = member.lastStatus = text;
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    for (const id of [...this.members.keys()]) this.removePerson(id);
    this.unloadModel();
  }
}
