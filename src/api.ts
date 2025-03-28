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

// Middleware
app.use(cors())
// Увеличиваем лимит размера JSON запросов до 50 МБ
app.use(express.json({ limit: '50mb' }))
// Увеличиваем лимит для данных формы
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

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

// Эндпоинт для Inngest
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
  const apiPort = process.env.API_PORT || 2999

  app.listen(apiPort, () => {
    logger.info({
      message: `🌐 API сервер запущен на порту ${apiPort}`,
      description: `API server started on port ${apiPort}`,
    })
  })
}

export default startApiServer
