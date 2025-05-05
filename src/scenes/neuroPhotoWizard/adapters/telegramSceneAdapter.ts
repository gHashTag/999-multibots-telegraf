import type { MyContext } from '@/interfaces'
import { createHelpCancelKeyboard } from '@/menu'

/**
 * Adapter for Telegram interactions in the NeuroPhotoWizard module.
 * Handles user notifications for various steps in the wizard flow.
 * This adapter is injected as a dependency to ensure isolation.
 */

/**
 * Send welcome message to the user at the start of the NeuroPhoto conversation.
 * @param ctx Telegram context for sending messages.
 * @param isRussian Whether the user speaks Russian.
 */
export async function sendWelcomeMessage(
  ctx: MyContext,
  isRussian: boolean
): Promise<void> {
  await ctx.reply(
    isRussian
      ? `🎨 <b>Создание Hейрофото</b>

Опишите <b>НА АНГЛИЙСКОМ ЯЗЫКЕ</b>, что вы хотите изобразить. Например:
- portrait of a girl in anime style
- man in a space suit
- fantastic landscape with dragons

<i>Нейросеть создаст изображение на основе вашего запроса с использованием вашей персональной модели. Для лучших результатов используйте английский язык!</i>`
      : `🎨 <b>Creating Neural Photo</b>

Describe what you want to depict. For example:
- anime-style portrait of a girl
- cat in a space suit
- fantastic landscape with dragons

<i>The neural network will create an image based on your request using your personal model.</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: createHelpCancelKeyboard(isRussian).reply_markup,
    }
  )
}

/**
 * Notify user when they don't have an available model.
 * @param ctx Telegram context for sending messages.
 * @param isRussian Whether the user speaks Russian.
 */
export async function notifyNoModelAvailable(
  ctx: MyContext,
  isRussian: boolean
): Promise<void> {
  await ctx.reply(
    isRussian
      ? `⚠️ У вас нет доступной модели для нейрофото.
Создайте свою модель или воспользуйтесь другими функциями бота.`
      : `⚠️ You don't have an available model for neural photos.
Create your model or use other bot functions.`,
    { parse_mode: 'HTML' }
  )
}

/**
 * Send error message to the user when something goes wrong.
 * @param ctx Telegram context for sending messages.
 * @param isRussian Whether the user speaks Russian.
 */
export async function sendErrorMessage(
  ctx: MyContext,
  isRussian: boolean
): Promise<void> {
  await ctx.reply(
    isRussian
      ? `❌ Произошла ошибка. Пожалуйста, попробуйте еще раз позже.`
      : `❌ An error occurred. Please try again later.`
  )
}

/**
 * Send prompt confirmation message to the user.
 * @param ctx Telegram context for sending messages.
 * @param prompt The prompt text to confirm.
 * @param isRussian Whether the user speaks Russian.
 */
export async function sendPromptConfirmation(
  ctx: MyContext,
  prompt: string,
  isRussian: boolean
): Promise<void> {
  await ctx.reply(
    isRussian
      ? `✅ Ваш запрос принят: <b>${prompt}</b>

Выберите количество изображений для генерации:`
      : `✅ Your request is accepted: <b>${prompt}</b>

Select the number of images to generate:`,
    { parse_mode: 'HTML' }
  )
}
