import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Customer storefront — deployed on the main domain. Installable as a PWA:
// the app shell is precached, images and fonts are cached at runtime, and the
// API is always fetched live (prices, stock and orders must never be stale).
// New builds take over on the next load (autoUpdate) — no "refresh" prompt.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Élaré Beauty',
        short_name: 'Élaré',
        description: 'Refined makeup designed to complement every complexion, mood, and moment.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF9FA',
        theme_color: '#FFF9FA',
        lang: 'en-IN',
        categories: ['shopping', 'beauty'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Shop all', url: '/shop', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'My orders', url: '/account/orders', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Wishlist', url: '/account/wishlist', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Product / review media (Neon Object Storage, Unsplash, Pexels).
            urlPattern: ({ request, url }) => request.destination === 'image' && /\.(neon\.tech|unsplash\.com|pexels\.com)$/.test(url.hostname),
            handler: 'CacheFirst',
            options: { cacheName: 'media', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // One .env.local at the repo root serves every app.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          data: ['@neondatabase/neon-js', '@tanstack/react-query'],
        },
      },
    },
  },
  server: { port: Number(process.env.PORT) || 5173 },
  preview: { port: Number(process.env.PORT) || 4173 },
});
