/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['__tests__/setup.ts'],
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
    },
    deps: {
      optimizer: {
        web: {
          include: ['telegraf', '@telegraf/types', 'telegraf/scenes'],
        },
        ssr: {
          include: ['telegraf', '@telegraf/types', 'telegraf/scenes'],
        },
      },
    },
    mockReset: true,
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
      {
        find: 'telegraf/typings/scenes',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/telegraf-scenes.mock.ts'
        ),
      },
      {
        find: 'telegraf/scenes',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/telegraf-scenes.mock.ts'
        ),
      },
      {
        find: 'telegraf/typings/core/types/typegram',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/typegram.mock.ts'
        ),
      },
      {
        find: '@telegraf/types',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/typegram.mock.ts'
        ),
      },
    ],
  },
})
