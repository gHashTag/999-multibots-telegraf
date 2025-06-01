import { supabase } from '../core/supabase/client'

async function simpleExpenseAnalysis() {
  console.log('⭐ ПРОСТОЙ АНАЛИЗ РАСХОДОВ В ЗВЕЗДАХ')
  console.log('='.repeat(70))
  console.log('Май 2025: MONEY_OUTCOME транзакции')
  console.log('='.repeat(70))

  try {
    // ИСПРАВЛЕНИЕ: Используем пагинацию для получения ВСЕХ расходных транзакций
    let allExpenses: any[] = []
    let from = 0
    const batchSize = 1000
    let hasMore = true

    console.log('📥 Загружаем ВСЕ транзакции с пагинацией...')

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

        console.log(`   📦 Загружено ${allExpenses.length} транзакций...`)

        // Если получили меньше чем размер батча, значит это последняя порция
        if (batchExpenses.length < batchSize) {
          hasMore = false
        }
      }
    }

    const expenses = allExpenses
    console.log(`💳 ВСЕГО расходных транзакций: ${expenses.length}`)

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

    // 2. Показываем расходы по ботам
    console.log('\n🤖 РАСХОДЫ ПО БОТАМ:')
    console.log('='.repeat(70))

    const sortedBots = Object.entries(botExpenses).sort(([, a], [, b]) => b - a)

    let totalBotExpenses = 0
    sortedBots.forEach(([botName, cost], index) => {
      const percentage = ((cost / totalStars) * 100).toFixed(1)
      console.log(
        `${index + 1}. ${botName}: ${cost.toFixed(0)}⭐ (${percentage}%)`
      )
      totalBotExpenses += cost
    })

    console.log('-'.repeat(70))
    console.log(`💰 ИТОГО по ботам: ${totalBotExpenses.toFixed(0)}⭐`)

    // 3. Аномалии - транзакции БЕЗ bot_name
    if (anomalies.length > 0) {
      console.log('\n🚨 АНОМАЛИИ - ТРАНЗАКЦИИ БЕЗ BOT_NAME:')
      console.log('='.repeat(70))

      const anomalyExpenses = anomalies.reduce(
        (sum, a) => sum + parseFloat(a.cost || '0'),
        0
      )
      console.log(`❌ Аномальных транзакций: ${anomalies.length}`)
      console.log(`💸 Расходы аномалий: ${anomalyExpenses.toFixed(0)}⭐`)

      console.log('\nПримеры аномалий:')
      anomalies.slice(0, 5).forEach((anomaly, index) => {
        console.log(
          `${index + 1}. ID: ${anomaly.telegram_id}, Cost: ${anomaly.cost}⭐`
        )
        console.log(`   Описание: ${anomaly.description || 'Нет описания'}`)
      })

      const anomalyPercentage = ((anomalyExpenses / totalStars) * 100).toFixed(
        1
      )
      console.log(`\n📈 Доля аномалий: ${anomalyPercentage}%`)
    } else {
      console.log('\n✅ АНОМАЛИЙ НЕТ!')
      console.log('Все транзакции имеют bot_name')
    }

    // 4. ИТОГОВАЯ СВОДКА
    console.log('\n📊 ИТОГОВАЯ СВОДКА:')
    console.log('='.repeat(70))
    console.log(`⭐ ВСЕГО расходов: ${totalStars.toFixed(0)} звезд`)
    console.log(`🤖 Количество ботов: ${Object.keys(botExpenses).length}`)
    console.log(`💳 Всего транзакций: ${expenses.length}`)

    if (anomalies.length > 0) {
      console.log(`❌ Аномальных транзакций: ${anomalies.length}`)
      const anomalyExpenses = anomalies.reduce(
        (sum, a) => sum + parseFloat(a.cost || '0'),
        0
      )
      console.log(`💸 Неучтенные расходы: ${anomalyExpenses.toFixed(0)}⭐`)
    }

    // 5. Курс для $505.11
    console.log('\n💵 РАСЧЕТ КУРСА ДЛЯ $505.11:')
    console.log('='.repeat(70))
    const rate = 505.11 / totalStars
    console.log(`📈 Курс: $${rate.toFixed(6)} за ⭐`)
    console.log(`💰 При ${totalStars.toFixed(0)}⭐ = $505.11`)

    // 6. Дополнительный анализ по дням
    console.log('\n📅 АНАЛИЗ ПО ДНЯМ:')
    console.log('='.repeat(70))

    const dailyStats: {
      [date: string]: { transactions: number; cost: number }
    } = {}
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
      .slice(0, 10)

    console.log('Топ-10 дней по расходам:')
    sortedDays.forEach(([date, stats], index) => {
      console.log(
        `${index + 1}. ${date}: ${stats.cost.toFixed(0)}⭐ (${stats.transactions} транз.)`
      )
    })
  } catch (error) {
    console.error('💥 Ошибка:', error)
  }
}

simpleExpenseAnalysis()
  .then(() => {
    console.log('\n🏁 Анализ завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })
