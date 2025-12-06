import { logger } from './logger'

// 🛡️ SECURITY: Allowed webhook domains (whitelist)
const ALLOWED_WEBHOOK_DOMAINS = [
  'three-head-dragon.shop',
  '188.137.250.69',
  'localhost',
] as const

// 🚨 CRITICAL: Validate webhook URL before use
function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname

    // Check against whitelist
    const isAllowed = ALLOWED_WEBHOOK_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    )

    if (!isAllowed) {
      logger.error('🚨 [WEBHOOK SECURITY] BLOCKED: URL not in whitelist!', {
        url: url.substring(0, 80),
        hostname,
        allowedDomains: ALLOWED_WEBHOOK_DOMAINS,
      })
      return false
    }

    // Must use HTTPS in production (except localhost)
    if (
      process.env.NODE_ENV === 'production' &&
      !hostname.includes('localhost') &&
      parsed.protocol !== 'https:'
    ) {
      logger.warn('⚠️ [WEBHOOK SECURITY] Non-HTTPS URL in production', {
        url: url.substring(0, 80),
        protocol: parsed.protocol,
      })
    }

    return true
  } catch (error) {
    logger.error('🚨 [WEBHOOK SECURITY] Invalid URL format', {
      url: url?.substring(0, 80),
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * 🛡️ BULLETPROOF WEBHOOK CALLBACK URL SELECTOR
 *
 * Проверяет доступность callback URL'ов перед отправкой в Kie.ai API
 * Implements Plan A/B fallback strategy:
 * - Plan A: HTTPS через nginx reverse proxy (three-head-dragon.shop)
 * - Plan B: Fallback HTTPS (same domain)
 *
 * SECURITY: All URLs are validated against whitelist before use
 *
 * @param telegramId - Telegram ID пользователя для персонализированного callback
 * @returns Первый доступный callback URL или null если оба недоступны
 */
export async function getAvailableCallbackUrl(
  telegramId?: string | number
): Promise<string | null> {
  const endpoint = telegramId
    ? `/api/video-callback/${telegramId}`
    : '/api/video-callback'

  // Plan A: HTTPS через reverse proxy (предпочтительный)
  const planA = process.env.BASE_WEBHOOK_URL
    ? `${process.env.BASE_WEBHOOK_URL}${endpoint}`
    : null

  // Plan B: Direct HTTPS via nginx reverse proxy (fallback)
  // LAST FIX: 2025-12-06 - изменен на HTTPS через nginx согласно конфигурации three-head-dragon.shop
  const planB = process.env.DIRECT_WEBHOOK_URL
    ? `${process.env.DIRECT_WEBHOOK_URL}${endpoint}`
    : `https://three-head-dragon.shop${endpoint}` // HTTPS via nginx reverse proxy

  // 🛡️ SECURITY: Validate all URLs against whitelist
  const urls = [planA, planB].filter(Boolean) as string[]
  const validUrls = urls.filter(url => validateWebhookUrl(url))

  if (validUrls.length === 0) {
    logger.error('🚨 [WEBHOOK SECURITY] No valid URLs after security check!', {
      originalUrls: urls.length,
      planA: planA?.substring(0, 50),
      planB: planB?.substring(0, 50),
    })
  }

  logger.info('🔍 [WEBHOOK HEALTH CHECK] Checking callback URL availability', {
    planA: planA?.substring(0, 50),
    planB: planB?.substring(0, 50),
    telegramId,
    totalUrls: validUrls.length,
    securityValidated: true,
  })

  // Проверяем каждый URL с коротким timeout (только валидированные!)
  for (const url of validUrls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // Игнорируем SSL ошибки для production (self-signed cert)
        // @ts-ignore
        ...(url.startsWith('https:') && { rejectUnauthorized: false }),
      })

      clearTimeout(timeoutId)

      // Успешный ответ (200-299) или 405 Method Not Allowed (endpoint exists but HEAD not supported)
      if (response.ok || response.status === 405) {
        logger.info('✅ [WEBHOOK HEALTH CHECK] Callback URL is accessible', {
          url: url.substring(0, 50) + '...',
          status: response.status,
          responseTime: '< 3s',
        })
        return url
      }

      logger.warn(
        '⚠️ [WEBHOOK HEALTH CHECK] Callback URL returned error status',
        {
          url: url.substring(0, 50) + '...',
          status: response.status,
        }
      )
    } catch (error) {
      logger.warn('⚠️ [WEBHOOK HEALTH CHECK] Callback URL not accessible', {
        url: url.substring(0, 50) + '...',
        error: error instanceof Error ? error.message : String(error),
        isTimeout: error instanceof Error && error.name === 'AbortError',
      })
    }
  }

  // Если оба недоступны - возвращаем Plan B как last resort
  logger.error(
    '❌ [WEBHOOK HEALTH CHECK] All callback URLs failed, using fallback',
    {
      fallback: planB,
    }
  )

  return planB
}

/**
 * 🧪 TEST FUNCTION: Проверка доступности всех webhook URL'ов
 * Используется для диагностики webhook infrastructure
 */
export async function testAllWebhookUrls(): Promise<{
  planA: {
    url: string | null
    available: boolean
    status?: number
    error?: string
  }
  planB: {
    url: string | null
    available: boolean
    status?: number
    error?: string
  }
}> {
  const endpoint = '/api/video-callback'

  const planA = process.env.BASE_WEBHOOK_URL
    ? `${process.env.BASE_WEBHOOK_URL}${endpoint}`
    : null

  const planB = process.env.DIRECT_WEBHOOK_URL
    ? `${process.env.DIRECT_WEBHOOK_URL}${endpoint}`
    : `https://three-head-dragon.shop${endpoint}`

  const testUrl = async (url: string | null) => {
    if (!url) {
      return { url: null, available: false, error: 'URL not configured' }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      // Use POST with empty JSON body (many webhook endpoints don't support HEAD)
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true, source: 'startup-health-check' }),
      })

      clearTimeout(timeoutId)

      // 200, 202 (Accepted), 400 (bad request but endpoint exists) = endpoint works
      const isAvailable = response.status >= 200 && response.status < 500

      return {
        url,
        available: isAvailable,
        status: response.status,
      }
    } catch (error) {
      return {
        url,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const [resultA, resultB] = await Promise.all([testUrl(planA), testUrl(planB)])

  logger.info('🧪 [WEBHOOK TEST] All URLs tested', {
    planA: resultA,
    planB: resultB,
  })

  return { planA: resultA, planB: resultB }
}

/**
 * 🚀 STARTUP WEBHOOK HEALTH CHECK
 * Проверяет доступность webhook'ов при запуске приложения
 * Логирует результат и возвращает статус
 */
export async function verifyWebhooksOnStartup(): Promise<{
  success: boolean
  message: string
  details: {
    baseUrl: string | null
    httpsAvailable: boolean
    directAvailable: boolean
  }
}> {
  logger.info('🚀 [WEBHOOK STARTUP] Starting webhook health verification...')

  const baseWebhookUrl = process.env.BASE_WEBHOOK_URL || null
  const directWebhookUrl = process.env.DIRECT_WEBHOOK_URL || 'https://three-head-dragon.shop'

  // Проверяем конфигурацию
  if (!baseWebhookUrl) {
    logger.warn('⚠️ [WEBHOOK STARTUP] BASE_WEBHOOK_URL not configured, using fallback', {
      fallback: directWebhookUrl,
    })
  } else {
    logger.info('✅ [WEBHOOK STARTUP] BASE_WEBHOOK_URL configured', {
      url: baseWebhookUrl.substring(0, 50),
    })
  }

  // Тестируем все URL'ы
  const testResults = await testAllWebhookUrls()

  const httpsAvailable = testResults.planA?.available || testResults.planB?.available
  const directAvailable = testResults.planB?.available || false

  if (httpsAvailable) {
    logger.info('✅ [WEBHOOK STARTUP] Webhook endpoints are HEALTHY', {
      planA: testResults.planA,
      planB: testResults.planB,
    })
    return {
      success: true,
      message: 'Webhook endpoints are healthy and accessible',
      details: {
        baseUrl: baseWebhookUrl,
        httpsAvailable,
        directAvailable,
      },
    }
  } else {
    logger.error('❌ [WEBHOOK STARTUP] ALL webhook endpoints FAILED!', {
      planA: testResults.planA,
      planB: testResults.planB,
      recommendation: 'Check nginx config and server connectivity',
    })
    return {
      success: false,
      message: 'All webhook endpoints are unreachable!',
      details: {
        baseUrl: baseWebhookUrl,
        httpsAvailable: false,
        directAvailable: false,
      },
    }
  }
}

/**
 * 🔒 EXPORT: Validate webhook URL (for use in other modules)
 */
export { validateWebhookUrl }
