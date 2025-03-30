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
app.post('/payment-success', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    // Получаем сырые данные
    const rawBody = req.body?.toString() || ''
    const contentType = req.headers['content-type'] || ''
    const query = req.query || {}

    logger.info({
      message: '🔍 Получен webhook от Robokassa',
      description: 'Received webhook from Robokassa',
      headers: req.headers,
      contentType,
      rawBody,
      query,
      method: req.method,
      url: req.url,
    })

    // Определяем интерфейс для данных от Robokassa
    interface RobokassaWebhookData {
      inv_id?: string
      IncSum?: string
      OutSum?: string
      out_summ?: string
      [key: string]: string | undefined
    }

    // Пытаемся распарсить тело запроса в зависимости от Content-Type
    let parsedBody: RobokassaWebhookData = {}

    try {
      if (contentType.includes('application/json')) {
        try {
          parsedBody = JSON.parse(rawBody)
          logger.info({
            message: '📦 Распарсили JSON',
            description: 'Parsed JSON body',
            parsedBody,
          })
        } catch (jsonError) {
          logger.error({
            message: '❌ Ошибка парсинга JSON',
            description: 'JSON parse error',
            error:
              jsonError instanceof Error ? jsonError.message : 'Unknown error',
            rawBody,
          })
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          parsedBody = Object.fromEntries(
            new URLSearchParams(rawBody)
          ) as RobokassaWebhookData
          logger.info({
            message: '📦 Распарсили form-urlencoded',
            description: 'Parsed form-urlencoded body',
            parsedBody,
          })
        } catch (formError) {
          logger.error({
            message: '❌ Ошибка парсинга form-urlencoded',
            description: 'Form-urlencoded parse error',
            error:
              formError instanceof Error ? formError.message : 'Unknown error',
            rawBody,
          })
        }
      } else {
        // Для всех остальных типов пробуем как form-urlencoded
        try {
          parsedBody = Object.fromEntries(
            new URLSearchParams(rawBody)
          ) as RobokassaWebhookData
          logger.info({
            message: '📦 Распарсили как form-urlencoded',
            description: 'Parsed as form-urlencoded',
            parsedBody,
          })
        } catch (defaultError) {
          logger.error({
            message: '❌ Ошибка парсинга unknown content-type',
            description: 'Unknown content-type parse error',
            error:
              defaultError instanceof Error
                ? defaultError.message
                : 'Unknown error',
            rawBody,
          })
        }
      }

      // Проверяем наличие данных в URL
      if (
        Object.keys(parsedBody).length === 0 &&
        Object.keys(query).length > 0
      ) {
        parsedBody = query as unknown as RobokassaWebhookData
        logger.info({
          message: '📦 Используем параметры из URL',
          description: 'Using URL parameters',
          parsedBody,
        })
      }

      // Проверяем результат парсинга
      if (Object.keys(parsedBody).length === 0) {
        throw new Error(
          'Не удалось получить данные ни из тела запроса, ни из URL'
        )
      }

      logger.info({
        message: '✅ Данные успешно получены',
        description: 'Data successfully retrieved',
        parsedBody,
      })
    } catch (parseError) {
      logger.error({
        message: '❌ Ошибка получения данных',
        description: 'Data retrieval error',
        error:
          parseError instanceof Error ? parseError.message : 'Unknown error',
        rawBody,
        contentType,
        query,
      })
      // Даже при ошибке парсинга отвечаем OK
      return res.send('OK')
    }

    // Извлекаем нужные поля
    const { inv_id, IncSum, OutSum, out_summ } = parsedBody

    // Проверяем наличие обязательных полей
    if (!inv_id) {
      logger.error({
        message: '❌ Отсутствует inv_id',
        description: 'Missing inv_id',
        parsedBody,
      })
      return res.send('OK')
    }

    // Robokassa может прислать сумму в разных полях
    const amount = IncSum || OutSum || out_summ
    if (!amount) {
      logger.error({
        message: '❌ Отсутствует сумма платежа',
        description: 'Missing payment amount',
        parsedBody,
      })
      return res.send('OK')
    }

    const roundedIncSum = Number(amount)
    if (isNaN(roundedIncSum)) {
      logger.error({
        message: '❌ Некорректная сумма платежа',
        description: 'Invalid payment amount',
        amount,
        parsedBody,
      })
      return res.send('OK')
    }

    logger.info({
      message: '💰 Данные платежа получены',
      description: 'Payment data received',
      inv_id,
      amount: roundedIncSum,
      originalAmount: amount,
    })

    // Отправляем событие в Inngest для асинхронной обработки
    await inngest.send({
      name: 'ru-payment/process-payment',
      data: {
        IncSum: Math.round(roundedIncSum),
        inv_id,
      },
    })

    logger.info({
      message: '✅ Событие платежа отправлено в Inngest',
      description: 'Payment event sent to Inngest',
      inv_id,
      amount: roundedIncSum,
    })

    // Отвечаем OK
    return res.send('OK')
  } catch (error) {
    logger.error({
      message: '❌ Ошибка обработки платежного веб-хука',
      description: 'Error processing payment webhook',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body?.toString(),
      headers: req.headers,
      query: req.query,
      method: req.method,
      url: req.url,
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
