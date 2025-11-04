/// <reference types="vitest" />

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../../src'),
      '@/inngest_app': path.resolve(__dirname, '..'),
      '@/utils': path.resolve(__dirname, '../../../src/utils'),
      '@/core': path.resolve(__dirname, '../../../src/core'),
      '@/helpers': path.resolve(__dirname, '../../../src/helpers'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types.ts',
        '**/schemas.ts',
        '**/helpers/**',
      ],
      thresholds: {
        global: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
    include: ['**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    cache: false,
  },
})
