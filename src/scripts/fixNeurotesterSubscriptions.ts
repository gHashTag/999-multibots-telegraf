import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { PaymentStatus } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Массив сотрудников HaimGroupMedia_bot с доступом к NEUROTESTER
const HAIM_GROUP_STAFF_IDS = [
  '144022504', // Основной админ
  '1474143172', // Сотрудник 1
  '7669741878', // Сотрудник 2
  '164609458', // Сотрудник 3
  '289259562', // Сотрудник 4
  '752224685', // Сотрудник 5
  '1064902106', // Сотрудник 6
  '352374518', // Сотрудник 7 (добавлен)
]

async function fixNeurotesterSubscriptions() {
  console.log(
    '🔧 Исправление подписок NEUROTESTER для сотрудников HaimGroupMedia...'
  )

  try {
    for (const telegramId of HAIM_GROUP_STAFF_IDS) {
      console.log(`\n👤 Проверяю пользователя: ${telegramId}`)

      // Проверяем ВСЕ записи с NEUROTESTER
      const { data: allNeurotesterPayments, error: allError } = await supabase
        .from('payments_v2')
        .select('id, subscription_type, payment_date, status, amount')
        .eq('telegram_id', telegramId)
        .eq('subscription_type', SubscriptionType.NEUROTESTER)
        .order('payment_date', { ascending: false })

      if (allError) {
        console.error(
          `❌ Ошибка проверки всех NEUROTESTER для ${telegramId}:`,
          allError.message
        )
        continue
      }

      console.log(
        `📊 NEUROTESTER записей найдено: ${allNeurotesterPayments?.length || 0}`
      )
      allNeurotesterPayments?.forEach((payment, index) => {
        console.log(
          `  ${index + 1}. ID:${payment.id} Status:${payment.status} Date:${payment.payment_date}`
        )
      })

      // Проверяем АКТИВНУЮ подписку NEUROTESTER (COMPLETED статус)
      const { data: activeNeurotester, error: activeError } = await supabase
        .from('payments_v2')
        .select('id, subscription_type, payment_date, status')
        .eq('telegram_id', telegramId)
        .eq('subscription_type', SubscriptionType.NEUROTESTER)
        .eq('status', PaymentStatus.COMPLETED)
        .order('payment_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeError) {
        console.error(
          `❌ Ошибка проверки активной подписки для ${telegramId}:`,
          activeError.message
        )
        continue
      }

      if (activeNeurotester) {
        console.log(
          `✅ У пользователя ${telegramId} есть АКТИВНАЯ NEUROTESTER подписка`
        )
        console.log(
          `📅 Дата: ${activeNeurotester.payment_date}, ID: ${activeNeurotester.id}`
        )
        continue
      }

      // Если нет АКТИВНОЙ подписки, создаем её или исправляем существующую
      console.log(`🔧 Нет АКТИВНОЙ NEUROTESTER подписки для ${telegramId}`)

      if (allNeurotesterPayments && allNeurotesterPayments.length > 0) {
        // Есть записи, но не в статусе COMPLETED - исправляем последнюю
        const latestRecord = allNeurotesterPayments[0]
        console.log(
          `🔄 Исправляю статус записи ID:${latestRecord.id} на COMPLETED`
        )

        const { error: updateError } = await supabase
          .from('payments_v2')
          .update({
            status: PaymentStatus.COMPLETED,
            payment_date: new Date().toISOString(), // Обновляем дату
          })
          .eq('id', latestRecord.id)

        if (updateError) {
          console.error(
            `❌ Ошибка обновления записи ${latestRecord.id}:`,
            updateError.message
          )
          continue
        }

        console.log(`✅ Запись ID:${latestRecord.id} обновлена на COMPLETED`)
      } else {
        // Нет записей вообще - создаем новую
        console.log(`🆕 Создаю новую NEUROTESTER подписку для ${telegramId}`)

        const newPayment = {
          telegram_id: telegramId,
          amount: 0, // Бесплатная подписка для сотрудников
          currency: 'STARS',
          status: PaymentStatus.COMPLETED,
          subscription_type: SubscriptionType.NEUROTESTER,
          payment_date: new Date().toISOString(),
          metadata: {
            admin_granted: true,
            haim_group_staff: true,
            auto_fix: true,
            description:
              'NEUROTESTER подписка для сотрудника HaimGroupMedia_bot',
            granted_by: 'system_fix_script_v2',
            granted_at: new Date().toISOString(),
          },
        }

        const { data: insertResult, error: insertError } = await supabase
          .from('payments_v2')
          .insert([newPayment])
          .select()

        if (insertError) {
          console.error(
            `❌ Ошибка создания подписки для ${telegramId}:`,
            insertError.message
          )
          continue
        }

        console.log(`✅ NEUROTESTER подписка создана для ${telegramId}`)
        console.log(`📊 Запись ID: ${insertResult?.[0]?.id}`)
      }

      // Логируем успех
      logger.info('NEUROTESTER subscription fixed for HaimGroup staff', {
        telegram_id: telegramId,
        subscription_type: SubscriptionType.NEUROTESTER,
        action: 'fixed_by_script_v2',
      })
    }

    console.log('\n🎉 Исправление подписок завершено!')
    console.log(
      '🔍 Проверьте статус пользователей с помощью checkUserStatus.ts'
    )
    process.exit(0)
  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
    logger.error('Failed to fix NEUROTESTER subscriptions v2', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запускаем скрипт
fixNeurotesterSubscriptions()
