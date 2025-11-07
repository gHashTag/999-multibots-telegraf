import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { Input } from 'telegraf'
import { VideoModelId } from '@/services/generateTextToVideo'

/**
 * Handler для генерации видео из изображения через прямую интеграцию с сервером
 * Адаптирован из handleTextToVideoDirect для работы с изображениями
 */
export async function handleImageToVideoDirect(
  ctx: MyContext,
  imageUrl: string,
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
      
      logger.error(`[handleImageToVideoDirect] Bot configuration error`, {
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
    
    logger.error(`[handleImageToVideoDirect] Critical bot system error`, { 
      error, 
      bot_name, 
      telegram_id, 
      username 
    })
    
    await ctx.reply(errorMsg)
    return
  }

  logger.info(
    '[handleImageToVideoDirect] Starting image to video generation',
    {
      telegram_id,
      username,
      modelId,
      duration: duration,
      aspectRatio: aspectRatio,
      imageUrl: imageUrl ? imageUrl.substring(0, 100) + '...' : 'NO_URL',
      promptLength: prompt.length,
    }
  )

  // Проверка подписки
  const hasSubscription = await checkSubscriptionGuard(ctx, 'NeuroVideo')
  if (!hasSubscription) {
    // checkSubscriptionGuard уже отправил сообщение, просто возвращаемся
    return
  }

  // Определяем цену модели для Image to Video
  const getImageToVideoPrice = (modelId: string, aspectRatio?: string): number => {
    switch (modelId) {
      case 'veo3_fast':
        return 40
      case "veo3":
        return 120
      case 'kling-v1.6-pro':
        return 60
      case 'minimax':
        return 50
      case 'seedance-1-pro':
        return aspectRatio === '9:16' ? 23 : 117
      case 'wan-2.2-i2v-fast':
        return 70
      default:
        return 40
    }
  }

  const getModelDisplayName = (modelId: string, is_ru: boolean, aspectRatio?: string): string => {
    const names: Record<string, string> = {
      'veo3_fast': 'Veo 3 Fast',
      'veo3': 'Veo 3',
      'kling-v1.6-pro': 'Kling v1.6 Pro',
      'minimax': 'Minimax',
      'seedance-1-pro': aspectRatio === '9:16' ? 'Seedance Pro 480p' : 'Seedance Pro 1080p',
      'wan-2.2-i2v-fast': 'WAN 2.2 I2V Fast'
    }
    return names[modelId] || modelId
  }

  const modelName = getModelDisplayName(modelId, is_ru, aspectRatio)
  const price = getImageToVideoPrice(modelId, aspectRatio)

  // Отправляем сообщение о начале генерации
  const processingMessage = await ctx.reply(
    is_ru
      ? `⏳ Начинаю генерацию видео...\n\n🤖 Модель: ${modelName}\n${
          duration ? `⏱️ Длительность: ${duration} сек\n` : ''
        }💰 Стоимость: ${price} ⭐\n\nЭто может занять несколько минут.`
      : `⏳ Starting video generation...\n\n🤖 Model: ${modelName}\n${
          duration ? `⏱️ Duration: ${duration} sec\n` : ''
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
    // Импортируем функцию генерации Image to Video
    const { generateImageToVideo } = await import('@/modules/videoGenerator')

    // Запускаем генерацию видео из изображения
    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      modelId,
      imageUrl,
      prompt,
      false, // not morphing
      undefined, // imageAUrl
      undefined, // imageBUrl
      ctx.telegram,
      ctx.from?.id || 0,
      aspectRatio === '9:16' ? '480p' : '1080p', // разрешение для Seedance и WAN
      aspectRatio, // передаем соотношение сторон
      ctx // ✅ FIX: Pass ctx to save videoJobId for status updates
    )

    logger.info('[handleImageToVideoDirect] Image to Video generation started', {
      telegram_id,
      modelId,
      price,
      imageUrl: imageUrl.substring(0, 100) + '...',
    })

    // ✅ СПИСЫВАЕМ БАЛАНС после успешного запуска генерации
    if (price > 0) {
      const charged = await updateUserBalance(
        telegram_id,
        price,
        PaymentType.MONEY_OUTCOME,
        `Image to Video generation: ${modelId}${duration ? ` (${duration}s)` : ''}`,
        { service_type: 'IMAGE_TO_VIDEO' }
      )

      if (!charged) {
        logger.error('❌ Failed to charge user for image to video generation', {
          telegram_id,
          price,
          model: modelId
        })

        if (ctx && ctx.telegram && ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            undefined,
            is_ru
              ? '❌ Недостаточно средств для генерации видео.'
              : '❌ Insufficient funds for video generation.'
          )
        }
        return
      }

      logger.info('✅ Successfully charged user for image to video generation', {
        telegram_id,
        price,
        model: modelId
      })
    }

    // Обновляем сообщение о успешном запуске
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

    // Функция generateImageToVideo обрабатывает отправку видео пользователю
    
  } catch (error) {
    logger.error('[handleImageToVideoDirect] Unexpected error:', error)

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