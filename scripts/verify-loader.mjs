import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4321';
const out = join(homedir(), '.hermes/cache/scratch/loader-verification');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
try {
  for (const [name, viewport, reducedMotion] of [
    ['desktop', { width: 1280, height: 900 }, 'no-preference'],
    ['mobile', { width: 390, height: 844 }, 'no-preference'],
    ['short-reduced', { width: 900, height: 500 }, 'reduce'],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion });
    const page = await context.newPage();
    // Playwright screenshots wait for fonts, which this test deliberately
    // stalls. Capture the actual compositor frame without that extra wait.
    const client = await context.newCDPSession(page);
    const screenshot = async (state) => {
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${out}/${name}-${state}.png`, Buffer.from(data, 'base64'));
    };
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Hold every dependency: the initial HTML alone must paint the loader.
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') await gate;
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__loaderReady = false;
      window.addEventListener('gbc:ready', () => { window.__loaderReady = true; });
    });
    try {
      await page.goto(base, { waitUntil: 'commit' });
      let painted = false;
      try {
        await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0,
          null, { timeout: 1500 });
        painted = true;
      } catch {}
      assert.ok(painted, 'Loader must paint from HTML before any stylesheet, script, or font arrives');
      assert.equal(await page.locator('canvas').count(), 0);
      const loader = page.locator('[data-gbc-loader]');
      assert.ok(await loader.isVisible());
      const box = await page.locator('.gbc-loader-box').boundingBox();
      assert.ok(box && box.width === 120 && box.height === 120);
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width
        && box.y + box.height <= viewport.height, 'Loader stays inside the viewport');
      assert.equal(await page.locator('.site-title').evaluate((el) => getComputedStyle(el).opacity), '0');
      const wave = page.locator('.gbc-loader-wave path');
      const before = await wave.evaluate((el) => getComputedStyle(el).transform);
      await screenshot('loading');
      await page.waitForTimeout(200);
      const after = await wave.evaluate((el) => getComputedStyle(el).transform);
      if (reducedMotion === 'reduce') assert.equal(after, before, 'Reduced motion stays still');
      else assert.notEqual(after, before, 'Wave animates before dependencies arrive');
      await screenshot('wave');
      release();
      await page.waitForFunction(() => window.__loaderReady, null, { timeout: 20000 });
      await loader.waitFor({ state: 'detached' });
      assert.ok(await page.locator('canvas').isVisible());
      await screenshot('ready');
      assert.deepEqual(errors, []);
      console.log(`${name}: HTML-only paint, wave motion, and console handoff passed`);
    } finally {
      release();
      await context.close();
    }
  }
  console.log(`Screenshots: ${out}`);
} finally {
  await browser.close();
}
