/**
 * Скрипт для анализа расходов амбассадоров за май 2025
 * Рассчитывает, сколько каждый амбассадор должен заплатить из счета $505.11
 */

import { supabase } from '../core/supabase/client'
import { logger } from '../utils/logger'

interface AmbassadorExpenses {
  telegram_id: string
  ambassador_name: string
  bot_name: string
  total_transactions: number
  total_expenses_stars: number
  total_income_stars: number
  percentage_of_total: number
  amount_to_pay_usd: number
}

interface MonthlySummary {
  total_expenses_all_ambassadors: number
  total_income_all_ambassadors: number
  net_expenses: number
  bill_amount_usd: number
  star_to_usd_rate: number
}

async function analyzeMayBilling() {
  console.log('💰 Анализ расходов амбассадоров за МАЙ 2025')
  console.log('='.repeat(60))

  const BILL_AMOUNT_USD = 505.11
  const ANALYSIS_MONTH = '2025-05'

  try {
    // 1. Получаем данные по всем амбассадорам за май 2025
    console.log('\n📊 Получение данных расходов за май 2025...')

    const { data: expensesData, error } = await supabase.rpc(
      'calculate_ambassador_expenses',
      {
        start_date: '2025-05-01',
        end_date: '2025-06-01',
      }
    )

    if (error) {
      console.error('❌ Ошибка при выполнении RPC:', error)

      // Fallback к прямому SQL запросу
      const { data: directData, error: directError } = await supabase.from(
        'avatars'
      ).select(`
          telegram_id,
          group,
          bot_name,
          created_at
        `)

      if (directError) {
        throw directError
      }

      // Получаем данные по транзакциям отдельно
      const ambassadorExpenses: AmbassadorExpenses[] = []
      let totalExpenses = 0

      for (const ambassador of directData) {
        const { data: payments, error: paymentsError } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('telegram_id', ambassador.telegram_id)
          .gte('payment_date', '2025-05-01')
          .lt('payment_date', '2025-06-01')
          .eq('status', 'COMPLETED')

        if (paymentsError) {
          console.warn(
            `⚠️ Ошибка получения платежей для ${ambassador.telegram_id}:`,
            paymentsError
          )
          continue
        }

        const expenses = payments
          .filter(p => p.type === 'MONEY_OUTCOME')
          .reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0)

        const income = payments
          .filter(p => p.type === 'MONEY_INCOME')
          .reduce((sum, p) => sum + (parseFloat(p.stars) || 0), 0)

        totalExpenses += expenses

        ambassadorExpenses.push({
          telegram_id: ambassador.telegram_id.toString(),
          ambassador_name: ambassador.group,
          bot_name: ambassador.bot_name,
          total_transactions: payments.length,
          total_expenses_stars: expenses,
          total_income_stars: income,
          percentage_of_total: 0, // Рассчитаем позже
          amount_to_pay_usd: 0, // Рассчитаем позже
        })
      }

      // Рассчитываем проценты и суммы к доплате
      ambassadorExpenses.forEach(amb => {
        amb.percentage_of_total =
          totalExpenses > 0
            ? (amb.total_expenses_stars / totalExpenses) * 100
            : 0
        amb.amount_to_pay_usd =
          totalExpenses > 0
            ? (amb.total_expenses_stars / totalExpenses) * BILL_AMOUNT_USD
            : 0
      })

      // Сортируем по расходам
      ambassadorExpenses.sort(
        (a, b) => b.total_expenses_stars - a.total_expenses_stars
      )

      // 2. Выводим результаты
      console.log('\n' + '='.repeat(80))
      console.log('📈 АНАЛИЗ РАСХОДОВ АМБАССАДОРОВ ЗА МАЙ 2025')
      console.log('='.repeat(80))

      console.log(`\n💵 Общий счет к оплате: $${BILL_AMOUNT_USD.toFixed(2)}`)
      console.log(
        `⭐ Общие расходы всех амбассадоров: ${totalExpenses.toFixed(2)} звезд`
      )
      console.log(
        `💸 Курс звезды: $${totalExpenses > 0 ? (BILL_AMOUNT_USD / totalExpenses).toFixed(6) : 0}/⭐`
      )

      console.log('\n' + '-'.repeat(80))
      console.log('👑 РАСПРЕДЕЛЕНИЕ РАСХОДОВ ПО АМБАССАДОРАМ:')
      console.log('-'.repeat(80))

      ambassadorExpenses.forEach((amb, index) => {
        if (amb.total_expenses_stars > 0) {
          console.log(
            `\n${index + 1}. 🤖 ${amb.ambassador_name} (${amb.bot_name})`
          )
          console.log(`   👤 Telegram ID: ${amb.telegram_id}`)
          console.log(`   📊 Транзакций: ${amb.total_transactions}`)
          console.log(
            `   ⭐ Расходы: ${amb.total_expenses_stars.toFixed(2)} звезд`
          )
          console.log(
            `   💰 Доходы: ${amb.total_income_stars.toFixed(2)} звезд`
          )
          console.log(
            `   📈 Доля в расходах: ${amb.percentage_of_total.toFixed(2)}%`
          )
          console.log(`   💵 К доплате: $${amb.amount_to_pay_usd.toFixed(2)}`)
        }
      })

      // 3. Амбассадоры без расходов
      const inactiveAmbassadors = ambassadorExpenses.filter(
        amb => amb.total_expenses_stars === 0
      )
      if (inactiveAmbassadors.length > 0) {
        console.log('\n' + '-'.repeat(80))
        console.log('💤 АМБАССАДОРЫ БЕЗ РАСХОДОВ В МАЕ:')
        console.log('-'.repeat(80))
        inactiveAmbassadors.forEach(amb => {
          console.log(
            `• ${amb.ambassador_name} (${amb.bot_name}) - ID: ${amb.telegram_id}`
          )
        })
      }

      // 4. Резюме для копирования
      const activeAmbassadors = ambassadorExpenses.filter(
        amb => amb.total_expenses_stars > 0
      )
      console.log('\n' + '='.repeat(80))
      console.log('📋 РЕЗЮМЕ ДЛЯ ОТПРАВКИ АМБАССАДОРАМ:')
      console.log('='.repeat(80))

      activeAmbassadors.forEach(amb => {
        console.log(
          `@${amb.ambassador_name}: $${amb.amount_to_pay_usd.toFixed(2)} (${amb.percentage_of_total.toFixed(1)}% от общих расходов)`
        )
      })

      const totalToPay = activeAmbassadors.reduce(
        (sum, amb) => sum + amb.amount_to_pay_usd,
        0
      )
      console.log(`\n💰 Общая сумма к сбору: $${totalToPay.toFixed(2)}`)
      console.log(
        `✅ Покрытие счета: ${((totalToPay / BILL_AMOUNT_USD) * 100).toFixed(1)}%`
      )

      // 5. Логируем результаты
      logger.info('📊 Анализ расходов амбассадоров завершен', {
        analysis_month: ANALYSIS_MONTH,
        bill_amount_usd: BILL_AMOUNT_USD,
        total_expenses_stars: totalExpenses,
        active_ambassadors: activeAmbassadors.length,
        inactive_ambassadors: inactiveAmbassadors.length,
        total_to_collect: totalToPay,
      })
    } else {
      console.log('✅ Данные получены через RPC функцию')
      console.log(expensesData)
    }
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
    logger.error('❌ Ошибка анализа расходов амбассадоров:', {
      error: error instanceof Error ? error.message : String(error),
      analysis_month: ANALYSIS_MONTH,
    })
  }
}

// Запуск анализа
analyzeMayBilling()
  .then(() => {
    console.log('\n🏁 Анализ завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })
