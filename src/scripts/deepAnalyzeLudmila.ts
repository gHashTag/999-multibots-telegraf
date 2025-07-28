import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

interface DetailedTransaction {
  id: number
  created_at: string
  telegram_id: number
  amount: number
  stars: number
  type: string
  description: string
  service_type: string
  payment_method: string
  is_system_payment: boolean
  status: string
  category: string
  metadata: any
}

async function deepAnalyzeLudmila(): Promise<void> {
  const telegramId = '7007992081'
  console.log(`🔍 ДЕТАЛЬНЫЙ АНАЛИЗ ПОЛЬЗОВАТЕЛЯ LUDMILA K (${telegramId})`)
  console.log('='.repeat(80))

  // 1. Получаем ВСЕ транзакции
  console.log('\n📊 ПОЛУЧЕНИЕ ВСЕХ ТРАНЗАКЦИЙ...')
  const { data: allTransactions, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ Ошибка получения транзакций:', error)
    return
  }

  console.log(`✅ Найдено транзакций: ${allTransactions?.length || 0}`)

  if (!allTransactions || allTransactions.length === 0) {
    console.log('❌ Транзакции не найдены')
    return
  }

  // 2. Анализируем каждую транзакцию
  console.log('\n📋 ДЕТАЛЬНЫЙ АНАЛИЗ КАЖДОЙ ТРАНЗАКЦИИ:')
  console.log('-'.repeat(120))
  console.log(
    '| №  | Дата/Время          | Тип        | Сумма⭐  | Описание                                    | Способ оплаты    | Статус   |'
  )
  console.log('-'.repeat(120))

  let runningBalance = 0
  const suspiciousTransactions: DetailedTransaction[] = []
  const credits: DetailedTransaction[] = []
  const debits: DetailedTransaction[] = []

  allTransactions.forEach((transaction, index) => {
    const date = new Date(transaction.created_at).toLocaleString('ru-RU')

    // Определяем реальный тип операции по категории и описанию
    let isCredit = false
    let actualAmount = 0

    if (
      transaction.type === 'MONEY_INCOME' ||
      transaction.description.includes('Возврат средств') ||
      transaction.description.includes('Компенсация') ||
      transaction.description.includes('Бонус') ||
      transaction.payment_method === 'Robokassa' ||
      transaction.payment_method === 'System Compensation' ||
      transaction.payment_method === 'Refund'
    ) {
      isCredit = true
      actualAmount = Math.abs(transaction.stars || transaction.amount || 0)
      credits.push(transaction)
    } else {
      isCredit = false
      actualAmount = -Math.abs(transaction.stars || transaction.amount || 0)
      debits.push(transaction)
    }

    runningBalance += actualAmount

    const typeIcon = isCredit ? '📈' : '📉'
    const typeText = isCredit ? 'CREDIT' : 'DEBIT'

    // Проверяем на подозрительные транзакции
    if (
      (isCredit && Math.abs(transaction.stars) > 500) || // Большие пополнения
      transaction.description.includes('Возврат средств') ||
      transaction.description.includes('Компенсация') ||
      transaction.description.includes('бонус') ||
      transaction.is_system_payment
    ) {
      suspiciousTransactions.push({
        ...transaction,
        actualAmount,
        isCredit,
      } as any)
    }

    console.log(
      `| ${(index + 1).toString().padStart(2)} | ${date.padEnd(19)} | ${typeIcon}${typeText.padEnd(8)} | ${actualAmount.toString().padStart(8)} | ${transaction.description.substring(0, 43).padEnd(43)} | ${(transaction.payment_method || 'N/A').padEnd(16)} | ${transaction.status.padEnd(8)} |`
    )
  })

  console.log('-'.repeat(120))
  console.log(`💰 ТЕКУЩИЙ БАЛАНС: ${runningBalance}⭐`)

  // 3. Анализируем подозрительные транзакции
  console.log('\n🚨 ПОДОЗРИТЕЛЬНЫЕ ТРАНЗАКЦИИ:')
  console.log('='.repeat(80))

  if (suspiciousTransactions.length === 0) {
    console.log('✅ Подозрительных транзакций не найдено')
  } else {
    console.log(
      `⚠️ Найдено подозрительных транзакций: ${suspiciousTransactions.length}`
    )
    suspiciousTransactions.forEach((transaction, index) => {
      console.log(`\n🔍 ПОДОЗРИТЕЛЬНАЯ ТРАНЗАКЦИЯ #${index + 1}:`)
      console.log(
        `  📅 Дата: ${new Date(transaction.created_at).toLocaleString('ru-RU')}`
      )
      console.log(`  💰 Сумма: ${Math.abs(transaction.stars)}⭐`)
      console.log(
        `  📋 Тип: ${(transaction as any).isCredit ? 'ПОПОЛНЕНИЕ' : 'СПИСАНИЕ'}`
      )
      console.log(`  📝 Описание: ${transaction.description}`)
      console.log(`  🔧 Способ: ${transaction.payment_method || 'N/A'}`)
      console.log(
        `  🤖 Системная: ${transaction.is_system_payment ? 'ДА' : 'НЕТ'}`
      )
      console.log(`  📊 Статус: ${transaction.status}`)
      console.log(`  🏷️ Категория: ${transaction.category || 'N/A'}`)
      console.log(
        `  📦 Метаданные: ${JSON.stringify(transaction.metadata, null, 2)}`
      )

      // Проверяем, если это возврат за тренировку модели
      if (
        transaction.description.includes('Возврат средств') &&
        transaction.description.includes('тренировку')
      ) {
        console.log(
          `  ⚠️ АНОМАЛИЯ: Подозрительный возврат за тренировку модели!`
        )
      }
    })
  }

  // 4. Анализируем по типам операций
  console.log('\n📊 АНАЛИЗ ПО ТИПАМ ОПЕРАЦИЙ:')
  console.log('='.repeat(50))

  const totalCredits = credits.reduce(
    (sum, t) => sum + Math.abs(t.stars || t.amount || 0),
    0
  )
  const totalDebits = debits.reduce(
    (sum, t) => sum + Math.abs(t.stars || t.amount || 0),
    0
  )

  console.log(`📈 ПОПОЛНЕНИЯ (${credits.length}): ${totalCredits}⭐`)
  credits.forEach(t => {
    console.log(
      `  • ${new Date(t.created_at).toLocaleDateString()} - ${Math.abs(t.stars)}⭐ - ${t.description}`
    )
  })

  console.log(`\n📉 СПИСАНИЯ (${debits.length}): ${totalDebits}⭐`)
  debits.forEach(t => {
    console.log(
      `  • ${new Date(t.created_at).toLocaleDateString()} - ${Math.abs(t.stars)}⭐ - ${t.description}`
    )
  })

  console.log(`\n⚖️ ИТОГО: ${totalCredits - totalDebits}⭐`)

  // 5. Ищем аномальные возвраты
  console.log('\n🚨 ПОИСК АНОМАЛЬНЫХ ВОЗВРАТОВ:')
  console.log('='.repeat(50))

  const refundTransactions = credits.filter(
    t =>
      t.description.includes('Возврат средств') &&
      t.description.includes('тренировку модели')
  )

  if (refundTransactions.length === 0) {
    console.log('✅ Аномальных возвратов не найдено')
  } else {
    console.log(`🔴 НАЙДЕНО АНОМАЛЬНЫХ ВОЗВРАТОВ: ${refundTransactions.length}`)

    let totalAnomalousRefunds = 0
    refundTransactions.forEach((transaction, index) => {
      const amount = Math.abs(transaction.stars)
      totalAnomalousRefunds += amount
      console.log(`\n🚨 АНОМАЛЬНЫЙ ВОЗВРАТ #${index + 1}:`)
      console.log(
        `  📅 ${new Date(transaction.created_at).toLocaleString('ru-RU')}`
      )
      console.log(`  💰 ${amount}⭐`)
      console.log(`  📝 ${transaction.description}`)
      console.log(`  ⚠️ СТАТУС: ПОДОЗРИТЕЛЬНО БОЛЬШАЯ СУММА!`)
    })

    console.log(
      `\n💥 ОБЩАЯ СУММА АНОМАЛЬНЫХ ВОЗВРАТОВ: ${totalAnomalousRefunds}⭐`
    )
  }

  // 6. Вычисляем правильный баланс
  console.log('\n🧮 ПРАВИЛЬНЫЙ РАСЧЕТ БАЛАНСА:')
  console.log('='.repeat(50))

  const legitimateCredits = credits.filter(
    t =>
      !t.description.includes(
        'Возврат средств за неудавшуюся тренировку модели'
      )
  )

  const legitimateCreditAmount = legitimateCredits.reduce(
    (sum, t) => sum + Math.abs(t.stars),
    0
  )
  const debitAmount = debits.reduce((sum, t) => sum + Math.abs(t.stars), 0)
  const correctBalance = legitimateCreditAmount - debitAmount

  console.log(`📈 Легитимные пополнения: ${legitimateCreditAmount}⭐`)
  console.log(`📉 Списания: ${debitAmount}⭐`)
  console.log(`✅ ПРАВИЛЬНЫЙ БАЛАНС: ${correctBalance}⭐`)

  if (refundTransactions.length > 0) {
    const anomalousAmount = refundTransactions.reduce(
      (sum, t) => sum + Math.abs(t.stars),
      0
    )
    console.log(`🚨 Аномальная переплата: ${anomalousAmount}⭐`)
    console.log(`💸 Сумма к возврату системе: ${anomalousAmount}⭐`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ АНАЛИЗ ЗАВЕРШЕН')
}

// Запускаем анализ
deepAnalyzeLudmila().catch(console.error)
