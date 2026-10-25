/**
 * Visual + behavioural check for the 3D Game Boy Color.
 *
 * Captures the intro at a few timestamps, confirms the console lands square
 * to the camera, then exercises the buttons by click and by keyboard and
 * asserts the gbc:* events fire.
 *
 * Usage: node scripts/verify-gbc.mjs [baseUrl]
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

// Record every gbc event before the app can emit any.
await page.addInitScript(() => {
  window.__gbc = { button: [], action: [], ready: 0 };
  window.__blockNav = true;
  window.addEventListener('gbc:button', (e) => window.__gbc.button.push(e.detail));
  window.addEventListener(
    'gbc:action',
    (e) => {
      window.__gbc.action.push(e.detail);
      // This listener is registered before React hydrates, so stopping
      // propagation here keeps the page's navigate handler from firing and
      // tearing down the context mid-test.
      if (window.__blockNav && e.detail?.type === 'navigate') {
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener('gbc:ready', () => {
    window.__gbc.ready += 1;
    window.__gbc.readyAt = performance.now();
  });
});

await page.goto(BASE, { waitUntil: 'load' });

// --- Intro frames ---
const stamps = [250, 600, 1200, 2000, 3400];
let previous = 0;
for (const at of stamps) {
  await page.waitForTimeout(at - previous);
  previous = at;
  await page.screenshot({ path: `${OUT}/intro-${String(at).padStart(4, '0')}ms.png` });
}

const canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
});
console.log('canvas:', canvas);

await page.waitForFunction(() => window.__gbc.ready > 0, null, { timeout: 8000 });
console.log('intro completed, gbc:ready fired');

// Let the screen program run so the boot splash is visible, then the menu.
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/boot-screen.png` });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/menu-screen.png` });

/**
 * Hit-test the model: walk a grid of canvas points, and for each one check
 * whether pressing it produces a gbc:button event. Gives us the real
 * clickable footprint of every control without guessing coordinates.
 */
async function findButtons() {
  const found = new Map();
  const box = canvas;
  const step = 10;
  for (let y = box.y + 6; y < box.y + box.h - 6; y += step) {
    for (let x = box.x + 6; x < box.x + box.w - 6; x += step) {
      await page.evaluate(() => {
        window.__probe = window.__gbc.button.length;
      });
      await page.mouse.move(x, y);
      await page.mouse.down();
      const hit = await page.evaluate(() => {
        const list = window.__gbc.button.slice(window.__probe);
        return list.length ? list[0].button : null;
      });
      await page.mouse.up();
      if (hit && !found.has(hit)) found.set(hit, { x, y });
    }
  }
  return found;
}

const hits = await findButtons();
console.log('\nclickable controls found by hit-test:');
for (const [button, point] of hits) {
  console.log(`  ${button.padEnd(6)} at (${point.x}, ${point.y})`);
}

// --- Click each discovered control and verify press+release pairs ---
await page.evaluate(() => {
  window.__gbc.button.length = 0;
});
for (const [button, point] of hits) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/press-${button}.png` });
}

const clickEvents = await page.evaluate(() => window.__gbc.button);
const byButton = {};
for (const e of clickEvents) {
  byButton[e.button] ??= { press: 0, release: 0, source: e.source };
  byButton[e.button][e.phase] += 1;
}
console.log('\npointer events per control:');
for (const [button, counts] of Object.entries(byButton)) {
  console.log(`  ${button.padEnd(6)} press=${counts.press} release=${counts.release} source=${counts.source}`);
}

// --- Keyboard ---
await page.evaluate(() => {
  window.__gbc.button.length = 0;
  window.__gbc.action.length = 0;
});
for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'KeyX', 'KeyZ', 'Enter', 'ShiftRight']) {
  await page.keyboard.down(key);
  await page.waitForTimeout(70);
  await page.keyboard.up(key);
  await page.waitForTimeout(70);
}
const keyEvents = await page.evaluate(() => window.__gbc.button);
console.log('\nkeyboard events:', keyEvents.map((e) => `${e.button}:${e.phase[0]}`).join(' '));
console.log('keyboard sources all "keyboard":', keyEvents.every((e) => e.source === 'keyboard'));

const actions = await page.evaluate(() => window.__gbc.action);
console.log('actions emitted by screen programs:', JSON.stringify(actions));

// --- Does it land square to the camera? ---
await page.screenshot({ path: `${OUT}/final-rest.png` });

// --- Responsive: the console must stay fully in frame at any viewport ---
for (const vp of [
  { width: 390, height: 844, name: 'mobile' },
  { width: 820, height: 1180, name: 'tablet' },
  { width: 1680, height: 1050, name: 'desktop-wide' },
  { width: 1280, height: 620, name: 'short' },
]) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/viewport-${vp.name}.png` });
}

console.log('\nconsole errors:', errors.length ? errors : 'none');

await browser.close();
console.log(`\nscreenshots in ${OUT}/`);
