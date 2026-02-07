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
      INNGEST_EVENT_KEY: !!process.env.INNGEST_EVENT_KEY,
      RENDER_INNGEST_SIGNING_KEY: !!process.env.RENDER_INNGEST_SIGNING_KEY,
      INNGEST_SIGNING_KEY: !!process.env.INNGEST_SIGNING_KEY,
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
        INNGEST_EVENT_KEY_preview: process.env.INNGEST_EVENT_KEY?.substring(0, 10) + '...',
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
    if (!envVars.INNGEST_EVENT_KEY) {
      diagnostic.recommendations.push('❌ INNGEST_EVENT_KEY не настроен')
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

/**
 * Диагностика тренировок (ВСЕ статусы, не только SUCCESS)
 * GET /api/diagnostic/trainings/:telegramId
 */
router.get('/diagnostic/trainings/:telegramId', async (req: any, res: any) => {
  try {
    const { telegramId } = req.params
    logger.info('[DIAGNOSTIC] Checking ALL trainings for user', { telegram_id: telegramId })

    const { data: trainings, error: dbError } = await supabase
      .from('model_trainings')
      .select('*')
      .or(`telegram_id.eq.${telegramId},user_id.eq.${telegramId}`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (dbError) {
      logger.error('[DIAGNOSTIC] DB query failed', { error: dbError.message, code: dbError.code })
      return res.status(500).json({ error: 'DB query failed', details: dbError.message, code: dbError.code })
    }

    // Проверяем BFL env vars
    const bflConfig = {
      BFL_API_KEY: !!process.env.BFL_API_KEY,
      BFL_WEBHOOK_URL: process.env.BFL_WEBHOOK_URL || 'NOT SET',
      BFL_WEBHOOK_SECRET: !!process.env.BFL_WEBHOOK_SECRET,
    }

    res.json({
      telegram_id: telegramId,
      total_trainings: trainings?.length || 0,
      bfl_config: bflConfig,
      trainings: trainings?.map(t => ({
        id: t.id,
        model_name: t.model_name,
        status: t.status,
        result: t.result,
        api: t.api,
        bot_name: t.bot_name,
        replicate_training_id: t.replicate_training_id,
        trigger_word: t.trigger_word,
        created_at: t.created_at,
        updated_at: t.updated_at,
        error: t.error,
      })),
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * Диагностика ПОСЛЕДНИХ тренировок (все пользователи)
 * GET /api/diagnostic/trainings-recent
 */
router.get('/diagnostic/trainings-recent', async (_req: any, res: any) => {
  try {
    logger.info('[DIAGNOSTIC] Fetching recent trainings...')

    const { data: trainings, error: dbError } = await supabase
      .from('model_trainings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (dbError) {
      logger.error('[DIAGNOSTIC] DB query failed', { error: dbError.message, code: dbError.code })
      return res.status(500).json({ error: 'DB query failed', details: dbError.message, code: dbError.code })
    }

    logger.info('[DIAGNOSTIC] Recent trainings fetched', { count: trainings?.length || 0 })

    res.json({
      total: trainings?.length || 0,
      bfl_webhook_url: process.env.BFL_WEBHOOK_URL || 'NOT SET',
      bfl_api_key_set: !!process.env.BFL_API_KEY,
      bfl_webhook_secret_set: !!process.env.BFL_WEBHOOK_SECRET,
      trainings: trainings?.map(t => ({
        id: t.id,
        user_id: t.user_id,
        telegram_id: t.telegram_id,
        model_name: t.model_name,
        status: t.status,
        result: t.result,
        api: t.api,
        bot_name: t.bot_name,
        replicate_training_id: t.replicate_training_id,
        trigger_word: t.trigger_word,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
    })
  } catch (err: any) {
    logger.error('[DIAGNOSTIC] trainings-recent failed', { error: err.message, stack: err.stack })
    res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 500) })
  }
})

/**
 * Диагностика конфигурации тренировки моделей (Replicate pipeline)
 * GET /api/diagnostic/training-config
 */
router.get('/diagnostic/training-config', async (_req: any, res: any) => {
  try {
    logger.info('[DIAGNOSTIC] Checking training config (Replicate pipeline)')

    const baseWebhookUrl = process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'
    const webhookUrl = `${baseWebhookUrl}/api/webhooks/replicate`

    const config = {
      timestamp: new Date().toISOString(),
      replicate: {
        REPLICATE_API_TOKEN_set: !!process.env.REPLICATE_API_TOKEN,
        REPLICATE_API_TOKEN_preview: process.env.REPLICATE_API_TOKEN
          ? process.env.REPLICATE_API_TOKEN.substring(0, 8) + '...'
          : 'NOT SET',
        REPLICATE_USERNAME: process.env.REPLICATE_USERNAME || 'NOT SET',
        REPLICATE_API_KEY_set: !!process.env.REPLICATE_API_KEY,
      },
      webhook: {
        BASE_WEBHOOK_URL: baseWebhookUrl,
        BASE_WEBHOOK_URL_source: process.env.BASE_WEBHOOK_URL ? 'env' : 'default (hardcoded)',
        full_webhook_url: webhookUrl,
        points_to_flyio: baseWebhookUrl.includes('fly.dev'),
        points_to_vps: baseWebhookUrl.includes('three-head-dragon'),
      },
      inngest: {
        INNGEST_EVENT_KEY_set: !!process.env.INNGEST_EVENT_KEY,
        INNGEST_SIGNING_KEY_set: !!process.env.INNGEST_SIGNING_KEY,
        RENDER_INNGEST_EVENT_KEY_set: !!process.env.RENDER_INNGEST_EVENT_KEY,
        INNGEST_EVENT_KEY_preview: process.env.INNGEST_EVENT_KEY
          ? process.env.INNGEST_EVENT_KEY.substring(0, 10) + '...'
          : 'NOT SET',
      },
      supabase: {
        SUPABASE_URL_set: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_KEY_set: !!process.env.SUPABASE_SERVICE_KEY,
      },
      infisical: {
        loaded_env_count: Object.keys(process.env).filter(k =>
          k.startsWith('REPLICATE') || k.startsWith('BASE_WEBHOOK') || k.startsWith('INNGEST') || k.startsWith('SUPABASE')
        ).length,
        replicate_keys: Object.keys(process.env).filter(k => k.includes('REPLICATE')),
        webhook_keys: Object.keys(process.env).filter(k => k.includes('WEBHOOK')),
      },
      warnings: [] as string[],
    }

    // Warnings
    if (!process.env.REPLICATE_API_TOKEN) {
      config.warnings.push('CRITICAL: REPLICATE_API_TOKEN not set - training will fail at credential validation step')
    }
    if (!process.env.REPLICATE_USERNAME) {
      config.warnings.push('CRITICAL: REPLICATE_USERNAME not set - cannot create models on Replicate')
    }
    if (!process.env.BASE_WEBHOOK_URL) {
      config.warnings.push(`WARNING: BASE_WEBHOOK_URL not set - defaulting to ${baseWebhookUrl} (VPS, not fly.io!)`)
    }
    if (baseWebhookUrl.includes('three-head-dragon')) {
      config.warnings.push('CRITICAL: Webhook URL points to VPS (three-head-dragon.shop), not fly.io! Replicate webhooks will go to wrong server!')
    }
    if (!process.env.INNGEST_EVENT_KEY) {
      config.warnings.push('WARNING: INNGEST_EVENT_KEY not set - Inngest events may not be delivered')
    }

    if (config.warnings.length === 0) {
      config.warnings.push('All training config checks passed')
    }

    res.json(config)
  } catch (err: any) {
    logger.error('[DIAGNOSTIC] training-config failed', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

export default router
