import { inngest } from '@/core/inngest/clients'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function generateNeuroImage(
  prompt: string,
  model_url: ModelUrl,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<void> {
  // Валидация входных данных
  if (!ctx.session.prompt) {
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    throw new Error('User model not found')
  }

  if (!numImages) {
    throw new Error('Num images not found')
  }

  logger.info('🚀 Запуск генерации изображения через Inngest:', {
    description: 'Starting neuro image generation via Inngest',
    prompt,
    model_url,
    numImages,
    telegram_id,
    botName,
  })

  try {
    // Отправляем событие в Inngest для асинхронной обработки
    await inngest.send({
      id: `neuro-photo-generate-${telegram_id}-${prompt}-${Date.now()}`,
      name: 'neuro/photo.generate',
      data: {
        prompt,
        model_url,
        numImages: numImages || 1,
        telegram_id,
        username: ctx.from?.username,
        is_ru: isRussian(ctx),
        bot_name: botName,
        chat_id: ctx.chat?.id, // Добавляем chat_id для отправки результата
        message_id: ctx.message?.message_id, // Можно использовать для ответа на сообщение
      },
    })

    // Отправляем пользователю сообщение о том, что запрос принят
    await ctx.reply(
      isRussian(ctx)
        ? '🚀 Ваш запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
        : '🚀 Your image generation request has been accepted! The result will be sent to this chat shortly.'
    )
  } catch (error) {
    logger.error('❌ Ошибка при отправке события в Inngest:', {
      description: 'Error sending event to Inngest',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса на генерацию. Пожалуйста, попробуйте позже.'
        : '😔 An error occurred while sending the generation request. Please try again later.'
    )
  }
}
