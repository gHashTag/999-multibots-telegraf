import { MyContext } from '../../interfaces'
import { isOwner } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { isDev } from '@/config'
import { logger } from '@/utils/logger'
import { DEBUG_BOTS } from '@/config/debug'
import { supabase } from '@/core/supabase'
import { PostgrestError } from '@supabase/supabase-js'

const getStatsCommand = async (ctx: MyContext): Promise<void> => {
  // В режиме разработки используем конфигурацию для дебага
  const { userId, botName } = isDev
    ? DEBUG_BOTS[1]
    : {
        userId: ctx.from?.id,
        botName: ctx.botInfo.username,
      }

  logger.info({
    message: '🔍 Начало обработки команды /stats',
    description: 'Starting /stats command processing',
    user_id: userId,
    bot_name: botName,
    is_dev: isDev,
    bot_info: ctx.botInfo,
  })

  if (!userId) {
    logger.error({
      message: '❌ Отсутствует ID пользователя',
      description: 'User ID is missing',
      context: ctx,
    })
    await ctx.reply(
      isRussian(ctx)
        ? '❌ Ошибка: не удалось определить ваш ID'
        : '❌ Error: could not determine your ID'
    )
    return
  }

  // Проверка, является ли пользователь владельцем бота
  logger.info({
    message: '🔐 Проверка прав доступа',
    description: 'Checking owner permissions',
    user_id: userId,
    bot_name: botName,
  })

  const isUserOwner = await isOwner(userId, botName)

  logger.info({
    message: isUserOwner ? '✅ Доступ разрешен' : '🚫 Доступ запрещен',
    description: isUserOwner ? 'Access granted' : 'Access denied',
    user_id: userId,
    bot_name: botName,
    is_owner: isUserOwner,
  })

  if (!isUserOwner) {
    await ctx.reply(
      isRussian(ctx)
        ? '🚫 У вас нет прав для просмотра этой информации.'
        : '🚫 You do not have permission to view this information.'
    )
    return
  }

  try {
    // Получение статистики через новую функцию
    logger.info({
      message: '📊 Запрос статистики',
      description: 'Requesting bot statistics',
      bot_name: botName,
    })

    const { data: stats, error } = await supabase.rpc('get_bot_statistics', {
      p_bot_name: botName,
    })

    if (error) {
      logger.error({
        message: '❌ Ошибка SQL при получении статистики',
        description: 'SQL error while getting statistics',
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        user_id: userId,
        bot_name: botName,
      })
      throw error
    }

    if (!stats) {
      logger.error({
        message: '❌ Нет данных статистики',
        description: 'No statistics data returned',
        user_id: userId,
        bot_name: botName,
      })
      throw new Error('No statistics data returned')
    }

    const stat = stats[0]

    // Вычисляем процент платящих пользователей
    const paying_users_percent =
      stat.total_users > 0
        ? Math.round((stat.paying_users / stat.total_users) * 100)
        : 0

    // Вычисляем средний доход с платящего пользователя
    const revenue_per_paying_user =
      stat.paying_users > 0
        ? Math.round(stat.total_rub_income / stat.paying_users)
        : 0

    logger.info({
      message: '📈 Статистика получена',
      description: 'Bot statistics received',
      bot_name: botName,
      statistics: stat,
    })

    // Форматирование сообщения
    const message = isRussian(ctx)
      ? `📊 *Финансовая статистика бота ${botName}*\n\n` +
        `👥 *Пользователи:*\n` +
        `👤 Всего пользователей: ${stat.total_users}\n` +
        `💳 Платящих пользователей: ${stat.paying_users} (${paying_users_percent}%)\n` +
        `💰 Средний доход с платящего пользователя: ${revenue_per_paying_user} ₽\n\n` +
        `⭐ *Движение звёзд:*\n` +
        `📥 Получено:\n` +
        `• Куплено за рубли: ${stat.total_rub_income} ₽ ➡️ ${stat.stars_from_rub} ⭐\n` +
        `• Пополнено звездами: ${stat.stars_income} ⭐\n` +
        `• Бонусные звёзды: ${stat.bonus_stars} ⭐\n` +
        (stat.migration_stars > 0
          ? `• Миграция баланса: ➡️ ${stat.migration_stars} ⭐\n`
          : '') +
        `\n💫 Всего получено: ${
          stat.stars_from_rub +
          stat.stars_income +
          stat.bonus_stars +
          stat.migration_stars
        } ⭐\n` +
        `\n📤 Потрачено: ${stat.stars_spent} ⭐\n` +
        `\n📈 Баланс на текущий момент: ${
          stat.stars_from_rub +
          stat.stars_income +
          stat.bonus_stars +
          stat.migration_stars -
          stat.stars_spent
        } ⭐`
      : `📊 *Financial Statistics for Bot ${botName}*\n\n` +
        `👥 *Users:*\n` +
        `👤 Total users: ${stat.total_users}\n` +
        `💳 Paying users: ${stat.paying_users} (${paying_users_percent}%)\n` +
        `💰 Average revenue per paying user: ${revenue_per_paying_user} ₽\n\n` +
        `⭐ *Stars Movement:*\n` +
        `📥 Received:\n` +
        `• Purchased with rubles: ${stat.total_rub_income} ₽ ➡️ ${stat.stars_from_rub} ⭐\n` +
        `• Stars deposits: ${stat.stars_income} ⭐\n` +
        `• Bonus stars: ${stat.bonus_stars} ⭐\n` +
        (stat.migration_stars > 0
          ? `• Balance migration: ${stat.migration_stars} ⭐\n`
          : '') +
        `\n💫 Total received: ${
          stat.stars_from_rub +
          stat.stars_income +
          stat.bonus_stars +
          stat.migration_stars
        } ⭐\n` +
        `\n📤 Spent: ${stat.stars_spent} ⭐\n` +
        `\n📈 Current balance: ${
          stat.stars_from_rub +
          stat.stars_income +
          stat.bonus_stars +
          stat.migration_stars -
          stat.stars_spent
        } ⭐`

    logger.info({
      message: '📤 Отправка статистики',
      description: 'Sending statistics message',
      user_id: userId,
      bot_name: botName,
    })

    await ctx.reply(message, {
      parse_mode: 'Markdown',
    })

    logger.info({
      message: '✅ Статистика успешно отправлена',
      description: 'Statistics sent successfully',
      user_id: userId,
      bot_name: botName,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при получении статистики',
      description: 'Error getting statistics',
      error:
        error instanceof PostgrestError
          ? {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            }
          : error instanceof Error
          ? error.message
          : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      user_id: userId,
      bot_name: botName,
    })

    await ctx.reply(
      isRussian(ctx)
        ? `❌ Произошла ошибка при получении статистики: ${
            error instanceof PostgrestError
              ? `${error.message}${
                  error.hint ? `\nПодсказка: ${error.hint}` : ''
                }`
              : error instanceof Error
              ? error.message
              : 'Неизвестная ошибка'
          }`
        : `❌ An error occurred while getting statistics: ${
            error instanceof PostgrestError
              ? `${error.message}${error.hint ? `\nHint: ${error.hint}` : ''}`
              : error instanceof Error
              ? error.message
              : 'Unknown error'
          }`
    )
  }
}

export { getStatsCommand }
