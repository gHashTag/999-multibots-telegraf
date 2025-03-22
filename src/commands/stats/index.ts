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

  console.log('revenueStatistics', revenueStatistics)

  // Форматирование сообщения
  const message = isRussian(ctx)
    ? `📊 **Статистика по доходам для бота ${botName}:**\n\n` +
      `💰 **Всего рублей:** ${revenueStatistics.total_rub} ₽\n` +
      `⭐ **Всего звезд:** ${revenueStatistics.total_stars} ⭐\n\n` +
      `💰 **Всего рублей (включая звезды):** ${revenueStatistics.total_rub_including_stars} ₽\n` +
      `⭐ **Всего звезд (включая рубли):** ${revenueStatistics.total_stars_including_rub} ⭐\n\n` +
      `📅 **Количество платежей:** ${revenueStatistics.total_payments}`
    : `📊 **Revenue Statistics for Bot ${botName}:**\n\n` +
      `💰 **Total Rubles:** ${revenueStatistics.total_rub} ₽\n` +
      `⭐ **Total Stars:** ${revenueStatistics.total_stars} ⭐\n\n` +
      `💰 **Total Rubles (including stars):** ${revenueStatistics.total_rub_including_stars} ₽\n` +
      `⭐ **Total Stars (including rubles):** ${revenueStatistics.total_stars_including_rub} ⭐\n\n` +
      `📅 **Total Payments:** ${revenueStatistics.total_payments}`

  await ctx.replyWithMarkdown(message)
}

export { getStatsCommand }
