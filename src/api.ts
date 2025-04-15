import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { serve } from 'inngest/express'
import { inngest } from './inngest-functions/clients'
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
  imageToPromptFunction,
  voiceToTextProcessor,
} from './inngest-functions'
import { uploadZipFile } from './controllers/uploadZipFile'
import { handleReplicateWebhook } from './controllers/replicateWebhook'
import { handleBFLWebhook } from './controllers/bflWebhook'
import {
  handleWebhookNeurophoto,
  handleWebhookNeurophotoDebug,
} from './controllers/neurophotoWebhook'
import { UPLOAD_DIR } from './config'
import { logger } from '@/utils/logger'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { ParamsDictionary } from 'express-serve-static-core'
import { ParsedQs } from 'qs'

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

// Создаем директорию для загрузок, если она не существует
if (!fs.existsSync(UPLOAD_DIR)) {
  logger.info('📁 Создание директории для загрузок', {
    description: 'Creating uploads directory',
    path: UPLOAD_DIR,
  })
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Создаем директорию для загрузок, если она не существует
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    }
    cb(null, UPLOAD_DIR)
  },
  filename: function (req, file, cb) {
    // Сохраняем оригинальное имя файла
    cb(null, file.originalname)
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB лимит
  },
})

// Определяем расширенные типы для Express
interface MulterRequest extends Request {
  file?: Express.Multer.File
}

interface RawBodyRequest extends Request<ParamsDictionary, any, any, ParsedQs> {
  body: Buffer | string | any
  method: string
  url: string
  originalUrl: string
  headers: any
  query: ParsedQs
}

interface CustomRequest extends Request {
  originalUrl: string
  method: string
  body: {
    amount: number
  }
}

interface CustomResponse extends Response {
  status(code: number): this
  json(body: any): this
  send(body: any): this
}

// Обработка загрузки файлов
app.post(
  '/uploads',
  upload.single('file'),
  (req: MulterRequest, res: CustomResponse) => {
    try {
      logger.info('📤 Получен файл для загрузки', {
        description: 'File upload received',
        filename: req.file?.originalname,
        size: req.file?.size,
      })

      if (!req.file) {
        logger.error('❌ Файл не найден в запросе', {
          description: 'No file in request',
        })
        return res.status(400).json({
          message: 'No file uploaded',
          status: 'error',
        })
      }

      // Формируем URL для доступа к файлу
      const fileUrl = `/uploads/${req.file.filename}`

      logger.info('✅ Файл успешно загружен', {
        description: 'File uploaded successfully',
        filename: req.file.originalname,
        path: fileUrl,
        fullPath: path.join(UPLOAD_DIR, req.file.filename),
      })

      res.json({
        message: 'File uploaded successfully',
        status: 'success',
        url: fileUrl,
        path: req.file.path,
      })
    } catch (error) {
      logger.error('❌ Ошибка при загрузке файла', {
        description: 'File upload error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      res.status(500).json({
        message: 'Error uploading file',
        status: 'error',
      })
    }
  }
)

// Обслуживание статических файлов из директории загрузок
app.use('/uploads', express.static(UPLOAD_DIR))

// Маршруты API
app.get('/api', (req: CustomRequest, res: CustomResponse) => {
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
app.get('/api/status', (req: CustomRequest, res: CustomResponse) => {
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
app.post(
  '/payment-success',
  express.raw({ type: '*/*' }),
  async (req: RawBodyRequest, res: CustomResponse) => {
    try {
      // Получаем сырые данные
      const rawBody =
        req.body instanceof Buffer
          ? req.body.toString('utf8')
          : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body)

      // Проверяем, не является ли тело JWT токеном
      if (rawBody.startsWith('eyJ')) {
        logger.info({
          message: '🔄 Пропускаем JWT токен',
          description: 'Skipping JWT token',
          bodyType: typeof req.body,
          isBuffer: req.body instanceof Buffer,
          method: req.method,
          url: req.url,
        })
        return res.send('OK')
      }

      const contentType = req.headers['content-type'] || ''
      const query = req.query || {}

      logger.info({
        message: '🔍 Получен webhook от Robokassa',
        description: 'Received webhook from Robokassa',
        headers: req.headers,
        contentType,
        rawBody,
        bodyType: typeof req.body,
        isBuffer: req.body instanceof Buffer,
        query,
        method: req.method,
        url: req.url,
      })

      // Определяем интерфейс для данных от Robokassa
      interface RobokassaWebhookData {
        inv_id?: string
        InvId?: string
        IncSum?: string
        OutSum?: string
        out_summ?: string
        SignatureValue?: string
        crc?: string
        PaymentMethod?: string
        IncCurrLabel?: string
        EMail?: string
        Fee?: string
        [key: string]: string | undefined
      }

      // Пытаемся распарсить тело запроса
      let parsedBody: RobokassaWebhookData = {}

      try {
        // Проверяем формат данных
        if (rawBody.startsWith('{')) {
          // Это JSON
          parsedBody = JSON.parse(rawBody)
          logger.info({
            message: '📦 Распарсили JSON',
            description: 'Parsed JSON data',
            parsedBody,
          })
        } else if (rawBody.includes('=')) {
          // Это form-urlencoded
          parsedBody = Object.fromEntries(
            new URLSearchParams(rawBody)
          ) as RobokassaWebhookData
          logger.info({
            message: '📦 Распарсили form-urlencoded',
            description: 'Parsed form-urlencoded data',
            parsedBody,
          })
        } else {
          throw new Error('Неподдерживаемый формат данных')
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
        // Проверяем, не является ли ошибка связана с JWT токеном
        if (rawBody.startsWith('eyJ')) {
          logger.info({
            message: '🔄 Пропускаем JWT токен после ошибки парсинга',
            description: 'Skipping JWT token after parse error',
            bodyType: typeof req.body,
            isBuffer: req.body instanceof Buffer,
          })
          return res.send('OK')
        }

        logger.error({
          message: '❌ Ошибка получения данных',
          description: 'Data retrieval error',
          error:
            parseError instanceof Error ? parseError.message : 'Unknown error',
          rawBody,
          contentType,
          query,
          bodyType: typeof req.body,
          isBuffer: req.body instanceof Buffer,
        })
        // Даже при ошибке парсинга отвечаем OK
        return res.send('OK')
      }

      // Извлекаем нужные поля
      const { inv_id, InvId, IncSum, OutSum, out_summ } = parsedBody

      // Проверяем наличие обязательных полей
      const invoiceId = inv_id || InvId
      if (!invoiceId) {
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
        invoiceId,
        amount: roundedIncSum,
        originalAmount: amount,
      })

      // Отправляем событие в Inngest для асинхронной обработки
      await inngest.send({
        id: `ru-payment-processing-${invoiceId}`,
        name: 'ru-payment/process-payment',
        data: {
          IncSum: Math.round(roundedIncSum),
          inv_id: invoiceId,
        },
      })

      logger.info({
        message: '✅ Событие платежа отправлено в Inngest',
        description: 'Payment event sent to Inngest',
        invoiceId,
        amount: roundedIncSum,
      })

      // Отвечаем OK
      return res.send('OK')
    } catch (error) {
      // Проверяем, не является ли ошибка связана с JWT токеном
      const rawBody =
        req.body instanceof Buffer ? req.body.toString('utf8') : req.body
      if (typeof rawBody === 'string' && rawBody.startsWith('eyJ')) {
        logger.info({
          message: '🔄 Пропускаем JWT токен из-за ошибки',
          description: 'Skipping JWT token due to error',
          bodyType: typeof req.body,
          isBuffer: req.body instanceof Buffer,
        })
        return res.send('OK')
      }

      logger.error({
        message: '❌ Ошибка обработки платежного веб-хука',
        description: 'Error processing payment webhook',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body instanceof Buffer ? req.body.toString('utf8') : req.body,
        bodyType: typeof req.body,
        isBuffer: req.body instanceof Buffer,
        headers: req.headers,
        query: req.query,
        method: req.method,
        url: req.url,
      })

      // Всегда отвечаем OK, чтобы Robokassa не повторял запросы
      return res.send('OK')
    }
  }
)

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
      imageToPromptFunction,
      voiceToTextProcessor,
    ],
  })
)

// Тестовый маршрут для Robokassa
app.post(
  '/api/robokassa/test-url',
  async (req: CustomRequest, res: CustomResponse) => {
    try {
      const { amount } = req.body

      if (!amount || typeof amount !== 'number') {
        logger.error('❌ Некорректная сумма в запросе', {
          description: 'Invalid amount in request',
          amount,
        })
        return res.status(400).json({
          status: 'error',
          message: 'Amount is required and must be a number',
        })
      }

      const {
        getInvoiceId,
        merchantLogin,
        password1,
        description,
        useTestMode,
      } = require('./scenes/getRuBillWizard/helper')

      if (!merchantLogin || !password1) {
        throw new Error('merchantLogin or password1 is not defined')
      }

      // Генерируем короткий InvId
      const invId = Math.floor(Math.random() * 1000000) + 1

      logger.info('🔢 Генерация тестового платежа:', {
        description: 'Generating test payment',
        amount,
        invId,
      })

      const url = await getInvoiceId(
        merchantLogin,
        amount,
        invId,
        description,
        password1,
        useTestMode
      )

      logger.info('✅ URL для тестового платежа сгенерирован:', {
        description: 'Test payment URL generated',
        url,
      })

      return res.json({
        status: 'success',
        url,
      })
    } catch (error) {
      logger.error('❌ Ошибка при генерации тестового URL:', {
        description: 'Error generating test URL',
        error: error instanceof Error ? error.message : String(error),
      })

      return res.status(500).json({
        status: 'error',
        message: 'Failed to generate test URL',
      })
    }
  }
)

// Обработка ошибки 404
app.use((req: CustomRequest, res: CustomResponse) => {
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
