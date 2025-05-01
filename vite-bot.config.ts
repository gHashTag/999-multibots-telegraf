import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  plugins: [tsconfigPaths(), nodePolyfills()],
  build: {
    target: 'node18', // Целевая версия Node.js
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/bot.ts'),
      formats: ['cjs'],
      fileName: () => 'bot.js',
    },
    rollupOptions: {
      external: [
        'telegraf',
        'winston',
        'supabase',
        'express',
        'fastify',
        '@fastify/express',
        'node:fs',
        'node:path',
        'node:os',
        'node:net',
        'node:child_process',
      ],
    },
  },
  optimizeDeps: {
    exclude: [
      '@/core/*',
      '@/utils/*',
      '@/interfaces/*',
      '@/scenes/*',
      'winston',
    ],
  },
  server: {
    port: 3000,
    hmr: {
      port: 3001,
    },
  },
})
