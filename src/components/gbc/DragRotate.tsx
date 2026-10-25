/**
 * Click-and-drag rotation with smoothing and inertia.
 *
 * Drag vs. press: a press and a drag both begin with the same pointerdown, so
 * rather than racing R3F's raycast we track every pointerdown and only
 * *commit* to a drag once the pointer has travelled past a small threshold.
 * Below it the gesture stays a button press; past it we cancel whatever button
 * the press started and take over. That keeps taps on the D-pad working while
 * a drag anywhere -- including one that begins on a button -- spins the model.
 *
 * Smoothing is two-stage:
 *   target  moved directly by the pointer, then carried by inertia on release
 *   current chases target with frame-rate-independent exponential smoothing
 *
 * A weak spring pulls target back to rest so the console always drifts home
 * instead of being left face-down.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Radians of rotation per pixel dragged. */
const SENSITIVITY = 0.0075;
/** Pixels of travel before a press becomes a drag. */
const DRAG_THRESHOLD = 5;
/** How fast `current` chases `target`. Higher is tighter. */
const FOLLOW = 11;
/** Per-second survival of flick velocity after release. */
const INERTIA_DECAY = 0.12;
/** Strength of the pull back to rest once the pointer is up. */
const RETURN = 1.1;
/** Below this, inertia is finished. */
const VELOCITY_EPSILON = 0.0005;
/** Pitch limit, radians -- keeps the console from tumbling end over end. */
const PITCH_LIMIT = 0.65;

export interface DragRotateProps {
  /** Drag is ignored while false (e.g. during the intro). */
  enabled?: boolean;
  /** Fired when a drag commits; use it to cancel in-flight button presses. */
  onDragStart?: () => void;
  /** Reports drag state so the cursor can change. */
  onDragChange?: (dragging: boolean) => void;
  children: React.ReactNode;
}

export function DragRotate({
  enabled = true,
  onDragStart,
  onDragChange,
  children,
}: DragRotateProps) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);

  const drag = useRef({
    tracking: false,
    committed: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    targetYaw: 0,
    targetPitch: 0,
    yaw: 0,
    pitch: 0,
    velYaw: 0,
    velPitch: 0,
  });

  useEffect(() => {
    const canvas = gl.domElement;
    const state = drag.current;

    const stop = () => {
      if (state.committed) onDragChange?.(false);
      state.tracking = false;
      state.committed = false;
      state.pointerId = -1;
    };

    const onDown = (event: PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      state.tracking = true;
      state.committed = false;
      state.pointerId = event.pointerId;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };

    const onMove = (event: PointerEvent) => {
      if (!state.tracking || event.pointerId !== state.pointerId) return;

      if (!state.committed) {
        const travelled = Math.hypot(
          event.clientX - state.startX,
          event.clientY - state.startY,
        );
        if (travelled < DRAG_THRESHOLD) return;
        // Past the threshold: this is a drag, not a press.
        state.committed = true;
        // Capture here rather than on down, so a plain press still gets its
        // pointerup delivered to the button's own handler.
        canvas.setPointerCapture?.(event.pointerId);
        onDragStart?.();
        onDragChange?.(true);
      }

      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;

      state.targetYaw += dx * SENSITIVITY;
      state.targetPitch = THREE.MathUtils.clamp(
        state.targetPitch + dy * SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );

      // Remember the last motion as the flick velocity.
      state.velYaw = dx * SENSITIVITY;
      state.velPitch = dy * SENSITIVITY;
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== state.pointerId) return;
      canvas.releasePointerCapture?.(event.pointerId);
      stop();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', stop);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', stop);
      stop();
    };
  }, [gl, enabled, onDragStart, onDragChange]);

  useFrame((_, rawDelta) => {
    const node = group.current;
    if (!node) return;

    const state = drag.current;
    const delta = Math.min(rawDelta, 1 / 20);

    if (!state.committed) {
      // Carry the flick, decaying toward zero.
      if (Math.abs(state.velYaw) > VELOCITY_EPSILON) {
        state.targetYaw += state.velYaw;
        state.velYaw *= Math.pow(INERTIA_DECAY, delta);
      } else {
        state.velYaw = 0;
      }
      if (Math.abs(state.velPitch) > VELOCITY_EPSILON) {
        state.targetPitch = THREE.MathUtils.clamp(
          state.targetPitch + state.velPitch,
          -PITCH_LIMIT,
          PITCH_LIMIT,
        );
        state.velPitch *= Math.pow(INERTIA_DECAY, delta);
      } else {
        state.velPitch = 0;
      }

      // Weak spring home, so it never settles facing away.
      const pull = 1 - Math.exp(-delta * RETURN);
      state.targetYaw += (0 - state.targetYaw) * pull;
      state.targetPitch += (0 - state.targetPitch) * pull;
    }

    // Smoothed follow -- this is what makes the motion feel weighted.
    const follow = 1 - Math.exp(-delta * FOLLOW);
    state.yaw += (state.targetYaw - state.yaw) * follow;
    state.pitch += (state.targetPitch - state.pitch) * follow;

    // YXZ keeps yaw world-vertical, so dragging sideways never rolls it.
    node.rotation.order = 'YXZ';
    node.rotation.y = state.yaw;
    node.rotation.x = state.pitch;
  });

  return <group ref={group}>{children}</group>;
}
