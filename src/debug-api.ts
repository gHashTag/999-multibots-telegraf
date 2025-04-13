#!/usr/bin/env node
// Скрипт для отладки API сервера
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { logger } from './utils/logger'
import { startInngestConnect } from './inngest-connect'

// Регистрируем tsconfig paths для правильного разрешения импортов
require('tsconfig-paths/register')

const app = express()
const port = 2999

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
const server = app.listen(port, () => {
  console.log(`🚀 Отладочный API сервер запущен на порту ${port}`)
  console.log('📌 Доступные маршруты:')
  console.log('   - GET / - Корневой эндпоинт')
  console.log('   - GET /api/status - Проверка статуса')

  // Запускаем Inngest Connect после запуска сервера
  startInngestConnect()
    .then(() => {
      console.log('🔌 Inngest Connect успешно запущен')
    })
    .catch(error => {
      console.error('❌ Ошибка при запуске Inngest Connect:', error)
    })
})

// Обработка ошибок
process.on('uncaughtException', error => {
  console.error('❌ Необработанное исключение:', error)
})

process.on('unhandledRejection', reason => {
  console.error('❌ Необработанное отклонение Promise:', reason)
})

// Корректное завершение работы приложения
process.on('SIGTERM', () => {
  logger.info('👋 Получен сигнал SIGTERM, закрываем сервер...')
  server.close(() => {
    logger.info('✅ Сервер успешно закрыт')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('👋 Получен сигнал SIGINT, закрываем сервер...')
  server.close(() => {
    logger.info('✅ Сервер успешно закрыт')
    process.exit(0)
  })
})
