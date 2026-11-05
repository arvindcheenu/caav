import { Vector3, type PerspectiveCamera } from "three";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Small seeded generator, so each viewer wanders the same way on every load. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seconds a manual move keeps the viewer still before they wander again. */
const HANDS_OFF = 4;

/**
 * Stands in for a person wearing a headset: an orbit around the data whose gaze
 * glances from spot to spot. Dragging or the keyboard takes over for a while.
 */
export class Pilot {
  wander = true;
  private yaw: number;
  private pitch: number;
  private distance: number;
  private readonly spin: number;
  private readonly rand: () => number;
  private readonly aim = new Vector3();
  private readonly aimTo = new Vector3();
  private readonly spot = new Vector3();
  private dwell = 0;
  private handsOff = 0;
  private meeting = 0;
  private readonly meetAt = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly centre: Vector3,
    private readonly reach: number,
    index: number,
  ) {
    this.yaw = 0.5 + index * ((2 * Math.PI) / 4);
    this.pitch = 0.5 + 0.08 * index;
    this.distance = reach * 2.2;
    this.spin = (index % 2 === 0 ? 1 : -1) * (0.09 + 0.02 * index);
    this.rand = random(11 + 18 * index);
  }

  /** A person's drag or key press. */
  steer(dYaw: number, dPitch: number, zoom = 1) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, -0.2, 1.35);
    this.distance = clamp(this.distance * zoom, this.reach * 1.1, this.reach * 5);
    this.handsOff = HANDS_OFF;
    this.meeting = 0;
  }

  /** Looks at one world point for `seconds`, so several viewers can converge. */
  meet(point: Vector3, seconds: number) {
    this.meetAt.copy(point).sub(this.centre);
    this.meeting = seconds;
  }

  update(dt: number) {
    if (this.meeting > 0) {
      this.meeting -= dt;
      this.aim.lerp(this.meetAt, 1 - Math.exp(-dt * 5));
    } else if (this.handsOff > 0) {
      this.handsOff -= dt;
    } else if (this.wander) {
      this.yaw += this.spin * dt;
      this.dwell -= dt;
      if (this.dwell <= 0) this.glance();
      this.aim.lerp(this.aimTo, 1 - Math.exp(-dt * 2.5));
    }
    const { camera, centre, distance, yaw, pitch } = this;
    camera.position.set(
      centre.x + distance * Math.cos(pitch) * Math.sin(yaw),
      centre.y + distance * Math.sin(pitch),
      centre.z + distance * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(this.spot.copy(centre).add(this.aim));
    camera.updateMatrixWorld();
  }

  private glance() {
    this.dwell = 0.8 + this.rand() * 1.6;
    const angle = this.rand() * Math.PI * 2;
    const radius = this.reach * 0.55 * Math.sqrt(this.rand());
    this.aimTo.set(Math.cos(angle) * radius, (this.rand() - 0.6) * this.reach * 0.4, Math.sin(angle) * radius);
  }
}
