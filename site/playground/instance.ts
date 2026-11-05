import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Scene,
} from "three";
import type { AttentionSession } from "caav";
import { createAttentionView, createSpatialTooltip, headRaySource, type AttachedTarget, type AttentionView, type AttentionViewOptions, type SpatialTooltip } from "caav/three";
import { Pilot } from "./pilot";
import type { Person } from "./settings";

type ViewSetup = Pick<AttentionViewOptions, "presentation" | "trigger" | "accumulator" | "colour" | "threshold" | "style">;

/** Everything one person needs: a camera, a renderer, a pilot, an attention view and how others see them. */
export class Instance {
  readonly camera: PerspectiveCamera;
  readonly pilot: Pilot;
  readonly layer: number;
  readonly tooltip: SpatialTooltip;
  view!: AttentionView;
  private readonly renderer: WebGLRenderer;
  private readonly head: Group;
  private readonly gazeLine: Mesh;

  constructor(
    readonly person: Person,
    index: number,
    colour: string,
    readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLElement,
    private readonly session: AttentionSession,
    private readonly scene: Scene,
    attached: AttachedTarget,
  ) {
    this.layer = index + 1;
    this.camera = new PerspectiveCamera(50, 1.5, 0.02, 60);
    this.pilot = new Pilot(this.camera, attached.bounds.getCenter(new Vector3()), attached.bounds.getSize(new Vector3()).length() / 2, index);
    this.pilot.update(0);
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.tooltip = createSpatialTooltip({ camera: this.camera, overlay });

    session.registerViewer({ id: person.id, label: person.label, colour, source: headRaySource(this.camera) });

    // How everyone else sees this person: a head with a nose, and a line along their gaze.
    this.head = createHead(colour);
    this.gazeLine = new Mesh(
      new CylinderGeometry(0.004, 0.004, 1, 6).rotateX(Math.PI / 2),
      new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45 }),
    );
    scene.add(this.head, this.gazeLine);
  }

  createView(attached: AttachedTarget, setup: ViewSetup) {
    attached.object.updateWorldMatrix(true, false);
    const centre = attached.bounds.getCenter(new Vector3()).applyMatrix4(attached.object.matrixWorld); // bounds are in the object's own space
    this.pilot.retarget(centre, attached.bounds.getSize(new Vector3()).length() / 2);
    this.view = createAttentionView({
      ...setup,
      session: this.session,
      attached,
      viewer: this.person.id,
      camera: this.camera,
      scene: this.scene,
      overlay: this.overlay,
      layer: this.layer,
    });
  }

  setColour(colour: string) {
    this.session.viewers.get(this.person.id)!.colour = colour;
    this.forEachMesh((mesh) => (mesh.material as MeshBasicMaterial).color.set(colour));
  }

  /** Shows this person's head and gaze to every view but their own. */
  showTo(layers: number[]) {
    for (const part of [this.head, this.gazeLine]) {
      part.traverse((child) => {
        child.layers.disableAll();
        for (const layer of layers) if (layer !== this.layer) child.layers.enable(layer);
      });
    }
  }

  updateAvatar() {
    this.head.position.copy(this.camera.position);
    this.head.quaternion.copy(this.camera.quaternion);
    const gaze = this.session.gaze(this.person.id);
    this.gazeLine.visible = gaze !== null;
    if (gaze) {
      const from = this.camera.position;
      const to = new Vector3(...gaze.point);
      this.gazeLine.position.copy(from).add(to).multiplyScalar(0.5);
      this.gazeLine.lookAt(to);
      this.gazeLine.scale.z = from.distanceTo(to);
    }
  }

  render() {
    const { canvas, renderer, camera } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const ratio = renderer.getPixelRatio();
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    renderer.render(this.scene, camera);
  }

  /** The point a press lands on when it picks up the miniature, or null. */
  pickMiniature(clientX: number, clientY: number) {
    const miniature = this.view.miniature;
    if (!miniature || !this.view.visible) return null;
    const hit = this.rayAt(clientX, clientY).intersectObject(miniature.object, true)[0];
    return hit ? hit.point : null;
  }

  /** Moves the miniature with the pointer, on a plane facing this person through where it was grabbed. */
  dragMiniature(clientX: number, clientY: number, grab: Vector3) {
    const miniature = this.view.miniature;
    if (!miniature) return;
    const normal = this.camera.getWorldDirection(new Vector3());
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, grab);
    const point = this.rayAt(clientX, clientY).ray.intersectPlane(plane, new Vector3());
    if (point) miniature.moveTo(point.x, point.y, point.z);
  }

  /** Moves the miniature along this person's right and up. */
  nudgeMiniature(right: number, up: number) {
    const miniature = this.view.miniature;
    if (!miniature) return;
    const position = miniature.object.position.clone();
    position.addScaledVector(new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), right);
    position.addScaledVector(new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1), up);
    miniature.moveTo(position.x, position.y, position.z);
  }

  private rayAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const raycaster = new Raycaster();
    raycaster.layers.set(this.layer);
    raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    return raycaster;
  }

  private forEachMesh(visit: (mesh: Mesh) => void) {
    for (const part of [this.head, this.gazeLine]) {
      part.traverse((child) => {
        if ((child as Mesh).isMesh) visit(child as Mesh);
      });
    }
  }

  dispose() {
    this.view.dispose();
    this.tooltip.dispose();
    this.session.removeViewer(this.person.id);
    this.forEachMesh((mesh) => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    });
    this.scene.remove(this.head, this.gazeLine);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

function createHead(colour: string) {
  const head = new Group();
  head.add(new Mesh(new SphereGeometry(0.07, 20, 14), new MeshBasicMaterial({ color: colour })));
  const nose = new Mesh(new ConeGeometry(0.03, 0.08, 12).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: colour }));
  nose.position.z = -0.09; // a camera looks down its -z
  head.add(nose);
  return head;
}
