import { supabase } from '@/core/supabase/client'

/**
 * Анализ категоризации транзакций пользователя
 */

interface TransactionAnalysis {
  id: string
  payment_date: string
  type: string
  category: string
  stars: number
  amount: number
  service_type: string
  description: string
  bot_name: string
  metadata: any
}

async function analyzeUserCategories(userId: string) {
  console.log(
    `🔍 Анализирую категоризацию транзакций пользователя ${userId}...`
  )

  // Получаем все транзакции пользователя
  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', userId)
    .eq('status', 'COMPLETED')
    .order('payment_date', { ascending: false })

  if (error) {
    throw new Error(`Ошибка получения данных: ${error.message}`)
  }

  if (!payments || payments.length === 0) {
    throw new Error(`Транзакции для пользователя ${userId} не найдены`)
  }

  console.log(`📊 Найдено ${payments.length} транзакций`)

  // Анализируем категории
  const categoryStats = new Map<string, number>()
  const serviceStats = new Map<string, number>()
  const unknownTransactions: TransactionAnalysis[] = []
  const bonusTransactions: TransactionAnalysis[] = []
  const realTransactions: TransactionAnalysis[] = []

  payments.forEach(payment => {
    const category = payment.category || 'undefined'
    const service = payment.service_type || 'unknown'

    categoryStats.set(category, (categoryStats.get(category) || 0) + 1)
    serviceStats.set(service, (serviceStats.get(service) || 0) + 1)

    const transaction: TransactionAnalysis = {
      id: payment.id,
      payment_date: payment.payment_date,
      type: payment.type,
      category: payment.category,
      stars: payment.stars || 0,
      amount: payment.amount || 0,
      service_type: payment.service_type || 'unknown',
      description: payment.description || '',
      bot_name: payment.bot_name,
      metadata: payment.metadata,
    }

    if (service === 'unknown') {
      unknownTransactions.push(transaction)
    }

    if (category === 'BONUS') {
      bonusTransactions.push(transaction)
    } else if (category === 'REAL') {
      realTransactions.push(transaction)
    }
  })

  console.log('\n📊 СТАТИСТИКА ПО КАТЕГОРИЯМ:')
  categoryStats.forEach((count, category) => {
    const percentage = ((count / payments.length) * 100).toFixed(1)
    console.log(`   ${category}: ${count} транзакций (${percentage}%)`)
  })

  console.log('\n🛠️ СТАТИСТИКА ПО СЕРВИСАМ:')
  const sortedServices = Array.from(serviceStats.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  sortedServices.forEach(([service, count]) => {
    const percentage = ((count / payments.length) * 100).toFixed(1)
    console.log(`   ${service}: ${count} транзакций (${percentage}%)`)
  })

  console.log('\n🔍 АНАЛИЗ UNKNOWN ТРАНЗАКЦИЙ:')
  console.log(`Найдено ${unknownTransactions.length} unknown транзакций`)

  if (unknownTransactions.length > 0) {
    console.log('\n📋 Примеры unknown транзакций:')
    unknownTransactions.slice(0, 10).forEach((tx, index) => {
      console.log(`\n   ${index + 1}. ID: ${tx.id}`)
      console.log(
        `      Дата: ${new Date(tx.payment_date).toLocaleDateString('ru-RU')}`
      )
      console.log(`      Тип: ${tx.type}`)
      console.log(`      Категория: ${tx.category}`)
      console.log(`      Сумма: ${tx.stars} ⭐, ${tx.amount} ₽`)
      console.log(`      Описание: "${tx.description}"`)
      console.log(`      Бот: ${tx.bot_name}`)
      if (tx.metadata) {
        console.log(`      Метаданные: ${JSON.stringify(tx.metadata, null, 2)}`)
      }
    })
  }

  console.log('\n🎁 АНАЛИЗ БОНУСНЫХ ТРАНЗАКЦИЙ:')
  console.log(`Найдено ${bonusTransactions.length} бонусных транзакций`)

  if (bonusTransactions.length > 0) {
    console.log('\n📋 Примеры бонусных транзакций:')
    bonusTransactions.slice(0, 5).forEach((tx, index) => {
      console.log(`\n   ${index + 1}. ID: ${tx.id}`)
      console.log(
        `      Дата: ${new Date(tx.payment_date).toLocaleDateString('ru-RU')}`
      )
      console.log(`      Тип: ${tx.type}`)
      console.log(`      Сумма: ${tx.stars} ⭐, ${tx.amount} ₽`)
      console.log(`      Описание: "${tx.description}"`)
    })

    // Проверяем есть ли бонусы в доходах
    const bonusIncomes = bonusTransactions.filter(
      tx => tx.type === 'MONEY_INCOME'
    )
    if (bonusIncomes.length > 0) {
      console.log(
        `\n⚠️ ПРОБЛЕМА: Найдено ${bonusIncomes.length} бонусных доходов!`
      )
      console.log('Эти транзакции НЕ должны считаться реальными доходами:')
      bonusIncomes.forEach(tx => {
        console.log(`   - ${tx.stars} ⭐: "${tx.description}"`)
      })
    }
  }

  console.log('\n💰 АНАЛИЗ РЕАЛЬНЫХ ТРАНЗАКЦИЙ:')
  console.log(`Найдено ${realTransactions.length} реальных транзакций`)

  const realIncomes = realTransactions.filter(tx => tx.type === 'MONEY_INCOME')
  const realOutcomes = realTransactions.filter(
    tx => tx.type === 'MONEY_OUTCOME'
  )

  console.log(`   📈 Реальные доходы: ${realIncomes.length}`)
  console.log(`   📉 Реальные расходы: ${realOutcomes.length}`)

  // Анализируем описания для определения паттернов
  console.log('\n🔍 АНАЛИЗ ОПИСАНИЙ ДЛЯ UNKNOWN:')
  const descriptionPatterns = new Map<string, number>()

  unknownTransactions.forEach(tx => {
    const desc = tx.description.toLowerCase()

    // Ищем ключевые слова
    if (desc.includes('video') || desc.includes('видео')) {
      descriptionPatterns.set(
        'video_generation',
        (descriptionPatterns.get('video_generation') || 0) + 1
      )
    } else if (
      desc.includes('image') ||
      desc.includes('изображение') ||
      desc.includes('картинка')
    ) {
      descriptionPatterns.set(
        'image_processing',
        (descriptionPatterns.get('image_processing') || 0) + 1
      )
    } else if (desc.includes('text') || desc.includes('текст')) {
      descriptionPatterns.set(
        'text_processing',
        (descriptionPatterns.get('text_processing') || 0) + 1
      )
    } else if (
      desc.includes('voice') ||
      desc.includes('голос') ||
      desc.includes('аудио')
    ) {
      descriptionPatterns.set(
        'voice_processing',
        (descriptionPatterns.get('voice_processing') || 0) + 1
      )
    } else {
      descriptionPatterns.set(
        'other',
        (descriptionPatterns.get('other') || 0) + 1
      )
    }
  })

  console.log('Паттерны в описаниях unknown транзакций:')
  descriptionPatterns.forEach((count, pattern) => {
    console.log(`   ${pattern}: ${count} транзакций`)
  })

  return {
    total: payments.length,
    categoryStats,
    serviceStats,
    unknownTransactions,
    bonusTransactions,
    realTransactions,
    descriptionPatterns,
  }
}

// Основная функция
async function runCategoryAnalysis() {
  try {
    const userId = '352374518'
    console.log(`🚀 Запуск анализа категоризации для пользователя ${userId}...`)

    const analysis = await analyzeUserCategories(userId)

    console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН!')
    console.log(`\n📊 ИТОГО: ${analysis.total} транзакций проанализировано`)
  } catch (error) {
    console.error('❌ Ошибка при анализе:', error)
    process.exit(1)
  }
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  runCategoryAnalysis()
}
