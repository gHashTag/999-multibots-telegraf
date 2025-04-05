import { inngest } from '@/core/inngest/clients'
import { BalanceOperationResult } from '@/interfaces'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'
import { Telegraf, Context } from 'telegraf'

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
        amount: paymentAmount,
        is_ru = false,
        bot_name,
        description,
        operation_id,
        bot,
        metadata = {},
        type = 'outcome',
        payment_type = 'regular',
        currency = 'STARS',
        money_amount,
      } = event.data

      // ШАГ 1: Инициализация операции и проверка кеша
      const initResult = await step.run('init-operation', async () => {
        // Создаем уникальный идентификатор операции
        const opId =
          operation_id ||
          `${telegram_id}-${paymentAmount}-${new Date().getTime()}`

        logger.info('🚀 ШАГ 1: Инициализация операции', {
          description: 'Step 1: Operation initialization',
          telegram_id,
          paymentAmount,
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
          payment_amount_type: typeof paymentAmount,
          payment_amount_value: paymentAmount,
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
            modePrice: paymentAmount,
          }
          processedPayments.set(initResult.opId, errorResult)
          return { isValid: false, errorResult }
        }

        // Проверка суммы платежа
        if (
          paymentAmount === undefined ||
          paymentAmount === null ||
          isNaN(Number(paymentAmount))
        ) {
          logger.error('❌ Неверная сумма платежа:', {
            description: 'Invalid payment amount',
            paymentAmount,
            payment_amount_type: typeof paymentAmount,
            telegram_id,
          })

          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'Payment amount is invalid',
            modePrice: paymentAmount || 0,
          }
          processedPayments.set(initResult.opId, errorResult)
          return { isValid: false, errorResult }
        }

        logger.info('✅ Входные данные валидны', {
          description: 'Input data is valid',
          telegram_id,
          paymentAmount,
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
            modePrice: paymentAmount,
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

      // ШАГ 4: Создание записи о платеже и обновление баланса
      const updateResult = await step.run('update-balance', async () => {
        logger.info('💾 ШАГ 4: Обновление баланса в БД', {
          description: 'Step 4: Updating balance in database',
          telegram_id,
          paymentAmount,
          operation_type: type,
        })

        try {
          // Определяем тип сервиса на основе описания или метаданных
          let serviceType = metadata?.service_type || 'System'

          // Если сервис не указан в метаданных, пытаемся определить по описанию
          if (!metadata?.service_type && description) {
            const descLower = description.toLowerCase()

            if (descLower.includes('refund')) {
              serviceType = 'Refund'
            } else if (
              descLower.includes('migration') ||
              descLower.includes('bonus')
            ) {
              serviceType = 'System'
            } else {
              // Проверяем все возможные моды
              const modeValues = Object.values(ModeEnum)
              for (const mode of modeValues) {
                if (descLower.includes(mode.replace(/_/g, ' '))) {
                  serviceType = mode
                  break
                }
              }
            }
          }

          logger.info('🛎️ Определен тип сервиса', {
            description: 'Service type determined',
            telegram_id,
            serviceType,
            originalDescription: description,
          })

          // Вызываем функцию обновления баланса
          const result = await updateUserBalance({
            telegram_id,
            amount: paymentAmount,
            type,
            operation_description:
              description || `${type} operation via payment/process`,
            metadata: {
              ...metadata,
              operation_id: initResult.opId,
              service_type: serviceType,
              payment_type,
              currency,
              money_amount,
            },
            bot_name,
            payment_method: serviceType,
          })

          logger.info('💰 Результат обновления баланса:', {
            description: 'Balance update result',
            telegram_id,
            success: result.success,
            newBalance: result.newBalance,
            operation_id: initResult.opId,
          })

          if (!result.success) {
            logger.error('❌ Ошибка при обновлении баланса:', {
              description: 'Balance update failed',
              telegram_id,
              error: 'Failed to update balance',
            })

            const errorResult = {
              newBalance: result.newBalance || 0,
              success: false,
              error: 'Failed to update balance',
              modePrice: paymentAmount,
            }
            processedPayments.set(initResult.opId, errorResult)
            return { updateSuccess: false, errorResult }
          }

          // Отправляем сообщение об успешной операции, если это не внутренняя системная операция
          const shouldNotifyUser = !description?.includes('internal') && bot

          if (shouldNotifyUser) {
            const successMessage = is_ru
              ? `✅ Операция выполнена успешно!\n${
                  type === 'income' ? 'Пополнение' : 'Списание'
                }: ${Math.abs(paymentAmount).toFixed(2)} ⭐️\nВаш баланс: ${
                  result.newBalance
                } ⭐️`
              : `✅ Operation completed successfully!\n${
                  type === 'income' ? 'Added' : 'Charged'
                }: ${Math.abs(paymentAmount).toFixed(2)} ⭐️\nYour balance: ${
                  result.newBalance
                } ⭐️`

            try {
              await safeSendMessage(bot, telegram_id, successMessage)
            } catch (notifyError) {
              logger.warn('⚠️ Не удалось отправить уведомление:', {
                description: 'Failed to send notification',
                telegram_id,
                error:
                  notifyError instanceof Error
                    ? notifyError.message
                    : 'Unknown error',
              })
            }
          }

          // Сохраняем результат в кеш
          const successResult = {
            newBalance: result.newBalance || 0,
            success: true,
            modePrice: paymentAmount,
          }
          processedPayments.set(initResult.opId, successResult)

          return {
            updateSuccess: true,
            result: successResult,
            finalBalance: result.newBalance,
          }
        } catch (updateError) {
          logger.error('❌ Исключение при обновлении баланса:', {
            description: 'Exception during balance update',
            telegram_id,
            error:
              updateError instanceof Error
                ? updateError.message
                : 'Unknown error',
            stack: updateError instanceof Error ? updateError.stack : undefined,
          })

          const errorResult = {
            newBalance: 0,
            success: false,
            error:
              updateError instanceof Error
                ? updateError.message
                : 'Unknown error',
            modePrice: paymentAmount,
          }
          processedPayments.set(initResult.opId, errorResult)
          return { updateSuccess: false, errorResult }
        }
      })

      // Возвращаем результат операции
      if (
        !updateResult.updateSuccess &&
        'errorResult' in updateResult &&
        updateResult.errorResult
      ) {
        logger.error('❌ Ошибка в процессе обновления баланса', {
          description: 'Error in balance update process',
          telegram_id,
          operation_id: initResult.opId,
        })
        return updateResult.errorResult
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
        newBalance:
          'finalBalance' in updateResult ? updateResult.finalBalance : 0,
      })

      // Проверяем наличие result в объекте updateResult
      if ('result' in updateResult && updateResult.result) {
        return updateResult.result
      }

      // Если по какой-то причине result отсутствует, возвращаем запасной объект
      return {
        newBalance:
          'finalBalance' in updateResult ? updateResult.finalBalance : 0,
        success: true,
        modePrice: Number(paymentAmount) || 0,
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
        modePrice: Number(event.data.paymentAmount) || 0,
      }
    }
  }
)
