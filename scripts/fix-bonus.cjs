const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  console.log('Missing secrets')
  process.exit(1)
}

const supabase = createClient(url, key)

;(async () => {
  const { data, error } = await supabase
    .from('payments_v2')
    .update({ type: 'MONEY_INCOME' })
    .in('telegram_id', [693774948, 691324065])
    .eq('description', 'Бонус от администратора для баланса 1000⭐')
    .select('telegram_id, type, stars')

  console.log('Result:', JSON.stringify({ data, error }))
})()
