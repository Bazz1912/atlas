import { browserEnvKeys, normalizeBasePath, validateBrowserEnv } from './build/pages-config.ts'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import theme from './src/design/tokens.json' with { type: 'json' }
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  validateBrowserEnv(env, env.ATLAS_PAGES_BUILD === 'true')
  const base = normalizeBasePath(env.VITE_BASE_PATH)
  return {
    base,
    envPrefix: browserEnvKeys.filter((key) => key !== 'VITE_BASE_PATH'),
    server: {
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key,p12,pfx,cer,der}',
          '.npmrc',
          '.yarnrc.yml',
          '**/.git/**',
          '**/.tools/**',
          '**/.supabase/**',
        ],
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        base,
        scope: base,
        includeAssets: [
          'atlas.svg',
          'icons/apple-touch-icon.png',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
        ],
        manifest: {
          id: base,
          name: 'ATLAS',
          short_name: 'ATLAS',
          description:
            'I tuoi luoghi da vivere e le esperienze già vissute, sulla tua mappa personale.',
          lang: 'it',
          theme_color: theme.canvas,
          background_color: theme.canvas,
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    build: { chunkSizeWarningLimit: 1500 },
  }
})
