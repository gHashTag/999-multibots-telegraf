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

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error({
      message: `❌ Отсутствует переменная окружения ${envVar}`,
      description: `Missing required environment variable ${envVar}`,
    })
    process.exit(1)
  }
}

// Создаем клиент Supabase для тестов
export const supabaseTestClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      persistSession: false,
    },
  }
)

// Интерфейс для данных логирования
export interface LogData {
  [key: string]: any
}

// Экспортируем настройки для тестов
export const TEST_ENV = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_ANON_KEY!,
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
