/**
 * Astro integration: inject <link rel="modulepreload"> for island chunks.
 *
 * A `client:only` island is loaded through a dynamic import, so Astro emits no
 * preload hints for it and the browser cannot see the dependency graph until
 * it has already executed the parent chunk. For this site that means a
 * three-level waterfall:
 *
 *   index.html -> HomeConsole.js (63ms) -> three.js (158ms) -> done (320ms)
 *
 * three.js is the largest chunk and is discovered last, which is exactly
 * backwards. Walking the Vite manifest at build time and emitting preload
 * links for the island's transitive imports lets the browser's preload
 * scanner start all of them while the HTML is still parsing.
 *
 * Preload (not prefetch) is correct here: these chunks are needed for the
 * current navigation, so they should compete for bandwidth immediately.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Collects a chunk and everything it statically imports, depth-first. */
function collectImports(manifest, key, seen = new Set()) {
  if (seen.has(key)) return seen;
  const entry = manifest[key];
  if (!entry) return seen;
  seen.add(key);
  for (const next of entry.imports ?? []) collectImports(manifest, next, seen);
  return seen;
}

async function findHtmlFiles(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) found.push(...(await findHtmlFiles(path)));
    else if (item.name.endsWith('.html')) found.push(path);
  }
  return found;
}

export default function preloadIslands() {
  return {
    name: 'preload-islands',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = dir.pathname;

        // Astro writes the Vite manifest under .vite/ when it is enabled; if
        // it is absent, fall back to scanning the HTML for chunk references.
        let manifest = null;
        for (const candidate of ['.vite/manifest.json', 'manifest.json']) {
          try {
            manifest = JSON.parse(await readFile(join(outDir, candidate), 'utf8'));
            break;
          } catch {}
        }

        const htmlFiles = await findHtmlFiles(outDir);
        let patched = 0;

        for (const file of htmlFiles) {
          const html = await readFile(file, 'utf8');

          // Chunks the HTML already references directly.
          const direct = [...html.matchAll(/"(\/_astro\/[A-Za-z0-9._-]+\.js)"/g)].map(
            (m) => m[1],
          );
          if (!direct.length) continue;

          const wanted = new Set(direct);

          // Pull in each referenced chunk's transitive static imports.
          if (manifest) {
            const byFile = new Map();
            for (const [key, entry] of Object.entries(manifest)) {
              byFile.set('/' + entry.file, key);
            }
            for (const href of direct) {
              const key = byFile.get(href);
              if (!key) continue;
              for (const dep of collectImports(manifest, key)) {
                const entry = manifest[dep];
                if (entry?.file) wanted.add('/' + entry.file);
              }
            }
          } else {
            // No manifest: read the island chunk itself and follow its
            // relative import specifiers one level, which is enough to catch
            // the big vendor chunks split out by manualChunks.
            for (const href of direct) {
              try {
                const code = await readFile(join(outDir, href.slice(1)), 'utf8');
                for (const m of code.matchAll(/["'](\.\/[A-Za-z0-9._-]+\.js)["']/g)) {
                  wanted.add('/_astro/' + m[1].slice(2));
                }
              } catch {}
            }
          }

          const links = [...wanted]
            .sort()
            .map((href) => `<link rel="modulepreload" href="${href}">`)
            .join('');

          if (!links || html.includes('rel="modulepreload"')) continue;

          // Inject into <head> so the preload scanner sees them immediately.
          const updated = html.replace(/<\/head>/, `${links}</head>`);
          if (updated === html) continue;
          await writeFile(file, updated);
          patched++;
        }

        logger.info(`injected modulepreload hints into ${patched} page(s)`);
      },
    },
  };
}
