import 'dotenv/config'
import path from 'path'
import { logger } from '@/utils/logger'
import fs from 'fs'

// Загружаем переменные окружения в зависимости от окружения
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
const envPath = path.resolve(process.cwd(), envFile)

// Проверяем существование файла
if (!fs.existsSync(envPath)) {
  logger.error('❌ Файл с переменными окружения не найден:', {
    description: 'Environment file not found',
    env_path: envPath,
    cwd: process.cwd(),
    env: process.env.NODE_ENV,
  })
  process.exit(1)
}

logger.info('🔍 Загрузка переменных окружения:', {
  description: 'Loading environment variables',
  env_path: envPath,
  cwd: process.cwd(),
  env: process.env.NODE_ENV,
  file_exists: fs.existsSync(envPath),
})

// Загружаем переменные окружения из соответствующего файла
require('dotenv').config({ path: envPath })

logger.info('🔍 Переменные окружения в config/index.ts:', {
  description: 'Environment variables in config/index.ts',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY?.slice(0, 10) + '...',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10) + '...',
  NODE_ENV: process.env.NODE_ENV,
  all_env_keys: Object.keys(process.env),
})

// Проверяем наличие необходимых переменных Supabase
if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_KEY ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  logger.error(
    '❌ Отсутствуют необходимые переменные окружения Supabase в config/index.ts',
    {
      description: 'Missing required Supabase environment variables',
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
  )
  process.exit(1)
}

// Экспортируем переменные окружения
export const {
  NODE_ENV,
  PORT,
  SECRET_KEY,
  SECRET_API_KEY,
  LOG_FORMAT,
  LOG_DIR,
  ORIGIN,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  SUPABASE_SERVICE_KEY,
  RUNWAY_API_KEY,
  ELEVENLABS_API_KEY,
  ELESTIO_URL,
  LOCAL_SERVER_URL,
  PIXEL_API_KEY,
  HUGGINGFACE_TOKEN,
  WEBHOOK_URL,
  ADMIN_IDS,
  OPENAI_API_KEY,
  MERCHANT_LOGIN,
  PASSWORD1,
  PASSWORD2,
  RESULT_URL,
  RESULT_URL2,
  PINATA_JWT,
  PINATA_GATEWAY,
  DEEPSEEK_API_KEY,
  INNGEST_EVENT_KEY,
  INNGEST_API_KEY,
  INNGEST_URL,
  GLAMA_API_KEY,
  TEST_PASSWORD1,
  TEST_PASSWORD2,
} = process.env
// Дополнительные константы
export const CREDENTIALS = process.env.CREDENTIALS === 'true'
export const isDev = process.env.NODE_ENV === 'development'
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

export const API_URL = isDev ? process.env.LOCAL_SERVER_URL : process.env.ORIGIN

// Проверка использования продакшен токенов в разработке
if (isDev) {
  const BOT_TOKENS = Object.keys(process.env).filter(key =>
    key.includes('BOT_TOKEN')
  )
  BOT_TOKENS.forEach(token => {
    if (process.env[token]?.startsWith('5')) {
      logger.error(
        '❌ Обнаружено использование продакшен токена в разработке',
        {
          description: 'Production bot token detected in development',
          token_key: token,
        }
      )
      process.exit(1)
    }
  })
}
