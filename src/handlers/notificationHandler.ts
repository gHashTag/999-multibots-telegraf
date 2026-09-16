import { supabase } from '../core/supabase'
import { exclusiveTick } from '@/utils/exclusiveTick'
import { isUserCausedTelegramError } from '@/helpers/telegramErrors'
import { logger } from '../utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '../interfaces'

/**
 * THE VERDICT USED TO BE COMPUTED AFTER THE PAGE HAD ALREADY BEEN SENT.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error', so the level
 * picked at each site below is a ROUTING decision, not a severity adjective:
 * `logger.error` is a push notification to the owner's phone, `logger.warn` and
 * `logger.info` are not.
 *
 * Every update site in this file called `logger.error` unconditionally and only
 * then asked whether the cause was a transient fetch failure, adding a quieter
 * `logger.warn` underneath. The branch written to keep a 60-second sweep's
 * network blip off the owner's phone therefore ran one line too late and could
 * never prevent anything -- it could only add a second line to the log. The
 * verdict is now computed first and the level comes from it.
 *
 * The non-transient arm stays at error on purpose: an update that fails for a
 * schema, permission or constraint reason is a real write failure and the
 * pending_messages queue stalls behind it. A genuine Supabase outage also still
 * pages from the connection probe and the select in processNotificationQueue,
 * which are deliberately left alone.
 *
 * The pattern list is kept at least as wide as the `message.includes('fetch')`
 * test it replaces, so nothing that was quiet yesterday starts paging today.
 */
const TRANSIENT_NETWORK = /fetch|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i

function isTransientSupabaseError(error: unknown): boolean {
  if (!error) return false
  const { code, message } = error as { code?: string; message?: unknown }
  // PostgREST's "JWT expired / connection lost" answer: the next sweep retries.
  if (code === 'PGRST301') return true
  return TRANSIENT_NETWORK.test(String(message ?? ''))
}

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
 * AN IDLE POLLER NARRATED ITSELF FIVE TIMES A MINUTE.
 *
 * Measured on the live deploy 2026-09-16: a 500-line window held 313 INFO lines
 * and almost all of them were this one timer. `setupNotificationProcessor`
 * below runs `processNotificationQueue` every 60 seconds, and an IDLE tick --
 * the normal state -- used to emit five info lines before returning:
 *
 *   09:53:32 [INFO]: 🚀 Начинаем обработку очереди уведомлений...
 *   09:53:32 [INFO]: ✅ Подключение к Supabase успешно
 *   09:53:32 [INFO]: 🔍 Выполняем запрос к Supabase pending_messages...
 *   09:53:32 [INFO]: 🔍 Запрос к Supabase завершен: {"hasData":true,"dataLength":0,…}
 *   09:53:32 [INFO]: ✅ Нет уведомлений для отправки
 *
 * Five a minute is 7200 a day: a real incident does not get lost in that log,
 * it gets BURIED in it, which is the only reason any of this matters.
 *
 * SILENCE IS NOT ZERO, so the cut cannot simply delete those lines. The one
 * thing they bought was liveness -- they were the only way to tell "the poller
 * is alive and idle" from "the poller is dead". Nothing else in the process
 * carried that signal: there is no heartbeat anywhere else in src, the startup
 * lines fire once, the hourly cleanup is a DIFFERENT timer that keeps logging
 * while this one is wedged, and exclusiveTick only speaks when a tick overlaps
 * or throws -- never while the poller is healthy.
 *
 * So the narration moves to debug (dropped in production, where LOG_LEVEL is
 * unset and utils/logger.ts defaults to 'info') and the signal is made explicit
 * instead: one info line every fifteenth completed poll, carrying a count that
 * RISES. A rising count is what distinguishes alive from dead; a heartbeat that
 * never incremented would be as useless as silence. ~7200 idle lines a day
 * become ~96.
 *
 * The first completed poll also beats, so a fresh deploy proves it reached
 * Supabase without a fifteen-minute wait.
 */
export const HEARTBEAT_EVERY_POLLS = 15

/**
 * Обработчик уведомлений для отправки сообщений из таблицы pending_messages
 */
export class NotificationHandler {
  private bot: Telegraf<MyContext>
  private isProcessing = false
  /** Polls that reached Supabase and got an answer. Only ever goes up. */
  private polls = 0
  /** Messages picked up since the last heartbeat, so an idle beat reads as 0. */
  private pickedUpSinceHeartbeat = 0

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
    // Narration, not signal: see the heartbeat note above the class.
    logger.debug('🚀 Начинаем обработку очереди уведомлений...')

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

      logger.debug('✅ Подключение к Supabase успешно')
      // Получаем неотправленные сообщения из очереди
      logger.debug('🔍 Выполняем запрос к Supabase pending_messages...')
      const { data: messages, error } = await supabase
        .from('pending_messages')
        .select('*')
        .eq('sent', false)
        .lt('attempts', 3) // Максимум 3 попытки
        .order('priority', { ascending: true }) // high, medium, low
        .order('created_at', { ascending: true })
        .limit(50) // Обрабатываем максимум 50 сообщений за раз

      // The line from the report: once a minute, a query that returned nothing
      // announcing that it returned nothing. The facts survive at debug.
      logger.debug('🔍 Запрос к Supabase завершен:', {
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

      /*
       * THE LIVENESS SIGNAL, COUNTED HERE BECAUSE SUPABASE HAS NOW ANSWERED.
       *
       * Incrementing earlier would let a heartbeat beat while the database was
       * unreachable, which is precisely the state an operator is trying to tell
       * apart. A beat therefore means: the timer fired, the connection probe
       * passed, and the select returned.
       */
      this.polls += 1
      this.pickedUpSinceHeartbeat += messages?.length || 0
      if (this.polls === 1 || this.polls % HEARTBEAT_EVERY_POLLS === 0) {
        logger.info('💓 [notifications] poller alive', {
          polls: this.polls,
          queued: messages?.length || 0,
          pickedUpSinceHeartbeat: this.pickedUpSinceHeartbeat,
          everyPolls: HEARTBEAT_EVERY_POLLS,
        })
        this.pickedUpSinceHeartbeat = 0
      }

      if (!messages || messages.length === 0) {
        logger.debug('✅ Нет уведомлений для отправки')
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
      /*
       * A person who blocked the bot is not an incident.
       *
       * This fires once per tick per undeliverable message, and the commonest
       * cause by far is the customer's own doing -- a blocked bot, a deleted
       * account, a chat that no longer exists. There is nothing an operator can
       * do about any of them at 3am, and the retry cap below already stops the
       * message after three attempts. Anything NOT on the closed list in
       * helpers/telegramErrors.ts -- a 401 with the wrong token, a 500 from
       * Telegram, broken markup we built -- is ours and keeps paging.
       */
      const level = isUserCausedTelegramError(error) ? 'warn' : 'error'
      logger[level]('❌ Ошибка при отправке уведомления пользователю', {
        telegram_id: message.telegram_id,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      })
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
        // The id travels in meta, not in the headline: the throttle fingerprints
        // on the message text, so a per-row id in the title makes every repeat a
        // fresh incident. detailsForAlert renders meta into the alert body, so
        // the operator still gets the id on a failure that does page.
        const level = isTransientSupabaseError(error) ? 'warn' : 'error'
        logger[level]('❌ Ошибка при обновлении статуса сообщения', {
          messageId,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
      }
    } catch (error) {
      // A thrown Error's own fields are non-enumerable, so handing the raw error
      // to the logger as meta leaves detailsForAlert with nothing to render.
      // Name the fields explicitly or the alert arrives as a bare headline.
      const level = isTransientSupabaseError(error) ? 'warn' : 'error'
      logger[level]('❌ Ошибка при пометке сообщения как отправленного', {
        messageId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
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
        const level = isTransientSupabaseError(updateError) ? 'warn' : 'error'
        logger[level]('❌ Ошибка при обновлении статуса неудачного сообщения', {
          messageId,
          error: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        })
      }
    } catch (updateError) {
      const level = isTransientSupabaseError(updateError) ? 'warn' : 'error'
      logger[level]('❌ Ошибка при пометке сообщения как неудачного', {
        messageId,
        error:
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
        stack: updateError instanceof Error ? updateError.stack : undefined,
      })
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
        // Hourly, so the ten-minute throttle never collapses a repeat: a single
        // persistent network fault here is 24 pages a day. Same rule as above --
        // transient is a warn, anything else is a real delete failure.
        const level = isTransientSupabaseError(error) ? 'warn' : 'error'
        logger[level]('❌ Ошибка при очистке старых сообщений', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
      } else {
        logger.info('✅ Старые сообщения очищены')
      }
    } catch (error) {
      const level = isTransientSupabaseError(error) ? 'warn' : 'error'
      logger[level]('❌ Ошибка при очистке старых сообщений', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
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
