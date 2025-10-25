import { Router } from 'express'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'

const router = Router()

interface ReplicateWebhookPayload {
  id: string // training ID
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  model: string
  version: string
  input: {
    input_images: string
    trigger_word: string
    steps: number
  }
  output?: {
    version: string
    weights: string
  }
  error?: string
  logs?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

/**
 * POST /api/webhooks/replicate
 * Webhook endpoint для получения уведомлений от Replicate о статусе тренировки модели
 */
router.post('/replicate', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    const payload = req.body as ReplicateWebhookPayload

    logger.info('[REPLICATE WEBHOOK] Received webhook', {
      training_id: payload.id,
      status: payload.status,
      model: payload.model,
    })

    // ✅ STEP 1: Find training record in database
    const { data: trainingRecord, error: findError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('replicate_training_id', payload.id)
      .single()

    if (findError || !trainingRecord) {
      logger.error('[REPLICATE WEBHOOK] Training record not found', {
        training_id: payload.id,
        error: findError?.message,
      })
      // Возвращаем 200 чтобы Replicate не повторял запрос
      return res.status(200).json({
        success: false,
        message: 'Training not found in database, but webhook acknowledged',
      })
    }

    logger.info('[REPLICATE WEBHOOK] Training record found', {
      training_id: payload.id,
      telegram_id: trainingRecord.telegram_id,
      model_name: trainingRecord.model_name,
    })

    // ✅ STEP 2: Update training status in database
    const updateData: any = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    }

    if (payload.status === 'succeeded' && payload.output) {
      updateData.model_version = payload.output.version
      updateData.model_weights_url = payload.output.weights
      updateData.completed_at = payload.completed_at
    }

    if (payload.status === 'failed' && payload.error) {
      updateData.error_message = payload.error
      updateData.completed_at = payload.completed_at
    }

    const { error: updateError } = await supabase
      .from('model_trainings')
      .update(updateData)
      .eq('replicate_training_id', payload.id)

    if (updateError) {
      logger.error('[REPLICATE WEBHOOK] Failed to update training status', {
        training_id: payload.id,
        error: updateError.message,
      })
    } else {
      logger.info('[REPLICATE WEBHOOK] Training status updated', {
        training_id: payload.id,
        status: payload.status,
      })
    }

    // ✅ STEP 3: Send notification to user via Telegram
    if (payload.status === 'succeeded' || payload.status === 'failed') {
      try {
        const botName = trainingRecord.bot_name || 'AI_STARS_bot'
        const { bot } = getBotByName(botName)

        if (!bot) {
          logger.error('[REPLICATE WEBHOOK] Bot not found', {
            bot_name: botName,
            training_id: payload.id,
          })
        } else {
          const userId = trainingRecord.telegram_id
          const modelName = trainingRecord.model_name
          const isRu = trainingRecord.is_ru !== false // По умолчанию русский

          let message: string
          if (payload.status === 'succeeded') {
            message = isRu
              ? `✅ Тренировка модели завершена!\n\n📦 Модель: ${modelName}\n🎯 Trigger word: ${trainingRecord.trigger_word}\n🆔 Training ID: ${payload.id}\n\n🎨 Теперь вы можете использовать эту модель в разделе "Модели" в Нейрофото.\n\nЧтобы использовать модель, укажите trigger word в промпте: ${trainingRecord.trigger_word}`
              : `✅ Model training completed!\n\n📦 Model: ${modelName}\n🎯 Trigger word: ${trainingRecord.trigger_word}\n🆔 Training ID: ${payload.id}\n\n🎨 You can now use this model in the "Models" section in Neurophoto.\n\nTo use the model, mention the trigger word in your prompt: ${trainingRecord.trigger_word}`
          } else {
            message = isRu
              ? `❌ Ошибка тренировки модели\n\n📦 Модель: ${modelName}\n🆔 Training ID: ${payload.id}\n\n⚠️ Причина: ${payload.error || 'Unknown error'}\n\nПопробуйте запустить тренировку заново или обратитесь в поддержку.`
              : `❌ Model training failed\n\n📦 Model: ${modelName}\n🆔 Training ID: ${payload.id}\n\n⚠️ Reason: ${payload.error || 'Unknown error'}\n\nPlease try again or contact support.`
          }

          await bot.telegram.sendMessage(userId, message)

          logger.info('[REPLICATE WEBHOOK] User notified', {
            training_id: payload.id,
            telegram_id: userId,
            status: payload.status,
          })
        }
      } catch (notifyError) {
        logger.error('[REPLICATE WEBHOOK] Failed to notify user (non-fatal)', {
          training_id: payload.id,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        })
      }
    }

    // ✅ STEP 4: Return success response
    const elapsed = Date.now() - startTime
    logger.info('[REPLICATE WEBHOOK] Webhook processed successfully', {
      training_id: payload.id,
      status: payload.status,
      elapsed: `${elapsed}ms`,
    })

    return res.status(200).json({
      success: true,
      training_id: payload.id,
      status: payload.status,
      elapsed_ms: elapsed,
    })
  } catch (error) {
    logger.error('[REPLICATE WEBHOOK] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    })
  }
})

export default router
