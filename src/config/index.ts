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
    `[CONFIG] Successfully loaded and parsed primary .env file from ${envPath}. Keys count: ${
      Object.keys(loadResult.parsed).length
    }`
  )
  console.log(
    `[CONFIG] DEV_SIMULATE_SUBSCRIPTION from file: ${
      loadResult.parsed.DEV_SIMULATE_SUBSCRIPTION || 'NOT FOUND'
    }`
  )
}

// Set NODE_ENV default if not provided
if (!process.env.NODE_ENV) {
  console.log("[CONFIG] NODE_ENV was not set, setting to 'development'")
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

// 🔧 ИСПРАВЛЕНИЕ: Принудительный development режим ТОЛЬКО через FORCE_DEV_MODE
// TEST_BOT_NAME больше НЕ переключает режим - это просто выбор бота для polling
const forceDevMode = process.env.FORCE_DEV_MODE === 'true'
if (forceDevMode) {
  console.log('[CONFIG] FORCE_DEV_MODE=true detected, overriding to development mode')
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

export const isDev = process.env.NODE_ENV === 'development' || forceDevMode
console.log(`[CONFIG] isDev flag set to: ${isDev}`)
console.log(`[CONFIG] forceDevMode: ${forceDevMode}`)

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
  KIE_AI_API_KEY,
  FAL_KEY, // ✅ ДОБАВЛЕНО: FAL_KEY для kie.ai gateway
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
  USE_PRODUCTION_API,
  REPLICATE_API_TOKEN, // ✅ LOCAL TRAINING: Replicate API token
  REPLICATE_USERNAME, // ✅ LOCAL TRAINING: Replicate username
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
    'https://three-head-dragon.shop' // ⚠️ КРИТИЧНО: Robokassa требует публичный URL!
  : API_SERVER_URL ||
    RESULT_URL2?.split('/payment-success')[0] ||
    process.env.SERVER_API_URL ||
    'https://three-head-dragon.shop'

export const UNIFIED_RESULT_URL = `${BASE_PAYMENT_URL}/payment-success`

console.log('💳 [ROBOKASSA FIX] BASE_PAYMENT_URL:', BASE_PAYMENT_URL)
console.log('💳 [ROBOKASSA FIX] UNIFIED_RESULT_URL:', UNIFIED_RESULT_URL)
console.log('💳 [ROBOKASSA FIX] Original RESULT_URL2:', RESULT_URL2)
console.log('🎤 [VOICE CONFIG] ELEVENLABS_API_KEY present:', !!ELEVENLABS_API_KEY)

// 🚨 ОТЛАДКА: Логируем все URL для понимания проблемы кэширования
console.log('🚨 [CONFIG DEBUG] URL CONFIGURATION LOADED:')
console.log(`🚨 [CONFIG DEBUG] isDev: ${isDev}`)
console.log(`🚨 [CONFIG DEBUG] LOCAL_SERVER_URL: ${LOCAL_SERVER_URL}`)
console.log(`🚨 [CONFIG DEBUG] API_SERVER_URL: ${API_SERVER_URL}`)
console.log(`🚨 [CONFIG DEBUG] USE_PRODUCTION_API: ${USE_PRODUCTION_API}`)
console.log(`🚨 [CONFIG DEBUG] forceProductionAPI: ${forceProductionAPI}`)
console.log(`🚨 [CONFIG DEBUG] FINAL API_URL: ${API_URL}`)
console.log(`🚨 [CONFIG DEBUG] SUPABASE_URL: ${SUPABASE_URL}`)
console.log(`🚨 [CONFIG DEBUG] SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY ? '***SET***' : 'UNDEFINED'}`)
console.log('🚨 [CONFIG DEBUG] =====================================')

// 🎤 DEFAULT VOICE IDS for ElevenLabs fallback
export const DEFAULT_VOICE_IDS = {
  // Popular ElevenLabs default voices that should always be available
  RACHEL: 'EXAVITQu4vr4xnSDxMaL', // Rachel (English, default)
  JOSH: 'TxGEqnHWrfWFTfGW9XjX',   // Josh (English, male)
  ARIA: 'pMsXgVXv3BLzUgSXRplE',   // Aria (English, female)
  ANTONI: 'ErXwobaYiN019PkySvjV', // Antoni (English, male)
  ALICE: 'EmuBZcl4StXJQ6sqXm6H',  // Alice (English, female)
  DOMI: 'AZnzlk1XvdvUeBnXmlld',   // Domi (English, female)
  ELLI: 'MF3mGyEYCl7XYWbV9V6O',   // Elli (English, female)
  FREYA: 'jsCqWAovK2LkecY7zXl4', // Freya (English, female)
  MATILDA: 'XrExE9yKIg1WjnnlVkGX' // Matilda (English, female)
}

// Primary fallback voice (most stable)
export const PRIMARY_FALLBACK_VOICE_ID = DEFAULT_VOICE_IDS.RACHEL

console.log('🎤 [VOICE CONFIG] Default Voice IDs loaded:', Object.keys(DEFAULT_VOICE_IDS).length)
console.log('🎤 [VOICE CONFIG] Primary Fallback Voice:', PRIMARY_FALLBACK_VOICE_ID)

// Парсинг ADMIN_IDS в массив чисел
const adminIdsString = process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_ID || ''
console.log('[CONFIG DEBUG] Raw ADMIN_IDS value:', adminIdsString)
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
