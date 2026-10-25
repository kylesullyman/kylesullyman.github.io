/**
 * Screen program API.
 *
 * A program owns the 160x144 canvas that becomes the LCD texture. It gets
 * called once per frame with input state and timing, and may hand control to
 * another program by returning its id.
 *
 * Programs draw in *screen pixels* (0..159, 0..143) — the canvas is exactly
 * that size and sampled with nearest-neighbour filtering, so there is no
 * scaling to reason about.
 */

import { SCREEN } from '../spec';
import type { GbcInput, InputSnapshot } from '../input';

export const SCREEN_WIDTH = SCREEN.pixelsX;
export const SCREEN_HEIGHT = SCREEN.pixelsY;

/** Authentic-ish GBC-era palette, slightly desaturated like the reflective LCD. */
export const LCD = {
  black: '#0f1810',
  dark: '#2b4a2f',
  mid: '#5c8a4a',
  light: '#9bbc6f',
  pale: '#cfe6a6',
  white: '#e8f5cf',
  red: '#d8504a',
  blue: '#5a7fc0',
  yellow: '#e0c560',
} as const;

export interface FrameContext {
  ctx: CanvasRenderingContext2D;
  /** Seconds since this program became active. */
  time: number;
  /** Seconds since the previous frame, clamped to avoid tab-switch jumps. */
  delta: number;
  /** Frames since this program became active. */
  frame: number;
  input: InputSnapshot;
  /** Emit a `gbc:action` event for the host page. */
  emit: GbcInput['emit'];
  /** Switch programs after this frame. */
  goto(program: string): void;
}

export interface ScreenProgram {
  id: string;
  /** Called when the program becomes active. */
  enter?(context: Omit<FrameContext, 'time' | 'delta' | 'frame'>): void;
  draw(context: FrameContext): void;
}

/** Fill the whole screen. */
export function clear(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}

/** Axis-aligned rect, snapped to whole pixels. */
export function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 1px outline. */
export function strokeRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y, 1, h, color);
  rect(ctx, x + w - 1, y, 1, h, color);
}
