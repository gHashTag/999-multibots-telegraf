import { config } from 'dotenv' // Restored dotenv import
import fs from 'fs' // Импортируем модуль fs
import path from 'path' // Импортируем модуль path

console.log('--- Debugging .env loading --- ')
const cwd = process.cwd()
console.log(`[CONFIG] Current Working Directory: ${cwd}`)

// Determine the primary .env file path
const envPath = path.join(cwd, '.env')
console.log(`[CONFIG] Assuming primary env file path: ${envPath}`)

// Attempt to load .env - RESTORED THIS LOGIC
const loadResult = config({ path: envPath })

if (loadResult.error) {
  console.error(
    `[CONFIG] CRITICAL ERROR: Failed to load primary .env file from ${envPath}. Error: ${loadResult.error.message}`
  )
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  } else {
    console.warn(
      `[CONFIG] WARNING: Failed to load .env file at ${envPath}, continuing with system env vars`
    )
  }
} else if (!loadResult.parsed || Object.keys(loadResult.parsed).length === 0) {
  console.error(
    `[CONFIG] CRITICAL ERROR: Primary .env file loaded from ${envPath}, but it is empty or parsing failed.`
  )
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
} else {
  console.log(
    `[CONFIG] Successfully loaded and parsed primary .env file from ${envPath}. Keys count: ${Object.keys(loadResult.parsed).length}`
  )
  console.log(
    `[CONFIG] DEV_SIMULATE_SUBSCRIPTION from file: ${loadResult.parsed.DEV_SIMULATE_SUBSCRIPTION || 'NOT FOUND'}`
  )
}

// Set NODE_ENV default if not provided
if (!process.env.NODE_ENV) {
  console.log("[CONFIG] NODE_ENV was not set, setting to 'development'")
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}
export const isDev = process.env.NODE_ENV === 'development'
console.log(`[CONFIG] isDev flag set to: ${isDev}`)

console.log(`[CONFIG] NODE_ENV is set to: ${process.env.NODE_ENV}`)
console.log('--- End Debugging .env loading --- ')

// Логирование для проверки токенов
if (process.env.NODE_ENV === 'production') {
  console.log('Bot tokens check in ENV:')
  console.log('BOT_TOKEN_1 exists:', !!process.env.BOT_TOKEN_1)
  console.log('BOT_TOKEN_2 exists:', !!process.env.BOT_TOKEN_2)
  console.log('BOT_TOKEN_3 exists:', !!process.env.BOT_TOKEN_3)
  console.log('BOT_TOKEN_4 exists:', !!process.env.BOT_TOKEN_4)
  console.log('BOT_TOKEN_5 exists:', !!process.env.BOT_TOKEN_5)
  console.log('BOT_TOKEN_6 exists:', !!process.env.BOT_TOKEN_6)
  console.log('BOT_TOKEN_7 exists:', !!process.env.BOT_TOKEN_7)
  console.log('BOT_TOKEN_8 exists:', !!process.env.BOT_TOKEN_8)
  console.log('BOT_TOKEN_9 exists:', !!process.env.BOT_TOKEN_9)
  console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL)
  console.log(
    'SUPABASE_SERVICE_KEY exists:',
    !!process.env.SUPABASE_SERVICE_KEY
  )
  console.log(
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
} = process.env

// API_URL для AI сервера - в разработке используем локальный AI сервер
export const API_URL = isDev ? AI_SERVER_LOCAL_URL : API_SERVER_URL

// 🔧 ИСПРАВЛЕНИЕ: Синхронизация URL для Robokassa
// Все URL должны использовать один домен для корректной работы с Robokassa
const BASE_PAYMENT_URL = isDev
  ? AI_SERVER_LOCAL_URL || 'http://localhost:2999'
  : API_SERVER_URL ||
    RESULT_URL2?.split('/payment-success')[0] ||
    'https://ai-server-u14194.vm.elestio.app'

export const UNIFIED_RESULT_URL = `${BASE_PAYMENT_URL}/payment-success`

console.log('💳 [ROBOKASSA FIX] BASE_PAYMENT_URL:', BASE_PAYMENT_URL)
console.log('💳 [ROBOKASSA FIX] UNIFIED_RESULT_URL:', UNIFIED_RESULT_URL)
console.log('💳 [ROBOKASSA FIX] Original RESULT_URL2:', RESULT_URL2)

// 🚨 ОТЛАДКА: Логируем все URL для понимания проблемы кэширования
console.log('🚨 [CONFIG DEBUG] URL CONFIGURATION LOADED:')
console.log(`🚨 [CONFIG DEBUG] isDev: ${isDev}`)
console.log(`🚨 [CONFIG DEBUG] LOCAL_SERVER_URL: ${LOCAL_SERVER_URL}`)
console.log(`🚨 [CONFIG DEBUG] API_SERVER_URL: ${API_SERVER_URL}`)
console.log(`🚨 [CONFIG DEBUG] FINAL API_URL: ${API_URL}`)
console.log('🚨 [CONFIG DEBUG] =====================================')

// Парсинг ADMIN_IDS в массив чисел
const adminIdsString = process.env.ADMIN_IDS || ''
export const ADMIN_IDS_ARRAY: number[] = adminIdsString
  .split(',') // Разделяем строку по запятым
  .map(id => parseInt(id.trim(), 10)) // Преобразуем каждую часть в число
  .filter(id => !isNaN(id)) // Убираем некорректные значения (NaN)

console.log('[CONFIG] Parsed ADMIN_IDS_ARRAY:', ADMIN_IDS_ARRAY)

// Проверка наличия обязательных переменных окружения для Supabase
export const isSupabaseConfigured = !!(
  SUPABASE_URL &&
  SUPABASE_SERVICE_KEY &&
  SUPABASE_SERVICE_ROLE_KEY
)

if (!isSupabaseConfigured && process.env.NODE_ENV === 'production') {
  console.warn(
    '⚠️ ВНИМАНИЕ: Не настроены параметры Supabase. Боты будут загружены из переменных окружения.'
  )
}
