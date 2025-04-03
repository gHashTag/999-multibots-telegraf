import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../../config'

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL')
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
)

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
)
