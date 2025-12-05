import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
// ✅ ИМПОРТИРУЕМ Navigation для правильного показа меню
import { showMainMenu, getMainMenuText } from '@/navigation'

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
    return [Markup.button.text(getMainMenuText(isRu))]
  }

  /**
   * Создает inline кнопку отмены - БЕЗ эмодзи
   */
  static createInlineCancelButton(isRu: boolean, callbackData = 'cancel') {
    return Markup.button.callback(isRu ? 'Отмена' : 'Cancel', callbackData)
  }

  /**
   * Создает inline кнопку главного меню
   */
  static createInlineMainMenuButton(isRu: boolean) {
    return Markup.button.callback(
      getMainMenuText(isRu),
      'main_menu'
    )
  }

  /**
   * Создает массив кнопок с "Справка" и "Отмена"
   */
  static createHelpCancelArray(isRu: boolean) {
    return [[isRu ? 'ℹ️ Справка' : 'ℹ️ Help'], [isRu ? 'Отмена' : 'Cancel']]
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

    const rawText = ctx.message.text || ''
    const text = rawText.toLowerCase().trim()
    const isRu = isRussianFromState(ctx)

    logger.info('[CancelButtonService] handleCancelButton called', {
      telegramId: ctx.from?.id,
      rawText,
      normalizedText: text,
      currentScene: (ctx as any).scene?.current?.id,
    })

    // Проверяем команды отмены
    if (text === 'отмена' || text === 'cancel' || text === '/cancel') {
      logger.info(
        '[CancelButtonService] Cancel triggered (matched cancel keywords)',
        {
          telegramId: ctx.from?.id,
          text: rawText,
          currentScene: (ctx as any).scene?.current?.id,
        }
      )

      // Единая точка: показываем короткое сообщение и переходим в главное меню
      await CancelButtonService.executeMainMenu(ctx, isRu ? 'Отмена' : 'Cancel')
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

    const rawText = ctx.message.text || ''
    const text = rawText.toLowerCase().trim()
    const isRu = isRussianFromState(ctx)

    logger.info('[CancelButtonService] handleMainMenuButton called', {
      telegramId: ctx.from?.id,
      rawText,
      normalizedText: text,
      currentScene: (ctx as any).scene?.current?.id,
    })

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
        text: rawText,
        currentScene: (ctx as any).scene?.current?.id,
      })

      // ✅ ИСПРАВЛЕНО: Используем executeMainMenu для единообразного возврата
      await CancelButtonService.executeMainMenu(
        ctx,
        isRu ? 'Переходим в главное меню.' : 'Going to main menu.'
      )
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
  static async handleCancelCallback(
    ctx: MyContext,
    callbackData = 'cancel'
  ): Promise<boolean> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return false
    }

    if (ctx.callbackQuery.data === callbackData) {
      const isRu = isRussianFromState(ctx)

      logger.info('[CancelButtonService] Inline cancel triggered', {
        telegramId: ctx.from?.id,
        callbackData,
      })

      await ctx.answerCbQuery()
      
      // ✅ ИСПРАВЛЕНО: Используем executeMainMenu для единообразного возврата
      await CancelButtonService.executeMainMenu(
        ctx,
        isRu ? 'Отменено. Возвращаю в главное меню.' : 'Cancelled. Returning to main menu.'
      )
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
        telegramId: ctx.from?.id,
      })

      await ctx.answerCbQuery()
      
      // ✅ ИСПРАВЛЕНО: Используем executeMainMenu для единообразного возврата
      await CancelButtonService.executeMainMenu(
        ctx,
        isRu ? 'Переходим в главное меню.' : 'Going to main menu.'
      )
      return true
    }

    return false
  }

  /**
   * 🔹 ПРЯМЫЕ ДЕЙСТВИЯ (БЕЗ ПРОВЕРКИ)
   */

  /**
   * Выполнить отмену напрямую (используется когда уже знаем, что нужна отмена)
   * ✅ ИСПРАВЛЕНО: Использует executeMainMenu для единообразного возврата в меню
   */
  static async executeCancel(
    ctx: MyContext,
    customMessage?: string
  ): Promise<void> {
    const isRu = isRussianFromState(ctx)

    logger.info('[CancelButtonService] Execute cancel', {
      telegramId: ctx.from?.id,
      hasCustomMessage: !!customMessage,
    })

    // ✅ ИСПРАВЛЕНО: Используем executeMainMenu для единообразного возврата
    const cancelMessage =
      customMessage || (isRu ? 'Отменено. Возвращаю в главное меню.' : 'Cancelled. Returning to main menu.')
    
    await CancelButtonService.executeMainMenu(ctx, cancelMessage)
  }

  /**
   * Перейти в главное меню напрямую (используется когда уже знаем, что нужен переход)
   * ✅ ИСПРАВЛЕНО: Использует showMainMenu() из NavigationService для правильного показа меню
   */
  static async executeMainMenu(
    ctx: MyContext,
    customMessage?: string
  ): Promise<void> {
    const isRu = isRussianFromState(ctx)

    logger.info('[CancelButtonService] Execute main menu', {
      telegramId: ctx.from?.id,
      hasCustomMessage: !!customMessage,
      currentScene: (ctx as any).scene?.current?.id,
    })

    try {
      // Покидаем текущую сцену
      await ctx.scene.leave()

      // Показываем сообщение об отмене (если есть)
      if (customMessage) {
        await ctx.reply(customMessage, {
          reply_markup: { remove_keyboard: true },
        })
      }

      // ✅ ИСПРАВЛЕНО: Используем showMainMenu() из NavigationService
      // Это гарантирует правильное отображение меню с категориями и важными кнопками
      await showMainMenu(ctx)

      logger.info('[CancelButtonService] Successfully returned to main menu', {
        telegramId: ctx.from?.id,
      })
    } catch (error) {
      logger.error('[CancelButtonService] Error executing main menu:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })

      // Fallback: если showMainMenu не сработал, используем старый способ
      try {
        await ctx.scene.enter(ModeEnum.MainMenu)
      } catch (fallbackError) {
        logger.error(
          '[CancelButtonService] Fallback also failed, sending error message',
          {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
            telegramId: ctx.from?.id,
          }
        )

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при возврате в главное меню. Попробуйте команду /start'
            : '❌ An error occurred while returning to main menu. Try /start command'
        )
      }
    }
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
