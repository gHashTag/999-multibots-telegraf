import axios, { isAxiosError } from 'axios'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL_FINAL,
  LOCAL_SERVER_URL,
} from '@/config'
import { getAiServerUrl } from '@/config/aiServer'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'
import { Markup } from 'telegraf'
import {
  ACTION_PREFIX,
  topupButtonLabel,
} from '@/navigation/helpers/actionButtons'

// Функция для отправки уведомления админу о проблеме с сервером
// ✅ ИСПРАВЛЕНО: Не отправляем сообщение пользователю, который инициировал запрос
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

    // ✅ ИСКЛЮЧАЕМ пользователя, который инициировал запрос, из списка получателей
    const otherAdmins = adminIds.filter(
      adminId => adminId.trim() !== telegram_id.toString()
    )

    // Если нет других админов, просто логируем без отправки сообщения
    if (otherAdmins.length === 0) {
      logger.warn('[ADMIN NOTIFICATION] No other admins to notify', {
        telegram_id,
        error,
        note: 'User is the only admin, skipping notification',
      })
      return
    }

    const errorMessage =
      `🚨 **SERVER DOWN ALERT**\n\n` +
      `📍 План Б активирован для нейрофото генерации\n` +
      `👤 User: ${telegram_id}\n` +
      `🤖 Bot: ${botName}\n` +
      `❌ Error: ${error}\n` +
      `🔄 Используется локальная обработка\n\n` +
      `⚠️ Проверьте сервер: ${isDev ? LOCAL_SERVER_URL : API_SERVER_URL_FINAL}`

    // Отправляем только другим админам (не пользователю, который инициировал запрос)
    for (const adminId of otherAdmins) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'Markdown',
      })
    }

    logger.warn('[ADMIN NOTIFICATION] Server issue reported to other admins', {
      notifiedAdmins: otherAdmins,
      excludedUser: telegram_id,
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
      Markup.button.callback(
        is_ru ? '⬆️ Увеличить качество' : '⬆️ Upscale Quality',
        'upscale_neurophoto_image'
      ),
    ],
    [
      // The one place a person has just seen what this is worth. Measured
      // 2026-09-08: of everyone who ever generates, about one in five ever
      // reaches a price. act:topup is caught at bot level, and inside
      // neuroPhotoWizard -- the only scene that swallows unknown presses -- by
      // an explicit branch.
      Markup.button.callback(topupButtonLabel(is_ru), `${ACTION_PREFIX}topup`),
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
  explicitAspectRatio?: string | null,
  userModel?: any // ✅ Add userModel parameter for FAL support
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

  // Проверка доступности провайдера
  const { isProviderAvailable } = await import('./provider-health-monitor')
  if (!isProviderAvailable('fal.ai') && !isProviderAvailable('replicate')) {
    const is_ru = await isRussianFromState(ctx)
    await ctx.reply(
      is_ru
        ? '⚠️ Все провайдеры генерации временно недоступны. Администратор уведомлён. Попробуйте позже.'
        : '⚠️ All generation providers are temporarily unavailable. Admin has been notified. Please try again later.'
    )
    return null
  }

  logger.info('🔄 [HYBRID] Начало гибридной генерации neuro_photo', {
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

  logger.info('💰 [HYBRID] Рассчитана точная стоимость', {
    exactCostPerImage,
    exactTotalCost,
    numImages,
  })

  // ПЛАН А: Попытка отправки на сервер с точной ценой
  try {
    logger.info('🌐 [HYBRID] План А: Отправка запроса на сервер', {
      telegram_id,
    })

    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

    // Адрес берём у getAiServerUrl, а НЕ у API_SERVER_URL_FINAL.
    //
    // API_SERVER_URL_FINAL откатывается на BASE_WEBHOOK_URL, то есть на САМ
    // БОТ. В проде, где API_SERVER_URL не задана, План А стучался на
    // `https://<наш бот>/generate/neuro-photo` — проверено живым запросом,
    // это 404. Такой откат превращает «сервер не настроен» в «настроен
    // неправильно»: по логам не отличить от «сервер лежит».
    //
    // Бросаем, а не возвращаем: ниже стоит catch, который и есть переход к
    // Плану Б.
    const aiServerUrl = getAiServerUrl()
    if (!aiServerUrl) {
      logger.info(
        '⏭️ [HYBRID] Отдельный AI-сервер не настроен — сразу План Б',
        {
          telegram_id,
          description: 'AI server is not configured; skipping Plan A entirely',
        }
      )
      throw new Error('AI server is not configured')
    }

    const url = `${aiServerUrl}/generate/neuro-photo`

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

    logger.info('📤 [HYBRID] Отправка данных на сервер', {
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

    logger.info('✅ [HYBRID] План А успешен - сервер ответил', {
      telegram_id,
      response_status: response.status,
      response_data: JSON.stringify(response.data),
    })

    // Проверяем содержимое ответа сервера
    if (!response.data) {
      logger.error('❌ [HYBRID] Сервер вернул пустой ответ', {
        telegram_id,
        response_status: response.status,
      })
      throw new Error('Server returned empty response')
    }

    // Проверяем, есть ли ошибка в ответе сервера
    if (response.data.error) {
      logger.error('❌ [HYBRID] Сервер вернул ошибку', {
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
      logger.info('📸 [HYBRID] Отправка фотографий пользователю', {
        telegram_id,
        urls_count: response.data.urls.length,
      })

      // СОХРАНЯЕМ последний URL в сессии для upscaler'а
      const lastUrl = response.data.urls[response.data.urls.length - 1]
      if (ctx.session) {
        ctx.session.lastNeuroPhotoImageUrl = lastUrl
        ctx.session.lastNeuroPhotoPrompt = prompt

        logger.info(
          '💾 [HYBRID] URL нейрофото сохранен в сессии для upscaler',
          {
            description: 'Neurophoto URL saved in session for upscaler',
            telegram_id,
            savedUrl: lastUrl.substring(0, 50) + '...',
            savedPrompt: prompt.substring(0, 50) + '...',
            sessionExists: true,
            urlsCount: response.data.urls.length,
          }
        )
      }

      // Отправляем все фотографии с клавиатурой
      for (const url of response.data.urls) {
        try {
          const caption = isRussianFromState(ctx)
            ? `✨ Нейрофото сгенерировано!\n\n💎 Стоимость: ${exactCostPerImage} ⭐`
            : `✨ Neurophoto generated!\n\n Cost: ${exactCostPerImage} ⭐`

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

          logger.info('✅ [HYBRID] Фотография отправлена', {
            telegram_id,
            url,
          })
        } catch (sendError) {
          logger.error('❌ [HYBRID] Ошибка при отправке фотографии', {
            telegram_id,
            url,
            error: sendError,
          })
        }
      }

      // Track successful generation for skill learning
      import('./skillManager')
        .then(sm =>
          sm.trackGeneration({
            telegram_id,
            service_type: 'neuro_photo',
            prompt,
            model: String(model_url),
            settings: {
              aspect_ratio: explicitAspectRatio,
              num_images: numImages,
            },
            success: true,
          })
        )
        .catch(() => {})

      return response.data
    } else if (response.data.jobId) {
      // СЦЕНАРИЙ 2: Сервер вернул jobId для асинхронной обработки
      logger.info(
        '✅ [HYBRID] План А успешен - сервер принял задачу и будет обрабатывать асинхронно',
        {
          telegram_id,
          jobId: response.data.jobId,
        }
      )

      // Сервер сам отправит изображение через webhook после обработки
      // Просто возвращаем успешный результат
      return response.data
    } else if (
      response.data.message &&
      response.data.message.includes('Processing started')
    ) {
      // СЦЕНАРИЙ 3: Сервер принял задачу и начал обработку
      logger.info(
        '✅ [HYBRID] План А успешен - сервер принял задачу и начал обработку',
        {
          telegram_id,
          serverMessage: response.data.message,
        }
      )

      // Сервер сам отправит изображение через webhook после обработки
      // Просто возвращаем успешный результат
      return response.data
    } else {
      // СЦЕНАРИЙ 4: Неожиданный формат ответа
      logger.error('❌ [HYBRID] Неожиданный формат ответа от сервера', {
        telegram_id,
        responseData: JSON.stringify(response.data).substring(0, 200),
      })

      throw new Error('Unexpected response format from server')
    }
  } catch (error) {
    // Логируем ошибку сервера
    if (isAxiosError(error)) {
      logger.warn('⚠️ [HYBRID] План А неудачен - ошибка сервера', {
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
      logger.warn('⚠️ [HYBRID] План А неудачен - неизвестная ошибка', {
        telegram_id,
        error: String(error),
      })
    }

    // ПЛАН Б: Локальная обработка
    logger.info('🔄 [HYBRID] Переключение на План Б: локальная обработка', {
      telegram_id,
    })

    // ✅ УДАЛЕНО: Уведомление админу о проблеме с сервером (не нужно беспокоить пользователя)

    try {
      console.log('🔔 [HYBRID] ВЫЗОВ generateNeuroPhotoDirect (План Б)', {
        telegram_id,
        numImages,
        botName,
        explicitAspectRatio,
      })
      logger.info({
        message: '🔔 [HYBRID] ВЫЗОВ generateNeuroPhotoDirect (План Б)',
        description: 'CALLING generateNeuroPhotoDirect (Plan B)',
        telegram_id,
        prompt: prompt.substring(0, 50) + '...',
        numImages,
        botName,
        explicitAspectRatio,
      })

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
        },
        userModel // ✅ Pass userModel for FAL support
      )

      logger.info({
        message: '🔔 [HYBRID] generateNeuroPhotoDirect завершен (План Б)',
        description: 'generateNeuroPhotoDirect completed (Plan B)',
        telegram_id,
        result: localResult
          ? {
              success: localResult.success,
              hasUrls: !!localResult.urls,
              urlsCount: localResult.urls?.length,
            }
          : null,
      })

      if (localResult && localResult.success) {
        // Track successful local generation for skill learning
        import('./skillManager')
          .then(sm =>
            sm.trackGeneration({
              telegram_id,
              service_type: 'neuro_photo',
              prompt,
              model: String(model_url),
              settings: {
                aspect_ratio: explicitAspectRatio,
                num_images: numImages,
              },
              success: true,
            })
          )
          .catch(() => {})

        logger.info(
          '✅ [HYBRID] План Б успешен - локальная обработка завершена',
          {
            telegram_id,
          }
        )
      } else {
        logger.error(
          '❌ [HYBRID] План Б неудачен - локальная обработка провалилась',
          {
            telegram_id,
          }
        )
      }

      return localResult
    } catch (localError) {
      logger.error('❌ [HYBRID] Критическая ошибка - оба плана провалились', {
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
