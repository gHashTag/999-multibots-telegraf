import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // Возвращаем проект для E2E тестов
  {
    name: 'e2e',
    extends: './vitest.config.e2e.ts',
  },
  // Оставляем проект для юнит-тестов
  {
    name: 'unit',
    extends: './vitest.config.mts',
  },
  // Убираем остальные неиспользуемые или несуществующие конфиги
  // './vitest.config.ts',
  // './vitest.config.mjs',
  // './vitest.config.js',
  // './vite-bot.config.ts',
])
