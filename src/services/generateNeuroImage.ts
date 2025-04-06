import { inngest } from '@/inngest-functions/clients'
import { isRussian } from '@/helpers/language'
import { ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { Context } from 'telegraf'
import { TelegramId } from '@/interfaces/telegram.interface'
export async function generateNeuroImage(
  prompt: string,
  model_url: ModelUrl,
  numImages: number | string,
  telegram_id: TelegramId,
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

  // Преобразуем numImages в число, даже если это строка
  const validNumImages = numImages ? parseInt(String(numImages), 10) : 1

  if (isNaN(validNumImages)) {
    logger.error('❌ Некорректное значение numImages:', {
      description: 'Invalid numImages value',
      received_value: numImages,
      received_type: typeof numImages,
    })
    // Устанавливаем значение по умолчанию
    numImages = 1
  }

  const chatId = ctx.message?.chat?.id
  const messageId = ctx.message?.message_id

  logger.info('🚀 Запуск генерации изображения через Inngest:', {
    description: 'Starting neuro image generation via Inngest',
    prompt,
    model_url,
    numImages: validNumImages,
    numImages_type: typeof validNumImages,
    original_numImages: numImages,
    original_numImages_type: typeof numImages,
    telegram_id,
    botName,
    chat_id: chatId,
    message_id: messageId,
  })

  try {
    // Создаем уникальный идентификатор с использованием UUID
    const uniqueId = `neuro-photo-${uuidv4()}`

    logger.info('📝 Создаем событие с ID:', {
      description: 'Creating event with ID',
      event_id: uniqueId,
      prompt_preview: prompt.substring(0, 30),
      timestamp: new Date().toISOString(),
    })

    // Подготавливаем данные события
    const eventData = {
      prompt,
      model_url,
      numImages: validNumImages,
      telegram_id,
      username: ctx.message?.from?.username,
      is_ru: isRussian(ctx),
      bot_name: botName,
      chat_id: chatId,
      message_id: messageId,
    }

    logger.info('📦 Данные события:', {
      description: 'Event data prepared',
      event_data: JSON.stringify(eventData),
    })

    // Отправляем событие в Inngest для асинхронной обработки
    const response = await inngest.send({
      id: `neuro-photo-${botName}-${uuidv4()}`,
      name: 'neuro/photo.generate',
      data: eventData,
    })

    logger.info('✅ Событие успешно отправлено в Inngest:', {
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
  } catch (error) {
    logger.error('❌ Ошибка при отправке события в Inngest:', {
      description: 'Error sending event to Inngest',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
      telegram_id,
      chat_id: chatId,
      prompt_preview: prompt.substring(0, 30),
      timestamp: new Date().toISOString(),
    })

    try {
      // Повторная попытка с другим идентификатором
      const retryId = `neuro-photo-retry-${uuidv4()}`
      logger.info('🔄 Повторная попытка отправки события:', {
        description: 'Retrying event sending',
        retry_id: retryId,
      })

      await inngest.send({
        id: retryId,
        name: 'neuro/photo.generate',
        data: {
          prompt,
          model_url,
          numImages: validNumImages,
          telegram_id,
          username: ctx.message?.from?.username,
          is_ru: isRussian(ctx),
          bot_name: botName,
          chat_id: chatId,
          message_id: messageId,
          is_retry: true,
        },
      })

      logger.info('✅ Повторная отправка успешна:', {
        description: 'Retry successful',
        retry_id: retryId,
      })

      await ctx.reply(
        isRussian(ctx)
          ? '🚀 Ваш запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
          : '🚀 Your image generation request has been accepted! The result will be sent to this chat shortly.'
      )
      return
    } catch (retryError) {
      logger.error('❌ Ошибка при повторной отправке:', {
        description: 'Retry error',
        error:
          retryError instanceof Error
            ? retryError.message
            : 'Unknown retry error',
        stack: retryError instanceof Error ? retryError.stack : null,
      })
    }

    await ctx.reply(
      isRussian(ctx)
        ? '😔 Произошла ошибка при отправке запроса на генерацию. Пожалуйста, попробуйте позже.'
        : '😔 An error occurred while sending the generation request. Please try again later.'
    )
  }
}
