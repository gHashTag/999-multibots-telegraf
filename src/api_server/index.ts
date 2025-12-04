import express from 'express'
import healthRouter from './routes/health.routes'
import robokassaRouter from './routes/robokassa.routes'
import githubAutoFixerRouter from './routes/github-autofixer.routes'
import kieAiWebhookRouter, {
  setBotInstance,
} from './routes/kie-ai-webhook.routes'
import aiReelsCallbackRouter from './routes/ai-reels-callback.routes'
import replicateWebhookRouter from './routes/replicate-webhook.routes'
import voiceAvatarRouter from './routes/voice-avatar.routes'
import neuroPhotoRouter from './routes/neuro-photo.routes'
import competitorRouter from './routes/competitor.routes'
import diagnosticRouter from './routes/diagnostic.routes'
import { Telegraf } from 'telegraf'
// ✅ Inngest включен для мониторинга webhook'ов
import { serve } from 'inngest/express'
import { inngest } from '../inngest_app/client'
// ✅ LAZY: Импортируем фабричную функцию, а не готовые функции
import { createAllInngestFunctions } from '../inngest_app/registerFunctions'
import { logger } from '@/utils/logger'

// Определяем порт. Берем из process.env.API_PORT, если есть, иначе 3000 (настроено в docker-compose.yml).
// LAST FIX: 2025-11-25 - изменен с 2999 на 3000 согласно WEBHOOK_502_BAD_GATEWAY_FIX
const PORT = process.env.API_PORT || '3000'

export async function startApiServer(bot?: Telegraf): Promise<void> {
  // Если bot instance передан, инициализируем его в webhook router
  if (bot) {
    setBotInstance(bot)
    logger.info('✅ [API SERVER] Bot instance initialized for webhooks')
  } else {
    logger.warn(
      '⚠️ [API SERVER] Bot instance not provided - webhooks may not work'
    )
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
      body: req.body
        ? JSON.stringify(req.body).substring(0, 200) + '...'
        : '{}',
    })
    next()
  })

  // Регистрируем маршруты для проверки работоспособности
  app.use('/', healthRouter)

  // Регистрируем маршруты для Robokassa webhook
  app.use('/api', robokassaRouter)

  // Регистрируем маршруты для GitHub AutoFixer
  app.use('/api', githubAutoFixerRouter)

  // Регистрируем маршруты для Kie.ai webhook
  app.use('/api', kieAiWebhookRouter)

  // Регистрируем маршруты для AI Reels callback от Render Server
  app.use('/api', aiReelsCallbackRouter)

  // Регистрируем маршруты для Replicate webhook (уведомления о тренировке моделей)
  app.use('/api/webhooks', replicateWebhookRouter)

  // Регистрируем локальные routes для изоляции от внешнего сервера
  app.use('/api', voiceAvatarRouter)
  app.use('/api', neuroPhotoRouter)
  app.use('/api', competitorRouter)

  // Регистрируем диагностические роуты
  app.use('/api', diagnosticRouter)

  // ✅ Inngest включен для мониторинга webhook'ов - LAZY VERSION
  // Создаем функции ПОСЛЕ загрузки секретов из Infisical
  try {
    logger.info(
      '[API SERVER] Creating Inngest functions (after secrets loaded)...'
    )

    const allInngestFunctions = createAllInngestFunctions()

    logger.info('[API SERVER] Debug: allInngestFunctions', {
      type: typeof allInngestFunctions,
      isArray: Array.isArray(allInngestFunctions),
      length: allInngestFunctions?.length,
      functions: allInngestFunctions?.map((f: any) => ({
        id: f?.opts?.id,
        name: f?.opts?.name,
        hasId: !!f?.opts?.id,
        hasName: !!f?.opts?.name,
        type: typeof f,
        isNull: f === null,
        isUndefined: f === undefined,
      })),
    })

    if (
      allInngestFunctions &&
      Array.isArray(allInngestFunctions) &&
      allInngestFunctions.length > 0
    ) {
      logger.info('[API SERVER] Registering Inngest functions', {
        count: allInngestFunctions.length,
        functions: allInngestFunctions.map(
          (f: any) => f?.opts?.id || f?.opts?.name || 'unnamed'
        ),
        detailed: allInngestFunctions.map((f: any) => ({
          id: f?.opts?.id,
          name: f?.opts?.name,
          type: typeof f,
          isNull: f === null,
          isUndefined: f === undefined,
        })),
      })

      // ✅ Применена рабочая сигнатура serve() - ВЕРСИЯ ОТ 7 НОЯБРЯ
      const signingKey = process.env.INNGEST_SIGNING_KEY
      
      if (!signingKey) {
        logger.error('❌ [API SERVER] INNGEST_SIGNING_KEY не найден! Webhook verification будет недоступен.')
      }

      const inngestHandler = serve({ client: inngest, functions: allInngestFunctions })

      // Override health check to check process.env directly
      app.get('/api/inngest', (req, res) => {
        res.json({
          'Inngest endpoint configured correctly.': true,
          hasEventKey: !!process.env.INNGEST_EVENT_KEY,
          hasSigningKey: !!signingKey,
          functionsFound: allInngestFunctions.length,
        })
      })

      app.use('/api/inngest', inngestHandler)
      logger.info(
        '✅ [API SERVER] Inngest webhook monitor initialized at /api/inngest',
        {
          signingKey: signingKey || 'not set',
          signingKeyPreview: signingKey
            ? `${signingKey.substring(0, 30)}...`
            : 'not set',
        }
      )
    } else {
      logger.warn('⚠️ [API SERVER] No Inngest functions created', {
        allInngestFunctions: typeof allInngestFunctions,
        isArray: Array.isArray(allInngestFunctions),
      })
    }
  } catch (error) {
    logger.error('❌ [API SERVER] Failed to create Inngest functions', {
      error,
    })
  }

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
