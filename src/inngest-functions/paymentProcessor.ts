import { inngest } from '@/core/inngest/clients'
import { BalanceOperationResult } from '@/interfaces'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { createPayment } from '@/core/supabase/setPayments'
import { supabase } from '@/core/supabase'

import { TelegramId } from '@/interfaces/telegram.interface'

// Кеш для хранения информации об обработанных платежах, чтобы избежать дублирования
const processedPayments = new Map<string, BalanceOperationResult>()

/**
 * Безопасно отправляет сообщение через бота, учитывая разные структуры объекта бота
 */
const safeSendMessage = async (
  bot: any, // Оставляем any т.к. разные боты могут иметь разную структуру
  telegram_id: TelegramId,
  message: string
): Promise<boolean> => {
  try {
    // Пробуем разные методы отправки в зависимости от структуры бота
    if (bot.telegram && typeof bot.telegram.sendMessage === 'function') {
      await bot.telegram.sendMessage(telegram_id, message)
    } else if (typeof bot.sendMessage === 'function') {
      await bot.sendMessage(telegram_id, message)
    } else {
      throw new Error('No valid send method found on bot')
    }
    return true
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения:', {
      description: 'Error sending message',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    return false
  }
}

// Определяем два отдельных интерфейса для успешного и неуспешного результата

/**
 * Функция Inngest для обработки платежей с шагами
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: `payment-processor`,
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event, step }) => {
    try {
      const {
        telegram_id,
        amount,
        is_ru = false,
        bot_name,
        description,
        operation_id,
        bot,
        metadata = {},
        type = 'money_expense',
        currency = 'STARS',
      } = event.data

      // ШАГ 1: Инициализация операции и проверка кеша
      const initResult = await step.run('init-operation', async () => {
        // Создаем уникальный идентификатор операции
        const opId =
          operation_id || `${telegram_id}-${amount}-${new Date().getTime()}-${uuidv4()}`

        logger.info('🚀 ШАГ 1: Инициализация операции', {
          description: 'Step 1: Operation initialization',
          telegram_id,
          amount,
          operation_id: opId,
          bot_name,
          payment_type: type,
        })

        // Проверяем, не обрабатывали ли мы уже такую операцию
        if (processedPayments.has(opId)) {
          const cachedResult = processedPayments.get(opId)
          logger.info('🔄 Найден кеш операции, пропускаем обработку:', {
            description: 'Found cached operation, skipping processing',
            telegram_id,
            operation_id: opId,
            cached_result: cachedResult,
          })
          return { opId, cachedResult, shouldContinue: false }
        }

        return { opId, shouldContinue: true }
      })

      // Если у нас есть кешированный результат, возвращаем его
      if (
        !initResult.shouldContinue &&
        'cachedResult' in initResult &&
        initResult.cachedResult
      ) {
        logger.info('🔄 Возвращаем кешированный результат', {
          description: 'Returning cached result',
          telegram_id,
          operation_id: initResult.opId,
        })
        return initResult.cachedResult
      }

      // ШАГ 2: Валидация входных данных
      const validationResult = await step.run('validate-input', async () => {
        logger.info('🧐 ШАГ 2: Валидация входных данных', {
          description: 'Step 2: Input data validation',
          telegram_id,
          amount_type: typeof amount,
          amount_value: amount,
        })

        // Проверка telegram_id
        if (!telegram_id) {
          logger.error('❌ Отсутствует telegram_id:', {
            description: 'Missing telegram_id',
            telegram_id,
          })

          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'telegram_id is required',
            modePrice: amount,
          }
          processedPayments.set(initResult.opId, errorResult)
          return { isValid: false, errorResult }
        }

        // Проверка суммы платежа
        if (amount === undefined || amount === null || isNaN(Number(amount))) {
          logger.error('❌ Неверная сумма платежа:', {
            description: 'Invalid payment amount',
            amount,
            amount_type: typeof amount,
            telegram_id,
          })

          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'Payment amount is invalid',
            modePrice: amount || 0,
          }
          processedPayments.set(initResult.opId, errorResult)
          return { isValid: false, errorResult }
        }

        logger.info('✅ Входные данные валидны', {
          description: 'Input data is valid',
          telegram_id,
          amount,
        })

        return { isValid: true }
      })

      if (
        !validationResult.isValid &&
        'errorResult' in validationResult &&
        validationResult.errorResult
      ) {
        logger.error('❌ Валидация не пройдена', {
          description: 'Validation failed',
          telegram_id,
          operation_id: initResult.opId,
        })
        return validationResult.errorResult
      }

      // ШАГ 3: Получение и проверка баланса пользователя
      const balanceResult = await step.run('check-balance', async () => {
        logger.info('💳 ШАГ 3: Получение баланса пользователя', {
          description: 'Step 3: Getting user balance',
          telegram_id,
        })

        // Получаем текущий баланс
        const currentBalance = await getUserBalance(telegram_id, bot_name)

        // Подробное логирование полученного баланса
        logger.info('💰 Получен баланс пользователя:', {
          description: 'Retrieved user balance',
          telegram_id,
          currentBalance,
          currentBalance_type: typeof currentBalance,
          isNull: currentBalance === null,
          isUndefined: currentBalance === undefined,
          isNaN: isNaN(Number(currentBalance)),
        })

        // Проверка корректности баланса
        if (
          currentBalance === undefined ||
          currentBalance === null ||
          isNaN(Number(currentBalance))
        ) {
          logger.error('❌ Получен некорректный баланс:', {
            description: 'Invalid balance received',
            currentBalance,
            telegram_id,
          })

          // Отправляем сообщение об ошибке
          const errorMessage = is_ru
            ? 'Произошла ошибка при проверке баланса. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
            : 'An error occurred while checking your balance. Please try again later or contact support.'

          if (bot) {
            await safeSendMessage(bot, telegram_id, errorMessage)
          }

          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'Invalid balance',
            modePrice: amount,
          }
          processedPayments.set(initResult.opId, errorResult)
          return { hasValidBalance: false, errorResult, currentBalance: 0 }
        }

        logger.info('✅ Баланс получен успешно', {
          description: 'Balance retrieved successfully',
          telegram_id,
          currentBalance,
        })

        return { hasValidBalance: true, currentBalance }
      })

      if (
        !balanceResult.hasValidBalance &&
        'errorResult' in balanceResult &&
        balanceResult.errorResult
      ) {
        logger.error('❌ Проблема с балансом пользователя', {
          description: 'User balance issue',
          telegram_id,
          operation_id: initResult.opId,
        })
        return balanceResult.errorResult
      }

      // ШАГ 4: Создание записи о платеже
      const paymentRecord = await step.run('create-payment', async () => {
        try {
          logger.info('💳 ШАГ 4: Создание записи о платеже', {
            description: 'Step 4: Creating payment record',
            telegram_id,
            amount,
            type,
            operation_id: initResult.opId,
          })

          const payment = await createPayment({
            telegram_id,
            amount,
            stars: Math.abs(amount),
            currency: currency || 'STARS',
            description: type,
            metadata: {},
            payment_method: 'balance',
            bot_name,
            inv_id: operation_id,
            status: 'PENDING',
          })

          if (!payment || !payment.payment_id) {
            throw new Error('Payment creation failed')
          }

          logger.info('✅ Запись о платеже создана:', {
            description: 'Payment record created',
            payment_id: payment.payment_id,
            telegram_id,
            amount,
            type,
          })

          return payment
        } catch (error) {
          logger.error('❌ Ошибка при создании платежа:', {
            description: 'Error creating payment',
            error: error instanceof Error ? error.message : 'Unknown error',
            telegram_id,
            amount,
            type,
          })
          return {
            success: false,
            error_message: is_ru
              ? 'Ошибка при создании платежа'
              : 'Error creating payment',
          }
        }
      })

      if (!paymentRecord || !('payment_id' in paymentRecord)) {
        logger.error('❌ Ошибка при создании платежа', {
          description: 'Error creating payment',
          telegram_id,
          amount,
          type,
        })
        return {
          success: false,
          current_balance: balanceResult.currentBalance,
          error_message: is_ru
            ? 'Ошибка при создании платежа'
            : 'Error creating payment',
        }
      }

      // Если платеж создан успешно, обновляем баланс
      if (paymentRecord.payment_id) {
        // ШАГ 5: Обновление баланса пользователя
        const updateResult = await step.run('update-balance', async () => {
          logger.info('💰 ШАГ 5: Обновление баланса', {
            description: 'Step 5: Updating balance',
            telegram_id,
            amount,
            type,
          })

          // Получаем текущий баланс
          const currentBalance = await getUserBalance(telegram_id, bot_name)

          // Проверяем достаточность средств для списания
          if (
            type === 'money_expense' &&
            currentBalance !== null &&
            currentBalance < Math.abs(amount)
          ) {
            const errorMessage = is_ru
              ? `❌ Недостаточно средств. Необходимо: ${Math.abs(
                  amount
                )}, доступно: ${currentBalance}`
              : `❌ Insufficient funds. Required: ${Math.abs(
                  amount
                )}, available: ${currentBalance}`

            logger.error('❌ Недостаточно средств:', {
              description: 'Insufficient funds',
              telegram_id,
              required: Math.abs(amount),
              available: currentBalance,
            })

            // Обновляем статус платежа на FAILED
            await supabase
              .from('payments_v2')
              .update({ status: 'FAILED' })
              .eq('payment_id', paymentRecord.payment_id)

            const errorResult: BalanceOperationResult = {
              newBalance: currentBalance || 0,
              success: false,
              error: errorMessage,
              modePrice: Math.abs(amount),
            }
            processedPayments.set(initResult.opId, errorResult)
            return errorResult
          }

          // Обновляем баланс
          const newBalance = await updateUserBalance({
            telegram_id,
            amount,
            type,
            operation_description: description,
            metadata,
            bot_name,
            payment_method: 'balance',
          })

          if (!newBalance.success || newBalance.newBalance === null) {
            logger.error('❌ Ошибка обновления баланса:', {
              description: 'Error updating balance',
              telegram_id,
              amount,
            })

            // Обновляем статус платежа на FAILED
            await supabase
              .from('payments_v2')
              .update({ status: 'FAILED' })
              .eq('payment_id', paymentRecord.payment_id)

            const errorResult: BalanceOperationResult = {
              newBalance: currentBalance || 0,
              success: false,
              error: is_ru
                ? 'Ошибка обновления баланса'
                : 'Error updating balance',
              modePrice: Math.abs(amount),
            }
            processedPayments.set(initResult.opId, errorResult)
            return errorResult
          }

          // Обновляем статус платежа на COMPLETED
          await supabase
            .from('payments_v2')
            .update({ status: 'COMPLETED' })
            .eq('payment_id', paymentRecord.payment_id)

          logger.info('✅ Баланс успешно обновлен:', {
            description: 'Balance updated successfully',
            telegram_id,
            newBalance: newBalance.newBalance,
            amount,
          })

          const successResult: BalanceOperationResult = {
            newBalance: newBalance.newBalance,
            success: true,
            error: undefined,
            modePrice: Math.abs(amount),
          }
          processedPayments.set(initResult.opId, successResult)
          return successResult
        })

        // Возвращаем результат операции
        if (
          !updateResult.success &&
          'error' in updateResult &&
          updateResult.error
        ) {
          logger.error('❌ Ошибка в процессе обновления баланса', {
            description: 'Error in balance update process',
            telegram_id,
            operation_id: initResult.opId,
          })
          return updateResult
        }

        // Очистка старых записей из кеша (каждые 100 операций)
        await step.run('cleanup-cache', async () => {
          if (processedPayments.size > 100) {
            logger.info('🧹 Очистка кеша устаревших операций', {
              description: 'Cleaning up old operations cache',
              cache_size_before: processedPayments.size,
            })

            // Получаем все ключи и сортируем их по времени (последняя часть ключа)
            const keys = Array.from(processedPayments.keys())
            const keysToRemove = keys
              .sort((a, b) => {
                const timeA = Number(a.split('-')[1]) || 0
                const timeB = Number(b.split('-')[1]) || 0
                return timeA - timeB
              })
              .slice(0, 50) // Удаляем самые старые 50 записей

            // Удаляем старые записи
            keysToRemove.forEach(key => {
              processedPayments.delete(key)
            })

            logger.info('✅ Кеш очищен', {
              description: 'Cache cleaned up',
              removed_count: keysToRemove.length,
              cache_size_after: processedPayments.size,
            })
          }
        })

        logger.info('✅ Операция с балансом успешно выполнена', {
          description: 'Balance operation successfully completed',
          telegram_id,
          operation_id: initResult.opId,
          newBalance: updateResult.newBalance,
        })

        return updateResult
      }
    } catch (error) {
      logger.error('❌ Общая ошибка в обработке платежа:', {
        description: 'General error in payment processing',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        event_data: event.data,
      })

      // Отправляем событие о неудачной обработке платежа
      await inngest.send({
        id: `payment-process-failed-${Date.now()}-${uuidv4()}`,
        name: 'payment/process.failed',
        data: {
          ...event.data,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      // Возвращаем информацию об ошибке
      return {
        newBalance: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        modePrice: Number(event.data.amount) || 0,
      }
    }
  }
)
