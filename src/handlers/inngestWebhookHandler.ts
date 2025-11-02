import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'

/**
 * Обработчик вебхуков от Inngest
 * Получает результаты обработки и отправляет пользователю
 */

interface InngestWebhookPayload {
  type: 'generation-completed' | 'generation-failed' | 'payment-completed' | 'payment-failed' | 'training-completed'
  data: {
    eventId: string
    status: 'completed' | 'failed' | 'processing'
    userId: string
    telegramId?: string
    result?: any
    error?: string
    metadata?: {
      prompt?: string
      model?: string
      duration?: number
    }
  }
}

/**
 * Основной обработчик вебхуков
 */
export function createInngestWebhookHandler(bot: Telegraf<MyContext>) {
  bot.webhook('/inngest-webhook', async (ctx) => {
    try {
      const payload: InngestWebhookPayload = ctx.request.body

      logger.info('📨 [WEBHOOK] Received Inngest webhook', {
        type: payload.type,
        eventId: payload.data.eventId,
        userId: payload.data.userId,
      })

      // Обрабатываем по типу события
      switch (payload.type) {
        case 'generation-completed':
          await handleGenerationCompleted(bot, payload)
          break

        case 'generation-failed':
          await handleGenerationFailed(bot, payload)
          break

        case 'payment-completed':
          await handlePaymentCompleted(bot, payload)
          break

        case 'payment-failed':
          await handlePaymentFailed(bot, payload)
          break

        case 'training-completed':
          await handleTrainingCompleted(bot, payload)
          break

        default:
          logger.warn('⚠️ [WEBHOOK] Unknown webhook type', { type: payload.type })
      }

      return { ok: true }
    } catch (error) {
      logger.error('❌ [WEBHOOK] Error processing webhook', {
        error: error instanceof Error ? error.message : String(error),
        body: ctx.request.body,
      })
      throw error
    }
  })
}

/**
 * Обработка успешной генерации изображения
 */
async function handleGenerationCompleted(
  bot: Telegraf<MyContext>,
  payload: InngestWebhookPayload
) {
  const { result, userId, metadata } = payload.data

  logger.info('✅ [GENERATION] Completed', {
    userId,
    hasImage: !!result?.imageUrl,
    prompt: metadata?.prompt,
  })

  try {
    // Отправляем изображение пользователю
    await bot.telegram.sendPhoto(userId, result.imageUrl, {
      caption: `✅ Изображение готово!\n${metadata?.prompt || ''}`,
    })

    // Если есть дополнительные результаты (например, upscaled версия)
    if (result.upscaledImageUrl) {
      await bot.telegram.sendPhoto(userId, result.upscaledImageUrl, {
        caption: '📈 Увеличенная версия (4x)',
      })
    }

    // Предлагаем следующие действия
    await bot.telegram.sendMessage(userId, '🎯 Что дальше?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🆕 Создать ещё', callback_data: 'new_generation' },
            { text: '📈 Увеличить качество', callback_data: `upscale_${payload.data.eventId}` },
          ],
          [
            { text: '🏠 Главное меню', callback_data: 'go_main_menu' },
          ],
        ],
      },
    })
  } catch (error) {
    logger.error('❌ [GENERATION] Failed to send result to user', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
  }
}

/**
 * Обработка неудачной генерации
 */
async function handleGenerationFailed(
  bot: Telegraf<MyContext>,
  payload: InngestWebhookPayload
) {
  const { userId, error, metadata } = payload.data

  logger.error('❌ [GENERATION] Failed', {
    userId,
    error,
    prompt: metadata?.prompt,
  })

  try {
    await bot.telegram.sendMessage(
      userId,
      `❌ Не удалось сгенерировать изображение.\n\nОшибка: ${error}\n\nПопробуйте ещё раз или измените промпт.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Попробовать снова', callback_data: 'retry_generation' },
              { text: '❓ Изменить промпт', callback_data: 'change_prompt' },
            ],
            [
              { text: '🏠 Главное меню', callback_data: 'go_main_menu' },
            ],
          ],
        },
      }
    )
  } catch (err) {
    logger.error('❌ [GENERATION] Failed to send error to user', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    })
  }
}

/**
 * Обработка успешной оплаты
 */
async function handlePaymentCompleted(
  bot: Telegraf<MyContext>,
  payload: InngestWebhookPayload
) {
  const { userId, result, metadata } = payload.data

  logger.info('💳 [PAYMENT] Completed', {
    userId,
    amount: metadata?.amount,
    method: metadata?.method,
  })

  try {
    await bot.telegram.sendMessage(
      userId,
      `✅ Платёж успешно обработан!\n\nСумма: ${metadata?.amount}\nМетод: ${metadata?.method}\n\nТеперь вы можете полноценно использовать бота! 🎉`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 Начать', callback_data: 'go_main_menu' },
            ],
          ],
        },
      }
    )
  } catch (error) {
    logger.error('❌ [PAYMENT] Failed to send confirmation', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
  }
}

/**
 * Обработка неудачной оплаты
 */
async function handlePaymentFailed(
  bot: Telegraf<MyContext>,
  payload: InngestWebhookPayload
) {
  const { userId, error } = payload.data

  logger.error('❌ [PAYMENT] Failed', {
    userId,
    error,
  })

  try {
    await bot.telegram.sendMessage(
      userId,
      `❌ Платёж не прошёл.\n\nОшибка: ${error}\n\nПопробуйте ещё раз или используйте другой метод оплаты.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💳 Попробовать снова', callback_data: 'retry_payment' },
              { text: '💰 Другой способ', callback_data: 'other_payment' },
            ],
          ],
        },
      }
    )
  } catch (err) {
    logger.error('❌ [PAYMENT] Failed to send error', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    })
  }
}

/**
 * Обработка завершения обучения модели
 */
async function handleTrainingCompleted(
  bot: Telegraf<MyContext>,
  payload: InngestWebhookPayload
) {
  const { userId, result, metadata } = payload.data

  logger.info('🎓 [TRAINING] Completed', {
    userId,
    modelName: metadata?.modelName,
  })

  try {
    await bot.telegram.sendMessage(
      userId,
      `🎉 Обучение модели завершено!\n\nМодель: ${metadata?.modelName}\nСтатус: Готова к использованию\n\nТеперь вы можете создавать изображения с вашей персональной моделью!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🖼️ Создать с моей моделью', callback_data: 'use_my_model' },
              { text: '📊 Посмотреть статистику', callback_data: 'model_stats' },
            ],
            [
              { text: '🏠 Главное меню', callback_data: 'go_main_menu' },
            ],
          ],
        },
      }
    )
  } catch (error) {
    logger.error('❌ [TRAINING] Failed to send notification', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
  }
}
