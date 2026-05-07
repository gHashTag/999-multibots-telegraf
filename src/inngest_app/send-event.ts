/**
 * Inngest Event Sender
 * Централизованная отправка событий в Inngest через inngestProvider
 */

import { logger } from '@/utils/logger'
import { inngestProvider } from './inngest-provider'

export interface AIReelsEventPayload {
  telegramId: string
  imageUrl: string
  text?: string
  audioUrl?: string
  resolution?: '480p' | '720p' | '1080p'
  botName?: string
  webhookUrl?: string

  // Дополнительные параметры для кастомизации
  job_id?: string
  eleven_labs_api_key?: string
  kie_api_key?: string
  cover_url?: string
  intro_text_1?: string
  intro_text_2?: string
  upper_intro_text?: string
  avatar_gen_service?: string
  avatar_settings?: {
    api_key?: string
    avatar_photo_url?: string
    voice_id?: string
    avatar_speech?: string
  }
}

/**
 * Отправляет событие AI Reels в Inngest через inngestProvider
 */
export async function sendAIReelsEvent(
  payload: AIReelsEventPayload
): Promise<{ eventId: string }> {
  logger.info('📤 [INNGEST] Sending AI Reels event', {
    telegramId: payload.telegramId,
    hasText: !!payload.text,
    hasAudio: !!payload.audioUrl,
    resolution: payload.resolution,
  })

  try {
    // Отправляем событие через inngestProvider на BOT инстанс
    const result = await inngestProvider.sendEvent(
      'BOT',
      'ai-reels/generate',
      payload
    )

    if (!result) {
      throw new Error('Failed to send event via inngestProvider')
    }

    logger.info('✅ [INNGEST] Event sent successfully', {
      telegramId: payload.telegramId,
      eventId: result.eventId,
    })

    return {
      eventId: result.eventId,
    }
  } catch (error) {
    logger.error('❌ [INNGEST] Error sending event', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: payload.telegramId,
    })
    throw error
  }
}

/**
 * Проверяет доступность Inngest через inngestProvider
 */
export async function checkInngestAvailability(): Promise<boolean> {
  try {
    const isAvailable = await inngestProvider.checkAvailability('BOT')

    if (isAvailable) {
      logger.info('✅ [INNGEST] BOT instance available')
    } else {
      logger.warn('⚠️ [INNGEST] BOT instance not available')
    }

    return isAvailable
  } catch (error) {
    logger.error('❌ [INNGEST] Availability check failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Отправляет тестовое событие для проверки
 */
export async function sendTestEvent(): Promise<boolean> {
  try {
    await sendAIReelsEvent({
      telegramId: 'test-user',
      imageUrl: 'https://example.com/test.jpg',
      text: 'Test AI Reels generation',
      resolution: '720p',
      botName: 'test-bot',
    })
    return true
  } catch (error) {
    logger.error('❌ [INNGEST] Test event failed', { error })
    return false
  }
}
