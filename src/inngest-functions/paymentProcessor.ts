import { inngest } from '@/core/inngest/clients'
import { BalanceOperationResult } from '@/interfaces'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Кеш для хранения информации об обработанных платежах, чтобы избежать дублирования
const processedPayments = new Map<string, BalanceOperationResult>();

// Добавим интерфейсы для возвращаемых типов функций
interface InitOperationResult {
  opId: string;
  cachedResult?: BalanceOperationResult;
  shouldContinue: boolean;
}

interface ValidationResult {
  isValid: boolean;
  errorResult?: BalanceOperationResult;
}

interface BalanceCheckResult {
  success: boolean;
  currentBalance?: number;
  errorResult?: BalanceOperationResult;
}

interface FundsCheckResult {
  sufficient: boolean;
  errorResult?: BalanceOperationResult;
}

/**
 * Безопасно отправляет сообщение через бота, учитывая разные структуры объекта бота
 */
async function safeSendMessage(bot: any, telegram_id: number, message: string): Promise<boolean> {
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
      hasTelegramSendMessage: typeof bot?.telegram?.sendMessage === 'function'
    });

    if (!bot) {
      logger.warn('⚠️ Бот не найден для отправки сообщения', {
        description: 'Bot not found for sending message',
        telegram_id
      });
      return false;
    }

    // Пробуем разные способы отправки сообщения в зависимости от структуры бота
    if (typeof bot.telegram?.sendMessage === 'function') {
      await bot.telegram.sendMessage(telegram_id, message);
      return true;
    } 
    
    if (typeof bot.sendMessage === 'function') {
      await bot.sendMessage(telegram_id, message);
      return true;
    }

    logger.warn('⚠️ Не найден метод для отправки сообщения', {
      description: 'No method found for sending message',
      telegram_id,
      botType: typeof bot
    });
    return false;
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения:', {
      description: 'Error sending message',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id
    });
    return false;
  }
}

/**
 * Функция Inngest для обработки платежей с шагами
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: `payment-processor`,
    idempotency: 'event.data.telegram_id + "-" + event.data.paymentAmount + "-" + event.data.operation_id',
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
        metadata
      } = event.data;

      // ШАГ 1: Инициализация операции и проверка кеша
      const initResult = await step.run('init-operation', async () => {
        // Создаем уникальный идентификатор операции
        const opId = operation_id || `${telegram_id}-${paymentAmount}-${new Date().getTime()}`;
        
        logger.info('🚀 ШАГ 1: Инициализация операции', {
          description: 'Step 1: Operation initialization',
          telegram_id,
          paymentAmount,
          operation_id: opId,
          bot_name
        });
        
        // Проверяем, не обрабатывали ли мы уже такую операцию
        if (processedPayments.has(opId)) {
          const cachedResult = processedPayments.get(opId);
          logger.info('🔄 Найден кеш операции, пропускаем обработку:', {
            description: 'Found cached operation, skipping processing',
            telegram_id,
            operation_id: opId,
            cached_result: cachedResult
          });
          return { opId, cachedResult, shouldContinue: false };
        }
        
        return { opId, shouldContinue: true };
      });

      // Если у нас есть кешированный результат, возвращаем его
      if (!initResult.shouldContinue && 'cachedResult' in initResult && initResult.cachedResult) {
        logger.info('🔄 Возвращаем кешированный результат', {
          description: 'Returning cached result',
          telegram_id,
          operation_id: initResult.opId
        });
        return initResult.cachedResult;
      }

      // ШАГ 2: Валидация входных данных
      const validationResult = await step.run('validate-input', async () => {
        logger.info('🧐 ШАГ 2: Валидация входных данных', {
          description: 'Step 2: Input data validation',
          telegram_id,
          payment_amount_type: typeof paymentAmount,
          payment_amount_value: paymentAmount
        });
        
        // Проверка telegram_id
        if (!telegram_id) {
          logger.error('❌ Отсутствует telegram_id:', {
            description: 'Missing telegram_id',
            telegram_id
          });
          
          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'telegram_id is required',
            modePrice: paymentAmount,
          };
          processedPayments.set(initResult.opId, errorResult);
          return { isValid: false, errorResult };
        }
        
        // Проверка суммы платежа
        if (paymentAmount === undefined || paymentAmount === null || isNaN(Number(paymentAmount))) {
          logger.error('❌ Неверная сумма платежа:', {
            description: 'Invalid payment amount',
            paymentAmount,
            payment_amount_type: typeof paymentAmount,
            telegram_id
          });
          
          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'Payment amount is invalid',
            modePrice: paymentAmount || 0,
          };
          processedPayments.set(initResult.opId, errorResult);
          return { isValid: false, errorResult };
        }
        
        logger.info('✅ Входные данные валидны', {
          description: 'Input data is valid',
          telegram_id,
          paymentAmount
        });
        
        return { isValid: true };
      });

      if (!validationResult.isValid && 'errorResult' in validationResult && validationResult.errorResult) {
        logger.error('❌ Валидация не пройдена', {
          description: 'Validation failed',
          telegram_id,
          operation_id: initResult.opId
        });
        return validationResult.errorResult;
      }

      // ШАГ 3: Получение и проверка баланса пользователя
      const balanceResult = await step.run('check-balance', async () => {
        logger.info('💳 ШАГ 3: Получение баланса пользователя', {
          description: 'Step 3: Getting user balance',
          telegram_id
        });
        
        // Получаем текущий баланс
        const currentBalance = await getUserBalance(telegram_id);
        
        // Подробное логирование полученного баланса
        logger.info('💰 Получен баланс пользователя:', {
          description: 'Retrieved user balance',
          telegram_id,
          currentBalance,
          currentBalance_type: typeof currentBalance,
          isNull: currentBalance === null,
          isUndefined: currentBalance === undefined,
          isNaN: isNaN(Number(currentBalance))
        });
        
        // Проверка корректности баланса
        if (currentBalance === undefined || currentBalance === null || isNaN(Number(currentBalance))) {
          logger.error('❌ Получен некорректный баланс:', {
            description: 'Invalid balance received',
            currentBalance,
            telegram_id
          });
          
          // Отправляем сообщение об ошибке
          const errorMessage = is_ru
            ? 'Произошла ошибка при проверке баланса. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
            : 'An error occurred while checking your balance. Please try again later or contact support.';
          
          if (bot) {
            await safeSendMessage(bot, telegram_id, errorMessage);
          }
          
          const errorResult = {
            newBalance: 0,
            success: false,
            error: 'Invalid balance',
            modePrice: paymentAmount,
          };
          processedPayments.set(initResult.opId, errorResult);
          return { success: false, errorResult };
        }
        
        // Преобразуем баланс в число для надежности
        const safeCurrentBalance = Number(currentBalance);
        
        logger.info('✅ Баланс успешно получен и преобразован:', {
          description: 'Balance successfully retrieved and converted',
          telegram_id,
          originalBalance: currentBalance,
          safeCurrentBalance,
          safeCurrentBalance_type: typeof safeCurrentBalance
        });
        
        return { success: true, currentBalance: safeCurrentBalance };
      });

      if (!balanceResult.success && 'errorResult' in balanceResult && balanceResult.errorResult) {
        logger.error('❌ Проверка баланса не пройдена', {
          description: 'Balance check failed',
          telegram_id,
          operation_id: initResult.opId
        });
        return balanceResult.errorResult;
      }

      // Используем защитное программирование для доступа к currentBalance
      const currentBalance = balanceResult.success && 'currentBalance' in balanceResult ? 
        balanceResult.currentBalance : 0;

      // ШАГ 4: Проверка достаточности средств
      const fundsResult = await step.run('check-funds', async () => {
        logger.info('🧮 ШАГ 4: Проверка достаточности средств', {
          description: 'Step 4: Checking sufficient funds',
          telegram_id,
          currentBalance: currentBalance,
          requiredAmount: paymentAmount
        });
        
        // Проверяем достаточно ли средств
        if (currentBalance < Number(paymentAmount)) {
          const message = is_ru
            ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
            : 'Insufficient funds. Top up your balance by calling the /buy command.';
          
          // Отправляем сообщение
          if (bot) {
            await safeSendMessage(bot, telegram_id, message);
          }
          
          logger.info('💸 Недостаточно средств:', {
            description: 'Insufficient funds',
            telegram_id,
            currentBalance: currentBalance,
            requiredAmount: paymentAmount
          });
          
          const errorResult = {
            newBalance: currentBalance,
            success: false,
            error: message,
            modePrice: paymentAmount,
          };
          processedPayments.set(initResult.opId, errorResult);
          return { sufficient: false, errorResult };
        }
        
        logger.info('✅ Средств достаточно для выполнения операции', {
          description: 'Sufficient funds for operation',
          telegram_id,
          currentBalance: currentBalance,
          requiredAmount: paymentAmount,
          remaining: currentBalance - Number(paymentAmount)
        });
        
        return { sufficient: true };
      });

      if (!fundsResult.sufficient && 'errorResult' in fundsResult && fundsResult.errorResult) {
        logger.error('❌ Недостаточно средств', {
          description: 'Insufficient funds',
          telegram_id,
          operation_id: initResult.opId
        });
        return fundsResult.errorResult;
      }

      // ШАГ 5: Расчет нового баланса
      const balanceData = await step.run('calculate-balance', async () => {
        logger.info('🧮 ШАГ 5: Расчет нового баланса', {
          description: 'Step 5: Calculating new balance',
          telegram_id,
          currentBalance: currentBalance,
          paymentAmount
        });
        
        // Рассчитываем новый баланс
        const paymentAmountNumber = Number(paymentAmount);
        const newBalance = parseFloat((currentBalance - paymentAmountNumber).toFixed(2));
        
        logger.info('✅ Новый баланс рассчитан:', {
          description: 'New balance calculated',
          telegram_id,
          currentBalance: currentBalance,
          paymentAmount: paymentAmountNumber,
          newBalance,
          newBalance_type: typeof newBalance
        });
        
        return { newBalance, paymentAmountNumber };
      });

      // ШАГ 6: Обновление баланса в базе данных
      const updateResult = await step.run('update-balance', async () => {
        logger.info('💾 ШАГ 6: Обновление баланса в БД', {
          description: 'Step 6: Updating balance in database',
          telegram_id,
          currentBalance: currentBalance,
          newBalance: balanceData.newBalance,
          paymentAmount: balanceData.paymentAmountNumber
        });
        
        try {
          // Определяем тип сервиса на основе описания или метаданных
          let serviceType = 'System';
          
          // Пытаемся определить тип сервиса по описанию
          if (description) {
            const descLower = description.toLowerCase();
            if (descLower.includes('image') || descLower.includes('photo') || descLower.includes('картин')) {
              serviceType = 'NeuroPhoto';
            } else if (descLower.includes('video')) {
              serviceType = 'Image to video';
            } else if (descLower.includes('voice') || descLower.includes('speech') || descLower.includes('голос')) {
              serviceType = 'Text to speech';
            } else if (descLower.includes('train') || descLower.includes('модел')) {
              serviceType = 'Training';
            } else if (descLower.includes('refund') || descLower.includes('возврат')) {
              serviceType = 'Refund';
            }
          }
          
          // Если есть явно указанный тип в метаданных, используем его
          if (metadata?.service_type) {
            serviceType = metadata.service_type;
          }
          
          // Детализированное логирование перед обновлением
          logger.info('📊 Параметры перед вызовом updateUserBalance:', {
            description: 'Parameters before calling updateUserBalance',
            telegram_id,
            telegram_id_type: typeof telegram_id,
            telegram_id_as_string: String(telegram_id),
            newBalance: balanceData.newBalance,
            newBalance_type: typeof balanceData.newBalance,
            paymentAmount: balanceData.paymentAmountNumber,
            paymentAmount_type: typeof balanceData.paymentAmountNumber,
            operation_type: 'outcome',
            payment_description: description || 'Payment for service',
            payment_bot_name: bot_name || 'system',
            service_type: serviceType
          });
          
          // Обновляем баланс в БД
          const updateResult = await updateUserBalance(
            String(telegram_id),
            balanceData.newBalance,
            balanceData.paymentAmountNumber,
            'outcome',
            description || 'Payment for service',
            {
              bot_name: bot_name || 'system',
              language: is_ru ? 'ru' : 'en',
              payment_method: serviceType
            }
          );
          
          logger.info('📝 Результат обновления баланса:', {
            description: 'Balance update result',
            updateResult,
            telegram_id
          });

          if (!updateResult) {
            logger.error('❌ Не удалось обновить баланс в БД:', {
              description: 'Failed to update balance in DB',
              telegram_id,
              currentBalance: currentBalance,
              newBalance: balanceData.newBalance
            });
            
            const errorResult = {
              newBalance: currentBalance,
              success: false,
              error: 'Database error while updating balance',
              modePrice: balanceData.paymentAmountNumber,
              prevBalance: currentBalance,
            };
            processedPayments.set(initResult.opId, errorResult);
            return { success: false, result: errorResult };
          }

          logger.info('✅ Баланс успешно обновлен:', {
            description: 'Balance successfully updated',
            telegram_id,
            oldBalance: currentBalance,
            newBalance: balanceData.newBalance,
            difference: balanceData.paymentAmountNumber
          });

          // Сохраняем результат в кеш для предотвращения дублирования
          const successResult = {
            newBalance: balanceData.newBalance,
            success: true,
            modePrice: balanceData.paymentAmountNumber,
            prevBalance: currentBalance,
          };
          processedPayments.set(initResult.opId, successResult);
          
          return { success: true, result: successResult };
        } catch (dbError) {
          logger.error('❌ Ошибка при обновлении баланса в БД:', {
            description: 'Error updating balance in DB',
            error: dbError instanceof Error ? dbError.message : 'Unknown error',
            stack: dbError instanceof Error ? dbError.stack : undefined,
            telegram_id,
            currentBalance: currentBalance,
            newBalance: balanceData.newBalance
          });
          
          const errorResult = {
            newBalance: currentBalance,
            success: false,
            error: 'Database error while updating balance',
            modePrice: balanceData.paymentAmountNumber,
          };
          processedPayments.set(initResult.opId, errorResult);
          return { success: false, result: errorResult };
        }
      });

      // ШАГ 7: Очистка кеша если нужно
      await step.run('cleanup-cache', async () => {
        logger.info('🧹 ШАГ 7: Очистка кеша если нужно', {
          description: 'Step 7: Cleanup cache if needed',
          cacheSize: processedPayments.size
        });
        
        // Кеш не должен расти бесконечно, удаляем старые записи
        if (processedPayments.size > 1000) {
          const keysToDelete = Array.from(processedPayments.keys()).slice(0, 200);
          logger.info('🗑️ Удаление старых записей из кеша:', {
            description: 'Deleting old records from cache',
            numberOfRecordsToDelete: keysToDelete.length
          });
          
          keysToDelete.forEach(key => processedPayments.delete(key));
          
          logger.info('✅ Кеш очищен:', {
            description: 'Cache cleaned',
            newCacheSize: processedPayments.size
          });
        } else {
          logger.info('✅ Очистка кеша не требуется', {
            description: 'Cache cleanup not required',
            cacheSize: processedPayments.size
          });
        }
      });

      logger.info('🟢 Завершение процесса обработки платежа', {
        description: 'Payment processing completed',
        telegram_id,
        operation_id: initResult.opId,
        success: updateResult.success
      });
      
      // Отправляем успешный результат
      return updateResult.result;
    } catch (error) {
      logger.error('❌ Непредвиденная ошибка в функции processPayment:', {
        description: 'Unexpected error in processPayment function',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Отправляем событие об ошибке
      await inngest.send({
        name: 'payment/process.failed',
        data: {
          ...event.data,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }
); 