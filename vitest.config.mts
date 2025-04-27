/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'
import tsconfigPaths from 'vite-tsconfig-paths'
// import { loadEnv } from 'vite' // loadEnv не используется, убираем пока

// const env = loadEnv('development', process.cwd(), '') // Убираем

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    // Восстанавливаем полный список setupFiles
    setupFiles: [
      'src/__tests__/mocks/logger.mock.ts',
      'src/__tests__/mocks/typegram.mock.ts',
      'src/__tests__/mocks/markup.mock.ts',
      'src/__tests__/mocks/telegraf.mock.ts',
    ],
    include: [
      'src/__tests__/**/*.test.ts',
      '__tests__/e2e/**/*.test.ts',
      '__tests__/example/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'src/__tests__/mocks/**',
      'src/__tests__/types/**',
    ],
    mockReset: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/interfaces/**',
        'src/**/*.d.ts',
        'src/__tests__/**',
        'src/bot.ts',
        'src/server.ts',
      ],
    },
    deps: {
      inline: [/^(?!.*vitest).*$/],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
      {
        find: '@telegraf/types',
        replacement: path.resolve(
          __dirname,
          'src/__tests__/mocks/typegram.mock.ts'
        ),
      },
    ],
  },
})
