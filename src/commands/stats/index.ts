import { MyContext } from '../../interfaces'
import { getRevenueStatistics, isOwner } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { isDev } from '@/config'

const getStatsCommand = async (ctx: MyContext): Promise<void> => {
  const userId = ctx.from?.id

  const botName = isDev ? 'neuro_blogger_bot' : ctx.botInfo?.username

  // Проверка, является ли пользователь владельцем бота
  if (!(await isOwner(userId, botName))) {
    await ctx.reply(
      isRussian(ctx)
        ? '🚫 У вас нет прав для просмотра этой информации.'
        : '🚫 You do not have permission to view this information.'
    )
    return
  }

  // Получение статистики
  const revenueStatistics = await getRevenueStatistics({
    bot_name: botName,
  })

  console.log('📊 Получена статистика доходов и расходов:', revenueStatistics)

  // Форматирование сообщения
  const message = isRussian(ctx)
    ? `📊 **Финансовая статистика бота ${botName}**\n\n` +
      `👥 **Пользователи:**\n` +
      `👤 Всего пользователей: ${revenueStatistics.total_users}\n` +
      `💳 Платящих пользователей: ${revenueStatistics.paying_users} (${revenueStatistics.paying_users_percent}%)\n` +
      `💰 Средний доход с платящего пользователя: ${revenueStatistics.revenue_per_paying_user} ₽\n\n` +
      `💸 **Доходы:**\n` +
      `⭐ Звезды: ${revenueStatistics.income_stars}\n` +
      `₽ Рубли: ${revenueStatistics.income_rub}\n` +
      `₽ Эквивалент в рублях (всего): ${revenueStatistics.income_rub_with_stars}\n` +
      `🧾 Количество транзакций: ${revenueStatistics.income_payments_count}\n\n` +
      `📉 **Расходы:**\n` +
      `⭐ Звезды: ${revenueStatistics.outcome_stars}\n` +
      `₽ Рубли: ${revenueStatistics.outcome_rub}\n` +
      `₽ Эквивалент в рублях (всего): ${revenueStatistics.outcome_rub_with_stars}\n` +
      `🧾 Количество транзакций: ${revenueStatistics.outcome_payments_count}\n\n` +
      `💰 **Баланс:**\n` +
      `⭐ Звезды: ${revenueStatistics.balance_stars}\n` +
      `₽ Рубли: ${revenueStatistics.balance_rub}\n` +
      `₽ Эквивалент в рублях (всего): ${revenueStatistics.balance_rub_with_stars}\n\n` +
      `📈 **Эффективность:**\n` +
      `💹 Маржинальность: ${revenueStatistics.profitability_percent}%\n` +
      `⚖️ Соотношение доходов к расходам: ${revenueStatistics.income_to_outcome_ratio}\n` +
      `💳 Средний доход на транзакцию: ${revenueStatistics.average_income_per_transaction} ₽\n` +
      `🔄 Всего транзакций: ${revenueStatistics.total_payments}`
    : `📊 **Financial Statistics for Bot ${botName}**\n\n` +
      `👥 **Users:**\n` +
      `👤 Total users: ${revenueStatistics.total_users}\n` +
      `💳 Paying users: ${revenueStatistics.paying_users} (${revenueStatistics.paying_users_percent}%)\n` +
      `💰 Average revenue per paying user: ${revenueStatistics.revenue_per_paying_user} ₽\n\n` +
      `💸 **Income:**\n` +
      `⭐ Stars: ${revenueStatistics.income_stars}\n` +
      `₽ Rubles: ${revenueStatistics.income_rub}\n` +
      `₽ Equivalent in rubles (total): ${revenueStatistics.income_rub_with_stars}\n` +
      `🧾 Number of transactions: ${revenueStatistics.income_payments_count}\n\n` +
      `📉 **Expenses:**\n` +
      `⭐ Stars: ${revenueStatistics.outcome_stars}\n` +
      `₽ Rubles: ${revenueStatistics.outcome_rub}\n` +
      `₽ Equivalent in rubles (total): ${revenueStatistics.outcome_rub_with_stars}\n` +
      `🧾 Number of transactions: ${revenueStatistics.outcome_payments_count}\n\n` +
      `💰 **Balance:**\n` +
      `⭐ Stars: ${revenueStatistics.balance_stars}\n` +
      `₽ Rubles: ${revenueStatistics.balance_rub}\n` +
      `₽ Equivalent in rubles (total): ${revenueStatistics.balance_rub_with_stars}\n\n` +
      `📈 **Performance:**\n` +
      `💹 Profitability: ${revenueStatistics.profitability_percent}%\n` +
      `⚖️ Income to expense ratio: ${revenueStatistics.income_to_outcome_ratio}\n` +
      `💳 Average income per transaction: ${revenueStatistics.average_income_per_transaction} ₽\n` +
      `🔄 Total transactions: ${revenueStatistics.total_payments}`

  await ctx.replyWithMarkdown(message)
}

export { getStatsCommand }
