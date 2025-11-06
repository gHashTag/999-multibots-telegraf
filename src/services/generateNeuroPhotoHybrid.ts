import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY, API_URL, LOCAL_SERVER_URL } from '@/config'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'

// Функция для отправки уведомления админу о проблеме с сервером
async function notifyAdminAboutServerIssue(
  error: string,
  telegram_id: string,
  botName: string
) {
  try {
    const adminIds = process.env.ADMIN_TELEGRAM_ID?.split(',') || ['144022504']
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName(botName)

    if (!botResult.bot) return

    const errorMessage =
      `🚨 **SERVER DOWN ALERT**\n\n` +
      `📍 План Б активирован для нейрофото генерации\n` +
      `👤 User: ${telegram_id}\n` +
      `🤖 Bot: ${botName}\n` +
      `❌ Error: ${error}\n` +
      `🔄 Используется локальная обработка\n\n` +
      `⚠️ Проверьте сервер: https://ai-server-production-production-8e2d.up.railway.app`

    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'Markdown',
      })
    }

    logger.warn('[ADMIN NOTIFICATION] Server issue reported to admins', {
      adminIds,
      error,
    })
  } catch (notifyError) {
    logger.error('[ADMIN NOTIFICATION] Failed to notify admins', notifyError)
  }
}

// Создание клавиатуры для результатов нейрофотографий с кнопкой Upscale
const createNeuroPhotoResultKeyboard = (is_ru: boolean) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        is_ru ? '🆕 Новый промпт' : '🆕 New prompt',
        'new_neurophoto_prompt'
      ),
      Markup.button.callback(
        is_ru ? '📐 Изменить размер' : '📐 Change size',
        'change_size'
      ),
    ],
    [
      Markup.button.callback(
        is_ru ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt',
        'improve_prompt'
      ),
      // ВРЕМЕННО СКРЫТО: Кнопка "Увеличить качество" не работает корректно
      // Markup.button.callback(
      //   is_ru ? '⬆️ Увеличить качество' : '⬆️ Upscale Quality',
      //   'upscale_neurophoto_image'
      // ),
    ],
    [
      Markup.button.callback(
        is_ru ? '🏠 Главное меню' : '🏠 Main menu',
        'go_main_menu'
      ),
    ],
  ])
}

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
  console.log('🚀 [HYBRID] generateNeuroPhotoHybrid ВХОД в функцию')
  console.log('🚀 [HYBRID] Параметры:', {
    prompt: prompt.substring(0, 50) + '...',
    model_url,
    numImages,
    telegram_id,
    botName,
    explicitAspectRatio,
  })

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
    console.error('❌ [HYBRID] Prompt not found in session')
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    console.error('❌ [HYBRID] User model not found in session')
    throw new Error('User model not found')
  }

  if (!numImages || numImages <= 0) {
    console.error('❌ [HYBRID] Invalid number of images:', numImages)
    throw new Error('Invalid number of images')
  }

  console.log('✅ [HYBRID] Валидация входных данных пройдена')

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

    // ИСПРАВЛЕНИЕ: Используем синхронный endpoint для получения результатов сразу
    const url = `${API_URL}/generate/neuro-photo-sync`

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
      serverPayload: JSON.stringify(serverPayload, null, 2),
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
      response_data: JSON.stringify(response.data),
    })

    // Проверяем содержимое ответа сервера
    if (!response.data) {
      logger.error({
        message: '❌ [HYBRID] Сервер вернул пустой ответ',
        telegram_id,
        response_status: response.status,
      })
      throw new Error('Server returned empty response')
    }

    // Проверяем, есть ли ошибка в ответе сервера
    if (response.data.error) {
      logger.error({
        message: '❌ [HYBRID] Сервер вернул ошибку',
        telegram_id,
        server_error: response.data.error,
      })
      throw new Error(`Server error: ${response.data.error}`)
    }

    // Проверяем тип ответа от сервера
    if (
      response.data.urls &&
      Array.isArray(response.data.urls) &&
      response.data.urls.length > 0
    ) {
      // СЦЕНАРИЙ 1: Сервер вернул готовые изображения
      logger.info({
        message:
          '📸 [HYBRID] План А успешен - получены изображения от синхронного сервера',
        telegram_id,
        images_count: response.data.images.length,
        server_count: response.data.count,
      })

      // Извлекаем URL изображений из формата сервера
      const imageUrls = response.data.images.map(img => img.url)

      // СОХРАНЯЕМ последний URL в сессии для upscaler'а
      const lastUrl = imageUrls[imageUrls.length - 1]
      if (ctx.session) {
        ctx.session.lastNeuroPhotoImageUrl = lastUrl
        ctx.session.lastNeuroPhotoPrompt = prompt

        logger.info({
          message: '💾 [HYBRID] URL нейрофото сохранен в сессии для upscaler',
          description: 'Neurophoto URL saved in session for upscaler',
          telegram_id,
          savedUrl: lastUrl.substring(0, 50) + '...',
          savedPrompt: prompt.substring(0, 50) + '...',
          sessionExists: true,
          urlsCount: imageUrls.length,
        })
      }

      // Отправляем все фотографии БЕЗ клавиатуры (как в AI сервере)
      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i]
        try {
          const caption = isRussianFromState(ctx)
            ? `✨ Нейрофото сгенерировано!\n\n📝 Промпт: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\n💎 Стоимость: ${exactCostPerImage} ⭐`
            : `✨ Neurophoto generated!\n\n📝 Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\n💎 Cost: ${exactCostPerImage} ⭐`

          await ctx.telegram.sendPhoto(
            telegram_id,
            { url },
            {
              caption,
              reply_markup: createNeuroPhotoResultKeyboard(
                isRussianFromState(ctx)
              ).reply_markup,
            }
          )

          logger.info({
            message: '✅ [HYBRID] Фотография отправлена без клавиатуры',
            telegram_id,
            url: url.substring(0, 50) + '...',
            imageNumber: i + 1,
            totalImages: imageUrls.length,
          })
        } catch (sendError) {
          logger.error({
            message: '❌ [HYBRID] Ошибка при отправке фотографии',
            telegram_id,
            url: url.substring(0, 50) + '...',
            error: sendError,
          })
        }
      }

      return response.data
    } else if (response.data.jobId) {
      // СЦЕНАРИЙ 2: Сервер вернул jobId для асинхронной обработки
      logger.info({
        message:
          '✅ [HYBRID] План А успешен - сервер принял задачу и будет обрабатывать асинхронно',
        telegram_id,
        jobId: response.data.jobId,
      })

      // Сервер сам отправит изображение через webhook после обработки
      // Просто возвращаем успешный результат
      return response.data
    } else if (
      response.data.message &&
      response.data.message.includes('Processing started')
    ) {
      // СЦЕНАРИЙ 3: Сервер принял задачу и начал обработку
      logger.info({
        message:
          '✅ [HYBRID] План А успешен - сервер принял задачу и начал обработку',
        telegram_id,
        serverMessage: response.data.message,
      })

      // Сервер сам отправит изображение через webhook после обработки
      // Просто возвращаем успешный результат
      return response.data
    } else {
      // СЦЕНАРИЙ 4: Неожиданный формат ответа
      logger.error({
        message: '❌ [HYBRID] Неожиданный формат ответа от синхронного сервера',
        telegram_id,
        responseData: JSON.stringify(response.data).substring(0, 200),
        expected_format: 'success=true, images=[{url, prompt_id}], count=N',
      })

      throw new Error('Unexpected response format from server')
    }
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
          isRussianFromState(ctx)
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

    // 🚨 УВЕДОМЛЕНИЕ АДМИНУ О ПРОБЛЕМЕ С СЕРВЕРОМ
    await notifyAdminAboutServerIssue(String(error), telegram_id, botName)

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
        isRussianFromState(ctx)
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )

      return null
    }
  }
}
