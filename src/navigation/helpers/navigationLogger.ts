/**
 * 🔍 ЛОГИРОВАНИЕ НАВИГАЦИИ
 * 
 * Прозрачное логирование для понимания состояния навигации:
 * - Текущая сцена и глубина вложенности
 * - История переходов
 * - Обработка кнопок
 * - Проблемы с отменой и переходами
 * 
 * Формат логов оптимизирован для агентного воркфлоу.
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'

/**
 * Уровни детализации логов
 */
export enum NavigationLogLevel {
  /** Только критические ошибки */
  ERROR = 0,
  /** Важные события (переходы, ошибки) */
  INFO = 1,
  /** Подробная отладка */
  DEBUG = 2,
  /** Максимальная детализация */
  TRACE = 3,
}

/**
 * Текущий уровень логирования
 * Можно менять через переменную окружения NAV_LOG_LEVEL
 */
const currentLogLevel: NavigationLogLevel = 
  process.env.NAV_LOG_LEVEL ? parseInt(process.env.NAV_LOG_LEVEL) : NavigationLogLevel.INFO

/**
 * Форматирует состояние навигации в читаемый вид
 */
function formatNavigationState(ctx: MyContext): string {
  const sceneId = ctx.scene?.current?.id || 'none'
  const history = ctx.session?.navigationHistory || []
  const mode = ctx.session?.mode || 'none'
  const depth = history.length

  // Визуальное представление глубины
  const depthIndicator = depth === 0 ? '🏠' : '📍'.repeat(Math.min(depth, 5))
  
  return `[${depthIndicator} scene=${sceneId} mode=${mode} depth=${depth}]`
}

/**
 * Форматирует стек навигации
 */
function formatNavigationStack(ctx: MyContext): string {
  const history = ctx.session?.navigationHistory || []
  const current = ctx.scene?.current?.id || 'none'
  
  if (history.length === 0) {
    return `Stack: [${current}] (root)`
  }
  
  const stack = [...history, current].join(' → ')
  return `Stack: ${stack}`
}

/**
 * Базовый лог навигации
 */
function navLog(
  level: NavigationLogLevel,
  emoji: string,
  action: string,
  ctx: MyContext,
  details?: Record<string, unknown>
): void {
  if (level > currentLogLevel) return

  const telegramId = ctx.from?.id
  const state = formatNavigationState(ctx)
  
  const logData = {
    telegramId,
    state,
    ...details,
  }

  const message = `${emoji} [NAV] ${action} ${state}`

  switch (level) {
    case NavigationLogLevel.ERROR:
      logger.error(message, logData)
      break
    case NavigationLogLevel.INFO:
      logger.info(message, logData)
      break
    case NavigationLogLevel.DEBUG:
      logger.debug(message, logData)
      break
    case NavigationLogLevel.TRACE:
      console.log(message, JSON.stringify(logData, null, 2))
      break
  }
}

// ========================================
// ПУБЛИЧНЫЕ ФУНКЦИИ ЛОГИРОВАНИЯ
// ========================================

/**
 * Лог входа в сцену
 */
export function logSceneEnter(ctx: MyContext, sceneId: string, source?: string): void {
  navLog(NavigationLogLevel.INFO, '🚪➡️', `ENTER ${sceneId}`, ctx, {
    targetScene: sceneId,
    source: source || 'unknown',
    stack: formatNavigationStack(ctx),
  })
}

/**
 * Лог выхода из сцены
 */
export function logSceneLeave(ctx: MyContext, reason?: string): void {
  navLog(NavigationLogLevel.INFO, '🚪⬅️', `LEAVE`, ctx, {
    reason: reason || 'explicit',
    stack: formatNavigationStack(ctx),
  })
}

/**
 * Лог обработки кнопки
 */
export function logButtonPress(
  ctx: MyContext, 
  buttonText: string, 
  matched: boolean,
  buttonId?: string
): void {
  const emoji = matched ? '✅' : '❓'
  const action = matched ? `BUTTON MATCHED: ${buttonId}` : `BUTTON UNMATCHED`
  
  navLog(NavigationLogLevel.INFO, emoji, action, ctx, {
    buttonText: buttonText.substring(0, 30),
    matched,
    buttonId,
  })
}

/**
 * Лог callback query
 */
export function logCallbackQuery(ctx: MyContext, data: string, handled: boolean): void {
  const emoji = handled ? '✅' : '⏭️'
  navLog(NavigationLogLevel.INFO, emoji, `CALLBACK: ${data}`, ctx, {
    callbackData: data,
    handled,
  })
}

/**
 * Лог перехода на главное меню
 */
export function logMainMenuReturn(ctx: MyContext, source: string): void {
  navLog(NavigationLogLevel.INFO, '🏠', `MAIN MENU from ${source}`, ctx, {
    source,
    previousStack: formatNavigationStack(ctx),
  })
}

/**
 * Лог кнопки "Назад"
 */
export function logGoBack(ctx: MyContext, targetScene: string | null): void {
  navLog(NavigationLogLevel.INFO, '⬅️', `GO BACK → ${targetScene || 'main_menu'}`, ctx, {
    targetScene,
    historyBefore: ctx.session?.navigationHistory,
  })
}

/**
 * Лог кнопки "Отмена"
 */
export function logCancel(ctx: MyContext, handled: boolean, handler?: string): void {
  const emoji = handled ? '❌✅' : '❌❓'
  navLog(NavigationLogLevel.INFO, emoji, `CANCEL`, ctx, {
    handled,
    handler,
    currentScene: ctx.scene?.current?.id,
  })
}

/**
 * Лог ошибки навигации
 */
export function logNavigationError(
  ctx: MyContext, 
  error: Error | string, 
  action: string
): void {
  navLog(NavigationLogLevel.ERROR, '🔴', `ERROR in ${action}`, ctx, {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
    currentScene: ctx.scene?.current?.id,
    navigationHistory: ctx.session?.navigationHistory,
  })
}

/**
 * Лог предупреждения (потенциальная проблема)
 */
export function logNavigationWarning(ctx: MyContext, warning: string, details?: Record<string, unknown>): void {
  navLog(NavigationLogLevel.INFO, '⚠️', warning, ctx, details)
}

/**
 * Лог глубокой сцены (потенциальная проблема)
 */
export function logDeepScene(ctx: MyContext, depth: number): void {
  if (depth >= 3) {
    navLog(NavigationLogLevel.INFO, '🔻', `DEEP SCENE WARNING: depth=${depth}`, ctx, {
      depth,
      stack: formatNavigationStack(ctx),
      hint: 'Consider adding explicit navigation buttons',
    })
  }
}

/**
 * Полный дамп состояния навигации (для отладки)
 */
export function dumpNavigationState(ctx: MyContext, reason: string): void {
  const state = {
    reason,
    telegramId: ctx.from?.id,
    currentScene: ctx.scene?.current?.id,
    mode: ctx.session?.mode,
    navigationHistory: ctx.session?.navigationHistory,
    historyDepth: (ctx.session?.navigationHistory || []).length,
    stack: formatNavigationStack(ctx),
    sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
    updateType: ctx.updateType,
    messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined,
    callbackData: ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined,
  }

  console.log('═'.repeat(60))
  console.log('🔍 NAVIGATION STATE DUMP:', reason)
  console.log('═'.repeat(60))
  console.log(JSON.stringify(state, null, 2))
  console.log('═'.repeat(60))
}

/**
 * Декоратор для автоматического логирования функций навигации
 */
export function withNavigationLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  fnName: string
): T {
  return (async (...args: any[]) => {
    const ctx = args[0] as MyContext
    const startTime = Date.now()
    
    navLog(NavigationLogLevel.DEBUG, '▶️', `START ${fnName}`, ctx)
    
    try {
      const result = await fn(...args)
      const duration = Date.now() - startTime
      navLog(NavigationLogLevel.DEBUG, '✅', `END ${fnName} (${duration}ms)`, ctx)
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logNavigationError(ctx, error as Error, `${fnName} (${duration}ms)`)
      throw error
    }
  }) as T
}

// ========================================
// MIDDLEWARE ДЛЯ АВТОМАТИЧЕСКОГО ЛОГИРОВАНИЯ
// ========================================

/**
 * Middleware для автоматического логирования всех навигационных событий
 */
export function createNavigationLoggingMiddleware() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    // Логируем входящее сообщение/callback
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined
    
    if (messageText || callbackData) {
      navLog(NavigationLogLevel.DEBUG, '📨', `INCOMING`, ctx, {
        messageText: messageText?.substring(0, 50),
        callbackData,
      })
    }

    // Проверяем глубину сцены
    const depth = (ctx.session?.navigationHistory || []).length
    if (depth >= 3) {
      logDeepScene(ctx, depth)
    }

    // Сохраняем состояние до обработки
    const sceneBefore = ctx.scene?.current?.id
    const historyBefore = [...(ctx.session?.navigationHistory || [])]

    await next()

    // Логируем изменения состояния
    const sceneAfter = ctx.scene?.current?.id
    const historyAfter = ctx.session?.navigationHistory || []

    if (sceneBefore !== sceneAfter) {
      navLog(NavigationLogLevel.DEBUG, '🔄', `SCENE CHANGED: ${sceneBefore} → ${sceneAfter}`, ctx, {
        sceneBefore,
        sceneAfter,
        historyBefore,
        historyAfter,
      })
    }
  }
}
