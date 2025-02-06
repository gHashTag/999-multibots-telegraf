import bot from '@/core/bot'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { BalanceOperationResult } from '@/interfaces/payments.interface'

type BalanceOperationProps = {
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
}

export const processBalanceOperation = async ({
  telegram_id,
  paymentAmount,
  is_ru,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id)
    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
        : 'Insufficient funds. Top up your balance by calling the /buy command.'
      await bot.telegram.sendMessage(telegram_id, message)
      return {
        newBalance: currentBalance,
        success: false,
        error: message,
        modePrice: paymentAmount,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = Number(currentBalance) - Number(paymentAmount)

    // Обновляем баланс в БД
    await updateUserBalance(telegram_id, newBalance)

    return {
      newBalance,
      success: true,
      modePrice: paymentAmount,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    throw error
  }
}
