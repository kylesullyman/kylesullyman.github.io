/**
 * Load-time benchmark for the home page.
 *
 * Measures a production build (never the dev server: unbundled modules and
 * HMR make those numbers meaningless). Each run does N cold loads with the
 * HTTP cache disabled, reports the median, and appends a row to
 * tmp/bench-load.json so successive runs can be compared.
 *
 * Metrics:
 *   ttfb        navigation start -> first byte
 *   fcp         first contentful paint
 *   lcp         largest contentful paint
 *   domReady    DOMContentLoaded
 *   canvasUp    first <canvas> present in the DOM (R3F mounted)
 *   firstFrame  first rendered WebGL frame (rAF after canvas has pixels)
 *   ready       gbc:ready -- intro finished, console interactive
 *   jsBytes     transferred bytes of JS
 *   totalBytes  transferred bytes, all resources
 *
 * `ready` includes the fixed intro animation, so it is reported but is not a
 * load signal on its own; firstFrame and jsBytes are the ones to optimise.
 *
 * Usage: node scripts/bench-load.mjs [label] [baseUrl] [runs] [--no-throttle]
 */

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const THROTTLE = !process.argv.includes('--no-throttle');
/** CPU slowdown multiplier; 4x approximates a mid-range laptop/phone. */
const CPU = 4;

const LABEL = args[0] ?? 'unlabelled';
const BASE = args[1] ?? 'http://localhost:4321';
const RUNS = Number(args[2] ?? 5);
const LOG = 'tmp/bench-load.json';

mkdirSync('tmp', { recursive: true });

const median = (xs) => {
  const s = [...xs].filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
});

const runs = [];
for (let i = 0; i < RUNS; i++) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // Cold load every time: no HTTP cache, no warm module graph.
  const client = await context.newCDPSession(page);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Localhost has no transfer cost, which hides the real penalty of a large
  // bundle. Throttle to a representative connection so download time shows up
  // alongside parse/execute.
  if (THROTTLE) {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      // ~12 Mbps down, 40ms RTT: a middling broadband/4G connection.
      downloadThroughput: (12 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
      latency: 40,
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }

  await page.addInitScript(() => {
    window.__m = { ready: null, canvasUp: null, firstFrame: null, lcp: null };
    window.addEventListener('gbc:ready', () => {
      window.__m.ready = performance.now();
    });

    // Poll for the canvas, then wait one rAF past its first non-empty draw.
    const seek = () => {
      const c = document.querySelector('canvas');
      if (!c) return requestAnimationFrame(seek);
      if (window.__m.canvasUp === null) window.__m.canvasUp = performance.now();
      requestAnimationFrame(() => {
        if (window.__m.firstFrame === null) window.__m.firstFrame = performance.now();
      });
    };
    requestAnimationFrame(seek);

    new PerformanceObserver((list) => {
      const e = list.getEntries();
      window.__m.lcp = e[e.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__m.ready !== null, null, { timeout: 20000 });

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];

    // Resource Timing carries real transfer sizes even when the server sends
    // chunked responses with no content-length header.
    let jsBytes = 0;
    let totalBytes = nav ? nav.encodedBodySize : 0;
    for (const r of performance.getEntriesByType('resource')) {
      const size = r.encodedBodySize || 0;
      totalBytes += size;
      if (/\.(m?js)(\?|$)/.test(r.name)) jsBytes += size;
    }

    return {
      ttfb: nav ? nav.responseStart : null,
      domReady: nav ? nav.domContentLoadedEventEnd : null,
      fcp: fcp ? fcp.startTime : null,
      lcp: window.__m.lcp,
      canvasUp: window.__m.canvasUp,
      firstFrame: window.__m.firstFrame,
      ready: window.__m.ready,
      jsBytes,
      totalBytes,
    };
  });

  runs.push(m);
  await context.close();
}

await browser.close();

const keys = ['ttfb', 'fcp', 'lcp', 'domReady', 'canvasUp', 'firstFrame', 'ready', 'jsBytes', 'totalBytes'];
const result = { label: LABEL, at: new Date().toISOString(), runs: RUNS };
for (const k of keys) result[k] = median(runs.map((r) => r[k]));

const history = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : [];
history.push(result);
writeFileSync(LOG, JSON.stringify(history, null, 2));

const ms = (v) => (v === null ? '   n/a' : `${Math.round(v)}ms`.padStart(7));
const kb = (v) => (v === null ? '  n/a' : `${(v / 1024).toFixed(1)}KB`.padStart(9));

console.log(`\n=== ${LABEL}  (median of ${RUNS} cold loads) ===`);
console.log(`  ttfb       ${ms(result.ttfb)}`);
console.log(`  fcp        ${ms(result.fcp)}`);
console.log(`  lcp        ${ms(result.lcp)}`);
console.log(`  domReady   ${ms(result.domReady)}`);
console.log(`  canvasUp   ${ms(result.canvasUp)}`);
console.log(`  firstFrame ${ms(result.firstFrame)}`);
console.log(`  ready      ${ms(result.ready)}   (includes fixed intro)`);
console.log(`  jsBytes    ${kb(result.jsBytes)}`);
console.log(`  totalBytes ${kb(result.totalBytes)}`);

if (history.length > 1) {
  const prev = history[history.length - 2];
  console.log(`\n  vs "${prev.label}":`);
  for (const k of keys) {
    if (result[k] === null || prev[k] === null) continue;
    const d = result[k] - prev[k];
    const pct = prev[k] ? (d / prev[k]) * 100 : 0;
    if (Math.abs(pct) < 1) continue;
    const unit = k.endsWith('Bytes') ? `${(d / 1024).toFixed(1)}KB` : `${Math.round(d)}ms`;
    console.log(`    ${k.padEnd(11)} ${d > 0 ? '+' : ''}${unit} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`);
  }
}
console.log(`\nlogged to ${LOG} (${history.length} entries)`);
