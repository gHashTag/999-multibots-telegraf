import { config } from 'dotenv'
import fs from 'fs' // Импортируем модуль fs
import path from 'path' // Импортируем модуль path

console.log('--- Debugging .env loading --- ')
const cwd = process.cwd()
console.log(`[CONFIG] Current Working Directory: ${cwd}`)

// Определяем путь к основному .env файлу
const envPath = path.join(cwd, '.env')
console.log(`[CONFIG] Attempting to load primary env file from: ${envPath}`)

// Пытаемся загрузить .env
const loadResult = config({ path: envPath })

if (loadResult.error) {
  console.error(
    `[CONFIG] CRITICAL ERROR: Failed to load primary .env file from ${envPath}. Error: ${loadResult.error.message}`
  )
  // В dev режиме можно просто выдать ошибку, в prod - выйти
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  } else {
    // Для dev режима бросим ошибку, чтобы nodemon показал проблему
    throw new Error(`Failed to load .env file at ${envPath}`)
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
    `[CONFIG] Successfully loaded and parsed primary .env file from ${envPath}`
  )
}

// Устанавливаем NODE_ENV по умолчанию, если не задан
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
  ELESTIO_URL,
  NGROK,
  PIXEL_API_KEY,
  HUGGINGFACE_TOKEN,
  WEBHOOK_URL,
  OPENAI_API_KEY,
  MERCHANT_LOGIN,
  PASSWORD1,
  PASSWORD2,
  RESULT_URL2,
  PINATA_JWT,
  PINATA_GATEWAY,
  LOCAL_SERVER_URL,
  INNGEST_EVENT_KEY,
  INNGEST_URL,
  INNGEST_SIGNING_KEY,
} = process.env

export const API_URL = isDev ? LOCAL_SERVER_URL : ELESTIO_URL

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
