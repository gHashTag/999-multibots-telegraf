import { v4 as uuidv4 } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { TelegramId } from '@/interfaces/telegram.interface'
import { isRussian } from '@/helpers/language'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function generateNeuroImageV2(
  prompt: string,
  numImages: number,
  telegram_id: TelegramId,
  ctx: MyContext,
  botName: string
): Promise<{ data: string } | null> {
  logger.info({
    message: '🚀 Начало генерации NeurophotoV2',
    description: 'Starting NeurophotoV2 generation',
    prompt: prompt.substring(0, 50) + '...',
    numImages,
    telegram_id,
    botName,
    hasPrompt: !!ctx.session.prompt,
    hasUserModel: !!ctx.session.userModel,
  })

  try {
    // Проверяем наличие промпта
    if (!prompt && !ctx.session.prompt) {
      logger.error({
        message: '❌ Отсутствует промпт для генерации',
        description: 'No prompt found for generation',
        telegram_id,
        session_data: JSON.stringify(ctx.session || {}),
      })
      throw new Error('Prompt not found')
    }

    // Проверка модели пользователя не должна быть блокирующей
    if (!ctx.session.userModel) {
      logger.warn({
        message: '⚠️ Модель пользователя не найдена, но продолжаем генерацию',
        description: 'User model not found, but continuing generation',
        telegram_id,
        session_data: JSON.stringify(ctx.session || {}),
      })
    }

    // Убедимся что numImages имеет разумное значение
    const validNumImages = numImages && numImages > 0 ? numImages : 1

    // Создаем уникальный идентификатор для события
    const uniqueId = `neuro-photo-v2-${uuidv4()}`

    // Отправляем событие в Inngest для асинхронной обработки
    const response = await inngest.send({
      id: uniqueId,
      name: 'neuro/photo-v2.generate',
      data: {
        prompt: prompt || ctx.session.prompt,
        num_images: validNumImages,
        telegram_id,
        is_ru: isRussian(ctx),
        bot_name: botName,
        username: ctx.from?.username,
      },
    })

    logger.info({
      message: '✅ Событие успешно отправлено в Inngest',
      description: 'Event successfully sent to Inngest',
      event_id: uniqueId,
      response: JSON.stringify(response),
    })

    // Отправляем пользователю сообщение о том, что запрос принят
    await ctx.reply(
      isRussian(ctx)
        ? '🚀 Ваш запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
        : '🚀 Your image generation request has been accepted! The result will be sent to this chat shortly.'
    )

    return { data: 'Processing started' }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке события в Inngest',
      description: 'Error sending event to Inngest',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id,
      session_data: JSON.stringify(ctx.session || {}),
    })

    // Отправляем пользователю сообщение об ошибке
    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса. Пожалуйста, попробуйте позже. Нейрофото 1.1.1'
        : '😔 An error occurred while sending the request. Please try again later. Neurophoto 1.1.1'
    )

    return null
  }
}
