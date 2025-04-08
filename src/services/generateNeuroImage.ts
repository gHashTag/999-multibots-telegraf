import { isRussian } from '@/helpers'
import { Context } from 'telegraf'
import { Logger as logger } from '@/utils/logger'

import { inngest } from '@/inngest-functions/clients'

/**
 * Отправляет запрос на генерацию нейроизображения через Inngest
 */
export async function generateNeuroImage(
  prompt: string,
  model_url: string,
  numImages: number | string,
  telegram_id: string,
  ctx: Context,
  botName: string
): Promise<void> {
  // Валидация входных данных
  if (!prompt) {
    throw new Error('Prompt not found')
  }

  if (!model_url) {
    throw new Error('Model URL not found')
  }

  // Преобразуем numImages в число
  const validNumImages = numImages ? parseInt(String(numImages), 10) : 1

  if (isNaN(validNumImages)) {
    logger.error('❌ Некорректное значение numImages:', {
      description: 'Invalid numImages value',
      received_value: numImages,
      received_type: typeof numImages,
    })
  }

  try {
    // Отправляем пользователю сообщение о том, что запрос принят
    await ctx.reply(
      isRussian(ctx)
        ? '🚀 Ваш запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
        : '🚀 Your image generation request has been accepted! The result will be sent to this chat shortly.'
    )

    // Вызываем существующую функцию через событие neuro/photo.generate
    await inngest.send({
      name: 'neuro/photo.generate',
      data: {
        prompt,
        model_url,
        numImages: validNumImages,
        telegram_id,
        username: ctx.message?.from?.username || '',
        is_ru: isRussian(ctx),
        bot_name: botName,
      },
    })

    logger.info('🚀 Запрос на генерацию отправлен:', {
      description: 'Image generation request sent',
      prompt,
      model_url,
      numImages: validNumImages,
      telegram_id,
      botName,
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке запроса на генерацию:', {
      description: 'Error sending generation request',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
    })

    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса. Пожалуйста, попробуйте позже.'
        : '😔 An error occurred while sending the request. Please try again later.'
    )
  }
}
