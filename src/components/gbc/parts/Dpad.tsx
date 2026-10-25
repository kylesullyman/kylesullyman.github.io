/**
 * D-pad: a single cross-shaped cap with four independent hit zones.
 *
 * The real pad rocks around its centre, so rather than four separate meshes
 * this tilts one cross mesh toward whichever direction is held, and overlays
 * four invisible quads to pick up presses.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import { DPAD, PALETTE } from '../spec';
import { dpadShape, extrudeCentered } from '../geometry';
import type { GbcButton, GbcInput } from '../input';

const DIRECTIONS: { button: GbcButton; offset: [number, number] }[] = [
  { button: 'up', offset: [0, 1] },
  { button: 'down', offset: [0, -1] },
  { button: 'left', offset: [-1, 0] },
  { button: 'right', offset: [1, 0] },
];

/** Max rock angle in radians. */
const TILT = 0.17;

export interface DpadProps {
  input: GbcInput;
  z: number;
  onHoverChange?: (hovered: boolean) => void;
}

export function Dpad({ input, z, onHoverChange }: DpadProps) {
  const group = useRef<THREE.Group>(null);
  const tilt = useRef({ x: 0, y: 0, z: 0 });

  const geometry = useMemo(
    () => extrudeCentered(dpadShape(DPAD.arm, DPAD.thickness), DPAD.height, 0.06),
    [],
  );

  // Faint ridges on the arm tips, like the moulded grip marks.
  const ridgeGeometry = useMemo(() => new THREE.BoxGeometry(DPAD.thickness * 0.42, 0.06, 0.04), []);

  const press = (button: GbcButton) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    input.press(button, 'pointer');
  };

  const release = (button: GbcButton) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    input.release(button, 'pointer');
  };

  useFrame((_, delta) => {
    if (!group.current) return;
    const snap = input.snapshot;
    // Opposite directions cancel, matching a real rocking pad.
    const x = (snap.isDown('right') ? 1 : 0) - (snap.isDown('left') ? 1 : 0);
    const y = (snap.isDown('up') ? 1 : 0) - (snap.isDown('down') ? 1 : 0);
    const any = x !== 0 || y !== 0;

    const k = 1 - Math.exp(-delta * (any ? 40 : 20));
    // Rotating about x tilts the top/bottom arms; about y the left/right.
    tilt.current.x += (-y * TILT - tilt.current.x) * k;
    tilt.current.y += (x * TILT - tilt.current.y) * k;
    tilt.current.z += ((any ? -0.045 : 0) - tilt.current.z) * k;

    group.current.rotation.x = tilt.current.x;
    group.current.rotation.y = tilt.current.y;
    group.current.position.z = z + tilt.current.z;
  });

  return (
    <group position={[DPAD.x, DPAD.y, z]}>
      {/* Dark recess behind the shell cutout the pad sits in. */}
      <mesh position={[0, 0, -0.5]}>
        <circleGeometry args={[DPAD.arm * 1.1, 40]} />
        <meshStandardMaterial color="#160f18" roughness={0.95} />
      </mesh>

      <group ref={group}>
        <mesh geometry={geometry} castShadow>
          <meshStandardMaterial
            color={PALETTE.button}
            roughness={0.62}
            metalness={0.02}
          />
        </mesh>
        {DIRECTIONS.map(({ button, offset }) => (
          <mesh
            key={`ridge-${button}`}
            geometry={ridgeGeometry}
            position={[
              offset[0] * DPAD.arm * 0.6,
              offset[1] * DPAD.arm * 0.6,
              DPAD.height / 2 + 0.02,
            ]}
            rotation={[0, 0, offset[0] !== 0 ? Math.PI / 2 : 0]}
          >
            <meshStandardMaterial color={PALETTE.buttonRim} roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Hit zones: four quads over the arms, slightly oversized for touch. */}
      {DIRECTIONS.map(({ button, offset }) => (
        <mesh
          key={button}
          position={[
            offset[0] * DPAD.arm * 0.62,
            offset[1] * DPAD.arm * 0.62,
            DPAD.height,
          ]}
          onPointerDown={press(button)}
          onPointerUp={release(button)}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHoverChange?.(true);
          }}
          onPointerOut={(event) => {
            event.stopPropagation();
            onHoverChange?.(false);
            input.release(button, 'pointer');
          }}
        >
          <planeGeometry
            args={
              offset[0] !== 0
                ? [DPAD.arm * 0.95, DPAD.thickness * 1.15]
                : [DPAD.thickness * 1.15, DPAD.arm * 0.95]
            }
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
