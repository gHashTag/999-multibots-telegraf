import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { PaymentStatus } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'

async function debugSubscription() {
  const telegramId = '144022504'
  console.log(`🔍 Отладка подписки для пользователя: ${telegramId}`)

  try {
    // 1. Прямой запрос к базе данных
    console.log('\n1️⃣ Прямой запрос к базе данных:')
    const { data: allPayments, error: allError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('payment_date', { ascending: false })
      .limit(10)

    if (allError) {
      console.error('❌ Ошибка запроса:', allError.message)
      return
    }

    console.log(`📊 Всего платежей найдено: ${allPayments?.length || 0}`)
    allPayments?.forEach((payment, index) => {
      console.log(`\n💳 Платеж ${index + 1}:`)
      console.log(`  ID: ${payment.id}`)
      console.log(`  Status: ${payment.status}`)
      console.log(`  Subscription Type: ${payment.subscription_type}`)
      console.log(`  Payment Date: ${payment.payment_date}`)
      console.log(`  Amount: ${payment.amount}`)
    })

    // 2. Запрос с фильтрами как в getUserDetailsSubscription
    console.log('\n2️⃣ Запрос с фильтрами getUserDetailsSubscription:')
    const { data: filteredPayments, error: filteredError } = await supabase
      .from('payments_v2')
      .select('subscription_type, payment_date')
      .eq('telegram_id', telegramId)
      .eq('status', PaymentStatus.COMPLETED)
      .not('subscription_type', 'is', null)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (filteredError) {
      console.error('❌ Ошибка фильтрованного запроса:', filteredError.message)
      return
    }

    console.log('📋 Результат фильтрованного запроса:')
    if (filteredPayments) {
      console.log(`  Subscription Type: ${filteredPayments.subscription_type}`)
      console.log(`  Payment Date: ${filteredPayments.payment_date}`)

      // Проверим тип
      const rawSubscriptionType = filteredPayments.subscription_type as string
      const upperCaseSubType = rawSubscriptionType.toUpperCase()
      console.log(`  Upper Case Type: ${upperCaseSubType}`)
      console.log(
        `  Is NEUROTESTER: ${upperCaseSubType === SubscriptionType.NEUROTESTER.toString()}`
      )
    } else {
      console.log('  🚫 Никаких результатов не найдено!')
    }

    // 3. Проверим константы
    console.log('\n3️⃣ Проверка констант:')
    console.log(`PaymentStatus.COMPLETED: "${PaymentStatus.COMPLETED}"`)
    console.log(
      `SubscriptionType.NEUROTESTER: "${SubscriptionType.NEUROTESTER}"`
    )

    // 4. Вызовем оригинальную функцию
    console.log('\n4️⃣ Результат getUserDetailsSubscription:')
    const userDetails = await getUserDetailsSubscription(telegramId)
    console.log('📋 UserDetails результат:')
    console.log(`  Subscription Type: ${userDetails.subscriptionType}`)
    console.log(`  Is Active: ${userDetails.isSubscriptionActive}`)
    console.log(`  Start Date: ${userDetails.subscriptionStartDate}`)
  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
  }
}

// Запускаем отладку
debugSubscription()
