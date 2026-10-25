/**
 * Top-level 3D Game Boy Color: canvas, lighting, intro animation, and the
 * keyboard/window wiring.
 *
 * Events for the host page (all on `window`):
 *   gbc:button  { button, phase, source, at }
 *   gbc:action  { type, ... }   e.g. { type: 'navigate', href: '/projects' }
 *   gbc:ready   (intro finished)
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

import { BODY, PALETTE } from './spec';
import { GBC_EVENTS, KEY_MAP, createInput, type GbcButtonEvent } from './input';
import { useScreen } from './screen/useScreen';
import { IntroSpin } from './IntroSpin';
import { FitCamera } from './FitCamera';
import { DragRotate } from './DragRotate';
import { Console } from './Console';

/** Resting pose: a touch of yaw and pitch so it reads as a 3D object. */
const REST_TILT: [number, number, number] = [-0.06, -0.14, 0.015];

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Everything inside the Canvas (needs the R3F context). */
function Scene({ onReady }: { onReady: () => void }) {
  const input = useMemo(() => createInput(), []);
  const [introDone, setIntroDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduced = useMemo(prefersReducedMotion, []);

  // A drag that began on a button must not also fire that button. Once the
  // drag commits, drop every held button so nothing sticks or registers.
  const handleDragStart = useCallback(() => {
    input.releaseAll('pointer');
  }, [input]);

  // Screen stays dark until the console has landed.
  const texture = useScreen({ input, paused: !introDone });

  // Keyboard -> input bus.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const button = KEY_MAP[event.code];
      if (!button) return;
      // Don't hijack keys while the user is typing in a field.
      const target = event.target as HTMLElement | null;
      if (target?.matches?.('input, textarea, select, [contenteditable]')) return;
      event.preventDefault();
      input.press(button, 'keyboard');
    };
    const up = (event: KeyboardEvent) => {
      const button = KEY_MAP[event.code];
      if (!button) return;
      input.release(button, 'keyboard');
    };
    // Dropping held buttons on blur avoids keys stuck down after tab-away.
    const blur = () => input.releaseAll('keyboard');

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      input.releaseAll('keyboard');
    };
  }, [input]);

  const handleComplete = useCallback(() => {
    setIntroDone(true);
    onReady();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(GBC_EVENTS.ready));
    }
  }, [onReady]);

  return (
    <>
      {/* Key light from the upper left, fill from the right, rim from behind
          so the translucent shell glows at its edges. */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[-9, 14, 16]} intensity={2.1} castShadow={false} />
      <directionalLight position={[12, 4, 10]} intensity={0.7} color="#ffd9e2" />
      <directionalLight position={[0, -6, -14]} intensity={1.5} color={PALETTE.shellAttenuation} />

      <Environment resolution={128}>
        <Lightformer intensity={2.2} position={[-6, 8, 10]} scale={[12, 12, 1]} />
        <Lightformer intensity={1.1} position={[8, 2, 8]} scale={[8, 8, 1]} color="#ffc4d2" />
        <Lightformer intensity={1.6} position={[0, -8, -10]} scale={[14, 6, 1]} color="#ff5577" />
      </Environment>

      <IntroSpin disabled={reduced} onComplete={handleComplete} restTilt={REST_TILT}>
        <DragRotate
          enabled={introDone}
          onDragStart={handleDragStart}
          onDragChange={setDragging}
        >
          <Console input={input} texture={texture} on={introDone} dragging={dragging} />
        </DragRotate>
      </IntroSpin>
      <FitCamera />
    </>
  );
}

export interface GameBoyColorProps {
  /** Height of the canvas area. */
  height?: string;
  /** Called for every button press/release. */
  onButton?: (event: GbcButtonEvent) => void;
  /** Called for `gbc:action` events from screen programs. */
  onAction?: (detail: { type: string } & Record<string, unknown>) => void;
}

export default function GameBoyColor({
  height = 'min(78vh, 680px)',
  onButton,
  onAction,
}: GameBoyColorProps) {
  const [ready, setReady] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  // Bridge window events to props, and announce presses to screen readers.
  useEffect(() => {
    const handleButton = (event: Event) => {
      const detail = (event as CustomEvent<GbcButtonEvent>).detail;
      onButton?.(detail);
      if (detail.phase === 'press' && liveRef.current) {
        liveRef.current.textContent = `${detail.button} pressed`;
      }
    };
    const handleAction = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string }>).detail;
      onAction?.(detail as { type: string } & Record<string, unknown>);
    };
    window.addEventListener(GBC_EVENTS.button, handleButton);
    window.addEventListener(GBC_EVENTS.action, handleAction);
    return () => {
      window.removeEventListener(GBC_EVENTS.button, handleButton);
      window.removeEventListener(GBC_EVENTS.action, handleAction);
    };
  }, [onButton, onAction]);

  // The camera framing is driven off the real body height so the console
  // always fills the frame the same way regardless of canvas size.
  const distance = BODY.height * 1.58;

  return (
    <div className="gbc-stage" style={{ height }}>
      <Canvas
        dpr={[1, 2]}
        shadows={false}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, distance], fov: 32, near: 0.1, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.06;
        }}
      >
        <Suspense fallback={null}>
          <Scene onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>

      {/* Screen-reader announcements for button presses. */}
      <div ref={liveRef} aria-live="polite" className="gbc-sr-only" />

      <p className={`gbc-hint ${ready ? 'is-visible' : ''}`}>
        Drag to spin it. Click the buttons, or use arrows, Z/X and Enter.
      </p>
    </div>
  );
}
