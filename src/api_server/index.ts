import express from 'express'
import healthRouter from './routes/health.routes' // Предполагаем, что этот файл будет создан
import webhookRouter from './routes/webhook.routes' // <-- Добавляем импорт нового роутера
import { serve } from 'inngest/express'
import { inngest, functions as inngestFunctions } from '../inngest_app/client'

// Определяем порт. Берем из process.env.PORT, если есть, иначе 2999.
const PORT = process.env.PORT || '2999'

export function startApiServer(): void {
  const app: any = express()

  // Middleware для парсинга JSON с установленным лимитом в 10MB
  app.use(express.json({ limit: '10mb' }) as any)

  // Простой middleware для логгирования запросов
  app.use((req: any, res: any, next: any) => {
    console.log(`[API] ${new Date().toISOString()} | ${req.method} ${req.url}`)
    next()
  })

  // Регистрируем маршруты для проверки работоспособности
  app.use('/', healthRouter)

  // 👇 Регистрируем новый роутер для вебхуков
  app.use('/api', webhookRouter) // Все маршруты из webhookRouter будут доступны по /api/replicate-webhook

  // Интеграция Inngest с API для версии 2.7.2
  // Используем type assertion, чтобы избежать ошибок типизации
  const inngestHandler = serve(inngest as any, inngestFunctions as any) as any
  app.use('/api/inngest', inngestHandler)

  // Маршрут hello world для тестирования
  app.get('/api/hello', (req: any, res: any) => {
    res.status(200).json({
      message: 'Hello from API Server!',
      timestamp: new Date().toISOString(),
    })
  })

  // Маршрут для тестирования Inngest функции hello world
  app.post('/api/test-inngest', async (req: any, res: any) => {
    try {
      // Отправляем тестовое событие в Inngest
      const result = await inngest.send({
        name: 'test/hello.world', // Имя события, на которое слушает наша функция
        data: {
          test: true,
          message: 'Test event from API',
          timestamp: new Date().toISOString(),
        },
      })

      res.status(200).json({
        status: 'success',
        message: 'Inngest test event sent successfully',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('Error sending Inngest event:', error)
      res.status(500).json({
        status: 'error',
        message: 'Failed to send Inngest test event',
        error: String(error),
        timestamp: new Date().toISOString(),
      })
    }
  })

  // Обработка 404
  app.use((req: any, res: any) => {
    res.status(404).json({
      status: 'error',
      message: 'Route not found',
      path: req.url,
    })
  })

  // Запускаем сервер на указанном порту
  app.listen(PORT, () => {
    console.log(`[API] Server started on port ${PORT}`)
  })
}

// Если этот файл будет запускаться напрямую (например, для тестов или отдельного инстанса)
// if (require.main === module) {
//   startApiServer();
// }

// Экспортируем функцию для внешнего использования (например, в index.ts)
export default startApiServer
