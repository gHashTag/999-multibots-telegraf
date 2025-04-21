import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  isSupabaseConfigured,
} from '../../config'
import logger from '../../utils/logger'

// Создаем клиент с service role key
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
)
