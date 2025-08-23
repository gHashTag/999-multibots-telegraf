/**
 * 🎯 УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК ДЕЙСТВИЙ МЕНЮ
 * Устраняет дублирование кода в hearsHandlers
 * Централизует логику обработки кнопок
 */

import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

export interface MenuAction {
  titleRu: string
  titleEn: string
  mode: ModeEnum | string
  requiresSubscription: boolean
  adminOnly?: boolean
  sceneToEnter?: string
  customHandler?: (ctx: MyContext) => Promise<void>
}

export class MenuActionHandler {
  private static instance: MenuActionHandler
  private actions: Map<string, MenuAction> = new Map()

  private constructor() {}

  public static getInstance(): MenuActionHandler {
    if (!MenuActionHandler.instance) {
      MenuActionHandler.instance = new MenuActionHandler()
    }
    return MenuActionHandler.instance
  }

  /**
   * Регистрация действия меню
   */
  public registerAction(action: MenuAction): void {
    // Регистрируем по обеим языковым версиям
    this.actions.set(action.titleRu, action)
    this.actions.set(action.titleEn, action)
    
    logger.debug('MenuAction registered', {
      titleRu: action.titleRu,
      titleEn: action.titleEn,
      mode: action.mode,
    })
  }

  /**
   * Обработка действия по тексту кнопки
   */
  public async handleAction(ctx: MyContext, buttonText: string): Promise<boolean> {
    const action = this.actions.get(buttonText)
    
    if (!action) {
      logger.debug('Unknown menu action', { buttonText, telegramId: ctx.from?.id })
      return false
    }

    logger.info('Processing menu action', {
      buttonText,
      mode: action.mode,
      telegramId: ctx.from?.id,
      username: ctx.from?.username,
    })

    try {
      // Проверка админских прав
      if (action.adminOnly) {
        const { configManager } = await import('./ConfigManager')
        const isAdmin = configManager.isAdmin(ctx.from?.id?.toString() || '')
        
        if (!isAdmin) {
          const isRu = isRussianFromState(ctx)
          await ctx.reply(
            isRu 
              ? '❌ У вас нет доступа к этой функции'
              : '❌ You don\'t have access to this feature'
          )
          return true
        }
      }

      // Проверка подписки
      if (action.requiresSubscription) {
        const hasSubscription = await checkSubscriptionGuard(ctx, buttonText)
        if (!hasSubscription) {
          return true // checkSubscriptionGuard уже обработал редирект
        }
      }

      // Кастомный обработчик или стандартная логика
      if (action.customHandler) {
        await action.customHandler(ctx)
      } else {
        await this.executeStandardAction(ctx, action)
      }

      return true
    } catch (error) {
      logger.error('Error processing menu action', {
        buttonText,
        mode: action.mode,
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id,
      })

      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка. Попробуйте позже или обратитесь в поддержку.'
          : '❌ An error occurred. Please try again later or contact support.'
      )

      return true
    }
  }

  /**
   * Стандартная логика входа в сцену
   */
  private async executeStandardAction(ctx: MyContext, action: MenuAction): Promise<void> {
    // Безопасный выход из текущей сцены
    if (ctx.scene.current) {
      await ctx.scene.leave()
    }

    // Установка режима в сессии
    if (ctx.session) {
      ctx.session.mode = action.mode as ModeEnum
    }

    // Вход в нужную сцену
    const sceneId = action.sceneToEnter || ModeEnum.CheckBalanceScene
    await ctx.scene.enter(sceneId)

    logger.info('Scene transition completed', {
      mode: action.mode,
      sceneId,
      telegramId: ctx.from?.id,
    })
  }

  /**
   * Получение всех зарегистрированных действий
   */
  public getAllActions(): MenuAction[] {
    const uniqueActions = new Map<string, MenuAction>()
    
    for (const [key, action] of this.actions) {
      uniqueActions.set(action.titleRu, action)
    }
    
    return Array.from(uniqueActions.values())
  }

  /**
   * Проверка, является ли текст кнопкой меню
   */
  public isMenuAction(buttonText: string): boolean {
    return this.actions.has(buttonText)
  }
}

// Экспорт singleton экземпляра
export const menuActionHandler = MenuActionHandler.getInstance()