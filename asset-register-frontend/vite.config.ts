import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'IncuAsset · Asset Register',
        short_name: 'IncuAsset',
        description: 'Accountable asset care across every centre.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/',
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm,gz}'],
        globIgnores: ['vision/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: /\/vision\/(?:wasm\/.*|efficientnet_lite0_int8_v1\.tflite)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'incuasset-on-device-photo-model-v1',
            expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [200] },
          },
        }],
      },
    }),
  ],
  server: { port: 5173 },
});
