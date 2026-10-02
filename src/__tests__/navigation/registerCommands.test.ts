/**
 * 🧪 Тесты для registerCommands.ts
 *
 * Тестирует экспорт функции registerCommands.
 * Полное интеграционное тестирование этой функции сложно из-за
 * зависимости от Telegraf Stage и множества сцен.
 */

import { beforeAll, describe, it, expect, vi } from 'vitest'

// Mock logger first
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock apify-client to avoid package resolution issues
vi.mock('apify-client', () => ({
  // Regular function, not an arrow: code does `new ApifyClient(...)`, and
  // vitest 5 constructs the mock implementation with Reflect.construct, which
  // throws on an arrow ("is not a constructor").
  ApifyClient: vi.fn().mockImplementation(function () {
    return {
      actor: vi.fn().mockReturnValue({
        call: vi.fn().mockResolvedValue({ defaultDatasetId: 'test' }),
      }),
      dataset: vi.fn().mockReturnValue({
        listItems: vi.fn().mockResolvedValue({ items: [] }),
      }),
    }
  }),
}))

/*
 * SKIPPED FOR A REASON THAT NO LONGER EXISTS.
 *
 * This read "TODO: Fix apify-client package resolution issue in Vite. These
 * tests are skipped until the package issue is resolved". The package
 * resolution is handled by the `apify-client` mock twenty lines above, and with
 * it the suite passes 2/2 -- measured by un-skipping before this change.
 *
 * The skip outlived its reason, which is the worst kind of skip: it looks like
 * a deliberate decision while in fact nobody re-checked the condition. Such a
 * test's name appears in no red report, because a skipped test does not fail --
 * it is silent.
 */
describe('registerCommands module', () => {
  let module: typeof import('@/navigation/registerCommands')

  // The module under test pulls in the whole bot graph (every scene, every
  // service). Its cold transform measured ~18s on a quiet machine and went past
  // the 30s per-test limit under the pre-push gate's parallel load, so the
  // import lives here, once, with its own budget instead of inside each test.
  // It is still a dynamic import, after the vi.mock calls above.
  beforeAll(async () => {
    module = await import('@/navigation/registerCommands')
  }, 180_000)

  describe('exports', () => {
    it('экспортирует функцию registerCommands', () => {
      expect(module.registerCommands).toBeDefined()
      expect(typeof module.registerCommands).toBe('function')
    })
  })

  describe('registerCommands function signature', () => {
    it('принимает объект с bot', () => {
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
