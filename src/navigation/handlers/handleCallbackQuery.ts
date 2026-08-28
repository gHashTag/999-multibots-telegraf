/**
 * 🔘 HANDLER: Callback Query (Inline Buttons)
 *
 * Обрабатывает callback_query для глобальных inline-кнопок
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { showMainMenu } from '@/navigation'

/**
 * Проверяет и обрабатывает глобальные callback_query
 * @returns true если обработано, false если не наш callback
 */
export async function handleCallbackQuery(ctx: MyContext): Promise<boolean> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return false
  }

  const data = ctx.callbackQuery.data

  // 🏠 ГЛАВНОЕ МЕНЮ
  if (data === 'go_main_menu' || data === 'main_menu') {
    logger.info('🏠 [Callback] Main menu pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await showMainMenu(ctx)
      return true
    } catch (error) {
      logger.error('❌ [Callback] Error handling main menu:', {
        error,
        telegramId: ctx.from?.id,
      })
      return true
    }
  }

  // ❌ ОТМЕНА / НАЗАД
  if (data === 'cancel' || data === 'go_back') {
    // ✅ Если в сцене chatWithAvatarWizard - передаём обработку сцене
    if (ctx.scene?.current?.id === 'chat_with_avatar') {
      logger.info(
        '❌ [Callback] Cancel in chatWithAvatarWizard - delegating to scene',
        {
          telegramId: ctx.from?.id,
        }
      )
      return false // Не обрабатываем глобально, передаём в сцену
    }

    logger.info('❌ [Callback] Cancel/Back pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await showMainMenu(ctx)
      return true
    } catch (error) {
      logger.error('❌ [Callback] Error handling cancel:', {
        error,
        telegramId: ctx.from?.id,
      })
      return true
    }
  }

  // ❓ ПОМОЩЬ
  if (data === 'help') {
    // ✅ Если в сцене chatWithAvatarWizard - передаём обработку сцене
    if (ctx.scene?.current?.id === 'chat_with_avatar') {
      logger.info(
        '❓ [Callback] Help in chatWithAvatarWizard - delegating to scene',
        {
          telegramId: ctx.from?.id,
        }
      )
      return false // Не обрабатываем глобально, передаём в сцену
    }

    logger.info('❓ [Callback] Help pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.answerCbQuery()
      // Для глобальной помощи можно показать базовую справку
      return true
    } catch (error) {
      logger.error('❌ [Callback] Error handling help:', {
        error,
        telegramId: ctx.from?.id,
      })
      return true
    }
  }

  return false
}
