import { type MyContext } from '@/interfaces'
import { getUserBalance, getReferalsCountAndUserData } from '@/core/supabase'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { mainMenu } from '@/menu'
import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'

export async function refundUser(ctx: MyContext, paymentAmount: number) {
  if (!ctx.from) {
    console.error('refundUser: ctx.from is undefined')
    return
  }
  const telegramIdStr = ctx.from.id.toString()
  const amountToRefund = Number(paymentAmount)

  const initialBalance = await getUserBalance(telegramIdStr)

  if (initialBalance === null) {
    console.error(
      `refundUser: Failed to get initial balance for ${telegramIdStr}`
    )
    return
  }

  // Добавляем bot_name
  const bot_name = ctx.botInfo?.username || 'unknown_bot'

  const transactionResult = await updateUserBalance(
    telegramIdStr,
    amountToRefund,
    PaymentType.MONEY_INCOME,
    'Refund for cancelled generation',
    { bot_name: bot_name }
  )

  // Проверяем булевый результат напрямую
  if (!transactionResult) {
    console.error(
      `refundUser: Failed to update balance for ${telegramIdStr}. Update function returned false.`
    )
    await ctx.reply(
      ctx.from.language_code === 'ru'
        ? 'Не удалось вернуть средства. Обратитесь в поддержку.'
        : 'Failed to refund. Please contact support.'
    )
    return
  }

  const newBalance = await getUserBalance(telegramIdStr)

  if (newBalance === null) {
    console.error(
      `refundUser: Failed to get new balance for ${telegramIdStr} after refund`
    )
  }

  const { count, subscriptionType, level } =
    await getReferalsCountAndUserData(telegramIdStr)

  const isRu = ctx.from.language_code === 'ru'

  const displayBalance =
    newBalance !== null ? newBalance : initialBalance + amountToRefund

  await ctx.reply(
    `${
      isRu
        ? 'Возвращено звезд за отмененную генерацию'
        : 'Stars refunded for cancelled generation'
    }: ${amountToRefund.toFixed(2)} ⭐️\n${
      isRu ? 'Текущий баланс' : 'Current balance'
    }: ${displayBalance.toFixed(2)} ⭐️`,
    {
      reply_markup: (
        await mainMenu({
          isRu,
          subscription: subscriptionType,
          ctx,
        })
      ).reply_markup,
    }
  )
}
