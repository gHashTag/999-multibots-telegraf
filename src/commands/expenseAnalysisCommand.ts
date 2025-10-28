import { Composer, Markup } from 'telegraf'
import { logger } from '@/utils/enhancedLogger'
import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase/client'
import { ADMIN_IDS_ARRAY } from '@/config'

const composer = new Composer<MyContext>()

// Команда для анализа расходов
composer.command('expense_analysis', async ctx => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS_ARRAY.includes(userId)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды')
    return
  }

  try {
    await ctx.reply('📊 Начинаю анализ расходов в звездах за май 2025...')

    const result = await performExpenseAnalysis()

    // Разбиваем длинное сообщение на части
    const messages = splitMessage(result)

    for (const message of messages) {
      await ctx.reply(message, { parse_mode: 'HTML' })
    }
  } catch (error) {
    logger.error('❌ Ошибка в expense_analysis:', error)
    await ctx.reply('❌ Произошла ошибка при анализе расходов')
  }
})

// Функция анализа расходов
async function performExpenseAnalysis(): Promise<string> {
  // ИСПРАВЛЕНИЕ: Используем пагинацию для получения ВСЕХ расходных транзакций
  let allExpenses: any[] = []
  let from = 0
  const batchSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data: batchExpenses, error } = await supabase
      .from('payments_v2')
      .select(
        'bot_name, cost, stars, telegram_id, description, type, payment_date'
      )
      .eq('status', 'COMPLETED')
      .eq('type', 'MONEY_OUTCOME')
      .gte('payment_date', '2025-05-01')
      .lt('payment_date', '2025-06-01')
      .range(from, from + batchSize - 1)
      .order('payment_date', { ascending: false })

    if (error) throw error

    if (!batchExpenses || batchExpenses.length === 0) {
      hasMore = false
    } else {
      allExpenses = allExpenses.concat(batchExpenses)
      from += batchSize

      // Если получили меньше чем размер батча, значит это последняя порция
      if (batchExpenses.length < batchSize) {
        hasMore = false
      }
    }
  }

  const expenses = allExpenses

  // 1. Группируем по bot_name
  const botExpenses: { [botName: string]: number } = {}
  const anomalies: any[] = []
  let totalStars = 0

  expenses.forEach(expense => {
    const cost = parseFloat(expense.cost || '0')
    totalStars += cost

    if (expense.bot_name && expense.bot_name.trim() !== '') {
      // Есть bot_name - это нормальная транзакция
      if (!botExpenses[expense.bot_name]) {
        botExpenses[expense.bot_name] = 0
      }
      botExpenses[expense.bot_name] += cost
    } else {
      // НЕТ bot_name - это аномалия!
      anomalies.push(expense)
    }
  })

  // 2. Формируем отчет
  let report = '⭐ <b>АНАЛИЗ РАСХОДОВ В ЗВЕЗДАХ</b>\n'
  report += '📅 <b>Май 2025</b>\n\n'

  report += `💳 <b>Всего транзакций:</b> ${expenses.length.toLocaleString()}\n`
  report += `⭐ <b>Общие расходы:</b> ${totalStars.toLocaleString()}⭐\n`
  report += `💰 <b>Курс:</b> $${(505.11 / totalStars).toFixed(6)} за ⭐\n\n`

  // 3. Расходы по ботам
  const sortedBots = Object.entries(botExpenses).sort(([, a], [, b]) => b - a)

  report += '🤖 <b>РАСХОДЫ ПО БОТАМ:</b>\n'
  sortedBots.forEach(([botName, cost], index) => {
    const percentage = ((cost / totalStars) * 100).toFixed(1)
    const dollars = (cost * (505.11 / totalStars)).toFixed(2)
    report += `${index + 1}. <code>${botName}</code>\n`
    report += `   💰 ${cost.toLocaleString()}⭐ (${percentage}%) = $${dollars}\n`
  })

  // 4. Аномалии
  if (anomalies.length > 0) {
    const anomalyExpenses = anomalies.reduce(
      (sum, a) => sum + parseFloat(a.cost || '0'),
      0
    )
    const anomalyPercentage = ((anomalyExpenses / totalStars) * 100).toFixed(1)

    report += `\n🚨 <b>АНОМАЛИИ:</b>\n`
    report += `❌ Транзакций без bot_name: ${anomalies.length}\n`
    report += `💸 Расходы аномалий: ${anomalyExpenses.toFixed(
      0
    )}⭐ (${anomalyPercentage}%)\n`
  } else {
    report += '\n✅ <b>АНОМАЛИЙ НЕТ!</b>\n'
    report += 'Все транзакции корректно привязаны к ботам\n'
  }

  // 5. Топ дней по активности
  const dailyStats: { [date: string]: { transactions: number; cost: number } } =
    {}
  expenses.forEach(expense => {
    const date = expense.payment_date.split('T')[0]
    if (!dailyStats[date]) {
      dailyStats[date] = { transactions: 0, cost: 0 }
    }
    dailyStats[date].transactions++
    dailyStats[date].cost += parseFloat(expense.cost || '0')
  })

  const sortedDays = Object.entries(dailyStats)
    .sort(([, a], [, b]) => b.cost - a.cost)
    .slice(0, 5)

  report += '\n📅 <b>ТОП-5 ДНЕЙ ПО РАСХОДАМ:</b>\n'
  sortedDays.forEach(([date, stats], index) => {
    report += `${index + 1}. ${date}: ${stats.cost.toLocaleString()}⭐ (${
      stats.transactions
    } транз.)\n`
  })

  return report
}

// Функция разбивки длинного сообщения
function splitMessage(text: string): string[] {
  const maxLength = 4000 // Telegram limit is 4096, оставляем запас
  const messages: string[] = []

  if (text.length <= maxLength) {
    return [text]
  }

  const parts = text.split('\n\n') // Разбиваем по абзацам
  let currentMessage = ''

  for (const part of parts) {
    if ((currentMessage + part).length > maxLength) {
      if (currentMessage) {
        messages.push(currentMessage.trim())
        currentMessage = part + '\n\n'
      } else {
        // Если один абзац слишком длинный, разбиваем по строкам
        const lines = part.split('\n')
        for (const line of lines) {
          if ((currentMessage + line + '\n').length > maxLength) {
            if (currentMessage) {
              messages.push(currentMessage.trim())
              currentMessage = line + '\n'
            } else {
              messages.push(line)
            }
          } else {
            currentMessage += line + '\n'
          }
        }
        currentMessage += '\n'
      }
    } else {
      currentMessage += part + '\n\n'
    }
  }

  if (currentMessage.trim()) {
    messages.push(currentMessage.trim())
  }

  return messages
}

export default composer
