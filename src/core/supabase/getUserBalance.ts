import { supabase } from './index'
import { logger } from '@/utils/logger'

/**
 * Получает баланс пользователя путем подсчета всех платежей в таблице payments
 * Считает сумму всех income минус сумму всех outcome
 * Возвращает либо число (баланс), либо 0 в случае ошибки
 */
export const getUserBalance = async (
  telegram_id: number | string
): Promise<number> => {
  try {
    // Проверяем корректность telegram_id
    if (!telegram_id) {
      logger.error('❌ Пустой telegram_id в getUserBalance:', {
        description: 'Empty telegram_id in getUserBalance',
        telegram_id
      });
      return 0;
    }

    // Преобразуем telegram_id в строку если это число
    const id = typeof telegram_id === 'number' ? telegram_id.toString() : telegram_id;
    
    logger.info('🔍 Запрос баланса пользователя из таблицы payments:', {
      description: 'Calculating user balance from payments table',
      telegram_id: id
    });

    // Запрашиваем все завершенные платежи пользователя
    const { data, error } = await supabase
      .from('payments')
      .select('amount, type')
      .eq('telegram_id', id)
      .eq('status', 'COMPLETED');

    if (error) {
      logger.error('❌ Ошибка при получении платежей:', {
        description: 'Error fetching user payments',
        error: error.message,
        telegram_id: id
      });
      return 0;
    }

    if (!data || data.length === 0) {
      logger.info('ℹ️ Платежи не найдены:', {
        description: 'No payments found for user',
        telegram_id: id
      });
      return 0;
    }

    // Считаем баланс: сумма всех income минус сумма всех outcome
    let balance = 0;
    
    for (const payment of data) {
      const amount = payment.amount ? Number(payment.amount) : 0;
      
      if (isNaN(amount)) {
        logger.warn('⚠️ Некорректная сумма платежа:', {
          description: 'Invalid payment amount',
          payment,
          telegram_id: id
        });
        continue;
      }
      
      if (payment.type === 'income') {
        balance += amount;
      } else if (payment.type === 'outcome') {
        balance -= amount;
      }
    }
    
    // Округляем до 2 знаков после запятой
    balance = parseFloat(balance.toFixed(2));
    
    logger.info('💰 Рассчитан баланс пользователя из платежей:', {
      description: 'User balance calculated from payments',
      telegram_id: id,
      balance,
      payments_count: data.length
    });

    return balance;
  } catch (err) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Exception in getUserBalance',
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      telegram_id
    });
    
    // Возвращаем 0 вместо выброса исключения
    return 0;
  }
}
