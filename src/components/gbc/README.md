# 3D Game Boy Color

An interactive, real-proportion Game Boy Color (CGB-001) in clear red plastic,
rendered with three.js / react-three-fiber. The LCD is a live 160x144 canvas
that runs small "programs", and every button is clickable.

## Layout

    spec.ts            Physical dimensions, in mm, from the real hardware.
    geometry.ts        Shell/D-pad/cutout geometry builders.
    input.ts           Button state, keyboard map, event bus.
    IntroSpin.tsx      The landing animation.
    FitCamera.tsx      Keeps the console in frame at any viewport.
    Console.tsx        Assembles shell + screen + controls.
    GameBoyColor.tsx   Canvas, lighting, keyboard wiring. Default export.
    parts/             Shell, Dpad, Controls, Pressable.
    screen/            Program API, font, and the boot/menu programs.

## Proportions

Taken from Nintendo's published technical data:

| Part        | Real size            |
| ----------- | -------------------- |
| Body        | 133.5 x 78 x 27.4 mm |
| LCD visible | 44 x 40 mm           |
| Resolution  | 160 x 144 px         |

Scene units are centimetres (mm / 10), so the body is 13.35 units tall. All
positions in `spec.ts` go through the `mm()` helper, so the model stays
dimensionally honest — change a number there and everything follows.

## Intro animation

The console spins around a tilted axis, fast then easing out hard, and lands
facing the camera.

The rotation is a single angle about one tilted axis, driven from
`TOTAL_ANGLE` down to exactly `0`. Zero is the identity rotation, so the
landing pose is exact by construction — no drift, no modular arithmetic on
Euler angles. The easing is C1-continuous (the ease-in's exit speed is solved
to match the ease-out's entry speed), so there is no acceleration snap at the
handoff.

`prefers-reduced-motion: reduce` skips the spin entirely and starts at rest.

## Events

All on `window`:

| Event        | Detail                                       |
| ------------ | -------------------------------------------- |
| `gbc:button` | `{ button, phase, source, at }`              |
| `gbc:action` | `{ type, ... }` from screen programs         |
| `gbc:ready`  | fired once when the intro finishes           |

`button` is one of `up down left right a b start select`; `phase` is
`press`/`release`; `source` is `pointer`/`keyboard`/`api`.

```js
window.addEventListener('gbc:button', (e) => {
  if (e.detail.phase === 'press') console.log(e.detail.button);
});
```

Or via props:

```tsx
<GameBoyColor
  onButton={(e) => ...}
  onAction={(detail) => {
    if (detail.type === 'navigate') window.location.href = detail.href;
  }}
/>
```

Screen programs never navigate themselves — they emit a `navigate` action and
the host page decides. Keeps the 3D component free of routing concerns.

## Writing a screen program

A program draws to a 160x144 canvas in raw screen pixels and reads input once
per frame:

```ts
import { clear, rect, LCD, type ScreenProgram } from './program';
import { drawText } from '../font';

export const myProgram: ScreenProgram = {
  id: 'mine',
  enter() { /* reset state */ },
  draw({ ctx, time, input, emit, goto }) {
    clear(ctx, LCD.black);
    if (input.wasPressed('a')) emit('did-something');
    drawText(ctx, 'HELLO', 80, 70, LCD.white, { align: 'center' });
  },
};
```

Register it in the `PROGRAMS` array in `screen/useScreen.ts`.

Use `drawText` rather than `ctx.fillText`: at 160x144 the browser's text
rasteriser antialiases glyphs into mush, so `font.ts` carries a 5x7 bitmap
font that lands on exact pixels.

`input.wasPressed()` is edge-triggered (true for one frame);
`input.isDown()` is level-triggered.

## Verifying changes

```
npm run check            # types
npm run dev              # then, in another shell:
npm run verify:gbc           # screenshots + hit-tests every control
npm run verify:gbc:reduced   # reduced-motion path
```

`verify:gbc` finds the buttons by probing a grid of canvas coordinates and
watching for `gbc:button` events, so it does not depend on hardcoded screen
positions and will catch a control that stops being clickable after a layout
change. Screenshots land in `tmp/gbc-shots/`.

## Notes

- The front shell half has real cutouts (`shellGeometry({ holes })`) for the
  screen, D-pad, A/B and the pills. Without them the controls sit behind
  transmissive plastic and fog badly.
- The LCD uses `meshBasicMaterial` with `toneMapped={false}` so pixel colours
  survive ACES tone mapping exactly as authored.
- This island is `client:only="react"` — it builds a canvas texture at module
  scope and cannot server-render. Page copy lives in `index.astro` as static
  HTML so it does not wait on hydration.
- three.js + drei is ~976K of JS. Fine for a hero element on one page; if it
  ever needs to go site-wide, lazy-load it behind an intersection observer.
