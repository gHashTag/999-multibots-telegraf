import { TelegramId } from '@/interfaces/telegram.interface'
import { TransactionType } from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { updateUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserBalance, invalidateBalanceCache } from '@/core/supabase/getUserBalance'

interface BalanceOperationResult {
  success: boolean
  error?: string
  newBalance?: number
  modePrice?: number
}

export async function processBalanceOperation({
    telegram_id,
    amount,
    is_ru,
    bot,
    bot_name,
    description,
    type,
  }: {
    telegram_id: TelegramId
    amount: number
    is_ru: boolean
    bot: Telegraf<MyContext>
    bot_name: string
    description: string
    type: TransactionType
  }): Promise<BalanceOperationResult> {
    try {
      const currentBalance = await getUserBalance(telegram_id, bot_name)
      if (currentBalance < amount) {
        const message = is_ru
          ? `❌ Недостаточно звёзд. Необходимо: ${amount} ⭐️`
          : `❌ Insufficient stars. Required: ${amount} ⭐️`
  
        bot.telegram.sendMessage(telegram_id, message)
        return {
          success: false,
          error: 'Insufficient funds',
          newBalance: currentBalance,
          modePrice: amount,
        }
      }
  
      const newBalance = currentBalance - amount
      await updateUserBalance({
        telegram_id,
        amount: amount,
        type: TransactionType.MONEY_EXPENSE,
        description: description,
        bot_name,
      })
      invalidateBalanceCache(telegram_id)
  
      logger.info({
        message: '💰 Операция с балансом выполнена',
        description: 'Balance operation completed',
        telegram_id,
        type,
        amount,
        oldBalance: currentBalance,
        newBalance,
      })
  
      return {
        success: true,
        newBalance,
        modePrice: amount,
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при обработке платежа',
        description: 'Payment processing error',
        error: error instanceof Error ? error.message : String(error),
        telegram_id,
        type,
      })
  
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        newBalance: 0,
        modePrice: amount,
      }
    }
  }
  