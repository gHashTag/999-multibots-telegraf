/**
 * 🏠 HANDLER: Main Menu Button
 *
 * Обрабатывает нажатие кнопки "Главное меню" / "Main Menu"
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { showMainMenu } from '@/navigation'
import { MAIN_MENU_VARIANTS, BACK_VARIANTS } from '../config/categories.config'

/**
 * Проверяет и обрабатывает нажатие кнопки главного меню
 * @returns true если обработано, false если не наш текст
 */
export async function handleMainMenu(
  ctx: MyContext,
  text: string
): Promise<boolean> {
  // 🏠 ГЛАВНОЕ МЕНЮ
  if (MAIN_MENU_VARIANTS.includes(text)) {
    logger.info('🔥 [Navigation] Main Menu pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      text,
    })

    try {
      await ctx.scene.leave()
      await showMainMenu(ctx)
      return true
    } catch (error) {
      logger.error('❌ [Navigation] Error in main menu handler:', {
        error,
        telegramId: ctx.from?.id,
      })
      return true // Останавливаем обработку даже при ошибке
    }
  }

  // ◀️ НАЗАД - тоже ведет в главное меню
  if (BACK_VARIANTS.includes(text)) {
    logger.info('◀️ [Navigation] Back pressed', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.scene.leave()
      await showMainMenu(ctx)
      return true
    } catch (error) {
      logger.error('❌ [Navigation] Error handling Back:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  }

  return false
}
