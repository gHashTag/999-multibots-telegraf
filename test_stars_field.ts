import { supabase } from './src/core/supabase/client'

async function checkStarsFieldType() {
  console.log('🔍 ПРОВЕРКА ТИПА ПОЛЯ stars В БД')

  // Попробуем вставить точное значение 7.5
  const testData = {
    telegram_id: '144022504',
    amount: 7.5,
    stars: 7.5,
    currency: 'XTR',
    status: 'COMPLETED',
    type: 'MONEY_OUTCOME',
    description: 'Test exact 7.5 stars',
    payment_method: 'test',
    bot_name: 'test_bot',
    service_type: 'neuro_photo',
    inv_id: 'test-exact-' + Date.now(),
  }

  console.log('📝 Вставляем тестовую запись с 7.5⭐...')
  const { data, error } = await supabase
    .from('payments_v2')
    .insert(testData)
    .select('id, stars')
    .single()

  if (error) {
    console.error('❌ Ошибка вставки:', error.message)
    return
  }

  console.log('✅ Запись вставлена:', data)

  // Проверяем что реально записалось
  const { data: checkData } = await supabase
    .from('payments_v2')
    .select('id, stars, amount')
    .eq('id', data.id)
    .single()

  console.log('🔍 Проверяем что записалось:', checkData)
  console.log('📊 Тип поля stars:', typeof checkData?.stars)
  console.log('📊 Значение stars:', checkData?.stars)

  // Удаляем тестовую запись
  await supabase.from('payments_v2').delete().eq('id', data.id)
  console.log('🗑️ Тестовая запись удалена')
}

checkStarsFieldType().catch(console.error)
