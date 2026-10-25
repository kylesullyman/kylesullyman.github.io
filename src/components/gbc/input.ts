/**
 * Button state + event bus for the 3D Game Boy Color.
 *
 * Every press/release is broadcast three ways:
 *   1. to screen programs, via the per-frame InputSnapshot
 *   2. to React, via subscribe()
 *   3. to the page, as a `gbc:button` CustomEvent on window
 */

export const GBC_BUTTONS = [
  'up',
  'down',
  'left',
  'right',
  'a',
  'b',
  'start',
  'select',
] as const;

export type GbcButton = (typeof GBC_BUTTONS)[number];

export type GbcSource = 'pointer' | 'keyboard' | 'api';

export interface GbcButtonEvent {
  button: GbcButton;
  phase: 'press' | 'release';
  source: GbcSource;
  /** performance.now() at dispatch. */
  at: number;
}

/** What a screen program sees for the current frame. */
export interface InputSnapshot {
  pressed: ReadonlySet<GbcButton>;
  justPressed: ReadonlySet<GbcButton>;
  justReleased: ReadonlySet<GbcButton>;
  isDown(button: GbcButton): boolean;
  wasPressed(button: GbcButton): boolean;
  wasReleased(button: GbcButton): boolean;
}

/** Custom event names this component emits on `window`. */
export const GBC_EVENTS = {
  /** A button went down or up. detail: GbcButtonEvent */
  button: 'gbc:button',
  /** A screen program asked the page to do something. detail: { type, ... } */
  action: 'gbc:action',
  /** The intro animation finished. */
  ready: 'gbc:ready',
} as const;

export type ButtonListener = (event: GbcButtonEvent) => void;

export interface GbcInput {
  readonly snapshot: InputSnapshot;
  press(button: GbcButton, source?: GbcSource): void;
  release(button: GbcButton, source?: GbcSource): void;
  /** Clears justPressed/justReleased. Called once per rendered frame. */
  endFrame(): void;
  subscribe(listener: ButtonListener): () => void;
  /** Emit a `gbc:action` event for the host page. */
  emit(type: string, detail?: Record<string, unknown>): void;
  /** Release everything (window blur, unmount). */
  releaseAll(source?: GbcSource): void;
}

const dispatch = (name: string, detail: unknown) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

export function createInput(): GbcInput {
  const pressed = new Set<GbcButton>();
  const justPressed = new Set<GbcButton>();
  const justReleased = new Set<GbcButton>();
  const listeners = new Set<ButtonListener>();

  const snapshot: InputSnapshot = {
    pressed,
    justPressed,
    justReleased,
    isDown: (b) => pressed.has(b),
    wasPressed: (b) => justPressed.has(b),
    wasReleased: (b) => justReleased.has(b),
  };

  const fire = (event: GbcButtonEvent) => {
    for (const listener of listeners) listener(event);
    dispatch(GBC_EVENTS.button, event);
  };

  return {
    snapshot,
    press(button, source = 'api') {
      if (pressed.has(button)) return;
      pressed.add(button);
      justPressed.add(button);
      fire({ button, phase: 'press', source, at: performance.now() });
    },
    release(button, source = 'api') {
      if (!pressed.has(button)) return;
      pressed.delete(button);
      justReleased.add(button);
      fire({ button, phase: 'release', source, at: performance.now() });
    },
    releaseAll(source = 'api') {
      for (const button of [...pressed]) this.release(button, source);
    },
    endFrame() {
      justPressed.clear();
      justReleased.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(type, detail) {
      dispatch(GBC_EVENTS.action, { type, ...detail });
    },
  };
}

/** Keyboard bindings, DMG-style: arrows + Z/X + Enter/Shift. */
export const KEY_MAP: Record<string, GbcButton> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyX: 'a',
  KeyZ: 'b',
  KeyK: 'a',
  KeyJ: 'b',
  Enter: 'start',
  ShiftRight: 'select',
  ShiftLeft: 'select',
  Space: 'a',
};
