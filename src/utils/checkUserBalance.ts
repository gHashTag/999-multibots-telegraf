import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase'
import { getBotByName } from '@/core/bot'

interface CheckBalanceParams {
  telegram_id: string
  bot_name: string
  required_amount: number
  is_ru: boolean
  operation_type?: string
}

/**
 * Проверяет баланс пользователя и отправляет сообщение, если средств недостаточно
 * @param params Параметры для проверки баланса
 * @returns Объект с результатом проверки и текущим балансом
 */
export async function checkUserBalance({
  telegram_id,
  bot_name,
  required_amount,
  is_ru,
  operation_type = 'operation',
}: CheckBalanceParams): Promise<{
  hasBalance: boolean
  currentBalance: number
}> {
  logger.info('💰 Проверка баланса пользователя', {
    description: 'Checking user balance',
    telegram_id,
    required_amount,
    operation_type,
  })

  const currentBalance = await getUserBalance(telegram_id, bot_name)

  if (currentBalance < required_amount) {
    logger.error('❌ Недостаточно средств:', {
      description: 'Insufficient funds',
      telegram_id,
      balance: currentBalance,
      required: required_amount,
    })

    const { bot } = getBotByName(bot_name)
    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `❌ Недостаточно средств для ${operation_type}.\nНеобходимо: ${required_amount} ⭐️\nДоступно: ${currentBalance} ⭐️`
        : `❌ Insufficient funds for ${operation_type}.\nRequired: ${required_amount} ⭐️\nAvailable: ${currentBalance} ⭐️`
    )

    return {
      hasBalance: false,
      currentBalance,
    }
  }

  logger.info('✅ Достаточно средств для операции', {
    description: 'Sufficient funds available',
    telegram_id,
    balance: currentBalance,
    required: required_amount,
  })

  return {
    hasBalance: true,
    currentBalance,
  }
}
