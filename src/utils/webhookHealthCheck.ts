import { logger } from './logger'

/**
 * 🛡️ BULLETPROOF WEBHOOK CALLBACK URL SELECTOR
 *
 * Проверяет доступность callback URL'ов перед отправкой в Kie.ai API
 * Implements Plan A/B fallback strategy:
 * - Plan A: HTTPS через nginx reverse proxy (three-head-dragon.shop)
 * - Plan B: Direct HTTP на IP:port (188.137.250.69:2999)
 *
 * @param telegramId - Telegram ID пользователя для персонализированного callback
 * @returns Первый доступный callback URL или null если оба недоступны
 */
export async function getAvailableCallbackUrl(telegramId?: string | number): Promise<string | null> {
  const endpoint = telegramId
    ? `/api/video-callback/${telegramId}`
    : '/api/video-callback'

  // Plan A: HTTPS через reverse proxy (предпочтительный)
  const planA = process.env.BASE_WEBHOOK_URL
    ? `${process.env.BASE_WEBHOOK_URL}${endpoint}`
    : null

  // Plan B: Direct HTTP на production server (fallback)
  // LAST FIX: 2025-11-25 - изменен с 2999 на 3000 согласно WEBHOOK_502_BAD_GATEWAY_FIX
  const planB = process.env.DIRECT_WEBHOOK_URL
    ? `${process.env.DIRECT_WEBHOOK_URL}${endpoint}`
    : `http://188.137.250.69:3000${endpoint}` // Hard-coded fallback

  const urls = [planA, planB].filter(Boolean) as string[]

  logger.info('🔍 [WEBHOOK HEALTH CHECK] Checking callback URL availability', {
    planA,
    planB,
    telegramId,
    totalUrls: urls.length
  })

  // Проверяем каждый URL с коротким timeout
  for (const url of urls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // Игнорируем SSL ошибки для production (self-signed cert)
        // @ts-ignore
        ...(url.startsWith('https:') && { rejectUnauthorized: false })
      })

      clearTimeout(timeoutId)

      // Успешный ответ (200-299) или 405 Method Not Allowed (endpoint exists but HEAD not supported)
      if (response.ok || response.status === 405) {
        logger.info('✅ [WEBHOOK HEALTH CHECK] Callback URL is accessible', {
          url: url.substring(0, 50) + '...',
          status: response.status,
          responseTime: '< 3s'
        })
        return url
      }

      logger.warn('⚠️ [WEBHOOK HEALTH CHECK] Callback URL returned error status', {
        url: url.substring(0, 50) + '...',
        status: response.status
      })

    } catch (error) {
      logger.warn('⚠️ [WEBHOOK HEALTH CHECK] Callback URL not accessible', {
        url: url.substring(0, 50) + '...',
        error: error instanceof Error ? error.message : String(error),
        isTimeout: error instanceof Error && error.name === 'AbortError'
      })
    }
  }

  // Если оба недоступны - возвращаем Plan B как last resort
  logger.error('❌ [WEBHOOK HEALTH CHECK] All callback URLs failed, using fallback', {
    fallback: planB
  })

  return planB
}

/**
 * 🧪 TEST FUNCTION: Проверка доступности всех webhook URL'ов
 * Используется для диагностики webhook infrastructure
 */
export async function testAllWebhookUrls(): Promise<{
  planA: { url: string | null; available: boolean; status?: number; error?: string }
  planB: { url: string | null; available: boolean; status?: number; error?: string }
}> {
  const endpoint = '/api/video-callback'

  const planA = process.env.BASE_WEBHOOK_URL
    ? `${process.env.BASE_WEBHOOK_URL}${endpoint}`
    : null

  const planB = process.env.DIRECT_WEBHOOK_URL
    ? `${process.env.DIRECT_WEBHOOK_URL}${endpoint}`
    : `http://188.137.250.69:3000${endpoint}`

  const testUrl = async (url: string | null) => {
    if (!url) {
      return { url: null, available: false, error: 'URL not configured' }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // @ts-ignore
        ...(url.startsWith('https:') && { rejectUnauthorized: false })
      })

      clearTimeout(timeoutId)

      return {
        url,
        available: response.ok || response.status === 405,
        status: response.status
      }
    } catch (error) {
      return {
        url,
        available: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  const [resultA, resultB] = await Promise.all([
    testUrl(planA),
    testUrl(planB)
  ])

  logger.info('🧪 [WEBHOOK TEST] All URLs tested', {
    planA: resultA,
    planB: resultB
  })

  return { planA: resultA, planB: resultB }
}
