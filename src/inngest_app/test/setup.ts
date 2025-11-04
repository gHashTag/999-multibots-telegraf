/**
 * Global Test Setup
 *
 * Глобальная настройка для всех тестов Inngest функций
 */

import { beforeEach, afterEach, vi } from 'vitest'

// Настройка таймеров для тестов
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Mock global Date для стабильных тестов
const mockDate = new Date('2024-01-01T00:00:00Z')
global.Date = vi.fn(() => mockDate) as any
vi.spyOn(global, 'Date').mockImplementation(() => mockDate)

// Console helpers для тестов
global.console = {
  ...console,
  // Можно добавить подавление логов в тестах при необходимости
  // log: vi.fn(),
  // warn: vi.fn(),
}
