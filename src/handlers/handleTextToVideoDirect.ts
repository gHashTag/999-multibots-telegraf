import { MyContext } from '@/interfaces'
import {
  checkVideoGenerationStatus,
  VideoModelId,
} from '@/services/generateTextToVideo'
import {
  getUnifiedModelConfig,
  getUnifiedModelPrice,
  VIDEO_MODELS_CONFIG,
  getValidDuration,
} from '@/config/unified-video-models.config'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { Input } from 'telegraf'
import { uploadTelegramFileLocal } from '@/helpers/uploadTelegramFileLocal'
import { videoTaskStore } from '@/services/video-task-store'

// Idempotency for video delivery+charge. The poller (monitorVideoGeneration) and
// the persistent "update_video_status" button (handleVideoStatusUpdate) both
// deliver AND charge the same async job through handleVideoReady; a button tap
// racing the poller used to charge (MONEY_OUTCOME) the job twice. We key on the
// IMMUTABLE provider jobId (not the single-slot ctx.session.videoJobId, which a
// second concurrent generation overwrites — that would skip the older job's real
// delivery). Mirrors the webhook's chargedVideoJobs Set, but bounded so a
// long-lived multi-bot process cannot grow it without limit.
const DELIVERED_VIDEO_JOBS_MAX = 1000
const deliveredVideoJobs = new Set<string>()
function claimVideoJobDelivery(jobId: string): boolean {
  // Returns false if this job was already delivered (caller must skip). The
  // has()+add() pair is synchronous, so it is atomic w.r.t. the event loop:
  // the first entry for a job wins, a racing re-entry gets false.
  if (deliveredVideoJobs.has(jobId)) return false
  deliveredVideoJobs.add(jobId)
  if (deliveredVideoJobs.size > DELIVERED_VIDEO_JOBS_MAX) {
    const oldest = deliveredVideoJobs.values().next().value
    if (oldest !== undefined) deliveredVideoJobs.delete(oldest)
  }
  return true
}

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
  const bot_name = ctx.botInfo?.username || 'unknown_bot'

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

  // Получаем информацию о модели из unified config
  const modelConfig = getUnifiedModelConfig(modelId)
  const modelName = is_ru ? modelConfig.nameRu : modelConfig.name
  const price = getUnifiedModelPrice(modelId, { duration: validDuration })

  // ✅ CHECK BALANCE BEFORE GENERATION
  const { checkUserBalance } = await import('@/helpers/checkUserBalance')
  const hasBalance = await checkUserBalance(ctx, price)
  if (!hasBalance) return

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
    const { generateTextToVideo: generateTextToVideoNew } = await import(
      '@/modules/videoGenerator'
    )

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

    // CONTRACT (verified via esbuild metafile): '@/modules/videoGenerator'
    // resolves to the FILE src/modules/videoGenerator.ts (file beats the
    // sibling directory), whose adapter returns an OBJECT
    // {success, videoUrl?, jobId?, error?, message?} from
    // @/services/generateTextToVideo. The string|null contract belongs to the
    // DIRECTORY module (videoGenerator/generateTextToVideo.ts), which this
    // handler does NOT import. A previous "fix" (#932) normalized against that
    // wrong contract: `typeof result === 'string'` was always false, so every
    // request — including successes — showed "Video generation failed".
    // Consume the object the adapter actually returns.
    const response: {
      success: boolean
      videoUrl?: string
      jobId?: string
      error?: string
      message?: string
    } =
      result && typeof result === 'object'
        ? result
        : { success: false, error: 'Video generation failed' }

    if (!response.success) {
      // ✅ Проверяем, является ли это ошибкой недостатка кредитов (402)
      const isInsufficientCredits =
        (response as any).isInsufficientCredits === true

      if (isInsufficientCredits) {
        // 🚨 КРИТИЧЕСКАЯ ОШИБКА: Уведомляем админа о недостатке кредитов
        const { ADMIN_IDS_ARRAY } = await import('@/config')
        const adminMessage = `🚨 <b>КРИТИЧЕСКАЯ ОШИБКА: Недостаточно кредитов на Kie.ai API</b>

<b>Модель:</b> ${modelId}
<b>Пользователь:</b> @${username} (ID: ${telegram_id})
<b>Ошибка:</b> ${response.error}

⚠️ <b>Требуется пополнение баланса Kie.ai немедленно!</b>

Пользователь получил сообщение о том, что проблема будет решена в ближайшее время.`

        // Отправляем уведомление всем админам
        for (const adminId of ADMIN_IDS_ARRAY) {
          try {
            await ctx.telegram.sendMessage(adminId, adminMessage, {
              parse_mode: 'HTML',
            })
            logger.info(
              '[handleTextToVideoDirect] Admin notified about insufficient credits',
              { adminId }
            )
          } catch (error) {
            logger.error('[handleTextToVideoDirect] Failed to notify admin', {
              adminId,
              error,
            })
          }
        }

        // Показываем пользователю дружелюбное сообщение
        if (ctx && ctx.telegram && ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            undefined,
            is_ru
              ? `⚠️ <b>Временная техническая проблема</b>\n\nАдминистратор уже уведомлен и работает над решением.\nПожалуйста, попробуйте через несколько минут.\n\n💬 Приносим извинения за неудобства!`
              : `⚠️ <b>Temporary technical issue</b>\n\nThe administrator has been notified and is working on a solution.\nPlease try again in a few minutes.\n\n💬 We apologize for the inconvenience!`,
            { parse_mode: 'HTML' }
          )
        }
        return
      }

      // Обычная ошибка генерации
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

      // ✅ Для ВСЕХ Kie.ai моделей: сохраняем в videoTaskStore для webhook, БЕЗ polling
      const modelConfig = VIDEO_MODELS_CONFIG[modelId]
      const isKieAiModel = modelConfig?.provider === 'kie'
      const isWanModel = modelId.includes('wan')

      if (isKieAiModel) {
        videoTaskStore.saveTask(response.jobId, {
          telegramId: telegram_id ? parseInt(telegram_id) : 0,
          chatId: ctx.chat?.id || 0,
          messageId: processingMessage.message_id,
          prompt,
          modelId,
          duration: validDuration,
          createdAt: Date.now(),
          botName: ctx.botInfo?.username, // ✅ FIX: Сохраняем имя бота для multi-bot режима
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

        logger.info(
          '[handleTextToVideoDirect] Async task saved for webhook (Kie.ai provider)',
          {
            taskId: response.jobId,
            telegram_id,
            modelId,
            provider: 'kie',
          }
        )
      } else {
        // Для НЕ-Kie.ai моделей: используем polling как раньше
        monitorVideoGeneration(
          ctx,
          response.jobId,
          processingMessage.message_id
        )
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
    logger.info(
      '[monitorVideoGeneration] Sora model detected - skipping polling, waiting for webhook',
      {
        jobId,
        telegram_id: ctx.from?.id,
        modelId,
      }
    )
    return // Выходим сразу, webhook обработает результат
  }

  // Для других моделей используем стандартный API polling
  // A status check is async but the interval fires every 5s regardless, so a
  // slow or stalled check would let a second one start on top of the first and
  // pile up. Skip a tick while one is still in flight, and reset the flag in a
  // finally so the interval keeps polling once a check returns.
  let checkInFlight = false
  const checkInterval = setInterval(async () => {
    if (checkInFlight) return
    checkInFlight = true
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
        attempts,
      })

      if (statusResponse.success && statusResponse.videoUrl) {
        // Видео готово
        clearInterval(checkInterval)
        logger.info(
          '[monitorVideoGeneration] Video ready, calling handleVideoReady:',
          {
            videoUrl: statusResponse.videoUrl,
            jobId,
          }
        )

        await handleVideoReady(
          ctx,
          statusResponse.videoUrl,
          ctx.session.videoPrompt || '',
          (ctx.session.videoModelId as VideoModelId) || 'veo3_fast',
          ctx.session.videoDuration,
          messageId,
          jobId
        )

        // Очищаем сессию
        delete ctx.session.videoJobId
        delete ctx.session.videoPrompt
        delete ctx.session.videoModelId
        delete ctx.session.videoDuration
        delete ctx.session.videoMessageId
      } else if (statusResponse.success && !statusResponse.videoUrl) {
        // Видео еще генерируется, продолжаем ждать
        logger.info(
          '[monitorVideoGeneration] Video still generating, continue polling',
          {
            jobId,
            attempts,
            message: statusResponse.message,
          }
        )
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
    } finally {
      checkInFlight = false
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
  messageId: number,
  jobId?: string
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
    telegram_id,
  })

  // Проверка на undefined или пустой URL
  if (!videoUrl || videoUrl === 'undefined' || videoUrl === '') {
    logger.error('[handleVideoReady] Invalid videoUrl received:', {
      videoUrl,
      videoUrlType: typeof videoUrl,
      telegram_id,
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

  // Idempotency claim: for an async delivery (jobId present), proceed only if
  // this job has not already been delivered. Keying on the immutable jobId (not
  // ctx.session.videoJobId) means a second concurrent generation overwriting the
  // session slot no longer skips the older job's real delivery. The synchronous
  // immediate-result path passes no jobId and always proceeds (single-entry).
  if (jobId !== undefined && !claimVideoJobDelivery(jobId)) {
    logger.warn(
      '[handleVideoReady] duplicate delivery skipped for already-delivered job',
      { jobId, telegram_id }
    )
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
      telegram_id,
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

    const charged = await updateUserBalance(
      telegram_id,
      price,
      PaymentType.MONEY_OUTCOME,
      `Video generation: ${modelId}${duration ? ` (${duration}s)` : ''}`
    )
    if (!charged) {
      // The charge runs AFTER the video was delivered (above), so on a failure
      // — updateUserBalance returns false, never throws, on a ghost-payer with
      // no users row or a DB error — the user already has the video and cannot
      // be un-delivered. Log the unbilled delivery instead of discarding the
      // result silently (there is no refund to make here).
      logger.error(
        '[handleVideoReady] charge failed after video delivery — user got the video unbilled',
        { telegram_id, price, modelId }
      )
    }

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
          Model: modelName,
          Duration: duration ? `${duration} sec` : 'N/A',
          Price: `${price} stars`,
        },
      })

      logger.info('[handleVideoReady] Video sent to pulse channel', {
        telegram_id,
        modelId,
        uploadedUrl,
      })
    } catch (pulseError) {
      logger.error(
        '[handleVideoReady] Error sending to pulse channel:',
        pulseError
      )
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
  const telegram_id = ctx.from?.id.toString() || ''

  logger.info('[handleVideoStatusUpdate] Checking video generation status', {
    telegram_id,
    hasSessionJobId: !!ctx.session.videoJobId,
    sessionJobId: ctx.session.videoJobId,
  })

  // ✅ Для Kie.ai моделей (сохранено в videoTaskStore) - webhook доставит результат
  // Для других моделей (сохранено в session) - проверяем через API
  if (!ctx.session.videoJobId) {
    // Проверяем, возможно это Kie.ai модель (webhook delivery)
    const tasks = videoTaskStore.getAllTasks()
    const userTask = Object.entries(tasks).find(
      ([_, task]) => task.telegramId === parseInt(telegram_id)
    )

    if (userTask) {
      await ctx.answerCbQuery(
        is_ru
          ? '⏳ Видео генерируется через Kie.ai. Вы получите уведомление автоматически, когда будет готово!'
          : '⏳ Video is being generated via Kie.ai. You will receive a notification automatically when ready!'
      )
      logger.info('[handleVideoStatusUpdate] Found Kie.ai task in store', {
        telegram_id,
        taskId: userTask[0],
      })
    } else {
      await ctx.answerCbQuery(
        is_ru ? 'Нет активной генерации видео' : 'No active video generation'
      )
      logger.info(
        '[handleVideoStatusUpdate] No active video generation found',
        {
          telegram_id,
        }
      )
    }
    return
  }

  try {
    // Capture the job id up front: the poller may clear the session
    // during the status-check await, and this id is the idempotency
    // key handleVideoReady claims to prevent a double charge.
    const jobId = ctx.session.videoJobId
    const statusResponse = await checkVideoGenerationStatus(jobId, is_ru)

    logger.info('[handleVideoStatusUpdate] Status check result', {
      telegram_id,
      jobId: ctx.session.videoJobId,
      success: statusResponse.success,
      hasVideoUrl: !!statusResponse.videoUrl,
      error: statusResponse.error,
    })

    if (statusResponse.success && statusResponse.videoUrl) {
      await ctx.answerCbQuery(is_ru ? '✅ Видео готово!' : '✅ Video is ready!')

      await handleVideoReady(
        ctx,
        statusResponse.videoUrl,
        ctx.session.videoPrompt || '',
        (ctx.session.videoModelId as VideoModelId) || 'veo3_fast',
        ctx.session.videoDuration,
        ctx.session.videoMessageId || 0,
        jobId
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
