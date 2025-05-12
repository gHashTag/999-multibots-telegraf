import { Router, Request, Response } from 'express'
import { replicateWebhookHandler } from '../../modules/digitalAvatarBody/webhooks/replicate.webhook.controller'
import { logger } from '../../utils/logger' // Импортируем логгер

const webhookRouter: Router = Router()

// Middleware для логирования именно вебхук-запросов
webhookRouter.use((req: Request, res: Response, next) => {
  logger.info(`[Webhook Router] Received ${req.method} ${req.path}`)
  next()
})

// Определяем маршрут для вебхука Replicate
// Используем правильные типы Request и Response здесь
webhookRouter.post('/replicate-webhook', (req: Request, res: Response) => {
  // Вызываем наш асинхронный обработчик
  // Оборачиваем в try...catch на всякий случай, хотя основной catch есть в handler
  try {
    replicateWebhookHandler(req, res)
  } catch (error) {
    logger.error({
      message: '❌ Неперехваченная ошибка в роутере вебхука',
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    // Важно: Даже при ошибке здесь, нужно ответить Replicate, чтобы он не повторял запросы.
    // Обработчик replicateWebhookHandler сам должен заботиться об ответах.
    // Если ошибка произошла ДО вызова обработчика или вне его, вернем 500.
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error in webhook router' })
    }
  }
})

export default webhookRouter
