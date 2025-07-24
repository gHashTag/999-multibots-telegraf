/**
 * Скрипт для проверки баланса и подписки пользователя
 * Использование: npx tsx src/scripts/checkUserStatus.ts <telegram_id>
 * Пример: npx tsx src/scripts/checkUserStatus.ts 164609458
 */

import { getUserBalance } from '../core/supabase/getUserBalance'
import { getUserDetailsSubscription } from '../core/supabase/getUserDetailsSubscription'
import { logger } from '../utils/logger'

async function checkUserStatus() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.error('❌ Недостаточно аргументов!')
    console.log(
      'Использование: npx tsx src/scripts/checkUserStatus.ts <telegram_id>'
    )
    console.log('Пример: npx tsx src/scripts/checkUserStatus.ts 164609458')
    process.exit(1)
  }

  const telegramId = args[0]

  console.log(`🔍 Проверка статуса пользователя: ${telegramId}`)

  try {
    // Получаем баланс пользователя
    const balance = await getUserBalance(telegramId)

    // Получаем детали подписки
    const userDetails = await getUserDetailsSubscription(telegramId)

    console.log(`\n📊 Результат проверки:`)
    console.log(`👤 Telegram ID: ${telegramId}`)
    console.log(`💰 Баланс: ${balance} ⭐`)
    console.log(`💎 Тип подписки: ${userDetails.subscriptionType || 'НЕТ'}`)
    console.log(
      `✅ Подписка активна: ${userDetails.isSubscriptionActive ? 'ДА' : 'НЕТ'}`
    )
    console.log(
      `📅 Дата начала подписки: ${userDetails.subscriptionStartDate || 'НЕТ'}`
    )
    console.log(
      `🔄 Пользователь существует: ${userDetails.isExist ? 'ДА' : 'НЕТ'}`
    )
    console.log(`🆔 ID в БД: ${userDetails.id}`)
    console.log(`📅 Дата создания: ${userDetails.created_at}`)

    logger.info('✅ Проверка статуса пользователя завершена', {
      telegram_id: telegramId,
      balance,
      subscription_type: userDetails.subscriptionType,
      is_subscription_active: userDetails.isSubscriptionActive,
      subscription_start_date: userDetails.subscriptionStartDate,
      user_exists: userDetails.isExist,
      user_id: userDetails.id,
      created_at: userDetails.created_at,
    })
  } catch (error) {
    console.error('❌ Ошибка при проверке статуса:', error)
    logger.error('❌ Ошибка при проверке статуса пользователя', {
      telegram_id: telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

checkUserStatus()
