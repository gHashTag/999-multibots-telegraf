import { supabase } from '@/core/supabase/client'

/**
 * Исправление service_type для видео транзакций
 */

async function fixVideoServices(userId: string) {
  console.log(
    `🎬 Исправляю service_type для видео транзакций пользователя ${userId}...`
  )

  // Получаем все unknown транзакции с видео
  const { data: unknownTransactions, error } = await supabase
    .from('payments_v2')
    .select('id, description, service_type')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')
    .eq('service_type', 'unknown')

  if (error) {
    console.error('Ошибка получения unknown транзакций:', error)
    return
  }

  if (!unknownTransactions || unknownTransactions.length === 0) {
    console.log('Unknown транзакции не найдены')
    return
  }

  console.log(`📊 Найдено ${unknownTransactions.length} unknown транзакций`)

  let updatedCount = 0

  for (const transaction of unknownTransactions) {
    let newServiceType: string | null = null
    const desc = transaction.description.toLowerCase()

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
    }

    if (newServiceType) {
      console.log(
        `   Обновляю ID ${transaction.id}: "${transaction.description}" -> ${newServiceType}`
      )

      const { error: updateError } = await supabase
        .from('payments_v2')
        .update({ service_type: newServiceType })
        .eq('id', transaction.id)

      if (updateError) {
        console.error(`Ошибка обновления ID ${transaction.id}:`, updateError)
      } else {
        updatedCount++
      }
    } else {
      console.log(
        `   ⚠️ Не удалось определить service_type для: "${transaction.description}"`
      )
    }
  }

  console.log(
    `\n✅ Обновлено ${updatedCount} из ${unknownTransactions.length} транзакций`
  )

  // Проверяем результат
  const { data: finalStats, error: statsError } = await supabase
    .from('payments_v2')
    .select('service_type')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')

  if (!statsError && finalStats) {
    const serviceStats = new Map<string, number>()

    finalStats.forEach(transaction => {
      const service = transaction.service_type || 'unknown'
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

// Основная функция
async function runVideoFix() {
  try {
    const userId = '352374518'
    console.log(
      `🚀 Запуск исправления видео сервисов для пользователя ${userId}...`
    )

    await fixVideoServices(userId)
  } catch (error) {
    console.error('❌ Ошибка при исправлении:', error)
    process.exit(1)
  }
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  runVideoFix()
}
