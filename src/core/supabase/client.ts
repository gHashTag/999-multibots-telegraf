import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 🔐 LAZY INITIALIZATION: клиенты создаются только при первом обращении
// Это позволяет Infisical загрузить секреты ПЕРЕД созданием клиентов
let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL
  if (!url) {
    console.error('🚨 CRITICAL ERROR: SUPABASE_URL is undefined. Check Infisical configuration.')
    console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
    throw new Error('SUPABASE_URL is required but undefined. Ensure Infisical loaded secrets before accessing Supabase.')
  }
  return url
}

function getSupabaseKey(): string {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey && !serviceRoleKey) {
    console.error('🚨 CRITICAL ERROR: Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is defined')
    throw new Error('Supabase service key is required but undefined. Ensure Infisical loaded secrets.')
  }

  return serviceKey || serviceRoleKey!
}

// Lazy-initialized Supabase client
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabase) {
      _supabase = createClient(getSupabaseUrl(), getSupabaseKey())
    }
    return (_supabase as any)[prop]
  }
})

// Lazy-initialized Supabase Admin client
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabaseAdmin) {
      const url = getSupabaseUrl()
      const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
      _supabaseAdmin = createClient(url, roleKey)
    }
    return (_supabaseAdmin as any)[prop]
  }
})
