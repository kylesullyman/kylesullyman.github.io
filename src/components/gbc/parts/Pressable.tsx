/**
 * Pressable button primitive.
 *
 * Owns the interaction plumbing shared by the D-pad, A/B and START/SELECT:
 *   - pointer down/up/leave with pointer capture, so dragging off still releases
 *   - travel animation that also reacts to keyboard presses (state lives in
 *     GbcInput, not in this component, so both sources animate identically)
 *   - cursor feedback and an invisible oversized hit area for small buttons
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import type { GbcButton, GbcInput } from '../input';

export interface PressableProps {
  input: GbcInput;
  button: GbcButton;
  /** Local position of the button on the face. */
  position: [number, number, number];
  rotation?: [number, number, number];
  /** How far the cap sinks when pressed, in scene units. */
  travel?: number;
  /** Accessible label for the hit region. */
  label?: string;
  children: React.ReactNode;
  /** Optional larger invisible hit area, [width, height] in local units. */
  hitArea?: [number, number];
  /** Called when hover state changes, for cursor handling. */
  onHoverChange?: (hovered: boolean) => void;
}

export function Pressable({
  input,
  button,
  position,
  rotation = [0, 0, 0],
  travel = 0.09,
  children,
  hitArea,
  onHoverChange,
}: PressableProps) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const offset = useRef(0);

  useEffect(() => {
    onHoverChange?.(hovered);
  }, [hovered, onHoverChange]);

  const handleDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      // Capture so a drag that leaves the mesh still delivers pointerup.
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      input.press(button, 'pointer');
    },
    [input, button],
  );

  const handleUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
      input.release(button, 'pointer');
    },
    [input, button],
  );

  const handleOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
  }, []);

  const handleOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHovered(false);
      // Pointer left while held: treat as release so nothing sticks down.
      input.release(button, 'pointer');
    },
    [input, button],
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    const down = input.snapshot.isDown(button);
    const target = down ? -travel : hovered ? travel * 0.18 : 0;
    // Exponential smoothing, frame-rate independent.
    const k = 1 - Math.exp(-delta * (down ? 45 : 22));
    offset.current += (target - offset.current) * k;
    group.current.position.z = position[2] + offset.current;
  });

  return (
    <group ref={group} position={position} rotation={rotation}>
      {hitArea ? (
        <mesh
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
          position={[0, 0, 0.16]}
        >
          <planeGeometry args={hitArea} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      <group
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        {children}
      </group>
    </group>
  );
}
