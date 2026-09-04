/**
 * Inngest Client - Centralized configuration for all Inngest functions
 * Migrated from ai-server, fully isolated for bot-farm
 */

import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

// Create main Inngest client for all Vibee functions
export const inngest = new Inngest({
  id: 'vibee',
  name: 'Vibee AI Bot Platform',
  // No literal fallback. A non-empty fake passes every `if (!eventKey)`
  // check, so a missing key produced a client that looked configured and
  // sent events with a key the service rejects. Its twin in client.ts has
  // always ended this chain with undefined and throws before sending;
  // measured: the Inngest constructor does not throw on a missing key, so
  // dropping the literal moves the failure to send time, not to startup.
  eventKey:
    process.env.INNGEST_EVENT_KEY ||
    process.env.BOT_INNGEST_EVENT_KEY ||
    undefined,
  // For local development, no baseUrl needed
  // For production, will use default Inngest Cloud
})

// Helper to check if Inngest is configured
export const isInngestConfigured = (): boolean => {
  const hasEventKey = !!(
    process.env.INNGEST_EVENT_KEY || process.env.BOT_INNGEST_EVENT_KEY
  )
  const hasSigningKey = !!(
    process.env.INNGEST_SIGNING_KEY || process.env.BOT_INNGEST_SIGNING_KEY
  )

  if (!hasEventKey) {
    logger.warn(
      '⚠️ [INNGEST] Missing event key - functions will run in dev mode'
    )
  }

  return hasEventKey && hasSigningKey
}

// Export event names for type safety
export const INNGEST_EVENTS = {
  // Content events
  ANALYZE_COMPETITOR_REELS: 'instagram/analyze-reels',
  EXTRACT_TOP_CONTENT: 'instagram/extract-top',
  FIND_COMPETITORS: 'instagram/find-competitors',
  GENERATE_CONTENT_SCRIPTS: 'instagram/generate-scripts',
  GENERATE_DETAILED_SCRIPT: 'content/generate-detailed-script',
  GENERATE_SCENARIO_CLIPS: 'content/generate-scenario-clips',

  // Instagram events
  INSTAGRAM_SCRAPER_V2: 'instagram/scraper-v2',
  INSTAGRAM_SCRAPER_V2_SIMPLE: 'instagram/test-reels',

  // Monitoring events
  CRITICAL_ERROR_MONITOR: 'app/error.critical',
  LOG_MONITOR: 'logs/monitor.trigger',

  // Training events
  MODEL_TRAINING_V2: 'model/training.v2.requested',
  MORPH_IMAGES: 'morph/images.requested',

  // Generation events
  NEURO_IMAGE_GENERATION: 'neuro/photo.generate',

  // Payment events
  PAYMENT_PROCESSING: 'payment/process-ai-server',

  // Broadcast events
  BROADCAST_MESSAGE: 'broadcast/send-message',

  // Render events
  RENDER: 'render',
  RENDER_AVATAR_VIDEO: 'render/avatar-video',
  RENDER_RIDDLE: 'render-riddle',

  // Existing events
  GENERATE_AI_REELS: 'ai-reels/generate',
  GENERATE_ADVANCED_LOOPING: 'reels/generate-advanced-loop',
  GENERATE_MODEL_TRAINING: 'model/training.start',
} as const

export type InngestEventName =
  (typeof INNGEST_EVENTS)[keyof typeof INNGEST_EVENTS]

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

// Export for backward compatibility
export default inngest
