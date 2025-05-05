import type { MyContext } from '@/interfaces'

/**
 * Adapter for Telegram interactions in the ImageToPrompt module.
 * Handles user notifications for analysis start, completion, and errors.
 * This adapter is injected as a dependency to ensure isolation.
 */

/**
 * Notify user when image analysis starts.
 * @param ctx Telegram context for sending messages.
 * @param telegramId User's Telegram ID.
 */
export async function onAnalysisStart(
  ctx: MyContext,
  telegramId: string
): Promise<void> {
  // Placeholder for sending a message to the user
  console.log(`Notifying user ${telegramId} that analysis has started`)
  await ctx.telegram.sendMessage(
    Number(telegramId),
    '🕒 Анализ изображения начался...'
  )
}

/**
 * Notify user when image analysis is complete.
 * @param ctx Telegram context for sending messages.
 * @param telegramId User's Telegram ID.
 * @param prompt Generated prompt from the image.
 */
export async function onAnalysisComplete(
  ctx: MyContext,
  telegramId: string,
  prompt: string
): Promise<void> {
  // Placeholder for sending a message with the results to the user
  console.log(
    `Notifying user ${telegramId} that analysis is complete with prompt:`,
    prompt
  )
  await ctx.telegram.sendMessage(
    Number(telegramId),
    `✅ Анализ завершен! Сгенерированный промпт: ${prompt}`
  )
}

/**
 * Notify user when an error occurs during image analysis.
 * @param ctx Telegram context for sending messages.
 * @param telegramId User's Telegram ID.
 * @param error Error message to display.
 */
export async function onError(
  ctx: MyContext,
  telegramId: string,
  error: string
): Promise<void> {
  // Placeholder for sending an error message to the user
  console.log(`Notifying user ${telegramId} of error: ${error}`)
  await ctx.telegram.sendMessage(
    Number(telegramId),
    `❌ Ошибка при анализе изображения: ${error}`
  )
}
