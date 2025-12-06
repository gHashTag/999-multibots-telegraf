/**
 * 🧪 Тесты для registerCommands.ts
 *
 * Тестирует экспорт функции registerCommands.
 * Полное интеграционное тестирование этой функции сложно из-за
 * зависимости от Telegraf Stage и множества сцен.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock logger first
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('registerCommands module', () => {
  describe('exports', () => {
    it('экспортирует функцию registerCommands', async () => {
      // Динамический импорт чтобы моки применились
      const module = await import('@/navigation/registerCommands')

      expect(module.registerCommands).toBeDefined()
      expect(typeof module.registerCommands).toBe('function')
    })
  })

  describe('registerCommands function signature', () => {
    it('принимает объект с bot', async () => {
      const module = await import('@/navigation/registerCommands')

      // Проверяем, что функция существует и принимает параметры
      expect(module.registerCommands.length).toBe(1)
    })
  })
})

/**
 * ПРИМЕЧАНИЕ: Полное тестирование registerCommands требует:
 * 1. Реального экземпляра Telegraf
 * 2. Всех 40+ сцен корректно инициализированных
 * 3. Stage middleware
 *
 * Это интеграционный тест, который лучше запускать в Docker
 * с полной конфигурацией бота.
 *
 * Текущее покрытие обеспечивается через:
 * - E2E тесты бота
 * - Ручное тестирование
 * - Тесты отдельных компонентов (scenes, handlers)
 */
