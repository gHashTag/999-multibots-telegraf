import { Pool } from 'pg'
import dotenv from 'dotenv'
// Neon PostgreSQL connection
const DATABASE_URL = process.env.DATABASE_URL!

export const neonPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

// Тестовая функция для проверки подключения
export async function testNeonConnection() {
  try {
    const client = await neonPool.connect()
    console.log('✅ Neon connection successful')

    // Проверим какие таблицы есть
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `)

    console.log(
      '📋 Available tables in Neon:',
      result.rows.map(row => row.table_name)
    )

    client.release()
    return result.rows
  } catch (error) {
    console.error('❌ Neon connection failed:', error)
    throw error
  }
}

export async function queryNeon(sql: string, params: any[] = []) {
  const client = await neonPool.connect()
  try {
    const result = await client.query(sql, params)
    return result
  } finally {
    client.release()
  }
}
