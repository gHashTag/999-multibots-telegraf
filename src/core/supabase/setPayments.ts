import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { generateInvId } from '@/utils/generateInvId'
import { inngest } from '@/core/inngest/clients'
import { 
  Payment, 
  CreatePaymentDTO, 
  PaymentStatus, 
  PaymentMethod,
  TransactionType, 
  ContentService,
  ModeEnum
} from '@/interfaces/payments.interface'

/**
 * Создает новый платеж в системе
 */
export async function createPayment(params: CreatePaymentDTO): Promise<Payment> {
  const normalizedTelegramId = normalizeTelegramId(params.telegram_id)
  const invId = params.inv_id || generateInvId(normalizedTelegramId, params.amount)

  logger.info({
    message: '💰 Создание нового платежа',
    description: 'Creating new payment',
    params: {
      ...params,
      telegram_id: normalizedTelegramId,
      inv_id: invId
    }
  })

  const paymentData: Omit<Payment, 'payment_id' | 'payment_date'> = {
    telegram_id: normalizedTelegramId,
    amount: params.amount,
    stars: params.stars,
    currency: params.currency,
    description: params.description,
    metadata: params.metadata || {},
    bot_name: params.bot_name,
    status: params.status,
    email: params.email,
    subscription: params.subscription || 'none',
    invoice_url: params.invoice_url,
    type: params.type || 'system',
    service_type: params.service_type || ModeEnum.NeuroPhoto,
    inv_id: invId,
    operation_id: invId,
    language: params.language,
    payment_method: params.payment_method
  }

  try {
    const { data, error } = await supabase
      .from('payments_v2')
      .insert(paymentData)
      .select()
      .single()

    if (error) {
      logger.error({
        message: '❌ Ошибка при создании платежа',
        description: 'Error creating payment',
        error,
        paymentData
      })
      throw error
    }

    logger.info({
      message: '✅ Платеж успешно создан',
      description: 'Payment created successfully',
      payment: data
    })

    return data as Payment
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при создании платежа',
      description: 'Error in createPayment function',
      error,
      paymentData
    })
    throw error
  }
}

/**
 * Обрабатывает платеж от платежной системы
 */
export async function setPayments(payment: {
  telegram_id: string | number
  OutSum?: string
  inv_id?: string
  InvId?: string
  currency: string
  stars: number
  email?: string
  status: PaymentStatus
  payment_method: PaymentMethod
  subscription?: string
  bot_name: string
  language?: string
  invoice_url?: string
  type: TransactionType
  service_type: ContentService
  description: string
  metadata?: Record<string, any>
}): Promise<{ success: boolean }> {
  try {
    const amount = payment.OutSum ? parseFloat(payment.OutSum) : 0
    const normalizedTelegramId = normalizeTelegramId(payment.telegram_id)

    logger.info({
      message: '🔍 Создание нового платежа',
      description: 'Creating new payment',
      telegram_id: normalizedTelegramId,
      amount,
      status: payment.status,
      type: payment.type,
      service_type: payment.service_type
    })

    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: normalizedTelegramId,
        amount,
        type: payment.type,
        description: payment.description,
        bot_name: payment.bot_name,
        operation_id: payment.InvId || payment.inv_id,
        inv_id: payment.inv_id,
        metadata: {
          ...payment.metadata,
          currency: payment.currency,
          stars: payment.stars,
          email: payment.email,
          subscription: payment.subscription,
          language: payment.language,
          invoice_url: payment.invoice_url,
          payment_method: payment.payment_method,
          service_type: payment.service_type
        }
      }
    })

    logger.info({
      message: '✅ Событие платежа отправлено',
      description: 'Payment event sent',
      telegram_id: normalizedTelegramId,
      amount,
      status: payment.status,
      type: payment.type
    })

    return { success: true }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в setPayments',
      description: 'Error in setPayments function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: normalizeTelegramId(payment.telegram_id),
    })
    throw error
  }
}
