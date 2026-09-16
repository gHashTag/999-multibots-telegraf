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
      /*
       * ACKNOWLEDGING THE PRESS IS NOT PART OF THE WORK.
       *
       * This middleware runs on EVERY callback query of every bot. When the
       * query id has expired -- a press on an old message, a redelivered
       * update -- answerCbQuery throws 400 'query is too old', and it threw
       * FIRST, before scene.leave and showMainMenu had run. So an expired
       * press aborted the menu AND paged the owner with 'Error handling main
       * menu', which reads like the menu is down when the menu is fine.
       *
       * The press is already lost; nothing is gained by throwing here. What
       * remains inside the try is the actual work, so the alert below now
       * means exactly what it says: the main menu failed to render.
       */
      await ctx.answerCbQuery().catch(() => undefined)
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
      // Same as the main-menu branch above: an expired query id must not abort
      // the cancel, and must not page anybody.
      await ctx.answerCbQuery().catch(() => undefined)
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

    /*
     * NO try/catch HERE ON PURPOSE.
     *
     * This branch never had any work in it -- no scene.leave, no menu, only
     * the acknowledgement and a note that global help could be shown one day.
     * So its catch could only ever fire for a failed answerCbQuery, and the
     * alert it raised ('Error handling help') could only ever mean that a
     * customer pressed a button whose query id had expired. With the answer
     * made non-fatal there is nothing left that can throw, and a catch that
     * cannot fire is a worse lie than no catch at all.
     */
    await ctx.answerCbQuery().catch(() => undefined)
    return true
  }

  return false
}
