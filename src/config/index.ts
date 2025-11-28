import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load .env file
const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
const loadResult = config({ path: envPath })

// ✅ Infisical-first approach: .env может быть минимальным (только INFISICAL_* credentials)
// Не падаем если .env пустой - Infisical загрузит все секреты
if (loadResult.error) {
  console.warn(`⚠️  Could not load .env file from ${envPath}, using environment variables only`)
} else if (!loadResult.parsed || Object.keys(loadResult.parsed).length === 0) {
  console.warn(`⚠️  .env file is empty, expecting secrets from Infisical or environment`)
}

// Set NODE_ENV default if not provided
if (!process.env.NODE_ENV) {
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

// Force development mode if needed
const forceDevMode = process.env.FORCE_DEV_MODE === 'true'
if (forceDevMode) {
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
}

export const isDev = process.env.NODE_ENV === 'development' || forceDevMode

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
  RENDER_INNGEST_EVENT_KEY,
  INNGEST_URL,
  INNGEST_SIGNING_KEY,
  ROBOKASSA_PASSWORD_1,
  ROBOKASSA_PASSWORD_2,
  SERVER_PUBLIC_URL,
  USE_PRODUCTION_API,
  REPLICATE_API_TOKEN, // ✅ LOCAL TRAINING: Replicate API token
  REPLICATE_USERNAME, // ✅ LOCAL TRAINING: Replicate username
} = process.env

// ✅ УПРОЩЕННАЯ СХЕМА: Один PUBLIC_URL для всех окружений
// В dev: ngrok/cloudflare tunnel (устанавливается автоматически в src/index.ts)
// В prod: домен с nginx (three-head-dragon.shop)
export const PUBLIC_URL = process.env.BASE_WEBHOOK_URL || API_SERVER_URL || 'https://three-head-dragon.shop'

// 🔧 ИСПРАВЛЕНИЕ: Синхронизация URL для Robokassa
// Все URL должны использовать один домен для корректной работы с Robokassa
const BASE_PAYMENT_URL = isDev
  ? API_SERVER_URL ||
    process.env.SERVER_PUBLIC_URL ||
    'https://three-head-dragon.shop' // ⚠️ КРИТИЧНО: Robokassa требует публичный URL!
  : API_SERVER_URL ||
    RESULT_URL2?.split('/payment-success')[0] ||
    process.env.SERVER_PUBLIC_URL ||
    'https://three-head-dragon.shop'

export const UNIFIED_RESULT_URL = `${BASE_PAYMENT_URL}/payment-success`

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

// Парсинг ADMIN_IDS в массив чисел
const adminIdsString = process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_ID || ''
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
