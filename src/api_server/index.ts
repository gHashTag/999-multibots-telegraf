import express from 'express'
import healthRouter from './routes/health.routes'
import robokassaRouter from './routes/robokassa.routes'
import githubAutoFixerRouter from './routes/github-autofixer.routes'
import kieAiWebhookRouter, { setBotInstance } from './routes/kie-ai-webhook.routes'
import aiReelsCallbackRouter from './routes/ai-reels-callback.routes'
import replicateWebhookRouter from './routes/replicate-webhook.routes'
import voiceAvatarRouter from './routes/voice-avatar.routes'
import neuroPhotoRouter from './routes/neuro-photo.routes'
import competitorRouter from './routes/competitor.routes'
import diagnosticRouter from './routes/diagnostic.routes'
import { Telegraf } from 'telegraf'
import { serve } from 'inngest/express'
import { inngest } from '../inngest_app/client'
import { allInngestFunctions } from '../inngest_app/registerFunctions'
import { logger } from '@/utils/logger'

// Определяем порт. Берем из process.env.API_PORT, если есть, иначе 8080 (свободный порт).
const PORT = process.env.API_PORT || '8080'

export function startApiServer(bot?: Telegraf): void {
  // Если bot instance передан, инициализируем его в webhook router
  if (bot) {
    setBotInstance(bot)
    logger.info('✅ [API SERVER] Bot instance initialized for webhooks')
  } else {
    logger.warn('⚠️ [API SERVER] Bot instance not provided - webhooks may not work')
  }
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

  // Регистрируем локальные routes для изоляции от внешнего сервера
  app.use('/api', voiceAvatarRouter)
  app.use('/api', neuroPhotoRouter)
  app.use('/api', competitorRouter)

  // Регистрируем диагностические роуты
  app.use('/api', diagnosticRouter)

  // ✅ Интеграция Inngest с API (актуальная сигнатура serve из reels-callback-2)
  const inngestHandler = serve(inngest as any, allInngestFunctions as any) as any
  app.use('/api/inngest', inngestHandler)

  // Запуск основного сервера на всех интерфейсах (0.0.0.0) для Docker
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] Server started on port ${PORT} (listening on 0.0.0.0)`)
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
