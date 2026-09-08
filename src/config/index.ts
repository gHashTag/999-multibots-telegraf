import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load .env file
const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
const loadResult = dotenv.config({ path: envPath })

// ✅ Infisical-first approach: .env может быть минимальным (только INFISICAL_* credentials)
// Не падаем если .env пустой - Infisical загрузит все секреты
if (loadResult.error) {
  console.warn(
    `⚠️  Could not load .env file from ${envPath}, using environment variables only`
  )
} else if (!loadResult.parsed || Object.keys(loadResult.parsed).length === 0) {
  console.warn(
    `⚠️  .env file is empty, expecting secrets from Infisical or environment`
  )
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

// Cloudflare Tunnel URL (set during tunnel creation in index.ts)
export const CLOUDFLARE_TUNNEL_URL = process.env.BASE_WEBHOOK_URL

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

// ✅ Создаем объект config чтобы потом навесить на него ленивые свойства
const config: any = {
  CREDENTIALS: process.env.CREDENTIALS === 'true',
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT,
  SECRET_KEY: process.env.SECRET_KEY,
  SECRET_API_KEY: process.env.SECRET_API_KEY,
  LOG_FORMAT: process.env.LOG_FORMAT,
  LOG_DIR: process.env.LOG_DIR,
  ORIGIN: process.env.ORIGIN,
  API_SERVER_URL: process.env.API_SERVER_URL,
  PIXEL_API_KEY: process.env.PIXEL_API_KEY,
  HUGGINGFACE_TOKEN: process.env.HUGGINGFACE_TOKEN,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  RESULT_URL2: process.env.RESULT_URL2,
  PINATA_JWT: process.env.PINATA_JWT,
  PINATA_GATEWAY: process.env.PINATA_GATEWAY,
  LOCAL_SERVER_URL: process.env.LOCAL_SERVER_URL,
  AI_SERVER_LOCAL_URL: process.env.AI_SERVER_LOCAL_URL,
  SERVER_PUBLIC_URL: process.env.SERVER_PUBLIC_URL,
  USE_PRODUCTION_API: process.env.USE_PRODUCTION_API,
}

// ✅ Навешиваем ленивые свойства для секретов из Infisical
const lazyKeys = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'SUPABASE_SERVICE_KEY',
  'RUNWAY_API_KEY',
  'ELEVENLABS_API_KEY',
  'KIE_AI_API_KEY',
  'FAL_KEY',
  'OPENAI_API_KEY',
  'MERCHANT_LOGIN',
  'REPLICATE_API_TOKEN',
  'REPLICATE_USERNAME',
  'RENDER_INNGEST_EVENT_KEY',
  'INNGEST_URL',
  'INNGEST_SIGNING_KEY',
]

lazyKeys.forEach(key => {
  Object.defineProperty(config, key, {
    get: () => process.env[key as any] || undefined,
    enumerable: true,
    configurable: true,
  })
})

// Add REPLICATE_* to config object for direct access
Object.defineProperty(config, 'REPLICATE_API_TOKEN', {
  get: () => process.env.REPLICATE_API_TOKEN,
  enumerable: true,
  configurable: true,
})

Object.defineProperty(config, 'REPLICATE_USERNAME', {
  get: () => process.env.REPLICATE_USERNAME,
  enumerable: true,
  configurable: true,
})

export default config

// ✅ Экспорты для совместимости
export const CREDENTIALS = config.CREDENTIALS
export const NODE_ENV = config.NODE_ENV
export const PORT = config.PORT
export const SECRET_KEY = config.SECRET_KEY
export const SECRET_API_KEY = config.SECRET_API_KEY
export const LOG_FORMAT = config.LOG_FORMAT
export const LOG_DIR = config.LOG_DIR
export const ORIGIN = config.ORIGIN
export const API_SERVER_URL = config.API_SERVER_URL
export const PIXEL_API_KEY = config.PIXEL_API_KEY
export const HUGGINGFACE_TOKEN = config.HUGGINGFACE_TOKEN
export const WEBHOOK_URL = config.WEBHOOK_URL
export const RESULT_URL2 = config.RESULT_URL2
export const PINATA_JWT = config.PINATA_JWT
export const PINATA_GATEWAY = config.PINATA_GATEWAY
export const LOCAL_SERVER_URL = config.LOCAL_SERVER_URL
export const AI_SERVER_LOCAL_URL = config.AI_SERVER_LOCAL_URL
export const SERVER_PUBLIC_URL = config.SERVER_PUBLIC_URL
export const USE_PRODUCTION_API = config.USE_PRODUCTION_API

// ✅ Ленивые экспорты (будут загружены из Infisical позже)
export const SUPABASE_URL = config.SUPABASE_URL
export const SUPABASE_KEY = config.SUPABASE_KEY
export const SUPABASE_SERVICE_ROLE_KEY = config.SUPABASE_SERVICE_ROLE_KEY
export const SUPABASE_STORAGE_BUCKET = config.SUPABASE_STORAGE_BUCKET
export const SUPABASE_SERVICE_KEY = config.SUPABASE_SERVICE_KEY
export const RUNWAY_API_KEY = config.RUNWAY_API_KEY
export const ELEVENLABS_API_KEY = config.ELEVENLABS_API_KEY
export const KIE_AI_API_KEY = config.KIE_AI_API_KEY
export const FAL_KEY = config.FAL_KEY
export const OPENAI_API_KEY = config.OPENAI_API_KEY
export const MERCHANT_LOGIN = config.MERCHANT_LOGIN
export const REPLICATE_API_TOKEN = config.REPLICATE_API_TOKEN
export const REPLICATE_USERNAME = config.REPLICATE_USERNAME
export const RENDER_INNGEST_EVENT_KEY = config.RENDER_INNGEST_EVENT_KEY
export const INNGEST_URL = config.INNGEST_URL
export const INNGEST_SIGNING_KEY = config.INNGEST_SIGNING_KEY

// ✅ Функции-геттеры для секретов из Infisical (будут загружены позже)
export function getApiKeys() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    RUNWAY_API_KEY: process.env.RUNWAY_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    KIE_AI_API_KEY: process.env.KIE_AI_API_KEY,
    FAL_KEY: process.env.FAL_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    MERCHANT_LOGIN: process.env.MERCHANT_LOGIN,
    RENDER_INNGEST_EVENT_KEY: process.env.RENDER_INNGEST_EVENT_KEY,
    INNGEST_URL: process.env.INNGEST_URL,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
    REPLICATE_USERNAME: process.env.REPLICATE_USERNAME,
  }
}

// ✅ КРИТИЧЕСКИ ВАЖНО: Robokassa credentials с fallback
// Используем ROBOKASSA_MERCHANT_LOGIN если есть, иначе MERCHANT_LOGIN
// ⚠️ ВАЖНО: Это функция, которая читает из process.env в момент вызова
// (потому что секреты загружаются из Infisical ПОСЛЕ импорта config/index.ts)
export function getMerchantLogin(): string | undefined {
  return process.env.ROBOKASSA_MERCHANT_LOGIN || process.env.MERCHANT_LOGIN
}

// Для обратной совместимости - экспортируем как функцию, которая возвращает строку
// ⚠️ ВАЖНО: Используйте getMerchantLogin() для получения значения
// MERCHANT_LOGIN_FINAL() - это функция, не константа!
export function MERCHANT_LOGIN_FINAL(): string {
  return getMerchantLogin() || ''
}

// ✅ КРИТИЧЕСКИ ВАЖНО: Robokassa passwords - функции-геттеры
// ⚠️ ВАЖНО: Это функции, которые читают из process.env в момент вызова
// (потому что секреты загружаются из Infisical ПОСЛЕ импорта config/index.ts)
export function getRobokassaPassword1(): string | undefined {
  return process.env.ROBOKASSA_PASSWORD_1
}

export function getRobokassaPassword2(): string | undefined {
  return process.env.ROBOKASSA_PASSWORD_2
}

// Для обратной совместимости - экспортируем как функции
// ⚠️ ВАЖНО: Используйте getRobokassaPassword1() и getRobokassaPassword2() для получения значений
export function ROBOKASSA_PASSWORD_1(): string {
  return getRobokassaPassword1() || ''
}

export function ROBOKASSA_PASSWORD_2(): string {
  return getRobokassaPassword2() || ''
}

// 🔧 Синхронизация URL для Robokassa
// Все URL должны использовать один домен для корректной работы с Robokassa
// 🕉️ УНИФИЦИРОВАНО: Используем только API_SERVER_URL как единственный источник истины
const BASE_PAYMENT_URL = isDev
  ? CLOUDFLARE_TUNNEL_URL || // 🌐 Приоритет: Cloudflare Tunnel для dev
    API_SERVER_URL ||
    process.env.SERVER_PUBLIC_URL ||
    process.env.BASE_WEBHOOK_URL ||
    // Последним — пусто, а НЕ three-head-dragon.shop. Мёртвый хост в конце
    // цепочки не страхует: он превращал «ничего не настроено» в «настроено на
    // сервер, которого нет», и ResultURL Robokassa уходил в никуда молча.
    // Пустая строка попадает в проверку helper.ts:83, которая бросает
    // «UNIFIED_RESULT_URL is missing or empty» — отказ громкий и понятный.
    ''
  : API_SERVER_URL ||
    RESULT_URL2?.split('/payment-success')[0] ||
    process.env.SERVER_PUBLIC_URL ||
    // BASE_WEBHOOK_URL добавлен в цепочку. Он ЕСТЬ в проде и указывает на
    // Railway-домен бота, а три переменные выше не заданы ни одна — проверено.
    // Без него прод сваливался в fallback ниже, то есть ResultURL Robokassa
    // (серверный webhook подтверждения платежа, helper.ts:128) указывал на
    // three-head-dragon.shop → 188.137.250.69. Это старый сервер, с которого
    // проект переехал на Railway; он не отвечает ни по http, ни по https, ни
    // по IP — HTTP 000 на всех четырёх проверках.
    process.env.BASE_WEBHOOK_URL ||
    ''

// Robokassa confirms a payment by calling this URL back, and the router that
// serves it is mounted at '/api' (api_server/index.ts). Appending only
// '/payment-success' pointed the provider at a path that does not exist.
// Measured live against production on 2026-09-08:
//   GET /payment-success      -> 404
//   GET /api/payment-success  -> 200 {"status":"ok"}
// Since November 2025 not one Robokassa top-up has been credited: 164 rows sit
// PENDING, and the only one ever repaired was patched by hand in February.
//
// The base may ALREADY end in '/api' -- the RESULT_URL2 branch above derives it
// by cutting a full callback URL in half -- so the suffix is stripped before it
// is appended. Fixing this in one direction only would turn a correctly
// configured RESULT_URL2 into '/api/api/payment-success'.
//
// The empty case is spelled out instead of interpolated, because
// `${''}/payment-success` is '/payment-success', which is TRUTHY. The "missing
// or empty" refusals (helper.ts and the startup check below) could therefore
// never fire: an unconfigured deployment handed Robokassa a relative URL rather
// than stopping and saying so.
export const UNIFIED_RESULT_URL = BASE_PAYMENT_URL
  ? `${BASE_PAYMENT_URL.replace(/\/+$/, '').replace(/\/api$/, '')}/api/payment-success`
  : ''

// Логируем tunnel URL если используется
if (isDev && CLOUDFLARE_TUNNEL_URL) {
  console.log(`🌐 [CONFIG] Cloudflare Tunnel URL: ${CLOUDFLARE_TUNNEL_URL}`)
}

// ✅ Проверка наличия критических параметров Robokassa при старте
// ⚠️ ВАЖНО: Эта проверка выполняется при импорте, ДО загрузки секретов из Infisical
// Поэтому она может показать предупреждение даже если секреты будут загружены позже
// Реальная проверка должна выполняться ПОСЛЕ загрузки секретов в startApplication()
if (
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'staging'
) {
  const merchantLogin = getMerchantLogin()
  if (!merchantLogin || merchantLogin.trim() === '') {
    console.warn(
      '⚠️ [CONFIG] MERCHANT_LOGIN не найден при импорте (это нормально, если секреты загружаются из Infisical позже)'
    )
    console.warn(
      '   Проверьте, что ROBOKASSA_MERCHANT_LOGIN или MERCHANT_LOGIN загружены из Infisical'
    )
  } else {
    console.log(
      `✅ [CONFIG] MERCHANT_LOGIN загружен: ${merchantLogin.substring(0, 10)}...`
    )
  }

  const password1 = getRobokassaPassword1()
  if (!password1 || password1.trim() === '') {
    console.warn(
      '⚠️ [CONFIG] ROBOKASSA_PASSWORD_1 не найден при импорте (это нормально, если секреты загружаются из Infisical позже)'
    )
    console.warn('   Проверьте, что ROBOKASSA_PASSWORD_1 загружен из Infisical')
  } else {
    console.log('✅ [CONFIG] ROBOKASSA_PASSWORD_1 загружен')
  }

  if (!UNIFIED_RESULT_URL || UNIFIED_RESULT_URL.trim() === '') {
    console.error(
      '❌ [CONFIG] КРИТИЧЕСКАЯ ОШИБКА: UNIFIED_RESULT_URL не настроен! Webhook Робокассы не будет работать!'
    )
  } else {
    console.log(`✅ [CONFIG] UNIFIED_RESULT_URL: ${UNIFIED_RESULT_URL}`)
  }
}

// ✅ ИСПРАВЛЕНИЕ: API_SERVER_URL с fallback
export const API_SERVER_URL_FINAL =
  API_SERVER_URL || process.env.BASE_WEBHOOK_URL || ''

// ✅ УПРОЩЕННАЯ СХЕМА: Один PUBLIC_URL для всех окружений
// В dev: ngrok/cloudflare tunnel (устанавливается автоматически в src/index.ts)
// В prod: домен с nginx (three-head-dragon.shop)
export const PUBLIC_URL = process.env.BASE_WEBHOOK_URL || API_SERVER_URL_FINAL

// ✅ API_URL - алиас для PUBLIC_URL (для обратной совместимости)
// Вычисляется из API_SERVER_URL или LOCAL_SERVER_URL в зависимости от окружения
export const API_URL = isDev
  ? LOCAL_SERVER_URL || AI_SERVER_LOCAL_URL || API_SERVER_URL || PUBLIC_URL
  : API_SERVER_URL || PUBLIC_URL

// 🎤 DEFAULT VOICE IDS for ElevenLabs fallback
export const DEFAULT_VOICE_IDS = {
  // Popular ElevenLabs default voices that should always be available
  RACHEL: 'EXAVITQu4vr4xnSDxMaL', // Rachel (English, default)
  JOSH: 'TxGEqnHWrfWFTfGW9XjX', // Josh (English, male)
  ARIA: 'pMsXgVXv3BLzUgSXRplE', // Aria (English, female)
  ANTONI: 'ErXwobaYiN019PkySvjV', // Antoni (English, male)
  ALICE: 'EmuBZcl4StXJQ6sqXm6H', // Alice (English, female)
  DOMI: 'AZnzlk1XvdvUeBnXmlld', // Domi (English, female)
  ELLI: 'MF3mGyEYCl7XYWbV9V6O', // Elli (English, female)
  FREYA: 'jsCqWAovK2LkecY7zXl4', // Freya (English, female)
  MATILDA: 'XrExE9yKIg1WjnnlVkGX', // Matilda (English, female)
}

// Primary fallback voice (most stable)
export const PRIMARY_FALLBACK_VOICE_ID = DEFAULT_VOICE_IDS.RACHEL

// Парсинг ADMIN_IDS в массив чисел
const adminIdsString =
  process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_ID || ''
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
