/**
 * A/B buttons and the START/SELECT pills, plus the small non-interactive
 * details: speaker grille, power LED, volume wheel, power switch, IR window.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  BODY,
  FACE_BUTTONS,
  IR_PORT,
  PALETTE,
  PILL_BUTTONS,
  POWER_LED,
  POWER_SWITCH,
  SPEAKER,
  VOLUME_WHEEL,
} from '../spec';
import { flatCapGeometry } from '../geometry';
import { drawText, GLYPH_HEIGHT, textWidth } from '../font';
import type { GbcInput } from '../input';
import { Pressable } from './Pressable';

interface HoverProps {
  onHoverChange?: (hovered: boolean) => void;
}

/**
 * Transparent canvas carrying a single pixel-font glyph, used as the
 * silkscreened letter on an A/B cap. Same font as the screen and the
 * wordmark so the typography stays consistent across the model.
 *
 * The canvas is cropped tight to the glyph and its aspect returned, so the
 * caller can size the quad without the letter squashing or floating in
 * empty padding.
 */
function useLetterTexture(letter: string): {
  texture: THREE.Texture;
  aspect: number;
} {
  const { texture, aspect } = useMemo(() => {
    const scale = 16;
    const pad = scale; // one pixel of the font grid on every side
    const glyphWidth = textWidth(letter, { scale });
    const glyphHeight = GLYPH_HEIGHT * scale;
    const canvas = document.createElement('canvas');
    canvas.width = glyphWidth + pad * 2;
    canvas.height = glyphHeight + pad * 2;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawText(ctx, letter, pad, pad, PALETTE.buttonLabel, { scale });
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { texture: tex, aspect: canvas.width / canvas.height };
  }, [letter]);

  useEffect(() => () => texture.dispose(), [texture]);
  return { texture, aspect };
}

/** A or B cap: flat top with a rounded shoulder, seated in a recessed well. */
export function RoundButton({
  input,
  button,
  x,
  y,
  z,
  onHoverChange,
}: HoverProps & {
  input: GbcInput;
  button: 'a' | 'b';
  x: number;
  y: number;
  z: number;
}) {
  const { radius, height, edgeRadius } = FACE_BUTTONS;
  const { texture: letter, aspect } = useLetterTexture(button.toUpperCase());

  const cap = useMemo(
    () => flatCapGeometry(radius, height, edgeRadius),
    [radius, height, edgeRadius],
  );
  useEffect(() => () => cap.dispose(), [cap]);

  // Letter height fills most of the flat top; width follows the glyph aspect
  // so the pixels stay square.
  const letterHeight = (radius - edgeRadius) * 1.7;
  const letterWidth = letterHeight * aspect;

  return (
    <group position={[x, y, 0]}>
      {/* Dark recess behind the shell cutout. */}
      <mesh position={[0, 0, z - 0.5]}>
        <circleGeometry args={[radius * 1.2, 32]} />
        <meshStandardMaterial color="#160f18" roughness={0.95} />
      </mesh>

      <Pressable
        input={input}
        button={button}
        position={[0, 0, z + height / 2]}
        travel={0.085}
        hitArea={[radius * 2.6, radius * 2.6]}
        onHoverChange={onHoverChange}
      >
        <mesh geometry={cap} castShadow>
          <meshStandardMaterial
            color={PALETTE.button}
            roughness={0.5}
            metalness={0.03}
          />
        </mesh>
        {/* Printed letter, just proud of the flat top so it never z-fights. */}
        <mesh position={[0, 0, height / 2 + 0.012]}>
          <planeGeometry args={[letterWidth, letterHeight]} />
          <meshStandardMaterial
            map={letter}
            transparent
            roughness={0.65}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      </Pressable>
    </group>
  );
}

/** Angled START / SELECT pill. */
export function PillButton({
  input,
  button,
  x,
  y,
  z,
  onHoverChange,
}: HoverProps & {
  input: GbcInput;
  button: 'start' | 'select';
  x: number;
  y: number;
  z: number;
}) {
  const { width, depth, height, rotation } = PILL_BUTTONS;
  const geometry = useMemo(() => {
    // Capsule lying on its side reads as the moulded pill shape.
    const geo = new THREE.CapsuleGeometry(depth / 2, width - depth, 8, 16);
    geo.rotateZ(Math.PI / 2);
    geo.scale(1, 1, height / depth);
    return geo;
  }, [width, depth, height]);

  return (
    <Pressable
      input={input}
      button={button}
      position={[x, y, z]}
      rotation={[0, 0, rotation]}
      travel={0.06}
      hitArea={[width * 1.3, depth * 2.4]}
      onHoverChange={onHoverChange}
    >
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color={PALETTE.pill} roughness={0.55} />
      </mesh>
    </Pressable>
  );
}

/** Circular cluster of speaker holes. */
export function Speaker({ z }: { z: number }) {
  const holes = useMemo(() => {
    const result: [number, number][] = [];
    for (const ring of SPEAKER.rings) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        result.push([
          Math.cos(angle) * ring.radius,
          Math.sin(angle) * ring.radius,
        ]);
      }
    }
    return result;
  }, []);

  return (
    <group position={[SPEAKER.x, SPEAKER.y, z]}>
      {holes.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0]}>
          <circleGeometry args={[SPEAKER.holeRadius, 12]} />
          <meshStandardMaterial color="#2a1016" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Power LED; glows once the console is "on". */
export function PowerLed({ z, on }: { z: number; on: boolean }) {
  return (
    <group position={[POWER_LED.x, POWER_LED.y, z]}>
      <mesh>
        <circleGeometry args={[POWER_LED.radius * 1.5, 24]} />
        <meshStandardMaterial color="#2a1016" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[POWER_LED.radius, 24]} />
        <meshStandardMaterial
          color={on ? PALETTE.led : PALETTE.ledOff}
          emissive={on ? PALETTE.led : '#000000'}
          emissiveIntensity={on ? 2.4 : 0}
          roughness={0.3}
        />
      </mesh>
      {on ? <pointLight color={PALETTE.led} intensity={0.35} distance={2.2} /> : null}
    </group>
  );
}

/** Ribbed volume wheel on the left edge. */
export function VolumeWheel() {
  return (
    <group
      position={[-BODY.width / 2 + 0.1, VOLUME_WHEEL.y, BODY.seam * 0.2]}
      rotation={[0, 0, Math.PI / 2]}
    >
      <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
        <cylinderGeometry
          args={[VOLUME_WHEEL.radius, VOLUME_WHEEL.radius, VOLUME_WHEEL.thickness, 28]}
        />
        <meshStandardMaterial color={PALETTE.button} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Power slider on the top edge. */
export function PowerSwitch({ on }: { on: boolean }) {
  return (
    <group
      position={[
        POWER_SWITCH.x,
        BODY.height / 2 + POWER_SWITCH.height * 0.1,
        BODY.seam * 0.3,
      ]}
    >
      <mesh position={[0, 0, 0]}>
        <boxGeometry
          args={[POWER_SWITCH.width, POWER_SWITCH.height * 0.5, POWER_SWITCH.depth]}
        />
        <meshStandardMaterial color="#1b1420" roughness={0.9} />
      </mesh>
      {/* The slider itself sits left when off, right when on. */}
      <mesh
        position={[on ? POWER_SWITCH.width * 0.22 : -POWER_SWITCH.width * 0.22, 0.04, 0]}
        castShadow
      >
        <boxGeometry
          args={[
            POWER_SWITCH.width * 0.46,
            POWER_SWITCH.height * 0.7,
            POWER_SWITCH.depth * 0.82,
          ]}
        />
        <meshStandardMaterial color={PALETTE.pill} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Infrared window on the top edge. */
export function IrPort() {
  return (
    <mesh position={[IR_PORT.x, BODY.height / 2 - 0.02, BODY.seam * 0.35]}>
      <boxGeometry args={[IR_PORT.width, IR_PORT.height * 0.3, 0.9]} />
      <meshStandardMaterial
        color="#2a0d12"
        roughness={0.25}
        metalness={0.1}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}
