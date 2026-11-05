import { describe, expect, it } from "vitest";
import { alwaysOn, explicitTrigger, implicitTrigger, type TriggerContext } from "../src/core/trigger.js";

const context = (over: Partial<TriggerContext> = {}): TriggerContext => ({ dt: 0.1, dwell: 0, joint: 0, ...over });

describe("alwaysOn", () => {
  it("is always visible and ignores requests", () => {
    const trigger = alwaysOn();
    trigger.request(false);
    expect(trigger.update(context())).toBe(true);
  });
});

describe("explicitTrigger", () => {
  it("starts hidden and follows requests", () => {
    const trigger = explicitTrigger();
    expect(trigger.update(context())).toBe(false);
    trigger.request(true);
    expect(trigger.update(context())).toBe(true);
    trigger.request(false);
    expect(trigger.update(context())).toBe(false);
  });

  it("toggles with no argument", () => {
    const trigger = explicitTrigger();
    trigger.request();
    expect(trigger.update(context())).toBe(true);
    trigger.request();
    expect(trigger.update(context())).toBe(false);
  });

  it("ignores context, so the user stays in control", () => {
    expect(explicitTrigger().update(context({ dwell: 100, joint: 3 }))).toBe(false);
  });

  it("can start visible", () => expect(explicitTrigger(true).update(context())).toBe(true));
});

describe("implicitTrigger", () => {
  it("stays hidden while the viewer moves around alone", () => {
    expect(implicitTrigger().update(context({ dwell: 0.5 }))).toBe(false);
  });

  it("shows once the gaze has rested long enough", () => {
    const trigger = implicitTrigger({ dwell: 1 });
    expect(trigger.update(context({ dwell: 0.9 }))).toBe(false);
    expect(trigger.update(context({ dwell: 1 }))).toBe(true);
  });

  it("shows when another viewer joins, with no need to dwell", () => {
    expect(implicitTrigger().update(context({ joint: 1 }))).toBe(true);
  });

  it("holds after the condition ends, then hides", () => {
    const trigger = implicitTrigger({ hold: 0.3 });
    expect(trigger.update(context({ joint: 1 }))).toBe(true);
    expect(trigger.update(context({ dt: 0.2 }))).toBe(true);
    expect(trigger.update(context({ dt: 0.2 }))).toBe(false);
  });

  it("renews the hold while the condition lasts", () => {
    const trigger = implicitTrigger({ hold: 0.3 });
    trigger.update(context({ joint: 1 }));
    trigger.update(context({ dt: 0.2 }));
    trigger.update(context({ joint: 1 }));
    expect(trigger.update(context({ dt: 0.2 }))).toBe(true);
  });

  it("accepts a custom rule", () => {
    const trigger = implicitTrigger({ hold: 0, when: (c) => c.joint >= 2 });
    expect(trigger.update(context({ joint: 1, dwell: 100 }))).toBe(false);
    expect(trigger.update(context({ joint: 2 }))).toBe(false); // hold of 0 means no time on screen
    const held = implicitTrigger({ hold: 1, when: (c) => c.joint >= 2 });
    expect(held.update(context({ joint: 2 }))).toBe(true);
  });

  it("ignores requests", () => {
    const trigger = implicitTrigger();
    trigger.request(true);
    expect(trigger.update(context())).toBe(false);
  });
});
