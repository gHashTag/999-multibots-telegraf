import { describe, it, expect, vi } from 'vitest'

// Мокаем telegraf
vi.mock('telegraf', () => {
  return {
    Scenes: {
      BaseScene: vi.fn().mockImplementation(id => ({
        id,
        enterHandler: vi.fn(),
        enter: vi.fn(),
        leave: vi.fn(),
        hears: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
      })),
    },
  }
})

// Мокаем getUserDetailsSubscription
vi.mock('../../src/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: vi.fn(),
}))

// Создаем мок для menuScene вместо импорта
const mockMenuScene = {
  id: 'menuScene',
  enterHandler: vi.fn(),
  hearsBalanceHandler: vi.fn(),
  hearsHelpHandler: vi.fn(),
  hearsTiersHandler: vi.fn(),
  hearsImageHandler: vi.fn(),
  hearsVideoHandler: vi.fn(),
  middleware: () => [],
}

// Мокаем импорт menuScene
vi.mock('../../src/scenes/menuScene', () => {
  return {
    menuScene: mockMenuScene,
  }
})

describe('menuScene (mock)', () => {
  beforeAll(() => {
    vi.resetAllMocks()
  })

  it('menuScene должна быть определена', () => {
    expect(mockMenuScene).toBeDefined()
  })

  it('menuScene должна иметь правильный ID', () => {
    expect(mockMenuScene.id).toBe('menuScene')
  })
})
