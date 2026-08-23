// ПРОВЕРКА ВСЕХ БОТОВ В БАЗЕ ДАННЫХ
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

async function checkAllBotsInDB() {
  console.log('🔍 ПРОВЕРКА ВСЕХ БОТОВ В БАЗЕ ДАННЫХ\n')

  try {
    // Получаем ВСЕХ ботов из базы
    const { data: allPayments, error } = await supabase
      .from('payments')
      .select('bot_name, COUNT(*) as count')
      .order('count', { ascending: false })

    if (error) {
      console.error('❌ Ошибка:', error.message)
      return
    }

    console.log('📊 ВСЕ БОТЫ В БАЗЕ (по количеству транзакций):\n')

    allPayments.forEach((bot, i) => {
      console.log(`${i + 1}. ${bot.bot_name}: ${bot.count} транзакций`)
    })

    // Проверяем наших 10 ботов
    console.log('\n\n✅ НАШИ 10 БОТОВ:')
    const ourBots = [
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

    allPayments.forEach(payment => {
      if (ourBots.includes(payment.bot_name)) {
        console.log(`✅ ${payment.bot_name}: ${payment.count} транзакций`)
      }
    })

    // Ищем других ботов
    console.log('\n❓ ДРУГИЕ БОТЫ (которых нет в нашем списке):')
    let foundOtherBots = false
    allPayments.forEach(payment => {
      if (!ourBots.includes(payment.bot_name)) {
        console.log(`⚠️  ${payment.bot_name}: ${payment.count} транзакций`)
        foundOtherBots = true
      }
    })

    if (!foundOtherBots) {
      console.log('✅ Других ботов не найдено - анализируем всех правильно!')
    }
  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message)
  }
}

checkAllBotsInDB()
