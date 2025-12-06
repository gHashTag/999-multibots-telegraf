/**
 * Утилиты для отправки сообщений
 */

import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup, InlineKeyboardMarkup } from 'telegraf/types'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces/telegram-bot.interface'

/**
 * Отправить общее сообщение об ошибке
 * @param ctx - Контекст Telegraf
 * @param isRuOrError - Может быть boolean (isRu) или string (errorText) или Error
 * @param errorOrUndefined - Может быть Error или undefined
 */
export async function sendGenericErrorMessage(
  ctx: MyContext,
  isRuOrError?: boolean | string | Error,
  errorOrUndefined?: Error | string
) {
  // Определяем параметры в зависимости от того, что передано
  let isRu: boolean
  let errorText: string | undefined

  if (typeof isRuOrError === 'boolean') {
    // Новая сигнатура: (ctx, isRu, error?)
    isRu = isRuOrError
    if (errorOrUndefined instanceof Error) {
      errorText = errorOrUndefined.message
    } else if (typeof errorOrUndefined === 'string') {
      errorText = errorOrUndefined
    }
  } else if (typeof isRuOrError === 'string') {
    // Старая сигнатура: (ctx, errorText)
    isRu = await isRussianFromState(ctx)
    errorText = isRuOrError
  } else if (isRuOrError instanceof Error) {
    // Вызов: (ctx, error)
    isRu = await isRussianFromState(ctx)
    errorText = isRuOrError.message
  } else {
    // Вызов: (ctx)
    isRu = await isRussianFromState(ctx)
  }

  const message = errorText || (
    isRu
      ? '❌ Произошла ошибка. Попробуйте позже.'
      : '❌ An error occurred. Please try again later.'
  )

  await ctx.reply(message)
}

/**
 * Отправить сообщение об отмене
 */
export async function cancelMenu(ctx: MyContext) {
  const isRu = await isRussianFromState(ctx)

  const message = isRu
    ? '❌ Операция отменена'
    : '❌ Operation cancelled'

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(
      isRu ? 'Вернуться в меню' : 'Back to menu',
      'back_to_menu'
    )]
  ])

  await ctx.reply(message, keyboard)
}

/**
 * Массив кнопок отмены и помощи
 */
export const cancelHelpArray = [
  [
    Markup.button.callback(
      '❌ Отмена',
      'cancel'
    ),
    Markup.button.callback(
      '❓ Помощь',
      'help'
    )
  ]
]

/**
 * Создать клавиатуру с кнопками отмены и помощи
 */
export function createHelpCancelKeyboard(isRu: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '❌ Отмена' : '❌ Cancel',
        'cancel'
      ),
      Markup.button.callback(
        isRu ? '❓ Помощь' : '❓ Help',
        'help'
      )
    ]
  ])
}

/**
 * Запрос описания фото (текстового промпта)
 * @param ctx - Контекст Telegraf
 * @param isRu - Язык пользователя (опционально, если не передан - определяется автоматически)
 * @param _mode - Режим (не используется, для совместимости)
 */
export async function sendPhotoDescriptionRequest(
  ctx: MyContext,
  isRu?: boolean,
  _mode?: string
) {
  // Если isRu не передан, определяем автоматически
  const isRussian = isRu !== undefined ? isRu : await isRussianFromState(ctx)

  // ✅ ИСПРАВЛЕНО: Более понятное сообщение - нужен ТЕКСТ, не фото
  const message = isRussian
    ? '✍️ Опишите текстом, какое изображение вы хотите сгенерировать:\n\n💡 Например: "красивый портрет на фоне моря" или "деловой стиль в офисе"'
    : '✍️ Describe in text what image you want to generate:\n\n💡 For example: "beautiful portrait by the sea" or "business style in the office"'

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(
      isRussian ? '❌ Отмена' : '❌ Cancel',
      'cancel'
    )]
  ])

  await ctx.reply(message, keyboard)
}

/**
 * Сообщение об улучшении промпта
 */
export async function sendPromptImprovementMessage(ctx: MyContext) {
  const isRu = await isRussianFromState(ctx)

  const message = isRu
    ? '✨ Улучшаю ваш промпт...'
    : '✨ Improving your prompt...'

  await ctx.reply(message)
}

/**
 * Сообщение об ошибке улучшения промпта
 */
export async function sendPromptImprovementFailureMessage(ctx: MyContext) {
  const isRu = await isRussianFromState(ctx)

  const message = isRu
    ? '❌ Не удалось улучшить промпт. Попробуйте еще раз.'
    : '❌ Failed to improve prompt. Please try again.'

  await ctx.reply(message)
}

/**
 * Меню выбора количества шагов для обучения модели (Digital Avatar Body)
 */
export function getStepSelectionMenu(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  return Markup.keyboard([
    [
      Markup.button.text(isRu ? '1000 шагов' : '1000 steps'),
      Markup.button.text(isRu ? '1500 шагов' : '1500 steps'),
      Markup.button.text(isRu ? '2000 шагов' : '2000 steps'),
    ],
    [
      Markup.button.text(isRu ? '3000 шагов' : '3000 steps'),
      Markup.button.text(isRu ? '3500 шагов' : '3500 steps'),
      Markup.button.text(isRu ? '4000 шагов' : '4000 steps'),
    ],
    [
      Markup.button.text(isRu ? '❓ Справка' : '❓ Help'),
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
    ],
  ])
    .resize()
    .oneTime()
}

/**
 * Меню выбора количества шагов V2 (меньше шагов для более быстрого обучения)
 */
export function getStepSelectionMenuV2(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  return Markup.keyboard([
    [
      Markup.button.text(isRu ? '100 шагов' : '100 steps'),
      Markup.button.text(isRu ? '200 шагов' : '200 steps'),
      Markup.button.text(isRu ? '300 шагов' : '300 steps'),
    ],
    [
      Markup.button.text(isRu ? '400 шагов' : '400 steps'),
      Markup.button.text(isRu ? '500 шагов' : '500 steps'),
      Markup.button.text(isRu ? '600 шагов' : '600 steps'),
    ],
    [
      Markup.button.text(isRu ? '700 шагов' : '700 steps'),
      Markup.button.text(isRu ? '800 шагов' : '800 steps'),
      Markup.button.text(isRu ? '1000 шагов' : '1000 steps'),
    ],
    [
      Markup.button.text(isRu ? 'Справка по команде' : 'Help for the command'),
      Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
    ],
  ])
    .resize()
    .oneTime()
}

/**
 * Клавиатура для генерации изображений
 */
export function createGenerateImageKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: 'Сгенерировать',
          callback_data: 'generate_image',
        },
        {
          text: 'Отмена',
          callback_data: 'cancel',
        },
      ],
    ],
  }
}
