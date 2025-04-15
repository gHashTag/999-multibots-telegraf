import { MyContext, TransactionType } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { getUserBalance } from '@/core/supabase'

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
      ctx.botInfo?.username
    )

    if (currentBalance === null || currentBalance < amount) {
      const message = isRussian(ctx)
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      await ctx.reply(message)
    } else {
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: ctx.from.id.toString(),
          amount,
          type,
          description: description || 'Списание средств',
          metadata,
          bot_name: ctx.botInfo?.username,
        },
      })
    }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа (processPayment):', {
      description: 'Error in processPayment',
      error: error instanceof Error ? error.message : 'Unknown error',
      amount,
      userId: ctx.from?.id,
    })
  }
}
