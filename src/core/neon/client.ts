import { Pool } from 'pg'
import { logger } from '@/utils/enhancedLogger'
import dotenv from 'dotenv'
// Neon PostgreSQL connection
const DATABASE_URL = process.env.DATABASE_URL!

export const neonPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  // ⚡ ПРОДАКШН ОПТИМИЗАЦИЯ - Быстрые тайм-ауты и retry
  max: 10, // максимум соединений
  idleTimeoutMillis: 30000, // 30 сек idle
  connectionTimeoutMillis: 10000, // 10 сек на подключение
  query_timeout: 15000, // 15 сек на запрос
})

// 🔄 RETRY HELPER - Повторные попытки при сетевых ошибках
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  initialDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isNetworkError =
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENETUNREACH' ||
        error.code === 'ECONNRESET'

      if (attempt === maxRetries || !isNetworkError) {
        throw error
      }

      const delay = initialDelay * Math.pow(2, attempt - 1)
      logger.debug(
        `🔄 Retry attempt ${attempt}/${maxRetries} after ${delay}ms...`
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries reached')
}

// Тестовая функция для проверки подключения С RETRY
export async function testNeonConnection() {
  return await retryWithBackoff(async () => {
    const client = await neonPool.connect()
    logger.debug('✅ Neon connection successful')

    // Проверим какие таблицы есть
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `)

    logger.debug(
      '📋 Available tables in Neon:',
      result.rows.map(row => row.table_name)
    )

    client.release()
    return result.rows
  })
}

export async function queryNeon(sql: string, params: any[] = []) {
  return await retryWithBackoff(async () => {
    const client = await neonPool.connect()
    try {
      const result = await client.query(sql, params)
      return result
    } finally {
      client.release()
    }
  })
}
