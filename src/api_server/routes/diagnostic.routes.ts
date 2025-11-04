import express from 'express'
import { Router } from 'express'
import { logger } from '@/utils/logger'
// ВРЕМЕННО: inngest отключён
// import { inngestProvider } from '@/inngest_app/inngest-provider'

const router: Router = express.Router()

/**
 * Диагностический роут для проверки конфигурации Template 2
 * GET /api/diagnostic/template2
 */
router.get('/diagnostic/template2', async (_req: any, res: any) => {
  try {
    logger.info('🔍 [DIAGNOSTIC] Template 2 diagnostic check started')

    // Проверяем ENV переменные
    const envVars = {
      RENDER_INNGEST_EVENT_KEY: !!process.env.RENDER_INNGEST_EVENT_KEY,
      BOT_INNGEST_EVENT_KEY: !!process.env.BOT_INNGEST_EVENT_KEY,
      RENDER_INNGEST_SIGNING_KEY: !!process.env.RENDER_INNGEST_SIGNING_KEY,
      BOT_INNGEST_SIGNING_KEY: !!process.env.BOT_INNGEST_SIGNING_KEY,
      ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
      HEDRA_API_KEY: !!process.env.HEDRA_API_KEY,
      HEYGEN_API_KEY: !!process.env.HEYGEN_API_KEY,
    }

    // ВРЕМЕННО: inngest отключён
    // const inngestStatus = await inngestProvider.getStatus()
    const inngestStatus = {
      RENDER: { available: false, configured: false },
      BOT: { available: false, configured: false }
    }

    // Собираем полную диагностику
    const diagnostic = {
      timestamp: new Date().toISOString(),
      status: 'ok',
      template: 'template-2',
      version: '2025.11.03',
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasEnvFile: !!process.env.DOTENV_CONFIGURATION,
      },
      envVars: {
        ...envVars,
        // Не показываем реальные ключи, только факт наличия
        RENDER_INNGEST_EVENT_KEY_preview: process.env.RENDER_INNGEST_EVENT_KEY?.substring(0, 10) + '...',
        BOT_INNGEST_EVENT_KEY_preview: process.env.BOT_INNGEST_EVENT_KEY?.substring(0, 10) + '...',
      },
      inngestProvider: {
        initialized: 'disabled',
        instances: [],
        status: inngestStatus,
      },
      checks: {
        envVarsOk: Object.values(envVars).every(v => v === true),
        inngestAvailable: inngestStatus.RENDER?.available || inngestStatus.BOT?.available,
        renderConfigured: inngestStatus.RENDER?.configured,
        botConfigured: inngestStatus.BOT?.configured,
      },
      recommendations: [] as string[],
    }

    // Добавляем рекомендации на основе проверок
    if (!envVars.RENDER_INNGEST_EVENT_KEY) {
      diagnostic.recommendations.push('❌ RENDER_INNGEST_EVENT_KEY не настроен')
    }
    if (!envVars.BOT_INNGEST_EVENT_KEY) {
      diagnostic.recommendations.push('❌ BOT_INNGEST_EVENT_KEY не настроен')
    }
    if (!envVars.ELEVENLABS_API_KEY) {
      diagnostic.recommendations.push('⚠️ ELEVENLABS_API_KEY не настроен (может потребоваться)')
    }
    if (!inngestStatus.RENDER?.configured) {
      diagnostic.recommendations.push('❌ RENDER Inngest инстанс не сконфигурирован')
    }
    if (!inngestStatus.RENDER?.available) {
      diagnostic.recommendations.push('❌ RENDER Inngest инстанс недоступен')
    }

    if (diagnostic.recommendations.length === 0) {
      diagnostic.recommendations.push('✅ Все проверки пройдены успешно!')
    }

    logger.info('🔍 [DIAGNOSTIC] Template 2 diagnostic completed', {
      checks: diagnostic.checks,
      recommendations: diagnostic.recommendations.length,
    })

    res.json(diagnostic)
  } catch (error) {
    logger.error('❌ [DIAGNOSTIC] Template 2 diagnostic failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    res.status(500).json({
      status: 'error',
      template: 'template-2',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * Health check для webhook callback
 * GET /api/telegram/ai-reels-callback
 */
router.get('/telegram/ai-reels-callback', async (_req: any, res: any) => {
  try {
    return res.status(200).json({
      status: 'ok',
      service: 'ai-reels-callback',
      timestamp: new Date().toISOString(),
      template: 'template-2',
      version: '2025.11.03',
    })
  } catch {
    return res.status(200).end()
  }
})

export default router
