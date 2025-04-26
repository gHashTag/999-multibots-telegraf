/// <reference types="vitest" />

import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Конфигурация ТОЛЬКО для E2E тестов
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // E2E тесты не используют моки из setup.ts
    // setupFiles: ["__tests__/setup.ts"],
    include: ['__tests__/e2e/**/*.test.ts'], // Указываем, что этот конфиг только для E2E
    reporters: ['default'], // Оставляем только default для E2E

    // Увеличиваем таймауты для E2E тестов
    testTimeout: 90000, // 1.5 минуты на тест
    hookTimeout: 60000, // 1 минута на хуки (beforeAll/afterAll)
  },
})
