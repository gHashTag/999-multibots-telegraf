import { MyContext } from '@/interfaces'
import {
  generateTextToVideo,
  checkVideoGenerationStatus,
} from '@/services/generateTextToVideo'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscription } from '@/helpers/checkSubscription'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { calculateFinalPrice } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { Input } from 'telegraf'
import { uploadToSupabase } from '@/helpers/uploadToSupabase'

/**
 * Handler для генерации видео из текста через прямую интеграцию с Google
 * Поддерживает модели Veo 3 и Veo 3 Fast
 */
export async function handleTextToVideoDirect(
  ctx: MyContext,
  prompt: string,
  modelId: 'veo-3' | 'veo-3-fast'
): Promise<void> {
  const telegram_id = ctx.from?.id.toString() || ''
  const username = ctx.from?.username || 'unknown'
  const is_ru = isRussianFromState(ctx)
  const bot_name = ctx.botInfo?.username || 'unknown_bot'

  logger.info('[handleTextToVideoDirect] Starting video generation', {
    telegram_id,
    username,
    modelId,
    promptLength: prompt.length,
  })

  // Проверка подписки
  const subscriptionCheck = await checkSubscription(ctx, 'NeuroVideo')
  if (!subscriptionCheck.allowed) {
    await ctx.reply(
      is_ru
        ? '❌ У вас недостаточно прав для генерации видео. Пожалуйста, оформите подписку.'
        : '❌ You do not have sufficient rights to generate video. Please subscribe.'
    )
    return
  }

  // Отправляем сообщение о начале генерации
  const processingMessage = await ctx.reply(
    is_ru
      ? '⏳ Начинаю генерацию видео через Google AI...\n\nЭто может занять несколько минут.'
      : '⏳ Starting video generation through Google AI...\n\nThis may take a few minutes.',
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
      telegram_id,
      username,
      is_ru,
      bot_name,
    })

    if (!response.success) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMessage.message_id,
        undefined,
        is_ru
          ? `❌ Ошибка генерации: ${response.error}`
          : `❌ Generation error: ${response.error}`
      )
      return
    }

    // Если видео готово сразу
    if (response.videoUrl) {
      await handleVideoReady(
        ctx,
        response.videoUrl,
        prompt,
        modelId,
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
      ctx.session.videoMessageId = processingMessage.message_id

      // Запускаем мониторинг статуса
      monitorVideoGeneration(ctx, response.jobId, processingMessage.message_id)
    }
  } catch (error) {
    logger.error('[handleTextToVideoDirect] Unexpected error:', error)

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMessage.message_id,
      undefined,
      is_ru
        ? '❌ Произошла неожиданная ошибка при генерации видео.'
        : '❌ An unexpected error occurred during video generation.'
    )
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
          ctx.session.videoModelId || 'veo-3',
          messageId
        )

        // Очищаем сессию
        delete ctx.session.videoJobId
        delete ctx.session.videoPrompt
        delete ctx.session.videoModelId
        delete ctx.session.videoMessageId
      } else if (!statusResponse.success) {
        // Ошибка генерации
        clearInterval(checkInterval)
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          messageId,
          undefined,
          is_ru
            ? `❌ Ошибка генерации: ${statusResponse.error}`
            : `❌ Generation error: ${statusResponse.error}`
        )
      } else if (attempts >= maxAttempts) {
        // Таймаут
        clearInterval(checkInterval)
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          messageId,
          undefined,
          is_ru
            ? '⏱️ Генерация видео заняла слишком много времени. Пожалуйста, попробуйте позже.'
            : '⏱️ Video generation took too long. Please try again later.'
        )
      }
    } catch (error) {
      clearInterval(checkInterval)
      logger.error('[monitorVideoGeneration] Error checking status:', error)

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        messageId,
        undefined,
        is_ru
          ? '❌ Ошибка при проверке статуса генерации.'
          : '❌ Error checking generation status.'
      )
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
  modelId: string,
  messageId: number
): Promise<void> {
  const is_ru = isRussianFromState(ctx)
  const telegram_id = ctx.from?.id.toString() || ''

  try {
    // Загружаем видео в Supabase для постоянного хранения
    const uploadedUrl = await uploadToSupabase(
      videoUrl,
      'videos',
      `${telegram_id}/${Date.now()}.mp4`
    )

    // Обновляем сообщение
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      messageId,
      undefined,
      is_ru
        ? '✅ Видео успешно сгенерировано! Отправляю...'
        : '✅ Video generated successfully! Sending...'
    )

    // Отправляем видео пользователю
    await ctx.replyWithVideo(Input.fromURL(uploadedUrl || videoUrl), {
      caption:
        `🎬 ${prompt}\n\n` +
        `🤖 Model: ${modelId === 'veo-3' ? 'Google Veo 3' : 'Google Veo 3 Fast'}\n` +
        `⚡ Generated with direct Google AI integration`,
      parse_mode: 'Markdown',
    })

    // Списываем баланс
    const price = modelId === 'veo-3' ? 0.75 * 8 : 0.384 * 8 // Цена за 8 секунд
    const finalPrice = calculateFinalPrice(
      price,
      PaymentType.STARS,
      telegram_id
    )

    await updateUserBalance(
      telegram_id,
      finalPrice.final,
      'text-to-video',
      `Video generation: ${modelId}`
    )

    logger.info('[handleVideoReady] Video sent successfully', {
      telegram_id,
      modelId,
      price: finalPrice.final,
    })
  } catch (error) {
    logger.error('[handleVideoReady] Error sending video:', error)

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      messageId,
      undefined,
      is_ru
        ? '❌ Ошибка при отправке видео. Пожалуйста, попробуйте позже.'
        : '❌ Error sending video. Please try again later.'
    )
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
        ctx.session.videoModelId || 'veo-3',
        ctx.session.videoMessageId || 0
      )

      // Очищаем сессию
      delete ctx.session.videoJobId
      delete ctx.session.videoPrompt
      delete ctx.session.videoModelId
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
