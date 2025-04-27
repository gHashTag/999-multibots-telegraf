/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],
    testTimeout: 30000,
    reporters: [
      'default',
      process.env.GITHUB_ACTIONS === 'true' 
        ? 'vitest-github-actions-reporter' 
        : ''
    ].filter(Boolean),
    browser: {
      enabled: false,
      headless: true,
      name: 'chrome',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/test/**',
        'node_modules/**',
        'dist/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'telegraf': resolve(__dirname, './__tests__/mocks/telegraf'),
      'telegraf/types': resolve(__dirname, './__tests__/mocks/telegraf/types'),
      '@telegraf/types': resolve(__dirname, './__tests__/mocks/@telegraf/types'),
    },
  },
})
