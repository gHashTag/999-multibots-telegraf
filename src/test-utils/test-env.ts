import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

// Загружаем переменные окружения из .env-файла
dotenv.config()

// Определяем ключи для Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

// Проверяем наличие необходимых переменных окружения
if (!supabaseUrl || !supabaseKey) {
  logger.error({
    message: '🚨 Отсутствуют переменные окружения для Supabase',
    description: 'Missing Supabase environment variables',
  })

  logger.warn({
    message: '⚠️ Используются временные значения для Supabase',
    description: 'Using temporary Supabase values',
    url: supabaseUrl,
  })
  throw new Error('Missing Supabase environment variables')
}

// Создаем клиент Supabase для тестов
export const testSupabase = createClient(supabaseUrl, supabaseKey)

logger.info({
  message: '🔌 Тестовый клиент Supabase инициализирован',
  description: 'Test Supabase client initialized',
  url: supabaseUrl,
})

// Экспортируем настройки для тестов
export const TEST_ENV = {
  supabase: {
    url: supabaseUrl,
    key: supabaseKey,
  },
  api: {
    url: process.env.API_URL || 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
    bflWebhookPath: '/webhooks/bfl',
  },
}
