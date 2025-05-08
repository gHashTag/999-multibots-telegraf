import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
type BalanceOperationProps = {
  ctx?: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
  bot_name?: string
}

export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
  bot_name,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  console.log('Processing balance operation for:', {
    telegram_id,
    paymentAmount,
    is_ru,
    bot_name,
  })
  console.log('Context available:', !!ctx)
  try {
    // Получаем текущий баланс
    console.log('Fetching current balance for:', telegram_id)
    const currentBalance = await getUserBalance(telegram_id.toString())
    console.log('Current balance fetched:', currentBalance)
    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс в главном меню.'
        : 'Insufficient funds. Top up your balance in the main menu.'
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
    console.log('Updating balance with details:', {
      telegram_id,
      paymentAmount,
      bot_name: ctx?.botInfo?.username || bot_name || 'unknown_bot',
      service_type: ctx?.session?.mode || 'unknown_mode',
    })
    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      'Payment operation',
      {
        bot_name: ctx?.botInfo?.username || bot_name || 'unknown_bot',
        service_type: ctx?.session?.mode || 'unknown_mode',
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
