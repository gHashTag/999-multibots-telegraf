/**
 * ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ: Inngest Client
 * Все функции должны импортировать inngest отсюда
 *
 * 🔥 ВАЖНО: Используем ленивую инициализацию, так как секреты
 * загружаются из Infisical ПОСЛЕ импорта этого модуля
 */
import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

// Кэшированный экземпляр клиента
let _inngestClient: Inngest | null = null

// ✅ Функция для получения конфигурации (читает process.env в момент вызова)
function getInngestConfig() {
  return {
    name: 'Vibee',
    id: 'telegram-bot-client',
    // Подключение к нашему Inngest Dev Server
    baseUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000' // Локальный dev server
        : 'https://three-head-dragon.shop/api/inngest', // Production
    isDev: process.env.NODE_ENV === 'development',
    // Event key загружается из Infisical (INNGEST_EVENT_KEY)
    eventKey: process.env.INNGEST_EVENT_KEY || process.env.RENDER_INNGEST_EVENT_KEY || undefined,
    // Signing key для webhook verification (Inngest v3+)
    signingKey: process.env.INNGEST_SIGNING_KEY || process.env.RENDER_INNGEST_SIGNING_KEY || undefined,
  }
}

// ✅ Ленивая инициализация Inngest клиента
function getInngestClient(): Inngest {
  if (!_inngestClient) {
    const config = getInngestConfig()
    _inngestClient = new Inngest(config)

    // Логирование конфигурации (без секретов)
    logger.info('🔥 [INNGEST] Client initialized (lazy)', {
      name: config.name,
      id: config.id,
      baseUrl: config.baseUrl,
      isDev: config.isDev,
      hasEventKey: !!config.eventKey,
      hasSigningKey: !!config.signingKey,
      environment: process.env.NODE_ENV,
    })
  }
  return _inngestClient
}

// ✅ Экспорт через getter для ленивой инициализации
export const inngest = new Proxy({} as Inngest, {
  get(_target, prop) {
    return (getInngestClient() as any)[prop]
  }
})

// ✅ Функция для принудительной реинициализации (после загрузки секретов)
export function reinitializeInngestClient(): void {
  _inngestClient = null
  logger.info('🔄 [INNGEST] Client will be reinitialized on next use')
}

// Helper to check if Inngest is configured
export const isInngestConfigured = (): boolean => {
  const hasEventKey = !!process.env.INNGEST_EVENT_KEY
  const hasSigningKey = !!process.env.INNGEST_SIGNING_KEY

  if (!hasEventKey) {
    logger.warn('⚠️ [INNGEST] Missing INNGEST_EVENT_KEY - functions will run in dev mode')
  }
  if (!hasSigningKey) {
    logger.warn('⚠️ [INNGEST] Missing INNGEST_SIGNING_KEY - webhook verification may fail')
  }

  return hasEventKey && hasSigningKey
}

// Export event names for type safety
export const INNGEST_EVENTS = {
  // Content events
  ANALYZE_COMPETITOR_REELS: 'content/analyze-competitor-reels',
  EXTRACT_TOP_CONTENT: 'content/extract-top-content',
  FIND_COMPETITORS: 'content/find-competitors',
  GENERATE_CONTENT_SCRIPTS: 'content/generate-content-scripts',
  GENERATE_DETAILED_SCRIPT: 'content/generate-detailed-script',
  GENERATE_SCENARIO_CLIPS: 'content/generate-scenario-clips',

  // Instagram events
  INSTAGRAM_SCRAPER_V2: 'instagram/scraper-v2',
  INSTAGRAM_SCRAPER_V2_SIMPLE: 'instagram/scraper-v2-simple',

  // Monitoring events
  CRITICAL_ERROR_MONITOR: 'monitoring/critical-error',
  LOG_MONITOR: 'monitoring/log-monitor',

  // Training events
  MODEL_TRAINING_V2: 'training/model-v2',
  MORPH_IMAGES: 'training/morph-images',

  // Generation events
  NEURO_IMAGE_GENERATION: 'generation/neuro-image',

  // Payment events
  PAYMENT_PROCESSING: 'payments/process',

  // Broadcast events
  BROADCAST_MESSAGE: 'broadcast/message',

  // Render events
  RENDER: 'render/main',
  RENDER_AVATAR_VIDEO: 'render/avatar-video',
  RENDER_RIDDLE: 'render/riddle',

  // Existing events
  GENERATE_AI_REELS: 'video/generate-ai-reels',
  GENERATE_ADVANCED_LOOPING: 'video/advanced-looping',
  GENERATE_MODEL_TRAINING: 'training/generate-model',

  // Welcome events
  WELCOME_AVATAR_GENERATE: 'user/welcome.avatar.generate',

  // Voice Training events
  VOICE_TRAINING_START: 'voice/training.start',
  VOICE_TRAINING_COMPLETED: 'voice/training.completed',
} as const

export type InngestEventName = typeof INNGEST_EVENTS[keyof typeof INNGEST_EVENTS]

// Helper function to send events with safety checks
/**
 * 🔥 CRITICAL: Reusable onFailure handler for ALL Inngest functions
 * Logs errors to application logs (not just Inngest dashboard)
 *
 * Usage in function definition:
 * ```typescript
 * inngest.createFunction(
 *   {
 *     id: 'my-function',
 *     onFailure: createInngestFailureHandler('my-function'),
 *   },
 *   ...
 * )
 * ```
 */
export interface InngestFailureContext {
  error: Error
  event: { data?: Record<string, any>; name?: string }
  runId: string
}

export const createInngestFailureHandler = (functionName: string) => {
  return async ({ error, event, runId }: InngestFailureContext) => {
    // 🔥 CRITICAL: Log to application logs (visible in docker logs)
    logger.error(`❌ [INNGEST FAILURE] ${functionName}`, {
      functionName,
      runId,
      eventName: event?.name,
      error: error?.message || String(error),
      stack: error?.stack,
      eventData: event?.data ? JSON.stringify(event.data).slice(0, 500) : undefined,
      timestamp: new Date().toISOString(),
    })

    // Log to console as backup
    console.error(`❌ [INNGEST FAILURE] ${functionName}:`, {
      runId,
      error: error?.message,
      eventName: event?.name,
    })
  }
}

export async function sendInngestEvent(
  eventName: InngestEventName,
  data: any
): Promise<void> {
  // 🔥 SAFETY CHECK: Проверяем наличие ключа ПЕРЕД отправкой
  const eventKey = process.env.INNGEST_EVENT_KEY || process.env.RENDER_INNGEST_EVENT_KEY

  if (!eventKey) {
    logger.error(`❌ [INNGEST] CRITICAL: No event key available!`, {
      eventName,
      INNGEST_EVENT_KEY: !!process.env.INNGEST_EVENT_KEY,
      RENDER_INNGEST_EVENT_KEY: !!process.env.RENDER_INNGEST_EVENT_KEY,
      envKeys: Object.keys(process.env).filter(k => k.includes('INNGEST')).join(', '),
      suggestion: 'Check that Infisical loaded secrets before this call'
    })
    throw new Error(
      'INNGEST_EVENT_KEY not found in process.env. ' +
      'Ensure initInfisical() was called before sending events.'
    )
  }

  try {
    logger.info(`📤 [INNGEST] Sending event: ${eventName}`, {
      eventName,
      dataKeys: Object.keys(data),
      hasEventKey: true,
      eventKeyPrefix: eventKey.substring(0, 10) + '...'
    })

    await inngest.send({
      name: eventName,
      data,
    })

    logger.info(`✅ [INNGEST] Event sent: ${eventName}`)
  } catch (error) {
    logger.error(`❌ [INNGEST] Failed to send event: ${eventName}`, {
      error: error instanceof Error ? error.message : String(error),
      eventKey: eventKey ? 'present' : 'MISSING',
    })
    throw error
  }
}


