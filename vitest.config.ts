import { defineConfig } from 'vitest/config'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true, // Enable Jest-like globals (describe, it, expect)
    environment: 'node', // Set the test environment to Node.js
    setupFiles: ['__tests__/setup.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    include: ['__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Настраиваем алиасы для проблемных путей импорта Telegraf
      'telegraf/typings/core/types/typegram': 'telegraf/types',
      'telegraf/typings/scenes': 'telegraf/scenes',
      'telegraf/typings/session': 'telegraf/session',
    },
  },
  plugins: [
    // Полифиллы для Node.js модулей
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      include: ['fs', 'path', 'buffer', 'events', 'util', 'stream'],
      overrides: {
        fs: 'node:fs',
        path: 'node:path',
      },
    }),
  ],
})

