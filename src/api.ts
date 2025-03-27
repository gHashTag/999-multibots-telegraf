import express from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { serve } from 'inngest/express'
import { inngest } from './core/inngest/clients'
import {
  neuroImageGeneration,
  generateModelTraining,
  modelTrainingV2,
  broadcastMessage,
  paymentProcessor,
} from './inngest-functions'
import { uploadZipFile } from './controllers/uploadZipFile'
import { UPLOAD_DIR } from './config'

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
  console.log('🚀 API запрос получен!') // Emoji в логах как запрошено
  res.json({
    message: 'Hello World API!',
    status: 'success',
    timestamp: new Date().toISOString(),
  })
})

// Проверка статуса сервера
app.get('/api/status', (req, res) => {
  console.log('🔍 Проверка статуса сервера') // Emoji в логах
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
  })
})

// Маршрут для загрузки zip файлов
app.post('/generate/upload-zip-file', uploadZipFile)

// Эндпоинт для Inngest
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
    ],
  })
)

// Обработка ошибки 404
app.use((req, res) => {
  console.log('⚠️ Маршрут не найден: ' + req.originalUrl) // Emoji в логах
  res.status(404).json({
    message: 'Route not found',
    status: 'error',
  })
})

// Запуск сервера API
const startApiServer = () => {
  const apiPort = process.env.API_PORT || 2999

  app.listen(apiPort, () => {
    console.log(`🌐 API сервер запущен на порту ${apiPort}`) // Emoji в логах
  })
}

export default startApiServer
