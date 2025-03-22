import { supabase } from '.'
import { starCost } from '@/price'

const usdToRub = 90

export async function getRevenueStatistics({ bot_name }: { bot_name: string }) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('amount, currency, stars')
      .eq('bot_name', bot_name)
      .eq('status', 'COMPLETED') // Фильтруем только по статусу COMPLETED

    if (error) {
      throw new Error(error.message)
    }

    // Инициализация переменных для статистики
    let totalStars = 0
    let totalRub = 0

    // Обработка данных для подсчета
    data.forEach(payment => {
      if (payment.currency === 'STARS') {
        totalStars += payment.stars // Суммируем звезды
      } else if (payment.currency === 'RUB') {
        totalRub += payment.amount // Суммируем рубли
      }
    })

    // Конвертация starCost в рубли
    const starCostInRub = starCost * usdToRub

    // Расчет эквивалента в рублях от звезд
    const totalRubFromStars = totalStars * starCostInRub

    // Общая сумма в рублях (рубли + эквивалент звезд)
    const totalRubIncludingStars = totalRub + totalRubFromStars

    // Конвертация общей суммы в рублях в звезды
    const totalStarsIncludingRub = totalStars + totalRub / starCostInRub

    // Округление значений до двух знаков после запятой
    return {
      total_stars: totalStars,
      total_rub: parseFloat(totalRub.toFixed(2)), // Сумма в рублях
      total_rub_from_stars: parseFloat(totalRubFromStars.toFixed(2)), // Сумма от звезд
      total_rub_including_stars: parseFloat(totalRubIncludingStars.toFixed(2)), // Общая сумма в рублях
      total_stars_including_rub: parseFloat(totalStarsIncludingRub.toFixed(2)), // Всего звезд, включая рубли
      total_payments: data.length, // Количество платежей
      average_stars:
        data.length > 0 ? parseFloat((totalStars / data.length).toFixed(2)) : 0,
      average_rub:
        data.length > 0 ? parseFloat((totalRub / data.length).toFixed(2)) : 0,
      max_payment:
        data.length > 0
          ? parseFloat(
              Math.max(...data.map(payment => payment.amount)).toFixed(2)
            )
          : 0,
      min_payment:
        data.length > 0
          ? parseFloat(
              Math.min(...data.map(payment => payment.amount)).toFixed(2)
            )
          : 0,
    }
  } catch (error) {
    console.error('Ошибка при получении статистики по доходам:', error)
    return {
      total_stars: 0,
      total_rub: 0,
      total_payments: 0,
      total_rub_from_stars: 0,
      total_rub_including_stars: 0,
      total_stars_including_rub: 0,
    }
  }
}
