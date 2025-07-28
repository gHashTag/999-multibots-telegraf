import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

interface RefundAnomaly {
  telegramId: string
  userName: string
  chargeAmount: number
  refundAmount: number
  multiplier: number
  chargeDate: string
  refundDate: string
  chargeDescription: string
  refundDescription: string
}

async function findModelTrainingRefundAnomalies(): Promise<RefundAnomaly[]> {
  console.log('🔍 Поиск аномалий в возвратах за тренировку моделей...')

  // Получаем все транзакции связанные с тренировкой моделей
  const { data: transactions, error } = await supabase
    .from('payments_v2')
    .select('*')
    .or(
      'description.ilike.%тренировку модели%,description.ilike.%model training%,service_type.eq.digital_avatar_body'
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Ошибка получения транзакций:', error)
    return []
  }

  console.log(
    `📊 Найдено ${transactions?.length || 0} транзакций связанных с моделями`
  )

  const anomalies: RefundAnomaly[] = []
  const userTransactions = new Map<string, any[]>()

  // Группируем транзакции по пользователям
  transactions?.forEach(transaction => {
    const telegramId = transaction.telegram_id.toString()
    if (!userTransactions.has(telegramId)) {
      userTransactions.set(telegramId, [])
    }
    userTransactions.get(telegramId)!.push(transaction)
  })

  // Анализируем каждого пользователя
  for (const [telegramId, userTrans] of userTransactions.entries()) {
    console.log(`\n👤 Анализируем пользователя ${telegramId}...`)

    // Сортируем по дате
    userTrans.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Ищем пары "списание -> возврат"
    for (let i = 0; i < userTrans.length - 1; i++) {
      const charge = userTrans[i]
      const nextTrans = userTrans[i + 1]

      // Проверяем паттерн: списание за тренировку -> возврат
      if (
        charge.type === 'MONEY_OUTCOME' &&
        nextTrans.type === 'MONEY_INCOME' &&
        charge.description?.includes('тренировк') &&
        nextTrans.description?.includes(
          'Возврат средств за неудавшуюся тренировку'
        )
      ) {
        const chargeAmount = Math.abs(charge.stars)
        const refundAmount = Math.abs(nextTrans.stars)
        const multiplier = refundAmount / chargeAmount

        // Если возврат больше чем в 2 раза - это аномалия
        if (multiplier > 2) {
          // Получаем информацию о пользователе
          const { data: userInfo } = await supabase
            .from('users')
            .select('first_name, last_name, username')
            .eq('telegram_id', telegramId)
            .single()

          const userName = userInfo
            ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim()
            : 'Неизвестно'

          anomalies.push({
            telegramId,
            userName,
            chargeAmount,
            refundAmount,
            multiplier,
            chargeDate: charge.created_at,
            refundDate: nextTrans.created_at,
            chargeDescription: charge.description,
            refundDescription: nextTrans.description,
          })

          console.log(
            `🚨 АНОМАЛИЯ: Списание ${chargeAmount}⭐ -> Возврат ${refundAmount}⭐ (×${multiplier.toFixed(1)})`
          )
        }
      }
    }
  }

  return anomalies
}

async function calculateTotalDamage(
  anomalies: RefundAnomaly[]
): Promise<number> {
  let totalOverpayment = 0

  anomalies.forEach(anomaly => {
    const overpayment = anomaly.refundAmount - anomaly.chargeAmount
    totalOverpayment += overpayment
  })

  return totalOverpayment
}

async function generateFixTransactions(
  anomalies: RefundAnomaly[]
): Promise<any[]> {
  const fixTransactions = []

  for (const anomaly of anomalies) {
    const overpayment = anomaly.refundAmount - anomaly.chargeAmount

    // Создаем корректирующую транзакцию (списание переплаты)
    fixTransactions.push({
      telegram_id: parseInt(anomaly.telegramId),
      amount: overpayment,
      stars: -overpayment, // Отрицательное значение для списания
      type: 'MONEY_OUTCOME',
      description: `🔧 Коррекция переплаты за возврат тренировки модели (было: ${anomaly.refundAmount}⭐, должно: ${anomaly.chargeAmount}⭐)`,
      service_type: 'system_correction',
      operation_id: `correction_${anomaly.telegramId}_${Date.now()}`,
      bot_name: 'system',
      language: 'ru',
      payment_method: 'system_correction',
      is_system_payment: true,
      status: 'COMPLETED',
      category: 'correction',
      metadata: {
        correction_type: 'model_training_refund_overpayment',
        original_charge: anomaly.chargeAmount,
        original_refund: anomaly.refundAmount,
        overpayment: overpayment,
        charge_date: anomaly.chargeDate,
        refund_date: anomaly.refundDate,
      },
    })
  }

  return fixTransactions
}

async function main() {
  try {
    console.log(
      '🚀 Запуск анализа аномалий возвратов за тренировку моделей...\n'
    )

    // 1. Находим аномалии
    const anomalies = await findModelTrainingRefundAnomalies()

    if (anomalies.length === 0) {
      console.log('✅ Аномалий не найдено!')
      return
    }

    // 2. Показываем детальный отчет
    console.log('\n🎯 ДЕТАЛЬНЫЙ ОТЧЕТ ПО АНОМАЛИЯМ:')
    console.log('='.repeat(80))

    anomalies.forEach((anomaly, index) => {
      console.log(
        `\n${index + 1}. 👤 Пользователь: ${anomaly.userName} (${anomaly.telegramId})`
      )
      console.log(
        `   💸 Списано: ${anomaly.chargeAmount}⭐ (${new Date(anomaly.chargeDate).toLocaleString('ru-RU')})`
      )
      console.log(
        `   💰 Возвращено: ${anomaly.refundAmount}⭐ (${new Date(anomaly.refundDate).toLocaleString('ru-RU')})`
      )
      console.log(`   📈 Множитель: ×${anomaly.multiplier.toFixed(1)}`)
      console.log(
        `   💥 Переплата: ${(anomaly.refundAmount - anomaly.chargeAmount).toFixed(2)}⭐`
      )
      console.log(`   📝 Описание списания: ${anomaly.chargeDescription}`)
      console.log(`   📝 Описание возврата: ${anomaly.refundDescription}`)
    })

    // 3. Подсчитываем общий ущерб
    const totalDamage = await calculateTotalDamage(anomalies)

    console.log('\n💥 ИТОГОВАЯ СТАТИСТИКА:')
    console.log('='.repeat(50))
    console.log(`👥 Пользователей с аномалиями: ${anomalies.length}`)
    console.log(`💸 Общая переплата: ${totalDamage.toFixed(2)}⭐`)
    console.log(
      `📊 Средняя переплата на пользователя: ${(totalDamage / anomalies.length).toFixed(2)}⭐`
    )

    // 4. Генерируем корректирующие транзакции (НО НЕ ВЫПОЛНЯЕМ ИХ!)
    const fixTransactions = await generateFixTransactions(anomalies)

    console.log('\n🔧 ПЛАН КОРРЕКЦИИ:')
    console.log('='.repeat(50))
    console.log(`📝 Готовы ${fixTransactions.length} корректирующих транзакций`)
    console.log('⚠️  ВНИМАНИЕ: Транзакции НЕ ВЫПОЛНЕНЫ, только подготовлены!')
    console.log(
      '📋 Для выполнения коррекции требуется отдельное подтверждение.'
    )

    // 5. Сохраняем отчет в файл
    const reportData = {
      timestamp: new Date().toISOString(),
      totalAnomalies: anomalies.length,
      totalDamage,
      anomalies,
      fixTransactions,
    }

    require('fs').writeFileSync(
      'model_training_refund_anomalies_report.json',
      JSON.stringify(reportData, null, 2)
    )

    console.log(
      '\n💾 Отчет сохранен в файл: model_training_refund_anomalies_report.json'
    )
  } catch (error) {
    console.error('💥 Ошибка при анализе:', error)
  }
}

main()
