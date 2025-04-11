import { getUserBalance } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'

export interface BalanceCheckOptions {
  notifyUser?: boolean
  botInstance?: any
  isRu?: boolean
}

export const BalanceHelper = {
  checkBalance: async (
    telegram_id: TelegramId,
    requiredAmount: number,
    options?: BalanceCheckOptions
  ): Promise<{ success: boolean; currentBalance: number }> => {
    const currentBalance = await getUserBalance(
      telegram_id.toString(),
      options?.botInstance?.name || ''
    )
    if (currentBalance === null) throw new Error('User not found')

    console.log(`🔍 Проверка баланса для ${telegram_id}:`, {
      current: currentBalance,
      required: requiredAmount,
    })

    if (currentBalance < requiredAmount) {
      if (options?.notifyUser && options.botInstance) {
        const message = options.isRu
          ? `❌ Недостаточно звёзд. Требуется: ${requiredAmount}`
          : `❌ Not enough stars. Required: ${requiredAmount}`
        await options.botInstance.telegram.sendMessage(telegram_id, message)
      }
      return { success: false, currentBalance }
    }

    return { success: currentBalance >= requiredAmount, currentBalance }
  },
}
