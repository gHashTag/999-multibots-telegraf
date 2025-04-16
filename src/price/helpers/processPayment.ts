import { MyContext } from '@/interfaces'
import { TransactionType } from '@/interfaces/payments.interface'
import { getUserBalance } from '@/core/supabase'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers'

export const processPayment = async ({
    ctx,
    amount,
    type = TransactionType.MONEY_EXPENSE,
    description,
    metadata = {},
  }: {
    ctx: MyContext
    amount: number
    type?: TransactionType.MONEY_INCOME | TransactionType.MONEY_EXPENSE
    description?: string
    metadata?: Record<string, any>
  }) => {
    try {
      if (!ctx.from?.id) {
        throw new Error('User ID not found')
      }
  
      const currentBalance = await getUserBalance(
        ctx.from.id.toString(),
        ctx.botInfo.username
      )
  
      if (!currentBalance || currentBalance < amount) {
        const message = isRussian(ctx)
          ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
          : `❌ Insufficient funds. Required: ${amount} RUB`
  
        await ctx.reply(message)
  
        return {
          success: false,
          error: 'Insufficient funds',
          currentBalance: currentBalance || 0,
          modePrice: amount,
        }
      }
  
      const newBalance = currentBalance - amount
  
      // Отправляем событие для обработки платежа
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: ctx.from.id.toString(),
          amount,
          type,
          description,
          metadata,
          bot_name: ctx.botInfo.username,
        },
      })
  
      return {
        success: true,
        currentBalance,
        newBalance,
        modePrice: amount,
      }
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : 'Unknown error',
        modePrice: amount,
      })
  
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        modePrice: amount,
      }
    }
  }
  