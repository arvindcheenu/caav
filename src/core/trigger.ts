/** What a trigger may base its decision on, for one viewer at one moment. */
export interface TriggerContext {
  /** Seconds since the last update. */
  dt: number;
  /** Seconds this viewer's gaze has rested on the same region; 0 when they look away. */
  dwell: number;
  /** How many other viewers are looking at the same region right now. */
  joint: number;
}

/** Decides when a viewer sees the attention display. Each view has its own. */
export interface TriggerPolicy {
  readonly kind: "always" | "explicit" | "implicit";
  update(context: TriggerContext): boolean;
  /** Only an explicit trigger responds: `on` sets the state, and no argument toggles it. */
  request(on?: boolean): void;
}

/** Attention is always shown. */
export function alwaysOn(): TriggerPolicy {
  return { kind: "always", update: () => true, request() {} };
}

/** Shown only while the viewer has asked for it. The paper's HeedVision uses this. */
export function explicitTrigger(initial = false): TriggerPolicy {
  let visible = initial;
  return {
    kind: "explicit",
    update: () => visible,
    request(on = !visible) {
      visible = on;
    },
  };
}

export interface ImplicitOptions {
  /** Seconds of steady gaze that count as interest. */
  dwell?: number;
  /** Seconds the display stays after the condition ends, so it does not flicker. */
  hold?: number;
  /** Replaces the default condition: gaze rested for `dwell`, or someone else is looking at the same region. */
  when?: (context: TriggerContext) => boolean;
}

/**
 * The system decides. By default attention appears once a viewer settles on a
 * region or another viewer joins them there, and stays out of the way while
 * they move around, which guards against the Midas touch.
 */
export function implicitTrigger(options: ImplicitOptions = {}): TriggerPolicy {
  const dwell = options.dwell ?? 1.5;
  const hold = options.hold ?? 2;
  const when = options.when ?? ((c: TriggerContext) => c.dwell >= dwell || c.joint > 0);
  let remaining = 0;
  return {
    kind: "implicit",
    update(context) {
      remaining = when(context) ? hold : Math.max(0, remaining - context.dt);
      return remaining > 0;
    },
    request() {},
  };
}
