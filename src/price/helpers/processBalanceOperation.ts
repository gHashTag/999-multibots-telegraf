import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import type { BalanceOperationResult, MyContext } from '@/interfaces'
import type { PaymentType } from '@/interfaces/payments.interface'
type BalanceOperationProps = {
  ctx: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
}

export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id.toString())
    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
        : 'Insufficient funds. Top up your balance by calling the /buy command.'
      await ctx.telegram.sendMessage(telegram_id.toString(), message)
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = Number(currentBalance) - Number(paymentAmount)

    // Обновляем баланс в БД, передавая все необходимые аргументы
    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      'Payment operation',
      {
        bot_name: ctx.botInfo?.username,
        service_type: ctx.session.mode,
        modePrice: paymentAmount,
        currentBalance: currentBalance,
      }
    )

    if (!updateSuccess) {
      // Обработка ошибки обновления баланса
      const message = is_ru
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    return {
      newBalance,
      success: true,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    return {
      newBalance: await getUserBalance(telegram_id.toString()),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance: await getUserBalance(telegram_id.toString()),
    }
  }
}
