// Скрипт для отладки API сервера
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { logger } from './utils/logger'
import { SERVER_PORT } from './config'

dotenv.config()

const app = express()
const port = SERVER_PORT

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Базовый маршрут
app.get('/', (req, res) => {
  logger.info('🔍 Получен запрос к корневому эндпоинту')
  res.json({
    message: 'API сервер работает',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
  })
})

// Маршрут /api/status
app.get('/api/status', (req, res) => {
  logger.info('🔍 Проверка статуса сервера')
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Запуск сервера
app.listen(port, () => {
  console.log(`🚀 Отладочный API сервер запущен на порту ${port}`)
  console.log('📌 Доступные маршруты:')
  console.log('   - GET / - Корневой эндпоинт')
  console.log('   - GET /api/status - Проверка статуса')
})

// Обработка ошибок
process.on('uncaughtException', error => {
  console.error('❌ Необработанное исключение:', error)
})

process.on('unhandledRejection', (reason, _promise) => {
  console.error('❌ Необработанное отклонение Promise:', reason)
})
