// ПОЛУЧЕНИЕ ВСЕХ ДАННЫХ ИЗ payments_v2 С ПАГИНАЦИЕЙ
const { createClient } = require('@supabase/supabase-js')

// Креды Supabase берём ТОЛЬКО из окружения.
// Где взять значения: railway variables --kv | grep SUPABASE
//
// ВНИМАНИЕ, СМЕНА ЦЕЛИ. Раньше здесь были захардкожены URL и anon-ключ проекта,
// которого больше не существует (DNS не резолвится) — скрипт был нерабочим.
// Теперь он читает тот проект, на который указывает SUPABASE_URL, то есть БОЕВУЮ базу.
// Скрипт только читает (select), ничего не пишет.
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '❌ Не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY.\n' +
      '   Возьмите значения: railway variables --kv | grep SUPABASE'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { apikey: supabaseKey } },
})

// Список всех ботов
const botNames = [
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'Gaia_Kamskaia_bot',
  'AI_STARS_bot',
  'Kaya_easy_art_bot',
  'NeuroLenaAssistant_bot',
  'HaimGroupMedia_bot',
  'LeeSolarbot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot',
]

// Получаем данные с пагинацией
async function getAllDataWithPagination(botName) {
  const limit = 1000 // Берем по 1000 записей за раз
  let offset = 0
  let allTransactions = []
  let pageCount = 0

  while (true) {
    pageCount++
    console.log(`   📄 Страница ${pageCount}, offset ${offset}...`)

    const { data: transactions, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error(`❌ Ошибка для ${botName}:`, error.message)
      break
    }

    if (!transactions || transactions.length === 0) {
      console.log(`   ✅ Всего получено транзакций: ${allTransactions.length}`)
      break
    }

    allTransactions = allTransactions.concat(transactions)
    console.log(
      `   📊 Получено: ${transactions.length}, общий итог: ${allTransactions.length}`
    )

    offset += limit

    // Если получили меньше лимита, значит это последняя страница
    if (transactions.length < limit) {
      console.log(`   ✅ Все страницы получены`)
      break
    }

    // Пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return allTransactions
}

async function analyzeBot(botName) {
  console.log(`\n📊 ${botName}...`)

  try {
    // Получаем ВСЕ транзакции с пагинацией
    const transactions = await getAllDataWithPagination(botName)

    if (transactions.length === 0) {
      console.log(`   ⚠️  Нет транзакций`)
      return {
        botName,
        transactions: 0,
        realIncome: { xtr: 0, stars: 0, rub: 0 },
        systemIncome: { xtr: 0, stars: 0, rub: 0 },
        realExpense: { xtr: 0, stars: 0, rub: 0 },
      }
    }

    // Анализируем транзакции
    let realIncomeXTR = 0
    let realIncomeSTARS = 0
    let realIncomeRUB = 0

    let systemIncomeXTR = 0
    let systemIncomeSTARS = 0
    let systemIncomeRUB = 0

    let realExpenseXTR = 0
    let realExpenseSTARS = 0
    let realExpenseRUB = 0

    transactions.forEach(t => {
      const amount = parseFloat(t.amount) || 0
      const currency = t.currency
      const type = t.type
      const category = t.category
      const paymentMethod = t.payment_method
      const description = t.description || ''

      if (type === 'MONEY_INCOME') {
        // Определяем, это реальный доход или системный
        const isReal =
          (paymentMethod === 'Telegram' || paymentMethod === 'Robokassa') &&
          category === 'REAL'
        const isSystem =
          description.includes('System Grant') ||
          description.includes('Manual') ||
          description.includes('BONUS') ||
          description.includes('refund') ||
          description.includes('Refund') ||
          category === 'BONUS' ||
          paymentMethod === 'SYSTEM'

        if (isReal) {
          if (currency === 'XTR') realIncomeXTR += amount
          else if (currency === 'STARS') realIncomeSTARS += amount
          else if (currency === 'RUB') realIncomeRUB += amount
        } else if (isSystem) {
          if (currency === 'XTR') systemIncomeXTR += amount
          else if (currency === 'STARS') systemIncomeSTARS += amount
          else if (currency === 'RUB') systemIncomeRUB += amount
        }
      } else if (type === 'MONEY_OUTCOME') {
        // Все расходы - реальные
        if (currency === 'XTR') realExpenseXTR += amount
        else if (currency === 'STARS') realExpenseSTARS += amount
        else if (currency === 'RUB') realExpenseRUB += amount
      }
    })

    console.log(
      `   💰 Реальные доходы: XTR ${realIncomeXTR.toFixed(2)}, STARS ${realIncomeSTARS.toFixed(2)}, RUB ${realIncomeRUB.toFixed(2)}`
    )
    console.log(
      `   📦 Системные доходы: XTR ${systemIncomeXTR.toFixed(2)}, STARS ${systemIncomeSTARS.toFixed(2)}, RUB ${systemIncomeRUB.toFixed(2)}`
    )
    console.log(
      `   💸 Расходы: XTR ${realExpenseXTR.toFixed(2)}, STARS ${realExpenseSTARS.toFixed(2)}, RUB ${realExpenseRUB.toFixed(2)}`
    )

    return {
      botName,
      transactions: transactions.length,
      realIncome: {
        xtr: realIncomeXTR,
        stars: realIncomeSTARS,
        rub: realIncomeRUB,
      },
      systemIncome: {
        xtr: systemIncomeXTR,
        stars: systemIncomeSTARS,
        rub: systemIncomeRUB,
      },
      realExpense: {
        xtr: realExpenseXTR,
        stars: realExpenseSTARS,
        rub: realExpenseRUB,
      },
    }
  } catch (err) {
    console.error(`❌ Критическая ошибка для ${botName}:`, err.message)
    return null
  }
}

async function getAllBotsData() {
  console.log('🔍 ПОЛУЧЕНИЕ ВСЕХ ДАННЫХ ИЗ payments_v2 С ПАГИНАЦИЕЙ\n')
  console.log(
    '💡 Пагинация: получаем по 1000 записей за раз для обработки больших объемов\n'
  )

  const results = []

  for (const botName of botNames) {
    const result = await analyzeBot(botName)
    if (result) {
      results.push(result)
    }
  }

  // Сохраняем данные
  const fs = require('fs')
  fs.writeFileSync(
    'all_bots_data_payments_v2.json',
    JSON.stringify(results, null, 2)
  )
  console.log('\n💾 Данные сохранены в all_bots_data_payments_v2.json\n')

  // Итоговая сводка
  console.log('='.repeat(80))
  console.log('📊 ИТОГОВАЯ СВОДКА ПО ВСЕМ БОТАМ (ИЗ payments_v2)')
  console.log('='.repeat(80))

  results.forEach(bot => {
    console.log(`\n${bot.botName}:`)
    console.log(`  Транзакций: ${bot.transactions}`)
    console.log(
      `  Реальные доходы: XTR ${bot.realIncome.xtr.toFixed(2)}, STARS ${bot.realIncome.stars.toFixed(2)}, RUB ${bot.realIncome.rub.toFixed(2)}`
    )
    console.log(
      `  Системные доходы: XTR ${bot.systemIncome.xtr.toFixed(2)}, STARS ${bot.systemIncome.stars.toFixed(2)}, RUB ${bot.systemIncome.rub.toFixed(2)}`
    )
    console.log(
      `  Расходы: XTR ${bot.realExpense.xtr.toFixed(2)}, STARS ${bot.realExpense.stars.toFixed(2)}, RUB ${bot.realExpense.rub.toFixed(2)}`
    )
  })

  return results
}

getAllBotsData()
  .then(() => {
    console.log('\n✅ Анализ всех ботов из payments_v2 завершен!')
  })
  .catch(err => {
    console.error('\n❌ Ошибка:', err)
  })
