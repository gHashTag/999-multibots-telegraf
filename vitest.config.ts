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
  },
})
