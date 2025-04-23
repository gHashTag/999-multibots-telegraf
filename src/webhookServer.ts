import express from 'express'
import dotenv from 'dotenv'
import { handleRobokassaResult } from './webhooks/robokassa/robokassa.handler'
import fileUpload from 'express-fileupload'

dotenv.config() // Загружаем переменные окружения

// Функция для запуска сервера
export function startWebhookServer() {
  // Порт для Robokassa webhook
  const robokassaPort = process.env.ROBOKASSA_WEBHOOK_PORT || 2999

  // Создаем экземпляр express
  const app = express()

  // Middleware для разбора URL-encoded формы
  // Robokassa обычно отправляет данные в этом формате
  app.use(express.urlencoded({ extended: true }))

  // Middleware для разбора JSON данных (на всякий случай)
  app.use(express.json())

  // Middleware для обработки multipart/form-data (маловероятно для Robokassa, но оставим)
  // app.use(fileUpload()) // Можно пока закомментировать, если не нужно

  // POST маршрут для обработки результатов от Robokassa
  // Важно: убедись, что этот путь совпадает с Result URL в настройках Robokassa
  app.post('/robokassa-result', handleRobokassaResult)

  // Проверка работоспособности сервера
  app.get('/health', (req, res) => {
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
