import { MyContext } from '@/interfaces/telegram-bot.interface'
import { getUserBalance } from '@/core/supabase'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers'
import { TransactionType } from '@/interfaces/payments.interface'
export async function refundUser(ctx: MyContext, amount: number) {
  try {
    if (!ctx.from?.id) {
      throw new Error('User ID not found')
    }

    const balance = await getUserBalance(
      ctx.from?.id?.toString() || '',
      ctx.botInfo.username
    )

    if (balance === null) {
      throw new Error('Balance not found')
    }

    const newBalance = balance + amount

    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: ctx.from?.id.toString(),
        amount,
        type: TransactionType.MONEY_INCOME,
        description: 'Refund for cancelled operation',
        bot_name: ctx.botInfo.username,
      },
    })

    logger.info({
      message: '💰 Возврат средств выполнен',
      description: 'Refund completed',
      telegram_id: ctx.from?.id,
      amount,
      oldBalance: balance,
      newBalance,
    })

    const message = isRussian(ctx)
      ? `Возвращено ${amount.toFixed(2)} руб.`
      : `${amount.toFixed(2)} RUB has been refunded`

    await ctx.reply(message)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при возврате средств',
      description: 'Refund error',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
      amount,
    })

    const message = isRussian(ctx)
      ? '❌ Произошла ошибка при возврате средств'
      : '❌ An error occurred while processing the refund'

    await ctx.reply(message)
  }
}
