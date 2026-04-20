import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Force Vite to pre-bundle pixi.js so its internal shader imports
    // are resolved correctly during dev (avoids 404 + null shader source)
    include: ['pixi.js'],
  },
  server: {
    proxy: {
      // Proxy card image requests through the dev server to bypass CORS
      '/card-images': {
        target: 'https://en.onepiece-cardgame.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/card-images/, '/images/cardlist/card'),
      },
    },
  },
});
