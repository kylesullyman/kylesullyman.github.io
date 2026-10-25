import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4321';
const out = join(homedir(), '.hermes/cache/scratch/title-verification');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__titleTiming = { boot: null, visible: null };
    window.addEventListener('gbc:action', (event) => {
      if (event.detail.type === 'boot-complete') window.__titleTiming.boot = performance.now();
    });
    new MutationObserver(() => {
      if (window.__titleTiming.visible === null && document.querySelector('.site-title.is-visible')) {
        window.__titleTiming.visible = performance.now();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__titleTiming.boot !== null || window.__titleTiming.visible !== null);
  let timing = await page.evaluate(() => window.__titleTiming);
  assert.notEqual(timing.boot, null, 'Title appeared before the screen boot completed');
  assert.equal(timing.visible, null, 'Title must remain hidden at boot completion');
  await page.screenshot({ path: `${out}/before-fade.png` });
  await page.waitForFunction(() => window.__titleTiming.visible !== null);
  timing = await page.evaluate(() => window.__titleTiming);
  const delay = timing.visible - timing.boot;
  assert.ok(delay >= 990 && delay < 1400, `Expected a 1s delay, got ${delay}ms`);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.site-title').evaluate(el => getComputedStyle(el).opacity), '1');
  await page.screenshot({ path: `${out}/after-fade.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/mobile.png` });
  await page.goto(`${base}/about`);
  assert.equal(await page.locator('.site-title').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ delayMs: Math.round(delay), errors, screenshots: out }));
} finally {
  await browser.close();
}
