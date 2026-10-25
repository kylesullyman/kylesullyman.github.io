/**
 * Checks the reduced-motion path: the console must skip the spin, sit at
 * rest immediately, and still fire gbc:ready so the screen powers on.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4321';
const OUT = 'tmp/gbc-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
});

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.addInitScript(() => {
  window.__ready = 0;
  window.addEventListener('gbc:ready', () => {
    window.__ready += 1;
    window.__readyAt = performance.now();
  });
});

await page.goto(BASE, { waitUntil: 'load' });

// With reduced motion there is no 2.6s spin, so this must resolve fast.
await page.waitForFunction(() => window.__ready > 0, null, { timeout: 5000 });
const readyAt = await page.evaluate(() => Math.round(window.__readyAt));
console.log(`gbc:ready fired at ${readyAt}ms after navigation start`);

await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/reduced-motion-early.png` });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/reduced-motion-settled.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
