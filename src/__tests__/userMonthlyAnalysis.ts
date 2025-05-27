import { supabase } from '@/core/supabase/client'

/**
 * Анализ месячных трат пользователя
 */

interface MonthlySpending {
  month: string
  year: number
  total_spent_stars: number
  total_spent_rub: number
  transaction_count: number
  services_used: string[]
  top_service: string
  avg_transaction: number
}

interface UserAnalysis {
  user_id: string
  total_analysis: {
    total_spent_stars: number
    total_spent_rub: number
    total_transactions: number
    first_transaction: string
    last_transaction: string
    active_months: number
    favorite_service: string
  }
  monthly_breakdown: MonthlySpending[]
  service_breakdown: {
    service_name: string
    total_spent: number
    transaction_count: number
    percentage: number
  }[]
  bots_used: string[]
}

async function analyzeUserMonthlySpending(
  userId: string
): Promise<UserAnalysis> {
  console.log(`🔍 Анализирую месячные траты пользователя ${userId}...`)

  // Получаем все транзакции пользователя
  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_OUTCOME')
    .order('payment_date', { ascending: true })

  if (error) {
    throw new Error(`Ошибка получения данных: ${error.message}`)
  }

  if (!payments || payments.length === 0) {
    throw new Error(`Транзакции для пользователя ${userId} не найдены`)
  }

  console.log(`📊 Найдено ${payments.length} транзакций расходов`)

  // Группируем по месяцам
  const monthlyMap = new Map<string, MonthlySpending>()
  const serviceMap = new Map<string, { spent: number; count: number }>()
  const botsSet = new Set<string>()

  let totalStars = 0
  let totalRub = 0

  payments.forEach(payment => {
    const date = new Date(payment.payment_date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const serviceName = payment.service_type || 'unknown'

    botsSet.add(payment.bot_name)

    // Месячная статистика
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        month: date.toLocaleDateString('ru-RU', { month: 'long' }),
        year: date.getFullYear(),
        total_spent_stars: 0,
        total_spent_rub: 0,
        transaction_count: 0,
        services_used: [],
        top_service: '',
        avg_transaction: 0,
      })
    }

    const monthData = monthlyMap.get(monthKey)!
    monthData.total_spent_stars += payment.stars || 0
    monthData.total_spent_rub += payment.amount || 0
    monthData.transaction_count += 1

    if (!monthData.services_used.includes(serviceName)) {
      monthData.services_used.push(serviceName)
    }

    // Сервисная статистика
    const serviceData = serviceMap.get(serviceName) || { spent: 0, count: 0 }
    serviceData.spent += payment.stars || 0
    serviceData.count += 1
    serviceMap.set(serviceName, serviceData)

    totalStars += payment.stars || 0
    totalRub += payment.amount || 0
  })

  // Определяем топ сервис для каждого месяца
  monthlyMap.forEach((monthData, monthKey) => {
    const monthPayments = payments.filter(p => {
      const date = new Date(p.payment_date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      return key === monthKey
    })

    const monthServiceMap = new Map<string, number>()
    monthPayments.forEach(p => {
      const service = p.service_type || 'unknown'
      monthServiceMap.set(
        service,
        (monthServiceMap.get(service) || 0) + (p.stars || 0)
      )
    })

    let topService = 'unknown'
    let maxSpent = 0
    monthServiceMap.forEach((spent, service) => {
      if (spent > maxSpent) {
        maxSpent = spent
        topService = service
      }
    })

    monthData.top_service = topService
    monthData.avg_transaction =
      monthData.transaction_count > 0
        ? monthData.total_spent_stars / monthData.transaction_count
        : 0
  })

  // Сортируем месяцы
  const monthlyBreakdown = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, data]) => data)

  // Сервисная разбивка
  const serviceBreakdown = Array.from(serviceMap.entries())
    .map(([service, data]) => ({
      service_name: service,
      total_spent: data.spent,
      transaction_count: data.count,
      percentage: totalStars > 0 ? (data.spent / totalStars) * 100 : 0,
    }))
    .sort((a, b) => b.total_spent - a.total_spent)

  // Любимый сервис
  const favoriteService =
    serviceBreakdown.length > 0 ? serviceBreakdown[0].service_name : 'unknown'

  return {
    user_id: userId,
    total_analysis: {
      total_spent_stars: totalStars,
      total_spent_rub: totalRub,
      total_transactions: payments.length,
      first_transaction: payments[0].payment_date,
      last_transaction: payments[payments.length - 1].payment_date,
      active_months: monthlyBreakdown.length,
      favorite_service: favoriteService,
    },
    monthly_breakdown: monthlyBreakdown,
    service_breakdown: serviceBreakdown,
    bots_used: Array.from(botsSet),
  }
}

function formatAnalysisReport(analysis: UserAnalysis): string {
  let report = `\n👤 АНАЛИЗ МЕСЯЧНЫХ ТРАТ ПОЛЬЗОВАТЕЛЯ ${analysis.user_id}\n`
  report += '='.repeat(80) + '\n\n'

  // Общая статистика
  report += '📊 ОБЩАЯ СТАТИСТИКА:\n'
  report += `   💰 Всего потрачено: ${analysis.total_analysis.total_spent_stars.toFixed(2)} ⭐\n`
  if (analysis.total_analysis.total_spent_rub > 0) {
    report += `   💵 Всего потрачено: ${analysis.total_analysis.total_spent_rub.toFixed(2)} ₽\n`
  }
  report += `   🔢 Всего транзакций: ${analysis.total_analysis.total_transactions}\n`
  report += `   📅 Активных месяцев: ${analysis.total_analysis.active_months}\n`
  report += `   ❤️ Любимый сервис: ${analysis.total_analysis.favorite_service}\n`
  report += `   📆 Первая транзакция: ${new Date(analysis.total_analysis.first_transaction).toLocaleDateString('ru-RU')}\n`
  report += `   📆 Последняя транзакция: ${new Date(analysis.total_analysis.last_transaction).toLocaleDateString('ru-RU')}\n`
  report += `   🤖 Боты: ${analysis.bots_used.join(', ')}\n\n`

  // Месячная разбивка
  report += '📅 МЕСЯЧНАЯ РАЗБИВКА:\n'
  analysis.monthly_breakdown.forEach(month => {
    report += `   ${month.month} ${month.year}:\n`
    report += `      💰 Потрачено: ${month.total_spent_stars.toFixed(2)} ⭐\n`
    if (month.total_spent_rub > 0) {
      report += `      💵 Потрачено: ${month.total_spent_rub.toFixed(2)} ₽\n`
    }
    report += `      🔢 Транзакций: ${month.transaction_count}\n`
    report += `      📊 Средняя транзакция: ${month.avg_transaction.toFixed(2)} ⭐\n`
    report += `      🏆 Топ сервис: ${month.top_service}\n`
    report += `      🛠️ Сервисы: ${month.services_used.join(', ')}\n\n`
  })

  // Разбивка по сервисам
  report += '🛠️ РАЗБИВКА ПО СЕРВИСАМ:\n'
  analysis.service_breakdown.forEach((service, index) => {
    report += `   ${index + 1}. ${service.service_name}:\n`
    report += `      💰 Потрачено: ${service.total_spent.toFixed(2)} ⭐ (${service.percentage.toFixed(1)}%)\n`
    report += `      🔢 Транзакций: ${service.transaction_count}\n`
    report += `      📊 Средняя: ${(service.total_spent / service.transaction_count).toFixed(2)} ⭐\n\n`
  })

  // Тренды и выводы
  report += '📈 АНАЛИЗ ТРЕНДОВ:\n'

  if (analysis.monthly_breakdown.length >= 2) {
    const lastMonth =
      analysis.monthly_breakdown[analysis.monthly_breakdown.length - 1]
    const prevMonth =
      analysis.monthly_breakdown[analysis.monthly_breakdown.length - 2]
    const trend = lastMonth.total_spent_stars - prevMonth.total_spent_stars

    if (trend > 0) {
      report += `   📈 Траты растут: +${trend.toFixed(2)} ⭐ за последний месяц\n`
    } else if (trend < 0) {
      report += `   📉 Траты снижаются: ${trend.toFixed(2)} ⭐ за последний месяц\n`
    } else {
      report += `   ➡️ Траты стабильны\n`
    }
  }

  const avgMonthlySpending =
    analysis.total_analysis.total_spent_stars /
    analysis.total_analysis.active_months
  report += `   💡 Средние месячные траты: ${avgMonthlySpending.toFixed(2)} ⭐\n`

  const avgTransactionSize =
    analysis.total_analysis.total_spent_stars /
    analysis.total_analysis.total_transactions
  report += `   💡 Средний размер транзакции: ${avgTransactionSize.toFixed(2)} ⭐\n`

  return report
}

// Основная функция
async function runUserAnalysis() {
  try {
    const userId = '352374518'
    console.log(`🚀 Запуск анализа для пользователя ${userId}...`)

    const analysis = await analyzeUserMonthlySpending(userId)
    const report = formatAnalysisReport(analysis)

    console.log(report)

    console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН!')
  } catch (error) {
    console.error('❌ Ошибка при анализе:', error)
    process.exit(1)
  }
}

// Экспорт функций
export { analyzeUserMonthlySpending, formatAnalysisReport }

// Запуск если файл вызван напрямую
if (require.main === module) {
  runUserAnalysis()
}
