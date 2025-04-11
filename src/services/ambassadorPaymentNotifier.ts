import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'

/**
 * Тип для представления платежа в системе
 */
export interface PaymentV2 {
  id: number
  telegram_id?: number | bigint
  stars?: number
  amount?: number
  type: string
  status: string
  description?: string
  payment_method?: string
  operation_id?: string
  inv_id?: string
  bot_name?: string
  created_at?: string
  updated_at?: string
  service_type?: string
}

/**
 * Интерфейс для данных амбассадора с ботом
 */
interface AmbassadorWithBot {
  ambassador_id: string
  telegram_id: string
  username: string | null
  full_name: string | null
  commission_rate: number
  bot_name: string
}

/**
 * Проверяет, является ли бот аватаром (управляемым амбассадором)
 *
 * @param botName Имя бота
 * @returns true если бот принадлежит амбассадору, false в противном случае
 */
export async function isBotAvatar(botName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('avatar_bots')
      .select('id')
      .eq('bot_name', botName)
      .eq('is_active', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      logger.error(
        '❌ Ошибка при проверке бота на принадлежность амбассадору',
        {
          description: 'Error checking if bot belongs to ambassador',
          botName,
          errorCode: error.code,
          errorMessage: error.message,
        }
      )
      return false
    }

    return !!data
  } catch (error: any) {
    logger.error(
      '❌ Исключение при проверке бота на принадлежность амбассадору',
      {
        description: 'Exception checking if bot belongs to ambassador',
        botName,
        error: error.message,
        stack: error.stack,
      }
    )
    return false
  }
}

/**
 * Получает данные амбассадора по имени бота
 *
 * @param botName Имя бота
 * @returns Данные амбассадора или null, если не найден
 */
export async function getAmbassadorByBotName(
  botName: string
): Promise<AmbassadorWithBot | null> {
  try {
    const { data, error } = await supabase
      .from('avatar_bots')
      .select(
        `
        id, 
        ambassador_id,
        bot_name,
        ambassadors:ambassador_id (
          id,
          telegram_id,
          username,
          full_name,
          commission_rate
        )
      `
      )
      .eq('bot_name', botName)
      .eq('is_active', true)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении данных амбассадора по имени бота', {
        description: 'Error getting ambassador data by bot name',
        botName,
        errorCode: error.code,
        errorMessage: error.message,
      })
      return null
    }

    if (!data || !data.ambassadors) {
      logger.warn('⚠️ Амбассадор не найден для бота', {
        description: 'Ambassador not found for bot',
        botName,
      })
      return null
    }

    // Исправляем обращение к данным, так как ambassadors - это один объект, а не массив
    const ambassador = data.ambassadors as any

    return {
      ambassador_id: data.ambassador_id,
      telegram_id: ambassador.telegram_id,
      username: ambassador.username,
      full_name: ambassador.full_name,
      commission_rate: ambassador.commission_rate,
      bot_name: data.bot_name,
    }
  } catch (error: any) {
    logger.error(
      '❌ Исключение при получении данных амбассадора по имени бота',
      {
        description: 'Exception getting ambassador data by bot name',
        botName,
        error: error.message,
        stack: error.stack,
      }
    )
    return null
  }
}

/**
 * Рассчитывает комиссию амбассадора на основе суммы платежа и ставки комиссии
 *
 * @param paymentAmount Сумма платежа
 * @param commissionRate Ставка комиссии (в процентах)
 * @returns Сумма комиссии
 */
export function calculateAmbassadorCommission(
  paymentAmount: number,
  commissionRate: number
): number {
  // Преобразуем процент в десятичное число и умножаем на сумму платежа
  return Number(((paymentAmount * commissionRate) / 100).toFixed(2))
}

/**
 * Отправляет уведомление амбассадору о платеже в его боте
 *
 * @param payment Данные платежа
 * @returns Признак успешности отправки уведомления
 */
export async function notifyAmbassadorAboutPayment(
  payment: PaymentV2
): Promise<boolean> {
  try {
    // Проверяем, является ли бот аватаром амбассадора
    if (!payment.bot_name) {
      logger.warn('⚠️ Имя бота отсутствует в данных платежа', {
        description: 'Bot name is missing in payment data',
        paymentId: payment.id,
      })
      return false
    }

    const isAvatar = await isBotAvatar(payment.bot_name)
    if (!isAvatar) {
      // Бот не принадлежит амбассадору, уведомление не требуется
      return false
    }

    // Получаем данные амбассадора
    const ambassador = await getAmbassadorByBotName(payment.bot_name)
    if (!ambassador) {
      logger.warn('⚠️ Не удалось найти амбассадора для бота', {
        description: 'Failed to find ambassador for bot',
        botName: payment.bot_name,
        paymentId: payment.id,
      })
      return false
    }

    // Рассчитываем комиссию амбассадора (только для доходных операций)
    if (payment.type !== 'money_income' || !payment.amount) {
      logger.info('ℹ️ Платеж не является доходным, уведомление без комиссии', {
        description: 'Payment is not income, notifying without commission',
        paymentId: payment.id,
        paymentType: payment.type,
      })

      // Отправляем событие уведомления без комиссии
      await sendAmbassadorPaymentNotification(ambassador, payment, 0)
      return true
    }

    // Рассчитываем комиссию для доходного платежа
    const commission = calculateAmbassadorCommission(
      payment.amount,
      ambassador.commission_rate
    )

    // Отправляем уведомление амбассадору
    await sendAmbassadorPaymentNotification(ambassador, payment, commission)

    // Запускаем процесс начисления комиссии (если комиссия > 0)
    if (commission > 0) {
      await processAmbassadorCommission(ambassador, payment, commission)
    }

    return true
  } catch (error: any) {
    logger.error('❌ Ошибка при отправке уведомления амбассадору о платеже', {
      description: 'Error notifying ambassador about payment',
      botName: payment.bot_name,
      paymentId: payment.id,
      error: error.message,
      stack: error.stack,
    })
    return false
  }
}

/**
 * Отправляет уведомление амбассадору о платеже через Inngest событие
 *
 * @param ambassador Данные амбассадора
 * @param payment Данные платежа
 * @param commission Сумма комиссии
 */
async function sendAmbassadorPaymentNotification(
  ambassador: AmbassadorWithBot,
  payment: PaymentV2,
  commission: number
): Promise<void> {
  try {
    await inngest.send({
      name: 'ambassador/payment.notification',
      data: {
        ambassador_id: ambassador.ambassador_id,
        telegram_id: ambassador.telegram_id,
        payment_id: payment.id,
        payment_amount: payment.amount || 0,
        payment_stars: payment.stars || 0,
        payment_type: payment.type,
        payment_status: payment.status,
        bot_name: ambassador.bot_name,
        commission_amount: commission,
        commission_rate: ambassador.commission_rate,
        user_telegram_id: payment.telegram_id?.toString() || '',
        timestamp: new Date().toISOString(),
      },
    })

    logger.info('✅ Уведомление об оплате отправлено амбассадору', {
      description: 'Payment notification sent to ambassador',
      ambassadorId: ambassador.ambassador_id,
      ambassadorTelegramId: ambassador.telegram_id,
      paymentId: payment.id,
      commission,
    })
  } catch (error: any) {
    logger.error('❌ Ошибка при отправке уведомления амбассадору', {
      description: 'Error sending notification to ambassador',
      ambassadorId: ambassador.ambassador_id,
      paymentId: payment.id,
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}

/**
 * Обрабатывает начисление комиссии амбассадору
 *
 * @param ambassador Данные амбассадора
 * @param payment Данные платежа
 * @param commission Сумма комиссии
 */
async function processAmbassadorCommission(
  ambassador: AmbassadorWithBot,
  payment: PaymentV2,
  commission: number
): Promise<void> {
  try {
    // Отправляем событие для начисления комиссии
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: ambassador.telegram_id,
        amount: commission,
        stars: commission,
        type: 'money_income',
        description: `Комиссия за платеж #${payment.id} в боте ${ambassador.bot_name}`,
        bot_name: 'ambassador_system',
        service_type: 'AmbassadorCommission',
        ambassador_id: ambassador.ambassador_id,
        related_payment_id: payment.id,
      },
    })

    logger.info('✅ Запрос на начисление комиссии амбассадору отправлен', {
      description: 'Ambassador commission payment requested',
      ambassadorId: ambassador.ambassador_id,
      paymentId: payment.id,
      commission,
    })
  } catch (error: any) {
    logger.error('❌ Ошибка при запросе начисления комиссии амбассадору', {
      description: 'Error requesting ambassador commission payment',
      ambassadorId: ambassador.ambassador_id,
      paymentId: payment.id,
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}
