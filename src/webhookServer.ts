import express, { Request, Response } from 'express'
import { logger } from '@/utils/logger'
import { handleRobokassaResult } from './webhooks/robokassa/robokassa.handler'

const PORT = process.env.ROBOKASSA_WEBHOOK_PORT || 8288

async function startWebhookServer() {
  logger.info('[Webhook Server] Initializing...')

  const app = express()

  // Middleware для парсинга form-data (как отправляет Robokassa)
  app.use(express.urlencoded({ extended: true }))
  // Middleware для парсинга JSON (на всякий случай)
  app.use(express.json())

  // Роут для Robokassa Result URL
  app.post('/payment-success', (req: Request, res: Response) => {
    // Передаем только req и res. Обработчик сам разберется с ботом.
    handleRobokassaResult(req, res)
  })

  // Роут для проверки здоровья
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('Webhook server is healthy')
  })

  app.listen(PORT, () => {
    logger.info(`[Webhook Server] Listening on port ${PORT}`)
  })
}

startWebhookServer().catch(error => {
  logger.error('[Webhook Server] Failed to start:', error)
  process.exit(1)
})
