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
    logger.info({
      message: '🔍 Получен webhook от Robokassa',
      description: 'Received webhook from Robokassa',
      headers: req.headers,
      contentType: req.headers['content-type'],
      body: req.body?.toString(),
    })

    // Пытаемся распарсить тело запроса в зависимости от Content-Type
    let parsedBody
    const contentType = req.headers['content-type'] || ''
    const rawBody = req.body?.toString() || ''

    try {
      if (contentType.includes('application/json')) {
        parsedBody = JSON.parse(rawBody)
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        parsedBody = Object.fromEntries(new URLSearchParams(rawBody))
      } else {
        // Для всех остальных типов пробуем как form-urlencoded
        parsedBody = Object.fromEntries(new URLSearchParams(rawBody))
      }

      logger.info({
        message: '✅ Тело запроса успешно распарсено',
        description: 'Request body parsed successfully',
        parsedBody,
      })
    } catch (parseError) {
      logger.error({
        message: '❌ Ошибка парсинга тела запроса',
        description: 'Error parsing request body',
        error:
          parseError instanceof Error ? parseError.message : 'Unknown error',
        rawBody,
        contentType,
      })
      // Даже при ошибке парсинга пытаемся извлечь параметры из URL
      parsedBody = Object.fromEntries(
        new URLSearchParams(req.url.split('?')[1] || '')
      )
    }

    const { inv_id, IncSum, OutSum, out_summ } = parsedBody

    // Robokassa может прислать сумму в разных полях
    const amount = IncSum || OutSum || out_summ
    const roundedIncSum = Number(amount)

    logger.info({
      message: '💰 Данные платежа получены',
      description: 'Payment data received',
      inv_id,
      amount: roundedIncSum,
    })

    // Отправляем событие в Inngest для асинхронной обработки
    await inngest.send({
      name: 'ru-payment/process-payment',
      data: {
        IncSum: Math.round(Number(roundedIncSum)),
        inv_id,
      },
    })

    logger.info({
      message: '✅ Событие платежа отправлено в Inngest',
      description: 'Payment event sent to Inngest',
      inv_id,
      amount: roundedIncSum,
    })

    // Отвечаем OK, даже если была ошибка обработки
    return res.send('OK')
  } catch (error) {
    logger.error({
      message: '❌ Ошибка обработки платежного веб-хука',
      description: 'Error processing payment webhook',
      error: error instanceof Error ? error.message : 'Unknown error',
      body: req.body?.toString(),
      headers: req.headers,
    })

    // Всегда отвечаем OK, чтобы Robokassa не повторял запросы
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
