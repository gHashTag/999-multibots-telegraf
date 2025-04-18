import { MyContext } from '@/interfaces'
import {
  getReferalsCountAndUserData,
  getUserBalance,
  updateUserBalance,
} from '@/core/supabase'
import { mainMenu } from '@/menu'

export async function refundUser(ctx: MyContext, paymentAmount: number) {
  if (!ctx.from) {
    throw new Error('User not found')
  }
  const balance = await getUserBalance(ctx.from.id)
  console.log('balance', balance)
  // Возвращаем средства пользователю
  const newBalance = balance + paymentAmount
  console.log('newBalance', newBalance)
  await updateUserBalance(
    ctx.from.id.toString(),
    paymentAmount,
    'money_income',
    'Refund operation'
  )

  // Отправляем сообщение пользователю
  const isRu = ctx.from.language_code === 'ru'
  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription, level } = await getReferalsCountAndUserData(
    telegram_id
  )

  await ctx.reply(
    isRu
      ? `Возвращено ${paymentAmount.toFixed(
          2
        )} ⭐️ на ваш счет.\nВаш баланс: ${newBalance.toFixed(2)} ⭐️`
      : `${paymentAmount.toFixed(
          2
        )} ⭐️ have been refunded to your account.\nYour balance: ${newBalance.toFixed(
          2
        )} ⭐️`,
    {
      reply_markup: {
        keyboard: (
          await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        ).reply_markup.keyboard,
      },
    }
  )
}
