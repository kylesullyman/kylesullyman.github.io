import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import preloadIslands from './integrations/preload-islands.mjs';

export default defineConfig({
  site: 'https://kylesullyman.github.io',
  integrations: [react(), preloadIslands()],

  build: {
    // Ship the small stylesheets in the initial HTML. Even with the loader's
    // own CSS inlined, an external layout stylesheet blocks its first paint
    // and animation until that extra request completes.
    inlineStylesheets: 'always',
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
