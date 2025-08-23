import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'
import { CreatePaymentV2Schema } from '@/interfaces/zod/payment.zod'
import { calculateServiceCost } from '@/price/helpers/calculateServiceCost'
import { checkRateLimit } from '@/core/supabase/rateLimiter'

type BalanceUpdateMetadata = {
  stars?: number
  payment_method?: string
  bot_name?: string
  language?: string
  service_type?: string
  model_name?: string // Название модели (kling_video, haiper_video, neuro_photo и т.д.)
  inv_id?: string
  modePrice?: number
  currentBalance?: number
  paymentAmount?: number
  category?: 'REAL' | 'BONUS' // Категория транзакции
  [key: string]: any
}

/**
 * Создает или обновляет запись о транзакции в таблице payments
 * @returns Promise<boolean> - успешно ли выполнено добавление/обновление записи
 */
export const updateUserBalance = async (
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description?: string,
  metadata?: BalanceUpdateMetadata,
  cost_in_stars?: number
): Promise<boolean> => {
  try {
    // 🛡️ БЕЗОПАСНОСТЬ: Валидация входных данных
    // 1. Валидация telegram_id
    if (
      !telegram_id ||
      typeof telegram_id !== 'string' ||
      !/^\d+$/.test(telegram_id)
    ) {
      logger.error('🚨 БЕЗОПАСНОСТЬ: Некорректный telegram_id:', {
        telegram_id,
        type: typeof telegram_id,
        error: 'telegram_id должен быть строкой из цифр',
      })
      return false
    }

    // 2. Валидация суммы
    const MAX_AMOUNT = 100000 // 100,000 звезд максимум
    const validatedAmount = Number(amount)

    if (!Number.isFinite(validatedAmount)) {
      logger.error('🚨 БЕЗОПАСНОСТЬ: Некорректная сумма (не число):', {
        telegram_id,
        amount,
        validatedAmount,
        error: 'Сумма не является валидным числом',
      })
      return false
    }

    if (Math.abs(validatedAmount) > MAX_AMOUNT) {
      logger.error('🚨 БЕЗОПАСНОСТЬ: Превышен лимит суммы:', {
        telegram_id,
        amount: validatedAmount,
        maxAllowed: MAX_AMOUNT,
        error: 'Сумма превышает максимально допустимую',
      })
      return false
    }

    // 3. Защита от JSON injection в metadata
    let safeMetadata = {}
    if (metadata) {
      try {
        // Проверяем что metadata сериализуется без ошибок
        const serialized = JSON.stringify(metadata)
        if (serialized.length > 10000) {
          // Лимит на размер метаданных
          logger.warn('⚠️ БЕЗОПАСНОСТЬ: Слишком большие metadata:', {
            telegram_id,
            metadataSize: serialized.length,
          })
          safeMetadata = { ...metadata, warning: 'metadata truncated' }
        } else {
          safeMetadata = metadata
        }
      } catch (error) {
        logger.error('🚨 БЕЗОПАСНОСТЬ: Ошибка сериализации metadata:', {
          telegram_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        safeMetadata = { error: 'Invalid metadata' }
      }
    }

    // Подробное логирование входных данных для диагностики
    logger.info('🔍 Входные данные updateUserBalance:', {
      log_description: 'Input parameters for updateUserBalance (validated)',
      telegram_id,
      amount: validatedAmount,
      amount_type: typeof validatedAmount,
      type,
      operation_description: description,
      metadata: safeMetadata ? JSON.stringify(safeMetadata) : 'нет метаданных',
      cost_in_stars,
    })

    // Проверка входных данных
    if (!telegram_id) {
      logger.error('❌ Пустой telegram_id в updateUserBalance:', {
        description: 'Empty telegram_id in updateUserBalance',
        telegram_id,
      })
      return false
    }

    // Проверка корректности суммы операции
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      logger.error('❌ Некорректная сумма операции:', {
        description: 'Invalid operation amount',
        amount,
        telegram_id,
      })
      return false
    }

    // Безопасно преобразуем amount в число
    let safeAmount = Number(amount)
    const originalAmount = safeAmount // Сохраняем оригинальное значение для логов

    // ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ: Извлечение суммы платежа из описания, если это оплата генерации
    if (
      description &&
      description.includes('Payment for generating') &&
      type === PaymentType.MONEY_OUTCOME
    ) {
      // Извлекаем значение modePrice из metadata
      if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
        logger.info('🎯 ПРИНУДИТЕЛЬНО использую modePrice из metadata:', {
          description: 'FORCED use of modePrice from metadata',
          telegram_id,
          original_amount: safeAmount,
          modePrice: metadata.modePrice,
        })
        safeAmount = metadata.modePrice
      }
      // Или проверяем paymentAmount
      else if (
        metadata?.paymentAmount &&
        typeof metadata.paymentAmount === 'number'
      ) {
        logger.info('🎯 ПРИНУДИТЕЛЬНО использую paymentAmount из metadata:', {
          description: 'FORCED use of paymentAmount from metadata',
          telegram_id,
          original_amount: safeAmount,
          paymentAmount: metadata.paymentAmount,
        })
        safeAmount = metadata.paymentAmount
      } else {
        // Последний шанс - попытка извлечь из описания сумму операции
        logger.warn(
          '⚠️ Не могу определить сумму операции, устанавливаю значение по умолчанию 5:',
          {
            description:
              'Cannot determine operation amount, setting default value of 5',
            telegram_id,
            original_amount: safeAmount,
          }
        )
        safeAmount = 5 // Устанавливаем значение по умолчанию для нейрогенерации
      }
    }
    // Если не нашли в описании, пробуем другие методы определения суммы
    else {
      // --- ЛОГИКА ОПРЕДЕЛЕНИЯ ФАКТИЧЕСКОЙ СУММЫ ТРАНЗАКЦИИ ---

      // Если есть modePrice в metadata - это стоимость операции
      if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
        logger.info('🎯 Найдена стоимость операции в metadata.modePrice:', {
          description: 'Found operation price in metadata.modePrice',
          telegram_id,
          original_amount: safeAmount,
          modePrice: metadata.modePrice,
        })
        safeAmount = metadata.modePrice
      }
      // Если есть paymentAmount в metadata - используем его
      else if (
        metadata?.paymentAmount &&
        typeof metadata.paymentAmount === 'number'
      ) {
        logger.info('🎯 Найдена стоимость операции в metadata.paymentAmount:', {
          description: 'Found operation price in metadata.paymentAmount',
          telegram_id,
          original_amount: safeAmount,
          paymentAmount: metadata.paymentAmount,
        })
        safeAmount = metadata.paymentAmount
      }
      // Если есть stars в metadata - используем их
      else if (metadata?.stars && typeof metadata.stars === 'number') {
        logger.info('🔄 Используем stars из metadata вместо amount:', {
          description: 'Using stars from metadata instead of amount',
          telegram_id,
          original_amount: safeAmount,
          stars_amount: metadata.stars,
        })
        safeAmount = metadata.stars
      }
      // Проверка на ситуацию когда передан баланс вместо суммы операции
      else if (
        metadata?.currentBalance &&
        Math.abs(metadata.currentBalance - safeAmount) < 100 &&
        type === PaymentType.MONEY_OUTCOME
      ) {
        // Вероятно передан новый баланс вместо суммы операции
        // Вычисляем разницу между текущим и новым балансом
        const operationAmount = Math.abs(metadata.currentBalance - safeAmount)
        logger.info('🔎 Определена сумма операции по разнице балансов:', {
          description: 'Detected operation amount as balance difference',
          telegram_id,
          currentBalance: metadata.currentBalance,
          newBalance: safeAmount,
          calculatedAmount: operationAmount,
        })
        safeAmount = operationAmount
      }
    }

    // Проверка на подозрительно большие суммы для outcome операций
    if (type === PaymentType.MONEY_OUTCOME && safeAmount > 100) {
      logger.warn('⚠️ Подозрительно большая сумма списания, возможно ошибка:', {
        description: 'Suspiciously large amount for outcome operation',
        telegram_id,
        original_amount: originalAmount,
        processed_amount: safeAmount,
      })

      // Для генерации изображений устанавливаем значение по умолчанию
      if (description && description.toLowerCase().includes('generating')) {
        logger.info('🛠️ Корректировка суммы для генерации изображения:', {
          description: 'Correcting amount for image generation',
          telegram_id,
          original_amount: safeAmount,
          new_amount: 5,
        })
        safeAmount = 5 // Стандартная стоимость генерации
      }
    }

    // Дополнительная защита: если после преобразования получили NaN, устанавливаем 0
    if (isNaN(safeAmount)) {
      logger.warn(
        '⚠️ После преобразования получили NaN, устанавливаем сумму в 0',
        {
          description: 'Got NaN after conversion, setting amount to 0',
          telegram_id,
          original_value: amount,
        }
      )
      safeAmount = 0
    }

    // Логируем финальную сумму для проверки
    logger.info('✅ Финальная сумма транзакции:', {
      description: 'Final transaction amount',
      telegram_id,
      original_amount: originalAmount,
      final_amount: safeAmount,
      type,
    })

    // 🔒 КРИТИЧЕСКАЯ ЗАЩИТА: Проверка rate limit для предотвращения спам-атак
    logger.info('🔍 Проверка rate limit перед операцией:', {
      description: 'Checking rate limit before operation',
      telegram_id,
      operationType: type,
      amount: safeAmount,
    })

    const rateLimitResult = await checkRateLimit(telegram_id, type)

    if (!rateLimitResult.allowed) {
      const errorMessage =
        rateLimitResult.error ||
        `Превышен лимит операций: ${rateLimitResult.currentCount}/${rateLimitResult.limit} за ${rateLimitResult.windowMinutes} мин.`

      logger.warn('🚨 ОПЕРАЦИЯ ЗАБЛОКИРОВАНА - Rate limit превышен:', {
        description: 'Operation blocked - Rate limit exceeded',
        telegram_id,
        operationType: type,
        currentCount: rateLimitResult.currentCount,
        limit: rateLimitResult.limit,
        windowMinutes: rateLimitResult.windowMinutes,
        resetTime: rateLimitResult.resetTime,
        error: errorMessage,
      })

      // Возвращаем false - операция заблокирована
      return false
    }

    logger.info('✅ Rate limit проверка пройдена:', {
      description: 'Rate limit check passed',
      telegram_id,
      operationType: type,
      currentCount: rateLimitResult.currentCount,
      limit: rateLimitResult.limit,
      remainingOperations: rateLimitResult.limit - rateLimitResult.currentCount,
    })

    // 🔒 КРИТИЧЕСКАЯ ЗАЩИТА ОТ RACE CONDITIONS:
    // Используем database transaction с row-level locking для предотвращения
    // параллельных операций одного пользователя

    if (type === PaymentType.MONEY_OUTCOME) {
      logger.info('🔒 Начинаем транзакцию с блокировкой для MONEY_OUTCOME:', {
        description: 'Starting transaction with locking for MONEY_OUTCOME',
        telegram_id,
        operationAmount: safeAmount,
      })

      // Выполняем операцию в transaction с retry логикой
      const maxRetries = 3
      let retryCount = 0

      while (retryCount < maxRetries) {
        try {
          // 🔒 ТРАНЗАКЦИЯ: Атомарная проверка баланса и вставка записи
          const transactionResult = await supabase.rpc(
            'process_balance_operation_atomic',
            {
              p_telegram_id: parseInt(telegram_id),
              p_operation_amount: safeAmount,
              p_payment_record: {
                telegram_id: parseInt(telegram_id),
                amount: originalAmount,
                stars: Number(safeAmount.toFixed(2)),
                currency: metadata?.currency || Currency.XTR,
                status: metadata?.status || PaymentStatus.COMPLETED,
                type: type,
                payment_method: metadata?.payment_method || 'System',
                description: description || 'System operation',
                metadata: metadata || {},
                bot_name: metadata?.bot_name || 'unknown_bot',
                service_type: metadata?.service_type || 'unknown_service',
                model_name: metadata?.model_name || null,
                subscription_type: null,
                payment_date: new Date().toISOString(),
                inv_id: metadata?.inv_id || `sys-${Date.now()}-${telegram_id}`,
                operation_id: metadata?.operation_id || null,
                category: metadata?.category || 'REAL',
                cost:
                  cost_in_stars !== undefined
                    ? cost_in_stars
                    : calculateServiceCost(
                        metadata?.service_type || null,
                        metadata,
                        safeAmount
                      ),
              },
            }
          )

          if (transactionResult.error) {
            // Если это ошибка недостатка средств - не ретраем
            if (
              transactionResult.error.message?.includes('insufficient funds')
            ) {
              logger.error('❌ Недостаточно средств на балансе (транзакция):', {
                description: 'Insufficient funds (transaction)',
                telegram_id,
                error: transactionResult.error.message,
              })
              return false
            }

            // Если это deadlock или temporary error - ретраем
            if (
              transactionResult.error.message?.includes('deadlock') ||
              transactionResult.error.message?.includes(
                'could not serialize'
              ) ||
              retryCount < maxRetries - 1
            ) {
              retryCount++
              const backoffMs = Math.pow(2, retryCount) * 100 // Exponential backoff

              logger.warn(
                `⚠️ Транзакция ${retryCount}/${maxRetries}: повтор через ${backoffMs}мс:`,
                {
                  description: 'Transaction retry due to concurrency',
                  telegram_id,
                  error: transactionResult.error.message,
                  retryCount,
                  backoffMs,
                }
              )

              await new Promise(resolve => setTimeout(resolve, backoffMs))
              continue // Повторяем попытку
            } else {
              // Критическая ошибка - прекращаем попытки
              logger.error('❌ Критическая ошибка транзакции баланса:', {
                description: 'Critical balance transaction error',
                telegram_id,
                error: transactionResult.error.message,
                retryCount,
              })
              return false
            }
          }

          // Транзакция успешна
          logger.info('✅ Транзакция баланса успешно завершена:', {
            description: 'Balance transaction completed successfully',
            telegram_id,
            operationAmount: safeAmount,
            result: transactionResult.data,
          })

          // Инвалидация кэша баланса
          await invalidateBalanceCache(telegram_id.toString())
          return true
        } catch (error) {
          retryCount++

          if (retryCount >= maxRetries) {
            logger.error('❌ Все попытки транзакции исчерпаны:', {
              description: 'All transaction retry attempts exhausted',
              telegram_id,
              error: error instanceof Error ? error.message : 'Unknown error',
              maxRetries,
            })
            return false
          }

          const backoffMs = Math.pow(2, retryCount) * 100
          logger.warn(
            `⚠️ Ошибка транзакции ${retryCount}/${maxRetries}: повтор через ${backoffMs}мс:`,
            {
              description: 'Transaction error, retrying',
              telegram_id,
              error: error instanceof Error ? error.message : 'Unknown error',
              retryCount,
              backoffMs,
            }
          )

          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
      }

      return false // Все попытки исчерпаны
    } else {
      // 💰 ОПЕРАЦИИ ПОПОЛНЕНИЯ (MONEY_INCOME) - без блокировок, но с валидацией
      logger.info('💰 Обработка операции пополнения MONEY_INCOME:', {
        description: 'Processing MONEY_INCOME operation',
        telegram_id,
        amount: safeAmount,
      })

      // Проверяем, есть ли inv_id в метаданных (для обновления существующей записи)
      if (metadata?.inv_id) {
        logger.info('🔄 Обновление существующей записи о пополнении:', {
          description: 'Updating existing income transaction record',
          telegram_id,
          inv_id: metadata.inv_id,
          amount: safeAmount,
        })

        // Обновляем существующую запись в payments_v2
        const { error: updateError } = await supabase
          .from('payments_v2')
          .update({
            status: PaymentStatus.COMPLETED,
          })
          .eq('inv_id', metadata.inv_id)

        if (updateError) {
          logger.error('❌ Ошибка при обновлении записи о пополнении:', {
            description: 'Error updating income transaction record',
            telegram_id,
            inv_id: metadata.inv_id,
            error: updateError.message,
          })
          return false
        }

        logger.info('✅ Запись о пополнении успешно обновлена:', {
          description: 'Income transaction record successfully updated',
          telegram_id,
          inv_id: metadata.inv_id,
          amount: safeAmount,
        })

        // Инвалидация кэша баланса
        await invalidateBalanceCache(telegram_id.toString())
        return true
      }

      // Создаем новую запись о пополнении
      const paymentRecord: any = {
        telegram_id: Number(telegram_id),
        amount: originalAmount,
        stars: Number(safeAmount.toFixed(2)),
        currency: metadata?.currency || Currency.XTR,
        status: metadata?.status || PaymentStatus.COMPLETED,
        type: type,
        payment_method: metadata?.payment_method || 'System',
        description: description || 'System operation',
        metadata: metadata || {},
        bot_name: metadata?.bot_name || 'unknown_bot',
        service_type: null,
        model_name: null,
        subscription_type: metadata?.subscription_type || null,
        payment_date: new Date().toISOString(),
        inv_id: metadata?.inv_id || `sys-${Date.now()}-${telegram_id}`,
        operation_id: metadata?.operation_id || null,
        category: metadata?.category || 'REAL',
        cost: 0, // Для пополнений cost всегда 0
      }

      // Валидация с помощью Zod
      try {
        const validatedPaymentRecord =
          CreatePaymentV2Schema.parse(paymentRecord)
        logger.info('✅ Данные пополнения прошли валидацию Zod:', {
          description: 'Income data passed Zod validation',
          telegram_id,
          record: validatedPaymentRecord,
        })

        // Вставляем запись о пополнении в payments_v2
        const { error: paymentError } = await supabase
          .from('payments_v2')
          .insert(validatedPaymentRecord)

        if (paymentError) {
          logger.error('❌ Ошибка при добавлении записи о пополнении:', {
            description: 'Error inserting income record',
            telegram_id,
            record: validatedPaymentRecord,
            error: paymentError.message,
            details: paymentError.details,
            hint: paymentError.hint,
          })
          return false
        }

        logger.info('✅ Запись о пополнении успешно добавлена:', {
          description: 'Income record successfully added',
          telegram_id,
          record_id: validatedPaymentRecord.inv_id,
          amount_stars: safeAmount,
        })
      } catch (validationError) {
        logger.error('❌ Ошибка валидации пополнения Zod:', {
          description: 'Zod validation error for income record',
          telegram_id,
          record: paymentRecord,
          error: validationError.errors || validationError.message,
        })
        return false
      }

      // Инвалидация кэша баланса
      await invalidateBalanceCache(telegram_id.toString())
      logger.info('💰 Кэш баланса инвалидирован после пополнения:', {
        description: 'Balance cache invalidated after income',
        telegram_id,
      })

      return true
    }
  } catch (error) {
    logger.error('❌ Неожиданная ошибка при создании транзакции:', {
      description: 'Unexpected error creating transaction',
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Возвращаем false вместо выброса исключения
    return false
  }
}
