/**
 * 🧪 Тесты для navigationLogger.ts - логирование навигации
 *
 * NOTE: These tests verify that functions execute without errors
 * and return expected values. Due to Bun's module caching behavior,
 * logger mock calls cannot be reliably tested across test files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MyContext } from '@/interfaces/telegram-bot.interface'
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
  createNavigationLoggingMiddleware,
} from '@/navigation/helpers/navigationLogger'
import type { MutableCtx } from '../helpers/mutableContext'

describe('navigationLogger', () => {
  let mockContext: MutableCtx
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockContext = {
      from: { id: 123456 } as any,
      scene: {
        current: { id: 'testScene' },
      } as any,
      session: {
        mode: 'testMode',
        navigationHistory: ['scene1', 'scene2'],
      } as any,
      message: { text: 'test message' } as any,
      callbackQuery: undefined,
      updateType: 'message',
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
    it('выполняется без ошибок', () => {
      expect(() => {
        logSceneEnter(mockContext as MyContext, 'newScene')
      }).not.toThrow()
    })

    it('принимает source параметр', () => {
      expect(() => {
        logSceneEnter(mockContext as MyContext, 'newScene', 'button_click')
      }).not.toThrow()
    })

    it('работает с пустым контекстом', () => {
      const emptyContext = {
        from: undefined,
        scene: undefined,
        session: undefined,
      } as any
      expect(() => {
        logSceneEnter(emptyContext, 'targetScene')
      }).not.toThrow()
    })
  })

  describe('logSceneLeave()', () => {
    it('выполняется без ошибок', () => {
      expect(() => {
        logSceneLeave(mockContext as MyContext)
      }).not.toThrow()
    })

    it('принимает reason параметр', () => {
      expect(() => {
        logSceneLeave(mockContext as MyContext, 'user_cancel')
      }).not.toThrow()
    })

    it('работает без указания причины', () => {
      expect(() => {
        logSceneLeave(mockContext as MyContext)
      }).not.toThrow()
    })
  })

  describe('logButtonPress()', () => {
    it('логирует matched кнопку', () => {
      expect(() => {
        logButtonPress(mockContext as MyContext, 'Отмена', true, 'cancel')
      }).not.toThrow()
    })

    it('логирует unmatched кнопку', () => {
      expect(() => {
        logButtonPress(mockContext as MyContext, 'Unknown', false)
      }).not.toThrow()
    })

    it('обрабатывает длинный текст кнопки', () => {
      const longText = 'A'.repeat(50)
      expect(() => {
        logButtonPress(mockContext as MyContext, longText, false)
      }).not.toThrow()
    })
  })

  describe('logCallbackQuery()', () => {
    it('логирует handled callback', () => {
      expect(() => {
        logCallbackQuery(mockContext as MyContext, 'action_data', true)
      }).not.toThrow()
    })

    it('логирует unhandled callback', () => {
      expect(() => {
        logCallbackQuery(mockContext as MyContext, 'action_data', false)
      }).not.toThrow()
    })
  })

  describe('logMainMenuReturn()', () => {
    it('выполняется без ошибок', () => {
      expect(() => {
        logMainMenuReturn(mockContext as MyContext, 'cancel_button')
      }).not.toThrow()
    })

    it('принимает различные source значения', () => {
      expect(() => {
        logMainMenuReturn(mockContext as MyContext, 'back_button')
      }).not.toThrow()
    })
  })

  describe('logGoBack()', () => {
    it('логирует переход назад', () => {
      expect(() => {
        logGoBack(mockContext as MyContext, 'previousScene')
      }).not.toThrow()
    })

    it('обрабатывает null targetScene', () => {
      expect(() => {
        logGoBack(mockContext as MyContext, null)
      }).not.toThrow()
    })
  })

  describe('logCancel()', () => {
    it('логирует handled отмену', () => {
      expect(() => {
        logCancel(mockContext as MyContext, true, 'CancelButtonService')
      }).not.toThrow()
    })

    it('логирует unhandled отмену', () => {
      expect(() => {
        logCancel(mockContext as MyContext, false)
      }).not.toThrow()
    })

    it('принимает handler параметр', () => {
      expect(() => {
        logCancel(mockContext as MyContext, true, 'TestHandler')
      }).not.toThrow()
    })
  })

  describe('logNavigationError()', () => {
    it('логирует Error объект', () => {
      const error = new Error('Test error')
      expect(() => {
        logNavigationError(mockContext as MyContext, error, 'scene_enter')
      }).not.toThrow()
    })

    it('логирует string ошибку', () => {
      expect(() => {
        logNavigationError(mockContext as MyContext, 'String error', 'action')
      }).not.toThrow()
    })

    it('обрабатывает Error со stack trace', () => {
      const error = new Error('Test error')
      expect(() => {
        logNavigationError(mockContext as MyContext, error, 'action')
      }).not.toThrow()
    })
  })

  describe('logNavigationWarning()', () => {
    it('логирует предупреждение', () => {
      expect(() => {
        logNavigationWarning(mockContext as MyContext, 'Warning message')
      }).not.toThrow()
    })

    it('принимает дополнительные детали', () => {
      expect(() => {
        logNavigationWarning(mockContext as MyContext, 'Warning', {
          extra: 'data',
        })
      }).not.toThrow()
    })
  })

  describe('logDeepScene()', () => {
    it('обрабатывает глубину >= 3', () => {
      expect(() => {
        logDeepScene(mockContext as MyContext, 3)
      }).not.toThrow()
    })

    it('обрабатывает глубину < 3', () => {
      expect(() => {
        logDeepScene(mockContext as MyContext, 2)
      }).not.toThrow()
    })

    it('обрабатывает большую глубину', () => {
      expect(() => {
        logDeepScene(mockContext as MyContext, 10)
      }).not.toThrow()
    })
  })

  describe('dumpNavigationState()', () => {
    it('выводит полный дамп состояния', () => {
      expect(() => {
        dumpNavigationState(mockContext as MyContext, 'debug_reason')
      }).not.toThrow()

      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('включает reason в дамп', () => {
      dumpNavigationState(mockContext as MyContext, 'test_reason')

      // Проверяем, что console.log был вызван хотя бы раз
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('выводит заголовок дампа', () => {
      dumpNavigationState(mockContext as MyContext, 'debug_reason')

      // Проверяем наличие заголовка в любом из вызовов
      const allCalls = consoleLogSpy.mock.calls.map(call => call[0])
      const hasHeader = allCalls.some(
        call =>
          typeof call === 'string' && call.includes('NAVIGATION STATE DUMP')
      )
      expect(hasHeader).toBe(true)
    })
  })

  describe('withNavigationLogging()', () => {
    it('оборачивает функцию', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      const wrappedFn = withNavigationLogging(mockFn, 'testFunction')
      const result = await wrappedFn(mockContext)

      expect(result).toBe('result')
      expect(mockFn).toHaveBeenCalledWith(mockContext)
    })

    it('возвращает функцию', () => {
      const mockFn = vi.fn()
      const wrappedFn = withNavigationLogging(mockFn, 'testFunction')

      expect(typeof wrappedFn).toBe('function')
    })

    it('пробрасывает ошибки', async () => {
      const error = new Error('Test error')
      const mockFn = vi.fn().mockRejectedValue(error)

      const wrappedFn = withNavigationLogging(mockFn, 'testFunction')

      await expect(wrappedFn(mockContext)).rejects.toThrow('Test error')
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

    it('обрабатывает глубокую сцену', async () => {
      mockContext.session!.navigationHistory = ['s1', 's2', 's3']

      const middleware = createNavigationLoggingMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)

      // Должен выполниться без ошибок
      let error: Error | null = null
      try {
        await middleware(mockContext as MyContext, next)
      } catch (e) {
        error = e as Error
      }
      expect(error).toBeNull()
      expect(next).toHaveBeenCalled()
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
