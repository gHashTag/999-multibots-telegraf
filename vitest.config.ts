/// <reference types="vitest" />
import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process', 'util'],
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [...configDefaults.exclude, 'e2e/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/app.ts',
        'src/bot.ts',
        'src/api-server/**',
        'src/utils/logger.ts',
        'src/core/supabase/migrations',
        '**/*.d.ts',
        'dist/**',
        'src/test/**',
      ],
    },
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters: ['default'],
    bail: 0,
    threads: true,
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      {
        find: 'telegraf',
        replacement: path.resolve(
          __dirname,
          'node_modules/telegraf/lib/index.js'
        ),
      },
      {
        find: 'telegraf/scenes',
        replacement: path.resolve(
          __dirname,
          'node_modules/telegraf/lib/scenes.js'
        ),
      },
      {
        find: 'telegraf/typings/scenes',
        replacement: path.resolve(
          __dirname,
          './__tests__/mocks/telegraf/typings/scenes'
        ),
      },
      {
        find: 'telegraf/typings/core/types/typegram',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/telegraf/typings/core/types/typegram.ts'
        ),
      },
      {
        find: '../interfaces/telegram-bot.interface',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/telegram-bot.interface.ts'
        ),
      },
      {
        find: '../../src/scenes',
        replacement: path.resolve(__dirname, '__tests__/mocks/scenes/index.ts'),
      },
      {
        find: '#mocks',
        replacement: path.resolve(__dirname, './__tests__/mocks'),
      },
    ],
    deps: {
      inline: ['telegraf'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'telegraf/typings/scenes': path.resolve(
        __dirname,
        './__tests__/mocks/telegraf/typings/scenes'
      ),
      '#mocks': path.resolve(__dirname, './__tests__/mocks'),
    },
  },
})
