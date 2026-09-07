import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { telegramClientOptions } from '@/services/telegramApi'

/**
 * TelegramLogService - централизованный сервис логирования в Telegram группу
 *
 * Отправляет все логи в группу НейроМентор
 * Chat ID: -1002737186844 (supergroup с префиксом -100)
 */

// НейроМентор - основной чат для всех логов
const DEFAULT_LOG_GROUP_ID = '-1002737186844'

export type LogLevel = 'info' | 'warn' | 'error' | 'system' | 'payment' | 'user'

interface LogOptions {
  telegramId?: string | number
  username?: string
  botName?: string
  metadata?: Record<string, any>
  silent?: boolean // Не отправлять в Telegram, только в winston
}

class TelegramLogService {
  private bot: Telegraf<MyContext> | null = null
  private logGroupId: string
  private isInitialized = false

  constructor() {
    this.logGroupId = process.env.LOG_GROUP_ID || DEFAULT_LOG_GROUP_ID
  }

  /**
   * Инициализация сервиса с ботом
   * Вызывается после создания бота в index.ts
   */
  initialize(bot: Telegraf<MyContext>): void {
    this.bot = bot
    this.isInitialized = true
    logger.info('[TelegramLogService] Initialized with bot', {
      logGroupId: this.logGroupId,
    })
  }

  /**
   * Инициализация с токеном бота напрямую
   */
  initializeWithToken(botToken: string): void {
    this.bot = new Telegraf<MyContext>(botToken, {
      telegram: telegramClientOptions(),
    })
    this.isInitialized = true
    logger.info('[TelegramLogService] Initialized with token', {
      logGroupId: this.logGroupId,
    })
  }

  /**
   * Основной метод логирования
   */
  async log(
    level: LogLevel,
    message: string,
    options: LogOptions = {}
  ): Promise<void> {
    // Всегда логируем в winston
    this.logToWinston(level, message, options)

    // Если silent или бот не инициализирован - не отправляем в Telegram
    if (options.silent || !this.isInitialized || !this.bot) {
      return
    }

    try {
      const formattedMessage = this.formatMessage(level, message, options)
      await this.bot.telegram.sendMessage(this.logGroupId, formattedMessage, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      })
    } catch (error) {
      logger.error('[TelegramLogService] Failed to send log to Telegram', {
        error: error instanceof Error ? error.message : String(error),
        level,
        message,
      })
    }
  }

  /**
   * Shorthand методы для разных уровней
   */
  async info(message: string, options?: LogOptions): Promise<void> {
    return this.log('info', message, options)
  }

  async warn(message: string, options?: LogOptions): Promise<void> {
    return this.log('warn', message, options)
  }

  async error(message: string, options?: LogOptions): Promise<void> {
    return this.log('error', message, options)
  }

  async system(message: string, options?: LogOptions): Promise<void> {
    return this.log('system', message, options)
  }

  async payment(message: string, options?: LogOptions): Promise<void> {
    return this.log('payment', message, options)
  }

  async user(message: string, options?: LogOptions): Promise<void> {
    return this.log('user', message, options)
  }

  /**
   * Логирование нового пользователя
   */
  async logNewUser(data: {
    telegramId: string | number
    username?: string
    referrer?: string
    botName?: string
  }): Promise<void> {
    const { telegramId, username, referrer, botName } = data

    let message = `🔗 Новый пользователь зарегистрировался в боте`
    if (username) {
      message += `: @${username}`
    }
    if (referrer) {
      message += `\nПо реф. ссылке от: @${referrer}`
    }

    await this.log('user', message, {
      telegramId,
      username,
      botName,
      metadata: { referrer },
    })
  }

  /**
   * Логирование платежа
   */
  async logPayment(data: {
    telegramId: string | number
    username?: string
    amount: number
    currency: string
    stars: number
    method: string
    botName?: string
  }): Promise<void> {
    const { telegramId, username, amount, currency, stars, method, botName } =
      data

    const userMention = username ? `@${username}` : `ID:${telegramId}`
    const message = `💸 ${userMention} оплатил ${amount} ${currency} и получил ${stars} звезд (${method})`

    await this.log('payment', message, {
      telegramId,
      username,
      botName,
      metadata: { amount, currency, stars, method },
    })
  }

  /**
   * Логирование ошибки
   */
  async logError(data: {
    telegramId?: string | number
    username?: string
    error: Error | string
    context?: string
    botName?: string
  }): Promise<void> {
    const { telegramId, username, error, context, botName } = data

    const errorMessage = error instanceof Error ? error.message : error
    const stack = error instanceof Error ? error.stack : undefined

    // Обрезаем сообщение об ошибке до 500 символов
    const truncatedError =
      errorMessage.length > 500
        ? errorMessage.substring(0, 500) + '...'
        : errorMessage

    let message = `❌ Ошибка`
    if (context) {
      message += ` в ${context}`
    }
    if (telegramId) {
      message += ` у пользователя ${username ? `@${username}` : `ID:${telegramId}`}`
    }
    message += `\n\n${truncatedError}`

    await this.log('error', message, {
      telegramId,
      username,
      botName,
      metadata: { context, stack: stack?.substring(0, 500) },
      silent: false,
    })
  }

  /**
   * Логирование системного события
   */
  async logSystemEvent(data: {
    event: string
    details?: string
    botName?: string
  }): Promise<void> {
    const { event, details, botName } = data

    let message = `⚙️ ${event}`
    if (details) {
      message += `\n${details}`
    }

    await this.log('system', message, { botName })
  }

  /**
   * Форматирование сообщения для Telegram
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    options: LogOptions
  ): string {
    const icon = this.getIcon(level)
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
    })

    let formatted = `${icon} <b>${this.getLevelName(level)}</b>`

    if (options.botName) {
      formatted += ` | ${options.botName}`
    }

    formatted += `\n${message}`

    if (options.telegramId) {
      const userLink = options.username
        ? `@${options.username}`
        : `ID: ${options.telegramId}`
      if (
        !message.includes(userLink) &&
        !message.includes(`@${options.username}`)
      ) {
        formatted += `\n👤 ${userLink}`
      }
    }

    formatted += `\n\n<i>${timestamp}</i>`

    return formatted
  }

  private getIcon(level: LogLevel): string {
    const icons: Record<LogLevel, string> = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '🚨',
      system: '⚙️',
      payment: '💰',
      user: '👤',
    }
    return icons[level] || 'ℹ️'
  }

  private getLevelName(level: LogLevel): string {
    const names: Record<LogLevel, string> = {
      info: 'INFO',
      warn: 'WARNING',
      error: 'ERROR',
      system: 'SYSTEM',
      payment: 'PAYMENT',
      user: 'USER',
    }
    return names[level] || 'LOG'
  }

  private logToWinston(
    level: LogLevel,
    message: string,
    options: LogOptions
  ): void {
    const winstonLevel =
      level === 'system' || level === 'payment' || level === 'user'
        ? 'info'
        : level
    const meta = {
      telegramId: options.telegramId,
      username: options.username,
      botName: options.botName,
      ...options.metadata,
    }
    logger[winstonLevel](`[TelegramLog] ${message}`, meta)
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Проверка готовности сервиса
   */
  isReady(): boolean {
    return this.isInitialized && this.bot !== null
  }

  /**
   * Получить текущий ID группы логов
   */
  getLogGroupId(): string {
    return this.logGroupId
  }
}

// Экспортируем синглтон
export const telegramLogService = new TelegramLogService()

// Экспортируем класс для тестирования
export { TelegramLogService }
