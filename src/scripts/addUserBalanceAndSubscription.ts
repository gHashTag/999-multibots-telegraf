/**
 * Скрипт для добавления баланса и подписки конкретному пользователю
 * Использование: npx tsx src/scripts/addUserBalanceAndSubscription.ts <telegram_id> <stars_amount> <subscription_type>
 * Пример: npx tsx src/scripts/addUserBalanceAndSubscription.ts 164609458 100000 NEUROTESTER
 */

import { directPaymentProcessor } from '../core/supabase/directPayment'
import { PaymentType } from '../interfaces/payments.interface'
import { SubscriptionType } from '../interfaces/subscription.interface'
import { ModeEnum } from '../interfaces/modes'
import { logger } from '../utils/logger'

async function addUserBalanceAndSubscription() {
  const args = process.argv.slice(2)

  if (args.length < 3) {
    console.error('❌ Недостаточно аргументов!')
    console.log(
      'Использование: npx tsx src/scripts/addUserBalanceAndSubscription.ts <telegram_id> <stars_amount> <subscription_type>'
    )
    console.log('Доступные типы подписок: NEUROPHOTO, NEUROVIDEO, NEUROTESTER')
    console.log(
      'Пример: npx tsx src/scripts/addUserBalanceAndSubscription.ts 164609458 100000 NEUROTESTER'
    )
    process.exit(1)
  }

  const telegramId = args[0]
  const starsAmount = parseInt(args[1], 10)
  const subscriptionTypeStr = args[2].toUpperCase()

  // Проверяем валидность суммы
  if (isNaN(starsAmount) || starsAmount <= 0) {
    console.error(`❌ Неверная сумма звезд: ${args[1]}`)
    console.log('Сумма должна быть положительным числом')
    process.exit(1)
  }

  // Проверяем валидность типа подписки
  if (
    !Object.values(SubscriptionType).includes(
      subscriptionTypeStr as SubscriptionType
    )
  ) {
    console.error(`❌ Неверный тип подписки: ${subscriptionTypeStr}`)
    console.log('Доступные типы:', Object.values(SubscriptionType).join(', '))
    process.exit(1)
  }

  const subscriptionType = subscriptionTypeStr as SubscriptionType

  console.log(`🎯 Добавление баланса и подписки для пользователя:`)
  console.log(`👤 Telegram ID: ${telegramId}`)
  console.log(`⭐ Звезды: ${starsAmount}`)
  console.log(`💎 Подписка: ${subscriptionType}`)

  try {
    // Добавляем баланс И активируем подписку в одной транзакции
    const result = await directPaymentProcessor({
      telegram_id: telegramId,
      amount: starsAmount,
      type: PaymentType.MONEY_INCOME,
      description: `🎁 Административное начисление: ${starsAmount} звезд + подписка ${subscriptionType}`,
      bot_name: 'admin_system',
      service_type: 'admin_grant',
      inv_id: `admin-grant-${Date.now()}-${telegramId}`,
      metadata: {
        admin_operation: true,
        category: 'BONUS',
        payment_method: 'Admin',
        reason: 'Административное начисление баланса и подписки',
        operation_timestamp: new Date().toISOString(),
      },
      subscription_type: subscriptionType, // Активируем подписку
    })

    if (result.success) {
      console.log(`✅ Операция успешно завершена!`)
      console.log(`💳 ID записи в БД: ${result.payment_id}`)
      console.log(`🔄 ID операции: ${result.operation_id}`)

      if (result.balanceChange) {
        console.log(`💰 Изменение баланса:`)
        console.log(`   До: ${result.balanceChange.before} ⭐`)
        console.log(`   После: ${result.balanceChange.after} ⭐`)
        console.log(`   Добавлено: ${result.balanceChange.difference} ⭐`)
      }

      console.log(`💎 Подписка активирована: ${subscriptionType}`)

      logger.info(
        '✅ Административное начисление баланса и подписки выполнено',
        {
          telegram_id: telegramId,
          stars_amount: starsAmount,
          subscription_type: subscriptionType,
          operation_id: result.operation_id,
          payment_id: result.payment_id,
        }
      )
    } else {
      console.error(`❌ Ошибка при выполнении операции: ${result.error}`)
      logger.error('❌ Ошибка административного начисления', {
        telegram_id: telegramId,
        stars_amount: starsAmount,
        subscription_type: subscriptionType,
        error: result.error,
      })
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
    logger.error('❌ Критическая ошибка в скрипте начисления', {
      telegram_id: telegramId,
      stars_amount: starsAmount,
      subscription_type: subscriptionType,
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

addUserBalanceAndSubscription()
