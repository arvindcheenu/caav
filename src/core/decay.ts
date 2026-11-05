/** How much of a value survives `dt` seconds. */
export type Decay = (dt: number) => number;

/** Exponential decay: attention halves every `halfLife` seconds and is independent of the sampling rate. */
export function halfLifeDecay(halfLife: number): Decay {
  if (halfLife <= 0) throw new RangeError(`half-life must be positive, got ${halfLife}`);
  return (dt) => Math.pow(0.5, dt / halfLife);
}

/** Attention is kept for good. */
export const noDecay: Decay = () => 1;
