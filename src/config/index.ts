import 'dotenv/config'
import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'

// Загружаем переменные окружения
config()

logger.info('🔍 Переменные окружения в config/index.ts:', {
  description: 'Environment variables in config/index.ts',
  SUPABASE_URL: process.env.SUPABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
})

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
  RESULT_URL2,
  PINATA_JWT,
  PINATA_GATEWAY,
  DEEPSEEK_API_KEY,
  INNGEST_EVENT_KEY,
  INNGEST_API_KEY,
  INNGEST_URL,
  GLAMA_API_KEY,
} = process.env
// Дополнительные константы
export const CREDENTIALS = process.env.CREDENTIALS === 'true'
export const isDev = process.env.NODE_ENV === 'development'
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

export const API_URL = isDev ? process.env.LOCAL_SERVER_URL : process.env.ORIGIN
