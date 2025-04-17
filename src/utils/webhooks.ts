import { Telegraf, Context } from 'telegraf'
import { botLogger, logSecurityEvent } from './logger'

/**
 * Конфигурация вебхуков для ботов
 */
export interface WebhookConfig {
  enabled: boolean
  domain: string
  path: string
  port: number
}

/**
 * Настраивает вебхуки для бота
 * @param bot Экземпляр бота
 * @param config Конфигурация вебхуков
 * @param botName Имя бота для логирования
 */
export async function configureWebhooks(
  bot: Telegraf<Context>,
  config: WebhookConfig,
  botName: string
): Promise<boolean> {
  try {
    const { enabled, domain, path, port } = config

    if (!enabled) {
      botLogger.info(botName, 'Вебхуки отключены в конфигурации')
      return false
    }

    if (!domain) {
      botLogger.error(botName, 'Домен для вебхуков не указан')
      return false
    }

    // Формируем URL для вебхука
    const webhookUrl = `https://${domain}${path}`

    botLogger.info(botName, `Настройка вебхука: ${webhookUrl}`)

    // Устанавливаем вебхук
    await bot.telegram.setWebhook(webhookUrl)

    // Проверяем, что вебхук успешно установлен
    const webhookInfo = await bot.telegram.getWebhookInfo()

    if (webhookInfo.url !== webhookUrl) {
      botLogger.error(
        botName,
        `Не удалось установить вебхук. Текущий URL: ${webhookInfo.url}`
      )
      return false
    }

    if (webhookInfo.pending_update_count > 0) {
      botLogger.warn(
        botName,
        `Есть ${webhookInfo.pending_update_count} ожидающих обновлений`
      )
    }

    if (webhookInfo.last_error_date) {
      const errorDate = new Date(
        webhookInfo.last_error_date * 1000
      ).toISOString()
      botLogger.warn(
        botName,
        `Последняя ошибка вебхука: ${webhookInfo.last_error_message} (${errorDate})`
      )

      // Логируем событие безопасности, если ошибка связана с сертификатами или доступом
      if (
        webhookInfo.last_error_message.includes('certificate') ||
        webhookInfo.last_error_message.includes('access') ||
        webhookInfo.last_error_message.includes('unauthorized')
      ) {
        logSecurityEvent(
          'webhook_security_error',
          {
            botName,
            errorMessage: webhookInfo.last_error_message,
            errorDate,
          },
          'warn'
        )
      }
    }

    botLogger.info(botName, `Вебхук успешно настроен: ${webhookUrl}`)

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    botLogger.error(botName, `Ошибка при настройке вебхука: ${errorMessage}`)

    // Логируем ошибку безопасности
    logSecurityEvent(
      'webhook_setup_error',
      {
        botName,
        errorMessage,
      },
      'error'
    )

    return false
  }
}

/**
 * Удаляет вебхук для бота
 * @param bot Экземпляр бота
 * @param botName Имя бота для логирования
 */
export async function removeWebhook(
  bot: Telegraf<Context>,
  botName: string
): Promise<void> {
  try {
    await bot.telegram.deleteWebhook()
    botLogger.info(botName, 'Вебхук удален')
  } catch (error) {
    botLogger.error(
      botName,
      `Ошибка при удалении вебхука: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export default configureWebhooks
