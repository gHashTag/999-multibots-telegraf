import { Markup } from 'telegraf'

/**
 * Creates a keyboard for video completion with options to:
 * - Repeat generation (with same parameters)
 * - Create new video
 * - Return to main menu
 *
 * Used after successful video generation via webhook callbacks.
 */
export function createVideoCompletionKeyboard(isRu: boolean) {
  return Markup.keyboard([
    [isRu ? '🔄 Повторить генерацию' : '🔄 Repeat generation'],
    [isRu ? '🎬 Новое видео' : '🎬 New video'],
    [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
  ]).resize()
}

/**
 * Get the "What's next?" message for video completion
 */
export function getVideoCompletionMessage(isRu: boolean): string {
  return isRu ? 'Что дальше?' : "What's next?"
}
