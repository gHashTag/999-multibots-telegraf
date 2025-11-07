import { MyContext } from '@/interfaces'
import {
  checkVideoGenerationStatus,
  VideoModelId,
} from '@/services/generateTextToVideo'
import {
  getValidDuration,
} from '@/services/videoModels'
import { getUnifiedModelConfig, getUnifiedModelPrice } from '@/config/unified-video-models.config'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { Input } from 'telegraf'
import { uploadTelegramFileLocal } from '@/helpers/uploadTelegramFileLocal'
import { videoTaskStore } from '@/services/video-task-store'

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

  // Получаем информацию о модели из unified config
  const modelConfig = getUnifiedModelConfig(modelId)
  const modelName = is_ru ? modelConfig.nameRu : modelConfig.name
  const price = getUnifiedModelPrice(modelId, { duration: validDuration })

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
    // ✅ Импортируем новый модуль videoGenerator
    const { generateTextToVideo: generateTextToVideoNew } = await import('@/modules/videoGenerator')

    // Запускаем генерацию видео через новый модуль
    const result = await generateTextToVideoNew(
      prompt,
      telegram_id,
      username,
      is_ru,
      bot_name,
      modelId,
      undefined, // selectedResolution
      validDuration,
      aspectRatio
    )

    // Преобразуем ответ в старый формат для совместимости
    // result может быть: videoUrl (готовое видео) или taskId (async генерация)
    let response: { success: boolean; videoUrl?: string; jobId?: string; error?: string }

    if (!result) {
      response = { success: false, error: 'Video generation failed' }
    } else if (result.startsWith('http')) {
      // Это готовый videoUrl
      response = { success: true, videoUrl: result, jobId: undefined }
    } else {
      // Это taskId для async генерации
      response = { success: true, videoUrl: undefined, jobId: result }
    }

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

      // ✅ Для Sora и WAN моделей: сохраняем в videoTaskStore для webhook, БЕЗ polling
      const isSoraModel = modelId.includes('sora')
      const isWanModel = modelId.includes('wan')
      if (isSoraModel || isWanModel) {
        videoTaskStore.saveTask(response.jobId, {
          telegramId: telegram_id ? parseInt(telegram_id) : 0,
          chatId: ctx.chat?.id || 0,
          messageId: processingMessage.message_id,
          prompt,
          modelId,
          duration: validDuration,
          createdAt: Date.now()
        })

        if (ctx && ctx.telegram && ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            undefined,
            is_ru
              ? `✅ Генерация видео запущена!\n\n🤖 Модель: ${modelName}\n💰 Стоимость: ${price} ⭐\n🆔 Task ID: ${response.jobId}\n\n⏳ Видео будет отправлено автоматически через webhook. Это может занять ${isWanModel ? '2-3' : '3-5'} минут.`
              : `✅ Video generation started!\n\n🤖 Model: ${modelName}\n💰 Cost: ${price} ⭐\n🆔 Task ID: ${response.jobId}\n\n⏳ The video will be sent automatically via webhook. This may take ${isWanModel ? '2-3' : '3-5'} minutes.`
          )
        }

        logger.info('[handleTextToVideoDirect] Async task saved for webhook', {
          taskId: response.jobId,
          telegram_id,
          modelId,
          modelType: isWanModel ? 'WAN' : 'Sora'
        })
      } else {
        // Для НЕ-Sora моделей: используем polling как раньше
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
  const modelId = ctx.session.videoModelId
  const isSoraModel = modelId && ['sora-2', 'sora-2-pro'].includes(modelId)
  const maxAttempts = 60 // 5 минут для НЕ-Sora моделей
  let attempts = 0

  // ✅ ИСПРАВЛЕНИЕ: Для Sora моделей НЕ используем polling - только webhook!
  if (isSoraModel) {
    logger.info('[monitorVideoGeneration] Sora model detected - skipping polling, waiting for webhook', {
      jobId,
      telegram_id: ctx.from?.id,
      modelId
    })
    return // Выходим сразу, webhook обработает результат
  }

  // Для других моделей используем стандартный API polling
  const checkInterval = setInterval(async () => {
    attempts++

    try {
      const statusResponse = await checkVideoGenerationStatus(jobId, is_ru)
      
      // Детальное логирование ответа от сервера
      logger.info('[monitorVideoGeneration] Status check response:', {
        jobId,
        success: statusResponse.success,
        hasVideoUrl: !!statusResponse.videoUrl,
        videoUrl: statusResponse.videoUrl || 'NO_URL',
        error: statusResponse.error,
        attempts
      })

      if (statusResponse.success && statusResponse.videoUrl) {
        // Видео готово
        clearInterval(checkInterval)
        logger.info('[monitorVideoGeneration] Video ready, calling handleVideoReady:', {
          videoUrl: statusResponse.videoUrl,
          jobId
        })
        
        await handleVideoReady(
          ctx,
          statusResponse.videoUrl,
          ctx.session.videoPrompt || '',
          (ctx.session.videoModelId as VideoModelId) || 'veo3_fast',
          ctx.session.videoDuration,
          messageId
        )

        // Очищаем сессию
        delete ctx.session.videoJobId
        delete ctx.session.videoPrompt
        delete ctx.session.videoModelId
        delete ctx.session.videoDuration
        delete ctx.session.videoMessageId
      } else if (statusResponse.success && !statusResponse.videoUrl) {
        // Видео еще генерируется, продолжаем ждать
        logger.info('[monitorVideoGeneration] Video still generating, continue polling', {
          jobId,
          attempts,
          message: statusResponse.message
        })
        // Ничего не делаем, просто продолжаем цикл проверки
      } else if (!statusResponse.success && statusResponse.error) {
        // Реальная ошибка генерации
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
      }
      
      // Проверка таймаута после всех других проверок
      if (attempts >= maxAttempts) {
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
        // Очищаем сессию при таймауте
        delete ctx.session.videoJobId
        delete ctx.session.videoPrompt
        delete ctx.session.videoModelId
        delete ctx.session.videoDuration
        delete ctx.session.videoMessageId
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

  // Детальное логирование входных параметров
  logger.info('[handleVideoReady] Starting with params:', {
    videoUrl,
    videoUrlType: typeof videoUrl,
    videoUrlValue: videoUrl || 'UNDEFINED',
    prompt,
    modelId,
    duration,
    messageId,
    telegram_id
  })

  // Проверка на undefined или пустой URL
  if (!videoUrl || videoUrl === 'undefined' || videoUrl === '') {
    logger.error('[handleVideoReady] Invalid videoUrl received:', {
      videoUrl,
      videoUrlType: typeof videoUrl,
      telegram_id
    })
    
    if (ctx && ctx.telegram && ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        is_ru
          ? '❌ Ошибка: получен некорректный URL видео. Попробуйте еще раз.'
          : '❌ Error: received invalid video URL. Please try again.'
      )
    }
    return
  }

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

    // Получаем информацию о модели для подписи из unified config
    const modelConfig = getUnifiedModelConfig(modelId)
    const modelName = is_ru ? modelConfig.nameRu : modelConfig.name

    // Логирование перед отправкой видео
    logger.info('[handleVideoReady] Attempting to send video:', {
      uploadedUrl,
      finalUrl: uploadedUrl || videoUrl,
      telegram_id
    })

    // Отправляем видео с минимальной подписью
    await ctx.replyWithVideo(Input.fromURL(uploadedUrl), {
      caption:
        `🤖 ${is_ru ? 'Модель' : 'Model'}: ${modelName}\n` +
        (duration
          ? `⏱️ ${is_ru ? 'Длительность' : 'Duration'}: ${duration} ${
              is_ru ? 'сек' : 'sec'
            }\n`
          : '') +
        `⚡ ${is_ru ? 'Сгенерировано через' : 'Generated with'} AI`,
      parse_mode: 'Markdown',
    })

    // Отправляем полный промпт отдельным сообщением
    // Проверяем, нужно ли разбить промпт на несколько сообщений (лимит Telegram 4096 символов)
    const MAX_MESSAGE_LENGTH = 4000 // Оставляем запас для форматирования
    const promptHeader = is_ru ? '📝 Ваш запрос:\n\n' : '📝 Your prompt:\n\n'
    const fullPromptMessage = promptHeader + prompt
    
    if (fullPromptMessage.length > MAX_MESSAGE_LENGTH) {
      // Разбиваем на несколько сообщений, если очень длинный
      const chunks = []
      let currentChunk = promptHeader
      const words = prompt.split(' ')
      
      for (const word of words) {
        if ((currentChunk + ' ' + word).length > MAX_MESSAGE_LENGTH) {
          chunks.push(currentChunk)
          currentChunk = word
        } else {
          currentChunk += (currentChunk === promptHeader ? '' : ' ') + word
        }
      }
      if (currentChunk.length > 0) {
        chunks.push(currentChunk)
      }
      
      // Отправляем каждый чанк
      for (const chunk of chunks) {
        await ctx.reply(chunk)
      }
    } else {
      // Отправляем одним сообщением
      await ctx.reply(fullPromptMessage)
    }

    // Списываем баланс
    const price = getUnifiedModelPrice(modelId, { duration })

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

    // Отправляем видео в pulse канал
    try {
      const { sendMediaToPulse } = await import('@/helpers/pulse')
      await sendMediaToPulse({
        mediaType: 'video',
        mediaSource: uploadedUrl,
        telegramId: telegram_id,
        username: ctx.from?.username,
        language: is_ru ? 'ru' : 'en',
        serviceType: modelName,
        prompt: prompt,
        botName: 'HaimGroupMedia_bot',
        additionalInfo: {
          'Model': modelName,
          'Duration': duration ? `${duration} sec` : 'N/A',
          'Price': `${price} stars`
        }
      })
      
      logger.info('[handleVideoReady] Video sent to pulse channel', {
        telegram_id,
        modelId,
        uploadedUrl
      })
    } catch (pulseError) {
      logger.error('[handleVideoReady] Error sending to pulse channel:', pulseError)
      // Не прерываем выполнение, если pulse не сработал
    }
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
        (ctx.session.videoModelId as VideoModelId) || 'veo3_fast',
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
