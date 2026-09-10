import { inngest } from '@/inngest_app/client'
import { logger } from '@/utils/logger'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { OpenAI } from 'openai'
import { getMonitoringBot } from './monitoringBot'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { createInngestFailureHandler } from '@/inngest_app/client'
import {
  fetchFunctionsStatusSafe,
  renderRunsSummaryText,
} from '@/inngest_app/status/functionsStatus'

// Константы для бота и группы
// Токен бота больше не хардкодится: см. getMonitoringBot() в ./monitoringBot
// Временно отправляем админу, пока бот не добавлен в группу
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '144022504'
const GROUP_CHAT_ID = ADMIN_TELEGRAM_ID // Используем ID админа вместо группы

// Ленивая инициализация OpenAI (загружается при первом использовании)
let openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY or DEEPSEEK_API_KEY is required')
    }
    openai = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_API_KEY
        ? 'https://api.deepseek.com'
        : undefined,
    })
  }
  return openai
}

// Интерфейс для результата анализа
export interface LogAnalysisResult {
  status: 'healthy' | 'warning' | 'critical'
  summary: string
  errors: Array<{
    message: string
    count: number
    severity: 'low' | 'medium' | 'high'
    solution?: string
  }>
  warnings: Array<{
    message: string
    count: number
  }>
  statistics: {
    totalRequests?: number
    successRate?: number
    averageResponseTime?: number
    errorRate?: number
    topEndpoints?: Array<{ endpoint: string; count: number }>
  }
  recommendations: string[]
  achievements?: string[]
}

// Функция для чтения логов
export function resolveLogPath(): { logDir: string; logPath: string; enabled: boolean } {
  const logDir = process.env.LOG_DIR || '/tmp/logs'
  const logPath = join(logDir, 'combined.log')
  return { logDir, logPath, enabled: existsSync(logPath) }
}

async function readLogs(): Promise<string> {
  const logDir = process.env.LOG_DIR || '/tmp/logs'
  const logPath = join(logDir, 'combined.log')

  if (!existsSync(logPath)) {
    logger.warn(`Log file not found at ${logPath}`)
    return ''
  }

  try {
    // Читаем последние 10000 символов логов (чтобы не перегружать AI)
    const fullLog = readFileSync(logPath, 'utf-8')
    const last24Hours = filterLast24Hours(fullLog)
    return last24Hours.slice(-50000) // Последние 50KB логов
  } catch (error) {
    logger.error('Error reading logs:', error)
    return ''
  }
}

// Фильтрация логов за последние 24 часа
function filterLast24Hours(logs: string): string {
  const lines = logs.split('\n')
  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000

  return lines
    .filter(line => {
      try {
        const match = line.match(/"timestamp":"([^"]+)"/)
        if (match) {
          const timestamp = new Date(match[1]).getTime()
          return timestamp > dayAgo
        }
        return false
      } catch {
        return false
      }
    })
    .join('\n')
}

// Анализ логов с помощью AI
async function analyzeLogs(logs: string): Promise<LogAnalysisResult> {
  if (!logs) {
    return {
      status: 'warning',
      summary: 'Нет логов за последние 24 часа',
      errors: [],
      warnings: [],
      statistics: {},
      recommendations: ['Проверить работоспособность системы логирования'],
    }
  }

  const systemPrompt = `Ты - опытный DevOps инженер, анализирующий логи приложения.
Твоя задача - проанализировать логи за последние 24 часа и предоставить детальный отчет.

Обрати внимание на:
1. Ошибки и их частоту
2. Предупреждения и аномалии
3. Общую статистику запросов
4. Производительность системы
5. Потенциальные проблемы безопасности

Верни результат в формате JSON со следующей структурой:
{
  "status": "healthy|warning|critical",
  "summary": "Краткое описание состояния системы",
  "errors": [
    {
      "message": "Описание ошибки",
      "count": число_повторений,
      "severity": "low|medium|high",
      "solution": "Предлагаемое решение"
    }
  ],
  "warnings": [
    {
      "message": "Описание предупреждения",
      "count": число_повторений
    }
  ],
  "statistics": {
    "totalRequests": число,
    "successRate": процент,
    "averageResponseTime": миллисекунды,
    "errorRate": процент,
    "topEndpoints": [
      {"endpoint": "путь", "count": число}
    ]
  },
  "recommendations": ["Рекомендация 1", "Рекомендация 2"],
  "achievements": ["Достижение 1", "Достижение 2"]
}`

  try {
    const client = getOpenAI()
    const response = await client.chat.completions.create({
      model: process.env.DEEPSEEK_API_KEY
        ? 'deepseek-chat'
        : 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проанализируй следующие логи:\n\n${logs}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')
    return result as LogAnalysisResult
  } catch (error) {
    logger.error('Error analyzing logs with AI:', error)

    // Fallback анализ без AI
    return basicLogAnalysis(logs)
  }
}

// Базовый анализ логов без AI
function basicLogAnalysis(logs: string): LogAnalysisResult {
  const lines = logs.split('\n')
  const errors = lines.filter(line => line.includes('"level":"error"')).length
  const warnings = lines.filter(line => line.includes('"level":"warn"')).length
  const info = lines.filter(line => line.includes('"level":"info"')).length

  const status = errors > 10 ? 'critical' : errors > 5 ? 'warning' : 'healthy'

  return {
    status,
    summary: `Обработано ${lines.length} записей логов. Ошибок: ${errors}, Предупреждений: ${warnings}`,
    errors:
      errors > 0
        ? [
            {
              message: 'Обнаружены ошибки в логах',
              count: errors,
              severity: errors > 10 ? 'high' : 'medium',
              solution: 'Требуется детальный анализ ошибок',
            },
          ]
        : [],
    warnings:
      warnings > 0
        ? [
            {
              message: 'Обнаружены предупреждения',
              count: warnings,
            },
          ]
        : [],
    statistics: {
      totalRequests: info,
      errorRate: (errors / (lines.length || 1)) * 100,
    },
    recommendations:
      errors > 0
        ? ['Исследовать и устранить источники ошибок']
        : ['Система работает стабильно'],
  }
}

// Генерация креативного сообщения для Telegram
async function generateTelegramMessage(
  analysis: LogAnalysisResult
): Promise<string> {
  const statusEmoji = {
    healthy: '✅',
    warning: '⚠️',
    critical: '🚨',
  }

  const severityEmoji = {
    low: '📝',
    medium: '⚡',
    high: '🔥',
  }

  let message = `${statusEmoji[analysis.status]} <b>Отчет мониторинга системы</b>\n`
  message += `📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n`

  message += `<b>📊 Общий статус:</b> ${analysis.summary}\n\n`

  // Статистика
  if (Object.keys(analysis.statistics).length > 0) {
    message += `<b>📈 Статистика за 24 часа:</b>\n`
    if (analysis.statistics.totalRequests) {
      message += `• Всего запросов: ${analysis.statistics.totalRequests}\n`
    }
    if (analysis.statistics.successRate !== undefined) {
      message += `• Успешность: ${analysis.statistics.successRate.toFixed(1)}%\n`
    }
    if (analysis.statistics.errorRate !== undefined) {
      message += `• Уровень ошибок: ${analysis.statistics.errorRate.toFixed(2)}%\n`
    }
    if (analysis.statistics.averageResponseTime) {
      message += `• Среднее время ответа: ${analysis.statistics.averageResponseTime}мс\n`
    }
    message += '\n'
  }

  // Ошибки
  if (analysis.errors.length > 0) {
    message += `<b>❌ Обнаруженные проблемы:</b>\n`
    for (const error of analysis.errors.slice(0, 3)) {
      // Максимум 3 ошибки
      message += `${severityEmoji[error.severity]} ${error.message}\n`
      message += `   Повторений: ${error.count}\n`
      if (error.solution) {
        message += `   💡 Решение: ${error.solution}\n`
      }
    }
    message += '\n'
  }

  // Предупреждения
  if (analysis.warnings.length > 0) {
    message += `<b>⚡ Предупреждения:</b>\n`
    for (const warning of analysis.warnings.slice(0, 3)) {
      message += `• ${warning.message} (×${warning.count})\n`
    }
    message += '\n'
  }

  // Рекомендации
  if (analysis.recommendations.length > 0) {
    message += `<b>🎯 Рекомендации:</b>\n`
    for (const rec of analysis.recommendations) {
      message += `• ${rec}\n`
    }
    message += '\n'
  }

  // Достижения (если есть)
  if (analysis.achievements && analysis.achievements.length > 0) {
    message += `<b>🏆 Достижения:</b>\n`
    for (const achievement of analysis.achievements) {
      message += `• ${achievement}\n`
    }
    message += '\n'
  }

  // Добавляем мотивационную фразу в зависимости от статуса
  if (analysis.status === 'healthy') {
    const healthyPhrases = [
      '💪 Система работает как швейцарские часы!',
      '🚀 Всё идёт по плану, капитан!',
      '🌟 Отличная работа! Держим планку!',
      '✨ Стабильность - признак мастерства!',
      '🎯 Цель достигнута: нулевой даунтайм!',
    ]
    message += `\n${healthyPhrases[Math.floor(Math.random() * healthyPhrases.length)]}`
  } else if (analysis.status === 'warning') {
    message += '\n⚡ Требуется внимание, но ситуация под контролем!'
  } else {
    message += '\n🔧 Пора засучить рукава и исправить проблемы!'
  }

  // Добавляем хештеги
  message += '\n\n#мониторинг #devops #ai_server'

  return message
}

// Отправка сообщения в Telegram
async function sendTelegramNotification(message: string): Promise<void> {
  try {
    const bot = getMonitoringBot()

    // Отправляем в группу (сейчас админу)
    await bot.telegram.sendMessage(GROUP_CHAT_ID, message, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })

    // Если есть критические ошибки, дублируем администратору
    if (message.includes('🚨')) {
      await bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `🚨 <b>КРИТИЧЕСКОЕ УВЕДОМЛЕНИЕ</b>\n\n${message}`,
        { parse_mode: 'HTML' }
      )
    }

    logger.info('Log monitoring report sent successfully')
  } catch (error) {
    logger.error('Error sending Telegram notification:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Fallback when file logging is disabled on the host (Railway: no LOG_DIR /
// combined.log). Instead of a blind "no logs" warning we summarise the last
// 24h of Inngest runs via the read-only GraphQL status module.
// ---------------------------------------------------------------------------
export const FILE_LOGGING_DISABLED_TEXT = 'file logging is disabled on this host'

export async function buildInngestRunsFallbackAnalysis(
  now: Date = new Date()
): Promise<LogAnalysisResult> {
  const { logDir, logPath } = resolveLogPath()
  const where = `${FILE_LOGGING_DISABLED_TEXT} (LOG_DIR=${logDir}, ${logPath} absent)`
  const status = await fetchFunctionsStatusSafe({ now })

  if (status.ok === false) {
    const failure = status.error
    return {
      status: 'warning',
      summary: `${where}; Inngest run summary unavailable: ${failure.error}`,
      errors: [],
      warnings: [
        { message: `Inngest GraphQL unreachable at ${failure.gqlUrl}`, count: 1 },
      ],
      statistics: {},
      recommendations: [
        'Set INNGEST_GQL_URL (or INNGEST_BASE_URL) to the Inngest server reachable from this host',
        'Or enable file logging by setting LOG_DIR to a writable directory',
      ],
    }
  }

  const payload = status.payload
  const totals = payload.functions.reduce(
    (acc, f) => {
      acc.completed += f.runs24h.completed
      acc.failed += f.runs24h.failed
      acc.running += f.runs24h.running
      acc.invoked += f.runs24h.invoked
      acc.total += f.runs24h.total
      return acc
    },
    { completed: 0, failed: 0, running: 0, invoked: 0, total: 0 }
  )
  const errors: LogAnalysisResult['errors'] = payload.functions
    .filter(f => f.runs24h.failed > 0)
    .sort((a, b) => b.runs24h.failed - a.runs24h.failed)
    .map(f => ({
      message: `${f.id}: ${f.runs24h.failed} failed run(s) in 24h` +
        (f.lastError ? ` (last run ${f.lastError.runId})` : ''),
      count: f.runs24h.failed,
      severity: (f.runs24h.failed >= 3 ? 'high' : 'medium') as 'high' | 'medium',
      solution: `Inspect run ${f.lastError?.runId ?? ''} in the Inngest dashboard`,
    }))
  const warnings: LogAnalysisResult['warnings'] = []
  const notDeployed = payload.functions.filter(f => !f.deployed)
  if (notDeployed.length) {
    warnings.push({
      message: `In manifest but not served by app ${payload.app.name}: ${notDeployed
        .map(f => f.id)
        .join(', ')}`,
      count: notDeployed.length,
    })
  }
  if (payload.unknownInApp.length) {
    warnings.push({
      message: `Served but not in manifest: ${payload.unknownInApp.join(', ')}`,
      count: payload.unknownInApp.length,
    })
  }
  // Production traffic only: invoked runs (probe suite, dashboard, MCP) are
  // reported apart and do not move the error rate.
  const production = totals.total - totals.invoked
  const errorRate = production > 0 ? Math.round((totals.failed / production) * 1000) / 10 : 0
  return {
    status: errors.some(e => e.severity === 'high')
      ? 'critical'
      : errors.length || warnings.length
        ? 'warning'
        : 'healthy',
    summary:
      `${where}; Inngest runs (24h): ${totals.completed} completed, ${totals.failed} failed, ${totals.running} running` +
      (totals.invoked > 0 ? `, ${totals.invoked} invoked (probe/manual, not counted)` : ''),
    errors,
    warnings,
    statistics: {
      totalRequests: production,
      successRate: production > 0 ? 100 - errorRate : undefined,
      errorRate,
    },
    recommendations: errors.length
      ? ['Open the failing runs in the Inngest dashboard; check lastError per function']
      : [],
    achievements: errors.length === 0 && production > 0 ? ['No failed Inngest runs in 24h'] : undefined,
  }
}

function safeModeAnalysis(logs: string): LogAnalysisResult {
  const basic = basicLogAnalysis(logs)
  return {
    ...basic,
    summary: `safe mode: AI analysis skipped; ${basic.summary}`,
  }
}

// Minimal structural view of Inngest's `step` used by the pipeline (keeps the
// helper testable with a mock step).
type StepLike = { run: (name: string, fn: () => any) => Promise<any> }

/**
 * Shared pipeline for the cron and the manual trigger.
 * Steps: read-logs → (analyze-logs | summarize-inngest-runs) → generate-message → send-notification
 */
async function runLogMonitorPipeline(
  step: StepLike,
  event: { data?: Record<string, unknown> } | undefined
): Promise<{ analysis: LogAnalysisResult; source: 'file' | 'inngest-runs'; safeMode: boolean }> {
  const safeMode = isSafeMode(event)

  const logs = await step.run('read-logs', async () => {
    logger.info('Reading logs from file system...')
    return await readLogs()
  })

  let analysis: LogAnalysisResult
  let source: 'file' | 'inngest-runs'
  if (!logs) {
    source = 'inngest-runs'
    analysis = await step.run('summarize-inngest-runs', async () => {
      logger.warn(`${FILE_LOGGING_DISABLED_TEXT} — summarising Inngest runs instead`)
      return await buildInngestRunsFallbackAnalysis()
    })
  } else {
    source = 'file'
    analysis = await step.run('analyze-logs', async () => {
      if (safeMode) {
        logger.warn('🛡️ log-monitor safe mode — OpenAI analysis skipped', skippedInSafeMode('analyze-logs'))
        return safeModeAnalysis(logs)
      }
      logger.info('Analyzing logs with AI...')
      return await analyzeLogs(logs)
    })
  }

  const message = await step.run('generate-message', async () => {
    logger.info('Generating Telegram message...')
    return await generateTelegramMessage(analysis as unknown as LogAnalysisResult)
  })

  // Recipient is always GROUP_CHAT_ID (= admin), so safe mode needs no
  // redirect — but a probe run (/inngest_probe) must not post the report:
  // two of them arrived at once on 2026-09-09 22:11 and read like an incident.
  await step.run('send-notification', async () => {
    if (safeMode) {
      logger.warn('🛡️ log-monitor safe mode — report not sent to admin chat', skippedInSafeMode('send-notification'))
      return skippedInSafeMode('send-notification')
    }
    logger.info('Sending Telegram notification...')
    await sendTelegramNotification(message)
  })

  return { analysis: analysis as unknown as LogAnalysisResult, source, safeMode }
}

// Основная Inngest функция
export const logMonitor = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'log-monitor'.
    id: 'monitoring-logs-analyze',
    name: '📊 Log Monitor & Reporter',
    retries: 2,
    // Paid OpenAI/DeepSeek analysis → admin visibility on failure.
    onFailure: createInngestFailureHandler('monitoring-logs-analyze'),
  },
  {
    // Запускаем каждые 24 часа
    cron: '0 10 * * *', // Каждый день в 10:00 UTC (13:00 MSK)
  },
  async ({ event, step }) => {
    logger.info('Starting log monitoring task...')
    const { analysis, source, safeMode } = await runLogMonitorPipeline(step, event)

    logger.info('Log monitoring completed successfully', {
      status: analysis.status,
      errors: analysis.errors.length,
      warnings: analysis.warnings.length,
      source,
    })

    return {
      success: true,
      status: analysis.status,
      summary: analysis.summary,
      source,
      safeMode,
      timestamp: new Date().toISOString(),
    }
  }
)

// Функция для ручного запуска мониторинга (для тестирования)
export const triggerLogMonitor = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'trigger-log-monitor'.
    id: 'monitoring-logs-trigger',
    name: '🔄 Trigger Log Monitor (Manual)',
    retries: 1,
    onFailure: createInngestFailureHandler('monitoring-logs-trigger'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [{ event: 'monitoring/logs.trigger' }, { event: 'logs/monitor.trigger' }],
  async ({ event, step }) => {
    logger.info('Manual log monitoring triggered')
    const { analysis, source, safeMode } = await runLogMonitorPipeline(step, event)

    return {
      success: true,
      manual: true,
      status: analysis.status,
      summary: analysis.summary,
      source,
      safeMode,
      triggeredBy: (event.data as any)?.userId || 'system',
      timestamp: new Date().toISOString(),
    }
  }
)
