import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { logger } from '@/utils/logger'

// Загружаем переменные окружения из .env файла
config()

/**
 * Список обязательных переменных окружения
 */
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
] as const

/**
 * Функция для безопасного получения переменных окружения
 * @param name - Имя переменной окружения
 * @returns Значение переменной окружения
 * @throws Error если переменная не найдена
 */
function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    logger.error('❌ Отсутствует переменная окружения', {
      description: 'Missing environment variable',
      variable: name,
    })
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

// Проверяем наличие всех обязательных переменных
for (const envVar of requiredEnvVars) {
  getEnvVar(envVar)
}

/**
 * Клиент Supabase для тестов с полным доступом
 */
export const supabaseTestClient = createClient(
  getEnvVar('SUPABASE_URL'),
  getEnvVar('SUPABASE_SERVICE_KEY'),
  {
    auth: {
      persistSession: false,
    },
  }
)

/**
 * Клиент Supabase для анонимного доступа
 */
export const supabaseAnon = createClient(
  getEnvVar('SUPABASE_URL'),
  getEnvVar('SUPABASE_ANON_KEY')
)

/**
 * Интерфейс для конфигурации тестового окружения
 */
interface TestEnvironment {
  supabase: {
    url: string
    key: string
  }
  api: {
    url: string
    webhookPath: string
    bflWebhookPath: string
  }
}

/**
 * Конфигурация тестового окружения
 */
export const TEST_ENV: TestEnvironment = {
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

/**
 * Интерфейс для логгера тестов
 */
interface TestLogger {
  info: (message: string, data?: Record<string, any>) => void
  error: (message: string, error?: Error | string) => void
  success: (message: string, data?: Record<string, any>) => void
}

/**
 * Логгер для тестов с эмодзи
 */
export const testLogger: TestLogger = {
  info: (message: string, data?: Record<string, any>) => {
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
  success: (message: string, data?: Record<string, any>) => {
    logger.info({
      message: `✅ ${message}`,
      description: message,
      ...data,
    })
  },
}
