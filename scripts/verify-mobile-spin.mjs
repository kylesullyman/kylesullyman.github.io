// Run against the Vite dev server: node scripts/verify-mobile-spin.mjs [url]
// Uses real CDP touch input and reads rotation from R3F's existing dev store.
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4321';
const out = 'tmp/gbc-shots/mobile';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const results = [];
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__ready = false;
      window.__buttons = [];
      window.addEventListener('gbc:ready', () => { window.__ready = true; });
      window.addEventListener('gbc:button', (e) => window.__buttons.push(e.detail));
      window.addEventListener('gbc:action', (e) => {
        if (e.detail?.type === 'navigate') e.stopImmediatePropagation();
      }, true);
    });
    await page.goto(base);
    await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      const resource = performance.getEntriesByType('resource').find((r) => /react-three_fiber.*\.js/.test(r.name));
      if (!resource) throw new Error('Run this test against the Vite dev server');
      const { _roots } = await import(resource.name);
      const state = _roots.get(document.querySelector('canvas')).store.getState();
      state.scene.traverse((o) => {
        if (o.isGroup && o.rotation.order === 'YXZ') window.__spin = o;
      });
      if (!window.__spin) throw new Error('Rotation group not found');
    });
    const pose = () => page.evaluate(() => [window.__spin.rotation.x, window.__spin.rotation.y]);
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const canvas = await page.locator('canvas').boundingBox();
    assert(canvas);
    assert.equal(await page.locator('.gbc-spin-handle').count(), mobile ? 1 : 0);
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }],
    });
    async function drag(x, y, dx, dy, held = false) {
      if (mobile) await touch('touchStart', x, y);
      else { await page.mouse.move(x, y); await page.mouse.down(); }
      for (let i = 1; i <= 12; i++) {
        if (mobile) await touch('touchMove', x + dx * i / 12, y + dy * i / 12);
        else await page.mouse.move(x + dx * i / 12, y + dy * i / 12);
        await page.waitForTimeout(20);
      }
      await page.waitForTimeout(250);
      if (!held) {
        if (mobile) await touch('touchEnd');
        else await page.mouse.up();
      }
    }
    const before = await pose();
    await drag(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.3, -90, 0, true);
    const after = await pose();
    if (mobile) await touch('touchEnd'); else await page.mouse.up();
    assert(mobile ? distance(before, after) < 0.001 : distance(before, after) > 0.2,
      `${mobile ? 'Mobile canvas must not' : 'Desktop canvas must'} rotate`);
    results.push(`${mobile ? 'Mobile canvas rotation blocked' : 'Desktop canvas rotation preserved'}: PASS`);
    if (mobile) {
      const handle = await page.locator('.gbc-spin-handle').boundingBox();
      assert(handle);
      await page.locator('.gbc-spin-handle').evaluate((button) => {
        button.addEventListener('pointerdown', (event) => { window.__handlePointer = event.pointerId; });
      });
      await drag(handle.x + handle.width / 2, handle.y + handle.height / 2, 100, -35, true);
      const rotated = await pose();
      assert(distance(after, rotated) > 0.3, 'Holding and dragging the handle must rotate');
      await page.screenshot({ path: `${out}/held.png` });
      await touch('touchEnd');
      await page.waitForTimeout(100);
      const released = await pose();
      await page.waitForTimeout(600);
      assert(distance(released, await pose()) < 0.01, 'Mobile rotation must stop on release');
      results.push('Mobile handle rotates while held and stops on release: PASS');
      for (const reason of ['cancel', 'blur', 'capture-loss']) {
        await drag(handle.x + handle.width / 2, handle.y + handle.height / 2, 25, 0, true);
        if (reason === 'cancel') await touch('touchCancel');
        else if (reason === 'blur') await page.evaluate(() => dispatchEvent(new Event('blur')));
        else await page.evaluate(() => {
          const button = document.querySelector('.gbc-spin-handle');
          // The pointer ID is captured from the actual touch stream.
          button.releasePointerCapture(window.__handlePointer);
        });
        await page.waitForTimeout(100);
        const stopped = await pose();
        await page.waitForTimeout(200);
        assert(distance(stopped, await pose()) < 0.01, `${reason} must stop mobile rotation`);
        if (reason !== 'cancel') await touch('touchEnd');
      }
      results.push('Touch cancellation, blur and capture-loss cleanup: PASS');
      // Guarantee scrollable content even if the home-page copy changes.
      await page.evaluate(() => {
        const spacer = document.createElement('div');
        spacer.style.height = '100vh';
        document.body.append(spacer);
        scrollTo(0, 0);
      });
      await page.waitForTimeout(250);
      const scrollBefore = await page.evaluate(() => scrollY);
      const scrollBox = await page.locator('canvas').boundingBox();
      await drag(scrollBox.x + scrollBox.width * 0.1, scrollBox.y + scrollBox.height * 0.6, 0, -180);
      await page.waitForTimeout(400);
      assert(await page.evaluate(() => scrollY) > scrollBefore + 5, 'Canvas swipe must scroll the page');
      results.push('Native canvas touch scrolling: PASS');
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(250);
      // Return to the resting orientation through a reload, then probe taps.
      await page.reload();
      await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
      await page.waitForTimeout(1200);
      const bounds = await page.locator('canvas').boundingBox();
      let hit = null;
      for (let y = bounds.y + bounds.height * 0.5; y < bounds.y + bounds.height * 0.9 && !hit; y += 18) {
        for (let x = bounds.x + bounds.width * 0.15; x < bounds.x + bounds.width * 0.85 && !hit; x += 18) {
          await page.touchscreen.tap(x, y);
          hit = await page.evaluate(() => window.__buttons.find((e) => e.phase === 'press')?.button);
        }
      }
      assert(hit, 'Console buttons must still respond to touch');
      assert(await page.evaluate((button) => window.__buttons.some((e) => e.button === button && e.phase === 'release'), hit));
      results.push(`Console touch press/release (${hit}): PASS`);
      await page.screenshot({ path: `${out}/rest.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  console.log(results.join('\n'));
  await browser.close();
}
