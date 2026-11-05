import type { AccumulatorKind, TriggerPolicy } from "caav";
import type { PresentationKind } from "caav/three";

/** Everything the playground lets you change, as plain data. The engine and the code panel both read this. */

export type TooltipEvent = "off" | "dwell" | "jointstart" | "gazeenter";

export type ObjectName = "terrain" | "bars" | "protein" | "scatter";

/**
 * The objects you can look at. Each has its own voxel size: sparse points need bigger voxels than a surface,
 * or a head ray would mostly pass between them.
 */
export const OBJECTS: Record<ObjectName, { label: string; voxelSize: number }> = {
  terrain: { label: "Terrain (one mesh)", voxelSize: 0.08 },
  bars: { label: "Bars (a group)", voxelSize: 0.08 },
  protein: { label: "Generated protein", voxelSize: 0.08 },
  scatter: { label: "Scatterplot (100)", voxelSize: 0.1 },
};

export interface PersonSettings {
  colour: string;
  presentation: PresentationKind;
  trigger: TriggerPolicy["kind"];
  /** Whether this person has asked to see attention, under an explicit trigger. */
  show: boolean;
  /** Seconds an implicit trigger stays on after its condition ends. */
  hold: number;
  accumulator: AccumulatorKind;
  threshold: number;
  tooltip: TooltipEvent;
}

export interface GroupSettings {
  object: ObjectName;
  voxelSize: number;
  influenceRadius: number;
  gain: number;
  captureRate: number;
  decay: boolean;
  halfLife: number;
  dwellTime: number;
  chooseShared: boolean;
  sharedColour: string;
}

export interface Person {
  id: string;
  label: string;
}

export const PEOPLE: Person[] = [
  { id: "a", label: "Person A" },
  { id: "b", label: "Person B" },
  { id: "c", label: "Person C" },
  { id: "d", label: "Person D" },
];

export const START_COLOURS: Record<string, string> = { a: "#3d8bff", b: "#f08a3c", c: "#17a67e", d: "#8e5bd6" };

/** The first two people start in different quadrants, to show that each person chooses their own. */
export const START_PRESENTATIONS: Record<string, PresentationKind> = {
  a: "world-embedded",
  b: "camera-separated",
  c: "world-separated",
  d: "camera-embedded",
};

/** Where a person starts. The controls, the first paint of the code panel and the build's shell all read this. */
export function startPerson(id: string): PersonSettings {
  return {
    colour: START_COLOURS[id],
    presentation: START_PRESENTATIONS[id],
    trigger: "always",
    show: false,
    hold: 2,
    accumulator: "sum",
    threshold: 0.05,
    tooltip: "off",
  };
}

export const START_PEOPLE = 2;

export const START_GROUP: GroupSettings = {
  object: "terrain",
  voxelSize: 0.08,
  influenceRadius: 1.8,
  gain: 0.4,
  captureRate: 10,
  decay: true,
  halfLife: 30,
  dwellTime: 1.5,
  chooseShared: false,
  sharedColour: "#ec4f9c",
};
