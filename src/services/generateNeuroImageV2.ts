import { v4 as uuidv4 } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { TelegramId } from '@/interfaces/telegram.interface'
import { isRussian } from '@/helpers/language'
import { MyContext } from '@/interfaces'
import { Logger as logger } from '@/utils/logger'

export async function generateNeuroImageV2(
  prompt: string,
  numImages: number,
  telegram_id: TelegramId,
  ctx: MyContext,
  botName: string
): Promise<{ data: string } | null> {
  if (!ctx.session.prompt) {
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    throw new Error('User model not found')
  }

  if (!numImages) {
    throw new Error('Num images not found')
  }

  logger.info({
    message: '🚀 Начало генерации NeurophotoV2',
    description: 'Starting NeurophotoV2 generation',
    prompt: prompt.substring(0, 50) + '...',
    numImages,
    telegram_id,
    botName,
  })

  try {
    // Создаем уникальный идентификатор для события
    const uniqueId = `neuro-photo-v2-${uuidv4()}`

    // Отправляем событие в Inngest для асинхронной обработки
    const response = await inngest.send({
      id: uniqueId,
      name: 'neuro/photo-v2.generate',
      data: {
        prompt,
        num_images: numImages || 1,
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
    })

    // Отправляем пользователю сообщение об ошибке
    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса. Пожалуйста, попробуйте позже.'
        : '😔 An error occurred while sending the request. Please try again later.'
    )

    return null
  }
}
