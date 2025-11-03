import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { Telegraf as Bot } from 'telegraf'
import { OpenAI } from 'openai'

// Константы
const BOT_TOKEN = '7667727700:AAEJIvtBWxgy_cj_Le_dGMpqA_dz7Pwhj0c'
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '144022504'
const GROUP_CHAT_ID = ADMIN_TELEGRAM_ID // Временно используем ID админа

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com' : undefined
})

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
    const response = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: 'Ты опытный DevOps инженер, специализирующийся на Node.js и TypeScript приложениях.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800
    })

    return JSON.parse(response.choices[0].message.content || '{}')
  } catch (error) {
    logger.error('Error analyzing with AI:', error)
    
    // Fallback анализ
    return {
      analysis: 'Обнаружена критическая ошибка, требующая внимания',
      solution: '1. Проверить логи\n2. Перезапустить сервис\n3. Исследовать причину',
      urgency: errorContext.severity === 'critical' ? 'immediate' : 'high',
      tags: ['error', errorContext.severity]
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
    normal: 'ℹ️🔵'
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
async function sendErrorNotification(message: string, urgency: string): Promise<void> {
  const bot = new Bot(BOT_TOKEN)
  
  try {
    // Всегда отправляем в группу (сейчас админу)
    await bot.telegram.sendMessage(GROUP_CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
    
    // Для критических ошибок дублируем админу
    if (urgency === 'immediate') {
      await bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
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
    id: 'critical-error-monitor',
    name: '🚨 Critical Error Monitor',
    retries: 1,
  },
  { event: 'app/error.critical' },
  async ({ event, step }) => {
    const errorContext: ErrorContext = {
      error: event.data.error || 'Unknown error',
      stack: event.data.stack,
      endpoint: event.data.endpoint,
      userId: event.data.userId,
      timestamp: event.data.timestamp || new Date().toISOString(),
      severity: event.data.severity || 'high',
      context: event.data.context
    }
    
    logger.error('Critical error detected:', errorContext)
    
    // Шаг 1: Анализ ошибки
    const analysis = await step.run('analyze-error', async () => {
      return await analyzeError(errorContext)
    })
    
    // Шаг 2: Форматирование сообщения
    const message = await step.run('format-message', async () => {
      return formatErrorMessage(errorContext, analysis)
    })
    
    // Шаг 3: Отправка уведомления
    await step.run('send-notification', async () => {
      await sendErrorNotification(message, analysis.urgency)
    })
    
    // Шаг 4: Логирование для дальнейшего анализа
    await step.run('log-for-analysis', async () => {
      logger.info('Error processed and notification sent', {
        errorId: event.id,
        urgency: analysis.urgency,
        tags: analysis.tags
      })
    })
    
    return {
      success: true,
      errorId: event.id,
      urgency: analysis.urgency,
      notificationSent: true,
      timestamp: new Date().toISOString()
    }
  }
)

// Функция для проверки состояния сервисов
export const healthCheck = inngest.createFunction(
  {
    id: 'health-check',
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
        const response = await fetch(`${process.env.WEBHOOK_URL || 'http://localhost:4000'}/health`)
        return {
          service: 'Main API',
          status: response.ok ? 'healthy' : 'unhealthy',
          statusCode: response.status
        }
      } catch (error) {
        return {
          service: 'Main API',
          status: 'error',
          error: error.message
        }
      }
    })
    results.push(apiHealth)
    
    // Проверка Inngest
    const inngestHealth = await step.run('check-inngest-health', async () => {
      try {
        const response = await fetch('http://localhost:8288/health')
        return {
          service: 'Inngest',
          status: response.ok ? 'healthy' : 'unhealthy',
          statusCode: response.status
        }
      } catch (error) {
        return {
          service: 'Inngest',
          status: 'error',
          error: error.message
        }
      }
    })
    results.push(inngestHealth)
    
    // Анализ результатов
    const unhealthyServices = results.filter(r => r.status !== 'healthy')
    
    // Если есть проблемы, отправляем уведомление
    if (unhealthyServices.length > 0) {
      await step.run('notify-unhealthy', async () => {
        const bot = new Bot(BOT_TOKEN)
        
        let message = '⚠️ <b>Обнаружены проблемы с сервисами:</b>\n\n'
        for (const service of unhealthyServices) {
          message += `❌ <b>${service.service}:</b> ${service.status}\n`
          if (service.error) {
            message += `   Ошибка: ${service.error}\n`
          }
        }
        
        message += '\n🔧 Требуется проверка!'
        
        await bot.telegram.sendMessage(GROUP_CHAT_ID, message, {
          parse_mode: 'HTML'
        })
      })
    }
    
    return {
      success: true,
      healthyServices: results.filter(r => r.status === 'healthy').length,
      unhealthyServices: unhealthyServices.length,
      timestamp: new Date().toISOString()
    }
  }
)
