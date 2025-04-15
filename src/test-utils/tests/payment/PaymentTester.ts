import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'
import { PaymentStatus, TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'

interface BalanceCheckResult {
  success: boolean
  currentBalance?: number
}

export class PaymentTester {
  constructor() {}

  async checkBalance(userId: string, amount: number): Promise<boolean> {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single()

      if (error) {
        logger.error('❌ Error checking balance:', { error, userId })
        return false
      }

      if (!user) {
        logger.warn('❓ User not found when checking balance:', { userId })
        return false
      }

      const currentBalance = user.balance || 0
      return currentBalance >= amount
    } catch (error) {
      logger.error('❌ Critical error while checking balance:', {
        error,
        userId,
      })
      return false
    }
  }

  /**
   * Проверяет создание платежа в базе данных
   */
  async checkPaymentCreated(
    telegramId: TelegramId,
    amount: number,
    status: PaymentStatus = PaymentStatus.PENDING
  ): Promise<boolean> {
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('amount', amount)
      .eq('status', status)
      .single()

    return !!payment
  }

  /**
   * Проверяет создание транзакции в базе данных
   */
  async checkTransactionCreated(
    telegramId: TelegramId,
    amount: number,
    type: TransactionType = TransactionType.MONEY_INCOME
  ): Promise<boolean> {
    const { data: transaction } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('amount', amount)
      .eq('type', type)
      .single()

    return !!transaction
  }

  /**
   * Проверяет обновление баланса пользователя
   */
  async checkBalanceUpdated(
    telegramId: TelegramId,
    expectedBalance: number
  ): Promise<boolean> {
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', telegramId)
      .single()

    return user?.balance === expectedBalance
  }

  /**
   * Проверяет отправку уведомления о платеже
   */
  async checkPaymentNotification(
    telegramId: string,
    amount: number,
    stars: number
  ): Promise<boolean> {
    const { data: messages } = await supabase
      .from('messages')
      .select('text')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!messages?.text) return false

    return (
      messages.text.includes(`${amount}`) && messages.text.includes(`${stars}`)
    )
  }

  /**
   * Проверяет статус платежа
   */
  async checkPaymentStatus(
    invId: string,
    expectedStatus: PaymentStatus
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('inv_id', invId)
      .single()

    if (error) {
      console.error('Error checking payment status:', error)
      return false
    }

    return data?.status === expectedStatus
  }

  /**
   * Проверяет историю платежей пользователя
   */
  async checkPaymentHistory(
    telegramId: TelegramId,
    expectedCount: number
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId.toString())

    if (error) {
      console.error('Error checking payment history:', error)
      return false
    }

    return data?.length === expectedCount
  }
}
