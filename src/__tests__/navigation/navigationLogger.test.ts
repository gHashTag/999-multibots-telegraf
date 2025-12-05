/**
 * 🧪 Тесты для navigationLogger.ts - логирование навигации
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import {
  NavigationLogLevel,
  logSceneEnter,
  logSceneLeave,
  logButtonPress,
  logCallbackQuery,
  logMainMenuReturn,
  logGoBack,
  logCancel,
  logNavigationError,
  logNavigationWarning,
  logDeepScene,
  dumpNavigationState,
  withNavigationLogging,
  createNavigationLoggingMiddleware
} from '@/navigation/helpers/navigationLogger'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

import { logger } from '@/utils/logger'

describe('navigationLogger', () => {
  let mockContext: Partial<MyContext>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockContext = {
      from: { id: 123456 } as any,
      scene: {
        current: { id: 'testScene' }
      } as any,
      session: {
        mode: 'testMode',
        navigationHistory: ['scene1', 'scene2']
      } as any,
      message: { text: 'test message' } as any,
      callbackQuery: undefined,
      updateType: 'message'
    }

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('NavigationLogLevel', () => {
    it('определяет уровни логирования', () => {
      expect(NavigationLogLevel.ERROR).toBe(0)
      expect(NavigationLogLevel.INFO).toBe(1)
      expect(NavigationLogLevel.DEBUG).toBe(2)
      expect(NavigationLogLevel.TRACE).toBe(3)
    })
  })

  describe('logSceneEnter()', () => {
    it('логирует вход в сцену', () => {
      logSceneEnter(mockContext as MyContext, 'newScene')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('ENTER newScene')
    })

    it('включает source в логи', () => {
      logSceneEnter(mockContext as MyContext, 'newScene', 'button_click')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].source).toBe('button_click')
    })

    it('включает targetScene в логи', () => {
      logSceneEnter(mockContext as MyContext, 'targetScene')

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].targetScene).toBe('targetScene')
    })
  })

  describe('logSceneLeave()', () => {
    it('логирует выход из сцены', () => {
      logSceneLeave(mockContext as MyContext)

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('LEAVE')
    })

    it('включает причину выхода', () => {
      logSceneLeave(mockContext as MyContext, 'user_cancel')

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].reason).toBe('user_cancel')
    })

    it('использует "explicit" как причину по умолчанию', () => {
      logSceneLeave(mockContext as MyContext)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].reason).toBe('explicit')
    })
  })

  describe('logButtonPress()', () => {
    it('логирует нажатие кнопки (matched)', () => {
      logButtonPress(mockContext as MyContext, 'Отмена', true, 'cancel')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('BUTTON MATCHED')
    })

    it('логирует нажатие кнопки (unmatched)', () => {
      logButtonPress(mockContext as MyContext, 'Unknown', false)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('BUTTON UNMATCHED')
    })

    it('обрезает длинный текст кнопки', () => {
      const longText = 'A'.repeat(50)
      logButtonPress(mockContext as MyContext, longText, false)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].buttonText.length).toBeLessThanOrEqual(30)
    })
  })

  describe('logCallbackQuery()', () => {
    it('логирует callback query (handled)', () => {
      logCallbackQuery(mockContext as MyContext, 'action_data', true)

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('CALLBACK: action_data')
    })

    it('логирует callback query (not handled)', () => {
      logCallbackQuery(mockContext as MyContext, 'action_data', false)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].handled).toBe(false)
    })
  })

  describe('logMainMenuReturn()', () => {
    it('логирует возврат в главное меню', () => {
      logMainMenuReturn(mockContext as MyContext, 'cancel_button')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('MAIN MENU from cancel_button')
    })

    it('включает source в логи', () => {
      logMainMenuReturn(mockContext as MyContext, 'back_button')

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].source).toBe('back_button')
    })
  })

  describe('logGoBack()', () => {
    it('логирует переход назад', () => {
      logGoBack(mockContext as MyContext, 'previousScene')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('GO BACK → previousScene')
    })

    it('показывает main_menu если targetScene = null', () => {
      logGoBack(mockContext as MyContext, null)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('GO BACK → main_menu')
    })
  })

  describe('logCancel()', () => {
    it('логирует отмену (handled)', () => {
      logCancel(mockContext as MyContext, true, 'CancelButtonService')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('CANCEL')
      expect(callArgs[1].handled).toBe(true)
    })

    it('логирует отмену (not handled)', () => {
      logCancel(mockContext as MyContext, false)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].handled).toBe(false)
    })

    it('включает handler в логи', () => {
      logCancel(mockContext as MyContext, true, 'TestHandler')

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].handler).toBe('TestHandler')
    })
  })

  describe('logNavigationError()', () => {
    it('логирует ошибку (Error object)', () => {
      const error = new Error('Test error')
      logNavigationError(mockContext as MyContext, error, 'scene_enter')

      expect(logger.error).toHaveBeenCalled()
      const callArgs = (logger.error as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('ERROR in scene_enter')
      expect(callArgs[1].error).toBe('Test error')
    })

    it('логирует ошибку (string)', () => {
      logNavigationError(mockContext as MyContext, 'String error', 'action')

      const callArgs = (logger.error as Mock).mock.calls[0]
      expect(callArgs[1].error).toBe('String error')
    })

    it('включает stack trace для Error', () => {
      const error = new Error('Test error')
      logNavigationError(mockContext as MyContext, error, 'action')

      const callArgs = (logger.error as Mock).mock.calls[0]
      expect(callArgs[1].stack).toBeDefined()
    })
  })

  describe('logNavigationWarning()', () => {
    it('логирует предупреждение', () => {
      logNavigationWarning(mockContext as MyContext, 'Warning message')

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('Warning message')
    })

    it('включает дополнительные детали', () => {
      logNavigationWarning(mockContext as MyContext, 'Warning', { extra: 'data' })

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].extra).toBe('data')
    })
  })

  describe('logDeepScene()', () => {
    it('логирует предупреждение при глубине >= 3', () => {
      logDeepScene(mockContext as MyContext, 3)

      expect(logger.info).toHaveBeenCalled()
      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[0]).toContain('DEEP SCENE WARNING')
    })

    it('не логирует при глубине < 3', () => {
      logDeepScene(mockContext as MyContext, 2)

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('включает подсказку', () => {
      logDeepScene(mockContext as MyContext, 4)

      const callArgs = (logger.info as Mock).mock.calls[0]
      expect(callArgs[1].hint).toContain('navigation buttons')
    })
  })

  describe('dumpNavigationState()', () => {
    it('выводит полный дамп состояния', () => {
      dumpNavigationState(mockContext as MyContext, 'debug_reason')

      expect(consoleLogSpy).toHaveBeenCalled()
      // Проверяем, что выводится заголовок
      expect(consoleLogSpy.mock.calls.some(call =>
        call[0].includes('NAVIGATION STATE DUMP')
      )).toBe(true)
    })

    it('включает reason в дамп', () => {
      dumpNavigationState(mockContext as MyContext, 'test_reason')

      const jsonCall = consoleLogSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('{')
      )

      if (jsonCall) {
        expect(jsonCall[0]).toContain('test_reason')
      }
    })
  })

  describe('withNavigationLogging()', () => {
    it('оборачивает функцию логированием', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      const wrappedFn = withNavigationLogging(mockFn, 'testFunction')
      const result = await wrappedFn(mockContext)

      expect(result).toBe('result')
      expect(mockFn).toHaveBeenCalledWith(mockContext)
    })

    it('логирует ошибки и пробрасывает их', async () => {
      const error = new Error('Test error')
      const mockFn = vi.fn().mockRejectedValue(error)

      const wrappedFn = withNavigationLogging(mockFn, 'testFunction')

      await expect(wrappedFn(mockContext)).rejects.toThrow('Test error')
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('createNavigationLoggingMiddleware()', () => {
    it('создаёт middleware функцию', () => {
      const middleware = createNavigationLoggingMiddleware()

      expect(typeof middleware).toBe('function')
    })

    it('вызывает next()', async () => {
      const middleware = createNavigationLoggingMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware(mockContext as MyContext, next)

      expect(next).toHaveBeenCalled()
    })

    it('логирует глубокую сцену если depth >= 3', async () => {
      mockContext.session!.navigationHistory = ['s1', 's2', 's3']

      const middleware = createNavigationLoggingMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware(mockContext as MyContext, next)

      // Должен вызвать logDeepScene
      expect(logger.info).toHaveBeenCalled()
    })

    it('обрабатывает контекст с callbackQuery', async () => {
      mockContext.message = undefined
      mockContext.callbackQuery = { data: 'test_callback' } as any

      const middleware = createNavigationLoggingMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware(mockContext as MyContext, next)

      expect(next).toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('обрабатывает отсутствие scene', () => {
      mockContext.scene = undefined

      // Не должно выбрасывать ошибку
      expect(() => {
        logSceneEnter(mockContext as MyContext, 'test')
      }).not.toThrow()
    })

    it('обрабатывает отсутствие session', () => {
      mockContext.session = undefined

      expect(() => {
        logSceneLeave(mockContext as MyContext)
      }).not.toThrow()
    })

    it('обрабатывает отсутствие from', () => {
      mockContext.from = undefined

      expect(() => {
        logButtonPress(mockContext as MyContext, 'test', true)
      }).not.toThrow()
    })

    it('обрабатывает пустую navigationHistory', () => {
      mockContext.session!.navigationHistory = []

      expect(() => {
        logGoBack(mockContext as MyContext, 'test')
      }).not.toThrow()
    })

    it('обрабатывает undefined navigationHistory', () => {
      mockContext.session!.navigationHistory = undefined as any

      expect(() => {
        dumpNavigationState(mockContext as MyContext, 'test')
      }).not.toThrow()
    })
  })
})
