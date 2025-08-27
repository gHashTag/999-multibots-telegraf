import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  isSupabaseConfigured,
} from '@/config'

// Проверяем что переменные окружения загружены
if (!SUPABASE_URL) {
  console.error('🚨 CRITICAL ERROR: SUPABASE_URL is undefined. Check .env file loading.')
  console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
  throw new Error('SUPABASE_URL is required but undefined. Check .env configuration.')
}

if (!SUPABASE_SERVICE_KEY && !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('🚨 CRITICAL ERROR: Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is defined')
  throw new Error('Supabase service key is required but undefined. Check .env configuration.')
}

// Создаем клиент с service role key
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY!)

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_KEY!
)
