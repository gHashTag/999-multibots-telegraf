/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.{js,ts}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
    },
    deps: {
      optimizer: {
        web: {
          include: ['telegraf'],
        },
        ssr: {
          include: ['telegraf'],
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
        find: 'telegraf',
        replacement: path.resolve(__dirname, 'src/test/mocks/telegraf.mock.ts'),
      },
      {
        find: 'telegraf/typings/scenes',
        replacement: path.resolve(
          __dirname,
          'src/test/mocks/telegraf-scenes.mock.ts'
        ),
      },
      {
        find: 'telegraf/typings/core/types/typegram',
        replacement: path.resolve(__dirname, 'src/test/mocks/typegram.mock.ts'),
      },
      {
        find: '@/menu',
        replacement: path.resolve(
          __dirname,
          'src/test/mocks/menu-index.mock.ts'
        ),
      },
      {
        find: '@/menu/index',
        replacement: path.resolve(
          __dirname,
          'src/test/mocks/menu-index.mock.ts'
        ),
      },
      {
        find: /^src\/menu\/index\.ts$/,
        replacement: path.resolve(
          __dirname,
          'src/test/mocks/menu-index.mock.ts'
        ),
      },
    ],
  },
})
