import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  type Object3D,
} from "three";

export interface Theme {
  background: string;
  data: string;
  /** Neutrals for the presentations that draw their own surface. */
  surface: string;
  ink: string;
}

export const LIGHT_THEME: Theme = { background: "#eceae6", data: "#b9b6ae", surface: "#f6f5f2", ink: "#8b887f" };
export const DARK_THEME: Theme = { background: "#17181b", data: "#6c7078", surface: "#0e0f12", ink: "#6c7078" };

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
