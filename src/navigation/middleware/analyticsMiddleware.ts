/**
 * 📊 АНАЛИТИЧЕСКИЙ MIDDLEWARE ДЛЯ НАВИГАЦИИ
 *
 * Отслеживает и анализирует все навигационные операции:
 * - Статистика переходов
 * - Популярные сцены
 * - Время в сценах
 * - Ошибки навигации
 * - Пути пользователей
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { SceneCategory, AccessLevel } from '@/navigation/SceneRegistry'
import { logger } from '@/utils/logger'

/**
 * Событие навигационной аналитики
 */
export interface NavigationAnalyticsEvent {
  /** Тип события */
  type: 'enter' | 'leave' | 'error' | 'transition'
  /** ID пользователя */
  userId: string
  /** ID сцены */
  sceneId: string
  /** Предыдущая сцена */
  fromScene?: string
  /** Время события */
  timestamp: number
  /** Время в текущей сцене (для leave) */
  duration?: number
  /** Категория сцены */
  sceneCategory: SceneCategory
  /** Успешность операции */
  success: boolean
  /** Сообщение об ошибке (если есть) */
  error?: string
  /** Дополнительные метаданные */
  metadata?: Record<string, unknown>
}

/**
 * Статистика сцены
 */
export interface SceneStats {
  /** ID сцены */
  sceneId: string
  /** Количество входов */
  enters: number
  /** Количество выходов */
  leaves: number
  /** Количество ошибок */
  errors: number
  /** Среднее время в сцене (мс) */
  averageDuration: number
  /** Последнее время входа */
  lastEnterTime?: number
  /** Популярность (входы/время) */
  popularityScore: number
}

/**
 * Статистика переходов
 */
export interface TransitionStats {
  /** Откуда */
  from: string
  /** Куда */
  to: string
  /** Количество переходов */
  count: number
  /** Последний переход */
  lastTransition?: number
}

/**
 * Аналитический сборщик навигационных данных
 */
export class NavigationAnalytics {
  private sceneStats: Map<string, SceneStats> = new Map()
  private transitionStats: Map<string, TransitionStats> = new Map()
  private userScenes: Map<string, Map<string, number>> = new Map() // userId -> sceneId -> timestamp
  private dailyStats: Map<string, Map<string, number>> = new Map() // date -> eventType -> count

  /**
   * Записать событие входа в сцену
   */
  recordSceneEnter(
    ctx: MyContext,
    sceneId: string,
    sceneCategory: SceneCategory
  ): void {
    const userId = ctx.from?.id?.toString() || 'unknown'
    const now = Date.now()

    // Обновляем статистику сцены
    this.updateSceneStats(sceneId, { enters: 1, lastEnterTime: now })

    // Записываем время входа пользователя
    if (!this.userScenes.has(userId)) {
      this.userScenes.set(userId, new Map())
    }
    this.userScenes.get(userId)!.set(sceneId, now)

    // Записываем событие
    const event: NavigationAnalyticsEvent = {
      type: 'enter',
      userId,
      sceneId,
      timestamp: now,
      sceneCategory,
      success: true
    }

    this.recordEvent(event)

    logger.debug('[NavigationAnalytics] Scene enter recorded', {
      userId,
      sceneId,
      category: sceneCategory
    })
  }

  /**
   * Записать событие выхода из сцены
   */
  recordSceneLeave(
    ctx: MyContext,
    sceneId: string,
    sceneCategory: SceneCategory
  ): void {
    const userId = ctx.from?.id?.toString() || 'unknown'
    const now = Date.now()

    // Вычисляем время в сцене
    const userSceneTime = this.userScenes.get(userId)?.get(sceneId)
    const duration = userSceneTime ? now - userSceneTime : 0

    // Обновляем статистику сцены
    this.updateSceneStats(sceneId, { leaves: 1, averageDuration: duration })

    // Удаляем время входа пользователя
    this.userScenes.get(userId)?.delete(sceneId)

    // Записываем событие
    const event: NavigationAnalyticsEvent = {
      type: 'leave',
      userId,
      sceneId,
      timestamp: now,
      duration,
      sceneCategory,
      success: true
    }

    this.recordEvent(event)

    logger.debug('[NavigationAnalytics] Scene leave recorded', {
      userId,
      sceneId,
      duration
    })
  }

  /**
   * Записать ошибку навигации
   */
  recordNavigationError(
    ctx: MyContext,
    sceneId: string,
    sceneCategory: SceneCategory,
    error: string
  ): void {
    const userId = ctx.from?.id?.toString() || 'unknown'

    // Обновляем статистику сцены
    this.updateSceneStats(sceneId, { errors: 1 })

    // Записываем событие
    const event: NavigationAnalyticsEvent = {
      type: 'error',
      userId,
      sceneId,
      timestamp: Date.now(),
      sceneCategory,
      success: false,
      error
    }

    this.recordEvent(event)

    logger.warn('[NavigationAnalytics] Navigation error recorded', {
      userId,
      sceneId,
      error
    })
  }

  /**
   * Записать переход между сценами
   */
  recordTransition(
    ctx: MyContext,
    fromSceneId: string,
    toSceneId: string,
    sceneCategory: SceneCategory
  ): void {
    const userId = ctx.from?.id?.toString() || 'unknown'
    const now = Date.now()

    // Обновляем статистику переходов
    const key = `${fromSceneId}->${toSceneId}`
    const existing = this.transitionStats.get(key)

    if (existing) {
      existing.count++
      existing.lastTransition = now
    } else {
      this.transitionStats.set(key, {
        from: fromSceneId,
        to: toSceneId,
        count: 1,
        lastTransition: now
      })
    }

    // Записываем событие
    const event: NavigationAnalyticsEvent = {
      type: 'transition',
      userId,
      sceneId: toSceneId,
      fromScene: fromSceneId,
      timestamp: now,
      sceneCategory,
      success: true
    }

    this.recordEvent(event)
  }

  /**
   * Обновить статистику сцены
   */
  private updateSceneStats(
    sceneId: string,
    updates: Partial<Pick<SceneStats, 'enters' | 'leaves' | 'errors' | 'averageDuration' | 'lastEnterTime'>>
  ): void {
    const existing = this.sceneStats.get(sceneId) || {
      sceneId,
      enters: 0,
      leaves: 0,
      errors: 0,
      averageDuration: 0,
      popularityScore: 0
    }

    Object.assign(existing, updates)

    // Пересчитываем популярность
    existing.popularityScore = existing.enters / Math.max(existing.averageDuration / 1000 / 60, 1)

    this.sceneStats.set(sceneId, existing)
  }

  /**
   * Записать событие в дневную статистику
   */
  private recordEvent(event: NavigationAnalyticsEvent): void {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    if (!this.dailyStats.has(today)) {
      this.dailyStats.set(today, new Map())
    }

    const dayStats = this.dailyStats.get(today)!
    const eventKey = `${event.type}_${event.sceneId}`

    dayStats.set(eventKey, (dayStats.get(eventKey) || 0) + 1)
  }

  /**
   * Получить топ популярных сцен
   */
  getTopScenes(limit: number = 10): SceneStats[] {
    return Array.from(this.sceneStats.values())
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, limit)
  }

  /**
   * Получить статистику сцены
   */
  getSceneStats(sceneId: string): SceneStats | undefined {
    return this.sceneStats.get(sceneId)
  }

  /**
   * Получить топ переходов
   */
  getTopTransitions(limit: number = 20): TransitionStats[] {
    return Array.from(this.transitionStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  /**
   * Получить дневную статистику
   */
  getDailyStats(date?: string): Map<string, number> {
    const targetDate = date || new Date().toISOString().split('T')[0]
    return this.dailyStats.get(targetDate) || new Map()
  }

  /**
   * Сброс статистики
   */
  reset(): void {
    this.sceneStats.clear()
    this.transitionStats.clear()
    this.userScenes.clear()
    this.dailyStats.clear()
  }

  /**
   * Экспорт статистики в JSON
   */
  exportStats(): string {
    return JSON.stringify({
      sceneStats: Object.fromEntries(this.sceneStats),
      transitionStats: Array.from(this.transitionStats.values()),
      dailyStats: Object.fromEntries(
        Array.from(this.dailyStats.entries()).map(([date, stats]) => [
          date,
          Object.fromEntries(stats)
        ])
      )
    }, null, 2)
  }
}

/**
 * Глобальный экземпляр аналитики
 */
export const navigationAnalytics = new NavigationAnalytics()

/**
 * Middleware для автоматического сбора аналитики
 */
export function createAnalyticsMiddleware() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    const sceneId = ctx.scene.current?.id

    // Записываем вход в сцену
    if (sceneId) {
      // TODO: Получить category из SceneRegistry
      const category = SceneCategory.SYSTEM
      navigationAnalytics.recordSceneEnter(ctx, sceneId, category)
    }

    try {
      await next()
    } finally {
      // Записываем выход из сцены
      if (sceneId) {
        const category = SceneCategory.SYSTEM
        navigationAnalytics.recordSceneLeave(ctx, sceneId, category)
      }
    }
  }
}

export default navigationAnalytics
