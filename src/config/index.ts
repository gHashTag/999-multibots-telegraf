import { config } from 'dotenv' // Restored dotenv import
import { logger } from '@/utils/enhancedLogger'
import fs from 'fs' // Импортируем модуль fs
import path from 'path' // Импортируем модуль path

logger.debug('--- Debugging .env loading --- ')
const cwd = process.cwd()
logger.debug(`[CONFIG] Current Working Directory: ${cwd}`)

// Determine the primary .env file path
const envPath = path.join(cwd, '.env')
logger.debug(`[CONFIG] Assuming primary env file path: ${envPath}`)

// Attempt to load .env - RESTORED THIS LOGIC
const loadResult = config({ path: envPath })

if (loadResult.error) {
  logger.error(
    `[CONFIG] CRITICAL ERROR: Failed to load primary .env file from ${envPath}. Error: ${loadResult.error.message}`
  )
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  } else {
    logger.warn(
      `[CONFIG] WARNING: Failed to load .env file at ${envPath}, continuing with system env vars`
    )
  }
} else if (!loadResult.parsed || Object.keys(loadResult.parsed).length === 0) {
  logger.error(
    `[CONFIG] CRITICAL ERROR: Primary .env file loaded from ${envPath}, but it is empty or parsing failed.`
  )
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
} else {
  logger.debug(
    `[CONFIG] Successfully loaded and parsed primary .env file from ${envPath}. Keys count: ${
      Object.keys(loadResult.parsed).length
    }`
  )
  logger.debug(
    `[CONFIG] DEV_SIMULATE_SUBSCRIPTION from file: ${
      loadResult.parsed.DEV_SIMULATE_SUBSCRIPTION || 'NOT FOUND'
    }`
  )
}

// Set NODE_ENV default if not provided
if (!process.env.NODE_ENV) {
  logger.debug("[CONFIG] NODE_ENV was not set, setting to 'development'")
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

// 🔧 ИСПРАВЛЕНИЕ: Принудительный development режим через FORCE_DEV_MODE или TEST_BOT_NAME
const forceDevMode = process.env.FORCE_DEV_MODE === 'true'
const hasTestBot = !!process.env.TEST_BOT_NAME
if (forceDevMode) {
  logger.debug('[CONFIG] FORCE_DEV_MODE=true detected, overriding to development mode')
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
} else if (hasTestBot) {
  logger.debug(`[CONFIG] TEST_BOT_NAME=${process.env.TEST_BOT_NAME} detected, overriding to development mode`)
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

export const isDev = process.env.NODE_ENV === 'development' || forceDevMode || hasTestBot
logger.debug(`[CONFIG] isDev flag set to: ${isDev}`)
logger.debug(`[CONFIG] forceDevMode: ${forceDevMode}`)

logger.debug(`[CONFIG] NODE_ENV is set to: ${process.env.NODE_ENV}`)
logger.debug('--- End Debugging .env loading --- ')

// Логирование для проверки токенов
if (process.env.NODE_ENV === 'production') {
  logger.debug('Bot tokens check in ENV:')
  logger.debug('BOT_TOKEN_1 exists:', !!process.env.BOT_TOKEN_1)
  logger.debug('BOT_TOKEN_2 exists:', !!process.env.BOT_TOKEN_2)
  logger.debug('BOT_TOKEN_3 exists:', !!process.env.BOT_TOKEN_3)
  logger.debug('BOT_TOKEN_4 exists:', !!process.env.BOT_TOKEN_4)
  logger.debug('BOT_TOKEN_5 exists:', !!process.env.BOT_TOKEN_5)
  logger.debug('BOT_TOKEN_6 exists:', !!process.env.BOT_TOKEN_6)
  logger.debug('BOT_TOKEN_7 exists:', !!process.env.BOT_TOKEN_7)
  logger.debug('BOT_TOKEN_8 exists:', !!process.env.BOT_TOKEN_8)
  logger.debug('BOT_TOKEN_9 exists:', !!process.env.BOT_TOKEN_9)
  logger.debug('SUPABASE_URL exists:', !!process.env.SUPABASE_URL)
  logger.debug(
    'SUPABASE_SERVICE_KEY exists:',
    !!process.env.SUPABASE_SERVICE_KEY
  )
  logger.debug(
    'SUPABASE_SERVICE_ROLE_KEY exists:',
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export const CREDENTIALS = process.env.CREDENTIALS === 'true'
export const {
  NODE_ENV,
  PORT,
  SECRET_KEY,
  SECRET_API_KEY,
  LOG_FORMAT,
  LOG_DIR,
  ORIGIN,
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  SUPABASE_SERVICE_KEY,
  RUNWAY_API_KEY,
  ELEVENLABS_API_KEY,
  API_SERVER_URL,
  NGROK,
  PIXEL_API_KEY,
  HUGGINGFACE_TOKEN,
  WEBHOOK_URL,
  OPENAI_API_KEY,
  MERCHANT_LOGIN,
  RESULT_URL2,
  PINATA_JWT,
  PINATA_GATEWAY,
  LOCAL_SERVER_URL,
  AI_SERVER_LOCAL_URL,
  INNGEST_EVENT_KEY,
  INNGEST_URL,
  INNGEST_SIGNING_KEY,
  ROBOKASSA_PASSWORD_1,
  ROBOKASSA_PASSWORD_2,
  SERVER_API_URL,
  USE_PRODUCTION_API,
} = process.env

// API_URL для AI сервера - логика переключения между локальным и продакшн сервером
const forceProductionAPI = USE_PRODUCTION_API === 'true'
export const API_URL = forceProductionAPI 
  ? API_SERVER_URL // 🚀 Принудительно используем продакшн Railway сервер
  : isDev 
    ? (LOCAL_SERVER_URL || AI_SERVER_LOCAL_URL || API_SERVER_URL) // 🛠️ В dev режиме - локальный/ngrok или продакшн
    : API_SERVER_URL // 📦 В production режиме - всегда продакшн сервер

// 🔧 ИСПРАВЛЕНИЕ: Синхронизация URL для Robokassa
// Все URL должны использовать один домен для корректной работы с Robokassa
const BASE_PAYMENT_URL = isDev
  ? API_SERVER_URL ||
    process.env.SERVER_API_URL ||
    'https://ai-server-production-production-8e2d.up.railway.app' // ⚠️ КРИТИЧНО: Robokassa требует публичный URL!
  : API_SERVER_URL ||
    RESULT_URL2?.split('/payment-success')[0] ||
    process.env.SERVER_API_URL ||
    'https://ai-server-production-production-8e2d.up.railway.app'

export const UNIFIED_RESULT_URL = `${BASE_PAYMENT_URL}/payment-success`

logger.debug('💳 [ROBOKASSA FIX] BASE_PAYMENT_URL:', BASE_PAYMENT_URL)
logger.debug('💳 [ROBOKASSA FIX] UNIFIED_RESULT_URL:', UNIFIED_RESULT_URL)
logger.debug('💳 [ROBOKASSA FIX] Original RESULT_URL2:', RESULT_URL2)

// 🚨 ОТЛАДКА: Логируем все URL для понимания проблемы кэширования
logger.debug('🚨 [CONFIG DEBUG] URL CONFIGURATION LOADED:')
logger.debug(`🚨 [CONFIG DEBUG] isDev: ${isDev}`)
logger.debug(`🚨 [CONFIG DEBUG] LOCAL_SERVER_URL: ${LOCAL_SERVER_URL}`)
logger.debug(`🚨 [CONFIG DEBUG] API_SERVER_URL: ${API_SERVER_URL}`)
logger.debug(`🚨 [CONFIG DEBUG] USE_PRODUCTION_API: ${USE_PRODUCTION_API}`)
logger.debug(`🚨 [CONFIG DEBUG] forceProductionAPI: ${forceProductionAPI}`)
logger.debug(`🚨 [CONFIG DEBUG] FINAL API_URL: ${API_URL}`)
logger.debug(`🚨 [CONFIG DEBUG] SUPABASE_URL: ${SUPABASE_URL}`)
logger.debug(`🚨 [CONFIG DEBUG] SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY ? '***SET***' : 'UNDEFINED'}`)
logger.debug('🚨 [CONFIG DEBUG] =====================================')

// Парсинг ADMIN_IDS в массив чисел
const adminIdsString = process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_ID || ''
logger.debug('[CONFIG DEBUG] Raw ADMIN_IDS value:', adminIdsString)
export const ADMIN_IDS_ARRAY: number[] = adminIdsString
  .split(',') // Разделяем строку по запятым
  .map(id => parseInt(id.trim(), 10)) // Преобразуем каждую часть в число
  .filter(id => !isNaN(id)) // Убираем некорректные значения (NaN)

logger.debug('[CONFIG] Parsed ADMIN_IDS_ARRAY:', ADMIN_IDS_ARRAY)

// Проверка наличия обязательных переменных окружения для Supabase
export const isSupabaseConfigured = !!(
  SUPABASE_URL &&
  SUPABASE_SERVICE_KEY &&
  SUPABASE_SERVICE_ROLE_KEY
)

if (!isSupabaseConfigured && process.env.NODE_ENV === 'production') {
  logger.warn(
    '⚠️ ВНИМАНИЕ: Не настроены параметры Supabase. Боты будут загружены из переменных окружения.'
  )
}
