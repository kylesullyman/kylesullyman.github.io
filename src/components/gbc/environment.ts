/**
 * Procedural environment map for the shell's reflections.
 *
 * This replaces drei's <Environment>/<Lightformer>, which pull the whole drei
 * package into the bundle for what amounts to three soft highlights. The
 * output is the same kind of thing drei produces -- a PMREM-filtered
 * environment -- just painted directly as an equirectangular canvas instead
 * of rendered from scene geometry.
 *
 * The highlights matter visually: meshPhysicalMaterial with transmission and
 * clearcoat has almost nothing to reflect without them, and the shell reads
 * as flat matte plastic.
 */

import * as THREE from 'three';

interface Blob {
  /** World-space direction the light comes from; normalised internally. */
  position: [number, number, number];
  /** Angular radius on the sphere, in UV units (1 = full width). */
  size: number;
  intensity: number;
  color: string;
}

/** Mirrors the three lightformers this replaced. */
const BLOBS: Blob[] = [
  { position: [-6, 8, 10], size: 0.3, intensity: 2.2, color: '#ffffff' },
  { position: [8, 2, 8], size: 0.22, intensity: 1.1, color: '#ffc4d2' },
  { position: [0, -8, -10], size: 0.34, intensity: 1.6, color: '#ff5577' },
];

const WIDTH = 256;
const HEIGHT = 128;

/**
 * Equirectangular UV for a direction, matching three's `equirectUv`:
 *   u = atan2(z, x) / 2pi + 0.5
 *   v = asin(y) / pi + 0.5
 */
function directionToUv(x: number, y: number, z: number): [number, number] {
  const len = Math.hypot(x, y, z) || 1;
  const u = Math.atan2(z / len, x / len) / (Math.PI * 2) + 0.5;
  const v = Math.asin(THREE.MathUtils.clamp(y / len, -1, 1)) / Math.PI + 0.5;
  return [u, v];
}

/**
 * Builds the PMREM-filtered environment. The caller owns the result and must
 * dispose it; the PMREMGenerator is disposed here since it is single-use.
 */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Dark base so unlit angles stay dark rather than washing out.
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (const blob of BLOBS) {
      const [u, v] = directionToUv(...blob.position);
      const cx = u * WIDTH;
      // Canvas y runs top-down; v runs bottom-up.
      const cy = (1 - v) * HEIGHT;
      const radius = blob.size * WIDTH;

      const colour = new THREE.Color(blob.color).multiplyScalar(
        Math.min(blob.intensity, 1),
      );
      const rgb = `${Math.round(colour.r * 255)}, ${Math.round(colour.g * 255)}, ${Math.round(colour.b * 255)}`;

      // Draw the blob, and repeat it either side of the seam so a highlight
      // near u=0 or u=1 wraps instead of being clipped.
      for (const offset of [-WIDTH, 0, WIDTH]) {
        const gradient = ctx.createRadialGradient(
          cx + offset,
          cy,
          0,
          cx + offset,
          cy,
          radius,
        );
        gradient.addColorStop(0, `rgba(${rgb}, 1)`);
        gradient.addColorStop(0.5, `rgba(${rgb}, 0.35)`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(cx + offset - radius, cy - radius, radius * 2, radius * 2);
      }
    }
  }

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromEquirectangular(source);

  source.dispose();
  pmrem.dispose();

  return target.texture;
}
