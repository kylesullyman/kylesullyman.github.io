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
export const PITCH_LIMIT = 0.65;

export interface DragRotateProps {
  /** Drag is ignored while false (e.g. during the intro). */
  enabled?: boolean;
  /** Exposes the rotating group so the camera can frame its real bounds. */
  groupRef?: React.MutableRefObject<THREE.Group | null>;
  /** Fired when a drag commits; use it to cancel in-flight button presses. */
  onDragStart?: () => void;
  /** Reports drag state so the cursor can change. */
  onDragChange?: (dragging: boolean) => void;
  /**
   * Element the gesture is read from.
   *
   * Desktop leaves this null and drags the canvas directly. Touch passes the
   * hold-to-spin handle, because a free drag on the canvas competes with page
   * scrolling: the browser cannot know whether a finger on the console means
   * "spin this" or "scroll the page", and whichever we choose is wrong half
   * the time. Routing touch rotation through a dedicated control removes the
   * ambiguity and leaves vertical scroll working everywhere else.
   *
   * Release behaviour is identical either way: the flick carries and the
   * console drifts home, so the handle feels like dragging the model rather
   * than like a switch that cuts the motion dead.
   */
  gestureElement?: HTMLElement | null;
  children: React.ReactNode;
}

export function DragRotate({
  enabled = true,
  groupRef,
  onDragStart,
  onDragChange,
  gestureElement = null,
  children,
}: DragRotateProps) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);
  /**
   * Lets the frame loop end a gesture whose pointer capture vanished without
   * a matching event. `lostpointercapture` is not reliably delivered after a
   * programmatic `releasePointerCapture`, and when it goes missing the drag
   * stays committed: rotation freezes at the last pose and never springs
   * home. Holding the teardown here keeps that recovery in one place.
   */
  const teardown = useRef<{ stop: () => void; source: HTMLElement } | null>(null);

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
    // When a handle is supplied it owns the gesture outright and the canvas
    // stops listening, so a touch-drag on the console never rotates.
    const source: HTMLElement = gestureElement ?? gl.domElement;
    /** The handle exists only to rotate, so there is nothing to disambiguate. */
    const immediate = gestureElement !== null;
    const state = drag.current;

    const stop = () => {
      const pointerId = state.pointerId;
      if (state.committed) onDragChange?.(false);
      state.tracking = false;
      state.committed = false;
      state.pointerId = -1;
      if (pointerId !== -1 && source.hasPointerCapture(pointerId)) {
        source.releasePointerCapture(pointerId);
      }
    };

    const commit = (event: PointerEvent) => {
      state.committed = true;
      source.setPointerCapture?.(event.pointerId);
      onDragStart?.();
      onDragChange?.(true);
    };

    const onDown = (event: PointerEvent) => {
      if (!enabled || state.tracking || event.button !== 0) return;
      // Do not briefly enable canvas dragging while the mobile handle mounts.
      if (!immediate && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
      state.tracking = true;
      state.committed = false;
      state.pointerId = event.pointerId;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (immediate) {
        // Stop the browser treating the hold as a scroll or a text selection.
        event.preventDefault();
        commit(event);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (!state.tracking || event.pointerId !== state.pointerId) return;

      if (!state.committed) {
        const travelled = Math.hypot(
          event.clientX - state.startX,
          event.clientY - state.startY,
        );
        if (travelled < DRAG_THRESHOLD) return;
        // Past the threshold: this is a drag, not a press. Capture here
        // rather than on down, so a plain press still gets its pointerup
        // delivered to the button's own handler.
        commit(event);
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
      stop();
    };

    // The handle must claim the touch before the browser starts scrolling,
    // which requires a non-passive listener.
    const downOptions = immediate ? { passive: false } : undefined;
    source.addEventListener('pointerdown', onDown, downOptions);
    source.addEventListener('pointermove', onMove);
    source.addEventListener('pointerup', onUp);
    source.addEventListener('pointercancel', onUp);
    source.addEventListener('lostpointercapture', onUp);
    window.addEventListener('blur', stop);
    teardown.current = { stop, source };

    return () => {
      source.removeEventListener('pointerdown', onDown);
      source.removeEventListener('pointermove', onMove);
      source.removeEventListener('pointerup', onUp);
      source.removeEventListener('pointercancel', onUp);
      source.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('blur', stop);
      teardown.current = null;
      stop();
    };
  }, [gl, enabled, onDragStart, onDragChange, gestureElement]);

  useFrame((_, rawDelta) => {
    const node = group.current;
    if (!node) return;

    const state = drag.current;
    const delta = Math.min(rawDelta, 1 / 20);

    // A committed gesture holds pointer capture. If it does not, the capture
    // was dropped without the event that normally ends the drag, so end it
    // here -- otherwise the console hangs at its last pose indefinitely.
    if (state.committed && teardown.current) {
      const { stop, source } = teardown.current;
      if (state.pointerId !== -1 && !source.hasPointerCapture(state.pointerId)) {
        stop();
      }
    }

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

  return (
    <group
      ref={(node) => {
        group.current = node;
        if (groupRef) groupRef.current = node;
      }}
    >
      {children}
    </group>
  );
}
