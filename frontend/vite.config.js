import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      // ── Service worker & caching ──────────────────────────────────────────
      workbox: {
        // Pre-cache app shell
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],

        // Runtime caching strategies
        runtimeCaching: [
          {
            // API calls: try network first, fall back to cache (1h max age)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // External API (Railway/Render) — same strategy
            urlPattern: ({ url }) =>
              url.hostname !== location.hostname && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'external-api-cache',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // ── PWA manifest ─────────────────────────────────────────────────────
      manifest: {
        name: 'Roulette Analyzer Pro',
        short_name: 'Roulette',
        description: 'Analizador profesional de ruleta — Sistemas A3/A4, Jacobo y Espejo',
        theme_color: '#111827',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/?source=pwa',
        lang: 'es',
        categories: ['games', 'utilities'],
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Nueva sesión',
            short_name: 'Sesión',
            description: 'Iniciar nueva sesión de análisis',
            url: '/?action=new-session',
            icons: [{ src: 'icon.svg', sizes: 'any' }],
          },
        ],
      },

      // ── Dev options ───────────────────────────────────────────────────────
      devOptions: {
        enabled: false, // Keep off in dev to avoid service worker interference
      },

      // ── Include extra static assets ───────────────────────────────────────
      includeAssets: ['icon.svg'],
    }),
  ],

  // ── Dev server with proxy ─────────────────────────────────────────────────
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  // ── Build optimizations ───────────────────────────────────────────────────
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':   ['react', 'react-dom'],
          'charts-vendor':  ['recharts'],
        },
      },
    },
    // Increase chunk size warning threshold for chart library
    chunkSizeWarningLimit: 800,
  },
});
