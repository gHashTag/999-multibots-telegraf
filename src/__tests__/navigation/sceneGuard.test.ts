/**
 * 🧪 Тесты для sceneGuard - защита навигации в глубоких сценах
 *
 * Тестирует:
 * - checkNavigationDepth() - проверка глубины навигации
 * - handleMainMenuButton() - обработка кнопки главного меню
 * - handleCancelButton() - обработка кнопки отмены
 * - handleBackButton() - обработка кнопки назад
 * - handleNavigationButton() - универсальный обработчик
 * - createSceneGuardMiddleware() - создание middleware
 * - addSceneGuard() - добавление защиты в сцену
 * - isStuckNavigation() - определение застрявшей навигации
 * - forceNavigationReset() - принудительный сброс
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import {
  checkNavigationDepth,
  handleMainMenuButton,
  handleCancelButton,
  handleBackButton,
  handleNavigationButton,
  createSceneGuardMiddleware,
  isStuckNavigation,
  forceNavigationReset,
  SceneGuardConfig,
} from '@/navigation/middleware/sceneGuard'
import { ModeEnum } from '@/interfaces/modes'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock navigationLogger
vi.mock('@/navigation/helpers/navigationLogger', () => ({
  logButtonPress: vi.fn(),
  logMainMenuReturn: vi.fn(),
  logCancel: vi.fn(),
  logGoBack: vi.fn(),
  logNavigationWarning: vi.fn(),
  logNavigationError: vi.fn(),
  dumpNavigationState: vi.fn(),
}))

// Mock sceneTransition
vi.mock('@/navigation/helpers/sceneTransition', () => ({
  goBack: vi.fn().mockResolvedValue(true),
  goToMainMenu: vi.fn().mockResolvedValue(true),
}))

// Mock buttonMatcher
vi.mock('@/navigation/middleware/buttonMatcher', () => ({
  matchButton: vi.fn(),
  isMainMenuButton: vi.fn(),
  isCancelButton: vi.fn(),
  isBackButton: vi.fn(),
}))

import { goBack, goToMainMenu } from '@/navigation/helpers/sceneTransition'
import {
  matchButton,
  isMainMenuButton,
  isCancelButton,
  isBackButton,
} from '@/navigation/middleware/buttonMatcher'
import type { MutableCtx } from '../helpers/mutableContext'

describe('sceneGuard', () => {
  let mockContext: MutableCtx
  let mockSceneEnter: Mock
  let mockSceneLeave: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      message: { text: 'test' } as any,
      session: {
        navigationHistory: [],
        mode: ModeEnum.MainMenu,
      } as any,
      scene: {
        current: { id: 'testScene' },
        leave: mockSceneLeave,
        enter: mockSceneEnter,
        state: {},
      } as any,
    }

    // Сбрасываем моки к дефолтным значениям
    ;(isMainMenuButton as Mock).mockReturnValue(false)
    ;(isCancelButton as Mock).mockReturnValue(false)
    ;(isBackButton as Mock).mockReturnValue(false)
    ;(matchButton as Mock).mockReturnValue(null)
  })

  describe('checkNavigationDepth()', () => {
    it('возвращает depth 0 для пустой истории', () => {
      mockContext.session!.navigationHistory = []

      const result = checkNavigationDepth(mockContext as MyContext)

      expect(result.depth).toBe(0)
      expect(result.warning).toBeNull()
      expect(result.shouldForceReset).toBe(false)
    })

    it('возвращает корректную глубину для непустой истории', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      const result = checkNavigationDepth(mockContext as MyContext)

      expect(result.depth).toBe(2)
      expect(result.warning).toBeNull()
      expect(result.shouldForceReset).toBe(false)
    })

    it('возвращает warning при глубине >= 3 (default)', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2', 'scene3']

      const result = checkNavigationDepth(mockContext as MyContext)

      expect(result.depth).toBe(3)
      expect(result.warning).not.toBeNull()
      expect(result.warning).toContain('WARNING')
      expect(result.shouldForceReset).toBe(false)
    })

    it('возвращает shouldForceReset при глубине >= 5 (default)', () => {
      mockContext.session!.navigationHistory = ['s1', 's2', 's3', 's4', 's5']

      const result = checkNavigationDepth(mockContext as MyContext)

      expect(result.depth).toBe(5)
      expect(result.warning).not.toBeNull()
      expect(result.warning).toContain('CRITICAL')
      expect(result.shouldForceReset).toBe(true)
    })

    it('использует кастомную конфигурацию', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']
      const customConfig: SceneGuardConfig = {
        maxDepthWarning: 2,
        maxDepthForceReset: 3,
        excludeScenes: [],
        dumpOnError: false,
      }

      const result = checkNavigationDepth(
        mockContext as MyContext,
        customConfig
      )

      expect(result.depth).toBe(2)
      expect(result.warning).not.toBeNull()
      expect(result.shouldForceReset).toBe(false)
    })

    it('обрабатывает undefined navigationHistory', () => {
      mockContext.session!.navigationHistory = undefined as any

      const result = checkNavigationDepth(mockContext as MyContext)

      expect(result.depth).toBe(0)
      expect(result.warning).toBeNull()
      expect(result.shouldForceReset).toBe(false)
    })
  })

  describe('handleMainMenuButton()', () => {
    it('возвращает false если нет текста сообщения', async () => {
      mockContext.message = undefined

      const result = await handleMainMenuButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает false если текст не является кнопкой главного меню', async () => {
      mockContext.message = { text: 'Привет' } as any
      ;(isMainMenuButton as Mock).mockReturnValue(false)

      const result = await handleMainMenuButton(mockContext as MyContext)

      expect(result).toBe(false)
      expect(goToMainMenu).not.toHaveBeenCalled()
    })

    it('вызывает goToMainMenu и возвращает true для кнопки главного меню', async () => {
      mockContext.message = { text: '🏠 Главное меню' } as any
      ;(isMainMenuButton as Mock).mockReturnValue(true)

      const result = await handleMainMenuButton(mockContext as MyContext)

      expect(result).toBe(true)
      expect(goToMainMenu).toHaveBeenCalledWith(mockContext, true)
    })

    it('делает fallback при ошибке goToMainMenu', async () => {
      mockContext.message = { text: '🏠 Главное меню' } as any
      ;(isMainMenuButton as Mock).mockReturnValue(true)
      ;(goToMainMenu as Mock).mockRejectedValueOnce(
        new Error('Navigation error')
      )

      const result = await handleMainMenuButton(mockContext as MyContext)

      expect(result).toBe(true)
      expect(mockSceneLeave).toHaveBeenCalled()
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('возвращает false при double fallback failure', async () => {
      mockContext.message = { text: '🏠 Главное меню' } as any
      ;(isMainMenuButton as Mock).mockReturnValue(true)
      ;(goToMainMenu as Mock).mockRejectedValueOnce(
        new Error('Navigation error')
      )
      mockSceneLeave.mockRejectedValueOnce(new Error('Leave error'))

      const result = await handleMainMenuButton(mockContext as MyContext)

      expect(result).toBe(false)
    })
  })

  describe('handleCancelButton()', () => {
    it('возвращает false если нет текста сообщения', async () => {
      mockContext.message = undefined

      const result = await handleCancelButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает false если текст не является кнопкой отмены', async () => {
      mockContext.message = { text: 'Привет' } as any
      ;(isCancelButton as Mock).mockReturnValue(false)

      const result = await handleCancelButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('вызывает goToMainMenu и возвращает true для кнопки отмены', async () => {
      mockContext.message = { text: 'Отмена' } as any
      ;(isCancelButton as Mock).mockReturnValue(true)

      const result = await handleCancelButton(mockContext as MyContext)

      expect(result).toBe(true)
      expect(goToMainMenu).toHaveBeenCalledWith(mockContext, true)
    })

    it('возвращает false для excluded сцен', async () => {
      mockContext.message = { text: 'Отмена' } as any
      mockContext.scene!.current = { id: ModeEnum.ChatWithAvatar } as any
      ;(isCancelButton as Mock).mockReturnValue(true)

      const result = await handleCancelButton(mockContext as MyContext)

      expect(result).toBe(false)
      expect(goToMainMenu).not.toHaveBeenCalled()
    })

    it('возвращает false при ошибке goToMainMenu', async () => {
      mockContext.message = { text: 'Отмена' } as any
      ;(isCancelButton as Mock).mockReturnValue(true)
      ;(goToMainMenu as Mock).mockRejectedValueOnce(
        new Error('Navigation error')
      )

      const result = await handleCancelButton(mockContext as MyContext)

      expect(result).toBe(false)
    })
  })

  describe('handleBackButton()', () => {
    it('возвращает false если нет текста сообщения', async () => {
      mockContext.message = undefined

      const result = await handleBackButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает false если текст не является кнопкой назад', async () => {
      mockContext.message = { text: 'Привет' } as any
      ;(isBackButton as Mock).mockReturnValue(false)

      const result = await handleBackButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('вызывает goBack и возвращает true для кнопки назад', async () => {
      mockContext.message = { text: '◀️ Назад' } as any
      ;(isBackButton as Mock).mockReturnValue(true)

      const result = await handleBackButton(mockContext as MyContext)

      expect(result).toBe(true)
      expect(goBack).toHaveBeenCalledWith(mockContext)
    })

    it('возвращает false при ошибке goBack', async () => {
      mockContext.message = { text: '◀️ Назад' } as any
      ;(isBackButton as Mock).mockReturnValue(true)
      ;(goBack as Mock).mockRejectedValueOnce(new Error('Navigation error'))

      const result = await handleBackButton(mockContext as MyContext)

      expect(result).toBe(false)
    })
  })

  describe('handleNavigationButton()', () => {
    it('возвращает false если нет текста сообщения', async () => {
      mockContext.message = undefined

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает false если кнопка не найдена', async () => {
      mockContext.message = { text: 'Привет' } as any
      ;(matchButton as Mock).mockReturnValue(null)

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('обрабатывает mainMenu кнопку', async () => {
      mockContext.message = { text: '🏠 Главное меню' } as any
      ;(matchButton as Mock).mockReturnValue({ button: { id: 'mainMenu' } })
      ;(isMainMenuButton as Mock).mockReturnValue(true)

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(true)
    })

    it('обрабатывает cancel кнопку', async () => {
      mockContext.message = { text: 'Отмена' } as any
      ;(matchButton as Mock).mockReturnValue({ button: { id: 'cancel' } })
      ;(isCancelButton as Mock).mockReturnValue(true)

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(true)
    })

    it('обрабатывает back кнопку', async () => {
      mockContext.message = { text: '◀️ Назад' } as any
      ;(matchButton as Mock).mockReturnValue({ button: { id: 'back' } })
      ;(isBackButton as Mock).mockReturnValue(true)

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(true)
    })

    it('возвращает false для неизвестного типа кнопки', async () => {
      mockContext.message = { text: 'Какая-то кнопка' } as any
      ;(matchButton as Mock).mockReturnValue({ button: { id: 'unknown' } })

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(false)
    })
  })

  describe('createSceneGuardMiddleware()', () => {
    it('возвращает middleware функцию', () => {
      const middleware = createSceneGuardMiddleware()

      expect(typeof middleware).toBe('function')
    })

    it('вызывает next() когда навигация не обработана', async () => {
      const middleware = createSceneGuardMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)
      mockContext.message = { text: 'Привет' } as any
      ;(matchButton as Mock).mockReturnValue(null)

      await middleware(mockContext as MyContext, next)

      expect(next).toHaveBeenCalled()
    })

    it('не вызывает next() когда навигация обработана', async () => {
      const middleware = createSceneGuardMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)
      mockContext.message = { text: '🏠 Главное меню' } as any
      ;(matchButton as Mock).mockReturnValue({ button: { id: 'mainMenu' } })
      ;(isMainMenuButton as Mock).mockReturnValue(true)

      await middleware(mockContext as MyContext, next)

      expect(next).not.toHaveBeenCalled()
    })

    it('принудительно сбрасывает навигацию при excessive depth', async () => {
      const middleware = createSceneGuardMiddleware()
      const next = vi.fn().mockResolvedValue(undefined)
      mockContext.session!.navigationHistory = ['s1', 's2', 's3', 's4', 's5']

      await middleware(mockContext as MyContext, next)

      expect(goToMainMenu).toHaveBeenCalledWith(mockContext, true)
      expect(next).not.toHaveBeenCalled()
    })

    it('использует кастомную конфигурацию', async () => {
      const customConfig: SceneGuardConfig = {
        maxDepthWarning: 1,
        maxDepthForceReset: 2,
        excludeScenes: [],
        dumpOnError: false,
      }
      const middleware = createSceneGuardMiddleware(customConfig)
      const next = vi.fn().mockResolvedValue(undefined)
      mockContext.session!.navigationHistory = ['s1', 's2']

      await middleware(mockContext as MyContext, next)

      expect(goToMainMenu).toHaveBeenCalled()
    })
  })

  describe('isStuckNavigation()', () => {
    it('возвращает false для пустой истории', () => {
      mockContext.session!.navigationHistory = []

      const result = isStuckNavigation(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает false для нормальной глубины', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      const result = isStuckNavigation(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает true для глубины > 3 (не главное меню)', () => {
      mockContext.session!.navigationHistory = ['s1', 's2', 's3', 's4']
      mockContext.scene!.current = { id: 'someScene' } as any

      const result = isStuckNavigation(mockContext as MyContext)

      expect(result).toBe(true)
    })

    it('возвращает false для глубины > 3 в главном меню', () => {
      mockContext.session!.navigationHistory = ['s1', 's2', 's3', 's4']
      mockContext.scene!.current = { id: ModeEnum.MainMenu } as any

      const result = isStuckNavigation(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает true при дубликатах подряд в истории', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene1', 'scene2']

      const result = isStuckNavigation(mockContext as MyContext)

      expect(result).toBe(true)
    })

    it('возвращает false если нет дубликатов подряд', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2', 'scene1']

      const result = isStuckNavigation(mockContext as MyContext)

      expect(result).toBe(false)
    })
  })

  describe('forceNavigationReset()', () => {
    it('очищает историю навигации', async () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      await forceNavigationReset(mockContext as MyContext)

      expect(mockContext.session!.navigationHistory).toEqual([])
    })

    it('устанавливает mode в MainMenu', async () => {
      mockContext.session!.mode = ModeEnum.TextToImage

      await forceNavigationReset(mockContext as MyContext)

      expect(mockContext.session!.mode).toBe(ModeEnum.MainMenu)
    })

    it('вызывает scene.leave()', async () => {
      await forceNavigationReset(mockContext as MyContext)

      expect(mockSceneLeave).toHaveBeenCalled()
    })

    it('вызывает scene.enter(MainMenu)', async () => {
      await forceNavigationReset(mockContext as MyContext)

      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('продолжает при ошибке scene.leave()', async () => {
      mockSceneLeave.mockRejectedValueOnce(new Error('Leave error'))

      await forceNavigationReset(mockContext as MyContext)

      // Должен продолжить и попытаться войти в MainMenu
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('не падает при ошибке scene.enter()', async () => {
      mockSceneEnter.mockRejectedValueOnce(new Error('Enter error'))

      // Функция просто логирует ошибку и не падает
      await forceNavigationReset(mockContext as MyContext)

      // Проверяем, что функция выполнилась - история очищена
      expect(mockContext.session!.navigationHistory).toEqual([])
    })
  })

  describe('Edge cases', () => {
    it('handleNavigationButton обрабатывает сообщение без text', async () => {
      mockContext.message = { photo: [] } as any // Сообщение с фото, без текста

      const result = await handleNavigationButton(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('checkNavigationDepth обрабатывает null session', () => {
      mockContext.session = undefined as any

      const result = checkNavigationDepth(mockContext as MyContext)

      expect(result.depth).toBe(0)
    })

    it('isStuckNavigation обрабатывает null scene', () => {
      mockContext.scene = undefined as any
      mockContext.session!.navigationHistory = ['s1', 's2', 's3', 's4']

      // Не должен падать
      const result = isStuckNavigation(mockContext as MyContext)

      expect(typeof result).toBe('boolean')
    })
  })
})
