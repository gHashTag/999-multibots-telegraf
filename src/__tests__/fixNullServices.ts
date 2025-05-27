import { supabase } from '@/core/supabase/client'

async function fixNullServices() {
  console.log('🔧 Исправляю null service_type...')

  // Получаем все транзакции с null service_type
  const { data: nullTransactions, error } = await supabase
    .from('payments_v2')
    .select('id, description, service_type')
    .eq('telegram_id', '352374518')
    .eq('status', 'COMPLETED')
    .is('service_type', null)

  if (error) {
    console.error('Ошибка:', error)
    return
  }

  console.log(
    `Найдено ${nullTransactions?.length || 0} транзакций с null service_type`
  )

  if (!nullTransactions || nullTransactions.length === 0) {
    return
  }

  let updatedCount = 0

  for (const transaction of nullTransactions) {
    let newServiceType: string | null = null
    const desc = transaction.description.toLowerCase()

    console.log(`Анализирую: "${transaction.description}"`)

    // Определяем service_type на основе описания
    if (desc.includes('video generation')) {
      if (desc.includes('kling')) {
        newServiceType = 'kling_video'
      } else if (desc.includes('minimax')) {
        newServiceType = 'minimax_video'
      } else if (desc.includes('haiper')) {
        newServiceType = 'haiper_video'
      } else if (desc.includes('runway')) {
        newServiceType = 'runway_video'
      } else if (desc.includes('luma')) {
        newServiceType = 'luma_video'
      } else {
        newServiceType = 'video_generation'
      }
    } else if (desc.includes('image') || desc.includes('изображение')) {
      newServiceType = 'image_generation'
    } else if (desc.includes('text') || desc.includes('текст')) {
      newServiceType = 'text_processing'
    } else if (desc.includes('voice') || desc.includes('голос')) {
      newServiceType = 'voice_processing'
    } else {
      newServiceType = 'unknown'
    }

    if (newServiceType) {
      console.log(`   -> ${newServiceType}`)

      const { error: updateError } = await supabase
        .from('payments_v2')
        .update({ service_type: newServiceType })
        .eq('id', transaction.id)

      if (updateError) {
        console.error(`Ошибка обновления ID ${transaction.id}:`, updateError)
      } else {
        updatedCount++
      }
    }
  }

  console.log(
    `\n✅ Обновлено ${updatedCount} из ${nullTransactions.length} транзакций`
  )

  // Проверяем результат
  const { data: finalStats, error: statsError } = await supabase
    .from('payments_v2')
    .select('service_type')
    .eq('telegram_id', '352374518')
    .eq('status', 'COMPLETED')

  if (!statsError && finalStats) {
    const serviceStats = new Map<string, number>()

    finalStats.forEach(transaction => {
      const service = transaction.service_type || 'null'
      serviceStats.set(service, (serviceStats.get(service) || 0) + 1)
    })

    console.log('\n📊 ФИНАЛЬНАЯ СТАТИСТИКА ПО СЕРВИСАМ:')
    const sortedServices = Array.from(serviceStats.entries()).sort(
      ([, a], [, b]) => b - a
    )

    sortedServices.forEach(([service, count]) => {
      const percentage = ((count / finalStats.length) * 100).toFixed(1)
      console.log(`   ${service}: ${count} транзакций (${percentage}%)`)
    })
  }
}

fixNullServices()
