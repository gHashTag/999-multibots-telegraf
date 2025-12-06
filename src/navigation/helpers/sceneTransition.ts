/**
 * 🎯 БЕЗОПАСНЫЕ ПЕРЕХОДЫ МЕЖДУ СЦЕНАМИ
 * 
 * Этот модуль обеспечивает:
 * 1. Безопасный переход с обработкой ошибок
 * 2. Историю навигации для кнопки "Назад"
 * 3. Логирование переходов
 * 4. Fallback на главное меню при ошибках
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

/**
 * Расширение сессии для истории навигации
 */
declare module '@/interfaces/telegram-bot.interface' {
  interface SessionData {
    /** История переходов между сценами (последние 5) */
    navigationHistory?: string[]
  }
}

/**
 * Максимальная глубина истории навигации
 */
const MAX_HISTORY_DEPTH = 5

/**
 * Опции для перехода между сценами
 */
export interface SceneTransitionOptions {
  /** Выйти из текущей сцены перед переходом */
  leaveFirst?: boolean
  /** Сохранить в историю навигации */
  saveToHistory?: boolean
  /** Режим для установки в сессию */
  mode?: ModeEnum | string
  /** Данные для передачи в новую сцену */
  sceneState?: Record<string, unknown>
}

/**
 * Безопасный переход в сцену с обработкой ошибок
 */
export async function safeEnterScene(
  ctx: MyContext,
  sceneId: string,
  options: SceneTransitionOptions = {}
): Promise<boolean> {
  const {
    leaveFirst = true,
    saveToHistory = true,
    mode,
    sceneState
  } = options

  const telegramId = ctx.from?.id
  const currentSceneId = ctx.scene.current?.id

  try {
    logger.info('[SceneTransition] Starting transition', {
      telegramId,
      from: currentSceneId || 'none',
      to: sceneId,
      leaveFirst,
      saveToHistory
    })

    // Сохраняем в историю навигации (до выхода из сцены)
    if (saveToHistory && currentSceneId && currentSceneId !== sceneId) {
      const history = ctx.session.navigationHistory || []
      
      // Не добавляем дубликаты подряд
      if (history[history.length - 1] !== currentSceneId) {
        history.push(currentSceneId)
      }
      
      // Ограничиваем глубину истории
      ctx.session.navigationHistory = history.slice(-MAX_HISTORY_DEPTH)
      
      logger.debug('[SceneTransition] History updated', {
        telegramId,
        history: ctx.session.navigationHistory
      })
    }

    // Выходим из текущей сцены если нужно
    if (leaveFirst && ctx.scene.current) {
      await ctx.scene.leave()
    }

    // Устанавливаем режим если указан
    if (mode) {
      ctx.session.mode = mode
    }

    // Устанавливаем данные для новой сцены если указаны
    if (sceneState) {
      ctx.scene.state = sceneState
    }

    // Входим в новую сцену
    await ctx.scene.enter(sceneId)

    logger.info('[SceneTransition] Transition successful', {
      telegramId,
      to: sceneId
    })

    return true
  } catch (error) {
    logger.error('[SceneTransition] Transition failed', {
      telegramId,
      from: currentSceneId,
      to: sceneId,
      error: error instanceof Error ? error.message : String(error)
    })

    // Fallback: пытаемся показать главное меню
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (fallbackError) {
      logger.error('[SceneTransition] Fallback also failed', {
        telegramId,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      })
    }

    return false
  }
}

/**
 * Вернуться на предыдущую сцену из истории
 */
export async function goBack(ctx: MyContext): Promise<boolean> {
  const telegramId = ctx.from?.id
  const history = ctx.session.navigationHistory || []

  logger.info('[SceneTransition] Going back', {
    telegramId,
    currentScene: ctx.scene.current?.id,
    history
  })

  // Извлекаем последнюю сцену из истории
  const previousSceneId = history.pop()
  ctx.session.navigationHistory = history

  if (previousSceneId) {
    // Переходим на предыдущую сцену БЕЗ сохранения в историю (чтобы не создавать цикл)
    return await safeEnterScene(ctx, previousSceneId, {
      saveToHistory: false
    })
  }

  // Если история пуста - идём в главное меню
  logger.info('[SceneTransition] History empty, going to main menu', {
    telegramId
  })

  return await safeEnterScene(ctx, ModeEnum.MainMenu, {
    saveToHistory: false
  })
}

/**
 * Показать главное меню (сбрасывает историю)
 */
export async function goToMainMenu(ctx: MyContext, clearHistory = true): Promise<boolean> {
  const telegramId = ctx.from?.id

  logger.info('[SceneTransition] Going to main menu', {
    telegramId,
    clearHistory,
    currentScene: ctx.scene.current?.id
  })

  if (clearHistory) {
    ctx.session.navigationHistory = []
  }

  return await safeEnterScene(ctx, ModeEnum.MainMenu, {
    saveToHistory: false
  })
}

/**
 * Получить предыдущую сцену из истории (без перехода)
 */
export function getPreviousScene(ctx: MyContext): string | null {
  const history = ctx.session.navigationHistory || []
  return history[history.length - 1] || null
}

/**
 * Получить глубину истории навигации
 */
export function getHistoryDepth(ctx: MyContext): number {
  return (ctx.session.navigationHistory || []).length
}

/**
 * Очистить историю навигации
 */
export function clearNavigationHistory(ctx: MyContext): void {
  ctx.session.navigationHistory = []
  logger.debug('[SceneTransition] History cleared', {
    telegramId: ctx.from?.id
  })
}

/**
 * Проверить, есть ли куда вернуться
 */
export function canGoBack(ctx: MyContext): boolean {
  const history = ctx.session.navigationHistory || []
  return history.length > 0
}
