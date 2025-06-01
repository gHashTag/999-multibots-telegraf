/**
 * Скрипт для исправления типа подписки пользователя 352374518
 * Меняем subscription_type с 'stars' на 'NEUROTESTER'
 */

import { updateUserSubscriptionType } from '../core/supabase'
import { SubscriptionType } from '../interfaces/subscription.interface'
import { logger } from '../utils/logger'

async function fixUser352374518() {
  const userId = '352374518'

  logger.info('🔧 Запуск исправления для пользователя:', { userId })

  try {
    const result = await updateUserSubscriptionType(
      userId,
      SubscriptionType.NEUROTESTER
    )

    if (result) {
      logger.info('✅ Пользователь успешно исправлен:', {
        userId,
        newSubscriptionType: SubscriptionType.NEUROTESTER,
      })
      console.log(
        `✅ Успешно! Пользователь ${userId} теперь имеет подписку NEUROTESTER`
      )
    } else {
      logger.error('❌ Ошибка при исправлении пользователя:', { userId })
      console.log(`❌ Ошибка при исправлении пользователя ${userId}`)
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка:', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    console.log(`❌ Критическая ошибка: ${error}`)
  }
}

// Запускаем исправление
fixUser352374518()
  .then(() => {
    console.log('🏁 Скрипт завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })
