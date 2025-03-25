import { supabase } from '.'
import { starCost } from '@/price'

const usdToRub = 90

export async function getRevenueStatistics({ bot_name }: { bot_name: string }) {
  try {
    // Запрос на получение платежей
    const { data, error } = await supabase
      .from('payments')
      .select('amount, currency, stars, type')
      .eq('bot_name', bot_name)
      .eq('status', 'COMPLETED')

    if (error) {
      throw new Error(error.message)
    }

    // Запрос на получение общего количества пользователей бота
    const { data: totalUsersData, error: totalUsersError } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('bot_name', bot_name)
      .not('telegram_id', 'is', null)

    if (totalUsersError) {
      console.error(
        'Ошибка при получении общего количества пользователей:',
        totalUsersError
      )
    }

    // Запрос на получение количества платящих пользователей
    const { data: payingUsersData, error: payingUsersError } = await supabase
      .from('payments')
      .select('telegram_id')
      .eq('bot_name', bot_name)
      .eq('status', 'COMPLETED')
      .eq('type', 'income')
      .not('telegram_id', 'is', null)

    if (payingUsersError) {
      console.error(
        'Ошибка при получении количества платящих пользователей:',
        payingUsersError
      )
    }

    // Подсчет уникальных пользователей
    const uniqueUsers = totalUsersData
      ? [...new Set(totalUsersData.map(user => user.telegram_id))]
      : []

    // Подсчет уникальных платящих пользователей
    const uniquePayingUsers = payingUsersData
      ? [...new Set(payingUsersData.map(user => user.telegram_id))]
      : []

    // Инициализация переменных для статистики
    let totalIncomeStars = 0
    let totalIncomeRub = 0
    let totalOutcomeStars = 0
    let totalOutcomeRub = 0
    let incomePaymentsCount = 0
    let outcomePaymentsCount = 0

    // Обработка данных для подсчета
    data.forEach(payment => {
      if (payment.type === 'income') {
        incomePaymentsCount++
        if (payment.currency === 'STARS') {
          totalIncomeStars += payment.stars
        } else if (payment.currency === 'RUB') {
          totalIncomeRub += payment.amount
        }
      } else if (payment.type === 'outcome') {
        outcomePaymentsCount++
        if (payment.currency === 'STARS') {
          totalOutcomeStars += payment.stars
        } else if (payment.currency === 'RUB') {
          totalOutcomeRub += payment.amount
        }
      }
    })

    // Конвертация starCost в рубли
    const starCostInRub = starCost * usdToRub

    // Расчет эквивалента в рублях от звезд
    const incomeRubFromStars = totalIncomeStars * starCostInRub
    const outcomeRubFromStars = totalOutcomeStars * starCostInRub

    // Общая сумма в рублях (рубли + эквивалент звезд)
    const totalIncomeRubWithStars = totalIncomeRub + incomeRubFromStars
    const totalOutcomeRubWithStars = totalOutcomeRub + outcomeRubFromStars

    // Рассчитываем балансы
    const balanceStars = totalIncomeStars - totalOutcomeStars
    const balanceRub = totalIncomeRub - totalOutcomeRub
    const balanceRubWithStars =
      totalIncomeRubWithStars - totalOutcomeRubWithStars

    // Рассчитываем процент маржинальности (прибыльности)
    let profitabilityPercent = 0
    if (totalIncomeRubWithStars > 0) {
      profitabilityPercent =
        (balanceRubWithStars / totalIncomeRubWithStars) * 100
    }

    // Рассчет средней доходности на пользователя
    const revenuePerUser =
      uniquePayingUsers.length > 0
        ? totalIncomeRubWithStars / uniquePayingUsers.length
        : 0

    // Процент платящих пользователей
    const payingUsersPercent =
      uniqueUsers.length > 0
        ? (uniquePayingUsers.length / uniqueUsers.length) * 100
        : 0

    // Округление значений до двух знаков после запятой
    return {
      // Доходы
      income_stars: totalIncomeStars,
      income_rub: parseFloat(totalIncomeRub.toFixed(2)),
      income_rub_from_stars: parseFloat(incomeRubFromStars.toFixed(2)),
      income_rub_with_stars: parseFloat(totalIncomeRubWithStars.toFixed(2)),
      income_payments_count: incomePaymentsCount,

      // Расходы
      outcome_stars: totalOutcomeStars,
      outcome_rub: parseFloat(totalOutcomeRub.toFixed(2)),
      outcome_rub_from_stars: parseFloat(outcomeRubFromStars.toFixed(2)),
      outcome_rub_with_stars: parseFloat(totalOutcomeRubWithStars.toFixed(2)),
      outcome_payments_count: outcomePaymentsCount,

      // Балансы
      balance_stars: balanceStars,
      balance_rub: parseFloat(balanceRub.toFixed(2)),
      balance_rub_with_stars: parseFloat(balanceRubWithStars.toFixed(2)),

      // Статистика пользователей
      total_users: uniqueUsers.length,
      paying_users: uniquePayingUsers.length,
      paying_users_percent: parseFloat(payingUsersPercent.toFixed(2)),
      revenue_per_paying_user: parseFloat(revenuePerUser.toFixed(2)),

      // KPI и прочие метрики
      profitability_percent: parseFloat(profitabilityPercent.toFixed(2)),
      total_payments: data.length,

      // Средние значения
      average_income_per_transaction:
        incomePaymentsCount > 0
          ? parseFloat(
              (totalIncomeRubWithStars / incomePaymentsCount).toFixed(2)
            )
          : 0,
      average_outcome_per_transaction:
        outcomePaymentsCount > 0
          ? parseFloat(
              (totalOutcomeRubWithStars / outcomePaymentsCount).toFixed(2)
            )
          : 0,

      // Соотношение количества доходных/расходных операций
      income_to_outcome_ratio:
        outcomePaymentsCount > 0
          ? parseFloat((incomePaymentsCount / outcomePaymentsCount).toFixed(2))
          : incomePaymentsCount > 0
          ? Infinity
          : 0,
    }
  } catch (error) {
    console.error(
      'Ошибка при получении статистики по доходам и расходам:',
      error
    )
    return {
      income_stars: 0,
      income_rub: 0,
      income_rub_from_stars: 0,
      income_rub_with_stars: 0,
      income_payments_count: 0,

      outcome_stars: 0,
      outcome_rub: 0,
      outcome_rub_from_stars: 0,
      outcome_rub_with_stars: 0,
      outcome_payments_count: 0,

      balance_stars: 0,
      balance_rub: 0,
      balance_rub_with_stars: 0,

      total_users: 0,
      paying_users: 0,
      paying_users_percent: 0,
      revenue_per_paying_user: 0,

      profitability_percent: 0,
      total_payments: 0,
      average_income_per_transaction: 0,
      average_outcome_per_transaction: 0,
      income_to_outcome_ratio: 0,
    }
  }
}
