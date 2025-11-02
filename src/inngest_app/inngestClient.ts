/**
 * Inngest Client - Centralized configuration for all Inngest functions
 * Migrated from ai-server, fully isolated for bot-farm
 */

import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

// Create main Inngest client for all bot-farm functions
export const inngest = new Inngest({
  name: 'bot-farm-inngest',
  eventKey: process.env.INNGEST_EVENT_KEY || process.env.BOT_INNGEST_EVENT_KEY || 'local-dev-key',
  // For local development, no baseUrl needed
  // For production, will use default Inngest Cloud
})

// Helper to check if Inngest is configured
export const isInngestConfigured = (): boolean => {
  const hasEventKey = !!(process.env.INNGEST_EVENT_KEY || process.env.BOT_INNGEST_EVENT_KEY)
  const hasSigningKey = !!(process.env.INNGEST_SIGNING_KEY || process.env.BOT_INNGEST_SIGNING_KEY)

  if (!hasEventKey) {
    logger.warn('⚠️ [INNGEST] Missing event key - functions will run in dev mode')
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
): Promise<string> {
  try {
    logger.info(`📤 [INNGEST] Sending event: ${eventName}`, {
      eventName,
      dataKeys: Object.keys(data),
    })

    const response = await inngest.send({
      name: eventName,
      data,
      // Генерируем уникальный ID для отслеживания
      id: `${eventName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    })

    const eventId = response.ids?.[0] || `event-${Date.now()}`

    logger.info(`✅ [INNGEST] Event sent: ${eventName} (ID: ${eventId})`)

    return eventId
  } catch (error) {
    logger.error(`❌ [INNGEST] Failed to send event: ${eventName}`, {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// Export for backward compatibility
export default inngest