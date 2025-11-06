/**
 * All Inngest Functions Server
 * 🕉️ Интеграция согласно ТЗ: ЕДИНЫЙ Inngest Dev Server на порту 8288
 *
 * Регистрирует ВСЕ Inngest функции из ./functions/
 * Express сервер на порту 3000 с интеграцией через serve()
 *
 * Запуск: npx tsx src/inngest_app/all-functions-app.ts
 */

import express from 'express'
import { serve } from 'inngest/express'
import { inngest } from './client'

// Импортируем ВСЕ функции из functions/index.ts
import * as allFunctions from './functions/index'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware для JSON
app.use(express.json())

// Health check endpoint
app.get('/health', (_req, res) => {
  const stats = allFunctions.getFunctionStats()

  res.json({
    status: 'ok',
    service: 'inngest-all-functions',
    timestamp: new Date().toISOString(),
    functions: stats
  })
})

// ✅ Inngest endpoint согласно ТЗ
// Собираем все функции в массив
const functionsList = allFunctions.getAllFunctions()

app.use(
  '/api/inngest',
  serve({
    client: inngest,
    functions: functionsList
  })
)

// Тестовый эндпоинт для запуска функций согласно ТЗ
app.post('/api/test-inngest', async (req, res) => {
  try {
    const result = await inngest.send({
      name: 'test/hello.world',
      data: {
        test: true,
        message: 'Test from API',
        timestamp: new Date().toISOString(),
        ...req.body
      },
    })

    res.json({
      status: 'success',
      message: 'Event sent to Inngest',
      eventId: result,
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to send event',
      error: String(error),
    })
  }
})

// Запуск сервера
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 Inngest All Functions Server Started')
  console.log('🕉️ Интеграция согласно ТЗ')
  console.log('='.repeat(60))
  console.log(`📍 Server: http://localhost:${PORT}`)
  console.log(`📍 Inngest: http://localhost:${PORT}/api/inngest`)
  console.log(`📍 Health: http://localhost:${PORT}/health`)
  console.log(`📍 Test: POST http://localhost:${PORT}/api/test-inngest`)
  console.log('='.repeat(60))
  console.log(`📊 Functions Loaded: ${functionsList.length}`)
  console.log('='.repeat(60))

  // Вывод списка всех функций по категориям
  const stats = allFunctions.getFunctionStats()
  console.log('\n📋 Functions by Category:')
  Object.entries(stats.by_category).forEach(([category, count]) => {
    console.log(`   - ${category}: ${count}`)
  })

  console.log('\n📋 All Functions:')
  functionsList.forEach((fn, index) => {
    const fnId = typeof fn.id === 'function' ? fn.id() : fn.id
    const fnName = fn.name || fnId || 'unknown'
    console.log(`   ${(index + 1).toString().padStart(2, '0')}. ${fnName}`)
  })

  console.log('\n' + '='.repeat(60))
  console.log('✅ Ready to receive events!')
  console.log('🎛️  Inngest Dev Server: http://localhost:8288')
  console.log('='.repeat(60) + '\n')
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...')
  process.exit(0)
})
