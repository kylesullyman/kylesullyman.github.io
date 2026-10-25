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
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { BODY, PALETTE } from './spec';
import { GBC_EVENTS, KEY_MAP, createInput, type GbcButtonEvent } from './input';
import { createEnvironment } from './environment';
import { useIsTouch } from './useIsTouch';
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

/**
 * Installs the procedural environment map as `scene.environment`.
 * Built once per renderer, and released on unmount.
 */
function SceneEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const texture = createEnvironment(gl);
    const previous = scene.environment;
    scene.environment = texture;
    return () => {
      scene.environment = previous;
      texture.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Everything inside the Canvas (needs the R3F context). */
function Scene({
  onReady,
  spinHandle,
}: {
  onReady: () => void;
  /** Touch-only rotation handle; null on pointer devices. */
  spinHandle: HTMLElement | null;
}) {
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

      <SceneEnvironment />

      <IntroSpin disabled={reduced} onComplete={handleComplete} restTilt={REST_TILT}>
        <DragRotate
          enabled={introDone}
          onDragStart={handleDragStart}
          onDragChange={setDragging}
          gestureElement={spinHandle}
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
  const isTouch = useIsTouch();
  // Callback ref, not useRef: DragRotate has to re-bind its listeners when
  // the handle mounts, and a ref object mutating in place would not retrigger
  // that effect.
  const [spinHandle, setSpinHandle] = useState<HTMLElement | null>(null);

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
          // The shell uses transmission, which makes three re-render the whole
          // scene into a backdrop target every frame. That target is sampled
          // through rough, refracting plastic, so full resolution buys nothing
          // visible -- half scale quarters the fragment work for the pass.
          gl.transmissionResolutionScale = 0.5;
        }}
      >
        <Suspense fallback={null}>
          <Scene onReady={() => setReady(true)} spinHandle={spinHandle} />
        </Suspense>
      </Canvas>

      {/*
        Touch-only rotation handle. Hold it and drag to spin; the console
        itself stays non-rotating on touch so a finger on the canvas still
        scrolls the page. Hidden entirely on pointer devices, where dragging
        the console directly is unambiguous.
      */}
      {isTouch ? (
        <button
          ref={setSpinHandle}
          disabled={!ready}
          onContextMenu={(event) => event.preventDefault()}
          type="button"
          className={`gbc-spin-handle ${ready ? 'is-visible' : ''}`}
          aria-label="Hold and drag to rotate the console"
        >
          {/*
            Orbit mark: a body with a ring around it in perspective.

            Three layers give the depth read: the full ellipse, the body
            painted over it (hiding the ring's far half), then the ring's
            near half painted back over the body.

            Two constraints have to hold at once, and they pull in opposite
            directions. The body must sit *inside* the ring's inner edge
            (4.4 vs 1.95) so the ring is visibly occluded behind it, and it
            must also clear the ring's *outer* edge (4.4 vs 3.25) so the top
            and bottom of the body poke past the ring. Lose the first and it
            is a dot in a circle; lose the second and it is a solid blob.

            Checked in rendered pixels at the 30px draw size rather than in
            viewBox units: the body clears the ring by ~1.4px and hides
            ~3.1px of it, both of which survive rasterisation. Shrinking the
            icon without re-deriving these collapses the gaps.
          */}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <ellipse
              cx="12"
              cy="12"
              rx="10.2"
              ry="2.6"
              transform="rotate(-30 12 12)"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <circle cx="12" cy="12" r="4.4" fill="currentColor" />
            <path
              d="M 20.83 6.90 A 10.2 2.6 -30 0 0 3.17 17.10"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}

      {/* Screen-reader announcements for button presses. */}
      <div ref={liveRef} aria-live="polite" className="gbc-sr-only" />

      {/*<p className={`gbc-hint ${ready ? 'is-visible' : ''}`}>*/}
      {/*  {isTouch*/}
      {/*    ? 'Tap the buttons. Hold the spin pad, bottom left, and drag to turn it.'*/}
      {/*    : 'Drag to spin it. Click the buttons, or use arrows, Z/X and Enter.'}*/}
      {/*</p>*/}
    </div>
  );
}
