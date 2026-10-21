import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this project at https://<user>.github.io/ledger/
const BASE = '/ledger/';
const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version;

// GitHub Pages cannot send headers, so the policy ships as a meta tag (production builds only,
// because the dev server needs inline scripts).
const csp: Plugin = {
  name: 'ledger-csp',
  apply: 'build',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content:
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'",
        },
        injectTo: 'head-prepend',
      },
    ];
  },
};

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    csp,
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'Ledger',
        short_name: 'Ledger',
        description: 'A private, offline-first expense tracker.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#141413',
        theme_color: '#141413',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Add expense', url: `${BASE}#/transactions?action=add` },
          { name: 'Reports', url: `${BASE}#/reports` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
        // Font subsets for scripts Ledger never shows (Cyrillic, Greek, Vietnamese) are not precached;
        // the browser still fetches them if such text ever appears while online.
        globIgnores: ['**/*-cyrillic*', '**/*-greek*', '**/*-vietnamese*'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
