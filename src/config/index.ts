import { config } from 'dotenv'
config({ path: `.env.${process.env.NODE_ENV || 'development'}.local` })

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
} = process.env

export const isDev = process.env.NODE_ENV === 'development'
