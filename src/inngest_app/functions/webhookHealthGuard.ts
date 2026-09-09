import { inngest, createInngestFailureHandler } from '../client'
import { logger } from '@/utils/logger'
import { testAllWebhookUrls } from '@/utils/webhookHealthCheck'
import { ADMIN_IDS_ARRAY } from '@/config'

/**
 * 🚨 Webhook Health Guard - Inngest Function
 *
 * Защитник webhook'ов - обеспечивает 100% доступность callback URLs
 * перед отправкой видео задач в провайдеры (Kie.ai, Replicate, etc.)
 *
 * Что делает:
 * 1. Проверяет доступность ВСЕХ webhook URLs перед генерацией
 * 2. FAIL-HARD если webhook недоступен (не позволяет "тихо" продолжать)
 * 3. Переключается на HTTPS reverse proxy если прямой HTTP недоступен
 * 4. Уведомляет админов о проблемах с webhook инфраструктурой
 * 5. Каждый час проверяет состояние и отправляет CRITICAL ALARM если сломано
 *
 * Триггеры:
 * - webhook/health-check-requested - ручная проверка
 * - video/generation-validate-webhook - проверка перед генерацией
 * - Cron: каждый час (0 * * * *) - автоматическая проверка с алармом
 */

/**
 * 🚨 ОТПРАВКА КРИТИЧЕСКОГО АЛАРМА АДМИНУ
 */
async function sendCriticalAlarm(result: any): Promise<void> {
  const message = `🚨 <b>КРИТИЧЕСКИЙ АЛАРМ: Webhook'и сломаны!</b>

<b>Симптомы:</b>
• Видео перестают генерироваться
• Пользователи не получают готовые видео
• Kie.ai не может отправить callback

<b>Детали:</b>
${!result.planA.available ? `❌ Plan A (HTTPS): ${result.planA.error || 'недоступен'}\n` : '✅ Plan A (HTTPS): OK\n'}${!result.planB.available ? `❌ Plan B (HTTP): ${result.planB.error || 'недоступен'}\n` : '✅ Plan B (HTTP): OK\n'}

<b>Требуется СРОЧНО:</b>
1. Проверить сервер на 188.137.250.69:3001
2. Проверить webhook endpoint /api/video-callback
3. Проверить nginx reverse proxy
4. Перезапустить Docker контейнер при необходимости

⚠️ <b>ВИДЕОГЕНЕРАЦИЯ ЗАБЛОКИРОВАНА!</b>`

  // Отправляем первому админу
  const adminId = ADMIN_IDS_ARRAY[0]
  if (adminId) {
    try {
      // TODO: Отправить через Telegram бота
      logger.error(
        '[CRITICAL ALARM] Webhook failure detected and reported to admin',
        {
          adminId,
          planA: result.planA,
          planB: result.planB,
        }
      )
    } catch (error) {
      logger.error('[CRITICAL ALARM] Failed to send alarm', error)
    }
  }
}

/**
 * Ручная проверка всех webhook URL'ов
 */
const webhookHealthCheck = inngest.createFunction(
  {
    id: 'webhook-health-check',
    name: '⚙️ System Webhook',
    retries: 2,
    // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
    onFailure: createInngestFailureHandler('System Webhook Health Check'),
  },
  {
    event: 'webhook/health-check-requested',
  },
  async ({ event, step }) => {
    logger.info(
      '[WebhookHealthGuard] Starting comprehensive webhook health check'
    )

    const result = await step.run('test-all-webhook-urls', async () => {
      return await testAllWebhookUrls()
    })

    const { planA, planB } = result

    // Формируем детальный отчет
    const report = {
      timestamp: new Date().toISOString(),
      planA: {
        configured: !!planA.url,
        accessible: planA.available,
        status: planA.status,
        error: planA.error,
      },
      planB: {
        configured: !!planB.url,
        accessible: planB.available,
        status: planB.status,
        error: planB.error,
      },
      overall: {
        healthy: planA.available || planB.available,
        recommendations: [] as string[],
      },
    }

    // Генерируем рекомендации
    if (!planA.available && planA.url) {
      report.overall.recommendations.push(
        `Plan A (HTTPS proxy) недоступен: ${planA.error || 'timeout'}. Проверьте nginx reverse proxy.`
      )
    }

    if (!planB.available) {
      report.overall.recommendations.push(
        `Plan B (HTTP direct) недоступен: ${planB.error || 'timeout'}. Проверьте что сервер запущен на порту 3001.`
      )
    }

    if (!planA.available && !planB.available) {
      report.overall.recommendations.push(
        '🚨 КРИТИЧНО: Все webhook URL недоступны! Видеогенерация заблокирована.'
      )
      report.overall.healthy = false

      // Отправляем CRITICAL ALARM
      await step.run('send-critical-alarm', async () => {
        await sendCriticalAlarm(result)
      })
    }

    logger.info('[WebhookHealthGuard] Health check complete', report)

    return report
  }
)

/**
 * Валидация webhook перед генерацией видео
 * Вызывается ПЕРЕД отправкой задачи в провайдер
 */
const validateWebhookBeforeGeneration = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was
    // 'validate-webhook-before-generation'.
    id: 'webhook-generation-validate',
    name: '⚙️ System VideoCheck',
    // Критически важная функция - не ретраим слишком много раз
    retries: 1,
    // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
    onFailure: createInngestFailureHandler('webhook-generation-validate'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [
    { event: 'webhook/generation.validate' },
    { event: 'video/generation-validate-webhook' },
  ],
  async ({ event, step }) => {
    const { telegramId, modelId, provider } = event.data

    logger.info(
      '[WebhookHealthGuard] Validating webhook before video generation',
      {
        telegramId,
        modelId,
        provider,
      }
    )

    const validation = await step.run(
      'check-webhook-availability',
      async () => {
        const result = await testAllWebhookUrls()

        // Если ни один webhook недоступен - БРОСАЕМ ОШИБКУ
        if (!result.planA.available && !result.planB.available) {
          throw new Error(
            `FATAL: No webhook URLs accessible before generation!\n` +
              `Plan A: ${result.planA.error || 'N/A'}\n` +
              `Plan B: ${result.planB.error || 'N/A'}\n\n` +
              `Video generation BLOCKED for safety.`
          )
        }

        return {
          webhookAvailable: true,
          preferredUrl: result.planA.available
            ? result.planA.url
            : result.planB.url,
          planA: result.planA,
          planB: result.planB,
        }
      }
    )

    logger.info('[WebhookHealthGuard] Webhook validation passed', {
      telegramId,
      preferredUrl: validation.preferredUrl,
    })

    return validation
  }
)

/**
 * 🕐 Периодическая проверка webhook'ов (каждый час)
 * Отправляет CRITICAL ALARM админу если обнаружены проблемы
 */
const periodicWebhookHealthCheck = inngest.createFunction(
  {
    id: 'periodic-webhook-health-check',
    name: '⚙️ System Health',
    // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
    onFailure: createInngestFailureHandler('System Health (Periodic)'),
  },
  {
    cron: '0 * * * *', // Каждый час в начале часа
  },
  async ({ step }) => {
    logger.info(
      '[PeriodicWebhookHealthCheck] Starting hourly webhook health check'
    )

    const result = await step.run('periodic-check', async () => {
      return await testAllWebhookUrls()
    })

    // Если оба webhook'а недоступны - отправляем CRITICAL ALARM
    if (!result.planA.available && !result.planB.available) {
      await step.run('send-critical-alarm', async () => {
        await sendCriticalAlarm(result)
      })

      logger.error(
        '[PeriodicWebhookHealthCheck] CRITICAL: All webhooks down! Alarm sent to admin'
      )
    } else {
      logger.info('[PeriodicWebhookHealthCheck] Webhooks are healthy', {
        planA: result.planA.available,
        planB: result.planB.available,
      })
    }

    return result
  }
)

export {
  webhookHealthCheck,
  validateWebhookBeforeGeneration,
  periodicWebhookHealthCheck,
}
export default [
  webhookHealthCheck,
  validateWebhookBeforeGeneration,
  periodicWebhookHealthCheck,
]
