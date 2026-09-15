import { inngest } from '@/inngest_app/client'
import { logger } from '@/utils/logger'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { OpenAI } from 'openai'
import { getMonitoringBot } from './monitoringBot'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { resolveAlertDestination } from '@/services/telegram-log.service'
import { createInngestFailureHandler } from '@/inngest_app/client'
import {
  fetchFunctionsStatusSafe,
  renderRunsSummaryText,
} from '@/inngest_app/status/functionsStatus'

// Константы для бота и группы
// Токен бота больше не хардкодится: см. getMonitoringBot() в ./monitoringBot
// Временно отправляем админу, пока бот не добавлен в группу
/**
 * WHERE THE DAILY REPORT GOES -- AND WHY IT WENT NOWHERE.
 *
 * `ADMIN_TELEGRAM_ID` was passed to `sendMessage` raw. On the production
 * service that variable is not one id: measured 2026-09-15 it is twenty
 * characters holding TWO ids joined by a comma. Telegram's chat_id is a single
 * integer or a single @username, so the send answered 400 "chat not found",
 * `sendTelegramNotification` rethrew, the Inngest step failed, it retried twice
 * and onFailure fired. The 13:00 report reached nobody.
 *
 * `resolveAlertDestination()` (src/services/telegram-log.service.ts) is the
 * house answer to exactly this: LOG_GROUP_ID if someone set it, otherwise the
 * FIRST id out of the comma-separated list. Six other call sites already split
 * on the comma; these two monitors were the only ones in src that did not.
 */
const { chatId: GROUP_CHAT_ID } = resolveAlertDestination()
const ADMIN_DIRECT_CHAT_ID = GROUP_CHAT_ID

/**
 * ONE PROVIDER, CHOSEN ONCE -- AND ONE THAT ANSWERS.
 *
 * The key came from `OPENAI_API_KEY || DEEPSEEK_API_KEY` while the endpoint and
 * the model came from `DEEPSEEK_API_KEY ? … : …`. Both variables are set on the
 * production service, so the OpenAI key was POSTed to api.deepseek.com, which
 * answered `401 Authentication Fails, Your api key: ****ex0A is invalid` every
 * day at 13:00. The tail it names is OPENAI_API_KEY's, not DEEPSEEK_API_KEY's,
 * so the door was provably the wrong one.
 *
 * Pairing them correctly is necessary and not sufficient: measured 2026-09-15,
 * each of those two keys is ALSO rejected by its own endpoint --
 * api.openai.com/v1/models answers 401 "Incorrect API key provided" and
 * api.deepseek.com answers 401 for `****0aee`. Both need rotating; neither can
 * carry this report today.
 *
 * Z.AI can, and it is already deployed. Measured against the live service:
 *   GLM_API_KEY + ZAI_BASE_URL (= https://api.z.ai/api/coding/paas/v4)
 *     + GLM_MODEL (= glm-5.3)                          -> HTTP 200
 *   the same key against https://api.z.ai/api/paas/v4  -> HTTP 429, code 1113,
 *     "Insufficient balance or no resource package"
 * So the Coding-Plan path is the only one this key may use, and ZAI_BASE_URL
 * already names it. Never default to the standard endpoint.
 *
 * GLM is a REASONING model and `max_tokens` is charged for the thinking too:
 * the same ping at max_tokens 16 spent all 16 on reasoning and returned an
 * EMPTY content with finish_reason "stop", while at 900 it answered "pong"
 * after 59 tokens (56 of them reasoning). `thinking: {type: 'disabled'}` drops
 * that to 3. The report needs the answer, not the deliberation, so it is off --
 * which is also what keeps the response inside the budget below.
 */
export interface MonitorProvider {
  apiKey: string
  baseURL?: string
  model: string
  name: 'zai' | 'openai' | 'deepseek'
  /** Extra body fields this provider needs; empty for plain OpenAI-shaped ones. */
  extraBody: Record<string, unknown>
}

const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'

export function resolveMonitorProvider(
  env: NodeJS.ProcessEnv = process.env
): MonitorProvider | null {
  const glmKey = (env.GLM_API_KEY || '').trim()
  if (glmKey) {
    return {
      apiKey: glmKey,
      baseURL: (env.ZAI_BASE_URL || '').trim() || ZAI_CODING_BASE_URL,
      model: env.LOG_MONITOR_MODEL || env.GLM_MODEL || 'glm-5.3',
      name: 'zai',
      extraBody: { thinking: { type: 'disabled' } },
    }
  }
  const openaiKey = (env.OPENAI_API_KEY || '').trim()
  if (openaiKey) {
    return {
      apiKey: openaiKey,
      model: env.LOG_MONITOR_MODEL || 'gpt-4o-mini',
      name: 'openai',
      extraBody: {},
    }
  }
  const deepseekKey = (env.DEEPSEEK_API_KEY || '').trim()
  if (deepseekKey) {
    return {
      apiKey: deepseekKey,
      baseURL: 'https://api.deepseek.com',
      model: env.LOG_MONITOR_MODEL || 'deepseek-chat',
      name: 'deepseek',
      extraBody: {},
    }
  }
  return null
}

// The client is created lazily, on first use.
// The cache is keyed on the door it was built for: a bare `if (!openai)` kept
// the first client for the life of the process, so changing the provider in
// Railway left the old base URL in place until something restarted the service.
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
    openai = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
    })
    openaiKeyedOn = cacheKey
  }
  return { client: openai, provider }
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
export function resolveLogPath(): {
  logDir: string
  logPath: string
  enabled: boolean
} {
  const logDir = defaultLogDir()
  const logPath = join(logDir, 'combined.log')
  return { logDir, logPath, enabled: existsSync(logPath) }
}

/**
 * The winston logger writes to `<cwd>/logs/combined.log` (src/utils/logger.ts).
 * The old default `/tmp/logs` never matched it, so the file branch was dead in
 * production (audit 2026-09-13). LOG_DIR still overrides.
 */
export function defaultLogDir(): string {
  return process.env.LOG_DIR || join(process.cwd(), 'logs')
}

/**
 * The comment on the old body promised "the last 10000 characters" and then
 * read the entire file. combined.log has no maxsize/maxFiles/tailable in
 * logger.ts, so it grows without bound between deploys, and this is a
 * synchronous read on the event loop. Only the last 24 hours survive
 * filterLast24Hours and only the last 50KB of that is ever sent, so a 2MB tail
 * is already far more than the function can use.
 */
const MAX_LOG_TAIL_BYTES = 2 * 1024 * 1024

function readLogTail(logPath: string): string {
  const { size } = statSync(logPath)
  if (size <= MAX_LOG_TAIL_BYTES) return readFileSync(logPath, 'utf-8')

  const fd = openSync(logPath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(MAX_LOG_TAIL_BYTES)
    readSync(fd, buffer, 0, MAX_LOG_TAIL_BYTES, size - MAX_LOG_TAIL_BYTES)
    const text = buffer.toString('utf-8')
    // The window opens mid-line; that fragment has no timestamp and would be
    // dropped by filterLast24Hours anyway. Remove it so it cannot be counted.
    const firstBreak = text.indexOf('\n')
    return firstBreak === -1 ? text : text.slice(firstBreak + 1)
  } finally {
    closeSync(fd)
  }
}

async function readLogs(): Promise<string> {
  const logPath = join(defaultLogDir(), 'combined.log')

  if (!existsSync(logPath)) {
    logger.warn(`Log file not found at ${logPath}`)
    return ''
  }

  try {
    const fullLog = readLogTail(logPath)
    const last24Hours = filterLast24Hours(fullLog)
    return last24Hours.slice(-50000) // Последние 50KB логов
  } catch (error) {
    logger.error('Error reading logs:', error)
    return ''
  }
}

/**
 * Timestamp of one log line, or null. Accepts both the winston printf format
 * `2026-09-13 02:17:45 [INFO]: ...` (what the logger actually writes) and the
 * JSON `"timestamp":"..."` form the old filter expected.
 */
export function logLineTimestamp(line: string): number | null {
  const printf = line.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/)
  if (printf) {
    // The logger prints server-local time without a zone; Railway runs in UTC.
    const t = Date.parse(`${printf[1]}T${printf[2]}Z`)
    return Number.isFinite(t) ? t : null
  }
  const json = line.match(/"timestamp":"([^"]+)"/)
  if (json) {
    const t = Date.parse(json[1])
    return Number.isFinite(t) ? t : null
  }
  return null
}

export function filterLast24Hours(logs: string, now = Date.now()): string {
  const lines = logs.split('\n')
  const dayAgo = now - 24 * 60 * 60 * 1000

  return lines
    .filter(line => {
      try {
        const timestamp = logLineTimestamp(line)
        return timestamp !== null && timestamp > dayAgo
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
    const { client, provider } = getOpenAI()
    const response = await client.chat.completions.create({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проанализируй следующие логи:\n\n${logs}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
      // Spread, not a literal field: `thinking` is a Z.AI extension and the
      // OpenAI SDK's parameter type has no room for it.
      ...provider.extraBody,
    })

    const parsed = JSON.parse(response.choices[0].message.content || '{}')
    if (!isLogAnalysisResult(parsed)) {
      // `as LogAnalysisResult` on an unchecked parse is a promise, not a check.
      // generateTelegramMessage then does Object.keys(analysis.statistics) and
      // analysis.errors.length -- both throw on `{}`, and they throw in a
      // DIFFERENT Inngest step, outside this catch, where the failure is not a
      // degraded report but no report at all. An empty content field is enough
      // to get there: `|| '{}'` turns it into a legal object of the wrong shape.
      return basicLogAnalysis(
        logs,
        `ИИ вернул ответ неожиданной формы (${provider.name}/${provider.model})`
      )
    }
    return parsed
  } catch (error) {
    logger.error('Error analyzing logs with AI:', error)

    // Fall back to analysis without AI -- and the report is obliged to say
    // that the AI did not answer.
    return basicLogAnalysis(
      logs,
      error instanceof Error ? error.message : String(error)
    )
  }
}

/**
 * HOW MANY ERRORS, IN THE FORMAT THIS APPLICATION ACTUALLY WRITES.
 *
 * The counter matched the substring `"level":"error"` -- JSON. The application
 * logger is `format.printf` (src/utils/logger.ts) and writes
 * `2026-09-15 09:00:01 [ERROR]: …`, which contains no such fragment. So every
 * line of every log was counted as neither error nor warning: the owner was
 * told `Ошибок: 0` and `Система работает стабильно` on three consecutive days
 * that each carried a dozen 🚨 alerts. Measured on a real combined.log written
 * by this very logger: 0 lines matched the JSON form, 9 matched `[ERROR]`.
 *
 * Both shapes are accepted now, because the security logger does write JSON.
 * Each line is classified ONCE, printf form first: a line may carry the other
 * form inside its metadata -- `logger.info('…', { level: 'error' })` prints
 * `[INFO]: … {"level":"error"}` -- and counting per level independently would
 * have charged that one line to two different levels at once.
 */
export function countLogLevels(lines: string[]): {
  errors: number
  warnings: number
  info: number
} {
  const printf = /\[(ERROR|WARN|INFO)\]:/
  const json = /"level":"(error|warn|info)"/
  const counts = { errors: 0, warnings: 0, info: 0 }

  for (const line of lines) {
    const level = (
      printf.exec(line)?.[1] ??
      json.exec(line)?.[1] ??
      ''
    ).toLowerCase()
    if (level === 'error') counts.errors++
    else if (level === 'warn') counts.warnings++
    else if (level === 'info') counts.info++
  }

  return counts
}

// Базовый анализ логов без AI
export function basicLogAnalysis(
  logs: string,
  aiFailure?: string
): LogAnalysisResult {
  const lines = logs.split('\n').filter(line => line.trim().length > 0)
  const { errors, warnings, info } = countLogLevels(lines)

  // An analysis produced without the AI is not the same claim as one produced
  // with it. A provider outage downgrades the verdict; it never yields ✅.
  const status = aiFailure
    ? errors > 10
      ? 'critical'
      : 'warning'
    : errors > 10
      ? 'critical'
      : errors > 5
        ? 'warning'
        : 'healthy'

  return {
    status,
    summary:
      `Обработано ${lines.length} записей логов. Ошибок: ${errors}, Предупреждений: ${warnings}` +
      (aiFailure
        ? `\n⚠️ ИИ-анализ недоступен (${aiFailure.slice(0, 160)}) — ниже только подсчёт строк.`
        : ''),
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
    recommendations: [
      ...(aiFailure ? ['Починить ключ ИИ-анализа: отчёт собран без него'] : []),
      errors > 0
        ? 'Исследовать и устранить источники ошибок'
        : aiFailure
          ? 'Ошибок в строках не найдено — но это не проверено ИИ'
          : 'Система работает стабильно',
    ],
  }
}

function isLogAnalysisResult(value: unknown): value is LogAnalysisResult {
  const v = value as LogAnalysisResult
  return (
    !!v &&
    typeof v === 'object' &&
    (v.status === 'healthy' ||
      v.status === 'warning' ||
      v.status === 'critical') &&
    typeof v.summary === 'string' &&
    Array.isArray(v.errors) &&
    Array.isArray(v.warnings) &&
    Array.isArray(v.recommendations) &&
    !!v.statistics &&
    typeof v.statistics === 'object'
  )
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

    // Если есть критические ошибки, дублируем администратору.
    // The duplicate used to be unconditional while GROUP_CHAT_ID *was*
    // ADMIN_TELEGRAM_ID, so both copies landed in the same chat -- the owner
    // read the same report twice, the second one under a CRITICAL heading. The
    // branch had never actually run, because the status was pinned to
    // 'healthy' by the broken counter; repairing the counter makes it
    // reachable, so it has to know the difference now.
    if (message.includes('🚨') && ADMIN_DIRECT_CHAT_ID !== GROUP_CHAT_ID) {
      await bot.telegram.sendMessage(
        ADMIN_DIRECT_CHAT_ID,
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
export const FILE_LOGGING_DISABLED_TEXT =
  'file logging is disabled on this host'

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
        {
          message: `Inngest GraphQL unreachable at ${failure.gqlUrl}`,
          count: 1,
        },
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
      message:
        `${f.id}: ${f.runs24h.failed} failed run(s) in 24h` +
        (f.lastError ? ` (last run ${f.lastError.runId})` : ''),
      count: f.runs24h.failed,
      severity: (f.runs24h.failed >= 3 ? 'high' : 'medium') as
        | 'high'
        | 'medium',
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
  const errorRate =
    production > 0 ? Math.round((totals.failed / production) * 1000) / 10 : 0
  return {
    status: errors.some(e => e.severity === 'high')
      ? 'critical'
      : errors.length || warnings.length
        ? 'warning'
        : 'healthy',
    summary:
      `${where}; Inngest runs (24h): ${totals.completed} completed, ${totals.failed} failed, ${totals.running} running` +
      (totals.invoked > 0
        ? `, ${totals.invoked} invoked (probe/manual, not counted)`
        : ''),
    errors,
    warnings,
    statistics: {
      totalRequests: production,
      successRate: production > 0 ? 100 - errorRate : undefined,
      errorRate,
    },
    recommendations: errors.length
      ? [
          'Open the failing runs in the Inngest dashboard; check lastError per function',
        ]
      : [],
    achievements:
      errors.length === 0 && production > 0
        ? ['No failed Inngest runs in 24h']
        : undefined,
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
): Promise<{
  analysis: LogAnalysisResult
  source: 'file' | 'inngest-runs'
  safeMode: boolean
}> {
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
      logger.warn(
        `${FILE_LOGGING_DISABLED_TEXT} — summarising Inngest runs instead`
      )
      return await buildInngestRunsFallbackAnalysis()
    })
  } else {
    source = 'file'
    analysis = await step.run('analyze-logs', async () => {
      if (safeMode) {
        logger.warn(
          '🛡️ log-monitor safe mode — OpenAI analysis skipped',
          skippedInSafeMode('analyze-logs')
        )
        return safeModeAnalysis(logs)
      }
      logger.info('Analyzing logs with AI...')
      return await analyzeLogs(logs)
    })
  }

  const message = await step.run('generate-message', async () => {
    logger.info('Generating Telegram message...')
    return await generateTelegramMessage(
      analysis as unknown as LogAnalysisResult
    )
  })

  // Recipient is always GROUP_CHAT_ID (= admin), so safe mode needs no
  // redirect — but a probe run (/inngest_probe) must not post the report:
  // two of them arrived at once on 2026-09-09 22:11 and read like an incident.
  await step.run('send-notification', async () => {
    if (safeMode) {
      logger.warn(
        '🛡️ log-monitor safe mode — report not sent to admin chat',
        skippedInSafeMode('send-notification')
      )
      return skippedInSafeMode('send-notification')
    }
    logger.info('Sending Telegram notification...')
    await sendTelegramNotification(message)
  })

  return {
    analysis: analysis as unknown as LogAnalysisResult,
    source,
    safeMode,
  }
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
    const { analysis, source, safeMode } = await runLogMonitorPipeline(
      step,
      event
    )

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
    const { analysis, source, safeMode } = await runLogMonitorPipeline(
      step,
      event
    )

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
