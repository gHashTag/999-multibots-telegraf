/**
 * DEPRECATED: Этот файл устарел и будет удален в будущем.
 * Функционал перенесен в src/inngest-functions/paymentProcessor.ts
 * 
 * Пожалуйста, используйте processPaymentFunction через отправку события payment/process:
 * 
 * await inngest.send({
 *   name: 'payment/process',
 *   data: {
 *     telegram_id: user.telegram_id,
 *     paymentAmount: amount,
 *     is_ru: user.is_ru,
 *     bot_name: user.bot_name,
 *     description: 'Payment description',
 *     operation_id: uniqueId
 *   }
 * });
 * 
 * Этот файл оставлен временно для обратной совместимости.
 */

import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

// Кеш для хранения информации об обработанных платежах, чтобы избежать дублирования
const processedPayments = new Map<string, BalanceOperationResult>();

type BalanceOperationProps = {
  ctx?: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
  bot_name?: string
  description?: string
  bot?: any
  // Уникальный идентификатор операции для предотвращения дублирования
  operation_id?: string
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

    if (bot.telegram && typeof bot.telegram === 'object') {
      // Если telegram - объект, но не имеет sendMessage, попробуем получить экземпляр бота
      logger.info('🔍 Проверка telegram объекта:', {
        description: 'Checking telegram object structure',
        properties: Object.keys(bot.telegram)
      });
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

// ШАГ 1: Инициализация операции и проверка кеша
async function initOperation(props: BalanceOperationProps): Promise<{ 
  opId: string; 
  cachedResult?: BalanceOperationResult;
  shouldContinue: boolean;
}> {
  const { telegram_id, paymentAmount, bot_name, operation_id } = props;
  
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
}

// ШАГ 2: Валидация входных данных
function validateInputData(props: BalanceOperationProps, opId: string): {
  isValid: boolean;
  errorResult?: BalanceOperationResult;
} {
  const { telegram_id, paymentAmount } = props;
  
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
    processedPayments.set(opId, errorResult);
    return { isValid: false, errorResult };
  }
  
  // Проверка суммы платежа
  if (paymentAmount === undefined || paymentAmount === null || isNaN(paymentAmount)) {
    logger.error('❌ Неверная сумма платежа:', {
      description: 'Invalid payment amount',
      paymentAmount,
      paymentAmount_type: typeof paymentAmount,
      telegram_id
    });
    
    const errorResult = {
      newBalance: 0,
      success: false,
      error: 'Payment amount is invalid',
      modePrice: paymentAmount || 0,
    };
    processedPayments.set(opId, errorResult);
    return { isValid: false, errorResult };
  }
  
  logger.info('✅ Входные данные валидны', {
    description: 'Input data is valid',
    telegram_id,
    paymentAmount
  });
  
  return { isValid: true };
}

// ШАГ 3: Получение и проверка баланса пользователя
async function checkUserBalance(props: BalanceOperationProps, opId: string): Promise<{
  success: boolean;
  currentBalance?: number;
  errorResult?: BalanceOperationResult;
}> {
  const { telegram_id, is_ru, ctx, bot } = props;
  
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
    
    let messageSent = false;
    
    if (ctx) {
      try {
        await ctx.telegram.sendMessage(telegram_id, errorMessage);
        messageSent = true;
      } catch (ctxError) {
        logger.error('❌ Ошибка при отправке сообщения об ошибке баланса:', {
          description: 'Error sending balance error message',
          error: ctxError instanceof Error ? ctxError.message : 'Unknown error',
          telegram_id
        });
      }
    }
    
    if (!messageSent && bot) {
      messageSent = await safeSendMessage(bot, telegram_id, errorMessage);
    }
    
    const errorResult = {
      newBalance: 0,
      success: false,
      error: 'Invalid balance',
      modePrice: props.paymentAmount,
    };
    processedPayments.set(opId, errorResult);
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
}

// ШАГ 4: Проверка достаточности средств
async function checkSufficientFunds(props: BalanceOperationProps, currentBalance: number, opId: string): Promise<{
  sufficient: boolean;
  errorResult?: BalanceOperationResult;
}> {
  const { telegram_id, paymentAmount, is_ru, ctx, bot } = props;
  
  logger.info('🧮 ШАГ 4: Проверка достаточности средств', {
    description: 'Step 4: Checking sufficient funds',
    telegram_id,
    currentBalance,
    requiredAmount: paymentAmount
  });
  
  // Проверяем достаточно ли средств
  if (currentBalance < paymentAmount) {
    const message = is_ru
      ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
      : 'Insufficient funds. Top up your balance by calling the /buy command.';
    
    // Используем контекст или переданный бот для отправки сообщения
    let messageSent = false;
    
    if (ctx) {
      try {
        await ctx.telegram.sendMessage(telegram_id, message);
        messageSent = true;
      } catch (ctxError) {
        logger.error('❌ Ошибка при отправке сообщения через ctx:', {
          description: 'Error sending message via ctx',
          error: ctxError instanceof Error ? ctxError.message : 'Unknown error',
          telegram_id
        });
      }
    }
    
    if (!messageSent && bot) {
      messageSent = await safeSendMessage(bot, telegram_id, message);
    }
    
    if (!messageSent) {
      logger.warn('⚠️ Сообщение о недостатке средств не отправлено:', {
        description: 'Insufficient funds message not sent',
        telegram_id,
        currentBalance,
        requiredAmount: paymentAmount
      });
    }
    
    logger.info('💸 Недостаточно средств:', {
      description: 'Insufficient funds',
      telegram_id,
      currentBalance,
      requiredAmount: paymentAmount,
      messageSent
    });
    
    const errorResult = {
      newBalance: currentBalance,
      success: false,
      error: message,
      modePrice: paymentAmount,
    };
    processedPayments.set(opId, errorResult);
    return { sufficient: false, errorResult };
  }
  
  logger.info('✅ Средств достаточно для выполнения операции', {
    description: 'Sufficient funds for operation',
    telegram_id,
    currentBalance,
    requiredAmount: paymentAmount,
    remaining: currentBalance - paymentAmount
  });
  
  return { sufficient: true };
}

// ШАГ 5: Расчет нового баланса
function calculateNewBalance(currentBalance: number, paymentAmount: number, telegram_id: number): {
  newBalance: number;
  paymentAmountNumber: number;
} {
  logger.info('🧮 ШАГ 5: Расчет нового баланса', {
    description: 'Step 5: Calculating new balance',
    telegram_id,
    currentBalance,
    paymentAmount
  });
  
  // Рассчитываем новый баланс
  const paymentAmountNumber = Number(paymentAmount);
  const newBalance = parseFloat((currentBalance - paymentAmountNumber).toFixed(2));
  
  logger.info('✅ Новый баланс рассчитан:', {
    description: 'New balance calculated',
    telegram_id,
    currentBalance,
    paymentAmount: paymentAmountNumber,
    newBalance,
    newBalance_type: typeof newBalance
  });
  
  return { newBalance, paymentAmountNumber };
}

// ШАГ 6: Обновление баланса в базе данных
async function updateBalanceInDB(props: BalanceOperationProps, balanceData: {
  currentBalance: number;
  newBalance: number;
  paymentAmountNumber: number;
}, opId: string): Promise<{
  success: boolean;
  result: BalanceOperationResult;
}> {
  const { telegram_id, is_ru, bot_name, description } = props;
  
  logger.info('💾 ШАГ 6: Обновление баланса в БД', {
    description: 'Step 6: Updating balance in database',
    telegram_id,
    currentBalance: balanceData.currentBalance,
    newBalance: balanceData.newBalance,
    paymentAmount: balanceData.paymentAmountNumber
  });
  
  try {
    // Детализированное логирование перед обновлением
    logger.info('📊 Параметры перед вызовом updateUserBalance:', {
      description: 'Parameters before calling updateUserBalance',
      telegram_id,
      telegram_id_type: typeof telegram_id,
      telegram_id_as_string: telegram_id.toString(),
      newBalance: balanceData.newBalance,
      newBalance_type: typeof balanceData.newBalance,
      paymentAmount: balanceData.paymentAmountNumber,
      paymentAmount_type: typeof balanceData.paymentAmountNumber,
      operation_type: 'outcome',
      payment_description: description || 'Payment for service',
      payment_bot_name: bot_name || 'system'
    });
    
    // Обновляем баланс в БД
    const updateResult = await updateUserBalance(
      telegram_id.toString(),
      balanceData.newBalance,
      balanceData.paymentAmountNumber,
      'outcome',
      description || 'Payment for service',
      {
        bot_name: bot_name || 'system',
        language: is_ru ? 'ru' : 'en'
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
        currentBalance: balanceData.currentBalance,
        newBalance: balanceData.newBalance
      });
      
      const errorResult = {
        newBalance: balanceData.currentBalance,
        success: false,
        error: 'Database error while updating balance',
        modePrice: balanceData.paymentAmountNumber,
        prevBalance: balanceData.currentBalance,
      };
      processedPayments.set(opId, errorResult);
      return { success: false, result: errorResult };
    }

    logger.info('✅ Баланс успешно обновлен:', {
      description: 'Balance successfully updated',
      telegram_id,
      oldBalance: balanceData.currentBalance,
      newBalance: balanceData.newBalance,
      difference: balanceData.paymentAmountNumber
    });

    // Сохраняем результат в кеш для предотвращения дублирования
    const successResult = {
      newBalance: balanceData.newBalance,
      success: true,
      modePrice: balanceData.paymentAmountNumber,
      prevBalance: balanceData.currentBalance,
    };
    processedPayments.set(opId, successResult);
    
    return { success: true, result: successResult };
  } catch (dbError) {
    logger.error('❌ Ошибка при обновлении баланса в БД:', {
      description: 'Error updating balance in DB',
      error: dbError instanceof Error ? dbError.message : 'Unknown error',
      stack: dbError instanceof Error ? dbError.stack : undefined,
      telegram_id,
      currentBalance: balanceData.currentBalance,
      newBalance: balanceData.newBalance
    });
    
    const errorResult = {
      newBalance: balanceData.currentBalance,
      success: false,
      error: 'Database error while updating balance',
      modePrice: balanceData.paymentAmountNumber,
    };
    processedPayments.set(opId, errorResult);
    return { success: false, result: errorResult };
  }
}

// ШАГ 7: Очистка кеша если нужно
function cleanupCache(): void {
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
}

// Основная функция, разбитая на шаги
export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
  bot,
  bot_name,
  description,
  operation_id
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    logger.info('🔵 Начало процесса обработки платежа', {
      description: 'Starting payment processing',
      telegram_id,
      paymentAmount,
      bot_name
    });
    
    // ШАГ 1: Инициализация операции и проверка кеша
    const { opId, cachedResult, shouldContinue } = await initOperation({
      ctx, telegram_id, paymentAmount, is_ru, bot, bot_name, description, operation_id
    });
    
    if (!shouldContinue) {
      logger.info('🔄 Возвращаем кешированный результат', {
        description: 'Returning cached result',
        telegram_id,
        operation_id: opId
      });
      return cachedResult;
    }
    
    // ШАГ 2: Валидация входных данных
    const validationResult = validateInputData({ 
      ctx, telegram_id, paymentAmount, is_ru, bot, bot_name, description 
    }, opId);
    
    if (!validationResult.isValid) {
      logger.error('❌ Валидация не пройдена', {
        description: 'Validation failed',
        telegram_id,
        operation_id: opId
      });
      return validationResult.errorResult;
    }
    
    // ШАГ 3: Получение и проверка баланса пользователя
    const balanceResult = await checkUserBalance({ 
      ctx, telegram_id, paymentAmount, is_ru, bot, bot_name, description 
    }, opId);
    
    if (!balanceResult.success) {
      logger.error('❌ Проверка баланса не пройдена', {
        description: 'Balance check failed',
        telegram_id,
        operation_id: opId
      });
      return balanceResult.errorResult;
    }
    
    // ШАГ 4: Проверка достаточности средств
    const fundsResult = await checkSufficientFunds(
      { ctx, telegram_id, paymentAmount, is_ru, bot, bot_name, description },
      balanceResult.currentBalance,
      opId
    );
    
    if (!fundsResult.sufficient) {
      logger.error('❌ Недостаточно средств', {
        description: 'Insufficient funds',
        telegram_id,
        operation_id: opId
      });
      return fundsResult.errorResult;
    }
    
    // ШАГ 5: Расчет нового баланса
    const { newBalance, paymentAmountNumber } = calculateNewBalance(
      balanceResult.currentBalance,
      paymentAmount,
      telegram_id
    );
    
    // ШАГ 6: Обновление баланса в базе данных
    const updateResult = await updateBalanceInDB(
      { ctx, telegram_id, paymentAmount, is_ru, bot, bot_name, description },
      { 
        currentBalance: balanceResult.currentBalance, 
        newBalance,
        paymentAmountNumber
      },
      opId
    );
    
    // ШАГ 7: Очистка кеша если нужно
    cleanupCache();
    
    logger.info('🟢 Завершение процесса обработки платежа', {
      description: 'Payment processing completed',
      telegram_id,
      operation_id: opId,
      success: updateResult.success
    });
    
    return updateResult.result;
  } catch (error) {
    logger.error('❌ Непредвиденная ошибка в processBalanceOperation:', {
      description: 'Unexpected error in processBalanceOperation',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id
    });
    throw error;
  }
}
