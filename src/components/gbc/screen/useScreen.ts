/**
 * Drives screen programs into a CanvasTexture used as the LCD.
 *
 * The canvas is exactly 160x144 and sampled nearest-neighbour, so one canvas
 * pixel is one LCD pixel. The texture is only re-uploaded when a frame was
 * actually drawn.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { GbcInput } from '../input';
import { bootProgram } from './boot';
import { menuProgram } from './menu';
import {
  LCD,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  clear,
  type ScreenProgram,
} from './program';

const PROGRAMS: ScreenProgram[] = [bootProgram, menuProgram];

export interface UseScreenOptions {
  input: GbcInput;
  /** Program to start in. */
  initial?: string;
  /** Pause drawing (e.g. during the intro spin, or when off-screen). */
  paused?: boolean;
}

export function useScreen({ input, initial = 'boot', paused = false }: UseScreenOptions) {
  const canvas = useMemo(() => {
    const element = document.createElement('canvas');
    element.width = SCREEN_WIDTH;
    element.height = SCREEN_HEIGHT;
    return element;
  }, []);

  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(canvas);
    // Crisp pixels: no mips, no smoothing.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    return tex;
  }, [canvas]);

  const ctx = useMemo(() => {
    const context = canvas.getContext('2d', { alpha: false });
    if (context) {
      context.imageSmoothingEnabled = false;
      clear(context, LCD.black);
    }
    return context;
  }, [canvas]);

  const state = useRef({ id: initial, time: 0, frame: 0, entered: false });

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, rawDelta) => {
    if (!ctx || paused) return;

    const current = PROGRAMS.find((p) => p.id === state.current.id) ?? PROGRAMS[0];

    if (!state.current.entered) {
      state.current.entered = true;
      state.current.time = 0;
      state.current.frame = 0;
      current.enter?.({ ctx, input: input.snapshot, emit: input.emit, goto: () => {} });
    }

    // Clamp so a backgrounded tab doesn't fast-forward animations.
    const delta = Math.min(rawDelta, 1 / 20);
    state.current.time += delta;
    state.current.frame += 1;

    let next: string | null = null;
    current.draw({
      ctx,
      time: state.current.time,
      delta,
      frame: state.current.frame,
      input: input.snapshot,
      emit: input.emit,
      goto: (program) => {
        next = program;
      },
    });

    texture.needsUpdate = true;
    // Announce the first menu frame, not the end of the earlier intro spin.
    if (current.id === 'menu' && state.current.frame === 1) {
      input.emit('boot-complete');
    }
    input.endFrame();

    if (next && next !== state.current.id) {
      state.current.id = next;
      state.current.entered = false;
    }
  });

  return texture;
}
