import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

interface UserAnalysis {
  userInfo: any
  currentBalance: number
  paymentHistory: any[]
  modelTrainings: any[]
  balanceTransactions: any[]
  refunds: any[]
}

async function analyzeUser(telegramId: string): Promise<UserAnalysis> {
  console.log(`🔍 Анализируем пользователя ${telegramId}...`)

  // 1. Основная информация о пользователе
  console.log('📊 Получаем основную информацию о пользователе...')
  const { data: userInfo, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  if (userError) {
    console.error('❌ Ошибка получения пользователя:', userError)
    throw userError
  }

  console.log('👤 Информация о пользователе:')
  console.log(`  ID: ${userInfo.id}`)
  console.log(`  Имя: ${userInfo.first_name} ${userInfo.last_name || ''}`)
  console.log(`  Username: @${userInfo.username || 'не указан'}`)
  console.log(`  Текущий баланс: ${userInfo.balance} ⭐`)
  console.log(`  Дата регистрации: ${userInfo.created_at}`)

  // 2. История всех платежей
  console.log('\n💳 Получаем историю платежей...')
  const { data: paymentHistory, error: paymentError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', parseInt(telegramId))
    .order('created_at', { ascending: false })

  if (paymentError) {
    console.error('❌ Ошибка получения платежей:', paymentError)
  }

  console.log(`💰 Найдено ${paymentHistory?.length || 0} транзакций`)

  // Группируем транзакции по типам
  const incomes = paymentHistory?.filter(p => p.type === 'MONEY_INCOME') || []
  const outcomes = paymentHistory?.filter(p => p.type === 'MONEY_OUTCOME') || []
  const refunds = paymentHistory?.filter(p => p.type === 'REFUND') || []
  const bonuses = paymentHistory?.filter(p => p.type === 'BONUS') || []

  console.log(
    `  📈 Пополнения: ${incomes.length} (${incomes.reduce((sum, p) => sum + p.stars, 0)} ⭐)`
  )
  console.log(
    `  📉 Списания: ${outcomes.length} (${outcomes.reduce((sum, p) => sum + Math.abs(p.stars), 0)} ⭐)`
  )
  console.log(
    `  💸 Возвраты: ${refunds.length} (${refunds.reduce((sum, p) => sum + p.stars, 0)} ⭐)`
  )
  console.log(
    `  🎁 Бонусы: ${bonuses.length} (${bonuses.reduce((sum, p) => sum + p.stars, 0)} ⭐)`
  )

  // 3. Тренировки моделей
  console.log('\n🤖 Получаем информацию о тренировках моделей...')
  const { data: modelTrainings, error: modelError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('user_id', userInfo.id)
    .order('created_at', { ascending: false })

  if (modelError) {
    console.error('❌ Ошибка получения моделей:', modelError)
  }

  console.log(`🎯 Найдено ${modelTrainings?.length || 0} тренировок моделей`)

  if (modelTrainings && modelTrainings.length > 0) {
    modelTrainings.forEach((model, index) => {
      console.log(
        `  ${index + 1}. Модель ${model.model_name || 'без названия'}`
      )
      console.log(`     Тип: ${model.model_type}`)
      console.log(`     Статус: ${model.status}`)
      console.log(`     Создана: ${model.created_at}`)
      console.log(`     Обновлена: ${model.updated_at}`)
      if (model.metadata) {
        console.log(
          `     Метаданные: ${JSON.stringify(model.metadata, null, 2)}`
        )
      }
    })
  }

  // 4. Детальный анализ возвратов и списаний связанных с моделями
  console.log('\n🔍 Анализируем операции связанные с моделями...')
  const modelRelatedTransactions =
    paymentHistory?.filter(
      p =>
        p.service_type?.includes('model') ||
        p.service_type?.includes('training') ||
        p.description?.toLowerCase().includes('модел') ||
        p.description?.toLowerCase().includes('train') ||
        p.description?.toLowerCase().includes('flux')
    ) || []

  console.log(
    `🎲 Найдено ${modelRelatedTransactions.length} операций связанных с моделями:`
  )
  modelRelatedTransactions.forEach((transaction, index) => {
    console.log(`  ${index + 1}. [${transaction.type}] ${transaction.stars} ⭐`)
    console.log(`     Дата: ${transaction.created_at}`)
    console.log(`     Описание: ${transaction.description || 'не указано'}`)
    console.log(`     Сервис: ${transaction.service_type || 'не указан'}`)
    console.log(`     Статус: ${transaction.status}`)
    if (transaction.cost) {
      console.log(`     Себестоимость: ${transaction.cost} ⭐`)
    }
    console.log(`     ---`)
  })

  // 5. Подробная информация о возвратах
  if (refunds.length > 0) {
    console.log('\n💸 Детальная информация о возвратах:')
    refunds.forEach((refund, index) => {
      console.log(`  ${index + 1}. Возврат ${refund.stars} ⭐`)
      console.log(`     Дата: ${refund.created_at}`)
      console.log(`     Описание: ${refund.description || 'не указано'}`)
      console.log(`     Сервис: ${refund.service_type || 'не указан'}`)
      console.log(`     ID операции: ${refund.operation_id || 'не указан'}`)
      console.log(`     ---`)
    })
  }

  return {
    userInfo,
    currentBalance: userInfo.balance,
    paymentHistory: paymentHistory || [],
    modelTrainings: modelTrainings || [],
    balanceTransactions: paymentHistory || [],
    refunds,
  }
}

// Запускаем анализ
async function main() {
  try {
    const analysis = await analyzeUser('7007992081')

    console.log('\n🎯 ИТОГОВЫЙ АНАЛИЗ:')
    console.log('=====================================')
    console.log(
      `👤 Пользователь: ${analysis.userInfo.first_name} ${analysis.userInfo.last_name || ''}`
    )
    console.log(`💰 Текущий баланс: ${analysis.currentBalance} ⭐`)
    console.log(`📊 Всего транзакций: ${analysis.paymentHistory.length}`)
    console.log(`🤖 Тренировок моделей: ${analysis.modelTrainings.length}`)
    console.log(`💸 Возвратов: ${analysis.refunds.length}`)

    const totalIncome = analysis.paymentHistory
      .filter(
        p =>
          p.type === 'MONEY_INCOME' || p.type === 'BONUS' || p.type === 'REFUND'
      )
      .reduce((sum, p) => sum + p.stars, 0)

    const totalOutcome = analysis.paymentHistory
      .filter(p => p.type === 'MONEY_OUTCOME')
      .reduce((sum, p) => sum + Math.abs(p.stars), 0)

    console.log(`📈 Всего пополнений/бонусов/возвратов: ${totalIncome} ⭐`)
    console.log(`📉 Всего списаний: ${totalOutcome} ⭐`)
    console.log(`⚖️ Разница: ${totalIncome - totalOutcome} ⭐`)

    if (analysis.refunds.length > 0) {
      const totalRefunds = analysis.refunds.reduce((sum, p) => sum + p.stars, 0)
      console.log(`✅ Общая сумма возвратов: ${totalRefunds} ⭐`)
    } else {
      console.log(`❌ Возвратов не найдено`)
    }
  } catch (error) {
    console.error('💥 Ошибка при анализе:', error)
  }
}

main()
