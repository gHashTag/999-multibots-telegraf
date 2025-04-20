import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

type BalanceUpdateMetadata = {
  stars?: number
  payment_method?: string
  bot_name?: string
  language?: string
  service_type?: string
  inv_id?: string
  modePrice?: number
  currentBalance?: number
  paymentAmount?: number
  [key: string]: any
}

/**
 * Создает или обновляет запись о транзакции в таблице payments
 * @returns Promise<boolean> - успешно ли выполнено добавление/обновление записи
 */
export const updateUserBalance = async (
  telegram_id: string,
  amount: number,
  type: 'money_income' | 'money_outcome',
  description?: string,
  metadata?: BalanceUpdateMetadata
): Promise<boolean> => {
  try {
    // Подробное логирование входных данных для диагностики
    logger.info('🔍 Входные данные updateUserBalance:', {
      log_description: 'Input parameters for updateUserBalance',
      telegram_id,
      amount,
      amount_type: typeof amount,
      type,
      operation_description: description,
      metadata: metadata ? JSON.stringify(metadata) : 'нет метаданных',
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
      type === 'money_outcome'
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
        type === 'money_outcome'
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
    if (type === 'money_outcome' && safeAmount > 100) {
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

    // Проверяем существование пользователя и его баланс для outcome операций
    if (type === 'money_outcome') {
      // Проверка существования пользователя
      const { error: userError } = await supabase
        .from('users')
        // Исправлено: выбираем telegram_id или просто проверяем существование
        .select('telegram_id', { count: 'exact', head: true })
        .eq('telegram_id', telegram_id)
      // Убираем .single(), так как head: true уже гарантирует 0 или 1 строку и не возвращает data

      // Проверяем только ошибку (например, сетевую), а не факт отсутствия пользователя
      // Отсутствие пользователя (count === 0) теперь не считается ошибкой здесь,
      // так как баланс все равно считается по payments_v2
      if (userError && userError.code !== 'PGRST116') {
        // PGRST116 - No rows found
        logger.error('❌ Ошибка при проверке существования пользователя:', {
          description: 'Error checking user existence (not user not found)',
          telegram_id,
          error: userError.message,
          errorCode: userError.code,
        })
        // Можно решить, стоит ли здесь возвращать false или продолжить,
        // полагаясь на balance check
        // return false;
      }

      // Убрана проверка if (!userData), так как head: true не возвращает data

      // Получаем баланс пользователя из таблицы payments
      // Оставляем попытку вызова RPC, но если она не сработает,
      // fallback будет использовать payments_v2
      const { data: balanceData, error: balanceError } = await supabase.rpc(
        'get_user_balance',
        { user_telegram_id: Number(telegram_id) }
      )
      console.log('balanceData 📊', balanceData)

      // Если RPC функция не существует, используем обычный SQL запрос
      let currentBalance = 0
      if (balanceError) {
        logger.warn('⚠️ Ошибка при вызове RPC get_user_balance:', {
          description: 'Error calling RPC get_user_balance',
          telegram_id,
          error: balanceError.message,
        })

        // Вычисляем баланс суммируя все транзакции из payments_v2
        const { data: paymentsData, error: paymentsError } = await supabase
          // .from('payments') // Старая таблица
          .from('payments_v2') // Новая таблица
          .select('stars, type')
          .eq('telegram_id', Number(telegram_id))
          .eq('status', 'COMPLETED')

        if (paymentsError) {
          logger.error('❌ Ошибка при получении истории платежей:', {
            description: 'Error getting payments history',
            telegram_id,
            error: paymentsError.message,
          })
          return false
        }

        // Вычисляем баланс: сумма всех поступлений минус сумма всех списаний
        currentBalance = (paymentsData || []).reduce((sum, payment) => {
          if (payment.type === 'money_income') {
            return sum + (payment.stars || 0)
          } else {
            return sum - (payment.stars || 0)
          }
        }, 0)
      } else {
        // Используем результат RPC функции
        currentBalance = Number(balanceData) || 0
      }

      logger.info('💰 Баланс пользователя (из payments):', {
        description: 'User balance from payments table',
        telegram_id,
        balance: currentBalance,
        required_amount: safeAmount,
      })

      // Проверка достаточности средств для списания
      if (currentBalance < safeAmount) {
        logger.error('❌ Недостаточно средств на балансе:', {
          description: 'Insufficient funds',
          telegram_id,
          balance: currentBalance,
          required_amount: safeAmount,
        })
        return false
      }
    } else {
      // Для операций пополнения просто проверяем существование пользователя
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id)
        .single()

      if (userError) {
        logger.error('❌ Пользователь не найден при создании транзакции:', {
          description: 'User not found during transaction creation',
          telegram_id,
          error: userError.message,
        })
        return false
      }

      if (!userData) {
        logger.error('❌ Пользователь не найден (нет данных):', {
          description: 'User not found (no data)',
          telegram_id,
        })
        return false
      }
    }

    // Проверяем, есть ли inv_id в метаданных (для обновления существующей записи)
    if (metadata?.inv_id) {
      logger.info('🔄 Обновление существующей записи о транзакции:', {
        description: 'Updating existing transaction record',
        telegram_id,
        inv_id: metadata.inv_id,
        amount: Math.abs(safeAmount),
        type,
      })

      // Обновляем существующую запись в payments_v2
      const { error: updateError } = await supabase
        // .from('payments') // Старая таблица
        .from('payments_v2') // Новая таблица
        .update({
          status: 'COMPLETED',
        })
        .eq('inv_id', metadata.inv_id)

      if (updateError) {
        logger.error('❌ Ошибка при обновлении записи о транзакции:', {
          description: 'Error updating transaction record',
          telegram_id,
          inv_id: metadata.inv_id,
          error: updateError.message,
        })
        return false
      }

      logger.info('✅ Транзакция успешно обновлена:', {
        description: 'Transaction successfully updated',
        telegram_id,
        inv_id: metadata.inv_id,
        amount: safeAmount,
        type,
      })
    } else {
      // Если inv_id не передан, создаем новую запись
      // Более надежный способ генерации ID
      const invId = `${Date.now()}-${Math.floor(
        Math.random() * 1000000
      )}-${telegram_id.substring(0, 5)}`

      // Получаем реальную сумму транзакции и звезд
      const transactionAmount = Math.abs(safeAmount)

      logger.info('💼 Создание новой записи о транзакции:', {
        description: 'Creating new transaction record',
        telegram_id,
        inv_id: invId,
        transaction_amount: transactionAmount,
        type,
      })

      // Проверим структуру таблицы, чтобы убедиться в правильности типов
      try {
        // Создаем запись о транзакции с корректным типом данных
        // Все числовые поля преобразуем в целые числа для безопасности
        // БЕЗОПАСНОЕ преобразование, защита от null/undefined
        const safeRoundedAmount =
          transactionAmount != null ? Math.round(transactionAmount) : 0

        const { error: paymentError } = await supabase
          .from('payments_v2')
          .insert({
            telegram_id,
            inv_id: invId,
            currency: metadata?.currency || 'STARS',
            amount: safeRoundedAmount, // Защита от null/undefined
            status: 'COMPLETED',
            stars: safeRoundedAmount, // Защита от null/undefined
            type,
            description: description || `Balance ${type}`,
            payment_method: metadata?.service_type,
            bot_name: metadata?.bot_name || 'neuro_blogger_bot',
            language: metadata?.language || 'ru',
          })

        if (paymentError) {
          logger.error('❌ Ошибка при создании записи о транзакции:', {
            description: 'Error creating transaction record',
            telegram_id,
            error: paymentError.message,
            amount: transactionAmount,
          })
          return false
        }

        logger.info('✅ Транзакция успешно создана:', {
          description: 'Transaction successfully created',
          telegram_id,
          amount: transactionAmount,
          type,
        })
      } catch (insertError) {
        logger.error('❌ Исключение при создании записи о транзакции:', {
          description: 'Exception during transaction record creation',
          telegram_id,
          error:
            insertError instanceof Error
              ? insertError.message
              : 'Unknown error',
          amount: transactionAmount,
        })
        return false
      }
    }

    // Обновление баланса в таблице Users больше не требуется

    return true
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
