/**
 * Boot splash, in the spirit of the real GBC: the logo drops in, a chime
 * flash, then it hands off to the menu. Any button skips to the end.
 */

import { drawText } from '../font';
import {
  LCD,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  clear,
  rect,
  type ScreenProgram,
} from './program';

const DROP_END = 1.15;
const HOLD_END = 2.0;
const FADE_END = 2.45;

/** Ease-out bounce for the logo drop. */
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export const bootProgram: ScreenProgram = {
  id: 'boot',

  draw({ ctx, time, input, goto }) {
    const skipped = input.justPressed.size > 0;
    if (skipped) {
      goto('menu');
      return;
    }

    clear(ctx, LCD.white);

    const centerX = SCREEN_WIDTH / 2;
    const restY = SCREEN_HEIGHT / 2 - 14;

    // Logo drop
    const dropT = Math.min(time / DROP_END, 1);
    const y = -24 + (restY + 24) * easeOutBack(dropT);

    // Six colour bars behind the wordmark, like the GBC logo's gradient.
    const bars = [LCD.red, LCD.yellow, LCD.light, LCD.mid, LCD.blue, LCD.dark];
    const barW = 11;
    const totalW = bars.length * barW;
    bars.forEach((color, i) => {
      const reveal = Math.min(Math.max((dropT - i * 0.06) / 0.4, 0), 1);
      const h = 18 * reveal;
      rect(ctx, centerX - totalW / 2 + i * barW, y + (18 - h), barW - 1, h, color);
    });

    drawText(ctx, 'KYLE SULLIVAN', centerX, y + 24, LCD.black, {
      scale: 1.5,
      align: 'center',
    });
    // drawText(ctx, 'COLOR', centerX, y + 42, LCD.dark, {
    //   scale: 2,
    //   align: 'center',
    // });

    // Chime flash
    if (time > DROP_END && time < DROP_END + 0.12) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }

    if (time > HOLD_END) {
      drawText(ctx, 'PRESS START', centerX, SCREEN_HEIGHT - 24, LCD.mid, {
        align: 'center',
      });
    }

    // Wipe to black, then hand off.
    if (time > FADE_END) {
      const t = Math.min((time - FADE_END) / 0.3, 1);
      rect(ctx, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT * t, LCD.black);
      if (t >= 1) goto('menu');
    }
  },
};
