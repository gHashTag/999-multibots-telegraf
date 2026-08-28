/**
 * 🧪 Тесты для SceneTransition - безопасных переходов между сценами
 *
 * Тестирует:
 * - safeEnterScene() - безопасный переход с fallback
 * - goBack() - возврат на предыдущую сцену
 * - goToMainMenu() - переход в главное меню
 * - getPreviousScene() - получение предыдущей сцены
 * - getHistoryDepth() - глубина истории навигации
 * - clearNavigationHistory() - очистка истории
 * - canGoBack() - проверка возможности возврата
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import {
  safeEnterScene,
  goBack,
  goToMainMenu,
  getPreviousScene,
  getHistoryDepth,
  clearNavigationHistory,
  canGoBack,
  SceneTransitionOptions,
} from '@/navigation/helpers/sceneTransition'
import { ModeEnum } from '@/interfaces/modes'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import type { MutableCtx } from '../helpers/mutableContext'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('SceneTransition', () => {
  let mockContext: MutableCtx
  let mockSceneEnter: Mock
  let mockSceneLeave: Mock

  beforeEach(() => {
    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      session: {
        navigationHistory: [],
      } as any,
      scene: {
        current: { id: 'currentScene' },
        leave: mockSceneLeave,
        enter: mockSceneEnter,
        state: {},
      } as any,
    }
  })

  describe('safeEnterScene()', () => {
    it('выполняет успешный переход в сцену', async () => {
      const result = await safeEnterScene(mockContext as MyContext, 'newScene')

      expect(result).toBe(true)
      expect(mockSceneLeave).toHaveBeenCalled()
      expect(mockSceneEnter).toHaveBeenCalledWith('newScene')
    })

    it('сохраняет историю навигации по умолчанию', async () => {
      await safeEnterScene(mockContext as MyContext, 'newScene')

      expect(mockContext.session?.navigationHistory).toContain('currentScene')
    })

    it('не сохраняет в историю при saveToHistory: false', async () => {
      await safeEnterScene(mockContext as MyContext, 'newScene', {
        saveToHistory: false,
      })

      expect(mockContext.session?.navigationHistory).toHaveLength(0)
    })

    it('не выходит из сцены при leaveFirst: false', async () => {
      await safeEnterScene(mockContext as MyContext, 'newScene', {
        leaveFirst: false,
      })

      expect(mockSceneLeave).not.toHaveBeenCalled()
      expect(mockSceneEnter).toHaveBeenCalledWith('newScene')
    })

    it('устанавливает mode в сессию если указан', async () => {
      await safeEnterScene(mockContext as MyContext, 'newScene', {
        mode: ModeEnum.Balance,
      })

      expect(mockContext.session?.mode).toBe(ModeEnum.Balance)
    })

    it('устанавливает sceneState если указан', async () => {
      const sceneState = { testData: 'value' }
      await safeEnterScene(mockContext as MyContext, 'newScene', { sceneState })

      expect(mockContext.scene?.state).toEqual(sceneState)
    })

    it('ограничивает историю до MAX_HISTORY_DEPTH (5)', async () => {
      mockContext.session!.navigationHistory = [
        'scene1',
        'scene2',
        'scene3',
        'scene4',
        'scene5',
      ]

      await safeEnterScene(mockContext as MyContext, 'newScene')

      // История должна быть не больше 5 элементов
      expect(
        mockContext.session?.navigationHistory?.length
      ).toBeLessThanOrEqual(5)
    })

    it('не добавляет дубликаты подряд в историю', async () => {
      mockContext.session!.navigationHistory = ['scene1', 'currentScene']

      await safeEnterScene(mockContext as MyContext, 'newScene')

      // Не должно быть двух currentScene подряд
      const history = mockContext.session?.navigationHistory || []
      for (let i = 0; i < history.length - 1; i++) {
        expect(history[i]).not.toBe(history[i + 1])
      }
    })

    it('не сохраняет в историю при переходе в ту же сцену', async () => {
      const initialLength = mockContext.session?.navigationHistory?.length || 0

      await safeEnterScene(mockContext as MyContext, 'currentScene')

      // История не должна измениться
      expect(mockContext.session?.navigationHistory?.length).toBe(initialLength)
    })

    it('обрабатывает ошибку перехода и делает fallback', async () => {
      mockSceneEnter.mockRejectedValueOnce(new Error('Scene error'))
      // Второй вызов для fallback на MainMenu
      mockSceneEnter.mockResolvedValueOnce(undefined)

      const result = await safeEnterScene(mockContext as MyContext, 'badScene')

      expect(result).toBe(false)
      // Должен попытаться перейти в MainMenu как fallback
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('обрабатывает отсутствие текущей сцены', async () => {
      mockContext.scene!.current = null as any

      const result = await safeEnterScene(mockContext as MyContext, 'newScene')

      expect(result).toBe(true)
      expect(mockSceneEnter).toHaveBeenCalledWith('newScene')
    })
  })

  describe('goBack()', () => {
    it('возвращает на предыдущую сцену из истории', async () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      const result = await goBack(mockContext as MyContext)

      expect(result).toBe(true)
      expect(mockSceneEnter).toHaveBeenCalledWith('scene2')
    })

    it('удаляет сцену из истории после перехода', async () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      await goBack(mockContext as MyContext)

      expect(mockContext.session?.navigationHistory).toEqual(['scene1'])
    })

    it('переходит в MainMenu если история пуста', async () => {
      mockContext.session!.navigationHistory = []

      const result = await goBack(mockContext as MyContext)

      expect(result).toBe(true)
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('не сохраняет в историю при возврате (избегает цикла)', async () => {
      mockContext.session!.navigationHistory = ['scene1']
      const initialLength = 1

      await goBack(mockContext as MyContext)

      // История должна уменьшиться, а не увеличиться
      expect(mockContext.session?.navigationHistory?.length).toBeLessThan(
        initialLength
      )
    })
  })

  describe('goToMainMenu()', () => {
    it('переходит в главное меню', async () => {
      const result = await goToMainMenu(mockContext as MyContext)

      expect(result).toBe(true)
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('очищает историю по умолчанию', async () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      await goToMainMenu(mockContext as MyContext)

      expect(mockContext.session?.navigationHistory).toEqual([])
    })

    it('сохраняет историю при clearHistory: false', async () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2']

      await goToMainMenu(mockContext as MyContext, false)

      expect(mockContext.session?.navigationHistory).toEqual([
        'scene1',
        'scene2',
      ])
    })

    it('не сохраняет в историю при переходе', async () => {
      mockContext.session!.navigationHistory = []

      await goToMainMenu(mockContext as MyContext)

      expect(mockContext.session?.navigationHistory).toEqual([])
    })
  })

  describe('getPreviousScene()', () => {
    it('возвращает последнюю сцену из истории', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2', 'scene3']

      const result = getPreviousScene(mockContext as MyContext)

      expect(result).toBe('scene3')
    })

    it('возвращает null если история пуста', () => {
      mockContext.session!.navigationHistory = []

      const result = getPreviousScene(mockContext as MyContext)

      expect(result).toBeNull()
    })

    it('возвращает null если navigationHistory undefined', () => {
      mockContext.session!.navigationHistory = undefined as any

      const result = getPreviousScene(mockContext as MyContext)

      expect(result).toBeNull()
    })
  })

  describe('getHistoryDepth()', () => {
    it('возвращает количество сцен в истории', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2', 'scene3']

      const result = getHistoryDepth(mockContext as MyContext)

      expect(result).toBe(3)
    })

    it('возвращает 0 если история пуста', () => {
      mockContext.session!.navigationHistory = []

      const result = getHistoryDepth(mockContext as MyContext)

      expect(result).toBe(0)
    })

    it('возвращает 0 если navigationHistory undefined', () => {
      mockContext.session!.navigationHistory = undefined as any

      const result = getHistoryDepth(mockContext as MyContext)

      expect(result).toBe(0)
    })
  })

  describe('clearNavigationHistory()', () => {
    it('очищает историю навигации', () => {
      mockContext.session!.navigationHistory = ['scene1', 'scene2', 'scene3']

      clearNavigationHistory(mockContext as MyContext)

      expect(mockContext.session?.navigationHistory).toEqual([])
    })

    it('работает если история уже пуста', () => {
      mockContext.session!.navigationHistory = []

      clearNavigationHistory(mockContext as MyContext)

      expect(mockContext.session?.navigationHistory).toEqual([])
    })
  })

  describe('canGoBack()', () => {
    it('возвращает true если история не пуста', () => {
      mockContext.session!.navigationHistory = ['scene1']

      const result = canGoBack(mockContext as MyContext)

      expect(result).toBe(true)
    })

    it('возвращает false если история пуста', () => {
      mockContext.session!.navigationHistory = []

      const result = canGoBack(mockContext as MyContext)

      expect(result).toBe(false)
    })

    it('возвращает false если navigationHistory undefined', () => {
      mockContext.session!.navigationHistory = undefined as any

      const result = canGoBack(mockContext as MyContext)

      expect(result).toBe(false)
    })
  })

  describe('SceneTransitionOptions', () => {
    it('поддерживает все опции одновременно', async () => {
      const options: SceneTransitionOptions = {
        leaveFirst: true,
        saveToHistory: true,
        mode: ModeEnum.Balance,
        sceneState: { key: 'value' },
      }

      await safeEnterScene(mockContext as MyContext, 'newScene', options)

      expect(mockSceneLeave).toHaveBeenCalled()
      expect(mockSceneEnter).toHaveBeenCalledWith('newScene')
      expect(mockContext.session?.mode).toBe(ModeEnum.Balance)
      expect(mockContext.scene?.state).toEqual({ key: 'value' })
    })

    it('использует дефолтные значения если опции не указаны', async () => {
      await safeEnterScene(mockContext as MyContext, 'newScene')

      // leaveFirst по умолчанию true
      expect(mockSceneLeave).toHaveBeenCalled()
      // saveToHistory по умолчанию true
      expect(mockContext.session?.navigationHistory).toContain('currentScene')
    })
  })

  describe('Edge cases', () => {
    it('обрабатывает отсутствие from', async () => {
      mockContext.from = undefined

      const result = await safeEnterScene(mockContext as MyContext, 'newScene')

      expect(result).toBe(true)
    })

    it('обрабатывает отсутствие session', async () => {
      mockContext.session = undefined as any

      // Должен не упасть
      await expect(
        safeEnterScene(mockContext as MyContext, 'newScene')
      ).resolves.toBeDefined()
    })

    it('обрабатывает ошибку в scene.leave', async () => {
      mockSceneLeave.mockRejectedValueOnce(new Error('Leave error'))
      mockSceneEnter.mockResolvedValueOnce(undefined) // Для fallback

      const result = await safeEnterScene(mockContext as MyContext, 'newScene')

      expect(result).toBe(false)
    })

    it('обрабатывает double fallback failure gracefully', async () => {
      mockSceneEnter.mockRejectedValue(new Error('Enter error'))
      mockSceneLeave.mockRejectedValue(new Error('Leave error'))

      // Не должен падать, просто вернёт false
      const result = await safeEnterScene(mockContext as MyContext, 'newScene')

      expect(result).toBe(false)
    })
  })
})
