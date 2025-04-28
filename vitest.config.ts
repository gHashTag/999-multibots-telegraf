/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  plugins: [tsconfigPaths()],
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
      '**/*.config.ts',
      '**/*.cjs',
      'src/interfaces/**',
      'src/bot.ts',
      'src/core/supabase/client.ts',
    ],
    testTimeout: 30000,
    reporters: [
      'default',
      // process.env.GITHUB_ACTIONS === 'true'
      //   ? 'vitest-github-actions-reporter'
      //   : ''
    ].filter(Boolean),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        'src/**/*.d.ts',
        '**/__tests__/**',
        '**/*.config.ts',
        '**/*.cjs',
        'src/interfaces/**',
        'src/bot.ts',
        'src/core/supabase/client.ts',
      ],
    },
  },
})
