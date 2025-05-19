import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { getUserBalanceStats } from '@/core/supabase/getUserBalanceStats'
import {
  UserBalanceStats,
  RubPurchaseDetail,
  XtrPurchaseDetail,
  ServiceUsageDetail,
} from '@/core/supabase/getUserBalance'
import { ADMIN_IDS_ARRAY } from '@/config'

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
 * Handles the /stats command, providing statistics to bot owners.
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

    let botNameToFetchStats = ctx.botInfo.username // По умолчанию текущий бот

    logger.info('[statsCommand] Initial params for fetching stats', {
      telegram_id_to_use: String(telegramId),
      bot_name_to_use: botNameToFetchStats,
      specified_target_bot: targetBotNameArg,
    })

    if (targetBotNameArg) {
      // Если указан аргумент с именем бота, проверяем права администратора
      if (!ADMIN_IDS_ARRAY.includes(telegramId)) {
        await ctx.reply(
          'У вас нет прав для просмотра статистики по указанному боту. Статистика будет показана для текущего бота.'
        )
        // botNameToFetchStats остается именем текущего бота
      } else {
        // Администратор может смотреть статистику по указанному боту
        botNameToFetchStats = targetBotNameArg
        logger.info(
          `[statsCommand] Admin user ${telegramId} requested stats for bot: ${targetBotNameArg}`
        )
      }
    }

    if (!botNameToFetchStats) {
      await ctx.reply(
        'Не удалось определить имя бота для получения статистики.'
      )
      logger.warn(
        '[statsCommand] Could not determine bot name to fetch stats for (current or arg)',
        { telegram_id: telegramId }
      )
      return
    }

    try {
      const stats = await getUserBalanceStats(
        String(telegramId),
        botNameToFetchStats // Используем определенное имя бота
      )

      logger.info('[statsCommand] Stats object received before formatting:', {
        stats_object: stats,
      })

      if (!stats) {
        await ctx.reply(
          `Не удалось получить статистику для бота @${botNameToFetchStats}.`
        )
        return
      }

      const message = formatStatsMessage(stats, botNameToFetchStats)
      await ctx.replyWithHTML(message)
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

// Helper function to format the statistics message
function formatStatsMessage(stats: UserBalanceStats, botName: string): string {
  let message = `📊 <b>Статистика для бота @${botName}</b>\n\n`

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
