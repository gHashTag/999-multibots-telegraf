import { Request, Response } from 'express'
import { notifyTrainingSuccess } from '@/core/supabase/notifyTrainingSuccess'
import { Logger as logger } from '@/utils/logger'

export class WebhookBFLController {
  public async handleWebhookBFL(req: Request, res: Response): Promise<void> {
    try {
      const { task_id, status, result } = req.body

      logger.info({
        message: '🌐 Webhook received',
        task_id,
        status,
        result,
      })

      if (status === 'SUCCESS') {
        await notifyTrainingSuccess(task_id, 'COMPLETED', result)
      }

      res.status(200).json({ message: 'Webhook processed successfully' })
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при обработке вебхука BFL',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// Экспортируем функцию-обработчик для использования в маршрутах
export const handleBFLWebhook = async (req: Request, res: Response) => {
  const controller = new WebhookBFLController()
  await controller.handleWebhookBFL(req, res)
}
