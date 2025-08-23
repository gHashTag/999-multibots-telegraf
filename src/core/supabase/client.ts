import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  isSupabaseConfigured,
} from '../../config'

// 🔧 ИСПРАВЛЕНИЕ: Graceful обработка неправильных Supabase конфигураций
const createSupabaseClient = (url: string, key: string) => {
  // Проверяем что URL и ключ не placeholder'ы
  if (!url || 
      url.includes('your-project-id') || 
      url === 'https://your-project-id.supabase.co' ||
      !key || 
      key.includes('your-') ||
      key.length < 20) {
    console.warn('⚠️ [SUPABASE] Invalid configuration detected. Using mock client.')
    return null
  }
  
  try {
    return createClient(url, key)
  } catch (error) {
    console.error('❌ [SUPABASE] Failed to create client:', error)
    return null
  }
}

// Создаем клиенты с проверкой
export const supabase = createSupabaseClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '')

export const supabaseAdmin = createSupabaseClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

// Проверяем что клиенты созданы успешно
if (!supabase) {
  console.warn('⚠️ [SUPABASE] Main client not initialized. Database operations will be disabled.')
}

if (!supabaseAdmin) {
  console.warn('⚠️ [SUPABASE] Admin client not initialized. Admin operations will be disabled.')
}
