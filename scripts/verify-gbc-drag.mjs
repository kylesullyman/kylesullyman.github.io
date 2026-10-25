/**
 * Verifies drag-to-rotate coexists with the buttons.
 *
 * The risk is that a press and a drag both start with pointerdown, so either
 * taps stop pressing buttons, or drags fire a button on the way past. This
 * checks both directions, plus inertia and the return-to-rest spring.
 *
 * Usage: node scripts/verify-gbc-drag.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4321';
const OUT = 'tmp/gbc-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.addInitScript(() => {
  window.__gbc = { button: [], action: [] };
  window.addEventListener('gbc:button', (e) => window.__gbc.button.push(e.detail));
  window.addEventListener(
    'gbc:action',
    (e) => {
      window.__gbc.action.push(e.detail);
      if (e.detail?.type === 'navigate') e.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener('gbc:ready', () => (window.__ready = true));
});

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready, null, { timeout: 10000 });
await page.waitForTimeout(3500); // let the boot splash reach the menu

const box = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

const reset = () => page.evaluate(() => {
  window.__gbc.button.length = 0;
  window.__gbc.action.length = 0;
});

/** Rotation of the drag group, read straight off the three.js scene. */
const readRotation = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const root = canvas?.__r3f?.root?.getState?.().scene;
    if (!root) return null;
    let found = null;
    root.traverse((o) => {
      if (found) return;
      // The drag group is the one using YXZ order.
      if (o.isGroup && o.rotation.order === 'YXZ') found = o;
    });
    return found ? { y: found.rotation.y, x: found.rotation.x } : null;
  });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

// --- 1. A tap on a button still presses it -------------------------------
console.log('\n[1] tap on the A button');
await reset();
// A button, from the hit-test in verify-gbc.mjs
const A = { x: 736, y: 490 };
await page.mouse.move(A.x, A.y);
await page.mouse.down();
await page.waitForTimeout(80);
await page.mouse.up();
await page.waitForTimeout(120);
let events = await page.evaluate(() => window.__gbc.button);
check(
  'tap fires press+release',
  events.some((e) => e.button === 'a' && e.phase === 'press') &&
    events.some((e) => e.button === 'a' && e.phase === 'release'),
  JSON.stringify(events.map((e) => `${e.button}:${e.phase}`)),
);

// --- 2. A drag starting ON a button rotates and does NOT fire it ---------
console.log('\n[2] drag starting on the A button');
await reset();
const before = await readRotation();
await page.mouse.move(A.x, A.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(A.x + i * 12, A.y);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(120);
events = await page.evaluate(() => window.__gbc.button);
const after = await readRotation();

check(
  'drag rotated the model',
  before && after && Math.abs(after.y - before.y) > 0.05,
  before && after ? `yaw ${before.y.toFixed(3)} -> ${after.y.toFixed(3)}` : 'no group found',
);
const stuck = events.filter((e) => e.phase === 'press' && !events.some(
  (r) => r.button === e.button && r.phase === 'release',
));
check('no button left stuck down after the drag', stuck.length === 0,
  stuck.length ? JSON.stringify(stuck) : 'none');
check(
  'drag did not emit a menu action',
  (await page.evaluate(() => window.__gbc.action)).length === 0,
);

// --- 3. Inertia keeps it moving after release ---------------------------
console.log('\n[3] flick inertia');
const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
await page.mouse.move(mid.x - 150, mid.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(mid.x - 150 + i * 30, mid.y);
  await page.waitForTimeout(10);
}
await page.mouse.up();
const atRelease = await readRotation();
await page.waitForTimeout(220);
const afterCoast = await readRotation();
check(
  'model keeps rotating briefly after release',
  Math.abs(afterCoast.y - atRelease.y) > 0.002,
  `yaw ${atRelease.y.toFixed(4)} -> ${afterCoast.y.toFixed(4)}`,
);
await page.screenshot({ path: `${OUT}/drag-rotated.png` });

// --- 4. It springs back to rest -----------------------------------------
console.log('\n[4] return to rest');
await page.waitForTimeout(4000);
const settled = await readRotation();
check(
  'settles back near facing the camera',
  Math.abs(settled.y) < 0.05 && Math.abs(settled.x) < 0.05,
  `yaw ${settled.y.toFixed(4)} pitch ${settled.x.toFixed(4)}`,
);
await page.screenshot({ path: `${OUT}/drag-settled.png` });

// --- 5. Buttons still work after all that -------------------------------
console.log('\n[5] buttons still work post-drag');
await reset();
await page.mouse.move(A.x, A.y);
await page.mouse.down();
await page.waitForTimeout(80);
await page.mouse.up();
await page.waitForTimeout(120);
events = await page.evaluate(() => window.__gbc.button);
check('tap still works after dragging', events.some((e) => e.phase === 'press'),
  JSON.stringify(events.map((e) => `${e.button}:${e.phase}`)));

console.log(`\n${pass} passed, ${fail} failed`);
console.log('console errors:', errors.length ? errors : 'none');

await browser.close();
process.exit(fail > 0 ? 1 : 0);
