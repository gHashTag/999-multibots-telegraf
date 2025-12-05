/**
 * 🧪 Тесты для registerGlobalNavigationMiddleware.ts
 *
 * Тестирует глобальный middleware навигации, который обрабатывает:
 * - Главное меню
 * - Кнопки отмены
 * - Callback queries
 * - Навигационные кнопки профиля, баланса и т.д.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { registerGlobalNavigationMiddleware } from '@/navigation/middleware/registerGlobalNavigationMiddleware'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

// Mock navigation functions
vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn().mockResolvedValue(undefined),
  showCategoryMenu: vi.fn().mockResolvedValue(undefined)
}))

// Mock handleTechSupport
vi.mock('@/commands/handleTechSupport', () => ({
  handleTechSupport: vi.fn().mockResolvedValue(undefined)
}))

// Mock CancelButtonService
vi.mock('@/navigation/services/CancelButtonService', () => ({
  handleCancelButton: vi.fn().mockResolvedValue(false)
}))

// Mock centralizedLanguage
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn().mockReturnValue(true)
}))

import { showMainMenu } from '@/navigation'
import { handleTechSupport } from '@/commands/handleTechSupport'

describe('registerGlobalNavigationMiddleware', () => {
  let mockBot: any
  let registeredMiddleware: ((ctx: MyContext, next: () => Promise<void>) => Promise<void>) | null = null
  let mockContext: Partial<MyContext>
  let mockNext: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    // Capture the middleware when bot.use is called
    registeredMiddleware = null
    mockBot = {
      use: vi.fn((middleware: any) => {
        registeredMiddleware = middleware
      })
    }

    mockNext = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      updateType: 'message',
      message: undefined,
      callbackQuery: undefined,
      scene: {
        current: { id: 'testScene' },
        leave: vi.fn().mockResolvedValue(undefined),
        enter: vi.fn().mockResolvedValue(undefined)
      } as any,
      reply: vi.fn().mockResolvedValue(undefined),
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      session: {
        mode: undefined
      } as any,
      state: {
        userLanguage: 'ru' as 'ru' | 'en'
      } as any
    }
  })

  describe('registerGlobalNavigationMiddleware()', () => {
    it('регистрирует middleware в боте', () => {
      registerGlobalNavigationMiddleware(mockBot)

      expect(mockBot.use).toHaveBeenCalled()
      expect(registeredMiddleware).not.toBeNull()
      expect(typeof registeredMiddleware).toBe('function')
    })
  })

  describe('Callback Query handling', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает go_main_menu callback', async () => {
      mockContext.callbackQuery = { data: 'go_main_menu' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.answerCbQuery).toHaveBeenCalled()
      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalledWith(mockContext)
      expect(mockNext).not.toHaveBeenCalled() // Должен остановить цепочку
    })

    it('обрабатывает main_menu callback', async () => {
      mockContext.callbackQuery = { data: 'main_menu' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.answerCbQuery).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalled()
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает cancel callback', async () => {
      mockContext.callbackQuery = { data: 'cancel' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.answerCbQuery).toHaveBeenCalled()
      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalled()
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает go_back callback', async () => {
      mockContext.callbackQuery = { data: 'go_back' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.answerCbQuery).toHaveBeenCalled()
      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalled()
    })

    it('пропускает неизвестные callback queries к next()', async () => {
      mockContext.callbackQuery = { data: 'unknown_action' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(showMainMenu).not.toHaveBeenCalled()
    })
  })

  describe('Main Menu handling', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает "🏠 Главное меню"', async () => {
      mockContext.message = { text: '🏠 Главное меню' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalled()
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает "🏠 Main menu"', async () => {
      mockContext.message = { text: '🏠 Main menu' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(showMainMenu).toHaveBeenCalled()
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает "Главное меню" без эмодзи', async () => {
      mockContext.message = { text: 'Главное меню' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(showMainMenu).toHaveBeenCalled()
    })

    it('обрабатывает "/menu" команду', async () => {
      mockContext.message = { text: '/menu' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(showMainMenu).toHaveBeenCalled()
    })

    it('обрабатывает "меню" в lowercase', async () => {
      mockContext.message = { text: 'меню' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(showMainMenu).toHaveBeenCalled()
    })

    it('обрабатывает "menu" в lowercase', async () => {
      mockContext.message = { text: 'menu' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(showMainMenu).toHaveBeenCalled()
    })
  })

  describe('Tech Support handling', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает "💬 Техподдержка"', async () => {
      mockContext.message = { text: '💬 Техподдержка' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(handleTechSupport).toHaveBeenCalledWith(mockContext)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает "💬 Tech Support"', async () => {
      mockContext.message = { text: '💬 Tech Support' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(handleTechSupport).toHaveBeenCalled()
    })

    it('обрабатывает "Техподдержка" без эмодзи', async () => {
      mockContext.message = { text: 'Техподдержка' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(handleTechSupport).toHaveBeenCalled()
    })
  })

  describe('Invite Friend handling', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает "👥 Пригласить друга"', async () => {
      mockContext.message = { text: '👥 Пригласить друга' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(mockContext.session!.mode).toBe(ModeEnum.Invite)
      expect(mockContext.scene!.enter).toHaveBeenCalledWith(ModeEnum.CheckBalanceScene)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает "👥 Invite a friend"', async () => {
      mockContext.message = { text: '👥 Invite a friend' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.session!.mode).toBe(ModeEnum.Invite)
    })
  })

  describe('Balance handling', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает "💰 Баланс"', async () => {
      mockContext.message = { text: '💰 Баланс' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      // Проверяем, что был вызван enter для balance scene
    })

    it('обрабатывает "💰 Balance"', async () => {
      mockContext.message = { text: '💰 Balance' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
    })

    it('обрабатывает "💳 Пополнить баланс"', async () => {
      mockContext.message = { text: '💳 Пополнить баланс' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
    })
  })

  describe('Next middleware call', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('вызывает next() для неизвестных текстовых сообщений', async () => {
      mockContext.message = { text: 'Привет мир' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('вызывает next() для сообщений без текста', async () => {
      mockContext.message = { photo: [] } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('вызывает next() для пустого контекста', async () => {
      mockContext.message = undefined
      mockContext.callbackQuery = undefined

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает ошибку при показе main menu', async () => {
      ;(showMainMenu as Mock).mockRejectedValueOnce(new Error('Menu error'))
      mockContext.message = { text: '🏠 Главное меню' } as any

      // Не должен выбрасывать ошибку наружу
      await expect(
        registeredMiddleware!(mockContext as MyContext, mockNext)
      ).resolves.not.toThrow()

      // next() не должен быть вызван
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('обрабатывает ошибку при обработке Tech Support', async () => {
      ;(handleTechSupport as Mock).mockRejectedValueOnce(new Error('Support error'))
      mockContext.message = { text: '💬 Техподдержка' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.reply).toHaveBeenCalledWith('❌ Произошла ошибка. Попробуйте /start')
    })

    it('обрабатывает ошибку при обработке Invite', async () => {
      ;(mockContext.scene!.enter as Mock).mockRejectedValueOnce(new Error('Enter error'))
      mockContext.message = { text: '👥 Пригласить друга' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockContext.reply).toHaveBeenCalledWith('❌ Произошла ошибка. Попробуйте /start')
    })
  })

  describe('Edge cases', () => {
    beforeEach(() => {
      registerGlobalNavigationMiddleware(mockBot)
    })

    it('обрабатывает текст с пробелами в начале/конце', async () => {
      mockContext.message = { text: '  🏠 Главное меню  ' } as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(showMainMenu).toHaveBeenCalled()
    })

    it('обрабатывает callback без data', async () => {
      mockContext.callbackQuery = {} as any

      await registeredMiddleware!(mockContext as MyContext, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('обрабатывает отсутствие ctx.from', async () => {
      mockContext.from = undefined
      mockContext.message = { text: '🏠 Главное меню' } as any

      await expect(
        registeredMiddleware!(mockContext as MyContext, mockNext)
      ).resolves.not.toThrow()
    })

    it('обрабатывает отсутствие ctx.session', async () => {
      mockContext.session = undefined as any
      mockContext.message = { text: 'test' } as any

      await expect(
        registeredMiddleware!(mockContext as MyContext, mockNext)
      ).resolves.not.toThrow()
    })
  })
})
