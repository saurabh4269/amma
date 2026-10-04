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
      workbox: { globPatterns: ['**/*.{js,mjs,css,html,json,svg,png,opus,mp3,webmanifest,wasm,onnx}'], maximumFileSizeToCacheInBytes: 60 * 1024 * 1024 },
      manifest: {
        name: 'Yaay',
        short_name: 'Yaay',
        description: 'A voice companion for pregnancy and the weeks after birth.',
        display: 'standalone',
        start_url: '.',
        background_color: '#fff8f0',
        theme_color: '#b4532a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
});
