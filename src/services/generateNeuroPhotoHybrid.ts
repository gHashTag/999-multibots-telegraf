import axios, { isAxiosError } from 'axios'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Гибридная функция для генерации neuro_photo:
 * План А: Отправляет запрос на сервер (предотвращает множественные генерации)
 * План Б: Если сервер недоступен, использует локальную обработку
 *
 * ИСПРАВЛЯЕТ ПРОБЛЕМУ ОКРУГЛЕНИЯ: передает точную цену 7.5⭐ на сервер
 */
export async function generateNeuroPhotoHybrid(
  prompt: string,
  model_url: ModelUrl,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  explicitAspectRatio?: string | null
): Promise<{ data: string; success: boolean; urls?: string[] } | null> {
  logger.info({
    message: '🔄 [HYBRID] Начало гибридной генерации neuro_photo',
    telegram_id,
    numImages,
    prompt: prompt.substring(0, 50) + '...',
    model_url,
    botName,
  })

  // Валидация входных данных
  if (!ctx.session.prompt) {
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    throw new Error('User model not found')
  }

  if (!numImages || numImages <= 0) {
    throw new Error('Invalid number of images')
  }

  // Рассчитываем точную стоимость (БЕЗ ОКРУГЛЕНИЯ!)
  const costResult = calculateModeCost({
    mode: ModeEnum.NeuroPhoto,
    steps: numImages,
  })
  const exactCostPerImage = Number(costResult.stars) // 7.5⭐
  const exactTotalCost = exactCostPerImage * numImages

  logger.info({
    message: '💰 [HYBRID] Рассчитана точная стоимость',
    exactCostPerImage,
    exactTotalCost,
    numImages,
  })

  // ПЛАН А: Попытка отправки на сервер с точной ценой
  try {
    logger.info({
      message: '🌐 [HYBRID] План А: Отправка запроса на сервер',
      telegram_id,
    })

    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

    const url = `${isDev ? LOCAL_SERVER_URL : API_SERVER_URL}/generate/neuro-photo`

    const serverPayload = {
      prompt,
      model_url,
      num_images: numImages,
      telegram_id,
      username: ctx.from?.username,
      is_ru: isRussian(ctx),
      bot_name: botName,
      // КРИТИЧНО: Передаем точную стоимость на сервер
      exact_cost_per_image: exactCostPerImage, // 7.5⭐
      exact_total_cost: exactTotalCost,
      // Дополнительные данные для сервера
      user_model: ctx.session.userModel,
      aspect_ratio: explicitAspectRatio,
    }

    logger.info({
      message: '📤 [HYBRID] Отправка данных на сервер',
      url,
      exact_cost_per_image: exactCostPerImage,
      exact_total_cost: exactTotalCost,
    })

    const response = await axios.post(url, serverPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 30000, // 30 секунд таймаут
    })

    logger.info({
      message: '✅ [HYBRID] План А успешен - сервер ответил',
      telegram_id,
      response_status: response.status,
    })

    return response.data
  } catch (error) {
    // Логируем ошибку сервера
    if (isAxiosError(error)) {
      logger.warn({
        message: '⚠️ [HYBRID] План А неудачен - ошибка сервера',
        telegram_id,
        error_status: error.response?.status,
        error_message: error.response?.data?.error || error.message,
        error_code: error.code,
      })

      // Специальная обработка NSFW
      if (error.response?.data?.error?.includes('NSFW')) {
        await ctx.reply(
          isRussian(ctx)
            ? 'Извините, генерация изображения не удалась из-за обнаружения неподходящего контента.'
            : 'Sorry, image generation failed due to inappropriate content detection.'
        )
        return null
      }
    } else {
      logger.warn({
        message: '⚠️ [HYBRID] План А неудачен - неизвестная ошибка',
        telegram_id,
        error: String(error),
      })
    }

    // ПЛАН Б: Локальная обработка
    logger.info({
      message: '🔄 [HYBRID] Переключение на План Б: локальная обработка',
      telegram_id,
    })

    try {
      const localResult = await generateNeuroPhotoDirect(
        prompt,
        model_url,
        numImages,
        telegram_id,
        ctx,
        botName,
        explicitAspectRatio,
        {
          disable_telegram_sending: false, // Разрешаем отправку сообщений
          bypass_payment_check: false, // НЕ обходим проверку баланса
        }
      )

      if (localResult && localResult.success) {
        logger.info({
          message: '✅ [HYBRID] План Б успешен - локальная обработка завершена',
          telegram_id,
        })
      } else {
        logger.error({
          message:
            '❌ [HYBRID] План Б неудачен - локальная обработка провалилась',
          telegram_id,
        })
      }

      return localResult
    } catch (localError) {
      logger.error({
        message: '❌ [HYBRID] Критическая ошибка - оба плана провалились',
        telegram_id,
        server_error: String(error),
        local_error: String(localError),
      })

      // Отправляем сообщение об ошибке пользователю
      await ctx.reply(
        isRussian(ctx)
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )

      return null
    }
  }
}
