/**
 * Main menu. D-pad moves the cursor, A selects, B goes back, START toggles
 * the debug/input readout.
 *
 * Selecting a link emits a `gbc:action` event of type 'navigate' — the host
 * page decides what to do with it (see GameBoyColor's onAction).
 */

import { drawText, textWidth } from '../font';
import type { GbcButton } from '../input';
import {
  LCD,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  clear,
  rect,
  strokeRect,
  type FrameContext,
  type ScreenProgram,
} from './program';

interface MenuItem {
  label: string;
  /** Where selecting it should take the page, if anywhere. */
  href?: string;
  /** Short blurb shown in the footer. */
  hint: string;
}

const ITEMS: MenuItem[] = [
  { label: 'PROJECTS', href: '/projects', hint: 'THINGS I BUILT' },
  { label: 'ABOUT ME', href: '/about', hint: 'WHO IS KYLE' },
  { label: 'CONTROLS', hint: 'HOW TO PLAY' },
];

/** Scrolling starfield behind the menu. */
const STARS = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 61) % SCREEN_WIDTH,
  y: (i * 37) % SCREEN_HEIGHT,
  speed: 4 + (i % 3) * 6,
  shade: i % 3,
}));

let cursor = 0;
let showControls = false;
let scroll = 0;

const BUTTON_LABELS: [GbcButton, string][] = [
  ['up', 'UP'],
  ['down', 'DOWN'],
  ['left', 'LEFT'],
  ['right', 'RIGHT'],
  ['b', 'B'],
  ['a', 'A'],
  ['select', 'SEL'],
  ['start', 'START'],
];

function drawStars(ctx: CanvasRenderingContext2D, delta: number) {
  scroll += delta;
  const shades = [LCD.dark, LCD.mid, LCD.light];
  for (const star of STARS) {
    const y = (star.y + scroll * star.speed) % SCREEN_HEIGHT;
    rect(ctx, star.x, y, 1, 1, shades[star.shade]);
  }
}

function drawControls({ ctx, input, time }: FrameContext) {
  rect(ctx, 0, 0, SCREEN_WIDTH, 14, LCD.dark);
  drawText(ctx, 'CONTROLS', SCREEN_WIDTH / 2, 4, LCD.white, { align: 'center' });

  // Two columns: key on the left, what it does on the right.
  const rows: [string, string][] = [
    ['ARROWS', 'MOVE'],
    ['X OR K', 'A BTN'],
    ['Z OR J', 'B BTN'],
    ['ENTER', 'START'],
    ['SHIFT', 'SELECT'],
  ];
  rows.forEach(([key, action], i) => {
    const y = 22 + i * 10;
    drawText(ctx, key, 8, y, LCD.pale);
    drawText(ctx, action, SCREEN_WIDTH - 8, y, LCD.light, { align: 'right' });
  });
  drawText(ctx, 'OR CLICK THEM', SCREEN_WIDTH / 2, 74, LCD.mid, { align: 'center' });

  // Live readout: lights up as buttons go down, proving events land.
  rect(ctx, 0, 86, SCREEN_WIDTH, 1, LCD.dark);
  drawText(ctx, 'LIVE INPUT', SCREEN_WIDTH / 2, 90, LCD.mid, { align: 'center' });

  let x = 5;
  let y = 102;
  for (const [button, label] of BUTTON_LABELS) {
    const w = textWidth(label) + 6;
    if (x + w > SCREEN_WIDTH - 5) {
      x = 5;
      y += 12;
    }
    const down = input.isDown(button);
    rect(ctx, x, y, w, 10, down ? LCD.light : LCD.black);
    strokeRect(ctx, x, y, w, 10, down ? LCD.white : LCD.dark);
    drawText(ctx, label, x + 3, y + 2, down ? LCD.black : LCD.mid);
    x += w + 3;
  }

  if (Math.floor(time * 2) % 2 === 0) {
    drawText(ctx, 'B TO GO BACK', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 9, LCD.mid, {
      align: 'center',
    });
  }
}

function drawMenu({ ctx, time, input }: FrameContext) {
  // Header
  rect(ctx, 0, 0, SCREEN_WIDTH, 22, LCD.dark);
  rect(ctx, 0, 22, SCREEN_WIDTH, 1, LCD.light);
  drawText(ctx, 'KYLE SULLIVAN', SCREEN_WIDTH / 2, 4, LCD.white, {
    scale: 2,
    align: 'center',
  });

  ITEMS.forEach((item, i) => {
    const y = 38 + i * 20;
    const active = i === cursor;
    if (active) {
      // Breathing highlight bar.
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      rect(ctx, 8, y - 4, SCREEN_WIDTH - 16, 17, pulse > 0.5 ? LCD.mid : LCD.dark);
      strokeRect(ctx, 8, y - 4, SCREEN_WIDTH - 16, 17, LCD.light);
      drawText(ctx, '>', 14, y, LCD.white);
    }
    drawText(ctx, item.label, 26, y, active ? LCD.white : LCD.light);
  });

  // Footer: the highlighted row's blurb above the action hint.
  const footerY = SCREEN_HEIGHT - 30;
  rect(ctx, 0, footerY, SCREEN_WIDTH, SCREEN_HEIGHT - footerY, LCD.dark);
  rect(ctx, 0, footerY - 1, SCREEN_WIDTH, 1, LCD.light);
  drawText(ctx, ITEMS[cursor].hint, SCREEN_WIDTH / 2, footerY + 6, LCD.pale, {
    align: 'center',
  });

  const held = input.pressed.size > 0;
  drawText(
    ctx,
    held ? '...' : 'A = SELECT',
    SCREEN_WIDTH / 2,
    footerY + 18,
    held ? LCD.white : LCD.mid,
    { align: 'center' },
  );
}

export const menuProgram: ScreenProgram = {
  id: 'menu',

  enter() {
    cursor = 0;
    showControls = false;
  },

  draw(context) {
    const { ctx, input, emit, delta } = context;

    if (showControls) {
      if (input.wasPressed('b') || input.wasPressed('start')) {
        showControls = false;
        emit('screen', { screen: 'menu' });
      }
      clear(ctx, LCD.black);
      drawStars(ctx, delta);
      drawControls(context);
      return;
    }

    const prev = cursor;
    if (input.wasPressed('down')) cursor = (cursor + 1) % ITEMS.length;
    if (input.wasPressed('up')) cursor = (cursor - 1 + ITEMS.length) % ITEMS.length;
    if (cursor !== prev) emit('cursor', { index: cursor, label: ITEMS[cursor].label });

    if (input.wasPressed('a') || input.wasPressed('start')) {
      const item = ITEMS[cursor];
      if (item.href) {
        emit('navigate', { href: item.href, label: item.label });
      } else {
        showControls = true;
        emit('screen', { screen: 'controls' });
      }
    }

    if (input.wasPressed('select')) emit('select', { label: ITEMS[cursor].label });

    clear(ctx, LCD.black);
    drawStars(ctx, delta);
    drawMenu(context);
  },
};
