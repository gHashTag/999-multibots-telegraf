import { createClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

// Получаем URL и ключ из переменных окружения
const supabaseUrl = process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseKey) {
  logger.error('Supabase ключ не найден в переменных окружения')
  throw new Error('Отсутствует необходимая переменная окружения SUPABASE_KEY')
}

// Создаем клиент Supabase с настройками по умолчанию
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})

// Создаем клиент Supabase Admin для администраторских задач (если есть SERVICE_ROLE ключ)
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin = supabaseAdminKey 
  ? createClient(supabaseUrl, supabaseAdminKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null

// Экспортируем функцию для получения клиента для тестирования (моков и т.д.)
export const getSupabaseClient = () => supabase
