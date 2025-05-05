import type { MyContext } from '@/interfaces'

/**
 * Adapter for Telegram interactions in the NeuroPhoto module.
 * Handles user notifications for generation start, completion, and errors.
 * This adapter is injected as a dependency to ensure isolation.
 */

/**
 * Notify user when image generation starts.
 * @param ctx Telegram context for sending messages.
 * @param telegramId User's Telegram ID.
 */
export async function onGenerationStart(
  ctx: MyContext,
  telegramId: string
): Promise<void> {
  // Placeholder for sending a message to the user
  console.log(`Notifying user ${telegramId} that generation has started`)
  await ctx.telegram.sendMessage(
    Number(telegramId),
    '🕒 Генерация изображения началась...'
  )
}

/**
 * Notify user when image generation is complete.
 * @param ctx Telegram context for sending messages.
 * @param telegramId User's Telegram ID.
 * @param urls URLs of the generated images.
 */
export async function onGenerationComplete(
  ctx: MyContext,
  telegramId: string,
  urls: string[]
): Promise<void> {
  // Placeholder for sending a message with the results to the user
  console.log(
    `Notifying user ${telegramId} that generation is complete with URLs:`,
    urls
  )
  await ctx.telegram.sendMessage(
    Number(telegramId),
    `✅ Генерация завершена! Ваши изображения готовы: ${urls.join(', ')}`
  )
}

/**
 * Notify user when an error occurs during image generation.
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
    `❌ Ошибка при генерации изображения: ${error}`
  )
}
