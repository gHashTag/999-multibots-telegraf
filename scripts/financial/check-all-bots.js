// Скрипт для проверки всех ботов на фейковые доходы
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

const supabase = createClient(supabaseUrl, supabaseKey)

const bots = [
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

async function checkBot(botName) {
  console.log(`\n🔍 Анализ ${botName}...`)
  console.log('='.repeat(80))

  const { data: transactions, error } = await supabase
    .from('payments')
    .select('*')
    .eq('bot_name', botName)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error(`❌ Ошибка для ${botName}:`, error)
    return
  }

  if (!transactions || transactions.length === 0) {
    console.log(`⚠️  НЕТ ТРАНЗАКЦИЙ для ${botName}`)
    return
  }

  let totalIncome = 0
  let totalOutcome = 0
  let incomeCount = 0
  let outcomeCount = 0

  // Реальные платежи от пользователей
  const realUserPayments = transactions.filter(
    t =>
      t.type === 'MONEY_INCOME' &&
      t.category === 'REAL' &&
      (t.payment_method === 'Telegram' || t.payment_method === 'Robokassa')
  )

  // Все доходы
  const allIncomes = transactions.filter(t => t.type === 'MONEY_INCOME')

  transactions.forEach(t => {
    const amount = parseFloat(t.amount)
    if (t.type === 'MONEY_INCOME') {
      totalIncome += amount
      incomeCount++
    } else {
      totalOutcome += amount
      outcomeCount++
    }
  })

  console.log(`📊 Общие транзакции: ${transactions.length}`)
  console.log(`📈 Всего доходов: ${totalIncome} (${incomeCount} транзакций)`)
  console.log(`📉 Всего расходов: ${totalOutcome} (${outcomeCount} транзакций)`)
  console.log(`💰 Чистый результат: ${totalIncome - totalOutcome}`)

  console.log(
    `\n💳 РЕАЛЬНЫЕ ПЛАТЕЖИ ОТ ПОЛЬЗОВАТЕЛЕЙ: ${realUserPayments.length}`
  )
  if (realUserPayments.length === 0) {
    console.log('❌ НЕТ РЕАЛЬНЫХ ПЛАТЕЖЕЙ ОТ ПОЛЬЗОВАТЕЛЕЙ!')
    console.log('   ⚠️  ВСЕ ДОХОДЫ - СИСТЕМНЫЕ/ТЕСТОВЫЕ ОПЕРАЦИИ!')
  } else {
    const realIncome = realUserPayments.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    )
    console.log(`   ✅ Реальный доход: ${realIncome}`)
    console.log('   Примеры:')
    realUserPayments.slice(0, 5).forEach((t, i) => {
      console.log(
        `     ${i + 1}. ${t.currency} ${t.amount} - ${t.payment_method}`
      )
    })
  }

  // Анализ методов платежей
  const methods = {}
  allIncomes.forEach(t => {
    methods[t.payment_method] = (methods[t.payment_method] || 0) + 1
  })

  console.log('\n💳 МЕТОДЫ ПОЛУЧЕНИЯ ДОХОДОВ:')
  Object.entries(methods).forEach(([method, count]) => {
    const isReal = method === 'Telegram' || method === 'Robokassa'
    console.log(`  ${isReal ? '✅' : '⚠️ '} ${method}: ${count} транзакций`)
  })

  // Проверка на артефакты
  const suspiciousTransactions = allIncomes.filter(
    t =>
      t.description &&
      (t.description.includes('System Grant') ||
        t.description.includes('System Grant') ||
        t.description.includes('Manual') ||
        t.description.includes('Migration') ||
        t.description.includes('Refund'))
  )

  if (suspiciousTransactions.length > 0) {
    console.log(
      `\n⚠️  ПОДОЗРИТЕЛЬНЫЕ ТРАНЗАКЦИИ: ${suspiciousTransactions.length}`
    )
    suspiciousTransactions.slice(0, 5).forEach((t, i) => {
      console.log(
        `     ${t.currency} ${t.amount} - ${t.description?.substring(0, 60)}`
      )
    })
  }

  return {
    botName,
    totalTransactions: transactions.length,
    totalIncome,
    totalOutcome,
    realUserPaymentsCount: realUserPayments.length,
    realUserIncome: realUserPayments.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    ),
    hasRealPayments: realUserPayments.length > 0,
  }
}

async function analyzeAllBots() {
  console.log('🚀 АНАЛИЗ ВСЕХ БОТОВ НА ФЕЙКОВЫЕ ДОХОДЫ')
  console.log('='.repeat(80))

  const results = []

  for (const botName of bots) {
    try {
      const result = await checkBot(botName)
      if (result) {
        results.push(result)
      }
    } catch (err) {
      console.error(`❌ Критическая ошибка для ${botName}:`, err)
    }
  }

  console.log('\n\n' + '='.repeat(80))
  console.log('📋 СВОДКА ПО ВСЕМ БОТАМ')
  console.log('='.repeat(80))

  results.forEach(result => {
    const status = result.hasRealPayments
      ? '✅ РЕАЛЬНЫЕ ПЛАТЕЖИ'
      : '❌ ТОЛЬКО СИСТЕМНЫЕ'
    console.log(`${result.botName}:`)
    console.log(`  ${status}`)
    console.log(
      `  Транзакций: ${result.totalTransactions}, Реальных: ${result.realUserPaymentsCount}`
    )
    console.log(
      `  Доход общий: ${result.totalIncome}, Реальный: ${result.realUserIncome}`
    )
    console.log('')
  })

  // Вывод ботов с проблемами
  const problematicBots = results.filter(r => !r.hasRealPayments)
  if (problematicBots.length > 0) {
    console.log('⚠️  БОТЫ ТОЛЬКО С СИСТЕМНЫМИ ОПЕРАЦИЯМИ:')
    problematicBots.forEach(bot => {
      console.log(
        `  - ${bot.botName}: ${bot.totalTransactions} транзакций, 0 реальных платежей`
      )
    })
  }
}

analyzeAllBots()
  .then(() => {
    console.log('\n✅ Анализ завершен!')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Критическая ошибка:', err)
    process.exit(1)
  })
