import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import path from 'path'
import type { Plugin } from 'vite'

// Dev/preview middleware is part of the release boundary too. Keep the legacy
// path explicit but reject it before reading a body or contacting a provider.
function safeBetaReplicateLock(): Plugin {
  const block: NonNullable<Plugin['configureServer']> = server => {
    server.middlewares.use('/api/replicate', (_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'safe_beta_action_disabled',
          reason: 'paid-generation-disabled',
        })
      )
    })
  }

  return {
    name: 'safe-beta-replicate-lock',
    configureServer: block,
    configurePreviewServer(server) {
      server.middlewares.use('/api/replicate', (_req, res) => {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'safe_beta_action_disabled',
            reason: 'paid-generation-disabled',
          })
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tamaguiPlugin({
      config: './tamagui.config.ts',
      components: ['tamagui', '@tamagui/core'],
      disableExtraction: true,
    }),
    safeBetaReplicateLock(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@compositions': path.resolve(__dirname, './src/compositions'),
      '@vibee/ui': path.resolve(__dirname, '../packages/ui/src'),
      '@vibee/ui/timeline': path.resolve(
        __dirname,
        '../packages/ui/src/timeline'
      ),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom', 'jotai'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@remotion/player', 'remotion', 'jotai'],
  },
  server: {
    port: 5174,
    fs: {
      allow: [
        path.resolve(__dirname, '.'),
        path.resolve(__dirname, '../packages'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        // Don't proxy /api/replicate - handle it in middleware
        bypass: req => {
          if (req.url?.startsWith('/api/replicate')) {
            return '/api/replicate' // This will be handled by middleware
          }
          return null
        },
        rewrite: path => path.replace(/^\/api/, ''),
      },
      '/renders': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        bypass: req => {
          if (req.url?.startsWith('/api/replicate')) {
            return '/api/replicate'
          }
          return null
        },
        rewrite: path => path.replace(/^\/api/, ''),
      },
      '/renders': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})
