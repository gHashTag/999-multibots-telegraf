import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { OpenAI } from 'openai'
import { Telegraf as Bot } from 'telegraf'

// Константы для бота и группы
const BOT_TOKEN = '7667727700:AAEJIvtBWxgy_cj_Le_dGMpqA_dz7Pwhj0c' // @neuro_blogger_bot
// Временно отправляем админу, пока бот не добавлен в группу
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '144022504'
const GROUP_CHAT_ID = ADMIN_TELEGRAM_ID // Используем ID админа вместо группы

// Инициализация OpenAI для анализа логов
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com' : undefined
})

// Интерфейс для результата анализа
interface LogAnalysisResult {
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
  
  return lines.filter(line => {
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
  }).join('\n')
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
      recommendations: ['Проверить работоспособность системы логирования']
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
    const response = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проанализируй следующие логи:\n\n${logs}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000
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
    errors: errors > 0 ? [{
      message: 'Обнаружены ошибки в логах',
      count: errors,
      severity: errors > 10 ? 'high' : 'medium',
      solution: 'Требуется детальный анализ ошибок'
    }] : [],
    warnings: warnings > 0 ? [{
      message: 'Обнаружены предупреждения',
      count: warnings
    }] : [],
    statistics: {
      totalRequests: info,
      errorRate: (errors / (lines.length || 1)) * 100
    },
    recommendations: errors > 0 ? ['Исследовать и устранить источники ошибок'] : ['Система работает стабильно']
  }
}

// Генерация креативного сообщения для Telegram
async function generateTelegramMessage(analysis: LogAnalysisResult): Promise<string> {
  const statusEmoji = {
    healthy: '✅',
    warning: '⚠️',
    critical: '🚨'
  }

  const severityEmoji = {
    low: '📝',
    medium: '⚡',
    high: '🔥'
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
    for (const error of analysis.errors.slice(0, 3)) { // Максимум 3 ошибки
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
      '🎯 Цель достигнута: нулевой даунтайм!'
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
    const bot = new Bot(BOT_TOKEN)
    
    // Отправляем в группу (сейчас админу)
    await bot.telegram.sendMessage(GROUP_CHAT_ID, message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    })
    
    // Если есть критические ошибки, дублируем администратору
    if (message.includes('🚨')) {
      await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, 
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

// Основная Inngest функция
export const logMonitor = inngest.createFunction(
  {
    id: 'log-monitor',
    name: '📊 Log Monitor & Reporter',
    retries: 2,
  },
  {
    // Запускаем каждые 24 часа
    cron: '0 10 * * *', // Каждый день в 10:00 UTC (13:00 MSK)
  },
  async ({ event, step }) => {
    logger.info('Starting log monitoring task...')
    
    // Шаг 1: Чтение логов
    const logs = await step.run('read-logs', async () => {
      logger.info('Reading logs from file system...')
      return await readLogs()
    })
    
    // Шаг 2: Анализ логов
    const analysis = await step.run('analyze-logs', async () => {
      logger.info('Analyzing logs with AI...')
      return await analyzeLogs(logs)
    })
    
    // Шаг 3: Генерация сообщения
    const message = await step.run('generate-message', async () => {
      logger.info('Generating Telegram message...')
      return await generateTelegramMessage(analysis)
    })
    
    // Шаг 4: Отправка уведомления
    await step.run('send-notification', async () => {
      logger.info('Sending Telegram notification...')
      await sendTelegramNotification(message)
    })
    
    logger.info('Log monitoring completed successfully', {
      status: analysis.status,
      errors: analysis.errors.length,
      warnings: analysis.warnings.length
    })
    
    return {
      success: true,
      status: analysis.status,
      summary: analysis.summary,
      timestamp: new Date().toISOString()
    }
  }
)

// Функция для ручного запуска мониторинга (для тестирования)
export const triggerLogMonitor = inngest.createFunction(
  {
    id: 'trigger-log-monitor',
    name: '🔄 Trigger Log Monitor (Manual)',
    retries: 1,
  },
  { event: 'logs/monitor.trigger' },
  async ({ event, step }) => {
    logger.info('Manual log monitoring triggered')
    
    // Выполняем те же шаги, что и в основной функции
    const logs = await step.run('read-logs', async () => {
      return await readLogs()
    })
    
    const analysis = await step.run('analyze-logs', async () => {
      return await analyzeLogs(logs)
    })
    
    const message = await step.run('generate-message', async () => {
      return await generateTelegramMessage(analysis)
    })
    
    await step.run('send-notification', async () => {
      await sendTelegramNotification(message)
    })
    
    return {
      success: true,
      manual: true,
      status: analysis.status,
      summary: analysis.summary,
      triggeredBy: event.data?.userId || 'system',
      timestamp: new Date().toISOString()
    }
  }
)
