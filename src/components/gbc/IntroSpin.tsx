/**
 * Intro animation: the console spins around a tilted axis, fast at first and
 * easing out hard, then settles facing the camera.
 *
 * The rotation is expressed as a single angle about one tilted axis, driven
 * from TOTAL_ANGLE down to exactly 0. Because 0 is the identity rotation, the
 * model is guaranteed to land square to the camera no matter where the easing
 * lands — no drift, no modular arithmetic on Euler angles.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Tilted spin axis: mostly yaw, leaned back and to the side. */
const AXIS = new THREE.Vector3(0.26, 1, 0.14).normalize();

/** Total rotation travelled during the intro. */
const TURNS = 2.75;
const TOTAL_ANGLE = Math.PI * 2 * TURNS;

export const INTRO_DURATION = 2.6;

/** Extra settle time after the spin, for the overshoot wobble to decay. */
const SETTLE = 0.55;

/** Fraction of the duration spent accelerating out of rest. */
const ACCEL = 0.08;
/** Ease-out exponent; higher decelerates harder and lands sooner. */
const DECAY = 3.5;
/**
 * Fraction of the travel completed by the end of the ease-in.
 *
 * Not a free parameter: it is the value that makes the ease-in's exit speed
 * equal the ease-out's entry speed, so the spin has no acceleration snap at
 * the handoff. Solving 2*BASE/ACCEL = (1-BASE)*DECAY/(1-ACCEL) gives
 * BASE = k/(2+k) with k = DECAY*ACCEL/(1-ACCEL).
 */
const BASE = (() => {
  const k = (DECAY * ACCEL) / (1 - ACCEL);
  return k / (2 + k);
})();

/**
 * Fast-to-slow progress curve on [0,1], C1-continuous throughout:
 * a short quadratic ramp up to peak speed, then a long polynomial ease-out.
 * f(0) = 0 and f(1) = 1 exactly, so the spin lands on the identity rotation.
 */
function introEase(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  if (clamped < ACCEL) {
    const u = clamped / ACCEL;
    return BASE * u * u;
  }
  const u = (clamped - ACCEL) / (1 - ACCEL);
  return BASE + (1 - BASE) * (1 - Math.pow(1 - u, DECAY));
}

export interface IntroProps {
  /** Skip the animation and sit at rest (reduced motion). */
  disabled?: boolean;
  /** Called once when the intro finishes. */
  onComplete?: () => void;
  /** Resting tilt of the console, radians. */
  restTilt?: [number, number, number];
  children: React.ReactNode;
}

export function IntroSpin({
  disabled = false,
  onComplete,
  restTilt = [0, 0, 0],
  children,
}: IntroProps) {
  const group = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const notified = useRef(false);

  // Scratch objects, reused each frame.
  const spin = useRef(new THREE.Quaternion());
  const rest = useRef(new THREE.Quaternion());

  useEffect(() => {
    rest.current.setFromEuler(new THREE.Euler(...restTilt));
  }, [restTilt]);

  useEffect(() => {
    if (!disabled) return;
    done.current = true;
    if (!notified.current) {
      notified.current = true;
      onComplete?.();
    }
  }, [disabled, onComplete]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;

    if (disabled || done.current) {
      node.quaternion.copy(rest.current);
      node.position.set(0, 0, 0);
      node.scale.setScalar(1);
      return;
    }

    elapsed.current += Math.min(delta, 1 / 20);
    const t = Math.min(elapsed.current / INTRO_DURATION, 1);
    const eased = introEase(t);

    // Angle runs to exactly 0 -> identity -> facing camera.
    let angle = TOTAL_ANGLE * (1 - eased);

    // Overshoot wobble once the spin has effectively stopped.
    if (t >= 1) {
      const over = elapsed.current - INTRO_DURATION;
      const decay = Math.exp(-over * 7);
      angle = Math.sin(over * 16) * 0.06 * decay;
      if (over > SETTLE) {
        angle = 0;
        done.current = true;
        if (!notified.current) {
          notified.current = true;
          onComplete?.();
        }
      }
    }

    spin.current.setFromAxisAngle(AXIS, angle);
    node.quaternion.copy(spin.current).multiply(rest.current);

    // Drift in from slightly far and small while spinning.
    const approach = 1 - eased;
    node.position.z = -14 * approach;
    node.position.y = 1.1 * approach;
    node.scale.setScalar(1 - 0.1 * approach);
  });

  return <group ref={group}>{children}</group>;
}
