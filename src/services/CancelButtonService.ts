import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

/**
 * ✅ ЕДИНАЯ СИСТЕМА КНОПОК ОТМЕНЫ
 * Объединяет все дублирующиеся реализации
 * 
 * Старые функции (для обратной совместимости):
 * - handleHelpCancel
 * - handleCancelButton
 * - createCancelButton
 * - cancelHelpArray
 */

export class CancelButtonService {
  /**
   * Создает простую кнопку отмены (ReplyKeyboard)
   */
  static createCancelButton(isRu: boolean) {
    return [Markup.button.text(isRu ? 'Отмена' : 'Cancel')]
  }

  /**
   * Создает inline кнопку отмены
   */
  static createInlineCancelButton(isRu: boolean) {
    return Markup.button.callback(
      isRu ? 'Отмена' : 'Cancel',
      'cancel'
    )
  }

  /**
   * Создает массив кнопок с "Справка" и "Отмена"
   */
  static createHelpCancelArray(isRu: boolean) {
    return [
      [isRu ? 'ℹ️ Справка по команде' : 'ℹ️ Help for the command'],
      [isRu ? 'Отмена' : 'Cancel']
    ]
  }

  /**
   * Создает клавиатуру с кнопками "Справка" и "Отмена"
   */
  static createHelpCancelKeyboard(isRu: boolean) {
    return Markup.keyboard(this.createHelpCancelArray(isRu)).resize()
  }

  /**
   * Проверяет, была ли нажата кнопка "Отмена" или команда /cancel
   * Возвращает true если отмена, false если нет
   */
  static async handleCancelButton(ctx: MyContext): Promise<boolean> {
    if (!ctx.message || !('text' in ctx.message)) {
      return false
    }

    const text = ctx.message.text?.toLowerCase().trim()

    // Проверяем команды отмены
    if (text === 'отмена' || text === 'cancel' || text === '/cancel') {
      const isRu = isRussianFromState(ctx)
      
      await ctx.reply(
        isRu ? '❌ Операция отменена.' : '❌ Operation cancelled.',
        { reply_markup: { remove_keyboard: true } }
      )
      
      await ctx.scene.leave()
      return true
    }

    // Проверяем команды меню
    if (text === '/menu' || text === 'меню' || text === 'menu') {
      const isRu = isRussianFromState(ctx)
      
      await ctx.reply(
        isRu ? '🏠 Возвращаемся в главное меню...' : '🏠 Returning to main menu...',
        { reply_markup: { remove_keyboard: true } }
      )
      
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }

    return false
  }

  /**
   * Обрабатывает callback_query для inline кнопки отмены
   */
  static async handleCancelCallback(ctx: MyContext): Promise<boolean> {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery && ctx.callbackQuery.data === 'cancel') {
      const isRu = isRussianFromState(ctx)

      await ctx.answerCbQuery()
      await ctx.reply(
        isRu ? '❌ Операция отменена.' : '❌ Operation cancelled.'
      )

      await ctx.scene.leave()
      return true
    }

    return false
  }
}

// ✅ ЭКСПОРТЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ

// Из utils/cancelButton.ts
export const createCancelButton = (isRu: boolean) => 
  CancelButtonService.createCancelButton(isRu)

export const handleCancelButton = (ctx: MyContext) => 
  CancelButtonService.handleCancelButton(ctx)

// Из handlers/handleHelpCancel/index.ts
export const handleHelpCancel = (ctx: MyContext) => 
  CancelButtonService.handleCancelButton(ctx)

// Из menu/cancelHelpArray.ts
export const cancelHelpArray = (isRu: boolean) => 
  CancelButtonService.createHelpCancelArray(isRu)

// Из menu/createHelpCancelKeyboard/createHelpCancelKeyboard.ts
export const createHelpCancelKeyboard = (isRu: boolean) => 
  CancelButtonService.createHelpCancelKeyboard(isRu)

// ✅ ЛОГГЕР
logger.info('✅ CancelButtonService загружен')
logger.info('   - Объединены 4 дублирующиеся системы отмены')
logger.info('   - Создан единый CancelButtonService')
