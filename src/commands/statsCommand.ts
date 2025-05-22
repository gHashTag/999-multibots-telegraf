import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import {
  getUserBalanceStats,
  BotStatistics,
  UserBalanceStatsResult,
} from '@/core/supabase/getUserBalanceStats'
import {
  UserBalanceStats,
  RubPurchaseDetail,
  XtrPurchaseDetail,
  ServiceUsageDetail,
} from '@/core/supabase/getUserBalance'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getOwnedBots } from '@/core/supabase/getOwnedBots'

// Заменяем существующую formatDate на более надежную formatDateSafe
const formatDateSafe = (dateString: any): string => {
  if (!dateString) return 'N/A' // Возвращаем 'N/A' если дата отсутствует
  try {
    const date = new Date(dateString)
    // Проверяем, является ли дата валидной
    if (isNaN(date.getTime())) {
      logger.warn(`[formatDateSafe] Невалидная дата: ${dateString}`)
      return 'Invalid Date' // Возвращаем 'Invalid Date' для невалидных дат
    }
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0') // Месяцы в JS начинаются с 0
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch (e) {
    logger.error(`[formatDateSafe] Ошибка форматирования даты: ${dateString}`, {
      error: e,
    })
    return 'Error Formatting' // Возвращаем строку ошибки, если произошла неожиданная ошибка
  }
}

/**
 * Handles the /stats command, providing statistics to bot owners or admins.
 * @param bot The Telegraf bot instance.
 */
export const setupStatsCommand = (bot: Telegraf<MyContext>): void => {
  bot.command('stats', async ctx => {
    const telegramId = ctx.from?.id
    const username = ctx.from?.username || 'Anonymous'
    const chatId = ctx.chat.id
    const messageText = ctx.message?.text || ''
    const commandParts = messageText.split(' ')
    const targetBotNameArg =
      commandParts.length > 1 ? commandParts[1].replace('@', '') : null

    logger.info('📊 /stats command called', {
      telegram_id: telegramId,
      username,
      chat_id: chatId,
      target_bot_name_arg: targetBotNameArg,
    })

    if (!telegramId) {
      await ctx.reply('Не удалось определить ваш Telegram ID.')
      return
    }

    const isUserAdmin = ADMIN_IDS_ARRAY.includes(telegramId)

    try {
      if (targetBotNameArg) {
        // Сценарий: Указан конкретный бот в аргументе
        const botNameToFetchStats = targetBotNameArg
        const userIdForStats = String(telegramId) // По умолчанию статистика для вызвавшего пользователя

        if (isUserAdmin) {
          logger.info(
            `[statsCommand] Admin user ${telegramId} requested stats for bot: ${targetBotNameArg}`
          )
          // Здесь может потребоваться логика для определения, чью статистику админ хочет видеть
          // Пока что, как и раньше, админ видит СВОЮ статистику в указанном боте
          // Если Гуру решит, что админ должен видеть статистику владельца бота, здесь будут изменения.
        } else {
          // Обычный пользователь указал конкретного бота - покажем его статистику для этого бота,
          // если getUserBalanceStats это поддерживает (т.е. покажет его транзакции в этом боте)
          logger.info(
            `[statsCommand] User ${telegramId} requested stats for specific bot: ${targetBotNameArg}`
          )
        }

        const statsResult = await getUserBalanceStats(
          userIdForStats,
          botNameToFetchStats
        )
        if (!statsResult || statsResult.stats.length === 0) {
          await ctx.reply(
            `Не удалось получить статистику для вас по боту @${botNameToFetchStats}.`
          )
          return
        }

        // Берем первую статистику, так как мы запрашивали для конкретного бота
        const botStats = statsResult.stats[0]
        const message = formatBotStatsMessage(botStats, true)
        await ctx.replyWithHTML(message)
      } else if (isUserAdmin) {
        // Сценарий: Админ вызвал /stats без аргументов
        // TODO: Определить, что должен видеть админ в этом случае.
        // Пока что можно показать сообщение о том, что нужно указать имя бота.
        await ctx.reply(
          'Администратор, пожалуйста, укажите имя бота для получения статистики, например, /stats @имя_бота'
        )
      } else {
        // Сценарий: Обычный пользователь вызвал /stats без аргументов - показываем статистику по всем его ботам
        const ownedBots = await getOwnedBots(String(telegramId))

        if (ownedBots === null) {
          await ctx.reply('Произошла ошибка при получении списка ваших ботов.')
          return
        }

        if (ownedBots.length === 0) {
          await ctx.reply(
            'У вас нет зарегистрированных ботов для просмотра статистики.'
          )
          return
        }

        let fullMessage = '📊 <b>Ваша статистика по ботам:</b>\n'

        // Получаем полную статистику для всех ботов пользователя
        const statsResult = await getUserBalanceStats(String(telegramId))

        if (!statsResult || statsResult.stats.length === 0) {
          await ctx.reply('Не удалось получить статистику по вашим ботам.')
          return
        }

        // Отображаем статистику по каждому боту
        for (const botStat of statsResult.stats) {
          fullMessage += `\n\n--- <b>@${botStat.bot_name}</b> ---\n`
          fullMessage += formatBotStatsMessage(botStat, false) // Без заголовка, так как он уже включен выше
        }

        await ctx.replyWithHTML(fullMessage)
      }
    } catch (error) {
      logger.error('[statsCommand] Error fetching or processing stats:', {
        error,
        telegram_id: telegramId,
      })
      await ctx.reply(
        'Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже.'
      )
    }
  })
}

// Новая функция для форматирования статистики по боту
function formatBotStatsMessage(
  stats: BotStatistics,
  includeMainHeader = true
): string {
  let message = ''
  if (includeMainHeader) {
    message += `📊 <b>Статистика для бота @${stats.bot_name}</b>\n\n`
  }

  // Доходы
  message += `💰 <b>Доходы</b>\n`
  message += `   Всего дохода: ${stats.total_income} ⭐️\n`
  message += `   - NEUROVIDEO: ${stats.neurovideo_income} ⭐️\n`
  message += `   - Пополнения: ${stats.stars_topup_income} ⭐️\n\n`

  // Расходы
  message += `💸 <b>Расходы пользователей</b>\n`
  message += `   Всего потрачено: ${stats.total_outcome} ⭐️\n\n`

  // Себестоимость (новое)
  message += `💲 <b>Себестоимость</b>\n`
  message += `   Всего себестоимость: ${stats.total_cost} ⭐️\n\n`

  // Чистая прибыль (новое)
  message += `📈 <b>Чистая прибыль</b>\n`
  message += `   Прибыль: ${stats.net_profit} ⭐️\n`
  message += `   (Доход - Расходы - Себестоимость)\n\n`

  return message
}

// Старая функция formatStatsMessage - можно оставить для совместимости
// или удалить, если она больше не используется
function formatStatsMessage(
  stats: UserBalanceStats,
  botName: string,
  includeMainHeader = true
): string {
  let message = ''
  if (includeMainHeader) {
    message += `📊 <b>Статистика для бота @${botName}</b>\n\n`
  }

  message += `👤 <b>Пользователь:</b> ${stats.user_telegram_id}\n`
  if (stats.user_first_name || stats.user_last_name) {
    message += `   Имя: ${stats.user_first_name || ''} ${stats.user_last_name || ''}`
    message += `\n`
  }
  if (stats.user_username) {
    message += `   Username: @${stats.user_username}`
    message += `\n`
  }
  message += `\n`

  message += `💰 <b>Баланс</b>\n`
  message += `   RUB: ${stats.balance_rub?.toFixed(2) ?? '0.00'} ₽\n`
  message += `   XTR: ${stats.balance_xtr ?? 0} ⭐️\n`
  message += `\n`

  message += `📈 <b>Всего Пополнений RUB</b>\n`
  message += `   Сумма: ${stats.total_rub_deposited?.toFixed(2) ?? '0.00'} ₽\n`
  message += `   Количество: ${stats.total_rub_purchases_count ?? 0}\n`
  if (stats.rub_purchase_details && stats.rub_purchase_details.length > 0) {
    message += `   <i>Детали пополнений RUB:</i>\n`
    stats.rub_purchase_details.forEach((d: RubPurchaseDetail) => {
      message += `     - ${formatDateSafe(d.payment_date)}: ${d.amount_rub.toFixed(2)} ₽ (${d.payment_system})`
      if (d.transaction_id) message += ` ID: ${d.transaction_id}`
      message += `\n`
    })
  }
  message += `\n`

  message += `🌟 <b>Всего Покупок XTR (за RUB)</b>\n`
  message += `   Потрачено RUB: ${stats.total_rub_spent_for_xtr?.toFixed(2) ?? '0.00'} ₽\n`
  message += `   Получено XTR: ${stats.total_xtr_purchased ?? 0} ⭐️\n`
  message += `   Количество покупок: ${stats.total_xtr_purchases_count ?? 0}\n`
  if (stats.xtr_purchase_details && stats.xtr_purchase_details.length > 0) {
    message += `   <i>Детали покупок XTR:</i>\n`
    stats.xtr_purchase_details.forEach((d: XtrPurchaseDetail) => {
      message += `     - ${formatDateSafe(d.purchase_date)}: ${d.xtr_amount} ⭐️ за ${d.rub_amount.toFixed(2)} ₽ (${d.payment_system})`
      if (d.transaction_id) message += ` ID: ${d.transaction_id}`
      message += `\n`
    })
  }
  message += `\n`

  message += `🔧 <b>Всего Потрачено XTR на Сервисы</b>\n`
  message += `   Потрачено XTR: ${stats.total_xtr_spent_on_services ?? 0} ⭐️\n`
  message += `   Количество использований: ${stats.total_service_usage_count ?? 0}\n`
  if (stats.service_usage_details && stats.service_usage_details.length > 0) {
    message += `   <i>Детали использования сервисов:</i>\n`
    stats.service_usage_details.forEach((s: ServiceUsageDetail) => {
      message += `     - ${formatDateSafe(s.usage_date)}: ${s.xtr_cost} ⭐️ на '${s.service_name}' (${s.model_name || 'N/A'})`
      if (s.transaction_id) message += ` ID: ${s.transaction_id}`
      if (s.details) message += ` (${s.details})`
      message += `\n`
    })
  }
  message += `\n`

  if (stats.first_payment_date) {
    message += `🗓️ <b>Первый платеж:</b> ${formatDateSafe(stats.first_payment_date)}\n`
  }
  if (stats.last_payment_date) {
    message += `📅 <b>Последний платеж:</b> ${formatDateSafe(stats.last_payment_date)}\n`
  }
  message += `\n`
  message += `💡 <i>Курс покупки XTR может варьироваться. Показана фактическая стоимость на момент транзакции.</i>`

  return message
}

// Вспомогательная функция для эмодзи сервисов (можно расширить)
function getServiceEmoji(serviceName: string): string {
  if (!serviceName) return '⚙️'
  const lowerServiceName = serviceName.toLowerCase()
  if (lowerServiceName.includes('photo')) return '📸'
  if (
    lowerServiceName.includes('speech') ||
    lowerServiceName.includes('text-to-speech')
  )
    return '🔊'
  if (lowerServiceName.includes('video')) return '🎬'
  return '⚙️' // По умолчанию
}
