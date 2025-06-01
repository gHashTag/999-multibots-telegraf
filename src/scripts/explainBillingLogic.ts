/**
 * Объяснение логики расчета расходов амбассадоров
 * Показывает, что именно берется из таблицы payments_v2
 */

import { supabase } from '../core/supabase/client'

async function explainBillingLogic() {
  console.log('🔍 ОБЪЯСНЕНИЕ ЛОГИКИ РАСЧЕТА РАСХОДОВ')
  console.log('='.repeat(60))

  try {
    // 1. Показываем структуру таблицы payments_v2
    console.log('\n📋 1. СТРУКТУРА ТАБЛИЦЫ payments_v2:')
    console.log('-'.repeat(40))

    const { data: samplePayments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .gte('payment_date', '2025-05-01')
      .lt('payment_date', '2025-06-01')
      .eq('status', 'COMPLETED')
      .limit(5)

    if (paymentsError) throw paymentsError

    if (samplePayments.length > 0) {
      console.log('Пример записей из payments_v2:')
      samplePayments.forEach((payment, i) => {
        console.log(`\n${i + 1}. Запись ID: ${payment.id}`)
        console.log(`   telegram_id: ${payment.telegram_id}`)
        console.log(`   type: ${payment.type}`) // MONEY_OUTCOME или MONEY_INCOME
        console.log(`   status: ${payment.status}`) // COMPLETED, PENDING, etc.
        console.log(`   cost: ${payment.cost} (расходы в звездах)`)
        console.log(`   stars: ${payment.stars} (доходы в звездах)`)
        console.log(`   payment_date: ${payment.payment_date}`)
        console.log(`   subscription_type: ${payment.subscription_type}`)
      })
    }

    // 2. Показываем структуру таблицы avatars
    console.log('\n📋 2. СТРУКТУРА ТАБЛИЦЫ avatars (амбассадоры):')
    console.log('-'.repeat(40))

    const { data: avatarsData, error: avatarsError } = await supabase
      .from('avatars')
      .select('telegram_id, group, bot_name, created_at')
      .limit(10)

    if (avatarsError) throw avatarsError

    console.log('Амбассадоры и их боты:')
    avatarsData.forEach((avatar, i) => {
      console.log(
        `${i + 1}. ID: ${avatar.telegram_id} | Группа: ${avatar.group} | Бот: ${avatar.bot_name}`
      )
    })

    // 3. Объясняем логику расчета
    console.log('\n🧮 3. ЛОГИКА РАСЧЕТА:')
    console.log('-'.repeat(40))
    console.log('ШАГ 1: Берем всех амбассадоров из таблицы avatars')
    console.log(
      'ШАГ 2: Для каждого амбассадора ищем записи в payments_v2 за май 2025:'
    )
    console.log('  - payment_date >= "2025-05-01"')
    console.log('  - payment_date < "2025-06-01"')
    console.log('  - status = "COMPLETED"')
    console.log('')
    console.log('ШАГ 3: Считаем РАСХОДЫ (type = "MONEY_OUTCOME"):')
    console.log('  - Суммируем поле "cost" (в звездах)')
    console.log('ШАГ 4: Считаем ДОХОДЫ (type = "MONEY_INCOME"):')
    console.log('  - Суммируем поле "stars" (в звездах)')
    console.log('')
    console.log('ШАГ 5: Рассчитываем долю каждого амбассадора:')
    console.log(
      '  - Доля (%) = (расходы_амбассадора / общие_расходы_всех) * 100'
    )
    console.log(
      '  - К доплате ($) = (расходы_амбассадора / общие_расходы_всех) * $505.11'
    )

    // 4. Показываем конкретный пример расчета
    console.log('\n💡 4. ПРИМЕР РАСЧЕТА:')
    console.log('-'.repeat(40))

    // Берем первого амбассадора для примера
    if (avatarsData.length > 0) {
      const exampleAmbassador = avatarsData[0]

      const { data: ambassadorPayments, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', exampleAmbassador.telegram_id)
        .gte('payment_date', '2025-05-01')
        .lt('payment_date', '2025-06-01')
        .eq('status', 'COMPLETED')

      if (!error) {
        const expenses = ambassadorPayments
          .filter(p => p.type === 'MONEY_OUTCOME')
          .reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0)

        const income = ambassadorPayments
          .filter(p => p.type === 'MONEY_INCOME')
          .reduce((sum, p) => sum + (parseFloat(p.stars) || 0), 0)

        console.log(
          `Амбассадор: ${exampleAmbassador.group} (ID: ${exampleAmbassador.telegram_id})`
        )
        console.log(`Транзакций за май: ${ambassadorPayments.length}`)
        console.log(`Расходы (MONEY_OUTCOME): ${expenses.toFixed(2)} звезд`)
        console.log(`Доходы (MONEY_INCOME): ${income.toFixed(2)} звезд`)

        // Показываем детали транзакций
        if (ambassadorPayments.length > 0) {
          console.log('\nДетали транзакций:')
          ambassadorPayments.forEach((payment, i) => {
            console.log(
              `  ${i + 1}. ${payment.payment_date} | ${payment.type} | ${payment.type === 'MONEY_OUTCOME' ? payment.cost : payment.stars} звезд`
            )
          })
        }
      }
    }

    // 5. Показываем общую формулу
    console.log('\n📐 5. ФИНАЛЬНАЯ ФОРМУЛА:')
    console.log('-'.repeat(40))
    console.log('Общие расходы всех = Σ(расходы каждого амбассадора)')
    console.log('Доля амбассадора (%) = (его расходы / общие расходы) * 100')
    console.log('К доплате ($) = (его расходы / общие расходы) * $505.11')
    console.log('')
    console.log('Проверка: Σ(все доплаты) должно = $505.11')
  } catch (error) {
    console.error('💥 Ошибка:', error)
  }
}

// Запуск
explainBillingLogic()
  .then(() => {
    console.log('\n🏁 Объяснение завершено')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })
