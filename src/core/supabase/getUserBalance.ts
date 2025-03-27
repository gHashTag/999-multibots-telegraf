import { supabase } from './index'
import { logger } from '@/utils/logger'

/**
 * Получает баланс пользователя путем подсчета всех платежей в таблице payments
 * Считает сумму всех income минус сумму всех outcome
 * Возвращает либо число (баланс), либо 0 в случае ошибки
 */
export const getUserBalance = async (
  telegram_id: number | string,
  bot_name?: string
): Promise<number> => {
  try {
    // Проверяем корректность telegram_id
    if (!telegram_id) {
      logger.error('❌ Пустой telegram_id в getUserBalance:', {
        description: 'Empty telegram_id in getUserBalance',
        telegram_id,
        bot_name,
      })
      return 0
    }

    // Преобразуем telegram_id в строку если это число
    const id =
      typeof telegram_id === 'number' ? telegram_id.toString() : telegram_id

    logger.info('🔍 Запрос баланса пользователя из таблицы payments:', {
      description: 'Calculating user balance from payments table',
      telegram_id: id,
      telegram_id_type: typeof id,
      bot_name,
    })

    // Пытаемся получить баланс напрямую из payments, пропуская RPC,
    // если это проблемный случай с neuro_blogger_bot
    const isKnownProblematicBot = bot_name === 'neuro_blogger_bot'

    // Проверяем баланс пользователя с детальным логированием
    try {
      // Записываем все запросы для диагностики
      const isProblematicUser = id && id.toString() === '144022504'

      if (isProblematicUser) {
        logger.info('🔍 ДИАГНОСТИКА проблемного пользователя:', {
          description: 'Special diagnosis for problematic user',
          telegram_id: id,
          bot_name,
        })
      }

      // Для проблемной комбинации пропускаем RPC
      if (isProblematicUser || isKnownProblematicBot) {
        // Проверяем записи для этого пользователя напрямую
        const { data: userPayments, error: userPaymentsError } = await supabase
          .from('payments')
          .select('amount, stars, type, status')
          .eq('telegram_id', id)
          .limit(10)

        logger.info('🧪 ДИАГНОСТИКА - записи пользователя в payments:', {
          description: 'User payments diagnostic data',
          telegram_id: id,
          hasPayments: userPayments && userPayments.length > 0,
          paymentCount: userPayments?.length,
          firstFewRecords: userPayments?.slice(0, 3),
          queryError: userPaymentsError?.message,
          bot_name,
        })

        // Проверяем типы данных
        if (userPayments && userPayments.length > 0) {
          const firstPayment = userPayments[0]
          logger.info('🧪 ДИАГНОСТИКА - типы данных в payments:', {
            description: 'Data type diagnostic',
            telegram_id_type: typeof id,
            amount_type: typeof firstPayment.amount,
            stars_type: typeof firstPayment.stars,
            amount_value: firstPayment.amount,
            stars_value: firstPayment.stars,
            bot_name,
          })
        }
      }

      // Пробуем использовать RPC-функцию для получения баланса только если это не проблемный бот
      if (!isKnownProblematicBot) {
        try {
          const { data: rpcBalance, error: rpcError } = await supabase.rpc(
            'get_user_balance',
            { user_telegram_id: id }
          )

          // Подробное логирование результата RPC-запроса
          logger.info('🔎 Результат RPC-запроса для получения баланса:', {
            description: 'RPC balance request result details',
            telegram_id: id,
            rpcBalance,
            rpcBalanceType: typeof rpcBalance,
            rpcBalanceIsNull: rpcBalance === null,
            hasError: !!rpcError,
            errorMessage: rpcError ? rpcError.message : undefined,
            bot_name,
          })

          if (!rpcError && rpcBalance !== null) {
            // Безопасное преобразование результата
            let safeBalance
            try {
              safeBalance = Number(rpcBalance)
              if (isNaN(safeBalance)) {
                logger.warn('⚠️ Результат RPC преобразован в NaN:', {
                  description: 'RPC result converted to NaN',
                  telegram_id: id,
                  raw_balance: rpcBalance,
                  bot_name,
                })
                safeBalance = 0
              }
            } catch (conversionError) {
              logger.error('❌ Ошибка при преобразовании результата RPC:', {
                description: 'Error converting RPC result',
                telegram_id: id,
                raw_balance: rpcBalance,
                error:
                  conversionError instanceof Error
                    ? conversionError.message
                    : 'Unknown error',
                bot_name,
              })
              safeBalance = 0
            }

            logger.info('💰 Баланс получен через RPC-функцию:', {
              description: 'Balance obtained via RPC function',
              telegram_id: id,
              balance: safeBalance,
              raw_balance: rpcBalance,
              balance_type: typeof safeBalance,
              bot_name,
            })
            return safeBalance
          }
        } catch (rpcAttemptError) {
          logger.error('❌ Исключение при вызове RPC-функции:', {
            description: 'Exception when calling RPC function',
            telegram_id: id,
            error:
              rpcAttemptError instanceof Error
                ? rpcAttemptError.message
                : 'Unknown error',
            stack:
              rpcAttemptError instanceof Error
                ? rpcAttemptError.stack
                : undefined,
            bot_name,
          })
          // Продолжаем выполнение, чтобы использовать запасной метод
        }
      }

      // Запрашиваем все завершенные платежи пользователя
      const { data, error } = await supabase
        .from('payments')
        .select('amount, type, stars')
        .eq('telegram_id', id)
        .eq('status', 'COMPLETED')

      if (error) {
        logger.error('❌ Ошибка при получении платежей:', {
          description: 'Error fetching user payments',
          error: error.message,
          telegram_id: id,
          bot_name,
        })
        return 0
      }

      if (!data || data.length === 0) {
        logger.info('ℹ️ Платежи не найдены:', {
          description: 'No payments found for user',
          telegram_id: id,
          bot_name,
        })
        return 0
      }

      // Считаем баланс: сумма всех income минус сумма всех outcome
      let balance = 0

      for (const payment of data) {
        const amount = payment.stars ? Number(payment.stars) : 0

        if (isNaN(amount)) {
          logger.warn('⚠️ Некорректная сумма платежа:', {
            description: 'Invalid payment amount',
            payment,
            telegram_id: id,
            bot_name,
          })
          continue
        }

        if (payment.type === 'income') {
          balance += amount
        } else if (payment.type === 'outcome') {
          balance -= amount
        }
      }

      // Округляем до 2 знаков после запятой
      balance = parseFloat(balance.toFixed(2))

      logger.info('💰 Рассчитан баланс пользователя из платежей:', {
        description: 'User balance calculated from payments',
        telegram_id: id,
        balance,
        payments_count: data.length,
        bot_name,
      })

      return balance
    } catch (err) {
      logger.error('❌ Ошибка в getUserBalance:', {
        description: 'Exception in getUserBalance',
        error: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        telegram_id: id,
        bot_name,
      })

      // Возвращаем 0 вместо выброса исключения
      return 0
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка в getUserBalance:', {
      description: 'Critical exception in getUserBalance',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id,
      bot_name,
    })

    // Возвращаем 0 вместо выброса исключения
    return 0
  }
}
