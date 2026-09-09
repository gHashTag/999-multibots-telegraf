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
import inngestStatusRouter from './routes/inngest-status.routes'
import {
  syncInngestAppOnBoot,
  resolveInngestServeHost,
} from '../inngest_app/status/syncOnBoot'
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
import {
  redactSensitiveHeaders,
  redactSensitiveUrl,
} from '@/utils/redactHeaders'

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
      url: redactSensitiveUrl(req.url),
      // redactSensitiveHeaders masks x-secret-key/authorization/cookie/telegram
      // secret; logging raw req.headers leaks them (CWE-532).
      headers: redactSensitiveHeaders(req.headers),
      body: req.body
        ? JSON.stringify(req.body).substring(0, 200) + '...'
        : '{}',
    })
    next()
  })

  // Provider health endpoint. Behind requireInternalKey (like the sibling
  // diagnostic/billing routers): the response leaks provider config/balance
  // state ('FAL_KEY not set', 'Balance exhausted', remaining quota) and
  // ?refresh=true forces live outbound provider probes + an admin alert, so
  // it must not be anonymously reachable.
  app.get('/api/providers', requireInternalKey, async (_req: any, res: any) => {
    const { getAllProviderStatuses, checkAllProviders } = await import(
      '../services/provider-health-monitor'
    )
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

  // Competitor routes are intentionally public (mounted without the key).
  // MUST stay ABOVE the requireInternalKey mounts below — see the ordering
  // note there.
  app.use('/api', competitorRouter)

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
      const { getWhiteLabelConfig } = await import(
        '../services/whiteLabelConfig'
      )
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
      const { updateWhiteLabelConfig } = await import(
        '../services/whiteLabelConfig'
      )
      const { admin_key, ...config } = req.body
      const ok = await updateWhiteLabelConfig(req.params.botName, config)
      res.json({ success: ok })
    } catch (err) {
      res.status(500).json({ error: 'Failed to update config' })
    }
  })

  // ✅ Интеграция Inngest с API (актуальная сигнатура serve)
  // The serve handler carries its OWN auth (Inngest request signatures) —
  // unsigned calls get its 401. It must be mounted BEFORE requireInternalKey.
  // Public READ-ONLY status of Inngest functions (manifest × GraphQL runs).
  // Mounted BEFORE the serve handler so `/api/inngest/functions/status` is
  // not swallowed by the SDK's signature check, and before any keyed mount.
  app.use(inngestStatusRouter)

  // The SDK reads INNGEST_SERVE_HOST, not this repo's historical
  // INNGEST_SERVE_ORIGIN. Without an explicit serveHost the SDK registers the
  // Host header of whoever sent the PUT — a loopback sync registered
  // `http://localhost:3000/api/inngest` (observed live 2026-09-09).
  const inngestHandler = serve({
    client: inngest,
    functions: allInngestFunctions,
    serveHost: resolveInngestServeHost(),
  })
  app.use('/api/inngest', inngestHandler)

  // KEYED INTERNAL ROUTES — MOUNTED LAST, ON PURPOSE.
  //
  // Express runs `app.use('/api', requireInternalKey, router)` for EVERY /api/*
  // request that reaches this stack position, not only for the router's own
  // paths. When these mounts sat above /api/inngest and the whitelabel pages,
  // the guard 401'd them as collateral: from 2026-08-19T20:30Z to 2026-08-28
  // every Inngest function invocation died with {"error":"unauthorized"}
  // BEFORE the SDK ran (all crons broken), and the public whitelabel landing
  // was dead too. Keeping the guarded mounts last preserves the protection for
  // their routes while unkeyed public surfaces above keep working. Unmatched
  // /api/* now gets 401 instead of 404 — same as before, acceptable.
  //
  // GENERATION — SERVICE KEY REQUIRED.
  //
  // Both routes took `telegram_id` FROM THE REQUEST BODY with no checks at
  // all. Verified with a live request against prod: a keyless POST reached
  // the handler. What that gave a stranger:
  //   - start a generation charging stars to ANY telegram id of their choice
  //     (generateNeuroPhotoHybrid prices and charges it);
  //   - burn our provider budget: Plan B calls replicate.run().
  // A Telegram id is not a secret and is enumerable, so there was no
  // protection at all.
  app.use('/api', requireInternalKey, voiceAvatarRouter)
  app.use('/api', requireInternalKey, neuroPhotoRouter)

  // DIAGNOSTICS AND BILLING — SERVICE KEY REQUIRED.
  //
  // Before this guard both routers served internal data to anyone who knew
  // the URL (verified live against prod): /api/billing (finances across all
  // bots), /api/billing/:botName, /api/models/:telegramId (other people's
  // trained models), /api/diagnostic/trainings/:id, trainings-recent, and
  // training-config (settings including key prefixes). A Telegram id is
  // enumerable, so "knowing the URL" was no protection.
  app.use('/api', requireInternalKey, diagnosticRouter)
  app.use('/api', requireInternalKey, billingRouter)

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

    // 🔁 Re-register the Inngest app after every deploy. The self-hosted
    // Inngest server does not re-sync on its own (verified live 2026-09-09):
    // without this PUT new/renamed functions stay invisible until someone
    // runs `curl -X PUT .../api/inngest` by hand. Fire-and-forget; failures
    // are logged and never block startup. Disable with INNGEST_SYNC_ON_BOOT=0.
    void syncInngestAppOnBoot({
      port: PORT,
      log: (msg, meta) => logger.info(msg, meta),
    }).catch(error => {
      logger.warn('[INNGEST SYNC] unexpected error', {
        error: error instanceof Error ? error.message : String(error),
      })
    })

    // 🚀 Verify webhook health on startup
    try {
      const webhookStatus = await verifyWebhooksOnStartup()
      if (webhookStatus.success) {
        logger.info(
          '🚀 [STARTUP] Webhook verification PASSED',
          webhookStatus.details
        )
      } else {
        logger.error('❌ [STARTUP] Webhook verification FAILED!', webhookStatus)
        console.error(
          '❌ CRITICAL: Webhook endpoints are not accessible! Check nginx config.'
        )
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
