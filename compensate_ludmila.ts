#!/usr/bin/env bun

import { updateUserBalance } from './src/core/supabase/updateUserBalance'
import { PaymentType } from './src/interfaces/payments.interface'
import { ModeEnum } from './src/interfaces/modes'

async function compensateUser() {
  console.log('🎯 Начисление компенсации пользователю за баг в FLUX Kontext...')

  const telegram_id = '7007992081'
  const amount = 100
  const type = PaymentType.MONEY_INCOME
  const description =
    '🎁 Компенсация за технические неполадки в FLUX Kontext. Спасибо за терпение!'

  const metadata = {
    bot_name: 'neuroblogger',
    service_type: ModeEnum.TopUpBalance,
    payment_method: 'System Compensation',
    reason: 'FLUX Kontext bug fix - infinite loop issue',
    user_id: telegram_id,
    compensated_at: new Date().toISOString(),
    category: 'BONUS' as const,
  }

  try {
    // Исправленный вызов функции с правильными параметрами
    const result = await updateUserBalance(
      telegram_id,
      amount,
      type,
      description,
      metadata
    )

    if (result) {
      console.log('✅ Компенсация успешно начислена!')
      console.log(`💰 Начислено: ${amount} звезд`)
      console.log(`👤 Пользователь: ${telegram_id} (Людмила)`)
      console.log(`💬 Описание: ${description}`)
    } else {
      console.error('❌ Ошибка при начислении: result is false')
    }
  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
  }
}

compensateUser().then(() => process.exit(0))
