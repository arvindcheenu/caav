import type { AccumulatorKind, TriggerPolicy } from "caav";
import type { PresentationKind } from "caav/three";

/** Everything the playground lets you change, as plain data. The engine and the code panel both read this. */

export type TooltipEvent = "off" | "dwell" | "jointstart" | "gazeenter";

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
  object: "terrain" | "bars";
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
