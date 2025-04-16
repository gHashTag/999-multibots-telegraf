import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

const production = async (
  bot: Telegraf<MyContext>,
  port: number,
  webhookUrl: string,
  path: string
): Promise<void> => {
  try {
    // Проверяем валидность токена и информацию о боте
    let botInfo
    try {
      botInfo = await bot.telegram.getMe()
      logger.info('✅ Бот успешно аутентифицирован', {
        description: 'Bot authenticated successfully',
        username: botInfo.username,
        bot_id: botInfo.id,
        path,
      })
    } catch (error) {
      logger.error('❌ Ошибка получения информации о боте', {
        description: 'Error getting bot info',
        error: error instanceof Error ? error.message : String(error),
        error_code: error.response?.error_code,
        error_description: error.response?.description,
        path,
      })

      // Не прерываем выполнение других ботов
      if (error.response?.error_code === 401) {
        logger.error('❌ Ошибка авторизации (401): Токен недействителен', {
          description: 'Unauthorized (401): Token is invalid',
          path,
        })
        return
      }
      throw error
    }

    // Удаляем старый вебхук с обработкой ошибок
    logger.info('🔄 Удаляем старый вебхук...', {
      description: 'Deleting old webhook',
      webhookUrl,
      path,
    })

    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true })
      logger.info('✅ Старый вебхук удален', {
        description: 'Old webhook deleted',
      })
    } catch (error) {
      logger.error('❌ Ошибка удаления вебхука', {
        description: 'Error deleting webhook',
        error: error instanceof Error ? error.message : String(error),
        error_code: error.response?.error_code,
        error_description: error.response?.description,
        path,
      })

      // Не прерываем выполнение если возникла ошибка при удалении вебхука
      if (error.response?.error_code === 401) {
        logger.error('❌ Ошибка авторизации при удалении вебхука (401)', {
          description: 'Unauthorized (401) when deleting webhook',
          path,
        })
        return
      }
    }

    // Ждем 3 секунды перед установкой нового вебхука
    await new Promise(resolve => setTimeout(resolve, 3000))

    logger.info('🔄 Устанавливаем новый вебхук...', {
      description: 'Setting up new webhook',
      webhookUrl,
      path,
    })

    try {
      await bot.launch({
        webhook: {
          domain: webhookUrl,
          port,
          path,
          secretToken: process.env.SECRET_TOKEN,
        },
      })

      logger.info('✅ Бот запущен в режиме webhook', {
        description: 'Bot launched in webhook mode',
        webhookUrl,
        path,
        bot_username: botInfo.username,
      })
    } catch (error) {
      logger.error('❌ Ошибка запуска бота в режиме webhook', {
        description: 'Error launching bot in webhook mode',
        error: error instanceof Error ? error.message : String(error),
        error_code: error.response?.error_code,
        error_description: error.response?.description,
        webhookUrl,
        path,
      })

      // Не прерываем выполнение для других ботов
      return
    }

    return
  } catch (e) {
    logger.error('❌ Критическая ошибка при настройке production режима:', {
      description: 'Critical error in production setup',
      error: e instanceof Error ? e.message : String(e),
      error_code: e.response?.error_code,
      error_description: e.response?.description,
      path,
    })

    // Не останавливаем всю программу из-за ошибки одного бота
    logger.warn(
      '⚠️ Бот не был запущен, но программа продолжит работу с другими ботами',
      {
        description:
          'Bot was not launched, but the program will continue with other bots',
        path,
      }
    )

    return
  }
}

const development = async (bot: Telegraf<MyContext>): Promise<void> => {
  try {
    const botInfo = await bot.telegram.getMe().catch(error => {
      logger.error(
        '❌ Ошибка получения информации о боте в режиме разработки',
        {
          description: 'Error getting bot info in development mode',
          error: error instanceof Error ? error.message : String(error),
          error_code: error.response?.error_code,
          error_description: error.response?.description,
        }
      )
      throw error
    })

    logger.info('✅ Бот успешно аутентифицирован в режиме разработки', {
      description: 'Bot authenticated successfully in development mode',
      username: botInfo.username,
      bot_id: botInfo.id,
    })

    logger.info('🔄 Удаляем вебхук для development режима...', {
      description: 'Deleting webhook for development mode',
    })

    // Получаем информацию о текущем webhook
    const webhookInfo = await bot.telegram.getWebhookInfo().catch(error => {
      logger.error('❌ Ошибка получения информации о вебхуке', {
        description: 'Error getting webhook info',
        error: error instanceof Error ? error.message : String(error),
        error_code: error.response?.error_code,
        error_description: error.response?.description,
      })
      throw error
    })

    if (webhookInfo.url) {
      logger.info('📡 Обнаружен активный webhook:', {
        description: 'Active webhook detected',
        url: webhookInfo.url,
        has_custom_certificate: webhookInfo.has_custom_certificate,
        pending_update_count: webhookInfo.pending_update_count,
      })
    }

    // Принудительно удаляем webhook с опцией drop_pending_updates
    await bot.telegram
      .deleteWebhook({ drop_pending_updates: true })
      .catch(error => {
        logger.error('❌ Ошибка удаления вебхука в режиме разработки', {
          description: 'Error deleting webhook in development mode',
          error: error instanceof Error ? error.message : String(error),
          error_code: error.response?.error_code,
          error_description: error.response?.description,
        })
        throw error
      })

    // Дополнительная проверка удаления webhook
    const webhookInfoAfter = await bot.telegram
      .getWebhookInfo()
      .catch(error => {
        logger.error(
          '❌ Ошибка получения информации о вебхуке после удаления',
          {
            description: 'Error getting webhook info after deletion',
            error: error instanceof Error ? error.message : String(error),
            error_code: error.response?.error_code,
            error_description: error.response?.description,
          }
        )
        return { url: 'UNKNOWN' }
      })

    if (webhookInfoAfter.url) {
      logger.warn('⚠️ Не удалось полностью удалить webhook:', {
        description: 'Failed to completely remove webhook',
        url: webhookInfoAfter.url,
      })

      // Повторная попытка удаления
      await bot.telegram
        .deleteWebhook({ drop_pending_updates: true })
        .catch(error => {
          logger.error('❌ Ошибка повторного удаления вебхука', {
            description: 'Error deleting webhook on second attempt',
            error: error instanceof Error ? error.message : String(error),
            error_code: error.response?.error_code,
            error_description: error.response?.description,
          })
          throw error
        })

      // Даем Telegram API время на обработку запроса
      await new Promise(resolve => setTimeout(resolve, 3000))
    } else {
      logger.info('✅ Вебхук успешно удален', {
        description: 'Webhook successfully deleted',
      })
    }

    // Ждем дополнительное время перед запуском polling
    await new Promise(resolve => setTimeout(resolve, 2000))

    logger.info('🚀 Запускаем бота в режиме polling...', {
      description: 'Starting bot in polling mode',
      bot_username: botInfo.username,
    })

    try {
      await bot.launch()

      logger.info('✅ Бот запущен в режиме polling', {
        description: 'Bot launched in polling mode',
        bot_username: botInfo.username,
        bot_id: botInfo.id,
      })
    } catch (error) {
      logger.error('❌ Ошибка запуска бота в режиме polling', {
        description: 'Error launching bot in polling mode',
        error: error instanceof Error ? error.message : String(error),
        error_code: error.response?.error_code,
        error_description: error.response?.description,
      })
      throw error
    }

    return
  } catch (e) {
    logger.error('❌ Критическая ошибка при настройке development режима:', {
      description: 'Critical error in development setup',
      error: e instanceof Error ? e.message : String(e),
      error_code: e.response?.error_code,
      error_description: e.response?.description,
    })

    // В режиме разработки остановим приложение при критической ошибке
    throw e
  }
}

export { production, development }
