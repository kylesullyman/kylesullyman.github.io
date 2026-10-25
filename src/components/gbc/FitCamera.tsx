/**
 * Keeps the whole console in frame.
 *
 * The camera is pulled back far enough that the body fits vertically *and*
 * horizontally, so the model is never cropped on narrow or short viewports.
 * Recomputed whenever the canvas resizes.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { BODY } from './spec';

/** Fraction of the frame the console should occupy. */
const FILL = 0.84;

export function FitCamera() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const aspect = size.width / Math.max(size.height, 1);
    const vFov = (camera.fov * Math.PI) / 180;

    // Distance needed so the body's height fits the vertical field of view.
    const forHeight = BODY.height / 2 / Math.tan(vFov / 2);
    // ...and so its width fits the horizontal field of view.
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const forWidth = BODY.width / 2 / Math.tan(hFov / 2);

    // The console rotates during the intro, so budget for its diagonal
    // rather than just the front silhouette.
    const diagonal = Math.hypot(BODY.width, BODY.depth) / BODY.width;

    camera.position.set(0, 0, (Math.max(forHeight, forWidth * diagonal) / FILL));
    camera.lookAt(0, 0, 0);
    camera.near = 0.1;
    camera.far = camera.position.z * 4;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}
