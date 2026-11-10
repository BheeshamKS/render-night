import react from '@vitejs/plugin-react';

import { defineConfig } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@core': resolve('src/core'),
      },
    },
  },
});
