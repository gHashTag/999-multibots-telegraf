/**
 * Утилиты для создания клавиатур с кнопкой отмены
 *
 * Предоставляет удобные функции для добавления кнопки отмены
 * в inline клавиатуры для всех wizard'ов и сцен
 */

import { Markup } from 'telegraf'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export interface CancelKeyboardOptions {
  /**
   * Текст кнопки на русском языке
   */
  textRu?: string

  /**
   * Текст кнопки на английском языке
   */
  textEn?: string

  /**
   * Callback data для кнопки
   */
  callbackData?: string

  /**
   * Эмодзи для кнопки
   */
  emoji?: string
}

/**
 * Создает inline клавиатуру только с кнопкой отмены
 */
export function createCancelOnlyKeyboard(
  ctx: any,
  options: CancelKeyboardOptions = {}
): any {
  const isRu = isRussianFromState(ctx)
  const emoji = options.emoji || '❌'
  const textRu = options.textRu || `${emoji} Отмена`
  const textEn = options.textEn || `${emoji} Cancel`
  const callbackData = options.callbackData || 'cancel_operation'

  return Markup.inlineKeyboard([
    [Markup.button.callback(isRu ? textRu : textEn, callbackData)],
  ])
}

/**
 * Добавляет кнопку отмены к существующей клавиатуре
 */
export function addCancelButtonToKeyboard(
  keyboard: any[][],
  ctx: any,
  options: CancelKeyboardOptions = {}
): any[][] {
  const isRu = isRussianFromState(ctx)
  const emoji = options.emoji || '❌'
  const textRu = options.textRu || `${emoji} Отмена`
  const textEn = options.textEn || `${emoji} Cancel`
  const callbackData = options.callbackData || 'cancel_operation'

  return [
    ...keyboard,
    [Markup.button.callback(isRu ? textRu : textEn, callbackData)],
  ]
}

/**
 * Создает клавиатуру с произвольными кнопками и кнопкой отмены
 */
export function createKeyboardWithCancel(
  ctx: any,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
  options: CancelKeyboardOptions = {}
): any {
  const keyboardWithCancel = [
    ...buttons,
    [
      Markup.button.callback(
        isRussianFromState(ctx)
          ? options.textRu || '❌ Отмена'
          : options.textEn || '❌ Cancel',
        options.callbackData || 'cancel_operation'
      ),
    ],
  ]

  return Markup.inlineKeyboard(keyboardWithCancel)
}

/**
 * Создает клавиатуру с одной кнопкой и кнопкой отмены
 */
export function createSingleButtonKeyboardWithCancel(
  ctx: any,
  buttonText: string,
  buttonCallback: string,
  options: CancelKeyboardOptions = {}
): any {
  return createKeyboardWithCancel(
    ctx,
    [[Markup.button.callback(buttonText, buttonCallback)]],
    options
  )
}

/**
 * Создает клавиатуру с двумя кнопками в ряд и кнопкой отмены
 */
export function createTwoButtonKeyboardWithCancel(
  ctx: any,
  button1: { text: string; callback_data: string },
  button2: { text: string; callback_data: string },
  options: CancelKeyboardOptions = {}
): any {
  return createKeyboardWithCancel(
    ctx,
    [
      [Markup.button.callback(button1.text, button1.callback_data)],
      [Markup.button.callback(button2.text, button2.callback_data)],
    ],
    options
  )
}

/**
 * Создает клавиатуру с кнопкой "Назад" и кнопкой "Отмена"
 */
export function createBackAndCancelKeyboard(
  ctx: any,
  backCallback: string,
  options: CancelKeyboardOptions = {}
): any {
  const isRu = isRussianFromState(ctx)

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', backCallback),
      Markup.button.callback(
        isRu ? options.textRu || '❌ Отмена' : options.textEn || '❌ Cancel',
        options.callbackData || 'cancel_operation'
      ),
    ],
  ])
}

/**
 * Создает клавиатуру с кнопкой "Далее" и кнопкой "Отмена"
 */
export function createNextAndCancelKeyboard(
  ctx: any,
  nextCallback: string,
  options: CancelKeyboardOptions = {}
): any {
  const isRu = isRussianFromState(ctx)

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(isRu ? '➡️ Далее' : '➡️ Next', nextCallback),
      Markup.button.callback(
        isRu ? options.textRu || '❌ Отмена' : options.textEn || '❌ Cancel',
        options.callbackData || 'cancel_operation'
      ),
    ],
  ])
}

/**
 * Создает клавиатуру с кнопкой "Подтвердить" и кнопкой "Отмена"
 */
export function createConfirmAndCancelKeyboard(
  ctx: any,
  confirmCallback: string,
  options: CancelKeyboardOptions = {}
): any {
  const isRu = isRussianFromState(ctx)

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '✅ Подтвердить' : '✅ Confirm',
        confirmCallback
      ),
      Markup.button.callback(
        isRu ? options.textRu || '❌ Отмена' : options.textEn || '❌ Cancel',
        options.callbackData || 'cancel_operation'
      ),
    ],
  ])
}

export default {
  createCancelOnlyKeyboard,
  addCancelButtonToKeyboard,
  createKeyboardWithCancel,
  createSingleButtonKeyboardWithCancel,
  createTwoButtonKeyboardWithCancel,
  createBackAndCancelKeyboard,
  createNextAndCancelKeyboard,
  createConfirmAndCancelKeyboard,
}
