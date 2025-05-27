import { supabase } from '@/core/supabase/client'

/**
 * Исправление категоризации и service_type для пользователя 352374518
 */

async function fixUserCategories(userId: string) {
  console.log(`🔧 Исправляю категоризацию для пользователя ${userId}...`)

  // 1. Исправляем бонусные доходы - они НЕ должны быть REAL
  console.log('\n🎁 Исправляю бонусные доходы...')

  const bonusIncomeDescriptions = [
    'System Correction: NEUROTESTER Access Grant',
    'Возврат за неудачную генерацию',
    'Дополнительное пополнение баланса',
    'Активация подписки нейровидео',
    'Техническое пополнение баланса',
    'System Grant: нейровидео Access',
    '⭐️ Пополнение баланса на',
    '🔄 Миграция баланса пользователя',
  ]

  for (const pattern of bonusIncomeDescriptions) {
    const { data: bonusTransactions, error: fetchError } = await supabase
      .from('payments_v2')
      .select('id, description, type, category')
      .eq('telegram_id', userId)
      .eq('status', 'COMPLETED')
      .like('description', `%${pattern}%`)

    if (fetchError) {
      console.error(
        `Ошибка поиска транзакций с паттерном "${pattern}":`,
        fetchError
      )
      continue
    }

    if (bonusTransactions && bonusTransactions.length > 0) {
      console.log(
        `   Найдено ${bonusTransactions.length} транзакций с паттерном "${pattern}"`
      )

      // Обновляем категорию на BONUS
      const { error: updateError } = await supabase
        .from('payments_v2')
        .update({ category: 'BONUS' })
        .eq('telegram_id', userId)
        .eq('status', 'COMPLETED')
        .like('description', `%${pattern}%`)

      if (updateError) {
        console.error(
          `Ошибка обновления категории для "${pattern}":`,
          updateError
        )
      } else {
        console.log(`   ✅ Обновлено ${bonusTransactions.length} транзакций`)
      }
    }
  }

  // 2. Исправляем unknown service_type для видео генерации
  console.log('\n🎬 Исправляю unknown service_type для видео генерации...')

  const { data: unknownVideoTransactions, error: fetchVideoError } =
    await supabase
      .from('payments_v2')
      .select('id, description, service_type')
      .eq('telegram_id', userId)
      .eq('status', 'COMPLETED')
      .eq('service_type', 'unknown')
      .like('description', '%Video generation%')

  if (fetchVideoError) {
    console.error('Ошибка поиска unknown видео транзакций:', fetchVideoError)
  } else if (unknownVideoTransactions && unknownVideoTransactions.length > 0) {
    console.log(
      `   Найдено ${unknownVideoTransactions.length} unknown видео транзакций`
    )

    // Определяем правильный service_type на основе описания
    for (const transaction of unknownVideoTransactions) {
      let newServiceType = 'video_generation'

      if (transaction.description.includes('Kling')) {
        newServiceType = 'kling_video'
      } else if (transaction.description.includes('Minimax')) {
        newServiceType = 'minimax_video'
      } else if (transaction.description.includes('Haiper')) {
        newServiceType = 'haiper_video'
      } else if (transaction.description.includes('Runway')) {
        newServiceType = 'runway_video'
      }

      const { error: updateServiceError } = await supabase
        .from('payments_v2')
        .update({ service_type: newServiceType })
        .eq('id', transaction.id)

      if (updateServiceError) {
        console.error(
          `Ошибка обновления service_type для ID ${transaction.id}:`,
          updateServiceError
        )
      }
    }

    console.log(
      `   ✅ Обновлено service_type для ${unknownVideoTransactions.length} транзакций`
    )
  }

  // 3. Проверяем результат
  console.log('\n📊 Проверяю результат...')

  const { data: finalStats, error: statsError } = await supabase
    .from('payments_v2')
    .select('category, service_type, type')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')

  if (statsError) {
    console.error('Ошибка получения финальной статистики:', statsError)
    return
  }

  const categoryStats = new Map<string, number>()
  const serviceStats = new Map<string, number>()
  const typeStats = new Map<string, number>()

  finalStats?.forEach(transaction => {
    const category = transaction.category || 'undefined'
    const service = transaction.service_type || 'unknown'
    const type = transaction.type || 'undefined'

    categoryStats.set(category, (categoryStats.get(category) || 0) + 1)
    serviceStats.set(service, (serviceStats.get(service) || 0) + 1)
    typeStats.set(type, (typeStats.get(type) || 0) + 1)
  })

  console.log('\n📊 ФИНАЛЬНАЯ СТАТИСТИКА ПО КАТЕГОРИЯМ:')
  categoryStats.forEach((count, category) => {
    const percentage = ((count / finalStats.length) * 100).toFixed(1)
    console.log(`   ${category}: ${count} транзакций (${percentage}%)`)
  })

  console.log('\n🛠️ ФИНАЛЬНАЯ СТАТИСТИКА ПО СЕРВИСАМ (топ 10):')
  const sortedServices = Array.from(serviceStats.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  sortedServices.forEach(([service, count]) => {
    const percentage = ((count / finalStats.length) * 100).toFixed(1)
    console.log(`   ${service}: ${count} транзакций (${percentage}%)`)
  })

  console.log('\n📈 СТАТИСТИКА ПО ТИПАМ:')
  typeStats.forEach((count, type) => {
    const percentage = ((count / finalStats.length) * 100).toFixed(1)
    console.log(`   ${type}: ${count} транзакций (${percentage}%)`)
  })

  // Проверяем бонусные доходы
  const { data: bonusIncomes, error: bonusError } = await supabase
    .from('payments_v2')
    .select('id, description, stars, type, category')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_INCOME')
    .eq('category', 'BONUS')

  if (!bonusError && bonusIncomes) {
    console.log(`\n🎁 Бонусных доходов теперь: ${bonusIncomes.length}`)
    if (bonusIncomes.length > 0) {
      const totalBonusStars = bonusIncomes.reduce(
        (sum, tx) => sum + (tx.stars || 0),
        0
      )
      console.log(`   Общая сумма бонусных доходов: ${totalBonusStars} ⭐`)
    }
  }

  console.log('\n✅ ИСПРАВЛЕНИЕ ЗАВЕРШЕНО!')
}

// Основная функция
async function runFix() {
  try {
    const userId = '352374518'
    console.log(`🚀 Запуск исправления для пользователя ${userId}...`)

    await fixUserCategories(userId)
  } catch (error) {
    console.error('❌ Ошибка при исправлении:', error)
    process.exit(1)
  }
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  runFix()
}
