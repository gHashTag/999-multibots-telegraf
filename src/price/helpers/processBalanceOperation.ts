import { MyContext, TransactionType } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { supabase } from '@/core/supabase'
import { BalanceOperationResult } from '@/interfaces'

export async function processBalanceOperation({
  ctx,
  amount,
  type,
  description,
  metadata,
}: {
  ctx: MyContext
  amount: number
  type: TransactionType
  description: string
  metadata?: Record<string, any>
}): Promise<BalanceOperationResult> {
  if (!ctx.from) {
    throw new Error('User not found')
  }

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', ctx.from.id)
      .single()

    if (userError || !userData) {
      throw new Error('Failed to retrieve user data')
    }

    const currentBalance = userData.balance || 0

    if (currentBalance < amount) {
      const message = isRussian(ctx)
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      await ctx.reply(message)

      return {
        success: false,
        error: 'Insufficient funds',
        newBalance: currentBalance,
        modePrice: amount,
      }
    }

    const newBalance = currentBalance - amount

    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: ctx.from.id.toString(),
        amount,
        type,
        description,
        metadata,
        bot_name: ctx.botInfo?.username,
      },
    })

    return {
      success: true,
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
      newBalance: 0,
      modePrice: amount,
    }
  }
}
