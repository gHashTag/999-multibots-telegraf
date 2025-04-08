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
import { logger } from './utils/logger'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

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
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    // Создаем директорию для загрузок, если она не существует
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    }
    cb(null, UPLOAD_DIR)
  },
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
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

// Обработка загрузки файлов
app.post(
  '/uploads',
  upload.single('file'),
  (req: Request, res: Response): void => {
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
        res.status(400).json({
          message: 'No file uploaded',
          status: 'error',
        })
        return
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
app.get('/api', (_req: Request, res: Response): void => {
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
app.get('/api/status', (_req: Request, res: Response): void => {
  logger.info('🔍 Проверка статуса сервера', {
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
  async (req: Request, res: Response): Promise<void> => {
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
        res.send('OK')
        return
      }

      const contentType = req.headers['content-type'] || ''
      const query = req.query || {}

      logger.info({
        message: '🔍 Получен webhook от Robokassa',
        description: 'Received webhook from Robokassa',
        headers: req.headers,
        contentType,
        rawBody,
        query,
      })

      res.send('OK')
    } catch (error: unknown) {
      logger.error('❌ Ошибка при обработке webhook от Robokassa', {
        description: 'Error processing Robokassa webhook',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      res.status(500).send('Error')
    }
  }
)

// Serve Inngest functions
app.use(
  '/api/inngest',
  serve({
    client: inngest,
    functions: [
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

export function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      logger.info('🚀 Запуск API сервера...', {
        description: 'Starting API server',
        port,
      })

      const server = app.listen(port, () => {
        logger.info('✅ API сервер успешно запущен', {
          description: 'API server started successfully',
          port,
          url: `http://localhost:${port}`,
        })
        resolve()
      })

      server.on('error', error => {
        logger.error('❌ Ошибка при запуске API сервера', {
          description: 'API server error',
          error: error instanceof Error ? error.message : 'Unknown error',
          port,
        })
        reject(error)
      })

      // Обработка сигналов завершения
      process.on('SIGTERM', () => {
        logger.info('🛑 Получен сигнал SIGTERM', {
          description: 'SIGTERM signal received',
        })
        server.close(() => {
          logger.info('👋 API сервер успешно остановлен', {
            description: 'API server stopped successfully',
          })
          process.exit(0)
        })
      })
    } catch (error) {
      logger.error('❌ Критическая ошибка при запуске API сервера', {
        description: 'Critical API server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      reject(error)
    }
  })
}

export default app
