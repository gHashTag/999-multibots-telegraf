import express from 'express'
import dotenv from 'dotenv'
// import { handleRobokassaResult } from './webhooks/robokassa/robokassa.handler'
import fileUpload from 'express-fileupload'

dotenv.config()

// Порт для Robokassa webhook
const robokassaPort = process.env.ROBOKASSA_WEBHOOK_PORT || 2999

// Создаем экземпляр express
const app = express()

// Middleware для разбора URL-encoded формы
app.use(express.urlencoded({ extended: true }))

// Middleware для разбора JSON данных
app.use(express.json())

// Middleware для обработки multipart/form-data
app.use(fileUpload())

// POST маршрут для обработки успешных платежей от Robokassa
// app.post('/payment-success', handleRobokassaResult)

// // POST маршрут для обработки результатов от Robokassa
// app.post('/robokassa-result', handleRobokassaResult)

// Проверка работоспособности сервера
app.get('/health', (req, res) => {
  res.status(200).send('OK')
})

// Запуск сервера
app
  .listen(robokassaPort, () => {
    console.log(`[Robokassa] Webhook server running on port ${robokassaPort}`)
  })
  .on('error', err => {
    console.error(`[Robokassa] Failed to start webhook server: ${err.message}`)
  })
