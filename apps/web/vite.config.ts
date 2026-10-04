import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      // Everything the session needs is precached, so it runs with no network after the first visit.
      workbox: {
        // Installed up front: the app itself, its wording, and the speech model. Small in file count, so the first screen is not held up.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest,wasm,onnx}', 'packs/bundle.json'],
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
        // Card audio and facility lists are kept the first time they are fetched. The app fetches the chosen
        // language's clips in the background after it opens, so they are there when the network is not.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/packs\/.+\.(mp3|json)$/.test(url.pathname) && !url.pathname.endsWith('bundle.json'),
            handler: 'CacheFirst',
            options: { cacheName: 'amma-media', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
      manifest: {
        name: 'AMMA',
        short_name: 'AMMA',
        description: 'A voice companion for pregnancy and the weeks after birth.',
        display: 'standalone',
        start_url: '.',
        background_color: '#F6EDE4',
        theme_color: '#C4513A',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
});
