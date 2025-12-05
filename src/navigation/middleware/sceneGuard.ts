/**
 * 🛡️ SCENE GUARD - Защита навигации в глубоких сценах
 * 
 * Проблема: При глубокой вложенности сцен (3+ уровня) кнопки 
 * "Главное меню", "Отмена" и "Назад" могут не работать, потому что:
 * 1. Сцена перехватывает все сообщения
 * 2. Нет явного обработчика для навигационных кнопок
 * 3. ctx.scene.leave() не вызывается
 * 
 * Решение: SceneGuard добавляет глобальные обработчики в КАЖДУЮ сцену,
 * гарантируя работу навигации независимо от глубины вложенности.
 */

import { Scenes, Middleware } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { 
  matchButton, 
  isMainMenuButton, 
  isCancelButton, 
  isBackButton 
} from './buttonMatcher'
import { 
  logButtonPress, 
  logMainMenuReturn, 
  logCancel, 
  logGoBack,
  logNavigationWarning,
  logNavigationError,
  dumpNavigationState
} from '../helpers/navigationLogger'
import { goBack, goToMainMenu } from '../helpers/sceneTransition'

/**
 * Конфигурация SceneGuard
 */
export interface SceneGuardConfig {
  /** Максимальная глубина сцен перед предупреждением */
  maxDepthWarning: number
  /** Максимальная глубина сцен перед принудительным сбросом */
  maxDepthForceReset: number
  /** Сцены, в которых НЕ работает автоматическая навигация */
  excludeScenes: string[]
  /** Включить дамп состояния при ошибках */
  dumpOnError: boolean
}

const DEFAULT_CONFIG: SceneGuardConfig = {
  maxDepthWarning: 3,
  maxDepthForceReset: 5,
  excludeScenes: [
    ModeEnum.ChatWithAvatar, // Специальная логика отмены
  ],
  dumpOnError: true,
}

/**
 * Проверяет глубину навигации и возвращает предупреждение если нужно
 */
export function checkNavigationDepth(ctx: MyContext, config = DEFAULT_CONFIG): {
  depth: number
  warning: string | null
  shouldForceReset: boolean
} {
  const depth = (ctx.session?.navigationHistory || []).length
  
  if (depth >= config.maxDepthForceReset) {
    return {
      depth,
      warning: `CRITICAL: Navigation depth ${depth} >= ${config.maxDepthForceReset}, forcing reset`,
      shouldForceReset: true,
    }
  }
  
  if (depth >= config.maxDepthWarning) {
    return {
      depth,
      warning: `WARNING: Navigation depth ${depth} >= ${config.maxDepthWarning}`,
      shouldForceReset: false,
    }
  }
  
  return {
    depth,
    warning: null,
    shouldForceReset: false,
  }
}

/**
 * Обработчик кнопки "Главное меню" для использования в сценах
 */
export async function handleMainMenuButton(ctx: MyContext): Promise<boolean> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : null
  if (!text) return false

  if (!isMainMenuButton(text)) return false

  logMainMenuReturn(ctx, 'sceneGuard')
  
  try {
    await goToMainMenu(ctx, true) // clearHistory = true
    return true
  } catch (error) {
    logNavigationError(ctx, error as Error, 'handleMainMenuButton')
    // Fallback: пробуем напрямую
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    } catch (e) {
      logNavigationError(ctx, e as Error, 'handleMainMenuButton fallback')
      return false
    }
  }
}

/**
 * Обработчик кнопки "Отмена" для использования в сценах
 */
export async function handleCancelButton(ctx: MyContext): Promise<boolean> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : null
  if (!text) return false

  if (!isCancelButton(text)) return false

  const currentScene = ctx.scene?.current?.id

  // Проверяем, не исключена ли сцена
  if (currentScene && DEFAULT_CONFIG.excludeScenes.includes(currentScene)) {
    logCancel(ctx, false, `excluded scene: ${currentScene}`)
    return false // Позволяем сцене обработать самой
  }

  logCancel(ctx, true, 'sceneGuard')
  
  try {
    await goToMainMenu(ctx, true)
    return true
  } catch (error) {
    logNavigationError(ctx, error as Error, 'handleCancelButton')
    return false
  }
}

/**
 * Обработчик кнопки "Назад" для использования в сценах
 */
export async function handleBackButton(ctx: MyContext): Promise<boolean> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : null
  if (!text) return false

  if (!isBackButton(text)) return false

  const history = ctx.session?.navigationHistory || []
  const previousScene = history[history.length - 1] || null

  logGoBack(ctx, previousScene)
  
  try {
    await goBack(ctx)
    return true
  } catch (error) {
    logNavigationError(ctx, error as Error, 'handleBackButton')
    return false
  }
}

/**
 * Универсальный обработчик всех навигационных кнопок
 * Возвращает true если кнопка была обработана
 */
export async function handleNavigationButton(ctx: MyContext): Promise<boolean> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : null
  if (!text) return false

  // Проверяем кнопку через матчер
  const result = matchButton(text)
  if (!result) return false

  logButtonPress(ctx, text, true, result.button.id)

  // Обрабатываем навигационные кнопки
  switch (result.button.id) {
    case 'mainMenu':
      return await handleMainMenuButton(ctx)
    case 'cancel':
      return await handleCancelButton(ctx)
    case 'back':
      return await handleBackButton(ctx)
    default:
      return false
  }
}

/**
 * Создаёт middleware для защиты сцены
 * Добавляет обработку навигационных кнопок в любую сцену
 */
export function createSceneGuardMiddleware(config = DEFAULT_CONFIG): Middleware<MyContext> {
  return async (ctx, next) => {
    // 1. Проверяем глубину навигации
    const depthCheck = checkNavigationDepth(ctx, config)
    
    if (depthCheck.warning) {
      logNavigationWarning(ctx, depthCheck.warning, { depth: depthCheck.depth })
    }
    
    if (depthCheck.shouldForceReset) {
      logNavigationWarning(ctx, 'Forcing navigation reset due to excessive depth')
      await goToMainMenu(ctx, true)
      return
    }

    // 2. Пробуем обработать навигационные кнопки
    const handled = await handleNavigationButton(ctx)
    if (handled) {
      return // Кнопка обработана, не передаём дальше
    }

    // 3. Передаём управление дальше
    await next()
  }
}

/**
 * Добавляет защиту навигации в существующую сцену
 * @param scene - Сцена для защиты
 */
export function addSceneGuard<T extends Scenes.WizardScene<MyContext> | Scenes.BaseScene<MyContext>>(
  scene: T,
  config = DEFAULT_CONFIG
): T {
  // Добавляем middleware в начало цепочки
  scene.use(createSceneGuardMiddleware(config))

  // Добавляем явный обработчик для callback_query навигации
  if ('action' in scene) {
    scene.action('go_main_menu', async (ctx) => {
      await ctx.answerCbQuery()
      await goToMainMenu(ctx as unknown as MyContext, true)
    })

    scene.action('go_back', async (ctx) => {
      await ctx.answerCbQuery()
      await goBack(ctx as unknown as MyContext)
    })

    scene.action('cancel', async (ctx) => {
      await ctx.answerCbQuery()
      await goToMainMenu(ctx as unknown as MyContext, true)
    })
  }

  return scene
}

/**
 * Хелпер для быстрой проверки состояния навигации
 * Используйте в любом месте для отладки
 */
export function debugNavigation(ctx: MyContext, label = 'DEBUG'): void {
  dumpNavigationState(ctx, label)
}

/**
 * Проверяет, находится ли пользователь в "застрявшем" состоянии
 */
export function isStuckNavigation(ctx: MyContext): boolean {
  const depth = (ctx.session?.navigationHistory || []).length
  const currentScene = ctx.scene?.current?.id
  
  // Признаки застревания:
  // 1. Глубина > 3 и сцена не главное меню
  // 2. История содержит дубликаты подряд
  
  if (depth > 3 && currentScene !== ModeEnum.MainMenu) {
    return true
  }
  
  const history = ctx.session?.navigationHistory || []
  for (let i = 1; i < history.length; i++) {
    if (history[i] === history[i - 1]) {
      return true // Дубликаты - признак цикла
    }
  }
  
  return false
}

/**
 * Принудительный сброс навигации
 * Использовать только в крайних случаях
 */
export async function forceNavigationReset(ctx: MyContext): Promise<void> {
  logNavigationWarning(ctx, 'FORCE NAVIGATION RESET', {
    reason: 'manual call',
    currentScene: ctx.scene?.current?.id,
    history: ctx.session?.navigationHistory,
  })
  
  // Очищаем историю
  ctx.session.navigationHistory = []
  
  // Сбрасываем режим
  ctx.session.mode = ModeEnum.MainMenu
  
  // Выходим из всех сцен и идём в главное меню
  try {
    await ctx.scene.leave()
  } catch (e) {
    // Игнорируем ошибки выхода
  }
  
  try {
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (e) {
    logNavigationError(ctx, e as Error, 'forceNavigationReset')
  }
}
