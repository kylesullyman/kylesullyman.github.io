/**
 * Physical spec of a Nintendo Game Boy Color (CGB-001).
 *
 * All source numbers are in millimetres, taken from the real hardware:
 *   body    133.5 (H) x 78 (W) x 27.4 (D) mm
 *   LCD     44 x 40 mm viewing area, 160 x 144 px
 *
 * Scene units are centimetres (mm / 10), so the model is ~13.35 units tall.
 * The origin is the centre of the body; +x right, +y up, +z toward the viewer.
 */

const mm = (v: number) => v / 10;

/** Body shell, from Nintendo's published technical data. */
export const BODY = {
  width: mm(78),
  height: mm(133.5),
  depth: mm(27.4),
  /** Corner radius of the shell. */
  radius: mm(6),
  /** z of the front face / back face. */
  front: mm(27.4) / 2,
  back: -mm(27.4) / 2,
  /** The shell is two halves; this is where the seam sits in z. */
  seam: mm(27.4) / 2 - mm(10),
} as const;

/** Recessed dark plate the LCD sits in. */
export const BEZEL = {
  width: mm(57),
  height: mm(47),
  x: 0,
  y: mm(32.5),
  depth: mm(2.5),
} as const;

/** 44 x 40 mm viewing area at 160 x 144 px. */
export const SCREEN = {
  width: mm(44),
  height: mm(40),
  x: 0,
  y: mm(34.5),
  pixelsX: 160,
  pixelsY: 144,
} as const;

/** Cross-shaped directional pad, lower left of the face. */
export const DPAD = {
  x: mm(-22.5),
  y: mm(-24),
  /** Half-length of one arm, measured from the centre. */
  arm: mm(10.5),
  /** Width of an arm. */
  thickness: mm(8),
  height: mm(2.6),
} as const;

/** A and B sit on a ~20 degree incline, A above and right of B. */
export const FACE_BUTTONS = {
  radius: mm(5.7),
  height: mm(2.6),
  /** Radius of the rounded shoulder between the flat top and the side wall. */
  edgeRadius: mm(1.1),
  b: { x: mm(11), y: mm(-28) },
  a: { x: mm(25.5), y: mm(-20.5) },
} as const;

/** SELECT / START: angled pills below the controls. */
export const PILL_BUTTONS = {
  width: mm(11.5),
  depth: mm(4.2),
  height: mm(1.6),
  /** Radians; the real pills rake up to the right. */
  rotation: (-24 * Math.PI) / 180,
  select: { x: mm(-7), y: mm(-47) },
  start: { x: mm(12), y: mm(-47) },
} as const;

/** Circular cluster of speaker holes, lower right. */
export const SPEAKER = {
  x: mm(24),
  y: mm(-54),
  holeRadius: mm(0.9),
  rings: [
    { radius: 0, count: 1 },
    { radius: mm(3.4), count: 6 },
    { radius: mm(6.8), count: 12 },
  ],
} as const;

/** Red power indicator, left of the screen bezel. */
export const POWER_LED = {
  x: mm(-32),
  y: mm(32),
  radius: mm(1.5),
} as const;

/** Power slider on the top edge, left of the cartridge slot. */
export const POWER_SWITCH = {
  x: mm(-21),
  width: mm(12),
  depth: mm(5),
  height: mm(3),
} as const;

/** Volume wheel on the left edge. */
export const VOLUME_WHEEL = {
  y: mm(28),
  radius: mm(7),
  thickness: mm(3.4),
} as const;

/** Infrared window on the top edge. */
export const IR_PORT = {
  x: mm(22),
  width: mm(13),
  height: mm(6),
} as const;

/** "GAME BOY COLOR" wordmark below the bezel. */
export const WORDMARK = { x: 0, y: mm(3) } as const;

export const PALETTE = {
  /** Clear "berry" red translucent plastic. */
  shell: '#c8103c',
  shellAttenuation: '#ff2d55',
  bezel: '#20222a',
  bezelInner: '#14151a',
  button: '#3a2f47',
  buttonRim: '#2a2234',
  /** Silkscreened A / B glyph on the button caps. */
  buttonLabel: '#efe3f2',
  pill: '#4a4458',
  led: '#ff2b3d',
  ledOff: '#5e1f28',
  pcb: '#12402c',
  chip: '#15161a',
  battery: '#1d1f24',
  metal: '#9aa0a8',
  screenOff: '#5c6b4a',
} as const;
