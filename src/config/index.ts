import { config } from 'dotenv'
console.log(
  `Loading env file: .env.${process.env.NODE_ENV || 'development'}.local`
)
const loadResult = config({
  path: `.env.${process.env.NODE_ENV || 'development'}.local`,
})
console.log('Env loaded success:', loadResult.parsed ? true : false)

// Попробуем загрузить обычный .env файл, если предыдущий не был найден
if (!loadResult.parsed) {
  console.log('Fallback to .env file')
  config()
}

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

export const isDev = process.env.NODE_ENV === 'development'
