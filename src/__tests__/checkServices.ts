import { supabase } from '@/core/supabase/client'

async function checkServices() {
  const { data, error } = await supabase
    .from('payments_v2')
    .select('service_type, description')
    .eq('telegram_id', '352374518')
    .eq('status', 'COMPLETED')
    .eq('service_type', 'unknown')
    .limit(5)

  if (error) {
    console.error('Ошибка:', error)
    return
  }

  console.log('Unknown транзакции:')
  data?.forEach(tx => {
    console.log(`- ${tx.service_type}: "${tx.description}"`)
  })

  // Проверим общую статистику
  const { data: stats, error: statsError } = await supabase
    .from('payments_v2')
    .select('service_type')
    .eq('telegram_id', '352374518')
    .eq('status', 'COMPLETED')

  if (!statsError && stats) {
    const serviceMap = new Map<string, number>()
    stats.forEach(tx => {
      const service = tx.service_type || 'null'
      serviceMap.set(service, (serviceMap.get(service) || 0) + 1)
    })

    console.log('\nВся статистика:')
    Array.from(serviceMap.entries())
      .sort(([, a], [, b]) => b - a)
      .forEach(([service, count]) => {
        console.log(`${service}: ${count}`)
      })
  }
}

checkServices()
