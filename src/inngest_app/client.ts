/**
 * ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ: Inngest Client
 * Все функции должны импортировать inngest отсюда
 */
import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

// ✅ ЕДИНАЯ КОНФИГУРАЦИЯ для всех Inngest функций
const config = {
  name: 'Vibee',
  id: 'telegram-bot-client',
  // Подключение к нашему Inngest Dev Server
  baseUrl:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000' // Локальный dev server
      : 'https://three-head-dragon.shop/api/inngest', // Production
  isDev: process.env.NODE_ENV === 'development',
  // Event key загружается из Infisical (INNGEST_EVENT_KEY)
  eventKey: process.env.INNGEST_EVENT_KEY || undefined,
}

// ✅ ЕДИНСТВЕННЫЙ Inngest клиент для всего приложения
export const inngest = new Inngest(config)

// Логирование конфигурации (без секретов)
logger.info('🔥 [INNGEST] Client initialized', {
  name: config.name,
  id: config.id,
  baseUrl: config.baseUrl,
  isDev: config.isDev,
  hasEventKey: !!config.eventKey,
  environment: process.env.NODE_ENV,
})

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
} as const

export type InngestEventName = typeof INNGEST_EVENTS[keyof typeof INNGEST_EVENTS]

// Helper function to send events
export async function sendInngestEvent(
  eventName: InngestEventName,
  data: any
): Promise<void> {
  try {
    logger.info(`📤 [INNGEST] Sending event: ${eventName}`, {
      eventName,
      dataKeys: Object.keys(data),
    })

    await inngest.send({
      name: eventName,
      data,
    })

    logger.info(`✅ [INNGEST] Event sent: ${eventName}`)
  } catch (error) {
    logger.error(`❌ [INNGEST] Failed to send event: ${eventName}`, {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}


