import axios, { isAxiosError } from 'axios'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
// import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect' // ОТКЛЮЧЕНО: теперь только через сервер
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Функция для генерации neuro_photo через сервер:
 * Всегда отправляет запрос ТОЛЬКО на сервер
 * НЕ переключается на локальную обработку при ошибке
 *
 * ИСПРАВЛЯЕТ ПРОБЛЕМУ ОКРУГЛЕНИЯ: передает точную цену 7.5⭐ на сервер
 * КРИТИЧЕСКИ ВАЖНО: Все запросы должны идти только через сервер!
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

  // 🌐 КРИТИЧЕСКИ ВАЖНО: Отправляем ТОЛЬКО на сервер
  try {
    logger.info({
      message: '🌐 [SERVER-ONLY] Отправка запроса на сервер',
      telegram_id,
    })

    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

    const url = `${API_SERVER_URL}/generate/neuro-photo`

    const serverPayload = {
      prompt,
      model_url,
      num_images: numImages,
      telegram_id,
      username: ctx.from?.username,
      is_ru: isRussianFromState(ctx),
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
      message: '✅ [SERVER-ONLY] Сервер успешно ответил',
      telegram_id,
      response_status: response.status,
      response_data: JSON.stringify(response.data),
    })

    // Проверяем содержимое ответа сервера
    if (!response.data) {
      logger.error({
        message: '❌ [SERVER-ONLY] Сервер вернул пустой ответ',
        telegram_id,
        response_status: response.status,
      })
      throw new Error('Server returned empty response')
    }

    // Проверяем, есть ли ошибка в ответе сервера
    if (response.data.error) {
      logger.error({
        message: '❌ [SERVER-ONLY] Сервер вернул ошибку',
        telegram_id,
        server_error: response.data.error,
      })
      throw new Error(`Server error: ${response.data.error}`)
    }

    return response.data
  } catch (error) {
    // 🚫 КРИТИЧЕСКИ ВАЖНО: НЕ переключаемся на локальную обработку!
    // Логируем ошибку сервера и возвращаем ошибку
    if (isAxiosError(error)) {
      logger.error({
        message:
          '❌ [SERVER-ONLY] Ошибка сервера - локальная обработка ОТКЛЮЧЕНА',
        telegram_id,
        error_status: error.response?.status,
        error_message: error.response?.data?.error || error.message,
        error_code: error.code,
        api_server_url: API_SERVER_URL,
      })

      // Специальная обработка NSFW
      if (error.response?.data?.error?.includes('NSFW')) {
        await ctx.reply(
          isRussianFromState(ctx)
            ? 'Извините, генерация изображения не удалась из-за обнаружения неподходящего контента.'
            : 'Sorry, image generation failed due to inappropriate content detection.'
        )
        return null
      }

      // Специальная обработка недоступности сервера
      if (
        error.code === 'ECONNREFUSED' ||
        error.response?.status === 502 ||
        error.response?.status >= 500
      ) {
        await ctx.reply(
          isRussianFromState(ctx)
            ? '🚫 Сервер генерации изображений временно недоступен. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
            : '🚫 Image generation server is temporarily unavailable. Please try again later or contact support.'
        )
        return null
      }
    } else {
      logger.error({
        message: '❌ [SERVER-ONLY] Неизвестная ошибка сервера',
        telegram_id,
        error: String(error),
        api_server_url: API_SERVER_URL,
      })
    }

    // Отправляем сообщение об ошибке пользователю
    await ctx.reply(
      isRussianFromState(ctx)
        ? '❌ Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
        : '❌ An error occurred during image generation. Please try again later or contact support.'
    )

    return null
  }
}
