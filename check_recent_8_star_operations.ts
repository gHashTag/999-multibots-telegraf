import { supabase } from './src/core/supabase/client'

async function checkRecent8StarOperations() {
  console.log('🔍 ПРОВЕРКА НЕДАВНИХ ОПЕРАЦИЙ С 8⭐')

  // Ищем недавние операции neuro_photo с cost = 8
  const { data: recent8StarOps } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('service_type', 'neuro_photo')
    .eq('stars', 8)
    .eq('type', 'MONEY_OUTCOME')
    .order('created_at', { ascending: false })
    .limit(10)

  console.log(`📊 Найдено операций с 8⭐: ${recent8StarOps?.length || 0}`)

  if (recent8StarOps && recent8StarOps.length > 0) {
    console.log('\n📋 ПОСЛЕДНИЕ ОПЕРАЦИИ С 8⭐:')
    recent8StarOps.forEach((op, i) => {
      console.log(`${i + 1}. ID ${op.id}:`)
      console.log(`   💰 Сумма: ${op.stars}⭐ (amount: ${op.amount})`)
      console.log(`   📅 Дата: ${op.created_at}`)
      console.log(`   📝 Описание: ${op.description}`)
      console.log(`   🤖 Бот: ${op.bot_name}`)
      console.log(`   📊 Метаданные: ${JSON.stringify(op.metadata)}`)
      console.log(`   🔗 inv_id: ${op.inv_id}`)
      console.log('   ---')
    })
  }

  // Также проверим операции с 7.5⭐ для сравнения
  const { data: recent75StarOps } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('service_type', 'neuro_photo')
    .eq('stars', 7.5)
    .eq('type', 'MONEY_OUTCOME')
    .order('created_at', { ascending: false })
    .limit(5)

  console.log(`\n📊 Найдено операций с 7.5⭐: ${recent75StarOps?.length || 0}`)

  if (recent75StarOps && recent75StarOps.length > 0) {
    console.log('\n📋 ПОСЛЕДНИЕ ОПЕРАЦИИ С 7.5⭐:')
    recent75StarOps.forEach((op, i) => {
      console.log(`${i + 1}. ID ${op.id}:`)
      console.log(`   💰 Сумма: ${op.stars}⭐ (amount: ${op.amount})`)
      console.log(`   📅 Дата: ${op.created_at}`)
      console.log(`   📝 Описание: ${op.description}`)
      console.log(`   🤖 Бот: ${op.bot_name}`)
      console.log(`   📊 Метаданные: ${JSON.stringify(op.metadata)}`)
      console.log(`   🔗 inv_id: ${op.inv_id}`)
      console.log('   ---')
    })
  }
}

checkRecent8StarOperations().catch(console.error)
