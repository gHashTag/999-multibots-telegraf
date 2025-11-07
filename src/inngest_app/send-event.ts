/**
 * Inngest Event Sender
 * Отправляет события в Inngest для асинхронной обработки
 */

import { logger } from '@/utils/logger'
import { inngest } from './client'

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
 * Отправляет событие AI Reels в Inngest
 */
export async function sendAIReelsEvent(
  payload: AIReelsEventPayload
): Promise<{ eventId: string }> {
  const eventKey = process.env.BOT_INNGEST_EVENT_KEY

  if (!eventKey) {
    throw new Error('INNGEST_EVENT_KEY not configured')
  }

  logger.info('📤 [INNGEST] Sending AI Reels event', {
    telegramId: payload.telegramId,
    hasText: !!payload.text,
    hasAudio: !!payload.audioUrl,
    resolution: payload.resolution,
  })

  try {
    // Отправляем событие напрямую в Inngest Cloud
    const response = await fetch(`https://inn.gs/e/${eventKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'ai-reels/generate',
        data: payload,
        ts: Date.now(),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('❌ [INNGEST] Failed to send event', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      throw new Error(
        `Inngest event send failed: ${response.status} ${response.statusText}`
      )
    }

    const result = await response.json()

    logger.info('✅ [INNGEST] Event sent successfully', {
      telegramId: payload.telegramId,
      eventIds: result.ids,
    })

    return {
      eventId: result.ids?.[0] || 'unknown',
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
 * Проверяет доступность Inngest
 */
export async function checkInngestAvailability(): Promise<boolean> {
  // ✅ ИСПРАВЛЕНО: Используем локальный endpoint для проверки
  const baseUrl = 'http://localhost:3000'

  try {
    const response = await fetch(`${baseUrl}/api/inngest`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      const data = await response.json()
      logger.info('✅ [INNGEST] Endpoint available', {
        functionsFound: data.functionsFound,
        hasEventKey: data.hasEventKey,
        hasSigningKey: data.hasSigningKey,
      })
      return true
    }

    logger.warn('⚠️ [INNGEST] Endpoint responded but not OK', {
      status: response.status,
    })
    return false
  } catch (error) {
    logger.error('❌ [INNGEST] Endpoint not available', {
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
