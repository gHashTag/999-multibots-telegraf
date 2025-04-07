import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { logger } from '@/utils/logger'

// Загружаем переменные окружения из .env файла
config()

// Проверяем наличие необходимых переменных окружения
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
]

// Функция для безопасного получения переменных окружения
function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    logger.error(`❌ Отсутствует переменная окружения ${name}`)
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

for (const envVar of requiredEnvVars) {
  getEnvVar(envVar)
}

// Создаем клиент Supabase для тестов
export const supabaseTestClient = createClient(
  getEnvVar('SUPABASE_URL'),
  getEnvVar('SUPABASE_SERVICE_KEY'),
  {
    auth: {
      persistSession: false,
    },
  }
)

// Создаем клиент Supabase для анонимного доступа
export const supabaseAnon = createClient(
  getEnvVar('SUPABASE_URL'),
  getEnvVar('SUPABASE_ANON_KEY')
)

// Интерфейс для данных логирования
export interface LogData {
  [key: string]: any
}

// Экспортируем настройки для тестов
export const TEST_ENV = {
  supabase: {
    url: getEnvVar('SUPABASE_URL'),
    key: getEnvVar('SUPABASE_ANON_KEY'),
  },
  api: {
    url: process.env.API_URL || 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
    bflWebhookPath: '/webhooks/bfl',
  },
}

// Логгер для тестов
export const testLogger = {
  info: (message: string, data?: LogData) => {
    logger.info({
      message: `🧪 ${message}`,
      description: message,
      ...data,
    })
  },
  error: (message: string, error?: Error | string) => {
    logger.error({
      message: `❌ ${message}`,
      description: message,
      error: error instanceof Error ? error.message : error,
    })
  },
  success: (message: string, data?: LogData) => {
    logger.info({
      message: `✅ ${message}`,
      description: message,
      ...data,
    })
  },
}
