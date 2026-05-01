import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const cdnBase = env.VITE_CDN_BASE_URL ?? '';

  // Extract hostname from CDN base URL for the dev proxy
  let cdnHost = '';
  try { cdnHost = new URL(cdnBase).host; } catch { /* no CDN configured */ }

  return {
  plugins: [react()],
  // In dev, proxy CDN requests through Vite to avoid CORS issues
  server: {
    proxy: cdnHost !== '' ? {
      '/card-images': {
        target: cdnBase,
        changeOrigin: true,
        rewrite: (path) => path, // keep /card-images/... as-is
      },
    } : undefined,
  },
  optimizeDeps: {
    include: ['pixi.js'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pixi': ['pixi.js'],
          'vendor-socket': ['socket.io-client'],
          'vendor-gsap': ['gsap'],
        },
      },
    },
  },
  };
});
