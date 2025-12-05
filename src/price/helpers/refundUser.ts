import { MyContext } from '@/interfaces'
import { getUserBalance, getReferalsCountAndUserData } from '@/core/supabase'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { createMainMenuKeyboard } from '@/navigation'
import { PaymentType } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export async function refundUser(
  ctx: MyContext,
  paymentAmount: number,
  silent: boolean = false
) {
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

    // ✅ Only send error message if NOT in silent mode
    if (!silent) {
      await ctx.reply(
        isRussianFromState(ctx)
          ? 'Не удалось вернуть средства. Обратитесь в поддержку.'
          : 'Failed to refund. Please contact support.'
      )
    }
    return
  }

  const newBalance = await getUserBalance(telegramIdStr)

  if (newBalance === null) {
    console.error(
      `refundUser: Failed to get new balance for ${telegramIdStr} after refund`
    )
  }

  const { count, subscriptionType, level } = await getReferalsCountAndUserData(
    telegramIdStr
  )

  const isRu = isRussianFromState(ctx)

  const displayBalance =
    newBalance !== null ? newBalance : initialBalance + amountToRefund

  // ✅ Only send success message if NOT in silent mode
  if (!silent) {
    await ctx.reply(
      `${
        isRu
          ? 'Возвращено звезд за отмененную генерацию'
          : 'Stars refunded for cancelled generation'
      }: ${amountToRefund.toFixed(2)} ⭐️\n${
        isRu ? 'Текущий баланс' : 'Current balance'
      }: ${displayBalance.toFixed(2)} ⭐️`,
      createMainMenuKeyboard(ctx)
    )
  }
}
