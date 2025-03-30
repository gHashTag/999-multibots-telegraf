import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { serve } from 'inngest/express'
import { inngest } from './core/inngest/clients'
import {
  neuroImageGeneration,
  generateModelTraining,
  modelTrainingV2,
  broadcastMessage,
  paymentProcessor,
  neuroPhotoV2Generation,
  textToImageFunction,
  createVoiceAvatarFunction,
  textToSpeechFunction,
  ruPaymentProcessPayment,
} from './inngest-functions'
import { uploadZipFile } from './controllers/uploadZipFile'
import { handleReplicateWebhook } from './controllers/replicateWebhook'
import { handleBFLWebhook } from './controllers/bflWebhook'
import {
  handleWebhookNeurophoto,
  handleWebhookNeurophotoDebug,
} from './controllers/neurophotoWebhook'
import { UPLOAD_DIR } from './config'
import { logger } from './utils/logger'

dotenv.config()

const app = express()

const port = 2999

// Middleware
app.use(cors())
// Увеличиваем лимит размера JSON запросов до 50 МБ
app.use(express.json({ limit: '50mb' }))
// Увеличиваем лимит для данных формы
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Добавляем парсинг raw body для веб-хуков
app.use('/payment-success', express.raw({ type: '*/*' }))

// Обслуживание статических файлов из директории загрузок
app.use('/uploads', express.static(UPLOAD_DIR))

// Маршруты API
app.get('/api', (req, res) => {
  logger.info({
    message: '🚀 API запрос получен!',
    description: 'API request received!',
  })
  res.json({
    message: 'Hello World API!',
    status: 'success',
    timestamp: new Date().toISOString(),
  })
})

// Проверка статуса сервера
app.get('/api/status', (req, res) => {
  logger.info({
    message: '🔍 Проверка статуса сервера',
    description: 'Server status check',
  })
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
  })
})

// Маршрут для загрузки zip файлов
app.post('/generate/upload-zip-file', uploadZipFile)

// Маршрут для обработки веб-хуков от Replicate
app.post('/webhooks/replicate', handleReplicateWebhook)

// Маршрут для обработки веб-хуков от BFL (Brain Force Labs)
app.post('/webhooks/bfl', handleBFLWebhook)

// Маршрут для обработки веб-хуков от сервиса нейрофото
app.post('/webhooks/neurophoto', handleWebhookNeurophoto)
app.post('/webhooks/neurophoto-debug', handleWebhookNeurophotoDebug)

// Маршрут для обработки веб-хуков от Robokassa
app.post('/payment-success', async (req, res) => {
  try {
    const { body } = req // Получаем тело запроса
    logger.info('Received body:', body)

    const { inv_id, IncSum } = body

    const roundedIncSum = Number(IncSum)
    console.log('💰 processPayment: округленная сумма', roundedIncSum)
    // Ответ Robokassa

    // Отправляем событие в Inngest для асинхронной обработки
    await inngest.send({
      name: 'ru-payment/process-payment',
      data: {
        IncSum: Math.round(Number(roundedIncSum)),
        inv_id,
      },
    })
    // Отвечаем OK, даже если была ошибка обработки
    // Robokassa будет повторять запросы, пока не получит OK
    return res.send('OK')
  } catch (error) {
    logger.error('❌ Ошибка обработки платежного веб-хука', {
      description: 'Error processing payment webhook',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // Всегда отвечаем OK, чтобы Robokassa не повторял запросы
    // Платеж будет обработан асинхронно через Inngest
    return res.send('OK')
  }
})

// Настраиваем Inngest middleware
app.use(
  '/api/inngest',
  serve({
    client: inngest,
    functions: [
      textToImageFunction,
      textToSpeechFunction,
      neuroImageGeneration,
      generateModelTraining,
      modelTrainingV2,
      broadcastMessage,
      paymentProcessor,
      neuroPhotoV2Generation,
      createVoiceAvatarFunction,
      ruPaymentProcessPayment,
    ],
  })
)

// Обработка ошибки 404
app.use((req, res) => {
  logger.warn({
    message: '⚠️ Маршрут не найден',
    description: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  })
  res.status(404).json({
    message: 'Route not found',
    status: 'error',
  })
})

// Запуск сервера API
const startApiServer = () => {
  app.listen(port, () => {
    logger.info('🚀 API сервер запущен', {
      description: 'API server is running',
      port,
    })
  })
}

export default startApiServer
