import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { logger } from '@/utils/logger'
import { OpenAI } from 'openai'
import { getMonitoringBot } from './monitoringBot'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { resolveMonitorProvider, type MonitorProvider } from './logMonitor'
import { resolveAlertDestination } from '@/services/telegram-log.service'

/**
 * Render whatever the sender put in `event.data.error` as readable text.
 * Accepts `string | Error | { message } | unknown` and never yields
 * "[object Object]". Exported for tests.
 */
export function renderErrorText(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return 'Unknown error'
  if (typeof raw === 'string') return raw
  if (raw instanceof Error) return raw.message || raw.name || 'Error'
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim() !== '') {
      const name = typeof o.name === 'string' ? `${o.name}: ` : ''
      return `${name}${o.message}`
    }
    if (typeof o.error === 'string' && o.error.trim() !== '') return o.error
    try {
      const json = JSON.stringify(raw)
      return json && json !== '{}' ? json.slice(0, 1000) : 'Unknown error'
    } catch {
      return 'Unknown error (unserialisable payload)'
    }
  }
  return String(raw)
}

/** Stack may arrive as a string or nested inside an Error-like object. */
export function renderErrorStack(
  raw: unknown,
  errorField: unknown
): string | undefined {
  if (typeof raw === 'string' && raw.trim() !== '') return raw
  if (errorField && typeof errorField === 'object') {
    const st = (errorField as Record<string, unknown>).stack
    if (typeof st === 'string' && st.trim() !== '') return st
  }
  return undefined
}

// Константы.
// ADMIN_TELEGRAM_ID is a comma-separated LIST on the production service, and
// Telegram's chat_id is one id. Passing it raw returned 400 "chat not found",
// so every alert this monitor ever raised failed to arrive. Same defect, same
// remedy as logMonitor.ts: resolveAlertDestination() takes the first id.
const { chatId: GROUP_CHAT_ID } = resolveAlertDestination()
const ADMIN_DIRECT_CHAT_ID = GROUP_CHAT_ID

/**
 * The same key-to-the-wrong-door wiring that made logMonitor fail its 401 every
 * day at 13:00 lived here byte for byte. One resolver now serves both.
 */
let openai: OpenAI | null = null
let openaiKeyedOn = ''
function getOpenAI(): { client: OpenAI; provider: MonitorProvider } {
  const provider = resolveMonitorProvider()
  if (!provider) {
    throw new Error(
      'GLM_API_KEY, OPENAI_API_KEY or DEEPSEEK_API_KEY is required'
    )
  }
  const cacheKey = `${provider.name}|${provider.baseURL ?? ''}|${provider.apiKey.slice(-6)}`
  if (!openai || openaiKeyedOn !== cacheKey) {
    openai = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL })
    openaiKeyedOn = cacheKey
  }
  return { client: openai, provider }
}

interface ErrorContext {
  error: string
  stack?: string
  endpoint?: string
  userId?: string
  timestamp: string
  severity: 'critical' | 'high' | 'medium'
  context?: any
}

// Анализ ошибки и генерация решения
async function analyzeError(errorContext: ErrorContext): Promise<{
  analysis: string
  solution: string
  urgency: 'immediate' | 'high' | 'normal'
  tags: string[]
}> {
  const prompt = `Ты опытный DevOps инженер. Проанализируй эту ошибку и предложи решение:

Ошибка: ${errorContext.error}
Стек: ${errorContext.stack || 'Не доступен'}
Эндпоинт: ${errorContext.endpoint || 'Неизвестен'}
Время: ${errorContext.timestamp}
Контекст: ${JSON.stringify(errorContext.context || {})}

Предоставь:
1. Краткий анализ причины ошибки
2. Конкретные шаги для исправления
3. Уровень срочности (immediate/high/normal)
4. Теги для категоризации

Ответ в JSON формате:
{
  "analysis": "Краткий анализ",
  "solution": "Шаги решения",
  "urgency": "immediate|high|normal",
  "tags": ["tag1", "tag2"]
}`

  try {
    const { client, provider } = getOpenAI()
    const response = await client.chat.completions.create({
      model: provider.model,
      messages: [
        {
          role: 'system',
          content:
            'Ты опытный DevOps инженер, специализирующийся на Node.js и TypeScript приложениях.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
      // GLM charges reasoning against max_tokens: at 16 it spent all of them
      // thinking and returned empty content with finish_reason "stop". See the
      // measurement in logMonitor.ts.
      ...provider.extraBody,
    })

    return JSON.parse(response.choices[0].message.content || '{}')
  } catch (error) {
    logger.error('Error analyzing with AI:', error)

    // Fallback анализ
    return {
      analysis: 'Обнаружена критическая ошибка, требующая внимания',
      solution:
        '1. Проверить логи\n2. Перезапустить сервис\n3. Исследовать причину',
      urgency: errorContext.severity === 'critical' ? 'immediate' : 'high',
      tags: ['error', errorContext.severity],
    }
  }
}

// Форматирование сообщения для Telegram
function formatErrorMessage(
  errorContext: ErrorContext,
  analysis: {
    analysis: string
    solution: string
    urgency: 'immediate' | 'high' | 'normal'
    tags: string[]
  }
): string {
  const urgencyEmoji = {
    immediate: '🚨🔴',
    high: '⚠️🟡',
    normal: 'ℹ️🔵',
  }

  let message = `${urgencyEmoji[analysis.urgency]} <b>ОБНАРУЖЕНА ОШИБКА</b>\n\n`

  message += `<b>🐛 Ошибка:</b> <code>${errorContext.error}</code>\n`
  message += `<b>📍 Место:</b> ${errorContext.endpoint || 'Неизвестно'}\n`
  message += `<b>🕐 Время:</b> ${new Date(errorContext.timestamp).toLocaleString('ru-RU')}\n`
  message += `<b>⚡ Уровень:</b> ${errorContext.severity.toUpperCase()}\n\n`

  message += `<b>🔍 Анализ:</b>\n${analysis.analysis}\n\n`

  message += `<b>🛠 Решение:</b>\n${analysis.solution}\n\n`

  if (errorContext.stack && errorContext.stack.length < 500) {
    message += `<b>📚 Стек вызовов:</b>\n<pre>${errorContext.stack.split('\n').slice(0, 5).join('\n')}</pre>\n\n`
  }

  message += `<b>🏷 Теги:</b> ${analysis.tags.map(tag => `#${tag}`).join(' ')}\n`

  // Добавляем призыв к действию
  if (analysis.urgency === 'immediate') {
    message += '\n⚡ <b>ТРЕБУЕТСЯ НЕМЕДЛЕННОЕ ВМЕШАТЕЛЬСТВО!</b>'
  } else if (analysis.urgency === 'high') {
    message += '\n⏰ <b>Рекомендуется исправить в ближайшее время</b>'
  }

  return message
}

// Отправка уведомления
async function sendErrorNotification(
  message: string,
  urgency: string
): Promise<void> {
  const bot = getMonitoringBot()

  try {
    // Всегда отправляем в группу (сейчас админу)
    await bot.telegram.sendMessage(GROUP_CHAT_ID, message, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })

    // A critical error is copied to the admin -- but only if that really is a
    // different address. GROUP_CHAT_ID *was* ADMIN_TELEGRAM_ID, so the
    // "duplicate" landed in the very same chat and the owner read every
    // immediate alert twice.
    if (urgency === 'immediate' && ADMIN_DIRECT_CHAT_ID !== GROUP_CHAT_ID) {
      await bot.telegram.sendMessage(
        ADMIN_DIRECT_CHAT_ID,
        `🚨 <b>КРИТИЧЕСКАЯ ОШИБКА!</b>\n\n${message}`,
        { parse_mode: 'HTML' }
      )
    }

    logger.info('Error notification sent successfully')
  } catch (error) {
    logger.error('Failed to send error notification:', error)
    throw error
  }
}

// Функция мониторинга критических ошибок
export const criticalErrorMonitor = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'critical-error-monitor'.
    id: 'monitoring-error-report',
    name: '🚨 Critical Error Monitor',
    retries: 1,
    // Paid OpenAI analysis → admin visibility if the monitor itself fails.
    onFailure: createInngestFailureHandler('monitoring-error-report'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [{ event: 'monitoring/error.report' }, { event: 'app/error.critical' }],
  async ({ event, step }) => {
    const errorContext: ErrorContext = {
      // Senders pass string | Error | {message} — render safely, never
      // "[object Object]" (see renderErrorText).
      error: renderErrorText(event.data.error),
      stack: renderErrorStack(event.data.stack, event.data.error),
      endpoint: event.data.endpoint,
      userId: event.data.userId,
      timestamp: event.data.timestamp || new Date().toISOString(),
      severity: event.data.severity || 'high',
      context: event.data.context,
    }

    // logger.error itself posts to the admin chat; a probe (safe mode) is not
    // an incident, so it is logged at warn and the notification is not sent.
    const safeMode = isSafeMode(event)
    if (safeMode) {
      logger.warn(
        '🛡️ [ERROR MONITOR] safe mode — probe error context',
        errorContext
      )
    } else {
      logger.error('Critical error detected:', errorContext)
    }

    // Шаг 1: Анализ ошибки (paid LLM call → skipped in safe mode)
    const analysis = await step.run('analyze-error', async () => {
      if (safeMode) {
        const skipped = skippedInSafeMode('openai analyzeError')
        logger.warn(
          '🛡️ [ERROR MONITOR] safe mode — LLM analysis skipped',
          skipped
        )
        return {
          analysis: 'safe mode: analysis skipped',
          solution: 'n/a',
          urgency: 'normal' as const,
          tags: ['safe-mode'],
        }
      }
      return await analyzeError(errorContext)
    })

    // Шаг 2: Форматирование сообщения
    const message = await step.run('format-message', async () => {
      return formatErrorMessage(errorContext, {
        analysis: analysis.analysis || '',
        solution: analysis.solution || '',
        urgency: analysis.urgency || 'normal',
        tags: analysis.tags || [],
      })
    })

    // Шаг 3: Отправка уведомления
    await step.run('send-notification', async () => {
      if (safeMode) return skippedInSafeMode('send-notification')
      await sendErrorNotification(message, analysis.urgency)
    })

    // Шаг 4: Логирование для дальнейшего анализа
    await step.run('log-for-analysis', async () => {
      logger.info('Error processed and notification sent', {
        errorId: event.id,
        urgency: analysis.urgency,
        tags: analysis.tags,
      })
    })

    return {
      success: true,
      errorId: event.id,
      urgency: analysis.urgency,
      notificationSent: true,
      timestamp: new Date().toISOString(),
    }
  }
)

// Функция для проверки состояния сервисов
export const healthCheck = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'health-check'.
    id: 'monitoring-health-check',
    name: '💚 Health Check Monitor',
    retries: 2,
  },
  {
    // Проверяем каждые 30 минут
    cron: '*/30 * * * *',
  },
  async ({ event, step }) => {
    const results: any[] = []

    // Проверка основного API
    const apiHealth = await step.run('check-api-health', async () => {
      try {
        // BASE_WEBHOOK_URL is the var actually set in Railway; WEBHOOK_URL was
        // never set, so this probed a dead localhost:4000 (the API listens on
        // PORT=3000) and every run reported "Main API down" while the real
        // /health returned 200 — a standing false alarm to the admin.
        const response = await fetch(
          `${
            process.env.BASE_WEBHOOK_URL ||
            `http://localhost:${process.env.PORT || 3000}`
          }/health`
        )
        return {
          service: 'Main API',
          status: response.ok ? 'healthy' : 'unhealthy',
          statusCode: response.status,
        }
      } catch (error: any) {
        return {
          service: 'Main API',
          status: 'error',
          error: error.message,
        }
      }
    })
    results.push(apiHealth)

    // Проверка Inngest
    const inngestHealth = await step.run('check-inngest-health', async () => {
      try {
        // Inngest is a separate Railway service, not localhost: use the
        // configured INNGEST_BASE_URL (its /health returns 200 OK).
        const response = await fetch(
          `${process.env.INNGEST_BASE_URL || 'http://localhost:8288'}/health`
        )
        return {
          service: 'Inngest',
          status: response.ok ? 'healthy' : 'unhealthy',
          statusCode: response.status,
        }
      } catch (error: any) {
        return {
          service: 'Inngest',
          status: 'error',
          error: error.message,
        }
      }
    })
    results.push(inngestHealth)

    // Анализ результатов
    const unhealthyServices = results.filter(r => r.status !== 'healthy')

    // Если есть проблемы, отправляем уведомление
    if (unhealthyServices.length > 0) {
      await step.run('notify-unhealthy', async () => {
        const bot = getMonitoringBot()

        let message = '⚠️ <b>Обнаружены проблемы с сервисами:</b>\n\n'
        for (const service of unhealthyServices) {
          message += `❌ <b>${service.service}:</b> ${service.status}\n`
          if (service.error) {
            message += `   Ошибка: ${service.error}\n`
          }
        }

        message += '\n🔧 Требуется проверка!'

        await bot.telegram.sendMessage(GROUP_CHAT_ID, message, {
          parse_mode: 'HTML',
        })
      })
    }

    return {
      success: true,
      healthyServices: results.filter(r => r.status === 'healthy').length,
      unhealthyServices: unhealthyServices.length,
      timestamp: new Date().toISOString(),
    }
  }
)
