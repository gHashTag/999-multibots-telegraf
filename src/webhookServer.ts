import express, { Request, Response } from 'express'
import dotenv from 'dotenv'
import { handleRobokassaResult } from './webhooks/robokassa/robokassa.handler'

dotenv.config() // Загружаем переменные окружения

// Функция для запуска сервера
export function startWebhookServer() {
  // Порт для Robokassa webhook
  const robokassaPort = process.env.ROBOKASSA_WEBHOOK_PORT || 2999

  // Создаем экземпляр express
  const app = express()

  // Middleware для разбора URL-encoded формы
  app.use('/', express.urlencoded({ extended: true }))

  // Middleware для разбора JSON данных
  app.use('/', express.json())

  // POST маршрут для обработки результатов от Robokassa
  app.post('/robokassa-result', handleRobokassaResult)

  // Проверка работоспособности сервера
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('Robokassa Webhook Server OK')
  })

  // Запуск сервера
  app
    .listen(robokassaPort, () => {
      console.log(`[Robokassa] Webhook server running on port ${robokassaPort}`)
    })
    .on('error', err => {
      console.error(
        `[Robokassa] Failed to start webhook server: ${err.message}`
      )
    })
}
