/**
 * Универсальный скрипт для исправления типа подписки пользователя
 * Использование: npx tsx src/scripts/fixSpecificUser.ts <telegram_id> <new_subscription_type>
 * Пример: npx tsx src/scripts/fixSpecificUser.ts 352374518 NEUROTESTER
 */

import { updateUserSubscriptionType } from '../core/supabase'
import { SubscriptionType } from '../interfaces/subscription.interface'
import { logger } from '../utils/logger'

async function fixSpecificUser() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('❌ Недостаточно аргументов!')
    console.log(
      'Использование: npx tsx src/scripts/fixSpecificUser.ts <telegram_id> <subscription_type>'
    )
    console.log('Доступные типы: NEUROPHOTO, NEUROVIDEO, NEUROTESTER')
    console.log(
      'Пример: npx tsx src/scripts/fixSpecificUser.ts 352374518 NEUROTESTER'
    )
    process.exit(1)
  }

  const userId = args[0]
  const subscriptionTypeStr = args[1].toUpperCase()

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

  const newSubscriptionType = subscriptionTypeStr as SubscriptionType

  console.log(`🔧 Исправление пользователя ${userId} -> ${newSubscriptionType}`)
  logger.info('🔧 Запуск исправления для пользователя:', {
    userId,
    newSubscriptionType,
  })

  try {
    const result = await updateUserSubscriptionType(userId, newSubscriptionType)

    if (result) {
      logger.info('✅ Пользователь успешно исправлен:', {
        userId,
        newSubscriptionType,
      })
      console.log(
        `✅ Успешно! Пользователь ${userId} теперь имеет подписку ${newSubscriptionType}`
      )
    } else {
      logger.error('❌ Ошибка при исправлении пользователя:', { userId })
      console.log(`❌ Ошибка при исправлении пользователя ${userId}`)
      process.exit(1)
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка:', {
      userId,
      newSubscriptionType,
      error: error instanceof Error ? error.message : String(error),
    })
    console.log(`❌ Критическая ошибка: ${error}`)
    process.exit(1)
  }
}

// Запускаем исправление
fixSpecificUser()
  .then(() => {
    console.log('🏁 Скрипт завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })
