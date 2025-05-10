import express, {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
  Application,
  RequestHandler,
  json as expressJson,
} from 'express'
import healthRouter from './routes/health.routes' // Предполагаем, что этот файл будет создан
import { serve } from 'inngest/express'
import { inngest, functions as inngestFunctions } from '../inngest_app/client'

// Определяем порт. Берем из process.env.PORT, если есть, иначе 2999.
const PORT = process.env.PORT || '2999'

export function startApiServer(): void {
  const app: Application = express()

  // Middleware для парсинга JSON с установленным лимитом в 10MB
  app.use(expressJson({ limit: '10mb' }) as any)

  // Простой middleware для логгирования запросов (опционально)
  app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    console.log(`[API Server] Received request: ${req.method} ${req.url}`)
    next()
  })

  // Регистрируем Inngest эндпоинт
  // По документации Inngest, хороший путь - /api/inngest
  app.use(
    '/api/inngest',
    serve(
      inngest, // Первый аргумент - клиент inngest
      inngestFunctions, // Второй аргумент - массив функций
      {
        // Третий аргумент - опции (если нужны)
        signingKey: process.env.INNGEST_SIGNING_KEY || undefined,
      }
    )
  )

  // Подключаем роуты для проверки здоровья
  app.use('/', healthRouter)

  app
    .listen(PORT, () => {
      console.log(
        `[API Server] Successfully started and listening on port ${PORT}`
      )
    })
    .on('error', (error: NodeJS.ErrnoException) => {
      console.error(
        `[API Server] Failed to start server on port ${PORT}:`,
        error
      )
    })
}

// Если этот файл будет запускаться напрямую (например, для тестов или отдельного инстанса)
// if (require.main === module) {
//   startApiServer();
// }
