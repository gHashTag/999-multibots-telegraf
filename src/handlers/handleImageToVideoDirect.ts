import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { Input } from 'telegraf'
import { VideoModelId } from '@/services/generateTextToVideo'
import {
  getUnifiedModelPrice,
  getUnifiedModelConfig,
} from '@/config/unified-video-models.config'

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
  const bot_name = ctx.botInfo?.username || 'unknown_bot'

  logger.info('[handleImageToVideoDirect] Starting image to video generation', {
    telegram_id,
    username,
    modelId,
    duration: duration,
    aspectRatio: aspectRatio,
    imageUrl: imageUrl ? imageUrl.substring(0, 100) + '...' : 'NO_URL',
    promptLength: prompt.length,
  })

  // ✅ УНИФИКАЦИЯ: Используем единый источник правды для цен и названий
  const getModelDisplayName = (
    modelId: string,
    is_ru: boolean,
    aspectRatio?: string
  ): string => {
    const config = getUnifiedModelConfig(modelId)
    if (!config) {
      return modelId // Fallback to modelId if config not found
    }

    // Для Seedance добавляем разрешение к названию
    if (modelId === 'seedance-1-pro') {
      return is_ru
        ? aspectRatio === '9:16'
          ? 'Seedance Pro 480p'
          : 'Seedance Pro 1080p'
        : aspectRatio === '9:16'
          ? 'Seedance Pro 480p'
          : 'Seedance Pro 1080p'
    }

    // Для остальных моделей используем name или nameRu из unified config
    return is_ru ? config.nameRu : config.name
  }

  /** Цена или `null`, если посчитать не удалось. Выдумывать нельзя. */
  const getImageToVideoPrice = (
    modelId: string,
    aspectRatio?: string
  ): number | null => {
    try {
      // Для моделей с разрешением (Seedance, WAN)
      if (modelId === 'seedance-1-pro') {
        const resolution = aspectRatio === '9:16' ? '480p' : '1080p'
        return getUnifiedModelPrice(modelId, { resolution })
      }

      // Для остальных моделей
      return getUnifiedModelPrice(modelId)
    } catch (error) {
      // ЦЕНА НЕ ВЫДУМЫВАЕТСЯ. Здесь стояло `return 40 // Fallback price`:
      // если расчёт падал, с человека списывали сорок звёзд независимо от
      // того, сколько услуга стоит на самом деле — она может стоить и пять, и
      // двести.
      //
      // Асимметрия та же, что и в остальных денежных местах: отказать —
      // человек попробует ещё раз; списать не ту сумму — деньги ушли, и он об
      // этом даже не узнает, потому что в сообщении будет выдуманное число.
      logger.error('[handleImageToVideoDirect] Price calculation failed', {
        modelId,
        aspectRatio,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  const modelName = getModelDisplayName(modelId, is_ru, aspectRatio)
  const price = getImageToVideoPrice(modelId, aspectRatio)

  if (price === null) {
    await ctx.reply(
      is_ru
        ? '❌ Не удалось определить стоимость для этой модели. Деньги не списаны. Попробуйте другую модель или напишите в поддержку.'
        : '❌ Could not determine the price for this model. You have not been charged. Try another model or contact support.'
    )
    return
  }

  // ✅ CHECK BALANCE BEFORE GENERATION
  const { checkUserBalance } = await import('@/helpers/checkUserBalance')
  const hasBalance = await checkUserBalance(ctx, price)
  if (!hasBalance) return

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

    logger.info(
      '[handleImageToVideoDirect] Image to Video generation started',
      {
        telegram_id,
        modelId,
        price,
        imageUrl: imageUrl.substring(0, 100) + '...',
      }
    )

    // BILLING LIVES IN generateImageToVideo, NOT HERE. That module returns
    // Promise<void> and swallows every failure (early returns + an outer
    // catch), so an unconditional charge here fired even when generation
    // failed — while the module told the user "no money was charged". It also
    // DOUBLE-charged the paths that already bill internally (veo3 polling via
    // deductBalanceAfterSuccess; Sora via the kie webhook). The module now
    // charges exactly once, only after a video is actually delivered; this
    // handler only pre-checks the balance (checkUserBalance above).

    // Обновляем сообщение о успешном запуске
    if (ctx && ctx.telegram && ctx.chat) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        is_ru
          ? `✅ Генерация видео запущена!\n\n🤖 Модель: ${modelName}\n💰 Стоимость: ${price} ⭐\n\n⏳ Видео будет отправлено автоматически, когда будет готово. Это может занять несколько минут.`
          : `✅ Video generation started!\n\n🤖 Model: ${modelName}\n💰 Cost: ${price} ⭐\n\n⏳ The video will be sent automatically when ready. This may take a few minutes.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: is_ru ? '🔄 Обновить статус' : '🔄 Update Status',
                  callback_data: 'update_video_status',
                },
              ],
            ],
          },
        }
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
