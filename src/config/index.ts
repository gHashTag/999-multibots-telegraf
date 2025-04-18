import { config } from 'dotenv'
import fs from 'fs' // Импортируем модуль fs
import path from 'path' // Импортируем модуль path

console.log('--- Debugging .env loading --- ')
const cwd = process.cwd()
console.log(`[CONFIG] Current Working Directory: ${cwd}`)

try {
  const files = fs.readdirSync(cwd)
  const envFiles = files.filter(file => file.startsWith('.env'))
  console.log(`[CONFIG] Found .env files: ${envFiles.join(', ') || 'None'}`)
} catch (err) {
  console.error('[CONFIG] Error reading directory:', err)
}

// Логируем NODE_ENV *перед* загрузкой
console.log(`[CONFIG] NODE_ENV before loading: ${process.env.NODE_ENV}`)

// Явно устанавливаем NODE_ENV если не задан
if (!process.env.NODE_ENV) {
  console.log("[CONFIG] NODE_ENV was not set, setting to 'development'")
  ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'development'
} else {
  console.log(`[CONFIG] NODE_ENV is already set to: ${process.env.NODE_ENV}`)
}

export const isDev = process.env.NODE_ENV === 'development'
console.log(`[CONFIG] isDev flag set to: ${isDev}`)

// --- Логика загрузки .env ---
// Мы решили всегда загружать только .env, игнорируя NODE_ENV на этом этапе
const envPath = path.join(cwd, '.env')
console.log(`[CONFIG] Attempting to load env file from: ${envPath}`)

const loadResult = config({ path: envPath }) // Явно указываем путь к .env в корне

console.log(
  `[CONFIG] dotenv load result: ${loadResult.parsed ? 'Success' : 'Failed'}`
)
if (loadResult.error) {
  console.error('[CONFIG] dotenv load error:', loadResult.error.message)
}

if (!loadResult.parsed) {
  console.error(`❌ Error: Could not find or parse .env file at ${envPath}!`)
  // Можно добавить выход из процесса, если .env критичен
  // process.exit(1);
}

// Логируем NODE_ENV *после* загрузки из .env (если он там был)
console.log(`[CONFIG] NODE_ENV after loading .env: ${process.env.NODE_ENV}`)
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
  SUPABASE_ANON_KEY,
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
  ADMIN_IDS,
  OPENAI_API_KEY,
  MERCHANT_LOGIN,
  PASSWORD1,
  RESULT_URL2,
  PINATA_JWT,
  PINATA_GATEWAY,
  LOCAL_SERVER_URL,
} = process.env

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
