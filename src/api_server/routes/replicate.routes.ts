import { Router } from 'express'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest_app/client'

const router = Router()

/**
 * 🔔 Webhook endpoint для Replicate
 * Этот endpoint принимает webhook от Replicate когда генерация завершена
 */
router.post('/webhooks/replicate', async (req: any, res: any) => {
  try {
    const webhookData = req.body

    logger.info('📡 [Replicate Webhook] Received webhook', {
      id: webhookData.id,
      status: webhookData.status,
      hasOutput: !!webhookData.output,
      error: webhookData.error,
      webhookType: webhookData.webhook_event_type,
    })

    // Проверяем подпись webhook если есть секрет
    if (process.env.REPLICATE_WEBHOOK_SECRET) {
      const signature = req.headers['webhook-signature']
      // TODO: Добавить проверку подписи
      logger.info('🔐 [Replicate Webhook] Signature validation skipped (not implemented)')
    }

    // Отправляем событие в Inngest для обработки
    await inngest.send({
      name: 'replicate/webhook',
      data: {
        id: webhookData.id,
        status: webhookData.status,
        output: webhookData.output,
        error: webhookData.error,
        logs: webhookData.logs,
        metrics: webhookData.metrics,
        webhook_event_type: webhookData.webhook_event_type,
        created_at: webhookData.created_at,
        completed_at: webhookData.completed_at,
      },
    })

    logger.info('✅ [Replicate Webhook] Event sent to Inngest', {
      predictionId: webhookData.id,
      status: webhookData.status,
    })

    // Отвечаем Replicate что webhook получен
    res.status(200).json({
      success: true,
      message: 'Webhook received',
      predictionId: webhookData.id,
    })
  } catch (error) {
    logger.error('❌ [Replicate Webhook] Error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    })

    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
    })
  }
})

/**
 * 🔍 Health check для webhook endpoint
 */
router.get('/webhooks/replicate/health', (req: any, res: any) => {
  res.json({
    status: 'ok',
    endpoint: '/api/webhooks/replicate',
    timestamp: new Date().toISOString(),
  })
})

export default router
