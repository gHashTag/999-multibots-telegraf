import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import path from 'path'
import type { Plugin } from 'vite'

// Replicate API proxy plugin
function replicatePlugin(): Plugin {
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || ''

  return {
    name: 'replicate-proxy',
    configureServer(server) {
      // Create prediction endpoint
      server.middlewares.use('/api/replicate/predictions', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405).end('Method not allowed')
          return
        }

        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        try {
          const body = await new Promise<string>((resolve) => {
            let data = ''
            req.on('data', (chunk) => { data += chunk })
            req.on('end', () => { resolve(data) })
          })

          const payload = JSON.parse(body)

          const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': `Token ${REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
              'Prefer': 'wait',
            },
            body: JSON.stringify(payload),
          })

          const result = await replicateResponse.text()

          // Log errors for debugging
          if (!replicateResponse.ok) {
            console.error('Replicate API error:', {
              status: replicateResponse.status,
              statusText: replicateResponse.statusText,
              body: result,
              payload: JSON.stringify(payload).substring(0, 200), // Truncate for logs
            })
          }

          res.writeHead(replicateResponse.status, { 'Content-Type': 'application/json' })
          res.end(result)
        } catch (error: any) {
          console.error('Replicate proxy error:', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: error?.message || 'Replicate proxy error' }))
        }
      })

      // Poll endpoint for checking prediction status
      server.middlewares.use('/api/replicate/poll', async (req, res) => {
        if (req.method !== 'GET') {
          res.writeHead(405).end('Method not allowed')
          return
        }

        res.setHeader('Access-Control-Allow-Origin', '*')

        try {
          const url = new URL(req.url!, `http://${req.headers.host}`)
          const pollUrl = url.searchParams.get('url')

          if (!pollUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing url parameter' }))
            return
          }

          const replicateResponse = await fetch(pollUrl, {
            headers: {
              'Authorization': `Token ${REPLICATE_API_TOKEN}`,
            },
          })

          const result = await replicateResponse.text()
          res.writeHead(replicateResponse.status, { 'Content-Type': 'application/json' })
          res.end(result)
        } catch (error: any) {
          console.error('Replicate poll error:', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: error?.message || 'Replicate poll error' }))
        }
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
    replicatePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@compositions': path.resolve(__dirname, './src/compositions'),
      '@vibee/atoms': path.resolve(__dirname, '../packages/vibee-atoms/src'),
      '@vibee/ui': path.resolve(__dirname, '../packages/ui/src'),
      '@vibee/ui/timeline': path.resolve(__dirname, '../packages/ui/src/timeline'),
      'react': path.resolve(__dirname, 'node_modules/react'),
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
        bypass: (req) => {
          if (req.url?.startsWith('/api/replicate')) {
            return '/api/replicate'  // This will be handled by middleware
          }
          return null
        },
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/renders': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * ЗНАЧКИ — ОДНИМ ФАЙЛОМ, а не тридцатью.
         *
         * Замер сборки 2026-08-26: 45 чанков, из них 30 меньше 2 КБ, самые
         * мелкие — 120–154 байта (`check`, `chevron-down`, `plus`). Каждый
         * такой файл на телефоне это отдельный запрос: rollup режет
         * lucide-react по одной иконке на модуль, и маршрут редактора просил
         * дюжину с лишним таких залпом.
         *
         * Ценой был чёрный экран: сорвавшаяся загрузка любого из них убивала
         * монтирование целиком (запасной экран теперь хотя бы говорит об
         * этом словами, но лечить надо причину).
         *
         * Кладём все иконки в один чанк. Он кэшируется целиком и почти не
         * меняется между сборками, поэтому «лишний» вес приходит один раз, а
         * экономятся десятки round trip'ов на каждом холодном заходе.
         */
        manualChunks(id: string) {
          if (id.includes('node_modules/lucide-react')) return 'icons'
          return undefined
        },
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        bypass: (req) => {
          if (req.url?.startsWith('/api/replicate')) {
            return '/api/replicate'
          }
          return null
        },
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/renders': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})
