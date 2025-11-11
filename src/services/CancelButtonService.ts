import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

/**
 * ✅ ЕДИНАЯ ЦЕНТРАЛИЗОВАННАЯ СИСТЕМА ОТМЕНЫ И ГЛАВНОГО МЕНЮ
 *
 * Объединяет все дублирующиеся реализации:
 * - Кнопки отмены (Reply Keyboard и Inline)
 * - Кнопки главного меню
 * - Обработчики отмены и выхода в меню
 * - Единый стиль сообщений (спокойный, без агрессивных ❌)
 *
 * Старые функции (для обратной совместимости):
 * - handleHelpCancel
 * - handleCancelButton
 * - createCancelButton
 * - cancelHelpArray
 */

export class CancelButtonService {
  /**
   * 🔹 СОЗДАНИЕ КНОПОК
   */

  /**
   * Создает простую кнопку отмены (ReplyKeyboard) - БЕЗ эмодзи
   */
  static createCancelButton(isRu: boolean) {
    return [Markup.button.text(isRu ? 'Отмена' : 'Cancel')]
  }

  /**
   * Создает кнопку главного меню (ReplyKeyboard)
   */
  static createMainMenuButton(isRu: boolean) {
    return [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main Menu')]
  }

  /**
   * Создает inline кнопку отмены - БЕЗ эмодзи
   */
  static createInlineCancelButton(isRu: boolean, callbackData = 'cancel') {
    return Markup.button.callback(
      isRu ? 'Отмена' : 'Cancel',
      callbackData
    )
  }

  /**
   * Создает inline кнопку главного меню
   */
  static createInlineMainMenuButton(isRu: boolean) {
    return Markup.button.callback(
      isRu ? '🏠 Главное меню' : '🏠 Main Menu',
      'main_menu'
    )
  }

  /**
   * Создает массив кнопок с "Справка" и "Отмена"
   */
  static createHelpCancelArray(isRu: boolean) {
    return [
      [isRu ? 'ℹ️ Справка' : 'ℹ️ Help'],
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
   * 🔹 ОБРАБОТЧИКИ ДЛЯ REPLY KEYBOARD
   */

  /**
   * ЦЕНТРАЛИЗОВАННЫЙ обработчик отмены для Reply Keyboard
   * Проверяет текст кнопки и выполняет отмену единообразно
   */
  static async handleCancelButton(ctx: MyContext): Promise<boolean> {
    if (!ctx.message || !('text' in ctx.message)) {
      return false
    }

    const text = ctx.message.text?.toLowerCase().trim()
    const isRu = isRussianFromState(ctx)

    // Проверяем команды отмены
    if (text === 'отмена' || text === 'cancel' || text === '/cancel') {
      logger.info('[CancelButtonService] Cancel triggered', {
        telegramId: ctx.from?.id,
        text
      })

      await ctx.reply(
        isRu ? 'Операция отменена.' : 'Operation cancelled.',
        { reply_markup: { remove_keyboard: true } }
      )

      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }

    return false
  }

  /**
   * ЦЕНТРАЛИЗОВАННЫЙ обработчик перехода в главное меню для Reply Keyboard
   * Проверяет текст кнопки и выполняет переход единообразно
   */
  static async handleMainMenuButton(ctx: MyContext): Promise<boolean> {
    if (!ctx.message || !('text' in ctx.message)) {
      return false
    }

    const text = ctx.message.text?.toLowerCase().trim()
    const isRu = isRussianFromState(ctx)

    // Проверяем команды главного меню
    if (
      text === 'главное меню' ||
      text === 'main menu' ||
      text === '🏠 главное меню' ||
      text === '🏠 main menu' ||
      text === '/menu' ||
      text === 'меню' ||
      text === 'menu'
    ) {
      logger.info('[CancelButtonService] Main menu triggered', {
        telegramId: ctx.from?.id,
        text
      })

      await ctx.reply(
        isRu ? 'Переходим в главное меню.' : 'Going to main menu.',
        { reply_markup: { remove_keyboard: true } }
      )

      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }

    return false
  }

  /**
   * Универсальный обработчик - проверяет и отмену, и главное меню
   * Использовать в начале каждого шага wizard'а
   */
  static async handleCancelAndMenu(ctx: MyContext): Promise<boolean> {
    const cancelHandled = await this.handleCancelButton(ctx)
    if (cancelHandled) return true

    const menuHandled = await this.handleMainMenuButton(ctx)
    if (menuHandled) return true

    return false
  }

  /**
   * 🔹 ОБРАБОТЧИКИ ДЛЯ INLINE BUTTONS
   */

  /**
   * ЦЕНТРАЛИЗОВАННЫЙ обработчик отмены для Inline кнопок
   * Использует callback_query
   */
  static async handleCancelCallback(ctx: MyContext, callbackData = 'cancel'): Promise<boolean> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return false
    }

    if (ctx.callbackQuery.data === callbackData) {
      const isRu = isRussianFromState(ctx)

      logger.info('[CancelButtonService] Inline cancel triggered', {
        telegramId: ctx.from?.id,
        callbackData
      })

      await ctx.answerCbQuery()
      await ctx.reply(
        isRu ? 'Операция отменена.' : 'Operation cancelled.'
      )

      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }

    return false
  }

  /**
   * ЦЕНТРАЛИЗОВАННЫЙ обработчик перехода в главное меню для Inline кнопок
   */
  static async handleMainMenuCallback(ctx: MyContext): Promise<boolean> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return false
    }

    if (ctx.callbackQuery.data === 'main_menu') {
      const isRu = isRussianFromState(ctx)

      logger.info('[CancelButtonService] Inline main menu triggered', {
        telegramId: ctx.from?.id
      })

      await ctx.answerCbQuery()
      await ctx.reply(
        isRu ? 'Переходим в главное меню.' : 'Going to main menu.'
      )

      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }

    return false
  }

  /**
   * 🔹 ПРЯМЫЕ ДЕЙСТВИЯ (БЕЗ ПРОВЕРКИ)
   */

  /**
   * Выполнить отмену напрямую (используется когда уже знаем, что нужна отмена)
   */
  static async executeCancel(ctx: MyContext, customMessage?: string): Promise<void> {
    const isRu = isRussianFromState(ctx)

    logger.info('[CancelButtonService] Execute cancel', {
      telegramId: ctx.from?.id,
      hasCustomMessage: !!customMessage
    })

    await ctx.reply(
      customMessage || (isRu ? 'Операция отменена.' : 'Operation cancelled.'),
      { reply_markup: { remove_keyboard: true } }
    )

    await ctx.scene.leave()
    await ctx.scene.enter(ModeEnum.MainMenu)
  }

  /**
   * Перейти в главное меню напрямую (используется когда уже знаем, что нужен переход)
   */
  static async executeMainMenu(ctx: MyContext, customMessage?: string): Promise<void> {
    const isRu = isRussianFromState(ctx)

    logger.info('[CancelButtonService] Execute main menu', {
      telegramId: ctx.from?.id,
      hasCustomMessage: !!customMessage
    })

    await ctx.reply(
      customMessage || (isRu ? 'Переходим в главное меню.' : 'Going to main menu.'),
      { reply_markup: { remove_keyboard: true } }
    )

    await ctx.scene.leave()
    await ctx.scene.enter(ModeEnum.MainMenu)
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
