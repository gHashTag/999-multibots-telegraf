import { isRussian } from '@/helpers'
import { Context } from 'telegraf'
import { Logger as logger } from '@/utils/logger'

import { inngest } from '@/inngest-functions/clients'
import { v4 as uuidv4 } from 'uuid'

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
    logger.error('❌ Отсутствует промпт', {
      description: 'Prompt not found',
      telegram_id,
    })
    throw new Error('Prompt not found')
  }

  if (!model_url) {
    logger.error('❌ Отсутствует URL модели', {
      description: 'Model URL not found',
      telegram_id,
    })
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

    // Создаем уникальный идентификатор запроса
    const requestId = `neuro-photo-${uuidv4()}`

    logger.info('🔍 Подготовка Inngest запроса:', {
      description: 'Preparing Inngest request',
      event_id: requestId,
      endpoint:
        process.env.NODE_ENV === 'development'
          ? 'http://localhost:8288/e/dev-key'
          : undefined,
      telegram_id,
      model_url: model_url.substring(0, 50) + '...',
      numImages: validNumImages,
      prompt: prompt.substring(0, 30) + '...',
      is_ru: isRussian(ctx),
      bot_name: botName,
      timestamp: new Date().toISOString(),
    })

    const eventData = {
      prompt,
      model_url,
      numImages: validNumImages,
      telegram_id,
      username: ctx.message?.from?.username || '',
      is_ru: isRussian(ctx),
      bot_name: botName,
    }

    logger.info('📦 Данные события:', {
      description: 'Event data prepared',
      event_id: requestId,
      data: JSON.stringify(eventData),
      timestamp: new Date().toISOString(),
    })

    // Вызываем существующую функцию через событие neuro/photo.generate
    const response = await inngest.send({
      id: requestId, // Добавляем уникальный id для каждого события
      name: 'neuro/photo.generate',
      data: eventData,
    })

    logger.info('🚀 Запрос на генерацию отправлен:', {
      description: 'Image generation request sent',
      event_id: requestId,
      prompt,
      model_url,
      numImages: validNumImages,
      telegram_id,
      botName,
      response: JSON.stringify(response || {}),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке запроса на генерацию:', {
      description: 'Error sending generation request',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id,
      timestamp: new Date().toISOString(),
    })

    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса. Пожалуйста, попробуйте позже.'
        : '😔 An error occurred while sending the request. Please try again later.'
    )
  }
}
