/**
 * Централизованная система отмены для всех wizard'ов и сцен
 *
 * Предоставляет единый механизм отмены для всех операций в боте,
 * который возвращает пользователя в главное меню.
 */

import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from './logger'

export interface CancelOptions {
  /**
   * Сообщение для подтверждения отмены (на русском)
   */
  messageRu?: string

  /**
   * Сообщение для подтверждения отмены (на английском)
   */
  messageEn?: string

  /**
   * Нужно ли очищать сессию
   */
  clearSession?: boolean

  /**
   * Дополнительные действия при отмене
   */
  onCancel?: (ctx: MyContext) => Promise<void>
}

/**
 * Централизованная функция для обработки отмены операции
 * Возвращает пользователя в главное меню
 */
export async function handleCancel(
  ctx: MyContext,
  options: CancelOptions = {}
): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id

  try {
    logger.info(`[handleCancel] User ${telegramId} cancelled operation`, {
      sceneId: ctx.scene?.current?.id,
      sessionMode: ctx.session?.mode,
      hasOptions: !!options
    })

    // Подтверждаем callback query если это callback
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery()
    }

    // Показываем сообщение об отмене
    const message = isRu
      ? (options.messageRu || '❌ Операция отменена')
      : (options.messageEn || '❌ Operation cancelled')

    await ctx.reply(message)

    // Выполняем дополнительные действия при отмене
    if (options.onCancel) {
      await options.onCancel(ctx)
    }

    // Очищаем сессию если нужно
    if (options.clearSession !== false) {
      // Очищаем все данные wizard'а
      if (ctx.session && 'wizard' in ctx.session) {
        ctx.session.wizard = {}
      }

      // Сбрасываем режим на главное меню
      ctx.session.mode = 'main_menu'
    }

    logger.info(`[handleCancel] User ${telegramId} returning to main menu`)

    // Покидаем текущую сцену
    await ctx.scene.leave()

    // Устанавливаем режим главного меню
    ctx.session.mode = ModeEnum.MainMenu

    // Переходим в главное меню
    await ctx.scene.enter(ModeEnum.MainMenu)

  } catch (error) {
    logger.error(`[handleCancel] Error during cancel operation`, {
      telegramId,
      error: error instanceof Error ? error.message : String(error)
    })

    // В любом случае пытаемся показать главное меню
    try {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (menuError) {
      logger.error(`[handleCancel] Failed to show main menu`, {
        telegramId,
        error: menuError instanceof Error ? menuError.message : String(menuError)
      })
    }
  }
}

/**
 * Создает стандартный обработчик отмены для wizard'ов
 * Используется для создания action в Scenes.WizardScene
 */
export function createCancelActionHandler(
  actionName: string,
  options: CancelOptions = {}
) {
  return async (ctx: MyContext) => {
    await handleCancel(ctx, {
      messageRu: options.messageRu || '❌ Операция отменена',
      messageEn: options.messageEn || '❌ Operation cancelled',
      clearSession: options.clearSession !== false,
      onCancel: options.onCancel
    })
  }
}

/**
 * Проверяет, является ли callback data командой отмены
 */
export function isCancelAction(callbackData: string): boolean {
  const cancelPatterns = [
    /^cancel_/,
    /^cancel$/,
    /^lipsync_cancel$/,
    /^neuro_cancel$/,
    /^avatars_cancel$/,
    /^photo_cancel$/,
    /^video_cancel$/,
    /^voice_cancel$/,
    /^help_cancel$/,
  ]

  return cancelPatterns.some(pattern => pattern.test(callbackData))
}

/**
 * Создает inline клавиатуру с кнопкой отмены
 */
export function createCancelKeyboard(isRu: boolean): any {
  const { Markup } = require('telegraf')

  return Markup.inlineKeyboard([
    [Markup.button.callback(
      isRu ? '❌ Отмена' : '❌ Cancel',
      'cancel_operation'
    )]
  ])
}

/**
 * Добавляет кнопку отмены к существующей клавиатуре
 */
export function addCancelButton(
  keyboard: any[][],
  isRu: boolean
): any[][] {
  const { Markup } = require('telegraf')

  return [
    ...keyboard,
    [Markup.button.callback(
      isRu ? '❌ Отмена' : '❌ Cancel',
      'cancel_operation'
    )]
  ]
}

/**
 * Создает обработчик для любой команды отмены
 * Может быть использован как глобальный обработчик
 */
export function createGlobalCancelHandler(options: CancelOptions = {}) {
  return async (ctx: MyContext) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return
    }

    const callbackData = ctx.callbackQuery.data

    if (isCancelAction(callbackData)) {
      await handleCancel(ctx, options)
    }
  }
}

export default handleCancel
