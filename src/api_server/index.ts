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
import x402Router, { setX402BotInstance } from './routes/x402.routes'
import { Telegraf } from 'telegraf'
// ✅ Inngest включен для мониторинга webhook'ов
import { serve } from 'inngest/express'
import { inngest } from '../inngest_app/client'
// ✅ LAZY: Импортируем все функции Inngest
import { allInngestFunctions } from '../inngest_app/registerFunctions'
import { logger } from '@/utils/logger'
// ✅ Webhook health verification on startup
import { verifyWebhooksOnStartup } from '@/utils/webhookHealthCheck'

// Определяем порт. Берем из process.env.API_PORT, если есть, иначе 3000 (настроено в docker-compose.yml).
// LAST FIX: 2025-11-25 - изменен с 2999 на 3000 согласно WEBHOOK_502_BAD_GATEWAY_FIX
const PORT = process.env.API_PORT || '3000'

export async function startApiServer(bot?: Telegraf): Promise<void> {
  // Если bot instance передан, инициализируем его в webhook router
  if (bot) {
    setBotInstance(bot)
    setX402BotInstance(bot as any) // x402 payment notifications
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

  // ✅ Интеграция Inngest с API (актуальная сигнатура serve)
  const inngestHandler = serve({
    client: inngest,
    functions: allInngestFunctions,
  })
  app.use('/api/inngest', inngestHandler)

  // Запуск основного сервера на всех интерфейсах (0.0.0.0) для Docker
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[API] Server started on port ${PORT} (listening on 0.0.0.0)`)

    // 🌐 Логируем webhook endpoints
    const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL
    console.log('═══════════════════════════════════════════════════════')
    console.log('🌐 [API] WEBHOOK ENDPOINTS:')
    console.log('═══════════════════════════════════════════════════════')
    if (tunnelUrl) {
      console.log(`✅ Cloudflare Tunnel: ${tunnelUrl}/payment-success`)
    }
    console.log(`📍 Local: http://localhost:${PORT}/api/payment-success`)
    console.log(`📍 Direct: http://0.0.0.0:${PORT}/api/payment-success`)
    console.log('═══════════════════════════════════════════════════════')

    // 🚀 Verify webhook health on startup
    try {
      const webhookStatus = await verifyWebhooksOnStartup()
      if (webhookStatus.success) {
        logger.info('🚀 [STARTUP] Webhook verification PASSED', webhookStatus.details)
      } else {
        logger.error('❌ [STARTUP] Webhook verification FAILED!', webhookStatus)
        console.error('❌ CRITICAL: Webhook endpoints are not accessible! Check nginx config.')
      }
    } catch (error) {
      logger.error('❌ [STARTUP] Webhook verification error', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
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
