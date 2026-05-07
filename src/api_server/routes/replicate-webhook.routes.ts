import express, { Router } from 'express'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest_app/client'

const router: import('express-serve-static-core').Router = Router()

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
 * ✅ ЛЕГКОВЕСНЫЙ HANDLER: Только отправляет событие в Inngest, вся обработка в Inngest функции
 */
router.post('/replicate', async (req: any, res: any) => {
  const startTime = Date.now()

  try {
    const payload = req.body as ReplicateWebhookPayload

    logger.info('[REPLICATE WEBHOOK] Received webhook', {
      training_id: payload.id,
      status: payload.status,
      model: payload.model,
      has_output: !!payload.output,
      has_error: !!payload.error,
      input_trigger_word: payload.input?.trigger_word,
      input_steps: payload.input?.steps,
      created_at: payload.created_at,
      completed_at: payload.completed_at,
      full_payload_keys: Object.keys(payload),
    })

    // ✅ КРИТИЧНО: Проверяем только терминальные статусы (succeeded, failed, canceled)
    // Replicate отправляет webhook только для 'completed' событий (webhook_events_filter: ['completed'])
    const terminalStatuses = ['succeeded', 'failed', 'canceled']
    if (!terminalStatuses.includes(payload.status)) {
      logger.info('[REPLICATE WEBHOOK] Non-terminal status, acknowledging only', {
        training_id: payload.id,
        status: payload.status,
      })
      // Возвращаем 200 для всех статусов, чтобы Replicate не повторял запрос
      return res.status(200).json({
        success: true,
        message: 'Webhook acknowledged (non-terminal status)',
        training_id: payload.id,
        status: payload.status,
      })
    }

    // ✅ STEP 1: Быстрая проверка существования записи (для логирования)
    const { data: trainingRecord } = await supabase
      .from('model_trainings')
      .select('telegram_id, bot_name, model_name')
      .eq('replicate_training_id', payload.id)
      .single()

    if (!trainingRecord) {
      logger.warn('[REPLICATE WEBHOOK] Training record not found (will be handled in Inngest)', {
        training_id: payload.id,
      })
      // Все равно отправляем событие - Inngest функция обработает ошибку
    } else {
      logger.info('[REPLICATE WEBHOOK] Training record found, sending to Inngest', {
        training_id: payload.id,
        telegram_id: trainingRecord.telegram_id,
        model_name: trainingRecord.model_name,
      })
    }

    // ✅ STEP 2: Отправляем событие в Inngest для асинхронной обработки
    try {
      await inngest.send({
        name: 'model/training.completed',
        data: {
          training_id: payload.id,
          status: payload.status as 'succeeded' | 'failed' | 'canceled',
          model: payload.model,
          version: payload.version,
          output: payload.output,
          error: payload.error,
          // Опциональные поля для ускорения обработки (если запись найдена)
          telegram_id: trainingRecord?.telegram_id,
          bot_name: trainingRecord?.bot_name,
        },
      })

      logger.info('[REPLICATE WEBHOOK] ✅ Event sent to Inngest', {
        training_id: payload.id,
        status: payload.status,
      })
    } catch (inngestError) {
      logger.error('[REPLICATE WEBHOOK] Failed to send event to Inngest', {
        training_id: payload.id,
        error:
          inngestError instanceof Error
            ? inngestError.message
            : String(inngestError),
      })
      // Все равно возвращаем 200, чтобы Replicate не повторял запрос
    }

    // ✅ STEP 3: Возвращаем успешный ответ (webhook должен быть быстрым)
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
      message: 'Webhook received and forwarded to Inngest',
    })
  } catch (error) {
    logger.error('[REPLICATE WEBHOOK] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // ✅ КРИТИЧНО: Всегда возвращаем 200, чтобы Replicate не повторял запрос
    // Ошибки будут обработаны в Inngest функции
    return res.status(200).json({
      success: false,
      error: 'Internal server error, but webhook acknowledged',
      message: 'Error will be handled in Inngest function',
    })
  }
})

export default router
