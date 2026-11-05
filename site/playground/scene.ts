import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
  type Object3D,
} from "three";
import { random } from "./pilot";

export interface Theme {
  background: string;
  data: string;
  /** Neutrals for the presentations that draw their own surface. */
  surface: string;
  ink: string;
}

export const LIGHT_THEME: Theme = { background: "#faf3ec", data: "#c9bfb4", surface: "#ffffff", ink: "#8f8478" };
export const DARK_THEME: Theme = { background: "#2a241f", data: "#7b7168", surface: "#1c1815", ink: "#7b7168" };

/** Repaints what the theme colours: the background, and the data's surface. */
export function applyTheme(scene: Scene, model: Object3D, theme: Theme) {
  scene.background = new Color(theme.background);
  model.traverse((child) => {
    const material = (child as Mesh).material as MeshStandardMaterial | undefined;
    if (!child.userData.keepsColour) material?.color?.set(theme.data);
  });
}

export function createScene(theme: Theme) {
  const scene = new Scene();
  scene.background = new Color(theme.background);
  scene.add(new HemisphereLight(0xffffff, 0x8a8a8a, 1.8));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  return scene;
}

const hills = [
  { x: -0.45, z: -0.3, height: 0.95, width: 0.32 },
  { x: 0.5, z: -0.45, height: 0.6, width: 0.3 },
  { x: 0.35, z: 0.45, height: 0.8, width: 0.26 },
  { x: -0.5, z: 0.55, height: 0.45, width: 0.34 },
  { x: 0.02, z: 0.02, height: 0.35, width: 0.2 },
];

const heightAt = (x: number, z: number) =>
  hills.reduce((sum, h) => sum + h.height * Math.exp(-((x - h.x) ** 2 + (z - h.z) ** 2) / (2 * h.width ** 2)), 0.06);

/** A single mesh: a height field, like the paper's terrain. */
export function createTerrain(theme: Theme): Object3D {
  const geometry = new PlaneGeometry(2, 2, 60, 60);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heightAt(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshStandardMaterial({ color: theme.data, flatShading: true, roughness: 0.9, side: 2 }));
}

/** A group of meshes: the same surface as a 3D bar chart, to show attaching to a hierarchy. */
export function createBars(theme: Theme): Object3D {
  const group = new Group();
  const material = new MeshStandardMaterial({ color: theme.data, roughness: 0.9 });
  const side = 9;
  const pitch = 2 / side;
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const x = -1 + pitch * (i + 0.5);
      const z = -1 + pitch * (j + 0.5);
      const height = Math.max(0.04, heightAt(x, z));
      const bar = new Mesh(new BoxGeometry(pitch * 0.72, height, pitch * 0.72), material);
      bar.position.set(x, height / 2, z);
      group.add(bar);
    }
  }
  return group;
}

/** Spheres as one instanced mesh, so a few hundred stay cheap to draw. */
function createSpheres(spheres: ReadonlyArray<{ position: Vector3; radius: number }>, material: MeshStandardMaterial, detail: number) {
  const mesh = new InstancedMesh(new IcosahedronGeometry(1, detail), material, spheres.length);
  const matrix = new Matrix4();
  spheres.forEach(({ position, radius }, index) => {
    matrix.makeScale(radius, radius, radius).setPosition(position);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.computeBoundingSphere();
  return mesh;
}

/** A point scattered evenly through a ball. */
function pointInBall(rand: () => number, radius: number): Vector3 {
  const point = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
  return point.lengthSq() > 1 ? pointInBall(rand, radius) : point.multiplyScalar(radius);
}

export const PROTEIN_POCKET = new Vector3(0.55, 0.25, 0.8).normalize();

/**
 * A surface in the spirit of a protein, generated rather than taken from a real structure: a clump of atom-sized
 * spheres, bumpy all over, with a pocket holding a small contrasting inhibitor. Its point in the paper's
 * motivation is that every bump looks like the next, so there is nothing to navigate by.
 */
export function createProtein(theme: Theme): Object3D {
  const rand = random(2026);
  const size = 1;
  const pocket = PROTEIN_POCKET.clone().multiplyScalar(size * 0.92);
  // Lobes make the outline lumpy, as a folded chain is, rather than a neat ball.
  const lobes = Array.from({ length: 7 }, () => ({ centre: pointInBall(rand, size * 0.62), radius: size * (0.34 + rand() * 0.16) }));
  const atoms: Array<{ position: Vector3; radius: number }> = [];
  for (let tries = 0; tries < 20000 && atoms.length < 620; tries++) {
    const lobe = lobes[Math.floor(rand() * lobes.length)];
    const position = pointInBall(rand, lobe.radius).add(lobe.centre);
    // Only the outer shell can be seen, so atoms buried deep inside are left out.
    const buried = lobes.some((other) => other.centre.distanceTo(position) < other.radius * 0.45);
    if (buried || position.distanceTo(pocket) < size * 0.3) continue;
    if (atoms.some((atom) => atom.position.distanceToSquared(position) < 0.0064)) continue;
    atoms.push({ position, radius: size * (0.085 + rand() * 0.035) });
  }
  const surface = createSpheres(atoms, new MeshStandardMaterial({ color: theme.data, roughness: 0.42 }), 1);

  const inhibitorAt = PROTEIN_POCKET.clone().multiplyScalar(size * 0.74);
  const atomsOfInhibitor = Array.from({ length: 7 }, () => ({
    position: pointInBall(rand, size * 0.09).add(inhibitorAt),
    radius: size * 0.05,
  }));
  const inhibitor = createSpheres(atomsOfInhibitor, new MeshStandardMaterial({ color: "#d8352b", roughness: 0.5 }), 1);
  inhibitor.userData.keepsColour = true;

  const group = new Group();
  group.add(surface, inhibitor);
  group.position.y = size * 1.05; // stands clear of where the other objects' base is
  return group;
}

export const SCATTER_POINTS = 100;

/**
 * A 3D scatterplot of uniformly distributed points, as in the paper's study. Seeded, so it is the same on every
 * load and for everyone in the scene. The axes are lines, so they don't take attention: only the points do.
 */
export function createScatter(theme: Theme): Object3D {
  const rand = random(100);
  const side = 2;
  const points = Array.from({ length: SCATTER_POINTS }, () => ({
    position: new Vector3((rand() - 0.5) * side, rand() * side * 0.7, (rand() - 0.5) * side),
    radius: 0.05,
  }));
  const group = new Group();
  group.add(createSpheres(points, new MeshStandardMaterial({ color: theme.data, roughness: 0.6 }), 2));

  const half = side / 2;
  const axes = new BufferGeometry();
  axes.setAttribute("position", new Float32BufferAttribute([-half, 0, half, half, 0, half, -half, 0, half, -half, side * 0.7, half, -half, 0, half, -half, 0, -half], 3));
  group.add(new LineSegments(axes, new LineBasicMaterial({ color: theme.data })));
  return group;
}
