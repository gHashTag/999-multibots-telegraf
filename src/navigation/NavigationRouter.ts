/**
 * 🎯 ЦЕНТРАЛИЗОВАННЫЙ НАВИГАЦИОННЫЙ РОУТЕР
 *
 * Единая точка входа для всех навигационных операций.
 * Обеспечивает:
 * - Безопасные переходы между сценами
 * - Валидацию разрешений
 * - Автоматическое логирование
 * - Обработку ошибок
 * - Поддержку истории навигации
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

import {
  SCENE_REGISTRY,
  SceneCategory,
  AccessLevel,
  SceneStatus,
  getSceneById,
  getSceneByModeEnum,
  isSceneAccessible,
  isTransitionAllowed,
  type SceneMetadata,
} from './SceneRegistry'

import {
  safeEnterScene,
  goBack as sceneGoBack,
  canGoBack,
  clearNavigationHistory,
  getPreviousScene,
} from './helpers/sceneTransition'

import {
  logSceneEnter,
  logSceneLeave,
  logNavigationError as logNavError,
  logNavigationWarning as logNavWarning,
} from './helpers/navigationLogger'

/**
 * Контекст навигационного запроса
 */
export interface NavigationContext {
  /** ID пользователя */
  userId: string
  /** Уровень доступа пользователя */
  userAccessLevel: AccessLevel
  /** Есть ли подписка */
  hasSubscription: boolean
  /** Текущая сцена */
  currentScene?: string
  /** Язык пользователя */
  language: 'ru' | 'en'
}

/**
 * Результат навигационной операции
 */
export interface NavigationResult {
  /** Успешность операции */
  success: boolean
  /** ID сцены, в которую перешли */
  sceneId?: string
  /** Сообщение об ошибке */
  error?: string
  /** Дополнительные данные */
  metadata?: Record<string, unknown>
}

/**
 * Опции для навигации
 */
export interface NavigationOptions {
  /** Сохранить в историю */
  saveToHistory?: boolean
  /** Выйти из текущей сцены */
  leaveCurrent?: boolean
  /** Режим для сессии */
  mode?: ModeEnum | string
  /** Данные для сцены */
  sceneState?: Record<string, unknown>
  /** Пропустить проверку прав */
  skipAccessCheck?: boolean
  /** Принудительный переход (игнорировать блокировки) */
  force?: boolean
}

/**
 * Типы навигационных событий
 */
export enum NavigationEvent {
  SCENE_ENTER = 'scene:enter',
  SCENE_LEAVE = 'scene:leave',
  SCENE_ERROR = 'scene:error',
  ACCESS_DENIED = 'access:denied',
  TRANSITION_BLOCKED = 'transition:blocked',
}

/**
 * Обработчик навигационных событий
 */
export type NavigationEventHandler = (
  event: NavigationEvent,
  context: NavigationContext & { scene?: SceneMetadata },
  error?: Error
) => void | Promise<void>

/**
 * Центральный навигационный роутер
 */
export class NavigationRouter {
  private eventHandlers: Map<NavigationEvent, NavigationEventHandler[]> =
    new Map()
  private defaultAccessLevel = AccessLevel.PUBLIC

  /**
   * Регистрация обработчика событий
   */
  on(event: NavigationEvent, handler: NavigationEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
  }

  /**
   * Удаление обработчика событий
   */
  off(event: NavigationEvent, handler: NavigationEventHandler): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * Создание контекста навигации из контекста Telegraf
   */
  private createNavigationContext(ctx: MyContext): NavigationContext {
    const userId = ctx.from?.id?.toString() || 'unknown'
    const language = isRussianFromState(ctx) ? 'ru' : 'en'

    // Определяем уровень доступа пользователя
    const userAccessLevel = this.getUserAccessLevel(userId)

    // Проверяем подписку
    const hasSubscription = ctx.session?.subscription !== undefined

    return {
      userId,
      userAccessLevel,
      hasSubscription,
      currentScene: ctx.scene.current?.id,
      language,
    }
  }

  /**
   * Определение уровня доступа пользователя
   */
  private getUserAccessLevel(userId: string): AccessLevel {
    // TODO: Получить из базы данных или конфигурации
    // Пока используем простую логику
    if (this.isSuperAdmin(userId)) {
      return AccessLevel.ADMIN
    }
    if (this.isStaff(userId)) {
      return AccessLevel.STAFF
    }
    return AccessLevel.PUBLIC
  }

  /**
   * Проверка супер-админа
   */
  private isSuperAdmin(userId: string): boolean {
    const superAdmins = process.env.SUPER_ADMINS?.split(',') || []
    return superAdmins.includes(userId)
  }

  /**
   * Проверка персонала
   */
  private isStaff(userId: string): boolean {
    // TODO: Реализовать проверку персонала из БД
    return false
  }

  /**
   * Отправка события всем обработчикам
   */
  private async emitEvent(
    event: NavigationEvent,
    navContext: NavigationContext & { scene?: SceneMetadata },
    error?: Error
  ): Promise<void> {
    const handlers = this.eventHandlers.get(event) || []
    await Promise.all(
      handlers.map(handler => handler(event, navContext, error))
    )
  }

  /**
   * Переход в сцену по ID
   */
  async navigateToScene(
    ctx: MyContext,
    sceneId: string,
    options: NavigationOptions = {}
  ): Promise<NavigationResult> {
    const navContext = this.createNavigationContext(ctx)
    const scene = getSceneById(sceneId)

    if (!scene) {
      const error = `Scene not found: ${sceneId}`
      await this.emitEvent(
        NavigationEvent.SCENE_ERROR,
        { ...navContext },
        new Error(error)
      )
      logger.error(`[Navigation] ${error}`, {
        userId: navContext.userId,
        sceneId,
      })
      return { success: false, error }
    }

    if (
      !options.skipAccessCheck &&
      !isSceneAccessible(
        scene,
        navContext.userAccessLevel,
        navContext.hasSubscription
      )
    ) {
      const error = `Access denied to scene: ${sceneId}`
      await this.emitEvent(
        NavigationEvent.ACCESS_DENIED,
        { ...navContext, scene },
        new Error(error)
      )
      logger.warn(`[Navigation] ${error}`, {
        userId: navContext.userId,
        sceneId,
      })
      return { success: false, error }
    }

    if (
      !options.force &&
      navContext.currentScene &&
      !isTransitionAllowed(navContext.currentScene, sceneId)
    ) {
      const error = `Transition blocked: ${navContext.currentScene} -> ${sceneId}`
      await this.emitEvent(
        NavigationEvent.TRANSITION_BLOCKED,
        { ...navContext, scene },
        new Error(error)
      )
      logger.warn(`[Navigation] ${error}`, {
        userId: navContext.userId,
        from: navContext.currentScene,
        to: sceneId,
      })
      return { success: false, error }
    }

    try {
      // Выполняем переход через safeEnterScene
      const transitionOptions = {
        leaveFirst: options.leaveCurrent !== false,
        saveToHistory: options.saveToHistory !== false,
        mode: options.mode,
        sceneState: options.sceneState,
      }

      await safeEnterScene(ctx, sceneId, transitionOptions)

      // Логируем успешный переход
      logger.info('[Navigation] navigate_to_scene', {
        userId: navContext.userId,
        from: navContext.currentScene,
        to: sceneId,
        sceneName: scene.name,
        category: scene.category,
      })

      await this.emitEvent(NavigationEvent.SCENE_ENTER, {
        ...navContext,
        scene,
      })

      return {
        success: true,
        sceneId,
        metadata: {
          sceneName: scene.name,
          category: scene.category,
        },
      }
    } catch (error) {
      const errorMessage = `Failed to navigate to scene ${sceneId}: ${error instanceof Error ? error.message : String(error)}`
      await this.emitEvent(
        NavigationEvent.SCENE_ERROR,
        { ...navContext, scene },
        error as Error
      )
      logger.error(`[Navigation] ${errorMessage}`, {
        userId: navContext.userId,
        sceneId,
        error,
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Переход в сцену по ModeEnum
   */
  async navigateToMode(
    ctx: MyContext,
    modeEnum: ModeEnum | string,
    options: NavigationOptions = {}
  ): Promise<NavigationResult> {
    const scene = getSceneByModeEnum(modeEnum)
    if (!scene) {
      const error = `Scene not found for mode: ${modeEnum}`
      return { success: false, error }
    }

    return this.navigateToScene(ctx, scene.id, options)
  }

  /**
   * Переход в главное меню
   */
  async navigateToMainMenu(ctx: MyContext): Promise<NavigationResult> {
    return this.navigateToScene(ctx, 'menuScene', {
      saveToHistory: false,
      leaveCurrent: true,
    })
  }

  /**
   * Переход назад по истории
   */
  async goBack(ctx: MyContext): Promise<NavigationResult> {
    const navContext = this.createNavigationContext(ctx)

    if (!canGoBack(ctx)) {
      // Если нет истории, идем в главное меню
      return this.navigateToMainMenu(ctx)
    }

    const previousSceneId = getPreviousScene(ctx)
    if (!previousSceneId) {
      return this.navigateToMainMenu(ctx)
    }

    try {
      await sceneGoBack(ctx)
      const scene = getSceneById(previousSceneId)

      logger.info('[Navigation] go_back', {
        userId: navContext.userId,
        from: navContext.currentScene,
        to: previousSceneId,
      })

      await this.emitEvent(NavigationEvent.SCENE_ENTER, {
        ...navContext,
        scene,
      })

      return {
        success: true,
        sceneId: previousSceneId,
      }
    } catch (error) {
      const errorMessage = `Failed to go back: ${error instanceof Error ? error.message : String(error)}`
      logger.error(`[Navigation] ${errorMessage}`, {
        userId: navContext.userId,
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Отмена текущей операции и возврат в меню
   */
  async cancel(ctx: MyContext): Promise<NavigationResult> {
    const navContext = this.createNavigationContext(ctx)

    // Очищаем историю навигации
    clearNavigationHistory(ctx)

    logger.info('[Navigation] cancel', {
      userId: navContext.userId,
      from: navContext.currentScene,
    })

    // Возвращаемся в главное меню
    return this.navigateToMainMenu(ctx)
  }

  /**
   * Получить информацию о текущей навигации
   */
  getNavigationInfo(ctx: MyContext): {
    currentScene?: SceneMetadata
    canGoBack: boolean
    historyDepth: number
    availableTransitions: string[]
  } {
    const navContext = this.createNavigationContext(ctx)
    const currentSceneId = navContext.currentScene

    let currentScene: SceneMetadata | undefined
    if (currentSceneId) {
      currentScene = getSceneById(currentSceneId)
    }

    return {
      currentScene,
      canGoBack: canGoBack(ctx),
      historyDepth: ctx.session.navigationHistory?.length || 0,
      availableTransitions: [],
    }
  }
}

/**
 * Глобальный экземпляр роутера
 */
export const navigationRouter = new NavigationRouter()

/**
 * Экспортируем методы для удобства использования
 */
export const navigateToScene =
  navigationRouter.navigateToScene.bind(navigationRouter)
export const navigateToMode =
  navigationRouter.navigateToMode.bind(navigationRouter)
export const navigateToMainMenu =
  navigationRouter.navigateToMainMenu.bind(navigationRouter)
export const goBack = navigationRouter.goBack.bind(navigationRouter)
export const cancel = navigationRouter.cancel.bind(navigationRouter)
export const getNavigationInfo =
  navigationRouter.getNavigationInfo.bind(navigationRouter)

export default navigationRouter
