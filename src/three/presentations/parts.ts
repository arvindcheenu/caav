import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  type Object3D,
} from "three";
import type { Shading, VoxelGrid } from "../../core/index.js";

/** Pieces the world-space and box presentations share. */

/** Puts an object and its children on a view's layer. */
export function setLayer(object: Object3D, layer: number | undefined) {
  if (layer !== undefined) object.traverse((child) => child.layers.set(layer));
}

/** Keeps a group on the attached object's pose without becoming its child, so the object's own hierarchy stays untouched. */
export function createFollower(object: Object3D) {
  const group = new Group();
  group.matrixAutoUpdate = false;
  return {
    group,
    follow() {
      object.updateWorldMatrix(true, false);
      group.matrix.copy(object.matrixWorld);
      group.matrixWorldNeedsUpdate = true;
    },
  };
}

const VOXEL_VERTEX = /* glsl */ `
  attribute vec3 voxelColour;
  attribute float voxelAlpha;
  varying vec3 vColour;
  varying float vAlpha;
  void main() {
    // Fixed face shading, so cubes read as cubes without needing scene lights.
    vColour = voxelColour * (0.84 + 0.16 * dot(normal, normalize(vec3(0.4, 0.8, 0.45))));
    vAlpha = voxelAlpha;
    gl_Position = voxelAlpha > 0.0
      ? projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0)
      : vec4(2.0, 2.0, 2.0, 1.0);
  }`;

/**
 * Attention as translucent cubes, one instance per voxel. Colours are sRGB and
 * pass straight through to the screen.
 *
 * Drawn in two passes: depth first, then colour on the front-most surface only.
 * Without this, cubes blend through each other and a voxel's colour no longer
 * says who attended it.
 */
export function createVoxelCloud(grid: VoxelGrid) {
  const geometry = new BoxGeometry(grid.size, grid.size, grid.size);
  const colour = new InstancedBufferAttribute(new Float32Array(grid.count * 3), 3);
  const alpha = new InstancedBufferAttribute(new Float32Array(grid.count), 1);
  geometry.setAttribute("voxelColour", colour);
  geometry.setAttribute("voxelAlpha", alpha);

  const depthMaterial = new ShaderMaterial({
    transparent: true,
    colorWrite: false,
    vertexShader: VOXEL_VERTEX,
    fragmentShader: "void main() { gl_FragColor = vec4(0.0); }",
  });
  const colourMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: VOXEL_VERTEX,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(vColour, 0.3 + 0.7 * vAlpha);
      }`,
  });

  const depthPass = new InstancedMesh(geometry, depthMaterial, grid.count);
  const colourPass = new InstancedMesh(geometry, colourMaterial, grid.count);
  colourPass.instanceMatrix = depthPass.instanceMatrix;
  const matrix = new Matrix4();
  for (let v = 0; v < grid.count; v++) {
    const [x, y, z] = grid.centre(v);
    depthPass.setMatrixAt(v, matrix.makeTranslation(x, y, z));
  }
  const object = new Group();
  [depthPass, colourPass].forEach((mesh, pass) => {
    mesh.frustumCulled = false;
    mesh.renderOrder = 2 + pass;
    mesh.raycast = () => {};
    object.add(mesh);
  });

  return {
    object,
    draw(shading: Shading) {
      colour.array.set(shading.rgb);
      alpha.array.set(shading.alpha);
      colour.needsUpdate = true;
      alpha.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      depthMaterial.dispose();
      colourMaterial.dispose();
      depthPass.dispose();
      colourPass.dispose();
    },
  };
}

/** Flat-shaded neutral material for the data's replica. It needs no scene lights. */
export function createReplicaMaterial(ink: string) {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: { ink: { value: srgbUniform(ink) } },
    vertexShader: /* glsl */ `
      varying vec3 vView;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vView = view.xyz;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
        gl_FragColor = vec4(ink * (0.7 + 0.3 * abs(n.z)), 1.0);
      }`,
  });
}

/** A hex colour's raw sRGB channels, skipping three's conversion to linear, for shaders that write straight to the screen. */
function srgbUniform(hex: string) {
  const c = new Color();
  c.setStyle(hex, "");
  return c;
}
