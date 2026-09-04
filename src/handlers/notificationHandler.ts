import { supabase } from '../core/supabase'
import { exclusiveTick } from '@/utils/exclusiveTick'
import { logger } from '../utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '../interfaces'

interface PendingMessage {
  id: string
  telegram_id: string
  message: string
  message_type: string
  created_at: string
  priority: 'high' | 'medium' | 'low'
  attempts: number
  last_attempt?: string
  sent: boolean
  error?: string
}

/**
 * Обработчик уведомлений для отправки сообщений из таблицы pending_messages
 */
export class NotificationHandler {
  private bot: Telegraf<MyContext>
  private isProcessing = false

  constructor(bot: Telegraf<MyContext>) {
    this.bot = bot
  }

  /**
   * Запускает обработку очереди уведомлений
   */
  async processNotificationQueue(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('⚠️ Обработка уведомлений уже запущена')
      return
    }

    this.isProcessing = true
    logger.info('🚀 Начинаем обработку очереди уведомлений...')

    try {
      // Проверяем подключение к Supabase
      const { error: connectionError } = await supabase
        .from('pending_messages')
        .select('count', { count: 'exact', head: true })

      if (connectionError) {
        logger.error('❌ Ошибка подключения к Supabase:', {
          error: connectionError.message,
          code: connectionError.code,
          details: connectionError.details,
          hint: connectionError.hint,
        })
        return
      }

      logger.info('✅ Подключение к Supabase успешно')
      // Получаем неотправленные сообщения из очереди
      logger.info('🔍 Выполняем запрос к Supabase pending_messages...')
      const { data: messages, error } = await supabase
        .from('pending_messages')
        .select('*')
        .eq('sent', false)
        .lt('attempts', 3) // Максимум 3 попытки
        .order('priority', { ascending: true }) // high, medium, low
        .order('created_at', { ascending: true })
        .limit(50) // Обрабатываем максимум 50 сообщений за раз

      logger.info('🔍 Запрос к Supabase завершен:', {
        hasData: !!messages,
        dataLength: messages?.length || 0,
        hasError: !!error,
      })

      if (error) {
        logger.error('❌ Ошибка при получении уведомлений:', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        return
      }

      if (!messages || messages.length === 0) {
        logger.info('✅ Нет уведомлений для отправки')
        return
      }

      // Проверяем структуру данных
      if (!Array.isArray(messages)) {
        logger.error('❌ Неправильная структура данных от Supabase:', {
          dataType: typeof messages,
          data: messages,
        })
        return
      }

      logger.info(`📨 Найдено ${messages.length} уведомлений для отправки`)

      // Обрабатываем каждое сообщение
      for (const message of messages) {
        await this.processMessage(message)
        // Небольшая задержка между сообщениями
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      logger.info('✅ Обработка очереди уведомлений завершена')
    } catch (error) {
      logger.error('❌ Критическая ошибка при обработке уведомлений:', error)
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Обрабатывает одно сообщение
   */
  private async processMessage(message: PendingMessage): Promise<void> {
    try {
      logger.info(`📤 Отправка уведомления пользователю ${message.telegram_id}`)

      // Отправляем сообщение через Telegram Bot API
      await this.bot.telegram.sendMessage(
        message.telegram_id,
        message.message,
        {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        }
      )

      // Помечаем сообщение как отправленное
      await this.markMessageAsSent(message.id)

      logger.info(
        `✅ Уведомление для пользователя ${message.telegram_id} отправлено успешно`
      )
    } catch (error) {
      logger.error(
        `❌ Ошибка при отправке уведомления пользователю ${message.telegram_id}:`,
        error
      )
      await this.markMessageAsFailed(message, error)
    }
  }

  /**
   * Помечает сообщение как отправленное
   */
  private async markMessageAsSent(messageId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('pending_messages')
        .update({
          sent: true,
          last_attempt: new Date().toISOString(),
        })
        .eq('id', messageId)

      if (error) {
        logger.error(
          `❌ Ошибка при обновлении статуса сообщения ${messageId}:`,
          {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          }
        )

        // Для сетевых ошибок просто логируем, но не выбрасываем исключение
        if (error.message?.includes('fetch') || error.code === 'PGRST301') {
          logger.warn(
            `⚠️ Сетевая ошибка при обновлении статуса сообщения ${messageId}, продолжаем`
          )
          return
        }
      }
    } catch (error) {
      logger.error(
        `❌ Ошибка при пометке сообщения ${messageId} как отправленного:`,
        error
      )

      // Для сетевых ошибок просто логируем
      if (error instanceof Error && error.message?.includes('fetch')) {
        logger.warn(
          `⚠️ Сетевая ошибка при пометке сообщения ${messageId} как отправленного`
        )
        return
      }
    }
  }

  /**
   * Помечает сообщение как неудачное
   */
  private async markMessageAsFailed(
    message: PendingMessage,
    error: any
  ): Promise<void> {
    const messageId = message.id
    try {
      // attempts must be a concrete number. The old code assigned it the result
      // of supabase.rpc('increment_attempts', ...) — a query builder that was
      // never awaited (so the RPC never ran; the RPC is not even defined) and was
      // JSON-serialised into this PATCH body as an object for an integer column,
      // making the whole update fail. attempts then never incremented, the
      // `.lt('attempts', 3)` cap never engaged, and a message that could not be
      // delivered (e.g. a user who blocked the bot) was retried every 60s forever.
      const { error: updateError } = await supabase
        .from('pending_messages')
        .update({
          attempts: message.attempts + 1,
          last_attempt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
        .eq('id', messageId)

      if (updateError) {
        logger.error(
          `❌ Ошибка при обновлении статуса неудачного сообщения ${messageId}:`,
          {
            error: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint,
          }
        )

        // Для сетевых ошибок просто логируем
        if (
          updateError.message?.includes('fetch') ||
          updateError.code === 'PGRST301'
        ) {
          logger.warn(
            `⚠️ Сетевая ошибка при обновлении статуса неудачного сообщения ${messageId}`
          )
        }
      }
    } catch (updateError) {
      logger.error(
        `❌ Ошибка при пометке сообщения ${messageId} как неудачного:`,
        updateError
      )

      // Для сетевых ошибок просто логируем
      if (
        updateError instanceof Error &&
        updateError.message?.includes('fetch')
      ) {
        logger.warn(
          `⚠️ Сетевая ошибка при пометке сообщения ${messageId} как неудачного`
        )
      }
    }
  }

  /**
   * Очищает старые обработанные сообщения
   */
  async cleanupOldMessages(): Promise<void> {
    try {
      logger.info('🧹 Очистка старых обработанных сообщений...')

      // Удаляем сообщения старше 7 дней
      const { error } = await supabase
        .from('pending_messages')
        .delete()
        .eq('sent', true)
        .lt(
          'created_at',
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        )

      if (error) {
        logger.error('❌ Ошибка при очистке старых сообщений:', error)
      } else {
        logger.info('✅ Старые сообщения очищены')
      }
    } catch (error) {
      logger.error('❌ Ошибка при очистке старых сообщений:', error)
    }
  }
}

/**
 * Создает обработчик уведомлений
 */
export function createNotificationHandler(
  bot: Telegraf<MyContext>
): NotificationHandler {
  return new NotificationHandler(bot)
}

// Глобальная переменная для предотвращения дублирования
let notificationProcessorStarted = false

/**
 * Настраивает автоматическую обработку уведомлений
 */
export function setupNotificationProcessor(bot: Telegraf<MyContext>): void {
  // ✅ ПРЕДОТВРАЩАЕМ ДУБЛИРОВАНИЕ - запускаем только один раз
  if (notificationProcessorStarted) {
    logger.info('⏩ Система уведомлений уже запущена, пропускаем инициализацию')
    return
  }

  notificationProcessorStarted = true
  logger.info('🚀 Инициализация ГЛОБАЛЬНОЙ системы уведомлений...')

  const handler = createNotificationHandler(bot)

  // Обрабатываем уведомления каждую минуту
  setInterval(
    exclusiveTick('notifications', () => handler.processNotificationQueue()),
    60000
  ) // every minute

  // Очищаем старые сообщения каждый час
  setInterval(
    exclusiveTick('notifications-cleanup', () => handler.cleanupOldMessages()),
    3600000
  ) // hourly

  logger.info(
    '✅ ГЛОБАЛЬНАЯ система уведомлений успешно запущена (одиночная инициализация)'
  )
}
