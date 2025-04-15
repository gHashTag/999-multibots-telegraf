import { Telegraf } from 'telegraf'
import { MyContext, Subscription } from '@/interfaces'
import { logger } from '@/utils/logger'
import { createBotByName, pulseBot } from '@/core/bot'
import { supabase } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { TransactionType } from '@/interfaces/payments.interface'

// TODO: Implement notification logic here

console.log('paymentNotifier.ts loaded')

// --- Вспомогательные типы ---

interface BasePaymentDetails {
  telegram_id: number | string
  bot_name: string
  language_code?: string
  username?: string | null
}

interface SuccessfulPaymentDetails extends BasePaymentDetails {
  amount: number // Сумма операции (может быть звезды или рубли)
  stars?: number // Количество звезд (если отличается от amount)
  currency?: string // '⭐️' или 'RUB'
  description: string
  operationId?: string
  currentBalance?: number
  newBalance?: number
  subscription?: string // Название купленной подписки
  type: TransactionType // Добавлен тип транзакции
}

interface FailedPaymentDetails extends BasePaymentDetails {
  error: Error | string
  operationId?: string
  attemptedAmount?: number
  attemptedAction?: string
}

// --- Уведомления пользователю ---

/**
 * Отправляет пользователю уведомление об успешной операции с балансом/покупке.
 */
export async function notifyUserAboutSuccess(
  details: SuccessfulPaymentDetails
): Promise<void> {
  logger.info('notifyUserAboutSuccess called (implementation pending)')
}

/**
 * Отправляет пользователю уведомление об ошибке операции.
 */
export async function notifyUserAboutFailure(
  details: FailedPaymentDetails
): Promise<void> {
  logger.warn('notifyUserAboutFailure called (implementation pending)')
}

// --- Уведомления администраторам/группам ---

/**
 * Получает список владельцев бота из таблицы users (заменяет getBotOwners)
 */
async function getBotOwnerIds(botName: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('users') // Убрал экранирование
      .select('telegram_id')
      .eq('bot_name', botName)
      .eq('is_bot_owner', true)

    if (error) {
      logger.error('❌ Ошибка при получении владельцев бота из users:', {
        error,
        botName,
      })
      return []
    }
    return data
      .map(owner => owner.telegram_id?.toString())
      .filter((id): id is string => !!id) // Улучшенная проверка типа
  } catch (error) {
    logger.error('❌ Непредвиденная ошибка при получении владельцев бота:', {
      error,
      botName,
    })
    return []
  }
}

/**
 * Отправляет уведомление о платеже администраторам и в группы.
 */
export async function notifyAdminsAboutPayment(
  details: SuccessfulPaymentDetails
): Promise<void> {
  logger.info('notifyAdminsAboutPayment called (implementation pending)')
}
