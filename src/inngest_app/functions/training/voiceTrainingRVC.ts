/**
 * 🎤 VOICE TRAINING RVC - Inngest Function
 *
 * Обучение голосовой модели через Replicate
 * Время выполнения: 5-10 минут
 *
 * Events:
 * - voice/training.start - запуск обучения
 * - voice/training.completed - завершение (webhook)
 */

import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { logger } from '@/utils/logger'
import {
  getVoiceModelByTrainingId,
  updateVoiceModel,
  markVoiceModelReady,
  markVoiceModelFailed,
} from '@/core/supabase/voiceModels'
import { startVoiceTraining, checkTrainingStatus } from '@/services/rvc'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { getVoiceTrainingCost } from '@/price/helpers/modelsCost'
import { getBotByName } from '@/core/bot'

// Type for tracking result
interface TrainingResult {
  success: boolean
  modelUrl?: string
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface VoiceTrainingStartEvent {
  name: 'voice/training.start'
  data: {
    voiceModelId: string
    telegram_id: string
    audioUrl: string
    modelName: string
    bot_name?: string
  }
}

interface VoiceTrainingCompletedEvent {
  name: 'voice/training.completed'
  data: {
    trainingId: string
    status: 'succeeded' | 'failed'
    modelUrl?: string
    error?: string
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE TRAINING START FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export const voiceTrainingStart = inngest.createFunction(
  {
    id: 'voice-training-start',
    name: 'Voice Training - Start RVC',
    retries: 2,
    onFailure: createInngestFailureHandler('voice-training-start'),
  },
  { event: 'voice/training.start' },
  async ({ event, step }) => {
    const { voiceModelId, telegram_id, audioUrl, modelName, bot_name } =
      event.data as VoiceTrainingStartEvent['data']

    logger.info('[VOICE_TRAINING] Inngest function started', {
      voiceModelId,
      telegram_id,
      modelName,
      bot_name,
    })

    // Step 1: Обновить статус на "training"
    await step.run('update-status-training', async () => {
      await updateVoiceModel(voiceModelId, {
        status: 'training',
      })
      logger.info('[VOICE_TRAINING] Status updated to training', {
        voiceModelId,
      })
    })

    // Step 2: Запустить обучение на Replicate
    const trainingResult = await step.run('start-replicate-training', async () => {
      try {
        // ВЕБХУК НЕ ПЕРЕДАЁМ. Здесь стоял адрес
        // `${…}/api/webhooks/voice-training`, а такого маршрута в приложении
        // НЕТ — единственный маршрут под /api/webhooks это /replicate. Replicate
        // повторяет неудавшиеся вебхуки, то есть мы годами генерировали серию
        // запросов в 404.
        //
        // Работу и так делает опрос: шаг 'wait-for-completion' ниже спрашивает
        // статус каждые 30 секунд до 60 раз. Комментарий там честно говорил
        // «используем polling как fallback» — на деле это был не fallback, а
        // единственный работающий механизм.
        //
        // Если понадобится вебхук: сперва завести маршрут, потом сюда вернуть
        // адрес. Указывать несуществующий — хуже, чем не указывать никакого.
        const result = await startVoiceTraining({
          telegram_id,
          audioUrl,
          modelName,
        })

        logger.info('[VOICE_TRAINING] Replicate training started', {
          voiceModelId,
          trainingId: result.trainingId,
        })

        return result
      } catch (error) {
        logger.error('[VOICE_TRAINING] Failed to start Replicate training', {
          voiceModelId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })

    // Step 3: Сохранить training ID в БД
    await step.run('save-training-id', async () => {
      await updateVoiceModel(voiceModelId, {
        replicate_training_id: trainingResult.trainingId,
      })
    })

    // Step 4: Ждать завершения (polling или webhook)
    // Используем polling как fallback
    const finalStatus = (await step.run('wait-for-completion', async () => {
      const maxAttempts = 60 // 30 минут максимум (каждые 30 сек)
      let attempts = 0

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 30000)) // 30 сек
        attempts++

        try {
          const status = await checkTrainingStatus(trainingResult.trainingId)

          logger.info('[VOICE_TRAINING] Checking status', {
            voiceModelId,
            attempt: attempts,
            status: status.status,
          })

          if (status.status === 'succeeded') {
            return {
              success: true,
              modelUrl: status.modelUrl,
            }
          }

          if (status.status === 'failed' || status.status === 'canceled') {
            return {
              success: false,
              error: status.error || 'Training failed',
            }
          }

          // Продолжаем ждать для processing/starting
        } catch (error) {
          logger.warn('[VOICE_TRAINING] Status check error', {
            voiceModelId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      return {
        success: false,
        error: 'Training timed out after 30 minutes',
      }
    })) as TrainingResult

    // Step 5: Обработка результата
    if (finalStatus.success && finalStatus.modelUrl) {
      await step.run('mark-ready', async () => {
        await markVoiceModelReady(voiceModelId, finalStatus.modelUrl!)
        logger.info('[VOICE_TRAINING] Model marked as ready', {
          voiceModelId,
          modelUrl: finalStatus.modelUrl,
        })
      })

      // Уведомление пользователя
      await step.run('notify-user-success', async () => {
        await notifyUser(telegram_id, true, undefined, bot_name)
      })

      return {
        success: true,
        voiceModelId,
        modelUrl: finalStatus.modelUrl,
      }
    } else {
      await step.run('mark-failed', async () => {
        await markVoiceModelFailed(voiceModelId, finalStatus.error || 'Unknown error')
        logger.error('[VOICE_TRAINING] Model marked as failed', {
          voiceModelId,
          error: finalStatus.error,
        })
      })

      // Refund
      await step.run('refund-user', async () => {
        const cost = getVoiceTrainingCost()
        await updateUserBalance(
          telegram_id,
          cost,
          PaymentType.REFUND,
          'Voice training failed - refund'
        )
        logger.info('[VOICE_TRAINING] Refund processed', {
          telegram_id,
          amount: cost,
        })
      })

      // Уведомление пользователя
      await step.run('notify-user-failure', async () => {
        await notifyUser(telegram_id, false, finalStatus.error, bot_name)
      })

      return {
        success: false,
        voiceModelId,
        error: finalStatus.error,
      }
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// VOICE TRAINING COMPLETED (WEBHOOK) FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export const voiceTrainingCompleted = inngest.createFunction(
  {
    id: 'voice-training-completed',
    name: 'Voice Training - Webhook Handler',
    retries: 3,
    onFailure: createInngestFailureHandler('voice-training-completed'),
  },
  { event: 'voice/training.completed' },
  async ({ event, step }) => {
    const { trainingId, status, modelUrl, error } =
      event.data as VoiceTrainingCompletedEvent['data']

    logger.info('[VOICE_TRAINING] Webhook received', {
      trainingId,
      status,
      modelUrl,
    })

    // Step 1: Найти модель по training ID
    const voiceModel = await step.run('find-voice-model', async () => {
      return await getVoiceModelByTrainingId(trainingId)
    })

    if (!voiceModel) {
      logger.error('[VOICE_TRAINING] Voice model not found for training', {
        trainingId,
      })
      return { success: false, error: 'Voice model not found' }
    }

    // Step 2: Обновить статус
    if (status === 'succeeded' && modelUrl) {
      await step.run('mark-ready', async () => {
        await markVoiceModelReady(voiceModel.id, modelUrl)
      })

      await step.run('notify-success', async () => {
        await notifyUser(voiceModel.telegram_id, true)
      })

      return { success: true, voiceModelId: voiceModel.id }
    } else {
      await step.run('mark-failed', async () => {
        await markVoiceModelFailed(voiceModel.id, error || 'Training failed')
      })

      await step.run('refund', async () => {
        const cost = getVoiceTrainingCost()
        await updateUserBalance(
          voiceModel.telegram_id,
          cost,
          PaymentType.REFUND,
          'Voice training failed - refund'
        )
      })

      await step.run('notify-failure', async () => {
        await notifyUser(voiceModel.telegram_id, false, error)
      })

      return { success: false, voiceModelId: voiceModel.id, error }
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function notifyUser(
  telegram_id: string,
  success: boolean,
  errorMsg?: string,
  bot_name?: string
): Promise<void> {
  try {
    // Получаем инстанс бота для отправки сообщения
    const botNameToUse = bot_name || 'neuro_blogger_bot'
    const { bot, error: botError } = getBotByName(botNameToUse)
    if (!bot || botError) {
      logger.warn('[VOICE_TRAINING] No bot available for notification', {
        telegram_id,
        botError,
      })
      return
    }

    const message = success
      ? `✅ Ваша голосовая модель готова!\n\n` +
        `Теперь вы можете создавать AI Cover в разделе "🎧 AI Cover".\n\n` +
        `Просто отправьте песню, и она будет исполнена вашим голосом!`
      : `❌ К сожалению, обучение голоса не удалось.\n\n` +
        `${errorMsg ? `Ошибка: ${errorMsg}\n\n` : ''}` +
        `Средства возвращены на ваш баланс.\n` +
        `Попробуйте снова с другим аудио.`

    await bot.telegram.sendMessage(telegram_id, message)

    logger.info('[VOICE_TRAINING] User notified', {
      telegram_id,
      success,
    })
  } catch (error) {
    // Non-fatal: user may have blocked the bot or chat is unavailable
    logger.warn('[VOICE_TRAINING] Failed to notify user (non-fatal)', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export default {
  voiceTrainingStart,
  voiceTrainingCompleted,
}
