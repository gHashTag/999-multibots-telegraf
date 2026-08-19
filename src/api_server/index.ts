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
import billingRouter from './routes/billing.routes'
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
import { requireInternalKey } from './middleware/requireInternalKey'

// Определяем порт. Railway/Fly/Docker предоставляют PORT; мы используем API_PORT как override.
// LAST FIX: 2025-11-25 - изменен с 2999 на 3000 согласно WEBHOOK_502_BAD_GATEWAY_FIX
const PORT = process.env.API_PORT || process.env.PORT || '3000'

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
  app.use(express.urlencoded({ extended: true, limit: '10mb' }) as any)

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

  // Provider health endpoint
  app.get('/api/providers', async (_req: any, res: any) => {
    const { getAllProviderStatuses, checkAllProviders } = await import('../services/provider-health-monitor')
    if (_req.query.refresh === 'true') await checkAllProviders()
    res.json(getAllProviderStatuses())
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
  // ГЕНЕРАЦИЯ — ТОЛЬКО СО СЛУЖЕБНЫМ КЛЮЧОМ.
  //
  // Оба маршрута брали `telegram_id` ИЗ ТЕЛА ЗАПРОСА и не проверяли ничего.
  // Проверено живым запросом к проду: POST без ключа доходит до обработчика.
  //
  // Что это давало постороннему:
  //   - запустить генерацию, списав звёзды с ЛЮБОГО номера на выбор —
  //     generateNeuroPhotoHybrid считает стоимость и проводит оплату, а при
  //     неудаче пишет «Failed to process payment, check your balance»;
  //   - потратить наш бюджет у поставщика: План Б зовёт replicate.run().
  //
  // Номер в Telegram не секрет и перебирается, так что защиты не было никакой.
  app.use('/api', requireInternalKey, voiceAvatarRouter)
  app.use('/api', requireInternalKey, neuroPhotoRouter)
  app.use('/api', competitorRouter)

  // ДИАГНОСТИКА И БИЛЛИНГ — ТОЛЬКО СО СЛУЖЕБНЫМ КЛЮЧОМ.
  //
  // До этой правки оба роутера отдавали внутренние данные любому, кто знает
  // адрес. Проверено живыми запросами к проду:
  //
  //   GET /api/billing                     финансы по всем ботам
  //   GET /api/billing/:botName            то же по одному
  //   GET /api/models/:telegramId          чужие обученные модели по номеру
  //   GET /api/diagnostic/trainings/:id    чужие обучения по номеру
  //   GET /api/diagnostic/trainings-recent последние обучения по всем
  //   GET /api/diagnostic/training-config  настройки, включая начала ключей
  //
  // Номер в Telegram не секрет и легко перебирается, поэтому «знать URL»
  // защитой не было.
  app.use('/api', requireInternalKey, diagnosticRouter)
  app.use('/api', requireInternalKey, billingRouter)

  // White-label B2B config endpoints
  app.get('/api/whitelabel/landing', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/html')
    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Bot Platform — Agent as a Service</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#1a1a2e;line-height:1.6}
h1{font-size:1.8rem}ul{list-style:none;padding:0}li{padding:6px 0}li::before{content:"- ";font-weight:bold}
.cta{display:inline-block;margin-top:16px;padding:10px 24px;background:#6c5ce7;color:#fff;border-radius:8px;text-decoration:none}</style>
</head><body><h1>AI Bot Platform</h1><p>Custom AI Telegram bot for your business</p>
<ul><li>10+ AI models: photo, video, voice, lip-sync</li>
<li>Your branding, your pricing, your bot</li>
<li>White-label dashboard and analytics</li>
<li>Setup: $50-200/hour</li></ul>
<a class="cta" href="https://t.me/neuro_sage">Contact @neuro_sage</a></body></html>`)
  })

  app.get('/api/whitelabel/:botName', async (req: any, res: any) => {
    try {
      const { getWhiteLabelConfig } = await import('../services/whiteLabelConfig')
      const config = await getWhiteLabelConfig(req.params.botName)
      res.json(config)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch config' })
    }
  })

  app.post('/api/whitelabel/:botName', async (req: any, res: any) => {
    const expectedKey = process.env.ADMIN_API_KEY
    if (!expectedKey || req.body?.admin_key !== expectedKey) {
      return res.status(403).json({ error: 'Forbidden: invalid admin_key' })
    }
    try {
      const { updateWhiteLabelConfig } = await import('../services/whiteLabelConfig')
      const { admin_key, ...config } = req.body
      const ok = await updateWhiteLabelConfig(req.params.botName, config)
      res.json({ success: ok })
    } catch (err) {
      res.status(500).json({ error: 'Failed to update config' })
    }
  })

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
