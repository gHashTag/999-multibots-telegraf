import express from 'express'
import healthRouter from './routes/health.routes'
import robokassaRouter from './routes/robokassa.routes'
import githubAutoFixerRouter from './routes/github-autofixer.routes'
import kieAiWebhookRouter from './routes/kie-ai-webhook.routes'
import aiReelsCallbackRouter from './routes/ai-reels-callback.routes'
import replicateWebhookRouter from './routes/replicate-webhook.routes'
import { serve } from 'inngest/express'
import { inngest, functions as inngestFunctions } from '../inngest_app/client'

// Определяем порт. Берем из process.env.PORT, если есть, иначе 4000 (совместимо с reverse proxy).
const PORT = process.env.PORT || '4000'

export function startApiServer(): void {
  const app: any = express()

  // ✅ Безопасная конфигурация trust proxy для nginx
  // Доверяем только первому прокси (nginx), а не всем
  app.set('trust proxy', 1)

  // ✅ РЕШЕНИЕ ПРОБЛЕМЫ ТАЙМАУТОВ: Увеличиваем таймауты для долгих операций
  app.use((req: any, res: any, next: any) => {
    // Увеличиваем таймаут до 10 минут для всех запросов
    req.setTimeout(600000) // 10 минут
    res.setTimeout(600000) // 10 минут
    next()
  })

  import { logger } from '@/utils/logger';
  
  // ... (other imports)
  
  // ... (app setup)
  
  // Middleware для парсинга JSON с установленным лимитом в 10MB
  app.use(express.json({ limit: '10mb' }) as any)
  
  // Раздача статических файлов из temp/ директории для морфинга
  app.use('/temp', express.static('temp') as any)
  
  // Улучшенный middleware для логгирования запросов с использованием logger
  app.use((req: any, res: any, next: any) => {
    logger.info(`[API] Request received`, {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : '{}'
    });
    next();
  });
  
  // Регистрируем маршруты для проверки работоспособности
  app.use('/', healthRouter)
  
  // Регистрируем маршруты для Robokassa webhook
  app.use('/api', robokassaRouter)

  // Регистрируем маршруты для GitHub AutoFixer
  app.use('/api', githubAutoFixerRouter)

  // Регистрируем маршруты для Kie.ai webhook
  app.use('/api', kieAiWebhookRouter)

  // Регистрируем маршруты для AI Reels callback от Railway
  app.use('/api', aiReelsCallbackRouter)

  // Регистрируем маршруты для Replicate webhook (уведомления о тренировке моделей)
  app.use('/api/webhooks', replicateWebhookRouter)

  // Интеграция Inngest с API (актуальная сигнатура serve)
  const inngestHandler = serve(inngest as any, inngestFunctions as any) as any
  app.use('/api/inngest', inngestHandler)

  // Запуск основного сервера
  app.listen(PORT, () => {
    console.log(`[API] Server started on port ${PORT}`)
  })

  // Удаляем дополнительный сервер на 8080: используем только один порт для reverse proxy
  // const PROXY_PORT = process.env.PROXY_PORT || '8080'
  // app.listen(PROXY_PORT, () => {
  //   console.log(`[API] Proxy server started on port ${PROXY_PORT}`)
  // })
}

// Если этот файл будет запускаться напрямую (например, для тестов или отдельного инстанса)
// if (require.main === module) {
//   startApiServer();
// }

// Экспортируем функцию для внешнего использования (например, в index.ts)
export default startApiServer
