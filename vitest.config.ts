<<<<<<< HEAD
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
=======
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true, // Включаем глобальные переменные (describe, it, expect и т.д.)
    environment: 'node', // Указываем окружение Node.js для бэкенд-тестов
    coverage: {
      provider: 'v8', // Используем V8 для покрытия (быстрее)
      reporter: ['text', 'json', 'html'], // Форматы отчетов
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/__tests__/**', // Можно исключить саму папку тестов из отчета
        '**/*.config.ts',
        '**/*.cjs',
        'src/interfaces/**', // Часто интерфейсы не требуют тестов
        'src/bot.ts', // Точка входа может быть сложна для unit-тестов
        'src/core/supabase/client.ts', // Клиент Supabase
      ],
    },
    // Опционально: настройка для поиска тестовых файлов
    // include: ['src/**/*.test.{ts,tsx}'],
    // exclude: ['node_modules', 'dist', ...]
>>>>>>> origin/feat/vitest-integration
  },
})
