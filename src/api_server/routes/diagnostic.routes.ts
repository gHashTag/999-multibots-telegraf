import express from 'express'
import { Router } from 'express'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
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

/**
 * Диагностический роут для проверки моделей пользователя
 * GET /api/diagnostic/models/:telegramId
 */
router.get('/models/:telegramId', async (req: any, res: any) => {
  try {
    const { telegramId } = req.params
    logger.info('🔍 [DIAGNOSTIC] Checking user models', { telegram_id: telegramId })

    // Получаем ВСЕ модели
    const { data: allModels, error: allError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'SUCCESS')
      .order('created_at', { ascending: false })

    if (allError) {
      logger.error('❌ [DIAGNOSTIC] Error fetching all models', { error: allError })
      return res.status(500).json({ error: 'Error fetching all models', details: allError })
    }

    // Получаем только replicate модели
    const { data: replicateModels, error: replicateError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'SUCCESS')
      .eq('api', 'replicate')
      .order('created_at', { ascending: false })

    if (replicateError) {
      logger.error('❌ [DIAGNOSTIC] Error fetching replicate models', { error: replicateError })
      return res.status(500).json({ error: 'Error fetching replicate models', details: replicateError })
    }

    // Получаем не-replicate модели
    const { data: otherModels, error: otherError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'SUCCESS')
      .neq('api', 'replicate')
      .order('created_at', { ascending: false })

    if (otherError) {
      logger.error('❌ [DIAGNOSTIC] Error fetching other models', { error: otherError })
      return res.status(500).json({ error: 'Error fetching other models', details: otherError })
    }

    logger.info('✅ [DIAGNOSTIC] User models fetched', {
      telegram_id: telegramId,
      total_models: allModels?.length || 0,
      replicate_models: replicateModels?.length || 0,
      other_models: otherModels?.length || 0,
    })

    res.json({
      telegram_id: telegramId,
      total_models: allModels?.length || 0,
      replicate_models_count: replicateModels?.length || 0,
      other_models_count: otherModels?.length || 0,
      all_models: allModels,
      replicate_models: replicateModels,
      other_models: otherModels,
    })
  } catch (error: any) {
    logger.error('❌ [DIAGNOSTIC] Models diagnostic failed', {
      error: error.message,
      telegram_id: req.params.telegramId,
    })
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
