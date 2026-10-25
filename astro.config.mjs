import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import preloadIslands from './integrations/preload-islands.mjs';

export default defineConfig({
  site: 'https://kylesullyman.github.io',
  integrations: [react(), preloadIslands()],

  build: {
    // The console island is a ~240KB chunk (three.js). Without a preload hint
    // the browser cannot discover it until it has parsed and run Astro's
    // inline bootstrap, which costs ~60ms of dead time before the fetch even
    // starts. Emitting link tags lets the preload scanner kick it off while
    // the HTML is still being parsed.
    inlineStylesheets: 'auto',
  },

  vite: {
    build: {
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          // Split three.js out of the island chunk. It changes far less often
          // than the console code, so a separate file stays cached across
          // deploys instead of being re-downloaded whenever the model changes.
          manualChunks(id) {
            if (id.includes('node_modules/three/')) return 'three';
            if (id.includes('node_modules/react')) return 'react-vendor';
            return undefined;
          },
        },
      },
    },
  },
});
