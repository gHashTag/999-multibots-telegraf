import { MyContext } from '@/interfaces'
import {
  generateTextToVideo,
  checkVideoGenerationStatus,
  VideoModelId,
} from '@/services/generateTextToVideo'
import {
  VIDEO_MODELS,
  getModelPriceInStars,
  getValidDuration,
  formatModelInfo,
} from '@/services/videoModels'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { calculateFinalPrice } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { Input } from 'telegraf'
import { uploadTelegramFileLocal } from '@/helpers/uploadTelegramFileLocal'

/**
 * Handler для генерации видео из текста через прямую интеграцию с сервером
 * Поддерживает все модели согласно документации
 */
export async function handleTextToVideoDirect(
  ctx: MyContext,
  prompt: string,
  modelId: VideoModelId,
  duration?: number,
  aspectRatio?: string
): Promise<void> {
  const telegram_id = ctx.from?.id.toString() || ''
  const username = ctx.from?.username || 'unknown'
  const is_ru = isRussianFromState(ctx)
  
  // Получаем bot_name и проверяем его доступность
  const bot_name = ctx.botInfo?.username || 'unknown_bot'
  
  // Проверяем, что бот существует и настроен правильно
  try {
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName(bot_name)
    if (!botResult.bot || botResult.error) {
      const errorMsg = is_ru 
        ? `❌ Произошла ошибка.\n\nБот "${bot_name}" не найден или не настроен правильно.\n\nОбратитесь в техподдержку.`
        : `❌ An error occurred.\n\nBot "${bot_name}" not found or not configured properly.\n\nPlease contact support.`
      
      logger.error(`[handleTextToVideoDirect] Bot configuration error`, {
        bot_name,
        error: botResult.error,
        telegram_id,
        username
      })
      
      await ctx.reply(errorMsg)
      return
    }
  } catch (error) {
    const errorMsg = is_ru 
      ? `❌ Произошла системная ошибка.\n\nОбратитесь в техподдержку.`
      : `❌ A system error occurred.\n\nPlease contact support.`
    
    logger.error(`[handleTextToVideoDirect] Critical bot system error`, { 
      error, 
      bot_name, 
      telegram_id, 
      username 
    })
    
    await ctx.reply(errorMsg)
    return
  }

  // Получаем корректную длительность для модели
  const validDuration = getValidDuration(modelId, duration)

  logger.info(
    '[handleTextToVideoDirect] ASPECT RATIO CHECK - Starting video generation',
    {
      telegram_id,
      username,
      modelId,
      duration: validDuration,
      aspectRatio: aspectRatio,
      promptLength: prompt.length,
    }
  )

  // Проверка подписки
  const hasSubscription = await checkSubscriptionGuard(ctx, 'NeuroVideo')
  if (!hasSubscription) {
    // checkSubscriptionGuard уже отправил сообщение, просто возвращаемся
    return
  }

  // Получаем информацию о модели
  const modelInfo = VIDEO_MODELS[modelId]
  const modelName = is_ru ? modelInfo.nameRu : modelInfo.name
  const price = getModelPriceInStars(modelId, validDuration)

  // Отправляем сообщение о начале генерации
  const processingMessage = await ctx.reply(
    is_ru
      ? `⏳ Начинаю генерацию видео...\n\n🤖 Модель: ${modelName}\n${
          validDuration ? `⏱️ Длительность: ${validDuration} сек\n` : ''
        }💰 Стоимость: ${price} ⭐\n\nЭто может занять несколько минут.`
      : `⏳ Starting video generation...\n\n🤖 Model: ${modelName}\n${
          validDuration ? `⏱️ Duration: ${validDuration} sec\n` : ''
        }💰 Cost: ${price} ⭐\n\nThis may take a few minutes.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: is_ru ? '🔄 Обновить статус' : '🔄 Update status',
              callback_data: 'update_video_status',
            },
          ],
        ],
      },
    }
  )

  try {
    // Запускаем генерацию видео
    const response = await generateTextToVideo({
      prompt,
      videoModel: modelId,
      duration: validDuration,
      aspectRatio: aspectRatio,
      telegram_id,
      username,
      is_ru,
      bot_name,
    })

    if (!response.success) {
      if (ctx && ctx.telegram && ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          is_ru
            ? `❌ Ошибка генерации: ${response.error}`
            : `❌ Generation error: ${response.error}`
        )
      }
      return
    }

    // Если видео готово сразу
    if (response.videoUrl) {
      await handleVideoReady(
        ctx,
        response.videoUrl,
        prompt,
        modelId,
        validDuration,
        processingMessage.message_id
      )
      return
    }

    // Если видео генерируется асинхронно
    if (response.jobId) {
      // Сохраняем jobId в сессии для последующих проверок
      ctx.session.videoJobId = response.jobId
      ctx.session.videoPrompt = prompt
      ctx.session.videoModelId = modelId
      ctx.session.videoDuration = validDuration
      ctx.session.videoMessageId = processingMessage.message_id

      // ✅ Включаем мониторинг статуса - endpoint реализован
      monitorVideoGeneration(ctx, response.jobId, processingMessage.message_id)
      if (ctx && ctx.telegram && ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          is_ru
            ? `✅ Генерация видео запущена!\n\n🤖 Модель: ${modelName}\n💰 Стоимость: ${price} ⭐\n🆔 Job ID: ${response.jobId}\n\n⏳ Видео будет отправлено автоматически, когда будет готово. Это может занять несколько минут.`
            : `✅ Video generation started!\n\n🤖 Model: ${modelName}\n💰 Cost: ${price} ⭐\n🆔 Job ID: ${response.jobId}\n\n⏳ The video will be sent automatically when ready. This may take a few minutes.`
        )
      }
    } else {
      // Если нет jobId, но генерация запущена, показываем сообщение
      logger.info(
        '[handleTextToVideoDirect] No jobId received, generation started without monitoring',
        {
          telegram_id,
          modelId,
          hasMessage: !!response.message,
        }
      )

      if (ctx && ctx.telegram && ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          is_ru
            ? `✅ Генерация видео запущена!\n\n🤖 Модель: ${modelName}\n💰 Стоимость: ${price} ⭐\n\n⏳ Видео будет отправлено автоматически, когда будет готово. Это может занять несколько минут.`
            : `✅ Video generation started!\n\n🤖 Model: ${modelName}\n💰 Cost: ${price} ⭐\n\n⏳ The video will be sent automatically when ready. This may take a few minutes.`
        )
      }
    }
  } catch (error) {
    logger.error('[handleTextToVideoDirect] Unexpected error:', error)

    if (ctx && ctx.telegram && ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        is_ru
          ? '❌ Произошла неожиданная ошибка при генерации видео.'
          : '❌ An unexpected error occurred during video generation.'
      )
    }
  }
}

/**
 * Мониторинг статуса генерации видео
 */
async function monitorVideoGeneration(
  ctx: MyContext,
  jobId: string,
  messageId: number
): Promise<void> {
  const is_ru = isRussianFromState(ctx)
  const maxAttempts = 60 // 5 минут максимум
  let attempts = 0

  const checkInterval = setInterval(async () => {
    attempts++

    try {
      const statusResponse = await checkVideoGenerationStatus(jobId, is_ru)

      if (statusResponse.success && statusResponse.videoUrl) {
        // Видео готово
        clearInterval(checkInterval)
        await handleVideoReady(
          ctx,
          statusResponse.videoUrl,
          ctx.session.videoPrompt || '',
          (ctx.session.videoModelId as VideoModelId) || 'veo-3-fast',
          ctx.session.videoDuration,
          messageId
        )

        // Очищаем сессию
        delete ctx.session.videoJobId
        delete ctx.session.videoPrompt
        delete ctx.session.videoModelId
        delete ctx.session.videoDuration
        delete ctx.session.videoMessageId
      } else if (!statusResponse.success) {
        // Ошибка генерации
        clearInterval(checkInterval)
        if (ctx && ctx.telegram && ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            is_ru
              ? `❌ Ошибка генерации: ${statusResponse.error}`
              : `❌ Generation error: ${statusResponse.error}`
          )
        }
      } else if (attempts >= maxAttempts) {
        // Таймаут
        clearInterval(checkInterval)
        if (ctx && ctx.telegram && ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            is_ru
              ? '⏱️ Генерация видео заняла слишком много времени. Пожалуйста, попробуйте позже.'
              : '⏱️ Video generation took too long. Please try again later.'
          )
        }
      }
    } catch (error) {
      clearInterval(checkInterval)
      logger.error('[monitorVideoGeneration] Error checking status:', error)

      if (ctx && ctx.telegram && ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          messageId,
          undefined,
          is_ru
            ? '❌ Ошибка при проверке статуса генерации.'
            : '❌ Error checking generation status.'
        )
      }
    }
  }, 5000) // Проверяем каждые 5 секунд
}

/**
 * Обработка готового видео
 */
async function handleVideoReady(
  ctx: MyContext,
  videoUrl: string,
  prompt: string,
  modelId: VideoModelId,
  duration: number | undefined,
  messageId: number
): Promise<void> {
  const is_ru = isRussianFromState(ctx)
  const telegram_id = ctx.from?.id.toString() || ''

  try {
    // Используем оригинальный URL видео с сервера
    const uploadedUrl = videoUrl

    // Обновляем сообщение
    if (ctx && ctx.telegram && ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        is_ru
          ? '✅ Видео успешно сгенерировано! Отправляю...'
          : '✅ Video generated successfully! Sending...'
      )
    }

    // Получаем информацию о модели для подписи
    const modelInfo = VIDEO_MODELS[modelId]
    const modelName = is_ru ? modelInfo.nameRu : modelInfo.name

    // Отправляем видео пользователю
    await ctx.replyWithVideo(Input.fromURL(uploadedUrl || videoUrl), {
      caption:
        `🎬 ${prompt}\n\n` +
        `🤖 ${is_ru ? 'Модель' : 'Model'}: ${modelName}\n` +
        (duration
          ? `⏱️ ${is_ru ? 'Длительность' : 'Duration'}: ${duration} ${
              is_ru ? 'сек' : 'sec'
            }\n`
          : '') +
        `⚡ ${is_ru ? 'Сгенерировано через' : 'Generated with'} AI`,
      parse_mode: 'Markdown',
    })

    // Списываем баланс
    const price = getModelPriceInStars(modelId, duration)

    await updateUserBalance(
      telegram_id,
      price,
      PaymentType.MONEY_OUTCOME,
      `Video generation: ${modelId}${duration ? ` (${duration}s)` : ''}`
    )

    // Показываем кнопки после успешной отправки видео
    const keyboard = {
      keyboard: [
        [
          is_ru
            ? '✨ Создать еще (Текст в Видео)'
            : '✨ Create More (Text to Video)',
        ],
        [
          is_ru
            ? '🖼 Выбрать другую модель (Видео)'
            : '🖼 Select Another Model (Video)',
        ],
        [is_ru ? '🏠 Главное меню' : '🏠 Main Menu'],
      ],
      resize_keyboard: true,
    }

    await ctx.reply(
      is_ru
        ? 'Ваше видео готово! Что дальше?'
        : 'Your video is ready! What next?',
      { reply_markup: keyboard }
    )

    logger.info('[handleVideoReady] Video sent successfully', {
      telegram_id,
      modelId,
      price,
    })
  } catch (error) {
    logger.error('[handleVideoReady] Error sending video:', error)

    if (ctx && ctx.telegram && ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        is_ru
          ? '❌ Ошибка при отправке видео. Пожалуйста, попробуйте позже.'
          : '❌ Error sending video. Please try again later.'
      )
    }
  }
}

/**
 * Handler для обновления статуса через callback button
 */
export async function handleVideoStatusUpdate(ctx: MyContext): Promise<void> {
  const is_ru = isRussianFromState(ctx)

  if (!ctx.session.videoJobId) {
    await ctx.answerCbQuery(
      is_ru ? 'Нет активной генерации видео' : 'No active video generation'
    )
    return
  }

  try {
    const statusResponse = await checkVideoGenerationStatus(
      ctx.session.videoJobId,
      is_ru
    )

    if (statusResponse.success && statusResponse.videoUrl) {
      await ctx.answerCbQuery(is_ru ? '✅ Видео готово!' : '✅ Video is ready!')

      await handleVideoReady(
        ctx,
        statusResponse.videoUrl,
        ctx.session.videoPrompt || '',
        (ctx.session.videoModelId as VideoModelId) || 'veo-3-fast',
        ctx.session.videoDuration,
        ctx.session.videoMessageId || 0
      )

      // Очищаем сессию
      delete ctx.session.videoJobId
      delete ctx.session.videoPrompt
      delete ctx.session.videoModelId
      delete ctx.session.videoDuration
      delete ctx.session.videoMessageId
    } else if (!statusResponse.success) {
      await ctx.answerCbQuery(
        is_ru
          ? `❌ Ошибка: ${statusResponse.error}`
          : `❌ Error: ${statusResponse.error}`
      )
    } else {
      await ctx.answerCbQuery(
        is_ru
          ? '⏳ Видео все еще генерируется...'
          : '⏳ Video is still being generated...'
      )
    }
  } catch (error) {
    logger.error('[handleVideoStatusUpdate] Error:', error)
    await ctx.answerCbQuery(
      is_ru ? '❌ Ошибка при проверке статуса' : '❌ Error checking status'
    )
  }
}
