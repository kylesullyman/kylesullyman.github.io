/**
 * Keeps the whole console in frame, at every orientation it can reach.
 *
 * The distance is tracked per frame rather than fixed at mount. Framing the
 * worst reachable pose statically would be simpler, but the limiting pose is
 * a yawed, pitched corner swinging toward the camera -- roughly 1.35x the
 * distance the resting pose needs. Paying that permanently shrinks the
 * console by about a quarter in the view people actually look at, to buy
 * clearance for an orientation they pass through briefly. So the camera sits
 * close at rest and eases back only while the console is turned.
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Fraction of the frame the console fills at the current pose.
 *
 * Verified by sweeping a held drag through the full yaw range at both pitch
 * limits: 0.94 still caught the left edge on the narrowest aspect ratio
 * (Pixel 7, 0.58) at the pitch limit, so this keeps a little more slack.
 */
const FILL = 0.9;

/** How fast the distance chases its target. Higher is tighter. */
const FOLLOW = 6;

/**
 * Half-extents of everything that actually renders, in the rotating group's
 * local space.
 *
 * Deliberately measured rather than read from `BODY`: the spec describes the
 * plastic shell, but the buttons, cartridge lip and screen bezel all sit
 * proud of it (8.2 x 13.75 x 2.92 against a nominal 7.8 x 13.35 x 2.74), and
 * framing the shell alone lets those extras cross the canvas edge as the
 * console turns.
 */
function measureBounds(group: THREE.Object3D) {
  const saved = group.rotation.clone();
  group.rotation.set(0, 0, 0, 'YXZ');
  group.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const toLocal = group.matrixWorld.clone().invert();
  const scratch = new THREE.Box3();

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    scratch.copy(mesh.geometry.boundingBox as THREE.Box3);
    scratch.applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal);
    box.union(scratch);
  });

  group.rotation.copy(saved);
  group.updateMatrixWorld(true);
  return box.isEmpty() ? null : box;
}

export function FitCamera({ target }: { target: React.RefObject<THREE.Object3D | null> }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const bounds = useRef<{ centre: THREE.Vector3; half: THREE.Vector3 } | null>(null);
  const distance = useRef(0);

  // Scratch objects, reused so the per-frame fit allocates nothing.
  const corner = useRef(new THREE.Vector3()).current;
  const matrix = useRef(new THREE.Matrix4()).current;

  useFrame((_, rawDelta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const group = target.current;
    if (!group) return;

    // Geometry is not present on the first frame, so measure lazily and
    // cache: the bounds are in the group's own space and never change.
    if (!bounds.current) {
      const box = measureBounds(group);
      if (!box) return;
      bounds.current = {
        centre: box.getCenter(new THREE.Vector3()),
        half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
      };
    }
    const { centre, half } = bounds.current;

    const aspect = size.width / Math.max(size.height, 1);
    const vFov = (camera.fov * Math.PI) / 180;
    const tanV = Math.tan(vFov / 2);
    const tanH = Math.tan(2 * Math.atan(tanV * aspect) / 2);

    // Fit the pose on screen right now. Rotating the box moves its corners
    // both sideways (needing a wider frame) and toward the camera
    // (magnifying them), so both effects have to come from the same matrix.
    matrix.makeRotationFromEuler(group.rotation);
    let required = 0;
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        centre.x + (i & 1 ? half.x : -half.x),
        centre.y + (i & 2 ? half.y : -half.y),
        centre.z + (i & 4 ? half.z : -half.z),
      ).applyMatrix4(matrix);

      // Distance at which this corner lands exactly on each frame edge.
      required = Math.max(
        required,
        corner.z + Math.abs(corner.x) / tanH,
        corner.z + Math.abs(corner.y) / tanV,
      );
    }
    const targetDistance = required / FILL;

    // Snap on the first frame so the console does not visibly zoom in on
    // load, then ease afterwards so rotating does not jolt the camera.
    if (distance.current === 0) {
      distance.current = targetDistance;
    } else {
      const delta = Math.min(rawDelta, 1 / 20);
      distance.current += (targetDistance - distance.current) * (1 - Math.exp(-delta * FOLLOW));
    }

    camera.position.set(0, 0, distance.current);
    camera.lookAt(0, 0, 0);
    camera.near = 0.1;
    camera.far = distance.current * 4;
    camera.updateProjectionMatrix();
  });

  return null;
}
