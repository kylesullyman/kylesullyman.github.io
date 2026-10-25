// Verifies no clipping by posing the console through a REAL held touch drag.
//
// Writing spin.rotation directly does not work, and worse, fails silently:
// DragRotate's useFrame recomputes rotation from its own yaw/pitch state
// before every render, so an external write is overwritten before it is
// drawn. Polling rotation afterwards still returns the written value (the
// rAF pin ran last), which makes a broken harness look like a passing one --
// the giveaway is that the rendered bbox never changes between poses.
//
// A held drag is the supported way in: while a gesture is committed the
// spring is disabled, so the pose stays put as long as the touch is down.
// SENSITIVITY is 0.0075 rad/px, so the pixel delta needed for a target
// rotation is computable.
//
// Pixels come from screenshots, not the WebGL buffer: the context uses
// preserveDrawingBuffer:false, so drawImage reads back fully transparent.
import { chromium, devices } from 'playwright';
import { PNG } from 'playwright-core/lib/utilsBundle';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4321';
const tag = process.argv[3] ?? "cur";
const out = 'tmp/gbc-shots/fit';
mkdirSync(out, { recursive: true });

const SENSITIVITY = 0.0075;
const PITCH_LIMIT = 0.65;

function bbox(buffer) {
  const { width, height, data } = PNG.sync.read(buffer);
  const solid = (x, y) => {
    const i = (y * width + x) * 4;
    return data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235;
  };
  let minX = width; let maxX = -1; let minY = height; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid(x, y)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return {
    w: maxX - minX + 1, h: maxY - minY + 1, width, height,
    L: minX, R: width - 1 - maxX, T: minY, B: height - 1 - maxY,
    clipped: (minX <= 0 ? 'L' : '') + (maxX >= width - 1 ? 'R' : '')
      + (minY <= 0 ? 'T' : '') + (maxY >= height - 1 ? 'B' : ''),
  };
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
let failures = 0;
try {
  for (const device of ['iPhone 13', 'iPhone SE', 'Pixel 7']) {
    const context = await browser.newContext({ ...devices[device], deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__ready = false;
      window.addEventListener('gbc:ready', () => { window.__ready = true; });
    });
    await page.goto(base);
    await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const slug = device.replace(/\s+/g, '-').toLowerCase();

    await page.evaluate(async () => {
      const r = performance.getEntriesByType('resource').find((x) => /react-three_fiber.*\.js/.test(x.name));
      const { _roots } = await import(r.name);
      const store = _roots.get(document.querySelector('canvas')).store.getState();
      window.__cam = store.camera;
      store.scene.traverse((o) => { if (o.isGroup && o.rotation.order === 'YXZ') window.__spin = o; });
    });

    const canvas = await page.locator('canvas').boundingBox();
    const clip = { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height };
    const handle = await page.locator('.gbc-spin-handle').boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });

    const baseline = bbox(await page.screenshot({ clip }));
    await page.screenshot({ path: `${out}/${slug}-${tag}-rest.png`, clip });
    console.log(`${device} rest: bbox=${baseline.w}x${baseline.h}`
      + ` (${((100 * baseline.h) / baseline.height).toFixed(1)}% of height)`
      + ` ${baseline.clipped ? `CLIPPED[${baseline.clipped}]` : 'clear'}`);

    // Sweep yaw while holding the drag; pitch is driven to its limit first.
    let worstClip = '';
    let samples = 0;
    const cx = handle.x + handle.width / 2;
    const cy = handle.y + handle.height / 2;

    for (const pitchSign of [-1, 1]) {
      await touch('touchStart', cx, cy);
      // Reach the pitch limit, then sweep yaw a full turn in steps.
      const pitchPx = (PITCH_LIMIT / SENSITIVITY) * pitchSign;
      let x = cx; let y = cy;
      const stepTo = async (nx, ny) => {
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - x), Math.abs(ny - y)) / 25));
        for (let i = 1; i <= steps; i += 1) {
          await touch('touchMove', x + ((nx - x) * i) / steps, y + ((ny - y) * i) / steps);
          await page.waitForTimeout(12);
        }
        x = nx; y = ny;
      };

      await stepTo(cx, cy + pitchPx);
      // 360 degrees of yaw = 2*PI/SENSITIVITY px, swept in 12 samples.
      const fullTurnPx = (Math.PI * 2) / SENSITIVITY;
      for (let i = 1; i <= 12; i += 1) {
        await stepTo(x + fullTurnPx / 12, y);
        // Let the smoothing and the eased camera converge on this pose.
        await page.waitForTimeout(500);
        const shot = await page.screenshot({ clip });
        const b = bbox(shot);
        samples += 1;
        if (b.clipped) {
          worstClip = b.clipped;
          failures += 1;
          const state = await page.evaluate(() => ({
            rot: [+window.__spin.rotation.x.toFixed(2), +window.__spin.rotation.y.toFixed(2)],
            camZ: +window.__cam.position.z.toFixed(2),
          }));
          console.log(`   CLIP at rot=${state.rot} camZ=${state.camZ}`
            + ` margins L${b.L} R${b.R} T${b.T} B${b.B}`);
          await page.screenshot({ path: `${out}/${slug}-${tag}-clip-${samples}.png`, clip });
        }
      }
      await touch('touchEnd');
      await page.waitForTimeout(1800);
    }
    console.log(`${device}: ${samples} held-drag samples, ${worstClip ? `CLIPPED[${worstClip}]` : 'all clear'}`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `FAIL: ${failures} clipped sample(s)` : 'PASS: no clipping at any sampled pose');
process.exitCode = failures ? 1 : 0;
