/**
 * PaymentProcessor - унифицированный обработчик платежей
 *
 * Консолидирует дублированную логику из:
 * - updateUserBalance.ts
 * - directPayment.ts
 * - createSuccessfulPayment.ts
 *
 * Цель: устранить дублирование кода, упростить поддержку и тестирование
 */

import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'
import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { getUserByTelegramIdString } from '@/core/supabase'
import {
  CreatePaymentV2Schema,
  type PaymentV2,
  type CreatePaymentV2,
  PaymentV2Schema as ZodPaymentV2Schema,
} from '@/interfaces/zod/payment.zod'
import { calculateServiceCost } from '@/price/helpers/calculateServiceCost'
import { normalizeTransactionType } from '@/utils/service.utils'
import { z } from 'zod'

/**
 * Параметры для создания платежа
 */
export interface PaymentProcessorParams {
  telegram_id: string
  amount: number
  type: PaymentType | string
  description: string
  bot_name: string
  service_type?: string | null
  model_name?: string | null
  payment_method?: string
  metadata?: Record<string, any>
  inv_id?: string
  stars?: number
  status?: PaymentStatus
  currency?: Currency
  subscription_type?: string | null
  cost_in_stars?: number
  bypass_balance_check?: boolean
}

/**
 * Результат обработки платежа
 */
export interface PaymentProcessorResult {
  success: boolean
  payment?: PaymentV2
  payment_id?: number
  error?: string
  balanceChange?: {
    before: number
    after: number
    difference: number
  }
}

/**
 * Класс для обработки платежей с общей логикой
 */
export class PaymentProcessor {
  /**
   * Проверяет существование пользователя
   */
  static async validateUser(telegram_id: string): Promise<boolean> {
    try {
      const user = await getUserByTelegramIdString(telegram_id)
      if (!user) {
        logger.error('❌ Пользователь не найден:', {
          description: 'User not found',
          telegram_id,
        })
        return false
      }
      return true
    } catch (error) {
      logger.error('❌ Ошибка при проверке пользователя:', {
        description: 'Error validating user',
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет достаточность баланса для списания
   */
  static async checkBalance(
    telegram_id: string,
    amount: number,
    bypass_check: boolean = false
  ): Promise<{ valid: boolean; currentBalance: number; error?: string }> {
    try {
      const currentBalance = await getUserBalance(telegram_id)

      logger.info('💰 Проверка баланса пользователя:', {
        description: 'Checking user balance',
        telegram_id,
        currentBalance,
        requiredAmount: amount,
      })

      if (!bypass_check && currentBalance < amount) {
        const errorMsg = `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${amount}`
        logger.error('❌ Недостаточно средств:', {
          description: 'Insufficient funds',
          telegram_id,
          currentBalance,
          requiredAmount: amount,
        })
        return { valid: false, currentBalance, error: errorMsg }
      }

      if (bypass_check && currentBalance < amount) {
        logger.warn('🔓 Проверка баланса пропущена (bypass):', {
          telegram_id,
          currentBalance,
          requiredAmount: amount,
        })
      }

      return { valid: true, currentBalance }
    } catch (error) {
      const errorMsg = `Ошибка при проверке баланса: ${
        error instanceof Error ? error.message : String(error)
      }`
      logger.error('❌ Ошибка при проверке баланса:', {
        description: 'Error checking balance',
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })
      return { valid: false, currentBalance: 0, error: errorMsg }
    }
  }

  /**
   * Проверяет существование платежа с таким же inv_id (защита от дубликатов)
   */
  static async checkExistingPayment(
    inv_id: string
  ): Promise<PaymentV2 | null> {
    try {
      const { data: existingPayment, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('inv_id', inv_id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        logger.error('❌ Ошибка при проверке существующего платежа:', {
          description: 'Error checking existing payment',
          inv_id,
          error: error.message,
        })
        return null
      }

      if (existingPayment) {
        logger.info('🔄 [ДУБЛИКАТ]: Обнаружен платеж с тем же inv_id:', {
          description: 'Duplicate payment detected',
          inv_id,
          payment_id: existingPayment.id,
        })

        try {
          return ZodPaymentV2Schema.parse(existingPayment)
        } catch (validationError) {
          logger.error('❌ Ошибка валидации существующего платежа:', {
            description: 'Validation error for existing payment',
            inv_id,
            error:
              validationError instanceof z.ZodError
                ? validationError.errors
                : validationError,
          })
          return null
        }
      }

      return null
    } catch (error) {
      logger.error('❌ Неожиданная ошибка при проверке дубликата:', {
        description: 'Unexpected error checking for duplicate',
        inv_id,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Вычисляет правильную сумму транзакции из различных источников
   * Консолидирует логику из updateUserBalance.ts (строки 76-172)
   */
  static calculateAmount(
    amount: number,
    type: PaymentType | string,
    description: string | undefined,
    metadata?: Record<string, any>
  ): number {
    let safeAmount = Number(amount)
    const originalAmount = safeAmount

    // Проверка на NaN
    if (isNaN(safeAmount)) {
      logger.warn('⚠️ Получено NaN значение amount, устанавливаем 0:', {
        description: 'Received NaN amount, setting to 0',
        original_value: amount,
      })
      return 0
    }

    // Логика для платежей за генерацию
    if (
      description?.includes('Payment for generating') &&
      type === PaymentType.MONEY_OUTCOME
    ) {
      if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
        logger.info('🎯 Используем modePrice из metadata:', {
          original_amount: safeAmount,
          modePrice: metadata.modePrice,
        })
        safeAmount = metadata.modePrice
      } else if (
        metadata?.paymentAmount &&
        typeof metadata.paymentAmount === 'number'
      ) {
        logger.info('🎯 Используем paymentAmount из metadata:', {
          original_amount: safeAmount,
          paymentAmount: metadata.paymentAmount,
        })
        safeAmount = metadata.paymentAmount
      } else {
        logger.warn('⚠️ Не могу определить сумму, устанавливаю 5:', {
          original_amount: safeAmount,
        })
        safeAmount = 5
      }
    } else {
      // Общая логика определения суммы
      if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
        safeAmount = metadata.modePrice
      } else if (
        metadata?.paymentAmount &&
        typeof metadata.paymentAmount === 'number'
      ) {
        safeAmount = metadata.paymentAmount
      } else if (metadata?.stars && typeof metadata.stars === 'number') {
        safeAmount = metadata.stars
      } else if (
        metadata?.currentBalance &&
        Math.abs(metadata.currentBalance - safeAmount) < 100 &&
        type === PaymentType.MONEY_OUTCOME
      ) {
        // Вероятно передан новый баланс вместо суммы операции
        const operationAmount = Math.abs(metadata.currentBalance - safeAmount)
        logger.info('🔎 Определена сумма по разнице балансов:', {
          currentBalance: metadata.currentBalance,
          newBalance: safeAmount,
          calculatedAmount: operationAmount,
        })
        safeAmount = operationAmount
      }
    }

    // Проверка на подозрительно большие суммы для outcome
    if (type === PaymentType.MONEY_OUTCOME && safeAmount > 100) {
      logger.warn('⚠️ Подозрительно большая сумма списания:', {
        original_amount: originalAmount,
        processed_amount: safeAmount,
      })

      if (description?.toLowerCase().includes('generating')) {
        logger.info('🛠️ Корректировка суммы для генерации:', {
          original_amount: safeAmount,
          new_amount: 5,
        })
        safeAmount = 5
      }
    }

    logger.info('✅ Финальная сумма транзакции:', {
      original_amount: originalAmount,
      final_amount: safeAmount,
      type,
    })

    return safeAmount
  }

  /**
   * Создает запись о платеже с Zod валидацией
   */
  static async createPaymentRecord(
    params: PaymentProcessorParams
  ): Promise<PaymentProcessorResult> {
    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type,
      model_name,
      payment_method = 'System',
      metadata = {},
      inv_id,
      stars,
      status = PaymentStatus.COMPLETED,
      currency = Currency.XTR,
      subscription_type,
      cost_in_stars,
    } = params

    try {
      // 1. Валидация пользователя
      const userValid = await this.validateUser(telegram_id)
      if (!userValid) {
        return {
          success: false,
          error: `User not found: ${telegram_id}`,
        }
      }

      // 2. Нормализация типа транзакции
      const normalizedType = normalizeTransactionType(type as string)

      // 3. Вычисление правильной суммы
      const calculatedAmount = this.calculateAmount(
        amount,
        type as PaymentType,
        description,
        metadata
      )
      const finalStars = stars !== undefined ? Number(stars) : calculatedAmount

      // 4. Проверка баланса для MONEY_OUTCOME
      let currentBalance = 0
      if (normalizedType === 'money_outcome') {
        const balanceCheck = await this.checkBalance(
          telegram_id,
          finalStars,
          params.bypass_balance_check
        )
        if (!balanceCheck.valid) {
          return {
            success: false,
            error: balanceCheck.error || 'Insufficient funds',
          }
        }
        currentBalance = balanceCheck.currentBalance
      }

      // 5. Проверка на дубликат
      if (inv_id) {
        const existingPayment = await this.checkExistingPayment(inv_id)
        if (existingPayment) {
          logger.info('✅ Возвращаем существующий платеж:', {
            inv_id,
            payment_id: existingPayment.id,
          })
          return {
            success: true,
            payment: existingPayment,
            payment_id: existingPayment.id,
          }
        }
      }

      // 6. Формирование данных для вставки
      const generatedInvId = inv_id || `sys-${Date.now()}-${telegram_id}`

      // 7. Рассчитываем cost для MONEY_OUTCOME операций
      let calculatedCost = 0
      if (normalizedType === 'money_outcome') {
        if (cost_in_stars !== undefined) {
          calculatedCost = cost_in_stars
          logger.info('🎯 Используем переданный cost_in_stars:', {
            telegram_id,
            service_type,
            cost_in_stars,
          })
        } else {
          calculatedCost = calculateServiceCost(
            service_type || null,
            metadata,
            finalStars
          )
          logger.info('🧮 Автоматически рассчитан cost:', {
            telegram_id,
            service_type,
            calculatedCost,
          })
        }
      }

      const rawInsertData: any = {
        telegram_id: String(telegram_id),
        amount: amount,
        stars: Number(finalStars.toFixed(2)),
        payment_method,
        description,
        type: normalizedType,
        service_type: service_type || null,
        model_name: model_name || null,
        bot_name,
        status,
        metadata: {
          ...metadata,
          balance_before: currentBalance,
        },
        currency,
        inv_id: generatedInvId,
        subscription_type: subscription_type || null,
        cost: calculatedCost,
        category: metadata?.category || 'REAL',
        operation_id: metadata?.operation_id || null,
      }

      // 8. Zod валидация
      let validatedData: CreatePaymentV2
      try {
        validatedData = CreatePaymentV2Schema.parse(rawInsertData)
        logger.info('✅ Zod-валидация данных прошла успешно:', {
          telegram_id,
          inv_id: generatedInvId,
        })
      } catch (validationError) {
        logger.error('❌ Ошибка Zod-валидации:', {
          description: 'Zod validation failed',
          telegram_id,
          errors:
            validationError instanceof z.ZodError
              ? validationError.errors
              : validationError,
          rawData: rawInsertData,
        })
        return {
          success: false,
          error: `Validation error: ${
            validationError instanceof Error
              ? validationError.message
              : 'Unknown validation error'
          }`,
        }
      }

      // 9. Вставка в базу данных
      const { data, error } = await supabase
        .from('payments_v2')
        .insert(validatedData)
        .select()
        .single()

      if (error) {
        // Обработка ошибки дубликата (23505)
        if (error.code === '23505') {
          logger.info('🔄 [ДУБЛИКАТ]: Предотвращено дублирование платежа:', {
            description: 'Duplicate payment prevented',
            error: error.message,
            inv_id: generatedInvId,
          })
        } else {
          logger.error('❌ Ошибка при создании записи о платеже:', {
            description: 'Error creating payment record',
            telegram_id,
            error: error.message,
            error_details: error,
          })
        }
        return {
          success: false,
          error: `Database error: ${error.message}`,
        }
      }

      // 10. Инвалидация кэша баланса
      await invalidateBalanceCache(telegram_id)
      logger.info('💰 Кэш баланса инвалидирован:', { telegram_id })

      // 11. Валидация полученных данных
      try {
        const validatedPayment = ZodPaymentV2Schema.parse(data)
        logger.info('✅ Запись о платеже успешно создана:', {
          description: 'Payment record created successfully',
          payment_id: validatedPayment.id,
          telegram_id,
          type: normalizedType,
        })

        // 12. Получаем новый баланс
        const newBalance = await getUserBalance(telegram_id)

        return {
          success: true,
          payment: validatedPayment,
          payment_id: validatedPayment.id,
          balanceChange: {
            before: currentBalance,
            after: newBalance,
            difference: newBalance - currentBalance,
          },
        }
      } catch (validationError) {
        logger.error('❌ Ошибка валидации данных из БД:', {
          description: 'Validation error for data from DB',
          errors:
            validationError instanceof z.ZodError
              ? validationError.errors
              : validationError,
          rawData: data,
        })
        return {
          success: false,
          error: 'Validation error after insert',
        }
      }
    } catch (error) {
      logger.error('❌ Неожиданная ошибка при создании платежа:', {
        description: 'Unexpected error creating payment',
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
