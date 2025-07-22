import { supabase } from '../core/supabase'
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
  private isProcessing: boolean = false

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
      // Получаем неотправленные сообщения из очереди
      const { data: messages, error } = await supabase
        .from('pending_messages')
        .select('*')
        .eq('sent', false)
        .lt('attempts', 3) // Максимум 3 попытки
        .order('priority', { ascending: true }) // high, medium, low
        .order('created_at', { ascending: true })
        .limit(50) // Обрабатываем максимум 50 сообщений за раз

      if (error) {
        logger.error('❌ Ошибка при получении уведомлений:', error)
        return
      }

      if (!messages || messages.length === 0) {
        logger.info('✅ Нет уведомлений для отправки')
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
      await this.markMessageAsFailed(message.id, error)
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
          error
        )
      }
    } catch (error) {
      logger.error(
        `❌ Ошибка при пометке сообщения ${messageId} как отправленного:`,
        error
      )
    }
  }

  /**
   * Помечает сообщение как неудачное
   */
  private async markMessageAsFailed(
    messageId: string,
    error: any
  ): Promise<void> {
    try {
      const { error: updateError } = await supabase
        .from('pending_messages')
        .update({
          attempts: supabase.rpc('increment_attempts', {
            message_id: messageId,
          }),
          last_attempt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
        .eq('id', messageId)

      if (updateError) {
        logger.error(
          `❌ Ошибка при обновлении статуса неудачного сообщения ${messageId}:`,
          updateError
        )
      }
    } catch (updateError) {
      logger.error(
        `❌ Ошибка при пометке сообщения ${messageId} как неудачного:`,
        updateError
      )
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
  setInterval(async () => {
    await handler.processNotificationQueue()
  }, 60000) // 1 минута

  // Очищаем старые сообщения каждый час
  setInterval(async () => {
    await handler.cleanupOldMessages()
  }, 3600000) // 1 час

  logger.info(
    '✅ ГЛОБАЛЬНАЯ система уведомлений успешно запущена (одиночная инициализация)'
  )
}
