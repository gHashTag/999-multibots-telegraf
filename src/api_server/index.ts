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

  // Временно используем as any для всей строки, чтобы разблокировать
  app.use(expressJson({ limit: '10mb' }) as any)

  // Простой middleware для логгирования запросов (опционально)
  app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    // Временно возвращаем as any для разблокировки
    console.log(
      `[API Server] Received request: ${(req as any).method} ${(req as any).url}`
    )
    next()
  })

  // Регистрируем Inngest эндпоинт
  // Обычно рекомендуется путь /api/inngest
  app.use(
    '/api/inngest',
    serve({ client: inngest, functions: inngestFunctions })
  )

  // Подключаем роуты
  // Все роуты из health.routes.ts будут доступны по их внутренним путям
  app.use('/', healthRouter)
  // В будущем: app.use('/api/users', usersRouter);

  app
    .listen(PORT, () => {
      console.log(
        `[API Server] Successfully started and listening on port ${PORT}`
      )
    })
    .on('error', (error: NodeJS.ErrnoException) => {
      // Уточнили тип ошибки
      console.error(
        `[API Server] Failed to start server on port ${PORT}:`,
        error
      )
      // Можно добавить process.exit(1) если сервер не может запуститься
    })
}

// Если этот файл будет запускаться напрямую (например, для тестов или отдельного инстанса)
// if (require.main === module) {
//   startApiServer();
// }
