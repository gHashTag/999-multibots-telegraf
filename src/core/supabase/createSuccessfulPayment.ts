import { TelegramId } from '@/interfaces/telegram.interface'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { getSubscriptionTypeByAmount } from '@/price/constants/index'
import { ADMIN_IDS_ARRAY } from '@/config'

import { supabase } from '@/core/supabase'
import { getUserByTelegramIdString } from '@/core/supabase'
import { normalizeTransactionType } from '@/utils/service.utils'
import {
  CreatePaymentV2Schema,
  type PaymentV2,
  type CreatePaymentV2,
  PaymentV2Schema as ZodPaymentV2Schema,
} from '@/interfaces/zod/payment.zod'
import { z } from 'zod'

interface CreateSuccessfulPaymentParams {
  telegram_id: TelegramId
  amount: number
  type: string
  description: string
  bot_name: string
  service_type?: string
  model_name?: string // Название модели (kling_video, haiper_video, neuro_photo и т.д.)
  payment_method?: string
  metadata?: Record<string, any>
  inv_id: string
  stars?: number
  status?: PaymentStatus
  currency?: Currency
  invoice_url?: string
}

/**
 * Создает успешный платеж в системе
 * @param params Параметры платежа
 * @returns Результат создания платежа
 */
export async function createSuccessfulPayment({
  telegram_id,
  amount,
  type,
  description,
  service_type,
  model_name,
  stars,
  payment_method = 'Telegram',
  bot_name,
  metadata = {},
  status = PaymentStatus.COMPLETED,
  inv_id,
  currency = Currency.XTR,
  invoice_url,
}: CreateSuccessfulPaymentParams): Promise<PaymentV2 | null> {
  try {
    // Если передан inv_id, проверяем, не существует ли уже платеж с таким ID
    if (inv_id) {
      const { data: existingPayment, error: existingPaymentError } =
        await supabase
          .from('payments_v2')
          .select('id, inv_id')
          .eq('inv_id', inv_id)
          .maybeSingle()

      if (existingPaymentError) {
        logger.error(
          '❌ Ошибка при проверке существующего платежа по inv_id:',
          { inv_id, error: existingPaymentError }
        )
        return null
      }

      if (existingPayment) {
        logger.info('🔄 [ДУБЛИКАТ]: Обнаружен платеж с тем же inv_id:', {
          description:
            'Attempt to create payment with existing inv_id (duplicate prevented)',
          inv_id,
          existing_payment_id: existingPayment.id,
        })

        const { data: paymentData, error: paymentError } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('id', existingPayment.id)
          .single()

        if (paymentError) {
          logger.error(
            '❌ Ошибка при получении деталей существующего платежа:',
            { id: existingPayment.id, error: paymentError }
          )
          return null
        }
        if (!paymentData) {
          logger.warn(
            '⚠️ Существующий платеж не найден по ID после проверки inv_id',
            { id: existingPayment.id }
          )
          return null
        }

        try {
          const validatedExistingPayment = ZodPaymentV2Schema.parse(paymentData)
          logger.info(
            '✅ Возвращаем существующий валидированный платеж вместо создания дубликата:',
            {
              description:
                'Returning existing validated payment instead of creating duplicate',
              payment_id: validatedExistingPayment.inv_id,
            }
          )
          return validatedExistingPayment as PaymentV2
        } catch (validationError) {
          logger.error('❌ Ошибка Zod-валидации существующего платежа:', {
            description: 'Zod validation failed for existing payment data',
            errors:
              validationError instanceof z.ZodError
                ? validationError.errors
                : validationError,
            payment_id: existingPayment.id,
            rawData: paymentData,
          })
          return null
        }
      }
    }

    // Получаем пользователя для проверки
    const user = await getUserByTelegramIdString(telegram_id)
    if (!user) {
      throw new Error(`User not found for telegram_id: ${telegram_id}`)
    }

    // Нормализуем тип транзакции в нижний регистр для совместимости с БД
    const normalizedType = normalizeTransactionType(type)

    // Нормализуем telegram_id к строке
    const telegramIdStr = String(telegram_id)

    const numericAmount = Number(amount)
    const numericStars = stars !== undefined ? Number(stars) : numericAmount

    // ---> ДОБАВЛЕНА ЛОГИКА ДЛЯ ТЕСТОВЫХ ПЛАТЕЖЕЙ АДМИНОВ <---
    let finalMetadata = metadata || {} // Инициализируем finalMetadata
    const numericTelegramId = Number(telegram_id)
    if (
      !isNaN(numericTelegramId) &&
      ADMIN_IDS_ARRAY.includes(numericTelegramId)
    ) {
      finalMetadata = { ...finalMetadata, is_test_payment: true }
      logger.info('🧪 Платеж помечен как тестовый (админ)', {
        telegram_id: telegramIdStr,
        inv_id,
      })
    }
    // ---> КОНЕЦ ЛОГИКИ <---

    // Определяем subscription_type с помощью импортированной функции
    const calculatedSubscriptionType =
      status === PaymentStatus.COMPLETED &&
      normalizedType === 'money_income' &&
      currency === Currency.RUB
        ? getSubscriptionTypeByAmount(numericAmount)
        : null

    // Данные для вставки
    const rawInsertData = {
      telegram_id: telegramIdStr,
      amount: numericAmount,
      stars: numericStars,
      payment_method,
      description,
      type: normalizedType,
      service_type,
      model_name,
      bot_name,
      status,
      metadata: finalMetadata,
      currency,
      inv_id,
      invoice_url,
      subscription_type: calculatedSubscriptionType,
    }

    // ---> НАЧАЛО ZOD ВАЛИДАЦИИ <---
    let insertDataValidated: CreatePaymentV2
    try {
      insertDataValidated = CreatePaymentV2Schema.parse(rawInsertData)
      logger.info('✅ Zod-валидация данных для вставки прошла успешно:', {
        validatedData: insertDataValidated,
      })
    } catch (validationError) {
      logger.error('❌ Ошибка Zod-валидации данных для вставки:', {
        description: 'Zod validation failed for payment insert data',
        errors:
          validationError instanceof z.ZodError
            ? validationError.errors
            : validationError,
        rawData: rawInsertData,
      })
      throw validationError
    }
    // ---> КОНЕЦ ZOD ВАЛИДАЦИИ <---

    logger.info('➡️ Попытка вставки платежа:', {
      insertData: insertDataValidated,
    })

    // Вставка в базу
    const { data, error } = await supabase
      .from('payments_v2')
      .insert(insertDataValidated)
      .select()
      .single()

    if (error) {
      // Для дублирования inv_id
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        logger.info('🔄 [ДУБЛИКАТ]: Предотвращено дублирование платежа:', {
          description:
            'Duplicate payment prevented (unique constraint violation)',
          error: error instanceof Error ? error.message : String(error),
          code: error.code,
          details: 'details' in error ? error.details : 'Unknown details',
        })
      }
      // Для несуществующего пользователя
      else if (
        error instanceof Error &&
        error.message.includes('User not found')
      ) {
        logger.info('👤 [ПРОВЕРКА]: Пользователь не найден:', {
          description: 'User not found check (expected in some test cases)',
          error: error.message,
        })
      }
      // Для всех других ошибок
      else {
        logger.error('❌ Ошибка при создании записи о платеже:', {
          description: 'Error creating payment record',
          error: error instanceof Error ? error.message : String(error),
          error_details: error,
          telegram_id,
          amount,
          type,
          bot_name,
        })
      }
      throw error
    }

    logger.info('✅ Запись о платеже успешно создана:', {
      description: 'Payment record created successfully',
      payment_id: data.id,
      telegram_id,
      amount,
      type: data.type,
      bot_name,
    })

    try {
      const validatedData = ZodPaymentV2Schema.parse(data)
      return validatedData
    } catch (validationError) {
      logger.error(
        '❌ Ошибка Zod-валидации данных, полученных от БД после вставки:',
        {
          description:
            'Zod validation failed for data returned from DB after insert',
          errors:
            validationError instanceof z.ZodError
              ? validationError.errors
              : validationError,
          rawData: data,
        }
      )
      return null
    }
  } catch (error) {
    // Для дублирования inv_id
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      logger.info('🔄 [ДУБЛИКАТ]: Предотвращено дублирование платежа:', {
        description:
          'Duplicate payment prevented (unique constraint violation)',
        error: error instanceof Error ? error.message : String(error),
        code: error.code,
        details: 'details' in error ? error.details : 'Unknown details',
      })
    }
    // Для несуществующего пользователя
    else if (
      error instanceof Error &&
      error.message.includes('User not found')
    ) {
      logger.info('👤 [ПРОВЕРКА]: Пользователь не найден:', {
        description: 'User not found check (expected in some test cases)',
        error: error.message,
      })
    }
    // Для всех других ошибок
    else {
      logger.error('❌ Ошибка в createSuccessfulPayment:', {
        description: 'Error in createSuccessfulPayment function',
        error: error instanceof Error ? error.message : String(error),
        error_details: error,
      })
    }
    throw error
  }
}
