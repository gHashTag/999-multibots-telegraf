import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'

// 🔒 КОНФИГУРАЦИЯ RATE LIMITING
const RATE_LIMITS = {
  // Лимиты для операций списания (MONEY_OUTCOME)
  MONEY_OUTCOME: {
    maxOperations: 10, // Максимум 10 операций
    windowMinutes: 5, // За 5 минут
    description: 'Balance deduction operations',
  },

  // Лимиты для операций пополнения (MONEY_INCOME)
  MONEY_INCOME: {
    maxOperations: 20, // Максимум 20 операций (пополнения менее критичны)
    windowMinutes: 5, // За 5 минут
    description: 'Balance income operations',
  },

  // Глобальные лимиты на все операции пользователя
  GLOBAL: {
    maxOperations: 25, // Максимум 25 любых операций
    windowMinutes: 5, // За 5 минут
    description: 'All balance operations combined',
  },
}

interface RateLimitResult {
  allowed: boolean
  currentCount: number
  limit: number
  windowMinutes: number
  resetTime: Date
  error?: string
}

/**
 * 🔒 КРИТИЧЕСКАЯ ФУНКЦИЯ: Проверка rate limit для операций с балансом
 * Предотвращает злоупотребления и спам-атаки на баланс пользователей
 */
export const checkRateLimit = async (
  telegram_id: string,
  operationType: PaymentType
): Promise<RateLimitResult> => {
  try {
    const now = new Date()
    const telegramIdNum = parseInt(telegram_id)

    logger.info('🔍 Проверка rate limit для операции:', {
      description: 'Checking rate limit for operation',
      telegram_id,
      operationType,
      timestamp: now.toISOString(),
    })

    // Получаем конфигурацию лимитов для данного типа операции
    const specificLimit = RATE_LIMITS[operationType as keyof typeof RATE_LIMITS]
    const globalLimit = RATE_LIMITS.GLOBAL

    if (!specificLimit) {
      logger.warn('⚠️ Неизвестный тип операции для rate limit:', {
        description: 'Unknown operation type for rate limit',
        telegram_id,
        operationType,
      })

      // Используем глобальные лимиты по умолчанию
      return checkSpecificLimit(telegramIdNum, 'GLOBAL', globalLimit, now)
    }

    // Проверяем специфичные лимиты для типа операции
    const specificResult = await checkSpecificLimit(
      telegramIdNum,
      operationType,
      specificLimit,
      now
    )
    if (!specificResult.allowed) {
      return specificResult
    }

    // Проверяем глобальные лимиты (все операции вместе)
    const globalResult = await checkSpecificLimit(
      telegramIdNum,
      'GLOBAL',
      globalLimit,
      now
    )
    if (!globalResult.allowed) {
      return {
        ...globalResult,
        error: `Превышен общий лимит операций: ${globalResult.currentCount}/${globalResult.limit} за ${globalResult.windowMinutes} мин.`,
      }
    }

    // Все проверки пройдены
    return specificResult
  } catch (error) {
    logger.error('❌ Ошибка при проверке rate limit:', {
      description: 'Error checking rate limit',
      telegram_id,
      operationType,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // В случае ошибки системы rate limiting - разрешаем операцию
    // Но логируем как критическую ошибку безопасности
    return {
      allowed: true,
      currentCount: 0,
      limit: 999,
      windowMinutes: 1,
      resetTime: new Date(Date.now() + 60000),
      error: 'Rate limiting system error - operation allowed by default',
    }
  }
}

/**
 * Проверяет конкретный лимит для пользователя
 */
async function checkSpecificLimit(
  telegramId: number,
  limitType: string,
  limitConfig: typeof RATE_LIMITS.GLOBAL,
  now: Date
): Promise<RateLimitResult> {
  const windowStart = new Date(
    now.getTime() - limitConfig.windowMinutes * 60 * 1000
  )
  const resetTime = new Date(
    now.getTime() + limitConfig.windowMinutes * 60 * 1000
  )

  // Создаем таблицу rate_limits если её нет (идемпотентная операция)
  await ensureRateLimitTableExists()

  // Получаем количество операций за окно времени
  const { data: existingRecords, error: selectError } = await supabase
    .from('rate_limits')
    .select('id, created_at')
    .eq('telegram_id', telegramId)
    .eq('limit_type', limitType)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false })

  if (selectError) {
    logger.error('❌ Ошибка запроса rate limit записей:', {
      description: 'Error querying rate limit records',
      telegram_id: telegramId,
      limitType,
      error: selectError.message,
    })

    // При ошибке БД разрешаем операцию
    return {
      allowed: true,
      currentCount: 0,
      limit: limitConfig.maxOperations,
      windowMinutes: limitConfig.windowMinutes,
      resetTime,
      error: 'Database error - operation allowed',
    }
  }

  const currentCount = existingRecords?.length || 0

  logger.info(`🔍 Rate limit статус [${limitType}]:`, {
    description: `Rate limit status for ${limitType}`,
    telegram_id: telegramId,
    currentCount,
    maxOperations: limitConfig.maxOperations,
    windowStart: windowStart.toISOString(),
    resetTime: resetTime.toISOString(),
  })

  // Проверяем превышение лимита
  if (currentCount >= limitConfig.maxOperations) {
    logger.warn(`🚨 RATE LIMIT ПРЕВЫШЕН [${limitType}]:`, {
      description: `Rate limit exceeded for ${limitType}`,
      telegram_id: telegramId,
      currentCount,
      limit: limitConfig.maxOperations,
      limitDescription: limitConfig.description,
      windowMinutes: limitConfig.windowMinutes,
    })

    return {
      allowed: false,
      currentCount,
      limit: limitConfig.maxOperations,
      windowMinutes: limitConfig.windowMinutes,
      resetTime,
      error: `Превышен лимит ${limitConfig.description}: ${currentCount}/${limitConfig.maxOperations} за ${limitConfig.windowMinutes} мин.`,
    }
  }

  // Лимит не превышен - записываем текущую операцию
  const { error: insertError } = await supabase.from('rate_limits').insert({
    telegram_id: telegramId,
    limit_type: limitType,
    operation_type: limitType,
    created_at: now.toISOString(),
    metadata: {
      limit_config: limitConfig,
      window_start: windowStart.toISOString(),
      user_agent: 'balance-operation',
      source: 'updateUserBalance',
    },
  })

  if (insertError) {
    logger.error('❌ Ошибка записи rate limit операции:', {
      description: 'Error recording rate limit operation',
      telegram_id: telegramId,
      limitType,
      error: insertError.message,
    })
  } else {
    logger.info(`✅ Rate limit операция записана [${limitType}]:`, {
      description: `Rate limit operation recorded for ${limitType}`,
      telegram_id: telegramId,
      newCount: currentCount + 1,
      limit: limitConfig.maxOperations,
    })
  }

  return {
    allowed: true,
    currentCount: currentCount + 1,
    limit: limitConfig.maxOperations,
    windowMinutes: limitConfig.windowMinutes,
    resetTime,
  }
}

/**
 * Создает таблицу rate_limits если её нет
 */
async function ensureRateLimitTableExists(): Promise<void> {
  // Проверяем существование таблицы через SQL запрос
  const { data, error } = await supabase.rpc('check_table_exists', {
    table_name: 'rate_limits',
  })

  if (error && !error.message.includes('function check_table_exists')) {
    // Если функция не существует, создадим её
    logger.info('ℹ️ Создаем таблицу rate_limits и вспомогательную функцию:', {
      description: 'Creating rate_limits table and helper function',
    })

    // Создаем таблицу через SQL
    await createRateLimitTable()
  } else if (data === false) {
    // Таблица не существует, создаем
    await createRateLimitTable()
  }
}

/**
 * Создает таблицу и функции для rate limiting
 */
async function createRateLimitTable(): Promise<void> {
  const createTableSQL = `
    -- Создаем таблицу для rate limiting если её нет
    CREATE TABLE IF NOT EXISTS rate_limits (
      id BIGSERIAL PRIMARY KEY,
      telegram_id INTEGER NOT NULL,
      limit_type TEXT NOT NULL,
      operation_type TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'::jsonb,
      
      -- Индексы для производительности
      CONSTRAINT rate_limits_telegram_id_idx UNIQUE (id)
    );

    -- Создаем индексы
    CREATE INDEX IF NOT EXISTS rate_limits_telegram_id_type_time_idx 
      ON rate_limits (telegram_id, limit_type, created_at DESC);
    
    CREATE INDEX IF NOT EXISTS rate_limits_cleanup_idx 
      ON rate_limits (created_at) WHERE created_at < NOW() - INTERVAL '1 hour';

    -- Функция для проверки существования таблицы
    CREATE OR REPLACE FUNCTION check_table_exists(table_name TEXT)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      result BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      ) INTO result;
      RETURN result;
    END;
    $$;

    -- Функция для очистки старых записей rate limiting
    CREATE OR REPLACE FUNCTION cleanup_rate_limits()
    RETURNS INTEGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      deleted_count INTEGER;
    BEGIN
      -- Удаляем записи старше 1 часа
      DELETE FROM rate_limits 
      WHERE created_at < NOW() - INTERVAL '1 hour';
      
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      
      RETURN deleted_count;
    END;
    $$;

    -- Даем права
    GRANT SELECT, INSERT, DELETE ON rate_limits TO authenticated;
    GRANT SELECT, INSERT, DELETE ON rate_limits TO service_role;
    GRANT EXECUTE ON FUNCTION check_table_exists TO authenticated;
    GRANT EXECUTE ON FUNCTION check_table_exists TO service_role;
    GRANT EXECUTE ON FUNCTION cleanup_rate_limits TO authenticated;
    GRANT EXECUTE ON FUNCTION cleanup_rate_limits TO service_role;
  `

  const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL })

  if (error) {
    logger.error('❌ Ошибка создания таблицы rate_limits:', {
      description: 'Error creating rate_limits table',
      error: error.message,
    })
  } else {
    logger.info('✅ Таблица rate_limits успешно создана/проверена:', {
      description: 'Rate limits table created/verified successfully',
    })
  }
}

/**
 * 🧹 Функция очистки старых записей rate limiting
 * Должна вызываться периодически для предотвращения роста таблицы
 */
export const cleanupRateLimits = async (): Promise<number> => {
  try {
    const { data: deletedCount, error } = await supabase.rpc(
      'cleanup_rate_limits'
    )

    if (error) {
      logger.error('❌ Ошибка очистки rate limits:', {
        description: 'Error cleaning up rate limits',
        error: error.message,
      })
      return 0
    }

    if (deletedCount > 0) {
      logger.info('🧹 Очистка rate limits завершена:', {
        description: 'Rate limits cleanup completed',
        deletedRecords: deletedCount,
      })
    }

    return deletedCount || 0
  } catch (error) {
    logger.error('❌ Критическая ошибка очистки rate limits:', {
      description: 'Critical error in rate limits cleanup',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return 0
  }
}

/**
 * 📊 Получает статистику rate limiting для пользователя
 */
export const getRateLimitStats = async (telegram_id: string) => {
  try {
    const telegramIdNum = parseInt(telegram_id)
    const now = new Date()
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000) // 5 минут назад

    const { data: records, error } = await supabase
      .from('rate_limits')
      .select('limit_type, operation_type, created_at')
      .eq('telegram_id', telegramIdNum)
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('❌ Ошибка получения статистики rate limit:', {
        description: 'Error getting rate limit stats',
        telegram_id,
        error: error.message,
      })
      return null
    }

    // Группируем по типам операций
    const stats = (records || []).reduce((acc: any, record) => {
      const type = record.limit_type
      if (!acc[type]) {
        acc[type] = { count: 0, lastOperation: record.created_at }
      }
      acc[type].count++
      return acc
    }, {})

    logger.info('📊 Статистика rate limit пользователя:', {
      description: 'User rate limit statistics',
      telegram_id,
      stats,
      windowMinutes: 5,
    })

    return stats
  } catch (error) {
    logger.error('❌ Ошибка получения статистики rate limit:', {
      description: 'Error getting rate limit statistics',
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}
