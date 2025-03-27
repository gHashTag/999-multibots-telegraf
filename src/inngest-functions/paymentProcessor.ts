import { inngest } from '@/core/inngest/clients'
import { BalanceOperationResult, PaymentService } from '@/interfaces'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Кеш для хранения информации об обработанных платежах, чтобы избежать дублирования
const processedPayments = new Map<string, BalanceOperationResult>()

/**
 * Безопасно отправляет сообщение через бота, учитывая разные структуры объекта бота
 */
async function safeSendMessage(
  bot: any,
  telegram_id: number,
  message: string
): Promise<boolean> {
  try {
    // Логирование структуры бота для диагностики
    logger.debug('🤖 Структура объекта бота:', {
      description: 'Bot object structure',
      hasBot: !!bot,
      hasContext: !!bot?.context,
      hasTelegram: !!bot?.telegram,
      telegramType: typeof bot?.telegram,
      hasOptions: !!bot?.options,
      hasSendMessage: typeof bot?.sendMessage === 'function',
      hasTelegramSendMessage: typeof bot?.telegram?.sendMessage === 'function',
    })

    if (!bot) {
      logger.warn('⚠️ Бот не найден для отправки сообщения', {
        description: 'Bot not found for sending message',
        telegram_id,
      })
      return false
    }

    // Пробуем разные способы отправки сообщения в зависимости от структуры бота
    if (typeof bot.telegram?.sendMessage === 'function') {
      await bot.telegram.sendMessage(telegram_id, message)
      return true
    }

    if (typeof bot.sendMessage === 'function') {
      await bot.sendMessage(telegram_id, message)
      return true
    }

    logger.warn('⚠️ Не найден метод для отправки сообщения', {
      description: 'No method found for sending message',
      telegram_id,
      botType: typeof bot,
    })
    return false
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения:', {
      description: 'Error sending message',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
    })
    return false
  }
}

/**
 * Функция Inngest для обработки платежей с шагами
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: `payment-processor`,
    idempotency:
      'event.data.telegram_id + "-" + event.data.paymentAmount + "-" + event.data.operation_id',
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event, step }) => {
    try {
      const {
        telegram_id,
        paymentAmount,
        is_ru = false,
        bot_name,
        description,
        operation_id,
        bot,
        metadata = {},
        type = 'outcome', // По умолчанию outcome, если не указано иное
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

      // ШАГ 4: Если это списание (outcome), проверяем достаточность средств
      let fundsResult: {
        hasSufficientFunds: boolean
        currentBalance?: number
        paymentAmountNumber?: number
        errorResult?: {
          newBalance: number
          success: boolean
          error: string
          modePrice: number
        }
      } = { hasSufficientFunds: true }

      if (type === 'outcome') {
        fundsResult = await step.run('check-funds', async () => {
          logger.info('💵 ШАГ 4: Проверка достаточности средств', {
            description: 'Step 4: Checking sufficient funds',
            telegram_id,
            paymentAmount: Number(paymentAmount),
            currentBalance: balanceResult.currentBalance,
          })

          const paymentAmountNumber = Number(paymentAmount)
          const currentBalance = balanceResult.currentBalance

          // Проверяем, достаточно ли средств для списания
          if (currentBalance < paymentAmountNumber) {
            logger.error('❌ Недостаточно средств на балансе:', {
              description: 'Insufficient funds',
              telegram_id,
              currentBalance,
              requiredAmount: paymentAmountNumber,
              difference: paymentAmountNumber - currentBalance,
            })

            // Отправляем сообщение о недостатке средств
            const errorMessage = is_ru
              ? `❌ Недостаточно средств. Требуется: ${paymentAmountNumber.toFixed(
                  2
                )} ⭐️, на вашем балансе: ${currentBalance.toFixed(2)} ⭐️`
              : `❌ Insufficient funds. Required: ${paymentAmountNumber.toFixed(
                  2
                )} ⭐️, your balance: ${currentBalance.toFixed(2)} ⭐️`

            if (bot) {
              await safeSendMessage(bot, telegram_id, errorMessage)
            }

            const errorResult = {
              newBalance: currentBalance,
              success: false,
              error: 'Insufficient funds',
              modePrice: paymentAmountNumber,
            }
            processedPayments.set(initResult.opId, errorResult)
            return { hasSufficientFunds: false, errorResult }
          }

          logger.info('✅ Достаточно средств на балансе', {
            description: 'Sufficient funds available',
            telegram_id,
            currentBalance,
            paymentAmount: paymentAmountNumber,
            remainingBalance: (currentBalance - paymentAmountNumber).toFixed(2),
          })

          return {
            hasSufficientFunds: true,
            currentBalance,
            paymentAmountNumber,
          }
        })

        if (
          !fundsResult.hasSufficientFunds &&
          'errorResult' in fundsResult &&
          fundsResult.errorResult
        ) {
          logger.error('❌ Недостаточно средств для операции', {
            description: 'Insufficient funds for operation',
            telegram_id,
            operation_id: initResult.opId,
          })
          return fundsResult.errorResult
        }
      }

      // ШАГ 5: Расчет нового баланса (в зависимости от типа операции)
      const balanceData = await step.run('calculate-balance', async () => {
        logger.info('🧮 ШАГ 5: Расчет нового баланса', {
          description: 'Step 5: Calculating new balance',
          telegram_id,
          currentBalance: balanceResult.currentBalance,
          paymentAmount: Number(paymentAmount),
          operationType: type,
        })

        const paymentAmountNumber = Number(paymentAmount)
        const currentBalance = balanceResult.currentBalance

        // Рассчитываем новый баланс в зависимости от типа операции
        let newBalance
        if (type === 'income') {
          newBalance = currentBalance + paymentAmountNumber
        } else {
          newBalance = currentBalance - paymentAmountNumber
        }

        // Округляем до 2 знаков после запятой
        newBalance = parseFloat(newBalance.toFixed(2))

        // Проверяем, что баланс не стал отрицательным
        if (newBalance < 0) {
          logger.warn('⚠️ Расчетный баланс отрицательный, корректируем до 0', {
            description: 'Calculated balance is negative, adjusting to 0',
            telegram_id,
            initialBalance: currentBalance,
            calculatedBalance: newBalance,
            correctedBalance: 0,
          })
          newBalance = 0
        }

        return {
          newBalance,
          currentBalance,
          paymentAmountNumber,
          operation_type: type,
        }
      })

      // ШАГ 6: Обновление баланса в базе данных
      const updateResult = await step.run('update-balance', async () => {
        logger.info('💾 ШАГ 6: Обновление баланса в БД', {
          description: 'Step 6: Updating balance in database',
          telegram_id,
          currentBalance: balanceData.currentBalance,
          newBalance: balanceData.newBalance,
          paymentAmount: balanceData.paymentAmountNumber,
          operation_type: balanceData.operation_type,
        })

        try {
          // Определяем тип сервиса на основе описания или метаданных
          let serviceType = 'System'

          // Пытаемся определить тип сервиса по описанию
          if (description) {
            const descLower = description.toLowerCase()
            if (
              descLower.includes('image') ||
              descLower.includes('photo') ||
              descLower.includes('картин')
            ) {
              serviceType = 'NeuroPhoto'
            } else if (
              descLower.includes('speech') ||
              descLower.includes('голос')
            ) {
              serviceType = 'Text to speech'
            } else if (
              descLower.includes('training') ||
              descLower.includes('обучени')
            ) {
              serviceType = 'Training'
            } else if (descLower.includes('refund')) {
              serviceType = 'Refund'
            }
          }

          // Если сервис не удалось определить по описанию, проверяем метаданные
          if (
            serviceType === 'System' &&
            metadata &&
            typeof metadata === 'object' &&
            'service_type' in metadata
          ) {
            serviceType = metadata.service_type as PaymentService
          }

          logger.info('🛎️ Определен тип сервиса', {
            description: 'Service type determined',
            telegram_id,
            serviceType,
            originalDescription: description,
          })

          // Создаем объединенные метаданные
          const combinedMetadata = {
            ...metadata,
            operation_id: initResult.opId,
            service_type: serviceType,
          }

          // Вызываем функцию обновления баланса
          const result = await updateUserBalance({
            telegram_id,
            amount: balanceData.paymentAmountNumber,
            type: balanceData.operation_type,
            operation_description:
              description ||
              `${balanceData.operation_type} operation via payment/process`,
            metadata: combinedMetadata,
            bot_name,
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
              newBalance: balanceData.currentBalance,
              success: false,
              error: 'Failed to update balance',
              modePrice: balanceData.paymentAmountNumber,
            }
            processedPayments.set(initResult.opId, errorResult)
            return { updateSuccess: false, errorResult }
          }

          // Отправляем сообщение об успешной операции, если это не внутренняя системная операция
          const shouldNotifyUser = !description?.includes('internal') && bot

          if (shouldNotifyUser) {
            const successMessage = is_ru
              ? `✅ Операция выполнена успешно!\n${
                  balanceData.operation_type === 'income'
                    ? 'Пополнение'
                    : 'Списание'
                }: ${balanceData.paymentAmountNumber.toFixed(
                  2
                )} ⭐️\nВаш баланс: ${result.newBalance} ⭐️`
              : `✅ Operation completed successfully!\n${
                  balanceData.operation_type === 'income' ? 'Added' : 'Charged'
                }: ${balanceData.paymentAmountNumber.toFixed(
                  2
                )} ⭐️\nYour balance: ${result.newBalance} ⭐️`

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
            newBalance: result.newBalance,
            success: true,
            modePrice: balanceData.paymentAmountNumber,
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
            newBalance: balanceData.currentBalance,
            success: false,
            error:
              updateError instanceof Error
                ? updateError.message
                : 'Unknown error',
            modePrice: balanceData.paymentAmountNumber,
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
