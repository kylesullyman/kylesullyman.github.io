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
 *
 * The eased value is floored at the current pose's exact requirement every
 * frame, so the camera eases *inward* smoothly but moves out the instant the
 * pose demands it. That makes the no-clipping guarantee independent of how
 * fast the console is turned.
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { PITCH_LIMIT } from './DragRotate';

/**
 * Fraction of the frame the console fills at the current pose.
 *
 * The fit below solves the pose exactly, so 1.0 would put the limiting
 * corner precisely on the frame edge. The margin is there for the easing:
 * during a fast drag the distance lags the pose it is chasing, and a value
 * above ~0.96 lets the trailing edge touch mid-sweep. Verified by sweeping a
 * held drag through the full yaw range at both pitch limits on the narrowest
 * aspect ratio (Pixel 7, 0.58).
 */
const FILL = 0.95;

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

/** Samples per axis when sweeping every reachable pose for the fixed fit. */
const SWEEP_YAW_STEPS = 72;
const SWEEP_PITCH_STEPS = 9;

export function FitCamera({
  target,
  steady = false,
  dragging = false,
}: {
  target: React.RefObject<THREE.Object3D | null>;
  /**
   * While a drag is live, hold one distance that frames every reachable pose
   * instead of tracking the current one. Touch uses this: rotation there
   * comes from a small handle, and the camera breathing in and out under the
   * thumb reads as the page zooming rather than the console turning.
   *
   * Only while dragging -- holding the worst-pose distance permanently costs
   * about a third of the console's on-screen size in the resting view people
   * actually look at.
   */
  steady?: boolean;
  /** A rotation gesture is committed right now. */
  dragging?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const bounds = useRef<{ centre: THREE.Vector3; half: THREE.Vector3 } | null>(null);
  const distance = useRef(0);
  /** Worst-pose distance, cached against the aspect it was swept for. */
  const sweep = useRef({ aspect: 0, distance: 0 });

  // Scratch objects, reused so the per-frame fit allocates nothing.
  const corner = useRef(new THREE.Vector3()).current;
  const matrix = useRef(new THREE.Matrix4()).current;
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ')).current;

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

    // Distance that fits a pose on screen. Rotating the box moves its corners
    // both sideways (needing a wider frame) and toward the camera
    // (magnifying them), so both effects have to come from the same matrix.
    const fit = (rotation: THREE.Euler) => {
      matrix.makeRotationFromEuler(rotation);
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
      return required;
    };

    // The exact requirement for the pose on screen right now. This is a hard
    // floor on the distance: the eased value is clamped to it below, so a
    // drag that outruns the easing can never crop the console.
    const live = fit(group.rotation) / FILL;

    let targetDistance = live;
    if (steady && dragging) {
      // Yaw is unbounded, so sweep the full turn at every pitch the drag
      // allows. Only redone when the aspect changes (rotation, URL bar).
      if (sweep.current.aspect !== aspect) {
        let worst = 0;
        for (let p = 0; p < SWEEP_PITCH_STEPS; p += 1) {
          euler.x = -PITCH_LIMIT + (2 * PITCH_LIMIT * p) / (SWEEP_PITCH_STEPS - 1);
          for (let y = 0; y < SWEEP_YAW_STEPS; y += 1) {
            euler.y = (2 * Math.PI * y) / SWEEP_YAW_STEPS;
            worst = Math.max(worst, fit(euler));
          }
        }
        sweep.current = { aspect, distance: worst };
      }
      targetDistance = Math.max(live, sweep.current.distance / FILL);
    }

    // Snap on the first frame so the console does not visibly zoom in on
    // load, then ease afterwards so rotating does not jolt the camera.
    if (distance.current === 0) {
      distance.current = targetDistance;
    } else {
      const delta = Math.min(rawDelta, 1 / 20);
      distance.current += (targetDistance - distance.current) * (1 - Math.exp(-delta * FOLLOW));
    }
    // Easing may only ever pull the camera *in*. Pulling out happens
    // immediately, because lagging there means visible clipping.
    distance.current = Math.max(distance.current, live);

    camera.position.set(0, 0, distance.current);
    camera.lookAt(0, 0, 0);
    camera.near = 0.1;
    camera.far = distance.current * 4;
    camera.updateProjectionMatrix();
  });

  return null;
}
